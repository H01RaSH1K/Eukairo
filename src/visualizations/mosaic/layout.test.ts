import { describe, expect, it } from 'vitest';
import { runKeys, spotPlaces, wholeOwners } from './layout';

const H = 3_600_000;
const span = (id: string, start: number, end: number, activityId = id) => ({ entryId: id, activityId, color: activityId, start, end });
const ids = (o: ({ entryId: string } | null)[]) => o.map((x) => x?.entryId ?? null);

describe('spotPlaces', () => {
  it('каждому занятому часу — своё стекло, пятен несколько', () => {
    const cells = Array.from({ length: 168 }, (_, i): [number, number][] => {
      const x = (i % 12) * 10, y = Math.floor(i / 12) * 10;
      return [[x, y], [x + 10, y], [x + 10, y + 10], [x, y + 10]];
    });
    // 30 записей по 2 часа
    const filled = Array.from({ length: 60 }, (_, i) => ({ entryId: 'e' + Math.floor(i / 2), key: 'e' + Math.floor(i / 2), color: '#fff' }));
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
    const filled = Array.from({ length: 60 }, (_, i) => ({ entryId: 'e' + Math.floor(i / 3), key: 'e' + Math.floor(i / 3), color: '#fff' }));
    const blob = spotPlaces(cells, filled, 7, 1, 'random');
    expect(new Set(blob).size).toBe(60);
    expect(blob).not.toEqual(spotPlaces(cells, filled, 7, 1, 'round'));
  });
});

describe('wholeOwners', () => {
  it('целые часы — целые стёкла, остаток — кусок со своей долей', () => {
    const { owners, rests } = wholeOwners([span('a', 9 * H, 11.5 * H), span('b', 11.5 * H, 13 * H)], 0, 24);
    // b занимает 12-й час целиком — он и достаётся b; половинки a и b — обе про 11-й час
    expect(ids(owners).slice(9, 14)).toEqual(['a', 'a', null, 'b', null]);
    expect(rests.map((r) => [r.owner.entryId, r.frac, r.hour])).toEqual([['a', 0.5, 11], ['b', 0.5, 11]]);
  });

  it('запись короче часа — только кусок, не меньше 10%', () => {
    const { owners, rests } = wholeOwners([span('a', 9.67 * H, 10.33 * H), span('b', 3 * H, 3.05 * H)], 0, 24);
    expect(ids(owners).filter(Boolean)).toHaveLength(0);
    expect(rests.map((r) => r.owner.entryId)).toEqual(['b', 'a']); // по времени
    expect(rests[0].frac).toBe(0.1);
    expect(rests[1].frac).toBeCloseTo(0.66, 2);
  });

  it('у нужды вынимаются только целые часы, остаток не рисуется', () => {
    const { owners, rests } = wholeOwners([{ ...span('s', 0, 8.5 * H), need: true }, span('w', 9 * H, 10 * H)], 0, 24);
    expect(owners.filter((x) => x?.need)).toHaveLength(8);
    expect(rests).toHaveLength(0);
  });
});

describe('runKeys', () => {
  it('записи одного занятия с перерывом меньше получаса — одна серия', () => {
    const k = runKeys([span('a', 0, H, 'w'), span('b', 1.2 * H, 2 * H, 'w'), span('c', 3 * H, 4 * H, 'w'), span('d', 4 * H, 5 * H, 'x')]);
    expect([k.get('a'), k.get('b'), k.get('c'), k.get('d')]).toEqual(['a', 'a', 'c', 'd']);
  });

  it('серия считается вместе: 0.6 + 1.3 часа = одно целое стекло и кусок 0.9', () => {
    const spans = [span('a', 9 * H, 9.6 * H, 'w'), span('b', 9.7 * H, 11 * H, 'w')];
    const { owners, rests } = wholeOwners(spans, 0, 24, runKeys(spans));
    expect(owners.filter(Boolean).map((x) => x?.key)).toEqual(['a']);
    expect(rests).toHaveLength(1);
    expect(rests[0].owner.key).toBe('a');
    expect(rests[0].frac).toBeCloseTo(0.9, 5);
  });
});
