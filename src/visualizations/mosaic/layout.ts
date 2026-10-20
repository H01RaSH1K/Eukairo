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
 * Заливка пятнами: выбираем `count` точек-центров, занятые часы делим между ними
 * примерно (но не ровно) поровну и наращиваем вокруг каждой точки.
 * Возвращает номер стекла для каждого занятого часа (в том же порядке, что `filled`).
 * Центры зависят только от `seed`, поэтому за день точки не прыгают, а пятна растут.
 */
export function spotPlaces(cells: Pt[][], filled: HourOwner[], seed: number, count = 5, growth: 'round' | 'random' = 'round'): number[] {
  const c = cells.map(centroid);
  const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const rand = rng(seed + 17);

  // Доли пятен: случайный вес 0.7…1.3 у каждого, нормируем — получаем границы по часам.
  const weights = Array.from({ length: count }, () => 0.7 + rand() * 0.6);
  const sum = weights.reduce((a, b) => a + b, 0);
  let acc = 0;
  const bounds = weights.map((w) => (acc += w) / sum * filled.length);
  // Запись (отрезок часов одного entryId) не рвём между пятнами: она целиком идёт
  // в то пятно, куда попадает её середина. Так часы одной записи сливаются.
  const sizes = new Array<number>(count).fill(0);
  for (let i = 0; i < filled.length;) {
    let j = i;
    while (j < filled.length && filled[j].entryId === filled[i].entryId) j++;
    const mid = (i + j) / 2;
    const spot = Math.max(0, bounds.findIndex((b) => mid <= b));
    sizes[spot] += j - i;
    i = j;
  }

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

  const free = new Set(c.map((_, i) => i)); // ≈ HashSet<int>
  const out: number[] = [];
  // Рост: следующее стекло — свободное, ближайшее к предыдущему и поближе к центру пятна.
  // Так часы одной записи встают рядом и сливаются, а пятно растёт сплошным, без дыр.
  // «Кругом» — расстояние до центра обычное, пятно круглое. «Неровно» — расстояние
  // искажено по направлению (у пятна свои выступы и впадины), форма сложнее круга.
  sizes.forEach((size, s) => {
    const reach = growth === 'random' ? blobShape(rng(seed * 31 + s)) : () => 1;
    const toCenter = (p: Pt) => {
      const dx = p[0] - centers[s][0], dy = p[1] - centers[s][1];
      return Math.hypot(dx, dy) / reach(Math.atan2(dy, dx));
    };
    let prev = centers[s];
    for (let k = 0; k < size && free.size; k++) {
      let best = -1, bestScore = Infinity;
      for (const i of free) {
        const score = dist(c[i], prev) + 0.6 * toCenter(c[i]);
        if (score < bestScore) { bestScore = score; best = i; }
      }
      free.delete(best);
      out.push(best);
      prev = c[best];
    }
  });
  return out;
}

/**
 * Случайная неровная форма: «радиус» пятна в зависимости от угла.
 * Сумма нескольких волн (2, 3 и 5 выступов) со случайной силой и поворотом —
 * получается клякса, а не круг. Не меньше 0.3, поэтому пятно не рвётся.
 */
function blobShape(rand: () => number): (angle: number) => number {
  const waves = [2, 3, 5].map((k) => ({ k, amp: (0.25 + rand() * 0.25) / Math.sqrt(k - 1), phase: rand() * 2 * Math.PI }));
  return (a) => Math.max(0.3, 1 + waves.reduce((sum, w) => sum + w.amp * Math.cos(w.k * a + w.phase), 0));
}

function centroid(poly: Pt[]): Pt {
  const n = poly.length || 1;
  return [poly.reduce((s, p) => s + p[0], 0) / n, poly.reduce((s, p) => s + p[1], 0) / n];
}
