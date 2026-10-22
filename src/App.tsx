import { Suspense, lazy, useState } from 'react';
import { useData } from './db/store';
import Today from './features/today/Today';
import { DESK, DESK_WIDE, useMedia } from './ui/useMedia';

// «Сегодня» грузится сразу (стартовый экран), остальные вкладки — при первом открытии.
const Timeline = lazy(() => import('./features/timeline/Timeline'));
const Stats = lazy(() => import('./features/stats/Stats'));
const More = lazy(() => import('./features/more/More'));

// Строковый union вместо enum.
type Tab = 'today' | 'timeline' | 'stats' | 'more';

const tabs: { id: Tab; title: string; icon: string }[] = [
  { id: 'today', title: 'Сегодня', icon: '◼︎' },
  { id: 'timeline', title: 'Лента', icon: '☰' },
  { id: 'stats', title: 'Сводки', icon: '◔' },
  { id: 'more', title: 'Ещё', icon: '•••' },
];

// Навигация без роутера: просто состояние «какая вкладка открыта».
export default function App() {
  // useState ≈ поле, при изменении которого React перерисовывает компонент.
  const [tab, setTab] = useState<Tab>('today');
  const { ready, error } = useData();
  const desk = useMedia(DESK);

  // База открывается доли секунды — до этого рисуем пустой фон, а не пустые экраны.
  if (!ready) return null;
  if (error) {
    return (
      <div className="screen fit">
        <h1>Не открылась база</h1>
        <div className="widget pad">Safari не дал доступ к хранилищу ({error}). Если это приватный режим — открой приложение в обычном.</div>
      </div>
    );
  }

  if (desk) return <Desk />;

  return (
    <>
      <Suspense fallback={null}>
        {tab === 'today' && <Today />}
        {tab === 'timeline' && <Timeline />}
        {tab === 'stats' && <Stats />}
        {tab === 'more' && <More />}
      </Suspense>
      <nav className="tabbar">
        {tabs.map((t) => (
          <button key={t.id} aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
            <span className="icon">{t.icon}</span>
            {t.title}
          </button>
        ))}
      </nav>
    </>
  );
}

// ——— Раскладка для ПК ———
// Слева узкая панель навигации, дальше «Сегодня» на всё свободное место,
// справа — Лента и Сводки (на широком окне обе сразу, на узком — одна по выбору) или «Ещё».
// Экраны те же, что на телефоне: каждая панель — это просто телефонный экран нужной ширины.
type Side = 'timeline' | 'stats' | 'more';

function Desk() {
  const wide = useMedia(DESK_WIDE);
  const [side, setSide] = useState<Side>('timeline');
  // На широком окне Лента и Сводки видны вместе — в меню это один пункт «Обзор».
  const panes: Side[] = side === 'more' ? ['more'] : wide ? ['timeline', 'stats'] : [side];
  const items: { id: Side; title: string; icon: string }[] = wide
    ? [{ id: 'timeline', title: 'Обзор', icon: '◼︎' }, { id: 'more', title: 'Ещё', icon: '•••' }]
    : [{ id: 'timeline', title: 'Лента', icon: '☰' }, { id: 'stats', title: 'Сводки', icon: '◔' }, { id: 'more', title: 'Ещё', icon: '•••' }];
  const isOn = (id: Side) => id === side || (wide && id === 'timeline' && side === 'stats');

  return (
    <div className="desk">
      <nav className="rail">
        <img className="rail-logo" src={import.meta.env.BASE_URL + 'favicon.svg'} alt="" />
        {items.map((t) => (
          <button key={t.id} aria-current={isOn(t.id) ? 'page' : undefined} onClick={() => setSide(t.id)}>
            <span className="icon">{t.icon}</span>
            {t.title}
          </button>
        ))}
      </nav>
      <main className="pane pane-main"><Today /></main>
      <Suspense fallback={null}>
        {panes.map((p) => (
          <section key={p} className={'pane pane-side ' + p}>
            {p === 'timeline' ? <Timeline /> : p === 'stats' ? <Stats /> : <More />}
          </section>
        ))}
      </Suspense>
    </div>
  );
}
