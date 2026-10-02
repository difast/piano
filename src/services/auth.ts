import { localStore } from './storage';

export interface Profile {
  name: string;
  email: string;
  isPro: boolean;
  createdAt: string;
}

const KEY = 'piano:profile';

/** Локальная «регистрация». Заменяется на реальный бэкенд-вызов позже. */
export const auth = {
  load: (): Profile | null => localStore.get<Profile | null>(KEY, null),
  save: (p: Profile) => localStore.set(KEY, p),
  clear: () => localStore.set(KEY, null),
};
