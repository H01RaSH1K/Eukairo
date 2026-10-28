// Что показать на экране блокировки: крошечная выжимка из базы, которую виджет
// в Scriptable скачивает из гиста. Чистые функции: про сеть и базу не знают.
//
// Виджет обновляется редко (iOS сама решает когда), поэтому в файле не «сколько прошло»,
// а моменты: начало, плановый конец, полночь. Время между обновлениями iOS досчитывает сама.
import type { Activity, Entry } from '../../db/schema';
import { needIds, pathOf } from '../../domain/tree';
import { plannedEndOf } from '../../domain/timer';
import { dayKey, startOfLocalDay } from '../../domain/time';

export const NOW_FILE = 'eukairo-now.json';

/** Формат файла. Меняешь — поправь и виджет (widget.scriptable.js), он читает те же поля. */
export interface NowFile {
  v: 1;
  at: number;          // когда записано (мс UTC)
  day: string;         // 'ГГГГ-ММ-ДД': к какому дню относится doneMs
  doneMs: number;      // полезное время за этот день по уже закрытым записям
  run: NowRun | null;  // идущий таймер
}

export interface NowRun {
  name: string;        // «Код»
  path: string;        // «Работа › Eukairo» (предки, без самого занятия); '' у корневого
  icon: string;        // эмодзи; '' — нет
  start: number;
  end: number | null;  // плановый конец таймера на время; null — без лимита
  need: boolean;       // нужда: в полезное время не идёт
}

/** Выжимка на момент `now`. */
export function buildNow(activities: Activity[], entries: Entry[], running: Entry | null, now: number): NowFile {
  const from = startOfLocalDay(now);
  const needs = needIds(activities);
  let doneMs = 0;
  for (const e of entries) {
    if (e.end === null || needs.has(e.activityId)) continue;
    const ms = Math.min(e.end, now) - Math.max(e.start, from);
    if (ms > 0) doneMs += ms;
  }
  let run: NowRun | null = null;
  if (running) {
    const path = pathOf(activities, running.activityId);
    const self = path.pop();
    run = {
      name: self?.name ?? '?',
      path: path.map((a) => a.name).join(' › '),
      icon: self?.icon ?? [...path].reverse().find((a) => a.icon)?.icon ?? '',
      start: running.start,
      end: plannedEndOf(running) ?? null,
      need: needs.has(running.activityId),
    };
  }
  return { v: 1, at: now, day: dayKey(now), doneMs, run };
}

/** Отпечаток без `at`: одинаковый — заново отправлять незачем. */
export const nowSig = (n: NowFile) => JSON.stringify({ ...n, at: 0 });
