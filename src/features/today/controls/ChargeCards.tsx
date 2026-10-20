import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { timerRange } from '../../../domain/tree';
import { MIN_MS, formatClock, formatTimer } from '../../../domain/time';
import { startTimer, stopTimer } from '../../../mock/store';
import { shortMin } from '../Dial';
import type { ControlProps } from './types';

// «Зарядка»: занятия — крупные карточки в ленте. Держишь палец на карточке — она
// заливается цветом снизу вверх, и длительность растёт (чем дольше держишь, тем быстрее).
// Отпустил — таймер на набранное время. Короткий тап — без лимита.
// Пока таймер идёт, сверху висит его полоса; тап по ней — стоп.

const HOLD_MS = 280; // короче — это тап

export function ChargeCards({ activities, colors, quick, onMore, run, now, onOpenRun, name }: ControlProps) {
  const [charging, setCharging] = useState<{ id: string; minutes: number } | null>(null);
  const hold = useRef<{ id: string; t0: number; x: number; y: number; frame: number } | null>(null);

  // Пока держим — каждый кадр пересчитываем минуты (≈ Update() в Unity).
  const tick = () => {
    const h = hold.current;
    if (!h) return;
    const held = performance.now() - h.t0;
    if (held > HOLD_MS) {
      const [lo, hi] = timerRange(activities, h.id);
      // 5 минут за шаг; шаг ускоряется: первые — по 0.25 с, дальше быстрее
      const steps = Math.floor(Math.pow((held - HOLD_MS) / 250, 1.35));
      setCharging({ id: h.id, minutes: Math.min(hi, lo + steps * 5) });
    }
    h.frame = requestAnimationFrame(tick);
  };
  const down = (id: string, e: PointerEvent) => {
    if (run) return;
    hold.current = { id, t0: performance.now(), x: e.clientX, y: e.clientY, frame: requestAnimationFrame(tick) };
  };
  const move = (e: PointerEvent) => {
    const h = hold.current;
    // палец поехал вбок до «зарядки» — это прокрутка ленты, а не нажатие
    if (h && !charging && Math.hypot(e.clientX - h.x, e.clientY - h.y) > 10) end(false);
  };
  const end = (fire: boolean) => {
    const h = hold.current;
    if (!h) return;
    cancelAnimationFrame(h.frame);
    hold.current = null;
    if (fire) {
      if (charging) startTimer(h.id, charging.minutes * MIN_MS);
      else startTimer(h.id);
    }
    setCharging(null);
  };
  useEffect(() => () => { if (hold.current) cancelAnimationFrame(hold.current.frame); }, []);

  const planned = run?.plannedEnd ? run.plannedEnd - run.start : 0;
  const runColor = run ? colors.get(run.activityId) ?? '#888' : '';

  return (
    <div className="charge">
      {run && (
        <div className="charge-run" style={{ '--c': runColor } as CSSProperties}>
          {/* заливка полосы — сколько прошло из запланированного */}
          <div className="charge-run-fill" style={{ width: `${planned ? Math.min(100, ((now - run.start) / planned) * 100) : 100}%` }} />
          <button className="charge-run-name" onClick={onOpenRun}>{name(run.activityId)}</button>
          <span className="charge-run-time">{planned ? formatTimer(Math.max(0, run.plannedEnd! - now)) : formatTimer(now - run.start)}</span>
          <span className="charge-run-sub">{planned ? `до ${formatClock(run.plannedEnd!)}` : 'без лимита'}</span>
          <button className="charge-stop" onClick={() => stopTimer()}>■</button>
        </div>
      )}
      <div className={'charge-strip' + (run ? ' disabled' : '')}>
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
              onPointerLeave={() => end(false)}
              onPointerCancel={() => end(false)}
              onContextMenu={(e) => e.preventDefault()}
            >
              <div className="charge-fill" />
              <div className="charge-name">{name(id)}</div>
              <div className="charge-value">{c ? shortMin(c.minutes) : `${shortMin(lo)}–${shortMin(hi)}`}</div>
              {c && <div className="charge-until">до {formatClock(now + c.minutes * MIN_MS)}</div>}
            </div>
          );
        })}
        <button className="charge-card more" onClick={onMore}>Все занятия…</button>
      </div>
      {!run && <div className="charge-hint dim">тап — без лимита · держи — набрать время</div>}
    </div>
  );
}
