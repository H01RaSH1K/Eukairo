import { describe, expect, it } from 'vitest';
import { hourOwners } from './layout';

const H = 3_600_000;
const span = (id: string, start: number, end: number) => ({ entryId: id, activityId: id, color: id, start, end });

describe('hourOwners', () => {
  it('час достаётся записи, занявшей большую часть, и только если ≥ 30 мин', () => {
    const o = hourOwners([span('a', 0, 0.4 * H), span('b', 0.4 * H, 1.3 * H)], 0, 3);
    expect(o.map((x) => x?.entryId ?? null)).toEqual(['b', null, null]);
  });
});
