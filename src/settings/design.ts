// Главный экран: режим управления таймером (полукруг, циферблат, зарядка, плитки)
// и «витрина» — мозаика на весь экран под всем остальным. Режим и витрина независимы.
// Разметку выбирает Today.tsx, внешний вид — CSS (ui/designs.css).
import { useSyncExternalStore } from 'react';

export type ModeId = 'dial' | 'clock' | 'charge' | 'tiles';

export const modes: { id: ModeId; title: string; hint: string }[] = [
  { id: 'dial', title: 'Полукруг', hint: 'Тяни ручку по дуге — длительность, потом «Старт» или «∞»' },
  { id: 'clock', title: 'Циферблат', hint: 'Кольцо — сутки. Тяни от ● по часовой — таймер до этого времени, против — запись задним числом' },
  { id: 'charge', title: 'Зарядка', hint: 'Нажми и подержи карточку, потом веди палец вверх-вниз — длительность. Отпусти — старт, короткий тап — без лимита' },
  { id: 'tiles', title: 'Плитки', hint: 'Плитки частых занятий, ползунок длительности, «Старт» и «∞»' },
];

// Как выбрать «начал раньше, чем нажал»: простое — строчка «сейчас ▾» и лист с вариантами
// (одинаково во всех режимах); тематическое — ещё и свой жест в каждом режиме.
export type StartPick = 'simple' | 'themed';

export const startPicks: { id: StartPick; title: string; hint: string }[] = [
  { id: 'simple', title: 'Простое', hint: 'Под таймером строчка «сейчас ▾»: тап — «5…60 мин назад» или точное время' },
  { id: 'themed', title: 'Тематическое', hint: 'Ещё и свой жест в каждом режиме' },
];

/** Тематический жест начала у каждого режима — подсказка для «Оформления». */
export const themedStartHints: Record<ModeId, string> = {
  dial: 'Тонкая дуга снаружи полукруга: тяни её ручку — «начал на столько раньше»',
  clock: 'Внутреннее кольцо: тяни ◦ назад по часовой стрелке — время начала',
  charge: 'Схватил карточку — веди палец влево: начал на столько раньше',
  tiles: 'Второй ползунок «начал раньше на…»',
};

export type ThemeId = 'night' | 'paper' | 'neon' | 'cathedral' | 'frost' | 'dusk';

/** Темы: палитра и материал стекла (CSS — ui/themes.css). sw — образец для выбора: фон, пустое стекло, свинец, акцент. */
export const themes: { id: ThemeId; title: string; sw: [string, string, string, string] }[] = [
  { id: 'night', title: 'Ночь', sw: ['#111114', '#1d1d23', '#0b0b0e', '#4fb3a9'] },
  { id: 'paper', title: 'Бумага', sw: ['#f4efe6', '#e9e0d0', '#3a3128', '#b5523b'] },
  { id: 'neon', title: 'Неон', sw: ['#07070b', '#0c0c13', '#19c9b4', '#3cf2d8'] },
  { id: 'cathedral', title: 'Собор', sw: ['#0b1026', '#172046', '#b8913e', '#e0b04f'] },
  { id: 'frost', title: 'Иней', sw: ['#eef2f6', '#dde5ee', '#8796ab', '#3a7bd5'] },
  { id: 'dusk', title: 'Закат', sw: ['#1a1020', '#2a1a2e', '#0e0810', '#ff8a5c'] },
];

export interface Design {
  mode: ModeId;
  showcase: boolean; // витрина: мозаика на весь экран, панели из матового стекла
  theme: ThemeId;
  feedByDuration: boolean; // Лента: высота записи по длительности (иначе все одинаковые)
  startPick: StartPick;
}

const KEY = 'eukairo.design';

function readRaw(): string | null {
  try { return localStorage.getItem(KEY); } catch { return null; }
}

function load(raw = readRaw()): Design {
  try {
    if (raw?.startsWith('{')) {
      const d = JSON.parse(raw) as Partial<Design>;
      return {
        mode: modes.some((m) => m.id === d.mode) ? d.mode! : 'dial',
        showcase: d.showcase ?? true,
        theme: themes.some((t) => t.id === d.theme) ? d.theme! : 'night',
        feedByDuration: d.feedByDuration ?? true,
        startPick: d.startPick === 'themed' ? 'themed' : 'simple',
      };
    }
    // старые значения, когда витрина была отдельным режимом
    const old: Record<string, Pick<Design, 'mode' | 'showcase'>> = {
      classic: { mode: 'dial', showcase: false }, immersive: { mode: 'dial', showcase: true },
      clock: { mode: 'clock', showcase: true }, charge: { mode: 'charge', showcase: true }, pull: { mode: 'tiles', showcase: true },
    };
    if (raw && old[raw]) return { ...old[raw], theme: 'night', feedByDuration: true, startPick: 'simple' };
  } catch { /* приватный режим */ }
  return { mode: 'dial', showcase: true, theme: 'night', feedByDuration: true, startPick: 'simple' };
}

let current = load();
const listeners = new Set<() => void>();

/** Атрибуты на <html>: по ним CSS делает таб-бар плавающим и прячет его в фокусе. */
function apply() {
  if (typeof document === 'undefined') return; // тесты в Node: страницы нет
  const html = document.documentElement;
  html.dataset.mode = current.mode;
  if (current.showcase) html.dataset.showcase = ''; else delete html.dataset.showcase;
  html.dataset.theme = current.theme;
  // цвет строки состояния iOS — под фон темы
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themes.find((t) => t.id === current.theme)!.sw[0]);
}
apply(); // при импорте модуля — до первой отрисовки, чтобы не мигало

export function useDesign(): Design {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => current);
}

/** Текущий вид без подписки — для бэкапа. */
export const currentDesign = (): Design => current;

export function setDesign(patch: Partial<Design>) {
  current = { ...current, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* ничего */ }
  apply();
  listeners.forEach((l) => l());
}

/** Целиком заменить вид (восстановление из бэкапа); неизвестные значения → умолчания. */
export function replaceDesign(d: unknown) {
  setDesign(load(JSON.stringify(d)));
}

/** Фокус: на экране только витраж (таб-бар тоже прячется). Не сохраняется. */
export function setFocus(on: boolean) {
  if (on) document.documentElement.dataset.focus = ''; else delete document.documentElement.dataset.focus;
}
