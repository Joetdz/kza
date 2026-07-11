import { useState } from 'react';
import { Plus } from 'lucide-react';

const DRC_CITIES = [
  'Kinshasa', 'Lubumbashi', 'Kolwezi', 'Likasi', 'Mbuji-Mayi', 'Kananga',
  'Kisangani', 'Goma', 'Bukavu', 'Uvira', 'Kalemie', 'Matadi', 'Butembo',
  'Beni', 'Tshikapa', 'Kikwit', 'Mbandaka', 'Isiro', 'Bunia', 'Mwene-Ditu',
];

const STORAGE_KEY = 'kza_custom_cities';

function getCustomCities(): string[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'); } catch { return []; }
}

function saveCustomCity(city: string) {
  const existing = getCustomCities();
  if (!existing.includes(city)) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...existing, city]));
  }
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  label?: string;
  required?: boolean;
}

export function CitySelect({ value, onChange, label = 'Ville', required }: Props) {
  const [customCities, setCustomCities] = useState<string[]>(getCustomCities);
  const [showInput, setShowInput] = useState(false);
  const [newCity, setNewCity] = useState('');

  const allCities = [...DRC_CITIES, ...customCities];
  const valueInList = allCities.includes(value);

  function handleSelect(v: string) {
    if (v === '__other__') {
      setShowInput(true);
    } else {
      setShowInput(false);
      onChange(v);
    }
  }

  function handleAdd() {
    const city = newCity.trim();
    if (!city) return;
    saveCustomCity(city);
    setCustomCities(getCustomCities());
    onChange(city);
    setNewCity('');
    setShowInput(false);
  }

  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1">
        {label}{required && ' *'}
      </label>
      <select
        value={valueInList ? value : (value ? value : '')}
        onChange={e => handleSelect(e.target.value)}
        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
      >
        <option value="">— Sélectionner</option>
        {allCities.map(c => (
          <option key={c} value={c}>{c}</option>
        ))}
        {!valueInList && value && (
          <option value={value}>{value}</option>
        )}
        <option value="__other__">➕ Ajouter une ville...</option>
      </select>

      {showInput && (
        <div className="flex gap-2 mt-2">
          <input
            type="text"
            value={newCity}
            onChange={e => setNewCity(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            placeholder="Nom de la ville"
            autoFocus
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <button
            type="button"
            onClick={handleAdd}
            className="flex items-center gap-1 px-3 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700"
          >
            <Plus size={14} /> Ajouter
          </button>
        </div>
      )}
    </div>
  );
}
