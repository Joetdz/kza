import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Search, Users, ShieldCheck, Activity, ChevronLeft, ChevronRight } from 'lucide-react';
import { waApi } from '../../api/whatsapp';
import { useWhatsApp } from '../../hooks/useWhatsApp';

// ── Types ─────────────────────────────────────────────────────────────────────

interface CampaignContact {
  id: string;
  phoneNumber: string;
  displayName: string | null;
  waAccountId: string | null;
  businessSector: string | null;
  source: string;
  syncedAt: string | null;
  consentStatus: string;
  contactStatus: string;
  tags: string[];
  segments: string[];
  lastContactedAt: string | null;
  createdAt: string;
}

// ── Badges ────────────────────────────────────────────────────────────────────

const CONSENT_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  unknown:  { bg: 'bg-gray-100',   text: 'text-gray-600',  label: 'Inconnu' },
  granted:  { bg: 'bg-green-100',  text: 'text-green-700', label: 'Accordé' },
  revoked:  { bg: 'bg-red-100',    text: 'text-red-700',   label: 'Révoqué' },
};

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  active:       { bg: 'bg-blue-100',   text: 'text-blue-700',   label: 'Actif' },
  blocked:      { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Bloqué' },
  unsubscribed: { bg: 'bg-gray-100',   text: 'text-gray-600',   label: 'Désabonné' },
};

function ConsentBadge({ value }: { value: string }) {
  const s = CONSENT_STYLES[value] ?? CONSENT_STYLES.unknown;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  );
}

function StatusBadge({ value }: { value: string }) {
  const s = STATUS_STYLES[value] ?? STATUS_STYLES.active;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  );
}

function formatPhone(phone: string) {
  return phone.replace('@s.whatsapp.net', '').replace('@c.us', '');
}

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({ icon: Icon, label, value, color }: {
  icon: React.ElementType; label: string; value: number; color: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-4 shadow-sm">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
        <Icon size={18} className="text-white" />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value.toLocaleString()}</p>
        <p className="text-xs text-gray-500">{label}</p>
      </div>
    </div>
  );
}

// ── Inline select for consent / status update ─────────────────────────────────

function InlineSelect({
  value, options, onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="text-xs border border-gray-200 rounded px-1.5 py-0.5 bg-white text-gray-700 outline-none focus:ring-1 focus:ring-indigo-400"
      onClick={e => e.stopPropagation()}
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const LIMIT = 50;

export function Audience() {
  const { audienceSync } = useWhatsApp();

  const [contacts, setContacts] = useState<CampaignContact[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  const [search, setSearch] = useState('');
  const [filterConsent, setFilterConsent] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const [stats, setStats] = useState({ total: 0, active: 0, consented: 0, segments: [] as string[] });
  const [syncing, setSyncing] = useState(false);

  const loadStats = useCallback(() => {
    waApi.getAudienceStats().then(setStats).catch(() => {});
  }, []);

  const loadContacts = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const res = await waApi.getAudience({
        page: p, limit: LIMIT,
        search: search || undefined,
        consentStatus: filterConsent || undefined,
        contactStatus: filterStatus || undefined,
      });
      setContacts(res.data);
      setTotal(res.total);
      setPage(p);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [search, filterConsent, filterStatus]);

  // Initial load + reload on filter change
  useEffect(() => { loadContacts(1); }, [loadContacts]);

  // Reload stats when audience sync completes
  useEffect(() => {
    if (audienceSync.status === 'done') {
      loadStats();
      loadContacts(1);
    }
  }, [audienceSync.status]);

  useEffect(() => { loadStats(); }, [loadStats]);

  const handleSync = async () => {
    setSyncing(true);
    try { await waApi.syncAudience(); } catch { /* ignore */ } finally { setSyncing(false); }
  };

  const handleUpdateContact = async (id: string, data: Partial<CampaignContact>) => {
    try {
      const updated = await waApi.updateAudienceContact(id, data);
      setContacts(prev => prev.map(c => c.id === id ? { ...c, ...updated } : c));
    } catch { /* ignore */ }
  };

  const totalPages = Math.ceil(total / LIMIT);
  const syncPct = audienceSync.total > 0
    ? Math.round((audienceSync.done / audienceSync.total) * 100)
    : 0;

  return (
    <div className="p-4 sm:p-6 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Audience</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Contacts synchronisés depuis WhatsApp — base pour les futures campagnes
          </p>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing || audienceSync.status === 'syncing'}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          <RefreshCw size={15} className={syncing || audienceSync.status === 'syncing' ? 'animate-spin' : ''} />
          Synchroniser
        </button>
      </div>

      {/* Sync progress bar */}
      {audienceSync.status === 'syncing' && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-indigo-700 font-medium flex items-center gap-2">
              <span className="w-3.5 h-3.5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              Synchronisation en cours…
            </span>
            <span className="text-indigo-600 font-semibold">{audienceSync.done} / {audienceSync.total}</span>
          </div>
          <div className="w-full bg-indigo-100 rounded-full h-1.5">
            <div
              className="h-1.5 rounded-full bg-indigo-600 transition-all duration-300"
              style={{ width: `${syncPct}%` }}
            />
          </div>
        </div>
      )}

      {audienceSync.status === 'done' && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700 font-medium">
          ✅ {audienceSync.done.toLocaleString()} contacts synchronisés avec succès
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard icon={Users}       label="Total contacts"  value={stats.total}     color="bg-indigo-500" />
        <KpiCard icon={Activity}    label="Contacts actifs" value={stats.active}    color="bg-blue-500" />
        <KpiCard icon={ShieldCheck} label="Consentement accordé" value={stats.consented} color="bg-green-500" />
      </div>

      {/* Filters */}
      <div className="bg-white border border-gray-100 rounded-xl p-4 flex flex-wrap gap-3 items-center shadow-sm">
        {/* Search */}
        <div className="flex items-center gap-2 flex-1 min-w-[200px] bg-gray-50 rounded-lg px-3 py-2 border border-gray-200">
          <Search size={14} className="text-gray-400 shrink-0" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher par numéro ou nom…"
            className="flex-1 bg-transparent outline-none text-sm text-gray-700 placeholder-gray-400"
          />
        </div>

        {/* Consent filter */}
        <select
          value={filterConsent}
          onChange={e => setFilterConsent(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 outline-none focus:ring-2 focus:ring-indigo-300"
        >
          <option value="">Consentement : Tous</option>
          <option value="unknown">Inconnu</option>
          <option value="granted">Accordé</option>
          <option value="revoked">Révoqué</option>
        </select>

        {/* Status filter */}
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 outline-none focus:ring-2 focus:ring-indigo-300"
        >
          <option value="">Statut : Tous</option>
          <option value="active">Actif</option>
          <option value="blocked">Bloqué</option>
          <option value="unsubscribed">Désabonné</option>
        </select>

        <span className="text-xs text-gray-400 ml-auto">{total.toLocaleString()} résultat{total > 1 ? 's' : ''}</span>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
            <span className="w-5 h-5 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin mr-3" />
            Chargement…
          </div>
        ) : contacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-3">
            <Users size={36} className="opacity-30" />
            <p className="text-sm">Aucun contact trouvé</p>
            {stats.total === 0 && (
              <p className="text-xs text-center max-w-xs">
                Connectez votre WhatsApp et cliquez sur "Synchroniser" pour importer vos contacts.
              </p>
            )}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Contact</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Numéro</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Consentement</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Statut</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Segments</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Synchronisé le</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {contacts.map(c => (
                <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-800">{c.displayName ?? '—'}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-600 font-mono text-xs">
                    {formatPhone(c.phoneNumber)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <ConsentBadge value={c.consentStatus} />
                      <InlineSelect
                        value={c.consentStatus}
                        options={[
                          { value: 'unknown', label: 'Inconnu' },
                          { value: 'granted', label: 'Accordé' },
                          { value: 'revoked', label: 'Révoqué' },
                        ]}
                        onChange={v => handleUpdateContact(c.id, { consentStatus: v })}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <StatusBadge value={c.contactStatus} />
                      <InlineSelect
                        value={c.contactStatus}
                        options={[
                          { value: 'active', label: 'Actif' },
                          { value: 'blocked', label: 'Bloqué' },
                          { value: 'unsubscribed', label: 'Désabonné' },
                        ]}
                        onChange={v => handleUpdateContact(c.id, { contactStatus: v })}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {c.segments.length > 0
                        ? c.segments.map(s => (
                            <span key={s} className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 text-xs">{s}</span>
                          ))
                        : <span className="text-gray-300 text-xs">—</span>
                      }
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs hidden lg:table-cell">
                    {formatDate(c.syncedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>
            Page {page} sur {totalPages} — {total.toLocaleString()} contacts
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => loadContacts(page - 1)}
              disabled={page === 1 || loading}
              className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => loadContacts(page + 1)}
              disabled={page === totalPages || loading}
              className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
