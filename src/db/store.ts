// Чтение данных для экранов. Вся база (занятия, записи, настройки) держится в памяти
// одним снимком и обновляется сама, когда команда что-то записала (Dexie liveQuery).
// Записей у одного человека — тысячи, а не миллионы, так что это быстрее и проще,
// чем отдельный запрос на каждый экран.
import { liveQuery } from 'dexie';
import { useSyncExternalStore } from 'react';
import { db, type Activity, type Entry, type Habit, type HabitMark, type Point } from './schema';
import { closeExpiredTimer, seedIfEmpty } from './commands';

export interface Data {
  ready: boolean;                    // false — база ещё открывается (доли секунды при старте)
  error: string | null;              // база недоступна (например, приватный режим)
  activities: Activity[];
  entries: Entry[];                  // по start
  settings: Record<string, unknown>; // ключ → значение
  running: Entry | null;             // идущий таймер
  habits: Habit[];
  habitMarks: HabitMark[];
  points: Point[];                   // записи без времени, по at
}

let data: Data = { ready: false, error: null, activities: [], entries: [], settings: {}, running: null, habits: [], habitMarks: [], points: [] };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Подписка экрана на данные (≈ событие OnChanged → перерисовка). */
export function useData(): Data {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => data,
  );
}

/** Значение настройки с запасным вариантом. `as T` — «поверь, тут T» (≈ приведение (T)obj). */
export const settingOf = <T,>(d: Data, key: string, fallback: T): T => (d.settings[key] as T | undefined) ?? fallback;

let started = false;

/** Открыть базу и начать следить за ней. Вызывается один раз из main.tsx. */
export function startStore() {
  if (started) return;
  started = true;
  seedIfEmpty()
    .then(() => {
      liveQuery(async () => {
        const [activities, entries, settings, habits, habitMarks, points] = await Promise.all([
          db.activities.toArray(),
          db.entries.orderBy('start').toArray(),
          db.settings.toArray(),
          db.habits.toArray(),
          db.habitMarks.toArray(),
          db.points.orderBy('at').toArray(),
        ]);
        return { activities, entries, settings, habits, habitMarks, points };
      }).subscribe({
        next: ({ activities, entries, settings, habits, habitMarks, points }) => {
          // Идущая — последняя по start с end = null (записи не пересекаются).
          let running: Entry | null = null;
          for (let i = entries.length - 1; i >= 0; i--) if (entries[i].end === null) { running = entries[i]; break; }
          data = { ready: true, error: null, activities, entries, settings: Object.fromEntries(settings.map((s) => [s.key, s.value])), running, habits, habitMarks, points };
          emit();
          if (running?.plannedEnd && running.plannedEnd <= Date.now()) void closeExpiredTimer();
        },
        error: (e) => fail(e),
      });
    })
    .catch(fail);

  // Таймер на время закрывается сам, даже если приложение было свёрнуто:
  // проверяем раз в 15 секунд и при каждом возврате в приложение.
  const check = () => {
    const r = data.running;
    if (r?.plannedEnd && r.plannedEnd <= Date.now()) void closeExpiredTimer();
  };
  setInterval(check, 15_000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
}

function fail(e: unknown) {
  console.error(e);
  data = { ...data, ready: true, error: e instanceof Error ? e.message : String(e) };
  emit();
}
