import { describe, expect, it } from 'vitest';
import type { Activity, Habit, HabitMark } from '../db/schema';
import { COUNT, describePoint, mainChoice, matches, migrateHabitParams, parseOptions, sumValues } from './points';
import { parseBackup } from './backup';

const grip = { id: 'grip', name: 'Хват', options: [{ id: 'a', name: 'пальцы' }, { id: 'b', name: 'кулаки' }] };
const p = (reps: number, g: string) => ({ id: String(reps), activityId: 'x', at: 0, values: { reps }, choices: { grip: g }, updatedAt: 0 });

describe('записи без времени', () => {
  it('сумма, число записей, частый вариант, фильтр', () => {
    const ps = [p(20, 'b'), p(15, 'a'), p(10, 'b')];
    expect(sumValues(ps)).toEqual({ reps: 45, [COUNT]: 3 });
    expect(sumValues([])).toEqual({});
    expect(mainChoice(ps, 'grip')).toBe('b');
    expect(ps.filter((x) => matches(x, { grip: ['a'] })).length).toBe(1);
    expect(ps.filter((x) => matches(x, { grip: [] })).length).toBe(3);
  });
  it('подпись записи', () => {
    expect(describePoint(p(20, 'b'), [{ id: 'reps', name: 'Отжимания', unit: 'раз' }, grip])).toBe('20 раз · кулаки');
  });
  it('разбор строки вариантов сохраняет id: по названию, потом по месту', () => {
    let n = 0;
    const make = () => 'new' + n++;
    expect(parseOptions('кулаки, пальцы, ладони', grip.options, make)).toEqual([
      { id: 'b', name: 'кулаки' }, { id: 'a', name: 'пальцы' }, { id: 'new0', name: 'ладони' },
    ]);
    // переименовали «кулаки» → «на кулаках»: id тот же, история не теряется
    expect(parseOptions('пальцы, на кулаках', grip.options, make)).toEqual([{ id: 'a', name: 'пальцы' }, { id: 'b', name: 'на кулаках' }]);
    expect(parseOptions(' , ,', grip.options, make)).toEqual([]);
  });
});

describe('перенос старых параметров привычек', () => {
  const med: Activity = { id: 'med', parentId: null, name: 'Медитация', order: 3, updatedAt: 0 };
  const habits: Habit[] = [
    { id: 'push', name: 'Анжуманя', icon: '💪', hue: 30, kind: 'check', order: 0, since: '2026-10-01', updatedAt: 0, params: [{ id: 'reps', name: 'Отжимания', unit: 'раз' }] },
    { id: 'm', name: 'Медитация', hue: 300, kind: 'time', activityId: 'med', goalMin: 5, order: 1, since: '2026-10-01', updatedAt: 0, params: [{ id: 'calm', name: 'Спокойствие' }] },
    { id: 'teeth', name: 'Зубы', hue: 100, kind: 'check', order: 2, since: '2026-10-01', updatedAt: 0 },
  ];
  const marks: HabitMark[] = [
    { id: 'push:2026-10-20', habitId: 'push', day: '2026-10-20', done: true, values: { reps: 30 }, updatedAt: 0 },
    { id: 'push:2026-10-19', habitId: 'push', day: '2026-10-19', done: true, updatedAt: 0 },
    { id: 'm:2026-10-20', habitId: 'm', day: '2026-10-20', done: false, values: { calm: 7 }, updatedAt: 0 },
    { id: 'teeth:2026-10-20', habitId: 'teeth', day: '2026-10-20', done: true, updatedAt: 0 },
  ];

  it('галочка с параметрами → своё занятие и привычка по записям; числа → записи', () => {
    const m = migrateHabitParams({ activities: [med], habits, habitMarks: marks }, 5);
    const act = m.activities.find((a) => a.id === 'act-push')!;
    expect(act).toMatchObject({ parentId: null, name: 'Анжуманя', hue: 30, order: 4, params: [{ id: 'reps', name: 'Отжимания', unit: 'раз' }] });
    expect(m.habits.find((h) => h.id === 'push')).toMatchObject({ kind: 'points', activityId: 'act-push' });
    expect(m.habits.find((h) => h.id === 'push')!.params).toBeUndefined();
    expect(m.points.filter((x) => x.activityId === 'act-push')).toEqual([
      expect.objectContaining({ id: 'push:2026-10-20:0', values: { reps: 30 } }),
    ]);
    // отметка с числами больше не ручная галочка: день засчитывает запись
    expect(m.habitMarks.find((x) => x.id === 'push:2026-10-20')).toMatchObject({ done: false });
    expect(m.habitMarks.find((x) => x.id === 'push:2026-10-20')!.values).toBeUndefined();
  });
  it('у привычки по времени параметры уходят её занятию; привычки без параметров не трогаются', () => {
    const m = migrateHabitParams({ activities: [med], habits, habitMarks: marks }, 5);
    expect(m.activities.find((a) => a.id === 'med')!.params).toEqual([{ id: 'calm', name: 'Спокойствие' }]);
    expect(m.habits.find((h) => h.id === 'm')).toMatchObject({ kind: 'time', activityId: 'med' });
    expect(m.points.find((x) => x.activityId === 'med')).toBeUndefined(); // отметка снята — записи нет
    expect(m.habits.find((h) => h.id === 'teeth')).toBeUndefined();
  });
  it('старый бэкап поднимается в новый формат, повторный разбор даёт те же id', () => {
    const text = JSON.stringify({ app: 'eukairo', schemaVersion: 2, exportedAt: '', settings: [], entries: [], activities: [med], habits, habitMarks: marks });
    const b1 = parseBackup(text), b2 = parseBackup(text);
    expect(b1.activities.map((a) => a.id).sort()).toEqual(['act-push', 'med']);
    expect(b1.points.map((x) => x.id)).toEqual(b2.points.map((x) => x.id));
    expect(b1.habits.find((h) => h.id === 'push')!.kind).toBe('points');
  });
});
