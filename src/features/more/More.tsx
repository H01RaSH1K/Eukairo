import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { mergeBackup, readBackup, replaceWithBackup, shareBackup } from '../../db/backup';
import { settingOf, useData } from '../../db/store';
import type { Backup } from '../../domain/backup';
import { findVisualization } from '../../visualizations/registry';
import { useAppearance } from '../../settings/appearance';
import { modes, setDesign, themes, useDesign } from '../../settings/design';
import Appearance from '../appearance/Appearance';
import { viewportGap } from '../../ui/viewport';
import { Sheet } from '../../ui/Sheet';
import { plural } from '../../domain/time';
import { connect, disconnect, syncNow, useSync } from '../../db/sync';

const ENTRIES: [string, string, string] = ['запись', 'записи', 'записей'];
const ACTS: [string, string, string] = ['занятие', 'занятия', 'занятий'];

// Редактор занятий нужен редко — грузим его код только при первом открытии.
const Activities = lazy(() => import('../activities/Activities'));
const Habits = lazy(() => import('../habits/Habits'));

// Экран «Ещё»: оформление, режим таймера, занятия, бэкап, служебное.
export default function More() {
  const data = useData();
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [treeOpen, setTreeOpen] = useState(false);
  const [habitsOpen, setHabitsOpen] = useState(false);
  const [lookOpen, setLookOpen] = useState(false);
  const [restore, setRestore] = useState<{ backup?: Backup; error?: string; done?: string } | null>(null);
  const [syncOpen, setSyncOpen] = useState(false);
  const sync = useSync();
  const fileInput = useRef<HTMLInputElement>(null);
  const lastBackup = settingOf<number | null>(data, 'lastBackupAt', null);
  const backupAge = lastBackup === null ? 'не было' : ago(Date.now() - lastBackup);
  const activeCount = data.activities.filter((a) => !a.archivedAt).length;
  const look = useAppearance();
  const design = useDesign();
  // Один стиль на всё — пишем его; разные — «свой у каждого».
  const ids = new Set([look.day.vizId, look.week.vizId, look.month.vizId]);
  const lookSummary = ids.size === 1 ? findVisualization(look.day.vizId).title : 'свой у Д/Н/М';

  // useEffect(…, []) ≈ Start() в Unity: выполнится один раз после появления экрана.
  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted);
  }, []);

  const standalone = window.matchMedia('(display-mode: standalone)').matches;

  // Выбрали файл бэкапа — проверяем и показываем, что в нём, до любых изменений.
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try { setRestore({ backup: await readBackup(file) }); }
    catch (e) { setRestore({ error: e instanceof Error ? e.message : String(e) }); }
  };
  const merge = async (b: Backup) => {
    const r = await mergeBackup(b);
    setRestore({ done: `Готово: добавлено или обновлено ${r.entries} ${plural(r.entries, ENTRIES)} и ${r.activities} ${plural(r.activities, ACTS)}.` });
  };
  const replace = async (b: Backup) => {
    if (!confirm('Стереть все занятия, записи и привычки на этом телефоне и заменить их бэкапом?')) return;
    await replaceWithBackup(b);
    setRestore({ done: 'Готово: данные заменены бэкапом.' });
  };
  const demo = async () => {
    const off = sync.on ? ' Синхронизация на этом устройстве отключится, чтобы демо не попало на другие.' : '';
    if (!confirm(`Заменить все занятия, записи и привычки демо-данными (~5 недель)? Сначала лучше сохранить бэкап.${off}`)) return;
    disconnect();
    const { fillDemo } = await import('../../db/demo');
    await fillDemo();
  };

  // Оформление и занятия открываются поверх «Ещё», как экран в стеке навигации iOS.
  if (lookOpen) return <Appearance onBack={() => setLookOpen(false)} />;
  if (habitsOpen) return <Suspense fallback={null}><Habits onBack={() => setHabitsOpen(false)} /></Suspense>;
  if (treeOpen) return <Suspense fallback={null}><Activities onBack={() => setTreeOpen(false)} /></Suspense>;

  return (
    <div className="screen fit">
      <h1>Ещё</h1>

      {/* Оформление: строка-кнопка к настройкам мозаики и тут же — тема */}
      <div className="widget pad">
        <button className="row-btn look-row" onClick={() => setLookOpen(true)}>
          <span>Оформление</span>
          <span className="dim">{lookSummary} ›</span>
        </button>
        <div className="theme-swatches">
          {themes.map((t) => (
            <button key={t.id} aria-pressed={design.theme === t.id} onClick={() => setDesign({ theme: t.id })}>
              {/* образец — крошечный витраж в цветах темы: фон, пустые стёкла, свинец, акцентное стекло */}
              <svg viewBox="0 0 40 40" className="theme-sw">
                <rect width="40" height="40" fill={t.sw[0]} />
                <polygon points="2,2 24,2 18,20 2,16" fill={t.sw[1]} />
                <polygon points="24,2 38,2 38,22 18,20" fill={t.sw[3]} />
                <polygon points="2,16 18,20 22,38 2,38" fill={t.sw[3]} opacity=".55" />
                <polygon points="18,20 38,22 38,38 22,38" fill={t.sw[1]} />
                <path d="M2 16 L18 20 L24 2 M18 20 L38 22 M18 20 L22 38" stroke={t.sw[2]} strokeWidth="2.5" fill="none" strokeLinejoin="round" />
                <rect x="1" y="1" width="38" height="38" rx="7" fill="none" stroke={t.sw[2]} strokeWidth="2.5" />
              </svg>
              <span>{t.title}</span>
            </button>
          ))}
        </div>
        <label className="toggle-row">
          <span>Лента <span className="dim small">— высота по длительности</span></span>
          <input type="checkbox" checked={design.feedByDuration} onChange={(e) => setDesign({ feedByDuration: e.target.checked })} />
        </label>
      </div>

      <div className="widget pad">
        <div className="setting-title">Управление таймером</div>
        <div className="chips design-chips mode-chips">
          {modes.map((m) => (
            <button key={m.id} aria-pressed={design.mode === m.id} onClick={() => setDesign({ mode: m.id })}>{m.title}</button>
          ))}
        </div>
        <div className="setting-hint">{modes.find((m) => m.id === design.mode)!.hint}</div>
        <label className="toggle-row">
          <span>Витрина <span className="dim small">— мозаика на весь экран</span></span>
          <input type="checkbox" checked={design.showcase} onChange={(e) => setDesign({ showcase: e.target.checked })} />
        </label>
      </div>

      <div className="widget pad two-rows">
        <button className="row-btn" onClick={() => setTreeOpen(true)}>
          <span>Занятия</span>
          <span className="dim">{activeCount} ›</span>
        </button>
        <button className="row-btn" onClick={() => setHabitsOpen(true)}>
          <span>Привычки</span>
          <span className="dim">{data.habits.filter((h) => !h.archivedAt).length} ›</span>
        </button>
      </div>

      <div className="widget pad two-rows">
        <button className="row-btn" onClick={() => setSyncOpen(true)}>
          <span>Синхронизация</span>
          <span className={sync.error ? 'sync-err' : 'dim'}>{syncSummary(sync)} ›</span>
        </button>
        <div className="btn-row demo">
          <span className="card-title">Бэкап: {backupAge}</span>
          <button className="btn small primary" onClick={() => void shareBackup()}>Сохранить</button>
          <button className="btn small" onClick={() => fileInput.current?.click()}>Восстановить</button>
        </div>
        {/* Невидимый выбор файла: кнопка «Восстановить» нажимает его за нас. */}
        <input ref={fileInput} type="file" accept="application/json,.json" hidden
          onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }} />
      </div>

      <div className="widget pad small dim about">
        <div className="btn-row demo">
          <span className="card-title">{data.entries.length} {plural(data.entries.length, ENTRIES)}</span>
          <button className="btn small" onClick={() => void demo()}>Демо-данные</button>
        </div>
        Eukairo {__APP_VERSION__} · сборка {__BUILD_TIME__}<br />
        На «Домой»: {standalone ? 'да' : 'нет'} · данные защищены: {persisted === null ? '…' : persisted ? 'да' : 'нет'}<br />
        Экран {screen.height} · окно {window.innerHeight} · поправка {viewportGap()}
      </div>

      {syncOpen && <SyncSheet onClose={() => setSyncOpen(false)} />}

      {restore && (
        <Sheet title="Восстановление" onClose={() => setRestore(null)}>
          <div className="form">
            {restore.error && <div className="warn">{restore.error}</div>}
            {restore.done && <p className="center">{restore.done}</p>}
            {restore.backup && (
              <>
                <p className="center">
                  Бэкап от {new Date(restore.backup.exportedAt).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}:
                  {' '}{restore.backup.activities.length} {plural(restore.backup.activities.length, ACTS)}, {restore.backup.entries.length} {plural(restore.backup.entries.length, ENTRIES)}.
                </p>
                <button className="btn primary" onClick={() => void merge(restore.backup!)}>Объединить с текущими</button>
                <p className="dim small center">Новое добавится, совпавшее обновится до более свежей версии. Ничего не удаляется.</p>
                <button className="btn danger" onClick={() => void replace(restore.backup!)}>Заменить всё</button>
                <p className="dim small center">Для нового телефона или если данные пропали.</p>
              </>
            )}
            {!restore.backup && <button className="btn" onClick={() => setRestore(null)}>Закрыть</button>}
          </div>
        </Sheet>
      )}
    </div>
  );
}

function syncSummary(s: ReturnType<typeof useSync>): string {
  if (!s.on) return 'выкл';
  if (s.busy) return '…';
  if (s.error) return 'ошибка';
  return s.lastAt ? '✓' : 'вкл';
}

// Окно синхронизации: подключение по токену или состояние и «отключить».
function SyncSheet({ onClose }: { onClose: () => void }) {
  const s = useSync();
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const go = async () => {
    setBusy(true); setErr(null); setMsg(null);
    try { setMsg(await connect(token)); setToken(''); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const off = () => {
    if (!confirm('Отключить синхронизацию на этом устройстве? Данные здесь и в гисте останутся.')) return;
    disconnect(); setMsg(null);
  };

  return (
    <Sheet title="Синхронизация" onClose={onClose}>
      <div className="form">
        {s.on ? (
          <>
            {msg && <p className="center">{msg}</p>}
            {s.error && <div className="warn">{s.error}</div>}
            <p className="center">
              {s.busy ? 'Синхронизирую…' : s.lastAt ? `Всё совпадает с гистом · ${new Date(s.lastAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}` : 'Включена'}
            </p>
            <p className="dim small center">Сама при открытии, после правок и раз в 2 минуты. Удаления тоже переезжают; при правке одного и того же на двух устройствах побеждает более поздняя.</p>
            <button className="btn primary" disabled={s.busy} onClick={() => void syncNow()}>Синхронизировать сейчас</button>
            <button className="btn danger" onClick={off}>Отключить на этом устройстве</button>
          </>
        ) : (
          <>
            <p className="small">Данные хранятся в твоём приватном GitHub Gist. Нужен токен с одним правом — <b>gist</b>:</p>
            <ol className="small sync-steps">
              <li>Открой <a href="https://github.com/settings/tokens/new?scopes=gist&amp;description=Eukairo" target="_blank" rel="noreferrer">создание токена</a> (войди в GitHub).</li>
              <li>Срок — «No expiration», галочка стоит только у <b>gist</b>.</li>
              <li>«Generate token», скопируй <code>ghp_…</code></li>
              <li>Вставь сюда — на каждом устройстве один и тот же.</li>
            </ol>
            <input className="field" placeholder="ghp_…" value={token} autoComplete="off" autoCapitalize="off" spellCheck={false}
              onChange={(e) => setToken(e.target.value)} />
            {err && <div className="warn">{err}</div>}
            <button className="btn primary" disabled={busy || !token.trim()} onClick={() => void go()}>{busy ? 'Подключаю…' : 'Подключить'}</button>
          </>
        )}
      </div>
    </Sheet>
  );
}

/** «сегодня», «вчера», «5 дн. назад». */
function ago(ms: number): string {
  const d = Math.floor(ms / 86_400_000);
  return d <= 0 ? 'сегодня' : d === 1 ? 'вчера' : `${d} дн. назад`;
}
