import { Suspense, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import type { Entry } from '../../db/schema';
import { activityColors } from '../../domain/colors';
import { toSpans } from '../../domain/spans';
import { pathOf, timerRange } from '../../domain/tree';
import { Dial } from './Dial';
import { ChargeCards } from './controls/ChargeCards';
import { ClockRing } from './controls/ClockRing';
import { Drawer } from './controls/Drawer';
import { Tiles } from './controls/Tiles';
import type { ControlProps } from './controls/types';
import { MIN_MS, addLocalDays, formatClock, formatDuration, periodRange, type Period } from '../../domain/time';
import {
  dismissBackupBanner, markForgottenAsked, running, saveEntry, startTimer, stopTimer, useMock,
} from '../../mock/store';
import { findVisualization } from '../../visualizations/registry';
import { settingsOf, useAppearance } from '../../settings/appearance';
import { setFocus, useDesign } from '../../settings/design';
import { lazyViz } from '../../visualizations/lazy';
import { Segmented } from '../../ui/Segmented';
import { Sheet } from '../../ui/Sheet';
import { useNow } from '../../ui/useNow';
import { ActivityPicker } from '../activities/ActivityPicker';
import { EntrySheet } from '../timeline/EntrySheet';
import { shareBackup } from '../more/backup';

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
  const [chosen, setChosen] = useState<string | null>(null);
  // Куда листали в последний раз — для анимации «страница справа / слева».
  const [dir, setDir] = useState<'fwd' | 'back'>('fwd');
  const go = (next: number) => { if (next === offset) return; setDir(next > offset ? 'fwd' : 'back'); setOffset(next); };
  const [minutesFor, setMinutesFor] = useState<Record<string, number>>({});

  const colors = useMemo(() => activityColors(activities), [activities]);
  const { from, to } = periodRange(scale, shift(scale, now, offset));
  const isCurrent = offset === 0;
  const spans = toSpans(entries, colors, from, to, now);
  const total = spans.reduce((sum, s) => sum + s.end - s.start, 0);
  const run = running(state);
  const look = useAppearance();
  const design = useDesign();
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [focus, setFocusState] = useState(false);
  const focusOn = (on: boolean) => { setFocus(on); setFocusState(on); };
  // ушли с экрана — фокус снимаем, иначе таб-бар останется спрятанным
  useEffect(() => () => setFocus(false), []);
  const plugin = findVisualization(look[scale].vizId); // у каждого масштаба свой стиль
  const Viz = lazyViz(plugin);

  const name = (id: string) => pathOf(activities, id).map((a) => a.name);
  const date = new Date(now).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });

  // Частые занятия: топ-6 по числу записей за 2 недели.
  const quick = useMemo(() => {
    const count = new Map<string, number>();
    for (const e of entries) if (e.start > Date.now() - 14 * 86_400_000) count.set(e.activityId, (count.get(e.activityId) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id]) => id);
  }, [entries]);

  // Занятие на полукруге: идущее, выбранное или самое частое.
  const dialId = run?.activityId ?? chosen ?? quick[0] ?? activities[0].id;
  const range = timerRange(activities, dialId);
  // Длительность помним для каждого занятия; по умолчанию — середина диапазона.
  const minutes = Math.min(range[1], Math.max(range[0], minutesFor[dialId] ?? Math.round((range[0] + range[1]) / 10) * 5));

  // Таймер на время закрывается сам ровно в назначенную минуту.
  useEffect(() => {
    if (run?.plannedEnd && now >= run.plannedEnd) stopTimer(run.plannedEnd);
  }, [run, now]);

  // «Забыл выключить» — только у таймера без лимита.
  const forgotten = run && !run.plannedEnd && now - run.start > FORGET_AFTER_MS && state.forgottenAsked !== run.id ? run : null;

  const newRetro = () => setSelected({
    entry: { id: crypto.randomUUID?.() ?? String(Date.now()), activityId: quick[0] ?? 'work', start: now - 60 * MIN_MS, end: now, source: 'manual', updatedAt: now },
    isNew: true,
  });

  // Свайп по мозаике влево/вправо — листать периоды (во всех компоновках).
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const onSwipeEnd = (x: number, y: number) => {
    const s0 = swipe.current;
    swipe.current = null;
    if (!s0) return;
    const dx = x - s0.x, dy = y - s0.y;
    if (Math.abs(dx) < 60 || Math.abs(dx) < 2 * Math.abs(dy)) return;
    if (dx > 0) go(offset - 1);          // вправо — раньше
    else if (!isCurrent) go(offset + 1); // влево — позже
  };

  const order: Period[] = ['day', 'week', 'month'];
  // Щипок двумя пальцами: свести — крупнее масштаб (день → неделя → месяц), развести — мельче.
  // Храним пальцы по pointerId (≈ Dictionary<int, Vector2>).
  const fingers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d0: number; ratio: number } | null>(null);
  const spread = () => {
    const [a, b] = [...fingers.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const pinchDown = (e: PointerEvent) => {
    fingers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (fingers.current.size === 2) { pinch.current = { d0: spread(), ratio: 1 }; swipe.current = null; }
  };
  const pinchMove = (e: PointerEvent) => {
    if (!fingers.current.has(e.pointerId)) return;
    fingers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && fingers.current.size === 2) pinch.current.ratio = spread() / pinch.current.d0;
  };
  /** true — это был щипок (свайп не считаем). */
  const pinchUp = (e: PointerEvent) => {
    fingers.current.delete(e.pointerId);
    const p = pinch.current;
    if (!p) return false;
    if (fingers.current.size === 0) {
      pinch.current = null;
      const i = order.indexOf(scale);
      if (p.ratio < 0.8 && i < 2) pickScale(order[i + 1]);
      else if (p.ratio > 1.25 && i > 0) pickScale(order[i - 1]);
    }
    return true;
  };

  const periodName = isCurrent ? titles[scale] : periodTitle(scale, from, to);
  const scales = [{ id: 'day', label: 'День' }, { id: 'week', label: 'Неделя' }, { id: 'month', label: 'Месяц' }] as const;
  const pickScale = (v: Period) => { setDir(order.indexOf(v) > order.indexOf(scale) ? 'fwd' : 'back'); setScale(v); setOffset(0); };

  // ——— общие куски экрана; компоновка ниже расставляет их по-разному ———

  const banner = state.backupBanner && (
    <div className="banner">
      <span>Бэкап не делали 4 дня</span>
      <button className="btn small primary" onClick={() => shareBackup(state)}>Сохранить</button>
      <button className="banner-x" onClick={dismissBackupBanner}>✕</button>
    </div>
  );

  const viz = (
    <div
      className="widget viz"
      onPointerDown={(e) => { pinchDown(e); swipe.current = { x: e.clientX, y: e.clientY }; }}
      onPointerMove={pinchMove}
      onPointerUp={(e) => { if (!pinchUp(e)) onSwipeEnd(e.clientX, e.clientY); }}
      onPointerCancel={(e) => { pinchUp(e); swipe.current = null; }}
    >
      {/* key меняется при смене периода → React пересоздаёт обёртку, и её CSS-анимация
          проигрывается заново (листание, появление стёкол — зависит от компоновки). */}
      <div className={'viz-anim ' + dir} key={`${scale}:${offset}`}>
        <Suspense fallback={null}>
          <Viz
            scale={scale}
            from={from}
            to={to}
            spans={spans}
            runningEntryId={run?.id ?? null}
            settings={settingsOf(look, scale)}
            onSelect={(id) => {
              const e = entries.find((x) => x.id === id);
              if (e) setSelected({ entry: e, isNew: false });
            }}
          />
        </Suspense>
      </div>
    </div>
  );

  // ——— управление таймером: режим из «Ещё», всегда внутри сворачиваемой панели ———
  const control: ControlProps = {
    activities, colors, quick, current: dialId, onChoose: setChosen, onMore: () => setPicking(true),
    run, now, onOpenRun: () => run && setSelected({ entry: run, isNew: false }),
    name: (id) => name(id).at(-1) ?? '',
  };
  const body =
    design.mode === 'clock' ? <ClockRing {...control} />
    : design.mode === 'charge' ? <ChargeCards {...control} />
    : design.mode === 'tiles' ? <Tiles {...control} />
    : (
      <Dial
        name={name(dialId).at(-1) ?? ''}
        color={colors.get(dialId) ?? '#888'}
        range={range}
        minutes={minutes}
        onMinutes={(m) => setMinutesFor({ ...minutesFor, [dialId]: m })}
        run={run}
        now={now}
        onPick={() => setPicking(true)}
        onStart={() => startTimer(dialId, minutes * MIN_MS)}
        onStartFree={() => startTimer(dialId)}
        onStop={() => stopTimer()}
        onOpenRun={() => run && setSelected({ entry: run, isNew: false })}
      />
    );
  const drawer = (
    <Drawer
      open={drawerOpen}
      onOpen={setDrawerOpen}
      run={run}
      now={now}
      color={colors.get(run?.activityId ?? dialId) ?? '#888'}
      label={name(run?.activityId ?? dialId).at(-1) ?? ''}
    >
      {body}
    </Drawer>
  );

  // Витрина: мозаика под всем на весь экран; сверху — итог крупно, масштаб, кнопка фокуса.
  // Без витрины: шапка со стрелками, сегменты, мозаика карточкой.
  const head = design.showcase ? (
    <div className="fb-head">
      <div className="fb-left" onClick={() => go(0)}>
        <div className="fb-title">{periodName}</div>
        <div className="fb-total">{formatDuration(total)}</div>
      </div>
      <div className="fb-tools">
        <div className="fb-scales">
          {scales.map((o) => (
            <button key={o.id} aria-pressed={o.id === scale} onClick={() => pickScale(o.id)}>{o.label[0]}</button>
          ))}
        </div>
        <button className="fb-focus" onClick={() => focusOn(true)} aria-label="Фокус: только витраж">⛶</button>
      </div>
    </div>
  ) : (
    <>
      <div className="today-head">
        <button className="nav-arrow" onClick={() => go(offset - 1)}>‹</button>
        <div className="today-title" onClick={() => go(0)}>
          <h1>{periodName}</h1>
          <div className="dim sub">{scale === 'day' && isCurrent ? date : isCurrent ? 'свайп или ‹ — листать' : 'тапни, чтобы вернуться'}</div>
        </div>
        <button className="nav-arrow" disabled={isCurrent} onClick={() => go(offset + 1)}>›</button>
        <div className="today-total">{formatDuration(total)}</div>
      </div>
      <Segmented options={[...scales]} value={scale} onChange={pickScale} />
    </>
  );

  // Экран без прокрутки: мозаика забирает всё место, что осталось от остального.
  return (
    <div className={'screen fit today' + (design.showcase ? ' fullbleed' : '') + (focus ? ' focus' : '')}>
      {head}
      {banner}
      {viz}
      {drawer}
      {/* в фокусе — только витраж и едва заметная кнопка выхода */}
      {focus && <button className="focus-exit" onClick={() => focusOn(false)} aria-label="Выйти из фокуса">✕</button>}

      {picking && (
        <ActivityPicker
          activities={activities}
          colors={colors}
          title="Занятие"
          onPick={(id) => { setChosen(id); setPicking(false); }}
          onClose={() => setPicking(false)}
          footer={<button className="btn ghost" onClick={() => { setPicking(false); newRetro(); }}>＋ Добавить запись задним числом</button>}
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
