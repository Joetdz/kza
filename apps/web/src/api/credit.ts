import { req } from './http';

export type PaymentMethod = 'cash' | 'mobile_money' | 'bank' | 'other';

export interface CreditPayment {
  id: string;
  amount: number;
  date: string;
  method: PaymentMethod;
  note: string | null;
}

export interface CreditInstallment {
  id: string;
  dueDate: string;
  amount: number;
  covered: number;
  settled: boolean;
}

/** One credit sale and where it stands. */
export interface Receivable {
  id: string;
  date: string;
  dueDate: string | null;
  status: 'credit' | 'paid';
  customerName: string | null;
  customerPhone: string | null;
  lastReminderAt: string | null;
  payments: CreditPayment[];
  installments: CreditInstallment[];
  total: number;
  paid: number;
  remaining: number;
  nextDue: string | null;
  nextAmount: number;
  overdueDays: number;
}

export const creditApi = {
  receivables: () => req<Receivable[]>('/credit/receivables'),
  addPayment: (saleId: string, body: { amount: number; date: string; method: PaymentMethod; note?: string }) =>
    req<Receivable>(`/credit/sales/${saleId}/payments`, { method: 'POST', body: JSON.stringify(body) }),
  removePayment: (paymentId: string) =>
    req<Receivable>(`/credit/payments/${paymentId}`, { method: 'DELETE' }),
  setSchedule: (saleId: string, body: { dueDate: string | null; installments: { dueDate: string; amount: number }[] }) =>
    req<Receivable>(`/credit/sales/${saleId}/schedule`, { method: 'PUT', body: JSON.stringify(body) }),
  remind: (saleId: string) => req<Receivable>(`/credit/sales/${saleId}/remind`, { method: 'POST' }),
};
