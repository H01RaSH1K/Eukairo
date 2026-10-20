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
    const kids = childrenOf(all, node.id, true); // завершённые тоже: иначе у соседей съедут оттенки
    kids.forEach((kid, i) => {
      const spread = (i - (kids.length - 1) / 2) * 12;
      visit(kid, { h: hsl.h + spread, s: Math.max(30, hsl.s - 8), l: Math.min(78, hsl.l + 9) });
    });
  };

  for (const root of childrenOf(all, null, true)) visit(root, { h: root.hue ?? 0, s: 65, l: 55 });
  return result;
}

/**
 * Тон для нового корневого занятия: середина самого широкого промежутка
 * между уже занятыми тонами, чтобы цвета не сливались.
 */
export function nextHue(all: Activity[]): number {
  const used = all.filter((a) => a.parentId === null && a.hue !== undefined).map((a) => a.hue!).sort((a, b) => a - b);
  if (used.length === 0) return 215;
  let best = 0, bestGap = -1;
  used.forEach((h, i) => {
    const next = i + 1 < used.length ? used[i + 1] : used[0] + 360; // последний — с первым через 360°
    if (next - h > bestGap) { bestGap = next - h; best = h + (next - h) / 2; }
  });
  return Math.round(best) % 360;
}
