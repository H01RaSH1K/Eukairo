import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { timerRange } from '../../../domain/tree';
import { MIN_MS, formatClock, formatTimer } from '../../../domain/time';
import { stopTimer } from '../../../db/commands';
import { shortMin } from '../Dial';
import { StartFromChip } from './StartFrom';
import type { ControlProps } from './types';
import { plannedMsOf, plannedEndOf } from '../../../domain/timer';

// «Зарядка»: занятия — крупные карточки в ленте. Нажал и чуть подержал — карточка
// «схватилась»: дальше палец вверх — больше времени, вниз — меньше (заливка ходит за пальцем).
// Отпустил — таймер на выбранное время. Короткий тап — без лимита.
// Пока таймер идёт, сверху висит его полоса; тап по ней — стоп.

const HOLD_MS = 280;   // короче — это тап
const STEP_PX = 12;    // столько пикселей пальцем = 5 минут

export function ChargeCards({ activities, colors, quick, onMore, run, now, onOpenRun, name, startAt, onPickStart, onStart }: ControlProps) {
  const [charging, setCharging] = useState<{ id: string; minutes: number } | null>(null);
  // y0 и m0 — где был палец и сколько было минут в момент «схватывания» (null — ещё не схватили)
  const hold = useRef<{ id: string; x: number; y: number; timer: number; el: HTMLElement; pointer: number; y0: number | null; m0: number } | null>(null);

  const minutesAt = (id: string, m0: number, dy: number) => {
    const [lo, hi] = timerRange(activities, id);
    // вверх — dy < 0 — больше; шаг 5 минут, в пределах диапазона занятия
    return Math.min(hi, Math.max(lo, m0 + Math.round(-dy / STEP_PX) * 5));
  };
  const down = (id: string, e: PointerEvent<HTMLDivElement>) => {
    if (run) return;
    const el = e.currentTarget, pointer = e.pointerId;
    const h = { id, x: e.clientX, y: e.clientY, el, pointer, y0: null as number | null, m0: 0, timer: 0 };
    // подержал — схватили: старт с середины диапазона, палец дальше двигает время
    h.timer = window.setTimeout(() => {
      const [lo, hi] = timerRange(activities, id);
      h.m0 = Math.round((lo + hi) / 10) * 5;
      h.y0 = h.y;
      el.setPointerCapture(pointer); // палец может уйти за карточку — она всё равно наша
      setCharging({ id, minutes: h.m0 });
    }, HOLD_MS);
    hold.current = h;
  };
  const move = (e: PointerEvent) => {
    const h = hold.current;
    if (!h) return;
    if (h.y0 === null) {
      // палец поехал до «схватывания» — это прокрутка ленты, а не нажатие
      if (Math.hypot(e.clientX - h.x, e.clientY - h.y) > 10) end(false);
      return;
    }
    setCharging({ id: h.id, minutes: minutesAt(h.id, h.m0, e.clientY - h.y0) });
  };
  const end = (fire: boolean) => {
    const h = hold.current;
    if (!h) return;
    clearTimeout(h.timer);
    hold.current = null;
    if (fire) {
      if (charging) onStart(h.id, charging.minutes * MIN_MS);
      else onStart(h.id);
    }
    setCharging(null);
  };
  useEffect(() => () => { if (hold.current) clearTimeout(hold.current.timer); }, []);

  // Когда карточка схвачена, палец вбок не должен листать ленту: иначе браузер забирает
  // жест себе (pointercancel) и зарядка сбрасывается. React вешает touchmove «пассивным»,
  // где preventDefault не работает, поэтому слушаем вручную с passive: false.
  const strip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = strip.current;
    if (!el) return;
    const block = (e: TouchEvent) => { if (hold.current?.y0 != null && e.cancelable) e.preventDefault(); };
    el.addEventListener('touchmove', block, { passive: false });
    return () => el.removeEventListener('touchmove', block);
  }, []);

  const planned = run ? plannedMsOf(run) : 0;
  const runColor = run ? colors.get(run.activityId) ?? '#888' : '';

  return (
    <div className="charge">
      {run && (
        <div className="charge-run" style={{ '--c': runColor } as CSSProperties}>
          {/* заливка полосы — сколько прошло из запланированного */}
          <div className="charge-run-fill" style={{ width: `${planned ? Math.min(100, ((now - run.start) / planned) * 100) : 100}%` }} />
          <button className="charge-run-name" onClick={onOpenRun}>{name(run.activityId)}</button>
          <span className="charge-run-time">{planned ? formatTimer(Math.max(0, plannedEndOf(run)! - now)) : formatTimer(now - run.start)}</span>
          <span className="charge-run-sub">{planned ? `до ${formatClock(plannedEndOf(run)!)}` : 'без лимита'}</span>
          <button className="charge-stop" onClick={() => stopTimer()}>■</button>
        </div>
      )}
      <div ref={strip} className={'charge-strip' + (run ? ' disabled' : '') + (charging ? ' locked' : '')}>
        {quick.slice(0, 8).map((id) => {
          const [lo, hi] = timerRange(activities, id);
          const c = charging?.id === id ? charging : null;
          const fill = c ? (c.minutes - lo) / (hi - lo) : 0;
          return (
            <div
              key={id}
              className={'charge-card' + (c ? ' charging' : '') + (run?.activityId === id ? ' running' : '')}
              style={{ '--c': colors.get(id), '--fill': `${Math.max(0.06, fill) * 100}%` } as CSSProperties}
              onPointerDown={(e) => down(id, e)}
              onPointerMove={move}
              onPointerUp={() => end(true)}
              onPointerLeave={() => { if (!charging) end(false); }}
              onPointerCancel={() => end(false)}
              onContextMenu={(e) => e.preventDefault()}
            >
              <div className="charge-fill" />
              <div className="charge-name">{name(id)}</div>
              <div className="charge-value">{c ? shortMin(c.minutes) : `${shortMin(lo)}–${shortMin(hi)}`}</div>
              {c && <div className="charge-until">до {formatClock((startAt ?? now) + c.minutes * MIN_MS)}</div>}
            </div>
          );
        })}
        <button className="charge-card more" onClick={onMore}>Все занятия…</button>
      </div>
      {!run && (
        <div className="charge-hint dim">
          тап — без лимита · подержи и веди ↑↓ · <StartFromChip startAt={startAt} onPick={onPickStart} />
        </div>
      )}
    </div>
  );
}
