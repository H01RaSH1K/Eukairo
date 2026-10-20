import { useRef, type ReactNode, type TouchEvent } from 'react';

const CLOSE_PX = 90; // протащили ниже — закрываем

// Нижний лист (как системные sheet в iOS). Тап по фону или свайп вниз — закрыть.
// ReactNode ≈ «любая разметка», которую передают внутрь (как дочерние объекты).
export function Sheet({ title, onClose, children }: { title?: string; onClose: () => void; children: ReactNode }) {
  const sheet = useRef<HTMLDivElement>(null);
  // Откуда начали тянуть; null — сейчас не тянем (лист прокручен или палец идёт вверх).
  const from = useRef<number | null>(null);
  const shift = useRef(0);

  const move = (y: number, animate: boolean) => {
    const el = sheet.current!;
    el.style.transition = animate ? 'transform .2s ease-out' : 'none';
    el.style.transform = y ? `translateY(${y}px)` : '';
  };

  const onTouchStart = () => { from.current = null; shift.current = 0; };
  const onTouchMove = (e: TouchEvent) => {
    const y = e.touches[0].clientY;
    if ((e.target as Element).closest('input[type=range]')) return; // ползунок двигаем, а не лист
    if (from.current === null) {
      // Начинаем тянуть только когда содержимое листа прокручено до верха.
      if (sheet.current!.scrollTop > 0) return;
      from.current = y;
    }
    shift.current = Math.max(0, y - from.current);
    move(shift.current, false);
  };
  const onTouchEnd = () => {
    if (shift.current > CLOSE_PX) {
      move(window.innerHeight, true);
      setTimeout(onClose, 180);
    } else if (shift.current) move(0, true);
    from.current = null;
    shift.current = 0;
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        ref={sheet}
        className="sheet"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        <div className="sheet-grabber" />
        {title && <h2 className="sheet-title">{title}</h2>}
        {children}
      </div>
    </div>
  );
}
