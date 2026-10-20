// Пересечения при ручном вводе. Записи не должны перекрываться:
// новая/исправленная запись побеждает, соседние обрезаются, делятся или удаляются.
import type { Entry } from '../db/schema';

export interface OverlapResult {
  removed: string[];   // целиком накрытые записи
  updated: Entry[];    // обрезанные
  added: Entry[];      // хвосты разделённых записей
}

/** Записи из `others`, которые пересекаются с [start, end). */
export function findOverlaps(others: Entry[], start: number, end: number, now: number): Entry[] {
  return others.filter((o) => o.start < end && (o.end ?? now) > start);
}

export function resolveOverlaps(
  others: Entry[],
  start: number,
  end: number,
  now: number,
  newId: () => string,
): OverlapResult {
  const res: OverlapResult = { removed: [], updated: [], added: [] };
  for (const o of findOverlaps(others, start, end, now)) {
    const oEnd = o.end ?? now;
    if (o.start >= start && oEnd <= end) {
      res.removed.push(o.id);
    } else if (o.start < start && oEnd > end) {
      // Новая запись внутри старой — режем старую на две.
      // { ...o, x } ≈ o with { x } у record в C#.
      res.updated.push({ ...o, end: start, updatedAt: now });
      res.added.push({ ...o, id: newId(), start: end, updatedAt: now });
    } else if (o.start < start) {
      res.updated.push({ ...o, end: start, updatedAt: now });
    } else {
      res.updated.push({ ...o, start: end, updatedAt: now });
    }
  }
  return res;
}
