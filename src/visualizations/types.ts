import type { ComponentType } from 'react';

export type Scale = 'day' | 'week' | 'month';

// Промежуток времени одного занятия — по сути запись с цветом,
// обрезанная по границам показываемого периода.
// Никаких 15-минутных клеток: как разложить время, решает сам плагин.
export interface Span {
  entryId: string;     // для тапа «что это за запись»
  activityId: string;
  color: string;
  start: number;       // мс UTC
  end: number;         // у идущего таймера = «сейчас»
}

export interface VisualizationProps {
  scale: Scale;
  from: number;                          // начало периода (местная полночь)
  to: number;                            // конец периода
  spans: Span[];
  runningEntryId: string | null;         // идущий таймер — можно анимировать рост
  fill: string;                          // как раскладывать часы (заливка из «Ещё»); стиль может не учитывать
  onSelect: (entryId: string) => void;   // ≈ Action<string>
}

export interface VisualizationPlugin {
  id: string;     // 'mosaic'
  title: string;  // 'Мозаика'
  // Ленивая загрузка: код стиля скачивается, только когда он выбран
  // (≈ Addressables). Promise ≈ Task.
  load: () => Promise<{ default: ComponentType<VisualizationProps> }>;
}
