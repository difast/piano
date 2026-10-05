/**
 * Скрытый адрес админ-кабинета: /61fjfcc28H%3618hol?g194fjfhk65789hg&fd273df5
 * (браузеры могут показать %36 как «6» — оба варианта подходят). Это лишь дополнительное сокрытие:
 * данные админки сервер отдаёт только вошедшему администратору.
 */
const ADMIN_PATH = '/61fjfcc28H618hol';
const ADMIN_QUERY = '?g194fjfhk65789hg&fd273df5';
export const ADMIN_URL = `/61fjfcc28H%3618hol${ADMIN_QUERY}`;

export function isAdminUrl(pathname: string, search: string): boolean {
  let path = pathname;
  try { path = decodeURIComponent(pathname); } catch { /* некорректная кодировка */ }
  return path.replace(/\/$/, '') === ADMIN_PATH && search === ADMIN_QUERY;
}
