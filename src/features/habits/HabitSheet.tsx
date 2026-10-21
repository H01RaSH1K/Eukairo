import { useState, type CSSProperties } from 'react';
import { setHabitMark } from '../../db/commands';
import { useData } from '../../db/store';
import { HabitBook, WEEKDAYS, chartParams, dayKey, habitColors, habitParams, scheduleText, weekdayOf } from '../../domain/habits';
import { choiceParams } from '../../domain/points';
import { addLocalDays, dayStarts, periodRange, shiftPeriod, startOfLocalDay } from '../../domain/time';
import { Sheet } from '../../ui/Sheet';
import { ParamChart } from '../points/ParamChart';
import { PointSheet } from '../points/PointSheet';
import { HabitEditor } from './HabitEditor';

const KIND_TEXT = { check: 'галочка', quit: 'держусь', time: 'время занятия', points: 'по записям занятия' } as const;

// Карточка привычки: серия, рекорд, процент, месяц сеткой и график чисел из записей по дням.
// Тап по дню в календаре — отметить или снять (так правятся прошлые дни).
export default function HabitSheet({ id, day, onClose }: { id: string; day: number; onClose: () => void }) {
  const { habits, habitMarks, activities, entries, points } = useData();
  const now = Date.now();
  const habit = habits.find((h) => h.id === id);
  const [month, setMonth] = useState(0);  // 0 = месяц открытого дня, -1 = предыдущий…
  const [asking, setAsking] = useState<number | null>(null); // день, за который открыты записи
  const [editing, setEditing] = useState(false);
  if (!habit) return null; // удалили, пока карточка была открыта
  const book = new HabitBook(habit, activities, entries, habitMarks, now, points);

  const color = habitColors([habit], activities).get(habit.id)!;
  const today = startOfLocalDay(now);
  const { from, to } = periodRange('month', shiftPeriod('month', day, month));
  const days = dayStarts(from, to);
  const r30 = book.rate(addLocalDays(today, -29), today + 1);
  const numbers = chartParams(habit, activities);
  const params = habitParams(habit, activities);

  const tapDay = (d: number) => {
    if (d > today) return;
    const s = book.status(d), k = dayKey(d);
    if (habit.kind === 'quit') void setHabitMark(habit.id, k, !s.marked);
    else if (habit.kind === 'points') setAsking(d); // записи за день: добавить или удалить
    else if (s.marked) void setHabitMark(habit.id, k, false);
    else if (habit.kind === 'time' && s.done) return; // засчитано трекингом — снимать нечего
    else void setHabitMark(habit.id, k, true);
  };

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

        {numbers.length > 0 && (
          <ParamChart days={days} today={today} numbers={numbers} choices={choiceParams(params)} color={color} chartKey="habit"
            pointsAt={(i) => book.points(days[i])} valuesAt={(i, keep) => book.values(days[i], keep)}
            fullTitle={<>{habit.icon} {habit.name} · {new Date(from).toLocaleDateString('ru-RU', { month: 'long' })}</>}
            empty={habit.kind === 'time' ? 'В этом месяце времени по занятию нет.' : 'В этом месяце записей нет. Тапни день, чтобы добавить.'} />
        )}

        {habit.kind === 'time' && <p className="dim small">Засчитывается сама, когда протрекано {habit.goalMin} мин. Забыл таймер — тапни день в календаре.</p>}
        {habit.kind === 'points' && <p className="dim small">Засчитывается сама, когда за день есть запись по занятию. Тап по дню — записи этого дня.</p>}
        {habit.kind === 'quit' && <p className="dim small">День засчитан, пока не отмечен срыв. Тап по дню — отметить или снять срыв.</p>}
      </div>

      {asking !== null && habit.activityId && <PointSheet activityId={habit.activityId} day={asking} onClose={() => setAsking(null)} />}
      {editing && <HabitEditor habit={habit} onClose={() => setEditing(false)} onRemoved={onClose} />}
    </Sheet>
  );
}

