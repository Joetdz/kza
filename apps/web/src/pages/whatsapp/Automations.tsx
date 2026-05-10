import { useEffect, useState } from 'react';
import { Plus, Trash2, Zap } from 'lucide-react';
import { waApi } from '../../api/whatsapp';

const TRIGGERS = [
  { value: 'welcome',      label: 'Premier message' },
  { value: 'keyword',      label: 'Mot-clé détecté' },
  { value: 'no_reply',     label: 'Pas de réponse après X heures' },
  { value: 'out_of_hours', label: 'Message hors horaires' },
  { value: 'lead_status',  label: 'Statut lead change' },
  { value: 'tag_added',    label: 'Tag ajouté' },
];

const ACTIONS = [
  { value: 'send_message', label: 'Envoyer un message' },
  { value: 'assign_agent', label: 'Assigner à un agent' },
  { value: 'change_status', label: 'Changer statut lead' },
  { value: 'add_tag',      label: 'Ajouter un tag' },
  { value: 'disable_ai',   label: 'Désactiver l\'IA' },
];

const LEAD_STATUSES = ['cold', 'warm', 'hot', 'converted', 'lost'];

export function Automations() {
  const [automations, setAutomations] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: '',
    enabled: true,
    trigger: 'welcome',
    triggerConfig: {} as any,
    action: 'send_message',
    actionConfig: {} as any,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    waApi.getAutomations().then(setAutomations).catch(() => {});
  }, []);

  const toggleEnabled = async (id: string, enabled: boolean) => {
    const updated = await waApi.updateAutomation(id, { enabled });
    setAutomations(prev => prev.map(a => a.id === id ? updated : a));
  };

  const deleteAuto = async (id: string) => {
    await waApi.deleteAutomation(id);
    setAutomations(prev => prev.filter(a => a.id !== id));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const created = await waApi.createAutomation(form);
      setAutomations(prev => [created, ...prev]);
      setShowForm(false);
      setForm({ name: '', enabled: true, trigger: 'welcome', triggerConfig: {}, action: 'send_message', actionConfig: {} });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-gray-900">Automatisations</h2>
          <p className="text-xs text-gray-500">Règles déclenchées automatiquement</p>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors"
        >
          <Plus size={16} /> Nouvelle règle
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
          <h3 className="font-semibold text-gray-900 text-sm">Nouvelle automatisation</h3>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Nom</label>
            <input
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="Ex: Message de bienvenue"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Déclencheur</label>
              <select
                value={form.trigger}
                onChange={e => setForm({ ...form, trigger: e.target.value, triggerConfig: {} })}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
              >
                {TRIGGERS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Action</label>
              <select
                value={form.action}
                onChange={e => setForm({ ...form, action: e.target.value, actionConfig: {} })}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
              >
                {ACTIONS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </div>
          </div>

          {/* Trigger config */}
          {form.trigger === 'keyword' && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Mots-clés (séparés par des virgules)</label>
              <input
                placeholder="prix, tarif, disponible"
                onChange={e => setForm({ ...form, triggerConfig: { keywords: e.target.value.split(',').map(k => k.trim()).filter(Boolean) } })}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
          )}
          {form.trigger === 'no_reply' && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Délai (heures)</label>
              <input type="number" min={1} placeholder="24"
                onChange={e => setForm({ ...form, triggerConfig: { delayHours: +e.target.value } })}
                className="w-40 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
          )}
          {form.trigger === 'lead_status' && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Statut</label>
              <select onChange={e => setForm({ ...form, triggerConfig: { status: e.target.value } })}
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400">
                {LEAD_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}

          {/* Action config */}
          {form.action === 'send_message' && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Message à envoyer</label>
              <textarea rows={3}
                placeholder="Bonjour ! Merci de nous contacter..."
                onChange={e => setForm({ ...form, actionConfig: { message: e.target.value } })}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
              />
            </div>
          )}
          {form.action === 'assign_agent' && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Email ou nom de l'agent</label>
              <input onChange={e => setForm({ ...form, actionConfig: { agentEmail: e.target.value } })}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
          )}
          {form.action === 'change_status' && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Nouveau statut</label>
              <select onChange={e => setForm({ ...form, actionConfig: { status: e.target.value } })}
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400">
                {LEAD_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button onClick={handleSave} disabled={saving || !form.name.trim()}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white py-2 rounded-xl text-sm font-medium transition-colors">
              {saving ? 'Sauvegarde...' : 'Créer'}
            </button>
            <button onClick={() => setShowForm(false)}
              className="px-4 bg-gray-100 hover:bg-gray-200 text-gray-600 py-2 rounded-xl text-sm transition-colors">
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* List */}
      <div className="space-y-3">
        {automations.length === 0 && (
          <div className="text-center py-12 text-gray-400 text-sm bg-white rounded-2xl border border-gray-100">
            Aucune automatisation. Clique sur "Nouvelle règle" pour commencer.
          </div>
        )}
        {automations.map(a => (
          <div key={a.id} className="bg-white rounded-2xl border border-gray-100 px-4 py-3 flex items-center gap-3">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${a.enabled ? 'bg-indigo-100' : 'bg-gray-100'}`}>
              <Zap size={16} className={a.enabled ? 'text-indigo-600' : 'text-gray-400'} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-900">{a.name}</div>
              <div className="text-xs text-gray-400">
                {TRIGGERS.find(t => t.value === a.trigger)?.label} → {ACTIONS.find(ac => ac.value === a.action)?.label}
              </div>
            </div>
            {/* Toggle */}
            <div
              onClick={() => toggleEnabled(a.id, !a.enabled)}
              className={`w-10 h-5 rounded-full transition-colors cursor-pointer ${a.enabled ? 'bg-indigo-600' : 'bg-gray-200'}`}
            >
              <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform mt-0.5 ${a.enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </div>
            <button onClick={() => deleteAuto(a.id)} className="text-gray-400 hover:text-red-500 transition-colors p-1">
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
