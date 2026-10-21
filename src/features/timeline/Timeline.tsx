import { useMemo, useState, type ReactNode } from 'react';
import type { Entry, Point } from '../../db/schema';
import { activityColors } from '../../domain/colors';
import { isHidden, needIds, pathOf } from '../../domain/tree';
import {
  HOUR_MS, MIN_MS, addLocalDays, formatClock, formatDuration, startOfLocalDay, startOfNextLocalDay,
} from '../../domain/time';
import { useData } from '../../db/store';
import { defaultActivity } from '../../domain/quick';
import { useDesign } from '../../settings/design';
import { useNow } from '../../ui/useNow';
import { EntrySheet } from './EntrySheet';
import { Sheet } from '../../ui/Sheet';
import { describePoint } from '../../domain/points';
import { ActivityPicker } from '../activities/ActivityPicker';
import { PointSheet } from '../points/PointSheet';

const GAP_MIN_MS = 20 * MIN_MS; // пустоты между записями короче не показываем
const EDGE_GAP_MIN_MS = MIN_MS; // а в начале и в конце дня показываем почти любые

// Высота строки — по длительности: час = PX_PER_HOUR пикселей. Снизу ограничено,
// чтобы короткая запись осталась читаемой; длинную пустоту (ночь) ограничиваем сверху.
const PX_PER_HOUR = 80;
const heightOf = (ms: number, min: number, max = Infinity) => Math.min(max, Math.max(min, (ms / HOUR_MS) * PX_PER_HOUR));

// Лента дня: записи по порядку, пустоты между ними можно заполнить задним числом.
export default function Timeline() {
  const { activities, entries, points } = useData();
  const now = useNow(30_000);
  const [day, setDay] = useState(() => startOfLocalDay(Date.now()));
  const [selected, setSelected] = useState<{ entry: Entry; isNew: boolean } | null>(null);
  const colors = useMemo(() => activityColors(activities), [activities]);
  const [adding, setAdding] = useState<'menu' | 'pick' | null>(null); // кнопка ＋: что добавить
  const [pointOf, setPointOf] = useState<string | null>(null);        // занятие, записи без времени которого открыты
  const { feedByDuration } = useDesign(); // настройка в «Ещё»: высота по длительности или одинаковая

  const dayEnd = startOfNextLocalDay(day);
  const withParams = activities.filter((a) => a.params?.length && !isHidden(activities, a.id));
  const today = startOfLocalDay(now);
  const list = entries.filter((e) => e.start < dayEnd && (e.end ?? now) > day);
  const needs = useMemo(() => needIds(activities), [activities]);
  const total = list.reduce((s, e) => s + (needs.has(e.activityId) ? 0 : Math.min(e.end ?? now, dayEnd) - Math.max(e.start, day)), 0); // нужды не полезное время

  const title =
    day === today ? 'Сегодня'
    : day === addLocalDays(today, -1) ? 'Вчера'
    : new Date(day).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });

  const draft = (start: number, end: number) =>
    setSelected({
      entry: { id: crypto.randomUUID?.() ?? String(Date.now()), activityId: defaultActivity(activities, entries) ?? '', start, end, source: 'manual', updatedAt: Date.now() },
      isNew: true,
    });

  // Собираем строки: пустота, запись, пустота, запись… пустота до конца дня (или до «сейчас»).
  // Записи без времени — короткие строки-точки между ними, по своему моменту.
  const rows: ReactNode[] = [];
  const dayPoints = points.filter((p) => p.at >= day && p.at < dayEnd);
  let pi = 0;
  const pointsUntil = (t: number) => {
    for (; pi < dayPoints.length && dayPoints[pi].at <= t; pi++) rows.push(pointRow(dayPoints[pi]));
  };
  const pointRow = (p: Point) => {
    const a = activities.find((x) => x.id === p.activityId);
    return (
      <button key={p.id} className="point-row" onClick={() => setPointOf(p.activityId)}>
        <span className="point-dot" style={{ background: colors.get(p.activityId) }} />
        <span className="point-time">{formatClock(p.at)}</span>
        <span className="point-name">{a?.icon ? a.icon + ' ' : ''}{a?.name}</span>
        <span className="dim small point-text">{describePoint(p, a?.params)}</span>
      </button>
    );
  };
  const gap = (from: number, to: number, min = GAP_MIN_MS) => {
    pointsUntil(from);
    if (to - from < min) return;
    rows.push(
      <button key={'gap' + from} className="gap" style={feedByDuration ? { height: heightOf(to - from, 34, 3 * PX_PER_HOUR) } : undefined} onClick={() => draft(from, to)}>
        Пусто {formatClock(from)}–{to === dayEnd ? '24:00' : formatClock(to)} · {formatDuration(to - from)} <b>＋</b>
      </button>,
    );
  };
  let cursor = day; // где кончилась предыдущая запись
  list.forEach((e) => {
    const end = e.end ?? now;
    gap(cursor, e.start, cursor === day ? EDGE_GAP_MIN_MS : GAP_MIN_MS);
    cursor = Math.max(cursor, end);
    pointsUntil(e.start);
    const path = pathOf(activities, e.activityId).map((a) => a.name);
    rows.push(
      <div key={e.id} className="entry" style={feedByDuration ? { height: heightOf(end - e.start, 56) } : undefined} onClick={() => setSelected({ entry: e, isNew: false })}>
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
  gap(cursor, Math.min(now, dayEnd), EDGE_GAP_MIN_MS);
  pointsUntil(dayEnd);

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

      <button className="fab" onClick={() => setAdding('menu')}>＋</button>

      {adding === 'menu' && (
        <Sheet title="Добавить" onClose={() => setAdding(null)}>
          <div className="form">
            <button className="btn" onClick={() => { setAdding(null); if (day === today) draft(now - HOUR_MS, now); else draft(day + 12 * HOUR_MS, day + 13 * HOUR_MS); }}>
              ⏱ Время задним числом
            </button>
            <div className="setting-title">Запись без времени</div>
            {/* занятия с параметрами — сразу кнопками, остальные — через дерево */}
            <div className="chips">
              {withParams.map((a) => (
                <button key={a.id} onClick={() => { setAdding(null); setPointOf(a.id); }}>
                  <span className="dot" style={{ background: colors.get(a.id) }} /> {a.icon ? a.icon + ' ' : ''}{a.name}
                </button>
              ))}
              <button onClick={() => setAdding('pick')}>Другое занятие…</button>
            </div>
            <div className="setting-hint">Подход, замер, отметка о чём угодно. Что вписывать (числа, варианты) — задаётся у занятия в «Ещё → Занятия».</div>
          </div>
        </Sheet>
      )}
      {adding === 'pick' && (
        <ActivityPicker activities={activities.filter((a) => !isHidden(activities, a.id))} colors={colors} title="Запись без времени по…"
          onPick={(id) => { setAdding(null); setPointOf(id); }} onClose={() => setAdding(null)} />
      )}
      {pointOf && <PointSheet activityId={pointOf} day={day} onClose={() => setPointOf(null)} />}

      {selected && <EntrySheet entry={selected.entry} isNew={selected.isNew} onClose={() => setSelected(null)} />}
    </div>
  );
}
