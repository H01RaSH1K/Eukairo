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

/** Оставляет часть многоугольника, которая ближе к точке a, чем к b. */
function clipHalf(poly: Pt[], a: Pt, b: Pt): Pt[] {
  const nx = b[0] - a[0];
  const ny = b[1] - a[1];
  const c = (nx * (a[0] + b[0])) / 2 + (ny * (a[1] + b[1])) / 2;
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

/** Ячейки Вороного для точек `seeds` в прямоугольнике w × h — в том же порядке, что и точки. */
export function voronoi(seeds: Pt[], w: number, h: number, reach: number): Pt[][] {
  const rect: Pt[] = [[0, 0], [w, 0], [w, h], [0, h]];
  return seeds.map((s) => {
    let poly = rect;
    for (const o of seeds) {
      // Далёкие точки на форму ячейки не влияют — пропускаем ради скорости.
      if (o === s || Math.abs(o[0] - s[0]) > reach || Math.abs(o[1] - s[1]) > reach) continue;
      poly = clipHalf(poly, s, o);
    }
    return poly;
  });
}

export { rng };
