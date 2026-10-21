import { Suspense, lazy, useMemo, useState, type CSSProperties } from 'react';
import { useData } from '../../db/store';
import { HabitBook, activeHabits, habitColors } from '../../domain/habits';
import { dayStarts, type Period } from '../../domain/time';

const HabitSheet = lazy(() => import('./HabitSheet'));

// Привычки в «Сводках»: строка на привычку, клетка на день периода, справа процент.
// Пунктирная клетка — в этот день привычка не по расписанию. Тап по строке — карточка привычки.
export function HabitStats({ period, from, to, now }: { period: Period; from: number; to: number; now: number }) {
  const { habits, habitMarks, activities, entries, points } = useData();
  const [open, setOpen] = useState<string | null>(null);
  const colors = useMemo(() => habitColors(habits, activities), [habits, activities]);
  const books = useMemo(
    () => activeHabits(habits).map((h) => new HabitBook(h, activities, entries, habitMarks, now, points)),
    [habits, activities, entries, habitMarks, points, now],
  );
  const days = dayStarts(from, to);
  const rows = books.map((b) => ({ b, r: b.rate(from, to) }));
  const done = rows.reduce((s, x) => s + x.r.done, 0), due = rows.reduce((s, x) => s + x.r.due, 0);

  if (books.length === 0) {
    return <div className="widget pad center dim habit-stats-card">Привычек пока нет. Добавь их в «Ещё → Привычки».</div>;
  }

  return (
    <div className="widget pad habit-stats-card">
      <div className="card-title habit-total">
        <span>Привычки</span>
        <span>{due ? `${done} из ${due} · ${Math.round((done / due) * 100)}%` : 'ещё нечего считать'}</span>
      </div>
      <div className={'habit-grid ' + period} style={{ '--n': days.length } as CSSProperties}>
        {period !== 'day' && (
          <div className="habit-grid-row head">
            <span />
            {days.map((d, i) => (
              <span key={d} className="wd">
                {period === 'week' ? new Date(d).toLocaleDateString('ru-RU', { weekday: 'short' }) : i % 5 === 0 ? new Date(d).getDate() : ''}
              </span>
            ))}
            <span />
          </div>
        )}
        {rows.map(({ b, r }) => (
          <div key={b.habit.id} className="habit-grid-row" onClick={() => setOpen(b.habit.id)}>
            {/* на месяце клеток много — от названия остаётся только иконка */}
            <span className="hg-name">{period === 'month' && b.habit.icon ? b.habit.icon : `${b.habit.icon ? b.habit.icon + ' ' : ''}${b.habit.name}`}</span>
            {days.map((d) => {
              const s = b.status(d);
              const cls = d > now ? 'future' : !s.due ? 'off' : s.done ? 'done' : s.progress > 0 ? 'part' : 'miss';
              return <span key={d} className={'hg-cell ' + cls} style={{ '--hc': colors.get(b.habit.id), '--f': `${s.progress * 100}%` } as CSSProperties} />;
            })}
            <span className="hg-pct">{r.due ? `${Math.round((r.done / r.due) * 100)}%` : '—'}</span>
          </div>
        ))}
      </div>
      {open && <Suspense fallback={null}><HabitSheet id={open} day={Math.min(now, to - 1)} onClose={() => setOpen(null)} /></Suspense>}
    </div>
  );
}
