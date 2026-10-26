import { useMemo, useState } from 'react';
import { activityColors } from '../../domain/colors';
import { quickActivities } from '../../domain/quick';
import { timerRange } from '../../domain/tree';
import { useData } from '../../db/store';
import { modes, setDesign, startPicks, themedStartHints, useDesign } from '../../settings/design';
import { useNow } from '../../ui/useNow';
import { Dial } from '../today/Dial';
import { ChargeCards } from '../today/controls/ChargeCards';
import { ClockRing } from '../today/controls/ClockRing';
import { Tiles } from '../today/controls/Tiles';
import { StartFromSheet } from '../today/controls/StartFrom';
import type { ControlProps } from '../today/controls/types';

// «Оформление → Таймер»: как управлять таймером на «Сегодня» и как выбирать начало.
// Сверху — живое превью выбранного режима: можно крутить и тянуть, но «Старт» ничего не запускает.
export function TimerLook() {
  const design = useDesign();
  const { activities, entries } = useData();
  const now = useNow(1000);
  const colors = useMemo(() => activityColors(activities), [activities]);
  const quick = useMemo(() => quickActivities(activities, entries, Date.now()), [activities, entries]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [startAt, setStartAt] = useState<number | null>(null);
  const [pickingStart, setPickingStart] = useState(false);
  const [minutes, setMinutes] = useState<number | null>(null);
  const current = chosen ?? quick[0] ?? '';
  const name = (id: string) => activities.find((a) => a.id === id)?.name ?? '';
  const range = timerRange(activities, current);
  const m = minutes ?? Math.round((range[0] + range[1]) / 10) * 5;

  const control: ControlProps = {
    activities, colors, quick, current, onChoose: setChosen, onMore: () => {},
    run: null, now, onOpenRun: () => {}, name,
    startAt, onPickStart: () => setPickingStart(true), onSetStart: setStartAt,
    themedStart: design.startPick === 'themed',
    onStart: () => setStartAt(null), // превью: только сбрасываем выбранное начало
  };
  const preview = !current ? <div className="dim center">Нет занятий для превью</div>
    : design.mode === 'clock' ? <ClockRing {...control} />
    : design.mode === 'charge' ? <ChargeCards {...control} />
    : design.mode === 'tiles' ? <Tiles {...control} />
    : (
      <Dial name={name(current)} color={colors.get(current) ?? '#888'} range={range} minutes={Math.min(range[1], Math.max(range[0], m))}
        onMinutes={setMinutes} run={null} now={now} startAt={startAt} onPickStart={() => setPickingStart(true)}
        onSetStart={setStartAt} themedStart={control.themedStart}
        onPick={() => {}} onStart={() => setStartAt(null)} onStartFree={() => setStartAt(null)} onStop={() => {}} onOpenRun={() => {}} />
    );

  return (
    <>
      <div className="widget timer-preview">{preview}</div>

      <div className="widget settings">
        <div>
          <div className="setting-title">Управление</div>
          <div className="chips design-chips mode-chips">
            {modes.map((x) => (
              <button key={x.id} aria-pressed={design.mode === x.id} onClick={() => setDesign({ mode: x.id })}>{x.title}</button>
            ))}
          </div>
          <div className="setting-hint">{modes.find((x) => x.id === design.mode)!.hint}</div>
        </div>
        <div>
          <div className="setting-title">Начал раньше, чем нажал</div>
          <div className="chips design-chips">
            {startPicks.map((x) => (
              <button key={x.id} aria-pressed={design.startPick === x.id} onClick={() => setDesign({ startPick: x.id })}>{x.title}</button>
            ))}
          </div>
          <div className="setting-hint">
            {design.startPick === 'themed' ? `${themedStartHints[design.mode]}. Строчка «сейчас ▾» тоже остаётся.` : startPicks[0].hint}
          </div>
        </div>
        <label className="toggle-row">
          <span>Витрина <span className="dim small">— мозаика на весь экран</span></span>
          <input type="checkbox" checked={design.showcase} onChange={(e) => setDesign({ showcase: e.target.checked })} />
        </label>
      </div>

      {pickingStart && <StartFromSheet startAt={startAt} now={now} onSet={setStartAt} onClose={() => setPickingStart(false)} />}
    </>
  );
}
