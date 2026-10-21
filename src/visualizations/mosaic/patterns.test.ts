import { describe, expect, it } from 'vitest';
import { getPattern, leadPath, seedFor, type FillId, type PatternId } from './patterns';

const area = (poly: [number, number][]) =>
  Math.abs(poly.reduce((s, p, i) => {
    const q = poly[(i + 1) % poly.length];
    return s + p[0] * q[1] - q[0] * p[1];
  }, 0)) / 2;

describe('узоры', () => {
  it.each(['grid', 'glass', 'tri'] as PatternId[])('%s: сегменты покрывают картину без дыр', (id) => {
    // seed 0…3 — все четыре нарезки витража
    for (const [days, seed] of [[1, 0], [1, 1], [1, 2], [1, 3], [7, 2], [31, 3]]) {
      const p = getPattern(id, days, seed, 0.6);
      expect(p.cells).toHaveLength(days * 24);
      expect([...p.cells, ...(p.decor ?? [])].reduce((s, c) => s + area(c), 0)).toBeCloseTo(p.w * p.h, 1);
    }
  });

  it.each(['rows', 'calendar', 'jar'] as FillId[])('заливка %s: часы и декор покрывают картину', (fill) => {
    for (const id of ['grid', 'glass'] as PatternId[]) {
      for (const [days, seed, wd] of [[7, 0, 0], [7, 2, 0], [31, 1, 3], [30, 3, 6], [28, 0, 0]]) {
        const p = getPattern(id, days, seed, 0.85, fill, wd);
        expect(p.cells).toHaveLength(days * 24);
        expect([...p.cells, ...(p.decor ?? [])].reduce((s, c) => s + area(c), 0)).toBeCloseTo(p.w * p.h, 1);
      }
    }
  });

  it('календарь: месяц с четверга — 3 пустых дня в начале', () => {
    const p = getPattern('grid', 31, 0, 0.85, 'calendar', 3);
    expect(p.decor!.length % 24).toBe(0);
    expect(p.decor!.length / 24).toBe(4); // 5 недель × 7 − 31
    expect(p.day![0]).toBe(0);
    expect(p.day!.at(-1)).toBe(30);
  });

  it('нужды: у дня меньше стёкол, картина всё равно без дыр', () => {
    for (const id of ['grid', 'glass', 'tri', 'rose'] as PatternId[]) {
      for (const fill of ['flow', 'rows', 'calendar', 'jar'] as FillId[]) {
        for (const counts of [[16], [13], [1], [0], [16, 14, 24, 0, 9, 17, 15]]) {
          for (const seed of [0, 1, 2, 3]) {
            const p = getPattern(id, counts, seed, 0.62, fill);
            const n = counts.reduce((a, b) => a + b, 0);
            expect(p.cells).toHaveLength(n);
            if (id !== 'rose') expect([...p.cells, ...(p.decor ?? [])].reduce((s, c) => s + area(c), 0)).toBeCloseTo(p.w * p.h, 1);
            if (p.day) expect(p.day).toHaveLength(n);
          }
        }
      }
    }
  });

  it('роза: кольцо на день', () => {
    expect(getPattern('rose', 7).cells).toHaveLength(168);
  });
});

describe('seedFor', () => {
  it('один день — одна нарезка, соседние дни — разные', () => {
    const a = seedFor(new Date(2026, 9, 20, 0).getTime());
    expect(seedFor(new Date(2026, 9, 20, 15).getTime())).toBe(a);
    expect(seedFor(new Date(2026, 9, 21).getTime())).not.toBe(a);
  });
});

describe('leadPath', () => {
  it('убирает линию между часами одной записи', () => {
    const { cells } = getPattern('grid', 1, 0, 4 / 6); // сетка 4 × 6
    const none = leadPath(cells, Array(24).fill(null)).split('M').length;
    const owner = Array(24).fill(null);
    owner[0] = owner[1] = 'e1'; // 0:00 и 1:00 — соседи в сетке
    const merged = leadPath(cells, owner).split('M').length;
    expect(none - merged).toBe(1); // общее ребро больше не рисуется
  });
});

describe('одинаковые стёкла', () => {
  it('выравнивание сводит размеры почти к одному и не оставляет дыр', () => {
    for (const fill of ['flow', 'calendar', 'rows'] as FillId[]) {
      for (const cut of [0, 1, 2]) {
        const counts = [16, 15, 17, 24, 16, 16, 14]; // неделя с нуждами: дни разной длины
        const raw = getPattern('glass', counts, 5, 0.62, fill, 0, cut, 0);
        const even = getPattern('glass', counts, 5, 0.62, fill, 0, cut, 30);
        const spread = (p: typeof raw) => {
          const a = p.cells.map(area), m = a.reduce((x, y) => x + y, 0) / a.length;
          return Math.max(...a.map((x) => Math.abs(x / m - 1)));
        };
        expect(spread(even)).toBeLessThan(0.5);
        expect(spread(even)).toBeLessThan(spread(raw));
        expect([...even.cells, ...(even.decor ?? [])].reduce((s, c) => s + area(c), 0)).toBeCloseTo(even.w * even.h, 1);
      }
    }
  });
});
