import type { VisualizationPlugin } from './types';

// Новый стиль = папка в visualizations/ + строка здесь.
// Два варианта мозаики — на сравнение в макетах; после выбора один уйдёт.
export const visualizations: VisualizationPlugin[] = [
  { id: 'mosaic-hours', title: 'Мозаика по часам суток', load: () => import('./mosaic/MosaicHours') },
  { id: 'mosaic-dense', title: 'Мозаика плотная', load: () => import('./mosaic/MosaicDense') },
];

export const defaultVisualization = visualizations[0];

export const findVisualization = (id: string) =>
  visualizations.find((v) => v.id === id) ?? defaultVisualization;
