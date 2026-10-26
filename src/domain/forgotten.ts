// Проверка «забытого таймера»: идёт без лимита дольше порога занятия → спросить.
import type { Activity, Entry } from '../db/schema';
import { MIN_MS } from './time';
import { forgetAfter } from './tree';
import { plannedMsOf } from './timer';

/** Когда и про какую запись в последний раз ответили «да, идёт». */
export interface ForgottenAnswer { entryId: string; at: number }

/**
 * Запись, про которую пора спросить «всё ещё идёт?», или null.
 * Таймер на время не спрашиваем — он закроется сам. После ответа «да» спросим снова
 * через тот же порог (3 ч → ещё через 3 ч).
 */
export function forgottenTimer(run: Entry | null, activities: Activity[], now: number, answer: ForgottenAnswer | null): Entry | null {
  if (!run || plannedMsOf(run)) return null;
  const since = answer?.entryId === run.id ? Math.max(answer.at, run.start) : run.start;
  return now - since > forgetAfter(activities, run.activityId) * MIN_MS ? run : null;
}
