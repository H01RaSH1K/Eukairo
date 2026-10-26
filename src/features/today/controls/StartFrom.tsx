import { useState } from 'react';
import { MIN_MS, formatClock } from '../../../domain/time';
import { shortMin } from '../Dial';
import { Sheet } from '../../../ui/Sheet';

// Начать таймер не с «сейчас»: раньше («сел работать в 12:10, а нажать забыл»)
// или позже («начну в 10:00» — таймер запустится сам). Выбранное начало действует на один старт.

const SHIFTS = [5, 10, 15, 30, 60]; // минуты: в одно касание, назад и вперёд

/** Строчка под таймером: «сейчас · до 14:30 ▾», «с 12:10 · до 14:10 ▾», «в 15:00 · до 16:00 ▾». */
export function StartFromChip({ startAt, until, onPick, className }: {
  startAt: number | null;
  until?: number;          // когда закончится таймер на время (без лимита — не показываем)
  onPick: () => void;
  className?: string;
}) {
  const later = startAt !== null && startAt > Date.now();
  return (
    <button className={'start-from ' + (className ?? '') + (startAt ? ' set' : '')} onClick={onPick}>
      {startAt ? `${later ? 'в' : 'с'} ${formatClock(startAt)}` : 'сейчас'}
      {until !== undefined && ` · до ${formatClock(until)}`} ▾
    </button>
  );
}

/** «12:10» → ближайший к `now` такой момент: сегодня, вчера или завтра. */
export function nearestClock(clock: string, now: number): number | null {
  const [h, m] = clock.split(':').map(Number);
  const d = new Date(now);
  d.setHours(h, m, 0, 0);
  const t = d.getTime();
  if (Number.isNaN(t)) return null;
  return [t - 86_400_000, t, t + 86_400_000].reduce((a, b) => (Math.abs(b - now) < Math.abs(a - now) ? b : a));
}

/** Лист выбора начала: «N мин назад», «через N мин» или точное время. */
export function StartFromSheet({ startAt, now, onSet, onClose }: {
  startAt: number | null;
  now: number;
  onSet: (t: number | null) => void;   // null — с момента нажатия
  onClose: () => void;
}) {
  const [clock, setClock] = useState(formatClock(startAt ?? now));
  const pick = (t: number | null) => { onSet(t); onClose(); };
  const parsed = nearestClock(clock, now);
  const day = parsed === null ? '' : parsed < now - 12 * 3_600_000 ? 'вчера ' : parsed > now + 12 * 3_600_000 ? 'завтра ' : '';

  return (
    <Sheet title="Когда начать?" onClose={onClose}>
      <div className="form">
        <div className="chips">
          {SHIFTS.map((m) => (
            <button key={m} onClick={() => pick(now - m * MIN_MS)}>{m < 60 ? `${m} мин назад` : 'час назад'}</button>
          ))}
        </div>
        <div className="chips">
          {SHIFTS.map((m) => (
            <button key={m} onClick={() => pick(now + m * MIN_MS)}>{m < 60 ? `через ${m} мин` : 'через час'}</button>
          ))}
        </div>
        <label className="field time">
          <span className="dim">Начало в</span>
          <input type="time" value={clock} onChange={(e) => setClock(e.target.value)} />
        </label>
        <button className="btn primary" disabled={parsed === null} onClick={() => pick(parsed)}>
          Начало — {day}{clock}
        </button>
        <button className="btn" onClick={() => pick(null)}>С момента нажатия</button>
      </div>
    </Sheet>
  );
}

// ——— для тематических жестов: начало как сдвиг от «сейчас» ———

/** Насколько далеко назад и вперёд тянут жесты (дальше — через лист). */
export const MAX_SHIFT_MIN = 120;

/** Выбранное начало → сдвиг в минутах (кратно 5): < 0 — раньше, > 0 — позже. */
export const shiftOf = (startAt: number | null, now: number) =>
  startAt === null ? 0 : Math.round((startAt - now) / MIN_MS / 5) * 5;

/** Сдвиг → начало (0 — «сейчас»). */
export const startFromShift = (now: number, shift: number) => (shift ? now + shift * MIN_MS : null);

/** «начал раньше на 15 мин» / «начну через 15 мин» / «начало — сейчас». */
export const shiftLabel = (shift: number) =>
  shift < 0 ? `начал раньше на ${shortMin(-shift)}` : shift > 0 ? `начну через ${shortMin(shift)}` : 'начало — сейчас';
