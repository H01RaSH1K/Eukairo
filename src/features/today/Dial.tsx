import { useRef, type PointerEvent } from 'react';
import type { Entry } from '../../db/schema';
import { MIN_MS, formatClock, formatTimer } from '../../domain/time';
import { MAX_SHIFT_MIN, StartFromChip, shiftOf, startFromShift } from './controls/StartFrom';
import { plannedMsOf, plannedEndOf } from '../../domain/timer';

// Полукруг внизу «Сегодня». По дуге — ползунок длительности (диапазон свой у занятия),
// в середине — занятие и кнопки. Пока таймер идёт, дуга показывает, сколько прошло.
// Тематическое начало: тонкая дуга снаружи со своей ручкой. Середина — «сейчас»,
// влево — начал раньше (до 2 ч), вправо — начну позже.

const CX = 100, CY = 100, R = 84; // геометрия во «внутренних» единицах SVG (viewBox 200 × 120)

/** Точка на дуге: t = 0 — левый край, t = 1 — правый, через верх. */
const at = (t: number): [number, number] => [CX - R * Math.cos(t * Math.PI), CY - R * Math.sin(t * Math.PI)];

// Вся дуга слева направо через верх. Закрашенную часть рисуем той же дугой,
// обрезая штрихом: pathLength = 1, штрих длиной t — ровно доля дуги, без пересчёта пути.
const ARC = `M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`;
const R2 = 97; // внешняя тонкая дуга начала
const ARC2 = `M ${CX - R2} ${CY} A ${R2} ${R2} 0 0 1 ${CX + R2} ${CY}`;
const at2 = (t: number): [number, number] => [CX - R2 * Math.cos(t * Math.PI), CY - R2 * Math.sin(t * Math.PI)];

/** «45 мин», «1 ч», «1 ч 30». */
export function shortMin(min: number): string {
  const h = Math.floor(min / 60), m = min % 60;
  return h === 0 ? `${m} мин` : m === 0 ? `${h} ч` : `${h} ч ${m}`;
}

export function Dial({ name, color, range, minutes, onMinutes, run, now, startAt, onPickStart, onSetStart, themedStart, onPick, onStart, onStartFree, onStop, onOpenRun }: {
  name: string;
  color: string;
  range: [number, number];          // минуты, от и до
  minutes: number;                  // выбранная длительность
  onMinutes: (m: number) => void;
  run: Entry | null;                // идущая запись (если есть)
  now: number;
  startAt: number | null;           // выбранное начало следующего старта (null — сейчас)
  onPickStart: () => void;
  onSetStart: (t: number | null) => void;
  themedStart: boolean;             // показывать внешнюю дугу начала
  onPick: () => void;               // выбрать другое занятие
  onStart: () => void;              // таймер на выбранное время
  onStartFree: () => void;          // без лимита
  onStop: () => void;
  onOpenRun: () => void;            // открыть идущую запись
}) {
  const svg = useRef<SVGSVGElement>(null);
  const [lo, hi] = range;
  const t = (minutes - lo) / (hi - lo);

  // Перетаскивание: угол от центра → доля дуги → минуты с шагом 5.
  // setPointerCapture ≈ «захват мыши»: события идут сюда, даже если палец ушёл за пределы.
  // Что тянем: длительность или (снаружи дуги, если включено) начало.
  const what = useRef<'minutes' | 'start'>('minutes');
  const drag = (e: PointerEvent<SVGSVGElement>) => {
    if (run || (e.type === 'pointermove' && !e.currentTarget.hasPointerCapture(e.pointerId))) return;
    const box = svg.current!.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * 200;
    const y = ((e.clientY - box.top) / box.height) * 120;
    if (e.type === 'pointerdown') {
      e.currentTarget.setPointerCapture(e.pointerId);
      what.current = themedStart && Math.hypot(x - CX, y - CY) > R + 7 ? 'start' : 'minutes';
    }
    let a = Math.atan2(CY - y, x - CX);            // 0 справа, π слева
    if (a < 0) a = x < CX ? Math.PI : 0;           // ниже центра — прижимаем к краю
    const t = 1 - a / Math.PI;                     // доля дуги слева направо
    if (what.current === 'start') {
      onSetStart(startFromShift(Date.now(), Math.round(((t - 0.5) * 2 * MAX_SHIFT_MIN) / 5) * 5));
      return;
    }
    const value = lo + t * (hi - lo);
    onMinutes(Math.min(hi, Math.max(lo, Math.round(value / 5) * 5)));
  };

  const planned = run ? plannedMsOf(run) : 0;
  const progress = run ? (planned ? (now - run.start) / planned : 1) : t;
  const [hx, hy] = at(t);
  // доля внешней дуги: 0.5 — «сейчас»
  const tStart = Math.min(1, Math.max(0, 0.5 + shiftOf(startAt, now) / MAX_SHIFT_MIN / 2));
  const [sx, sy] = at2(tStart);
  const [mx, my] = at2(0.5);

  return (
    <div className="widget dial">
      <svg
        ref={svg}
        viewBox="0 0 200 120"
        className={'dial-svg' + (run ? ' running' : '')}
        onPointerDown={drag}
        onPointerMove={drag}
      >
        {themedStart && !run && (
          <>
            <path d={ARC2} className="dial-track ago" />
            <path d={ARC2} pathLength={1} className="dial-fill ago"
              style={{ stroke: color, strokeDasharray: `${Math.abs(tStart - 0.5)} 2`, strokeDashoffset: -Math.min(tStart, 0.5) }} />
            <circle cx={mx} cy={my} r={1.6} className="dial-now-tick" />
            <circle cx={sx} cy={sy} r={5} className="dial-handle ago" style={{ stroke: color }} />
          </>
        )}
        <path d={ARC} className="dial-track" />
        <path
          d={ARC}
          pathLength={1}
          className={'dial-fill' + (run && !planned ? ' free' : '')}
          style={{ stroke: color, strokeDasharray: `${Math.min(Math.max(progress, 0), 1)} 2` }}
        />
        {!run && <circle cx={hx} cy={hy} r={8} className="dial-handle" style={{ stroke: color }} />}
        {!run && (
          <>
            <text x={CX - R} y={CY + 10} className="dial-tick">{shortMin(lo)}</text>
            <text x={CX + R} y={CY + 10} className="dial-tick">{shortMin(hi)}</text>
          </>
        )}
      </svg>

      <div className="dial-center">
        {run ? (
          <>
            <button className="dial-activity" onClick={onOpenRun}>
              <span className="dot" style={{ background: color }} />{name}
            </button>
            <div className="dial-value">{planned ? formatTimer(Math.max(0, plannedEndOf(run)! - now)) : formatTimer(now - run.start)}</div>
            <div className="dial-sub dim">{planned ? `осталось · до ${formatClock(plannedEndOf(run)!)}` : `с ${formatClock(run.start)} · без лимита`}</div>
            <button className="dial-go stop" onClick={onStop}>Стоп</button>
          </>
        ) : (
          <>
            <button className="dial-activity" onClick={onPick}>
              <span className="dot" style={{ background: color }} />{name} <span className="dim">▾</span>
            </button>
            <div className="dial-value">{shortMin(minutes)}</div>
            <StartFromChip className="dial-sub dim" startAt={startAt} until={(startAt ?? now) + minutes * MIN_MS} onPick={onPickStart} />
            <div className="dial-buttons">
              <button className="dial-go" style={{ background: color }} onClick={onStart}>Старт</button>
              <button className="dial-free" onClick={onStartFree}>∞</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
