import { useRef, type PointerEvent } from 'react';
import type { Entry } from '../../db/schema';
import { MIN_MS, formatClock, formatTimer } from '../../domain/time';

// Полукруг внизу «Сегодня». По дуге — ползунок длительности (диапазон свой у занятия),
// в середине — занятие и кнопки. Пока таймер идёт, дуга показывает, сколько прошло.

const CX = 100, CY = 100, R = 84; // геометрия во «внутренних» единицах SVG (viewBox 200 × 112)

/** Точка на дуге: t = 0 — левый край, t = 1 — правый, через верх. */
const at = (t: number): [number, number] => [CX - R * Math.cos(t * Math.PI), CY - R * Math.sin(t * Math.PI)];

/** SVG-путь дуги от левого края до доли t. */
function arc(t: number): string {
  const [x, y] = at(Math.min(Math.max(t, 0.0001), 1));
  return `M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)}`;
}

/** «45 мин», «1 ч», «1 ч 30». */
export function shortMin(min: number): string {
  const h = Math.floor(min / 60), m = min % 60;
  return h === 0 ? `${m} мин` : m === 0 ? `${h} ч` : `${h} ч ${m}`;
}

export function Dial({ name, color, range, minutes, onMinutes, run, now, onPick, onStart, onStartFree, onStop, onOpenRun }: {
  name: string;
  color: string;
  range: [number, number];          // минуты, от и до
  minutes: number;                  // выбранная длительность
  onMinutes: (m: number) => void;
  run: Entry | null;                // идущая запись (если есть)
  now: number;
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
  const drag = (e: PointerEvent<SVGSVGElement>) => {
    if (run || (e.type === 'pointermove' && !e.currentTarget.hasPointerCapture(e.pointerId))) return;
    if (e.type === 'pointerdown') e.currentTarget.setPointerCapture(e.pointerId);
    const box = svg.current!.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * 200;
    const y = ((e.clientY - box.top) / box.height) * 112;
    let a = Math.atan2(CY - y, x - CX);            // 0 справа, π слева
    if (a < 0) a = x < CX ? Math.PI : 0;           // ниже центра — прижимаем к краю
    const value = lo + (1 - a / Math.PI) * (hi - lo);
    onMinutes(Math.min(hi, Math.max(lo, Math.round(value / 5) * 5)));
  };

  const planned = run?.plannedEnd ? run.plannedEnd - run.start : 0;
  const progress = run ? (planned ? (now - run.start) / planned : 1) : t;
  const [hx, hy] = at(t);

  return (
    <div className="widget dial">
      <svg
        ref={svg}
        viewBox="0 0 200 112"
        className={'dial-svg' + (run ? ' running' : '')}
        onPointerDown={drag}
        onPointerMove={drag}
      >
        <path d={arc(1)} className="dial-track" />
        <path d={arc(progress)} className={'dial-fill' + (run && !planned ? ' free' : '')} style={{ stroke: color }} />
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
            <div className="dial-value">{planned ? formatTimer(Math.max(0, run.plannedEnd! - now)) : formatTimer(now - run.start)}</div>
            <div className="dial-sub dim">{planned ? `осталось · до ${formatClock(run.plannedEnd!)}` : `с ${formatClock(run.start)} · без лимита`}</div>
            <button className="dial-go stop" onClick={onStop}>Стоп</button>
          </>
        ) : (
          <>
            <button className="dial-activity" onClick={onPick}>
              <span className="dot" style={{ background: color }} />{name} <span className="dim">▾</span>
            </button>
            <div className="dial-value">{shortMin(minutes)}</div>
            <div className="dial-sub dim">до {formatClock(now + minutes * MIN_MS)}</div>
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
