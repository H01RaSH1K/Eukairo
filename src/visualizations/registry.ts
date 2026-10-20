import type { VisualizationPlugin } from './types';

// Новый стиль = папка в visualizations/ + строка здесь.
export const visualizations: VisualizationPlugin[] = [
  { id: 'mosaic', title: 'Мозаика-витраж', load: () => import('./mosaic/Mosaic') },
];

export const defaultVisualization = visualizations[0];

export const findVisualization = (id: string) =>
  visualizations.find((v) => v.id === id) ?? defaultVisualization;
