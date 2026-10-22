import type { SettingDef, VisualizationPlugin } from './types';
import type { PatternId } from './mosaic/patterns';

// Новый стиль = папка в visualizations/ + строка здесь (с описанием его настроек).
// Узоры мозаики — один модуль, но для выбора в настройках это разные стили.
// `import type` не тянет код patterns.ts в стартовый бандл — только тип.
const mosaic = (pattern: PatternId) => () =>
  import('./mosaic/Mosaic').then((m) => ({ default: m.withPattern(pattern) }));

// ——— настройки мозаики ———

const fill = (ids: string[]): SettingDef => ({
  id: 'fill',
  kind: 'choice',
  title: 'Заливка',
  hint: 'Как часы раскладываются по картине',
  default: ids[0],
  options: [
    { id: 'calendar', title: 'Календарь', hint: 'День — блок, блоки как в календаре пн–вс' },
    { id: 'rows', title: 'По дням', hint: 'День — полоса, один и тот же час у всех дней в одном столбце' },
    { id: 'flow', title: 'Подряд', hint: 'Часы змейкой подряд, пустые тоже' },
    { id: 'spots', title: 'Пятна', hint: 'Занятые часы растут вокруг нескольких точек' },
    { id: 'jar', title: 'Копилка', hint: 'Только занятые часы, копятся снизу вверх' },
  ].filter((o) => ids.includes(o.id)),
});

const spots: SettingDef = {
  id: 'spots', kind: 'range', title: 'Точек', min: 1, max: 12, default: 5,
  hint: 'Сколько пятен; часы делятся между ними примерно поровну',
  showIf: { id: 'fill', equals: ['spots'] },
};

const growth: SettingDef = {
  id: 'growth', kind: 'choice', title: 'Рост пятен', default: 'round',
  options: [
    { id: 'round', title: 'Кругом', hint: 'Пятно растёт от центра ровным кругом' },
    { id: 'random', title: 'Неровно', hint: 'Сплошное пятно с неровным краем: свои выступы и впадины у каждого' },
  ],
  showIf: { id: 'fill', equals: ['spots'] },
};

/** Как видно стёкла внутри одной фигуры (часы одной серии). */
export const seam: SettingDef = {
  id: 'seam', kind: 'choice', title: 'Стёкла внутри фигуры', default: 'tone',
  options: [
    { id: 'tone', title: 'Оттенки', hint: 'Стёкла одного цвета чуть разные — светлее/темнее, теплее/холоднее, как из разных листов' },
    { id: 'facet', title: 'Грани', hint: 'Каждое стекло под своим углом к свету: с одного края светлее, с другого темнее' },
    { id: 'both', title: 'Оттенки и грани', hint: 'И то и другое, но мягче' },
    { id: 'none', title: 'Сплошь', hint: 'Фигура одним куском, стыков не видно' },
  ],
};

/** Стекло, набранное из остатков одного занятия (или детей одного родителя). */
export const pooled: SettingDef = {
  id: 'pooled', kind: 'choice', title: 'Сборное стекло занятия', default: 'thin',
  hint: 'Полчаса, набранные из коротких остатков одного занятия',
  options: [
    { id: 'thin', title: 'Бледнее', hint: 'Цвет занятия, но тоньше' },
    { id: 'ripple', title: 'Рифлёное', hint: 'Цвет занятия, стекло с неровной фактурой' },
    { id: 'inset', title: 'Стекло в стекле', hint: 'Внутри тонкий контур той же формы' },
    { id: 'plain', title: 'Как обычное' },
  ],
};

/** Стекло, набранное из остатков разных занятий. */
export const mixed: SettingDef = {
  id: 'mixed', kind: 'choice', title: 'Сборное стекло из разного', default: 'streak',
  hint: 'Полчаса, набранные из коротких остатков разных занятий',
  options: [
    { id: 'streak', title: 'Разводы', hint: 'Цвета занятий перетекают друг в друга, по минутам' },
    { id: 'bands', title: 'Полосы', hint: 'Цвета занятий полосами, по минутам' },
    { id: 'clear', title: 'Прозрачное', hint: 'Бесцветное молочное стекло' },
    { id: 'clearRipple', title: 'Прозрачное рифлёное', hint: 'Бесцветное, с неровной фактурой' },
    { id: 'rainbow', title: 'Радуга' },
  ],
};

const lead: SettingDef = {
  id: 'lead', kind: 'choice', title: 'Свинцовые линии', default: 'normal',
  options: [{ id: 'thin', title: 'Тонкие' }, { id: 'normal', title: 'Обычные' }, { id: 'bold', title: 'Толстые' }],
};

const cut: SettingDef = {
  id: 'cut', kind: 'choice', title: 'Нарезка стёкол', default: 'auto',
  hint: 'По дате — у каждого дня своя, чтобы дни не были одинаковыми',
  options: [
    { id: 'auto', title: 'По дате' }, { id: '0', title: 'Ровная' }, { id: '1', title: 'Осколки' },
    { id: '2', title: 'Соты' }, { id: '3', title: 'Спираль' },
  ],
};

const wobble: SettingDef = {
  id: 'wobble', kind: 'range', title: 'Неровность формы', min: 0, max: 100, step: 10, default: 60, unit: '%',
  hint: '0 — стёкла почти по сетке, 100 — совсем хаотичные осколки',
};

const spread: SettingDef = {
  id: 'spread', kind: 'range', title: 'Разброс площади', min: 0, max: 100, step: 10, default: 30, unit: '%',
  hint: '0 — все стёкла одной площади, 100 — как нарезалось, без выравнивания',
};

const allFills = ['calendar', 'rows', 'flow', 'spots', 'jar'];
// Роза и треугольники не умеют раскладывать по дням — им только свободные заливки.
const freeFills = ['spots', 'flow', 'jar'];

export const visualizations: VisualizationPlugin[] = [
  {
    id: 'mosaic-glass', title: 'Витраж', description: 'Час — стекло, часы одной записи сливаются в одну фигуру',
    settings: [fill(allFills), spots, growth, cut, wobble, spread, seam, pooled, mixed, lead], load: mosaic('glass'),
  },
  {
    id: 'mosaic-rose', title: 'Роза', description: 'Круглое окно: день — кольцо из 24 лепестков',
    settings: [fill(freeFills), spots, growth, seam, pooled, mixed, lead], load: mosaic('rose'),
  },
  {
    id: 'mosaic-tri', title: 'Треугольники', description: 'Час — треугольник, пары складываются в ромбы',
    settings: [fill(freeFills), spots, growth, seam, pooled, mixed, lead], load: mosaic('tri'),
  },
  {
    id: 'mosaic-grid', title: 'Сетка', description: 'Ровные клетки — проще всего читать',
    settings: [fill(allFills), spots, growth, seam, pooled, mixed, lead], load: mosaic('grid'),
  },
];

export const defaultVisualization = visualizations[0];

export const findVisualization = (id: string) =>
  visualizations.find((v) => v.id === id) ?? defaultVisualization;
