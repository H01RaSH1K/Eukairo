import type { VisualizationProps } from '../types';
import './mosaic.css';

const HOUR_MS = 60 * 60 * 1000;

// Заготовка мозаики: 24 часовые плитки, каждая закрашивается
// пропорционально времени занятий в этом часе. Настоящий вид — после макетов.
// Пока поддерживает только масштаб «день».
export default function Mosaic({ from, spans }: VisualizationProps) {
  // Array.from({ length: 24 }, …) ≈ Enumerable.Range(0, 24).Select(…)
  const hours = Array.from({ length: 24 }, (_, h) => {
    const hStart = from + h * HOUR_MS;
    const hEnd = hStart + HOUR_MS;
    const parts = spans
      .map((s) => ({ s, ms: Math.min(s.end, hEnd) - Math.max(s.start, hStart) }))
      .filter((p) => p.ms > 0);
    return { h, parts };
  });

  return (
    <div className="mosaic">
      {hours.map(({ h, parts }) => (
        <div key={h} className="mosaic-tile">
          {parts.map(({ s, ms }) => (
            <div key={s.entryId} style={{ flexGrow: ms / HOUR_MS, background: s.color }} />
          ))}
          <div style={{ flexGrow: Math.max(0, 1 - parts.reduce((a, p) => a + p.ms, 0) / HOUR_MS) }} />
        </div>
      ))}
    </div>
  );
}
