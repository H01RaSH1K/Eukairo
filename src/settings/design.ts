// Главный экран: режим управления таймером (полукруг, циферблат, зарядка, плитки)
// и «витрина» — мозаика на весь экран под всем остальным. Режим и витрина независимы.
// Разметку выбирает Today.tsx, внешний вид — CSS (ui/designs.css).
import { useSyncExternalStore } from 'react';

export type ModeId = 'dial' | 'clock' | 'charge' | 'tiles';

export const modes: { id: ModeId; title: string; hint: string }[] = [
  { id: 'dial', title: 'Полукруг', hint: 'Тяни ручку по дуге — длительность в пределах занятия, «Старт» или «∞»' },
  { id: 'clock', title: 'Циферблат', hint: 'Кольцо — сутки. Тяни от ● по часовой — таймер до этого времени, против — запись задним числом' },
  { id: 'charge', title: 'Зарядка', hint: 'Держи палец на карточке — длительность набирается, отпусти — старт. Короткий тап — без лимита' },
  { id: 'tiles', title: 'Плитки', hint: 'Плитки частых занятий, ползунок длительности, «Старт» и «∞»' },
];

export interface Design {
  mode: ModeId;
  showcase: boolean; // витрина: мозаика на весь экран, панели из матового стекла
}

const KEY = 'eukairo.design';

function load(): Design {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw?.startsWith('{')) {
      const d = JSON.parse(raw) as Partial<Design>;
      return { mode: modes.some((m) => m.id === d.mode) ? d.mode! : 'dial', showcase: d.showcase ?? true };
    }
    // старые значения, когда витрина была отдельным режимом
    const old: Record<string, Design> = {
      classic: { mode: 'dial', showcase: false }, immersive: { mode: 'dial', showcase: true },
      clock: { mode: 'clock', showcase: true }, charge: { mode: 'charge', showcase: true }, pull: { mode: 'tiles', showcase: true },
    };
    if (raw && old[raw]) return old[raw];
  } catch { /* приватный режим */ }
  return { mode: 'dial', showcase: true };
}

let current = load();
const listeners = new Set<() => void>();

/** Атрибуты на <html>: по ним CSS делает таб-бар плавающим и прячет его в фокусе. */
function apply() {
  const html = document.documentElement;
  html.dataset.mode = current.mode;
  if (current.showcase) html.dataset.showcase = ''; else delete html.dataset.showcase;
}
apply(); // при импорте модуля — до первой отрисовки, чтобы не мигало

export function useDesign(): Design {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => current);
}

export function setDesign(patch: Partial<Design>) {
  current = { ...current, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* ничего */ }
  apply();
  listeners.forEach((l) => l());
}

/** Фокус: на экране только витраж (таб-бар тоже прячется). Не сохраняется. */
export function setFocus(on: boolean) {
  if (on) document.documentElement.dataset.focus = ''; else delete document.documentElement.dataset.focus;
}
