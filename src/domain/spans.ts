// Записи → промежутки для визуализации, обрезанные по периоду.
import type { Entry } from '../db/schema';
import type { Span } from '../visualizations/types';

export function toSpans(
  entries: Entry[],
  colors: Map<string, string>,
  from: number,
  to: number,
  now: number,
): Span[] {
  const spans: Span[] = [];
  for (const e of entries) {
    const start = Math.max(e.start, from);
    const end = Math.min(e.end ?? now, to); // ?? ≈ ?? в C#: идущая запись тянется до «сейчас»
    if (end > start) {
      spans.push({ entryId: e.id, activityId: e.activityId, color: colors.get(e.activityId) ?? '#888', start, end });
    }
  }
  return spans.sort((a, b) => a.start - b.start);
}
