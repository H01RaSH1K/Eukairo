// Окно надстройки «экран блокировки»: включить/выключить и как поставить виджет Scriptable.
import { useState } from 'react';
import { Sheet } from '../../ui/Sheet';
import { syncToken } from '../../db/sync';
import { disableLockscreen, enableLockscreen, useLockscreen } from './publish';
// `?raw` — Vite отдаёт файл как строку: скрипт виджета не выполняется в приложении, только копируется.
import widgetScript from './widget.scriptable.js?raw';

const SCRIPTABLE_URL = 'https://apps.apple.com/app/scriptable/id1405459188';

export default function LockscreenSheet({ onClose }: { onClose: () => void }) {
  const s = useLockscreen();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const on = async () => {
    setBusy(true); setErr(null);
    try { await enableLockscreen(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const copy = async (what: string, text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(what); }
    catch { setErr('Не получилось скопировать.'); }
  };

  return (
    <Sheet title="Экран блокировки" onClose={onClose}>
      <div className="form">
        <p className="small">Виджет Scriptable на экране блокировки: что идёт сейчас и сколько полезного за сегодня. Счётчик тикает сам, но после старта или стопа виджет может отстать на несколько минут — iOS обновляет виджеты редко.</p>
        {s.on ? (
          <>
            {s.error && <div className="warn">{s.error}</div>}
            <ol className="small sync-steps">
              <li>Поставь <a href={SCRIPTABLE_URL} target="_blank" rel="noreferrer">Scriptable</a> (бесплатно).</li>
              <li>Скопируй скрипт, в Scriptable нажми «+», вставь, назови «Eukairo».</li>
              <li>Нажми ▶ и вставь токен (кнопка ниже).</li>
              <li>Экран блокировки: долгое нажатие → Настроить → виджеты → Scriptable. Тапни по виджету → Script: Eukairo.</li>
            </ol>
            <div className="btn-row">
              <button className="btn" onClick={() => void copy('script', widgetScript)}>{copied === 'script' ? 'Скрипт скопирован ✓' : 'Скопировать скрипт'}</button>
              <button className="btn" onClick={() => void copy('token', syncToken() ?? '')}>{copied === 'token' ? 'Токен скопирован ✓' : 'Скопировать токен'}</button>
            </div>
            <p className="dim small center">{s.lastAt ? `Отправлено в ${new Date(s.lastAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}` : 'Отправляется после каждой правки'}</p>
            <button className="btn danger" onClick={disableLockscreen}>Выключить на этом устройстве</button>
          </>
        ) : (
          <>
            <p className="dim small">Eukairo будет класть в отдельный приватный гист маленький файл «что идёт сейчас». Включай на телефоне, с которого запускаешь таймеры.</p>
            {err && <div className="warn">{err}</div>}
            <button className="btn primary" disabled={busy} onClick={() => void on()}>{busy ? 'Включаю…' : 'Включить'}</button>
          </>
        )}
        {s.on && err && <div className="warn">{err}</div>}
      </div>
    </Sheet>
  );
}
