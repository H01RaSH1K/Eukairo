import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { activityColors } from '../../domain/colors';
import { childrenOf } from '../../domain/tree';
import { resetDemo, showBackupBanner, simulateForgotten, useMock } from '../../mock/store';
import { findVisualization } from '../../visualizations/registry';
import { useAppearance } from '../../settings/appearance';
import Appearance from '../appearance/Appearance';
import { shareBackup } from './backup';
import { Sheet } from '../../ui/Sheet';

// Экран «Ещё»: занятия, стиль, бэкап, служебное. В макете — плюс демо-кнопки.
export default function More({ goToday }: { goToday: () => void }) {
  const state = useMock();
  const colors = useMemo(() => activityColors(state.activities), [state.activities]);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [treeOpen, setTreeOpen] = useState(false);
  const [lookOpen, setLookOpen] = useState(false);
  const look = useAppearance();

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

  // Оформление открывается поверх «Ещё», как экран в стеке навигации iOS.
  if (lookOpen) return <Appearance onBack={() => setLookOpen(false)} />;

  return (
    <div className="screen fit">
      <h1>Ещё</h1>

      <button className="widget pad row-btn" onClick={() => setLookOpen(true)}>
        <span>Оформление</span>
        <span className="dim">{findVisualization(look.vizId).title} ›</span>
      </button>

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
