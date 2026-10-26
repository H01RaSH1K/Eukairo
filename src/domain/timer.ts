// Таймер на время хранит длительность (plannedMs), а конец считается от начала:
// правишь начало — конец едет вместе с ним сам. Старые записи (и устройства, которые
// ещё не обновились) хранят готовый конец plannedEnd — его читаем как раньше.
import type { Entry } from '../db/schema';

/** На сколько поставлен таймер, мс; 0 — без лимита. */
export function plannedMsOf(e: Entry): number {
  if (e.plannedMs) return e.plannedMs;
  return e.plannedEnd ? e.plannedEnd - e.start : 0;
}

/** Когда таймер закроется сам; undefined — без лимита. */
export function plannedEndOf(e: Entry): number | undefined {
  const ms = plannedMsOf(e);
  return ms ? e.start + ms : undefined;
}

/** Запись в новом виде: длительность вместо готового конца. */
export function withPlannedMs(e: Entry): Entry {
  if (!e.plannedEnd) return e;
  // Деструктуризация с «остатком» ≈ скопировать объект без поля plannedEnd.
  const { plannedEnd, ...rest } = e;
  return { ...rest, plannedMs: e.plannedMs ?? plannedEnd - e.start };
}
