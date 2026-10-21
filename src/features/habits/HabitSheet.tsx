import { useState, type CSSProperties } from 'react';
import { setHabitMark } from '../../db/commands';
import { useData } from '../../db/store';
import { HabitBook, WEEKDAYS, chartParams, dayKey, habitColors, scheduleText, weekdayOf } from '../../domain/habits';
import { addLocalDays, dayStarts, periodRange, shiftPeriod, startOfLocalDay } from '../../domain/time';
import { Sheet } from '../../ui/Sheet';
import { ChartKindSwitch, LineChart, saveChart, savedChart, type ChartKind } from '../../ui/LineChart';
import { HabitEditor } from './HabitEditor';
import { MarkSheet } from './MarkSheet';

const KIND_TEXT = { check: 'галочка', quit: 'держусь', time: 'по занятию' } as const;

// Карточка привычки: серия, рекорд, процент, месяц сеткой и график параметров по дням.
// Тап по дню в календаре — отметить или снять (так правятся прошлые дни).
export default function HabitSheet({ id, day, onClose }: { id: string; day: number; onClose: () => void }) {
  const { habits, habitMarks, activities, entries } = useData();
  const now = Date.now();
  const habit = habits.find((h) => h.id === id);
  const [month, setMonth] = useState(0);  // 0 = месяц открытого дня, -1 = предыдущий…
  const [param, setParam] = useState<string | null>(null);       // столбики: какой параметр
  const [shown, setShown] = useState<Set<string> | null>(null);   // линия: какие параметры включены
  const [asking, setAsking] = useState<number | null>(null); // день, за который спрашиваем числа
  const [editing, setEditing] = useState(false);
  const [chart, setChart] = useState<ChartKind>(() => savedChart('habit'));
  const pickChart = (k: ChartKind) => { setChart(k); saveChart('habit', k); };
  if (!habit) return null; // удалили, пока карточка была открыта
  const book = new HabitBook(habit, activities, entries, habitMarks, now);

  const color = habitColors([habit], activities).get(habit.id)!;
  const today = startOfLocalDay(now);
  const { from, to } = periodRange('month', shiftPeriod('month', day, month));
  const days = dayStarts(from, to);
  const r30 = book.rate(addLocalDays(today, -29), today + 1);
  const params = chartParams(habit);
  const pid = params.find((p) => p.id === param)?.id ?? params[0]?.id;

  const tapDay = (d: number) => {
    if (d > today) return;
    const s = book.status(d), k = dayKey(d);
    if (habit.kind === 'quit') void setHabitMark(habit.id, k, !s.marked);
    else if (s.marked) void setHabitMark(habit.id, k, false);
    else if (habit.params?.length) setAsking(d);
    else if (habit.kind === 'time' && s.done) return; // засчитано трекингом — снимать нечего
    else void setHabitMark(habit.id, k, true);
  };

  // Значения выбранного параметра по дням месяца (null — не вписано).
  const values = days.map((d) => (pid ? book.values(d)[pid] ?? null : null));
  const got = values.filter((v): v is number => v !== null);
  const max = Math.max(1, ...got);
  const unit = params.find((p) => p.id === pid)?.unit;
  // Линия: несколько параметров сразу, у каждого свой цвет (первый — цвет привычки).
  const on = shown ?? new Set(pid ? [pid] : []);
  const toggle = (id: string) => {
    const next = new Set(on);
    if (next.has(id)) { if (next.size > 1) next.delete(id); } else next.add(id);
    setShown(next);
  };
  const lineColor = (i: number) => (i === 0 ? color : SERIES_COLORS[(i - 1) % SERIES_COLORS.length]);
  const series = params.map((p, i) => ({ id: p.id, color: lineColor(i), values: days.map((d) => book.values(d)[p.id] ?? null) }))
    .filter((s) => on.has(s.id));
  const sameUnit = new Set(series.map((s) => params.find((p) => p.id === s.id)?.unit ?? '')).size <= 1;
  const W = 300, H = 70, bw = W / days.length;

  return (
    <Sheet onClose={onClose}>
      <div className="habit-card" style={{ '--hc': color } as CSSProperties}>
        <div className="habit-head">
          <span className="habit-big-icon">{habit.icon || habit.name[0]}</span>
          <div>
            <h2>{habit.name}</h2>
            <div className="dim small">
              {KIND_TEXT[habit.kind]}{habit.kind === 'time' ? ` · ${habit.goalMin} мин в день` : ''} · {scheduleText(habit)}
            </div>
          </div>
          <button className="btn small" onClick={() => setEditing(true)}>Изменить</button>
        </div>

        <div className="habit-stats">
          <div><b>{book.streak()}</b><span>дней подряд</span></div>
          <div><b>{book.best()}</b><span>рекорд</span></div>
          <div><b>{r30.due ? Math.round((r30.done / r30.due) * 100) + '%' : '—'}</b><span>за 30 дней</span></div>
        </div>

        <div className="stat-nav">
          <button className="nav-arrow" onClick={() => setMonth(month - 1)}>‹</button>
          <div className="stat-period">{new Date(from).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}</div>
          <button className="nav-arrow" disabled={to > today} onClick={() => setMonth(month + 1)}>›</button>
        </div>
        <div className="habit-cal">
          {WEEKDAYS.map((w) => <span key={w} className="wd">{w}</span>)}
          {/* пустые клетки до первого числа: месяц начинается не с понедельника */}
          {Array.from({ length: weekdayOf(from) }, (_, i) => <span key={'e' + i} />)}
          {days.map((d) => {
            const s = book.status(d);
            const cls = d > today ? 'future' : !s.due ? 'off' : s.done ? 'done' : habit.kind === 'quit' && s.marked ? 'broken' : s.progress > 0 ? 'part' : 'miss';
            return (
              <button key={d} className={'cal-day ' + cls + (d === today ? ' today' : '')} onClick={() => tapDay(d)}
                style={cls === 'part' ? { '--f': `${s.progress * 100}%` } as CSSProperties : undefined}>
                {new Date(d).getDate()}
              </button>
            );
          })}
        </div>

        {params.length > 0 && (
          <div className="habit-chart">
            <div className="chart-bar-row">
              <div className="chips">
                {chart === 'bars'
                  ? params.map((p) => <button key={p.id} aria-pressed={p.id === pid} onClick={() => setParam(p.id)}>{p.name}</button>)
                  // в режиме линии параметры включаются по отдельности, точка — цвет линии
                  : params.map((p, i) => (
                    <button key={p.id} aria-pressed={on.has(p.id)} onClick={() => toggle(p.id)}>
                      <span className="dot" style={{ background: on.has(p.id) ? lineColor(i) : 'var(--line)' }} /> {p.name}
                    </button>
                  ))}
              </div>
              <ChartKindSwitch value={chart} onChange={pickChart} />
            </div>
            <svg viewBox={`0 0 ${W} ${H + 14}`} className="bars">
              <line x1="0" x2={W} y1={H} y2={H} stroke="var(--line)" />
              {chart === 'bars' && values.map((v, i) => v !== null && (
                <rect key={i} x={i * bw + 1} y={H - (v / max) * H} width={bw - 2} height={Math.max(1, (v / max) * H)} rx="1.5" fill={color} />
              ))}
              {chart === 'line' && <LineChart series={series} bw={bw} h={H} scale={sameUnit ? 'shared' : 'own'} />}
              {days.map((d, i) => (i % 5 === 0 || i === days.length - 1) && (
                <text key={d} x={i * bw + bw / 2} y={H + 12} textAnchor="middle" className="bar-label">{new Date(d).getDate()}</text>
              ))}
            </svg>
            <div className="dim small">
              {chart === 'line' && series.length > 1 && !sameUnit && 'У каждой линии своя шкала: сравнивай ход, а не высоту. '}
              {chart === 'line' && series.length > 1 ? '' : got.length
                ? `среднее ${round(got.reduce((a, b) => a + b, 0) / got.length)} · максимум ${round(Math.max(...got))}${unit ? ' ' + unit : ''} · дней с числом: ${got.length}`
                : 'В этом месяце чисел нет. Они вписываются при отметке.'}
            </div>
          </div>
        )}

        {habit.kind === 'time' && <p className="dim small">Засчитывается сама, когда протрекано {habit.goalMin} мин. Забыл таймер — тапни день в календаре.</p>}
        {habit.kind === 'quit' && <p className="dim small">День засчитан, пока не отмечен срыв. Тап по дню — отметить или снять срыв.</p>}
      </div>

      {asking !== null && <MarkSheet habit={habit} day={asking} onClose={() => setAsking(null)} />}
      {editing && <HabitEditor habit={habit} onClose={() => setEditing(false)} onRemoved={onClose} />}
    </Sheet>
  );
}

const round = (v: number) => Math.round(v * 10) / 10;

// Цвета второй и следующих линий (первая — цвет привычки).
const SERIES_COLORS = ['#e8e8ee', '#f2c94c', '#56ccf2', '#ff8a65'];
