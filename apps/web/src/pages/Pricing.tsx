import { useState } from 'react';
import {
  Check, MessageCircle, Zap, Package, BarChart2, Target,
  Truck, Users, Store, Music, Video, Film, Download, X,
} from 'lucide-react';

/* ─── Data ──────────────────────────────────────────────────────────── */

const PLANS = [
  {
    key: 'free',
    name: 'Gratuit',
    price: { monthly: 0, annual: 0 },
    tagline: 'Pour démarrer votre activité',
    cta: 'Commencer gratuitement',
    featured: false,
    features: [
      'Gestion stock & ventes',
      'Boutique en ligne personnalisée',
      'Reels vidéo produits',
      'Jingle IA pour vos produits',
      'Éditeur vidéo intégré',
      '50 messages WhatsApp / mois',
      'Export PDF & CSV',
    ],
  },
  {
    key: 'essential',
    name: 'Essentiel',
    price: { monthly: 19, annual: 15 },
    tagline: 'Pour les commerçants actifs',
    cta: "Choisir l'Essentiel",
    featured: false,
    features: [
      'Tout du plan Gratuit',
      '500 messages WhatsApp / mois',
      'Agent IA WhatsApp',
      'Gestion logistique',
      'CRM Clients complet',
      'Rapports analytiques avancés',
      'Objectifs & suivi KPI',
    ],
  },
  {
    key: 'pro',
    name: 'Pro',
    price: { monthly: 45, annual: 36 },
    tagline: 'Pour les entreprises en croissance',
    cta: 'Passer au Pro',
    featured: true,
    features: [
      'Tout du plan Essentiel',
      'Messages WhatsApp illimités',
      'Multi-business (5 boutiques)',
      'IA configurée par produit',
      'Automatisations WhatsApp',
      'Portail partenaire logistique',
      'Support prioritaire',
    ],
  },
  {
    key: 'agency',
    name: 'Agence',
    price: { monthly: null, annual: null },
    tagline: 'Pour gérer plusieurs marques',
    cta: 'Nous contacter',
    featured: false,
    features: [
      'Tout du plan Pro',
      'Boutiques illimitées',
      'Tableau de bord centralisé',
      'Marque blanche disponible',
      'Intégrations sur mesure',
      'Account manager dédié',
      'SLA personnalisé',
    ],
  },
];

type IconColor = 'indigo' | 'green' | 'amber' | 'rose' | 'sky' | 'violet' | 'teal' | 'orange';

const ICON_COLORS: Record<IconColor, { bg: string; text: string }> = {
  indigo: { bg: 'bg-indigo-100', text: 'text-indigo-600' },
  green:  { bg: 'bg-green-100',  text: 'text-green-600'  },
  amber:  { bg: 'bg-amber-100',  text: 'text-amber-600'  },
  rose:   { bg: 'bg-rose-100',   text: 'text-rose-600'   },
  sky:    { bg: 'bg-sky-100',    text: 'text-sky-600'    },
  violet: { bg: 'bg-violet-100', text: 'text-violet-600' },
  teal:   { bg: 'bg-teal-100',   text: 'text-teal-600'   },
  orange: { bg: 'bg-orange-100', text: 'text-orange-600' },
};

const PLAN_BADGE: Record<string, string> = {
  'Gratuit':   'bg-gray-100 text-gray-600',
  'Essentiel': 'bg-indigo-100 text-indigo-700',
  'Pro':       'bg-violet-100 text-violet-700',
};

const FEATURES = [
  { Icon: MessageCircle, color: 'indigo' as IconColor, plan: 'Essentiel', title: 'WhatsApp CRM',           desc: "Inbox unifié pour tous vos messages clients. Historique complet, labels, statuts de commande — le tout depuis votre navigateur." },
  { Icon: Zap,           color: 'amber'  as IconColor, plan: 'Essentiel', title: 'Agent IA WhatsApp',     desc: "Répondez automatiquement 24h/24. L'IA connaît vos produits et prix. Elle simule un délai humain et ne répond que si elle est sûre." },
  { Icon: Package,       color: 'green'  as IconColor, plan: 'Gratuit',   title: 'Stock & Ventes',         desc: "Gérez votre inventaire en temps réel. Alertes de rupture, historique des ventes, rapports de performance par produit." },
  { Icon: Store,         color: 'sky'    as IconColor, plan: 'Gratuit',   title: 'Boutique personnalisée', desc: "Votre boutique à votre adresse unique (kza.app/boutique/ma-marque). Catalogue, photos HD, prix — lien prêt à partager en un clic." },
  { Icon: Film,          color: 'rose'   as IconColor, plan: 'Gratuit',   title: 'Reels produits',         desc: "Transformez vos photos produit en vidéos animées prêtes pour Instagram, TikTok ou WhatsApp. Caption, animation, export instantané." },
  { Icon: Music,         color: 'amber'  as IconColor, plan: 'Gratuit',   title: 'Jingle IA',              desc: "L'IA génère un script pub, le convertit en voix naturelle et le mixe avec une musique. Un jingle professionnel en 30 secondes." },
  { Icon: Video,         color: 'violet' as IconColor, plan: 'Gratuit',   title: 'Éditeur vidéo',          desc: "Importez une vidéo produit, découpez-la, ajoutez une caption avec le prix, choisissez la position — exportez pour les stories." },
  { Icon: Truck,         color: 'teal'   as IconColor, plan: 'Essentiel', title: 'Logistique',             desc: "Suivez vos livraisons, gérez vos partenaires de transport et donnez à vos clients le statut de leur commande en temps réel." },
  { Icon: Users,         color: 'sky'    as IconColor, plan: 'Essentiel', title: 'CRM Clients',            desc: "Base clients complète avec historique d'achat, notes et segmentation. Identifiez vos meilleurs clients et fidélisez-les." },
  { Icon: BarChart2,     color: 'indigo' as IconColor, plan: 'Essentiel', title: 'Analytique',             desc: "Tableaux de bord en temps réel : CA, marges, produits les plus vendus, évolution mensuelle. Décisions basées sur les données." },
  { Icon: Target,        color: 'orange' as IconColor, plan: 'Essentiel', title: 'Objectifs & KPI',        desc: "Fixez des objectifs de CA, de ventes ou de stock et suivez votre progression semaine après semaine avec des indicateurs visuels." },
  { Icon: Download,      color: 'indigo' as IconColor, plan: 'Essentiel', title: 'Export PDF & CSV',       desc: "Exportez vos rapports de ventes, stocks et livraisons. Factures PDF prêtes à envoyer, données CSV pour vos tableaux Excel." },
];

/* ─── Component ─────────────────────────────────────────────────────── */

export function Pricing() {
  const [annual, setAnnual] = useState(false);

  const goToApp = () => {
    window.location.hash = '';
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Nav */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-14">
          <button onClick={goToApp} className="text-xl font-black text-gray-900 tracking-tight hover:text-indigo-600 transition-colors">
            KZA
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={goToApp}
              className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              Se connecter
            </button>
            <button
              onClick={goToApp}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors"
            >
              Commencer
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-16 space-y-20">

        {/* Hero */}
        <section className="text-center space-y-4 max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 bg-indigo-50 text-indigo-700 text-xs font-semibold px-3 py-1.5 rounded-full">
            <Zap size={12} /> Simple, transparent, sans surprise
          </div>
          <h1 className="text-4xl sm:text-5xl font-black text-gray-900 leading-tight">
            Choisissez votre plan
          </h1>
          <p className="text-lg text-gray-500">
            De la boutique gratuite à la gestion complète multi-business — scalez selon votre croissance.
          </p>

          {/* Billing toggle */}
          <div className="flex items-center justify-center gap-3 pt-2">
            <span className={`text-sm font-medium ${!annual ? 'text-gray-900' : 'text-gray-400'}`}>Mensuel</span>
            <button
              onClick={() => setAnnual(a => !a)}
              className={`relative w-12 h-6 rounded-full transition-colors ${annual ? 'bg-indigo-600' : 'bg-gray-300'}`}
            >
              <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${annual ? 'translate-x-7' : 'translate-x-1'}`} />
            </button>
            <span className={`text-sm font-medium ${annual ? 'text-gray-900' : 'text-gray-400'}`}>
              Annuel
              <span className="ml-1.5 bg-green-100 text-green-700 text-xs font-bold px-1.5 py-0.5 rounded-full">-20%</span>
            </span>
          </div>
        </section>

        {/* Pricing cards */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {PLANS.map(plan => (
            <div
              key={plan.key}
              className={`relative rounded-2xl p-6 flex flex-col gap-5 transition-shadow
                ${plan.featured
                  ? 'bg-indigo-600 text-white shadow-2xl shadow-indigo-200 ring-2 ring-indigo-600'
                  : 'bg-white text-gray-900 shadow-sm border border-gray-200 hover:shadow-md'
                }`}
            >
              {plan.featured && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-400 text-amber-900 text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap">
                  Le plus populaire
                </div>
              )}

              <div>
                <div className={`text-xs font-bold uppercase tracking-widest mb-1 ${plan.featured ? 'text-indigo-200' : 'text-gray-400'}`}>
                  {plan.name}
                </div>
                <div className="flex items-end gap-1">
                  {plan.price.monthly === null ? (
                    <span className="text-3xl font-black">Sur devis</span>
                  ) : plan.price.monthly === 0 ? (
                    <span className="text-3xl font-black">Gratuit</span>
                  ) : (
                    <>
                      <span className="text-3xl font-black">
                        ${annual ? plan.price.annual : plan.price.monthly}
                      </span>
                      <span className={`text-sm mb-1 ${plan.featured ? 'text-indigo-200' : 'text-gray-400'}`}>/mois</span>
                    </>
                  )}
                </div>
                <p className={`text-xs mt-1 ${plan.featured ? 'text-indigo-200' : 'text-gray-500'}`}>
                  {plan.tagline}
                </p>
              </div>

              <button
                onClick={goToApp}
                className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors
                  ${plan.featured
                    ? 'bg-white text-indigo-700 hover:bg-indigo-50'
                    : 'bg-indigo-600 text-white hover:bg-indigo-700'
                  }`}
              >
                {plan.cta}
              </button>

              <ul className="space-y-2.5 flex-1">
                {plan.features.map(f => (
                  <li key={f} className="flex items-start gap-2.5 text-sm">
                    <Check size={15} className={`mt-0.5 shrink-0 ${plan.featured ? 'text-indigo-200' : 'text-indigo-500'}`} />
                    <span className={plan.featured ? 'text-indigo-100' : 'text-gray-600'}>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        {/* Features grid */}
        <section className="space-y-8">
          <div className="text-center space-y-2">
            <h2 className="text-2xl sm:text-3xl font-black text-gray-900">Tout ce qui est inclus</h2>
            <p className="text-gray-500">Un écosystème complet pour gérer, vendre et communiquer.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map(({ Icon, color, plan, title, desc }) => {
              const c = ICON_COLORS[color];
              return (
                <div key={title} className="bg-white rounded-2xl border border-gray-200 p-5 flex gap-4 hover:shadow-md transition-shadow">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${c.bg} ${c.text}`}>
                    <Icon size={18} />
                  </div>
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-bold text-gray-900">{title}</h3>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${PLAN_BADGE[plan] ?? 'bg-gray-100 text-gray-600'}`}>
                        {plan}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 leading-relaxed">{desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Comparison table */}
        <section className="space-y-6">
          <h2 className="text-2xl sm:text-3xl font-black text-gray-900 text-center">Comparaison détaillée</h2>
          <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-5 py-4 font-semibold text-gray-500 w-2/5">Fonctionnalité</th>
                  {PLANS.map(p => (
                    <th key={p.key} className={`text-center px-4 py-4 font-bold ${p.featured ? 'text-indigo-600' : 'text-gray-900'}`}>
                      {p.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ['Boutique en ligne', true, true, true, true],
                  ['Reels & vidéos produits', true, true, true, true],
                  ['Jingle IA', true, true, true, true],
                  ['Éditeur vidéo', true, true, true, true],
                  ['Gestion stock & ventes', true, true, true, true],
                  ['Export PDF & CSV', true, true, true, true],
                  ['WhatsApp CRM', '50 msg/mois', '500 msg/mois', 'Illimité', 'Illimité'],
                  ['Agent IA WhatsApp', false, true, true, true],
                  ['Logistique & livraisons', false, true, true, true],
                  ['CRM Clients', false, true, true, true],
                  ['Analytique avancée', false, true, true, true],
                  ['Multi-business', false, false, '5 boutiques', 'Illimité'],
                  ['Portail partenaire', false, false, true, true],
                  ['Marque blanche', false, false, false, true],
                ].map((row, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-5 py-3 text-gray-700 font-medium">{row[0]}</td>
                    {row.slice(1).map((val, j) => (
                      <td key={j} className="px-4 py-3 text-center">
                        {val === true  ? <Check size={16} className="text-indigo-500 mx-auto" /> :
                         val === false ? <X     size={16} className="text-gray-300 mx-auto" /> :
                         <span className="text-xs text-gray-600 font-medium">{val}</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* CTA */}
        <section className="bg-indigo-600 rounded-3xl p-8 sm:p-12 text-center text-white space-y-4">
          <h2 className="text-2xl sm:text-3xl font-black">Prêt à développer votre business ?</h2>
          <p className="text-indigo-200 text-lg">Commencez gratuitement. Passez à un plan payant quand vous êtes prêt.</p>
          <button
            onClick={goToApp}
            className="inline-flex items-center gap-2 bg-white text-indigo-700 font-bold px-8 py-3.5 rounded-2xl hover:bg-indigo-50 transition-colors text-sm"
          >
            <Zap size={16} /> Créer mon compte gratuitement
          </button>
        </section>

      </main>

      <footer className="text-center py-8 text-xs text-gray-400 border-t border-gray-200 mt-8">
        © {new Date().getFullYear()} KZA — Gestion E-Commerce
      </footer>
    </div>
  );
}
