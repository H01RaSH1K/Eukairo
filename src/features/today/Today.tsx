import { Suspense, lazy, useMemo, useState, type ComponentType } from 'react';
import type { Entry } from '../../db/schema';
import { activityColors } from '../../domain/colors';
import { toSpans } from '../../domain/spans';
import { pathOf } from '../../domain/tree';
import { MIN_MS, addLocalDays, formatClock, formatDuration, formatTimer, periodRange, type Period } from '../../domain/time';
import {
  dismissBackupBanner, markForgottenAsked, running, saveEntry, startTimer, stopTimer, useMock,
} from '../../mock/store';
import { findVisualization } from '../../visualizations/registry';
import type { VisualizationPlugin, VisualizationProps } from '../../visualizations/types';
import { Segmented } from '../../ui/Segmented';
import { Sheet } from '../../ui/Sheet';
import { useNow } from '../../ui/useNow';
import { ActivityPicker } from '../activities/ActivityPicker';
import { EntrySheet } from '../timeline/EntrySheet';
import { shareBackup } from '../more/backup';

// lazy() ≈ загрузить префаб по требованию: код стиля — отдельный файл.
// Кэшируем, чтобы при перерисовке не создавать компонент заново.
const lazyCache = new Map<string, ComponentType<VisualizationProps>>();
function lazyViz(p: VisualizationPlugin) {
  if (!lazyCache.has(p.id)) lazyCache.set(p.id, lazy(p.load));
  return lazyCache.get(p.id)!;
}

const FORGET_AFTER_MS = 180 * MIN_MS;

const titles: Record<Period, string> = { day: 'Сегодня', week: 'Эта неделя', month: 'Этот месяц' };

// Момент внутри периода, сдвинутого на `offset` дней/недель/месяцев.
function shift(scale: Period, t: number, offset: number): number {
  if (scale === 'day') return addLocalDays(t, offset);
  if (scale === 'week') return addLocalDays(t, offset * 7);
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth() + offset, 1).getTime();
}

function periodTitle(scale: Period, from: number, to: number): string {
  const fmt = (t: number, o: Intl.DateTimeFormatOptions) => new Date(t).toLocaleDateString('ru-RU', o);
  if (scale === 'day') return fmt(from, { day: 'numeric', month: 'long' });
  if (scale === 'week') return `${fmt(from, { day: 'numeric', month: 'short' })} – ${fmt(to - 1, { day: 'numeric', month: 'short' })}`;
  return fmt(from, { month: 'long', year: 'numeric' });
}

export default function Today() {
  const state = useMock();
  const { activities, entries } = state;
  const now = useNow(1000);
  const [scale, setScale] = useState<Period>('day');
  const [offset, setOffset] = useState(0); // 0 = текущий период, -1 = предыдущий…
  const [selected, setSelected] = useState<{ entry: Entry; isNew: boolean } | null>(null);
  const [picking, setPicking] = useState(false);

  const colors = useMemo(() => activityColors(activities), [activities]);
  const { from, to } = periodRange(scale, shift(scale, now, offset));
  const isCurrent = offset === 0;
  const spans = toSpans(entries, colors, from, to, now);
  const total = spans.reduce((sum, s) => sum + s.end - s.start, 0);
  const run = running(state);
  const plugin = findVisualization(state.vizId);
  const Viz = lazyViz(plugin);

  const name = (id: string) => pathOf(activities, id).map((a) => a.name);
  const date = new Date(now).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });

  // Частые занятия: топ-6 по числу записей за 2 недели.
  const quick = useMemo(() => {
    const count = new Map<string, number>();
    for (const e of entries) if (e.start > Date.now() - 14 * 86_400_000) count.set(e.activityId, (count.get(e.activityId) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id]) => id);
  }, [entries]);

  const forgotten = run && now - run.start > FORGET_AFTER_MS && state.forgottenAsked !== run.id ? run : null;

  return (
    <div className="screen">
      <div className="today-head">
        <div>
          <h1>{isCurrent ? titles[scale] : periodTitle(scale, from, to)}</h1>
          <p className="dim sub">{scale === 'day' && isCurrent ? date : `полезного: ${formatDuration(total)}`}</p>
        </div>
        {scale === 'day' && isCurrent && <div className="today-total">{formatDuration(total)}</div>}
      </div>

      {state.backupBanner && (
        <div className="banner">
          <span>Бэкап не делали 4 дня</span>
          <button className="btn small primary" onClick={() => shareBackup(state)}>Сохранить</button>
          <button className="banner-x" onClick={dismissBackupBanner}>✕</button>
        </div>
      )}

      <Segmented
        options={[{ id: 'day', label: 'День' }, { id: 'week', label: 'Неделя' }, { id: 'month', label: 'Месяц' }]}
        value={scale}
        onChange={(v) => { setScale(v); setOffset(0); }}
      />

      <div className="period-nav">
        <button onClick={() => setOffset(offset - 1)}>‹ раньше</button>
        {!isCurrent && <button onClick={() => setOffset(0)}>сейчас</button>}
        <button disabled={isCurrent} onClick={() => setOffset(offset + 1)}>позже ›</button>
      </div>

      <div className="viz">
        <Suspense fallback={null}>
          <Viz
            scale={scale}
            from={from}
            to={to}
            spans={spans}
            runningEntryId={run?.id ?? null}
            onSelect={(id) => {
              const e = entries.find((x) => x.id === id);
              if (e) setSelected({ entry: e, isNew: false });
            }}
          />
        </Suspense>
        <p className="dim viz-caption">Стекло = час суток. Часы одной записи сливаются в одну фигуру. Нарезка у каждого дня своя.</p>
      </div>

      {run ? (
        <div className="timer" style={{ background: colors.get(run.activityId) }} onClick={() => setSelected({ entry: run, isNew: false })}>
          <div className="timer-info">
            <div className="timer-path">{name(run.activityId).slice(0, -1).join(' › ')}</div>
            <div className="timer-name">{name(run.activityId).at(-1)}</div>
            <div className="timer-since">с {formatClock(run.start)}</div>
          </div>
          <div className="timer-clock">{formatTimer(now - run.start)}</div>
          <button className="timer-stop" onClick={(e) => { e.stopPropagation(); stopTimer(); }}>■</button>
        </div>
      ) : (
        <div className="timer idle">Ничего не идёт. Тапни занятие, чтобы начать.</div>
      )}

      <div className="quick">
        {quick.map((id) => {
          const active = run?.activityId === id;
          const path = name(id);
          return (
            <button key={id} className={'chip' + (active ? ' active' : '')} onClick={() => (active ? stopTimer() : startTimer(id))}>
              <span className="dot" style={{ background: colors.get(id) }} />
              <span className="chip-text">
                <span>{path.at(-1)}</span>
                {path.length > 1 && <small className="dim">{path.at(-2)}</small>}
              </span>
            </button>
          );
        })}
        <button className="chip more" onClick={() => setPicking(true)}>Все занятия…</button>
      </div>

      <button
        className="btn ghost"
        onClick={() => setSelected({
          entry: { id: crypto.randomUUID?.() ?? String(Date.now()), activityId: quick[0] ?? 'work', start: now - 60 * MIN_MS, end: now, source: 'manual', updatedAt: now },
          isNew: true,
        })}
      >
        ＋ Добавить задним числом
      </button>

      {picking && (
        <ActivityPicker
          activities={activities}
          colors={colors}
          title="Запустить таймер"
          onPick={(id) => { startTimer(id); setPicking(false); }}
          onClose={() => setPicking(false)}
        />
      )}

      {selected && <EntrySheet entry={selected.entry} isNew={selected.isNew} onClose={() => setSelected(null)} />}

      {forgotten && <ForgottenDialog entry={forgotten} name={name(forgotten.activityId).at(-1)!} now={now} />}
    </div>
  );
}

// «Таймер идёт 5 ч, всё ещё гуляешь с собакой?»
function ForgottenDialog({ entry, name, now }: { entry: Entry; name: string; now: number }) {
  const [stopAt, setStopAt] = useState(formatClock(entry.start + 60 * MIN_MS));
  const stop = () => {
    const [h, m] = stopAt.split(':').map(Number);
    const d = new Date(entry.start);
    d.setHours(h, m, 0, 0);
    let t = d.getTime();
    if (t <= entry.start) t += 86_400_000;
    saveEntry({ ...entry, end: Math.min(t, now) });
  };
  return (
    <Sheet title="Таймер не забыт?" onClose={() => markForgottenAsked(entry.id)}>
      <div className="form">
        <p className="center">«{name}» идёт уже <b>{formatDuration(now - entry.start)}</b> (с {formatClock(entry.start)}). Всё ещё идёт?</p>
        <button className="btn primary" onClick={() => markForgottenAsked(entry.id)}>Да, идёт</button>
        <label className="field time">
          <span className="dim">Нет, закончил в</span>
          <input type="time" value={stopAt} onChange={(e) => setStopAt(e.target.value)} />
        </label>
        <button className="btn" onClick={stop}>Остановить в {stopAt}</button>
      </div>
    </Sheet>
  );
}
