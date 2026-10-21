import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { expect, it } from 'vitest';

// Телефон с базой v2 (параметры у привычки, числа в отметках) открывает новую версию приложения.
it('база v2 → v3: параметры переезжают на занятие, числа — в записи', async () => {
  const old = new Dexie('eukairo');
  old.version(1).stores({ activities: 'id, parentId', entries: 'id, start, activityId', settings: 'key' });
  old.version(2).stores({ habits: 'id', habitMarks: 'id, habitId, day' });
  await old.table('habits').put({ id: 'push', name: 'Анжуманя', hue: 30, kind: 'check', order: 0, since: '2026-10-01', updatedAt: 0, params: [{ id: 'reps', name: 'Отжимания' }] });
  await old.table('habitMarks').put({ id: 'push:2026-10-20', habitId: 'push', day: '2026-10-20', done: true, values: { reps: 30 }, updatedAt: 0 });
  old.close();

  const { db } = await import('./schema'); // открывается уже новой схемой — срабатывает upgrade
  expect((await db.activities.get('act-push'))!.params).toEqual([{ id: 'reps', name: 'Отжимания' }]);
  expect(await db.habits.get('push')).toMatchObject({ kind: 'points', activityId: 'act-push' });
  expect(await db.points.toArray()).toEqual([expect.objectContaining({ activityId: 'act-push', values: { reps: 30 } })]);
});
