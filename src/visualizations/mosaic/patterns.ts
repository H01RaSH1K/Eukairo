// Узоры деления картины на сегменты (сегмент = час).
// День — 24 сегмента, неделя — 168, месяц — 24 × число дней: всё одной картиной.
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

/** Раскладка по клеткам сетки: где стоит каждый час и какие клетки пустые. */
interface Slots {
  cols: number;
  rows: number;
  hours: [number, number][];  // [столбец, строка] для каждого часа по порядку
  empty: [number, number][];  // клетки без часов (станут декором)
  day?: number[];             // номер дня у часа (только для rows/calendar)
}

/**
 * Сколько столбцов и строк для n сегментов, чтобы картина заполнила виджет
 * с соотношением сторон `aspect` (ширина / высота), а клетки были близки к квадрату.
 * Перебираем все разложения n = cols × rows (≈ поиск минимума в цикле).
 */
function dims(n: number, aspect: number): { cols: number; rows: number } {
  let best = { cols: n, rows: 1 };
  let bestErr = Infinity;
  for (let cols = 1; cols <= n; cols++) {
    if (n % cols) continue;
    const rows = n / cols;
    const err = Math.abs(Math.log(cols / rows / aspect));
    if (err < bestErr) { bestErr = err; best = { cols, rows }; }
  }
  return best;
}

/** Порядок «змейкой»: строка слева направо, следующая справа налево. */
function snake(cols: number, rows: number): [number, number][] {
  const out: [number, number][] = [];
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < cols; i++) out.push([r % 2 === 0 ? i : cols - 1 - i, r]);
  }
  return out;
}

/** Подряд: змейка по всей картине; у копилки — снизу вверх. */
function flowSlots(n: number, aspect: number, fromBottom: boolean): Slots {
  const { cols, rows } = dims(n, aspect);
  const hours = snake(cols, rows).map(([c, r]): [number, number] => [c, fromBottom ? rows - 1 - r : r]);
  return { cols, rows, hours, empty: [] };
}

/**
 * По дням: день = полоса из k строк по 24/k часов. Часы не змейкой, а слева направо,
 * чтобы один и тот же час у всех дней стоял в одном столбце — видно режим дня.
 */
function rowSlots(days: number, aspect: number): Slots {
  let best = 1, bestErr = Infinity;
  for (const k of [1, 2, 3, 4, 6]) {
    const err = Math.abs(Math.log(24 / k / (days * k) / aspect));
    if (err < bestErr) { bestErr = err; best = k; }
  }
  const per = 24 / best;
  const hours: [number, number][] = [], day: number[] = [];
  for (let d = 0; d < days; d++) {
    for (let i = 0; i < 24; i++) { hours.push([i % per, d * best + Math.floor(i / per)]); day.push(d); }
  }
  return { cols: per, rows: days * best, hours, empty: [], day };
}

/**
 * Календарь: день = блок bw × bh часов, блоки сеткой. У месяца — 7 столбцов
 * (пн…вс), первый день встаёт под свой день недели. `weekday` — 0 = понедельник.
 */
function calendarSlots(days: number, aspect: number, weekday: number): Slots {
  const blocks: [number, number][] = [[4, 6], [6, 4], [3, 8], [8, 3]];
  const grids: [number, number, number][] = days === 1 ? [[1, 1, 0]]
    : days === 7 ? [[7, 1, 0], [4, 2, 0], [3, 3, 0], [2, 4, 0]]
    : [[7, Math.ceil((weekday + days) / 7), weekday]];
  let best = { bw: 4, bh: 6, gc: 1, gr: 1, off: 0 }, bestErr = Infinity;
  for (const [bw, bh] of blocks) for (const [gc, gr, off] of grids) {
    const err = Math.abs(Math.log((gc * bw) / (gr * bh) / aspect));
    if (err < bestErr) { bestErr = err; best = { bw, bh, gc, gr, off }; }
  }
  const { bw, bh, gc, gr, off } = best;
  const hours: [number, number][] = [], empty: [number, number][] = [], day: number[] = [];
  for (let b = 0; b < gc * gr; b++) {
    const d = b - off;
    const bc = (b % gc) * bw, br = Math.floor(b / gc) * bh;
    for (let i = 0; i < 24; i++) {
      const cell: [number, number] = [bc + (i % bw), br + Math.floor(i / bw)];
      if (d >= 0 && d < days) { hours.push(cell); day.push(d); } else empty.push(cell);
    }
  }
  // Порядок часов — по дням, как и у остальных узоров.
  return { cols: gc * bw, rows: gr * bh, hours, empty, day };
}

function slotsFor(fill: FillId, days: number, aspect: number, weekday: number): Slots {
  if (fill === 'rows') return rowSlots(days, aspect);
  if (fill === 'calendar') return calendarSlots(days, aspect, weekday);
  return flowSlots(days * 24, aspect, fill === 'jar');
}

const W = 100;
// Ширина картины всегда 100, высота — по форме виджета: картина заполняет его целиком.

// ——— витражи (диаграмма Вороного по разным раскладкам точек) ———

/** Неровный витраж: сетка точек со сдвигом. `jitter` 0…1 — насколько неровно. */
function jittered(sl: Slots, aspect: number, jitter: number, seed: number): Pattern {
  const h = W / aspect;
  const cw = W / sl.cols, ch = h / sl.rows;
  const rand = rng(seed + sl.hours.length);
  const pad = (1 - jitter) / 2;
  const at = ([c, r]: [number, number]): Pt => [(c + pad + rand() * jitter) * cw, (r + pad + rand() * jitter) * ch];
  return fromSeeds(sl, h, sl.hours.map(at), sl.empty.map(at), 3 * Math.max(cw, ch));
}

/** Соты: точки рядами со сдвигом на полклетки — получаются неровные шестиугольники. */
function hex(sl: Slots, aspect: number, seed: number): Pattern {
  const h = W / aspect;
  const cw = W / sl.cols, ch = h / sl.rows;
  const rand = rng(seed);
  const wob = () => (rand() - 0.5) * 0.3;
  const at = ([c, r]: [number, number]): Pt => [(c + (r % 2 ? 0.75 : 0.25) + wob()) * cw, (r + 0.5 + wob()) * ch];
  return fromSeeds(sl, h, sl.hours.map(at), sl.empty.map(at), 3 * Math.max(cw, ch));
}

/** Вороной по точкам часов и пустых клеток: первые — сегменты, вторые — декор. */
function fromSeeds(sl: Slots, h: number, hours: Pt[], empty: Pt[], reach: number): Pattern {
  const all = voronoi([...hours, ...empty], W, h, reach);
  return { w: W, h, cells: all.slice(0, hours.length), decor: all.slice(hours.length), day: sl.day };
}

/**
 * Спираль: точки вдоль спирали Архимеда от центра наружу с равным шагом.
 * Часы занимают круг, а углы квадрата добиваются пустыми «декоративными» стёклами.
 */
function spiral(days: number, aspect: number, seed: number): Pattern {
  // Считаем в квадрате S × S, потом растягиваем под форму виджета (круг → эллипс).
  const n = days * 24;
  const S = W, R = S / 2;
  const step = Math.sqrt((Math.PI * R * R) / n);      // средний размер стёклышка в круге
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

/** Роза-окно: кольцо на день, 24 лепестка по кругу, полночь сверху. */
function rose(days: number): Pattern {
  const w = W, h = W, cx = 50, cy = 50, r0 = days === 1 ? 14 : 8, r1 = 49;
  const ring = (r1 - r0) / days;
  const steps = days === 1 ? 4 : 2;
  const at = (r: number, a: number): Pt => [cx + r * Math.sin(a), cy - r * Math.cos(a)];
  const cells: Pt[][] = [];
  for (let d = 0; d < days; d++) {
    const ri = r0 + d * ring, ro = ri + ring;
    for (let i = 0; i < 24; i++) {
      const a0 = (i / 24) * 2 * Math.PI, a1 = ((i + 1) / 24) * 2 * Math.PI;
      const outer: Pt[] = [], inner: Pt[] = [];
      for (let k = 0; k <= steps; k++) {
        const a = a0 + ((a1 - a0) * k) / steps;
        outer.push(at(ro, a));
        inner.unshift(at(ri, a));
      }
      cells.push([...outer, ...inner]);
    }
  }
  return { w, h, cells };
}

/** Треугольники: прямоугольники, разрезанные по диагонали (направление чередуется). */
function tri(days: number, aspect: number): Pattern {
  // Прямоугольник = 2 треугольника, поэтому раскладываем days × 12 прямоугольников.
  const { cols, rows } = dims(days * 12, aspect);
  const h = W / aspect;
  const cw = W / cols, ch = h / rows;
  const cells: Pt[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: Pt[][] = [];
    for (let c = 0; c < cols; c++) {
      const x0 = c * cw, x1 = x0 + cw, y0 = r * ch, y1 = y0 + ch;
      if ((r + c) % 2 === 0) row.push([[x0, y0], [x1, y1], [x0, y1]], [[x0, y0], [x1, y0], [x1, y1]]);
      else row.push([[x0, y0], [x1, y0], [x0, y1]], [[x1, y0], [x1, y1], [x0, y1]]);
    }
    cells.push(...(r % 2 === 0 ? row : row.reverse()));
  }
  return { w: W, h, cells };
}

function grid(sl: Slots, aspect: number): Pattern {
  const h = W / aspect;
  const cw = W / sl.cols, ch = h / sl.rows;
  const rect = ([c, r]: [number, number]): Pt[] => [
    [c * cw, r * ch], [(c + 1) * cw, r * ch], [(c + 1) * cw, (r + 1) * ch], [c * cw, (r + 1) * ch],
  ];
  return { w: W, h, cells: sl.hours.map(rect), decor: sl.empty.map(rect), day: sl.day };
}

/**
 * Витраж: принцип один, а нарезка своя у каждого дня (недели, месяца),
 * чтобы дни не выглядели одинаково. `seed` — из даты, поэтому у одного
 * и того же дня нарезка всегда одна и та же.
 */
function glass(sl: Slots, days: number, aspect: number, seed: number, fill: FillId): Pattern {
  const cuts = [
    () => jittered(sl, aspect, 0.6, seed),   // ровные неровные стёкла
    () => jittered(sl, aspect, 0.98, seed),  // осколки
    () => hex(sl, aspect, seed),             // соты
    () => spiral(days, aspect, seed),        // спираль от центра (у копилки заполняется от центра)
  ];
  // Спираль не умеет раскладывать по дням — у «по дням» и «календаря» её нет.
  const n = fill === 'rows' || fill === 'calendar' ? 3 : 4;
  return cuts[seed % n]();
}

type Builder = (days: number, aspect: number, seed: number, fill: FillId, weekday: number) => Pattern;
const builders: Record<PatternId, Builder> = {
  glass: (d, a, s, f, wd) => glass(slotsFor(f, d, a, wd), d, a, s, f),
  rose: (d) => rose(d), // роза всегда круглая
  tri: (d, a) => tri(d, a),
  grid: (d, a, _s, f, wd) => grid(slotsFor(f, d, a, wd), a),
};
const cache = new Map<string, Pattern>();

/**
 * `aspect` — ширина / высота места под картину,
 * `weekday` — день недели первого дня (0 = пн), нужен календарю месяца.
 */
export function getPattern(id: PatternId, days = 1, seed = 0, aspect = 0.7, fill: FillId = 'flow', weekday = 0): Pattern {
  // Округляем форму, чтобы мелкие изменения размера не пересчитывали узор.
  const a = Math.round(Math.min(3, Math.max(0.3, aspect)) * 20) / 20;
  const key = `${id}:${days}:${seed}:${a}:${fill}:${weekday}`;
  if (!cache.has(key)) {
    if (cache.size > 60) cache.clear(); // кэш не должен расти бесконечно
    cache.set(key, builders[id](days, a, seed, fill, weekday));
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
