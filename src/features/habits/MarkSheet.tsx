import { useState } from 'react';
import type { Habit, HabitSet } from '../../db/schema';
import { addHabitSet, removeHabitSet } from '../../db/commands';
import { useData } from '../../db/store';
import { dayKey, markSets } from '../../domain/habits';
import { startOfLocalDay } from '../../domain/time';
import { Sheet } from '../../ui/Sheet';

// Записи привычки за день: «20 раз · кулаки · пол», «15 раз · ладони · скамья»…
// Внизу форма нового подхода, заполненная прошлым подходом: поменял что нужно — «＋ Подход».
// Лист после добавления не закрывается, чтобы подряд вписать несколько подходов.
export function MarkSheet({ habit, day, onClose }: { habit: Habit; day: number; onClose: () => void }) {
  const { habitMarks } = useData();
  const k = dayKey(day);
  const params = habit.params ?? [];
  const own = habitMarks.find((m) => m.id === `${habit.id}:${k}`);
  const sets = own?.done ? markSets(own) : [];
  // Прошлый подход: последний за этот день, иначе последний из прошлых дней.
  const earlier = habitMarks.filter((m) => m.habitId === habit.id && m.done && m.day < k).sort((a, b) => (a.day < b.day ? 1 : -1));
  const last: HabitSet | undefined = sets.at(-1) ?? earlier.map((m) => markSets(m).at(-1)).find(Boolean);

  // Record<string, string> ≈ Dictionary<string, string>: в полях держим текст, число — при сохранении.
  const [text, setText] = useState<Record<string, string>>(
    Object.fromEntries(params.map((p) => [p.id, last?.values?.[p.id] !== undefined ? String(last.values[p.id]) : ''])),
  );
  // Вариант по умолчанию — прошлый; если его с тех пор удалили из списка — первый.
  const [choice, setChoice] = useState<Record<string, string>>(
    Object.fromEntries(params.filter((p) => p.options?.length).map((p) => {
      const was = last?.choices?.[p.id];
      return [p.id, p.options!.some((o) => o.id === was) ? was! : p.options![0].id];
    })),
  );
  const isToday = day === startOfLocalDay(Date.now());
  const firstNumber = params.find((p) => !p.options)?.id;

  const add = () => {
    const values: Record<string, number> = {};
    for (const p of params) {
      if (p.options) continue;
      const v = Number(text[p.id]?.replace(',', '.'));
      if (text[p.id]?.trim() && Number.isFinite(v)) values[p.id] = v;
    }
    void addHabitSet(habit.id, k, { values, choices: { ...choice } });
  };

  // «20 раз · кулаки · пол» — как запись выглядит в списке.
  const describe = (s: HabitSet) => params.flatMap((p) => {
    if (p.options) {
      const o = p.options.find((x) => x.id === s.choices?.[p.id]);
      return o ? [o.name] : [];
    }
    const v = s.values?.[p.id];
    return v === undefined ? [] : [`${v}${p.unit ? ' ' + p.unit : ' ' + p.name.toLowerCase()}`];
  }).join(' · ') || 'без чисел';

  return (
    <Sheet title={`${habit.icon ?? ''} ${habit.name}`.trim()} onClose={onClose}>
      <div className="form">
        {!isToday && <p className="dim small center">{new Date(day).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}</p>}

        {sets.length > 0 && (
          <div className="set-list">
            {sets.map((s, i) => (
              <div key={s.id} className="set-row">
                <span className="set-n">{i + 1}</span>
                <span className="set-text">{describe(s)}</span>
                <button className="btn small" aria-label="Удалить подход" onClick={() => void removeHabitSet(habit.id, k, s.id)}>✕</button>
              </div>
            ))}
          </div>
        )}

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
            <input inputMode="decimal" value={text[p.id]} autoFocus={p.id === firstNumber && sets.length === 0} placeholder="—"
              onFocus={(e) => e.target.select()}
              onChange={(e) => setText({ ...text, [p.id]: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && add()} />
            {p.unit && <span className="dim">{p.unit}</span>}
          </label>
        ))}
        <div className="btn-row">
          <button className="btn primary" onClick={add}>＋ Подход</button>
          <button className="btn" onClick={onClose}>Готово</button>
        </div>
      </div>
    </Sheet>
  );
}
