import { supabase } from '../lib/supabase';

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api';

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  const bizId = localStorage.getItem('kza_business_id') ?? '';
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(bizId ? { 'X-Business-Id': bizId } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.message ?? 'Une erreur est survenue, réessaie.');
  return body as T;
}

export type AccountKind = 'bank' | 'mobile_money' | 'cash';
export type AccountCurrency = 'USD' | 'CDF';

export interface TreasuryAccount {
  id: string;
  name: string;
  kind: AccountKind;
  /** Bank account number (or IBAN), mobile money number; optional for cash. */
  accountNumber: string | null;
  currency: AccountCurrency;
  openingBalance: number;
  openingDate: string;
  archived: boolean;
  /** Opening balance + every movement. */
  balance: number;
}

export interface TreasuryMovement {
  id: string;
  accountId: string;
  account: { name: string; currency: AccountCurrency };
  date: string;
  /** > 0 in, < 0 out. */
  amount: number;
  kind: 'manual' | 'transfer' | 'partner_payment' | 'expense';
  label: string;
  transferId: string | null;
}

export const ACCOUNT_KIND_LABELS: Record<AccountKind, string> = {
  bank: 'Banque',
  mobile_money: 'Mobile money',
  cash: 'Caisse physique',
};

/** What the number of an account of this type is, and an example. */
export const ACCOUNT_NUMBER_FIELD: Record<AccountKind, { label: string; placeholder: string; required: boolean }> = {
  bank: { label: 'Numéro de compte (ou IBAN)', placeholder: 'Ex. 00011-01234567890-12', required: true },
  mobile_money: { label: 'Numéro mobile money', placeholder: 'Ex. 0812345678', required: true },
  cash: { label: 'Référence de la caisse (facultatif)', placeholder: 'Ex. Caisse boutique Gombe', required: false },
};

export const MOVEMENT_KIND_LABELS: Record<TreasuryMovement['kind'], string> = {
  manual: 'Saisie',
  transfer: 'Virement',
  partner_payment: 'Versement partenaire',
  expense: 'Dépense',
};

/** How an account reads in a list: « M-Pesa · 0812345678 ». */
export const accountLabel = (a: Pick<TreasuryAccount, 'name' | 'accountNumber'>) =>
  a.accountNumber ? `${a.name} · ${a.accountNumber}` : a.name;

/** « 1 250 $ », « 85 000 FC ». */
export const fmtMoney = (amount: number, currency: string) =>
  `${amount.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} ${currency === 'USD' ? '$' : 'FC'}`;

const post = <T>(path: string, data: unknown) => req<T>(path, { method: 'POST', body: JSON.stringify(data) });

export const treasuryApi = {
  accounts: () => req<TreasuryAccount[]>('/treasury/accounts'),
  createAccount: (data: { name: string; kind: AccountKind; accountNumber?: string; currency: AccountCurrency; openingBalance: number; openingDate?: string }) =>
    post<TreasuryAccount>('/treasury/accounts', data),
  updateAccount: (id: string, data: Partial<Pick<TreasuryAccount, 'name' | 'kind' | 'accountNumber' | 'openingBalance' | 'openingDate' | 'archived'>>) =>
    req<TreasuryAccount>(`/treasury/accounts/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  removeAccount: (id: string) => req<{ id: string }>(`/treasury/accounts/${id}`, { method: 'DELETE' }),

  movements: (q: { accountId?: string; from?: string; to?: string } = {}) => {
    const params = new URLSearchParams(Object.entries(q).filter(([, v]) => v) as [string, string][]);
    return req<TreasuryMovement[]>(`/treasury/movements${params.size ? `?${params}` : ''}`);
  },
  addMovement: (data: { accountId: string; direction: 'in' | 'out'; amount: number; date: string; label: string }) =>
    post('/treasury/movements', data),
  transfer: (data: { fromId: string; toId: string; amount: number; amountTo?: number; date: string; label?: string }) =>
    post('/treasury/transfers', data),
  removeMovement: (id: string) => req<{ id: string }>(`/treasury/movements/${id}`, { method: 'DELETE' }),
};
