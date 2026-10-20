// Демо-данные для макетов: дерево занятий и ~5 недель правдоподобных записей.
// Когда появится настоящее ядро, эта папка удаляется целиком.
import type { Activity, Entry } from '../db/schema';
import { addLocalDays, HOUR_MS, MIN_MS, startOfLocalDay } from '../domain/time';

const a = (id: string, parentId: string | null, name: string, order: number, extra: Partial<Activity> = {}): Activity =>
  ({ id, parentId, name, order, updatedAt: 0, ...extra });

export const demoActivities: Activity[] = [
  a('work', null, 'Работа', 0, { hue: 215, icon: '💼' }),
  a('euk', 'work', 'Eukairo', 0),
  a('code', 'euk', 'Код', 0),
  a('design', 'euk', 'Дизайн', 1),
  a('alfa', 'work', 'Клиент «Альфа»', 1),
  a('calls', 'alfa', 'Созвоны', 0),
  a('tasks', 'alfa', 'Задачи', 1),
  a('mail', 'work', 'Почта и планы', 2),
  a('dog', null, 'Прогулка с собакой', 1, { hue: 30, icon: '🐕' }),
  a('cook', null, 'Готовка', 2, { hue: 352, icon: '🍳' }),
  a('eng', null, 'Английский', 3, { hue: 275, icon: '🇬🇧' }),
  a('duo', 'eng', 'Duolingo', 0),
  a('series', 'eng', 'Сериалы', 1),
  a('sport', null, 'Спорт', 4, { hue: 150, icon: '🏃' }),
  a('read', null, 'Чтение', 5, { hue: 52, icon: '📚' }),
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
  ['mail', 9.6, 15, 30, 0.8],
  [['code', 'tasks'], 10, 90, 150, 1],
  ['calls', 13, 30, 60, 0.6],
  [['design', 'tasks', 'code'], 14.5, 60, 130, 0.9],
  ['cook', 18.7, 30, 60, 0.9],
  ['dog', 20, 40, 60, 1],
  [['duo', 'series'], 21.4, 20, 50, 0.8],
  ['read', 22.4, 20, 40, 0.5],
];

const weekend: Slot[] = [
  ['dog', 9, 60, 90, 1],
  ['sport', 11, 50, 80, 0.6],
  ['cook', 13, 40, 80, 0.9],
  ['read', 16, 40, 90, 0.7],
  ['series', 20, 40, 60, 0.7],
  ['dog', 21, 40, 60, 1],
];

let idCounter = 0;
export const newId = () => crypto.randomUUID?.() ?? `id-${Date.now()}-${idCounter++}`;

export function makeDemoEntries(now: number): Entry[] {
  const rand = rng(42);
  const entries: Entry[] = [];
  const today = startOfLocalDay(now);

  for (let d = -40; d <= 0; d++) {
    const day = addLocalDays(today, d);
    const dow = new Date(day).getDay();
    const slots = dow === 0 || dow === 6 ? weekend : weekday;
    let prevEnd = day;

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
