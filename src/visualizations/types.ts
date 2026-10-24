import type { ComponentType } from 'react';

export type Scale = 'day' | 'week' | 'month';

// Промежуток времени одного занятия — по сути запись с цветом,
// обрезанная по границам показываемого периода.
// Никаких 15-минутных клеток: как разложить время, решает сам плагин.
export interface Span {
  entryId: string;     // для тапа «что это за запись»
  activityId: string;
  color: string;
  start: number;       // мс UTC
  end: number;         // у идущего таймера = «сейчас»
  need?: boolean;      // нужда (сон, еда…): не полезное время, такие часы мозаика вынимает из дня
  parents?: { id: string; color: string }[]; // предки занятия, от ближайшего к корню
}

/** Значение настройки стиля. Конкретный набор описывает сам стиль (см. SettingDef). */
export type SettingValue = string | number | boolean;
export type SettingValues = Record<string, SettingValue>; // ≈ Dictionary<string, object>

/**
 * Описание одной настройки стиля. Экран «Оформление» рисует контролы по этим
 * описаниям, ничего не зная о самом стиле: новый стиль = новые описания, экран не меняется.
 * Это «размеченное объединение» (discriminated union): поле `kind` говорит, какой это вариант,
 * и после проверки `kind` TypeScript знает остальные поля (≈ switch по подклассу).
 */
export type SettingDef = {
  id: string;
  title: string;
  hint?: string;
  /** Показывать, только если другая настройка равна этому значению (например, «точек» — только у пятен). */
  showIf?: { id: string; equals: SettingValue[] };
} & (
  | { kind: 'choice'; options: { id: string; title: string; hint?: string }[]; default: string }
  | { kind: 'range'; min: number; max: number; step?: number; default: number; unit?: string }
  | { kind: 'toggle'; default: boolean }
);

export interface VisualizationProps {
  scale: Scale;
  from: number;                          // начало периода (местная полночь)
  to: number;                            // конец периода
  spans: Span[];
  runningEntryId: string | null;         // идущий таймер — можно анимировать рост
  settings: SettingValues;               // значения настроек этого стиля (с подставленными умолчаниями)
  onSelect: (entryId: string) => void;   // ≈ Action<string>
  /** Сколько сегментов закрашено полезным из скольких доступных (без нужд) — для таблички в фокусе. `?` — можно не передавать. */
  onCount?: (c: SegmentCount) => void;
}

export interface SegmentCount { filled: number; total: number; need: number }

export interface VisualizationPlugin {
  id: string;           // 'mosaic-glass'
  title: string;        // 'Витраж'
  description: string;  // одна строка под названием на экране «Оформление»
  settings: SettingDef[];
  // Ленивая загрузка: код стиля скачивается, только когда он выбран
  // (≈ Addressables). Promise ≈ Task.
  load: () => Promise<{ default: ComponentType<VisualizationProps> }>;
}

/** Значения с подставленными умолчаниями для всех настроек стиля. */
export function withDefaults(defs: SettingDef[], stored: SettingValues | undefined): SettingValues {
  const out: SettingValues = {};
  for (const d of defs) out[d.id] = stored?.[d.id] ?? d.default;
  return out;
}
