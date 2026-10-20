// Дерево занятий: чистые функции поверх плоского списка (parentId-ссылки).
import type { Activity } from '../db/schema';

/** Дети узла (null = корни) по порядку, без архивных. */
export function childrenOf(all: Activity[], parentId: string | null): Activity[] {
  return all
    .filter((a) => a.parentId === parentId && !a.archivedAt)
    .sort((a, b) => a.order - b.order);
}

/** Цепочка от корня до узла: [Работа, Eukairo, Код]. */
export function pathOf(all: Activity[], id: string): Activity[] {
  const byId = new Map(all.map((a) => [a.id, a]));
  const path: Activity[] = [];
  for (let a = byId.get(id); a; a = a.parentId ? byId.get(a.parentId) : undefined) path.unshift(a);
  return path;
}

export function rootOf(all: Activity[], id: string): Activity | undefined {
  return pathOf(all, id)[0];
}

/** Узел и все его потомки. */
export function subtreeIds(all: Activity[], id: string): Set<string> {
  const ids = new Set([id]);
  // Список упорядочен как попало, поэтому проходим, пока множество растёт.
  let grew = true;
  while (grew) {
    grew = false;
    for (const a of all) {
      if (a.parentId && ids.has(a.parentId) && !ids.has(a.id)) {
        ids.add(a.id);
        grew = true;
      }
    }
  }
  return ids;
}
