import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';

// График на весь экран: поверх всего (и поверх листов), закрывается ✕.
// createPortal рисует разметку прямо в <body>, а не внутри родителя: у листа бывает
// transform (анимация, свайп), и тогда position: fixed считался бы от листа, а не от экрана.
export function FullChart({ title, onClose, children }: { title: ReactNode; onClose: () => void; children: ReactNode }) {
  return createPortal(
    <div className="chart-full">
      <div className="chart-full-head">
        <div className="chart-full-title">{title}</div>
        <button className="nav-arrow" aria-label="Свернуть" onClick={onClose}>✕</button>
      </div>
      {children}
    </div>,
    document.body,
  );
}

/** Высота графика (в единицах viewBox шириной w) на весь экран: всё, что осталось от шапки и кнопок. */
export function fullChartHeight(w: number, reservedPx = 230): number {
  const width = Math.max(1, window.innerWidth - 32);
  return Math.max(120, Math.round(((window.innerHeight - reservedPx) * w) / width));
}

/** Кнопка «развернуть». */
export function ExpandButton({ onClick }: { onClick: () => void }) {
  return <button className="chart-expand" aria-label="На весь экран" onClick={onClick}>⤢</button>;
}
