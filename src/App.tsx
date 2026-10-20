import { Suspense, lazy, useState } from 'react';
import Today from './features/today/Today';

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

  return (
    <>
      <Suspense fallback={null}>
        {tab === 'today' && <Today />}
        {tab === 'timeline' && <Timeline />}
        {tab === 'stats' && <Stats />}
        {tab === 'more' && <More goToday={() => setTab('today')} />}
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
