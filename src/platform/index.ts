// Всё, что зависит от платформы, — за этим интерфейсом. Сейчас реализация
// веб-версии (web.ts); при обёртке в Capacitor появится вторая,
// а остальной код не изменится.
export interface Platform {
  haptic(): void;
  /** Просит браузер не удалять наши данные при нехватке места. */
  persistStorage(): Promise<boolean>;
}

export { platform } from './web';
