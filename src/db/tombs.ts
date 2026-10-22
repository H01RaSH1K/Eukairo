// Журнал удалений для синхронизации. Каждое удаление строки из базы (любой командой)
// записывается сюда как «таблица:id → когда». Ловим через хуки Dexie, поэтому
// commands.ts про синхронизацию ничего не знает.
// Хранится в localStorage: это служебные данные этого устройства, в бэкап они не едут.
import type { Transaction } from 'dexie';
import { db } from './schema';
import { SYNC_TABLES, mergeTombs, tombKey, type Tombs } from '../domain/sync';

const KEY = 'eukairo.tombs';

let cache: Tombs | null = null;
let saveQueued = false;
/** Транзакция синхронизации: её удаления пришли из гиста, их записывает сам синк. */
let silentTx: Transaction | null = null;

export function loadTombs(): Tombs {
  if (!cache) {
    try { cache = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Tombs; } catch { cache = {}; }
  }
  return cache;
}

export function saveTombs(t: Tombs) {
  cache = t;
  try { localStorage.setItem(KEY, JSON.stringify(t)); } catch { /* приватный режим — живём без журнала */ }
}

/** Отметить удаление вручную (например, «Заменить всё» из бэкапа). */
export function addTombs(keys: string[], at = Date.now()) {
  saveTombs(mergeTombs(loadTombs(), Object.fromEntries(keys.map((k) => [k, at])), at));
}

export function setSilentTx(tx: Transaction | null) {
  silentTx = tx;
}

/** Повесить хуки на удаление. Вызывается один раз при старте (store.ts). */
export function installTombHooks() {
  for (const t of SYNC_TABLES) {
    // function, а не стрелка: Dexie передаёт в хук `this`, через него узнаём об успехе операции.
    db.table(t).hook('deleting', function (this: { onsuccess?: () => void }, id: unknown, _obj: unknown, tx: Transaction) {
      if (tx === silentTx) return;
      const key = tombKey(t, String(id));
      this.onsuccess = () => {
        loadTombs()[key] = Date.now();
        // сохраняем один раз после пачки удалений, а не на каждое
        if (!saveQueued) {
          saveQueued = true;
          queueMicrotask(() => { saveQueued = false; saveTombs(loadTombs()); });
        }
      };
    });
  }
}
