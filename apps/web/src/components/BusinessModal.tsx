import { useState, useRef } from 'react';
import { X, Building2, Phone, Globe, DollarSign, Loader2, MapPin, Image, Upload } from 'lucide-react';
import { useStore, type BusinessRecord } from '../store/useStore';
import { uploadApi } from '../api';

const COUNTRIES = [
  { code: 'CD', label: 'R.D. Congo' },
  { code: 'CG', label: 'Congo-Brazzaville' },
  { code: 'CM', label: 'Cameroun' },
  { code: 'CI', label: "Côte d'Ivoire" },
  { code: 'SN', label: 'Sénégal' },
  { code: 'ML', label: 'Mali' },
  { code: 'BF', label: 'Burkina Faso' },
  { code: 'NE', label: 'Niger' },
  { code: 'TG', label: 'Togo' },
  { code: 'BJ', label: 'Bénin' },
  { code: 'GA', label: 'Gabon' },
  { code: 'GN', label: 'Guinée' },
  { code: 'RW', label: 'Rwanda' },
  { code: 'BI', label: 'Burundi' },
  { code: 'TZ', label: 'Tanzanie' },
  { code: 'UG', label: 'Ouganda' },
  { code: 'MG', label: 'Madagascar' },
  { code: 'MR', label: 'Mauritanie' },
  { code: 'MA', label: 'Maroc' },
  { code: 'DZ', label: 'Algérie' },
  { code: 'TN', label: 'Tunisie' },
];

const CURRENCIES = [
  { code: 'USD', label: 'Dollar américain (USD)' },
  { code: 'CDF', label: 'Franc congolais (FC)' },
  { code: 'EUR', label: 'Euro (EUR)' },
  { code: 'XAF', label: 'Franc CFA BEAC (XAF)' },
  { code: 'XOF', label: 'Franc CFA BCEAO (XOF)' },
  { code: 'RWF', label: 'Franc rwandais (RWF)' },
  { code: 'UGX', label: 'Shilling ougandais (UGX)' },
  { code: 'GNF', label: 'Franc guinéen (GNF)' },
  { code: 'MAD', label: 'Dirham marocain (MAD)' },
];

const SECTORS = [
  'Commerce général', 'Alimentation', 'Mode & Vêtements', 'Électronique',
  'Beauté & Cosmétiques', 'Santé & Pharmacie', 'Immobilier', 'Transport',
  'Agriculture', 'Services', 'Restauration', 'Éducation', 'Autre',
];

interface Props {
  business?: BusinessRecord;
  onClose: () => void;
  isFirstBusiness?: boolean;
}

export function BusinessModal({ business, onClose, isFirstBusiness = false }: Props) {
  const { addBusiness, updateBusiness, setCurrentBusiness } = useStore();

  const [form, setForm] = useState({
    name: business?.name ?? '',
    sector: business?.sector ?? '',
    country: business?.country ?? 'CD',
    currency: business?.currency ?? 'USD',
    whatsappPhone: business?.whatsappPhone ?? '',
    phone: business?.phone ?? '',
    city: business?.city ?? '',
    logoUrl: business?.logoUrl ?? '',
    isDefault: business?.isDefault ?? false,
  });
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [error, setError] = useState('');
  const logoRef = useRef<HTMLInputElement>(null);

  const set = (field: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => setForm(f => ({ ...f, [field]: e.target.value }));

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    try {
      const url = await uploadApi.uploadImage(file);
      setForm(f => ({ ...f, logoUrl: url }));
    } catch {
      setError('Erreur lors de l\'upload du logo.');
    } finally {
      setUploadingLogo(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError('Le nom est requis.'); return; }
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              {business ? 'Modifier le business' : isFirstBusiness ? 'Créer votre business' : 'Nouveau business'}
            </h2>
            {isFirstBusiness && (
              <p className="text-xs text-gray-500 mt-0.5">Configurez votre activité pour commencer.</p>
            )}
          </div>
          {!isFirstBusiness && (
            <button onClick={onClose} className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
              <X size={18} />
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Logo upload */}
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center overflow-hidden bg-gray-50 shrink-0">
              {form.logoUrl ? (
                <img src={form.logoUrl} alt="logo" className="w-full h-full object-cover" />
              ) : (
                <Image size={22} className="text-gray-300" />
              )}
            </div>
            <div>
              <button
                type="button"
                onClick={() => logoRef.current?.click()}
                disabled={uploadingLogo}
                className="flex items-center gap-2 px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                {uploadingLogo ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                {uploadingLogo ? 'Upload...' : 'Logo (optionnel)'}
              </button>
              <p className="text-[10px] text-gray-400 mt-1">PNG/JPG, apparaîtra sur la facture</p>
              <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
              <span className="flex items-center gap-1.5"><Building2 size={13} /> Nom du business *</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={set('name')}
              placeholder="Ex: Ma Boutique Kinshasa"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              required
            />
          </div>

          {/* Sector */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Secteur d'activité</label>
            <select
              value={form.sector}
              onChange={set('sector')}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            >
              <option value="">-- Choisir --</option>
              {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Country + Currency */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                <span className="flex items-center gap-1.5"><Globe size={13} /> Pays *</span>
              </label>
              <select
                value={form.country}
                onChange={set('country')}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                <span className="flex items-center gap-1.5"><DollarSign size={13} /> Devise *</span>
              </label>
              <select
                value={form.currency}
                onChange={set('currency')}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
              </select>
            </div>
          </div>

          {/* City */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
              <span className="flex items-center gap-1.5"><MapPin size={13} /> Ville</span>
            </label>
            <input
              type="text"
              value={form.city}
              onChange={set('city')}
              placeholder="Ex: Kinshasa"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* WhatsApp Phone */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
              <span className="flex items-center gap-1.5"><Phone size={13} /> Numéro WhatsApp *</span>
            </label>
            <input
              type="tel"
              value={form.whatsappPhone}
              onChange={set('whatsappPhone')}
              placeholder="+243 81 234 5678"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              required
            />
            <p className="text-xs text-gray-400 mt-1">Utilisé pour connecter WhatsApp et scanner le QR</p>
          </div>

          {/* Contact Phone */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
              <span className="flex items-center gap-1.5"><Phone size={13} /> Téléphone de contact</span>
            </label>
            <input
              type="tel"
              value={form.phone}
              onChange={set('phone')}
              placeholder="+243 81 234 5678"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <p className="text-xs text-gray-400 mt-1">Affiché sur les factures (peut être différent du WA)</p>
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>
          )}

          <div className="flex gap-3 pt-2">
            {!isFirstBusiness && (
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Annuler
              </button>
            )}
            <button
              type="submit"
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors"
            >
              {saving && <Loader2 size={15} className="animate-spin" />}
              {business ? 'Enregistrer' : 'Créer le business'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
