import { useState, type CSSProperties } from 'react';
import { timerRange } from '../../../domain/tree';
import { MIN_MS, formatClock, formatTimer } from '../../../domain/time';
import { startTimer, stopTimer } from '../../../db/commands';
import { shortMin } from '../Dial';
import type { ControlProps } from './types';

// «Плитки»: плитки частых занятий, ползунок длительности, «Старт» и «∞».
// Пока таймер идёт — крупное время, «Изменить» и «Стоп».

export function Tiles({ activities, colors, quick, current, onChoose, onMore, run, now, onOpenRun, name }: ControlProps) {
  const [minutesFor, setMinutesFor] = useState<Record<string, number>>({});
  const [lo, hi] = timerRange(activities, current);
  const minutes = Math.min(hi, Math.max(lo, minutesFor[current] ?? Math.round((lo + hi) / 10) * 5));
  const color = colors.get(current) ?? '#888';
  const planned = run?.plannedEnd ? run.plannedEnd - run.start : 0;

  if (run) {
    return (
      <div className="tiles">
        <div className="tiles-big">{planned ? formatTimer(Math.max(0, run.plannedEnd! - now)) : formatTimer(now - run.start)}</div>
        <div className="dim center">{name(run.activityId)} · {planned ? `до ${formatClock(run.plannedEnd!)}` : `с ${formatClock(run.start)}, без лимита`}</div>
        <div className="tiles-actions">
          <button className="btn" onClick={onOpenRun}>Изменить</button>
          <button className="btn primary" onClick={() => stopTimer()}>Стоп</button>
        </div>
      </div>
    );
  }
  return (
    <div className="tiles">
      <div className="tiles-grid">
        {quick.slice(0, 5).map((id) => (
          <button key={id} aria-pressed={id === current} onClick={() => onChoose(id)} style={{ '--c': colors.get(id) } as CSSProperties}>
            {name(id)}
          </button>
        ))}
        <button onClick={onMore}>Ещё…</button>
      </div>
      <div className="tiles-duration">
        <span className="tiles-big">{shortMin(minutes)}</span>
        <span className="dim">до {formatClock(now + minutes * MIN_MS)}</span>
      </div>
      <input className="slider" type="range" min={lo} max={hi} step={5} value={minutes}
        style={{ accentColor: color }}
        onChange={(e) => setMinutesFor({ ...minutesFor, [current]: Number(e.target.value) })} />
      <div className="tiles-actions">
        <button className="btn" onClick={() => startTimer(current)}>∞ Без лимита</button>
        <button className="btn primary" style={{ background: color }} onClick={() => startTimer(current, minutes * MIN_MS)}>Старт · {shortMin(minutes)}</button>
      </div>
    </div>
  );
}
