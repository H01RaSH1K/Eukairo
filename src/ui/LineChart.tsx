import type { PointerEvent, TouchEvent } from 'react';

// Линейный график, как график функции: точка на каждый столбец, где есть число, точки соединены.
// Столбцы без числа линия перешагивает. Рисуется внутри чужого <svg> (координаты те же,
// что у столбиков: ширина столбца bw, высота h), поэтому оси и подписи дней — снаружи.

export interface Series {
  id: string;
  color: string;
  values: (number | null)[];
  pointColors?: (string | undefined)[]; // свой цвет точки (по варианту), иначе цвет линии
}

/**
 * shared — у всех линий одна шкала (время занятий: всё в минутах);
 * own — у каждой своя (отжимания в штуках и вес в кг рядом не сравнить, сравнивают ход линий).
 * Шкала — от минимума до максимума, а не от нуля: так виден рост, а не ровная линия наверху.
 */
export function LineChart({ series, bw, h, scale, picked = null, format = (v) => String(Math.round(v * 10) / 10) }: {
  series: Series[]; bw: number; h: number; scale: 'shared' | 'own';
  picked?: number | null;   // выбранный тапом столбец: вертикальная линия и крупные точки
  format?: (v: number) => string;
}) {
  const pad = 8; // чтобы точки у краёв не обрезались
  const n = Math.max(0, ...series.map((s) => s.values.length));
  // Шкала с «круглыми» делениями (1, 2, 5, 10, 20…) и запасом: 34…47 становится 30…50,
  // так прыжок на пару единиц не выглядит обрывом через весь график.
  const range = (vals: number[]): [number, number] => {
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (lo === hi) { lo -= 1; hi += 1; }
    const step = niceStep((hi - lo) / 3);
    lo = Math.floor(lo / step) * step;
    hi = Math.ceil(hi / step) * step;
    if (lo < 0 && Math.min(...vals) >= 0) lo = 0;
    return [lo, hi];
  };
  const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  if (all.length === 0) return null;
  const sharedRange = range(all);
  const x = (i: number) => i * bw + bw / 2;
  // Подписи шкалы — только когда она одна на всех (или линия одна).
  const labels = scale === 'shared' || series.length === 1;
  const y = (v: number, [lo, hi]: [number, number]) => pad + (1 - (v - lo) / (hi - lo)) * (h - 2 * pad);

  return (
    <>
      {labels && ticks(sharedRange).map((v) => (
        <g key={v}>
          <line x1="0" x2={bw * n} y1={y(v, sharedRange)} y2={y(v, sharedRange)} stroke="var(--line)" strokeDasharray="2 3" />
          <text x="2" y={y(v, sharedRange) - 2} className="bar-label" textAnchor="start">{format(v)}</text>
        </g>
      ))}
      {picked !== null && <line x1={x(picked)} x2={x(picked)} y1={0} y2={h} stroke="var(--text-dim)" strokeWidth="1" />}
      {series.map((s) => {
        const pts = s.values.flatMap((v, i) => (v === null ? [] : [{ i, v }]));
        if (pts.length === 0) return null;
        const r = scale === 'shared' ? sharedRange : range(pts.map((p) => p.v));
        const line = pts.map((p) => `${x(p.i)},${y(p.v, r)}`).join(' ');
        return (
          <g key={s.id}>
            {/* заливка под линией — только когда линия одна, иначе каша */}
            {series.length === 1 && <polygon points={`${x(pts[0].i)},${h} ${line} ${x(pts.at(-1)!.i)},${h}`} fill={s.color} opacity=".15" />}
            <polyline points={line} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            {pts.map((p) => <circle key={p.i} cx={x(p.i)} cy={y(p.v, r)} r={p.i === picked ? 4.5 : n > 24 && !s.pointColors ? 1.8 : 2.5} fill={s.pointColors?.[p.i] ?? s.color}
              stroke={p.i === picked ? 'var(--bg)' : 'none'} strokeWidth="1.5" />)}
          </g>
        );
      })}
    </>
  );
}

/** Шаг делений: 1, 2 или 5, умноженное на степень десяти, не меньше `raw`. */
function niceStep(raw: number): number {
  const p = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 5, 10].map((k) => k * p).find((s) => s >= raw) ?? 10 * p;
}

/** Значения делений внутри [lo, hi] (их 3–5). */
function ticks([lo, hi]: [number, number]): number[] {
  const step = niceStep((hi - lo) / 3);
  const out: number[] = [];
  for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + step / 1000; v += step) out.push(Math.round(v * 1000) / 1000);
  return out;
}

/**
 * Выбор дня на графике пальцем: тап — выбрать (тап по выбранному — снять),
 * провёл вбок — выбранный день едет за пальцем. Возвращает обработчики для <svg>.
 * indexAt(доля ширины 0…1) → номер столбца. Вертикальный жест не трогаем
 * (touch-action: pan-y в CSS) — им прокручивается лист.
 */
export function scrub(n: number, indexAt: (frac: number) => number, picked: number | null, onPick: (i: number | null) => void) {
  const at = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return Math.max(0, Math.min(n - 1, indexAt((e.clientX - r.left) / r.width)));
  };
  return {
    onPointerDown: (e: PointerEvent<SVGSVGElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      const i = at(e);
      // тап по уже выбранному снимает выбор — запоминаем, чтобы решить на отпускании
      drag = { start: e.clientX, moved: false, wasPicked: i === picked };
      onPick(i);
    },
    onPointerMove: (e: PointerEvent<SVGSVGElement>) => {
      if (!drag) return;
      if (Math.abs(e.clientX - drag.start) > 6) drag.moved = true;
      onPick(at(e));
    },
    onPointerUp: () => {
      if (drag && !drag.moved && drag.wasPicked) onPick(null);
      drag = null;
    },
    onPointerCancel: () => { drag = null; },
    // пока ведём пальцем по графику, лист под ним не должен тянуться вниз
    onTouchMove: (e: TouchEvent<SVGSVGElement>) => { if (drag?.moved) e.stopPropagation(); },
  };
}
// Один палец — один график, так что достаточно одного состояния на всё приложение.
let drag: { start: number; moved: boolean; wasPicked: boolean } | null = null;

// Вид графика (столбики или линия) помним на этом телефоне, отдельно для каждого места.
export type ChartKind = 'bars' | 'line';
export function savedChart(key: string): ChartKind {
  try { return localStorage.getItem('eukairo.chart.' + key) === 'line' ? 'line' : 'bars'; } catch { return 'bars'; }
}
export function saveChart(key: string, k: ChartKind) {
  try { localStorage.setItem('eukairo.chart.' + key, k); } catch { /* приватный режим — просто не запомним */ }
}

/** Переключатель «столбики / линия». */
export function ChartKindSwitch({ value, onChange }: { value: ChartKind; onChange: (k: ChartKind) => void }) {
  return (
    <div className="chips chart-kind">
      <button aria-pressed={value === 'bars'} aria-label="Столбики" onClick={() => onChange('bars')}>▮▮</button>
      <button aria-pressed={value === 'line'} aria-label="Линия" onClick={() => onChange('line')}>⟋</button>
    </div>
  );
}
