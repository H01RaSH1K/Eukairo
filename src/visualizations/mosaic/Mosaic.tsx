import { useMemo, type ComponentType } from 'react';
import type { Span, VisualizationProps } from '../types';
import { dayStarts, startOfLocalDay } from '../../domain/time';
import { hourOwners } from './layout';
import { getPattern, leadPath, type PatternId } from './patterns';
import './mosaic.css';

// Мозаика-витраж: день делится на 24 сегмента по узору, сегмент = час суток.
// Час целиком одного цвета — цвета записи, занявшей бо́льшую его часть (от 30 мин).
// Часы одной записи сливаются в одну фигуру: между ними нет свинцовой линии.

function DayGlass({ pattern, spans, dayStart, runningEntryId, onSelect, small }: {
  pattern: PatternId;
  spans: Span[];
  dayStart: number;
  runningEntryId: string | null;
  onSelect: (id: string) => void;
  small?: boolean;
}) {
  const { w, h, cells } = getPattern(pattern);
  const owners = hourOwners(spans, dayStart);
  const ownerIds = owners.map((o) => o?.entryId ?? null);
  // Пересчитываем линии, только когда меняются хозяева часов (≈ кэш по ключу).
  const key = ownerIds.join('|');
  const lead = useMemo(() => leadPath(cells, ownerIds), [pattern, key]); // eslint-disable-line react-hooks/exhaustive-deps
  const now = Date.now();
  const nowHour = now >= dayStart && now < dayStart + 24 * 3_600_000 ? Math.floor((now - dayStart) / 3_600_000) : -1;

  return (
    <svg className={'glass' + (small ? ' small' : '') + (pattern === 'rose' ? ' round' : '')} viewBox={`-1 -1 ${w + 2} ${h + 2}`}>
      {cells.map((poly, i) => {
        const o = owners[i];
        const pts = poly.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ');
        return (
          <polygon
            key={i}
            points={pts}
            // Обводка цветом заливки прячет тонкие щели между слитыми сегментами.
            fill={o ? o.color : undefined}
            stroke={o ? o.color : undefined}
            className={(o ? 'glass-fill' : 'glass-empty') + (o && o.entryId === runningEntryId ? ' live' : '')}
            onClick={() => o && onSelect(o.entryId)}
          />
        );
      })}
      <path d={lead} className="glass-lead" />
      {!small && nowHour >= 0 && (
        <polygon
          points={cells[nowHour].map((p) => p.join(',')).join(' ')}
          className="glass-now"
        />
      )}
    </svg>
  );
}

function Mosaic({ pattern, scale, from, to, spans, runningEntryId, onSelect }: VisualizationProps & { pattern: PatternId }) {
  if (scale === 'day') {
    return <DayGlass pattern={pattern} spans={spans} dayStart={from} runningEntryId={runningEntryId} onSelect={onSelect} />;
  }
  const days = dayStarts(from, to);
  const today = startOfLocalDay(Date.now());
  // Неделя — 7 витражей в ряд; месяц — календарь из маленьких витражей.
  const offset = scale === 'month' ? (new Date(days[0]).getDay() + 6) % 7 : 0;
  return (
    <div className="glass-cal">
      {['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'].map((d) => <div key={d} className="glass-calhead">{d}</div>)}
      {Array.from({ length: offset }, (_, i) => <div key={'e' + i} />)}
      {days.map((d) => (
        <div key={d} className={'glass-day' + (d === today ? ' today' : '')}>
          {scale === 'month' && <span className="glass-date">{new Date(d).getDate()}</span>}
          <DayGlass pattern={pattern} spans={spans} dayStart={d} runningEntryId={runningEntryId} onSelect={onSelect} small />
        </div>
      ))}
    </div>
  );
}

/** Плагин с выбранным узором (каждый узор — отдельная строка в реестре). */
export function withPattern(pattern: PatternId): ComponentType<VisualizationProps> {
  return (props) => <Mosaic {...props} pattern={pattern} />;
}
