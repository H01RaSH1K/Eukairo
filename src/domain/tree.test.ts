import { describe, expect, it } from 'vitest';
import type { Activity, Entry } from '../db/schema';
import { canTrack, isNeed, isTimeless, needIds, timerRange } from './tree';
import { defaultActivity, quickActivities } from './quick';

const a = (id: string, parentId: string | null, extra: Partial<Activity> = {}): Activity =>
  ({ id, parentId, name: id, order: 0, updatedAt: 0, ...extra });

describe('timerRange', () => {
  const tree = [a('work', null, { timerMinMin: 25, timerMaxMin: 240 }), a('code', 'work'), a('calls', 'work', { timerMaxMin: 60 }), a('dog', null)];
  it('своё значение, иначе у предка, иначе 15…120', () => {
    expect(timerRange(tree, 'work')).toEqual([25, 240]);
    expect(timerRange(tree, 'code')).toEqual([25, 240]);
    expect(timerRange(tree, 'calls')).toEqual([25, 60]);
    expect(timerRange(tree, 'dog')).toEqual([15, 120]);
  });
});

describe('нужды', () => {
  const tree = [a('sleep', null, { need: true }), a('nap', 'sleep'), a('work', null), a('lunch', 'work', { need: true })];
  it('флаг наследуется детьми', () => {
    expect(isNeed(tree, 'nap')).toBe(true);
    expect(isNeed(tree, 'work')).toBe(false);
    expect([...needIds(tree)].sort()).toEqual(['lunch', 'nap', 'sleep']);
  });
});

describe('без времени', () => {
  const tree = [a('sport', null, { order: 0 }), a('push', 'sport', { timeless: true }), a('body', null, { timeless: true, order: 1 }),
    a('weight', 'body'), a('code', null, { order: 2 })];
  it('флаг наследуется, таких занятий нет в таймере', () => {
    expect(isTimeless(tree, 'weight')).toBe(true);
    expect(canTrack(tree, 'sport')).toBe(true);
    expect(canTrack(tree, 'push')).toBe(false);
    const entries: Entry[] = [{ id: 'e', activityId: 'push', start: 0, end: 1, source: 'manual', updatedAt: 0 }];
    expect(quickActivities(tree, entries, 1)).toEqual(['sport', 'code']);
    expect(defaultActivity([tree[2], tree[3], tree[4]], entries)).toBe('code');
  });
});
