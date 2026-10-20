import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/schema';

// Экран «Ещё»: занятия, настройки, бэкап. Пока — служебная информация,
// чтобы проверить, что каркас работает на телефоне.
export default function More() {
  // useLiveQuery перевыполняет запрос при каждом изменении таблицы
  // (≈ подписка на ObservableCollection). Пока данные грузятся — undefined.
  const activityCount = useLiveQuery(() => db.activities.count());
  const entryCount = useLiveQuery(() => db.entries.count());
  const [persisted, setPersisted] = useState<boolean | null>(null);

  // useEffect(…, []) ≈ Start() в Unity: выполнится один раз после появления экрана.
  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted);
  }, []);

  const standalone = window.matchMedia('(display-mode: standalone)').matches;

  return (
    <div className="screen">
      <h1>Ещё</h1>
      <div className="card">
        <div className="row"><span>Версия</span><span className="dim">{__APP_VERSION__}</span></div>
        <div className="row"><span>Сборка</span><span className="dim">{__BUILD_TIME__}</span></div>
        <div className="row"><span>Запущено с экрана «Домой»</span><span className="dim">{standalone ? 'да' : 'нет'}</span></div>
        <div className="row"><span>Хранилище защищено</span><span className="dim">{persisted === null ? '…' : persisted ? 'да' : 'нет'}</span></div>
        <div className="row"><span>Занятий / записей</span><span className="dim">{activityCount ?? '…'} / {entryCount ?? '…'}</span></div>
      </div>
      <p className="dim">Здесь будут дерево занятий, выбор стиля и бэкап.</p>
    </div>
  );
}
