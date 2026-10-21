import { describe, expect, it } from 'vitest';
import { exactOwners, hourOwners, runKeys, spotPlaces } from './layout';

const H = 3_600_000;
const span = (id: string, start: number, end: number, activityId = id) => ({ entryId: id, activityId, color: activityId, start, end });
const ids = (o: ({ entryId: string } | null)[]) => o.map((x) => x?.entryId ?? null);

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

describe('hourOwners и нужды', () => {
  it('у часа нужды хозяин помечен need — мозаика его вынимает', () => {
    const o = hourOwners([{ ...span('s', 0, 8 * H), need: true }, span('w', 8 * H, 10 * H)], 0, 24);
    expect(o.filter((x) => !x?.need)).toHaveLength(16);
  });
});

describe('exactOwners', () => {
  it('минуты не теряются: запись через границу часа всё равно получает стекло', () => {
    // 9:40–10:20 — по порогу не досталось бы ни одного часа
    expect(ids(hourOwners([span('a', 9.67 * H, 10.33 * H)], 0, 24)).filter(Boolean)).toHaveLength(0);
    expect(ids(exactOwners([span('a', 9.67 * H, 10.33 * H)], 0, 24)).filter(Boolean)).toEqual(['a']);
  });

  it('три дела по 20 минут = одно стекло', () => {
    const o = exactOwners([span('a', 1 * H, 1.33 * H), span('b', 3 * H, 3.33 * H), span('c', 5 * H, 5.34 * H)], 0, 24);
    expect(ids(o).filter(Boolean)).toEqual(['c']);
  });

  it('цветных стёкол = набранных часов, и каждая запись стоит в своих часах', () => {
    const o = exactOwners([span('a', 9 * H, 11.5 * H), span('b', 11.5 * H, 13 * H)], 0, 24);
    expect(ids(o).slice(9, 14)).toEqual(['a', 'a', 'a', 'b', null]);
  });

  it('не хватило своих часов — берёт соседний свободный, а не будущий', () => {
    // a и c заняли часы 10 и 11; d (0.7 ч) почти весь в 12-м — туда и встаёт
    const o2 = exactOwners([span('a', 10 * H, 10.9 * H), span('b', 10.9 * H, 11 * H), span('c', 11 * H, 11.9 * H), span('d', 11.9 * H, 12.6 * H)], 0, 24);
    expect(ids(o2).filter(Boolean)).toHaveLength(3);
    expect(o2.findIndex((x) => x?.entryId === 'd')).toBe(12);
  });
});

describe('runKeys', () => {
  it('записи одного занятия с перерывом меньше получаса — одна серия', () => {
    const k = runKeys([span('a', 0, H, 'w'), span('b', 1.2 * H, 2 * H, 'w'), span('c', 3 * H, 4 * H, 'w'), span('d', 4 * H, 5 * H, 'x')]);
    expect([k.get('a'), k.get('b'), k.get('c'), k.get('d')]).toEqual(['a', 'a', 'c', 'd']);
  });

  it('серия сливается в одну фигуру и в «точном» подсчёте', () => {
    const spans = [span('a', 9 * H, 9.6 * H, 'w'), span('b', 9.7 * H, 11 * H, 'w')];
    const o = exactOwners(spans, 0, 24, runKeys(spans));
    expect(o.slice(9, 11).map((x) => x?.key)).toEqual(['a', 'a']);
    expect(o.slice(9, 11).map((x) => x?.entryId)).toEqual(['a', 'b']);
  });
});
