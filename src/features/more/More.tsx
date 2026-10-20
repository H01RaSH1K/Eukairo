import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { activityColors } from '../../domain/colors';
import { childrenOf } from '../../domain/tree';
import { resetDemo, setViz, showBackupBanner, simulateForgotten, useMock } from '../../mock/store';
import { visualizations } from '../../visualizations/registry';
import { shareBackup } from './backup';

// Экран «Ещё»: занятия, стиль, бэкап, служебное. В макете — плюс демо-кнопки.
export default function More({ goToday }: { goToday: () => void }) {
  const state = useMock();
  const colors = useMemo(() => activityColors(state.activities), [state.activities]);
  const [persisted, setPersisted] = useState<boolean | null>(null);

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
    <div className="screen">
      <h1>Ещё</h1>

      <div className="card-title">Стиль визуализации</div>
      <div className="card">
        {visualizations.map((v) => (
          <label key={v.id} className="row radio">
            <span>{v.title}</span>
            <input type="radio" name="viz" checked={state.vizId === v.id} onChange={() => setViz(v.id)} />
          </label>
        ))}
      </div>

      <div className="card-title">Занятия</div>
      <div className="card">
        <div className="tree">{tree(null, 0)}</div>
        <p className="dim small">Цвет детей — оттенки цвета корня. Редактор дерева (добавить, перенести, архив) — на этапе ядра.</p>
      </div>

      <div className="card-title">Бэкап</div>
      <div className="card">
        <div className="row"><span>Последний бэкап</span><span className="dim">4 дня назад</span></div>
        <button className="btn primary" onClick={() => shareBackup(state)}>Сохранить в Файлы</button>
        <button className="btn" disabled>Восстановить из файла…</button>
      </div>

      <div className="card-title">Демо (только в макете)</div>
      <div className="card">
        <button className="btn" onClick={() => { simulateForgotten(); goToday(); }}>Показать «забытый таймер»</button>
        <button className="btn" onClick={() => { showBackupBanner(); goToday(); }}>Показать плашку бэкапа</button>
        <button className="btn" onClick={resetDemo}>Сбросить демо-данные</button>
      </div>

      <div className="card-title">О приложении</div>
      <div className="card">
        <div className="row"><span>Версия</span><span className="dim">{__APP_VERSION__}</span></div>
        <div className="row"><span>Сборка</span><span className="dim">{__BUILD_TIME__}</span></div>
        <div className="row"><span>Запущено с экрана «Домой»</span><span className="dim">{standalone ? 'да' : 'нет'}</span></div>
        <div className="row"><span>Хранилище защищено</span><span className="dim">{persisted === null ? '…' : persisted ? 'да' : 'нет'}</span></div>
      </div>
    </div>
  );
}
