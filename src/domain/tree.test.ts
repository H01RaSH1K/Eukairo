import { describe, expect, it } from 'vitest';
import type { Activity } from '../db/schema';
import { timerRange } from './tree';

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
