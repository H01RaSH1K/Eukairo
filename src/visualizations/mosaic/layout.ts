// Раскладка промежутков для мозаики. Чистые функции, без React.
import type { Span } from '../types';
import { HOUR_MS } from '../../domain/time';
import { rng, type Pt } from './voronoi';

/**
 * Хозяин часа: запись, чьё стекло это. `key` — «серия», по ней стёкла сливаются
 * в одну фигуру (несколько записей одного занятия почти подряд — одна серия).
 */
export interface HourOwner { entryId: string; key: string; color: string; need?: boolean }

/** Перерыв меньше этого между записями одного занятия не рвёт серию. */
const RUN_GAP = HOUR_MS / 2;

/**
 * Серии: записи одного занятия с перерывом меньше получаса склеиваем.
 * Возвращает entryId → ключ серии (entryId её первой записи). `spans` отсортированы по началу.
 */
export function runKeys(spans: Span[]): Map<string, string> {
  const out = new Map<string, string>();
  // Последняя серия каждого занятия: где закончилась и как зовётся.
  const last = new Map<string, { end: number; key: string }>();
  for (const s of spans) {
    const prev = last.get(s.activityId);
    const key = prev && s.start - prev.end < RUN_GAP ? prev.key : s.entryId;
    out.set(s.entryId, key);
    last.set(s.activityId, { end: Math.max(s.end, prev?.key === key ? prev.end : 0), key });
  }
  return out;
}

const ownerOf = (s: Span, keys?: Map<string, string>): HourOwner =>
  ({ entryId: s.entryId, key: keys?.get(s.entryId) ?? s.entryId, color: s.color, need: s.need });

/**
 * Остаток серии меньше часа: кусок стекла площадью `frac` (0.1…1) его площади.
 * `hour` — час дня, рядом с которым кусок лучше всего встанет.
 */
export interface Rest { owner: HourOwner; frac: number; hour: number }

/** Самый маленький кусок по умолчанию — 10% стекла (запись короче 6 минут рисуется как 6 минут). */
export const MIN_FRAC = 0.1;

/**
 * Раскладка дня. Каждая серия получает столько целых стёкол, сколько в ней полных
 * часов, — там, где у неё больше всего минут; если эти часы уже заняты соседями,
 * ближайший свободный час рядом с ней. Остаток (например, полчаса) отдаём как `Rest`:
 * его вырежут куском из стекла (см. pieces.ts). У нужд остаток не нужен — из дня
 * вынимаются только их целые часы. `minFrac` — самый маленький кусок (доля стекла).
 */
export function wholeOwners(spans: Span[], dayStart: number, count = 24, keys?: Map<string, string>, minFrac = MIN_FRAC): { owners: (HourOwner | null)[]; rests: Rest[] } {
  const H = HOUR_MS;
  const dayEnd = dayStart + count * H;
  interface Run { first: HourOwner; start: number; total: number; ms: number[]; best: (HourOwner | null)[]; bestMs: number[] }
  const runs = new Map<string, Run>(); // ≈ Dictionary<string, Run>, порядок вставки сохраняется
  let lastEnd = dayStart;
  for (const s of spans) {
    const a = Math.max(s.start, dayStart), b = Math.min(s.end, dayEnd);
    if (b <= a) continue;
    lastEnd = Math.max(lastEnd, b);
    const o = ownerOf(s, keys);
    let run = runs.get(o.key);
    if (!run) {
      run = { first: o, start: a, total: 0, ms: new Array(count).fill(0), best: new Array(count).fill(null), bestMs: new Array(count).fill(0) };
      runs.set(o.key, run);
    }
    run.total += b - a;
    for (let h = Math.floor((a - dayStart) / H); h < count && dayStart + h * H < b; h++) {
      const part = Math.min(b, dayStart + (h + 1) * H) - Math.max(a, dayStart + h * H);
      if (part <= 0) continue;
      run.ms[h] += part;
      // В часе серии стекло подписано записью, у которой там больше минут (на неё откроется тап).
      if (part > run.bestMs[h]) { run.bestMs[h] = part; run.best[h] = o; }
    }
  }
  const list = [...runs.values()];
  const quota = list.map((r) => Math.floor(r.total / H));
  const mine = list.map(() => new Set<number>()); // часы, отданные серии целиком

  const owners: (HourOwner | null)[] = new Array(count).fill(null);
  // Пары (серия, час) по убыванию минут: час достаётся тому, кто занял его плотнее.
  const pairs: [number, number, number][] = [];
  list.forEach((r, i) => r.ms.forEach((ms, h) => { if (ms > 0) pairs.push([i, h, ms]); }));
  pairs.sort((p, q) => q[2] - p[2] || p[1] - q[1]);
  for (const [i, h] of pairs) {
    if (owners[h] || quota[i] <= 0) continue;
    owners[h] = list[i].best[h];
    mine[i].add(h);
    quota[i]--;
  }
  // Кому не хватило своих часов — ближайшие свободные (но не в будущем, пока есть другие).
  list.forEach((r, i) => {
    if (quota[i] <= 0) return;
    const own = r.ms.map((ms, h) => (ms > 0 ? h : -1)).filter((h) => h >= 0);
    const dist = (h: number) => Math.min(...own.map((x) => Math.abs(x - h)));
    const past = (h: number) => (dayStart + h * H < lastEnd ? 0 : 1);
    const free = owners.map((o, h) => (o ? -1 : h)).filter((h) => h >= 0);
    free.sort((x, y) => past(x) - past(y) || dist(x) - dist(y) || x - y);
    for (const h of free.slice(0, quota[i])) { owners[h] = r.first; mine[i].add(h); }
  });

  // Остатки — по времени начала серий. Час куска — тот, где у серии больше всего
  // минут среди часов, не отданных ей целиком.
  const rests: Rest[] = [];
  list.map((r, i) => ({ r, i })).sort((x, y) => x.r.start - y.r.start).forEach(({ r, i }) => {
    const rest = r.total % H;
    if (rest <= 0 || r.first.need) return;
    let hour = -1;
    r.ms.forEach((ms, h) => { if (ms > 0 && !mine[i].has(h) && (hour < 0 || ms > r.ms[hour])) hour = h; });
    if (hour < 0) hour = r.ms.indexOf(Math.max(...r.ms));
    rests.push({ owner: r.best[hour] ?? r.first, frac: Math.max(minFrac, rest / H), hour });
  });
  return { owners, rests };
}

/**
 * Заливка пятнами: выбираем `count` точек-центров, занятые часы делим между ними
 * примерно (но не ровно) поровну и наращиваем вокруг каждой точки.
 * Возвращает номер стекла для каждого занятого часа (в том же порядке, что `filled`).
 * Центры зависят только от `seed`, поэтому за день точки не прыгают, а пятна растут.
 * `tail` — пометки «в хвост»: такие стёкла (куски остатков) пятно наращивает последними,
 * по краю — тогда их объедки не остаются дырами внутри пятна.
 * `spotOf` (необязательно) — сюда пишется номер пятна каждого часа (≈ out-параметр в C#).
 */
export function spotPlaces(cells: Pt[][], filled: HourOwner[], seed: number, count = 5, growth: 'round' | 'random' = 'round', tail?: boolean[], spotOf?: number[]): number[] {
  const c = cells.map(centroid);
  const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const rand = rng(seed + 17);

  // Доли пятен: случайный вес 0.7…1.3 у каждого, нормируем — получаем границы по часам.
  const weights = Array.from({ length: count }, () => 0.7 + rand() * 0.6);
  const sum = weights.reduce((a, b) => a + b, 0);
  let acc = 0;
  const bounds = weights.map((w) => (acc += w) / sum * filled.length);
  // Серию (отрезок часов одного key) не рвём между пятнами: она целиком идёт
  // в то пятно, куда попадает её середина. Так часы одной записи сливаются.
  const sizes = new Array<number>(count).fill(0);
  const members: number[][] = Array.from({ length: count }, () => []); // номера часов каждого пятна
  for (let i = 0; i < filled.length;) {
    let j = i;
    while (j < filled.length && filled[j].key === filled[i].key) j++;
    const mid = (i + j) / 2;
    const spot = Math.max(0, bounds.findIndex((b) => mid <= b));
    sizes[spot] += j - i;
    for (let k = i; k < j; k++) { members[spot].push(k); if (spotOf) spotOf[k] = spot; }
    i = j;
  }
  // Внутри пятна сначала целые, потом «хвост» (sort устойчивый — порядок времени сохраняется).
  members.forEach((m) => m.sort((a, b) => Number(!!tail?.[a]) - Number(!!tail?.[b])));

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
  const out: number[] = new Array(filled.length).fill(-1);
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
      out[members[s][k]] = best;
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
