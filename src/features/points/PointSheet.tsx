import { useMemo, useState } from 'react';
import type { Point } from '../../db/schema';
import { deletePoint, newId, savePoint } from '../../db/commands';
import { useData } from '../../db/store';
import { activityColors } from '../../domain/colors';
import { describePoint } from '../../domain/points';
import { dayKey, formatClock, startOfLocalDay } from '../../domain/time';
import { pathOf } from '../../domain/tree';
import { Sheet } from '../../ui/Sheet';

// «14:05» → момент внутри дня `base` (через календарь, чтобы перевод часов не сдвигал время).
function atClock(base: number, s: string): number {
  const [h, m] = s.split(':').map(Number);
  const d = new Date(base);
  d.setHours(h, m, 0, 0);
  return d.getTime();
}

// Записи без времени одного занятия за день: «20 раз · кулаки · пол», «15 раз · ладони · скамья»…
// Внизу форма, заполненная прошлой записью: поменял что нужно — «＋ Запись». Лист после добавления
// не закрывается, чтобы подряд вписать несколько подходов. Тап по записи в списке — правка.
export function PointSheet({ activityId, day, onClose }: { activityId: string; day: number; onClose: () => void }) {
  const { activities, points } = useData();
  const activity = activities.find((a) => a.id === activityId);
  const color = useMemo(() => activityColors(activities).get(activityId), [activities, activityId]);
  const params = activity?.params ?? [];
  const k = dayKey(day);
  const isToday = day === startOfLocalDay(Date.now());
  const mine = points.filter((p) => p.activityId === activityId);
  const list = mine.filter((p) => dayKey(p.at) === k);
  // Прошлая запись: последняя за этот день, иначе последняя до него (points отсортированы по at).
  const last: Point | undefined = list.at(-1) ?? mine.filter((p) => p.at < day).at(-1);

  const [edit, setEdit] = useState<Point | null>(null); // правим эту запись, иначе добавляем новую
  // Record<string, string> ≈ Dictionary<string, string>: в полях держим текст, число — при сохранении.
  const textOf = (p?: Point) => Object.fromEntries(params.map((q) => [q.id, p?.values?.[q.id] !== undefined ? String(p.values[q.id]) : '']));
  // Вариант по умолчанию — прошлый; если его с тех пор удалили из списка — первый.
  const choiceOf = (p?: Point) => Object.fromEntries(params.filter((q) => q.options?.length).map((q) => {
    const was = p?.choices?.[q.id];
    return [q.id, q.options!.some((o) => o.id === was) ? was! : q.options![0].id];
  }));
  const [text, setText] = useState<Record<string, string>>(() => textOf(last));
  const [choice, setChoice] = useState<Record<string, string>>(() => choiceOf(last));
  // Время: за сегодня пусто = «сейчас» (момент нажатия), за прошлый день — полдень.
  const [clock, setClock] = useState(isToday ? '' : '12:00');

  const startEdit = (p: Point) => { setEdit(p); setText(textOf(p)); setChoice(choiceOf(p)); setClock(formatClock(p.at)); };
  const stopEdit = () => { setEdit(null); setClock(isToday ? '' : '12:00'); };

  const save = () => {
    const values: Record<string, number> = {};
    for (const q of params) {
      if (q.options) continue;
      const v = Number(text[q.id]?.replace(',', '.'));
      if (text[q.id]?.trim() && Number.isFinite(v)) values[q.id] = v;
    }
    const at = clock ? atClock(day, clock) : Date.now();
    void savePoint({ id: edit?.id ?? newId(), activityId, at, values, choices: { ...choice } });
    if (edit) stopEdit();
    else if (isToday) setClock('');
  };

  if (!activity) return null;
  const name = pathOf(activities, activityId).map((a) => a.name).join(' › ');

  return (
    <Sheet title={`${activity.icon ?? ''} ${activity.name}`.trim()} onClose={onClose}>
      <div className="form">
        <p className="dim small center">
          {name !== activity.name && <>{name} · </>}
          {isToday ? 'сегодня' : new Date(day).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>

        {list.length > 0 && (
          <div className="set-list">
            {list.map((p, i) => (
              <div key={p.id} className={'set-row' + (edit?.id === p.id ? ' editing' : '')} onClick={() => startEdit(p)}>
                <span className="set-n" style={{ color }}>{i + 1}</span>
                <span className="set-text">{describePoint(p, params) || 'отметка'}</span>
                <span className="dim small">{formatClock(p.at)}</span>
                <button className="btn small" aria-label="Удалить запись"
                  onClick={(e) => { e.stopPropagation(); if (edit?.id === p.id) stopEdit(); void deletePoint(p.id); }}>✕</button>
              </div>
            ))}
          </div>
        )}

        {params.map((q) => q.options?.length ? (
          // вариант — одним тапом по чипу
          <div key={q.id} className="field choice-field">
            <span className="field-value">{q.name}</span>
            <div className="chips">
              {q.options.map((o) => (
                <button key={o.id} aria-pressed={choice[q.id] === o.id} onClick={() => setChoice({ ...choice, [q.id]: o.id })}>{o.name}</button>
              ))}
            </div>
          </div>
        ) : (
          <label key={q.id} className="field">
            <span className="field-value">{q.name}</span>
            {/* inputMode=decimal — на iPhone цифровая клавиатура с запятой. Без autoFocus: числа уже стоят
                от прошлой записи, клавиатура нужна, только если тапнуть по полю */}
            <input inputMode="decimal" value={text[q.id]} placeholder="—" enterKeyHint="done"
              onFocus={(e) => e.target.select()}
              onChange={(e) => setText({ ...text, [q.id]: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
            {q.unit && <span className="dim">{q.unit}</span>}
          </label>
        ))}
        {params.length === 0 && <p className="dim small center">У занятия нет параметров — запись просто отметит момент. Параметры задаются в «Ещё → Занятия».</p>}
        {clock ? (
          <label className="field">
            <span className="field-value">Время</span>
            <input type="time" value={clock} onChange={(e) => setClock(e.target.value)} />
          </label>
        ) : (
          // за сегодня по умолчанию «сейчас»; тап — вписать другое время
          <button className="field" onClick={() => setClock(formatClock(Date.now()))}>
            <span className="field-value">Время</span>
            <span className="dim">сейчас ›</span>
          </button>
        )}

        <div className="btn-row">
          <button className="btn primary" onClick={save}>{edit ? 'Сохранить' : '＋ Запись'}</button>
          {edit
            ? <button className="btn" onClick={stopEdit}>Отмена</button>
            : <button className="btn" onClick={onClose}>Готово</button>}
        </div>
      </div>
    </Sheet>
  );
}
