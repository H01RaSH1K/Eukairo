// Синхронизация целиком: база в памяти (fake-indexeddb), а GitHub подменён — гист живёт в переменной.
import 'fake-indexeddb/auto';
import { beforeAll, describe, expect, it, vi } from 'vitest';

// В тестах нет браузера: даём минимальный localStorage (document — ниже, после импортов).
const ls = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => ls.get(k) ?? null, setItem: (k: string, v: string) => void ls.set(k, v), removeItem: (k: string) => void ls.delete(k),
});

let gist: { id: string; content: string } | null = null;
vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
  const path = url.replace('https://api.github.com', '');
  const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status });
  const asGist = () => ({ id: gist!.id, files: { 'eukairo-sync.json': { content: gist!.content } } });
  if (path.startsWith('/gists?')) return json(gist ? [asGist()] : []);
  if (path === '/gists' && init.method === 'POST') {
    gist = { id: 'g1', content: JSON.parse(String(init.body)).files['eukairo-sync.json'].content };
    return json(asGist(), 201);
  }
  if (path === '/gists/g1' && init.method === 'PATCH') {
    gist!.content = JSON.parse(String(init.body)).files['eukairo-sync.json'].content;
    return json(asGist());
  }
  if (path === '/gists/g1') return json(asGist());
  return json({}, 404);
});

const { db } = await import('./schema');
const { addActivity, deleteEntry, logEntry } = await import('./commands');
const { connect, syncNow } = await import('./sync');
const { installTombHooks } = await import('./tombs');
vi.stubGlobal('document', { hidden: true, addEventListener: () => {} });

beforeAll(() => installTombHooks());

const remote = () => JSON.parse(gist!.content);

describe('синхронизация через гист', () => {
  it('создаёт гист, переносит удаления и подтягивает чужие правки', async () => {
    const a = await addActivity(null, 'Работа');
    await logEntry(a, 0, 3_600_000);
    await logEntry(a, 7_200_000, 9_000_000);
    expect(await connect('ghp_x')).toContain('создал');
    expect(remote().entries).toHaveLength(2);

    // удалили здесь → в гисте пропало и появилось «надгробие»
    const [first] = await db.entries.orderBy('start').toArray();
    await deleteEntry(first.id);
    await syncNow();
    expect(remote().entries).toHaveLength(1);
    expect(remote().deleted[`entries:${first.id}`]).toBeGreaterThan(0);

    // другое устройство добавило запись и удалило оставшуюся
    const r = remote();
    const other = r.entries[0];
    r.entries = [{ id: 'from-laptop', activityId: a, start: 20_000_000, end: 21_000_000, source: 'manual', updatedAt: Date.now() }];
    r.deleted[`entries:${other.id}`] = Date.now() + 1;
    gist!.content = JSON.stringify(r);
    await syncNow();
    expect((await db.entries.toArray()).map((e) => e.id)).toEqual(['from-laptop']);
  });
});
