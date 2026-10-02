/**
 * Абстракция хранилища. Сейчас — localStorage, позже можно заменить на API,
 * не меняя остальной код.
 */
export interface KeyValueStore {
  get<T>(key: string, fallback: T): T;
  set<T>(key: string, value: T): void;
}

export const localStore: KeyValueStore = {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  },
  set<T>(key: string, value: T) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* private mode / quota — игнорируем */
    }
  },
};
