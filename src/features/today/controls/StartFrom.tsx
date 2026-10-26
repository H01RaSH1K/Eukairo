import { useState } from 'react';
import { MIN_MS, formatClock } from '../../../domain/time';
import { Sheet } from '../../../ui/Sheet';

// Начать таймер не с «сейчас», а с момента, когда начал на самом деле
// («сел работать в 12:10, а нажать забыл»). Выбранное начало действует на один старт.

const AGO = [5, 10, 15, 30, 60]; // минуты назад: в одно касание

/** Строчка под таймером: «сейчас · до 14:30 ▾» или «с 12:10 · до 14:10 ▾»; тап — выбрать другое начало. */
export function StartFromChip({ startAt, until, onPick, className }: {
  startAt: number | null;
  until?: number;          // когда закончится таймер на время (без лимита — не показываем)
  onPick: () => void;
  className?: string;
}) {
  return (
    <button className={'start-from ' + (className ?? '') + (startAt ? ' set' : '')} onClick={onPick}>
      {startAt ? `с ${formatClock(startAt)}` : 'сейчас'}
      {until !== undefined && ` · до ${formatClock(until)}`} ▾
    </button>
  );
}

/** Лист выбора начала: «N мин назад» или точное время. */
export function StartFromSheet({ startAt, now, onSet, onClose }: {
  startAt: number | null;
  now: number;
  onSet: (t: number | null) => void;   // null — с момента нажатия
  onClose: () => void;
}) {
  const [clock, setClock] = useState(formatClock(startAt ?? now));
  const pick = (t: number | null) => { onSet(t); onClose(); };

  // «12:10» → сегодня в 12:10; если это ещё не наступило — значит, вчера.
  const parsed = (() => {
    const [h, m] = clock.split(':').map(Number);
    const d = new Date(now);
    d.setHours(h, m, 0, 0);
    let t = d.getTime();
    if (t > now) t -= 86_400_000;
    return Number.isNaN(t) ? null : t;
  })();

  return (
    <Sheet title="Когда начал?" onClose={onClose}>
      <div className="form">
        <div className="chips">
          {AGO.map((m) => (
            <button key={m} onClick={() => pick(now - m * MIN_MS)}>{m < 60 ? `${m} мин назад` : 'час назад'}</button>
          ))}
        </div>
        <label className="field time">
          <span className="dim">Начал в</span>
          <input type="time" value={clock} onChange={(e) => setClock(e.target.value)} />
        </label>
        <button className="btn primary" disabled={parsed === null} onClick={() => pick(parsed)}>
          Начало — {parsed !== null && parsed < now - 12 * 3_600_000 ? 'вчера ' : ''}{clock}
        </button>
        <button className="btn" onClick={() => pick(null)}>С момента нажатия</button>
      </div>
    </Sheet>
  );
}
