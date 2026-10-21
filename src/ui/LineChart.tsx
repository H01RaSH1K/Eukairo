// Линейный график, как график функции: точка на каждый столбец, где есть число, точки соединены.
// Столбцы без числа линия перешагивает. Рисуется внутри чужого <svg> (координаты те же,
// что у столбиков: ширина столбца bw, высота h), поэтому оси и подписи дней — снаружи.

export interface Series {
  id: string;
  color: string;
  values: (number | null)[];
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
  const range = (vals: number[]): [number, number] => {
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (lo === hi) { lo -= 1; hi += 1; }
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
      {labels && sharedRange.map((v) => (
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
            {pts.map((p) => <circle key={p.i} cx={x(p.i)} cy={y(p.v, r)} r={p.i === picked ? 4.5 : n > 24 ? 1.8 : 2.5} fill={s.color}
              stroke={p.i === picked ? 'var(--bg)' : 'none'} strokeWidth="1.5" />)}
          </g>
        );
      })}
    </>
  );
}

/** Прозрачные полосы на всю высоту, по одной на столбец: тап выбирает столбец (попасть в точку пальцем трудно). */
export function TapColumns({ n, bw, h, picked, onPick }: { n: number; bw: number; h: number; picked: number | null; onPick: (i: number | null) => void }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <rect key={i} x={i * bw} y={0} width={bw} height={h} fill="transparent" onClick={() => onPick(picked === i ? null : i)} />
      ))}
    </>
  );
}

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
