// Дерево занятий: чистые функции поверх плоского списка (parentId-ссылки).
import type { Activity } from '../db/schema';

/**
 * Дети узла (null = корни) по порядку. Завершённые (archivedAt) по умолчанию скрыты;
 * `withArchived` — для цветов и сводок, где прошлые проекты должны остаться.
 */
export function childrenOf(all: Activity[], parentId: string | null, withArchived = false): Activity[] {
  return all
    .filter((a) => a.parentId === parentId && (withArchived || !a.archivedAt))
    .sort((a, b) => a.order - b.order);
}

/** Узел скрыт из выбора: завершён он сам или кто-то из предков. */
export function isHidden(all: Activity[], id: string): boolean {
  const path = pathOf(all, id);
  return path.length === 0 || path.some((a) => a.archivedAt);
}

/** Нужда ли занятие: флаг на нём самом или на ком-то из предков. */
export function isNeed(all: Activity[], id: string): boolean {
  return pathOf(all, id).some((a) => a.need);
}

/** id всех занятий-нужд (с потомками) — чтобы быстро проверять записи. */
export function needIds(all: Activity[]): Set<string> {
  const ids = new Set<string>();
  for (const a of all) if (a.need) for (const x of subtreeIds(all, a.id)) ids.add(x);
  return ids;
}

/** Можно ли сделать `newParentId` родителем `id` (не в себя и не в своего потомка). */
export function canMoveTo(all: Activity[], id: string, newParentId: string | null): boolean {
  return newParentId === null || !subtreeIds(all, id).has(newParentId);
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

/**
 * Диапазон ползунка таймера в минутах: своё значение или ближайшего предка,
 * иначе 15…120. (Как forgetAfterMin — настраивается на любом уровне дерева.)
 */
export function timerRange(activities: Activity[], id: string): [number, number] {
  let min: number | undefined, max: number | undefined;
  for (const a of [...pathOf(activities, id)].reverse()) { // от узла к корню
    min ??= a.timerMinMin; // ??= ≈ «присвоить, если ещё null» (как ??= в C#)
    max ??= a.timerMaxMin;
  }
  return [min ?? 15, Math.max(max ?? 120, (min ?? 15) + 5)];
}

/** Порог «забытого таймера» в минутах: своё значение, у предка, иначе 180 (3 ч). */
export function forgetAfter(activities: Activity[], id: string): number {
  for (const a of [...pathOf(activities, id)].reverse()) if (a.forgetAfterMin) return a.forgetAfterMin;
  return 180;
}
