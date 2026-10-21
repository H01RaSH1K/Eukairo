// Записи без времени: суммы за день, варианты, подписи — и перенос старых параметров привычек.
// Чистые функции, про базу и React не знают.
import type { Activity, Habit, HabitMark, Param, ParamOption, Point } from '../db/schema';
import { dayKey, dayStartOf, HOUR_MS } from './time';

/** Ключ «сколько записей за день» — считается сам, вписывать не нужно. */
export const COUNT = 'count';

/** Записи по дням: ключ дня → записи этого дня по времени. */
export function pointsByDay(points: Point[], activityIds: Set<string>): Map<string, Point[]> {
  const m = new Map<string, Point[]>();
  for (const p of [...points].sort((a, b) => a.at - b.at)) {
    if (!activityIds.has(p.activityId)) continue;
    const k = dayKey(p.at);
    m.set(k, [...(m.get(k) ?? []), p]);
  }
  return m;
}

/** Сумма чисел по записям и их количество (ключ COUNT). Нет записей — пусто. */
export function sumValues(points: Point[]): Record<string, number> {
  const v: Record<string, number> = {};
  for (const p of points) for (const [k, x] of Object.entries(p.values ?? {})) v[k] = (v[k] ?? 0) + x;
  if (points.length) v[COUNT] = points.length;
  return v;
}

/** Вариант, который чаще всего встречается в записях (для цвета точки на графике). */
export function mainChoice(points: Point[], paramId: string): string | undefined {
  const n = new Map<string, number>();
  for (const p of points) {
    const c = p.choices?.[paramId];
    if (c) n.set(c, (n.get(c) ?? 0) + 1);
  }
  return [...n].sort((a, b) => b[1] - a[1])[0]?.[0];
}

/** Фильтр по вариантам: параметр → выбранные варианты. Внутри параметра «или», между — «и». */
export type ChoiceFilter = Record<string, string[]>;
export const matches = (p: Point, f: ChoiceFilter) =>
  Object.entries(f).every(([id, ids]) => !ids.length || ids.includes(p.choices?.[id] ?? ''));

export const numberParams = (params: Param[] = []) => params.filter((p) => !p.options);
export const choiceParams = (params: Param[] = []) =>
  params.filter((p): p is Param & { options: ParamOption[] } => !!p.options?.length);

/** «20 раз · кулаки · пол» — запись одной строкой. */
export function describePoint(p: Point, params: Param[] = []): string {
  return params.flatMap((q) => {
    if (q.options) {
      const o = q.options.find((x) => x.id === p.choices?.[q.id]);
      return o ? [o.name] : [];
    }
    const v = p.values?.[q.id];
    return v === undefined ? [] : [`${v} ${q.unit ?? q.name.toLowerCase()}`];
  }).join(' · ');
}

/** Цвет варианта по его месту в списке: контрастные между собой, не сливаются с фоном. */
export const optionColor = (i: number) => OPTION_COLORS[i % OPTION_COLORS.length];
const OPTION_COLORS = ['#56ccf2', '#f2c94c', '#ff8a65', '#9b8cff', '#6fcf97', '#f78fb3'];

/**
 * «пальцы, кулаки, ладони» → список вариантов. Старые id сохраняются: сначала по совпадению
 * названия, потом по месту в списке (так переименование «ладони» → «на ладонях» не теряет историю).
 */
export function parseOptions(text: string, old: ParamOption[], makeId: () => string): ParamOption[] {
  const names = [...new Set(text.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean))];
  const used = new Set<string>();
  const byName = names.map((n) => old.find((o) => o.name === n));
  byName.forEach((o) => o && used.add(o.id));
  return names.map((name, i) => {
    let o = byName[i];
    if (!o && old[i] && !used.has(old[i].id) && !names.includes(old[i].name)) { o = old[i]; used.add(o.id); }
    return { id: o?.id ?? makeId(), name };
  });
}

// Подходы из ранней версии превью хранились прямо в отметке — читаем и их.
type LegacySet = { at?: number; values?: Record<string, number>; choices?: Record<string, string> };

/**
 * Перенос старого формата: параметры жили у привычки, числа — в её отметке за день.
 * Теперь параметры у занятия, числа — в записях без времени:
 * - привычка «по времени» отдаёт параметры своему занятию;
 * - галочка с параметрами получает своё занятие (корневое, с тем же названием и цветом)
 *   и становится привычкой «по записям»;
 * - каждая отметка с числами превращается в запись (в полдень того дня, если время неизвестно).
 * Id новых занятий и записей выводятся из старых, поэтому повторный импорт того же бэкапа
 * не плодит дубликаты. Возвращает только изменённое и новое.
 */
export function migrateHabitParams(d: { activities: Activity[]; habits: Habit[]; habitMarks: HabitMark[] }, now: number) {
  const out = { activities: [] as Activity[], habits: [] as Habit[], habitMarks: [] as HabitMark[], points: [] as Point[] };
  let order = Math.max(-1, ...d.activities.filter((a) => a.parentId === null).map((a) => a.order));
  for (const h of d.habits) {
    if (!h.params?.length) continue;
    let target = h.kind === 'time' ? d.activities.find((a) => a.id === h.activityId) : undefined;
    const { params, ...rest } = h; // `...rest` — все поля, кроме params (≈ with { params = null })
    if (target) {
      const have = new Set(target.params?.map((p) => p.id));
      target = { ...target, params: [...(target.params ?? []), ...params.filter((p) => !have.has(p.id))], updatedAt: now };
      out.habits.push({ ...rest, updatedAt: now });
    } else {
      target = d.activities.find((a) => a.id === `act-${h.id}`)
        ?? { id: `act-${h.id}`, parentId: null, name: h.name, icon: h.icon, hue: h.hue, order: ++order, updatedAt: now };
      target = { ...target, params, updatedAt: now };
      out.habits.push({ ...rest, kind: h.kind === 'check' ? 'points' : h.kind, activityId: target.id, updatedAt: now });
    }
    out.activities.push(target);
    for (const m of d.habitMarks) {
      if (m.habitId !== h.id) continue;
      const legacy = (m as HabitMark & { sets?: LegacySet[] }).sets;
      const sets: LegacySet[] = legacy ?? (m.values ? [{ values: m.values }] : []);
      if (!sets.length) continue;
      const noon = dayStartOf(m.day) + 12 * HOUR_MS;
      if (m.done) sets.forEach((s, i) => out.points.push({
        id: `${m.id}:${i}`, activityId: target.id, at: s.at || noon + i * 60_000,
        values: s.values, choices: s.choices, updatedAt: now,
      }));
      const { values: _v, ...mark } = m as HabitMark & { sets?: unknown };
      delete mark.sets;
      // у привычки «по записям» день засчитывают сами записи, ручная галочка не нужна
      out.habitMarks.push({ ...mark, done: h.kind === 'check' ? false : m.done, updatedAt: now });
    }
  }
  return out;
}
