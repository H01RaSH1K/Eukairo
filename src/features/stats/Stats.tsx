import { useMemo, useState } from 'react';
import type { Activity, Entry } from '../../db/schema';
import { activityColors } from '../../domain/colors';
import { childrenOf, needIds, pathOf, subtreeIds } from '../../domain/tree';
import { HOUR_MS, dayStarts, formatDuration, periodRange, periodTitle, periodTitles, shiftPeriod, type Period } from '../../domain/time';
import { useData } from '../../db/store';
import { Segmented } from '../../ui/Segmented';
import { useNow } from '../../ui/useNow';
import { HabitStats } from '../habits/HabitStats';
import { PointStats } from '../points/PointStats';
import { ChartKindSwitch, LineChart, saveChart, scrub, savedChart, type ChartKind } from '../../ui/LineChart';
import { ExpandButton, FullChart, fullChartHeight } from '../../ui/FullChart';

// Время каждого занятия (только собственные записи) внутри [from, to). Нужды не считаем.
function ownTotals(entries: Entry[], from: number, to: number, now: number, needs: Set<string>) {
  const m = new Map<string, number>();
  for (const e of entries) {
    if (needs.has(e.activityId)) continue;
    const ms = Math.min(e.end ?? now, to) - Math.max(e.start, from);
    if (ms > 0) m.set(e.activityId, (m.get(e.activityId) ?? 0) + ms);
  }
  return m;
}

export default function Stats() {
  const { activities, entries } = useData();
  const now = useNow(60_000);
  const [period, setPeriod] = useState<Period>('week');
  const [focus, setFocus] = useState<string | null>(null); // какой узел раскрыт в круговой
  const colors = useMemo(() => activityColors(activities), [activities]);
  const needs = useMemo(() => needIds(activities), [activities]);
  // Сводки — только про полезное время: нужды убираем из дерева (их итог — строкой под общим).
  const useful = useMemo(() => activities.filter((a) => !needs.has(a.id)), [activities, needs]);

  const [offset, setOffset] = useState(0); // 0 = текущий период, -1 = предыдущий…
  const [view, setView] = useState<'time' | 'habits' | 'points'>('time');
  const isCurrent = offset === 0;
  const { from, to } = periodRange(period, shiftPeriod(period, now, offset));
  const prev = periodRange(period, from - 1);
  const own = ownTotals(entries, from, to, now, needs);
  const needMs = entries.reduce((s, e) => s + (needs.has(e.activityId) ? Math.max(0, Math.min(e.end ?? now, to) - Math.max(e.start, from)) : 0), 0);
  // Время узла = свои записи + все потомки.
  const sum = (id: string) => [...subtreeIds(activities, id)].reduce((s, x) => s + (own.get(x) ?? 0), 0);
  const total = [...own.values()].reduce((a, b) => a + b, 0);
  // Текущий период сравниваем с тем же отрезком прошлого («к этому моменту»), прошедший — целиком.
  const prevTo = isCurrent ? prev.from + (now - from) : prev.to;
  const prevTotal = [...ownTotals(entries, prev.from, prevTo, now, needs).values()].reduce((a, b) => a + b, 0);
  const delta = total - prevTotal;
  // Среднее в день: у текущего периода делим на прошедшие дни (вместе с сегодняшним).
  const days = dayStarts(from, to).filter((d) => d <= now).length;

  const prevName = { day: 'вчера', week: 'прошлой неделе', month: 'прошлому месяцу' }[period];
  const prevWord = isCurrent ? prevName : { day: 'дню раньше', week: 'неделе раньше', month: 'месяцу раньше' }[period];
  const go = (next: number) => { setOffset(Math.min(0, next)); setFocus(null); };

  const nav = (
    <div className="stat-nav">
      <button className="nav-arrow" onClick={() => go(offset - 1)}>‹</button>
      <div className="stat-period" onClick={() => go(0)}>{isCurrent ? periodTitles[period] : periodTitle(period, from, to)}</div>
      <button className="nav-arrow" disabled={isCurrent} onClick={() => go(offset + 1)}>›</button>
    </div>
  );

  return (
    <div className="screen fit">
      <div className="page-head stats-head">
        <h1>Сводки</h1>
        <div className="chips">
          <button aria-pressed={view === 'time'} onClick={() => setView('time')}>Время</button>
          <button aria-pressed={view === 'habits'} onClick={() => setView('habits')}>Привычки</button>
          <button aria-pressed={view === 'points'} onClick={() => setView('points')}>Записи</button>
        </div>
      </div>
      <Segmented
        options={[{ id: 'day', label: 'Сегодня' }, { id: 'week', label: 'Неделя' }, { id: 'month', label: 'Месяц' }]}
        value={period}
        onChange={(p) => { setPeriod(p); setOffset(0); setFocus(null); }}
      />

      {view === 'habits' && (
        <>
          <div className="widget pad">{nav}</div>
          <HabitStats period={period} from={from} to={to} now={now} />
        </>
      )}

      {view === 'points' && (
        <>
          <div className="widget pad">{nav}</div>
          <PointStats period={period} from={from} to={to} now={now} />
        </>
      )}

      {view === 'time' && <>
      <div className="widget pad stat-total">
        {nav}
        <div className="big">{formatDuration(total)}</div>
        <div className={delta >= 0 ? 'up' : 'down'}>
          {delta >= 0 ? '▲' : '▼'} {formatDuration(Math.abs(delta))} {isCurrent ? (period === 'day' ? 'к вчера на это время' : `к ${prevName} на этот момент`) : `к ${prevWord}`}
        </div>
        {period !== 'day' && days > 0 && <div className="dim small">в среднем {formatDuration(total / days)} в день</div>}
        {needMs > 0 && <div className="dim small">нужды: {formatDuration(needMs)} — не в счёт</div>}
      </div>

      <Donut activities={useful} colors={colors} focus={focus} setFocus={setFocus} sum={sum} own={own} />

      <div className="widget pad bars-widget">
        <Bars
          key={`${period}:${offset}:${focus}`} // новый период или узел — выбор столбика сбрасывается
          period={period} from={from} to={to} entries={entries.filter((e) => !needs.has(e.activityId))}
          activities={useful} colors={colors} now={now} focus={focus}
        />
      </div>
      </>}
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
  // withArchived: завершённые проекты остаются в сводках за те периоды, где по ним есть время
  const slices = childrenOf(activities, focus, true)
    .map((a) => ({ id: a.id, label: a.name, ms: sum(a.id), color: colors.get(a.id)!, drill: childrenOf(activities, a.id, true).some((k) => sum(k.id) > 0) }))
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

// Столбики, разбитые по занятиям уровня, раскрытого в круговой (сначала — корневые).
// Рисуем SVG сами, без библиотек. Тап по столбику — его цифры над графиком.
function Bars({ period, from, to, entries, activities, colors, now, focus }: {
  period: Period; from: number; to: number; entries: Entry[]; activities: Activity[]; colors: Map<string, string>; now: number; focus: string | null;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const [chart, setChart] = useState<ChartKind>(() => savedChart('stats'));
  const [shown, setShown] = useState<Set<string> | null>(null); // линия: какие линии включены
  const [full, setFull] = useState(false);                         // график на весь экран
  const buckets = period === 'day'
    ? Array.from({ length: 24 }, (_, h) => [from + h * HOUR_MS, from + (h + 1) * HOUR_MS])
    : dayStarts(from, to).map((d, i, all) => [d, all[i + 1] ?? to]);
  // Группы — дети раскрытого узла; собственные записи узла идут его цветом отдельной группой.
  const groups = [...childrenOf(activities, focus, true).map((a) => ({ id: a.id, name: a.name })), ...(focus ? [{ id: focus, name: 'без подзанятия' }] : [])];
  // Занятие → группа (≈ Dictionary). Записи вне раскрытого узла в столбики не попадают.
  const groupOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of activities) {
      const path = pathOf(activities, a.id);
      if (!focus) { m.set(a.id, path[0].id); continue; }
      const i = path.findIndex((x) => x.id === focus);
      if (i >= 0) m.set(a.id, path[i + 1]?.id ?? focus);
    }
    return m;
  }, [activities, focus]);

  const data = buckets.map(([a, b]) => {
    const byGroup = new Map<string, number>();
    for (const e of entries) {
      const g = groupOf.get(e.activityId);
      const ms = Math.min(e.end ?? now, b) - Math.max(e.start, a);
      if (g && ms > 0) byGroup.set(g, (byGroup.get(g) ?? 0) + ms);
    }
    return byGroup;
  });
  const totals = data.map((m) => [...m.values()].reduce((x, y) => x + y, 0));
  const max = Math.max(period === 'day' ? HOUR_MS : 4 * HOUR_MS, ...totals);

  const W = 320, gap = buckets.length > 10 ? 2 : 6;
  const bw = (W - gap * (buckets.length - 1)) / buckets.length;
  const bucketName = (i: number) => period === 'day'
    ? `${i}:00–${i + 1}:00`
    : new Date(buckets[i][0]).toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' });

  // Линия: «Всего» плюс линия на каждое занятие уровня, в минутах. Будущие столбцы — без точки.
  // По умолчанию включены «Всего» и три самых больших занятия.
  const TOTAL = '__total';
  const sumOf = (id: string) => data.reduce((s, m) => s + (m.get(id) ?? 0), 0);
  const ranked = groups.filter((g) => sumOf(g.id) > 0).sort((a, b) => sumOf(b.id) - sumOf(a.id));
  const on = shown ?? new Set([TOTAL, ...ranked.slice(0, 3).map((g) => g.id)]);
  const toggle = (id: string) => {
    const next = new Set(on);
    if (next.has(id)) { if (next.size > 1) next.delete(id); } else next.add(id);
    setShown(next);
  };
  const minutes = (get: (i: number) => number) => buckets.map(([a], i) => (a > now ? null : get(i) / 60_000));
  const lines = [
    { id: TOTAL, name: 'Всего', color: 'var(--text)', values: minutes((i) => totals[i]) },
    ...ranked.map((g) => ({ id: g.id, name: g.name, color: colors.get(g.id)!, values: minutes((i) => data[i].get(g.id) ?? 0) })),
  ];
  const fmt = (m: number) => (m >= 60 ? `${Math.round(m / 6) / 10} ч` : `${Math.round(m)} мин`);

  const pickChart = (k: ChartKind) => { setChart(k); saveChart('stats', k); };
  const lastPast = Math.max(0, buckets.filter(([a]) => a <= now).length - 1); // дальше будущее — выбирать нечего
  const title = period === 'day' ? 'По часам' : 'По дням';

  // Над графиком: выбранный тапом столбец и его числа, иначе — заголовок с переключателями.
  const head = (isFull: boolean) => picked === null ? (
    <div className="card-title chart-head">
      <span>{isFull ? '' : title + ' · '}тапни {chart === 'line' ? 'точку' : 'столбик'}</span>
      <span className="chart-tools">
        <ChartKindSwitch value={chart} onChange={pickChart} />
        {!isFull && <ExpandButton onClick={() => setFull(true)} />}
      </span>
    </div>
  ) : chart === 'line' ? (
    <div className="card-title bar-pick" onClick={() => setPicked(null)}>
      <b>{bucketName(picked)}</b>
      {lines.filter((l) => on.has(l.id) && l.values[picked] !== null).map((l) => (
        <span key={l.id}> · <span className="dot" style={{ background: l.color }} />{short(l.name)} {formatDuration(l.values[picked]! * 60_000)}</span>
      ))}
    </div>
  ) : (
    <div className="card-title bar-pick" onClick={() => setPicked(null)}>
      <b>{bucketName(picked)}: {formatDuration(totals[picked])}</b>
      {groups.filter((g) => data[picked].get(g.id)).sort((x, y) => data[picked].get(y.id)! - data[picked].get(x.id)!).slice(0, isFull ? 8 : 3).map((g) => (
        <span key={g.id}> · <span className="dot" style={{ background: colors.get(g.id) }} />{short(g.name)} {formatDuration(data[picked].get(g.id)!)}</span>
      ))}
    </div>
  );

  // Сам график; рисуется дважды: в карточке (h = 80) и на весь экран.
  const body = (H: number, isFull: boolean) => (
    <>
      {head(isFull)}
      {chart === 'line' && (
        <div className={'chips-scroll line-toggles' + (isFull ? ' wrap' : '')}>
          {lines.map((l) => (
            <button key={l.id} aria-pressed={on.has(l.id)} onClick={() => toggle(l.id)}>
              <span className="dot" style={{ background: on.has(l.id) ? l.color : 'var(--line)' }} /> {short(l.name)}
            </button>
          ))}
        </div>
      )}
      {/* столбец i занимает [i·(bw+gap) − gap/2, (i+1)·(bw+gap) − gap/2) — по доле ширины находим, в какой попал палец */}
      <svg viewBox={`0 0 ${W} ${H + 16}`} className="bars scrub" style={isFull ? { height: 'auto' } : undefined}
        {...scrub(buckets.length, (f) => Math.min(lastPast, Math.floor((f * W + gap / 2) / (bw + gap))), picked, setPicked)}>
        {/* шаг точек = столбик + промежуток; сдвиг на полпромежутка — точка по центру столбика */}
        {chart === 'line' && <g transform={`translate(${-gap / 2} 0)`}><LineChart series={lines.filter((l) => on.has(l.id))} bw={bw + gap} h={H} scale="shared" format={fmt} picked={picked} /></g>}
        {data.map((m, i) => {
          let y = H;
          const x = i * (bw + gap);
          return (
            <g key={i} opacity={chart === 'line' || picked === null || picked === i ? 1 : 0.35}>
              {chart === 'bars' && groups.map((g) => {
                const h = ((m.get(g.id) ?? 0) / max) * H;
                if (h <= 0) return null;
                y -= h;
                return <rect key={g.id} x={x} y={y} width={bw} height={h} fill={colors.get(g.id)} />;
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

  return (
    <>
      {body(80, false)}
      {full && (
        <FullChart title={title} onClose={() => setFull(false)}>
          <div className="full-stats">{body(fullChartHeight(W, 220), true)}</div>
        </FullChart>
      )}
    </>
  );
}
