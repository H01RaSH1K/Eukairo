import type { Platform } from './index';

export const platform: Platform = {
  haptic() {
    // На iPhone Safari вибрацию не поддерживает; ?. — вызвать, только если метод есть
    // (≈ ?. в C#).
    navigator.vibrate?.(10);
  },

  async persistStorage() {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return navigator.storage.persist();
  },
};
