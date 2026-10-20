import { useState, type ReactNode } from 'react';
import type { Activity } from '../../db/schema';
import { childrenOf } from '../../domain/tree';
import { Sheet } from '../../ui/Sheet';

// Выбор занятия из дерева. Тап по строке — выбрать (любой узел, и родитель тоже),
// тап по стрелке — раскрыть детей.
export function ActivityPicker({ activities, colors, title, onPick, onClose, footer }: {
  activities: Activity[];
  colors: Map<string, string>;
  title: string;
  onPick: (id: string) => void;
  onClose: () => void;
  footer?: ReactNode;   // доп. кнопка под деревом
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) => {
    const next = new Set(open);
    if (next.has(id)) next.delete(id); else next.add(id);
    setOpen(next);
  };

  // Рекурсивный рендер: функция возвращает массив строк для узла и раскрытых потомков.
  const rows = (parentId: string | null, depth: number): ReactNode[] =>
    childrenOf(activities, parentId).flatMap((a) => {
      const hasKids = childrenOf(activities, a.id).length > 0;
      return [
        <div key={a.id} className="tree-row" style={{ paddingLeft: 12 + depth * 22 }} onClick={() => onPick(a.id)}>
          <span className="dot" style={{ background: colors.get(a.id) }} />
          <span className="tree-name">{a.icon && depth === 0 ? `${a.icon} ` : ''}{a.name}</span>
          {hasKids && (
            <button className="tree-chevron" onClick={(e) => { e.stopPropagation(); toggle(a.id); }}>
              {open.has(a.id) ? '▾' : '▸'}
            </button>
          )}
        </div>,
        ...(open.has(a.id) ? rows(a.id, depth + 1) : []),
      ];
    });

  return (
    <Sheet title={title} onClose={onClose}>
      <div className="tree">{rows(null, 0)}</div>
      {footer}
    </Sheet>
  );
}
