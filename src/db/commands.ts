// ВСЕ изменения данных — только здесь. Экраны данные читают (db/store.ts),
// а пишут, вызывая эти функции. Правила «один таймер» и «записи не пересекаются»
// держатся здесь и больше нигде.
//
// async/await — как в C#: функция возвращает Promise (≈ Task), экраны обычно
// не ждут результата — база сама сообщит об изменении, и экран перерисуется.
import { db, type Activity, type Entry, type Habit, type HabitSet } from './schema';
import { nextHue } from '../domain/colors';
import { resolveOverlaps } from '../domain/overlaps';
import { canMoveTo, childrenOf, subtreeIds } from '../domain/tree';
import type { ForgottenAnswer } from '../domain/forgotten';
import { dayKey, markSets, nextHabitHue } from '../domain/habits';

let idCounter = 0;
export const newId = () => crypto.randomUUID?.() ?? `id-${Date.now()}-${idCounter++}`;

/** Записи короче минуты при остановке выбрасываем: это случайный тап. */
const MIN_ENTRY_MS = 60_000;

// ——— таймер и записи ———

/** Идущая запись (end = null). Если вдруг их несколько — самая поздняя. */
async function findRunning(): Promise<Entry | undefined> {
  const all = await db.entries.filter((e) => e.end === null).toArray();
  return all.sort((a, b) => b.start - a.start)[0];
}

/** Закрыть запись в момент `at` (таймер на время — не позже назначенного конца). */
async function close(e: Entry, at: number) {
  const end = Math.max(e.start, Math.min(at, e.plannedEnd ?? at));
  if (end - e.start < MIN_ENTRY_MS) await db.entries.delete(e.id);
  else await db.entries.update(e.id, { end, updatedAt: Date.now() });
}

/** Остановить идущий таймер (по умолчанию — сейчас). */
export function stopTimer(at = Date.now()) {
  // Транзакция ≈ using var tx = BeginTransaction(): всё внутри либо выполнится целиком, либо нет.
  return db.transaction('rw', db.entries, async () => {
    const run = await findRunning();
    if (run) await close(run, at);
  });
}

/** Запустить таймер. `durationMs` — на время (запись закроется сама), без него — без лимита. */
export function startTimer(activityId: string, durationMs?: number) {
  return db.transaction('rw', db.entries, async () => {
    const now = Date.now();
    const run = await findRunning();
    if (run) await close(run, now);
    await db.entries.add({
      id: newId(), activityId, start: now, end: null,
      plannedEnd: durationMs ? now + durationMs : undefined, source: 'timer', updatedAt: now,
    });
  });
}

/** Таймер на время дошёл до конца — закрыть ровно в назначенную минуту. */
export function closeExpiredTimer(now = Date.now()) {
  return db.transaction('rw', db.entries, async () => {
    const run = await findRunning();
    if (run?.plannedEnd && run.plannedEnd <= now) await close(run, run.plannedEnd);
  });
}

/** Создать или исправить запись; пересекающиеся соседи обрезаются, делятся или удаляются. */
export function saveEntry(entry: Entry) {
  return db.transaction('rw', db.entries, async () => {
    const now = Date.now();
    const end = entry.end ?? now;
    // Кандидаты: всё, что началось раньше конца новой записи (индекс по start).
    const others = await db.entries.where('start').below(end).filter((e) => e.id !== entry.id).toArray();
    const r = resolveOverlaps(others, entry.start, end, now, newId);
    await db.entries.bulkDelete(r.removed);
    await db.entries.bulkPut([...r.updated, ...r.added, { ...entry, updatedAt: now }]);
  });
}

/** Записать уже прошедшее время (задним числом). */
export function logEntry(activityId: string, start: number, end: number) {
  return saveEntry({ id: newId(), activityId, start: Math.min(start, end), end: Math.max(start, end), source: 'manual', updatedAt: Date.now() });
}

export function deleteEntry(id: string) {
  return db.entries.delete(id);
}

// ——— занятия ———

/** Новое занятие в конце списка соседей. Корневому сразу назначается тон. Возвращает id. */
export function addActivity(parentId: string | null, name: string, icon?: string) {
  return db.transaction('rw', db.activities, async () => {
    const all = await db.activities.toArray();
    const siblings = all.filter((a) => a.parentId === parentId);
    const id = newId();
    await db.activities.add({
      id, parentId, name: name.trim() || 'Без названия', icon: icon || undefined,
      hue: parentId === null ? nextHue(all) : undefined,
      order: siblings.reduce((m, a) => Math.max(m, a.order + 1), 0),
      updatedAt: Date.now(),
    });
    return id;
  });
}

/** Поля, которые правятся напрямую. undefined = убрать своё значение (брать у родителя / авто). */
export type ActivityPatch = Partial<Pick<Activity, 'name' | 'icon' | 'hue' | 'colorOverride' | 'timerMinMin' | 'timerMaxMin' | 'forgetAfterMin' | 'need'>>;

export function updateActivity(id: string, patch: ActivityPatch) {
  // Dexie: поле со значением undefined в update удаляется из записи.
  return db.activities.update(id, { ...patch, updatedAt: Date.now() });
}

/** Диапазон ползунка таймера у занятия (минуты). */
export function setActivityTimer(id: string, minMin: number | undefined, maxMin: number | undefined) {
  return updateActivity(id, { timerMinMin: minMin, timerMaxMin: maxMin });
}

/** Перенести занятие (со всем поддеревом) к другому родителю; null — в корень. */
export function moveActivity(id: string, newParentId: string | null) {
  return db.transaction('rw', db.activities, async () => {
    const all = await db.activities.toArray();
    const node = all.find((a) => a.id === id);
    if (!node || node.parentId === newParentId || !canMoveTo(all, id, newParentId)) return;
    const siblings = all.filter((a) => a.parentId === newParentId);
    await db.activities.update(id, {
      parentId: newParentId,
      order: siblings.reduce((m, a) => Math.max(m, a.order + 1), 0),
      hue: newParentId === null ? node.hue ?? nextHue(all) : node.hue,
      updatedAt: Date.now(),
    });
  });
}

/** Сдвинуть среди соседей: -1 — выше, +1 — ниже. */
export function reorderActivity(id: string, dir: -1 | 1) {
  return db.transaction('rw', db.activities, async () => {
    const all = await db.activities.toArray();
    const node = all.find((a) => a.id === id);
    if (!node) return;
    const list = childrenOf(all, node.parentId);
    const i = list.findIndex((a) => a.id === id), j = i + dir;
    if (j < 0 || j >= list.length) return;
    // Переписываем порядок всем соседям подряд — так дырки и одинаковые order не мешают.
    [list[i], list[j]] = [list[j], list[i]];
    const now = Date.now();
    await db.activities.bulkPut(list.map((a, k) => ({ ...a, order: k, updatedAt: a.order === k ? a.updatedAt : now })));
  });
}

/**
 * «Завершить» проект: узел со всем поддеревом пропадает из выбора и режимов таймера,
 * история, цвета и сводки остаются. Если таймер шёл на нём — останавливаем.
 */
export function archiveActivity(id: string) {
  return db.transaction('rw', db.activities, db.entries, async () => {
    const now = Date.now();
    const ids = subtreeIds(await db.activities.toArray(), id);
    const run = await findRunning();
    if (run && ids.has(run.activityId)) await close(run, now);
    await db.activities.update(id, { archivedAt: now, updatedAt: now });
  });
}

export function restoreActivity(id: string) {
  return db.activities.update(id, { archivedAt: undefined, updatedAt: Date.now() });
}

/** Удалить занятие. Если у поддерева есть записи — вместо удаления завершаем (история не теряется). */
export function deleteActivity(id: string): Promise<'deleted' | 'archived'> {
  return db.transaction('rw', db.activities, db.entries, async () => {
    const ids = [...subtreeIds(await db.activities.toArray(), id)];
    const used = await db.entries.where('activityId').anyOf(ids).count();
    if (used > 0) {
      await archiveActivity(id);
      return 'archived' as const;
    }
    await db.activities.bulkDelete(ids);
    return 'deleted' as const;
  });
}

// ——— привычки ———

/** Что задаётся при создании и правке привычки. */
export type HabitPatch = Partial<Pick<Habit, 'name' | 'icon' | 'hue' | 'kind' | 'activityId' | 'goalMin' | 'weekdays' | 'params'>>;

/** Новая привычка в конце списка; день начала — сегодня. Возвращает id. */
export function addHabit(fields: HabitPatch & { name: string }) {
  return db.transaction('rw', db.habits, async () => {
    const all = await db.habits.toArray();
    const id = newId();
    await db.habits.add({
      kind: 'check', ...fields, id,
      name: fields.name.trim() || 'Без названия',
      hue: fields.hue ?? nextHabitHue(all),
      order: all.reduce((m, h) => Math.max(m, h.order + 1), 0),
      since: dayKey(Date.now()),
      updatedAt: Date.now(),
    });
    return id;
  });
}

export function updateHabit(id: string, patch: HabitPatch) {
  return db.habits.update(id, { ...patch, updatedAt: Date.now() });
}

/**
 * Отметить или снять отметку за день (`day` — ключ 'ГГГГ-ММ-ДД'). Записи (подходы) не трогаем:
 * сняли и снова поставили галочку — подходы вернутся.
 * Если отмечают день раньше начала привычки — начало сдвигается на него:
 * значит, привычка на самом деле началась раньше.
 */
export function setHabitMark(habitId: string, day: string, done: boolean) {
  return db.transaction('rw', db.habits, db.habitMarks, async () => {
    const id = `${habitId}:${day}`;
    const old = await db.habitMarks.get(id);
    await db.habitMarks.put({ ...old, id, habitId, day, done, updatedAt: Date.now() });
    if (done) await moveSince(habitId, day);
  });
}

/** Добавить запись (подход) за день; день при этом засчитан. */
export function addHabitSet(habitId: string, day: string, set: Pick<HabitSet, 'values' | 'choices'>) {
  return db.transaction('rw', db.habits, db.habitMarks, async () => {
    const id = `${habitId}:${day}`, now = Date.now();
    const old = await db.habitMarks.get(id);
    // снятая отметка: старые подходы не воскрешаем, день начинается заново
    const sets = old?.done ? markSets(old) : [];
    await db.habitMarks.put({ id, habitId, day, done: true, sets: [...sets, { id: newId(), at: now, ...set }], updatedAt: now });
    await moveSince(habitId, day);
  });
}

/** Удалить запись; без записей день больше не засчитан. */
export function removeHabitSet(habitId: string, day: string, setId: string) {
  return db.transaction('rw', db.habitMarks, async () => {
    const id = `${habitId}:${day}`;
    const old = await db.habitMarks.get(id);
    if (!old) return;
    const sets = markSets(old).filter((s) => s.id !== setId);
    await db.habitMarks.put({ id, habitId, day, done: sets.length > 0, sets, updatedAt: Date.now() });
  });
}

async function moveSince(habitId: string, day: string) {
  const h = await db.habits.get(habitId);
  if (h && day < h.since) await db.habits.update(habitId, { since: day, updatedAt: Date.now() });
}

/** Сдвинуть в списке: -1 — выше, +1 — ниже. */
export function reorderHabit(id: string, dir: -1 | 1) {
  return db.transaction('rw', db.habits, async () => {
    const list = (await db.habits.toArray()).filter((h) => !h.archivedAt).sort((a, b) => a.order - b.order);
    const i = list.findIndex((h) => h.id === id), j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    const now = Date.now();
    await db.habits.bulkPut(list.map((h, k) => ({ ...h, order: k, updatedAt: h.order === k ? h.updatedAt : now })));
  });
}

/** «Завершить»: привычка пропадает с «Сегодня», история остаётся. */
export function archiveHabit(id: string) {
  return db.habits.update(id, { archivedAt: Date.now(), updatedAt: Date.now() });
}

export function restoreHabit(id: string) {
  return db.habits.update(id, { archivedAt: undefined, updatedAt: Date.now() });
}

/** Удалить совсем, вместе с отметками. */
export function deleteHabit(id: string) {
  return db.transaction('rw', db.habits, db.habitMarks, async () => {
    await db.habitMarks.where('habitId').equals(id).delete();
    await db.habits.delete(id);
  });
}

// ——— настройки (ключ–значение) ———

export function setSetting(key: string, value: unknown) {
  return db.settings.put({ key, value });
}

/** Ответ «да, идёт» на вопрос о забытом таймере. */
export function answerForgotten(entryId: string) {
  return setSetting('forgottenAnswer', { entryId, at: Date.now() } satisfies ForgottenAnswer);
}

/** Плашку про бэкап убрали — не показывать сутки. */
export function snoozeBackupBanner() {
  return setSetting('backupSnoozeUntil', Date.now() + 24 * 3600_000);
}

// ——— первый запуск ———

/** На пустой базе один раз создаём стартовое дерево, чтобы было с чего начать. */
export function seedIfEmpty() {
  return db.transaction('rw', db.activities, db.settings, async () => {
    if (await db.settings.get('seeded')) return;
    if ((await db.activities.count()) === 0) {
      const now = Date.now();
      const roots: [string, string, number, number?, number?][] = [
        ['Работа', '💼', 215, 25, 240],
        ['Прогулка с собакой', '🐕', 30, 10, 90],
        ['Готовка', '🍳', 352],
        ['Английский', '🇬🇧', 275],
        ['Спорт', '🏃', 150],
        ['Чтение', '📚', 52],
      ];
      await db.activities.bulkAdd(roots.map(([name, icon, hue, timerMinMin, timerMaxMin], order) => ({
        id: newId(), parentId: null, name, icon, hue, order, timerMinMin, timerMaxMin, updatedAt: now,
      })));
    }
    await db.settings.put({ key: 'seeded', value: true });
  });
}
