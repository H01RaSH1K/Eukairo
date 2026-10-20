// Компоновка главного экрана: как расставлены шапка, мозаика, полукруг и чем
// они анимируются. Палитра у всех одна. Разметку выбирает Today.tsx,
// остальное — CSS (ui/designs.css) под атрибутом <html data-design="…">.
import { useSyncExternalStore } from 'react';

export type DesignId = 'classic' | 'immersive' | 'clock' | 'charge' | 'pull';

export const designs: { id: DesignId; title: string; hint: string }[] = [
  { id: 'classic', title: 'Классика', hint: 'Шапка со стрелками, сегменты, мозаика и полукруг карточками' },
  { id: 'immersive', title: 'Витрина', hint: 'Мозаика во весь экран, поверх — шапка и полукруг из матового стекла' },
  { id: 'clock', title: 'Циферблат', hint: 'Кольцо — сутки. Тяни от ● по часовой — таймер до этого времени, против — запись задним числом. На кольце видно, что уже было сегодня' },
  { id: 'charge', title: 'Зарядка', hint: 'Карточки занятий: держи палец — длительность набирается, отпусти — старт. Короткий тап — без лимита' },
  { id: 'pull', title: 'Шторка', hint: 'Внизу полоска; потяни вверх — панель с занятиями и ползунком. Над ней всё время мозаика' },
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
