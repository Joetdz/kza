import { type BusinessModuleKey } from './modules';
/** KZA's promise, whatever the segment. */
export declare const VALUE_PILLARS: readonly [{
    readonly title: "Maîtriser son activité";
    readonly text: "Stocks, ventes, dépenses, clients, créances et bénéfices au même endroit.";
}, {
    readonly title: "Vendre davantage";
    readonly text: "Une boutique en ligne, des commandes et les demandes WhatsApp gérées au même endroit.";
}, {
    readonly title: "Gagner du temps grâce à l'IA";
    readonly text: "Réponses aux questions répétitives, présentation des produits, commandes et rendez-vous.";
}, {
    readonly title: "Prendre de meilleures décisions";
    readonly text: "Marges, performances, dépenses, trésorerie et opportunités de croissance.";
}];
export declare const SEGMENT_FAMILIES: readonly [{
    readonly key: "commerce";
    readonly label: "Je vends des produits";
    readonly emoji: "🛍️";
    readonly hint: "Boutique, marché, gros, réseaux sociaux";
}, {
    readonly key: "services";
    readonly label: "Je vends des services";
    readonly emoji: "🛠️";
    readonly hint: "Salon, réparation, agence, prestations";
}, {
    readonly key: "production";
    readonly label: "Je fabrique ou je cuisine";
    readonly emoji: "🍞";
    readonly hint: "Production, restaurant, agriculture";
}, {
    readonly key: "network";
    readonly label: "Entreprise structurée";
    readonly emoji: "🏢";
    readonly hint: "Plusieurs sites, livraison, B2B";
}];
export type SegmentFamilyKey = typeof SEGMENT_FAMILIES[number]['key'];
declare const CORE_FEATURES: {
    readonly catalogue: "Catalogue";
    readonly sales: "Ventes";
    readonly expenses: "Dépenses";
    readonly analytics: "Analyses & marges";
    readonly clients: "Fichier clients";
    readonly team: "Équipe & permissions";
    readonly businesses: "Plusieurs entreprises";
    readonly simple: "Simple, gratuit pour démarrer";
};
declare const PLANNED_FEATURES: {
    readonly interventions: "Suivi des interventions";
    readonly purchases: "Achats & fournisseurs";
    readonly transfers: "Transferts de stock";
    readonly b2b_pricing: "Tarifs par client";
};
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
export declare const SEGMENTS: Segment[];
/** For activities that fit no segment: everything that exists, nothing hidden. */
export declare const OTHER_SEGMENT_KEY = "other";
export declare const SALES_CHANNELS: readonly [{
    readonly key: "shop";
    readonly label: "En magasin ou au marché";
    readonly adds: readonly [];
}, {
    readonly key: "social";
    readonly label: "Sur WhatsApp et les réseaux";
    readonly adds: readonly ["whatsapp"];
}, {
    readonly key: "online";
    readonly label: "Sur une boutique en ligne";
    readonly adds: readonly ["online_store", "logistics"];
}, {
    readonly key: "b2b";
    readonly label: "À d'autres entreprises";
    readonly adds: readonly ["invoices", "credit"];
}];
export declare const ORG_SIZES: readonly [{
    readonly key: "solo";
    readonly label: "Je travaille seul";
    readonly adds: readonly [];
}, {
    readonly key: "team";
    readonly label: "Avec une petite équipe";
    readonly adds: readonly [];
}, {
    readonly key: "multi";
    readonly label: "Plusieurs points de vente";
    readonly adds: readonly ["logistics", "goals"];
}];
export type SalesChannelKey = typeof SALES_CHANNELS[number]['key'];
export type OrgSizeKey = typeof ORG_SIZES[number]['key'];
export interface WorkProfile {
    channels: SalesChannelKey[];
    org: OrgSizeKey | null;
    /** null = not answered: keep what the segment suggests. */
    sellsOnCredit: boolean | null;
}
export declare function segmentByKey(key: string | null | undefined): Segment | undefined;
/** Modules to start with, from the segment and the way the business works. */
export declare function modulesForProfile(segmentKey: string | null | undefined, work?: WorkProfile): BusinessModuleKey[];
/** Modules for a new business when the client sent none: segment key or legacy sector label. */
export declare function defaultModulesFor(sector: string | null | undefined): BusinessModuleKey[];
export type SolutionStatus = 'on' | 'off' | 'soon';
export declare function solutionLabel(key: SolutionKey): string;
/** Whether this business, with these modules, has what solves the problem. */
export declare function solutionStatus(key: SolutionKey, modules: readonly string[]): SolutionStatus;
export declare function segmentForSector(sector: string | null | undefined): Segment | undefined;
/** Human label for whatever is stored in `sector` (segment key, legacy label or 'other'). */
export declare function sectorLabel(sector: string | null | undefined): string;
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
export declare const SEGMENT_EXPERIENCE: Record<string, SegmentExperience>;
/** Words for the catalogue. Without stock tracking, "Stock" becomes "Catalogue". */
export declare function termsFor(sector: string | null | undefined, tracksStock: boolean): SegmentTerms;
/** "premier produit" / "première prestation". */
export declare function firstItem(terms: SegmentTerms): string;
/** "Tous les produits" / "Toutes les prestations". */
export declare function allItems(terms: SegmentTerms): string;
/** Menu items with the segment's key pages first (after the dashboard), the rest in their usual order. */
export declare function orderNav<T extends {
    to: string;
}>(items: T[], sector: string | null | undefined): T[];
/** Getting-started checklist for this business, without the steps whose module is off. */
export declare function firstStepsFor(sector: string | null | undefined, modules: ReadonlySet<string>): FirstStep[];
export {};
