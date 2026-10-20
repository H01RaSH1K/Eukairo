import { useMemo, useState, type ReactNode } from 'react';
import type { Entry } from '../../db/schema';
import { activityColors } from '../../domain/colors';
import { pathOf } from '../../domain/tree';
import {
  HOUR_MS, MIN_MS, addLocalDays, formatClock, formatDuration, startOfLocalDay, startOfNextLocalDay,
} from '../../domain/time';
import { useMock } from '../../mock/store';
import { useNow } from '../../ui/useNow';
import { EntrySheet } from './EntrySheet';

const GAP_MIN_MS = 20 * MIN_MS; // пустоты короче не показываем

// Лента дня: записи по порядку, пустоты между ними можно заполнить задним числом.
export default function Timeline() {
  const { activities, entries } = useMock();
  const now = useNow(30_000);
  const [day, setDay] = useState(() => startOfLocalDay(Date.now()));
  const [selected, setSelected] = useState<{ entry: Entry; isNew: boolean } | null>(null);
  const colors = useMemo(() => activityColors(activities), [activities]);

  const dayEnd = startOfNextLocalDay(day);
  const today = startOfLocalDay(now);
  const list = entries.filter((e) => e.start < dayEnd && (e.end ?? now) > day);
  const total = list.reduce((s, e) => s + Math.min(e.end ?? now, dayEnd) - Math.max(e.start, day), 0);

  const title =
    day === today ? 'Сегодня'
    : day === addLocalDays(today, -1) ? 'Вчера'
    : new Date(day).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });

  const draft = (start: number, end: number) =>
    setSelected({
      entry: { id: crypto.randomUUID?.() ?? String(Date.now()), activityId: 'work', start, end, source: 'manual', updatedAt: Date.now() },
      isNew: true,
    });

  // Собираем строки: запись, пустота, запись…
  const rows: ReactNode[] = [];
  list.forEach((e, i) => {
    const prevEnd = i === 0 ? null : list[i - 1].end ?? now;
    if (prevEnd !== null && e.start - prevEnd >= GAP_MIN_MS) {
      rows.push(
        <button key={'gap' + e.id} className="gap" onClick={() => draft(prevEnd, e.start)}>
          Пусто {formatClock(prevEnd)}–{formatClock(e.start)} · {formatDuration(e.start - prevEnd)} <b>＋</b>
        </button>,
      );
    }
    const path = pathOf(activities, e.activityId).map((a) => a.name);
    const end = e.end ?? now;
    rows.push(
      <div key={e.id} className="entry" onClick={() => setSelected({ entry: e, isNew: false })}>
        <span className="entry-bar" style={{ background: colors.get(e.activityId) }} />
        <div className="entry-main">
          <div>{path.at(-1)}</div>
          {path.length > 1 && <div className="dim small">{path.slice(0, -1).join(' › ')}</div>}
          {e.note && <div className="dim small">“{e.note}”</div>}
        </div>
        <div className="entry-time">
          <div>{formatClock(e.start)}–{e.end ? formatClock(e.end) : <span className="live-text">сейчас</span>}</div>
          <div className="dim small">{formatDuration(end - e.start)}{e.source === 'manual' ? ' · вручную' : ''}</div>
        </div>
      </div>,
    );
  });

  return (
    <div className="screen fit">
      <div className="day-nav">
        <button onClick={() => setDay(addLocalDays(day, -1))}>‹</button>
        <div className="center">
          <h1 style={{ margin: 0 }}>{title}</h1>
          <div className="dim">полезного: {formatDuration(total)}</div>
        </div>
        <button disabled={day >= today} onClick={() => setDay(addLocalDays(day, 1))}>›</button>
      </div>

      <div className="widget entries">{rows.length ? rows : <p className="dim center">Записей нет</p>}</div>

      <button
        className="fab"
        onClick={() => (day === today ? draft(now - HOUR_MS, now) : draft(day + 12 * HOUR_MS, day + 13 * HOUR_MS))}
      >
        ＋
      </button>

      {selected && <EntrySheet entry={selected.entry} isNew={selected.isNew} onClose={() => setSelected(null)} />}
    </div>
  );
}
