import { useState, useRef } from 'react';
import { X, Building2, Phone, Globe, DollarSign, Loader2, MapPin, Image, Upload, ArrowRight, ArrowLeft, Check, Clock } from 'lucide-react';
import { ScrollLock } from './ui/ScrollLock';
import { useStore, type BusinessRecord } from '../store/useStore';
import { uploadApi } from '../api';
import {
  BUSINESS_MODULES, effectiveModules, defaultModulesFor, type BusinessModuleKey,
  SEGMENTS, SEGMENT_FAMILIES, SALES_CHANNELS, ORG_SIZES, OTHER_SEGMENT_KEY,
  segmentByKey, sectorLabel, modulesForProfile, solutionLabel, solutionStatus,
  type SegmentFamilyKey, type WorkProfile,
} from '@kza/shared';

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

const QUIZ_STEPS = 6;

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
    // A business from before modules existed has none recorded — show what it actually has.
    modules:        business ? [...effectiveModules(business.modules)] as string[] : defaultModulesFor(''),
  });

  const [step, setStep] = useState(1);
  const [family, setFamily] = useState<SegmentFamilyKey | null>(null);
  const [work, setWork] = useState<WorkProfile>({ channels: [], org: null, sellsOnCredit: null });
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [error, setError] = useState('');

  const toggleModule = (key: BusinessModuleKey) => setForm(f => ({
    ...f,
    modules: f.modules.includes(key) ? f.modules.filter(m => m !== key) : [...f.modules, key],
  }));
  const sectorPreset = defaultModulesFor(form.sector);
  const matchesPreset = sectorPreset.length === form.modules.length && sectorPreset.every(m => form.modules.includes(m));

  const set = (field: 'name' | 'sector' | 'country' | 'currency' | 'whatsappPhone' | 'phone' | 'city' | 'logoUrl') => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => setForm(f => ({ ...f, [field]: e.target.value }));

  const handleCountryChange = (country: string) => {
    const suggested = COUNTRIES.find(c => c.code === country)?.currency ?? 'USD';
    setForm(f => ({ ...f, country, currency: suggested }));
  };

  const next = () => {
    if (step === 1 && !form.name.trim()) { setError('Le nom est requis.'); return; }
    if (step === 5 && !form.whatsappPhone.trim()) { setError('Le numéro WhatsApp est requis.'); return; }
    // Leaving the "how do you work" step: the answers decide which modules start switched on.
    if (step === 4) setForm(f => ({ ...f, modules: modulesForProfile(f.sector, work) }));
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
                {/* A business from before segments keeps its old label until it picks one */}
                {form.sector && form.sector !== OTHER_SEGMENT_KEY && !segmentByKey(form.sector) && (
                  <option value={form.sector}>{form.sector}</option>
                )}
                {SEGMENT_FAMILIES.map(fam => (
                  <optgroup key={fam.key} label={fam.label}>
                    {SEGMENTS.filter(s => s.family === fam.key).map(s => <option key={s.key} value={s.key}>{s.emoji} {s.label}</option>)}
                  </optgroup>
                ))}
                <option value={OTHER_SEGMENT_KEY}>✨ Autre activité</option>
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

            {/* Modules */}
            <div className="pt-1">
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-gray-700">Modules</label>
                {form.sector && !matchesPreset && (
                  <button type="button" onClick={() => setForm(f => ({ ...f, modules: sectorPreset }))}
                    className="text-[11px] font-medium text-indigo-600 hover:text-indigo-700">
                    Recommandés pour « {sectorLabel(form.sector)} »
                  </button>
                )}
              </div>
              <div className="space-y-1.5">
                {BUSINESS_MODULES.map(m => {
                  const on = form.modules.includes(m.key);
                  return (
                    <div key={m.key}
                      className={`flex items-start gap-3 px-3 py-2 rounded-xl border ${m.available ? 'border-gray-100' : 'border-dashed border-gray-200 bg-gray-50/60'}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-xs font-semibold ${m.available ? 'text-gray-800' : 'text-gray-500'}`}>{m.label}</span>
                          {!m.available && (
                            <span className="text-[10px] font-medium bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">
                              Bientôt{on ? ' · prévu' : ''}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-400 leading-snug">{m.description}</p>
                      </div>
                      {m.available && (
                        <button type="button" role="switch" aria-checked={on} aria-label={m.label} onClick={() => toggleModule(m.key)}
                          className={`relative w-9 h-5 rounded-full transition-colors shrink-0 mt-0.5 ${on ? 'bg-indigo-600' : 'bg-gray-300'}`}>
                          <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${on ? 'translate-x-4' : 'translate-x-0'}`} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="text-[11px] text-gray-400 mt-1.5">
                Désactiver un module le retire du menu. Vos données sont conservées et réapparaissent si vous le réactivez.
              </p>
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
  const segment = segmentByKey(form.sector);
  const familySegments = SEGMENTS.filter(s => s.family === family);
  const chipCls = (on: boolean) => [
    'px-3 py-2 rounded-xl border-2 text-xs font-medium transition-all text-left',
    on ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-100 hover:border-indigo-200 text-gray-600',
  ].join(' ');

  const pickSegment = (key: string) => {
    setForm(f => ({ ...f, sector: key }));
    setError('');
    setStep(4);
  };

  const back = () => {
    // "Autre activité" skips the segment list, so going back skips it too.
    if (step === 4 && !segment) { setError(''); setStep(2); return; }
    prev();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <ScrollLock />
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[92vh] flex flex-col overflow-hidden">

        {/* Progress bar */}
        <div className="h-1 bg-gray-100 shrink-0">
          <div
            className="h-full bg-indigo-500 transition-all duration-500 ease-out"
            style={{ width: `${(step / QUIZ_STEPS) * 100}%` }}
          />
        </div>

        {/* Top nav */}
        <div className="flex items-center justify-between px-4 pt-4 shrink-0">
          <button
            onClick={back}
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

        <div className="overflow-y-auto">

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

        {/* ── Step 2: Famille d'activité ── */}
        {step === 2 && (
          <div className="px-6 pt-5 pb-6 flex flex-col gap-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Que fait votre entreprise ?</h2>
              <p className="text-xs text-gray-400 mt-1">KZA s'adapte à votre activité. Vous pourrez tout changer plus tard.</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {SEGMENT_FAMILIES.map(fam => (
                <button
                  key={fam.key}
                  type="button"
                  onClick={() => { setFamily(fam.key); setStep(3); }}
                  className={`flex flex-col items-start gap-1.5 p-3 rounded-xl border-2 text-left transition-all ${
                    family === fam.key ? 'border-indigo-500 bg-indigo-50' : 'border-gray-100 hover:border-indigo-200 hover:bg-indigo-50/40'
                  }`}
                >
                  <span className="text-2xl leading-none">{fam.emoji}</span>
                  <span className="text-sm font-semibold text-gray-800 leading-tight">{fam.label}</span>
                  <span className="text-[11px] text-gray-400 leading-snug">{fam.hint}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => { setFamily(null); pickSegment(OTHER_SEGMENT_KEY); }}
              className="text-xs text-gray-400 hover:text-gray-600 underline self-center transition-colors"
            >
              Mon activité n'est pas dans la liste
            </button>
          </div>
        )}

        {/* ── Step 3: Segment précis ── */}
        {step === 3 && (
          <div className="px-6 pt-5 pb-6 flex flex-col gap-3">
            <h2 className="text-xl font-bold text-gray-900">Laquelle vous ressemble le plus ?</h2>
            {familySegments.map(s => (
              <button
                key={s.key}
                type="button"
                onClick={() => pickSegment(s.key)}
                className={`flex items-start gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                  form.sector === s.key ? 'border-indigo-500 bg-indigo-50' : 'border-gray-100 hover:border-indigo-200 hover:bg-indigo-50/40'
                }`}
              >
                <span className="text-2xl leading-none mt-0.5">{s.emoji}</span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-gray-800">{s.label}</span>
                  <span className="block text-[11px] text-gray-400 leading-snug mt-0.5">{s.examples}</span>
                </span>
              </button>
            ))}
          </div>
        )}

        {/* ── Step 4: Façon de travailler ── */}
        {step === 4 && (
          <div className="px-6 pt-5 pb-8 flex flex-col gap-5">
            <h2 className="text-xl font-bold text-gray-900">Comment travaillez-vous ?</h2>

            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Où vendez-vous ? (plusieurs choix)</p>
              <div className="grid grid-cols-2 gap-2">
                {SALES_CHANNELS.map(c => {
                  const on = work.channels.includes(c.key);
                  return (
                    <button key={c.key} type="button" className={chipCls(on)}
                      onClick={() => setWork(w => ({ ...w, channels: on ? w.channels.filter(x => x !== c.key) : [...w.channels, c.key] }))}>
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Votre organisation</p>
              <div className="grid grid-cols-3 gap-2">
                {ORG_SIZES.map(o => (
                  <button key={o.key} type="button" className={chipCls(work.org === o.key)}
                    onClick={() => setWork(w => ({ ...w, org: o.key }))}>
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Vos clients paient-ils parfois plus tard ?</p>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className={chipCls(work.sellsOnCredit === true)}
                  onClick={() => setWork(w => ({ ...w, sellsOnCredit: true }))}>Oui, je fais crédit</button>
                <button type="button" className={chipCls(work.sellsOnCredit === false)}
                  onClick={() => setWork(w => ({ ...w, sellsOnCredit: false }))}>Non, toujours comptant</button>
              </div>
            </div>

            <button onClick={next} className={primaryCls}>
              Suivant <ArrowRight size={15} />
            </button>
          </div>
        )}

        {/* ── Step 5: Coordonnées ── */}
        {step === 5 && (
          <div className="px-6 pt-5 pb-8 flex flex-col gap-4">
            <h2 className="text-xl font-bold text-gray-900">Vos coordonnées</h2>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Pays</label>
                <select value={form.country} onChange={e => handleCountryChange(e.target.value)} className={inputCls}>
                  {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.flag}  {c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Devise</label>
                <select value={form.currency} onChange={set('currency')} className={inputCls}>
                  {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Ville (optionnel)</label>
              <input type="text" value={form.city} onChange={set('city')} placeholder="Kinshasa, Lubumbashi…" className={inputCls} />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Numéro WhatsApp Business</label>
              <input
                type="tel"
                value={form.whatsappPhone}
                onChange={set('whatsappPhone')}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); next(); } }}
                placeholder="+243 81 234 5678"
                className={inputCls}
              />
              <p className="text-[11px] text-gray-400 mt-1.5">Utilisé pour connecter KZA à votre WhatsApp</p>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Téléphone de contact (optionnel)</label>
              <input type="tel" value={form.phone} onChange={set('phone')} placeholder="+243 81 234 5678" className={inputCls} />
              <p className="text-[11px] text-gray-400 mt-1">Affiché sur les factures (peut différer du WhatsApp)</p>
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

            <button onClick={next} className={primaryCls}>
              Suivant <ArrowRight size={15} />
            </button>
          </div>
        )}

        {/* ── Step 6: Récapitulatif — ce que KZA règle pour eux ── */}
        {step === 6 && (
          <form onSubmit={handleSubmit} className="px-6 pt-5 pb-8 flex flex-col gap-5">
            <div>
              <span className="text-[11px] font-bold text-indigo-500 uppercase tracking-widest">
                {segment ? `${segment.emoji} ${segment.label}` : '✨ Votre activité'}
              </span>
              <h2 className="text-xl font-bold text-gray-900 mt-1">Votre KZA est prêt</h2>
              <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
                {segment?.value ?? 'Tous les outils de KZA sont activés. Désactivez ceux dont vous n\'avez pas besoin.'}
              </p>
            </div>

            {segment && (
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Ce que KZA règle pour vous</p>
                <ul className="space-y-2">
                  {segment.problems.map(p => {
                    const status = solutionStatus(p.solvedBy, form.modules);
                    return (
                      <li key={p.text} className="flex items-start gap-2.5">
                        <span className={`mt-0.5 w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
                          status === 'on' ? 'bg-emerald-100 text-emerald-600' : status === 'soon' ? 'bg-amber-100 text-amber-600' : 'bg-gray-100 text-gray-400'
                        }`}>
                          {status === 'soon' ? <Clock size={10} /> : <Check size={10} />}
                        </span>
                        <span className="min-w-0 text-xs leading-snug">
                          <span className="text-gray-600">{p.text}</span>
                          <span className={`block text-[11px] font-medium mt-0.5 ${
                            status === 'on' ? 'text-emerald-600' : status === 'soon' ? 'text-amber-600' : 'text-gray-400'
                          }`}>
                            → {solutionLabel(p.solvedBy)}{status === 'soon' ? ' (bientôt)' : status === 'off' ? ' (désactivé)' : ''}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Vos modules</p>
              <div className="flex flex-wrap gap-1.5">
                {BUSINESS_MODULES.filter(m => m.available).map(m => {
                  const on = form.modules.includes(m.key);
                  return (
                    <button key={m.key} type="button" onClick={() => toggleModule(m.key)} title={m.description}
                      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full border text-[11px] font-medium transition-colors ${
                        on ? 'border-indigo-200 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-400 hover:text-gray-600'
                      }`}>
                      {on && <Check size={11} />}{m.label}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-gray-400 mt-2">Vous pourrez les changer à tout moment dans les réglages du business.</p>
            </div>

            {error && <p className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}

            <button type="submit" disabled={saving} className={primaryCls}>
              {saving && <Loader2 size={15} className="animate-spin" />}
              {saving ? 'Création…' : 'Créer mon espace'}
            </button>
          </form>
        )}
        </div>
      </div>
    </div>
  );
}
