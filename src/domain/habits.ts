// Привычки: засчитан ли день, серии, процент. Чистые функции, про базу и React не знают.
import type { Activity, Entry, Habit, HabitMark } from '../db/schema';
import { activityColors } from './colors';
import { addLocalDays, startOfLocalDay, startOfNextLocalDay } from './time';
import { subtreeIds } from './tree';

/** Ключ дня по местному времени: '2026-10-21'. */
export function dayKey(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Местная полночь дня по ключу. */
export function dayStartOf(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

/** День недели: 0 = понедельник … 6 = воскресенье (в JS getDay() начинает с воскресенья). */
export const weekdayOf = (t: number) => (new Date(t).getDay() + 6) % 7;

export const WEEKDAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];

/** «каждый день», «пн ср пт», «будни». */
export function scheduleText(h: Pick<Habit, 'weekdays'>): string {
  const w = h.weekdays;
  if (!w || w.length === 7) return 'каждый день';
  const s = [...w].sort().join();
  if (s === '0,1,2,3,4') return 'по будням';
  if (s === '5,6') return 'по выходным';
  return [...w].sort().map((i) => WEEKDAYS[i]).join(' ');
}

export interface DayStatus {
  due: boolean;       // день по расписанию и не раньше начала привычки (и не в будущем)
  done: boolean;      // засчитан
  progress: number;   // 0…1: для time — доля нормы, для остальных 0 или 1
  ms: number;         // для time: сколько протрекано за день
  marked: boolean;    // есть ручная отметка (для quit — срыв)
}

/** Протреканное время по занятию (с подзанятиями) с разбивкой по дням: ключ дня → мс. */
export function msByDay(entries: Entry[], activityIds: Set<string>, now: number): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of entries) {
    if (!activityIds.has(e.activityId)) continue;
    const end = e.end ?? now;
    // Запись через полночь делим между днями.
    for (let from = e.start; from < end; ) {
      const next = startOfNextLocalDay(from);
      const to = Math.min(end, next);
      const k = dayKey(from);
      m.set(k, (m.get(k) ?? 0) + to - from);
      from = to;
    }
  }
  return m;
}

/**
 * Всё про одну привычку на основе данных. Создаётся на каждую привычку при отрисовке;
 * время по дням считается один раз в конструкторе, дальше всё — поиск в Map.
 * class в TS почти как в C#: поля, конструктор, методы; `private` — только при компиляции.
 */
export class HabitBook {
  private marks = new Map<string, HabitMark>();
  private ms = new Map<string, number>();
  private today: number;
  private since: number;

  constructor(readonly habit: Habit, activities: Activity[], entries: Entry[], marks: HabitMark[], now: number) {
    for (const m of marks) if (m.habitId === habit.id) this.marks.set(m.day, m);
    if (habit.kind === 'time' && habit.activityId) this.ms = msByDay(entries, subtreeIds(activities, habit.activityId), now);
    this.today = startOfLocalDay(now);
    this.since = dayStartOf(habit.since);
  }

  /** Состояние за день, начинающийся в `day` (местная полночь). */
  status(day: number): DayStatus {
    const h = this.habit, k = dayKey(day);
    const due = day >= this.since && day <= this.today && (!h.weekdays || h.weekdays.includes(weekdayOf(day)));
    const marked = this.marks.get(k)?.done ?? false;
    const ms = this.ms.get(k) ?? 0;
    let progress: number;
    if (h.kind === 'time') progress = marked ? 1 : Math.min(1, ms / ((h.goalMin ?? 1) * 60_000));
    else if (h.kind === 'quit') progress = marked || day > this.today || day < this.since ? 0 : 1;
    else progress = marked ? 1 : 0;
    return { due, done: progress >= 1, progress, ms, marked };
  }

  /** Числа параметров, вписанные за день (у time ещё «минуты» — из трекинга, ключ TRACKED). */
  values(day: number): Record<string, number> {
    const v = { ...this.marks.get(dayKey(day))?.values };
    if (this.habit.kind === 'time') {
      const ms = this.ms.get(dayKey(day));
      if (ms) v[TRACKED] = Math.round(ms / 60_000);
    }
    return v;
  }

  /** Сегодня ещё не засчитан, но день не кончился — серию это не рвёт. */
  private pendingToday(day: number, s: DayStatus) {
    return day === this.today && !s.done;
  }

  /** Серия: сколько дней по расписанию подряд засчитано, считая назад от сегодня. */
  streak(): number {
    let n = 0;
    for (let day = this.today; day >= this.since; day = addLocalDays(day, -1)) {
      const s = this.status(day);
      if (!s.due || this.pendingToday(day, s)) continue;
      if (!s.done) break;
      n++;
    }
    return n;
  }

  /** Самая длинная серия за всё время. */
  best(): number {
    let best = 0, run = 0;
    for (let day = this.since; day <= this.today; day = addLocalDays(day, 1)) {
      const s = this.status(day);
      if (!s.due || this.pendingToday(day, s)) continue;
      run = s.done ? run + 1 : 0;
      best = Math.max(best, run);
    }
    return best;
  }

  /** Засчитано из дней по расписанию в [from, to); due = 0 — таких дней не было. */
  rate(from: number, to: number): { done: number; due: number } {
    let done = 0, due = 0;
    for (let day = Math.max(startOfLocalDay(from), this.since); day < to && day <= this.today; day = addLocalDays(day, 1)) {
      const s = this.status(day);
      if (!s.due || this.pendingToday(day, s)) continue;
      due++;
      if (s.done) done++;
    }
    return { done, due };
  }
}

/** Ключ встроенного параметра «минуты по занятию» у привычки по времени. */
export const TRACKED = 'tracked';

/** Параметры для графика: у привычки по занятию первым идут минуты из трекинга. */
export function chartParams(h: Habit): { id: string; name: string; unit?: string }[] {
  return [...(h.kind === 'time' ? [{ id: TRACKED, name: 'Время', unit: 'мин' }] : []), ...(h.params ?? [])];
}

/** Активные привычки по порядку. */
export const activeHabits = (habits: Habit[]) => habits.filter((h) => !h.archivedAt).sort((a, b) => a.order - b.order);

/** Цвет привычки: у привязанной к занятию — цвет занятия, иначе свой тон. */
export function habitColor(h: Habit, colors: Map<string, string>): string {
  return (h.kind === 'time' && h.activityId && colors.get(h.activityId)) || `hsl(${h.hue} 60% 58%)`;
}

/** Цвета всех привычек разом. */
export function habitColors(habits: Habit[], activities: Activity[]): Map<string, string> {
  const colors = activityColors(activities);
  return new Map(habits.map((h) => [h.id, habitColor(h, colors)]));
}

/** Тон для новой привычки — посередине самого широкого промежутка между занятыми. */
export function nextHabitHue(habits: Habit[]): number {
  const used = habits.filter((h) => !h.archivedAt).map((h) => h.hue).sort((a, b) => a - b);
  if (used.length === 0) return 150;
  let best = 0, gap = -1;
  used.forEach((h, i) => {
    const next = i + 1 < used.length ? used[i + 1] : used[0] + 360;
    if (next - h > gap) { gap = next - h; best = h + (next - h) / 2; }
  });
  return Math.round(best) % 360;
}
