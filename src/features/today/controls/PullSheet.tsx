import { useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { timerRange } from '../../../domain/tree';
import { MIN_MS, formatClock, formatTimer } from '../../../domain/time';
import { startTimer, stopTimer } from '../../../mock/store';
import { shortMin } from '../Dial';
import type { ControlProps } from './types';

// «Шторка»: внизу — тонкая полоска (что идёт или что запустить). Тянешь её вверх
// (или тапаешь) — выезжает панель: плитки занятий, ползунок длительности, старт.
// Мозаика всё время видна над ней. Свернуть — потянуть вниз или тапнуть по ручке.

export function PullSheet({ activities, colors, quick, current, onChoose, onMore, run, now, onOpenRun, name }: ControlProps) {
  const [open, setOpen] = useState(false);
  const [pull, setPull] = useState(0); // смещение пальцем во время перетаскивания, px
  const start = useRef<{ y: number; moved: boolean } | null>(null);
  const [minutesFor, setMinutesFor] = useState<Record<string, number>>({});

  const [lo, hi] = timerRange(activities, current);
  const minutes = Math.min(hi, Math.max(lo, minutesFor[current] ?? Math.round((lo + hi) / 10) * 5));
  const color = colors.get(current) ?? '#888';
  const planned = run?.plannedEnd ? run.plannedEnd - run.start : 0;
  const progress = run ? (planned ? Math.min(1, (now - run.start) / planned) : 1) : 0;

  // Перетаскивание ручки: вверх открывает, вниз закрывает.
  const down = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = { y: e.clientY, moved: false };
  };
  const move = (e: PointerEvent) => {
    if (!start.current) return;
    const dy = e.clientY - start.current.y;
    if (Math.abs(dy) > 4) start.current.moved = true;
    setPull(open ? Math.max(0, dy) : Math.min(0, dy));
  };
  const up = () => {
    if (!start.current) return;
    const { moved } = start.current;
    start.current = null;
    if (!moved) setOpen(!open);                 // просто тап
    else if (!open && pull < -40) setOpen(true);
    else if (open && pull > 60) setOpen(false);
    setPull(0);
  };

  const go = (free: boolean) => {
    startTimer(current, free ? undefined : minutes * MIN_MS);
    setOpen(false);
  };

  return (
    <div className={'pull' + (open ? ' open' : '')} style={{ '--pull': `${pull}px` } as CSSProperties}>
      <div className="pull-bar" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <div className="pull-grip" />
        <div className="pull-row">
          <span className="dot" style={{ background: run ? colors.get(run.activityId) : color }} />
          <span className="pull-name">{name(run?.activityId ?? current)}</span>
          {run ? (
            <span className="pull-time">{planned ? formatTimer(Math.max(0, run.plannedEnd! - now)) : formatTimer(now - run.start)}</span>
          ) : (
            <span className="pull-time dim">{open ? '' : 'потяни вверх ↑'}</span>
          )}
        </div>
        {/* прогресс идущего таймера — тонкая линия по нижнему краю полоски */}
        {run && <div className="pull-progress" style={{ width: `${progress * 100}%`, background: colors.get(run.activityId) }} />}
      </div>

      <div className="pull-body">
        {run ? (
          <>
            <div className="pull-big">{planned ? formatTimer(Math.max(0, run.plannedEnd! - now)) : formatTimer(now - run.start)}</div>
            <div className="dim center">{planned ? `осталось · до ${formatClock(run.plannedEnd!)}` : `с ${formatClock(run.start)} · без лимита`}</div>
            <div className="pull-actions">
              <button className="btn" onClick={() => { onOpenRun(); setOpen(false); }}>Изменить</button>
              <button className="btn primary" onClick={() => { stopTimer(); setOpen(false); }}>Стоп</button>
            </div>
          </>
        ) : (
          <>
            <div className="pull-tiles">
              {quick.slice(0, 5).map((id) => (
                <button key={id} aria-pressed={id === current} onClick={() => onChoose(id)} style={{ '--c': colors.get(id) } as CSSProperties}>
                  {name(id)}
                </button>
              ))}
              <button onClick={onMore}>Ещё…</button>
            </div>
            <div className="pull-duration">
              <span className="pull-big">{shortMin(minutes)}</span>
              <span className="dim">до {formatClock(now + minutes * MIN_MS)}</span>
            </div>
            <input className="slider" type="range" min={lo} max={hi} step={5} value={minutes}
              style={{ accentColor: color }}
              onChange={(e) => setMinutesFor({ ...minutesFor, [current]: Number(e.target.value) })} />
            <div className="pull-actions">
              <button className="btn" onClick={() => go(true)}>∞ Без лимита</button>
              <button className="btn primary" style={{ background: color }} onClick={() => go(false)}>Старт · {shortMin(minutes)}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
