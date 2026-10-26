import { describe, expect, it } from 'vitest';
import { nearestClock } from './StartFrom';

describe('nearestClock', () => {
  const now = new Date(2026, 9, 26, 9, 30).getTime();
  const at = (d: number, h: number, m: number) => new Date(2026, 9, d, h, m).getTime();
  it('раньше сейчас — сегодня в прошлом', () => expect(nearestClock('09:00', now)).toBe(at(26, 9, 0)));
  it('позже сейчас — сегодня в будущем', () => expect(nearestClock('10:00', now)).toBe(at(26, 10, 0)));
  it('поздний вечер утром — это вчера', () => expect(nearestClock('23:00', now)).toBe(at(25, 23, 0)));
  it('пусто — null', () => expect(nearestClock('', now)).toBeNull());
});
