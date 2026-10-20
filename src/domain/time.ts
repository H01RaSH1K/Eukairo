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
