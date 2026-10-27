// ─── Customer segments ───────────────────────────────────────────────────────
// Who KZA serves, what hurts them and what KZA does about it. One source of truth
// for the sign-up wizard (which modules to switch on, which problems we solve),
// and later the vocabulary, dashboards and landing pages.
//
// A business stores its segment key in `businesses.sector`. Businesses created
// before segments existed keep their old sector label (see LEGACY_SECTOR_SEGMENT).

import {
  BUSINESS_MODULES, AVAILABLE_MODULE_KEYS, ALL_MODULE_KEYS, presetModulesForSector,
  type BusinessModuleKey,
} from './modules';

/** KZA's promise, whatever the segment. */
export const VALUE_PILLARS = [
  { title: 'Maîtriser son activité',          text: 'Stocks, ventes, dépenses, clients, créances et bénéfices au même endroit.' },
  { title: 'Vendre davantage',                text: 'Une boutique en ligne, des commandes et les demandes WhatsApp gérées au même endroit.' },
  { title: 'Gagner du temps grâce à l\'IA',   text: 'Réponses aux questions répétitives, présentation des produits, commandes et rendez-vous.' },
  { title: 'Prendre de meilleures décisions', text: 'Marges, performances, dépenses, trésorerie et opportunités de croissance.' },
] as const;

export const SEGMENT_FAMILIES = [
  { key: 'commerce',   label: 'Je vends des produits',       emoji: '🛍️', hint: 'Boutique, marché, gros, réseaux sociaux' },
  { key: 'services',   label: 'Je vends des services',       emoji: '🛠️', hint: 'Salon, réparation, agence, prestations' },
  { key: 'production', label: 'Je fabrique ou je cuisine',   emoji: '🍞', hint: 'Production, restaurant, agriculture' },
  { key: 'network',    label: 'Entreprise structurée',       emoji: '🏢', hint: 'Plusieurs sites, livraison, B2B' },
] as const;

export type SegmentFamilyKey = typeof SEGMENT_FAMILIES[number]['key'];

// What answers a problem: an always-on part of KZA, a module, or something not built yet.
const CORE_FEATURES = {
  catalogue:  'Catalogue',
  sales:      'Ventes',
  expenses:   'Dépenses',
  analytics:  'Analyses & marges',
  clients:    'Fichier clients',
  team:       'Équipe & permissions',
  businesses: 'Plusieurs entreprises',
  simple:     'Simple, gratuit pour démarrer',
} as const;

const PLANNED_FEATURES = {
  interventions: 'Suivi des interventions',
  purchases:     'Achats & fournisseurs',
  transfers:     'Transferts de stock',
  b2b_pricing:   'Tarifs par client',
} as const;

export type SolutionKey = BusinessModuleKey | keyof typeof CORE_FEATURES | keyof typeof PLANNED_FEATURES;

export interface SegmentProblem {
  text: string;
  /** The part of KZA that solves it. */
  solvedBy: SolutionKey;
}

export interface Segment {
  key: string;
  family: SegmentFamilyKey;
  label: string;
  emoji: string;
  examples: string;
  problems: SegmentProblem[];
  /** What KZA brings them, in one sentence. */
  value: string;
  /** Modules switched on at sign-up (before the "how do you work" answers adjust them). */
  modules: BusinessModuleKey[];
}

export const SEGMENTS: Segment[] = [
  // ── A. Commerce de produits physiques ──────────────────────────────────────
  {
    key: 'retail', family: 'commerce', label: 'Boutique de détail', emoji: '🏪',
    examples: 'Vêtements, chaussures, cosmétiques, téléphones, électronique, alimentation, articles ménagers',
    problems: [
      { text: 'Je ne sais pas exactement combien de produits il me reste.',          solvedBy: 'stock' },
      { text: 'Mes ventes et dépenses sont dans des cahiers ou plusieurs fichiers.', solvedBy: 'sales' },
      { text: 'J\'ai du mal à calculer mon bénéfice réel.',                          solvedBy: 'analytics' },
      { text: 'J\'oublie des créances ou je suis mal les paiements.',                solvedBy: 'credit' },
      { text: 'Je ne sais pas quels produits se vendent le mieux.',                  solvedBy: 'analytics' },
      { text: 'Je perds du temps à répondre aux mêmes questions sur WhatsApp.',      solvedBy: 'whatsapp' },
    ],
    value: 'Stock, ventes, dépenses et marges suivis au quotidien, un catalogue en ligne et une IA qui répond à vos clients sur WhatsApp.',
    modules: ['stock', 'variants', 'whatsapp', 'online_store', 'credit', 'goals'],
  },
  {
    key: 'wholesale', family: 'commerce', label: 'Grossiste ou distributeur', emoji: '📦',
    examples: 'Importateurs, distributeurs de marques, semi-grossistes, fournisseurs de détaillants',
    problems: [
      { text: 'Je gère de grandes quantités et beaucoup de références.',       solvedBy: 'stock' },
      { text: 'Il y a des erreurs dans les commandes et les livraisons.',       solvedBy: 'logistics' },
      { text: 'Mes prix changent selon les quantités achetées.',                solvedBy: 'invoices' },
      { text: 'Mes revendeurs me doivent beaucoup d\'argent.',                  solvedBy: 'credit' },
      { text: 'Je ne connais pas ma rentabilité par client ou par produit.',    solvedBy: 'analytics' },
      { text: 'Mon stock est dispersé dans plusieurs dépôts.',                  solvedBy: 'logistics' },
    ],
    value: 'Stock par dépôt, prix dégressifs, factures, suivi des créances revendeurs et analyses par client et par produit.',
    modules: ['stock', 'variants', 'invoices', 'credit', 'logistics', 'whatsapp', 'goals'],
  },
  {
    key: 'market', family: 'commerce', label: 'Marché ou commerce de proximité', emoji: '🧺',
    examples: 'Produits frais, boutique de quartier, vendeurs ambulants, petits commerçants',
    problems: [
      { text: 'J\'ai beaucoup de petites ventes chaque jour, difficiles à suivre.',      solvedBy: 'sales' },
      { text: 'Mon argent personnel et celui du commerce se mélangent.',                 solvedBy: 'expenses' },
      { text: 'Je ne connais ni mon stock restant ni mes bénéfices.',                    solvedBy: 'stock' },
      { text: 'Je ne vois pas bien ce que me doivent mes clients et ce que je dois.',   solvedBy: 'credit' },
      { text: 'J\'ai peur qu\'un logiciel soit trop compliqué ou trop cher.',            solvedBy: 'simple' },
    ],
    value: 'Une vente enregistrée en quelques secondes depuis le téléphone, la caisse du jour, le stock et les dettes clients, à un coût adapté.',
    modules: ['stock', 'credit'],
  },
  {
    key: 'social_seller', family: 'commerce', label: 'Vente sur WhatsApp et réseaux sociaux', emoji: '📲',
    examples: 'WhatsApp, Facebook, Instagram, TikTok, boutique en ligne, avec ou sans magasin',
    problems: [
      { text: 'Mes commandes sont éparpillées entre messages privés et appels.',           solvedBy: 'whatsapp' },
      { text: 'Des prospects sont oubliés ou n\'ont jamais de réponse.',                   solvedBy: 'whatsapp' },
      { text: 'On me demande sans arrêt les prix, tailles, couleurs et caractéristiques.', solvedBy: 'online_store' },
      { text: 'Des commandes sont mal notées ou livrées avec des erreurs.',                solvedBy: 'logistics' },
      { text: 'Si je ne suis pas disponible, personne ne répond aux clients.',             solvedBy: 'whatsapp' },
    ],
    value: 'Un catalogue et une boutique en ligne, un CRM WhatsApp qui suit chaque prospect et une IA qui répond même quand vous êtes occupé.',
    modules: ['whatsapp', 'online_store', 'stock', 'variants', 'logistics'],
  },

  // ── B. Prestataires de services ────────────────────────────────────────────
  {
    key: 'beauty', family: 'services', label: 'Beauté et bien-être', emoji: '💇',
    examples: 'Coiffure, barbier, institut de beauté, maquillage, onglerie, spa',
    problems: [
      { text: 'Mes rendez-vous sont mal organisés, avec des doubles réservations.', solvedBy: 'agenda' },
      { text: 'J\'ai du mal à gérer les horaires, les prestations et leur durée.',  solvedBy: 'agenda' },
      { text: 'Mes clients oublient leurs rendez-vous.',                            solvedBy: 'agenda' },
      { text: 'Je ne connais pas mes revenus par prestation.',                      solvedBy: 'analytics' },
      { text: 'J\'ai du mal à fidéliser mes clients.',                              solvedBy: 'clients' },
    ],
    value: 'Vos prestations, un agenda sans double réservation, des rendez-vous pris par l\'IA sur WhatsApp, des rappels automatiques et le suivi de vos revenus.',
    modules: ['agenda', 'whatsapp', 'goals'],
  },
  {
    key: 'repair', family: 'services', label: 'Réparation et maintenance', emoji: '🔧',
    examples: 'Téléphones, informatique, électroménager, garage, maintenance technique',
    problems: [
      { text: 'J\'ai du mal à suivre les demandes, les clients et les travaux en cours.', solvedBy: 'interventions' },
      { text: 'Mes pièces détachées sont mal suivies.',                                   solvedBy: 'stock' },
      { text: 'Le coût de mes interventions et mes marges ne sont pas clairs.',           solvedBy: 'analytics' },
      { text: 'Mes clients se plaignent des retards et du manque d\'information.',        solvedBy: 'whatsapp' },
      { text: 'L\'historique des réparations est difficile à retrouver.',                 solvedBy: 'interventions' },
    ],
    value: 'Pièces en stock, rendez-vous, devis et factures, clients informés sur WhatsApp et marges claires. Le suivi détaillé des interventions arrive bientôt.',
    modules: ['stock', 'agenda', 'invoices', 'credit', 'whatsapp'],
  },
  {
    key: 'pro_services', family: 'services', label: 'Prestataire professionnel ou créatif', emoji: '🎨',
    examples: 'Agence de communication, photographe, designer, consultant, développeur, formateur, imprimeur',
    problems: [
      { text: 'Mes devis, factures et paiements sont difficiles à suivre.',        solvedBy: 'invoices' },
      { text: 'Mes revenus sont irréguliers et mes charges mal contrôlées.',       solvedBy: 'expenses' },
      { text: 'J\'ai du mal à suivre mes prospects et mes clients réguliers.',     solvedBy: 'whatsapp' },
      { text: 'Je ne connais pas la rentabilité de chaque prestation.',            solvedBy: 'analytics' },
    ],
    value: 'Vos services, devis et factures, suivi des paiements et des prospects, et des indicateurs pour piloter vos revenus.',
    modules: ['invoices', 'credit', 'whatsapp', 'goals', 'agenda'],
  },
  {
    key: 'home_services', family: 'services', label: 'Services à domicile ou aux entreprises', emoji: '🧹',
    examples: 'Nettoyage, installation, entretien, événementiel, services aux entreprises',
    problems: [
      { text: 'Les demandes de mes clients sont difficiles à organiser.',                 solvedBy: 'whatsapp' },
      { text: 'Je fais mes devis et factures à la main.',                                 solvedBy: 'invoices' },
      { text: 'Je suis mal mes dépenses et mes équipes.',                                 solvedBy: 'expenses' },
      { text: 'Je perds de vue les prestations à faire et les paiements attendus.',       solvedBy: 'agenda' },
    ],
    value: 'Demandes centralisées, devis et factures, agenda des prestations et suivi financier. La planification des équipes viendra ensuite.',
    modules: ['agenda', 'invoices', 'credit', 'whatsapp'],
  },

  // ── C. Production, transformation et métiers de bouche ─────────────────────
  {
    key: 'producer', family: 'production', label: 'Production et transformation', emoji: '🏭',
    examples: 'Boulangerie, pâtisserie, cosmétiques, atelier de confection, petite unité agroalimentaire',
    problems: [
      { text: 'Je suis mal mes matières premières et mes produits finis.',         solvedBy: 'stock' },
      { text: 'Je calcule mal mon coût de production.',                            solvedBy: 'recipes' },
      { text: 'Je perds des matières premières.',                                  solvedBy: 'lots' },
      { text: 'Je n\'arrive pas à relier mes achats, ma production et mes ventes.', solvedBy: 'purchases' },
      { text: 'Je ne vois pas ma marge par produit.',                              solvedBy: 'analytics' },
    ],
    value: 'Stock, ventes, dépenses et rentabilité par produit. Les recettes et le coût de revient arrivent bientôt.',
    modules: ['stock', 'recipes', 'lots', 'whatsapp', 'online_store', 'goals'],
  },
  {
    key: 'restaurant', family: 'production', label: 'Restaurant ou traiteur', emoji: '🍽️',
    examples: 'Restaurant, snack, fast-food, café, bar, traiteur, restauration collective',
    problems: [
      { text: 'Je gaspille et je perds des produits périssables.',      solvedBy: 'lots' },
      { text: 'J\'ai du mal à maîtriser le coût des ingrédients.',      solvedBy: 'recipes' },
      { text: 'Commandes et livraisons sont mal coordonnées.',          solvedBy: 'logistics' },
      { text: 'Je ne connais pas la marge de chaque plat.',             solvedBy: 'recipes' },
      { text: 'Je tombe en rupture pendant le service.',                solvedBy: 'stock' },
    ],
    value: 'Ventes, commandes, livraisons, stock et dépenses suivis. Les recettes et les dates de péremption arrivent bientôt.',
    modules: ['stock', 'recipes', 'lots', 'logistics', 'whatsapp', 'agenda'],
  },
  {
    key: 'agriculture', family: 'production', label: 'Agriculture et commerce agricole', emoji: '🌾',
    examples: 'Producteurs, collecteurs, coopératives, céréales, intrants agricoles',
    problems: [
      { text: 'Les prix varient et mes marges sont difficiles à suivre.',            solvedBy: 'analytics' },
      { text: 'J\'ai des pertes, des produits abîmés et des écarts de quantité.',    solvedBy: 'stock' },
      { text: 'Je n\'arrive pas à tracer mes achats et mes ventes.',                 solvedBy: 'lots' },
      { text: 'J\'ai plusieurs lieux de stockage et des clients professionnels.',    solvedBy: 'logistics' },
    ],
    value: 'Stock par lieu de stockage, ventes, clients et marges. Le suivi par lot et par récolte arrive bientôt.',
    modules: ['stock', 'lots', 'logistics', 'credit', 'invoices', 'whatsapp'],
  },

  // ── D. PME structurées et opérations multi-sites ───────────────────────────
  {
    key: 'multi_site', family: 'network', label: 'Plusieurs magasins ou dépôts', emoji: '🏬',
    examples: 'Chaîne de boutiques, enseigne locale, succursales, dépôts',
    problems: [
      { text: 'Je n\'ai pas de vue d\'ensemble sur mes différents sites.',                solvedBy: 'businesses' },
      { text: 'Il y a des écarts de stock entre les sites.',                              solvedBy: 'logistics' },
      { text: 'Je n\'arrive pas à comparer mes équipes et mes points de vente.',         solvedBy: 'analytics' },
      { text: 'Je contrôle mal qui voit les chiffres financiers.',                        solvedBy: 'team' },
      { text: 'Les transferts de stock entre sites sont difficiles à suivre.',            solvedBy: 'transfers' },
    ],
    value: 'Plusieurs espaces de travail, stock par emplacement, équipe et permissions, et analyses par point de vente.',
    modules: ['stock', 'logistics', 'goals', 'whatsapp', 'credit', 'invoices'],
  },
  {
    key: 'delivery', family: 'network', label: 'Livraison et logistique', emoji: '🛵',
    examples: 'Livreurs indépendants, petite société de transport, livraison du dernier kilomètre',
    problems: [
      { text: 'J\'ai du mal à attribuer les commandes aux livreurs.',                        solvedBy: 'logistics' },
      { text: 'Je ne vois pas où en sont les livraisons.',                                    solvedBy: 'logistics' },
      { text: 'Retours, paiements à la livraison et incidents sont difficiles à gérer.',     solvedBy: 'logistics' },
      { text: 'Vendeurs, clients et transporteurs se coordonnent mal.',                       solvedBy: 'whatsapp' },
    ],
    value: 'Commandes, portail partenaire avec les statuts de livraison et paiements à la livraison suivis.',
    modules: ['logistics', 'whatsapp'],
  },
  {
    key: 'b2b', family: 'network', label: 'Vente aux entreprises (B2B)', emoji: '🤝',
    examples: 'Fournitures de bureau, matériel informatique, équipements, produits professionnels',
    problems: [
      { text: 'Ma prospection et mes relances ne sont pas organisées.',       solvedBy: 'whatsapp' },
      { text: 'Mes devis et commandes sont complexes.',                       solvedBy: 'invoices' },
      { text: 'Mes conditions commerciales changent selon les clients.',      solvedBy: 'b2b_pricing' },
      { text: 'Mes clients paient en retard.',                                solvedBy: 'credit' },
      { text: 'Je vois mal les performances de mes commerciaux.',             solvedBy: 'analytics' },
    ],
    value: 'Historique clients, catalogue et tarifs, devis et factures, suivi des créances et rapports commerciaux.',
    modules: ['invoices', 'credit', 'stock', 'whatsapp', 'goals'],
  },
];

/** For activities that fit no segment: everything that exists, nothing hidden. */
export const OTHER_SEGMENT_KEY = 'other';

// ─── How they work — adjusts the segment's modules ──────────────────────────

export const SALES_CHANNELS = [
  { key: 'shop',   label: 'En magasin ou au marché',          adds: [] },
  { key: 'social', label: 'Sur WhatsApp et les réseaux',      adds: ['whatsapp'] },
  { key: 'online', label: 'Sur une boutique en ligne',        adds: ['online_store', 'logistics'] },
  { key: 'b2b',    label: 'À d\'autres entreprises',          adds: ['invoices', 'credit'] },
] as const satisfies readonly { key: string; label: string; adds: readonly BusinessModuleKey[] }[];

export const ORG_SIZES = [
  { key: 'solo',  label: 'Je travaille seul',              adds: [] },
  { key: 'team',  label: 'Avec une petite équipe',         adds: [] },
  { key: 'multi', label: 'Plusieurs points de vente',      adds: ['logistics', 'goals'] },
] as const satisfies readonly { key: string; label: string; adds: readonly BusinessModuleKey[] }[];

export type SalesChannelKey = typeof SALES_CHANNELS[number]['key'];
export type OrgSizeKey = typeof ORG_SIZES[number]['key'];

export interface WorkProfile {
  channels: SalesChannelKey[];
  org: OrgSizeKey | null;
  /** null = not answered: keep what the segment suggests. */
  sellsOnCredit: boolean | null;
}

export function segmentByKey(key: string | null | undefined): Segment | undefined {
  return SEGMENTS.find(s => s.key === key);
}

/** Modules to start with, from the segment and the way the business works. */
export function modulesForProfile(segmentKey: string | null | undefined, work?: WorkProfile): BusinessModuleKey[] {
  const segment = segmentByKey(segmentKey);
  if (!segment) return [...AVAILABLE_MODULE_KEYS];
  const set = new Set<BusinessModuleKey>(segment.modules);
  for (const c of work?.channels ?? []) SALES_CHANNELS.find(x => x.key === c)?.adds.forEach(m => set.add(m));
  ORG_SIZES.find(x => x.key === work?.org)?.adds.forEach(m => set.add(m));
  if (work?.sellsOnCredit === true) set.add('credit');
  if (work?.sellsOnCredit === false) set.delete('credit');
  return ALL_MODULE_KEYS.filter(m => set.has(m));
}

/** Modules for a new business when the client sent none: segment key or legacy sector label. */
export function defaultModulesFor(sector: string | null | undefined): BusinessModuleKey[] {
  return segmentByKey(sector) ? modulesForProfile(sector) : presetModulesForSector(sector);
}

// ─── Solutions ───────────────────────────────────────────────────────────────

export type SolutionStatus = 'on' | 'off' | 'soon';

export function solutionLabel(key: SolutionKey): string {
  return (CORE_FEATURES as Record<string, string>)[key]
    ?? (PLANNED_FEATURES as Record<string, string>)[key]
    ?? BUSINESS_MODULES.find(m => m.key === key)?.label
    ?? key;
}

/** Whether this business, with these modules, has what solves the problem. */
export function solutionStatus(key: SolutionKey, modules: readonly string[]): SolutionStatus {
  if (key in CORE_FEATURES) return 'on';
  const mod = BUSINESS_MODULES.find(m => m.key === key);
  if (!mod || !mod.available) return 'soon';
  return modules.includes(key) ? 'on' : 'off';
}

// ─── Businesses created before segments ─────────────────────────────────────

/** Old sector labels that map cleanly onto a segment. The others stay as they are. */
const LEGACY_SECTOR_SEGMENT: Record<string, string> = {
  'Commerce général':  'retail',
  'Commerce de gros':  'wholesale',
  'Alimentation':      'retail',
  'Mode & Vêtements':  'retail',
  'Électronique':      'retail',
  'Restauration':      'restaurant',
  'Agriculture':       'agriculture',
};

export function segmentForSector(sector: string | null | undefined): Segment | undefined {
  return segmentByKey(sector) ?? segmentByKey(LEGACY_SECTOR_SEGMENT[sector ?? '']);
}

/** Human label for whatever is stored in `sector` (segment key, legacy label or 'other'). */
export function sectorLabel(sector: string | null | undefined): string {
  if (!sector) return '';
  if (sector === OTHER_SEGMENT_KEY) return 'Autre activité';
  return segmentByKey(sector)?.label ?? sector;
}

// ─── How the app speaks and what it shows first, per segment ────────────────

export interface SegmentTerms {
  /** Menu label and page title of the catalogue (/stock). */
  catalogue: string;
  item: string;
  items: string;
  /** For agreement: "votre première prestation". */
  feminine?: boolean;
}

export type FirstStepCheck = 'products' | 'sales' | 'expenses';

export interface FirstStep {
  label: string;
  to: string;
  /** Hidden when this module is off. */
  module?: BusinessModuleKey;
  /** Ticked automatically once the business has data of this kind; otherwise once visited. */
  doneWhen?: FirstStepCheck;
}

export interface SegmentExperience {
  terms: SegmentTerms;
  /** Routes listed right after the dashboard in the menu, in this order. */
  navFirst: string[];
  firstSteps: FirstStep[];
}

const PRODUCT_TERMS: SegmentTerms = { catalogue: 'Stock',       item: 'produit',    items: 'produits' };
const SERVICE_TERMS: SegmentTerms = { catalogue: 'Prestations', item: 'prestation', items: 'prestations', feminine: true };
const OFFER_TERMS:   SegmentTerms = { catalogue: 'Services',    item: 'service',    items: 'services' };

const step = {
  products:  (label = 'Ajouter vos produits'):            FirstStep => ({ label, to: '/stock',         doneWhen: 'products' }),
  sale:      (label = 'Enregistrer une première vente'):  FirstStep => ({ label, to: '/ventes',        doneWhen: 'sales' }),
  expense:   (label = 'Noter une dépense'):               FirstStep => ({ label, to: '/depenses',      doneWhen: 'expenses' }),
  whatsapp:  (label = 'Connecter votre WhatsApp'):        FirstStep => ({ label, to: '/whatsapp',      module: 'whatsapp' }),
  kb:        (label = 'Apprendre vos réponses à l\'IA'):  FirstStep => ({ label, to: '/whatsapp/base', module: 'whatsapp' }),
  store:     (label = 'Ouvrir votre boutique en ligne'):  FirstStep => ({ label, to: '/boutique',      module: 'online_store' }),
  agenda:    (label = 'Définir vos horaires'):            FirstStep => ({ label, to: '/agenda',        module: 'agenda' }),
  logistics: (label = 'Ajouter vos dépôts et livreurs'):  FirstStep => ({ label, to: '/logistique',    module: 'logistics' }),
  team:      (label = 'Inviter votre équipe'):            FirstStep => ({ label, to: '/equipe' }),
  quote:     (label = 'Créer votre premier devis'):       FirstStep => ({ label, to: '/factures',      module: 'invoices' }),
  credit:    (label = 'Suivre ce que vos clients vous doivent'): FirstStep => ({ label, to: '/creances', module: 'credit' }),
};

const DEFAULT_EXPERIENCE: SegmentExperience = {
  terms: PRODUCT_TERMS,
  navFirst: [],
  firstSteps: [step.products(), step.sale(), step.expense(), step.whatsapp()],
};

export const SEGMENT_EXPERIENCE: Record<string, SegmentExperience> = {
  retail: {
    terms: PRODUCT_TERMS,
    navFirst: ['/stock', '/ventes'],
    firstSteps: [step.products(), step.sale(), step.expense(), step.whatsapp(), step.store()],
  },
  wholesale: {
    terms: { catalogue: 'Stock', item: 'référence', items: 'références', feminine: true },
    navFirst: ['/stock', '/ventes', '/factures', '/creances', '/clients', '/logistique'],
    firstSteps: [step.products('Ajouter vos références et prix de gros'), step.logistics('Déclarer vos dépôts'), step.sale('Enregistrer une commande revendeur'), step.credit('Suivre ce que vous doivent vos revendeurs'), step.team()],
  },
  market: {
    terms: PRODUCT_TERMS,
    navFirst: ['/ventes', '/stock', '/depenses', '/creances'],
    firstSteps: [step.products('Ajouter ce que vous vendez'), step.sale('Enregistrer vos ventes du jour'), step.expense('Noter vos dépenses du jour'), step.credit('Noter qui vous doit de l\'argent')],
  },
  social_seller: {
    terms: PRODUCT_TERMS,
    navFirst: ['/whatsapp', '/ventes', '/boutique', '/stock'],
    firstSteps: [step.products('Ajouter vos produits avec photos'), step.whatsapp(), step.kb(), step.store(), step.logistics('Ajouter vos livreurs')],
  },
  beauty: {
    terms: SERVICE_TERMS,
    navFirst: ['/agenda', '/ventes', '/clients', '/whatsapp'],
    firstSteps: [step.products('Ajouter vos prestations et leur durée'), step.agenda('Définir vos horaires d\'ouverture'), step.whatsapp(), step.kb('Apprendre vos tarifs à l\'IA'), step.sale('Enregistrer une prestation')],
  },
  repair: {
    terms: { catalogue: 'Pièces & services', item: 'article', items: 'articles' },
    navFirst: ['/agenda', '/ventes', '/factures', '/stock', '/clients'],
    firstSteps: [step.products('Ajouter vos pièces et services'), step.agenda(), step.quote('Faire un devis de réparation'), step.sale('Enregistrer une réparation'), step.whatsapp()],
  },
  pro_services: {
    terms: OFFER_TERMS,
    navFirst: ['/factures', '/ventes', '/creances', '/clients', '/whatsapp'],
    firstSteps: [step.products('Ajouter vos services'), step.quote(), step.expense('Noter vos charges'), step.credit('Suivre vos paiements attendus'), step.whatsapp()],
  },
  home_services: {
    terms: OFFER_TERMS,
    navFirst: ['/agenda', '/factures', '/ventes', '/clients'],
    firstSteps: [step.products('Ajouter vos services'), step.agenda('Définir vos créneaux'), step.quote(), step.sale('Enregistrer une prestation'), step.team()],
  },
  producer: {
    terms: PRODUCT_TERMS,
    navFirst: ['/stock', '/ventes', '/depenses'],
    firstSteps: [step.products('Ajouter vos produits et matières premières'), step.expense('Noter vos achats de matières'), step.sale(), step.store()],
  },
  restaurant: {
    terms: { catalogue: 'Carte & stock', item: 'article', items: 'articles' },
    navFirst: ['/ventes', '/stock', '/depenses'],
    firstSteps: [step.products('Ajouter vos plats et ingrédients'), step.sale('Enregistrer vos ventes'), step.expense('Noter vos achats'), step.logistics('Ajouter vos livreurs'), step.whatsapp()],
  },
  agriculture: {
    terms: PRODUCT_TERMS,
    navFirst: ['/stock', '/ventes', '/logistique', '/creances'],
    firstSteps: [step.products(), step.logistics('Déclarer vos lieux de stockage'), step.expense('Noter vos achats'), step.sale()],
  },
  multi_site: {
    terms: PRODUCT_TERMS,
    navFirst: ['/logistique', '/stock', '/ventes', '/analytique'],
    firstSteps: [step.logistics('Déclarer vos points de vente et dépôts'), step.products(), step.team('Inviter vos responsables de site'), step.sale()],
  },
  delivery: {
    terms: OFFER_TERMS,
    navFirst: ['/logistique', '/whatsapp', '/ventes'],
    firstSteps: [step.logistics('Ajouter vos livreurs et zones'), step.products('Ajouter vos tarifs de livraison'), step.whatsapp(), step.team()],
  },
  b2b: {
    terms: PRODUCT_TERMS,
    navFirst: ['/clients', '/factures', '/ventes', '/creances', '/whatsapp', '/stock'],
    firstSteps: [step.products('Ajouter votre catalogue et vos tarifs'), step.quote(), step.sale('Enregistrer une commande client'), step.credit('Suivre les paiements clients'), step.team('Inviter vos commerciaux')],
  },
};

function experienceFor(sector: string | null | undefined): SegmentExperience {
  const segment = segmentForSector(sector);
  return (segment && SEGMENT_EXPERIENCE[segment.key]) || DEFAULT_EXPERIENCE;
}

/** Words for the catalogue. Without stock tracking, "Stock" becomes "Catalogue". */
export function termsFor(sector: string | null | undefined, tracksStock: boolean): SegmentTerms {
  const terms = experienceFor(sector).terms;
  return terms.catalogue === 'Stock' && !tracksStock ? { ...terms, catalogue: 'Catalogue' } : terms;
}

/** "premier produit" / "première prestation". */
export function firstItem(terms: SegmentTerms): string {
  return `${terms.feminine ? 'première' : 'premier'} ${terms.item}`;
}

/** "Tous les produits" / "Toutes les prestations". */
export function allItems(terms: SegmentTerms): string {
  return `${terms.feminine ? 'Toutes' : 'Tous'} les ${terms.items}`;
}

/** Menu items with the segment's key pages first (after the dashboard), the rest in their usual order. */
export function orderNav<T extends { to: string }>(items: T[], sector: string | null | undefined): T[] {
  const first = experienceFor(sector).navFirst;
  const rank = (to: string) => (to === '/' ? -1 : first.includes(to) ? first.indexOf(to) : first.length);
  return items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => rank(a.item.to) - rank(b.item.to) || a.i - b.i)
    .map(x => x.item);
}

/** Getting-started checklist for this business, without the steps whose module is off. */
export function firstStepsFor(sector: string | null | undefined, modules: ReadonlySet<string>): FirstStep[] {
  return experienceFor(sector).firstSteps.filter(s => !s.module || modules.has(s.module));
}
