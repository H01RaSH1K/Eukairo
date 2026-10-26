import { useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { timerRange } from '../../../domain/tree';
import { HOUR_MS, MIN_MS, formatClock, formatTimer, startOfLocalDay } from '../../../domain/time';
import { logEntry, stopTimer } from '../../../db/commands';
import { useData } from '../../../db/store';
import { shortMin } from '../Dial';
import { StartFromChip } from './StartFrom';
import type { ControlProps } from './types';
import { plannedMsOf, plannedEndOf } from '../../../domain/timer';

// «Циферблат»: кольцо — сутки (полночь сверху, по часовой). На нём видно, что уже было сегодня.
// Тянешь от точки «сейчас» по часовой — ставишь таймер до этого времени;
// против часовой — записываешь прошедшее время задним числом. Тап в центр — без лимита.
// Тематическое начало: тонкое кольцо внутри, его ◦ тянешь назад — во сколько начал.

const C = 100, R = 76;
// Окружность, начатая сверху и идущая по часовой. pathLength = 1 → длина штриха = доля суток.
const RING = `M ${C} ${C - R} A ${R} ${R} 0 1 1 ${C - 0.01} ${C - R}`;
const DAY = 24 * HOUR_MS;
const R_IN = 63; // внутреннее кольцо начала

const at = (frac: number, r = R): [number, number] =>
  [C + r * Math.sin(frac * 2 * Math.PI), C - r * Math.cos(frac * 2 * Math.PI)];

/** Дуга суток от доли f1 до f2 (обе 0…1, f2 ≥ f1). */
const Arc = ({ f1, f2, color, className }: { f1: number; f2: number; color: string; className?: string }) => (
  <path d={RING} pathLength={1} className={'ring-arc ' + (className ?? '')}
    style={{ stroke: color, strokeDasharray: `${Math.max(0, f2 - f1)} 2`, strokeDashoffset: -f1 }} />
);

export function ClockRing({ activities, colors, quick, current, onChoose, onMore, run, now, onOpenRun, name, startAt, onPickStart, onSetStart, themedStart, onStart }: ControlProps) {
  const { entries } = useData();
  const day0 = startOfLocalDay(now);
  const frac = (t: number) => (t - day0) / DAY;
  const color = colors.get(current) ?? '#888';
  const [lo, hi] = timerRange(activities, current);

  // Перетаскивание: копим угол по шагам, чтобы можно было пройти больше полукруга.
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ last: number; acc: number } | null>(null);
  const startDrag = useRef(false);
  const [minutes, setMinutes] = useState(0); // > 0 — таймер вперёд, < 0 — запись назад
  const angleOf = (e: PointerEvent) => {
    const b = svg.current!.getBoundingClientRect();
    const x = ((e.clientX - b.left) / b.width) * 200 - C, y = ((e.clientY - b.top) / b.height) * 200 - C;
    return { a: Math.atan2(x, -y), d: Math.hypot(x, y) }; // 0 — сверху, по часовой
  };
  const down = (e: PointerEvent<SVGSVGElement>) => {
    if (run) return;
    const { a, d } = angleOf(e);
    if (themedStart && d > R_IN - 11 && d < R - 7) { // внутреннее кольцо — начало
      e.currentTarget.setPointerCapture(e.pointerId);
      startDrag.current = true;
      setStartAtAngle(a);
      return;
    }
    if (d < (themedStart ? R - 7 : R - 26) || d > R + 26) return; // хватаем только за кольцо
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { last: a, acc: 0 };
    // начинаем от «сейчас»: прибавляем разницу между пальцем и стрелкой «сейчас»
    let start = a - frac(now) * 2 * Math.PI;
    start = Math.atan2(Math.sin(start), Math.cos(start));
    drag.current.acc = start;
    update(start);
  };
  // Угол на кольце → момент за последние 12 часов (позже «сейчас» — значит, вчера), шаг 5 минут.
  const setStartAtAngle = (a: number) => {
    let t = day0 + (((a / (2 * Math.PI)) % 1 + 1) % 1) * DAY;
    if (t > now) t -= DAY;
    t = Math.max(t, now - 12 * HOUR_MS);
    const ago = Math.round((now - t) / MIN_MS / 5) * 5;
    onSetStart(ago > 0 ? now - ago * MIN_MS : null);
  };
  const move = (e: PointerEvent<SVGSVGElement>) => {
    if (startDrag.current) { setStartAtAngle(angleOf(e).a); return; }
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
  const up = () => { drag.current = null; startDrag.current = false; };
  const cancel = () => setMinutes(0);

  const fNow = frac(now);
  const [nx, ny] = at(fNow);
  const today = entries.filter((e) => (e.end ?? now) > day0 && e.start < now);
  const planned = run ? plannedMsOf(run) : 0;

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
          {run && planned > 0 && <Arc f1={fNow} f2={frac(plannedEndOf(run)!)} color={colors.get(run.activityId) ?? '#888'} className="ghost" />}
          {/* то, что тянешь сейчас */}
          {minutes > 0 && <Arc f1={fNow} f2={fNow + minutes / 1440} color={color} className="ghost" />}
          {minutes < 0 && <Arc f1={fNow + minutes / 1440} f2={fNow} color={color} className="past" />}
          <circle cx={nx} cy={ny} r={7} className="ring-now" />
          {themedStart && !run && (() => {
            const fs = frac(startAt ?? now);
            const [sx, sy] = at(fs, R_IN);
            return (
              <>
                <circle cx={C} cy={C} r={R_IN} className="ring-in" />
                {startAt && <path d={`M ${C} ${C - R_IN} A ${R_IN} ${R_IN} 0 1 1 ${C - 0.01} ${C - R_IN}`} pathLength={1} className="ring-in-arc"
                  style={{ stroke: color, strokeDasharray: `${fNow - Math.max(0, fs)} 2`, strokeDashoffset: -Math.max(0, fs) }} />}
                <circle cx={sx} cy={sy} r={5} className="ring-in-handle" style={{ stroke: color }} />
              </>
            );
          })()}
        </svg>

        <div className="clock-center">
          {run ? (
            <>
              <button className="dial-activity" onClick={onOpenRun}><span className="dot" style={{ background: colors.get(run.activityId) }} />{name(run.activityId)}</button>
              <div className="clock-value">{planned ? formatTimer(Math.max(0, plannedEndOf(run)! - now)) : formatTimer(now - run.start)}</div>
              <div className="dial-sub dim">{planned ? `до ${formatClock(plannedEndOf(run)!)}` : `с ${formatClock(run.start)}`}</div>
              <button className="dial-go stop" onClick={() => stopTimer()}>Стоп</button>
            </>
          ) : minutes > 0 ? (
            <>
              <div className="clock-value">{shortMin(minutes)}</div>
              <div className="dial-sub dim">{startAt ? `с ${formatClock(startAt)} ` : ''}до {formatClock(now + minutes * MIN_MS)}{minutes < lo ? ` · меньше ${shortMin(lo)}` : ''}</div>
              <div className="dial-buttons">
                <button className="dial-go" style={{ background: color }} onClick={() => { onStart(current, now + minutes * MIN_MS - (startAt ?? now)); cancel(); }}>Старт</button>
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
              <button className="dial-go" style={{ background: color }} onClick={() => onStart(current)}>∞ Начать</button>
              <StartFromChip className="dial-sub dim" startAt={startAt} onPick={onPickStart} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
