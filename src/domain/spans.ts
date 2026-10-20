// Записи → промежутки для визуализации, обрезанные по периоду.
import type { Entry } from '../db/schema';
import type { Span } from '../visualizations/types';

export function toSpans(
  entries: Entry[],
  colors: Map<string, string>,
  from: number,
  to: number,
  now: number,
  needs: Set<string> = new Set(), // занятия-нужды (см. needIds в tree.ts)
): Span[] {
  const spans: Span[] = [];
  for (const e of entries) {
    const start = Math.max(e.start, from);
    const end = Math.min(e.end ?? now, to); // ?? ≈ ?? в C#: идущая запись тянется до «сейчас»
    if (end > start) {
      spans.push({ entryId: e.id, activityId: e.activityId, color: colors.get(e.activityId) ?? '#888', start, end, need: needs.has(e.activityId) || undefined });
    }
  }
  return spans.sort((a, b) => a.start - b.start);
}

/** Полезное время: всё, кроме нужд. */
export const usefulMs = (spans: Span[]) => spans.reduce((sum, s) => sum + (s.need ? 0 : s.end - s.start), 0);

