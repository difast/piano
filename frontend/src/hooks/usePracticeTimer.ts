import { useEffect } from 'react';
import { useApp } from '../context/AppContext';

/**
 * Сообщает приложению, что на этой странице идёт обучение (урок, песня, пианино).
 * Сам подсчёт активного времени ведёт AppProvider: по реальному времени, только при видимой вкладке
 * и недавней активности, с отправкой на сервер.
 */
export function usePracticeTimer(enabled = true) {
  const { setLearning, user } = useApp();
  const on = enabled && !!user;
  useEffect(() => {
    if (!on) return;
    setLearning(true);
    return () => setLearning(false);
  }, [on, setLearning]);
}
