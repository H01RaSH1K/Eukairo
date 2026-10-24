import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ComponentType } from 'react';
import type { VisualizationProps } from '../types';
import { HOUR_MS, dayStarts } from '../../domain/time';
import { runKeys, spotPlaces, wholeOwners, type HourOwner } from './layout';
import { dayBorderPath, getPattern, leadPath, seedFor, type FillId, type PatternId } from './patterns';
import { tone } from './tone';
import { Tiles } from './tiles';
import type { Pt } from './voronoi';
import './mosaic.css';

// Мозаика-витраж: период делится на сегменты-стёкла (на дне стекло — полчаса, на неделе
// и месяце — час, см. STEP). Нарезка стёкол своя у каждого дня/недели/месяца (зависит
// от даты), чтобы дни не были одинаковыми (день — 48, неделя — 168, месяц — 24 × дней).
// Время нужд (сон, еда…) — не полезное: его стёкла рисуются по-особому (настройка «Часы нужд»:
// матовое стекло, блёклый цвет, оправа) или вовсе вынимаются из дня (поспал 8 ч — 32 стекла из 48).
// Целые стёкла серии — как есть, остатки копятся: набралось на стекло у одного занятия
// (или у детей одного родителя) или всего подряд — сборное стекло, «мозаика в стекле»
// (см. poolOwners в layout.ts и tiles.tsx). Неполных стёкол нет.
// Стёкла одной серии (записи одного занятия почти подряд) сливаются в одну фигуру,
// между ними — тонкий шов.

const leadWidth = { day: 1.4, week: 0.7, month: 0.45 };
// Сколько времени в одном стекле: на дне — полчаса (48 стёкол), на неделе и месяце — час.
// Остатки меньше стекла копятся (см. poolOwners), кусков нет.
const STEP = { day: HOUR_MS / 2, week: HOUR_MS, month: HOUR_MS };
const DAY = 24 * HOUR_MS;

function Mosaic({ pattern, scale, from, to, spans, runningEntryId, settings, onSelect, onCount }: VisualizationProps & { pattern: PatternId }) {
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
  // Как рисовать часы нужд (см. needs в registry.ts); «remove» — вынимать из дня, как раньше.
  const needStyle = (settings.needs as string) ?? 'frost';
  const dropNeeds = needStyle === 'remove';
  const weekday = (new Date(from).getDay() + 6) % 7; // getDay: 0 = вс → делаем 0 = пн
  const now = Date.now();
  // Экран перерисовывается каждую секунду (таймер), а хозяева часов меняются от силы раз
  // в минуту — считаем их заново, только когда сменилась минута или сами записи.
  const sig = spans.map((s) => `${s.entryId}:${s.start}:${Math.floor(s.end / 60_000)}:${s.color}:${s.need ? 1 : 0}:${s.parents?.map((x) => x.id).join('/') ?? ''}`).join('|');
  const keys = useMemo(() => runKeys(spans), [sig]); // eslint-disable-line react-hooks/exhaustive-deps
  // Хозяева стёкол каждого дня; стёкла, где главная — нужда, выкидываем (только при «Вынимать»).
  // `h` — номер стекла в дне, он нужен, чтобы найти стекло «сейчас» и отличить будущее.
  const plan = useMemo(() => days.map((d) => wholeOwners(spans, d, DAY / step, keys, step)), [sig, from, to, scale]); // eslint-disable-line react-hooks/exhaustive-deps
  const kept = useMemo(
    () => plan.map((owners, di) => owners.map((o, h) => ({ o, h, at: days[di] + h * step })).filter((x) => !dropNeeds || !x.o?.need)),
    [plan, dropNeeds], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const counts = kept.map((k) => k.length);
  const { w, h, cells, decor, day } = getPattern(pattern, counts, seedFor(from), aspect, fill === 'spots' ? 'flow' : fill, weekday, cut, look);
  const seed = seedFor(from);
  const timeFill = fill !== 'spots' && fill !== 'jar';
  // Будущие часы (только там, где стёкла идут по времени) — спокойнее пустых прошедших.
  const futureFrom = timeFill ? firstFuture(kept, now) : cells.length;

  // Кто чем владеет: по времени — стекло за стеклом; у копилки и пятен пустые часы
  // выкидываем, а занятые раскладываем по-своему. Пересчёт — только когда сменились
  // хозяева или узор (≈ кэш по ключу), а не каждую секунду таймера.
  const pieces = useMemo(() => {
    // flatMap ≈ SelectMany: оставшиеся часы всех дней подряд — это и есть стёкла.
    if (timeFill) return kept.flatMap((k) => k.map((x) => x.o)).map((owner, cell) => ({ poly: cells[cell], owner, cell }));
    // `o is HourOwner` — проверка типа, как в C#.
    const busy = kept.flat().map((x) => x.o).filter((o): o is HourOwner => o !== null);
    // Нужды занимают последние стёкла картины (у копилки — верх банки), полезное — остальные.
    const needs = busy.filter((o) => o.need).slice(0, cells.length);
    const room = cells.length - needs.length;
    const list = busy.filter((o) => !o.need).slice(0, room);
    const places = fill === 'spots'
      ? spotPlaces(cells.slice(0, room), list, seed, spotCount, settings.growth === 'random' ? 'random' : 'round')
      : list.map((_, i) => i);
    const whole: (HourOwner | null)[] = cells.map(() => null);
    places.forEach((cell, k) => { if (cell >= 0) whole[cell] = list[k]; }); // −1 — стёкол не хватило
    needs.forEach((o, k) => { whole[room + k] = o; });
    return cells.map((poly, cell) => ({ poly, owner: whole[cell], cell }));
  }, [kept, cells, timeFill, fill, seed, spotCount, settings.growth]);

  // Счётчик стёкол для таблички в фокусе: сколько закрашено полезным, сколько всего было
  // доступно (без нужд). Сообщаем наверх, только когда числа поменялись.
  const needCount = plan.reduce((s, owners) => s + owners.filter((o) => o?.need).length, 0);
  const filled = pieces.filter((p) => p.owner && !p.owner.need).length;
  const total = (dropNeeds ? cells.length : cells.length - needCount);
  useEffect(() => { onCount?.({ filled, total, need: needCount }); }, [filled, total, needCount, onCount]);

  // Свинец (между разными хозяевами) и швы (внутри одной серии).
  const drawn = useMemo(() => {
    const polys = [...cells, ...(decor ?? [])];
    const keysOf = [...pieces.map((p) => p.owner?.key ?? null), ...(decor ?? []).map(() => null)];
    return { pts: cells.map(toPoints), ...leadPath(polys, keysOf) };
  }, [pieces, cells, decor]);
  const border = useMemo(() => (day && days.length > 1 ? dayBorderPath([...cells, ...(decor ?? [])], day) : ''), [cells, day, days.length]);

  const dayIdx = days.findIndex((d, i) => now >= d && now < (days[i + 1] ?? to));
  const runningKey = runningEntryId ? keys.get(runningEntryId) ?? null : null;
  // «Сейчас»: где стёкла по времени — стекло текущего часа; у копилки и пятен —
  // последнее стекло идущей записи.
  let nowPoly: Pt[] | null = null;
  if (timeFill) {
    const i = dayIdx >= 0 ? nowIndex(kept, dayIdx, Math.floor((now - days[dayIdx]) / step)) : -1;
    if (i >= 0 && i < cells.length) nowPoly = cells[i];
  } else if (runningKey) {
    const mine = pieces.filter((p) => p.owner?.key === runningKey);
    nowPoly = mine[mine.length - 1]?.poly ?? null;
  }

  // Только что закрашенные стёкла вспыхивают. Помним, какие пары «стекло — серия» были
  // в прошлый раз (useRef ≈ поле класса: живёт между отрисовками и не вызывает перерисовку).
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
      {needStyle === 'frost' && (
        // Иней матового стекла: мелкие светлые крапинки узором (≈ текстура, повторяется плиткой).
        <defs>
          <pattern className="frost-dots" id={facetId + 'frost'} width={leadWidth[scale] * 2.4} height={leadWidth[scale] * 2.4} patternUnits="userSpaceOnUse">
            {FROST.map(([x, y, r], k) => <circle key={k} cx={x * leadWidth[scale] * 2.4} cy={y * leadWidth[scale] * 2.4} r={r * leadWidth[scale]} />)}
          </pattern>
        </defs>
      )}
      {decor?.map((poly, i) => (
        <polygon key={'d' + i} points={toPoints(poly)} className="glass-decor" />
      ))}
      {pieces.map((p, i) => {
        const o = p.owner;
        const cls = o?.need
          ? 'glass-need need-' + needStyle + (o.key === runningKey ? ' live' : '')
          : o
          ? 'glass-fill' + (o.key === runningKey ? ' live' : '') + (isFresh(pairs[i]) ? ' fresh' : '')
          : 'glass-empty' + (p.cell >= futureFrom ? ' glass-future' : '');
        // «Оттенки»: у каждого стекла свой сдвиг яркости (по номеру стекла, ±7%).
        // Нуждам цвет ставит CSS (класс need-…) из --c — цвета занятия.
        const color = o && !o.need ? paint(o.color, p.cell, seamStyle) : undefined;
        return (
          <polygon
            key={i}
            points={drawn.pts[i]}
            className={cls}
            // Обводка цветом заливки прячет тонкие щели между слитыми сегментами.
            // Доля 0…1 — порядок стекла; дизайн может по ней растянуть анимацию появления.
            // --v — свой оттенок у каждого стекла (0…1, постоянный для номера): дизайн может
            // подсветить пустые стёкла неравномерно, как настоящее стекло.
            style={{ fill: color, stroke: color, '--c': o?.color, '--d': (p.cell / cells.length).toFixed(3), '--v': (((p.cell * 2654435761) >>> 0) % 1000 / 1000).toFixed(3) } as CSSProperties}
            onClick={() => o?.entryId && onSelect(o.entryId)}
          />
        );
      })}
      {needStyle === 'frost' && pieces.map((p, i) => p.owner?.need && <polygon key={'n' + i} points={drawn.pts[i]} fill={`url(#${facetId}frost)`} className="glass-frost" />)}
      {/* Сборные стёкла (из остатков) — мозаика в стекле поверх цвета */}
      {pieces.map((p, i) => p.owner?.mix && <Tiles key={'t' + i} poly={p.poly} cell={p.cell} lead={leadWidth[scale] * leadK} mix={p.owner.mix} />)}
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
          {pieces.map((p, i) => p.owner && !p.owner.need && <polygon key={'f' + i} points={drawn.pts[i]} fill={`url(#${facetId}${facetOf(p.cell)})`} className="glass-facet" />)}
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

/** Крапинки инея в плитке узора: x, y (доли плитки) и радиус (в толщинах свинца). */
const FROST: [number, number, number][] = [[0.12, 0.2, 0.18], [0.55, 0.08, 0.12], [0.8, 0.45, 0.2], [0.3, 0.62, 0.14], [0.65, 0.85, 0.16], [0.05, 0.9, 0.1], [0.45, 0.38, 0.09]];

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

/** Номер стекла часа `hour` дня `dayIdx` среди оставшихся часов (−1 — этот час вынут как нужда). */
function nowIndex(kept: { h: number }[][], dayIdx: number, hour: number): number {
  const i = kept[dayIdx].findIndex((x) => x.h === hour);
  return i < 0 ? -1 : kept.slice(0, dayIdx).reduce((s, k) => s + k.length, 0) + i;
}

/** Плагин с выбранным узором (каждый узор — отдельная строка в реестре). */
export function withPattern(pattern: PatternId): ComponentType<VisualizationProps> {
  return (props) => <Mosaic {...props} pattern={pattern} />;
}
