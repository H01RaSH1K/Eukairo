// Цвет занятия вычисляется из тона корня: потомки — его оттенки
// (светлее с глубиной, соседи слегка разведены по тону).
import type { Activity } from '../db/schema';
import { childrenOf } from './tree';

interface Hsl { h: number; s: number; l: number }

const css = ({ h, s, l }: Hsl) => `hsl(${Math.round(h)} ${s}% ${l}%)`;

/** id занятия → CSS-цвет для всех занятий дерева. */
export function activityColors(all: Activity[]): Map<string, string> {
  const result = new Map<string, string>();

  // Вложенная функция — как локальная функция в C#.
  const visit = (node: Activity, hsl: Hsl) => {
    result.set(node.id, node.colorOverride ?? css(hsl));
    const kids = childrenOf(all, node.id);
    kids.forEach((kid, i) => {
      const spread = (i - (kids.length - 1) / 2) * 12;
      visit(kid, { h: hsl.h + spread, s: Math.max(30, hsl.s - 8), l: Math.min(78, hsl.l + 9) });
    });
  };

  for (const root of childrenOf(all, null)) visit(root, { h: root.hue ?? 0, s: 65, l: 55 });
  return result;
}
