// Разбиение прямоугольника на «стёклышки» витража (диаграмма Вороного
// по слегка сдвинутой сетке точек). Чистые функции, без React.

export type Pt = [number, number]; // кортеж ≈ ValueTuple<float, float>

/** Детерминированный генератор случайных чисел: одна и та же картинка при каждом запуске. */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Оставляет часть многоугольника, которая «ближе» к точке a, чем к b.
 * Вес сдвигает границу: у кого вес больше, тот забирает больше места
 * (диаграмма мощности — Вороной с весами). wa = wb = 0 — обычная середина.
 */
function clipHalf(poly: Pt[], a: Pt, b: Pt, wa = 0, wb = 0): Pt[] {
  const nx = b[0] - a[0];
  const ny = b[1] - a[1];
  return clipBy(poly, nx, ny, (nx * (a[0] + b[0])) / 2 + (ny * (a[1] + b[1])) / 2 - (wb - wa) / 2);
}

/** Оставляет часть многоугольника, где x·nx + y·ny ≤ c (полуплоскость). */
export function clipBy(poly: Pt[], nx: number, ny: number, c: number): Pt[] {
  const side = (p: Pt) => p[0] * nx + p[1] * ny - c; // ≤ 0 — наша сторона
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const sp = side(p);
    const sq = side(q);
    if (sp <= 0) out.push(p);
    if (sp * sq < 0) {
      const t = sp / (sp - sq);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return out;
}

/**
 * Ячейки Вороного для точек `seeds` в прямоугольнике w × h — в том же порядке, что и точки.
 * `weights` (необязательно) — веса точек: ячейка с большим весом шире.
 */
export function voronoi(seeds: Pt[], w: number, h: number, reach: number, weights?: number[], near = neighbours(seeds, reach)): Pt[][] {
  const rect: Pt[] = [[0, 0], [w, 0], [w, h], [0, h]];
  return seeds.map((s, i) => {
    let poly = rect;
    for (const j of near[i]) poly = clipHalf(poly, s, seeds[j], weights?.[i] ?? 0, weights?.[j] ?? 0);
    return poly;
  });
}

/** Для каждой точки — номера соседей ближе `reach` по обеим осям. Далёкие на форму ячейки не влияют. */
export function neighbours(seeds: Pt[], reach: number): number[][] {
  return seeds.map((s, i) => {
    const out: number[] = [];
    seeds.forEach((o, j) => { if (j !== i && Math.abs(o[0] - s[0]) <= reach && Math.abs(o[1] - s[1]) <= reach) out.push(j); });
    return out;
  });
}

/** Площадь многоугольника (формула шнурка). */
export function area(poly: Pt[]): number {
  let a = 0;
  poly.forEach((p, i) => { const q = poly[(i + 1) % poly.length]; a += p[0] * q[1] - q[0] * p[1]; });
  return Math.abs(a) / 2;
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

export { rng };
