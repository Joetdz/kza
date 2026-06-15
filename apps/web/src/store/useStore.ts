import { create } from 'zustand';
import { format, subDays } from 'date-fns';
import type { Product, Sale, Expense, SalesGoal, StockMovement } from '../types';
import { productsApi, movementsApi, salesApi, expensesApi, goalsApi, businessApi } from '../api';
import { toast } from '../hooks/useToast';

export interface BusinessRecord {
  id: string;
  name: string;
  sector?: string;
  country: string;
  currency: string;
  whatsappPhone: string;
  phone?: string;
  city?: string;
  logoUrl?: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

interface AppStore {
  // Business
  businesses: BusinessRecord[];
  currentBusinessId: string | null;
  showInUsd: boolean;

  // Data
  products: Product[];
  sales: Sale[];
  expenses: Expense[];
  goals: SalesGoal[];
  movements: StockMovement[];

  // UI
  sidebarOpen: boolean;
  dateRange: { from: string; to: string };
  cpaThreshold: number;
  loading: boolean;
  error: string | null;

  // Business actions
  loadBusinesses: () => Promise<void>;
  setCurrentBusiness: (id: string) => Promise<void>;
  toggleCurrencyDisplay: () => void;
  addBusiness: (b: Omit<BusinessRecord, 'id' | 'createdAt' | 'updatedAt'>) => Promise<BusinessRecord>;
  updateBusiness: (id: string, patch: Partial<BusinessRecord>) => Promise<void>;
  deleteBusiness: (id: string) => Promise<void>;

  // Hydration (charge toutes les données depuis l'API)
  hydrate: () => Promise<void>;

  // Product actions
  addProduct: (p: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updateProduct: (id: string, patch: Partial<Product>) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;

  // Movement
  addMovement: (m: Omit<StockMovement, 'id' | 'createdAt'>) => Promise<void>;

  // Sale actions
  addSale: (s: Omit<Sale, 'id' | 'createdAt'>) => Promise<void>;
  updateSaleStatus: (id: string, status: string) => Promise<void>;
  deleteSale: (id: string) => Promise<void>;

  // Expense actions
  addExpense: (e: Omit<Expense, 'id' | 'createdAt'>) => Promise<void>;
  updateExpense: (id: string, patch: Partial<Expense>) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;

  // Goal actions
  addGoal: (g: Omit<SalesGoal, 'id' | 'createdAt'>) => Promise<void>;
  updateGoal: (id: string, patch: Partial<SalesGoal>) => Promise<void>;
  deleteGoal: (id: string) => Promise<void>;

  // UI actions
  toggleSidebar: () => void;
  setDateRange: (from: string, to: string) => void;
  setCpaThreshold: (value: number) => void;
  clearError: () => void;

  // Auth
  reset: () => void;
}

const now = new Date();
const BИЗID_KEY = 'kza_business_id';

export const useStore = create<AppStore>()((set, get) => ({
  businesses: [],
  currentBusinessId: localStorage.getItem(BИЗID_KEY) ?? null,
  showInUsd: false,

  products: [],
  sales: [],
  expenses: [],
  goals: [],
  movements: [],

  sidebarOpen: false,
  dateRange: {
    from: format(subDays(now, 30), 'yyyy-MM-dd'),
    to: format(now, 'yyyy-MM-dd'),
  },
  cpaThreshold: 200,
  loading: false,
  error: null,

  // ─── Business ──────────────────────────────────────────────
  loadBusinesses: async () => {
    try {
      const businesses = await businessApi.getAll();
      set({ businesses });
      // Auto-select if none stored or stored one no longer valid
      const stored = localStorage.getItem(BИЗID_KEY);
      const valid = stored && businesses.some(b => b.id === stored);
      if (!valid) {
        const def = businesses.find(b => b.isDefault) ?? businesses[0];
        if (def) {
          localStorage.setItem(BИЗID_KEY, def.id);
          set({ currentBusinessId: def.id });
        } else {
          set({ currentBusinessId: null });
        }
      } else {
        set({ currentBusinessId: stored });
      }
    } catch { /* silencieux — pas de business = premier login */ }
  },

  setCurrentBusiness: async (id: string) => {
    localStorage.setItem(BИЗID_KEY, id);
    set({ currentBusinessId: id });
  },

  toggleCurrencyDisplay: () => set(s => ({ showInUsd: !s.showInUsd })),

  addBusiness: async (dto) => {
    const created = await businessApi.create(dto);
    set(s => ({
      businesses: [created, ...s.businesses],
      currentBusinessId: s.currentBusinessId ?? created.id,
    }));
    localStorage.setItem(BИЗID_KEY, get().currentBusinessId ?? created.id);
    return created;
  },

  updateBusiness: async (id, patch) => {
    const updated = await businessApi.update(id, patch);
    set(s => ({ businesses: s.businesses.map(b => b.id === id ? updated : b) }));
  },

  deleteBusiness: async (id) => {
    await businessApi.remove(id);
    set(s => {
      const businesses = s.businesses.filter(b => b.id !== id);
      let currentBusinessId = s.currentBusinessId;
      if (currentBusinessId === id) {
        currentBusinessId = businesses.find(b => b.isDefault)?.id ?? businesses[0]?.id ?? null;
        if (currentBusinessId) localStorage.setItem(BИЗID_KEY, currentBusinessId);
      }
      return { businesses, currentBusinessId };
    });
  },

  // ─── Hydration ─────────────────────────────────────────────
  hydrate: async () => {
    set({ loading: true, error: null });
    try {
      const [products, sales, expenses, goals, movements] = await Promise.all([
        productsApi.getAll(),
        salesApi.getAll(),
        expensesApi.getAll(),
        goalsApi.getAll(),
        movementsApi.getAll(),
      ]);
      set({ products, sales, expenses, goals, movements });
    } catch (e: any) {
      set({ error: e.message ?? 'Erreur de connexion à l\'API' });
    } finally {
      set({ loading: false });
    }
  },

  // ─── Products ──────────────────────────────────────────────
  addProduct: async (p) => {
    try {
      const created = await productsApi.create(p);
      set(s => ({ products: [created, ...s.products] }));
      toast.success('Produit ajouté');
    } catch { toast.error('Erreur lors de l\'ajout du produit'); throw new Error(); }
  },
  updateProduct: async (id, patch) => {
    try {
      const updated = await productsApi.update(id, patch);
      set(s => ({ products: s.products.map(p => p.id === id ? updated : p) }));
      toast.success('Produit mis à jour');
    } catch { toast.error('Erreur lors de la mise à jour'); throw new Error(); }
  },
  deleteProduct: async (id) => {
    try {
      await productsApi.remove(id);
      set(s => ({
        products: s.products.filter(p => p.id !== id),
        expenses: s.expenses.filter(e => e.productId !== id),
        goals: s.goals.filter(g => g.productId !== id),
        movements: s.movements.filter(m => m.productId !== id),
        sales: s.sales
          .map(sale => ({ ...sale, items: sale.items.filter(i => i.productId !== id) }))
          .filter(sale => sale.items.length > 0),
      }));
      toast.success('Produit supprimé');
    } catch { toast.error('Erreur lors de la suppression'); throw new Error(); }
  },

  // ─── Movements ─────────────────────────────────────────────
  addMovement: async (m) => {
    try {
      const created = await movementsApi.create(m);
      set(s => ({
        movements: [created, ...s.movements],
        products: s.products.map(p => {
          if (p.id !== m.productId) return p;
          const delta = m.type === 'in' ? m.quantity : -m.quantity;
          return { ...p, quantity: Math.max(0, p.quantity + delta) };
        }),
      }));
      toast.success(m.type === 'in' ? 'Entrée de stock enregistrée' : 'Sortie de stock enregistrée');
    } catch { toast.error('Erreur lors du mouvement de stock'); throw new Error(); }
  },

  // ─── Sales ─────────────────────────────────────────────────
  addSale: async (s) => {
    try {
      const created = await salesApi.create(s);
      set(state => {
        const update: Partial<typeof state> = { sales: [created, ...state.sales] };
        if (created.status === 'paid') {
          update.products = state.products.map(p => {
            const item = created.items.find(i => i.productId === p.id);
            if (!item) return p;
            return { ...p, quantity: Math.max(0, p.quantity - item.quantity) };
          });
          update.movements = [
            ...created.items.map(i => ({
              id: crypto.randomUUID(),
              productId: i.productId,
              type: 'out' as const,
              quantity: i.quantity,
              reason: 'Vente',
              date: created.date,
              createdAt: new Date().toISOString(),
            })),
            ...state.movements,
          ];
        }
        return update;
      });
      toast.success('Vente enregistrée');
    } catch { toast.error('Erreur lors de l\'enregistrement de la vente'); throw new Error(); }
  },
  updateSaleStatus: async (id, newStatus) => {
    try {
      const updated = await salesApi.updateStatus(id, newStatus);
      set(s => {
        const oldSale = s.sales.find(sale => sale.id === id);
        const waspaid = oldSale?.status === 'paid';
        const becomespaid = newStatus === 'paid';
        const newState: Partial<typeof s> = {
          sales: s.sales.map(sale => sale.id === id ? { ...sale, status: updated.status } : sale),
        };
        if (oldSale) {
          if (waspaid && !becomespaid) {
            newState.products = s.products.map(p => {
              const item = oldSale.items.find(i => i.productId === p.id);
              if (!item) return p;
              return { ...p, quantity: p.quantity + item.quantity };
            });
            newState.movements = [
              ...oldSale.items.map(i => ({
                id: crypto.randomUUID(),
                productId: i.productId,
                type: 'in' as const,
                quantity: i.quantity,
                reason: newStatus === 'cancelled' ? 'Retour — vente annulée' : 'Retour — vente suspendue',
                date: new Date().toISOString().split('T')[0],
                createdAt: new Date().toISOString(),
              })),
              ...s.movements,
            ];
          } else if (!waspaid && becomespaid) {
            newState.products = s.products.map(p => {
              const item = oldSale.items.find(i => i.productId === p.id);
              if (!item) return p;
              return { ...p, quantity: Math.max(0, p.quantity - item.quantity) };
            });
            newState.movements = [
              ...oldSale.items.map(i => ({
                id: crypto.randomUUID(),
                productId: i.productId,
                type: 'out' as const,
                quantity: i.quantity,
                reason: 'Vente confirmée',
                date: new Date().toISOString().split('T')[0],
                createdAt: new Date().toISOString(),
              })),
              ...s.movements,
            ];
          }
        }
        return newState;
      });
      const labels: Record<string, string> = { paid: 'Payé', pending: 'En attente', cancelled: 'Annulé' };
      toast.success(`Statut mis à jour → ${labels[newStatus] ?? newStatus}`);
    } catch { toast.error('Erreur lors du changement de statut'); throw new Error(); }
  },
  deleteSale: async (id) => {
    try {
      await salesApi.remove(id);
      set(s => {
        const sale = s.sales.find(sale => sale.id === id);
        const update: Partial<typeof s> = { sales: s.sales.filter(sale => sale.id !== id) };
        if (sale?.status === 'paid') {
          update.products = s.products.map(p => {
            const item = sale.items.find(i => i.productId === p.id);
            if (!item) return p;
            return { ...p, quantity: p.quantity + item.quantity };
          });
          update.movements = [
            ...sale.items.map(i => ({
              id: crypto.randomUUID(),
              productId: i.productId,
              type: 'in' as const,
              quantity: i.quantity,
              reason: 'Retour — vente supprimée',
              date: new Date().toISOString().split('T')[0],
              createdAt: new Date().toISOString(),
            })),
            ...s.movements,
          ];
        }
        return update;
      });
      toast.success('Vente supprimée');
    } catch { toast.error('Erreur lors de la suppression'); throw new Error(); }
  },

  // ─── Expenses ──────────────────────────────────────────────
  addExpense: async (e) => {
    try {
      const created = await expensesApi.create(e);
      set(s => ({ expenses: [created, ...s.expenses] }));
      toast.success('Dépense enregistrée');
    } catch { toast.error('Erreur lors de l\'ajout de la dépense'); throw new Error(); }
  },
  updateExpense: async (id, patch) => {
    try {
      const updated = await expensesApi.update(id, patch);
      set(s => ({ expenses: s.expenses.map(e => e.id === id ? updated : e) }));
      toast.success('Dépense mise à jour');
    } catch { toast.error('Erreur lors de la mise à jour'); throw new Error(); }
  },
  deleteExpense: async (id) => {
    try {
      await expensesApi.remove(id);
      set(s => ({ expenses: s.expenses.filter(e => e.id !== id) }));
      toast.success('Dépense supprimée');
    } catch { toast.error('Erreur lors de la suppression'); throw new Error(); }
  },

  // ─── Goals ─────────────────────────────────────────────────
  addGoal: async (g) => {
    try {
      const created = await goalsApi.create(g);
      set(s => ({ goals: [created, ...s.goals] }));
      toast.success('Objectif créé');
    } catch { toast.error('Erreur lors de la création'); throw new Error(); }
  },
  updateGoal: async (id, patch) => {
    try {
      const updated = await goalsApi.update(id, patch);
      set(s => ({ goals: s.goals.map(g => g.id === id ? updated : g) }));
      toast.success('Objectif mis à jour');
    } catch { toast.error('Erreur lors de la mise à jour'); throw new Error(); }
  },
  deleteGoal: async (id) => {
    try {
      await goalsApi.remove(id);
      set(s => ({ goals: s.goals.filter(g => g.id !== id) }));
      toast.success('Objectif supprimé');
    } catch { toast.error('Erreur lors de la suppression'); throw new Error(); }
  },

  // ─── UI ────────────────────────────────────────────────────
  toggleSidebar: () => set(s => ({ sidebarOpen: !s.sidebarOpen })),
  setDateRange: (from, to) => set({ dateRange: { from, to } }),
  setCpaThreshold: (value) => set({ cpaThreshold: value }),
  clearError: () => set({ error: null }),

  reset: () => set({
    products: [],
    sales: [],
    expenses: [],
    goals: [],
    movements: [],
    loading: false,
    error: null,
  }),
}));
