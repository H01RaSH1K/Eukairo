// Сборка превью для claude.ai одной командой: npm run build:preview
// Превью — это страница внутри чужого сайта, у которого свои ограничения:
//   • стили можно только встроенные — CSS вставляем прямо в страницу;
//   • системные confirm/alert там не показываются — подменяем на «да»;
//   • service worker и manifest там не работают — не подключаем;
//   • ленивые куски кода (JS) лежат рядом файлами — их список пишем в files.json.
// Результат: preview/index.html, preview/assets/*.js, preview/files.json.
import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, 'dist-preview');
const out = resolve(root, 'preview');

execSync('npx vite build --outDir dist-preview --emptyOutDir', { cwd: root, stdio: 'inherit', env: { ...process.env, BASE_PATH: './' } });

rmSync(out, { recursive: true, force: true });
mkdirSync(resolve(out, 'assets'), { recursive: true });
const assets = readdirSync(resolve(dist, 'assets'));
const css = assets.filter((f) => f.endsWith('.css')).map((f) => readFileSync(resolve(dist, 'assets', f), 'utf8')).join('\n');
const js = assets.filter((f) => f.endsWith('.js'));
for (const f of js) cpSync(resolve(dist, 'assets', f), resolve(out, 'assets', f));

// Точка входа — тот <script type="module">, что Vite вписал в свой index.html.
const entry = readFileSync(resolve(dist, 'index.html'), 'utf8').match(/<script type="module"[^>]*src="([^"]+)"/)[1];

writeFileSync(resolve(out, 'index.html'), `<title>Eukairo</title>
<meta name="theme-color" content="#111114">
<style>html,body{background:#111114;margin:0}${css}</style>
<script>
// стили ленивых кусков уже встроены выше — не даём Vite падать, когда их файл не грузится
window.addEventListener('vite:preloadError', function (e) { e.preventDefault(); });
// в превью системные диалоги не показываются — считаем, что на всё ответили «да»
window.confirm = function () { return true; }; window.alert = function () {};
</script>
<script type="module" crossorigin src="${entry}"></script>
<div id="root"></div>
`);

const files = Object.fromEntries(js.map((f) => [`assets/${f}`, resolve(out, 'assets', f)]));
writeFileSync(resolve(out, 'files.json'), JSON.stringify(files, null, 2));
rmSync(dist, { recursive: true, force: true });
console.log(`preview/index.html + ${js.length} JS → preview/files.json`);
