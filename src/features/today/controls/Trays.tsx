import type { CSSProperties } from 'react';
import { HOUR_MS, formatClock, formatTimer, startOfLocalDay } from '../../../domain/time';
import { timerRange } from '../../../domain/tree';
import { useData } from '../../../db/store';
import { shortMin } from '../Dial';
import type { ControlProps } from './types';
import { plannedMsOf, plannedEndOf } from '../../../domain/timer';

// «Трей» — свёрнутая шторка. У каждого режима свой, похожий на его управление в миниатюре:
// полукруг, кольцо суток, «батарейка» зарядки, плитки. Трей только показывает —
// тап или потянуть вверх раскрывает шторку (это ловит Drawer).

/** Сколько осталось (таймер) или прошло (без лимита) и доля пройденного (без лимита — 1). */
function runState({ run, now }: Pick<ControlProps, 'run' | 'now'>) {
  if (!run) return null;
  const planned = plannedMsOf(run);
  return {
    time: planned ? formatTimer(Math.max(0, plannedEndOf(run)! - now)) : formatTimer(now - run.start),
    sub: planned ? `до ${formatClock(plannedEndOf(run)!)}` : `с ${formatClock(run.start)}, без лимита`,
    progress: planned ? Math.min(1, (now - run.start) / planned) : 1,
    free: !planned,
  };
}

// Подпись трея: название и строчка под ним; справа — время.
const Label = ({ title, sub, time }: { title: string; sub: string; time?: string }) => (
  <>
    <div className="tray-label">
      <div className="tray-name">{title}</div>
      <div className="tray-sub">{sub}</div>
    </div>
    {time && <div className="tray-time">{time}</div>}
  </>
);

// ——— Полукруг: маленькая дуга, заливка — сколько прошло ———
const ARC = 'M 6 30 A 24 24 0 0 1 54 30';
export function DialTray(p: ControlProps) {
  const s = runState(p);
  const id = p.run?.activityId ?? p.current;
  const color = p.colors.get(id) ?? '#888';
  const [lo, hi] = timerRange(p.activities, id);
  return (
    <div className="tray">
      <svg viewBox="0 0 60 34" className="tray-arc">
        <path d={ARC} className="dial-track" style={{ strokeWidth: 6 }} />
        {s && <path d={ARC} pathLength={1} className={'dial-fill' + (s.free ? ' free' : '')}
          style={{ stroke: color, strokeWidth: 6, strokeDasharray: `${s.progress} 2` }} />}
      </svg>
      <Label title={p.name(id)} sub={s ? s.sub : `${shortMin(lo)} – ${shortMin(hi)}`} time={s?.time} />
    </div>
  );
}

// ——— Циферблат: мини-кольцо суток с сегодняшними записями и точкой «сейчас» ———
const C = 20, R = 15;
const RING = `M ${C} ${C - R} A ${R} ${R} 0 1 1 ${C - 0.01} ${C - R}`;
export function ClockTray(p: ControlProps) {
  const { entries } = useData();
  const s = runState(p);
  const day0 = startOfLocalDay(p.now);
  const f = (t: number) => Math.min(1, Math.max(0, (t - day0) / (24 * HOUR_MS)));
  const nf = f(p.now);
  const id = p.run?.activityId ?? p.current;
  const arc = (a: number, b: number, color: string, key: string, op = 1) => (
    <path key={key} d={RING} pathLength={1} fill="none" strokeWidth={5}
      style={{ stroke: color, opacity: op, strokeDasharray: `${Math.max(0, b - a)} 2`, strokeDashoffset: -a }} />
  );
  return (
    <div className="tray">
      <svg viewBox="0 0 40 40" className="tray-ring">
        <circle cx={C} cy={C} r={R} fill="none" strokeWidth={5} className="ring-track-mini" />
        {entries.filter((e) => e.end && e.end > day0 && e.start < p.now)
          .map((e) => arc(f(e.start), f(e.end!), p.colors.get(e.activityId) ?? '#888', e.id, 0.8))}
        {p.run && arc(f(p.run.start), f(plannedEndOf(p.run) ?? p.now), p.colors.get(p.run.activityId) ?? '#888', 'run')}
        <circle cx={C + R * Math.sin(nf * 2 * Math.PI)} cy={C - R * Math.cos(nf * 2 * Math.PI)} r={3} className="ring-now" style={{ strokeWidth: 1.5 }} />
      </svg>
      <Label title={p.name(id)} sub={s ? s.sub : 'тяни от точки по кругу'} time={s?.time} />
    </div>
  );
}

// ——— Зарядка: идёт таймер — «батарейка», разряжается по мере хода; нет — ряд мини-карточек ———
export function ChargeTray(p: ControlProps) {
  const s = runState(p);
  if (s && p.run) {
    return (
      <div className="tray tray-battery" style={{ '--c': p.colors.get(p.run.activityId) } as CSSProperties}>
        <div className="tray-battery-fill" style={{ width: `${(s.free ? 1 : 1 - s.progress) * 100}%` }} />
        <Label title={p.name(p.run.activityId)} sub={s.sub} time={s.time} />
      </div>
    );
  }
  return (
    <div className="tray tray-cards">
      {p.quick.slice(0, 4).map((id) => (
        <div key={id} className="tray-card" style={{ '--c': p.colors.get(id) } as CSSProperties}>{p.name(id)}</div>
      ))}
    </div>
  );
}

// ——— Плитки: идёт таймер — одна плитка со временем; нет — ряд мини-плиток ———
export function TilesTray(p: ControlProps) {
  const s = runState(p);
  if (s && p.run) {
    const c = p.colors.get(p.run.activityId);
    return (
      <div className="tray tray-tile" style={{ '--c': c, '--p': s.progress } as CSSProperties}>
        <Label title={p.name(p.run.activityId)} sub={s.sub} time={s.time} />
      </div>
    );
  }
  return (
    <div className="tray tray-tiles">
      {p.quick.slice(0, 3).map((id) => (
        <div key={id} style={{ '--c': p.colors.get(id) } as CSSProperties}>{p.name(id)}</div>
      ))}
    </div>
  );
}
