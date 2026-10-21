import { useState, type ReactNode } from 'react';
import type { Param, ParamOption, Point } from '../../db/schema';
import { mainChoice, matches, optionColor, type ChoiceFilter } from '../../domain/points';
import { ChartKindSwitch, LineChart, scrub, saveChart, savedChart, type ChartKind } from '../../ui/LineChart';
import { ExpandButton, FullChart, fullChartHeight } from '../../ui/FullChart';

/**
 * График чисел из записей без времени по дням: столбики или линия, несколько параметров разом,
 * раскраска и фильтр по вариантам, выбор дня тапом и пальцем, весь экран.
 * Один и тот же в карточке привычки и в «Сводках → Записи».
 * Данные приходят функциями, а не готовыми массивами: так фильтр по вариантам
 * применяется к записям внутри дня (сумма — только по подходящим подходам).
 */
export function ParamChart({ days, today, numbers, choices, pointsAt, valuesAt, color, chartKey, fullTitle, empty }: {
  days: number[];                       // начала дней (местная полночь)
  today: number;                        // будущие дни не выбираются
  numbers: Param[];                     // числовые ряды (в том числе встроенные: «Время», «Записей»)
  choices: (Param & { options: ParamOption[] })[]; // параметры-варианты: ими красим и фильтруем
  pointsAt: (i: number) => Point[];     // записи дня
  valuesAt: (i: number, keep: (p: Point) => boolean) => Record<string, number>; // числа дня по отобранным записям
  color: string;                        // цвет первой линии и столбиков
  chartKey: string;                     // где запоминать «столбики / линия»
  fullTitle: ReactNode;
  empty: string;                        // подпись, когда чисел нет
}) {
  const [param, setParam] = useState<string | null>(null);       // столбики: какой параметр
  const [shown, setShown] = useState<Set<string> | null>(null);   // линия: какие параметры включены
  const [chart, setChart] = useState<ChartKind>(() => savedChart(chartKey));
  // День, выбранный тапом по графику. Храним сам день, а не номер столбца: пролистали месяц — выбор пропал сам.
  const [pickedDay, setPickedDay] = useState<number | null>(null);
  const pick = pickedDay === null ? null : days.indexOf(pickedDay) >= 0 ? days.indexOf(pickedDay) : null;
  const setPick = (i: number | null) => setPickedDay(i === null ? null : days[i]);
  const [full, setFull] = useState(false);
  const [by, setBy] = useState<string | null>(null);      // каким вариантом красить («Хват»)
  // Фильтр: параметр → выбранные варианты (≈ Dictionary<string, List<string>>).
  // Внутри параметра — «или» (кулаки или ладони), между параметрами — «и» (… и на полу).
  const [filter, setFilter] = useState<ChoiceFilter>({});
  const pickChart = (k: ChartKind) => { setChart(k); saveChart(chartKey, k); };

  const pid = numbers.find((p) => p.id === param)?.id ?? numbers[0]?.id;
  const cp = choices.find((p) => p.id === by) ?? choices[0];
  // Фильтр отбирает записи, а не дни: в сумму за день идут только подходящие.
  const keep = (p: Point) => matches(p, filter);
  const toggleOption = (id: string, oid: string) => {
    const cur = filter[id] ?? [];
    setFilter({ ...filter, [id]: cur.includes(oid) ? cur.filter((x) => x !== oid) : [...cur, oid] });
  };
  const colored = !!cp && (filter[cp.id] ?? []).length !== 1; // один вариант оставлен — красить нечем
  // точка — цветом самого частого варианта дня
  const tint = (i: number) => {
    const k = cp ? cp.options.findIndex((o) => o.id === mainChoice(pointsAt(i).filter(keep), cp.id)) : -1;
    return k >= 0 ? optionColor(k) : 'var(--text-dim)';
  };
  const dayValues = days.map((_, i) => valuesAt(i, keep));

  const values = dayValues.map((v) => (pid ? v[pid] ?? null : null));
  const got = values.filter((v): v is number => v !== null);
  const max = Math.max(1, ...got);
  const unit = numbers.find((p) => p.id === pid)?.unit;
  // Линия: несколько параметров сразу, у каждого свой цвет (первый — основной цвет).
  const on = shown ?? new Set(pid ? [pid] : []);
  const toggle = (id: string) => {
    const next = new Set(on);
    if (next.has(id)) { if (next.size > 1) next.delete(id); } else next.add(id);
    setShown(next);
  };
  const lineColor = (i: number) => (i === 0 ? color : SERIES_COLORS[(i - 1) % SERIES_COLORS.length]);
  const series = numbers.map((p, i) => ({
    id: p.id, color: lineColor(i),
    values: dayValues.map((v) => v[p.id] ?? null),
    pointColors: colored ? days.map((_, k) => tint(k)) : undefined,
  })).filter((s) => on.has(s.id));
  const sameUnit = new Set(series.map((s) => numbers.find((p) => p.id === s.id)?.unit ?? '')).size <= 1;
  const W = 300, H = 70, bw = W / days.length;
  const lastPast = Math.max(0, days.filter((d) => d <= today).length - 1);
  const labelEvery = days.length > 10 ? 5 : 1;

  const dayName = (i: number) => new Date(days[i]).toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' });
  const caption = () => {
    if (pick !== null) {
      const list = chart === 'line' ? series : pid ? [{ id: pid, color, values }] : [];
      return (
        <div className="small chart-pick" onClick={() => setPick(null)}>
          <b>{dayName(pick)}</b>
          {list.map((x) => {
            const p = numbers.find((q) => q.id === x.id)!;
            const v = x.values[pick];
            return <span key={x.id}> · <span className="dot" style={{ background: x.color }} /> {p.name} {v === null ? '—' : `${round(v)}${p.unit ? ' ' + p.unit : ''}`}</span>;
          })}
          {choices.map((c) => {
            // все варианты, что были в записях дня: «хват: кулаки, ладони»
            const names = [...new Set(pointsAt(pick).filter(keep).map((x) => x.choices?.[c.id]))]
              .map((id) => c.options.find((q) => q.id === id)?.name).filter(Boolean);
            return names.length > 0 && <span key={c.id}> · {c.name.toLowerCase()}: {names.join(', ')}</span>;
          })}
        </div>
      );
    }
    return (
      <div className="dim small">
        {chart === 'line' && series.length > 1 && !sameUnit && 'У каждой линии своя шкала: сравнивай ход, а не высоту. '}
        {chart === 'line' && series.length > 1 ? 'Тапни день, чтобы увидеть числа.' : got.length
          ? `среднее ${round(got.reduce((a, b) => a + b, 0) / got.length)} · максимум ${round(Math.max(...got))}${unit ? ' ' + unit : ''} · дней с числом: ${got.length}`
          : empty}
      </div>
    );
  };

  // График целиком (кнопки, сам график, подпись). Рисуется дважды: в карточке (h = 70) и на весь экран.
  const body = (h: number, isFull: boolean) => (
    <>
      <div className="chart-bar-row">
        <div className="chips">
          {chart === 'bars'
            ? numbers.map((p) => <button key={p.id} aria-pressed={p.id === pid} onClick={() => setParam(p.id)}>{p.name}</button>)
            // в режиме линии параметры включаются по отдельности, точка — цвет линии
            : numbers.map((p, i) => (
              <button key={p.id} aria-pressed={on.has(p.id)} onClick={() => toggle(p.id)}>
                <span className="dot" style={{ background: on.has(p.id) ? lineColor(i) : 'var(--line)' }} /> {p.name}
              </button>
            ))}
        </div>
        <ChartKindSwitch value={chart} onChange={pickChart} />
        {!isFull && <ExpandButton onClick={() => setFull(true)} />}
      </div>
      {/* строка на каждый параметр-вариант: тап по варианту включает его в фильтр, можно несколько;
          тап по названию — красить точки этим параметром (цветные кружки — у него) */}
      {choices.map((c) => (
        <div key={c.id} className="chips variant-chips">
          <button className="variant-by" aria-pressed={c.id === cp?.id} onClick={() => setBy(c.id)}>{c.name}</button>
          {c.options.map((o, i) => (
            <button key={o.id} aria-pressed={(filter[c.id] ?? []).includes(o.id)} onClick={() => toggleOption(c.id, o.id)}>
              {c.id === cp?.id && <span className="dot" style={{ background: optionColor(i) }} />} {o.name}
            </button>
          ))}
        </div>
      ))}
      <svg viewBox={`0 0 ${W} ${h + 14}`} className="bars scrub" style={isFull ? { height: 'auto' } : undefined}
        {...scrub(days.length, (f) => Math.min(lastPast, Math.floor(f * days.length)), pick, setPick)}>
        <line x1="0" x2={W} y1={h} y2={h} stroke="var(--line)" />
        {chart === 'bars' && values.map((v, i) => v !== null && (
          <rect key={i} x={i * bw + 1} y={h - (v / max) * h} width={bw - 2} height={Math.max(1, (v / max) * h)} rx="1.5" fill={colored ? tint(i) : color}
            opacity={pick === null || pick === i ? 1 : 0.35} />
        ))}
        {chart === 'line' && <LineChart series={series} bw={bw} h={h} scale={sameUnit ? 'shared' : 'own'} picked={pick} />}
        {days.map((d, i) => (i % labelEvery === 0 || i === days.length - 1) && (
          <text key={d} x={i * bw + bw / 2} y={h + 12} textAnchor="middle" className="bar-label">
            {labelEvery === 1 ? new Date(d).toLocaleDateString('ru-RU', { weekday: 'short' }) : new Date(d).getDate()}
          </text>
        ))}
      </svg>
      {caption()}
    </>
  );

  return (
    <>
      <div className="habit-chart">{body(H, false)}</div>
      {full && (
        <FullChart title={fullTitle} onClose={() => setFull(false)}>
          <div className="habit-chart full">{body(fullChartHeight(W, 190 + 40 * choices.length), true)}</div>
        </FullChart>
      )}
    </>
  );
}

const round = (v: number) => Math.round(v * 10) / 10;

// Цвета второй и следующих линий (первая — основной цвет).
const SERIES_COLORS = ['#e8e8ee', '#f2c94c', '#56ccf2', '#ff8a65'];
