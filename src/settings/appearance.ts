// Настройки оформления: выбранный стиль и значения его настроек (у каждого стиля свои).
// Это часть приложения, а не макета: живут дальше, когда демо-данные заменит база.
//
// Почему localStorage, а не таблица settings в Dexie: он читается синхронно,
// поэтому мозаика с первого кадра рисуется в нужном виде, без мигания при старте.
// Данных тут — пара сотен байт.
import { useSyncExternalStore } from 'react';
import { defaultVisualization, findVisualization } from '../visualizations/registry';
import { withDefaults, type SettingValue, type SettingValues } from '../visualizations/types';

export interface Appearance {
  vizId: string;
  settings: Record<string, SettingValues>; // id стиля → его значения (только изменённые)
}

const KEY = 'eukairo.appearance';

function load(): Appearance {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const a = JSON.parse(raw) as Partial<Appearance>; // as ≈ приведение типа без проверки
      return { vizId: findVisualization(a.vizId ?? '').id, settings: a.settings ?? {} };
    }
  } catch { /* приватный режим или битые данные — берём умолчания */ }
  return { vizId: defaultVisualization.id, settings: {} };
}

let state = load();
const listeners = new Set<() => void>();

function set(next: Appearance) {
  state = next;
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ничего */ }
  listeners.forEach((l) => l());
}

/** Подписка экрана на оформление (≈ событие OnChanged → перерисовка). */
export function useAppearance(): Appearance {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => state,
  );
}

/** Текущее оформление без подписки — для бэкапа. */
export const currentAppearance = (): Appearance => state;

/** Значения настроек стиля с умолчаниями. */
export function settingsOf(a: Appearance, vizId: string): SettingValues {
  return withDefaults(findVisualization(vizId).settings, a.settings[vizId]);
}

export function setVisualization(vizId: string) {
  set({ ...state, vizId });
}

export function setSetting(vizId: string, id: string, value: SettingValue) {
  // Spread копирует объект (≈ with-выражение у record): старое состояние не меняем.
  set({ ...state, settings: { ...state.settings, [vizId]: { ...state.settings[vizId], [id]: value } } });
}

/** Вернуть настройки стиля к умолчаниям. */
export function resetSettings(vizId: string) {
  const { [vizId]: _, ...rest } = state.settings; // убрать ключ vizId (≈ Remove)
  set({ ...state, settings: rest });
}
