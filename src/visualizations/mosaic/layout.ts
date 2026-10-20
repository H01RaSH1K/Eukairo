// Раскладка промежутков для мозаики. Чистые функции, без React.
import type { Span } from '../types';
import { HOUR_MS } from '../../domain/time';
import { rng, type Pt } from './voronoi';

/** Хозяин часа: запись, занявшая больше всего времени в этом часе, если хотя бы полчаса. */
export interface HourOwner { entryId: string; color: string }

export function hourOwners(spans: Span[], dayStart: number, count = 24, minMs = HOUR_MS / 2): (HourOwner | null)[] {
  return Array.from({ length: count }, (_, h) => {
    const a = dayStart + h * HOUR_MS;
    const b = a + HOUR_MS;
    let best: HourOwner | null = null;
    let bestMs = 0;
    for (const s of spans) {
      const ms = Math.min(s.end, b) - Math.max(s.start, a);
      if (ms > bestMs) { bestMs = ms; best = { entryId: s.entryId, color: s.color }; }
    }
    return bestMs >= minMs ? best : null;
  });
}

/**
 * Заливка пятнами: занятые часы собираются в несколько пятен.
 * Подряд идущие записи (несколько в пятне) липнут друг к другу, пятна разбросаны по картине.
 * Возвращает номер стекла для каждого занятого часа (в том же порядке, что `filled`).
 * Центры пятен зависят только от `seed`, поэтому за день пятна не прыгают, а растут.
 */
export function spotPlaces(cells: Pt[][], filled: HourOwner[], seed: number, days = 1): number[] {
  const c = cells.map(centroid);
  const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const rand = rng(seed + 17);

  // Пятна: подряд идущие записи, по 2–4 штуки (у месяца крупнее — 5–7),
  // запись = отрезок часов одного entryId.
  const base = 2 + Math.floor(days / 10);
  const pick = () => base + Math.floor(rand() * 3);
  const sizes: number[] = [];
  let runs = 0, want = pick();
  filled.forEach((o, i) => {
    const newRun = i === 0 || filled[i - 1].entryId !== o.entryId;
    if (newRun && ++runs > want) { runs = 1; want = pick(); sizes.push(0); }
    if (!sizes.length) sizes.push(0);
    sizes[sizes.length - 1]++;
  });

  // Центры: каждый следующий — самый далёкий от прежних из 8 случайных стёкол,
  // не у самого края (чтобы пятно не обрезалось рамкой).
  const xs = c.map((p) => p[0]), ys = c.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const inner = c.filter(([x, y]) => Math.abs(x - (x0 + x1) / 2) < 0.4 * (x1 - x0) && Math.abs(y - (y0 + y1) / 2) < 0.4 * (y1 - y0));
  const pool = inner.length ? inner : c;
  const centers: Pt[] = [];
  for (let s = 0; s < sizes.length; s++) {
    let best = pool[Math.floor(rand() * pool.length)], bestD = -1;
    for (let k = 0; k < (s ? 8 : 1); k++) {
      const p = pool[Math.floor(rand() * pool.length)];
      const d = Math.min(...centers.map((q) => dist(p, q)));
      if (d > bestD) { bestD = d; best = p; }
    }
    centers.push(best);
  }

  // Рост: следующее стекло — свободное, ближайшее к предыдущему и поближе к центру пятна.
  // Так часы одной записи встают рядом и сливаются, а пятно остаётся круглым.
  const free = new Set(c.map((_, i) => i)); // ≈ HashSet<int>
  const out: number[] = [];
  sizes.forEach((size, s) => {
    let prev = centers[s];
    for (let k = 0; k < size && free.size; k++) {
      let best = -1, bestScore = Infinity;
      for (const i of free) {
        const score = dist(c[i], prev) + 0.6 * dist(c[i], centers[s]);
        if (score < bestScore) { bestScore = score; best = i; }
      }
      free.delete(best);
      out.push(best);
      prev = c[best];
    }
  });
  return out;
}

function centroid(poly: Pt[]): Pt {
  const n = poly.length || 1;
  return [poly.reduce((s, p) => s + p[0], 0) / n, poly.reduce((s, p) => s + p[1], 0) / n];
}
