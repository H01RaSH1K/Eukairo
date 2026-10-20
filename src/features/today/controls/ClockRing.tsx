import { useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { timerRange } from '../../../domain/tree';
import { HOUR_MS, MIN_MS, formatClock, formatTimer, startOfLocalDay } from '../../../domain/time';
import { logEntry, startTimer, stopTimer } from '../../../db/commands';
import { useData } from '../../../db/store';
import { shortMin } from '../Dial';
import type { ControlProps } from './types';

// «Циферблат»: кольцо — сутки (полночь сверху, по часовой). На нём видно, что уже было сегодня.
// Тянешь от точки «сейчас» по часовой — ставишь таймер до этого времени;
// против часовой — записываешь прошедшее время задним числом. Тап в центр — без лимита.

const C = 100, R = 76;
// Окружность, начатая сверху и идущая по часовой. pathLength = 1 → длина штриха = доля суток.
const RING = `M ${C} ${C - R} A ${R} ${R} 0 1 1 ${C - 0.01} ${C - R}`;
const DAY = 24 * HOUR_MS;

const at = (frac: number, r = R): [number, number] =>
  [C + r * Math.sin(frac * 2 * Math.PI), C - r * Math.cos(frac * 2 * Math.PI)];

/** Дуга суток от доли f1 до f2 (обе 0…1, f2 ≥ f1). */
const Arc = ({ f1, f2, color, className }: { f1: number; f2: number; color: string; className?: string }) => (
  <path d={RING} pathLength={1} className={'ring-arc ' + (className ?? '')}
    style={{ stroke: color, strokeDasharray: `${Math.max(0, f2 - f1)} 2`, strokeDashoffset: -f1 }} />
);

export function ClockRing({ activities, colors, quick, current, onChoose, onMore, run, now, onOpenRun, name }: ControlProps) {
  const { entries } = useData();
  const day0 = startOfLocalDay(now);
  const frac = (t: number) => (t - day0) / DAY;
  const color = colors.get(current) ?? '#888';
  const [lo, hi] = timerRange(activities, current);

  // Перетаскивание: копим угол по шагам, чтобы можно было пройти больше полукруга.
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ last: number; acc: number } | null>(null);
  const [minutes, setMinutes] = useState(0); // > 0 — таймер вперёд, < 0 — запись назад
  const angleOf = (e: PointerEvent) => {
    const b = svg.current!.getBoundingClientRect();
    const x = ((e.clientX - b.left) / b.width) * 200 - C, y = ((e.clientY - b.top) / b.height) * 200 - C;
    return { a: Math.atan2(x, -y), d: Math.hypot(x, y) }; // 0 — сверху, по часовой
  };
  const down = (e: PointerEvent<SVGSVGElement>) => {
    if (run) return;
    const { a, d } = angleOf(e);
    if (d < R - 26 || d > R + 26) return; // хватаем только за кольцо
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { last: a, acc: 0 };
    // начинаем от «сейчас»: прибавляем разницу между пальцем и стрелкой «сейчас»
    let start = a - frac(now) * 2 * Math.PI;
    start = Math.atan2(Math.sin(start), Math.cos(start));
    drag.current.acc = start;
    update(start);
  };
  const move = (e: PointerEvent<SVGSVGElement>) => {
    const g = drag.current;
    if (!g) return;
    const { a } = angleOf(e);
    let step = a - g.last;
    step = Math.atan2(Math.sin(step), Math.cos(step)); // (−π, π]
    g.last = a;
    g.acc += step;
    update(g.acc);
  };
  const update = (acc: number) => {
    let m = Math.round(((acc / (2 * Math.PI)) * 1440) / 5) * 5;
    const back = -Math.floor((now - day0) / MIN_MS / 5) * 5; // не раньше полуночи
    m = Math.max(back, Math.min(hi, m));
    setMinutes(m);
  };
  const up = () => { drag.current = null; };
  const cancel = () => setMinutes(0);

  const fNow = frac(now);
  const [nx, ny] = at(fNow);
  const today = entries.filter((e) => (e.end ?? now) > day0 && e.start < now);
  const planned = run?.plannedEnd ? run.plannedEnd - run.start : 0;

  return (
    <div className="clock">
      <div className="clock-chips">
        {quick.slice(0, 5).map((id) => (
          <button key={id} aria-pressed={id === current} disabled={!!run} onClick={() => onChoose(id)} style={{ '--c': colors.get(id) } as CSSProperties}>
            <span className="dot" style={{ background: colors.get(id) }} />{name(id)}
          </button>
        ))}
        <button onClick={onMore} disabled={!!run}>…</button>
      </div>

      <div className="clock-face">
        <svg ref={svg} viewBox="0 0 200 200" className="clock-svg" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
          <circle cx={C} cy={C} r={R} className="ring-track" />
          {[0, 6, 12, 18].map((h) => {
            const [x, y] = at(h / 24, R + 13); // подписи снаружи кольца
            return <text key={h} x={x} y={y} className="ring-hour">{h}</text>;
          })}
          {/* что уже было сегодня */}
          {today.map((e) => (
            <Arc key={e.id} f1={frac(Math.max(e.start, day0))} f2={frac(e.end ?? now)} color={colors.get(e.activityId) ?? '#888'} />
          ))}
          {/* идущий таймер на время: остаток — бледнее */}
          {run?.plannedEnd && <Arc f1={fNow} f2={frac(run.plannedEnd)} color={colors.get(run.activityId) ?? '#888'} className="ghost" />}
          {/* то, что тянешь сейчас */}
          {minutes > 0 && <Arc f1={fNow} f2={fNow + minutes / 1440} color={color} className="ghost" />}
          {minutes < 0 && <Arc f1={fNow + minutes / 1440} f2={fNow} color={color} className="past" />}
          <circle cx={nx} cy={ny} r={7} className="ring-now" />
        </svg>

        <div className="clock-center">
          {run ? (
            <>
              <button className="dial-activity" onClick={onOpenRun}><span className="dot" style={{ background: colors.get(run.activityId) }} />{name(run.activityId)}</button>
              <div className="clock-value">{planned ? formatTimer(Math.max(0, run.plannedEnd! - now)) : formatTimer(now - run.start)}</div>
              <div className="dial-sub dim">{planned ? `до ${formatClock(run.plannedEnd!)}` : `с ${formatClock(run.start)}`}</div>
              <button className="dial-go stop" onClick={() => stopTimer()}>Стоп</button>
            </>
          ) : minutes > 0 ? (
            <>
              <div className="clock-value">{shortMin(minutes)}</div>
              <div className="dial-sub dim">до {formatClock(now + minutes * MIN_MS)}{minutes < lo ? ` · меньше ${shortMin(lo)}` : ''}</div>
              <div className="dial-buttons">
                <button className="dial-go" style={{ background: color }} onClick={() => { startTimer(current, minutes * MIN_MS); cancel(); }}>Старт</button>
                <button className="dial-free" onClick={cancel}>✕</button>
              </div>
            </>
          ) : minutes < 0 ? (
            <>
              <div className="clock-value">{shortMin(-minutes)}</div>
              <div className="dial-sub dim">уже было · с {formatClock(now + minutes * MIN_MS)}</div>
              <div className="dial-buttons">
                <button className="dial-go" style={{ background: color }} onClick={() => { logEntry(current, now + minutes * MIN_MS, now); cancel(); }}>Записать</button>
                <button className="dial-free" onClick={cancel}>✕</button>
              </div>
            </>
          ) : (
            <>
              <div className="clock-hint dim">тяни от ● по кругу:<br />вперёд — таймер, назад — было</div>
              <button className="dial-go" style={{ background: color }} onClick={() => startTimer(current)}>∞ Начать</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
