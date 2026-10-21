import Dexie, { type EntityTable } from 'dexie';
import { migrateHabitParams } from '../domain/points';

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
  timeless?: boolean;        // «без времени»: только записи с числами, в таймер и ввод времени не попадает; наследуется детьми
  params?: Param[];          // что вписывать в записи без времени: «Отжимания, раз», «Хват: пальцы / кулаки»
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

// Запись без времени — момент и числа: «20 отжиманий, кулаки, пол», «вес 72 кг».
// Принадлежит занятию, как и запись времени, но мозаику не заполняет: длительности у неё нет.
export interface Point {
  id: string;
  activityId: string;
  at: number;                       // когда (мс UTC)
  values?: Record<string, number>;  // id параметра занятия → число (≈ Dictionary<string, double>)
  choices?: Record<string, string>; // id параметра-варианта → id выбранного варианта
  note?: string;
  updatedAt: number;
}

// Привычка. Четыре вида засчёта:
//   check — галочка: тапнул, и день засчитан;
//   time  — время занятия: засчитывается сама, когда за день протрекано goalMin минут
//           по занятию activityId (вместе с подзанятиями);
//   quit  — «держусь»: день засчитан, пока не отметил срыв;
//   points — по записям занятия: засчитан, когда за день есть запись без времени
//           по занятию activityId (вместе с подзанятиями), например подход отжиманий.
export type HabitKind = 'check' | 'time' | 'quit' | 'points';

export interface Habit {
  id: string;
  name: string;
  icon?: string;              // эмодзи
  hue: number;                // тон цвета; у привычки по занятию цвет берётся у занятия
  kind: HabitKind;
  activityId?: string;        // для time и points
  goalMin?: number;           // только для time: сколько минут в день
  weekdays?: number[];        // дни недели, 0 = пн … 6 = вс; нет = каждый день
  /** @deprecated старый формат (до записей без времени): переезжает на занятие при открытии базы. */
  params?: Param[];
  order: number;
  since: string;              // день начала 'ГГГГ-ММ-ДД': раньше него дни не в счёт
  archivedAt?: number;
  updatedAt: number;
}

// Параметр занятия — то, что вписываешь в запись без времени. Обычно число (по нему рисуется график),
// а с `options` — вариант из списка: «Хват: пальцы / кулаки / ладони». Варианты красят точки
// на графике и позволяют оставить только сопоставимые записи.
export interface Param {
  id: string;
  name: string;               // «Отжимания», «Хват»
  unit?: string;              // «раз», «мин», «км»; у варианта нет
  options?: ParamOption[];    // есть → параметр-вариант, нет → число
}

// Вариант храним по id, а не по тексту: переименовал «ладони» в «на ладонях» — история не потерялась.
export interface ParamOption {
  id: string;
  name: string;
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
  /** @deprecated старый формат: числа за день — переезжают в записи без времени. */
  values?: Record<string, number>;
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
  points: EntityTable<Point, 'id'>;
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

// v3: записи без времени. Старые параметры привычек переезжают на занятия, числа из отметок —
// в записи (как миграция с переносом данных в EF Core). Сама перекладка — чистая функция
// в domain/points.ts, её же использует импорт старых бэкапов.
db.version(3).stores({
  points: 'id, at, activityId',
}).upgrade(async (tx) => {
  const [activities, habits, habitMarks] = await Promise.all([
    tx.table('activities').toArray(), tx.table('habits').toArray(), tx.table('habitMarks').toArray(),
  ]);
  const m = migrateHabitParams({ activities, habits, habitMarks }, Date.now());
  await tx.table('activities').bulkPut(m.activities);
  await tx.table('habits').bulkPut(m.habits);
  await tx.table('habitMarks').bulkPut(m.habitMarks);
  await tx.table('points').bulkPut(m.points);
});
