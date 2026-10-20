// Хранилище макета в памяти. Повторяет будущие команды из db/commands.ts
// (startTimer, stopTimer, saveEntry…), но без IndexedDB: перезапуск = свежие демо-данные.
import { useSyncExternalStore } from 'react';
import type { Activity, Entry } from '../db/schema';
import { resolveOverlaps } from '../domain/overlaps';
import { HOUR_MS } from '../domain/time';
import { demoActivities, makeDemoEntries, newId } from './demoData';

export interface MockState {
  activities: Activity[];
  entries: Entry[];          // отсортированы по start
  vizId: string;             // выбранный стиль визуализации
  backupBanner: boolean;     // плашка «давно не было бэкапа»
  forgottenAsked: string | null; // по какой записи уже спросили «таймер ещё идёт?»
}

const VIZ_KEY = 'eukairo.mock.viz';

function initial(): MockState {
  let vizId = 'mosaic';
  try { vizId = localStorage.getItem(VIZ_KEY) ?? vizId; } catch { /* приватный режим */ }
  return {
    activities: demoActivities,
    entries: makeDemoEntries(Date.now()),
    vizId,
    backupBanner: true,
    forgottenAsked: null,
  };
}

let state = initial();
const listeners = new Set<() => void>();

function set(patch: Partial<MockState>) {
  state = { ...state, ...patch };
  if (patch.entries) state.entries = [...state.entries].sort((a, b) => a.start - b.start);
  listeners.forEach((l) => l());
}

/** Подписка экрана на хранилище (≈ событие OnChanged → перерисовка). */
export function useMock(): MockState {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => state,
  );
}

export const running = (s: MockState) => s.entries.find((e) => e.end === null) ?? null;

// ——— команды ———

export function stopTimer(at = Date.now()) {
  set({ entries: state.entries.map((e) => (e.end === null ? { ...e, end: Math.max(at, e.start), updatedAt: Date.now() } : e)) });
}

export function startTimer(activityId: string) {
  const now = Date.now();
  const closed = state.entries.map((e) => (e.end === null ? { ...e, end: now, updatedAt: now } : e));
  set({ entries: [...closed, { id: newId(), activityId, start: now, end: null, source: 'timer', updatedAt: now }] });
}

/** Создать или исправить запись; соседи обрезаются/делятся/удаляются. */
export function saveEntry(entry: Entry) {
  const now = Date.now();
  const others = state.entries.filter((e) => e.id !== entry.id);
  const r = resolveOverlaps(others, entry.start, entry.end ?? now, now, newId);
  const updated = new Map(r.updated.map((u) => [u.id, u]));
  const entries = others
    .filter((e) => !r.removed.includes(e.id))
    .map((e) => updated.get(e.id) ?? e)
    .concat(r.added, { ...entry, updatedAt: now });
  set({ entries });
}

export function deleteEntry(id: string) {
  set({ entries: state.entries.filter((e) => e.id !== id) });
}

export function setViz(vizId: string) {
  try { localStorage.setItem(VIZ_KEY, vizId); } catch { /* ничего */ }
  set({ vizId });
}

export function dismissBackupBanner() { set({ backupBanner: false }); }
export function markForgottenAsked(id: string) { set({ forgottenAsked: id }); }

// ——— демо-кнопки ———

/** «Забыл выключить»: прогулка, начатая 5 часов назад. */
export function simulateForgotten() {
  const now = Date.now();
  const start = now - 5 * HOUR_MS - 7 * 60_000;
  stopTimer(now);
  saveEntry({ id: newId(), activityId: 'dog', start, end: null, source: 'timer', updatedAt: now });
  set({ forgottenAsked: null });
}

export function showBackupBanner() { set({ backupBanner: true }); }
export function resetDemo() { set({ ...initial(), vizId: state.vizId }); }
