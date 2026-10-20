import { describe, expect, it } from 'vitest';
import { getPattern, leadPath, type PatternId } from './patterns';

const area = (poly: [number, number][]) =>
  Math.abs(poly.reduce((s, p, i) => {
    const q = poly[(i + 1) % poly.length];
    return s + p[0] * q[1] - q[0] * p[1];
  }, 0)) / 2;

describe('узоры', () => {
  it.each(['grid', 'glass', 'shards', 'hex', 'spiral', 'tri'] as PatternId[])('%s: сегменты покрывают картину без дыр', (id) => {
    for (const days of [1, 7, 31]) {
      const p = getPattern(id, days);
      expect(p.cells).toHaveLength(days * 24);
      expect([...p.cells, ...(p.decor ?? [])].reduce((s, c) => s + area(c), 0)).toBeCloseTo(p.w * p.h, 1);
    }
  });

  it('роза: кольцо на день', () => {
    expect(getPattern('rose', 7).cells).toHaveLength(168);
  });
});

describe('leadPath', () => {
  it('убирает линию между часами одной записи', () => {
    const { cells } = getPattern('grid');
    const none = leadPath(cells, Array(24).fill(null)).split('M').length;
    const owner = Array(24).fill(null);
    owner[0] = owner[1] = 'e1'; // 0:00 и 1:00 — соседи в сетке
    const merged = leadPath(cells, owner).split('M').length;
    expect(none - merged).toBe(1); // общее ребро больше не рисуется
  });
});
