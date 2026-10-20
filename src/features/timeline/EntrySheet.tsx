import { useMemo, useState } from 'react';
import type { Entry } from '../../db/schema';
import { activityColors } from '../../domain/colors';
import { findOverlaps } from '../../domain/overlaps';
import { pathOf } from '../../domain/tree';
import { HOUR_MS, MIN_MS, formatClock, formatDuration, startOfLocalDay } from '../../domain/time';
import { deleteEntry, saveEntry, stopTimer, useMock } from '../../mock/store';
import { Sheet } from '../../ui/Sheet';
import { ActivityPicker } from '../activities/ActivityPicker';

// «14:05» → мс внутри дня `base`.
function parseClock(base: number, s: string): number {
  const [h, m] = s.split(':').map(Number);
  return base + h * HOUR_MS + m * MIN_MS;
}

// Правка существующей записи или ввод новой задним числом.
export function EntrySheet({ entry, isNew, onClose }: { entry: Entry; isNew: boolean; onClose: () => void }) {
  const { activities, entries } = useMock();
  const colors = useMemo(() => activityColors(activities), [activities]);
  const [activityId, setActivityId] = useState(entry.activityId);
  const [startStr, setStartStr] = useState(formatClock(entry.start));
  const [endStr, setEndStr] = useState(entry.end === null ? '' : formatClock(entry.end));
  const [note, setNote] = useState(entry.note ?? '');
  const [picking, setPicking] = useState(false);

  const isRunning = entry.end === null;
  const base = startOfLocalDay(entry.start);
  const now = Date.now();
  const start = parseClock(base, startStr);
  let end = isRunning ? now : parseClock(base, endStr);
  if (end <= start) end += 24 * HOUR_MS; // конец раньше начала → это уже следующий день
  const valid = !Number.isNaN(start) && !Number.isNaN(end) && end > start;

  const others = entries.filter((e) => e.id !== entry.id);
  const conflicts = valid ? findOverlaps(others, start, end, now) : [];
  const name = (id: string) => pathOf(activities, id).map((a) => a.name).join(' › ');

  const save = () => {
    saveEntry({ ...entry, activityId, start, end: isRunning ? null : end, note: note || undefined });
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
        <p className="dim center">{valid ? formatDuration(end - start) : 'Проверь время'}</p>

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
          activities={activities}
          colors={colors}
          title="Занятие"
          onPick={(id) => { setActivityId(id); setPicking(false); }}
          onClose={() => setPicking(false)}
        />
      )}
    </Sheet>
  );
}
