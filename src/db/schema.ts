import Dexie, { type EntityTable } from 'dexie';

// Занятие — узел дерева. parentId = null → корневое.
// interface в TS ≈ record/POCO в C#, но существует только при компиляции:
// в рантайме это обычный JS-объект без класса.
export interface Activity {
  id: string;                // UUID-строка (crypto.randomUUID())
  parentId: string | null;   // ≈ string? в C#
  name: string;
  hue?: number;              // тон 0–360, только у корневых; назначается сам
  colorOverride?: string;    // ручной цвет, если авто не нравится
  icon?: string;             // эмодзи
  order: number;             // порядок среди соседей
  forgetAfterMin?: number;   // нет → берётся у родителя, иначе 180
  timerMinMin?: number;      // диапазон ползунка таймера, мин; нет → у родителя, иначе 15…120
  timerMaxMin?: number;
  archivedAt?: number;
  need?: boolean;            // «нужда» (сон, еда…): не полезное время, вынимает часы из мозаики дня; наследуется детьми
  updatedAt: number;
}

// Запись — отрезок времени. Время — миллисекунды UTC
// (как DateTimeOffset.ToUnixTimeMilliseconds()).
export interface Entry {
  id: string;
  activityId: string;
  start: number;
  end: number | null;         // null = таймер идёт
  plannedEnd?: number;        // таймер на время: когда закрыть запись сама (нет = без лимита)
  note?: string;
  source: 'timer' | 'manual'; // строковый union вместо enum
  updatedAt: number;
}

// Привычка. Три вида засчёта:
//   check — галочка: тапнул, и день засчитан;
//   time  — время занятия: засчитывается сама, когда за день протрекано goalMin минут
//           по занятию activityId (вместе с подзанятиями);
//   quit  — «держусь»: день засчитан, пока не отметил срыв.
export type HabitKind = 'check' | 'time' | 'quit';

export interface Habit {
  id: string;
  name: string;
  icon?: string;              // эмодзи
  hue: number;                // тон цвета; у привычки по занятию цвет берётся у занятия
  kind: HabitKind;
  activityId?: string;        // только для time
  goalMin?: number;           // только для time: сколько минут в день
  weekdays?: number[];        // дни недели, 0 = пн … 6 = вс; нет = каждый день
  params?: HabitParam[];      // что ещё записывать при отметке: «Отжимания, раз», «Вес, кг»
  order: number;
  since: string;              // день начала 'ГГГГ-ММ-ДД': раньше него дни не в счёт
  archivedAt?: number;
  updatedAt: number;
}

// Параметр привычки — число, которое вписываешь при отметке (по нему рисуется график).
export interface HabitParam {
  id: string;
  name: string;               // «Отжимания»
  unit?: string;              // «раз», «мин», «км»
}

// Отметка привычки за день. id = `${habitId}:${day}` — одна отметка на день.
// done: для check — сделал; для quit — сорвался; для time — засчитать вручную
// (забыл включить таймер). Снятую отметку не удаляем, а пишем done: false —
// так «снятие» тоже переедет при слиянии бэкапов.
export interface HabitMark {
  id: string;
  habitId: string;
  day: string;                // 'ГГГГ-ММ-ДД' по местному времени
  done: boolean;
  values?: Record<string, number>; // id параметра → число (≈ Dictionary<string, double>)
  updatedAt: number;
}

export interface Setting {
  key: string;
  value: unknown;             // unknown ≈ object в C#: перед использованием нужно проверить тип
}

// База — аналог DbContext в EF Core, таблицы — аналог DbSet<T>.
// EntityTable<T, 'id'> говорит Dexie, какое поле первичный ключ.
export const db = new Dexie('eukairo') as Dexie & {
  activities: EntityTable<Activity, 'id'>;
  entries: EntityTable<Entry, 'id'>;
  settings: EntityTable<Setting, 'key'>;
  habits: EntityTable<Habit, 'id'>;
  habitMarks: EntityTable<HabitMark, 'id'>;
};

// Схема: первое поле — первичный ключ, остальные — индексы.
// При изменении схемы добавляем db.version(2) ниже, старую не трогаем
// (как миграции в EF Core).
db.version(1).stores({
  activities: 'id, parentId',
  entries: 'id, start, activityId',
  settings: 'key',
});

// v2: привычки. Старые таблицы не меняются, Dexie просто добавит новые.
db.version(2).stores({
  habits: 'id',
  habitMarks: 'id, habitId, day',
});
