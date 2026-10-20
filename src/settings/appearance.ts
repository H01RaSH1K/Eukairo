// Настройки оформления: у каждого масштаба (день / неделя / месяц) свой стиль
// и свои значения настроек каждого стиля.
// Это часть приложения, а не макета: живут дальше, когда демо-данные заменит база.
//
// Почему localStorage, а не таблица settings в Dexie: он читается синхронно,
// поэтому мозаика с первого кадра рисуется в нужном виде, без мигания при старте.
// Данных тут — пара сотен байт.
import { useSyncExternalStore } from 'react';
import { defaultVisualization, findVisualization } from '../visualizations/registry';
import { withDefaults, type Scale, type SettingValue, type SettingValues } from '../visualizations/types';

export const scales: Scale[] = ['day', 'week', 'month'];

/** Оформление одного масштаба. */
export interface ScaleLook {
  vizId: string;
  settings: Record<string, SettingValues>; // id стиля → его значения (только изменённые)
}

// Record<Scale, ScaleLook> ≈ Dictionary<Scale, ScaleLook>, где ключи — ровно три масштаба.
export type Appearance = Record<Scale, ScaleLook>;

const KEY = 'eukairo.appearance';

const fresh = (): ScaleLook => ({ vizId: defaultVisualization.id, settings: {} });

function clean(l: Partial<ScaleLook> | undefined): ScaleLook {
  return { vizId: findVisualization(l?.vizId ?? '').id, settings: l?.settings ?? {} };
}

function load(): Appearance {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const a = JSON.parse(raw);
      // Старый формат (одно оформление на всё) → копируем во все масштабы.
      if ('vizId' in a) return { day: clean(a), week: clean(a), month: clean(a) };
      return { day: clean(a.day), week: clean(a.week), month: clean(a.month) };
    }
  } catch { /* приватный режим или битые данные — берём умолчания */ }
  return { day: fresh(), week: fresh(), month: fresh() };
}

let state = load();
const listeners = new Set<() => void>();

function set(next: Appearance) {
  state = next;
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ничего */ }
  listeners.forEach((l) => l());
}

/** Меняет оформление одного масштаба (≈ with-выражение у record: старое состояние не трогаем). */
function patch(scale: Scale, change: (l: ScaleLook) => ScaleLook) {
  set({ ...state, [scale]: change(state[scale]) });
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

/** Значения настроек стиля на этом масштабе, с умолчаниями (по умолчанию — выбранного стиля). */
export function settingsOf(a: Appearance, scale: Scale, vizId = a[scale].vizId): SettingValues {
  return withDefaults(findVisualization(vizId).settings, a[scale].settings[vizId]);
}

export function setVisualization(scale: Scale, vizId: string) {
  patch(scale, (l) => ({ ...l, vizId }));
}

export function setSetting(scale: Scale, vizId: string, id: string, value: SettingValue) {
  patch(scale, (l) => ({ ...l, settings: { ...l.settings, [vizId]: { ...l.settings[vizId], [id]: value } } }));
}

/** Вернуть настройки стиля на этом масштабе к умолчаниям. */
export function resetSettings(scale: Scale, vizId: string) {
  patch(scale, (l) => {
    const { [vizId]: _, ...rest } = l.settings; // убрать ключ vizId (≈ Remove)
    return { ...l, settings: rest };
  });
}

/** Скопировать оформление масштаба на остальные два. */
export function applyToAll(scale: Scale) {
  const l = state[scale];
  set({ day: l, week: l, month: l });
}

/** Одинаково ли оформлены все масштабы (тогда кнопка «на все» не нужна). */
export const allSame = (a: Appearance) =>
  JSON.stringify(a.day) === JSON.stringify(a.week) && JSON.stringify(a.week) === JSON.stringify(a.month);
