import { useEffect, useState } from 'react';
import { Bot, Save, Plus, X, Clock } from 'lucide-react';
import { waApi } from '../../api/whatsapp';

const DAYS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

export function AIConfig() {
  const [config, setConfig] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [newBlacklist, setNewBlacklist] = useState('');
  const [newEscalation, setNewEscalation] = useState('');

  useEffect(() => {
    waApi.getAiConfig().then(setConfig).catch(() => {});
  }, []);

  const save = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const updated = await waApi.updateAiConfig(config);
      setConfig(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const toggleDay = (day: number) => {
    const hours = config.activeHours ? [...config.activeHours] : [];
    const idx = hours.findIndex((h: any) => h.day === day);
    if (idx >= 0) {
      hours.splice(idx, 1);
    } else {
      hours.push({ day, from: '08:00', to: '18:00' });
    }
    setConfig({ ...config, activeHours: hours });
  };

  const updateDayTime = (day: number, field: 'from' | 'to', value: string) => {
    const hours = [...(config.activeHours ?? [])];
    const idx = hours.findIndex((h: any) => h.day === day);
    if (idx >= 0) hours[idx] = { ...hours[idx], [field]: value };
    setConfig({ ...config, activeHours: hours });
  };

  if (!config) return (
    <div className="flex items-center justify-center h-40">
      <span className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
            <Bot size={20} className="text-indigo-600" />
          </div>
          <div>
            <h2 className="font-bold text-gray-900">Agent IA WhatsApp</h2>
            <p className="text-xs text-gray-500">Configure le comportement de ton IA</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-sm text-gray-600">IA activée</span>
            <div
              onClick={() => setConfig({ ...config, enabled: !config.enabled })}
              className={`w-11 h-6 rounded-full transition-colors cursor-pointer ${config.enabled ? 'bg-indigo-600' : 'bg-gray-200'}`}
            >
              <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform mt-0.5 ${config.enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </div>
          </label>
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors"
          >
            <Save size={14} />
            {saved ? 'Sauvegardé ✓' : saving ? 'Sauvegarde...' : 'Sauvegarder'}
          </button>
        </div>
      </div>

      {/* Identité */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
        <h3 className="font-semibold text-gray-900 text-sm">Identité de l'agent</h3>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Prompt système</label>
          <textarea
            rows={4}
            value={config.systemPrompt}
            onChange={e => setConfig({ ...config, systemPrompt: e.target.value })}
            placeholder="Ex: Tu es un assistant commercial pour une boutique de smartphones à Kinshasa..."
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Objectif business</label>
            <input
              value={config.businessObjective}
              onChange={e => setConfig({ ...config, businessObjective: e.target.value })}
              placeholder="Ex: Qualifier des prospects et générer des ventes"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Personnalité de marque</label>
            <input
              value={config.brandPersonality}
              onChange={e => setConfig({ ...config, brandPersonality: e.target.value })}
              placeholder="Ex: Chaleureux, professionnel, concis"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Langue principale</label>
          <select
            value={config.primaryLanguage}
            onChange={e => setConfig({ ...config, primaryLanguage: e.target.value })}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
          >
            <option value="fr">Français</option>
            <option value="en">English</option>
            <option value="sw">Swahili</option>
            <option value="ln">Lingala</option>
          </select>
        </div>
      </div>

      {/* Sujets exclus */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
        <h3 className="font-semibold text-gray-900 text-sm">Sujets à éviter (liste noire)</h3>
        <div className="flex flex-wrap gap-2">
          {(config.blacklistTopics ?? []).map((topic: string, i: number) => (
            <span key={i} className="flex items-center gap-1 bg-red-100 text-red-700 text-xs px-2 py-1 rounded-full">
              {topic}
              <button onClick={() => setConfig({ ...config, blacklistTopics: config.blacklistTopics.filter((_: any, j: number) => j !== i) })}>
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={newBlacklist}
            onChange={e => setNewBlacklist(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && newBlacklist.trim()) { setConfig({ ...config, blacklistTopics: [...(config.blacklistTopics ?? []), newBlacklist.trim()] }); setNewBlacklist(''); }}}
            placeholder="Ajouter un sujet..."
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <button
            onClick={() => { if (newBlacklist.trim()) { setConfig({ ...config, blacklistTopics: [...(config.blacklistTopics ?? []), newBlacklist.trim()] }); setNewBlacklist(''); }}}
            className="bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-2 rounded-xl text-sm transition-colors"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>

      {/* Escalade */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
        <h3 className="font-semibold text-gray-900 text-sm">Escalade vers humain</h3>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Mots-clés déclencheurs</label>
          <div className="flex flex-wrap gap-2 mb-2">
            {(config.escalationKeywords ?? []).map((kw: string, i: number) => (
              <span key={i} className="flex items-center gap-1 bg-orange-100 text-orange-700 text-xs px-2 py-1 rounded-full">
                {kw}
                <button onClick={() => setConfig({ ...config, escalationKeywords: config.escalationKeywords.filter((_: any, j: number) => j !== i) })}>
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={newEscalation}
              onChange={e => setNewEscalation(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && newEscalation.trim()) { setConfig({ ...config, escalationKeywords: [...(config.escalationKeywords ?? []), newEscalation.trim()] }); setNewEscalation(''); }}}
              placeholder="Ex: remboursement, arnaque, urgent..."
              className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <button onClick={() => { if (newEscalation.trim()) { setConfig({ ...config, escalationKeywords: [...(config.escalationKeywords ?? []), newEscalation.trim()] }); setNewEscalation(''); }}}
              className="bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-2 rounded-xl text-sm transition-colors">
              <Plus size={16} />
            </button>
          </div>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Message d'escalade</label>
          <input
            value={config.escalationMessage}
            onChange={e => setConfig({ ...config, escalationMessage: e.target.value })}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>
      </div>

      {/* Horaires */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Clock size={16} className="text-indigo-500" />
          <h3 className="font-semibold text-gray-900 text-sm">Horaires d'activation</h3>
          <span className="text-xs text-gray-400">(laisse vide = toujours actif)</span>
        </div>
        <div className="space-y-2">
          {DAYS.map((day, i) => {
            const schedule = (config.activeHours ?? []).find((h: any) => h.day === i);
            const active = !!schedule;
            return (
              <div key={i} className="flex items-center gap-3">
                <button
                  onClick={() => toggleDay(i)}
                  className={`w-12 text-xs font-semibold py-1 rounded-lg transition-colors ${active ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-400'}`}
                >
                  {day}
                </button>
                {active && (
                  <div className="flex items-center gap-2 text-sm">
                    <input type="time" value={schedule.from} onChange={e => updateDayTime(i, 'from', e.target.value)}
                      className="border border-gray-200 rounded-lg px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-indigo-400" />
                    <span className="text-gray-400">—</span>
                    <input type="time" value={schedule.to} onChange={e => updateDayTime(i, 'to', e.target.value)}
                      className="border border-gray-200 rounded-lg px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-indigo-400" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Message hors horaires</label>
          <input
            value={config.outsideHoursMessage}
            onChange={e => setConfig({ ...config, outsideHoursMessage: e.target.value })}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>
      </div>

      {/* Comportement */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
        <h3 className="font-semibold text-gray-900 text-sm">Comportement</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Délai simulé (ms)</label>
            <input
              type="number" min={0} max={10000}
              value={config.simulatedDelayMs}
              onChange={e => setConfig({ ...config, simulatedDelayMs: +e.target.value })}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <div className="text-xs text-gray-400 mt-1">Temps avant envoi de réponse</div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Seuil de confiance (0-1)</label>
            <input
              type="number" min={0} max={1} step={0.05}
              value={config.confidenceThreshold}
              onChange={e => setConfig({ ...config, confidenceThreshold: +e.target.value })}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <div className="text-xs text-gray-400 mt-1">Score minimum pour répondre</div>
          </div>
        </div>
      </div>
    </div>
  );
}
