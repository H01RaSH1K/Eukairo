import { useMemo, useState } from 'react';
import type { Entry } from '../../db/schema';
import { activityColors } from '../../domain/colors';
import { findOverlaps } from '../../domain/overlaps';
import { isTimeless, pathOf } from '../../domain/tree';
import { MIN_MS, addLocalDays, formatClock, formatDuration, startOfLocalDay } from '../../domain/time';
import { deleteEntry, saveEntry, stopTimer } from '../../db/commands';
import { withPlannedMs } from '../../domain/timer';
import { useData } from '../../db/store';
import { Sheet } from '../../ui/Sheet';
import { ActivityPicker } from '../activities/ActivityPicker';

// «14:05» → момент внутри дня `base` (через календарь, чтобы перевод часов не сдвигал время).
function parseClock(base: number, s: string): number {
  const [h, m] = s.split(':').map(Number);
  const d = new Date(base);
  d.setHours(h, m, 0, 0);
  return d.getTime();
}

// Дата для <input type="date">: «2026-10-20» по местному времени, и обратно.
const toDateStr = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const fromDateStr = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
};

const QUICK_DURATIONS = [15, 30, 60, 90, 120]; // минуты: «начало + длительность» в одно касание

// Правка существующей записи или ввод новой задним числом.
export function EntrySheet({ entry, isNew, onClose }: { entry: Entry; isNew: boolean; onClose: () => void }) {
  const { activities, entries } = useData();
  const colors = useMemo(() => activityColors(activities), [activities]);
  const [activityId, setActivityId] = useState(entry.activityId);
  const [dateStr, setDateStr] = useState(toDateStr(entry.start));
  const [startStr, setStartStr] = useState(formatClock(entry.start));
  const [endStr, setEndStr] = useState(entry.end === null ? '' : formatClock(entry.end));
  const [note, setNote] = useState(entry.note ?? '');
  const [picking, setPicking] = useState(false);

  const isRunning = entry.end === null;
  const base = dateStr ? fromDateStr(dateStr) : startOfLocalDay(entry.start);
  const now = Date.now();
  const start = parseClock(base, startStr);
  let end = isRunning ? now : parseClock(base, endStr);
  if (end <= start && !isRunning) end = parseClock(addLocalDays(base, 1), endStr); // конец раньше начала → это уже следующий день
  const known = activities.some((a) => a.id === activityId);
  const problem =
    Number.isNaN(start) || Number.isNaN(end) ? 'Проверь время'
    : !known ? 'Выбери занятие'
    : end > now + MIN_MS ? 'Это ещё не наступило — конец в будущем'
    : end <= start ? 'Начало позже, чем сейчас'
    : null;
  const valid = problem === null;

  const others = entries.filter((e) => e.id !== entry.id);
  const conflicts = valid ? findOverlaps(others, start, end, now) : [];
  const name = (id: string) => pathOf(activities, id).map((a) => a.name).join(' › ');

  const save = () => {
    // withPlannedMs: у таймера на время остаётся длительность, конец поедет вместе с началом.
    void saveEntry({ ...withPlannedMs(entry), activityId, start, end: isRunning ? null : end, note: note || undefined });
    onClose();
  };

  return (
    <Sheet title={isNew ? 'Новая запись' : isRunning ? 'Идущий таймер' : 'Запись'} onClose={onClose}>
      <div className="form">
        <button className="field" onClick={() => setPicking(true)}>
          <span className="dot" style={{ background: colors.get(activityId) }} />
          <span className="field-value">{name(activityId)}</span>
          <span className="dim">›</span>
        </button>

        <label className="field">
          <span className="dim">Дата</span>
          <input type="date" value={dateStr} max={toDateStr(now)} onChange={(e) => setDateStr(e.target.value)} />
        </label>

        <div className="field-row">
          <label className="field time">
            <span className="dim">Начало</span>
            <input type="time" value={startStr} onChange={(e) => setStartStr(e.target.value)} />
          </label>
          <label className="field time">
            <span className="dim">Конец</span>
            {isRunning
              ? <span className="field-value live-text">идёт</span>
              : <input type="time" value={endStr} onChange={(e) => setEndStr(e.target.value)} />}
          </label>
        </div>
        {!isRunning && (
          <div className="chips dur-chips">
            {QUICK_DURATIONS.map((m) => (
              <button key={m} aria-pressed={valid && end - start === m * MIN_MS} onClick={() => setEndStr(formatClock(start + m * MIN_MS))}>
                {m < 60 ? `${m} мин` : `${m / 60} ч`.replace('.5', ',5')}
              </button>
            ))}
          </div>
        )}
        <p className="dim center">{valid ? formatDuration(end - start) : problem}</p>

        <input className="field" placeholder="Заметка" value={note} onChange={(e) => setNote(e.target.value)} />

        {conflicts.length > 0 && (
          <div className="warn">
            Пересекается с: {conflicts.map((c) => `${name(c.activityId)} ${formatClock(c.start)}–${c.end ? formatClock(c.end) : 'сейчас'}`).join('; ')}.
            При сохранении они будут обрезаны или разделены.
          </div>
        )}

        <button className="btn primary" disabled={!valid} onClick={save}>Сохранить</button>
        {isRunning && <button className="btn" onClick={() => { stopTimer(); onClose(); }}>Остановить сейчас</button>}
        {!isNew && <button className="btn danger" onClick={() => { deleteEntry(entry.id); onClose(); }}>Удалить</button>}
      </div>

      {picking && (
        <ActivityPicker
          activities={activities.filter((a) => !isTimeless(activities, a.id))}
          colors={colors}
          title="Занятие"
          onPick={(id) => { setActivityId(id); setPicking(false); }}
          onClose={() => setPicking(false)}
        />
      )}
    </Sheet>
  );
}
