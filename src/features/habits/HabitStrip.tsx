import { Suspense, lazy, useMemo, useRef, useState, type PointerEvent } from 'react';
import type { Habit } from '../../db/schema';
import { setHabitMark } from '../../db/commands';
import { useData } from '../../db/store';
import { HabitBook, activeHabits, dayKey, habitColors, type DayStatus } from '../../domain/habits';
import { startOfLocalDay } from '../../domain/time';
import { PointSheet } from '../points/PointSheet';

// Карточка привычки (серия, календарь, график) нужна реже — её код грузим при первом открытии.
const HabitSheet = lazy(() => import('./HabitSheet'));

const LONG_MS = 450; // долгий тап — открыть карточку привычки

// Полоска привычек на «Сегодня»: кружок на каждую привычку, которая положена в этот день.
// Тап — отметить (по записям — открыть записи занятия за день), долгий тап — карточка привычки.
// Привычка по занятию отмечается сама, тап по ней сразу открывает карточку.
export function HabitStrip({ day, now }: { day: number; now: number }) {
  const { habits, habitMarks, activities, entries, points } = useData();
  const [open, setOpen] = useState<string | null>(null);
  const [asking, setAsking] = useState<Habit | null>(null);
  const colors = useMemo(() => habitColors(habits, activities), [habits, activities]);
  // Серии и прогресс пересчитываем раз в минуту, а не на каждый тик секундного таймера.
  const minute = Math.floor(now / 60_000);
  const books = useMemo(
    () => activeHabits(habits).map((h) => new HabitBook(h, activities, entries, habitMarks, minute * 60_000, points)),
    [habits, activities, entries, habitMarks, points, minute],
  );
  const shown = books.filter((b) => b.status(day).due);
  if (shown.length === 0) return open ? <Suspense fallback={null}><HabitSheet id={open} day={day} onClose={() => setOpen(null)} /></Suspense> : null;

  const tap = (b: HabitBook, s: DayStatus) => {
    const h = b.habit, k = dayKey(day);
    if (h.kind === 'time') setOpen(h.id);
    else if (h.kind === 'quit') void setHabitMark(h.id, k, !s.marked);   // тап = «сорвался» / «нет, держусь»
    else if (h.kind === 'points') setAsking(h);   // по записям — лист записей за день (там же удалить)
    else if (s.done) void setHabitMark(h.id, k, false);
    else void setHabitMark(h.id, k, true);
  };

  return (
    <>
      <div className="habit-strip">
        {shown.map((b) => (
          <HabitChip key={b.habit.id} book={b} day={day} color={colors.get(b.habit.id)!}
            isToday={day === startOfLocalDay(now)} onTap={tap} onLong={() => setOpen(b.habit.id)} />
        ))}
      </div>
      {asking?.activityId && <PointSheet activityId={asking.activityId} day={day} onClose={() => setAsking(null)} />}
      {open && <Suspense fallback={null}><HabitSheet id={open} day={day} onClose={() => setOpen(null)} /></Suspense>}
    </>
  );
}

function HabitChip({ book, day, color, isToday, onTap, onLong }: {
  book: HabitBook; day: number; color: string; isToday: boolean;
  onTap: (b: HabitBook, s: DayStatus) => void; onLong: () => void;
}) {
  const h = book.habit;
  const s = book.status(day);
  const streak = isToday ? book.streak() : 0; // серию показываем только за сегодня
  const press = useRef<{ x: number; timer: number; long: boolean } | null>(null);

  // Свой разбор тапа: долгое нажатие — карточка; сдвинули палец — это прокрутка полоски, не тап.
  const down = (e: PointerEvent) => {
    const p = { x: e.clientX, long: false, timer: 0 };
    p.timer = window.setTimeout(() => { p.long = true; onLong(); }, LONG_MS);
    press.current = p;
  };
  const move = (e: PointerEvent) => {
    const p = press.current;
    if (p && Math.abs(e.clientX - p.x) > 10) { clearTimeout(p.timer); press.current = null; }
  };
  const up = () => {
    const p = press.current;
    press.current = null;
    if (!p) return;
    clearTimeout(p.timer);
    if (!p.long) onTap(book, s);
  };

  const R = 16, C = 2 * Math.PI * R;
  const broken = h.kind === 'quit' && s.marked;
  const label = h.kind === 'time' && !s.done ? `${Math.floor(s.ms / 60_000)}/${h.goalMin} мин` : broken ? 'сорвался' : h.name;

  return (
    <button className={'habit-chip' + (s.done ? ' done' : '') + (broken ? ' broken' : '')} aria-pressed={s.done} aria-label={h.name}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { if (press.current) clearTimeout(press.current.timer); press.current = null; }}
      onContextMenu={(e) => e.preventDefault()}>
      <svg viewBox="0 0 40 40">
        <circle cx="20" cy="20" r={R} fill={s.done ? color : 'none'} fillOpacity=".22" stroke="var(--line)" strokeWidth="3" />
        {/* дуга прогресса: пунктир длиной в долю окружности (как секторы круговой в сводках) */}
        <circle cx="20" cy="20" r={R} fill="none" stroke={broken ? '#ff6b6b' : color} strokeWidth="3" strokeLinecap="round"
          strokeDasharray={`${C * (broken ? 1 : s.progress)} ${C}`} transform="rotate(-90 20 20)" className="habit-arc" />
        <text x="20" y="25.5" textAnchor="middle" className="habit-icon">{h.icon || h.name[0]}</text>
      </svg>
      <span className="habit-label">{label}</span>
      <span className="habit-streak">{streak > 1 ? `${streak} дн` : ''}</span>
    </button>
  );
}
