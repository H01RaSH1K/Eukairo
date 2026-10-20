import { describe, expect, it } from 'vitest';
import { packBricks } from './layout';

const H = 3_600_000;
const span = (id: string, start: number, end: number) => ({ entryId: id, activityId: id, color: id, start, end });

describe('packBricks', () => {
  it('укладывает 1,5 ч + 1 ч в три кирпича', () => {
    const b = packBricks([span('a', 0, 1.5 * H), span('b', 5 * H, 6 * H)], 0, 24 * H);
    expect(b).toHaveLength(3);
    expect(b[1].parts.map((p) => [p.entryId, p.frac])).toEqual([['a', 0.5], ['b', 0.5]]);
    expect(b[2].fill).toBeCloseTo(0.5);
  });
});
