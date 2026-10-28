// Eukairo — виджет экрана блокировки для Scriptable (https://scriptable.app).
// Этот файл не часть приложения: Eukairo только отдаёт его текстом кнопкой «Скопировать скрипт».
// Читает из приватного гиста файл eukairo-now.json (формат — src/addons/lockscreen/now.ts).
//
// Запусти скрипт в Scriptable один раз (▶): он спросит GitHub-токен и запомнит его в связке ключей.
// Потом добавь виджет Scriptable на экран блокировки и выбери в нём этот скрипт.

const FILE = 'eukairo-now.json';
const TOKEN_KEY = 'eukairo.token';
const GIST_KEY = 'eukairo.gist';
const CACHE = FileManager.local().joinPath(FileManager.local().documentsDirectory(), 'eukairo-now.json');
const REFRESH_MS = 5 * 60 * 1000; // просим iOS обновить не позже; она всё равно решает сама

// ——— данные ———

async function gh(path) {
  const req = new Request('https://api.github.com' + path);
  req.headers = { Authorization: 'Bearer ' + Keychain.get(TOKEN_KEY), Accept: 'application/vnd.github+json' };
  const json = await req.loadJSON();
  if (req.response.statusCode !== 200) throw new Error('GitHub: ' + req.response.statusCode);
  return json;
}

async function findGist() {
  const list = await gh('/gists?per_page=100');
  const g = list.find((x) => x.files && x.files[FILE]);
  if (!g) throw new Error('Не нашёл гист: включи «Экран блокировки» в Eukairo.');
  Keychain.set(GIST_KEY, g.id);
  return g.id;
}

/** Свежий файл из гиста; нет сети — последний сохранённый. */
async function load() {
  const fm = FileManager.local();
  try {
    let id = Keychain.contains(GIST_KEY) ? Keychain.get(GIST_KEY) : await findGist();
    let g;
    try { g = await gh('/gists/' + id); } catch (e) { id = await findGist(); g = await gh('/gists/' + id); }
    const text = g.files[FILE].content;
    fm.writeString(CACHE, text);
    return JSON.parse(text);
  } catch (e) {
    if (fm.fileExists(CACHE)) return JSON.parse(fm.readString(CACHE));
    throw e;
  }
}

// ——— время ———

const dayKey = (t) => {
  const d = new Date(t);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};
const startOfDay = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const clock = (t) => { const d = new Date(t); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
const duration = (ms) => {
  const min = Math.floor(ms / 60000), h = Math.floor(min / 60), m = min % 60;
  return h === 0 ? m + ' мин' : m === 0 ? h + ' ч' : h + ' ч ' + String(m).padStart(2, '0') + ' мин';
};

/** Что сейчас на самом деле: таймер на время мог уже закончиться, а день — смениться. */
function current(n, now) {
  const from = startOfDay(now);
  let done = n.day === dayKey(now) ? n.doneMs : 0;
  let run = n.run;
  if (run && run.end !== null && run.end <= now) {
    if (!run.need) done += Math.max(0, run.end - Math.max(run.start, from));
    run = null; // таймер истёк — Eukairo закроет запись при следующем открытии
  }
  // Сумма за день как «таймер, начавшийся в момент X»: тогда iOS досчитывает её сама.
  const totalFrom = run && !run.need ? Math.max(run.start, from) - done : null;
  return { run, done, totalFrom };
}

// ——— отрисовка ———

function addTimer(stack, date, size, bold) {
  const t = stack.addDate(new Date(date));
  t.applyTimerStyle();
  t.font = bold ? Font.boldMonospacedSystemFont(size) : Font.regularMonospacedSystemFont(size);
  t.minimumScaleFactor = 0.6;
  t.lineLimit = 1;
  return t;
}

function addText(stack, s, font, opacity) {
  const t = stack.addText(s);
  t.font = font;
  t.lineLimit = 1;
  t.minimumScaleFactor = 0.7;
  if (opacity) t.textOpacity = opacity;
  return t;
}

function rectangular(w, c) {
  if (c.run) {
    const r = c.run;
    addText(w, (r.icon ? r.icon + ' ' : '') + r.name, Font.boldSystemFont(15));
    const line = w.addStack();
    line.centerAlignContent();
    // таймер на время — обратный отсчёт до конца, без лимита — сколько идёт
    addTimer(line, r.end !== null ? r.end : r.start, 17, true);
    line.addSpacer(6);
    addText(line, r.end !== null ? 'до ' + clock(r.end) : 'с ' + clock(r.start), Font.systemFont(12), 0.7);
    if (c.totalFrom !== null) {
      const tot = w.addStack();
      tot.centerAlignContent();
      addText(tot, 'сегодня ', Font.systemFont(12), 0.7);
      addTimer(tot, c.totalFrom, 12, false).textOpacity = 0.7;
    } else {
      addText(w, r.path || 'нужда', Font.systemFont(12), 0.7);
    }
  } else {
    addText(w, 'Eukairo', Font.boldSystemFont(13), 0.7);
    addText(w, duration(c.done), Font.boldSystemFont(19));
    addText(w, 'полезно сегодня', Font.systemFont(12), 0.7);
  }
}

function circular(w, c) {
  w.addAccessoryWidgetBackground = true;
  w.addSpacer();
  if (c.run) {
    const r = c.run;
    const top = addText(w, r.icon || r.name.slice(0, 2), Font.systemFont(r.icon ? 16 : 13));
    top.centerAlignText();
    addTimer(w, r.end !== null ? r.end : r.start, 12, true).centerAlignText();
  } else {
    const h = Math.floor(c.done / 3600000), m = Math.floor(c.done / 60000) % 60;
    addText(w, h + ':' + String(m).padStart(2, '0'), Font.boldRoundedSystemFont(16)).centerAlignText();
    addText(w, 'сегодня', Font.systemFont(9), 0.7).centerAlignText();
  }
  w.addSpacer();
}

function inline(w, c) {
  // В строке над часами iOS показывает только один текст, поэтому без живого счётчика.
  if (c.run) {
    const r = c.run;
    w.addText((r.icon ? r.icon + ' ' : '') + r.name + (r.end !== null ? ' до ' + clock(r.end) : ' с ' + clock(r.start)));
  } else {
    w.addText('Сегодня ' + duration(c.done));
  }
}

function build(n, family) {
  const now = Date.now();
  const c = current(n, now);
  const w = new ListWidget();
  if (family === 'accessoryCircular') circular(w, c);
  else if (family === 'accessoryInline') inline(w, c);
  else rectangular(w, c);
  // Обновиться: через несколько минут, к концу таймера на время или к полуночи — что раньше.
  let next = now + REFRESH_MS;
  if (c.run && c.run.end !== null) next = Math.min(next, c.run.end + 1000);
  next = Math.min(next, startOfDay(now) + 86400000 + 1000);
  w.refreshAfterDate = new Date(next);
  return w;
}

function errorWidget(msg) {
  const w = new ListWidget();
  addText(w, 'Eukairo', Font.boldSystemFont(13));
  const t = w.addText(msg);
  t.font = Font.systemFont(11);
  t.minimumScaleFactor = 0.6;
  w.refreshAfterDate = new Date(Date.now() + REFRESH_MS);
  return w;
}

// ——— настройка при запуске из приложения ———

async function askToken() {
  const a = new Alert();
  a.title = 'Токен GitHub';
  a.message = 'В Eukairo: Ещё → Синхронизация → Экран блокировки → «Скопировать токен». Вставь сюда.';
  a.addSecureTextField('ghp_…', '');
  a.addAction('Сохранить');
  a.addCancelAction('Отмена');
  if ((await a.presentAlert()) === -1) return false;
  const token = a.textFieldValue(0).trim();
  if (!token) return false;
  Keychain.set(TOKEN_KEY, token);
  if (Keychain.contains(GIST_KEY)) Keychain.remove(GIST_KEY);
  return true;
}

async function setup() {
  if (Keychain.contains(TOKEN_KEY)) {
    const a = new Alert();
    a.title = 'Eukairo';
    a.message = 'Токен сохранён. Показать виджет или заменить токен?';
    a.addAction('Показать виджет');
    a.addAction('Заменить токен');
    a.addCancelAction('Отмена');
    const i = await a.presentAlert();
    if (i === -1) return;
    if (i === 1 && !(await askToken())) return;
  } else if (!(await askToken())) {
    return;
  }
  try {
    await build(await load(), 'accessoryRectangular').presentAccessoryRectangular();
  } catch (e) {
    const a = new Alert();
    a.title = 'Не получилось';
    a.message = String(e.message || e);
    a.addAction('OK');
    await a.presentAlert();
  }
}

// ——— запуск ———

if (config.runsInWidget) {
  let w;
  if (!Keychain.contains(TOKEN_KEY)) w = errorWidget('Открой скрипт в Scriptable и вставь токен.');
  else {
    try { w = build(await load(), config.widgetFamily); }
    catch (e) { w = errorWidget(String(e.message || e)); }
  }
  Script.setWidget(w);
} else {
  await setup();
}
Script.complete();
