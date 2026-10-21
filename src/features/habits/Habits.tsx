import { useMemo, useState } from 'react';
import { reorderHabit, restoreHabit } from '../../db/commands';
import { useData } from '../../db/store';
import { activeHabits, habitColors, scheduleText } from '../../domain/habits';
import { HabitEditor } from './HabitEditor';

// Экран «Привычки» поверх «Ещё»: список, порядок, создание, завершённые.
export default function Habits({ onBack }: { onBack: () => void }) {
  const { habits, activities } = useData();
  const colors = useMemo(() => habitColors(habits, activities), [habits, activities]);
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [showDone, setShowDone] = useState(false);
  const list = activeHabits(habits);
  const done = habits.filter((h) => h.archivedAt);
  const edited = habits.find((h) => h.id === editing);

  return (
    <div className="screen fit activities">
      <div className="page-head">
        <button className="nav-arrow" onClick={onBack} aria-label="Назад">‹</button>
        <h1>Привычки</h1>
        <button className="btn small ghost" onClick={() => setEditing('new')}>＋ Привычка</button>
      </div>

      <div className="widget pad tree-widget">
        {list.length === 0 && <p className="dim center">Привычек пока нет. Добавь первую кнопкой сверху.</p>}
        {list.map((h, i) => (
          <div key={h.id} className="tree-row" onClick={() => setEditing(h.id)}>
            <span className="dot" style={{ background: colors.get(h.id) }} />
            <span className="tree-name">
              {h.icon ? `${h.icon} ` : ''}{h.name}
              <span className="dim small"> · {scheduleText(h)}{h.kind === 'time' ? ` · ${h.goalMin} мин` : h.kind === 'quit' ? ' · держусь' : h.kind === 'points' ? ' · по записям' : ''}</span>
            </span>
            <button className="tree-chevron" disabled={i === 0} aria-label="Выше" onClick={(e) => { e.stopPropagation(); void reorderHabit(h.id, -1); }}>↑</button>
            <button className="tree-chevron" disabled={i === list.length - 1} aria-label="Ниже" onClick={(e) => { e.stopPropagation(); void reorderHabit(h.id, 1); }}>↓</button>
          </div>
        ))}
        {done.length > 0 && (
          <>
            <button className="row-btn done-toggle" onClick={() => setShowDone(!showDone)}>
              <span className="dim">Завершённые · {done.length}</span>
              <span className="dim">{showDone ? '▾' : '▸'}</span>
            </button>
            {showDone && done.map((h) => (
              <div key={h.id} className="tree-row archived">
                <span className="dot" style={{ background: colors.get(h.id) }} />
                <span className="tree-name">{h.name}</span>
                <button className="btn small" onClick={() => void restoreHabit(h.id)}>Вернуть</button>
              </div>
            ))}
          </>
        )}
      </div>

      <p className="dim small hint">
        Отмечать — на «Сегодня»: тап по кружку, долгий тап открывает серию, календарь и график. Прошлые дни — листай «Сегодня» назад
        или тапай день в календаре привычки. «Завершить» убирает привычку с экрана, история остаётся.
      </p>

      {editing === 'new' && <HabitEditor onClose={() => setEditing(null)} />}
      {edited && <HabitEditor key={edited.id} habit={edited} onClose={() => setEditing(null)} />}
    </div>
  );
}
