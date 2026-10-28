// Синхронизация между устройствами через приватный GitHub Gist. Своего сервера нет:
// гист — это файл в GitHub-аккаунте, в нём лежит бэкап плюс журнал удалений.
// Каждое устройство время от времени делает одно и то же:
//   1) скачать гист, 2) слить с базой (domain/sync.ts), 3) если у нас есть то, чего нет в гисте, — отправить.
// Когда: при открытии, при возврате в приложение, через несколько секунд после правки
// и раз в 2 минуты, пока приложение на экране.
import Dexie from 'dexie';
import { useSyncExternalStore } from 'react';
import { db } from './schema';
import { buildBackup, replaceWithBackup } from './backup';
import { addTombs, loadTombs, saveTombs, setSilentTx } from './tombs';
import { currentData, subscribeData } from './store';
import { parseBackup, type Backup } from '../domain/backup';
import { SYNC_TABLES, fingerprint, hasUserData, planSync, tombKey, type Snapshot, type Tombs } from '../domain/sync';

const KEY = 'eukairo.sync';
const FILE = 'eukairo-sync.json';
const API = 'https://api.github.com';
const POLL_MS = 2 * 60_000;
const AFTER_EDIT_MS = 4000;

interface Config {
  token: string;
  gistId: string;
  lastSig?: string; // отпечаток данных после последней удачной синхронизации
}

export interface SyncState {
  on: boolean;
  busy: boolean;
  lastAt: number | null; // когда последний раз всё совпало с гистом
  error: string | null;
}

/** В гисте — обычный бэкап плюс удаления. */
type SyncFile = Backup & { deleted?: Tombs };

// ——— конфиг и состояние для экрана ———

function loadConfig(): Config | null {
  try {
    const c = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Config | null;
    return c?.token && c.gistId ? c : null;
  } catch { return null; }
}

function saveConfig(c: Config | null) {
  try {
    if (c) localStorage.setItem(KEY, JSON.stringify(c));
    else localStorage.removeItem(KEY);
  } catch { /* приватный режим */ }
}

/** Включён ли синк — без загрузки всего модуля (main.tsx решает, грузить ли его). */
export const syncConfigured = () => loadConfig() !== null;

/** Токен GitHub для надстроек (src/addons), которым нужен свой гист; null — синк выключен. */
export const syncToken = () => loadConfig()?.token ?? null;

let state: SyncState = { on: syncConfigured(), busy: false, lastAt: null, error: null };
const listeners = new Set<() => void>();
function setState(patch: Partial<SyncState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

/** Подписка экрана на состояние синка (как useData в store.ts). */
export function useSync(): SyncState {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => state);
}

// ——— GitHub API ———

class GitHubError extends Error {}

async function gh(token: string, path: string, init: RequestInit = {}): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(API + path, {
      ...init,
      cache: 'no-store', // всегда свежий гист, а не из кэша браузера
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
    });
  } catch {
    throw new GitHubError('Нет связи с GitHub.');
  }
  if (res.status === 401) throw new GitHubError('Токен не подошёл: неверный или истёк. Создай новый.');
  if (res.status === 403 || res.status === 404) {
    if (res.headers.get('x-ratelimit-remaining') === '0') throw new GitHubError('GitHub просит подождать (лимит запросов).');
    throw new GitHubError(path.startsWith('/gists/') ? 'Гист не найден или у токена нет права «gist».' : 'У токена нет права «gist».');
  }
  if (!res.ok) throw new GitHubError(`GitHub ответил ошибкой ${res.status}.`);
  return res;
}

interface GistFile { content?: string; truncated?: boolean; raw_url?: string }
interface Gist { id: string; files: Record<string, GistFile | undefined> }

/** Текст нашего файла в гисте (null — файла нет). Большой файл API отдаёт обрезанным — тогда качаем целиком. */
async function readFile(g: Gist): Promise<string | null> {
  const f = g.files[FILE];
  if (!f) return null;
  if (!f.truncated && f.content !== undefined) return f.content;
  const res = await fetch(f.raw_url!, { cache: 'no-store' });
  if (!res.ok) throw new GitHubError('Не удалось скачать файл из гиста.');
  return res.text();
}

function parseFile(text: string): { snap: Snapshot; tombs: Tombs; backup: Backup } {
  const backup = parseBackup(text); // та же проверка, что у бэкапа: битое не попадёт в базу
  const raw = JSON.parse(text) as SyncFile;
  const tombs: Tombs = {};
  for (const [k, v] of Object.entries(raw.deleted ?? {})) if (typeof v === 'number') tombs[k] = v;
  return { snap: backup, tombs, backup };
}

async function localSnapshot(): Promise<Snapshot> {
  const [activities, entries, habits, habitMarks, points] = await Promise.all(SYNC_TABLES.map((t) => db.table(t).toArray()));
  return { activities, entries, habits, habitMarks, points };
}

async function upload(token: string, gistId: string, tombs: Tombs) {
  const body: SyncFile = { ...(await buildBackup()), deleted: tombs };
  await gh(token, `/gists/${gistId}`, { method: 'PATCH', body: JSON.stringify({ files: { [FILE]: { content: JSON.stringify(body) } } }) });
}

// ——— один проход синхронизации ———

let running: Promise<void> | null = null;
let again = false;

/** Синхронизировать сейчас. Если уже идёт — повторить сразу после. */
export function syncNow(): Promise<void> {
  if (running) { again = true; return running; }
  running = (async () => {
    do {
      again = false;
      await syncOnce();
    } while (again);
  })().finally(() => { running = null; });
  return running;
}

async function syncOnce() {
  const cfg = loadConfig();
  if (!cfg) return;
  setState({ busy: true });
  try {
    const gist = (await (await gh(cfg.token, `/gists/${cfg.gistId}`)).json()) as Gist;
    const text = await readFile(gist);
    const remote = text ? parseFile(text) : { snap: emptySnap(), tombs: {} };
    const now = Date.now();

    // Слияние и запись — в одной транзакции: правка, сделанная в эту секунду, не потеряется,
    // а подождёт конца транзакции и попадёт в следующий проход.
    const plan = await db.transaction('rw', SYNC_TABLES.map((t) => db.table(t)), async () => {
      setSilentTx(Dexie.currentTransaction);
      try {
        const p = planSync(await localSnapshot(), loadTombs(), remote.snap, remote.tombs, now);
        for (const t of SYNC_TABLES) {
          if (p.del[t].length) await db.table(t).bulkDelete(p.del[t]);
          if (p.put[t].length) await db.table(t).bulkPut(p.put[t]);
        }
        return p;
      } finally {
        setSilentTx(null);
      }
    });
    saveTombs(plan.tombs);

    const sig = fingerprint(plan.result, plan.tombs);
    if (!text || sig !== fingerprint(remote.snap, remote.tombs)) await upload(cfg.token, cfg.gistId, plan.tombs);
    saveConfig({ ...cfg, lastSig: sig });
    setState({ busy: false, lastAt: Date.now(), error: null });
  } catch (e) {
    setState({ busy: false, error: e instanceof Error ? e.message : String(e) });
  }
}

const emptySnap = (): Snapshot => ({ activities: [], entries: [], habits: [], habitMarks: [], points: [] });

// ——— подключение ———

/**
 * Подключить устройство по токену. Ищет наш гист в аккаунте, нет — создаёт.
 * Первое подключение особое: если одно из устройств ещё «пустое» (только занятия по умолчанию),
 * его данные не смешиваем, а берём с другого — иначе «Работа» появилась бы дважды.
 * Возвращает понятный текст о том, что произошло.
 */
export async function connect(tokenRaw: string): Promise<string> {
  const token = tokenRaw.trim();
  if (!token) throw new Error('Вставь токен.');
  const gists = (await (await gh(token, '/gists?per_page=100')).json()) as Gist[];
  const found = gists.find((g) => g.files[FILE]);
  let msg: string;
  if (!found) {
    const body: SyncFile = { ...(await buildBackup()), deleted: loadTombs() };
    const g = (await (await gh(token, '/gists', {
      method: 'POST',
      body: JSON.stringify({ description: 'Eukairo — синхронизация (не удалять)', public: false, files: { [FILE]: { content: JSON.stringify(body) } } }),
    })).json()) as Gist;
    saveConfig({ token, gistId: g.id });
    msg = 'Готово: создал приватный гист и отправил туда данные. Теперь подключи второе устройство тем же токеном.';
  } else {
    const full = (await (await gh(token, `/gists/${found.id}`)).json()) as Gist;
    const text = await readFile(full);
    const remote = text ? parseFile(text) : null;
    const local = await localSnapshot();
    saveConfig({ token, gistId: found.id });
    if (remote && hasUserData(remote.snap) && !hasUserData(local)) {
      await replaceWithBackup(remote.backup);
      msg = 'Готово: данные загружены из гиста.';
    } else if (remote && !hasUserData(remote.snap) && hasUserData(local)) {
      // в гисте только занятия по умолчанию — заменяем его своими данными, а его занятия считаем удалёнными
      const mine = new Set(local.activities.map((a) => a.id));
      addTombs(remote.snap.activities.filter((a) => !mine.has(a.id)).map((a) => tombKey('activities', a.id)));
      msg = 'Готово: данные этого устройства отправлены в гист.';
    } else {
      msg = 'Готово: данные объединены с гистом.';
    }
  }
  setState({ on: true, error: null });
  startSync();
  await syncNow();
  if (state.error) throw new Error(state.error);
  return msg;
}

/** Отключить это устройство. Гист и данные остаются, токен забываем. */
export function disconnect() {
  saveConfig(null);
  setState({ on: false, busy: false, error: null, lastAt: null });
}

// ——— автоматический запуск ———

let started = false;
let editTimer: ReturnType<typeof setTimeout> | undefined; // ≈ тип, который вернёт setTimeout

/** Запустить фоновую синхронизацию. Безопасно вызывать много раз. */
export function startSync() {
  if (started || !loadConfig()) return;
  started = true;
  const tick = () => { if (loadConfig() && !document.hidden) void syncNow(); };
  setTimeout(tick, 1500); // после первой отрисовки — старт не тормозим
  setInterval(tick, POLL_MS);
  document.addEventListener('visibilitychange', () => {
    if (!loadConfig()) return;
    // вернулись — подтянуть; уходим с несохранённой правкой — успеть отправить
    if (!document.hidden || editTimer) { clearTimeout(editTimer); editTimer = undefined; void syncNow(); }
  });
  // Правка в базе → через пару секунд отправить (несколько правок подряд — одна отправка).
  subscribeData(() => {
    const cfg = loadConfig();
    if (!cfg) return;
    if (fingerprint(currentData(), loadTombs()) === cfg.lastSig) return; // это мы сами только что записали
    clearTimeout(editTimer);
    editTimer = setTimeout(() => { editTimer = undefined; void syncNow(); }, AFTER_EDIT_MS);
  });
}
