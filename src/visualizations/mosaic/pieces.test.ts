import { describe, expect, it } from 'vitest';
import { cutPieces, stitch } from './pieces';
import { area, type Pt } from './voronoi';
import { getPattern, leadPath } from './patterns';

// Сетка n × m квадратов 10 × 10, по строкам.
const grid = (n: number, m: number) => Array.from({ length: n * m }, (_, i): Pt[] => {
  const x = (i % n) * 10, y = Math.floor(i / n) * 10;
  return [[x, y], [x + 10, y], [x + 10, y + 10], [x, y + 10]];
});
const own = (key: string) => ({ entryId: key, key, color: key });
const sumBy = (ps: ReturnType<typeof cutPieces>, key: string) => ps.filter((p) => p.owner?.key === key).reduce((s, p) => s + area(p.poly), 0);

describe('cutPieces', () => {
  it('тонкое стекло: остаток берёт целое свежее стекло рядом со своим часом, доля — в frac', () => {
    const cells = grid(4, 1);
    const ps = cutPieces(cells, [own('a'), null, null, null], [{ owner: own('a'), frac: 0.5, anchor: 1 }, { owner: own('b'), frac: 0.25, anchor: 1 }], 4, [], 'thin');
    const a = ps.find((p) => p.owner?.key === 'a' && p.frac !== undefined)!;
    const b = ps.find((p) => p.owner?.key === 'b')!;
    expect(a.cell).toBe(1);
    expect(a.poly).toBe(cells[1]); // стекло не режется
    expect(a.frac).toBe(0.5);
    expect(b.cell).toBe(2);        // занятое стекло второй раз не берётся
    expect(ps.filter((p) => !p.owner).map((p) => p.cell)).toEqual([3]);
  });

  it('тонкое стекло: свежих стёкол нет — остаток не рисуется', () => {
    const cells = grid(2, 1);
    const ps = cutPieces(cells, [own('a'), own('a')], [{ owner: own('b'), frac: 0.5, anchor: 0 }], 2, [], 'thin');
    expect(ps.some((p) => p.owner?.key === 'b')).toBe(false);
  });

  it('уровень: стекло налито снизу горизонталью, следующий кусок — слоем выше', () => {
    const cells = grid(1, 1);
    const ps = cutPieces(cells, [null], [{ owner: own('a'), frac: 0.3, anchor: 0 }, { owner: own('b'), frac: 0.2, anchor: 0 }]);
    const ys = (k: string) => ps.find((p) => p.owner?.key === k)!.poly.map((p) => p[1]);
    expect(Math.max(...ys('a'))).toBeCloseTo(10, 6);
    expect(Math.min(...ys('a'))).toBeCloseTo(7, 3);
    expect(Math.min(...ys('b'))).toBeCloseTo(5, 3);
  });

  it('клин: мелкий кусок компактный, а не длинная полоска', () => {
    const cells = grid(1, 1);
    const ps = cutPieces(cells, [null], [{ owner: own('a'), frac: 0.15, anchor: 0 }], 1, [], 'wedge');
    const piece = ps.find((p) => p.owner)!;
    const xs = piece.poly.map((p) => p[0]), ys = piece.poly.map((p) => p[1]);
    const [w, h] = [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
    expect(area(piece.poly)).toBeCloseTo(15, 3);
    expect(Math.max(w, h) / Math.min(w, h)).toBeLessThan(4); // прямая дала бы 10 × 1.5
  });

  it('площадь записи = её время, кусок прилегает к своим стёклам', () => {
    const cells = grid(4, 1);
    const whole = [own('a'), null, null, null];
    const ps = cutPieces(cells, whole, [{ owner: own('a'), frac: 0.5, anchor: 1 }]);
    expect(sumBy(ps, 'a')).toBeCloseTo(150, 3);
    const piece = ps.find((p) => p.owner && p.cell === 1)!;
    // кусок растёт от края, обращённого к стеклу 0 (x = 10), и одним куском
    expect(ps.filter((p) => p.owner && p.cell === 1)).toHaveLength(1);
    expect(Math.min(...piece.poly.map((p) => p[0]))).toBeCloseTo(10, 3);
    expect(ps.reduce((s, p) => s + area(p.poly), 0)).toBeCloseTo(400, 3); // без дыр и наложений
  });

  it('остаток берёт объедок, если влезает', () => {
    const cells = grid(2, 1);
    const ps = cutPieces(cells, [null, null], [{ owner: own('a'), frac: 0.6, anchor: 0 }, { owner: own('b'), frac: 0.3, anchor: 0 }]);
    expect(ps.filter((p) => p.owner).every((p) => p.cell === 0)).toBe(true);
    expect(sumBy(ps, 'b')).toBeCloseTo(30, 3);
  });

  it('свежих стёкол нет — остаток собирается из нескольких объедков', () => {
    // 3 стекла, 3 записи по 40 минут, потом ещё одна на 40: 2 ч = площадь 2 стёкол
    const cells = grid(3, 1);
    const cuts = ['a', 'b', 'c', 'd'].map((k, i) => ({ owner: own(k), frac: 2 / 3, anchor: Math.min(i, 2) }));
    const ps = cutPieces(cells, [null, null, null], cuts);
    for (const k of ['a', 'b', 'c', 'd']) expect(sumBy(ps, k)).toBeCloseTo(200 / 3, 2);
    expect(ps.filter((p) => p.owner?.key === 'd').length).toBeGreaterThan(1);
  });

  it('прежние куски не двигаются от новой записи', () => {
    const cells = grid(4, 2);
    const first = [{ owner: own('a'), frac: 0.4, anchor: 2 }];
    const a1 = cutPieces(cells, cells.map(() => null), first).find((p) => p.owner)!;
    const a2 = cutPieces(cells, cells.map(() => null), [...first, { owner: own('b'), frac: 0.5, anchor: 3 }]).find((p) => p.owner?.key === 'a')!;
    expect(a2.poly).toEqual(a1.poly);
  });

  it('шов между стеклом и куском одной серии тонкий, а не свинец', () => {
    const cells = grid(2, 2);
    const ps = cutPieces(cells, [own('a'), null, null, null], [{ owner: own('a'), frac: 0.5, anchor: 1 }]);
    const extra = ps.filter((p) => p.poly !== cells[p.cell]).flatMap((p) => p.poly);
    const polys = stitch(ps.map((p) => p.poly), extra);
    const { seam } = leadPath(polys, ps.map((p) => p.owner?.key ?? null));
    expect(seam.split('M').length - 1).toBeGreaterThanOrEqual(1); // общее ребро по x = 10 — шов, не свинец
  });

  it('плотная укладка: остатки группы доливают начатое стекло, неполное — одно', () => {
    const cells = grid(4, 1);
    const cuts = ['a', 'b', 'c'].map((k, i) => ({ owner: own(k), frac: 0.7, anchor: i, group: 0 }));
    const ps = cutPieces(cells, [null, null, null, null], cuts, 4, [{ queue: [0, 1, 2], center: [0, 5] }]);
    for (const k of ['a', 'b', 'c']) expect(sumBy(ps, k)).toBeCloseTo(70, 3);
    // 2.1 стекла: стёкла 0 и 1 полные, 2 — на 10%, 3 не тронуто
    const empty = ps.filter((p) => !p.owner);
    expect(empty.map((p) => p.cell)).toEqual([2, 3]);
    expect(area(empty[0].poly)).toBeCloseTo(90, 3);
  });

  it('кусок всегда одним целым, и площадь точная — на настоящих стёклах', () => {
    const { cells } = getPattern('glass', 1, 3, 0.6);
    for (let i = 0; i < cells.length; i++) for (const frac of [0.1, 0.3, 0.5, 0.75, 0.95]) {
      const whole = cells.map(() => null);
      const ps = cutPieces(cells, whole, [{ owner: own('a'), frac, anchor: i }, { owner: own('b'), frac: (1 - frac) / 2, anchor: i }]);
      for (const k of ['a', 'b']) {
        const mine = ps.filter((p) => p.owner?.key === k);
        expect(mine).toHaveLength(1);
        expect(area(mine[0].poly) / area(cells[mine[0].cell])).toBeCloseTo(k === 'a' ? frac : Math.max(0, (1 - frac) / 2), 3);
      }
    }
  });
});
