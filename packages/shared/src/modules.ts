// ─── Business modules ────────────────────────────────────────────────────────
// What a business sees and uses is driven by the modules switched on for it. The
// core (dashboard, catalogue, sales, expenses, analytics, clients, export, team) is
// always there; everything below can be turned on or off per business. Choosing a
// sector pre-selects the modules that sector needs (SECTOR_PRESETS) — the owner can
// still change them afterwards.

export const BUSINESS_MODULES = [
  { key: 'stock',        label: 'Suivi de stock',          description: 'Quantités, alertes de stock bas, mouvements et stock par lieu. Désactivé, le catalogue sert à vendre des services.', available: true },
  { key: 'online_store', label: 'Boutique en ligne',       description: 'Une page publique où vos clients commandent eux-mêmes.', available: true },
  { key: 'whatsapp',     label: 'WhatsApp CRM & IA',       description: 'Inbox, agent IA, base de connaissance, automatisations et campagnes.', available: true },
  { key: 'logistics',    label: 'Livraison',               description: 'Commandes à livrer, partenaires et livreurs par ville, paiement à la livraison.', available: true },
  { key: 'goals',        label: 'Objectifs & budget',      description: 'Objectifs de vente, budget prévisionnel et comparaison avec le réalisé.', available: true },
  { key: 'fundraising',  label: 'Levée de fonds',          description: 'Campagnes de financement et portail investisseurs.', available: true },
  { key: 'variants',     label: 'Variantes',               description: 'Taille, couleur, contenance… chacune avec son stock et son prix.', available: false },
  { key: 'agenda',       label: 'Agenda & réservations',   description: 'Créneaux, rendez-vous et rappels — l\'IA WhatsApp réserve pour vous.', available: false },
  { key: 'credit',       label: 'Créances & échéances',    description: 'Crédit client, paiements en plusieurs tranches et relances.', available: false },
  { key: 'invoices',     label: 'Devis & factures',        description: 'Devis et factures PDF, prix dégressifs par quantité.', available: false },
  { key: 'lots',         label: 'Lots & péremption',       description: 'Numéros de lot, dates d\'expiration et alertes avant péremption.', available: false },
  { key: 'recipes',      label: 'Recettes',                description: 'Un plat consomme ses ingrédients dans le stock.', available: false },
] as const;

export type BusinessModuleKey = typeof BUSINESS_MODULES[number]['key'];

export const AVAILABLE_MODULE_KEYS: BusinessModuleKey[] =
  BUSINESS_MODULES.filter(m => m.available).map(m => m.key);

export const ALL_MODULE_KEYS: BusinessModuleKey[] = BUSINESS_MODULES.map(m => m.key);

export const BUSINESS_SECTORS = [
  { label: 'Commerce général',     emoji: '🏪' },
  { label: 'Commerce de gros',     emoji: '📦' },
  { label: 'Alimentation',         emoji: '🛒' },
  { label: 'Mode & Vêtements',     emoji: '👗' },
  { label: 'Électronique',         emoji: '📱' },
  { label: 'Beauté & Cosmétiques', emoji: '💄' },
  { label: 'Santé & Pharmacie',    emoji: '💊' },
  { label: 'Immobilier',           emoji: '🏠' },
  { label: 'Transport',            emoji: '🚗' },
  { label: 'Agriculture',          emoji: '🌾' },
  { label: 'Services',             emoji: '🔧' },
  { label: 'Restauration',         emoji: '🍽️' },
  { label: 'Éducation',            emoji: '📚' },
  { label: 'Autre',                emoji: '✨' },
] as const;

// Modules not yet built are listed too: a salon created today already has 'agenda'
// recorded, so it lights up for them the day the module ships.
const COMMERCE: BusinessModuleKey[] = ['stock', 'online_store', 'whatsapp', 'logistics', 'goals', 'fundraising'];

export const SECTOR_PRESETS: Record<string, BusinessModuleKey[]> = {
  'Commerce général':     [...COMMERCE, 'variants'],
  'Commerce de gros':     ['stock', 'whatsapp', 'logistics', 'goals', 'fundraising', 'variants', 'invoices', 'credit'],
  'Alimentation':         [...COMMERCE, 'variants', 'lots'],
  'Mode & Vêtements':     [...COMMERCE, 'variants'],
  'Électronique':         [...COMMERCE, 'variants'],
  'Beauté & Cosmétiques': [...COMMERCE, 'variants', 'lots'],
  'Santé & Pharmacie':    ['stock', 'whatsapp', 'logistics', 'goals', 'fundraising', 'lots', 'agenda'],
  'Immobilier':           ['whatsapp', 'goals', 'fundraising', 'agenda', 'credit'],
  'Transport':            ['whatsapp', 'goals', 'fundraising', 'agenda', 'credit'],
  'Agriculture':          ['stock', 'whatsapp', 'logistics', 'goals', 'fundraising', 'variants', 'lots'],
  'Services':             ['whatsapp', 'goals', 'fundraising', 'agenda', 'credit', 'invoices'],
  'Restauration':         ['stock', 'whatsapp', 'logistics', 'goals', 'fundraising', 'recipes', 'agenda'],
  'Éducation':            ['whatsapp', 'goals', 'fundraising', 'agenda', 'credit'],
};

/** Modules a new business in this sector starts with. Unknown/empty sector → every available module (the historical behaviour). */
export function presetModulesForSector(sector: string | null | undefined): BusinessModuleKey[] {
  return [...(SECTOR_PRESETS[sector ?? ''] ?? AVAILABLE_MODULE_KEYS)];
}

/**
 * The modules actually in effect for a business. A business with no module list
 * predates this feature and keeps everything it always had.
 */
export function effectiveModules(modules: readonly string[] | null | undefined): Set<BusinessModuleKey> {
  if (!modules || modules.length === 0) return new Set(AVAILABLE_MODULE_KEYS);
  return new Set(modules.filter((m): m is BusinessModuleKey => (ALL_MODULE_KEYS as string[]).includes(m)));
}

export function hasModule(modules: readonly string[] | null | undefined, key: BusinessModuleKey): boolean {
  return effectiveModules(modules).has(key);
}
