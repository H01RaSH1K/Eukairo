import type { VisualizationProps } from '../types';
import { dayStarts, startOfLocalDay } from '../../domain/time';
import { packBricks, type Brick } from './layout';
import { weekdayShort } from './Pieces';
import './mosaic.css';

// Вариант Б: всё полезное время укладывается подряд, кирпич = 1 час.
// Экран заполняется по мере накопления, как в Forest; «когда» не видно.
export default function MosaicDense(props: VisualizationProps) {
  if (props.scale === 'week') return <Week {...props} />;
  if (props.scale === 'month') return <Month {...props} />;
  return <Day {...props} />;
}

function BrickView({ brick, runningEntryId, onSelect, className }: {
  brick: Brick | undefined;
  runningEntryId: string | null;
  onSelect: (id: string) => void;
  className: string;
}) {
  return (
    <div className={className}>
      {brick?.parts.map((p, i) => (
        <div
          key={i}
          className={'mz-part' + (p.entryId === runningEntryId ? ' live' : '')}
          style={{ width: `${p.frac * 100}%`, background: p.color }}
          onClick={(e) => { e.stopPropagation(); onSelect(p.entryId); }}
        />
      ))}
    </div>
  );
}

function Day({ from, to, spans, runningEntryId, onSelect }: VisualizationProps) {
  const bricks = packBricks(spans, from, to);
  // Всегда показываем хотя бы 3 ряда и один пустой ряд «впереди» — есть что заполнять.
  const slots = Math.max(12, Math.ceil((bricks.length + 1) / 4) * 4);
  return (
    <div className="mz-day">
      {Array.from({ length: slots }, (_, i) => (
        <BrickView key={i} className="mz-tile dense" brick={bricks[i]} runningEntryId={runningEntryId} onSelect={onSelect} />
      ))}
    </div>
  );
}

function Week({ from, to, spans, runningEntryId, onSelect }: VisualizationProps) {
  const today = startOfLocalDay(Date.now());
  const days = dayStarts(from, to);
  const cols = days.map((d, i) => packBricks(spans, d, days[i + 1] ?? to));
  const height = Math.max(8, ...cols.map((c) => c.length));
  return (
    <div className="mz-week dense">
      {days.map((d, i) => (
        <div key={d} className={'mz-col' + (d === today ? ' today' : '')}>
          <div className="mz-stack">
            {Array.from({ length: height }, (_, j) => (
              <BrickView key={j} className="mz-brick" brick={cols[i][j]} runningEntryId={runningEntryId} onSelect={onSelect} />
            ))}
          </div>
          <div className="mz-colhead">{weekdayShort(d)}</div>
        </div>
      ))}
    </div>
  );
}

// Месяц — календарь, в каждом дне мини-кирпичики по часу.
function Month({ from, to, spans, runningEntryId, onSelect }: VisualizationProps) {
  const today = startOfLocalDay(Date.now());
  const days = dayStarts(from, to);
  const offset = (new Date(days[0]).getDay() + 6) % 7; // пустые клетки до 1-го числа
  return (
    <div className="mz-cal">
      {['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'].map((w) => <div key={w} className="mz-calhead">{w}</div>)}
      {Array.from({ length: offset }, (_, i) => <div key={'e' + i} />)}
      {days.map((d, i) => {
        const bricks = packBricks(spans, d, days[i + 1] ?? to);
        return (
          <div key={d} className={'mz-calday' + (d === today ? ' today' : '')}>
            <span className="mz-caldate">{new Date(d).getDate()}</span>
            <div className="mz-minigrid">
              {Array.from({ length: Math.max(8, Math.ceil(bricks.length / 4) * 4) }, (_, j) => (
                <BrickView key={j} className="mz-mini" brick={bricks[j]} runningEntryId={runningEntryId} onSelect={onSelect} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
