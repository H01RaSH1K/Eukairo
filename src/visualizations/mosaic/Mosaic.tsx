import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import type { VisualizationProps } from '../types';
import { HOUR_MS, dayStarts } from '../../domain/time';
import { hourOwners, spotPlaces, type HourOwner } from './layout';
import { dayBorderPath, getPattern, leadPath, seedFor, type FillId, type PatternId } from './patterns';
import './mosaic.css';

// Мозаика-витраж: период делится на сегменты, сегмент = час. Нарезка стёкол
// своя у каждого дня/недели/месяца (зависит от даты), чтобы дни не были одинаковыми
// (день — 24, неделя — 168, месяц — 24 × дней; всегда одна картина).
// Час целиком одного цвета — цвета записи, занявшей бо́льшую его часть (от 30 мин).
// Часы одной записи сливаются в одну фигуру: между ними нет свинцовой линии.

const leadWidth = { day: 1.4, week: 0.7, month: 0.45 };

function Mosaic({ pattern, scale, from, to, spans, runningEntryId, fill: fillProp, spotSize, onSelect }: VisualizationProps & { pattern: PatternId }) {
  const days = dayStarts(from, to);
  // Меряем место под картину, чтобы узор заполнил виджет целиком.
  // ResizeObserver ≈ подписка на событие «размер изменился».
  const box = useRef<HTMLDivElement>(null);
  const [aspect, setAspect] = useState(0.7);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      if (width > 0 && height > 0) setAspect(width / height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const fill = fillProp as FillId;
  const weekday = (new Date(from).getDay() + 6) % 7; // getDay: 0 = вс → делаем 0 = пн
  const { w, h, cells, decor, day } = getPattern(pattern, days.length, seedFor(from), aspect, fill === 'spots' ? 'flow' : fill, weekday);
  // flatMap ≈ SelectMany: 24 часа каждого дня подряд.
  const hours = days.flatMap((d) => hourOwners(spans, d));
  // Копилка и пятна: пустые часы выкидываем, занятые раскладываем по-своему.
  // filter ≈ Where; `o is HourOwner` — проверка типа, как в C# pattern matching.
  const filled = hours.filter((o): o is HourOwner => o !== null);
  const seed = seedFor(from);
  const places = useMemo(
    () => (fill === 'spots' ? spotPlaces(cells, filled, seed, days.length, spotSize) : fill === 'jar' ? filled.map((_, i) => i) : null),
    [fill, cells, seed, days.length, spotSize, hours.map((o) => o?.entryId ?? '').join('|')], // eslint-disable-line react-hooks/exhaustive-deps
  );
  let owners: (HourOwner | null)[] = hours;
  if (places) {
    owners = cells.map(() => null);
    places.forEach((cell, k) => { owners[cell] = filled[k]; });
  }
  const ownerIds = owners.map((o) => o?.entryId ?? null);
  // Линии пересчитываем, только когда меняются хозяева часов (≈ кэш по ключу).
  const key = ownerIds.join('|');
  const lead = useMemo(() => leadPath([...cells, ...(decor ?? [])], ownerIds), [cells, key]); // eslint-disable-line react-hooks/exhaustive-deps
  const border = useMemo(() => (day && days.length > 1 ? dayBorderPath([...cells, ...(decor ?? [])], day) : ''), [cells, day, days.length]);

  const now = Date.now();
  const dayIdx = days.findIndex((d, i) => now >= d && now < (days[i + 1] ?? to));
  // У копилки и пятен «сейчас» — стекло последнего занятого часа, если таймер идёт.
  const last = filled.length - 1;
  const nowCell = places
    ? (runningEntryId && last >= 0 && filled[last].entryId === runningEntryId ? places[last] : -1)
    : dayIdx >= 0 ? dayIdx * 24 + Math.floor((now - days[dayIdx]) / HOUR_MS) : -1;
  const pts = (i: number) => cells[i].map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ');

  return (
    <div className="glass-box" ref={box}>
    <svg className={'glass ' + scale} viewBox={`-1 -1 ${w + 2} ${h + 2}`}>
      {decor?.map((poly, i) => (
        <polygon key={'d' + i} points={poly.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ')} className="glass-decor" />
      ))}
      {cells.map((_, i) => {
        const o = owners[i];
        return (
          <polygon
            key={i}
            points={pts(i)}
            // Обводка цветом заливки прячет тонкие щели между слитыми сегментами.
            fill={o ? o.color : undefined}
            stroke={o ? o.color : undefined}
            className={(o ? 'glass-fill' : 'glass-empty') + (o && o.entryId === runningEntryId ? ' live' : '')}
            onClick={() => o && onSelect(o.entryId)}
          />
        );
      })}
      <path d={lead} className="glass-lead" style={{ strokeWidth: leadWidth[scale] }} />
      {border && <path d={border} className="glass-lead" style={{ strokeWidth: leadWidth[scale] * 2.6 }} />}
      {nowCell >= 0 && nowCell < cells.length && <polygon points={pts(nowCell)} className="glass-now" style={{ strokeWidth: leadWidth[scale] * 0.6 }} />}
    </svg>
    </div>
  );
}

/** Плагин с выбранным узором (каждый узор — отдельная строка в реестре). */
export function withPattern(pattern: PatternId): ComponentType<VisualizationProps> {
  return (props) => <Mosaic {...props} pattern={pattern} />;
}
