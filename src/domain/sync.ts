// Слияние для синхронизации через Gist. Чистые функции: про сеть и базу не знают.
//
// В гисте лежит обычный бэкап плюс список удалений («надгробия»): ключ `таблица:id` → когда удалили.
// Без них удалённая на телефоне запись вернулась бы с ноутбука при следующем слиянии.
// Правило везде одно: побеждает более позднее время — правка (updatedAt) или удаление (deletedAt).
import type { Activity, Entry, Habit, HabitMark, Point } from '../db/schema';
import { closeExtraRunning } from './backup';

/** Таблицы, которые синхронизируются. `as const` — массив фиксированных строк, а не string[]. */
export const SYNC_TABLES = ['activities', 'entries', 'habits', 'habitMarks', 'points'] as const;
export type SyncTable = (typeof SYNC_TABLES)[number]; // 'activities' | 'entries' | …

/** Удаления: `entries:<id>` → мс, когда удалили (≈ Dictionary<string, long>). */
export type Tombs = Record<string, number>;

/** Сколько помним удаления. Устройство, не синхронизированное дольше, может вернуть удалённое. */
export const TOMB_TTL_MS = 180 * 86_400_000;

export interface Snapshot {
  activities: Activity[];
  entries: Entry[];
  habits: Habit[];
  habitMarks: HabitMark[];
  points: Point[];
}

type Row = { id: string; updatedAt: number };

/** Что записать в базу этого устройства: какие строки положить и какие id удалить. */
export interface SyncPlan {
  put: Record<SyncTable, Row[]>;
  del: Record<SyncTable, string[]>;
  tombs: Tombs;      // итоговые удаления (свои + пришедшие), уже без старых
  result: Snapshot;  // как будет выглядеть база после плана — это и уходит в гист
}

export const tombKey = (t: SyncTable, id: string) => `${t}:${id}`;

/** Объединить удаления: по каждому ключу — более позднее, старше TOMB_TTL_MS выбрасываем. */
export function mergeTombs(a: Tombs, b: Tombs, now: number): Tombs {
  const out: Tombs = {};
  for (const src of [a, b]) {
    for (const [k, at] of Object.entries(src)) {
      if (now - at < TOMB_TTL_MS && !(out[k] >= at)) out[k] = at;
    }
  }
  return out;
}

/** Слить своё (local + свои удаления) с пришедшим из гиста (remote + его удаления). */
export function planSync(local: Snapshot, localTombs: Tombs, remote: Snapshot, remoteTombs: Tombs, now: number): SyncPlan {
  const tombs = mergeTombs(localTombs, remoteTombs, now);
  const put = {} as SyncPlan['put'];
  const del = {} as SyncPlan['del'];
  const final = {} as Record<SyncTable, Map<string, Row>>;
  // Версии, которые могут понадобиться, чтобы вернуть занятие, на которое ещё кто-то ссылается.
  const anyVersion = new Map<string, Row>();

  for (const t of SYNC_TABLES) {
    const mine = new Map<string, Row>(local[t].map((x) => [x.id, x]));
    const putMap = new Map<string, Row>();
    for (const x of remote[t]) {
      const k = tombKey(t, x.id);
      const prev = anyVersion.get(k);
      if (!prev || x.updatedAt > prev.updatedAt) anyVersion.set(k, x);
      if (tombs[k] >= x.updatedAt) continue; // удалено позже этой правки
      const m = mine.get(x.id);
      if (!m || x.updatedAt > m.updatedAt) { mine.set(x.id, x); putMap.set(x.id, x); }
    }
    for (const x of local[t]) {
      const k = tombKey(t, x.id);
      const prev = anyVersion.get(k);
      if (!prev || x.updatedAt > prev.updatedAt) anyVersion.set(k, x);
    }
    const delSet = new Set<string>();
    for (const [id, x] of mine) {
      if (tombs[tombKey(t, id)] >= x.updatedAt) { mine.delete(id); putMap.delete(id); delSet.add(id); }
    }
    final[t] = mine;
    put[t] = [...putMap.values()];
    del[t] = [...delSet];
  }

  // Занятие удалили на одном устройстве, а на другом в это время к нему записали время
  // (или завели подзанятие). Такое занятие возвращаем: записи без занятия быть не должно.
  for (let changed = true; changed;) {
    changed = false;
    const used = new Set<string>();
    for (const e of final.entries.values()) used.add((e as Entry).activityId);
    for (const p of final.points.values()) used.add((p as Point).activityId);
    for (const h of final.habits.values()) if ((h as Habit).activityId) used.add((h as Habit).activityId!);
    for (const a of final.activities.values()) if ((a as Activity).parentId) used.add((a as Activity).parentId!);
    for (const id of used) {
      const k = tombKey('activities', id);
      const back = anyVersion.get(k);
      if (final.activities.has(id) || !back) continue;
      final.activities.set(id, back);
      delete tombs[k];
      del.activities = del.activities.filter((x) => x !== id);
      if (!local.activities.some((a) => a.id === id && a.updatedAt >= back.updatedAt)) put.activities.push(back);
      changed = true;
    }
  }

  // Два устройства могли запустить таймер одновременно — оставляем идущим только поздний.
  const fixes = closeExtraRunning([...final.entries.values()] as Entry[]);
  for (const f of fixes) {
    final.entries.set(f.id, f);
    put.entries = [...put.entries.filter((x) => x.id !== f.id), f];
  }

  const result = Object.fromEntries(SYNC_TABLES.map((t) => [t, [...final[t].values()]])) as unknown as Snapshot;
  return { put, del, tombs, result };
}

/**
 * Отпечаток данных: одинаковый у одинаковых данных независимо от порядка строк.
 * По нему решаем, надо ли отправлять в гист (и надо ли вообще что-то делать после правки).
 */
export function fingerprint(s: Snapshot, tombs: Tombs): string {
  const parts = SYNC_TABLES.map((t) => s[t].map((x) => `${x.id}@${x.updatedAt}`).sort().join(','));
  return [...parts, Object.keys(tombs).sort().join(',')].join('|');
}

/** Есть ли в данных что-то кроме занятий по умолчанию (новое устройство, ещё не трогали). */
export const hasUserData = (s: Snapshot) => s.entries.length + s.points.length + s.habits.length > 0;
