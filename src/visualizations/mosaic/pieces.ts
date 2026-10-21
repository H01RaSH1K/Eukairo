// Куски стёкол: остаток серии меньше часа вырезается из стекла так, чтобы площадь куска
// была той же долей стекла, что остаток — от часа. Край куска — ломаный, как у битого
// стекла: стекло, которое режем, делится на несколько осколков (свой маленький Вороной),
// кусок набирается из ближайших осколков, а последний режется прямой ровно по площади.
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

/**
 * `whole` — хозяин каждого стекла целиком (null — свободно), `cuts` — остатки по порядку
 * времени. Каждый остаток берёт ближайшее к `anchor` стекло, где свободного места хватает:
 * свежее или объедок после чужого куска. Стёкла с номера `late` (будущие часы) — в последнюю
 * очередь. Если места одним куском нет нигде, остаток собирается из нескольких ближайших объедков.
 * У остатков с `group` — плотная укладка (см. Group).
 * Кусок растёт от края стекла, обращённого к целым стёклам своей серии, — так он сливается
 * с ними в одну фигуру. Прежние куски новым остатком не двигаются (осколки стекла зависят
 * только от его номера).
 */
export function cutPieces(cells: Pt[][], whole: (HourOwner | null)[], cuts: Cut[], late = cells.length, groups: Group[] = []): Piece[] {
  const full = cells.map(area);
  const mid = cells.map(centroid);
  // Свободная часть каждого стекла — список выпуклых осколков (у целых — пусто).
  // Пока стекло не резали, это оно само одним куском.
  const free: Pt[][][] = cells.map((c, i) => (whole[i] ? [] : [c]));
  const freeArea = free.map((f, i) => (f.length ? full[i] : 0));
  const split = new Set<number>(); // стёкла, уже поделённые на осколки (≈ HashSet<int>)
  const out: Piece[] = [];
  const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const penalty = 1e6; // будущие стёкла — только когда прошлых не осталось
  const open = groups.map(() => -1); // начатое стекло каждой группы
  const next = groups.map(() => 0);  // сколько стёкол очереди уже взято
  const freeMid = (i: number) => (split.has(i) ? centroid(merge(free[i])[0] ?? cells[i]) : mid[i]);

  // Кусок площади `want` из свободной части стекла i (если места меньше — всё, что есть).
  // Растёт от точки края, ближайшей к `toward` (null — снизу): берём осколки по близости
  // к ней целиком, пока влезают, а следующий режем прямой ровно на недостающую площадь.
  const take = (i: number, want: number, owner: HourOwner, toward: Pt | null) => {
    let got: Pt[][];
    if (want >= freeArea[i] - 1e-6) {
      got = free[i];
      free[i] = [];
    } else {
      if (!split.has(i)) { free[i] = shards(cells[i], i); split.add(i); }
      const dx = toward ? toward[0] - mid[i][0] : 0, dy = toward ? toward[1] - mid[i][1] : 1;
      const pts = free[i].flat();
      const start = pts.reduce((b, p) => (p[0] * dx + p[1] * dy > b[0] * dx + b[1] * dy ? p : b), pts[0]);
      const order = free[i].map((poly) => ({ poly, d: dist(centroid(poly), start) })).sort((x, y) => x.d - y.d).map((x) => x.poly);
      got = [];
      const keep: Pt[][] = [];
      const cutAt: Pt[] = [];
      let left = want;
      for (const poly of order) {
        const a = area(poly);
        if (left <= 1e-9) keep.push(poly);
        else if (a <= left + 1e-9) { got.push(poly); left -= a; }
        else {
          const [pc, rest] = slice(poly, left, start, centroid(poly));
          got.push(pc); keep.push(rest); left = 0;
          cutAt.push(...pc.filter((p) => !poly.some((q) => q[0] === p[0] && q[1] === p[1])));
        }
      }
      // Новые вершины разреза — и в соседние осколки, чтобы осколки склеивались точно.
      const all = stitch([...got, ...keep], cutAt);
      got = all.slice(0, got.length);
      free[i] = all.slice(got.length);
    }
    const a = got.reduce((s, p) => s + area(p), 0);
    for (const poly of merge(got)) out.push({ poly, owner, cell: i });
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
    else if (freeArea[i] > 1e-6) for (const poly of split.has(i) ? merge(free[i]) : free[i]) out.push({ poly, owner: null, cell: i });
  });
  return out;
}

/**
 * Режет выпуклый многоугольник прямой, перпендикулярной направлению от его центра к `toward`
 * (null — кусок снизу, как будто стекло наполняется). Кусок площади `want` — со стороны `toward`.
 * Положение линии ищем делением пополам (≈ бинарный поиск по числу).
 */
function slice(poly: Pt[], want: number, toward: Pt | null, center: Pt): [Pt[], Pt[]] {
  let nx = toward ? toward[0] - center[0] : 0;
  let ny = toward ? toward[1] - center[1] : 1;
  const len = Math.hypot(nx, ny);
  if (len < 1e-9) { nx = 0; ny = 1; } else { nx /= len; ny /= len; }
  // Кусок — точки, у которых проекция на (nx, ny) не меньше c.
  const proj = poly.map((p) => p[0] * nx + p[1] * ny);
  let lo = Math.min(...proj), hi = Math.max(...proj);
  const pieceAt = (c: number) => clipBy(poly, -nx, -ny, -c);
  for (let k = 0; k < 40; k++) {
    const c = (lo + hi) / 2;
    if (area(pieceAt(c)) > want) lo = c; else hi = c;
  }
  const c = (lo + hi) / 2;
  return [pieceAt(c), clipBy(poly, nx, ny, c)];
}

/** Осколков в стекле, которое режем: мелкий кусок — один-два осколка, а не длинная полоска. */
const SHARDS = 7;

/**
 * Делит выпуклое стекло на SHARDS осколков — маленький Вороной внутри него.
 * Точки случайные, но от номера стекла: одно и то же стекло всегда бьётся одинаково.
 * Один шаг Ллойда (точки → центры своих осколков) делает осколки округлее.
 */
function shards(poly: Pt[], cell: number): Pt[][] {
  const rand = rng(cell * 7919 + 13);
  const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  let seeds: Pt[] = [];
  for (let k = 0; seeds.length < SHARDS && k < 200; k++) {
    const p: Pt = [x0 + rand() * (x1 - x0), y0 + rand() * (y1 - y0)];
    if (inside(poly, p)) seeds.push(p);
  }
  const cellsOf = (pts: Pt[]) => pts.map((s, i) => pts.reduce((c, o, j) => (j === i || !c.length ? c :
    clipBy(c, o[0] - s[0], o[1] - s[1], ((o[0] - s[0]) * (o[0] + s[0]) + (o[1] - s[1]) * (o[1] + s[1])) / 2)), poly));
  seeds = cellsOf(seeds).map((c, i) => (c.length ? centroid(c) : seeds[i]));
  return cellsOf(seeds).filter((c) => c.length >= 3 && area(c) > 1e-9);
}

/** Точка внутри выпуклого многоугольника (с любым обходом). */
function inside(poly: Pt[], p: Pt): boolean {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const c = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    if (Math.abs(c) < 1e-12) continue;
    if (sign === 0) sign = Math.sign(c); else if (Math.sign(c) !== sign) return false;
  }
  return true;
}

/**
 * Склеивает соседние осколки в один многоугольник: общие рёбра (одно и то же ребро,
 * пройденное в двух осколках навстречу) выкидываем, остальные сцепляем в контур.
 * Несвязные части — отдельные контуры. Если что-то не сцепилось — отдаём осколки как есть.
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
