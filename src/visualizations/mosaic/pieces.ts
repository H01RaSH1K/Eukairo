// Куски стёкол: остаток серии меньше часа вырезается из стекла прямой линией так,
// чтобы площадь куска была той же долей стекла, что остаток — от часа.
// Чистые функции, без React.
import type { HourOwner } from './layout';
import { area, clipBy, type Pt } from './voronoi';

/** Что нарисовать: многоугольник, чей он (null — пустое стекло) и из какого стекла. */
export interface Piece { poly: Pt[]; owner: HourOwner | null; cell: number }

/** Остаток, который надо вырезать: доля стекла и стекло, рядом с которым ему лучше встать. */
export interface Cut { owner: HourOwner; frac: number; anchor: number }

/**
 * `whole` — хозяин каждого стекла целиком (null — свободно), `cuts` — остатки по порядку
 * времени. Каждый остаток берёт ближайшее к `anchor` стекло, где свободного места хватает:
 * свежее или объедок после чужого куска. Стёкла с номера `late` (будущие часы) — в последнюю
 * очередь. Если места одним куском нет нигде, остаток собирается из нескольких ближайших объедков.
 * Кусок прилегает к целым стёклам своей серии (линия разреза — поперёк направления на них),
 * так он сливается с ними в одну фигуру. Прежние куски новым остатком не двигаются.
 */
export function cutPieces(cells: Pt[][], whole: (HourOwner | null)[], cuts: Cut[], late = cells.length): Piece[] {
  const full = cells.map(area);
  const mid = cells.map(centroid);
  // Свободная часть каждого стекла (у целых — пусто) и уже вырезанные куски.
  const free: (Pt[] | null)[] = cells.map((c, i) => (whole[i] ? null : c));
  const freeArea = free.map((f, i) => (f ? full[i] : 0));
  const out: Piece[] = [];
  const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const penalty = 1e6; // будущие стёкла — только когда прошлых не осталось

  for (const c of cuts) {
    const target = mid[c.anchor] ?? mid[0];
    // Стёкла этой серии (целые и куски) — к ним прижимаем кусок.
    const own = [
      ...whole.map((o, i) => (o?.key === c.owner.key ? mid[i] : null)),
      ...out.filter((p) => p.owner?.key === c.owner.key).map((p) => centroid(p.poly)),
    ].filter((p): p is Pt => p !== null);
    const score = (i: number) => dist(free[i] ? centroid(free[i]!) : mid[i], target) + (i >= late ? penalty : 0);

    let need = c.frac;
    const order = free.map((_, i) => i).filter((i) => freeArea[i] > 1e-6).sort((i, j) => score(i) - score(j));
    // Одним куском: ближайшее стекло, где хватает места.
    const fits = order.find((i) => freeArea[i] >= need * full[i] - 1e-6);
    // Иначе — объедки по очереди от ближайшего, пока не наберём.
    for (const i of fits !== undefined ? [fits] : order) {
      if (need <= 1e-6) break;
      const want = need * full[i];
      const toward = nearest(own, mid[i]) ?? (i === c.anchor ? null : target);
      const [piece, rest] = want >= freeArea[i] - 1e-6 ? [free[i]!, null] : slice(free[i]!, want, toward, mid[i]);
      out.push({ poly: piece, owner: c.owner, cell: i });
      need -= area(piece) / full[i];
      free[i] = rest;
      freeArea[i] = rest ? area(rest) : 0;
      own.push(centroid(piece));
    }
  }
  // Целые стёкла и всё, что осталось свободным.
  cells.forEach((c, i) => {
    if (whole[i]) out.push({ poly: c, owner: whole[i], cell: i });
    else if (free[i] && freeArea[i] > 1e-6) out.push({ poly: free[i]!, owner: null, cell: i });
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
