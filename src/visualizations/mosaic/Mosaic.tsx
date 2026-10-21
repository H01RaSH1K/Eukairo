import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ComponentType } from 'react';
import type { VisualizationProps } from '../types';
import { HOUR_MS, dayStarts } from '../../domain/time';
import { exactOwners, hourOwners, runKeys, spotPlaces, type HourOwner } from './layout';
import { dayBorderPath, getPattern, leadPath, seedFor, type FillId, type PatternId } from './patterns';
import './mosaic.css';

// Мозаика-витраж: период делится на сегменты, сегмент = час. Нарезка стёкол
// своя у каждого дня/недели/месяца (зависит от даты), чтобы дни не были одинаковыми
// (день — 24, неделя — 168, месяц — 24 × дней; всегда одна картина).
// Часы нужд (сон, еда…) из дня вынимаются: поспал 8 ч — в дне 16 стёкол.
// Час целиком одного цвета. «Точно» (по умолчанию): цветных стёкол столько, сколько
// набрано часов, минуты не теряются; «по порогу»: стекло — записи, занявшей час от N минут.
// Часы одной серии (записи одного занятия почти подряд) сливаются в одну фигуру.

const leadWidth = { day: 1.4, week: 0.7, month: 0.45 };

function Mosaic({ pattern, scale, from, to, spans, runningEntryId, settings, onSelect }: VisualizationProps & { pattern: PatternId }) {
  const days = dayStarts(from, to);
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
  const exact = settings.count !== 'threshold';
  const minMs = Number(settings.threshold) * 60_000;
  const cut = settings.cut === undefined || settings.cut === 'auto' ? -1 : Number(settings.cut);
  const leadK = { thin: 0.6, normal: 1, bold: 1.8 }[settings.lead as string] ?? 1;
  const weekday = (new Date(from).getDay() + 6) % 7; // getDay: 0 = вс → делаем 0 = пн
  const now = Date.now();
  // Экран перерисовывается каждую секунду (таймер), а хозяева часов меняются от силы раз
  // в минуту — считаем их заново, только когда сменилась минута или сами записи.
  const sig = spans.map((s) => `${s.entryId}:${s.start}:${Math.floor(s.end / 60_000)}:${s.color}:${s.need ? 1 : 0}`).join('|');
  const keys = useMemo(() => runKeys(spans), [sig]); // eslint-disable-line react-hooks/exhaustive-deps
  // Хозяева 24 часов каждого дня; часы, где главная — нужда, выкидываем.
  // `h` — час дня, он нужен, чтобы найти стекло «сейчас» и отличить будущее.
  const kept = useMemo(
    () => days.map((d) => (exact ? exactOwners(spans, d, 24, keys) : hourOwners(spans, d, 24, minMs, keys)).map((o, h) => ({ o, h, at: d + h * HOUR_MS })).filter((x) => !x.o?.need)),
    [sig, from, to, exact, minMs], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const counts = kept.map((k) => k.length);
  const { w, h, cells, decor, day } = getPattern(pattern, counts, seedFor(from), aspect, fill === 'spots' ? 'flow' : fill, weekday, cut);
  // flatMap ≈ SelectMany: оставшиеся часы всех дней подряд.
  const hours = useMemo(() => kept.flatMap((k) => k.map((x) => x.o)), [kept]);
  // Копилка и пятна: пустые часы выкидываем, занятые раскладываем по-своему.
  // filter ≈ Where; `o is HourOwner` — проверка типа, как в C# pattern matching.
  const filled = useMemo(() => hours.filter((o): o is HourOwner => o !== null), [hours]);
  const seed = seedFor(from);
  const places = useMemo(
    () => (fill === 'spots' ? spotPlaces(cells, filled, seed, spotCount, settings.growth === 'random' ? 'random' : 'round') : fill === 'jar' ? filled.map((_, i) => i) : null),
    [fill, cells, seed, spotCount, settings.growth, filled],
  );
  const owners = useMemo(() => {
    if (!places) return hours;
    const out: (HourOwner | null)[] = cells.map(() => null);
    places.forEach((cell, k) => { out[cell] = filled[k]; });
    return out;
  }, [places, hours, cells, filled]);
  // Линии рисуем по сериям: стёкла одной серии — одна фигура.
  const ownerKeys = owners.map((o) => o?.key ?? null);
  // Линии пересчитываем, только когда меняются хозяева часов (≈ кэш по ключу).
  const key = ownerKeys.join('|');
  const lead = useMemo(() => leadPath([...cells, ...(decor ?? [])], ownerKeys), [cells, key]); // eslint-disable-line react-hooks/exhaustive-deps
  const border = useMemo(() => (day && days.length > 1 ? dayBorderPath([...cells, ...(decor ?? [])], day) : ''), [cells, day, days.length]);
  const pts = useMemo(() => cells.map((poly) => poly.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ')), [cells]);

  const dayIdx = days.findIndex((d, i) => now >= d && now < (days[i + 1] ?? to));
  const runningKey = runningEntryId ? keys.get(runningEntryId) ?? null : null;
  // У копилки и пятен «сейчас» — стекло последнего занятого часа, если таймер идёт.
  const last = filled.length - 1;
  const nowCell = places
    ? (runningKey && last >= 0 && filled[last].key === runningKey ? places[last] : -1)
    : dayIdx >= 0 ? nowIndex(kept, dayIdx, Math.floor((now - days[dayIdx]) / HOUR_MS)) : -1;
  // Будущие часы (только там, где стёкла идут по времени) — спокойнее пустых прошедших.
  const futureFrom = places ? cells.length : firstFuture(kept, now);

  // Идущий таймер наполняет своё стекло снизу вверх, пока час ещё не засчитан.
  const running = runningEntryId ? spans.find((s) => s.entryId === runningEntryId) : undefined;
  let pending = 0;
  if (running && !running.need && !places && nowCell >= 0 && !owners[nowCell]) {
    if (exact) {
      // Засчитывается с половины часа (округление) — к этому моменту стекло полное.
      const d0 = days[dayIdx], d1 = d0 + 24 * HOUR_MS;
      const runMs = spans.filter((s) => keys.get(s.entryId) === runningKey).reduce((sum, s) => sum + Math.max(0, Math.min(s.end, d1) - Math.max(s.start, d0)), 0);
      pending = Math.min(1, (runMs % HOUR_MS) / (HOUR_MS / 2));
    } else {
      const a = days[dayIdx] + Math.floor((now - days[dayIdx]) / HOUR_MS) * HOUR_MS;
      pending = Math.min(1, Math.max(0, running.end - Math.max(running.start, a)) / minMs);
    }
  }
  const clipId = 'pend' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const pendBox = pending > 0 ? bbox(cells[nowCell]) : null;

  // Только что закрашенные стёкла вспыхивают. Помним, кто чем владел в прошлый раз
  // (useRef ≈ поле класса: живёт между отрисовками и не вызывает перерисовку).
  const seen = useRef<{ from: number; keys: (string | null)[]; fresh: Map<number, number> }>({ from, keys: ownerKeys, fresh: new Map() });
  if (seen.current.from !== from || seen.current.keys.length !== ownerKeys.length) {
    seen.current = { from, keys: ownerKeys, fresh: new Map() };
  } else if (seen.current.keys !== ownerKeys && seen.current.keys.join('|') !== key) {
    ownerKeys.forEach((k, i) => { if (k && !seen.current.keys[i]) seen.current.fresh.set(i, now); });
    seen.current.keys = ownerKeys;
  }
  const isFresh = (i: number) => now - (seen.current.fresh.get(i) ?? -1e9) < 1500;

  return (
    <div className="glass-box" ref={box}>
    <svg className={'glass ' + scale} viewBox={`-1 -1 ${w + 2} ${h + 2}`}>
      {decor?.map((poly, i) => (
        <polygon key={'d' + i} points={poly.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ')} className="glass-decor" />
      ))}
      {cells.map((_, i) => {
        const o = owners[i];
        const cls = o
          ? 'glass-fill' + (o.key === runningKey ? ' live' : '') + (isFresh(i) ? ' fresh' : '')
          : 'glass-empty' + (i >= futureFrom ? ' glass-future' : '');
        return (
          <polygon
            key={i}
            points={pts[i]}
            // Обводка цветом заливки прячет тонкие щели между слитыми сегментами.
            fill={o ? o.color : undefined}
            stroke={o ? o.color : undefined}
            className={cls}
            // Доля 0…1 — порядок стекла; дизайн может по ней растянуть анимацию появления.
            // --v — свой оттенок у каждого стекла (0…1, постоянный для номера): дизайн может
            // подсветить пустые стёкла неравномерно, как настоящее стекло.
            style={{ '--d': (i / cells.length).toFixed(3), '--v': (((i * 2654435761) >>> 0) % 1000 / 1000).toFixed(3) } as CSSProperties}
            onClick={() => o && onSelect(o.entryId)}
          />
        );
      })}
      {pendBox && running && (
        <>
          <clipPath id={clipId}>
            <rect x={pendBox[0]} width={pendBox[2] - pendBox[0]} y={pendBox[3] - pending * (pendBox[3] - pendBox[1])} height={pending * (pendBox[3] - pendBox[1])} />
          </clipPath>
          <polygon points={pts[nowCell]} fill={running.color} clipPath={`url(#${clipId})`} className="glass-pending" />
        </>
      )}
      <path d={lead} className="glass-lead" style={{ strokeWidth: leadWidth[scale] * leadK }} />
      {border && <path d={border} className="glass-lead" style={{ strokeWidth: leadWidth[scale] * leadK * 2.6 }} />}
      {nowCell >= 0 && nowCell < cells.length && <polygon points={pts[nowCell]} className="glass-now" style={{ strokeWidth: leadWidth[scale] * 0.6 }} />}
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

/** Рамка многоугольника: [xmin, ymin, xmax, ymax]. */
function bbox(poly: [number, number][]): [number, number, number, number] {
  const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
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
