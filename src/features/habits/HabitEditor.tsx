import { useMemo, useState } from 'react';
import type { Habit, HabitKind } from '../../db/schema';
import { addHabit, archiveHabit, deleteHabit, updateHabit } from '../../db/commands';
import { useData } from '../../db/store';
import { activityColors } from '../../domain/colors';
import { WEEKDAYS } from '../../domain/habits';
import { pathOf } from '../../domain/tree';
import { Sheet } from '../../ui/Sheet';
import { ActivityPicker } from '../activities/ActivityPicker';

const KINDS: { id: HabitKind; title: string; hint: string }[] = [
  { id: 'check', title: 'Галочка', hint: 'Тапнул, и готово. Зубы, посуда, отжимания.' },
  { id: 'time', title: 'Время занятия', hint: 'Засчитается сама, когда протрекаешь нужное время.' },
  { id: 'points', title: 'Записи занятия', hint: 'Засчитается сама, когда за день есть запись: подход, замер. Числа и варианты — у занятия.' },
  { id: 'quit', title: 'Держусь', hint: 'День засчитан, пока не отметишь срыв.' },
];

// Создание и правка привычки. Правки копятся в черновике и пишутся кнопкой «Сохранить».
export function HabitEditor({ habit, onClose, onRemoved }: { habit?: Habit; onClose: () => void; onRemoved?: () => void }) {
  const { activities } = useData();
  const colors = useMemo(() => activityColors(activities), [activities]);
  const [name, setName] = useState(habit?.name ?? '');
  const [icon, setIcon] = useState(habit?.icon ?? '');
  const [kind, setKind] = useState<HabitKind>(habit?.kind ?? 'check');
  const [activityId, setActivityId] = useState(habit?.activityId);
  const [goalMin, setGoalMin] = useState(habit?.goalMin ?? 10);
  const [weekdays, setWeekdays] = useState<number[] | undefined>(habit?.weekdays);
  const [picking, setPicking] = useState(false);

  const linked = kind === 'time' || kind === 'points'; // привязана к занятию
  const canSave = name.trim() !== '' && (!linked || !!activityId);
  const save = async () => {
    const fields = {
      name: name.trim(), icon: icon || undefined, kind,
      activityId: linked ? activityId : undefined,
      goalMin: kind === 'time' ? goalMin : undefined,
      weekdays: weekdays && weekdays.length < 7 ? weekdays : undefined,
    };
    if (habit) await updateHabit(habit.id, fields);
    else await addHabit(fields);
    onClose();
  };

  const toggleDay = (i: number) => {
    const cur = weekdays ?? [0, 1, 2, 3, 4, 5, 6];
    const next = cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i].sort();
    if (next.length) setWeekdays(next.length === 7 ? undefined : next);
  };

  const remove = async () => {
    if (!habit || !confirm(`Удалить «${habit.name}» вместе со всеми отметками? Чтобы просто убрать с экрана, лучше «Завершить».`)) return;
    await deleteHabit(habit.id);
    onClose();
    onRemoved?.();
  };

  return (
    <Sheet title={habit ? 'Привычка' : 'Новая привычка'} onClose={onClose}>
      <div className="form habit-editor">
        <div className="field-row name-row">
          <input className="field icon-input" value={icon} placeholder="🙂" aria-label="Иконка"
            onChange={(e) => setIcon([...e.target.value].slice(-2).join(''))} />
          <input className="field" value={name} placeholder="Название" autoFocus={!habit} onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="setting-title">Как засчитывать</div>
        <div className="kind-list">
          {KINDS.map((k) => (
            <button key={k.id} className="kind-opt" aria-pressed={k.id === kind} onClick={() => setKind(k.id)}>
              <b>{k.title}</b><span>{k.hint}</span>
            </button>
          ))}
        </div>

        {linked && (
          <>
            <button className="field" onClick={() => setPicking(true)}>
              {activityId ? <span className="dot" style={{ background: colors.get(activityId) }} /> : null}
              <span className="field-value">{activityId ? pathOf(activities, activityId).map((a) => a.name).join(' › ') : 'Выбрать занятие'}</span>
              <span className="dim">›</span>
            </button>
            {kind === 'time' && <div className="range-edit flat">
              <div className="setting-title">В день <span className="setting-value">{goalMin} мин</span></div>
              <input className="slider" type="range" min={1} max={120} value={goalMin} aria-label="Минут в день"
                onChange={(e) => setGoalMin(Number(e.target.value))} />
            </div>}
            {kind === 'points' && <div className="setting-hint">Записи добавляются тапом по привычке или в «Ленте». Какие числа и варианты в них вписывать, задаётся у занятия: «Ещё → Занятия».</div>}
          </>
        )}

        <div className="setting-title">Когда</div>
        <div className="chips weekday-chips">
          {WEEKDAYS.map((w, i) => (
            <button key={w} aria-pressed={!weekdays || weekdays.includes(i)} onClick={() => toggleDay(i)}>{w}</button>
          ))}
        </div>
        <div className="setting-hint">{weekdays ? 'Пропуск в другие дни серию не рвёт.' : 'Каждый день. Сними лишние дни, если привычка не ежедневная.'}</div>

        <button className="btn primary" disabled={!canSave} onClick={() => void save()}>{habit ? 'Сохранить' : 'Создать'}</button>
        {habit && (
          <div className="btn-row">
            <button className="btn" onClick={() => { void archiveHabit(habit.id); onClose(); onRemoved?.(); }}>Завершить</button>
            <button className="btn danger" onClick={() => void remove()}>Удалить</button>
          </div>
        )}
      </div>

      {picking && (
        <ActivityPicker activities={activities} colors={colors} title="Занятие привычки"
          onPick={(id) => { setActivityId(id); setPicking(false); if (!name.trim()) setName(pathOf(activities, id).at(-1)!.name); }}
          onClose={() => setPicking(false)} />
      )}
    </Sheet>
  );
}

