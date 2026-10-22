import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ComponentType } from 'react';
import type { VisualizationProps } from '../types';
import { HOUR_MS, dayStarts } from '../../domain/time';
import { runKeys, spotPlaces, wholeOwners, type HourOwner, type Rest } from './layout';
import { centroid, cutPieces, stitch, type Cut, type Group } from './pieces';
import { dayBorderPath, getPattern, leadPath, seedFor, type FillId, type PatternId } from './patterns';
import { tone } from './tone';
import type { Pt } from './voronoi';
import './mosaic.css';

// Мозаика-витраж: период делится на сегменты-стёкла (на дне стекло — полчаса, на неделе
// и месяце — час, см. STEP). Нарезка стёкол своя у каждого дня/недели/месяца (зависит
// от даты), чтобы дни не были одинаковыми (день — 48, неделя — 168, месяц — 24 × дней).
// Время нужд (сон, еда…) из дня вынимается: поспал 8 ч — в дне 32 стекла из 48.
// Время каждой серии округляется до целых стёкол, неполных стёкол нет.
// Стёкла одной серии (записи одного занятия почти подряд) сливаются в одну фигуру,
// между ними — тонкий шов.

const leadWidth = { day: 1.4, week: 0.7, month: 0.45 };
// Сколько времени в одном стекле: на дне — полчаса (48 стёкол), на неделе и месяце — час.
// Время каждой серии округляется до целых стёкол, кусков нет: ошибка не больше полстекла.
const STEP = { day: HOUR_MS / 2, week: HOUR_MS, month: HOUR_MS };
const DAY = 24 * HOUR_MS;
// Самый маленький кусок стекла: на неделе и месяце стёкла мельче, и щепка тонула бы в свинце.
const minFrac = { day: 0.1, week: 0.15, month: 0.25 };

function Mosaic({ pattern, scale, from, to, spans, runningEntryId, settings, onSelect }: VisualizationProps & { pattern: PatternId }) {
  const days = dayStarts(from, to);
  const step = STEP[scale];
  // Меряем место под картину, чтобы узор заполнил виджет целиком.
  // ResizeObserver ≈ подписка на событие «размер изменился».
  const box = useRef<HTMLDivElement>(null);
  const [aspect, setAspect] = useState(0.7);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      if (width > 0 && height > 0) setAspect(width / height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Настройки стиля (см. registry.ts). Значения уже с умолчаниями.
  const fill = settings.fill as FillId;
  const spotCount = Number(settings.spots);
  const cut = settings.cut === undefined || settings.cut === 'auto' ? -1 : Number(settings.cut);
  // Вид стёкол витража: ползунки в процентах → доли 0…1 (см. Look в patterns.ts).
  const look = { spread: Number(settings.spread ?? 100) / 100, wobble: settings.wobble === undefined ? -1 : Number(settings.wobble) / 100 };
  const leadK = { thin: 0.6, normal: 1, bold: 1.8 }[settings.lead as string] ?? 1;
  // Как видно стёкла внутри одной фигуры (см. seam в registry.ts).
  const seamStyle = (settings.seam as string) ?? 'tone';
  const weekday = (new Date(from).getDay() + 6) % 7; // getDay: 0 = вс → делаем 0 = пн
  const now = Date.now();
  // Экран перерисовывается каждую секунду (таймер), а хозяева часов меняются от силы раз
  // в минуту — считаем их заново, только когда сменилась минута или сами записи.
  const sig = spans.map((s) => `${s.entryId}:${s.start}:${Math.floor(s.end / 60_000)}:${s.color}:${s.need ? 1 : 0}`).join('|');
  const keys = useMemo(() => runKeys(spans), [sig]); // eslint-disable-line react-hooks/exhaustive-deps
  // Целые часы каждого дня и остатки серий; часы, где главная — нужда, выкидываем.
  // `h` — час дня, он нужен, чтобы найти стекло «сейчас» и отличить будущее.
  const plan = useMemo(() => days.map((d) => wholeOwners(spans, d, DAY / step, keys, minFrac[scale], step, true)), [sig, from, to, scale]); // eslint-disable-line react-hooks/exhaustive-deps
  const kept = useMemo(
    () => plan.map((p, di) => p.owners.map((o, h) => ({ o, h, at: days[di] + h * step })).filter((x) => !x.o?.need)),
    [plan], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const counts = kept.map((k) => k.length);
  const { w, h, cells, decor, day } = getPattern(pattern, counts, seedFor(from), aspect, fill === 'spots' ? 'flow' : fill, weekday, cut, look);
  const seed = seedFor(from);
  const timeFill = fill !== 'spots' && fill !== 'jar';
  // Будущие часы (только там, где стёкла идут по времени) — спокойнее пустых прошедших.
  const futureFrom = timeFill ? firstFuture(kept, now) : cells.length;

  // Кто чем владеет: целые стёкла + куски остатков. Пересчёт — только когда сменились
  // хозяева или узор (≈ кэш по ключу), а не каждую секунду таймера.
  const pieces = useMemo(() => {
    const rests = plan.flatMap((p, di) => p.rests.map((r) => ({ r, di })));
    let whole: (HourOwner | null)[];
    let cuts: Cut[];
    if (timeFill) {
      // flatMap ≈ SelectMany: оставшиеся часы всех дней подряд — это и есть стёкла.
      whole = kept.flatMap((k) => k.map((x) => x.o));
      cuts = rests.map(({ r, di }) => ({ owner: r.owner, frac: r.frac, anchor: cellOf(kept, di, r.hour) }));
    } else {
      // Копилка и пятна: пустые часы выкидываем, занятые раскладываем по-своему, а куски
      // остатков кладём последними — по краю (в пятнах — за своей серией, в копилке — сверху),
      // чтобы их объедки не становились дырами внутри. `o is HourOwner` — проверка типа, как в C#.
      const items: { o: HourOwner; rest?: Rest }[] = kept.flat().map((x) => x.o).filter((o): o is HourOwner => o !== null).map((o) => ({ o }));
      for (const { r } of rests) {
        let at = -1;
        if (fill === 'spots') items.forEach((it, i) => { if (it.o.key === r.owner.key) at = i; });
        items.splice(at < 0 ? items.length : at + 1, 0, { o: r.owner, rest: r });
      }
      const list = items.slice(0, cells.length);
      const spotOf: number[] = list.map(() => 0); // у копилки одна группа
      const places = fill === 'spots'
        ? spotPlaces(cells, list.map((it) => it.o), seed, spotCount, settings.growth === 'random' ? 'random' : 'round', list.map((it) => !!it.rest), spotOf)
        : list.map((_, i) => i);
      whole = cells.map(() => null);
      cuts = [];
      // Группы плотной укладки: стёкла, отведённые остаткам пятна (по порядку роста), и центр —
      // середина его целых стёкол (у копилки — дно).
      const groups: Group[] = [];
      const sums: [number, number, number][] = [];
      places.forEach((cell, k) => {
        if (cell < 0) return; // стёкол не хватило
        const s = spotOf[k];
        groups[s] ??= { queue: [], center: [0, 0] }; // ??= — «присвоить, если null/undefined»
        sums[s] ??= [0, 0, 0];
        if (list[k].rest) {
          cuts.push({ owner: list[k].o, frac: list[k].rest!.frac, anchor: cell, group: s });
          groups[s].queue.push(cell);
        } else {
          whole[cell] = list[k].o;
          const m = centroid(cells[cell]);
          sums[s][0] += m[0]; sums[s][1] += m[1]; sums[s][2]++;
        }
      });
      groups.forEach((g, s) => {
        if (fill === 'jar') g.center = [w / 2, h]; // копилка наполняется снизу
        else if (sums[s][2]) g.center = [sums[s][0] / sums[s][2], sums[s][1] / sums[s][2]];
        else if (g.queue.length) g.center = centroid(cells[g.queue[0]]);
      });
      return cutPieces(cells, whole, cuts, futureFrom, groups, 'thin');
    }
    return cutPieces(cells, whole, cuts, futureFrom, [], 'thin');
  }, [plan, kept, cells, w, h, timeFill, fill, seed, spotCount, settings.growth, futureFrom]);

  // Вершины разрезов вставляем и в соседей, чтобы общие рёбра совпали (см. stitch),
  // затем считаем свинец (между разными хозяевами) и швы (внутри одной серии).
  const drawn = useMemo(() => {
    const extra = new Map<string, Pt>(); // ≈ Dictionary: без повторов
    pieces.forEach((p) => { if (p.poly !== cells[p.cell]) p.poly.forEach((q) => extra.set(`${Math.round(q[0] * 100)},${Math.round(q[1] * 100)}`, q)); });
    const polys = stitch([...pieces.map((p) => p.poly), ...(decor ?? [])], [...extra.values()]);
    const keysOf = [...pieces.map((p) => p.owner?.key ?? null), ...(decor ?? []).map(() => null)];
    return { pts: polys.slice(0, pieces.length).map(toPoints), ...leadPath(polys, keysOf) };
  }, [pieces, cells, decor]);
  const border = useMemo(() => (day && days.length > 1 ? dayBorderPath([...cells, ...(decor ?? [])], day) : ''), [cells, day, days.length]);

  const dayIdx = days.findIndex((d, i) => now >= d && now < (days[i + 1] ?? to));
  const runningKey = runningEntryId ? keys.get(runningEntryId) ?? null : null;
  // «Сейчас»: где стёкла по времени — стекло текущего часа; у копилки и пятен — кусок
  // (или последнее стекло) идущей записи.
  let nowPoly: Pt[] | null = null;
  if (timeFill) {
    const i = dayIdx >= 0 ? nowIndex(kept, dayIdx, Math.floor((now - days[dayIdx]) / step)) : -1;
    if (i >= 0 && i < cells.length) nowPoly = cells[i];
  } else if (runningKey) {
    const mine = pieces.filter((p) => p.owner?.key === runningKey);
    nowPoly = (mine.find((p) => p.poly !== cells[p.cell]) ?? mine[mine.length - 1])?.poly ?? null;
  }

  // Только что закрашенные стёкла вспыхивают. Помним, какие пары «стекло — серия» были
  // в прошлый раз (useRef ≈ поле класса: живёт между отрисовками и не вызывает перерисовку).
  // Кусок идущей записи растёт в том же стекле — он не вспыхивает, вспыхивает новое стекло.
  const pairs = pieces.map((p) => (p.owner ? `${p.cell}:${p.owner.key}` : ''));
  const pairSig = pairs.join('|');
  const seen = useRef<{ from: number; sig: string; pairs: Set<string>; fresh: Map<string, number> }>({ from, sig: pairSig, pairs: new Set(pairs), fresh: new Map() });
  if (seen.current.from !== from) {
    seen.current = { from, sig: pairSig, pairs: new Set(pairs), fresh: new Map() };
  } else if (seen.current.sig !== pairSig) {
    pairs.forEach((k) => { if (k && !seen.current.pairs.has(k)) seen.current.fresh.set(k, now); });
    seen.current.pairs = new Set(pairs);
    seen.current.sig = pairSig;
  }
  const facetId = 'facet' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const isFresh = (k: string) => now - (seen.current.fresh.get(k) ?? -1e9) < 1500;

  return (
    <div className="glass-box" ref={box}>
    <svg className={'glass ' + scale} viewBox={`-1 -1 ${w + 2} ${h + 2}`}>
      {decor?.map((poly, i) => (
        <polygon key={'d' + i} points={toPoints(poly)} className="glass-decor" />
      ))}
      {pieces.map((p, i) => {
        const o = p.owner;
        const cls = o
          ? 'glass-fill' + (o.key === runningKey ? ' live' : '') + (isFresh(pairs[i]) ? ' fresh' : '')
          : 'glass-empty' + (p.cell >= futureFrom ? ' glass-future' : '');
        // «Оттенки»: у каждого стекла свой сдвиг яркости (по номеру стекла, ±7%).
        // Неполный час — тонкое стекло: цвет, разбавленный пустым стеклом темы.
        const color = o ? thinFill(paint(o.color, p.cell, seamStyle), p.frac) : undefined;
        return (
          <polygon
            key={i}
            points={drawn.pts[i]}
            className={cls}
            // Обводка цветом заливки прячет тонкие щели между слитыми сегментами.
            // Цвет — через style, а не атрибут fill: в нём var() темы (у атрибутов SVG не работает).
            // Доля 0…1 — порядок стекла; дизайн может по ней растянуть анимацию появления.
            // --v — свой оттенок у каждого стекла (0…1, постоянный для номера): дизайн может
            // подсветить пустые стёкла неравномерно, как настоящее стекло.
            style={{ fill: color, stroke: color, '--d': (p.cell / cells.length).toFixed(3), '--v': (((p.cell * 2654435761) >>> 0) % 1000 / 1000).toFixed(3) } as CSSProperties}
            onClick={() => o && onSelect(o.entryId)}
          />
        );
      })}
      {/* «Грани»: поверх каждого цветного стекла — свой градиент, стекло под своим углом к свету */}
      {(seamStyle === 'facet' || seamStyle === 'both') && (
        <>
          <defs>
            {FACETS.map((f, k) => (
              <linearGradient key={k} id={facetId + k} {...f}>
                <stop offset="0" stopColor="#fff" stopOpacity={seamStyle === 'both' ? 0.14 : 0.2} />
                <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
                <stop offset="1" stopColor="#000" stopOpacity={seamStyle === 'both' ? 0.14 : 0.2} />
              </linearGradient>
            ))}
          </defs>
          {pieces.map((p, i) => p.owner && <polygon key={'f' + i} points={drawn.pts[i]} fill={`url(#${facetId}${facetOf(p.cell)})`} className="glass-facet" />)}
        </>
      )}
      <path d={drawn.lead} className="glass-lead" style={{ strokeWidth: leadWidth[scale] * leadK }} />
      {border && <path d={border} className="glass-lead" style={{ strokeWidth: leadWidth[scale] * leadK * 2.6 }} />}
      {nowPoly && <polygon points={toPoints(nowPoly)} className="glass-now" style={{ strokeWidth: leadWidth[scale] * 0.6 }} />}
    </svg>
    </div>
  );
}

/** Номер первого стекла, чей час ещё не начался (по порядку времени). */
function firstFuture(kept: { at: number }[][], now: number): number {
  let i = 0;
  for (const k of kept) for (const x of k) { if (x.at > now) return i; i++; }
  return i;
}

/** Цвет стекла: у «Оттенков» свой у каждого стекла (см. tone.ts), «вместе» — мягче. */
function paint(color: string, cell: number, style: string): string {
  return style === 'tone' ? tone(color, cell) : style === 'both' ? tone(color, cell, 0.6) : color;
}

/**
 * Тонкое стекло: доля часа `frac` → сила цвета. Смешиваем в OKLab с пустым стеклом темы:
 * это прямая линия «цвет → пустое стекло» без поворота тона (в OKLCH оранжевый с тёмно-синим
 * прошёл бы через малиновый), поэтому стекло выходит тоньше, а не грязнее.
 * Даже 6 минут чуть окрашивают стекло.
 */
function thinFill(color: string, frac?: number): string {
  if (frac === undefined || frac >= 1) return color;
  const k = Math.round((0.18 + 0.82 * frac) * 100);
  return `color-mix(in oklab, ${color} ${k}%, var(--glass-empty))`;
}

/** Номер одного из FACETS градиентов для стекла (постоянный для номера). */
const facetOf = (cell: number) => (((cell + 7) * 2246822519) >>> 0) % FACETS.length;

/**
 * Свет на гранях: 8 направлений «откуда светлее», все — примерно сверху (20°…160° от оси x,
 * ось y вниз), чтобы картина читалась как освещённая с одной стороны, но каждое стекло по-своему.
 */
const FACETS = Array.from({ length: 8 }, (_, k) => {
  const a = ((20 + (k * 140) / 7) * Math.PI) / 180;
  return { x1: 0.5 - 0.5 * Math.cos(a), y1: 0.5 - 0.5 * Math.sin(a), x2: 0.5 + 0.5 * Math.cos(a), y2: 0.5 + 0.5 * Math.sin(a) };
});

/** Многоугольник → строка для SVG `points`. */
function toPoints(poly: Pt[]): string {
  return poly.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ');
}

/** Стекло часа `hour` дня `dayIdx`; если этот час вынут как нужда — стекло ближайшего часа. */
function cellOf(kept: { h: number }[][], dayIdx: number, hour: number): number {
  const k = kept[dayIdx];
  if (!k.length) return 0;
  let best = 0;
  k.forEach((x, i) => { if (Math.abs(x.h - hour) < Math.abs(k[best].h - hour)) best = i; });
  return kept.slice(0, dayIdx).reduce((s, d) => s + d.length, 0) + best;
}

/** Номер стекла часа `hour` дня `dayIdx` среди оставшихся часов (−1 — этот час вынут как нужда). */
function nowIndex(kept: { h: number }[][], dayIdx: number, hour: number): number {
  const i = kept[dayIdx].findIndex((x) => x.h === hour);
  return i < 0 ? -1 : kept.slice(0, dayIdx).reduce((s, k) => s + k.length, 0) + i;
}

/** Плагин с выбранным узором (каждый узор — отдельная строка в реестре). */
export function withPattern(pattern: PatternId): ComponentType<VisualizationProps> {
  return (props) => <Mosaic {...props} pattern={pattern} />;
}
