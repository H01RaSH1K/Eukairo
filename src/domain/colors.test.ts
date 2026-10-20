import { describe, expect, it } from 'vitest';
import type { Activity } from '../db/schema';
import { activityColors } from './colors';

const act = (id: string, parentId: string | null, order: number, hue?: number): Activity =>
  ({ id, parentId, name: id, hue, order, updatedAt: 0 });

describe('activityColors', () => {
  it('корень — свой тон, дети — светлее', () => {
    const c = activityColors([act('root', null, 0, 200), act('kid', 'root', 0)]);
    expect(c.get('root')).toBe('hsl(200 65% 55%)');
    expect(c.get('kid')).toBe('hsl(200 57% 64%)');
  });

  it('ручной цвет перебивает авто', () => {
    const root = { ...act('root', null, 0, 10), colorOverride: '#123456' };
    expect(activityColors([root]).get('root')).toBe('#123456');
  });
});
