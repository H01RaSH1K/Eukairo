import type { ReactNode } from 'react';

// Нижний лист (как системные sheet в iOS). Тап по фону — закрыть.
// ReactNode ≈ «любая разметка», которую передают внутрь (как дочерние объекты).
export function Sheet({ title, onClose, children }: { title?: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grabber" />
        {title && <h2 className="sheet-title">{title}</h2>}
        {children}
      </div>
    </div>
  );
}
