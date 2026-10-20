# Eukairo

Личный трекер полезного времени для iPhone. PWA: без сервера, данные хранятся только на телефоне (IndexedDB).

## Установка на iPhone

1. Открыть сайт приложения в Safari.
2. «Поделиться» → «На экран „Домой“».
3. Запускать с иконки: на весь экран, работает без сети.

Обновления приходят сами: новая версия скачивается в фоне и включается при следующем запуске.

## Разработка

Стек: React + TypeScript, Vite, vite-plugin-pwa, Dexie, Vitest.

```
npm install
npm run dev     # дев-сервер, открывается и с айфона по Wi-Fi
npm test        # тесты domain/
npm run build   # сборка в dist/
```

Каждый пуш в `main` прогоняет тесты, собирает и публикует сайт на GitHub Pages (`.github/workflows/deploy.yml`).

## Структура

```
src/
  main.tsx          точка входа
  App.tsx           нижние вкладки
  db/               схема базы, store (чтение), commands (ВСЕ записи), бэкап, демо-данные
  domain/           чистые функции про время + тесты
  visualizations/   плагины визуализации (первый — мозаика)
  features/         экраны: today, timeline, stats, more, activities (редактор занятий)
  platform/         всё платформенное (веб сейчас, Capacitor потом)
  ui/               тема и общие компоненты
```

## Авторы

Идея и продукт — [H01RaSH1K](https://github.com/H01RaSH1K). Код написан с Claude (Anthropic).
