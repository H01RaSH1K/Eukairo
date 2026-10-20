import { describe, expect, it } from 'vitest';
import { makeCells } from './voronoi';

// Площадь многоугольника (формула шнурования).
const area = (poly: [number, number][]) =>
  Math.abs(poly.reduce((s, p, i) => {
    const q = poly[(i + 1) % poly.length];
    return s + p[0] * q[1] - q[0] * p[1];
  }, 0)) / 2;

describe('makeCells', () => {
  it('стёклышки покрывают весь прямоугольник без дыр и наложений', () => {
    const cells = makeCells(4, 4, 100, 120);
    expect(cells).toHaveLength(16);
    expect(cells.reduce((s, c) => s + area(c.poly), 0)).toBeCloseTo(100 * 120, 3);
  });

  it('первое стёклышко — внизу', () => {
    const cells = makeCells(4, 4, 100, 120);
    expect(cells[0].maxY).toBeCloseTo(120);
    expect(cells[cells.length - 1].minY).toBeCloseTo(0);
  });
});
