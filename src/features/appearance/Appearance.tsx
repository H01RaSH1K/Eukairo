import { Suspense, useMemo, useState } from 'react';
import { activityColors } from '../../domain/colors';
import { toSpans } from '../../domain/spans';
import { addLocalDays, periodRange, type Period } from '../../domain/time';
import { running, useMock } from '../../mock/store';
import { resetSettings, setSetting, setVisualization, settingsOf, useAppearance } from '../../settings/appearance';
import { Segmented } from '../../ui/Segmented';
import { useNow } from '../../ui/useNow';
import { lazyViz } from '../../visualizations/lazy';
import { findVisualization, visualizations } from '../../visualizations/registry';
import { SettingControl } from './SettingControl';

// Экран «Оформление»: живое превью, выбор стиля (с миниатюрами) и настройки стиля.
// Настройки берутся из описаний в реестре, поэтому новый стиль появляется здесь сам.
export default function Appearance({ onBack }: { onBack: () => void }) {
  const mock = useMock();
  const { activities, entries } = mock;
  const look = useAppearance();
  const now = useNow(30_000);
  const [scale, setScale] = useState<Period>('week');
  const plugin = findVisualization(look.vizId);
  const values = settingsOf(look, plugin.id);
  const colors = useMemo(() => activityColors(activities), [activities]);
  const runId = running(mock)?.id ?? null;

  const { from, to } = periodRange(scale, now);
  const spans = toSpans(entries, colors, from, to, now);
  // Миниатюры — вчерашний день: он уже целиком заполнен.
  const y = periodRange('day', addLocalDays(now, -1));
  const ySpans = toSpans(entries, colors, y.from, y.to, now);

  const Viz = lazyViz(plugin);
  // showIf: настройка видна, только если другая равна одному из значений.
  const visible = plugin.settings.filter((d) => !d.showIf || d.showIf.equals.includes(values[d.showIf.id]));
  const changed = Object.keys(look.settings[plugin.id] ?? {}).length > 0;

  return (
    <div className="screen fit appearance">
      <div className="page-head">
        <button className="nav-arrow" onClick={onBack} aria-label="Назад">‹</button>
        <h1>Оформление</h1>
        <button className="btn small ghost" disabled={!changed} onClick={() => resetSettings(plugin.id)}>Сбросить</button>
      </div>

      <div className="widget viz preview">
        <Segmented
          options={[{ id: 'day', label: 'День' }, { id: 'week', label: 'Неделя' }, { id: 'month', label: 'Месяц' }]}
          value={scale}
          onChange={setScale}
        />
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
            <button key={v.id} className="style-card" aria-pressed={v.id === plugin.id} onClick={() => setVisualization(v.id)}>
              <div className="style-thumb">
                <Suspense fallback={null}>
                  <Thumb scale="day" from={y.from} to={y.to} spans={ySpans} runningEntryId={null} settings={settingsOf(look, v.id)} onSelect={() => {}} />
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
          <SettingControl key={d.id} def={d} value={values[d.id]} onChange={(v) => setSetting(plugin.id, d.id, v)} />
        ))}
      </div>
    </div>
  );
}
