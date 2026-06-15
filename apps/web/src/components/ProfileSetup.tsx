import { useState, useEffect } from 'react';
import { authApi, categoriesApi } from '../api';

const COUNTRIES = [
  'RD Congo', 'Côte d\'Ivoire', 'Sénégal', 'Cameroun', 'Mali',
  'Burkina Faso', 'Niger', 'Guinée', 'Bénin', 'Togo',
  'Madagascar', 'Rwanda', 'Burundi', 'Congo', 'Gabon',
  'Mauritanie', 'Tchad', 'Centrafrique', 'Djibouti', 'Comores', 'Autre',
];

export function ProfileSetup({ onDone }: { onDone: () => void }) {
  const [companyName, setCompanyName] = useState('');
  const [country, setCountry] = useState('RD Congo');
  const [sector, setSector] = useState('');
  const [sectors, setSectors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    categoriesApi.getAll()
      .then(cats => setSectors(cats.map(c => c.name)))
      .catch(() => {});
  }, []);

  const handleSave = async () => {
    if (!companyName.trim()) return;
    setSaving(true);
    try {
      await authApi.saveProfile({ companyName: companyName.trim(), country, businessSector: sector || undefined });
      onDone();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}>
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="p-6 space-y-5">
          <div>
            <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center mb-3">
              <span className="text-white font-black text-lg">K</span>
            </div>
            <h2 className="font-black text-gray-900 text-xl">Bienvenue !</h2>
            <p className="text-sm text-gray-500 mt-1">
              Dites-nous en plus sur votre business pour personnaliser votre expérience.
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">
                Nom de votre boutique / entreprise *
              </label>
              <input
                value={companyName}
                onChange={e => setCompanyName(e.target.value)}
                placeholder="Ex: Boutique Mode Kinshasa"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Pays</label>
              <select
                value={country}
                onChange={e => setCountry(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            {sectors.length > 0 && (
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">
                  Secteur d'activité
                </label>
                <select
                  value={sector}
                  onChange={e => setSector(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                >
                  <option value="">Choisir...</option>
                  {sectors.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            )}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-100 rounded-xl px-3 py-2 text-sm text-red-600">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <button
              onClick={handleSave}
              disabled={saving || !companyName.trim()}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white py-3 rounded-xl text-sm font-semibold transition-colors"
            >
              {saving && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              Accéder au dashboard
            </button>
            <button
              onClick={onDone}
              className="text-xs text-gray-400 hover:text-gray-600 text-center w-full py-1 transition-colors"
            >
              Passer pour l'instant
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
