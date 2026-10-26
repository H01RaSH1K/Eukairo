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
  startAt: number | null;           // выбранное начало для следующего старта (null — сейчас)
  onPickStart: () => void;          // выбрать другое начало (лист)
  onSetStart: (t: number | null) => void; // задать начало сразу (тематические жесты)
  themedStart: boolean;             // показывать тематический жест начала
  onStart: (activityId: string, durationMs?: number, startAt?: number) => void; // запустить; без startAt — с выбранного выше
}
