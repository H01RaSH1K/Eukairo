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
  hint: 'Как часы недели и месяца раскладываются по картине',
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
    { id: 'random', title: 'Как упадёт', hint: 'Каждое новое стекло — в случайном месте, лишь бы касалось пятна' },
  ],
  showIf: { id: 'fill', equals: ['spots'] },
};

const threshold: SettingDef = {
  id: 'threshold', kind: 'range', title: 'Час закрашивается от', min: 10, max: 50, step: 5, default: 30, unit: 'мин',
  hint: 'Сколько минут записи нужно, чтобы стекло часа стало её цвета',
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

const allFills = ['calendar', 'rows', 'flow', 'spots', 'jar'];
// Роза и треугольники не умеют раскладывать по дням — им только свободные заливки.
const freeFills = ['spots', 'flow', 'jar'];

export const visualizations: VisualizationPlugin[] = [
  {
    id: 'mosaic-glass', title: 'Витраж', description: 'Час — стекло, часы одной записи сливаются в одну фигуру',
    settings: [fill(allFills), spots, growth, cut, threshold, lead], load: mosaic('glass'),
  },
  {
    id: 'mosaic-rose', title: 'Роза', description: 'Круглое окно: день — кольцо из 24 лепестков',
    settings: [fill(freeFills), spots, growth, threshold, lead], load: mosaic('rose'),
  },
  {
    id: 'mosaic-tri', title: 'Треугольники', description: 'Час — треугольник, пары складываются в ромбы',
    settings: [fill(freeFills), spots, growth, threshold, lead], load: mosaic('tri'),
  },
  {
    id: 'mosaic-grid', title: 'Сетка', description: 'Ровные клетки — проще всего читать',
    settings: [fill(allFills), spots, growth, threshold, lead], load: mosaic('grid'),
  },
];

export const defaultVisualization = visualizations[0];

export const findVisualization = (id: string) =>
  visualizations.find((v) => v.id === id) ?? defaultVisualization;
