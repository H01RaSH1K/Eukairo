// Узоры деления дня на 24 сегмента (сегмент = час суток).
// Каждый узор отдаёт 24 многоугольника в порядке часов 0…23.
// Соседние по времени часы стараемся делать соседями и на картинке,
// чтобы длинная запись слилась в одну цельную фигуру.
import { rng, voronoi, type Pt } from './voronoi';

export type PatternId = 'grid' | 'glass' | 'rose' | 'tri';

export interface Pattern { w: number; h: number; cells: Pt[][] }

/** Порядок «змейкой»: строка слева направо, следующая справа налево. */
function snake(cols: number, rows: number): [number, number][] {
  const out: [number, number][] = [];
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < cols; i++) out.push([r % 2 === 0 ? i : cols - 1 - i, r]);
  }
  return out;
}

function grid(): Pattern {
  const w = 100, h = 140, cw = w / 4, ch = h / 6;
  const cells = snake(4, 6).map(([c, r]): Pt[] => [
    [c * cw, r * ch], [(c + 1) * cw, r * ch], [(c + 1) * cw, (r + 1) * ch], [c * cw, (r + 1) * ch],
  ]);
  return { w, h, cells };
}

function glass(): Pattern {
  const w = 100, h = 140, cw = w / 4, ch = h / 6;
  const rand = rng(11);
  const seeds = snake(4, 6).map(([c, r]): Pt => [(c + 0.2 + rand() * 0.6) * cw, (r + 0.2 + rand() * 0.6) * ch]);
  return { w, h, cells: voronoi(seeds, w, h, 2.5 * ch) };
}

// Роза-окно: 24 лепестка по кругу, как циферблат; полночь сверху.
function rose(): Pattern {
  const w = 100, h = 100, cx = 50, cy = 50, r0 = 14, r1 = 49;
  const steps = 4; // точек на дугу
  const at = (r: number, a: number): Pt => [cx + r * Math.sin(a), cy - r * Math.cos(a)];
  const cells = Array.from({ length: 24 }, (_, i) => {
    const a0 = (i / 24) * 2 * Math.PI;
    const a1 = ((i + 1) / 24) * 2 * Math.PI;
    const outer: Pt[] = [];
    const inner: Pt[] = [];
    for (let k = 0; k <= steps; k++) {
      const a = a0 + ((a1 - a0) * k) / steps;
      outer.push(at(r1, a));
      inner.unshift(at(r0, a));
    }
    return [...outer, ...inner];
  });
  return { w, h, cells };
}

// Треугольники: 4 ряда по 3 прямоугольника, каждый разрезан по диагонали.
function tri(): Pattern {
  const w = 100, h = 140, cw = w / 3, ch = h / 4;
  const cells: Pt[][] = [];
  for (let r = 0; r < 4; r++) {
    const row: Pt[][] = [];
    for (let c = 0; c < 3; c++) {
      const x0 = c * cw, x1 = x0 + cw, y0 = r * ch, y1 = y0 + ch;
      // Диагональ чередуется, чтобы узор не был однообразным.
      if ((r + c) % 2 === 0) {
        row.push([[x0, y0], [x1, y1], [x0, y1]], [[x0, y0], [x1, y0], [x1, y1]]);
      } else {
        row.push([[x0, y0], [x1, y0], [x0, y1]], [[x1, y0], [x1, y1], [x0, y1]]);
      }
    }
    cells.push(...(r % 2 === 0 ? row : row.reverse()));
  }
  return { w, h, cells };
}

const builders: Record<PatternId, () => Pattern> = { grid, glass, rose, tri };
const cache = new Map<PatternId, Pattern>();

export function getPattern(id: PatternId): Pattern {
  if (!cache.has(id)) cache.set(id, builders[id]());
  return cache.get(id)!;
}

const EPS = 0.01;
const near = (a: Pt, b: Pt) => Math.abs(a[0] - b[0]) < EPS && Math.abs(a[1] - b[1]) < EPS;

/**
 * Свинцовые линии витража: все рёбра, кроме общих рёбер у сегментов
 * одной и той же записи. Так несколько часов одной записи читаются одной фигурой.
 * Возвращает SVG-путь ("M x y L x y …").
 */
export function leadPath(cells: Pt[][], owner: (string | null)[]): string {
  const parts: string[] = [];
  cells.forEach((poly, i) => {
    poly.forEach((p, k) => {
      const q = poly[(k + 1) % poly.length];
      const merged = owner[i] !== null && cells.some((other, j) =>
        j !== i && owner[j] === owner[i] &&
        other.some((a, m) => {
          const b = other[(m + 1) % other.length];
          return (near(a, q) && near(b, p)) || (near(a, p) && near(b, q));
        }));
      if (!merged) parts.push(`M${p[0].toFixed(2)} ${p[1].toFixed(2)}L${q[0].toFixed(2)} ${q[1].toFixed(2)}`);
    });
  });
  return parts.join('');
}
