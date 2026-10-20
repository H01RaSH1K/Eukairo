import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import type { VisualizationProps } from '../types';
import { HOUR_MS, dayStarts } from '../../domain/time';
import { hourOwners } from './layout';
import { getPattern, leadPath, seedFor, type PatternId } from './patterns';
import './mosaic.css';

// Мозаика-витраж: период делится на сегменты, сегмент = час. Нарезка стёкол
// своя у каждого дня/недели/месяца (зависит от даты), чтобы дни не были одинаковыми
// (день — 24, неделя — 168, месяц — 24 × дней; всегда одна картина).
// Час целиком одного цвета — цвета записи, занявшей бо́льшую его часть (от 30 мин).
// Часы одной записи сливаются в одну фигуру: между ними нет свинцовой линии.

const leadWidth = { day: 1.4, week: 0.7, month: 0.45 };

function Mosaic({ pattern, scale, from, to, spans, runningEntryId, onSelect }: VisualizationProps & { pattern: PatternId }) {
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
  const { w, h, cells, decor } = getPattern(pattern, days.length, seedFor(from), aspect);
  // flatMap ≈ SelectMany: 24 часа каждого дня подряд.
  const owners = days.flatMap((d) => hourOwners(spans, d));
  const ownerIds = owners.map((o) => o?.entryId ?? null);
  // Линии пересчитываем, только когда меняются хозяева часов (≈ кэш по ключу).
  const key = ownerIds.join('|');
  const lead = useMemo(() => leadPath([...cells, ...(decor ?? [])], ownerIds), [cells, key]); // eslint-disable-line react-hooks/exhaustive-deps

  const now = Date.now();
  const dayIdx = days.findIndex((d, i) => now >= d && now < (days[i + 1] ?? to));
  const nowCell = dayIdx >= 0 ? dayIdx * 24 + Math.floor((now - days[dayIdx]) / HOUR_MS) : -1;
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
      {nowCell >= 0 && nowCell < cells.length && <polygon points={pts(nowCell)} className="glass-now" style={{ strokeWidth: leadWidth[scale] * 0.6 }} />}
    </svg>
    </div>
  );
}

/** Плагин с выбранным узором (каждый узор — отдельная строка в реестре). */
export function withPattern(pattern: PatternId): ComponentType<VisualizationProps> {
  return (props) => <Mosaic {...props} pattern={pattern} />;
}
