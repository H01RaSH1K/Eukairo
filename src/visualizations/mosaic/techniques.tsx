// Приёмы настоящих витражей для сборных стёкол (полчаса, набранные из остатков, см. poolOwners).
// Каждый приём — то, что рисуется поверх цвета стекла внутри его контура:
//   пузырчатое (seedy) — застывшие пузырьки воздуха;
//   самоцвет (jewel) — круглая стекляшка, вставленная в свинец посередине;
//   гризайль — узор, нарисованный по стеклу коричнево-серой краской;
//   осколки Тиффани (fracture & streamers) — в прозрачное стекло вплавлены осколки и нити цветов;
//   опаловое — молочное стекло с завихрениями цветов;
//   «бычий глаз» (roundel) — круглые волны от выдувки, кольца цветов.
// Всё случайное — от номера стекла, поэтому картинка не прыгает между перерисовками.
import type { ReactNode } from 'react';
import { centroid } from './pieces';
import { area, rng, type Pt } from './voronoi';

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

/**
 * Приём поверх стекла. `poly` — контур, `cell` — номер стекла (для случайности), `id` — уникальный
 * префикс для clipPath/градиентов, `mix` — состав (у «разного»), `lead` — толщина свинца.
 * Возвращает null, если у приёма ничего поверх цвета нет.
 */
export function technique(kind: string, poly: Pt[], cell: number, id: string, lead: number, mix?: Mix): ReactNode {
  const size = Math.sqrt(area(poly)); // «размер» стекла: от него — всё мелкое
  const c = centroid(poly);
  const seed = cell * 7919 + 13;
  const clip = (body: ReactNode) => (
    <g style={{ pointerEvents: 'none' }}>
      <clipPath id={id}><polygon points={pts(poly)} /></clipPath>
      <g clipPath={`url(#${id})`}>{body}</g>
    </g>
  );

  if (kind === 'seedy') {
    // Пузырьки: разного размера, светлый ободок и блик сверху-слева.
    const rand = rng(seed + 1);
    return clip(scatter(poly, 14, seed).map((p, k) => {
      const r = size * (0.015 + rand() * 0.035);
      return (
        <g key={k}>
          <circle cx={p[0]} cy={p[1]} r={r} fill="#fff" fillOpacity={0.1} stroke="#fff" strokeOpacity={0.45} strokeWidth={r * 0.25} />
          <circle cx={p[0] - r * 0.35} cy={p[1] - r * 0.35} r={r * 0.28} fill="#fff" fillOpacity={0.7} />
        </g>
      );
    }));
  }

  if (kind === 'jewel') {
    // Самоцвет: круглая стекляшка в свинцовой оправе, с бликом — светлее самого стекла.
    const r = size * 0.2;
    return (
      <g style={{ pointerEvents: 'none' }}>
        <radialGradient id={id + 'g'} cx="0.35" cy="0.35" r="0.75">
          <stop offset="0" stopColor="#fff" stopOpacity={0.85} />
          <stop offset="0.35" stopColor="#fff" stopOpacity={0.25} />
          <stop offset="1" stopColor="#000" stopOpacity={0.25} />
        </radialGradient>
        <circle cx={c[0]} cy={c[1]} r={r} fill={`url(#${id}g)`} stroke="var(--glass-lead)" strokeWidth={lead * 0.8} />
      </g>
    );
  }

  if (kind === 'grisaille') {
    // Гризайль: обводка-«трасса» вдоль края и трилистник посередине, коричнево-серой краской.
    const k = 0.8, r = size * 0.13;
    const trace = poly.map((p): Pt => [c[0] + k * (p[0] - c[0]), c[1] + k * (p[1] - c[1])]);
    const turn = rng(seed)() * Math.PI * 2;
    const leaves = [0, 1, 2].map((n) => {
      const a = turn + (n * 2 * Math.PI) / 3;
      const tip: Pt = [c[0] + Math.cos(a) * r * 1.6, c[1] + Math.sin(a) * r * 1.6];
      const l: Pt = [c[0] + Math.cos(a - 0.6) * r, c[1] + Math.sin(a - 0.6) * r];
      const rr: Pt = [c[0] + Math.cos(a + 0.6) * r, c[1] + Math.sin(a + 0.6) * r];
      return `M${c[0]} ${c[1]}Q${l[0]} ${l[1]} ${tip[0]} ${tip[1]}Q${rr[0]} ${rr[1]} ${c[0]} ${c[1]}Z`;
    }).join('');
    const paint = { stroke: '#2b2018', strokeOpacity: 0.55, strokeWidth: lead * 0.35, strokeLinejoin: 'round' as const };
    return (
      <g style={{ pointerEvents: 'none' }}>
        <polygon points={pts(trace)} fill="none" {...paint} />
        <path d={leaves} fill="#2b2018" fillOpacity={0.18} {...paint} />
      </g>
    );
  }

  if (!mix?.length) return null;

  if (kind === 'fracture') {
    // Осколки Тиффани: острые осколки цветов состава (по минутам) и пара тонких нитей.
    const rand = rng(seed + 3);
    const shards = scatter(poly, 16, seed).map((p, k) => {
      const r = size * (0.04 + rand() * 0.07), a = rand() * Math.PI * 2, n = 3 + Math.floor(rand() * 2);
      const shape = Array.from({ length: n }, (_, j): Pt => {
        const b = a + (j * 2 * Math.PI) / n + (rand() - 0.5) * 0.9, d = r * (0.5 + rand() * 0.7);
        return [p[0] + Math.cos(b) * d, p[1] + Math.sin(b) * d];
      });
      return <polygon key={k} points={pts(shape)} fill={pick(mix, (k + rand()) / 16)} fillOpacity={0.85} />;
    });
    const streams = [0, 1, 2].map((k) => {
      const [a, b] = scatter(poly, 2, seed + 10 + k);
      if (!a || !b) return null;
      const m: Pt = [(a[0] + b[0]) / 2 + (rand() - 0.5) * size * 0.4, (a[1] + b[1]) / 2 + (rand() - 0.5) * size * 0.4];
      return <path key={'s' + k} d={`M${a[0]} ${a[1]}Q${m[0]} ${m[1]} ${b[0]} ${b[1]}`} fill="none" stroke={pick(mix, rand())} strokeWidth={lead * 0.35} strokeLinecap="round" />;
    });
    return clip(<>{shards}{streams}</>);
  }

  if (kind === 'opal') {
    // Опаловое: размытые пятна цветов состава в молочном стекле.
    const rand = rng(seed + 5);
    return clip(
      <>
        <filter id={id + 'b'} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation={size * 0.09} /></filter>
        <g filter={`url(#${id}b)`}>
          {scatter(poly, 6, seed + 2).map((p, k) => (
            <ellipse key={k} cx={p[0]} cy={p[1]} rx={size * (0.15 + rand() * 0.2)} ry={size * (0.08 + rand() * 0.12)}
              transform={`rotate(${rand() * 180} ${p[0]} ${p[1]})`} fill={pick(mix, (k + 0.5) / 6)} fillOpacity={0.8} />
          ))}
        </g>
      </>,
    );
  }

  if (kind === 'roundel') {
    // «Бычий глаз»: кольца цветов состава от светлого узелка в центре, кольца чуть волнистые от блика.
    const total = mix.reduce((s, m) => s + m.ms, 0) || 1;
    const R = Math.max(...poly.map((p) => Math.hypot(p[0] - c[0], p[1] - c[1])));
    const stops: ReactNode[] = [<stop key="k" offset="0" stopColor="#fff" stopOpacity={0.9} />];
    let at = 0.08;
    mix.forEach((m, k) => {
      const next = at + (0.92 * m.ms) / total;
      stops.push(<stop key={'a' + k} offset={at + 0.02} stopColor={m.color} />, <stop key={'b' + k} offset={next} stopColor={m.color} stopOpacity={0.75} />);
      at = next;
    });
    return clip(
      <>
        <radialGradient id={id + 'r'} gradientUnits="userSpaceOnUse" cx={c[0]} cy={c[1]} r={R}>{stops}</radialGradient>
        <polygon points={pts(poly)} fill={`url(#${id}r)`} />
        {[0.3, 0.55, 0.8].map((k) => <circle key={k} cx={c[0]} cy={c[1]} r={R * k} fill="none" stroke="#fff" strokeOpacity={0.18} strokeWidth={lead * 0.3} />)}
      </>,
    );
  }
  return null;
}
