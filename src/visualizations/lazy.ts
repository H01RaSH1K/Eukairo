import { lazy, type ComponentType } from 'react';
import type { VisualizationPlugin, VisualizationProps } from './types';

// lazy() ≈ загрузить префаб по требованию: код стиля — отдельный файл.
// Кэшируем, чтобы при перерисовке не создавать компонент заново.
const cache = new Map<string, ComponentType<VisualizationProps>>();

export function lazyViz(p: VisualizationPlugin): ComponentType<VisualizationProps> {
  if (!cache.has(p.id)) cache.set(p.id, lazy(p.load));
  return cache.get(p.id)!;
}
