import { Suspense, useMemo, useState, type ReactNode } from 'react';
import { activityColors } from '../../domain/colors';
import { parentsMap, toSpans } from '../../domain/spans';
import { needIds } from '../../domain/tree';
import { addLocalDays, periodRange, type Period } from '../../domain/time';
import { useData } from '../../db/store';
import { applyToAll, resetSettings, setSetting, setVisualization, settingsOf, useAppearance } from '../../settings/appearance';
import { Segmented } from '../../ui/Segmented';
import { useNow } from '../../ui/useNow';
import { lazyViz } from '../../visualizations/lazy';
import { findVisualization, visualizations } from '../../visualizations/registry';
import { SettingControl } from './SettingControl';
import { TimerLook } from './TimerLook';

// Экран «Оформление»: у дня, недели и месяца — свой стиль и свои настройки.
// Сверху выбираем, что настраиваем; ниже живое превью, стили с миниатюрами и настройки стиля.
// Настройки берутся из описаний в реестре, поэтому новый стиль появляется здесь сам.
// Последняя вкладка — «Таймер»: режим управления и выбор начала (TimerLook.tsx).
export default function Appearance({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<Period | 'timer'>('day');
  const tabs = (
    <Segmented
      options={[{ id: 'day', label: 'День' }, { id: 'week', label: 'Неделя' }, { id: 'month', label: 'Месяц' }, { id: 'timer', label: 'Таймер' }]}
      value={tab}
      onChange={setTab}
    />
  );
  if (tab === 'timer') {
    return (
      <div className="screen fit appearance">
        <div className="page-head">
          <button className="nav-arrow" onClick={onBack} aria-label="Назад">‹</button>
          <h1>Оформление</h1>
          <span />
        </div>
        {tabs}
        <TimerLook />
      </div>
    );
  }
  return <VizLook scale={tab} tabs={tabs} onBack={onBack} />;
}

// Мозаика и прочие стили — для дня, недели или месяца.
function VizLook({ scale, tabs, onBack }: { scale: Period; tabs: ReactNode; onBack: () => void }) {
  const { activities, entries, running } = useData();
  const look = useAppearance();
  const now = useNow(30_000);
  const plugin = findVisualization(look[scale].vizId);
  const values = settingsOf(look, scale);
  const colors = useMemo(() => activityColors(activities), [activities]);
  const runId = running?.id ?? null;
  const needs = useMemo(() => needIds(activities), [activities]);

  const { from, to } = periodRange(scale, now);
  const parents = useMemo(() => parentsMap(activities, colors), [activities, colors]);
  const spans = toSpans(entries, colors, from, to, now, needs, parents);
  // Миниатюры — прошлый период того же масштаба: он уже целиком заполнен.
  const back = scale === 'day' ? -1 : scale === 'week' ? -7 : -28;
  const y = periodRange(scale, scale === 'month' ? new Date(new Date(from).getFullYear(), new Date(from).getMonth() - 1, 15).getTime() : addLocalDays(now, back));
  const ySpans = toSpans(entries, colors, y.from, y.to, now, needs, parents);

  const Viz = lazyViz(plugin);
  // showIf: настройка видна, только если другая равна одному из значений.
  const visible = plugin.settings.filter((d) => !d.showIf || d.showIf.equals.includes(values[d.showIf.id]));
  const changed = Object.keys(look[scale].settings[plugin.id] ?? {}).length > 0;
  // Остальные масштабы оформлены иначе? Тогда предлагаем «так же для остальных».
  const others = (['day', 'week', 'month'] as const).filter((s) => s !== scale);
  const differs = others.some((s) => JSON.stringify(look[s]) !== JSON.stringify(look[scale]));
  const names = { day: 'дня', week: 'недели', month: 'месяца' };

  return (
    <div className="screen fit appearance">
      <div className="page-head">
        <button className="nav-arrow" onClick={onBack} aria-label="Назад">‹</button>
        <h1>Оформление</h1>
        <button className="btn small ghost" disabled={!changed} onClick={() => resetSettings(scale, plugin.id)}>Сбросить</button>
      </div>

      {tabs}

      <div className="widget viz preview">
        <div className="preview-box">
          <Suspense fallback={null}>
            <Viz scale={scale} from={from} to={to} spans={spans} runningEntryId={runId} settings={values} onSelect={() => {}} />
          </Suspense>
        </div>
      </div>

      <div className="styles">
        {visualizations.map((v) => {
          const Thumb = lazyViz(v);
          return (
            <button key={v.id} className="style-card" aria-pressed={v.id === plugin.id} onClick={() => setVisualization(scale, v.id)}>
              <div className="style-thumb">
                <Suspense fallback={null}>
                  <Thumb scale={scale} from={y.from} to={y.to} spans={ySpans} runningEntryId={null} settings={settingsOf(look, scale, v.id)} onSelect={() => {}} />
                </Suspense>
              </div>
              <span>{v.title}</span>
            </button>
          );
        })}
      </div>

      <div className="widget settings">
        <div className="settings-desc dim">{plugin.description}</div>
        {visible.map((d) => (
          <SettingControl key={d.id} def={d} value={values[d.id]} onChange={(v) => setSetting(scale, plugin.id, d.id, v)} />
        ))}
        {differs && (
          <button className="btn small ghost apply-all" onClick={() => applyToAll(scale)}>
            Так же для {others.map((s) => names[s]).join(' и ')}
          </button>
        )}
      </div>
    </div>
  );
}
