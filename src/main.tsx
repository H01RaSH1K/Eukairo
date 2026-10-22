// Точка входа (≈ Program.Main).
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { platform } from './platform';
import { startStore } from './db/store';
import { installNoBounce } from './ui/noBounce';
import './ui/theme.css';
import './ui/designs.css';
import './ui/themes.css';
import './ui/habits.css';
import './ui/desk.css';
import './settings/design'; // ставит дизайн до первой отрисовки

// Внутри iframe (превью) — помечаем, CSS уберёт чужие отступы (theme.css, data-embedded).
if (window.self !== window.top) document.documentElement.dataset.embedded = '';

// Открываем базу сразу, параллельно с первой отрисовкой.
startStore();
installNoBounce();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Синхронизация через Gist: код грузим, только если она включена на этом устройстве.
try {
  if (localStorage.getItem('eukairo.sync')) void import('./db/sync').then((m) => m.startSync());
} catch { /* приватный режим — без синка */ }

// Service worker кэширует приложение для офлайна и тихо ставит обновления.
registerSW({ immediate: true });

// Просим не чистить наши данные. Не ждём ответа: на старт не влияет.
void platform.persistStorage();
