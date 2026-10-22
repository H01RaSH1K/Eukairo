import { describe, expect, it } from 'vitest';
import { fingerprint, mergeTombs, planSync, TOMB_TTL_MS, type Snapshot } from './sync';
import type { Activity, Entry } from '../db/schema';

const act = (id: string, updatedAt = 1, parentId: string | null = null): Activity => ({ id, parentId, name: id, order: 0, updatedAt });
const ent = (id: string, activityId: string, updatedAt = 1, start = 0, end: number | null = 10): Entry =>
  ({ id, activityId, start, end, source: 'timer', updatedAt });
const snap = (p: Partial<Snapshot>): Snapshot => ({ activities: [], entries: [], habits: [], habitMarks: [], points: [], ...p });
const NOW = 1_000_000;

describe('planSync', () => {
  it('добавляет новое с обеих сторон, при совпадении побеждает более свежее', () => {
    const p = planSync(
      snap({ activities: [act('a')], entries: [ent('e1', 'a', 5), ent('e2', 'a', 1)] }), {},
      snap({ activities: [act('a')], entries: [ent('e2', 'a', 3), ent('e3', 'a', 1)] }), {}, NOW);
    expect(p.put.entries.map((e) => e.id).sort()).toEqual(['e2', 'e3']);
    expect(p.result.entries.map((e) => e.id).sort()).toEqual(['e1', 'e2', 'e3']);
  });

  it('удалённое на другом устройстве удаляется и здесь, свежая правка удаление перебивает', () => {
    const p = planSync(
      snap({ activities: [act('a')], entries: [ent('old', 'a', 1), ent('edited', 'a', 9)] }), {},
      snap({ activities: [act('a')] }), { 'entries:old': 5, 'entries:edited': 5 }, NOW);
    expect(p.del.entries).toEqual(['old']);
    expect(p.result.entries.map((e) => e.id)).toEqual(['edited']);
  });

  it('удалённое здесь не возвращается из гиста', () => {
    const p = planSync(snap({ activities: [act('a')] }), { 'entries:e': 5 }, snap({ activities: [act('a')], entries: [ent('e', 'a', 1)] }), {}, NOW);
    expect(p.put.entries).toEqual([]);
    expect(p.result.entries).toEqual([]);
  });

  it('возвращает удалённое занятие, если на другом устройстве к нему успели записать время', () => {
    const p = planSync(snap({}), { 'activities:a': 5 }, snap({ activities: [act('a', 1)], entries: [ent('e', 'a', 7)] }), {}, NOW);
    expect(p.result.activities.map((a) => a.id)).toEqual(['a']);
    expect(p.tombs['activities:a']).toBeUndefined();
  });

  it('два идущих таймера — остаётся один', () => {
    const p = planSync(snap({ activities: [act('a')], entries: [ent('x', 'a', 1, 0, null)] }), {},
      snap({ activities: [act('a')], entries: [ent('y', 'a', 1, 100, null)] }), {}, NOW);
    expect(p.result.entries.filter((e) => e.end === null).map((e) => e.id)).toEqual(['y']);
  });
});

describe('mergeTombs / fingerprint', () => {
  it('берёт более позднее удаление и забывает старые', () => {
    expect(mergeTombs({ a: 1, b: NOW - TOMB_TTL_MS - 1 }, { a: 3 }, NOW)).toEqual({ a: 3 });
  });
  it('не зависит от порядка строк', () => {
    const a = snap({ activities: [act('a'), act('b')] }), b = snap({ activities: [act('b'), act('a')] });
    expect(fingerprint(a, {})).toBe(fingerprint(b, {}));
  });
});
