import { useEffect, useState } from 'react';

/** Текущее время, обновляемое каждые `stepMs` (по умолчанию раз в секунду). */
export function useNow(stepMs = 1000): number {
  const [now, setNow] = useState(Date.now);
  // useEffect ≈ OnEnable/OnDisable: функция, которую он возвращает, — «отписка».
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), stepMs);
    return () => clearInterval(id);
  }, [stepMs]);
  return now;
}
