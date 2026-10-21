import { useState } from 'react';
import type { Habit } from '../../db/schema';
import { setHabitMark } from '../../db/commands';
import { useData } from '../../db/store';
import { dayKey } from '../../domain/habits';
import { startOfLocalDay } from '../../domain/time';
import { Sheet } from '../../ui/Sheet';

// Отметка с числами: «Анжуманя — 35 раз, 3 подхода». Поля заранее заполнены
// числами за этот день, если они уже есть, иначе — последними вписанными.
export function MarkSheet({ habit, day, onClose }: { habit: Habit; day: number; onClose: () => void }) {
  const { habitMarks } = useData();
  const k = dayKey(day);
  const params = habit.params ?? [];
  const own = habitMarks.find((m) => m.id === `${habit.id}:${k}`);
  const last = own?.values ? own : habitMarks
    .filter((m) => m.habitId === habit.id && m.values && m.day < k)
    .sort((a, b) => (a.day < b.day ? 1 : -1))[0];
  // Record<string, string> ≈ Dictionary<string, string>: в полях держим текст, число — при сохранении.
  const [text, setText] = useState<Record<string, string>>(
    Object.fromEntries(params.map((p) => [p.id, last?.values?.[p.id] !== undefined ? String(last.values[p.id]) : ''])),
  );
  const isToday = day === startOfLocalDay(Date.now());
  const save = () => {
    const values: Record<string, number> = {};
    for (const p of params) {
      const v = Number(text[p.id]?.replace(',', '.'));
      if (text[p.id]?.trim() && Number.isFinite(v)) values[p.id] = v;
    }
    void setHabitMark(habit.id, k, true, values);
    onClose();
  };

  return (
    <Sheet title={`${habit.icon ?? ''} ${habit.name}`.trim()} onClose={onClose}>
      <div className="form">
        {!isToday && <p className="dim small center">{new Date(day).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}</p>}
        {params.map((p, i) => (
          <label key={p.id} className="field">
            <span className="field-value">{p.name}</span>
            {/* inputMode=decimal — на iPhone цифровая клавиатура с запятой */}
            <input inputMode="decimal" value={text[p.id]} autoFocus={i === 0} placeholder="—"
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
