// Формат бэкапа и слияние при импорте. Чистые функции: про файлы и базу не знают.
import type { Activity, Entry, Setting } from '../db/schema';

export const SCHEMA_VERSION = 1;

export interface Backup {
  app: 'eukairo';
  schemaVersion: number;
  exportedAt: string;
  activities: Activity[];
  entries: Entry[];
  settings: Setting[];
}

const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

// `v is Activity` — «type guard»: если функция вернула true, TS дальше считает v Activity
// (≈ `if (v is Activity a)` в C#, только проверку пишем сами).
function isActivity(v: unknown): v is Activity {
  const a = v as Activity;
  return !!a && isStr(a.id) && (a.parentId === null || isStr(a.parentId)) && isStr(a.name) && isNum(a.order) && isNum(a.updatedAt);
}

function isEntry(v: unknown): v is Entry {
  const e = v as Entry;
  return !!e && isStr(e.id) && isStr(e.activityId) && isNum(e.start) && (e.end === null || isNum(e.end))
    && (e.source === 'timer' || e.source === 'manual') && isNum(e.updatedAt);
}

/** Разбирает текст файла. Бросает Error с понятным сообщением, если это не наш бэкап. */
export function parseBackup(text: string): Backup {
  let raw: Partial<Backup>;
  try { raw = JSON.parse(text); } catch { throw new Error('Это не JSON-файл.'); }
  if (!raw || raw.app !== 'eukairo') throw new Error('Это не бэкап Eukairo.');
  if (!isNum(raw.schemaVersion) || raw.schemaVersion > SCHEMA_VERSION) {
    throw new Error('Бэкап из более новой версии приложения — сначала обнови приложение.');
  }
  if (!Array.isArray(raw.activities) || !raw.activities.every(isActivity)) throw new Error('В бэкапе повреждены занятия.');
  if (!Array.isArray(raw.entries) || !raw.entries.every(isEntry)) throw new Error('В бэкапе повреждены записи.');
  const ids = new Set(raw.activities.map((a) => a.id));
  if (!raw.entries.every((e) => ids.has(e.activityId))) throw new Error('В бэкапе есть записи без занятия.');
  const settings = Array.isArray(raw.settings) ? raw.settings.filter((s) => s && isStr(s.key)) : [];
  return { app: 'eukairo', schemaVersion: raw.schemaVersion, exportedAt: String(raw.exportedAt ?? ''), activities: raw.activities, entries: raw.entries, settings };
}

/**
 * Слияние по id: новые добавляются, совпавшие — побеждает более свежий updatedAt.
 * Возвращает только то, что нужно записать (T extends … ≈ where T : IHasId).
 */
export function mergeById<T extends { id: string; updatedAt: number }>(local: T[], incoming: T[]): T[] {
  const byId = new Map(local.map((x) => [x.id, x]));
  return incoming.filter((x) => {
    const mine = byId.get(x.id);
    return !mine || x.updatedAt > mine.updatedAt;
  });
}

/** Один идущий таймер: если после слияния их несколько, все кроме самого позднего закрываем. */
export function closeExtraRunning(entries: Entry[]): Entry[] {
  const running = entries.filter((e) => e.end === null).sort((a, b) => b.start - a.start);
  const fixes: Entry[] = [];
  for (const e of running.slice(1)) {
    const next = entries.filter((o) => o.start > e.start).reduce((m, o) => Math.min(m, o.start), Infinity);
    fixes.push({ ...e, end: next, updatedAt: Date.now() });
  }
  return fixes;
}
