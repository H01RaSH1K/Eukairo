// Раскладка промежутков для мозаики. Чистые функции, без React.
import type { Span } from '../types';
import { HOUR_MS } from '../../domain/time';

/** Хозяин часа: запись, занявшая больше всего времени в этом часе, если хотя бы полчаса. */
export interface HourOwner { entryId: string; color: string }

export function hourOwners(spans: Span[], dayStart: number, count = 24, minMs = HOUR_MS / 2): (HourOwner | null)[] {
  return Array.from({ length: count }, (_, h) => {
    const a = dayStart + h * HOUR_MS;
    const b = a + HOUR_MS;
    let best: HourOwner | null = null;
    let bestMs = 0;
    for (const s of spans) {
      const ms = Math.min(s.end, b) - Math.max(s.start, a);
      if (ms > bestMs) { bestMs = ms; best = { entryId: s.entryId, color: s.color }; }
    }
    return bestMs >= minMs ? best : null;
  });
}
