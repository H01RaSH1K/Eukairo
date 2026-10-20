import type { Activity, Entry } from '../../../db/schema';

/** Всё, что нужно любому способу управления таймером (циферблат, зарядка, шторка…). */
export interface ControlProps {
  activities: Activity[];
  colors: Map<string, string>;
  quick: string[];                  // частые занятия, самые частые первыми
  current: string;                  // выбранное (или идущее) занятие
  onChoose: (id: string) => void;   // выбрать занятие
  onMore: () => void;               // открыть всё дерево занятий
  run: Entry | null;
  now: number;
  onOpenRun: () => void;            // открыть идущую запись
  name: (id: string) => string;
}
