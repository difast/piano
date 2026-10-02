/**
 * Заглушка оплаты. Для подключения эквайринга Сбера реализуйте PaymentProvider
 * (создание заказа → редирект на платёжную страницу → webhook → активация Pro на бэкенде).
 */
export interface PaymentProvider {
  /** Создаёт заказ и возвращает URL платёжной страницы. */
  createCheckout(plan: PlanId, userEmail: string): Promise<{ url: string }>;
}

export type PlanId = 'pro-month' | 'pro-year';

export const PLANS: { id: PlanId; title: string; price: string; note?: string }[] = [
  { id: 'pro-month', title: 'Pro на месяц', price: '— ₽' },
  { id: 'pro-year', title: 'Pro на год', price: '— ₽', note: 'выгоднее' },
];

export const billing: PaymentProvider = {
  async createCheckout() {
    throw new Error('Оплата пока недоступна. Скоро подключим эквайринг Сбера.');
  },
};
