// Мозаика в стекле: сборное стекло (полчаса, набранные из остатков, см. poolOwners) собрано
// из нескольких мелких стёкол в тонком свинце. Цвета — из чего набралось, по минутам; у каждого
// стёклышка свой оттенок, чтобы одноцветные не сливались. Всё случайное — от номера стекла,
// поэтому картинка не прыгает между перерисовками.
import { tone } from './tone';
import { area, centroid, clipBy, rng, type Pt } from './voronoi';

type Mix = { color: string; ms: number }[];

/** Внутри ли точка многоугольника (луч вправо, считаем пересечения). */
function inside(poly: Pt[], [x, y]: Pt): boolean {
  let on = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) on = !on;
  }
  return on;
}

/** `n` случайных точек внутри многоугольника (от `seed`). */
function scatter(poly: Pt[], n: number, seed: number): Pt[] {
  const rand = rng(seed);
  const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const out: Pt[] = [];
  for (let k = 0; k < n * 20 && out.length < n; k++) {
    const p: Pt = [x0 + rand() * (x1 - x0), y0 + rand() * (y1 - y0)];
    if (inside(poly, p)) out.push(p);
  }
  return out;
}

/** Цвет из состава по доле минут: t ∈ [0, 1) → краска, на чью долю попадает t. */
function pick(mix: Mix, t: number): string {
  const total = mix.reduce((s, m) => s + m.ms, 0) || 1;
  let acc = 0;
  for (const m of mix) { acc += m.ms / total; if (t < acc) return m.color; }
  return mix[mix.length - 1].color;
}

const pts = (poly: Pt[]) => poly.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ');

/** Мелкие стёкла внутри `poly` (номер стекла `cell`) цветов `mix`; `lead` — толщина свинца картины. */
export function Tiles({ poly, cell, lead, mix }: { poly: Pt[]; cell: number; lead: number; mix: Mix }) {
  const seed = cell * 7919 + 13;
  // 3–5 стёклышек: Вороной от случайных точек внутри (у каждой точки — её половины от соседей).
  const seeds = scatter(poly, Math.min(5, Math.max(3, mix.length + 1)), seed + 9);
  const tiles = seeds.map((s, i) => seeds.reduce((pl, o, j) => {
    if (i === j || pl.length < 3) return pl;
    const nx = o[0] - s[0], ny = o[1] - s[1];
    return clipBy(pl, nx, ny, (nx * (s[0] + o[0])) / 2 + (ny * (s[1] + o[1])) / 2);
  }, poly)).filter((t) => t.length >= 3);
  // Краски — по очереди вдоль случайной оси: каждому стёклышку краска его доли площади.
  const a = rng(seed + 4)() * Math.PI;
  const along = (t: Pt[]) => { const m = centroid(t); return m[0] * Math.cos(a) + m[1] * Math.sin(a); };
  const total = area(poly);
  let acc = 0;
  return (
    <g style={{ pointerEvents: 'none' }}>
      {[...tiles].sort((x, y) => along(x) - along(y)).map((t, k) => {
        const share = area(t) / total, color = tone(pick(mix, Math.min(0.999, acc + share / 2)), cell * 13 + k, 1.6);
        acc += share;
        return <polygon key={k} points={pts(t)} fill={color} stroke="var(--glass-lead)" strokeWidth={lead * 0.5} strokeLinejoin="round" />;
      })}
    </g>
  );
}
