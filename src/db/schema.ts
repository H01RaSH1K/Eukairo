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
  archivedAt?: number;
  updatedAt: number;
}

// Запись — отрезок времени. Время — миллисекунды UTC
// (как DateTimeOffset.ToUnixTimeMilliseconds()).
export interface Entry {
  id: string;
  activityId: string;
  start: number;
  end: number | null;         // null = таймер идёт
  note?: string;
  source: 'timer' | 'manual'; // строковый union вместо enum
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
};

// Схема: первое поле — первичный ключ, остальные — индексы.
// При изменении схемы добавляем db.version(2) ниже, старую не трогаем
// (как миграции в EF Core).
db.version(1).stores({
  activities: 'id, parentId',
  entries: 'id, start, activityId',
  settings: 'key',
});
