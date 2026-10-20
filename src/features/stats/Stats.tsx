import { useMemo, useState } from 'react';
import type { Activity, Entry } from '../../db/schema';
import { activityColors } from '../../domain/colors';
import { childrenOf, pathOf, rootOf, subtreeIds } from '../../domain/tree';
import { HOUR_MS, dayStarts, formatDuration, periodRange, type Period } from '../../domain/time';
import { useMock } from '../../mock/store';
import { Segmented } from '../../ui/Segmented';
import { useNow } from '../../ui/useNow';

// Время каждого занятия (только собственные записи) внутри [from, to).
function ownTotals(entries: Entry[], from: number, to: number, now: number) {
  const m = new Map<string, number>();
  for (const e of entries) {
    const ms = Math.min(e.end ?? now, to) - Math.max(e.start, from);
    if (ms > 0) m.set(e.activityId, (m.get(e.activityId) ?? 0) + ms);
  }
  return m;
}

export default function Stats() {
  const { activities, entries } = useMock();
  const now = useNow(60_000);
  const [period, setPeriod] = useState<Period>('week');
  const [focus, setFocus] = useState<string | null>(null); // какой узел раскрыт в круговой
  const colors = useMemo(() => activityColors(activities), [activities]);

  const { from, to } = periodRange(period, now);
  const prev = periodRange(period, from - 1);
  const own = ownTotals(entries, from, to, now);
  // Время узла = свои записи + все потомки.
  const sum = (id: string) => [...subtreeIds(activities, id)].reduce((s, x) => s + (own.get(x) ?? 0), 0);
  const total = [...own.values()].reduce((a, b) => a + b, 0);
  // Сравниваем с тем же отрезком прошлого периода («к этому моменту»).
  const prevTotal = [...ownTotals(entries, prev.from, prev.from + (now - from), now).values()].reduce((a, b) => a + b, 0);
  const delta = total - prevTotal;

  const prevName = { day: 'вчера', week: 'прошлой неделе', month: 'прошлому месяцу' }[period];

  return (
    <div className="screen fit">
      <h1>Сводки</h1>
      <Segmented
        options={[{ id: 'day', label: 'Сегодня' }, { id: 'week', label: 'Неделя' }, { id: 'month', label: 'Месяц' }]}
        value={period}
        onChange={(p) => { setPeriod(p); setFocus(null); }}
      />

      <div className="widget pad stat-total">
        <div className="big">{formatDuration(total)}</div>
        <div className={delta >= 0 ? 'up' : 'down'}>
          {delta >= 0 ? '▲' : '▼'} {formatDuration(Math.abs(delta))} {period === 'day' ? 'к вчера на это время' : `к ${prevName} на этот момент`}
        </div>
      </div>

      <Donut activities={activities} colors={colors} focus={focus} setFocus={setFocus} sum={sum} own={own} />

      <div className="widget pad bars-widget">
        <div className="card-title">{period === 'day' ? 'По часам' : 'По дням'}</div>
        <Bars period={period} from={from} to={to} entries={entries} activities={activities} colors={colors} now={now} />
      </div>
    </div>
  );
}

const short = (s: string) => (s.length > 14 ? s.slice(0, 13) + '…' : s);

function Donut({ activities, colors, focus, setFocus, sum, own }: {
  activities: Activity[];
  colors: Map<string, string>;
  focus: string | null;
  setFocus: (id: string | null) => void;
  sum: (id: string) => number;
  own: Map<string, number>;
}) {
  // Секторы уровня: дети раскрытого узла (+ его собственные записи без подзанятия).
  const slices = childrenOf(activities, focus)
    .map((a) => ({ id: a.id, label: a.name, ms: sum(a.id), color: colors.get(a.id)!, drill: childrenOf(activities, a.id).length > 0 }))
    .filter((s) => s.ms > 0);
  if (focus && (own.get(focus) ?? 0) > 0) {
    slices.push({ id: focus + ':own', label: 'без подзанятия', ms: own.get(focus)!, color: colors.get(focus)!, drill: false });
  }
  slices.sort((a, b) => b.ms - a.ms);
  const total = slices.reduce((s, x) => s + x.ms, 0);
  // В легенду влезает 6 строк; остальное — одной строкой «Прочее».
  const legend = slices.length > 6
    ? [...slices.slice(0, 5), { id: 'rest', label: 'Прочее', ms: slices.slice(5).reduce((a, x) => a + x.ms, 0), color: '#555', drill: false }]
    : slices;

  const R = 70;
  const C = 2 * Math.PI * R;
  let acc = 0;
  const path = focus ? pathOf(activities, focus) : [];

  return (
    <div className="widget pad donut-widget">
      <div className="card-title crumbs">
        <button onClick={() => setFocus(null)}>Все занятия</button>
        {path.map((a) => <span key={a.id}> › <button onClick={() => setFocus(a.id)}>{a.name}</button></span>)}
      </div>
      <div className="donut-row">
        <svg viewBox="0 0 200 200" className="donut">
          {/* Каждый сектор — окружность с пунктиром нужной длины (stroke-dasharray). */}
          {slices.map((s) => {
            const len = (s.ms / total) * C;
            const el = (
              <circle
                key={s.id} cx="100" cy="100" r={R} fill="none" stroke={s.color} strokeWidth="34"
                strokeDasharray={`${Math.max(0, len - 1.5)} ${C}`} strokeDashoffset={-acc}
                transform="rotate(-90 100 100)"
                onClick={() => s.drill && setFocus(s.id)}
              />
            );
            acc += len;
            return el;
          })}
          {/* Внутри кольца ~100 единиц ширины: часы и минуты — отдельными строками, чтобы не вылезали. */}
          <text x="100" y="92" textAnchor="middle" className="donut-total">{Math.floor(total / HOUR_MS)} ч</text>
          <text x="100" y="114" textAnchor="middle" className="donut-min">{Math.floor((total % HOUR_MS) / 60_000)} мин</text>
          <text x="100" y="134" textAnchor="middle" className="donut-sub">{focus ? short(path.at(-1)!.name) : 'всего'}</text>
        </svg>
        <div className="legend-list">
      {legend.map((s) => (
        <div key={s.id} className={'legend' + (s.drill ? ' drill' : '')} onClick={() => s.drill && setFocus(s.id)}>
          <span className="dot" style={{ background: s.color }} />
          <span className="legend-name">{s.label}</span>
          <span className="legend-time">{formatDuration(s.ms)}{s.drill ? ' ›' : ''}</span>
        </div>
      ))}
        </div>
      </div>
    </div>
  );
}

// Столбики, разбитые по корневым занятиям. Рисуем SVG сами, без библиотек.
function Bars({ period, from, to, entries, activities, colors, now }: {
  period: Period; from: number; to: number; entries: Entry[]; activities: Activity[]; colors: Map<string, string>; now: number;
}) {
  const buckets = period === 'day'
    ? Array.from({ length: 24 }, (_, h) => [from + h * HOUR_MS, from + (h + 1) * HOUR_MS])
    : dayStarts(from, to).map((d, i, all) => [d, all[i + 1] ?? to]);
  const roots = childrenOf(activities, null);
  const rootIdOf = new Map(activities.map((a) => [a.id, rootOf(activities, a.id)!.id]));

  const data = buckets.map(([a, b]) => {
    const byRoot = new Map<string, number>();
    for (const e of entries) {
      const ms = Math.min(e.end ?? now, b) - Math.max(e.start, a);
      if (ms > 0) byRoot.set(rootIdOf.get(e.activityId)!, (byRoot.get(rootIdOf.get(e.activityId)!) ?? 0) + ms);
    }
    return byRoot;
  });
  const max = Math.max(period === 'day' ? HOUR_MS : 4 * HOUR_MS, ...data.map((m) => [...m.values()].reduce((x, y) => x + y, 0)));

  const W = 320, H = 80, gap = buckets.length > 10 ? 2 : 6;
  const bw = (W - gap * (buckets.length - 1)) / buckets.length;

  return (
    <>
      <svg viewBox={`0 0 ${W} ${H + 16}`} className="bars">
        {data.map((m, i) => {
          let y = H;
          const x = i * (bw + gap);
          return (
            <g key={i}>
              {roots.map((r) => {
                const h = ((m.get(r.id) ?? 0) / max) * H;
                if (h <= 0) return null;
                y -= h;
                return <rect key={r.id} x={x} y={y} width={bw} height={h} fill={colors.get(r.id)} />;
              })}
              {(period !== 'month' || i % 5 === 0) && (
                <text x={x + bw / 2} y={H + 12} textAnchor="middle" className="bar-label">
                  {period === 'day' ? (i % 6 === 0 ? i : '') : period === 'week' ? new Date(buckets[i][0]).toLocaleDateString('ru-RU', { weekday: 'short' }) : new Date(buckets[i][0]).getDate()}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </>
  );
}
