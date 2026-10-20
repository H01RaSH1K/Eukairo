import { describe, expect, it } from 'vitest';
import { closeExtraRunning, parseBackup } from './backup';
import { forgottenTimer } from './forgotten';
import { nextHue } from './colors';
import type { Activity, Entry } from '../db/schema';

const good = { app: 'eukairo', schemaVersion: 1, exportedAt: 'x', activities: [{ id: 'a', parentId: null, name: 'A', order: 0, updatedAt: 0 }], entries: [{ id: 'e', activityId: 'a', start: 0, end: 1, source: 'timer', updatedAt: 0 }] };

describe('parseBackup', () => {
  it('принимает свой бэкап', () => {
    expect(parseBackup(JSON.stringify(good)).entries).toHaveLength(1);
  });
  it('отклоняет чужое и битое понятной ошибкой', () => {
    expect(() => parseBackup('не json')).toThrow('не JSON');
    expect(() => parseBackup(JSON.stringify({ ...good, app: 'other' }))).toThrow('не бэкап');
    expect(() => parseBackup(JSON.stringify({ ...good, schemaVersion: 99 }))).toThrow('новой версии');
    expect(() => parseBackup(JSON.stringify({ ...good, entries: [{ id: 1 }] }))).toThrow('записи');
    expect(() => parseBackup(JSON.stringify({ ...good, entries: [{ ...good.entries[0], activityId: 'zzz' }] }))).toThrow('без занятия');
  });
});

describe('closeExtraRunning', () => {
  it('оставляет идущим только самый поздний таймер', () => {
    const e = (id: string, start: number): Entry => ({ id, activityId: 'a', start, end: null, source: 'timer', updatedAt: 0 });
    const fixes = closeExtraRunning([e('old', 0), e('new', 100)]);
    expect(fixes).toEqual([expect.objectContaining({ id: 'old', end: 100 })]);
  });
});

describe('forgottenTimer', () => {
  const acts: Activity[] = [{ id: 'dog', parentId: null, name: 'Собака', order: 0, updatedAt: 0, forgetAfterMin: 60 }];
  const run: Entry = { id: 'r', activityId: 'dog', start: 0, end: null, source: 'timer', updatedAt: 0 };
  const H = 3600_000;
  it('порог занятия; после «да, идёт» — снова через тот же порог', () => {
    expect(forgottenTimer(run, acts, 0.5 * H, null)).toBeNull();
    expect(forgottenTimer(run, acts, 1.5 * H, null)).toBe(run);
    expect(forgottenTimer(run, acts, 1.5 * H, { entryId: 'r', at: 1.4 * H })).toBeNull();
    expect(forgottenTimer(run, acts, 2.5 * H, { entryId: 'r', at: 1.4 * H })).toBe(run);
  });
  it('таймер на время не спрашиваем', () => {
    expect(forgottenTimer({ ...run, plannedEnd: 10 * H }, acts, 5 * H, null)).toBeNull();
  });
});

describe('nextHue', () => {
  it('новый тон — в самом широком просвете', () => {
    const r = (hue: number): Activity => ({ id: String(hue), parentId: null, name: '', order: 0, updatedAt: 0, hue });
    expect(nextHue([])).toBe(215);
    expect(nextHue([r(0), r(90)])).toBe(225);
  });
});
