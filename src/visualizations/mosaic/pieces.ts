// Куски стёкол: остаток серии меньше часа вырезается из стекла так, чтобы площадь куска
// была той же долей стекла, что остаток — от часа. Срез — две прямые с одним изломом
// (как трещина в стекле): кусок растёт от угла стекла, цельный и выпуклый, мелкий выходит
// компактным, а не полоской.
// Чистые функции, без React.
import type { HourOwner } from './layout';
import { area, clipBy, rng, type Pt } from './voronoi';

/** Что нарисовать: многоугольник, чей он (null — пустое стекло) и из какого стекла. */
export interface Piece { poly: Pt[]; owner: HourOwner | null; cell: number }

/**
 * Остаток, который надо вырезать: доля стекла и стекло, рядом с которым ему лучше встать.
 * `group` — номер пятна (у копилки одно на всех): тогда остаток укладывается плотно, см. Group.
 */
export interface Cut { owner: HourOwner; frac: number; anchor: number; group?: number }

/**
 * Плотная укладка для копилки и пятен: остатки группы наливаются в её стёкла по очереди
 * (`queue` — свежие стёкла по порядку роста), как жидкость, слоями к `center`.
 * Начатое стекло сначала доливается, и только потом берётся следующее, — неполным
 * остаётся одно стекло на краю, дыр внутри нет.
 */
export interface Group { queue: number[]; center: Pt }

/** Форма неполного стекла: «уровень» — налито снизу горизонталью; «клин» — срез с изломом от угла. */
export type CutShape = 'level' | 'wedge';

/**
 * `whole` — хозяин каждого стекла целиком (null — свободно), `cuts` — остатки по порядку
 * времени. Каждый остаток берёт ближайшее к `anchor` стекло, где свободного места хватает:
 * свежее или объедок после чужого куска. Стёкла с номера `late` (будущие часы) — в последнюю
 * очередь. Если места одним куском нет нигде, остаток собирается из нескольких ближайших объедков.
 * У остатков с `group` — плотная укладка (см. Group). `shape` — форма среза (см. CutShape).
 * Кусок растёт от угла стекла, обращённого к целым стёклам своей серии, — так он сливается
 * с ними в одну фигуру. Прежние куски новым остатком не двигаются (излом среза зависит
 * только от номера стекла и того, какой это по счёту срез в нём).
 */
export function cutPieces(cells: Pt[][], whole: (HourOwner | null)[], cuts: Cut[], late = cells.length, groups: Group[] = [], shape: CutShape = 'level'): Piece[] {
  const full = cells.map(area);
  const mid = cells.map(centroid);
  // Свободная часть каждого стекла — несколько выпуклых частей (у целых — пусто).
  // Пока стекло не резали, это оно само целиком.
  const free: Pt[][][] = cells.map((c, i) => (whole[i] ? [] : [c]));
  const freeArea = free.map((f, i) => (f.length ? full[i] : 0));
  const cutsIn = cells.map(() => 0); // сколько срезов уже было в стекле
  const out: Piece[] = [];
  const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const penalty = 1e6; // будущие стёкла — только когда прошлых не осталось
  const open = groups.map(() => -1); // начатое стекло каждой группы
  const next = groups.map(() => 0);  // сколько стёкол очереди уже взято
  const freeMid = (i: number) => {
    const big = free[i].reduce<Pt[] | null>((b, p) => (!b || area(p) > area(b) ? p : b), null);
    return big ? centroid(big) : mid[i];
  };

  // Кусок площади `want` из свободной части стекла i (если места меньше — всё, что есть).
  // Растёт от угла, ближайшего к `toward` (null — снизу): части свободного места, что ближе
  // к этому краю, берём целиком, пока влезают, а следующую режем срезом с изломом.
  const take = (i: number, want: number, owner: HourOwner, toward: Pt | null) => {
    let got: Pt[][];
    if (want >= freeArea[i] - 1e-6) {
      got = free[i];
      free[i] = [];
    } else if (shape === 'level') {
      // «Уровень жидкости»: стекло наливается снизу ровной горизонталью. Следующий кусок
      // в том же стекле ложится слоем выше — свободным остаётся верх, всегда выпуклый.
      got = [];
      const keep: Pt[][] = [];
      let left = want;
      for (const poly of [...free[i]].sort((x, y) => Math.max(...y.map((p) => p[1])) - Math.max(...x.map((p) => p[1])))) {
        const a = area(poly);
        if (left <= 1e-9) keep.push(poly);
        else if (a <= left + 1e-9) { got.push(poly); left -= a; }
        else { const [b, t] = level(poly, left); got.push(b); keep.push(t); left = 0; }
      }
      free[i] = keep;
    } else {
      const dx = toward ? toward[0] - mid[i][0] : 0, dy = toward ? toward[1] - mid[i][1] : 1;
      const proj = (p: Pt) => p[0] * dx + p[1] * dy;
      const reach = (poly: Pt[]) => Math.max(...poly.map(proj));
      const k = (p: Pt) => `${Math.round(p[0] * 1000)},${Math.round(p[1] * 1000)}`;
      // Сначала — часть, где кусок влезает целиком (ближайшая к краю); иначе берём части
      // целиком по очереди, каждую следующую — соседнюю с уже взятыми, и режем от общей вершины.
      const fitsOne = free[i].filter((p) => area(p) >= want - 1e-9).sort((x, y) => reach(y) - reach(x))[0];
      got = [];
      const keep: Pt[][] = [...free[i]];
      let left = want;
      let from: Pt[] | null = fitsOne ?? null;
      let corner: Pt | null = null;
      while (left > 1e-9 && keep.length) {
        if (!from) {
          const taken = new Set(got.flat().map(k));
          const touching = keep.filter((p) => p.some((q) => taken.has(k(q))));
          from = (touching.length ? touching : keep).sort((x, y) => reach(y) - reach(x))[0];
          const shared = from.filter((q) => taken.has(k(q)));
          corner = shared.length ? shared.reduce((b, p) => (proj(p) > proj(b) ? p : b)) : null;
        }
        keep.splice(keep.indexOf(from), 1);
        const a = area(from);
        if (a <= left + 1e-9) { got.push(from); left -= a; }
        else {
          const c = corner ?? from.reduce((b, p) => (proj(p) > proj(b) ? p : b), from[0]);
          const [piece, rest] = chevron(from, left, c, i * 31 + cutsIn[i]++);
          got.push(piece); keep.push(...rest); left = 0;
        }
        from = null;
      }
      // Вершины разреза — и в соседние части, чтобы общие рёбра совпадали точно.
      const all = stitch([...got, ...keep], [...got, ...keep].flat());
      got = all.slice(0, got.length);
      free[i] = all.slice(got.length);
    }
    const a = got.reduce((s, p) => s + area(p), 0);
    for (const p of merge(got)) out.push({ poly: p, owner, cell: i });
    freeArea[i] = free[i].reduce((s, p) => s + area(p), 0);
    return a / full[i];
  };

  for (const c of cuts) {
    const g = c.group !== undefined ? groups[c.group] : undefined;
    if (g) {
      let need = c.frac;
      while (need > 1e-6) {
        let i = open[c.group!];
        if (i < 0 || freeArea[i] <= 1e-6) {
          // Следующее свежее стекло группы; очередь кончилась — ближайшее свободное к центру.
          i = -1;
          while (next[c.group!] < g.queue.length && i < 0) {
            const q = g.queue[next[c.group!]++];
            if (freeArea[q] > 1e-6) i = q;
          }
          if (i < 0) {
            let bestD = Infinity;
            free.forEach((_, k) => { if (freeArea[k] > 1e-6 && dist(mid[k], g.center) < bestD) { bestD = dist(mid[k], g.center); i = k; } });
          }
          if (i < 0) break; // места нет совсем
          open[c.group!] = i;
        }
        need -= take(i, need * full[i], c.owner, g.center);
      }
      continue;
    }
    const target = mid[c.anchor] ?? mid[0];
    // Стёкла этой серии (целые и куски) — к ним прижимаем кусок.
    const own = [
      ...whole.map((o, i) => (o?.key === c.owner.key ? mid[i] : null)),
      ...out.filter((p) => p.owner?.key === c.owner.key).map((p) => centroid(p.poly)),
    ].filter((p): p is Pt => p !== null);
    const score = (i: number) => dist(freeMid(i), target) + (i >= late ? penalty : 0);

    let need = c.frac;
    const order = free.map((_, i) => i).filter((i) => freeArea[i] > 1e-6).sort((i, j) => score(i) - score(j));
    // Одним куском: ближайшее стекло, где хватает места.
    const fits = order.find((i) => freeArea[i] >= need * full[i] - 1e-6);
    // Иначе — объедки по очереди от ближайшего, пока не наберём.
    for (const i of fits !== undefined ? [fits] : order) {
      if (need <= 1e-6) break;
      need -= take(i, need * full[i], c.owner, nearest(own, mid[i]) ?? (i === c.anchor ? null : target));
      own.push(centroid(out[out.length - 1].poly));
    }
  }
  // Целые стёкла и всё, что осталось свободным.
  cells.forEach((c, i) => {
    if (whole[i]) out.push({ poly: c, owner: whole[i], cell: i });
    else if (freeArea[i] > 1e-6) for (const poly of merge(free[i])) out.push({ poly, owner: null, cell: i });
  });
  return out;
}

/**
 * Срез с изломом: две прямые под углом друг к другу, сходятся остриём внутрь стекла.
 * Кусок — то, что ближе к `corner` по обеим прямым (пересечение двух полуплоскостей):
 * он всегда цельный и выпуклый. Свободное место — две выпуклые части. Угол излома
 * и небольшой поворот — от `seed`. Положение прямых ищем делением пополам по площади.
 */
function chevron(poly: Pt[], want: number, corner: Pt, seed: number): [Pt[], Pt[][]] {
  const rand = rng(seed + 101);
  const c0 = centroid(poly);
  const base = Math.atan2(c0[1] - corner[1], c0[0] - corner[0]) + (rand() - 0.5) * 0.5; // ±14°
  const bend = 0.3 + rand() * 0.3; // излом 17…34° в каждую сторону
  const u = [base - bend, base + bend].map((a): Pt => [Math.cos(a), Math.sin(a)]);
  const proj = (p: Pt, k: number) => (p[0] - corner[0]) * u[k][0] + (p[1] - corner[1]) * u[k][1];
  const offs = (k: number, c: number) => c + corner[0] * u[k][0] + corner[1] * u[k][1];
  // Кусок при отступе c: не дальше c от угла по обеим прямым.
  const pieceAt = (c: number) => clipBy(clipBy(poly, u[0][0], u[0][1], offs(0, c)), u[1][0], u[1][1], offs(1, c));
  let lo = 0, hi = Math.max(...poly.map((p) => Math.max(proj(p, 0), proj(p, 1))));
  for (let k = 0; k < 40; k++) {
    const c = (lo + hi) / 2;
    if (area(pieceAt(c)) > want) hi = c; else lo = c;
  }
  const c = (lo + hi) / 2;
  const rest = [
    clipBy(poly, -u[0][0], -u[0][1], -offs(0, c)),                                         // за первой прямой
    clipBy(clipBy(poly, u[0][0], u[0][1], offs(0, c)), -u[1][0], -u[1][1], -offs(1, c)),   // до первой, но за второй
  ].filter((x) => x.length >= 3 && area(x) > 1e-9);
  return [pieceAt(c), rest];
}

/** Делит выпуклое стекло горизонталью: низ площади `want` и верх. Высоту ищем делением пополам. */
function level(poly: Pt[], want: number): [Pt[], Pt[]] {
  const ys = poly.map((p) => p[1]);
  let lo = Math.min(...ys), hi = Math.max(...ys); // ось y вниз: низ стекла — большие y
  for (let k = 0; k < 40; k++) {
    const y = (lo + hi) / 2;
    if (area(clipBy(poly, 0, -1, -y)) > want) lo = y; else hi = y;
  }
  const y = (lo + hi) / 2;
  return [clipBy(poly, 0, -1, -y), clipBy(poly, 0, 1, y)];
}

/**
 * Склеивает соседние части в один многоугольник: общие рёбра (одно и то же ребро,
 * пройденное в двух частях навстречу) выкидываем, остальные сцепляем в контур.
 * Если что-то не сцепилось — отдаём части как есть.
 */
function merge(polys: Pt[][]): Pt[][] {
  if (polys.length < 2) return polys;
  const key = (p: Pt) => `${Math.round(p[0] * 1000)},${Math.round(p[1] * 1000)}`;
  const edges = new Map<string, [Pt, Pt]>(); // «откуда|куда» → ребро
  for (const poly of polys) poly.forEach((a, k) => {
    const b = poly[(k + 1) % poly.length];
    const ka = key(a), kb = key(b);
    if (ka === kb) return;
    if (edges.has(kb + '|' + ka)) edges.delete(kb + '|' + ka);
    else edges.set(ka + '|' + kb, [a, b]);
  });
  const from = new Map<string, [Pt, Pt][]>();
  for (const e of edges.values()) {
    const k = key(e[0]);
    from.set(k, [...(from.get(k) ?? []), e]);
  }
  const loops: Pt[][] = [];
  let guard = edges.size + 1;
  while (from.size && guard-- > 0) {
    const [k0, list] = from.entries().next().value!;
    let e = list[0];
    const loop: Pt[] = [];
    let k = k0;
    for (let step = 0; step <= edges.size; step++) {
      const l = from.get(k)!;
      l.splice(l.indexOf(e), 1);
      if (!l.length) from.delete(k);
      loop.push(e[0]);
      k = key(e[1]);
      if (k === k0) break;
      const nx = from.get(k);
      if (!nx) return polys; // контур не замкнулся
      e = nx[0];
    }
    if (k !== k0) return polys;
    loops.push(loop);
  }
  return loops;
}

function nearest(pts: Pt[], to: Pt): Pt | null {
  let best: Pt | null = null, bestD = Infinity;
  for (const p of pts) {
    const d = Math.hypot(p[0] - to[0], p[1] - to[1]);
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
}

/** Центр масс многоугольника (точнее среднего вершин для длинных кусков). */
export function centroid(poly: Pt[]): Pt {
  let a = 0, x = 0, y = 0;
  poly.forEach((p, i) => {
    const q = poly[(i + 1) % poly.length];
    const k = p[0] * q[1] - q[0] * p[1];
    a += k; x += (p[0] + q[0]) * k; y += (p[1] + q[1]) * k;
  });
  if (Math.abs(a) < 1e-12) return poly[0] ?? [0, 0];
  return [x / (3 * a), y / (3 * a)];
}

/**
 * Разрез добавляет вершины на рёбрах — вставляем их и в соседние многоугольники,
 * у которых это ребро общее. Тогда общие рёбра совпадают точно и свинцовые линии
 * правильно понимают, где фигура одна, а где разные.
 */
export function stitch(polys: Pt[][], extra: Pt[]): Pt[][] {
  if (!extra.length) return polys;
  const eps = 0.02;
  return polys.map((poly) => {
    const res: Pt[] = [];
    poly.forEach((p, k) => {
      const q = poly[(k + 1) % poly.length];
      res.push(p);
      const dx = q[0] - p[0], dy = q[1] - p[1];
      const l2 = dx * dx + dy * dy;
      if (l2 < 1e-12) return;
      const on: [number, Pt][] = [];
      for (const x of extra) {
        const t = ((x[0] - p[0]) * dx + (x[1] - p[1]) * dy) / l2;
        if (t <= 1e-4 || t >= 1 - 1e-4) continue;
        const ex = p[0] + t * dx - x[0], ey = p[1] + t * dy - x[1];
        if (ex * ex + ey * ey < eps * eps) on.push([t, x]);
      }
      on.sort((a, b) => a[0] - b[0]).forEach(([, x]) => res.push(x));
    });
    return res;
  });
}
