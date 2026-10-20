import { describe, expect, it } from 'vitest';
import { formatDuration, periodRange, startOfLocalDay, startOfNextLocalDay } from './time';

// describe/it ≈ [TestFixture]/[Test] в NUnit.
describe('startOfLocalDay', () => {
  it('отбрасывает часы, минуты и секунды', () => {
    const t = new Date(2026, 9, 20, 15, 42, 7).getTime();
    expect(startOfLocalDay(t)).toBe(new Date(2026, 9, 20).getTime());
  });

  it('полночь остаётся полночью', () => {
    const midnight = new Date(2026, 9, 20).getTime();
    expect(startOfLocalDay(midnight)).toBe(midnight);
  });
});

describe('startOfNextLocalDay', () => {
  it('даёт полночь следующего дня', () => {
    const t = new Date(2026, 9, 20, 23, 59).getTime();
    expect(startOfNextLocalDay(t)).toBe(new Date(2026, 9, 21).getTime());
  });

  it('переходит через конец месяца', () => {
    const t = new Date(2026, 9, 31, 12).getTime();
    expect(startOfNextLocalDay(t)).toBe(new Date(2026, 10, 1).getTime());
  });
});

describe('periodRange', () => {
  it('неделя начинается в понедельник', () => {
    const sunday = new Date(2026, 9, 25, 18).getTime();
    const { from, to } = periodRange('week', sunday);
    expect(from).toBe(new Date(2026, 9, 19).getTime());
    expect(to).toBe(new Date(2026, 9, 26).getTime());
  });

  it('месяц — с первого числа до первого числа следующего', () => {
    const { from, to } = periodRange('month', new Date(2026, 11, 15).getTime());
    expect(from).toBe(new Date(2026, 11, 1).getTime());
    expect(to).toBe(new Date(2027, 0, 1).getTime());
  });
});

describe('formatDuration', () => {
  it('часы и минуты', () => {
    expect(formatDuration(45 * 60_000)).toBe('45 мин');
    expect(formatDuration(3 * 3_600_000)).toBe('3 ч');
    expect(formatDuration(2 * 3_600_000 + 5 * 60_000)).toBe('2 ч 05 мин');
  });
});
