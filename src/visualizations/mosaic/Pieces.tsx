import type { Piece } from './layout';

// Цветные куски внутри плитки, расставленные по реальному времени
// (слева направо внутри окна). Идущий таймер пульсирует.
export function Pieces({ pieces, runningEntryId, onSelect }: {
  pieces: Piece[];
  runningEntryId: string | null;
  onSelect: (entryId: string) => void;
}) {
  return (
    <>
      {pieces.map((p) => (
        <div
          key={p.entryId}
          className={'mz-piece' + (p.entryId === runningEntryId ? ' live' : '')}
          style={{ left: `${p.a * 100}%`, width: `${(p.b - p.a) * 100}%`, background: p.color }}
          onClick={(e) => { e.stopPropagation(); onSelect(p.entryId); }}
        />
      ))}
    </>
  );
}

export const weekdayShort = (t: number) =>
  new Date(t).toLocaleDateString('ru-RU', { weekday: 'short' });
