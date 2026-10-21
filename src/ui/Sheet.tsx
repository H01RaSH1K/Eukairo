import { useEffect, useRef, type ReactNode, type TouchEvent } from 'react';

const CLOSE_PX = 90; // протащили ниже — закрываем

// Нижний лист (как системные sheet в iOS). Тап по фону или свайп вниз — закрыть.
// ReactNode ≈ «любая разметка», которую передают внутрь (как дочерние объекты).
export function Sheet({ title, onClose, children }: { title?: string; onClose: () => void; children: ReactNode }) {
  const sheet = useRef<HTMLDivElement>(null);
  // Откуда начали тянуть; null — сейчас не тянем (лист прокручен или палец идёт вверх).
  const from = useRef<number | null>(null);
  const shift = useRef(0);
  const backdrop = useRef<HTMLDivElement>(null);

  // Клавиатура iPhone не сжимает страницу, а наезжает сверху: fixed-лист остаётся под ней.
  // visualViewport — видимая над клавиатурой часть; ставим фон листа ровно в неё,
  // и лист поднимается над клавиатурой. Поле в фокусе прокручиваем в видимую часть листа.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const fit = () => {
      const el = backdrop.current;
      if (!el) return;
      const kb = window.innerHeight - vv.height > 80; // меньше — это не клавиатура, а панели браузера
      el.style.top = kb ? `${vv.offsetTop}px` : '';
      el.style.height = kb ? `${vv.height}px` : '';
      el.classList.toggle('kb', kb);
      const f = document.activeElement;
      if (kb && f instanceof HTMLElement && sheet.current?.contains(f)) f.scrollIntoView({ block: 'nearest' });
    };
    vv.addEventListener('resize', fit);
    vv.addEventListener('scroll', fit);
    return () => { vv.removeEventListener('resize', fit); vv.removeEventListener('scroll', fit); };
  }, []);

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
    <div ref={backdrop} className="sheet-backdrop" onClick={onClose}>
      <div
        ref={sheet}
        className="sheet"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={hideKeyboard}
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

// У цифровой клавиатуры iPhone нет кнопки «Готово», а тап по кнопке фокус с поля не снимает.
// Поэтому любой тап в листе мимо поля ввода прячет клавиатуру.
function hideKeyboard(e: { target: EventTarget }) {
  const f = document.activeElement;
  if (f instanceof HTMLInputElement && f.type !== 'range' && !(e.target as Element).closest('input, textarea')) f.blur();
}
