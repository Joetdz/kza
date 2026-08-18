import { useState, useRef } from 'react';
import { X, Building2, Phone, Globe, DollarSign, Loader2, MapPin, Image, Upload, ArrowRight, ArrowLeft } from 'lucide-react';
import { ScrollLock } from './ui/ScrollLock';
import { useStore, type BusinessRecord } from '../store/useStore';
import { uploadApi } from '../api';

const COUNTRIES = [
  { code: 'CD', label: 'R.D. Congo',         flag: '🇨🇩', currency: 'CDF' },
  { code: 'CG', label: 'Congo-Brazzaville',  flag: '🇨🇬', currency: 'XAF' },
  { code: 'CM', label: 'Cameroun',            flag: '🇨🇲', currency: 'XAF' },
  { code: 'CI', label: "Côte d'Ivoire",       flag: '🇨🇮', currency: 'XOF' },
  { code: 'SN', label: 'Sénégal',             flag: '🇸🇳', currency: 'XOF' },
  { code: 'ML', label: 'Mali',                flag: '🇲🇱', currency: 'XOF' },
  { code: 'BF', label: 'Burkina Faso',        flag: '🇧🇫', currency: 'XOF' },
  { code: 'NE', label: 'Niger',               flag: '🇳🇪', currency: 'XOF' },
  { code: 'TG', label: 'Togo',                flag: '🇹🇬', currency: 'XOF' },
  { code: 'BJ', label: 'Bénin',               flag: '🇧🇯', currency: 'XOF' },
  { code: 'GA', label: 'Gabon',               flag: '🇬🇦', currency: 'XAF' },
  { code: 'GN', label: 'Guinée',              flag: '🇬🇳', currency: 'GNF' },
  { code: 'RW', label: 'Rwanda',              flag: '🇷🇼', currency: 'RWF' },
  { code: 'BI', label: 'Burundi',             flag: '🇧🇮', currency: 'USD' },
  { code: 'TZ', label: 'Tanzanie',            flag: '🇹🇿', currency: 'USD' },
  { code: 'UG', label: 'Ouganda',             flag: '🇺🇬', currency: 'UGX' },
  { code: 'MG', label: 'Madagascar',          flag: '🇲🇬', currency: 'USD' },
  { code: 'MR', label: 'Mauritanie',          flag: '🇲🇷', currency: 'USD' },
  { code: 'MA', label: 'Maroc',               flag: '🇲🇦', currency: 'MAD' },
  { code: 'DZ', label: 'Algérie',             flag: '🇩🇿', currency: 'USD' },
  { code: 'TN', label: 'Tunisie',             flag: '🇹🇳', currency: 'USD' },
];

const CURRENCIES = [
  { code: 'USD', label: 'Dollar américain (USD)' },
  { code: 'CDF', label: 'Franc congolais (CDF)' },
  { code: 'EUR', label: 'Euro (EUR)' },
  { code: 'XAF', label: 'Franc CFA BEAC (XAF)' },
  { code: 'XOF', label: 'Franc CFA BCEAO (XOF)' },
  { code: 'RWF', label: 'Franc rwandais (RWF)' },
  { code: 'UGX', label: 'Shilling ougandais (UGX)' },
  { code: 'GNF', label: 'Franc guinéen (GNF)' },
  { code: 'MAD', label: 'Dirham marocain (MAD)' },
];

const SECTORS = [
  { label: 'Commerce général',    emoji: '🏪' },
  { label: 'Alimentation',        emoji: '🛒' },
  { label: 'Mode & Vêtements',    emoji: '👗' },
  { label: 'Électronique',        emoji: '📱' },
  { label: 'Beauté & Cosmétiques',emoji: '💄' },
  { label: 'Santé & Pharmacie',   emoji: '💊' },
  { label: 'Immobilier',          emoji: '🏠' },
  { label: 'Transport',           emoji: '🚗' },
  { label: 'Agriculture',         emoji: '🌾' },
  { label: 'Services',            emoji: '🔧' },
  { label: 'Restauration',        emoji: '🍽️' },
  { label: 'Éducation',           emoji: '📚' },
  { label: 'Autre',               emoji: '✨' },
];

const QUIZ_STEPS = 4;

interface Props {
  business?: BusinessRecord;
  onClose: () => void;
  isFirstBusiness?: boolean;
}

export function BusinessModal({ business, onClose, isFirstBusiness = false }: Props) {
  const { addBusiness, updateBusiness, setCurrentBusiness } = useStore();
  const logoRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    name:           business?.name           ?? '',
    sector:         business?.sector         ?? '',
    country:        business?.country        ?? 'CD',
    currency:       business?.currency       ?? 'USD',
    whatsappPhone:  business?.whatsappPhone  ?? '',
    phone:          business?.phone          ?? '',
    city:           business?.city           ?? '',
    logoUrl:        business?.logoUrl        ?? '',
    isDefault:      business?.isDefault      ?? false,
  });

  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [error, setError] = useState('');

  const set = (field: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => setForm(f => ({ ...f, [field]: e.target.value }));

  const handleCountryChange = (country: string) => {
    const suggested = COUNTRIES.find(c => c.code === country)?.currency ?? 'USD';
    setForm(f => ({ ...f, country, currency: suggested }));
  };

  const next = () => {
    if (step === 1 && !form.name.trim()) { setError('Le nom est requis.'); return; }
    setError('');
    setStep(s => Math.min(s + 1, QUIZ_STEPS));
  };

  const prev = () => {
    setError('');
    setStep(s => Math.max(s - 1, 1));
  };

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    try {
      const url = await uploadApi.uploadImage(file);
      setForm(f => ({ ...f, logoUrl: url }));
    } catch {
      setError("Erreur lors de l'upload du logo.");
    } finally {
      setUploadingLogo(false);
    }
  }

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!form.name.trim())         { setError('Le nom est requis.');              setStep(1); return; }
    if (!form.whatsappPhone.trim()) { setError('Le numéro WhatsApp est requis.'); return; }
    setSaving(true);
    setError('');
    try {
      if (business) {
        await updateBusiness(business.id, form);
      } else {
        const created = await addBusiness(form);
        await setCurrentBusiness(created.id);
      }
      onClose();
    } catch (err: any) {
      setError(err?.message ?? 'Une erreur est survenue.');
    } finally {
      setSaving(false);
    }
  }

  // ─── Shared classes ──────────────────────────────────────────────────────────
  const inputCls = 'w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 transition-colors bg-white';
  const primaryCls = 'w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white px-4 py-3 rounded-xl text-sm font-semibold transition-colors';

  // ─── EDIT MODE — all fields visible ─────────────────────────────────────────
  if (business) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
        <ScrollLock />
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
            <h2 className="text-lg font-bold text-gray-900">Modifier le business</h2>
            <button onClick={onClose} className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
              <X size={18} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
            {/* Logo */}
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center overflow-hidden bg-gray-50 shrink-0">
                {form.logoUrl ? <img src={form.logoUrl} alt="logo" className="w-full h-full object-cover" /> : <Image size={22} className="text-gray-300" />}
              </div>
              <div>
                <button type="button" onClick={() => logoRef.current?.click()} disabled={uploadingLogo}
                  className="flex items-center gap-2 px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50">
                  {uploadingLogo ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                  {uploadingLogo ? 'Upload...' : 'Logo (optionnel)'}
                </button>
                <p className="text-[10px] text-gray-400 mt-1">PNG/JPG, apparaîtra sur la facture</p>
                <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5"><span className="flex items-center gap-1.5"><Building2 size={13} /> Nom du business *</span></label>
              <input type="text" value={form.name} onChange={set('name')} placeholder="Ex: Ma Boutique Kinshasa" className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" required />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Secteur d'activité</label>
              <select value={form.sector} onChange={set('sector')} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                <option value="">-- Choisir --</option>
                {SECTORS.map(s => <option key={s.label} value={s.label}>{s.emoji} {s.label}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5"><span className="flex items-center gap-1.5"><Globe size={13} /> Pays *</span></label>
                <select value={form.country} onChange={e => handleCountryChange(e.target.value)} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                  {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.flag} {c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5"><span className="flex items-center gap-1.5"><DollarSign size={13} /> Devise *</span></label>
                <select value={form.currency} onChange={set('currency')} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                  {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5"><span className="flex items-center gap-1.5"><MapPin size={13} /> Ville</span></label>
              <input type="text" value={form.city} onChange={set('city')} placeholder="Ex: Kinshasa" className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5"><span className="flex items-center gap-1.5"><Phone size={13} /> Numéro WhatsApp *</span></label>
              <input type="tel" value={form.whatsappPhone} onChange={set('whatsappPhone')} placeholder="+243 81 234 5678" className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" required />
              <p className="text-xs text-gray-400 mt-1">Utilisé pour connecter WhatsApp</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5"><span className="flex items-center gap-1.5"><Phone size={13} /> Téléphone de contact</span></label>
              <input type="tel" value={form.phone} onChange={set('phone')} placeholder="+243 81 234 5678" className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              <p className="text-xs text-gray-400 mt-1">Affiché sur les factures</p>
            </div>

            {error && <p className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">Annuler</button>
              <button type="submit" disabled={saving} className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors">
                {saving && <Loader2 size={15} className="animate-spin" />}
                Enregistrer
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // ─── CREATE MODE — quiz ──────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <ScrollLock />
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">

        {/* Progress bar */}
        <div className="h-1 bg-gray-100">
          <div
            className="h-full bg-indigo-500 transition-all duration-500 ease-out"
            style={{ width: `${(step / QUIZ_STEPS) * 100}%` }}
          />
        </div>

        {/* Top nav */}
        <div className="flex items-center justify-between px-4 pt-4">
          <button
            onClick={prev}
            disabled={step === 1}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors disabled:invisible"
          >
            <ArrowLeft size={16} />
          </button>
          <span className="text-xs text-gray-300 font-medium tabular-nums">{step} / {QUIZ_STEPS}</span>
          {!isFirstBusiness ? (
            <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
              <X size={16} />
            </button>
          ) : <div className="w-9" />}
        </div>

        {/* ── Step 1: Nom ── */}
        {step === 1 && (
          <div className="px-6 pt-5 pb-8 flex flex-col gap-5">
            {isFirstBusiness && (
              <span className="text-[11px] font-bold text-indigo-500 uppercase tracking-widest">Bienvenue sur KZA 👋</span>
            )}
            <h2 className="text-2xl font-bold text-gray-900 leading-snug">
              Quel est le nom de votre business ?
            </h2>
            <input
              type="text"
              value={form.name}
              onChange={set('name')}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); next(); } }}
              placeholder="Ex: Ma Boutique Kinshasa"
              className={inputCls}
              autoFocus
            />
            {error && <p className="text-xs text-red-500">{error}</p>}
            <button onClick={next} className={primaryCls}>
              Suivant <ArrowRight size={15} />
            </button>
          </div>
        )}

        {/* ── Step 2: Secteur ── */}
        {step === 2 && (
          <div className="px-6 pt-5 pb-6 flex flex-col gap-4">
            <h2 className="text-xl font-bold text-gray-900">Dans quel secteur êtes-vous ?</h2>
            <div className="grid grid-cols-3 gap-2 max-h-60 overflow-y-auto pr-0.5">
              {SECTORS.map(s => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => { setForm(f => ({ ...f, sector: s.label })); next(); }}
                  className={[
                    'flex flex-col items-center gap-1.5 px-1 py-3 rounded-xl border-2 text-[11px] text-center font-medium transition-all leading-tight',
                    form.sector === s.label
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                      : 'border-gray-100 hover:border-indigo-200 hover:bg-indigo-50/40 text-gray-600',
                  ].join(' ')}
                >
                  <span className="text-xl leading-none">{s.emoji}</span>
                  <span>{s.label}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={next}
              className="text-xs text-gray-400 hover:text-gray-600 underline self-center transition-colors"
            >
              Passer cette étape
            </button>
          </div>
        )}

        {/* ── Step 3: Localisation + Devise ── */}
        {step === 3 && (
          <div className="px-6 pt-5 pb-8 flex flex-col gap-4">
            <h2 className="text-xl font-bold text-gray-900">Où êtes-vous basé ?</h2>

            <div>
              <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Pays</label>
              <select value={form.country} onChange={e => handleCountryChange(e.target.value)} className={inputCls}>
                {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.flag}  {c.label}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Ville (optionnel)</label>
              <input
                type="text"
                value={form.city}
                onChange={set('city')}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); next(); } }}
                placeholder="Kinshasa, Lubumbashi…"
                className={inputCls}
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Devise</label>
              <select value={form.currency} onChange={set('currency')} className={inputCls}>
                {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
              </select>
            </div>

            <button onClick={next} className={primaryCls}>
              Suivant <ArrowRight size={15} />
            </button>
          </div>
        )}

        {/* ── Step 4: WhatsApp + Logo + Créer ── */}
        {step === 4 && (
          <form onSubmit={handleSubmit} className="px-6 pt-5 pb-8 flex flex-col gap-4">
            <h2 className="text-xl font-bold text-gray-900">Votre numéro WhatsApp Business</h2>

            <div>
              <input
                type="tel"
                value={form.whatsappPhone}
                onChange={set('whatsappPhone')}
                placeholder="+243 81 234 5678"
                className={inputCls}
                autoFocus
                required
              />
              <p className="text-[11px] text-gray-400 mt-1.5">Utilisé pour connecter KZA à votre WhatsApp Business</p>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Téléphone de contact (optionnel)</label>
              <input
                type="tel"
                value={form.phone}
                onChange={set('phone')}
                placeholder="+243 81 234 5678"
                className={inputCls}
              />
              <p className="text-[11px] text-gray-400 mt-1">Affiché sur les factures (peut différer du WA)</p>
            </div>

            {/* Logo optionnel */}
            <button
              type="button"
              onClick={() => logoRef.current?.click()}
              disabled={uploadingLogo}
              className="flex items-center gap-3 p-3 border border-dashed border-gray-200 rounded-xl hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors disabled:opacity-50 text-left"
            >
              <div className="w-10 h-10 rounded-lg border border-gray-100 flex items-center justify-center overflow-hidden bg-gray-50 shrink-0">
                {form.logoUrl
                  ? <img src={form.logoUrl} alt="logo" className="w-full h-full object-cover" />
                  : uploadingLogo
                    ? <Loader2 size={14} className="animate-spin text-indigo-400" />
                    : <Image size={16} className="text-gray-300" />
                }
              </div>
              <div>
                <p className="text-xs font-medium text-gray-600">
                  {uploadingLogo ? 'Chargement…' : form.logoUrl ? 'Logo ajouté ✓' : 'Ajouter un logo (optionnel)'}
                </p>
                <p className="text-[10px] text-gray-400 mt-0.5">Apparaîtra sur vos factures</p>
              </div>
              <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
            </button>

            {error && <p className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}

            <button type="submit" disabled={saving} className={`${primaryCls} mt-1`}>
              {saving && <Loader2 size={15} className="animate-spin" />}
              {saving ? 'Création…' : 'Créer mon business'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
