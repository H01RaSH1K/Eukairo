import { useState } from 'react';
import type { Habit } from '../../db/schema';
import { setHabitMark } from '../../db/commands';
import { useData } from '../../db/store';
import { dayKey } from '../../domain/habits';
import { startOfLocalDay } from '../../domain/time';
import { Sheet } from '../../ui/Sheet';

// Отметка с параметрами: «Анжуманя — 35 раз, 3 подхода, на кулаках». Поля заранее заполнены
// тем, что уже есть за этот день, иначе — последним вписанным (числа и варианты ищутся отдельно:
// вариант мог появиться у привычки позже чисел).
export function MarkSheet({ habit, day, onClose }: { habit: Habit; day: number; onClose: () => void }) {
  const { habitMarks } = useData();
  const k = dayKey(day);
  const params = habit.params ?? [];
  const own = habitMarks.find((m) => m.id === `${habit.id}:${k}`);
  const earlier = habitMarks.filter((m) => m.habitId === habit.id && m.day < k).sort((a, b) => (a.day < b.day ? 1 : -1));
  const lastValues = own?.values ?? earlier.find((m) => m.values)?.values;
  const lastChoices = own?.choices ?? earlier.find((m) => m.choices)?.choices;
  // Record<string, string> ≈ Dictionary<string, string>: в полях держим текст, число — при сохранении.
  const [text, setText] = useState<Record<string, string>>(
    Object.fromEntries(params.map((p) => [p.id, lastValues?.[p.id] !== undefined ? String(lastValues[p.id]) : ''])),
  );
  // Вариант по умолчанию — прошлый; если его с тех пор удалили из списка — первый.
  const [choice, setChoice] = useState<Record<string, string>>(
    Object.fromEntries(params.filter((p) => p.options?.length).map((p) => {
      const was = lastChoices?.[p.id];
      return [p.id, p.options!.some((o) => o.id === was) ? was! : p.options![0].id];
    })),
  );
  const isToday = day === startOfLocalDay(Date.now());
  const firstNumber = params.find((p) => !p.options)?.id;
  const save = () => {
    const values: Record<string, number> = {};
    for (const p of params) {
      if (p.options) continue;
      const v = Number(text[p.id]?.replace(',', '.'));
      if (text[p.id]?.trim() && Number.isFinite(v)) values[p.id] = v;
    }
    void setHabitMark(habit.id, k, true, values, choice);
    onClose();
  };

  return (
    <Sheet title={`${habit.icon ?? ''} ${habit.name}`.trim()} onClose={onClose}>
      <div className="form">
        {!isToday && <p className="dim small center">{new Date(day).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}</p>}
        {params.map((p) => p.options?.length ? (
          // вариант — одним тапом по чипу
          <div key={p.id} className="field choice-field">
            <span className="field-value">{p.name}</span>
            <div className="chips">
              {p.options.map((o) => (
                <button key={o.id} aria-pressed={choice[p.id] === o.id} onClick={() => setChoice({ ...choice, [p.id]: o.id })}>{o.name}</button>
              ))}
            </div>
          </div>
        ) : (
          <label key={p.id} className="field">
            <span className="field-value">{p.name}</span>
            {/* inputMode=decimal — на iPhone цифровая клавиатура с запятой */}
            <input inputMode="decimal" value={text[p.id]} autoFocus={p.id === firstNumber} placeholder="—"
              onFocus={(e) => e.target.select()}
              onChange={(e) => setText({ ...text, [p.id]: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && save()} />
            {p.unit && <span className="dim">{p.unit}</span>}
          </label>
        ))}
        <button className="btn primary" onClick={save}>Отметить</button>
        {own?.done && <button className="btn" onClick={() => { void setHabitMark(habit.id, k, false); onClose(); }}>Снять отметку</button>}
      </div>
    </Sheet>
  );
}
