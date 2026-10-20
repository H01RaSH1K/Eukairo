import { useMemo, useState, type ReactNode } from 'react';
import type { Activity } from '../../db/schema';
import {
  addActivity, archiveActivity, deleteActivity, moveActivity, reorderActivity, restoreActivity, setActivityTimer, updateActivity,
} from '../../db/commands';
import { useData } from '../../db/store';
import { activityColors } from '../../domain/colors';
import { childrenOf, forgetAfter, isHidden, isNeed, pathOf, subtreeIds, timerRange } from '../../domain/tree';
import { Sheet } from '../../ui/Sheet';
import { shortMin } from '../today/Dial';
import { ActivityPicker } from './ActivityPicker';

// Экран «Занятия»: дерево целиком, тап по строке — карточка занятия (название, цвет,
// диапазон таймера, порог забытого таймера, перенос, «Завершить», удаление).
// Внизу свёрнутый раздел «Завершённые» с кнопкой «Вернуть».
export default function Activities({ onBack }: { onBack: () => void }) {
  const { activities } = useData();
  const colors = useMemo(() => activityColors(activities), [activities]);
  const [editing, setEditing] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [fresh, setFresh] = useState<string | null>(null); // только что созданное — сразу печатать название

  // Завершённые «сверху»: сам узел завершён, а предки — нет (детей завершённого не дублируем).
  const done = activities.filter((a) => a.archivedAt && (a.parentId === null || !isHidden(activities, a.parentId)));

  const add = async (parentId: string | null) => {
    const id = await addActivity(parentId, 'Новое занятие');
    setFresh(id);
    setEditing(id);
  };

  const tree = (parentId: string | null, depth: number): ReactNode[] =>
    childrenOf(activities, parentId).flatMap((a) => [
      <div key={a.id} className="tree-row" style={{ paddingLeft: 8 + depth * 20 }} onClick={() => setEditing(a.id)}>
        <span className="dot" style={{ background: colors.get(a.id) }} />
        <span className="tree-name">{a.icon && depth === 0 ? `${a.icon} ` : ''}{a.name}</span>
        {a.need && <span className="need-tag">нужда</span>}
        <span className="dim small">{timerRange(activities, a.id).map(shortMin).join(' – ')}</span>
      </div>,
      ...tree(a.id, depth + 1),
    ]);

  const edited = activities.find((a) => a.id === editing);

  return (
    <div className="screen fit activities">
      <div className="page-head">
        <button className="nav-arrow" onClick={onBack} aria-label="Назад">‹</button>
        <h1>Занятия</h1>
        <button className="btn small ghost" onClick={() => void add(null)}>＋ Занятие</button>
      </div>

      {/* Список прокручивается внутри своей карточки — сам экран не прокручивается. */}
      <div className="widget pad tree-widget">
        <div className="tree">{tree(null, 0)}</div>
        {done.length > 0 && (
          <>
            <button className="row-btn done-toggle" onClick={() => setShowDone(!showDone)}>
              <span className="dim">Завершённые · {done.length}</span>
              <span className="dim">{showDone ? '▾' : '▸'}</span>
            </button>
            {showDone && done.map((a) => (
              <div key={a.id} className="tree-row archived">
                <span className="dot" style={{ background: colors.get(a.id) }} />
                <span className="tree-name">
                  {a.name}
                  {a.parentId && <span className="dim small"> · {pathOf(activities, a.parentId).map((p) => p.name).join(' › ')}</span>}
                </span>
                <button className="btn small" onClick={() => void restoreActivity(a.id)}>Вернуть</button>
              </div>
            ))}
          </>
        )}
      </div>

      <p className="dim small hint">
        Тапни занятие, чтобы изменить. Цвет детей — оттенки цвета корня; диапазон таймера и порог «забытого таймера»
        без своего значения берутся у родителя. «Нужда» — не в счёт полезного. «Завершить» прячет проект из выбора, а история и сводки остаются.
      </p>

      {edited && <ActivitySheet key={edited.id} a={edited} isNew={edited.id === fresh} all={activities} color={colors.get(edited.id) ?? '#888'}
        onClose={() => setEditing(null)} onAddChild={() => void add(edited.id)} />}
    </div>
  );
}

/** Карточка одного занятия. Каждое изменение сразу пишется в базу. */
function ActivitySheet({ a, isNew, all, color, onClose, onAddChild }: {
  a: Activity; isNew: boolean; all: Activity[]; color: string; onClose: () => void; onAddChild: () => void;
}) {
  const [name, setName] = useState(a.name);
  const [moving, setMoving] = useState(false);
  const isRoot = a.parentId === null;
  const siblings = childrenOf(all, a.parentId);
  const index = siblings.findIndex((s) => s.id === a.id);
  const [lo, hi] = timerRange(all, a.id);
  const ownTimer = a.timerMinMin !== undefined || a.timerMaxMin !== undefined;
  const forget = forgetAfter(all, a.id);
  const needByParent = !a.need && a.parentId !== null && isNeed(all, a.parentId);

  const commitName = () => { if (name.trim() && name.trim() !== a.name) void updateActivity(a.id, { name: name.trim() }); };
  const close = () => { commitName(); onClose(); };

  const remove = async () => {
    if (!confirm(`Удалить «${a.name}»${childrenOf(all, a.id).length ? ' вместе с подзанятиями' : ''}?`)) return;
    const r = await deleteActivity(a.id);
    if (r === 'archived') alert('По этому занятию есть записи, поэтому оно не удалено, а завершено: история и сводки сохранятся. Вернуть можно в разделе «Завершённые».');
    onClose();
  };

  // Куда можно перенести: всё, кроме самого узла и его потомков (и завершённого).
  const banned = subtreeIds(all, a.id);
  const targets = all.filter((x) => !banned.has(x.id));

  return (
    <Sheet title={isRoot ? 'Занятие' : pathOf(all, a.parentId!).map((p) => p.name).join(' › ')} onClose={close}>
      <div className="form">
        <div className="field-row name-row">
          {isRoot && (
            <input className="field icon-input" value={a.icon ?? ''} placeholder="🙂" aria-label="Иконка"
              onChange={(e) => void updateActivity(a.id, { icon: [...e.target.value].slice(-2).join('') || undefined })} />
          )}
          <input className="field" value={name} placeholder="Название" autoFocus={isNew} onFocus={(e) => isNew && e.target.select()}
            onChange={(e) => setName(e.target.value)} onBlur={commitName} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
        </div>

        {isRoot ? (
          <div className="range-edit flat">
            <label className="setting-title">Цвет <span className="dot" style={{ background: color, display: 'inline-block', verticalAlign: 'middle' }} /></label>
            <input className="slider hue-slider" type="range" min={0} max={359} value={a.hue ?? 0}
              onChange={(e) => void updateActivity(a.id, { hue: Number(e.target.value) })} />
          </div>
        ) : (
          <div className="dim small">Цвет — оттенок родителя <span className="dot" style={{ background: color, display: 'inline-block', verticalAlign: 'middle' }} /></div>
        )}

        <div className="range-edit flat">
          <div className="setting-toggle">
            <span className="setting-title">Таймер {shortMin(lo)} – {shortMin(hi)}</span>
            {ownTimer && !isRoot && <button className="btn small ghost" onClick={() => void setActivityTimer(a.id, undefined, undefined)}>как у родителя</button>}
            {!ownTimer && !isRoot && <span className="dim small">как у родителя</span>}
          </div>
          <input className="slider" type="range" min={5} max={475} step={5} value={lo} aria-label="Таймер от"
            onChange={(e) => { const v = Number(e.target.value); void setActivityTimer(a.id, v, Math.max(hi, v + 5)); }} />
          <input className="slider" type="range" min={10} max={480} step={5} value={hi} aria-label="Таймер до"
            onChange={(e) => { const v = Number(e.target.value); void setActivityTimer(a.id, Math.min(lo, v - 5), v); }} />
        </div>

        <div className="range-edit flat">
          <div className="setting-toggle">
            <span className="setting-title">Спросить «таймер не забыт?» через {shortMin(forget)}</span>
            {a.forgetAfterMin !== undefined && <button className="btn small ghost" onClick={() => void updateActivity(a.id, { forgetAfterMin: undefined })}>{isRoot ? 'по умолч.' : 'как у родителя'}</button>}
          </div>
          <input className="slider" type="range" min={30} max={720} step={30} value={forget} aria-label="Порог забытого таймера"
            onChange={(e) => void updateActivity(a.id, { forgetAfterMin: Number(e.target.value) })} />
        </div>

        <label className="range-edit flat setting-toggle need-toggle">
          <span>
            <span className="setting-title">Нужда</span>
            <span className="setting-hint">
              {needByParent ? 'Как у родителя' : 'Сон, еда: не в счёт полезного, часы вынимаются из мозаики дня'}
            </span>
          </span>
          <input type="checkbox" checked={a.need || needByParent} disabled={needByParent}
            onChange={(e) => void updateActivity(a.id, { need: e.target.checked || undefined })} />
        </label>

        <div className="btn-row">
          <button className="btn" onClick={() => { commitName(); onAddChild(); }}>＋ Подзанятие</button>
          <button className="btn" onClick={() => setMoving(true)}>Перенести</button>
          <button className="btn arrow" disabled={index <= 0} onClick={() => void reorderActivity(a.id, -1)} aria-label="Выше">↑</button>
          <button className="btn arrow" disabled={index < 0 || index >= siblings.length - 1} onClick={() => void reorderActivity(a.id, 1)} aria-label="Ниже">↓</button>
        </div>
        <div className="btn-row">
          <button className="btn" onClick={() => { commitName(); void archiveActivity(a.id); onClose(); }}>Завершить</button>
          <button className="btn danger" onClick={() => void remove()}>Удалить</button>
        </div>
      </div>

      {moving && (
        <ActivityPicker
          activities={targets}
          colors={activityColors(all)}
          title={`Перенести «${a.name}» в…`}
          onPick={(id) => { void moveActivity(a.id, id); setMoving(false); }}
          onClose={() => setMoving(false)}
          footer={!isRoot && <button className="btn ghost" onClick={() => { void moveActivity(a.id, null); setMoving(false); }}>В корень (отдельное занятие)</button>}
        />
      )}
    </Sheet>
  );
}
