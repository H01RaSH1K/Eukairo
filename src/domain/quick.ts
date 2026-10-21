// Какие занятия показывать первыми: частые за 2 недели, а если истории мало —
// добиваем корнями дерева по порядку. Завершённые и «без времени» не предлагаем.
import type { Activity, Entry } from '../db/schema';
import { canTrack, childrenOf } from './tree';

export function quickActivities(activities: Activity[], entries: Entry[], now: number, n = 6): string[] {
  const count = new Map<string, number>();
  for (const e of entries) if (e.start > now - 14 * 86_400_000) count.set(e.activityId, (count.get(e.activityId) ?? 0) + 1);
  const ids = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id).filter((id) => canTrack(activities, id));
  for (const a of childrenOf(activities, null)) if (!a.timeless && !ids.includes(a.id)) ids.push(a.id);
  return ids.slice(0, n);
}

/** Занятие для новой записи: последнее использованное (если не завершено), иначе первое в дереве. */
export function defaultActivity(activities: Activity[], entries: Entry[]): string | undefined {
  for (let i = entries.length - 1; i >= 0; i--) if (canTrack(activities, entries[i].activityId)) return entries[i].activityId;
  return childrenOf(activities, null).find((a) => !a.timeless)?.id;
}
