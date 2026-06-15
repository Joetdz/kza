import { useState } from 'react';
import {
  Package, ShoppingCart, CreditCard, BarChart3,
  MessageSquare, BrainCircuit, X, ArrowRight, Sparkles,
} from 'lucide-react';

interface Step {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  desc: string;
  tip?: string;
}

const STEPS: Step[] = [
  {
    icon: <Sparkles size={32} style={{ color: '#6366f1' }} />,
    iconBg: 'linear-gradient(135deg, #eef2ff, #ede9fe)',
    title: 'Bienvenue sur KZA Manager',
    desc: 'Votre centre de commande e-commerce. En 2 minutes, découvrez tout ce que la plateforme peut faire pour votre business.',
    tip: 'Ce tour peut être revu à tout moment depuis vos paramètres.',
  },
  {
    icon: <Package size={32} style={{ color: '#6366f1' }} />,
    iconBg: '#eef2ff',
    title: 'Gestion de Stock',
    desc: 'Ajoutez vos produits, suivez les quantités en temps réel et recevez des alertes quand le stock est bas. Le SKU est auto-généré si vous le laissez vide.',
    tip: 'Le coût d\'achat saisi est le coût total du lot — le coût unitaire est calculé automatiquement.',
  },
  {
    icon: <ShoppingCart size={32} style={{ color: '#10b981' }} />,
    iconBg: '#ecfdf5',
    title: 'Suivi des Ventes',
    desc: 'Enregistrez chaque vente avec le canal (WhatsApp, TikTok, Instagram, Boutique...), le statut (payé / en attente) et la zone de livraison.',
    tip: 'Les ventes multi-produits sont supportées — ajoutez plusieurs articles en une seule commande.',
  },
  {
    icon: <CreditCard size={32} style={{ color: '#f59e0b' }} />,
    iconBg: '#fffbeb',
    title: 'Gestion des Dépenses',
    desc: 'Catégorisez vos dépenses (publicité, transport, stock, autre) pour calculer votre bénéfice net réel et mesurer votre ROAS.',
    tip: 'Associez une dépense pub à un canal spécifique pour mesurer son retour sur investissement.',
  },
  {
    icon: <BarChart3 size={32} style={{ color: '#8b5cf6' }} />,
    iconBg: '#f5f3ff',
    title: 'Analytique avancée',
    desc: 'Visualisez vos tendances de ventes, identifiez vos meilleures périodes, comparez vos canaux et suivez vos objectifs de ventes.',
    tip: 'Utilisez le sélecteur de période en haut de l\'écran pour comparer des intervalles.',
  },
  {
    icon: <MessageSquare size={32} style={{ color: '#25d366' }} />,
    iconBg: '#f0fdf4',
    title: 'CRM WhatsApp',
    desc: 'Connectez votre numéro WhatsApp, gérez vos leads (froid / tiède / chaud / converti), automatisez vos réponses avec l\'IA et suivez vos conversions.',
    tip: 'L\'IA répond automatiquement à vos prospects selon votre base de connaissances configurée.',
  },
  {
    icon: (
      <div className="w-16 h-16 rounded-full flex items-center justify-center text-white text-2xl font-black shadow-lg"
        style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
        KZ
      </div>
    ),
    iconBg: 'transparent',
    title: 'Kayden Zion — Votre experte IA',
    desc: 'Consultez Kayden Zion par chat ou en appel vocal interactif. Elle analyse vos données en temps réel et vous donne des conseils stratégiques personnalisés.',
    tip: 'Le bouton "Kayden Zion" est visible en bas à droite de toutes les pages. 5 min d\'appel vocal toutes les 3h.',
  },
];

interface Props {
  userId: string;
  onClose: () => void;
}

export function OnboardingTour({ userId, onClose }: Props) {
  const [step, setStep] = useState(0);
  const isLast = step === STEPS.length - 1;

  const finish = () => {
    localStorage.setItem(`tour_done_${userId}`, '1');
    onClose();
  };

  const current = STEPS[step];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden">

        {/* Progress bar */}
        <div className="h-1 w-full bg-gray-100">
          <div
            className="h-full transition-all duration-500"
            style={{
              width: `${((step + 1) / STEPS.length) * 100}%`,
              background: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
            }}
          />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5">
          <div className="flex gap-1.5">
            {STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                className={`rounded-full transition-all ${i === step ? 'w-6 h-2.5 bg-indigo-600' : 'w-2.5 h-2.5 bg-gray-200 hover:bg-gray-300'}`}
              />
            ))}
          </div>
          <button onClick={finish} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X size={16} className="text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="px-8 py-6">
          {/* Icon */}
          <div
            className="w-20 h-20 rounded-2xl flex items-center justify-center mb-6 mx-auto"
            style={{ background: current.iconBg }}
          >
            {current.icon}
          </div>

          {/* Text */}
          <h2 className="text-xl font-black text-gray-900 text-center mb-3">{current.title}</h2>
          <p className="text-gray-600 text-sm text-center leading-relaxed mb-4">{current.desc}</p>

          {/* Tip */}
          {current.tip && (
            <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-indigo-50 border border-indigo-100">
              <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0 mt-1.5" />
              <p className="text-xs text-indigo-700 leading-relaxed">{current.tip}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-8 pb-8 flex items-center justify-between gap-4">
          <button
            onClick={finish}
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            Passer le tutoriel
          </button>

          <div className="flex gap-3">
            {step > 0 && (
              <button
                onClick={() => setStep(s => s - 1)}
                className="px-4 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
              >
                ← Retour
              </button>
            )}
            <button
              onClick={isLast ? finish : () => setStep(s => s + 1)}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white rounded-xl transition-all hover:scale-105 active:scale-95 shadow-md"
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
            >
              {isLast ? (
                <>C\'est parti <Sparkles size={14} /></>
              ) : (
                <>Suivant <ArrowRight size={14} /></>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
