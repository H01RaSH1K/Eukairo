import { describe, expect, it } from 'vitest';
import { hourOwners, spotPlaces } from './layout';

const H = 3_600_000;
const span = (id: string, start: number, end: number) => ({ entryId: id, activityId: id, color: id, start, end });

describe('hourOwners', () => {
  it('час достаётся записи, занявшей большую часть, и только если ≥ 30 мин', () => {
    const o = hourOwners([span('a', 0, 0.4 * H), span('b', 0.4 * H, 1.3 * H)], 0, 3);
    expect(o.map((x) => x?.entryId ?? null)).toEqual(['b', null, null]);
  });
});

describe('spotPlaces', () => {
  it('каждому занятому часу — своё стекло, пятен несколько', () => {
    const cells = Array.from({ length: 168 }, (_, i): [number, number][] => {
      const x = (i % 12) * 10, y = Math.floor(i / 12) * 10;
      return [[x, y], [x + 10, y], [x + 10, y + 10], [x, y + 10]];
    });
    // 30 записей по 2 часа
    const filled = Array.from({ length: 60 }, (_, i) => ({ entryId: 'e' + Math.floor(i / 2), color: '#fff' }));
    const places = spotPlaces(cells, filled, 42, 4);
    expect(new Set(places).size).toBe(60);
    // два часа одной записи — соседи по сетке (расстояние между центрами 10)
    const near = filled.filter((_, i) => i % 2 === 0).filter((_, k) => {
      const a = places[2 * k], b = places[2 * k + 1];
      return Math.abs((a % 12) - (b % 12)) + Math.abs(Math.floor(a / 12) - Math.floor(b / 12)) === 1;
    }).length;
    expect(near).toBeGreaterThan(25);
  });
});

describe('spotPlaces «неровно»', () => {
  it('часы на своих местах и форма отличается от круга', () => {
    const cells = Array.from({ length: 400 }, (_, i): [number, number][] => {
      const x = (i % 20) * 10, y = Math.floor(i / 20) * 10;
      return [[x, y], [x + 10, y], [x + 10, y + 10], [x, y + 10]];
    });
    const filled = Array.from({ length: 60 }, (_, i) => ({ entryId: 'e' + Math.floor(i / 3), color: '#fff' }));
    const blob = spotPlaces(cells, filled, 7, 1, 'random');
    expect(new Set(blob).size).toBe(60);
    expect(blob).not.toEqual(spotPlaces(cells, filled, 7, 1, 'round'));
  });
});

describe('hourOwners и нужды', () => {
  it('у часа нужды хозяин помечен need — мозаика его вынимает', () => {
    const o = hourOwners([{ ...span('s', 0, 8 * H), need: true }, span('w', 8 * H, 10 * H)], 0, 24);
    expect(o.filter((x) => !x?.need)).toHaveLength(16);
  });
});
