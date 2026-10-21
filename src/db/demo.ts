// Демо-данные: дерево занятий и ~5 недель правдоподобных записей.
// Нужны, чтобы посмотреть мозаику и сводки на «живых» данных. Модуль грузится
// только по кнопке «Ещё → Демо-данные» и в стартовый бандл не попадает.
import { db, type Activity, type Entry, type Habit, type HabitMark, type Point } from './schema';
import { newId } from './commands';
import { addLocalDays, HOUR_MS, MIN_MS, startOfLocalDay } from '../domain/time';
import { dayKey, weekdayOf } from '../domain/habits';

const a = (id: string, parentId: string | null, name: string, order: number, extra: Partial<Activity> = {}): Activity =>
  ({ id, parentId, name, order, updatedAt: 0, ...extra });

const demoActivities: Activity[] = [
  a('work', null, 'Работа', 0, { hue: 215, icon: '💼', timerMinMin: 25, timerMaxMin: 240 }),
  a('euk', 'work', 'Eukairo', 0),
  a('code', 'euk', 'Код', 0),
  a('design', 'euk', 'Дизайн', 1),
  a('alfa', 'work', 'Клиент «Альфа»', 1),
  a('calls', 'alfa', 'Созвоны', 0),
  a('tasks', 'alfa', 'Задачи', 1),
  a('mail', 'work', 'Почта и планы', 2),
  a('dog', null, 'Прогулка с собакой', 1, { hue: 30, icon: '🐕', timerMinMin: 10, timerMaxMin: 90 }),
  a('cook', null, 'Готовка', 2, { hue: 352, icon: '🍳', timerMinMin: 15, timerMaxMin: 120 }),
  a('eng', null, 'Английский', 3, { hue: 275, icon: '🇬🇧' }),
  a('duo', 'eng', 'Duolingo', 0),
  a('series', 'eng', 'Сериалы', 1),
  a('sport', null, 'Спорт', 4, { hue: 150, icon: '🏃' }),
  // занятия с параметрами — для записей без времени («20 раз, кулаки, пол»)
  a('push', 'sport', 'Отжимания', 0, { icon: '💪', timeless: true, params: [
    { id: 'reps', name: 'Отжимания', unit: 'раз' },
    { id: 'grip', name: 'Хват', options: [{ id: 'palm', name: 'ладони' }, { id: 'fist', name: 'кулаки' }, { id: 'fing', name: 'пальцы' }] },
    { id: 'legs', name: 'Ноги', options: [{ id: 'floor', name: 'пол' }, { id: 'bench', name: 'скамья' }, { id: 'high', name: 'высоко' }] },
  ] }),
  a('bar', 'sport', 'Турник', 1, { icon: '🏋️', timeless: true, params: [{ id: 'pull', name: 'Подтягивания', unit: 'раз' }] }),
  a('body', null, 'Замеры', 9, { hue: 185, icon: '📏', timeless: true }),
  a('weight', 'body', 'Вес', 0, { icon: '⚖️', params: [{ id: 'kg', name: 'Вес', unit: 'кг' }] }),
  a('read', null, 'Чтение', 5, { hue: 52, icon: '📚' }),
  a('med', null, 'Медитация', 8, { hue: 305, icon: '🧘', timerMinMin: 5, timerMaxMin: 30 }),
  // Нужды: в полезное время не идут, их часы вынимаются из мозаики дня.
  a('sleep', null, 'Сон', 6, { hue: 240, icon: '😴', need: true, timerMinMin: 360, timerMaxMin: 600 }),
  a('eat', null, 'Еда', 7, { hue: 95, icon: '🍽️', need: true, timerMinMin: 15, timerMaxMin: 60 }),
];

// Детерминированный генератор случайных чисел (mulberry32):
// при каждом запуске одни и те же «случайные» данные.
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// [занятие, начало в часах, мин. длительность, макс. длительность, вероятность]
type Slot = [string | string[], number, number, number, number];

const weekday: Slot[] = [
  ['dog', 7.5, 30, 50, 1],
  ['med', 8.5, 3, 12, 0.85],
  ['mail', 9.6, 15, 30, 0.8],
  [['code', 'tasks'], 10, 90, 150, 1],
  ['eat', 12.6, 30, 45, 0.9],
  ['calls', 13.3, 30, 60, 0.6],
  [['design', 'tasks', 'code'], 14.5, 60, 130, 0.9],
  ['cook', 18.7, 30, 60, 0.9],
  ['eat', 19.6, 20, 35, 0.8],
  ['dog', 20.2, 40, 60, 1],
  [['duo', 'series'], 21.4, 20, 50, 0.8],
  ['read', 22.4, 20, 40, 0.5],
];

const weekend: Slot[] = [
  ['dog', 9, 60, 90, 1],
  ['med', 10.5, 4, 15, 0.7],
  ['sport', 11, 50, 80, 0.6],
  ['cook', 13, 40, 80, 0.9],
  ['eat', 14.4, 30, 45, 0.9],
  ['read', 16, 40, 90, 0.7],
  ['series', 20, 40, 60, 0.7],
  ['dog', 21, 40, 60, 1],
];

function makeDemoEntries(now: number): Entry[] {
  const rand = rng(42);
  const entries: Entry[] = [];
  const today = startOfLocalDay(now);

  for (let d = -40; d <= 0; d++) {
    const day = addLocalDays(today, d);
    const dow = new Date(day).getDay();
    const slots = dow === 0 || dow === 6 ? weekend : weekday;
    let prevEnd = day;

    // Сон: с вечера прошлого дня до утра (в будни раньше).
    {
      const last = entries[entries.length - 1];
      const s = Math.round(Math.max(day - (40 + rand() * 30) * MIN_MS, last ? last.end! + 5 * MIN_MS : 0) / MIN_MS) * MIN_MS;
      const e = Math.round((day + (slots === weekend ? 8.6 : 7) * HOUR_MS + (rand() - 0.5) * 30 * MIN_MS) / MIN_MS) * MIN_MS;
      if (s >= now) break;
      if (e > now) {
        entries.push({ id: newId(), activityId: 'sleep', start: s, end: null, source: 'timer', updatedAt: now });
        return entries;
      }
      entries.push({ id: newId(), activityId: 'sleep', start: s, end: e, source: 'timer', updatedAt: now });
      prevEnd = e;
    }

    for (const [act, hour, min, max, p] of slots) {
      if (rand() > p) continue;
      const activityId = Array.isArray(act) ? act[Math.floor(rand() * act.length)] : act;
      const jitter = (rand() - 0.5) * 40 * MIN_MS;
      const start = Math.max(day + hour * HOUR_MS + jitter, prevEnd + 5 * MIN_MS);
      const end = start + (min + rand() * (max - min)) * MIN_MS;
      const s = Math.round(start / MIN_MS) * MIN_MS;
      const e = Math.round(end / MIN_MS) * MIN_MS;

      if (s >= now) break;
      if (e > now) {
        // Этот слот идёт прямо сейчас — пусть будет живой таймер.
        entries.push({ id: newId(), activityId, start: s, end: null, source: 'timer', updatedAt: now });
        return entries;
      }
      entries.push({ id: newId(), activityId, start: s, end: e, source: rand() < 0.8 ? 'timer' : 'manual', updatedAt: now });
      prevEnd = e;
    }
  }

  // Ничего не идёт — для наглядности запускаем «Код» 25 минут назад.
  const last = entries[entries.length - 1];
  const start = Math.max(last ? last.end! + 5 * MIN_MS : today, now - 25 * MIN_MS);
  if (start < now) entries.push({ id: newId(), activityId: 'code', start, end: null, source: 'timer', updatedAt: now });
  return entries;
}

// Привычки — как в старом приложении Данилы.
const demoHabits: Habit[] = [
  { id: 'h-teeth', name: 'Почистить зубы вечером', icon: '🪥', hue: 150, kind: 'check' },
  { id: 'h-dishes', name: 'Помыть посуду', icon: '🍽️', hue: 195, kind: 'check' },
  { id: 'h-push', name: 'Анжуманя', icon: '💪', hue: 30, kind: 'points', activityId: 'push' },
  { id: 'h-med', name: 'Медитация', icon: '🧘', hue: 305, kind: 'time', activityId: 'med', goalMin: 5 },
  { id: 'h-bar', name: 'Турнек', icon: '🏋️', hue: 55, kind: 'points', activityId: 'bar', weekdays: [0, 2, 4] },
  { id: 'h-tok', name: 'Антиток', icon: '📵', hue: 330, kind: 'quit' },
].map((h, order) => ({ ...h, order, since: '', updatedAt: 0 }) as Habit);

function makeDemoMarks(now: number): { marks: HabitMark[]; points: Point[] } {
  const rand = rng(7);
  const marks: HabitMark[] = [];
  const points: Point[] = [];
  const today = startOfLocalDay(now);
  const mark = (habitId: string, day: number) =>
    marks.push({ id: `${habitId}:${dayKey(day)}`, habitId, day: dayKey(day), done: true, updatedAt: now });
  const point = (activityId: string, at: number, p: Pick<Point, 'values' | 'choices'>) =>
    points.push({ id: newId(), activityId, at, updatedAt: now, ...p });
  // Сегодняшний день оставляем наполовину отмеченным — чтобы было что потыкать.
  for (let d = -40; d <= 0; d++) {
    const day = addLocalDays(today, d), w = weekdayOf(day), t = d === 0;
    if (!t && rand() < 0.9) mark('h-teeth', day);
    if ((t || rand() < 0.75)) mark('h-dishes', day);
    // 2–4 подхода в день, хват и ноги меняются; на пальцах выходит заметно меньше — для этого и фильтр;
    // отжиманий понемногу больше: прогресс видно на графике
    if (rand() < (t ? 0 : 0.8)) {
      const n = 2 + Math.floor(rand() * 3);
      for (let i = 0; i < n; i++) {
        const grip = ['palm', 'fist', 'fing'][Math.floor(rand() * 3)], legs = rand() < 0.7 ? 'floor' : rand() < 0.6 ? 'bench' : 'high';
        const k = { palm: 1, fist: 0.8, fing: 0.45 }[grip]! * (legs === 'floor' ? 1 : legs === 'bench' ? 0.85 : 0.7);
        point('push', day + (18 * 60 + i * 4) * MIN_MS, { values: { reps: Math.round((12 + (d + 40) * 0.3 + rand() * 6) * k) }, choices: { grip, legs } });
      }
    }
    if ([0, 2, 4].includes(w) && !t && rand() < 0.85) {
      point('bar', day + 17 * HOUR_MS, { values: { pull: Math.round(5 + (d + 40) * 0.12 + rand() * 3) } });
      point('bar', day + 17 * HOUR_MS + 5 * MIN_MS, { values: { pull: Math.round(4 + (d + 40) * 0.1 + rand() * 2) } });
    }
    if (!t && rand() < 0.12) mark('h-tok', day); // срыв
    // вес — запись вне привычек, по утрам через день
    if (d % 2 === 0) point('weight', day + 8 * HOUR_MS, { values: { kg: Math.round((74 - (d + 40) * 0.05 + (rand() - 0.5) * 0.8) * 10) / 10 } });
  }
  return { marks, points };
}

/** Стереть занятия, записи (с временем и без) и привычки и заполнить демо-данными. Настройки не трогаем. */
export function fillDemo() {
  return db.transaction('rw', [db.activities, db.entries, db.habits, db.habitMarks, db.points], async () => {
    await Promise.all([db.activities.clear(), db.entries.clear(), db.habits.clear(), db.habitMarks.clear(), db.points.clear()]);
    const now = Date.now();
    const since = dayKey(addLocalDays(startOfLocalDay(now), -40));
    await db.activities.bulkAdd(demoActivities.map((a) => ({ ...a, updatedAt: now })));
    await db.entries.bulkAdd(makeDemoEntries(now));
    await db.habits.bulkAdd(demoHabits.map((h) => ({ ...h, since, updatedAt: now })));
    const { marks, points } = makeDemoMarks(now);
    await db.habitMarks.bulkAdd(marks);
    await db.points.bulkAdd(points);
  });
}
