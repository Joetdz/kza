export declare const BUSINESS_MODULES: readonly [{
    readonly key: "stock";
    readonly label: "Suivi de stock";
    readonly description: "Quantités, alertes de stock bas, mouvements et stock par lieu. Désactivé, le catalogue sert à vendre des services.";
    readonly available: true;
}, {
    readonly key: "online_store";
    readonly label: "Boutique en ligne";
    readonly description: "Une page publique où vos clients commandent eux-mêmes.";
    readonly available: true;
}, {
    readonly key: "whatsapp";
    readonly label: "WhatsApp CRM & IA";
    readonly description: "Inbox, agent IA, base de connaissance, automatisations et campagnes.";
    readonly available: true;
}, {
    readonly key: "logistics";
    readonly label: "Livraison";
    readonly description: "Commandes à livrer, partenaires et livreurs par ville, paiement à la livraison.";
    readonly available: true;
}, {
    readonly key: "goals";
    readonly label: "Objectifs & budget";
    readonly description: "Objectifs de vente, budget prévisionnel et comparaison avec le réalisé.";
    readonly available: true;
}, {
    readonly key: "fundraising";
    readonly label: "Levée de fonds";
    readonly description: "Campagnes de financement et portail investisseurs.";
    readonly available: true;
}, {
    readonly key: "variants";
    readonly label: "Variantes";
    readonly description: "Taille, couleur, contenance… chacune avec son stock et son prix.";
    readonly available: true;
}, {
    readonly key: "agenda";
    readonly label: "Agenda & réservations";
    readonly description: "Créneaux, rendez-vous et rappels — l'IA WhatsApp réserve pour vous.";
    readonly available: true;
}, {
    readonly key: "credit";
    readonly label: "Créances & échéances";
    readonly description: "Crédit client, paiements en plusieurs tranches et relances.";
    readonly available: false;
}, {
    readonly key: "invoices";
    readonly label: "Devis & factures";
    readonly description: "Devis et factures PDF, prix dégressifs par quantité.";
    readonly available: false;
}, {
    readonly key: "lots";
    readonly label: "Lots & péremption";
    readonly description: "Numéros de lot, dates d'expiration et alertes avant péremption.";
    readonly available: false;
}, {
    readonly key: "recipes";
    readonly label: "Recettes";
    readonly description: "Un plat consomme ses ingrédients dans le stock.";
    readonly available: false;
}];
export type BusinessModuleKey = typeof BUSINESS_MODULES[number]['key'];
export declare const AVAILABLE_MODULE_KEYS: BusinessModuleKey[];
export declare const ALL_MODULE_KEYS: BusinessModuleKey[];
export declare const BUSINESS_SECTORS: readonly [{
    readonly label: "Commerce général";
    readonly emoji: "🏪";
}, {
    readonly label: "Commerce de gros";
    readonly emoji: "📦";
}, {
    readonly label: "Alimentation";
    readonly emoji: "🛒";
}, {
    readonly label: "Mode & Vêtements";
    readonly emoji: "👗";
}, {
    readonly label: "Électronique";
    readonly emoji: "📱";
}, {
    readonly label: "Beauté & Cosmétiques";
    readonly emoji: "💄";
}, {
    readonly label: "Santé & Pharmacie";
    readonly emoji: "💊";
}, {
    readonly label: "Immobilier";
    readonly emoji: "🏠";
}, {
    readonly label: "Transport";
    readonly emoji: "🚗";
}, {
    readonly label: "Agriculture";
    readonly emoji: "🌾";
}, {
    readonly label: "Services";
    readonly emoji: "🔧";
}, {
    readonly label: "Restauration";
    readonly emoji: "🍽️";
}, {
    readonly label: "Éducation";
    readonly emoji: "📚";
}, {
    readonly label: "Autre";
    readonly emoji: "✨";
}];
export declare const SECTOR_PRESETS: Record<string, BusinessModuleKey[]>;
/** Modules a new business in this sector starts with. Unknown/empty sector → every available module (the historical behaviour). */
export declare function presetModulesForSector(sector: string | null | undefined): BusinessModuleKey[];
/**
 * The modules actually in effect for a business. A business with no module list
 * predates this feature and keeps everything it always had.
 */
export declare function effectiveModules(modules: readonly string[] | null | undefined): Set<BusinessModuleKey>;
export declare function hasModule(modules: readonly string[] | null | undefined, key: BusinessModuleKey): boolean;
