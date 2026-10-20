import { describe, expect, it } from 'vitest';
import { startOfLocalDay, startOfNextLocalDay } from './time';

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
