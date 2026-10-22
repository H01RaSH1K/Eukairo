// Раскладка промежутков для мозаики. Чистые функции, без React.
import type { Span } from '../types';
import { HOUR_MS } from '../../domain/time';
import { rng, type Pt } from './voronoi';

/**
 * Хозяин часа: запись, чьё стекло это. `key` — «серия», по ней стёкла сливаются
 * в одну фигуру (несколько записей одного занятия почти подряд — одна серия).
 */
export interface HourOwner {
  entryId: string; key: string; color: string; need?: boolean;
  /** Стекло собрано из остатков: «pooled» — одного занятия (или родителя), «mixed» — всего подряд. */
  mark?: 'pooled' | 'mixed';
  /** Из чего собрано — цвета занятий и сколько у каждого (мс), по убыванию. */
  mix?: { color: string; ms: number }[];
}

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
 * Раскладка дня по стёклам (каждое — `step` времени, `count` штук в дне). Каждая серия получает
 * столько целых стёкол, сколько в ней полных шагов, — там, где у неё больше всего минут;
 * если эти стёкла уже заняты соседями — ближайшее свободное рядом с ней. Остатки меньше
 * стекла копятся и превращаются в сборные стёкла (см. poolOwners). Нужды остатков не копят:
 * из дня вынимаются только их целые стёкла.
 */
export function wholeOwners(spans: Span[], dayStart: number, count = 24, keys?: Map<string, string>, step = HOUR_MS): (HourOwner | null)[] {
  const H = step;
  const dayEnd = dayStart + count * H;
  interface Run { first: HourOwner; span: Span; end: number; total: number; ms: number[]; best: (HourOwner | null)[]; bestMs: number[] }
  const runs = new Map<string, Run>(); // ≈ Dictionary<string, Run>, порядок вставки сохраняется
  let lastEnd = dayStart;
  for (const s of spans) {
    const a = Math.max(s.start, dayStart), b = Math.min(s.end, dayEnd);
    if (b <= a) continue;
    lastEnd = Math.max(lastEnd, b);
    const o = ownerOf(s, keys);
    let run = runs.get(o.key);
    if (!run) {
      run = { first: o, span: s, end: b, total: 0, ms: new Array(count).fill(0), best: new Array(count).fill(null), bestMs: new Array(count).fill(0) };
      runs.set(o.key, run);
    }
    run.total += b - a;
    run.end = Math.max(run.end, b);
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

  const owners: (HourOwner | null)[] = new Array(count).fill(null);
  // Пары (серия, час) по убыванию минут: час достаётся тому, кто занял его плотнее.
  const pairs: [number, number, number][] = [];
  list.forEach((r, i) => r.ms.forEach((ms, h) => { if (ms > 0) pairs.push([i, h, ms]); }));
  pairs.sort((p, q) => q[2] - p[2] || p[1] - q[1]);
  for (const [i, h] of pairs) {
    if (owners[h] || quota[i] <= 0) continue;
    owners[h] = list[i].best[h];
    quota[i]--;
  }
  // Ближайшие к часам `own` свободные стёкла (но не в будущем, пока есть другие).
  const nearestFree = (own: number[], n: number) => {
    const dist = (h: number) => Math.min(...own.map((x) => Math.abs(x - h)));
    const past = (h: number) => (dayStart + h * H < lastEnd ? 0 : 1);
    const free = owners.map((o, h) => (o ? -1 : h)).filter((h) => h >= 0);
    free.sort((x, y) => past(x) - past(y) || dist(x) - dist(y) || x - y);
    return free.slice(0, n);
  };
  // Кому не хватило своих часов — ближайшие свободные.
  list.forEach((r, i) => {
    if (quota[i] <= 0) return;
    const own = r.ms.map((ms, h) => (ms > 0 ? h : -1)).filter((h) => h >= 0);
    for (const h of nearestFree(own, quota[i])) owners[h] = r.first;
  });

  const slot = (t: number) => Math.min(count - 1, Math.max(0, Math.floor((t - 1 - dayStart) / H)));
  const bits = list.filter((r) => !r.first.need && r.total % H > 0).map((r) => ({
    ms: r.total % H, end: r.end, entryId: r.first.entryId,
    chain: [{ id: r.span.activityId, color: r.span.color }, ...(r.span.parents ?? [])],
  }));
  for (const g of poolOwners(bits, H)) {
    for (const h of nearestFree([slot(g.end)], 1)) owners[h] = g.owner;
  }
  return owners;
}

/** Остаток серии для копилки: сколько, когда кончился, чья запись и цепочка «занятие → предки». */
export interface Bit { ms: number; end: number; entryId: string; chain: { id: string; color: string }[] }

/** Состав остатков: минуты по цвету занятия (у одного цвета — сумма), больше — первым. */
function mixOf(bits: Bit[]): { color: string; ms: number }[] {
  const byColor = new Map<string, number>();
  for (const b of bits) byColor.set(b.chain[0].color, (byColor.get(b.chain[0].color) ?? 0) + b.ms);
  return [...byColor].map(([color, ms]) => ({ color, ms })).sort((x, y) => y.ms - x.ms);
}

/**
 * Копилка остатков. Сначала складываем остатки одного занятия: набралось на целое стекло —
 * стекло его цвета с пометкой «pooled». Что не влезло, поднимается к родителю и складывается
 * с остатками братьев (стекло цвета родителя), и так до корня. Всё, что осталось, складываем
 * вместе: каждое набранное стекло — сборное «mixed» (с составом цветов). Меньше стекла в конце — не рисуется.
 * `end` у стекла — когда оно «набралось» (конец последнего вошедшего остатка): рядом его и ставим.
 * У каждого сборного стекла свой `key`: соседние не сливаются в фигуру, между ними обычный свинец.
 */
export function poolOwners(bits: Bit[], step: number): { owner: HourOwner; end: number }[] {
  const out: { owner: HourOwner; end: number }[] = [];
  const left = bits.map((b) => ({ ...b })); // ≈ копии: ms будем уменьшать
  const depth = Math.max(0, ...left.map((b) => b.chain.length));
  // Забираем `n` стёкол из группы: тратим с самых ранних остатков, поздние остаются копиться дальше.
  const take = (group: typeof left, n: number) => {
    let need = n * step;
    for (const b of [...group].sort((x, y) => x.end - y.end)) {
      const t = Math.min(b.ms, need);
      b.ms -= t; need -= t;
    }
  };
  for (let level = 0; level < depth; level++) {
    const groups = new Map<string, typeof left>();
    for (const b of left) if (b.ms > 0 && b.chain.length > level) {
      const id = b.chain[level].id;
      groups.set(id, [...(groups.get(id) ?? []), b]);
    }
    for (const [id, group] of groups) {
      const n = Math.floor(group.reduce((s, b) => s + b.ms, 0) / step);
      if (!n) continue;
      const main = group.reduce((x, y) => (y.ms > x.ms ? y : x)); // на тап откроется самый большой остаток
      const end = Math.max(...group.map((b) => b.end));
      const mix = mixOf(group); // у родителя — цвета детей, из которых набралось
      take(group, n);
      for (let k = 0; k < n; k++) out.push({ owner: { entryId: main.entryId, key: `pool:${id}:${out.length}`, color: group[0].chain[level].color, mark: 'pooled', mix }, end });
    }
  }
  const rest = left.filter((b) => b.ms > 0);
  const n = Math.floor(rest.reduce((s, b) => s + b.ms, 0) / step);
  if (n) {
    const end = Math.max(...rest.map((b) => b.end));
    const mix = mixOf(rest);
    for (let k = 0; k < n; k++) out.push({ owner: { entryId: '', key: `mixed:${out.length}`, color: mix[0].color, mark: 'mixed', mix }, end });
  }
  return out;
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
    for (let k = i; k < j; k++) members[spot].push(k);
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
