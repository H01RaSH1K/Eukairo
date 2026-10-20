// Чистые функции про время. Не знают ни про React, ни про базу.

const DAY_MS = 24 * 60 * 60 * 1000;

/** Местная полночь дня, в который попадает момент `t` (мс UTC). */
export function startOfLocalDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Местная полночь следующего дня. Считаем через календарь, а не «+24 ч»,
 * потому что в день перевода часов в сутках 23 или 25 часов.
 */
export function startOfNextLocalDay(t: number): number {
  const d = new Date(startOfLocalDay(t));
  d.setDate(d.getDate() + 1);
  return d.getTime();
}

export { DAY_MS };

export const MIN_MS = 60 * 1000;
export const HOUR_MS = 60 * MIN_MS;

/** Сдвиг на n календарных дней (а не n×24 ч — см. перевод часов). */
export function addLocalDays(t: number, n: number): number {
  const d = new Date(t);
  d.setDate(d.getDate() + n);
  return d.getTime();
}

/** Местная полночь понедельника той недели, куда попадает `t`. */
export function startOfLocalWeek(t: number): number {
  const d = new Date(startOfLocalDay(t));
  const fromMonday = (d.getDay() + 6) % 7; // getDay(): 0 = воскресенье
  return addLocalDays(d.getTime(), -fromMonday);
}

export function startOfLocalMonth(t: number): number {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

export type Period = 'day' | 'week' | 'month';

/** Границы периода [from, to), в который попадает `t`. */
export function periodRange(period: Period, t: number): { from: number; to: number } {
  if (period === 'day') return { from: startOfLocalDay(t), to: startOfNextLocalDay(t) };
  if (period === 'week') {
    const from = startOfLocalWeek(t);
    return { from, to: addLocalDays(from, 7) };
  }
  const from = startOfLocalMonth(t);
  const d = new Date(from);
  return { from, to: new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime() };
}

/** Местные полночи всех дней внутри [from, to). */
export function dayStarts(from: number, to: number): number[] {
  const days: number[] = [];
  for (let t = from; t < to; t = startOfNextLocalDay(t)) days.push(t);
  return days;
}

/** «2 ч 05 мин», «45 мин», «3 ч». */
export function formatDuration(ms: number): string {
  const totalMin = Math.floor(ms / MIN_MS);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} мин`;
  if (m === 0) return `${h} ч`;
  return `${h} ч ${String(m).padStart(2, '0')} мин`;
}

/** «14:05» по местному времени. */
export function formatClock(t: number): string {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Цифры таймера: «1:07:42». */
export function formatTimer(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
