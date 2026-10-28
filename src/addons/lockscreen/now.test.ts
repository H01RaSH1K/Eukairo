import { describe, expect, it } from 'vitest';
import type { Activity, Entry } from '../../db/schema';
import { buildNow, nowSig } from './now';

const act = (id: string, parentId: string | null, name: string, extra: Partial<Activity> = {}): Activity =>
  ({ id, parentId, name, order: 0, updatedAt: 0, ...extra });
const entry = (id: string, activityId: string, start: number, end: number | null, extra: Partial<Entry> = {}): Entry =>
  ({ id, activityId, start, end, source: 'timer', updatedAt: 0, ...extra });

const H = 3_600_000;
const day = new Date(2026, 9, 28).getTime(); // местная полночь
const now = day + 15 * H;

const acts = [
  act('work', null, 'Работа', { icon: '💼' }),
  act('code', 'work', 'Код'),
  act('sleep', null, 'Сон', { need: true }),
];

describe('выжимка для экрана блокировки', () => {
  it('считает полезное за сегодня без нужд и вчерашней части', () => {
    const entries = [
      entry('a', 'code', day - H, day + H),         // через полночь — в счёт только 1 ч
      entry('b', 'sleep', day + H, day + 8 * H),    // нужда
      entry('c', 'work', day + 9 * H, day + 11 * H),
    ];
    const n = buildNow(acts, entries, null, now);
    expect(n.doneMs).toBe(3 * H);
    expect(n.day).toBe('2026-10-28');
    expect(n.run).toBeNull();
  });

  it('описывает идущий таймер: путь, значок предка, плановый конец', () => {
    const run = entry('r', 'code', now - H / 2, null, { plannedMs: H });
    const n = buildNow(acts, [run], run, now);
    expect(n.doneMs).toBe(0); // идущая запись в doneMs не входит — виджет досчитывает её сам
    expect(n.run).toEqual({ name: 'Код', path: 'Работа', icon: '💼', start: now - H / 2, end: now + H / 2, need: false });
  });

  it('отпечаток не зависит от момента записи', () => {
    expect(nowSig(buildNow(acts, [], null, now))).toBe(nowSig(buildNow(acts, [], null, now + 1000)));
  });
});
