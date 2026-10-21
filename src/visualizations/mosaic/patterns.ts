// Узоры деления картины на сегменты (сегмент = час).
// Обычно день — 24 сегмента, но часы «нужд» (сон, еда…) из дня вынимаются,
// поэтому у каждого дня своё число сегментов (`counts`): поспал 8 ч — в дне 16 стёкол.
// Узор отдаёт многоугольники в порядке часов. Соседние по времени часы
// стараемся ставить рядом и на картинке, чтобы длинная запись слилась в одну фигуру.
import { rng, voronoi, type Pt } from './voronoi';

export type PatternId = 'glass' | 'rose' | 'tri' | 'grid';

/**
 * Заливка — в каком порядке часы периода раскладываются по картине.
 * flow — подряд змейкой; rows — день = полоса, часы дней друг под другом;
 * calendar — день = блок, блоки как в календаре; jar — копилка: только
 * занятые часы, снизу вверх (пустые пропускаются, их сжимает Mosaic.tsx);
 * spots — пятна: занятые часы липнут в несколько пятен (раскладывает layout.ts).
 */
export type FillId = 'flow' | 'rows' | 'calendar' | 'jar' | 'spots';

export interface Pattern {
  w: number;
  h: number;
  cells: Pt[][];   // сегменты-часы по порядку
  decor?: Pt[][];  // пустые стёкла для красоты (добивают края), временем не заполняются
  day?: number[];  // номер дня у каждого сегмента — между днями рисуем толстую линию
}

/** Место одного стекла: прямоугольник в координатах картины + номер строки и столбца внутри своего блока. */
interface Slot { x: number; y: number; w: number; h: number; row: number; col: number }

/** Раскладка по прямоугольникам: где стоит каждый час и какие места пустые. */
interface Slots {
  hours: Slot[];  // для каждого часа по порядку
  empty: Slot[];  // места без часов (станут декором)
  day?: number[]; // номер дня у часа (только для rows/calendar)
}

const W = 100;
// Ширина картины всегда 100, высота — по форме виджета: картина заполняет его целиком.

/**
 * Делит прямоугольник на n мест строками. Число строк подбираем так, чтобы места были
 * ближе к квадрату; если n не делится на число строк, в первых строках на одно место
 * больше (места там чуть уже) — так любое n ложится без дыр.
 * `rows` — заставить именно столько строк (у «по дням», чтобы полосы дней были одинаковые).
 * `snake` — нечётные строки справа налево, чтобы соседние часы стояли рядом.
 */
function split(x: number, y: number, w: number, h: number, n: number, snake: boolean, rows?: number): Slot[] {
  if (n <= 0) return [];
  let r = rows ? Math.min(rows, n) : 1;
  if (!rows) {
    let bestErr = Infinity;
    for (let k = 1; k <= n; k++) {
      const per = Math.ceil(n / k);
      const err = Math.abs(Math.log((w / per) / (h / k))) + (n % k ? 0.08 : 0); // неровные строки — лёгкий штраф
      if (err < bestErr) { bestErr = err; r = k; }
    }
  }
  const out: Slot[] = [];
  const rh = h / r;
  for (let row = 0; row < r; row++) {
    const count = Math.floor(n / r) + (row < n % r ? 1 : 0);
    const cw = w / count;
    for (let i = 0; i < count; i++) {
      const col = snake && row % 2 ? count - 1 - i : i;
      out.push({ x: x + col * cw, y: y + row * rh, w: cw, h: rh, row, col });
    }
  }
  return out;
}

/** Подряд: змейка по всей картине; у копилки — снизу вверх. */
function flowSlots(n: number, h: number, fromBottom: boolean): Slots {
  if (n === 0) return { hours: [], empty: split(0, 0, W, h, 24, true) }; // весь период — нужды: пустое окно
  const hours = split(0, 0, W, h, n, true).map((s) => (fromBottom ? { ...s, y: h - s.y - s.h } : s));
  return { hours, empty: [] };
}

/**
 * По дням: день = полоса из k строк. Часы не змейкой, а слева направо,
 * чтобы у полных дней один и тот же час стоял в одном столбце — видно режим дня.
 */
function rowSlots(counts: number[], h: number, aspect: number): Slots {
  const days = counts.length;
  let best = 1, bestErr = Infinity;
  for (const k of [1, 2, 3, 4, 6]) {
    const err = Math.abs(Math.log(24 / k / (days * k) / aspect));
    if (err < bestErr) { bestErr = err; best = k; }
  }
  const bandH = h / days;
  const hours: Slot[] = [], empty: Slot[] = [], day: number[] = [];
  counts.forEach((n, d) => {
    if (n === 0) { empty.push(...split(0, d * bandH, W, bandH, 24, false, best)); return; } // день целиком из нужд
    for (const s of split(0, d * bandH, W, bandH, n, false, best)) { hours.push(s); day.push(d); }
  });
  return { hours, empty, day };
}

/**
 * Календарь: день = блок, блоки сеткой. У месяца — 7 столбцов (пн…вс),
 * первый день встаёт под свой день недели. `weekday` — 0 = понедельник.
 * Форма блока считается по полному дню (bw × bh часов), а сами стёкла
 * дня делят блок между теми часами, что в нём остались.
 */
function calendarSlots(counts: number[], h: number, aspect: number, weekday: number): Slots {
  const days = counts.length;
  const blocks: [number, number][] = [[4, 6], [6, 4], [3, 8], [8, 3]];
  const grids: [number, number, number][] = days === 1 ? [[1, 1, 0]]
    : days === 7 ? [[7, 1, 0], [4, 2, 0], [3, 3, 0], [2, 4, 0]]
    : [[7, Math.ceil((weekday + days) / 7), weekday]];
  let best = { bw: 4, bh: 6, gc: 1, gr: 1, off: 0 }, bestErr = Infinity;
  for (const [bw, bh] of blocks) for (const [gc, gr, off] of grids) {
    const err = Math.abs(Math.log((gc * bw) / (gr * bh) / aspect));
    if (err < bestErr) { bestErr = err; best = { bw, bh, gc, gr, off }; }
  }
  const { gc, gr, off } = best;
  const bW = W / gc, bH = h / gr;
  const hours: Slot[] = [], empty: Slot[] = [], day: number[] = [];
  for (let b = 0; b < gc * gr; b++) {
    const d = b - off;
    const x = (b % gc) * bW, y = Math.floor(b / gc) * bH;
    const n = d >= 0 && d < days ? counts[d] : 0;
    if (n === 0) { empty.push(...split(x, y, bW, bH, 24, false)); continue; } // пустая клетка календаря или день из одних нужд
    // Ориентацию строк берём у формы блока: у полного дня это ровно bw × bh.
    for (const s of split(x, y, bW, bH, n, false)) { hours.push(s); day.push(d); }
  }
  // Порядок часов — по дням, как и у остальных узоров.
  return { hours, empty, day };
}

function slotsFor(fill: FillId, counts: number[], aspect: number, weekday: number): Slots {
  const h = W / aspect;
  if (fill === 'rows') return rowSlots(counts, h, aspect);
  if (fill === 'calendar') return calendarSlots(counts, h, aspect, weekday);
  return flowSlots(sum(counts), h, fill === 'jar');
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** Сколько охватывать соседей при построении Вороного: с запасом от самого крупного места. */
const reachOf = (sl: Slots) => 3 * Math.max(1, ...[...sl.hours, ...sl.empty].map((s) => Math.max(s.w, s.h)));

// ——— витражи (диаграмма Вороного по разным раскладкам точек) ———

/** Неровный витраж: точка в каждом месте со сдвигом. `jitter` 0…1 — насколько неровно. */
function jittered(sl: Slots, aspect: number, jitter: number, seed: number, relax = 0): Pattern {
  const h = W / aspect;
  const rand = rng(seed + sl.hours.length);
  const pad = (1 - jitter) / 2;
  const at = (s: Slot): Pt => [s.x + (pad + rand() * jitter) * s.w, s.y + (pad + rand() * jitter) * s.h];
  return fromSeeds(sl, h, sl.hours.map(at), sl.empty.map(at), reachOf(sl), relax);
}

/** Соты: точки рядами со сдвигом на полместа — получаются неровные шестиугольники. */
function hex(sl: Slots, aspect: number, seed: number, relax = 0): Pattern {
  const h = W / aspect;
  const rand = rng(seed);
  const wob = () => (rand() - 0.5) * 0.3;
  const at = (s: Slot): Pt => [s.x + ((s.row % 2 ? 0.75 : 0.25) + wob()) * s.w, s.y + (0.5 + wob()) * s.h];
  return fromSeeds(sl, h, sl.hours.map(at), sl.empty.map(at), reachOf(sl), relax);
}

/** Центр масс многоугольника (по площади, а не по вершинам). */
function centroid(poly: Pt[]): Pt {
  let a = 0, cx = 0, cy = 0;
  poly.forEach((p, i) => {
    const q = poly[(i + 1) % poly.length];
    const cr = p[0] * q[1] - q[0] * p[1];
    a += cr; cx += (p[0] + q[0]) * cr; cy += (p[1] + q[1]) * cr;
  });
  return Math.abs(a) < 1e-9 ? poly[0] : [cx / (3 * a), cy / (3 * a)];
}

/** Вороной по точкам часов и пустых мест: первые — сегменты, вторые — декор. */
function fromSeeds(sl: Slots, h: number, hours: Pt[], empty: Pt[], reach: number, relax = 0): Pattern {
  let seeds = [...hours, ...empty];
  let all = voronoi(seeds, W, h, reach);
  // Выравнивание (алгоритм Ллойда): каждую точку двигаем в центр её стекла и режем заново.
  // Крупные стёкла отдают место мелким, и за несколько шагов размеры почти сравниваются,
  // а порядок часов сохраняется — точки сдвигаются лишь немного.
  for (let k = 0; k < relax; k++) {
    // Шаг чуть «с разгоном» (×1.8 вместо ×1) — сходится в несколько раз быстрее.
    seeds = all.map((poly, i) => {
      if (poly.length < 3) return seeds[i];
      const c = centroid(poly), s = seeds[i];
      return [Math.min(W, Math.max(0, s[0] + 1.8 * (c[0] - s[0]))), Math.min(h, Math.max(0, s[1] + 1.8 * (c[1] - s[1])))];
    });
    all = voronoi(seeds, W, h, reach);
  }
  return { w: W, h, cells: all.slice(0, hours.length), decor: all.slice(hours.length), day: sl.day };
}

/**
 * Спираль: точки вдоль спирали Архимеда от центра наружу с равным шагом.
 * Часы занимают круг, а углы квадрата добиваются пустыми «декоративными» стёклами.
 */
function spiral(n: number, aspect: number, seed: number): Pattern {
  // Считаем в квадрате S × S, потом растягиваем под форму виджета (круг → эллипс).
  const S = W, R = S / 2;
  const step = Math.sqrt((Math.PI * R * R) / Math.max(1, n)); // средний размер стёклышка в круге
  const b = step / (2 * Math.PI);                      // r = b·θ: витки на расстоянии step
  const turn = rng(seed)() * 2 * Math.PI;              // поворот спирали — свой у каждого периода
  const sq: Pt[] = [];
  let theta = Math.PI; // начинаем чуть от центра, чтобы первые стёкла не были крошечными
  for (let r = b * theta; r < R * 1.5; r = b * theta) {
    sq.push([R + r * Math.sin(theta + turn), R - r * Math.cos(theta + turn)]);
    theta += step / Math.max(r, step);                 // шаг по дуге ≈ step
  }
  const w = W, h = W / aspect;
  const seeds = sq.map(([x, y]): Pt => [(x * w) / S, (y * h) / S]);
  const all = voronoi(seeds, w, h, 3 * step * Math.max(1, h / S, w / S));
  // Точки за пределами картины дают пустые многоугольники — их выбрасываем.
  const decor = all.slice(n).filter((c) => c.length >= 3);
  return { w, h, cells: all.slice(0, n), decor };
}

// ——— геометрические узоры ———

/** Роза-окно: кольцо на день, лепесток на час (сколько часов осталось), полночь сверху. */
function rose(counts: number[]): Pattern {
  const days = counts.length;
  const w = W, h = W, cx = 50, cy = 50, r0 = days === 1 ? 14 : 8, r1 = 49;
  const ring = (r1 - r0) / days;
  const at = (r: number, a: number): Pt => [cx + r * Math.sin(a), cy - r * Math.cos(a)];
  const cells: Pt[][] = [], decor: Pt[][] = [];
  counts.forEach((n, d) => {
    const ri = r0 + d * ring, ro = ri + ring;
    const petals = n || 24; // день из одних нужд — пустое кольцо-декор
    // Чем шире лепесток, тем больше точек на дуге, чтобы он оставался круглым.
    const steps = Math.ceil((days === 1 ? 4 : 2) * 24 / petals);
    for (let i = 0; i < petals; i++) {
      const a0 = (i / petals) * 2 * Math.PI, a1 = ((i + 1) / petals) * 2 * Math.PI;
      const outer: Pt[] = [], inner: Pt[] = [];
      for (let k = 0; k <= steps; k++) {
        const a = a0 + ((a1 - a0) * k) / steps;
        outer.push(at(ro, a));
        inner.unshift(at(ri, a));
      }
      (n ? cells : decor).push([...outer, ...inner]);
    }
  });
  return { w, h, cells, decor };
}

/** Треугольники: прямоугольники, разрезанные по диагонали (направление чередуется). */
function tri(n: number, aspect: number): Pattern {
  // Прямоугольник = 2 треугольника. При нечётном n последний треугольник — декор.
  const h = W / aspect;
  const tris: Pt[][] = [];
  for (const { x: x0, y: y0, w: cw, h: ch, row, col } of split(0, 0, W, h, Math.ceil(n / 2) || 12, true)) {
    const x1 = x0 + cw, y1 = y0 + ch;
    const pair: Pt[][] = (row + col) % 2 === 0
      ? [[[x0, y0], [x1, y1], [x0, y1]], [[x0, y0], [x1, y0], [x1, y1]]]
      : [[[x0, y0], [x1, y0], [x0, y1]], [[x1, y0], [x1, y1], [x0, y1]]];
    tris.push(...(row % 2 === 0 ? pair : pair.reverse())); // змейка и внутри пары
  }
  return { w: W, h, cells: tris.slice(0, n), decor: tris.slice(n) };
}

function grid(sl: Slots, aspect: number): Pattern {
  const h = W / aspect;
  const rect = ({ x, y, w, h }: Slot): Pt[] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  return { w: W, h, cells: sl.hours.map(rect), decor: sl.empty.map(rect), day: sl.day };
}

/**
 * Витраж: принцип один, а нарезка своя у каждого дня (недели, месяца),
 * чтобы дни не выглядели одинаково. `seed` — из даты, поэтому у одного
 * и того же дня нарезка всегда одна и та же.
 */
function glass(sl: Slots, n: number, aspect: number, seed: number, fill: FillId, cut: number, relax: number): Pattern {
  const cuts = [
    () => jittered(sl, aspect, 0.6, seed, relax),   // ровные неровные стёкла
    () => jittered(sl, aspect, 0.98, seed, relax),  // осколки
    () => hex(sl, aspect, seed, relax),             // соты
    () => spiral(n, aspect, seed),           // спираль от центра (у копилки заполняется от центра)
  ];
  // Спираль не умеет раскладывать по дням — у «по дням» и «календаря» её нет.
  const k = fill === 'rows' || fill === 'calendar' ? 3 : 4;
  // cut < 0 — «по дате»; иначе выбранная нарезка (спираль там, где её нет, → ровная).
  return cuts[cut < 0 ? seed % k : cut < k ? cut : 0]();
}

type Builder = (counts: number[], aspect: number, seed: number, fill: FillId, weekday: number, cut: number, relax: number) => Pattern;
const builders: Record<PatternId, Builder> = {
  glass: (c, a, s, f, wd, cut, relax) => glass(slotsFor(f, c, a, wd), sum(c), a, s, f, cut, relax),
  rose: (c) => rose(c), // роза всегда круглая
  tri: (c, a) => tri(sum(c), a),
  grid: (c, a, _s, f, wd) => grid(slotsFor(f, c, a, wd), a),
};
const cache = new Map<string, Pattern>();

/**
 * `days` — число полных дней или сколько часов-стёкол в каждом дне (меньше 24, если были нужды),
 * `aspect` — ширина / высота места под картину,
 * `weekday` — день недели первого дня (0 = пн), нужен календарю месяца,
 * `cut` — нарезка витража (−1 = по дате),
 * `relax` — сколько шагов выравнивания размеров стёкол (0 — как нарезалось).
 */
export function getPattern(id: PatternId, days: number | number[] = 1, seed = 0, aspect = 0.7, fill: FillId = 'flow', weekday = 0, cut = -1, relax = 0): Pattern {
  // number | number[] — «или то, или другое» (в C# тут были бы две перегрузки).
  const counts = typeof days === 'number' ? new Array<number>(days).fill(24) : days;
  // Округляем форму, чтобы мелкие изменения размера не пересчитывали узор.
  const a = Math.round(Math.min(3, Math.max(0.3, aspect)) * 20) / 20;
  const key = `${id}:${counts.join(',')}:${seed}:${a}:${fill}:${weekday}:${cut}:${relax}`;
  if (!cache.has(key)) {
    if (cache.size > 60) cache.clear(); // кэш не должен расти бесконечно
    cache.set(key, builders[id](counts, a, seed, fill, weekday, cut, relax));
  }
  return cache.get(key)!;
}

/** Число из даты начала периода: одинаковое для одного дня, разное для соседних. */
export function seedFor(from: number): number {
  const d = new Date(from);
  let x = d.getFullYear() * 400 + d.getMonth() * 32 + d.getDate();
  x = Math.imul(x ^ (x >>> 7), 0x9e3779b1);
  return (x >>> 0) % 100000;
}

/**
 * Свинцовые линии витража: все рёбра, кроме общих рёбер у сегментов
 * одной и той же записи. Так несколько часов одной записи читаются одной фигурой.
 * Возвращает SVG-путь ("M x y L x y …").
 */
export function leadPath(cells: Pt[][], owner: (string | null)[]): string {
  // Ребро → какие сегменты его используют. Ключ — концы, округлённые и упорядоченные,
  // так что ребро соседа (в обратном направлении) даёт тот же ключ (≈ Dictionary<string, List<int>>).
  const r = (v: number) => Math.round(v * 50);
  const keyOf = (p: Pt, q: Pt) => {
    const a = `${r(p[0])},${r(p[1])}`, b = `${r(q[0])},${r(q[1])}`;
    return a < b ? a + '|' + b : b + '|' + a;
  };
  const users = new Map<string, number[]>();
  cells.forEach((poly, i) => poly.forEach((p, k) => {
    const key = keyOf(p, poly[(k + 1) % poly.length]);
    users.set(key, [...(users.get(key) ?? []), i]);
  }));

  const parts: string[] = [];
  const drawn = new Set<string>();
  cells.forEach((poly) => poly.forEach((p, k) => {
    const q = poly[(k + 1) % poly.length];
    const key = keyOf(p, q);
    if (drawn.has(key)) return;
    drawn.add(key);
    const u = users.get(key)!;
    const merged = u.length === 2 && owner[u[0]] !== null && owner[u[0]] === owner[u[1]];
    if (!merged) parts.push(`M${p[0].toFixed(2)} ${p[1].toFixed(2)}L${q[0].toFixed(2)} ${q[1].toFixed(2)}`);
  }));
  return parts.join('');
}

/**
 * Толстые линии между днями (для «по дням» и «календаря»): рёбра, у которых
 * с двух сторон разные дни (декор считается отдельным «днём» -1).
 */
export function dayBorderPath(cells: Pt[][], day: number[]): string {
  const r = (v: number) => Math.round(v * 50);
  const keyOf = (p: Pt, q: Pt) => {
    const a = `${r(p[0])},${r(p[1])}`, b = `${r(q[0])},${r(q[1])}`;
    return a < b ? a + '|' + b : b + '|' + a;
  };
  const first = new Map<string, number>(); // ребро → день первого сегмента с ним
  const parts: string[] = [];
  cells.forEach((poly, i) => poly.forEach((p, k) => {
    const q = poly[(k + 1) % poly.length];
    const key = keyOf(p, q);
    const d = day[i] ?? -1;
    const seen = first.get(key);
    if (seen === undefined) first.set(key, d);
    else if (seen !== d) parts.push(`M${p[0].toFixed(2)} ${p[1].toFixed(2)}L${q[0].toFixed(2)} ${q[1].toFixed(2)}`);
  }));
  return parts.join('');
}
