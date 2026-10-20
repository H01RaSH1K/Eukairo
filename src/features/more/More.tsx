import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { activityColors } from '../../domain/colors';
import { childrenOf, timerRange } from '../../domain/tree';
import { shortMin } from '../today/Dial';
import { resetDemo, setActivityTimer, showBackupBanner, simulateForgotten, useMock } from '../../mock/store';
import { findVisualization } from '../../visualizations/registry';
import { useAppearance } from '../../settings/appearance';
import { designs, setDesign, useDesign } from '../../settings/design';
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
  const [editing, setEditing] = useState<string | null>(null); // у какого занятия открыт диапазон таймера
  const look = useAppearance();
  const design = useDesign();
  // Один стиль на всё — пишем его; разные — «свой у каждого».
  const ids = new Set([look.day.vizId, look.week.vizId, look.month.vizId]);
  const lookSummary = ids.size === 1 ? findVisualization(look.day.vizId).title : 'свой у Д/Н/М';

  // useEffect(…, []) ≈ Start() в Unity: выполнится один раз после появления экрана.
  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted);
  }, []);

  const standalone = window.matchMedia('(display-mode: standalone)').matches;

  const tree = (parentId: string | null, depth: number): ReactNode[] =>
    childrenOf(state.activities, parentId).flatMap((a) => [
      <div key={a.id} className="tree-row" style={{ paddingLeft: 4 + depth * 20 }} onClick={() => setEditing(editing === a.id ? null : a.id)}>
        <span className="dot" style={{ background: colors.get(a.id) }} />
        <span className="tree-name">{a.icon && depth === 0 ? `${a.icon} ` : ''}{a.name}</span>
        <span className="dim small">{timerRange(state.activities, a.id).map(shortMin).join(' – ')}</span>
      </div>,
      ...(editing === a.id ? [<TimerRangeEditor key={a.id + '-edit'} id={a.id} own={a.timerMinMin !== undefined} range={timerRange(state.activities, a.id)} />] : []),
      ...tree(a.id, depth + 1),
    ]);

  // Оформление открывается поверх «Ещё», как экран в стеке навигации iOS.
  if (lookOpen) return <Appearance onBack={() => setLookOpen(false)} />;

  return (
    <div className="screen fit">
      <h1>Ещё</h1>

      <button className="widget pad row-btn" onClick={() => setLookOpen(true)}>
        <span>Оформление</span>
        <span className="dim">{lookSummary} ›</span>
      </button>

      <div className="widget pad">
        <div className="chips design-chips">
          {designs.map((d) => (
            <button key={d.id} aria-pressed={design === d.id} onClick={() => setDesign(d.id)}>{d.title}</button>
          ))}
        </div>
        <div className="setting-hint">{designs.find((d) => d.id === design)!.hint}</div>
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
          <p className="dim small">Справа — диапазон ползунка таймера, тапни занятие, чтобы поменять. Дети без своего диапазона берут его у родителя. Цвет детей — оттенки цвета корня. Редактор дерева (добавить, перенести, архив) — на этапе ядра.</p>
        </Sheet>
      )}
    </div>
  );
}

/** Диапазон ползунка таймера у занятия: «от» и «до», шаг 5 минут. */
function TimerRangeEditor({ id, own, range }: { id: string; own: boolean; range: [number, number] }) {
  const [lo, hi] = range;
  return (
    <div className="range-edit">
      {!own && <div className="dim small">Сейчас берётся у родителя — подвинь, чтобы задать своё.</div>}
      <label className="setting-title">Таймер от <span className="setting-value">{shortMin(lo)}</span></label>
      <input className="slider" type="range" min={5} max={475} step={5} value={lo}
        onChange={(e) => { const v = Number(e.target.value); setActivityTimer(id, v, Math.max(hi, v + 5)); }} />
      <label className="setting-title">до <span className="setting-value">{shortMin(hi)}</span></label>
      <input className="slider" type="range" min={10} max={480} step={5} value={hi}
        onChange={(e) => { const v = Number(e.target.value); setActivityTimer(id, Math.min(lo, v - 5), v); }} />
    </div>
  );
}
