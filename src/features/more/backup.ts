// Бэкап одним тапом: системное меню «Поделиться» с готовым JSON-файлом
// → «Сохранить в Файлы» → iCloud Drive. Если меню недоступно — обычное скачивание.
import type { Activity, Entry } from '../../db/schema';
import { currentAppearance } from '../../settings/appearance';

export async function shareBackup(data: { activities: Activity[]; entries: Entry[] }) {
  const json = JSON.stringify({
    app: 'eukairo',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    activities: data.activities,
    entries: data.entries,
    settings: [{ key: 'appearance', value: currentAppearance() }], // оформление тоже едет в бэкап
  });
  const name = `eukairo-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([json], name, { type: 'application/json' });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
    } catch {
      // Пользователь закрыл меню — ничего страшного.
    }
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
