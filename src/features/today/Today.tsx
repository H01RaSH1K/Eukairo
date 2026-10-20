import { Suspense, lazy } from 'react';
import { defaultVisualization } from '../../visualizations/registry';
import { startOfLocalDay, startOfNextLocalDay } from '../../domain/time';

// lazy() ≈ загрузить префаб по требованию: код мозаики — отдельный файл,
// оболочка показывается, не дожидаясь его.
const Visualization = lazy(defaultVisualization.load);

export default function Today() {
  const now = Date.now();
  const from = startOfLocalDay(now);
  const date = new Date(now).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="screen">
      <h1>Сегодня</h1>
      <p className="dim" style={{ marginTop: -8 }}>{date}</p>
      <Suspense fallback={null}>
        <Visualization
          scale="day"
          from={from}
          to={startOfNextLocalDay(now)}
          spans={[]}
          runningEntryId={null}
          onSelect={() => {}}
        />
      </Suspense>
      <p className="dim">Здесь будут таймер и быстрые кнопки занятий.</p>
    </div>
  );
}
