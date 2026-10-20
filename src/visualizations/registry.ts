import type { VisualizationPlugin } from './types';

// Новый стиль = папка в visualizations/ + строка здесь.
export const visualizations: VisualizationPlugin[] = [
  { id: 'mosaic', title: 'Мозаика', load: () => import('./mosaic/Mosaic') },
];

export const defaultVisualization = visualizations[0];
