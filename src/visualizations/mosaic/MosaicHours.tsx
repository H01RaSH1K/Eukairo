import type { VisualizationProps } from '../types';
import { HOUR_MS, dayStarts, startOfLocalDay } from '../../domain/time';
import { piecesIn } from './layout';
import { Pieces, weekdayShort } from './Pieces';
import './mosaic.css';

// Вариант А: плитка = час суток. Пустые часы остаются пустыми,
// поэтому видно, КОГДА было полезное время.
export default function MosaicHours(props: VisualizationProps) {
  if (props.scale === 'week') return <Week {...props} />;
  if (props.scale === 'month') return <Month {...props} />;
  return <Day {...props} />;
}

function hourWindows(dayStart: number, dayEnd: number) {
  const hours: number[] = [];
  for (let t = dayStart; t < dayEnd; t += HOUR_MS) hours.push(t);
  return hours;
}

function Day({ from, to, spans, runningEntryId, onSelect }: VisualizationProps) {
  const now = Date.now();
  return (
    <div className="mz-day">
      {hourWindows(from, to).map((h) => (
        <div key={h} className={'mz-tile' + (now >= h && now < h + HOUR_MS ? ' now' : '')}>
          <Pieces pieces={piecesIn(spans, h, h + HOUR_MS)} runningEntryId={runningEntryId} onSelect={onSelect} />
          <span className="mz-label">{new Date(h).getHours()}</span>
        </div>
      ))}
    </div>
  );
}

function Week({ from, to, spans, runningEntryId, onSelect }: VisualizationProps) {
  const today = startOfLocalDay(Date.now());
  return (
    <div className="mz-week">
      {dayStarts(from, to).map((d, i, days) => (
        <div key={d} className={'mz-col' + (d === today ? ' today' : '')}>
          <div className="mz-colhead">{weekdayShort(d)}</div>
          {hourWindows(d, days[i + 1] ?? to).map((h) => (
            <div key={h} className="mz-row">
              <Pieces pieces={piecesIn(spans, h, h + HOUR_MS)} runningEntryId={runningEntryId} onSelect={onSelect} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// Месяц — «витраж»: каждый день сжат в полоску 0–24 ч.
function Month({ from, to, spans, runningEntryId, onSelect }: VisualizationProps) {
  const today = startOfLocalDay(Date.now());
  return (
    <div className="mz-month">
      <div className="mz-strip-scale"><span>0</span><span>6</span><span>12</span><span>18</span><span>24</span></div>
      {dayStarts(from, to).map((d, i, days) => (
        <div key={d} className={'mz-strip-row' + (d === today ? ' today' : '')}>
          <span className="mz-strip-day">{new Date(d).getDate()}</span>
          <div className="mz-strip">
            <Pieces pieces={piecesIn(spans, d, days[i + 1] ?? to)} runningEntryId={runningEntryId} onSelect={onSelect} />
          </div>
        </div>
      ))}
    </div>
  );
}
