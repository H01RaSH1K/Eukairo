import { describe, expect, it } from 'vitest';
import type { Entry } from '../db/schema';
import { resolveOverlaps } from './overlaps';

const e = (id: string, start: number, end: number | null): Entry =>
  ({ id, activityId: 'a', start, end, source: 'manual', updatedAt: 0 });

describe('resolveOverlaps', () => {
  it('удаляет накрытую целиком', () => {
    const r = resolveOverlaps([e('x', 20, 30)], 10, 40, 100, () => 'n');
    expect(r.removed).toEqual(['x']);
  });

  it('обрезает с обеих сторон', () => {
    const r = resolveOverlaps([e('l', 0, 15), e('r', 35, 50)], 10, 40, 100, () => 'n');
    expect(r.updated.map((u) => [u.id, u.start, u.end])).toEqual([['l', 0, 10], ['r', 40, 50]]);
  });

  it('делит запись, внутри которой вставили новую', () => {
    const r = resolveOverlaps([e('big', 0, 100)], 40, 60, 200, () => 'tail');
    expect(r.updated[0].end).toBe(40);
    expect(r.added[0]).toMatchObject({ id: 'tail', start: 60, end: 100 });
  });

  it('не трогает соседей встык', () => {
    const r = resolveOverlaps([e('a', 0, 10), e('b', 40, 50)], 10, 40, 100, () => 'n');
    expect(r).toEqual({ removed: [], updated: [], added: [] });
  });
});
