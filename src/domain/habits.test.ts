import { describe, expect, it } from 'vitest';
import type { Activity, Entry, Habit, HabitMark } from '../db/schema';
import { HabitBook, TRACKED, dayKey, dayStartOf, msByDay, scheduleText } from './habits';
import { addLocalDays } from './time';

const MIN = 60_000;
// Среда, 21 октября 2026, 15:00 по местному времени.
const now = new Date(2026, 9, 21, 15).getTime();
const today = dayStartOf('2026-10-21');
const day = (n: number) => addLocalDays(today, n);
const habit = (h: Partial<Habit>): Habit => ({ id: 'h', name: 'H', hue: 0, kind: 'check', order: 0, since: '2026-10-01', updatedAt: 0, ...h });
const mark = (n: number, done = true, values?: Record<string, number>): HabitMark =>
  ({ id: `h:${dayKey(day(n))}`, habitId: 'h', day: dayKey(day(n)), done, values, updatedAt: 0 });
const book = (h: Partial<Habit>, marks: HabitMark[], entries: Entry[] = [], acts: Activity[] = []) =>
  new HabitBook(habit(h), acts, entries, marks, now);

describe('дни', () => {
  it('ключ дня и обратно', () => {
    expect(dayKey(now)).toBe('2026-10-21');
    expect(dayStartOf('2026-10-21')).toBe(new Date(2026, 9, 21).getTime());
  });
  it('расписание словами', () => {
    expect(scheduleText({})).toBe('каждый день');
    expect(scheduleText({ weekdays: [4, 0, 2] })).toBe('пн ср пт');
    expect(scheduleText({ weekdays: [0, 1, 2, 3, 4] })).toBe('по будням');
  });
  it('запись через полночь делится между днями', () => {
    const e: Entry = { id: 'e', activityId: 'a', start: day(0) - 30 * MIN, end: day(0) + 20 * MIN, source: 'timer', updatedAt: 0 };
    const m = msByDay([e], new Set(['a']), now);
    expect(m.get('2026-10-20')).toBe(30 * MIN);
    expect(m.get('2026-10-21')).toBe(20 * MIN);
  });
});

describe('серии', () => {
  it('неотмеченное сегодня серию не рвёт, пропуск вчера — рвёт', () => {
    expect(book({}, [mark(-1), mark(-2), mark(-3)]).streak()).toBe(3);
    expect(book({}, [mark(0), mark(-1), mark(-2)]).streak()).toBe(3);
    expect(book({}, [mark(0), mark(-2)]).streak()).toBe(1);
  });
  it('снятая отметка — не засчитано', () => {
    expect(book({}, [mark(-1, false), mark(-2)]).streak()).toBe(0);
  });
  it('дни не по расписанию пропускаются', () => {
    // сегодня среда (2), пн = -2, пт прошлой недели = -5
    expect(book({ weekdays: [0, 2, 4] }, [mark(-2), mark(-5)]).streak()).toBe(2);
  });
  it('«держусь»: засчитано, пока не отмечен срыв', () => {
    const b = book({ kind: 'quit', since: dayKey(day(-9)) }, [mark(-4)]);
    expect(b.status(day(0)).done).toBe(true);
    expect(b.streak()).toBe(4); // сегодня и три дня до срыва
    expect(b.best()).toBe(5);   // 10 дней с начала, срыв на 6-й
  });
  it('по занятию: засчитано, когда набрано время (с подзанятиями)', () => {
    const acts: Activity[] = [{ id: 'med', parentId: null, name: 'M', order: 0, updatedAt: 0 }, { id: 'kid', parentId: 'med', name: 'K', order: 0, updatedAt: 0 }];
    const e = (n: number, min: number, a = 'med'): Entry => ({ id: `e${n}${a}`, activityId: a, start: day(n) + 8 * 60 * MIN, end: day(n) + (8 * 60 + min) * MIN, source: 'timer', updatedAt: 0 });
    const b = book({ kind: 'time', activityId: 'med', goalMin: 5 }, [mark(-3)], [e(-1, 3), e(-1, 2, 'kid'), e(-2, 10), e(0, 2)], acts);
    expect(b.status(day(0)).progress).toBeCloseTo(0.4);
    expect(b.streak()).toBe(3); // -1 (3+2 мин), -2, -3 (вручную)
    expect(b.values(day(-2))[TRACKED]).toBe(10);
  });
  it('процент — только по прошедшим дням по расписанию', () => {
    const r = book({ since: dayKey(day(-3)) }, [mark(-1), mark(-3)]).rate(day(-10), day(1));
    expect(r).toEqual({ done: 2, due: 3 });
  });
});
