// Записи → промежутки для визуализации, обрезанные по периоду.
import type { Activity, Entry } from '../db/schema';
import type { Span } from '../visualizations/types';

export function toSpans(
  entries: Entry[],
  colors: Map<string, string>,
  from: number,
  to: number,
  now: number,
  needs: Set<string> = new Set(), // занятия-нужды (см. needIds в tree.ts)
  parents?: Map<string, Span['parents']>, // предки каждого занятия (см. parentsMap)
): Span[] {
  const spans: Span[] = [];
  for (const e of entries) {
    const start = Math.max(e.start, from);
    const end = Math.min(e.end ?? now, to); // ?? ≈ ?? в C#: идущая запись тянется до «сейчас»
    if (end > start) {
      spans.push({ entryId: e.id, activityId: e.activityId, color: colors.get(e.activityId) ?? '#888', start, end, need: needs.has(e.activityId) || undefined, parents: parents?.get(e.activityId) });
    }
  }
  return spans.sort((a, b) => a.start - b.start);
}

/** Предки каждого занятия с их цветами, от ближайшего к корню: Код → [Eukairo, Работа]. */
export function parentsMap(all: Activity[], colors: Map<string, string>): Map<string, Span['parents']> {
  const byId = new Map(all.map((a) => [a.id, a]));
  const out = new Map<string, Span['parents']>();
  for (const a of all) {
    const list: { id: string; color: string }[] = [];
    for (let p = a.parentId ? byId.get(a.parentId) : undefined; p; p = p.parentId ? byId.get(p.parentId) : undefined) {
      list.push({ id: p.id, color: colors.get(p.id) ?? '#888' });
    }
    out.set(a.id, list);
  }
  return out;
}

/** Полезное время: всё, кроме нужд. */
export const usefulMs = (spans: Span[]) => spans.reduce((sum, s) => sum + (s.need ? 0 : s.end - s.start), 0);

