import { useCallback, useEffect, useState } from 'react';
import { api, type Score } from '../services/api';

let cache: Score[] | null = null;

/** Каталог нот (метаданные приходят с сервера: новые PDF добавляются без правок страниц). */
export function useScores() {
  const [scores, setScores] = useState<Score[] | null>(cache);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    setError('');
    api.scores().then((r) => { cache = Array.isArray(r?.scores) ? r.scores : []; setScores(cache); }).catch((e: Error) => setError(e.message));
  }, []);
  useEffect(() => { load(); }, [load]);
  return { scores, error, reload: load };
}

const COVERS = [
  'linear-gradient(135deg,#6366f1,#8b5cf6)', 'linear-gradient(135deg,#f59e0b,#ef4444)', 'linear-gradient(135deg,#10b981,#0ea5e9)',
  'linear-gradient(135deg,#ec4899,#8b5cf6)', 'linear-gradient(135deg,#1e3a8a,#312e81)', 'linear-gradient(135deg,#06b6d4,#3b82f6)',
  'linear-gradient(135deg,#be123c,#7c2d12)', 'linear-gradient(135deg,#475569,#0f172a)',
];
/** Обложка-заглушка по id (когда появятся настоящие обложки — достаточно добавить поле в каталог). */
export const coverFor = (id: string) => COVERS[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % COVERS.length];
