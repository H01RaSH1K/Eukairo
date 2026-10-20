import type { VisualizationPlugin } from './types';
import type { PatternId } from './mosaic/patterns';

// Новый стиль = папка в visualizations/ + строка здесь.
// Узоры мозаики — один модуль, но для выбора в настройках это разные стили.
// `import type` не тянет код patterns.ts в стартовый бандл — только тип.
const mosaic = (pattern: PatternId) => () =>
  import('./mosaic/Mosaic').then((m) => ({ default: m.withPattern(pattern) }));

export const visualizations: VisualizationPlugin[] = [
  { id: 'mosaic-glass', title: 'Витраж', load: mosaic('glass') },
  { id: 'mosaic-rose', title: 'Роза', load: mosaic('rose') },
  { id: 'mosaic-tri', title: 'Треугольники', load: mosaic('tri') },
  { id: 'mosaic-grid', title: 'Сетка', load: mosaic('grid') },
];

export const defaultVisualization = visualizations[0];

export const findVisualization = (id: string) =>
  visualizations.find((v) => v.id === id) ?? defaultVisualization;
