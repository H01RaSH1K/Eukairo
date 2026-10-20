// Раскладка промежутков для мозаики. Чистые функции, без React.
import type { Span } from '../types';
import { HOUR_MS } from '../../domain/time';

/** Кусок промежутка внутри окна [wStart, wEnd): a, b — доли окна 0…1. */
export interface Piece { entryId: string; color: string; a: number; b: number }

export function piecesIn(spans: Span[], wStart: number, wEnd: number): Piece[] {
  const len = wEnd - wStart;
  const out: Piece[] = [];
  for (const s of spans) {
    const a = Math.max(s.start, wStart);
    const b = Math.min(s.end, wEnd);
    if (b > a) out.push({ entryId: s.entryId, color: s.color, a: (a - wStart) / len, b: (b - wStart) / len });
  }
  return out;
}

/** Плотная укладка: всё время подряд, без пустот, кирпичами по часу. */
export interface Brick { parts: { entryId: string; color: string; frac: number }[]; fill: number }

export function packBricks(spans: Span[], from: number, to: number, unit = HOUR_MS): Brick[] {
  const bricks: Brick[] = [];
  let cur: Brick = { parts: [], fill: 0 };
  for (const s of spans) {
    let left = Math.min(s.end, to) - Math.max(s.start, from);
    while (left > 0) {
      const take = Math.min(left, (1 - cur.fill) * unit);
      cur.parts.push({ entryId: s.entryId, color: s.color, frac: take / unit });
      cur.fill += take / unit;
      left -= take;
      if (cur.fill >= 0.9999) {
        bricks.push(cur);
        cur = { parts: [], fill: 0 };
      }
    }
  }
  if (cur.parts.length) bricks.push(cur);
  return bricks;
}
