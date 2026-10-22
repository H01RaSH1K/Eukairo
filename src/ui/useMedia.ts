import { useSyncExternalStore } from 'react';

// Ширина окна для раскладки на ПК. Меньше DESK — телефонная раскладка как есть.
export const DESK = '(min-width: 1000px)';        // ПК: «Сегодня» слева, панели справа
export const DESK_WIDE = '(min-width: 1320px)';   // широкий ПК: справа две панели сразу

/** true, пока окно подходит под media-запрос; при изменении размера окна перерисовывает. */
export function useMedia(query: string): boolean {
  // useSyncExternalStore — подписка на внешнее значение (≈ событие + геттер в C#):
  // React сам вызывает subscribe/getSnapshot и перерисовывает, когда значение меняется.
  return useSyncExternalStore(
    (onChange) => {
      const m = window.matchMedia(query);
      m.addEventListener('change', onChange);
      return () => m.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
  );
}
