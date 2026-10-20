import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { activityColors } from '../../domain/colors';
import { childrenOf } from '../../domain/tree';
import { resetDemo, setFill, setSpotSize, setViz, showBackupBanner, simulateForgotten, useMock } from '../../mock/store';
import { visualizations } from '../../visualizations/registry';
import { shareBackup } from './backup';
import { Sheet } from '../../ui/Sheet';

const fills = [['calendar', 'Календарь'], ['rows', 'По дням'], ['flow', 'Подряд'], ['jar', 'Копилка'], ['spots', 'Пятна']] as const;

// Экран «Ещё»: занятия, стиль, бэкап, служебное. В макете — плюс демо-кнопки.
export default function More({ goToday }: { goToday: () => void }) {
  const state = useMock();
  const colors = useMemo(() => activityColors(state.activities), [state.activities]);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [treeOpen, setTreeOpen] = useState(false);

  // useEffect(…, []) ≈ Start() в Unity: выполнится один раз после появления экрана.
  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted);
  }, []);

  const standalone = window.matchMedia('(display-mode: standalone)').matches;

  const tree = (parentId: string | null, depth: number): ReactNode[] =>
    childrenOf(state.activities, parentId).flatMap((a) => [
      <div key={a.id} className="tree-row" style={{ paddingLeft: 4 + depth * 20 }}>
        <span className="dot" style={{ background: colors.get(a.id) }} />
        <span className="tree-name">{a.icon && depth === 0 ? `${a.icon} ` : ''}{a.name}</span>
      </div>,
      ...tree(a.id, depth + 1),
    ]);

  return (
    <div className="screen fit">
      <h1>Ещё</h1>

      <div className="widget pad">
        <div className="card-title">Стиль</div>
        <div className="opt-grid">
          {visualizations.map((v) => (
            <button key={v.id} aria-pressed={state.vizId === v.id} onClick={() => setViz(v.id)}>{v.title}</button>
          ))}
        </div>
        <div className="sub-title-row">
          <div className="card-title sub-title">Заливка</div>
          {state.fill === 'spots' && (
            // Ползунок размера пятен — в строке заголовка, чтобы экран не вырос.
            // onChange срабатывает на каждом шаге — мозаика пересобирается сразу.
            <label className="slider-row">
              <span className="dim">размер</span>
              <input type="range" min={1} max={10} value={state.spotSize} onChange={(e) => setSpotSize(Number(e.target.value))} />
              <span className="dim">{state.spotSize}</span>
            </label>
          )}
        </div>
        <div className="opt-grid three">
          {fills.map(([id, title]) => (
            <button key={id} aria-pressed={state.fill === id} onClick={() => setFill(id)}>{title}</button>
          ))}
        </div>
      </div>

      <button className="widget pad row-btn" onClick={() => setTreeOpen(true)}>
        <span>Занятия</span>
        <span className="dim">{state.activities.length} ›</span>
      </button>

      <div className="widget pad">
        <div className="card-title">Бэкап · последний 4 дня назад</div>
        <div className="btn-row">
          <button className="btn primary" onClick={() => shareBackup(state)}>Сохранить в Файлы</button>
          <button className="btn" disabled>Восстановить</button>
        </div>
      </div>

      <div className="widget pad">
        <div className="btn-row demo">
          <span className="card-title">Демо</span>
          <button className="btn small" onClick={() => { simulateForgotten(); goToday(); }}>Таймер 5 ч</button>
          <button className="btn small" onClick={() => { showBackupBanner(); goToday(); }}>Плашка</button>
          <button className="btn small" onClick={resetDemo}>Сброс</button>
        </div>
      </div>

      <div className="widget pad small dim about">
        Eukairo {__APP_VERSION__} · сборка {__BUILD_TIME__}<br />
        С экрана «Домой»: {standalone ? 'да' : 'нет'} · хранилище защищено: {persisted === null ? '…' : persisted ? 'да' : 'нет'}
      </div>

      {treeOpen && (
        <Sheet title="Занятия" onClose={() => setTreeOpen(false)}>
          <div className="tree">{tree(null, 0)}</div>
          <p className="dim small">Цвет детей — оттенки цвета корня. Редактор дерева (добавить, перенести, архив) — на этапе ядра.</p>
        </Sheet>
      )}
    </div>
  );
}
