import { Suspense, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import type { Entry } from '../../db/schema';
import { activityColors } from '../../domain/colors';
import { parentsMap, toSpans, usefulMs } from '../../domain/spans';
import { canTrack, isHidden, isTimeless, needIds, pathOf, timerRange } from '../../domain/tree';
import { Dial } from './Dial';
import { ChargeCards } from './controls/ChargeCards';
import { ClockRing } from './controls/ClockRing';
import { ChargeTray, ClockTray, DialTray, TilesTray } from './controls/Trays';
import { Drawer } from './controls/Drawer';
import { Tiles } from './controls/Tiles';
import type { ControlProps } from './controls/types';
import { MIN_MS, startOfLocalDay, formatClock, formatDuration, periodRange, periodTitle, periodTitles, shiftPeriod, type Period } from '../../domain/time';
import { answerForgotten, saveEntry, snoozeBackupBanner, startTimer, stopTimer } from '../../db/commands';
import { settingOf, useData } from '../../db/store';
import { shareBackup } from '../../db/backup';
import { forgottenTimer, type ForgottenAnswer } from '../../domain/forgotten';
import { defaultActivity, quickActivities } from '../../domain/quick';
import { findVisualization } from '../../visualizations/registry';
import { settingsOf, useAppearance } from '../../settings/appearance';
import { setFocus, useDesign } from '../../settings/design';
import { lazyViz } from '../../visualizations/lazy';
import type { SegmentCount } from '../../visualizations/types';
import { Segmented } from '../../ui/Segmented';
import { Sheet } from '../../ui/Sheet';
import { useNow } from '../../ui/useNow';
import { ActivityPicker } from '../activities/ActivityPicker';
import { EntrySheet } from '../timeline/EntrySheet';
import { PointForm } from '../points/PointSheet';
import { HabitStrip } from '../habits/HabitStrip';
import { StartFromSheet } from './controls/StartFrom';

const BACKUP_EVERY_MS = 3 * 86_400_000; // плашка «сделай бэкап», если его не было 3 дня

export default function Today() {
  const data = useData();
  const { activities, entries, running: run } = data;
  const now = useNow(1000);
  const [scale, setScale] = useState<Period>('day');
  // Счётчик сегментов от мозаики (сколько закрашено из скольких) — для таблички в фокусе.
  const [count, setCount] = useState<SegmentCount | null>(null);
  const [offset, setOffset] = useState(0); // 0 = текущий период, -1 = предыдущий…
  const [selected, setSelected] = useState<{ entry: Entry; isNew: boolean } | null>(null);
  const [picking, setPicking] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const [startAt, setStartAt] = useState<number | null>(null); // «начал раньше, чем нажал»
  const [pickingStart, setPickingStart] = useState(false);
  const [noting, setNoting] = useState<string | null>(null); // занятие «без времени»: вместо полукруга — форма записи
  // Куда листали в последний раз — для анимации «страница справа / слева».
  const [dir, setDir] = useState<'fwd' | 'back'>('fwd');
  const go = (next: number) => { if (next === offset) return; setDir(next > offset ? 'fwd' : 'back'); setOffset(next); };
  const [minutesFor, setMinutesFor] = useState<Record<string, number>>({});

  const colors = useMemo(() => activityColors(activities), [activities]);
  const { from, to } = periodRange(scale, shiftPeriod(scale, now, offset));
  const isCurrent = offset === 0;
  const needs = useMemo(() => needIds(activities), [activities]);
  const parents = useMemo(() => parentsMap(activities, colors), [activities, colors]);
  const spans = toSpans(entries, colors, from, to, now, needs, parents);
  const total = usefulMs(spans); // нужды в полезное время не идут
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

  // Частые занятия: топ-6 по числу записей за 2 недели (мало истории — добиваем корнями дерева).
  const quick = useMemo(() => quickActivities(activities, entries, Date.now()), [activities, entries]);

  // Занятие на полукруге: идущее, выбранное или самое частое.
  // Выбранное могли успеть завершить в «Занятиях» — тогда берём частое.
  const chosenOk = chosen && canTrack(activities, chosen) ? chosen : null;
  const dialId = run?.activityId ?? chosenOk ?? quick[0] ?? '';
  const range = timerRange(activities, dialId);
  // Длительность помним для каждого занятия; по умолчанию — середина диапазона.
  const minutes = Math.min(range[1], Math.max(range[0], minutesFor[dialId] ?? Math.round((range[0] + range[1]) / 10) * 5));

  // Таймер на время закрывается сам ровно в назначенную минуту — это следит db/store.ts.

  // «Забыл выключить» — только у таймера без лимита; порог — у занятия (по умолчанию 3 ч).
  const forgotten = forgottenTimer(run, activities, now, settingOf<ForgottenAnswer | null>(data, 'forgottenAnswer', null));

  // Плашка бэкапа: бэкапа не было 3 дня (а если не было вовсе — с первой записи прошло 3 дня).
  const lastBackup = settingOf<number | null>(data, 'lastBackupAt', null);
  const since = lastBackup ?? entries[0]?.start ?? now;
  const backupDue = now - since > BACKUP_EVERY_MS && now > settingOf(data, 'backupSnoozeUntil', 0);

  const newRetro = () => setSelected({
    entry: { id: crypto.randomUUID?.() ?? String(Date.now()), activityId: defaultActivity(activities, entries) ?? '', start: now - 60 * MIN_MS, end: now, source: 'manual', updatedAt: now },
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

  // Двойной тап по мозаике — фокус (вкл/выкл). Одиночный тап по стеклу открывает запись,
  // но с задержкой: вдруг следом второй тап, и это фокус, а не просмотр.
  const DOUBLE_MS = 300;
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);
  const selectTimer = useRef(0);
  const doubleAt = useRef(0); // когда был двойной тап: click второго тапа приходит после pointerup
  useEffect(() => () => clearTimeout(selectTimer.current), []);
  const onTap = (x: number, y: number) => {
    const t = performance.now(), l = lastTap.current;
    if (l && t - l.t < DOUBLE_MS && Math.hypot(x - l.x, y - l.y) < 30) {
      lastTap.current = null;
      doubleAt.current = t;
      clearTimeout(selectTimer.current);
      focusOn(!focus);
    } else lastTap.current = { t, x, y };
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

  const periodName = isCurrent ? periodTitles[scale] : periodTitle(scale, from, to);
  const scales = [{ id: 'day', label: 'День' }, { id: 'week', label: 'Неделя' }, { id: 'month', label: 'Месяц' }] as const;
  const pickScale = (v: Period) => { setDir(order.indexOf(v) > order.indexOf(scale) ? 'fwd' : 'back'); setScale(v); setOffset(0); };

  // ——— общие куски экрана; компоновка ниже расставляет их по-разному ———

  const banner = backupDue && (
    <div className="banner">
      <span>{lastBackup === null ? 'Бэкапа ещё не было' : `Бэкап не делали ${Math.floor((now - lastBackup) / 86_400_000)} дн.`}</span>
      <button className="btn small primary" onClick={() => void shareBackup()}>Сохранить</button>
      <button className="banner-x" onClick={() => void snoozeBackupBanner()}>✕</button>
    </div>
  );

  const viz = (
    <div
      className="widget viz"
      onPointerDown={(e) => { pinchDown(e); swipe.current = { x: e.clientX, y: e.clientY }; }}
      onPointerMove={pinchMove}
      onPointerUp={(e) => {
        const s0 = swipe.current;
        if (pinchUp(e)) return;
        if (s0 && Math.hypot(e.clientX - s0.x, e.clientY - s0.y) < 10) onTap(e.clientX, e.clientY);
        onSwipeEnd(e.clientX, e.clientY);
      }}
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
            onCount={setCount}
            onSelect={(id) => {
              const e = entries.find((x) => x.id === id);
              clearTimeout(selectTimer.current);
              if (performance.now() - doubleAt.current < 200) return;
              if (e) selectTimer.current = window.setTimeout(() => setSelected({ entry: e, isNew: false }), DOUBLE_MS);
            }}
          />
        </Suspense>
      </div>
    </div>
  );

  // ——— управление таймером: режим из «Ещё», всегда внутри сворачиваемой панели ———
  // Выбранное начало — на один старт, дальше снова «сейчас».
  const start = (id: string, durationMs?: number, at?: number) => { void startTimer(id, durationMs, at ?? startAt ?? undefined); setStartAt(null); };
  const control: ControlProps = {
    activities, colors, quick, current: dialId, onChoose: setChosen, onMore: () => setPicking(true),
    run, now, onOpenRun: () => run && setSelected({ entry: run, isNew: false }),
    name: (id) => name(id).at(-1) ?? '',
    startAt, onPickStart: () => setPickingStart(true), onSetStart: setStartAt, themedStart: design.startPick === 'themed', onStart: start,
  };
  const notingOk = noting && !isHidden(activities, noting) ? noting : null;
  const body = notingOk ? (
    <div className="widget dial point-card">
      <PointForm key={notingOk} activityId={notingOk} day={startOfLocalDay(now)} onDone={() => setNoting(null)}
        head={(
          <button className="dial-activity" onClick={() => setPicking(true)}>
            <span className="dot" style={{ background: colors.get(notingOk) }} />{name(notingOk).at(-1)} <span className="dim">▾</span>
          </button>
        )} />
    </div>
  )
    : design.mode === 'clock' ? <ClockRing {...control} />
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
        startAt={startAt}
        onPickStart={() => setPickingStart(true)}
        onSetStart={setStartAt}
        themedStart={design.startPick === 'themed'}
        onStart={() => start(dialId, minutes * MIN_MS)}
        onStartFree={() => start(dialId)}
        onStop={() => void stopTimer()}
        onOpenRun={() => run && setSelected({ entry: run, isNew: false })}
      />
    );
  const tray =
    design.mode === 'clock' ? <ClockTray {...control} />
    : design.mode === 'charge' ? <ChargeTray {...control} />
    : design.mode === 'tiles' ? <TilesTray {...control} />
    : <DialTray {...control} />;
  const drawer = (
    <Drawer
      open={drawerOpen}
      onOpen={setDrawerOpen}
      run={run}
      now={now}
      color={colors.get(run?.activityId ?? notingOk ?? dialId) ?? '#888'}
      label={name(run?.activityId ?? notingOk ?? dialId).at(-1) ?? ''}
      tray={tray}
    >
      {body}
    </Drawer>
  );

  // Витрина: мозаика под всем на весь экран; сверху — итог крупно и масштаб.
  // Фокус (двойной тап по мозаике, в любом виде): только витраж.
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
    <div className={'screen fit today' + (design.showcase || focus ? ' fullbleed' : '') + (focus ? ' focus' : '')}>
      {head}
      {/* привычки — только на масштабе «день»: отмечаются за тот день, что открыт */}
      {scale === 'day' && <HabitStrip day={from} now={now} />}
      {banner}
      {viz}
      {dialId ? drawer : (
        <div className="widget pad center dim">Нет занятий — добавь их в «Ещё → Занятия»</div>
      )}
      {/* в фокусе — только витраж и едва заметная кнопка выхода */}
      {focus && (
        <>
          {/* свет, проходящий сквозь витраж, — медленно плывёт; тапы проходят насквозь */}
          <div className="focus-light" />
          {/* табличка, как под картиной в музее */}
          <div className="focus-plaque">
            {periodName} · {formatDuration(total)}
            {count && <div className="focus-count">{count.filled} из {count.total} {segmentsWord(count.total)}</div>}
          </div>
        </>
      )}

      {picking && (
        <ActivityPicker
          activities={activities}
          colors={colors}
          title="Занятие"
          note={(id) => isTimeless(activities, id) ? 'запись' : undefined}
          onPick={(id) => { if (isTimeless(activities, id)) setNoting(id); else { setNoting(null); setChosen(id); } setPicking(false); }}
          onClose={() => setPicking(false)}
          footer={<button className="btn ghost" onClick={() => { setPicking(false); newRetro(); }}>＋ Добавить запись задним числом</button>}
        />
      )}

      {pickingStart && <StartFromSheet startAt={startAt} now={now} onSet={setStartAt} onClose={() => setPickingStart(false)} />}

      {selected && <EntrySheet entry={selected.entry} isNew={selected.isNew} onClose={() => setSelected(null)} />}

      {forgotten && <ForgottenDialog entry={forgotten} name={name(forgotten.activityId).at(-1)!} now={now} />}
    </div>
  );
}

/** «из 21 сегмента», «из 32 сегментов» — после «из» число в родительном падеже. */
function segmentsWord(n: number): string {
  return n % 10 === 1 && n % 100 !== 11 ? 'сегмента' : 'сегментов';
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
    void saveEntry({ ...entry, end: Math.min(t, now) });
  };
  return (
    <Sheet title="Таймер не забыт?" onClose={() => void answerForgotten(entry.id)}>
      <div className="form">
        <p className="center">«{name}» идёт уже <b>{formatDuration(now - entry.start)}</b> (с {formatClock(entry.start)}). Всё ещё идёт?</p>
        <button className="btn primary" onClick={() => void answerForgotten(entry.id)}>Да, идёт</button>
        <label className="field time">
          <span className="dim">Нет, закончил в</span>
          <input type="time" value={stopAt} onChange={(e) => setStopAt(e.target.value)} />
        </label>
        <button className="btn" onClick={stop}>Остановить в {stopAt}</button>
      </div>
    </Sheet>
  );
}
