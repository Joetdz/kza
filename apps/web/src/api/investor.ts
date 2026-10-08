// Client API du portail investisseur — même structure que logisticsApi.partnerPortal
// (apps/web/src/api/logistics.ts) : fetch simple, pas de session Supabase, le jeton
// de l'investisseur voyage dans l'URL de chaque appel (comme :token pour le
// partenaire), pas dans un en-tête Authorization.
const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api';
const TOKEN_KEY = 'kza_investor_token';

export function getInvestorToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setInvestorToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearInvestorToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export interface InvestorProfile {
  id: string;
  email: string;
  name: string;
  phone: string | null;
}

export interface InvestorInvestment {
  id: string;
  amount: number;
  repaymentAmount: number;
  repaymentDueDate: string | null;
  repaidAmount: number;
  repaidAt: string | null;
  status: 'pending' | 'partially_repaid' | 'repaid';
  investedAt: string;
  campaign: {
    id: string;
    name: string;
    description: string;
    status: string;
    businessName: string | null;
  };
}

export const investorAuthApi = {
  login: (email: string, password: string): Promise<{ ok: boolean; error?: string; token?: string; investor?: InvestorProfile }> =>
    fetch(`${BASE}/investor-portal/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }).then(r => r.json()),

  me: (token: string): Promise<InvestorProfile | null> =>
    fetch(`${BASE}/investor-portal/${token}/me`).then(r => r.json()),

  changePassword: (token: string, currentPassword: string, newPassword: string): Promise<{ ok: boolean; error?: string }> =>
    fetch(`${BASE}/investor-portal/${token}/password`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword }),
    }).then(r => r.json()),
};

export const investorPortalApi = {
  getInvestments: (token: string): Promise<InvestorInvestment[] | null> =>
    fetch(`${BASE}/investor-portal/${token}/investments`).then(r => r.json()),
};
