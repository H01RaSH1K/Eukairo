import { describe, expect, it } from 'vitest';
import { visualizations } from '../visualizations/registry';
import { withDefaults } from '../visualizations/types';

describe('настройки стилей', () => {
  it('у каждой настройки умолчание из её же вариантов или диапазона', () => {
    for (const v of visualizations) for (const d of v.settings) {
      if (d.kind === 'choice') expect(d.options.map((o) => o.id)).toContain(d.default);
      if (d.kind === 'range') expect(d.default).toBeGreaterThanOrEqual(d.min);
    }
  });

  it('сохранённое значение важнее умолчания, недостающие подставляются', () => {
    const defs = visualizations[0].settings;
    const v = withDefaults(defs, { fill: 'spots' });
    expect(v.fill).toBe('spots');
    expect(v.spots).toBe(5);
    expect(v.wobble).toBe(60);
  });
});
