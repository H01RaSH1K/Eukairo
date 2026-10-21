import { useMemo, useState } from 'react';
import { useData } from '../../db/store';
import { activityColors } from '../../domain/colors';
import { COUNT, choiceParams, describePoint, numberParams, sumValues } from '../../domain/points';
import { dayKey, dayStarts, formatClock, startOfLocalDay, type Period } from '../../domain/time';
import { isHidden } from '../../domain/tree';
import { ParamChart } from './ParamChart';
import { PointSheet } from './PointSheet';

// «Сводки → Записи»: записи без времени за период. Сверху выбор занятия, ниже —
// за день список записей, за неделю и месяц — график чисел по дням с фильтром по вариантам.
export function PointStats({ period, from, to, now }: { period: Period; from: number; to: number; now: number }) {
  const { activities, points } = useData();
  const colors = useMemo(() => activityColors(activities), [activities]);
  const inPeriod = points.filter((p) => p.at >= from && p.at < to);
  // Занятия: у которых есть записи за период или заданы параметры (по ним записи ещё будут).
  const used = new Set(inPeriod.map((p) => p.activityId));
  const list = activities.filter((a) => used.has(a.id) || (a.params?.length && !isHidden(activities, a.id)));
  const [sel, setSel] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null); // день, записи которого открыты
  // по умолчанию — занятие, у которого больше всего записей за период
  const count = (id: string) => inPeriod.filter((p) => p.activityId === id).length;
  const act = list.find((a) => a.id === sel) ?? [...list].sort((a, b) => count(b.id) - count(a.id))[0];

  if (!act) {
    return <div className="widget pad center dim">Записей без времени пока нет. Добавь их в «Ленте» кнопкой ＋, а числа и варианты задай у занятия в «Ещё → Занятия».</div>;
  }

  const params = act.params ?? [];
  const mine = inPeriod.filter((p) => p.activityId === act.id);
  const days = dayStarts(from, to);
  const byDay = new Map<string, typeof mine>();
  for (const p of mine) byDay.set(dayKey(p.at), [...(byDay.get(dayKey(p.at)) ?? []), p]);
  const pointsAt = (i: number) => byDay.get(dayKey(days[i])) ?? [];
  const color = colors.get(act.id) ?? 'var(--accent)';

  return (
    <div className="widget pad point-stats">
      <div className="chips-scroll">
        {list.map((a) => (
          <button key={a.id} aria-pressed={a.id === act.id} onClick={() => setSel(a.id)}>
            <span className="dot" style={{ background: colors.get(a.id) }} /> {a.icon ? a.icon + ' ' : ''}{a.name}
          </button>
        ))}
      </div>
      {period === 'day' ? (
        <div className="set-list day-points" onClick={() => setOpen(from)}>
          {mine.length === 0 && <p className="dim center small">За этот день записей нет. Тап — добавить.</p>}
          {mine.map((p, i) => (
            <div key={p.id} className="set-row">
              <span className="set-n" style={{ color }}>{i + 1}</span>
              <span className="set-text">{describePoint(p, params) || 'отметка'}</span>
              <span className="dim small">{formatClock(p.at)}</span>
            </div>
          ))}
        </div>
      ) : (
        <ParamChart key={act.id} days={days} today={startOfLocalDay(now)} color={color} chartKey="points"
          numbers={[...numberParams(params), { id: COUNT, name: 'Записей' }]} choices={choiceParams(params)}
          pointsAt={pointsAt} valuesAt={(i, keep) => sumValues(pointsAt(i).filter(keep))}
          fullTitle={<>{act.icon} {act.name}</>} empty="За этот период записей нет." />
      )}
      {open !== null && <PointSheet activityId={act.id} day={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
