import { useId, useMemo } from 'react';
import type { VisualizationProps } from '../types';
import { dayStarts } from '../../domain/time';
import { packBricks } from './layout';
import { makeCells } from './voronoi';
import './mosaic.css';

// Мозаика-витраж, как «лес» в Forest: каждый час полезного времени —
// одно стёклышко. Стёклышки заполняются цветом занятия снизу вверх,
// по порядку, и картинка растёт по мере накопления времени.
// Неполный час — стёклышко, заполненное частично. Пустое время не рисуется вовсе.

const W = 100;

// Сколько стёклышек в картине: день — 16 часов, неделя и месяц — крупнее картина из мелких.
function grid(scale: VisualizationProps['scale'], days: number) {
  if (scale === 'day') return { cols: 4, rows: 4 };
  if (scale === 'week') return { cols: 8, rows: 9 };          // 72 ч
  return { cols: 12, rows: Math.ceil((days * 7) / 12) };      // ~7 ч на день
}

export default function Mosaic({ scale, from, to, spans, runningEntryId, onSelect }: VisualizationProps) {
  const uid = useId().replace(/:/g, '');
  const days = dayStarts(from, to).length;
  const { cols, rows } = grid(scale, days);
  const H = (W * rows) / cols * (scale === 'day' ? 1.15 : 0.95);
  // useMemo ≈ кэш: разбиение пересчитывается, только когда меняется размер сетки.
  const cells = useMemo(() => makeCells(cols, rows, W, H, cols * 31 + rows), [cols, rows, H]);
  const bricks = packBricks(spans, from, to);

  return (
    <svg className="glass" viewBox={`0 0 ${W} ${H}`}>
      <defs>
        <linearGradient id={`${uid}sheen`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.28" />
          <stop offset="0.45" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        {cells.map((c, i) => (
          <clipPath key={i} id={`${uid}c${i}`}>
            <polygon points={c.poly.map((p) => p.join(',')).join(' ')} />
          </clipPath>
        ))}
      </defs>

      {cells.map((c, i) => {
        const b = bricks[i];
        const pts = c.poly.map((p) => p.join(',')).join(' ');
        const h = c.maxY - c.minY;
        let y = c.maxY; // заполняем снизу, как жидкость в сосуде
        const last = b?.parts.at(-1)?.entryId;
        return (
          <g key={i} onClick={() => last && onSelect(last)}>
            <polygon points={pts} className="glass-empty" />
            {b && (
              <g clipPath={`url(#${uid}c${i})`}>
                {b.parts.map((p, j) => {
                  const ph = p.frac * h;
                  y -= ph;
                  return (
                    <rect
                      key={j}
                      x={c.minX} y={y} width={c.maxX - c.minX} height={ph + 0.05}
                      fill={p.color}
                      className={p.entryId === runningEntryId ? 'live' : undefined}
                    />
                  );
                })}
                <polygon points={pts} fill={`url(#${uid}sheen)`} />
              </g>
            )}
            <polygon points={pts} className="glass-lead" />
          </g>
        );
      })}
    </svg>
  );
}
