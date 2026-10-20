// Дизайн приложения целиком: компоновка, анимации, палитра.
// Это не настройка стиля мозаики (то — «Оформление»), а «шкурка» всех экранов.
// Сам дизайн живёт в CSS (ui/designs.css) под атрибутом <html data-design="…">,
// здесь — только выбор и его сохранение.
import { useSyncExternalStore } from 'react';

export type DesignId = 'classic' | 'immersive' | 'paper' | 'neon';

export const designs: { id: DesignId; title: string; hint: string }[] = [
  { id: 'classic', title: 'Классика', hint: 'Карточки на тёмном фоне' },
  { id: 'immersive', title: 'Витрина', hint: 'Мозаика во весь экран, панели из матового стекла, стёкла появляются по одному' },
  { id: 'paper', title: 'Бумага', hint: 'Светлая, крупные заголовки с засечками, периоды листаются как страницы' },
  { id: 'neon', title: 'Неон', hint: 'Свечение, контурные карточки, мозаика включается с мерцанием' },
];

const KEY = 'eukairo.design';

function load(): DesignId {
  try {
    const v = localStorage.getItem(KEY);
    if (designs.some((d) => d.id === v)) return v as DesignId;
  } catch { /* приватный режим */ }
  return 'classic';
}

let current = load();
const listeners = new Set<() => void>();

/** Ставит атрибут на <html>: по нему CSS и меняет вид. Цвет строки состояния iOS — тоже. */
function apply() {
  document.documentElement.dataset.design = current; // ≈ setAttribute('data-design', …)
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
}
apply(); // при импорте модуля — до первой отрисовки, чтобы не мигало

export function useDesign(): DesignId {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => current);
}

export function setDesign(id: DesignId) {
  current = id;
  try { localStorage.setItem(KEY, id); } catch { /* ничего */ }
  apply();
  listeners.forEach((l) => l());
}
