// Надстройка «экран блокировки»: держит в отдельном приватном гисте файл «что идёт сейчас»
// (now.ts), который читает виджет в Scriptable (widget.scriptable.js).
//
// Отдельно от синхронизации: свой гист (виджету не надо качать весь бэкап), свой ключ
// в localStorage, своя подписка на данные. От синка берём только токен (syncToken).
// Выключил надстройку или синк — приложение работает ровно как без неё.
import { useSyncExternalStore } from 'react';
import { currentData, subscribeData } from '../../db/store';
import { syncToken } from '../../db/sync';
import { buildNow, nowSig, NOW_FILE, type NowFile } from './now';

const KEY = 'eukairo.lockscreen';
const API = 'https://api.github.com';
const AFTER_EDIT_MS = 1200;

interface Config {
  gistId: string;
  lastSig?: string;
}

export interface LockState {
  on: boolean;
  lastAt: number | null;
  error: string | null;
}

function loadConfig(): Config | null {
  try {
    const c = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Config | null;
    return c?.gistId ? c : null;
  } catch { return null; }
}

function saveConfig(c: Config | null) {
  try {
    if (c) localStorage.setItem(KEY, JSON.stringify(c));
    else localStorage.removeItem(KEY);
  } catch { /* приватный режим */ }
}

let state: LockState = { on: loadConfig() !== null, lastAt: null, error: null };
const listeners = new Set<() => void>();
function setState(patch: Partial<LockState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function useLockscreen(): LockState {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => state);
}

async function gh(token: string, path: string, init: RequestInit = {}) {
  const res = await fetch(API + path, {
    ...init,
    cache: 'no-store',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
  });
  if (!res.ok) throw new Error(`GitHub ответил ошибкой ${res.status}.`);
  return res;
}

const fileBody = (n: NowFile) => JSON.stringify({ files: { [NOW_FILE]: { content: JSON.stringify(n) } } });
const snapshot = () => {
  const d = currentData();
  return buildNow(d.activities, d.entries, d.running, Date.now());
};

// ——— отправка ———

let timer: ReturnType<typeof setTimeout> | undefined;

/** Отправить, если выжимка изменилась. `leaving` — приложение уходит в фон: запрос должен пережить это. */
async function publish(leaving = false) {
  clearTimeout(timer); timer = undefined;
  const cfg = loadConfig();
  const token = syncToken();
  if (!cfg || !token || !currentData().ready) return;
  const now = snapshot();
  const sig = nowSig(now);
  if (sig === cfg.lastSig) return;
  try {
    // keepalive — браузер дошлёт запрос, даже если iOS усыпит приложение сразу после сворачивания
    await gh(token, `/gists/${cfg.gistId}`, { method: 'PATCH', body: fileBody(now), keepalive: leaving });
    saveConfig({ ...cfg, lastSig: sig });
    setState({ lastAt: Date.now(), error: null });
  } catch (e) {
    setState({ error: e instanceof Error ? e.message : 'Нет связи с GitHub.' });
  }
}

let started = false;

/** Запустить надстройку. Безопасно вызывать много раз; без включённой надстройки ничего не делает. */
export function startLockscreen() {
  if (started || !loadConfig()) return;
  started = true;
  // Правка в базе → чуть подождать (несколько правок подряд — одна отправка).
  subscribeData(() => { clearTimeout(timer); timer = setTimeout(() => void publish(), AFTER_EDIT_MS); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (timer) void publish(true); }
    else void publish(); // вернулись — например, наступил новый день
  });
  void publish();
}

/** Включить: найти свой гист или создать. Нужен включённый синк (берём его токен). */
export async function enableLockscreen(): Promise<void> {
  const token = syncToken();
  if (!token) throw new Error('Сначала включи синхронизацию: виджет читает данные через тот же токен.');
  const gists = (await (await gh(token, '/gists?per_page=100')).json()) as { id: string; files: Record<string, unknown> }[];
  let id = gists.find((g) => g.files[NOW_FILE])?.id;
  if (!id) {
    const g = (await (await gh(token, '/gists', {
      method: 'POST',
      body: JSON.stringify({ description: 'Eukairo — экран блокировки (можно удалить)', public: false, files: { [NOW_FILE]: { content: JSON.stringify(snapshot()) } } }),
    })).json()) as { id: string };
    id = g.id;
  }
  saveConfig({ gistId: id });
  setState({ on: true, error: null });
  startLockscreen();
  await publish();
}

/** Выключить на этом устройстве. Гист остаётся (виджет покажет последнее, что успели отправить). */
export function disableLockscreen() {
  saveConfig(null);
  clearTimeout(timer); timer = undefined;
  setState({ on: false, lastAt: null, error: null });
}
