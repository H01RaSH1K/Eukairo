// Бэкап одним тапом: системное меню «Поделиться» с готовым JSON-файлом
// → «Сохранить в Файлы» → iCloud Drive. Если меню недоступно — обычное скачивание.
// Восстановление: выбрать файл → «Объединить» (по id, побеждает более свежий) или «Заменить всё».
import { db } from './schema';
import { setSetting } from './commands';
import { SCHEMA_VERSION, closeExtraRunning, mergeById, parseBackup, type Backup } from '../domain/backup';
import { addTombs } from './tombs';
import { SYNC_TABLES, tombKey } from '../domain/sync';
import { currentAppearance, replaceAppearance, type Appearance } from '../settings/appearance';
import { currentDesign, replaceDesign } from '../settings/design';

/** Настройки из базы, которые относятся к этому телефону и в бэкап не едут. */
const LOCAL_ONLY = new Set(['lastBackupAt', 'backupSnoozeUntil', 'forgottenAnswer', 'scheduledStart']);

/** Весь бэкап одним объектом (его же синхронизация кладёт в гист). */
export async function buildBackup(): Promise<Backup> {
  const [activities, entries, settings, habits, habitMarks, points] = await Promise.all([
    db.activities.toArray(), db.entries.toArray(), db.settings.toArray(), db.habits.toArray(), db.habitMarks.toArray(), db.points.toArray(),
  ]);
  return {
    app: 'eukairo',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    activities,
    entries,
    habits,
    habitMarks,
    points,
    settings: [
      ...settings.filter((s) => !LOCAL_ONLY.has(s.key)),
      // оформление и вид главного экрана живут в localStorage, но тоже едут в бэкап
      { key: 'appearance', value: currentAppearance() },
      { key: 'design', value: currentDesign() },
    ],
  };
}

/** Сохранить бэкап. true — сохранили (меню «Поделиться» не закрыли без выбора). */
export async function shareBackup(): Promise<boolean> {
  const json = JSON.stringify(await buildBackup());
  const name = `eukairo-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([json], name, { type: 'application/json' });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
    } catch {
      return false; // закрыли меню — бэкап не сделан
    }
  } else {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  await setSetting('lastBackupAt', Date.now());
  return true;
}

/** Прочитать выбранный файл. Бросает Error с понятным текстом, если файл не тот. */
export async function readBackup(file: File): Promise<Backup> {
  return parseBackup(await file.text());
}

/** Объединить бэкап с тем, что уже есть. Возвращает, сколько записей добавилось/обновилось. */
export function mergeBackup(b: Backup) {
  return db.transaction('rw', [db.activities, db.entries, db.habits, db.habitMarks, db.points], async () => {
    const acts = mergeById(await db.activities.toArray(), b.activities);
    const ents = mergeById(await db.entries.toArray(), b.entries);
    await db.activities.bulkPut(acts);
    await db.entries.bulkPut(ents);
    await db.habits.bulkPut(mergeById(await db.habits.toArray(), b.habits));
    await db.habitMarks.bulkPut(mergeById(await db.habitMarks.toArray(), b.habitMarks));
    await db.points.bulkPut(mergeById(await db.points.toArray(), b.points));
    await db.entries.bulkPut(closeExtraRunning(await db.entries.toArray()));
    return { activities: acts.length, entries: ents.length };
  });
}

/** Стереть всё и поднять из бэкапа (новый телефон, потерянные данные). */
export async function replaceWithBackup(b: Backup) {
  // То, чего нет в бэкапе, считаем удалённым — иначе синхронизация вернула бы это с другого устройства.
  const gone: string[] = [];
  for (const t of SYNC_TABLES) {
    const keep = new Set(b[t].map((x) => x.id));
    for (const id of await db.table(t).toCollection().primaryKeys()) if (!keep.has(String(id))) gone.push(tombKey(t, String(id)));
  }
  await db.transaction('rw', [db.activities, db.entries, db.settings, db.habits, db.habitMarks, db.points], async () => {
    await Promise.all([db.activities.clear(), db.entries.clear(), db.habits.clear(), db.habitMarks.clear(), db.points.clear()]);
    await db.activities.bulkPut(b.activities);
    await db.entries.bulkPut(b.entries);
    await db.habits.bulkPut(b.habits);
    await db.habitMarks.bulkPut(b.habitMarks);
    await db.points.bulkPut(b.points);
    for (const s of b.settings) {
      if (s.key !== 'appearance' && s.key !== 'design' && !LOCAL_ONLY.has(s.key)) await db.settings.put(s);
    }
  });
  addTombs(gone);
  const look = b.settings.find((s) => s.key === 'appearance')?.value;
  if (look) replaceAppearance(look as Appearance);
  const design = b.settings.find((s) => s.key === 'design')?.value;
  if (design) replaceDesign(design);
}
