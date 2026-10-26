// Тесты команд на «ненастоящей» IndexedDB в памяти (fake-indexeddb) — как InMemory-провайдер в EF Core.
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, type Entry } from './schema';
import {
  deletePoint, savePoint,
  addActivity, archiveActivity, closeExpiredTimer, deleteActivity, logEntry, moveActivity, reorderActivity,
  saveEntry, seedIfEmpty, startTimer, stopTimer,
} from './commands';
import { mergeBackup } from './backup';
import { childrenOf } from '../domain/tree';

const MIN = 60_000;
const entries = () => db.entries.orderBy('start').toArray();

beforeEach(async () => {
  vi.useRealTimers();
  await Promise.all([db.activities.clear(), db.entries.clear(), db.settings.clear(), db.points.clear()]);
});

describe('таймер', () => {
  it('запуск нового останавливает идущий', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(0);
    await startTimer('a');
    vi.setSystemTime(30 * MIN);
    await startTimer('b');
    const [a, b] = await entries();
    expect(a).toMatchObject({ activityId: 'a', start: 0, end: 30 * MIN });
    expect(b).toMatchObject({ activityId: 'b', start: 30 * MIN, end: null });
  });

  it('таймер на время закрывается ровно в назначенную минуту', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(0);
    await startTimer('a', 25 * MIN);
    vi.setSystemTime(40 * MIN);
    await closeExpiredTimer();
    expect((await entries())[0].end).toBe(25 * MIN);
  });

  it('правка начала таймера на время сдвигает и его конец', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(30 * MIN);
    await startTimer('a', 60 * MIN);
    const [run] = await entries();
    await saveEntry({ ...run, start: 20 * MIN });
    vi.setSystemTime(85 * MIN);
    await closeExpiredTimer();
    expect((await entries())[0]).toMatchObject({ start: 20 * MIN, end: 80 * MIN });
  });

  it('старый вид (готовый конец) читается и при правке становится длительностью', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(10 * MIN);
    const old: Entry = { id: 'x', activityId: 'a', start: 0, end: null, plannedEnd: 60 * MIN, source: 'timer', updatedAt: 0 };
    await db.entries.add(old);
    vi.setSystemTime(70 * MIN);
    await closeExpiredTimer();
    expect((await entries())[0].end).toBe(60 * MIN);
  });

  it('старт с прошлого времени: идущий закрывается там, записанное после — обрезается', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    await logEntry('m', 0, 25 * MIN);
    vi.setSystemTime(30 * MIN);
    await startTimer('a');
    vi.setSystemTime(60 * MIN);
    await startTimer('b', undefined, 20 * MIN);
    const list = await entries();
    expect(list.map((e) => [e.activityId, e.start / MIN, e.end === null ? null : e.end / MIN])).toEqual([['m', 0, 20], ['b', 20, null]]);
  });

  it('старт с прошлого на время считает конец от выбранного начала', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(60 * MIN);
    await startTimer('a', 30 * MIN, 40 * MIN);
    vi.setSystemTime(75 * MIN);
    await closeExpiredTimer();
    expect((await entries())[0]).toMatchObject({ start: 40 * MIN, end: 70 * MIN });
  });

  it('стоп раньше минуты — случайный тап, запись выбрасывается', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(0);
    await startTimer('a');
    vi.setSystemTime(20_000);
    await stopTimer();
    expect(await entries()).toHaveLength(0);
  });
});

describe('записи задним числом', () => {
  it('запись внутри другой делит её на две', async () => {
    await logEntry('a', 0, 60 * MIN);
    await logEntry('b', 20 * MIN, 30 * MIN);
    const list = await entries();
    expect(list.map((e) => [e.activityId, e.start / MIN, e.end! / MIN])).toEqual([['a', 0, 20], ['b', 20, 30], ['a', 30, 60]]);
  });

  it('правка записи не конфликтует сама с собой', async () => {
    await logEntry('a', 0, 60 * MIN);
    const [e] = await entries();
    await saveEntry({ ...e, end: 90 * MIN });
    expect(await entries()).toHaveLength(1);
  });
});

describe('занятия', () => {
  it('первый запуск — стартовое дерево, один раз', async () => {
    await seedIfEmpty();
    const n = await db.activities.count();
    expect(n).toBeGreaterThan(0);
    await db.activities.clear();
    await seedIfEmpty();
    expect(await db.activities.count()).toBe(0); // удалил всё сам — не пересоздаём
  });

  it('корню назначается тон, ребёнку — нет; перенос в своего потомка запрещён', async () => {
    const work = await addActivity(null, 'Работа');
    const proj = await addActivity(work, 'Проект');
    const w = await db.activities.get(work), p = await db.activities.get(proj);
    expect(w!.hue).toBeTypeOf('number');
    expect(p!.hue).toBeUndefined();
    await moveActivity(work, proj);
    expect((await db.activities.get(work))!.parentId).toBeNull();
    await moveActivity(proj, null);
    expect((await db.activities.get(proj))!.hue).toBeTypeOf('number');
  });

  it('порядок среди соседей', async () => {
    const a = await addActivity(null, 'A');
    const b = await addActivity(null, 'B');
    await reorderActivity(b, -1);
    expect(childrenOf(await db.activities.toArray(), null).map((x) => x.name)).toEqual(['B', 'A']);
    void a;
  });

  it('«Завершить» останавливает идущий таймер в поддереве', async () => {
    const work = await addActivity(null, 'Работа');
    const proj = await addActivity(work, 'Проект');
    await logEntry(proj, Date.now() - 30 * MIN, Date.now() - 20 * MIN);
    await saveEntry({ id: 'run', activityId: proj, start: Date.now() - 10 * MIN, end: null, source: 'timer', updatedAt: 0 });
    await archiveActivity(work);
    expect((await db.entries.get('run'))!.end).not.toBeNull();
    expect((await db.activities.get(work))!.archivedAt).toBeTypeOf('number');
  });

  it('удаление: без записей — удаляется, с записями — завершается', async () => {
    const empty = await addActivity(null, 'Пусто');
    expect(await deleteActivity(empty)).toBe('deleted');
    const used = await addActivity(null, 'Было');
    await logEntry(used, 0, 10 * MIN);
    expect(await deleteActivity(used)).toBe('archived');
    expect(await db.activities.get(used)).toBeDefined();
  });
});

describe('импорт бэкапа', () => {
  it('слияние по id: побеждает более свежий updatedAt', async () => {
    const e: Entry = { id: 'e1', activityId: 'a', start: 0, end: 10 * MIN, source: 'manual', updatedAt: 5 };
    await db.entries.put(e);
    const r = await mergeBackup({
      app: 'eukairo', schemaVersion: 1, exportedAt: '', settings: [], habits: [], habitMarks: [], points: [],
      activities: [{ id: 'a', parentId: null, name: 'A', order: 0, updatedAt: 1 }],
      entries: [{ ...e, end: 20 * MIN, updatedAt: 3 }, { ...e, id: 'e2', start: 30 * MIN, end: 40 * MIN }],
    });
    expect(r.entries).toBe(1); // e1 в бэкапе старее — остаётся наш
    expect((await db.entries.get('e1'))!.end).toBe(10 * MIN);
    expect(await db.entries.get('e2')).toBeDefined();
  });
});

describe('записи без времени', () => {
  it('сохранить, поправить, удалить; занятие с записями не удаляется, а завершается', async () => {
    const a = await addActivity(null, 'Отжимания');
    await savePoint({ id: 'p1', activityId: a, at: 1, values: { reps: 20 } });
    await savePoint({ id: 'p1', activityId: a, at: 1, values: { reps: 25 } });
    expect((await db.points.get('p1'))!.values).toEqual({ reps: 25 });
    expect(await deleteActivity(a)).toBe('archived');
    await deletePoint('p1');
    expect(await db.points.count()).toBe(0);
  });
});
