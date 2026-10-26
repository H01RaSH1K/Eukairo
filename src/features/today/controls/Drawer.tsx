import { useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import type { Entry } from '../../../db/schema';
import { formatTimer } from '../../../domain/time';
import { plannedMsOf, plannedEndOf } from '../../../domain/timer';

// Сворачиваемая панель внизу — оболочка для любого режима управления.
// Свёрнута — тонкая полоска: что идёт (с прогрессом по краю) или что запустить.
// Тянешь полоску вверх или тапаешь — панель раскрывается; вниз — сворачивается.

export function Drawer({ open, onOpen, run, now, color, label, tray, children }: {
  open: boolean;
  onOpen: (open: boolean) => void;
  run: Entry | null;
  now: number;
  color: string;     // цвет точки: идущего или выбранного занятия
  label: string;     // его название
  tray?: ReactNode;  // свёрнутый вид в стиле режима; без него — простая строка
  children: ReactNode;
}) {
  const [pull, setPull] = useState(0); // смещение пальцем, px (< 0 — вверх)
  const start = useRef<{ y: number; moved: boolean } | null>(null);

  const down = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = { y: e.clientY, moved: false };
  };
  const move = (e: PointerEvent) => {
    if (!start.current) return;
    const dy = e.clientY - start.current.y;
    if (Math.abs(dy) > 4) start.current.moved = true;
    setPull(open ? Math.max(0, dy) : Math.min(0, dy));
  };
  const up = () => {
    if (!start.current) return;
    const { moved } = start.current;
    start.current = null;
    if (!moved) onOpen(!open);              // просто тап
    else if (!open && pull < -30) onOpen(true);
    else if (open && pull > 50) onOpen(false);
    setPull(0);
  };

  const planned = run ? plannedMsOf(run) : 0;
  const progress = run ? (planned ? Math.min(1, (now - run.start) / planned) : 1) : 0;

  return (
    <div className={'drawer' + (open ? ' open' : '') + (pull ? ' dragging' : '')} style={{ '--pull': `${pull}px` } as CSSProperties}>
      <div className="drawer-bar" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <div className="drawer-grip" />
        {/* в раскрытом виде полоска — только ручка; в свёрнутом — статус */}
        {!open && tray}
        {!open && !tray && (
          <div className="drawer-row">
            <span className="dot" style={{ background: color }} />
            <span className="drawer-name">{label}</span>
            <span className="drawer-time">{run ? (planned ? formatTimer(Math.max(0, plannedEndOf(run)! - now)) : formatTimer(now - run.start)) : <span className="dim">потяни вверх ↑</span>}</span>
          </div>
        )}
        {run && !open && !tray && <div className="drawer-progress" style={{ width: `${progress * 100}%`, background: color }} />}
      </div>
      <div className="drawer-body">{children}</div>
    </div>
  );
}
