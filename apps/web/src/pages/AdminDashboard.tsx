import { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  AreaChart, Area, Cell,
} from 'recharts';
import {
  Users, Wifi, WifiOff, MessageCircle, Package,
  ShoppingCart, TrendingUp, RefreshCw, Shield,
  Activity, CheckCircle2, Search, ChevronLeft, ChevronRight,
  Bot, BotOff,
} from 'lucide-react';
import {
  adminApi,
  AdminStats, AdminClient, GrowthPoint, FunnelStep,
  AdminAudienceContact, AdminLead, PagedResult,
} from '../api/admin';

// ── Palette ───────────────────────────────────────────────────────────────────

const FUNNEL_COLORS: Record<string, string> = {
  cold: '#94a3b8', warm: '#60a5fa', hot: '#f97316', converted: '#22c55e', lost: '#ef4444',
};
const FUNNEL_LABELS: Record<string, string> = {
  cold: '❄️ Froid', warm: '⭐ Tiède', hot: '🔥 Chaud', converted: '✅ Converti', lost: '❌ Perdu',
};
const LEAD_STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  cold:      { bg: 'bg-gray-100',   text: 'text-gray-600' },
  warm:      { bg: 'bg-blue-100',   text: 'text-blue-700' },
  hot:       { bg: 'bg-orange-100', text: 'text-orange-700' },
  converted: { bg: 'bg-green-100',  text: 'text-green-700' },
  lost:      { bg: 'bg-red-100',    text: 'text-red-700' },
};
const CONSENT_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  unknown: { bg: 'bg-gray-100',  text: 'text-gray-500',  label: 'Inconnu' },
  granted: { bg: 'bg-green-100', text: 'text-green-700', label: 'Accordé' },
  revoked: { bg: 'bg-red-100',   text: 'text-red-700',   label: 'Révoqué' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatPhone(p: string) { return p.replace(/@s\.whatsapp\.net|@c\.us/g, ''); }
function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr', { day: '2-digit', month: '2-digit', year: '2-digit' });
}
function formatDateTime(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub, color = 'bg-indigo-500' }: {
  icon: React.ElementType; label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-start gap-4">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
        <Icon size={20} className="text-white" />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900 leading-none">
          {typeof value === 'number' ? value.toLocaleString() : value}
        </p>
        <p className="text-sm text-gray-500 mt-1">{label}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function WaBadge({ connected }: { connected: boolean }) {
  return connected
    ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700"><Wifi size={11} />Connecté</span>
    : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500"><WifiOff size={11} />Déconnecté</span>;
}

function Pagination({ page, total, limit, onPage }: { page: number; total: number; limit: number; onPage: (p: number) => void }) {
  const totalPages = Math.ceil(total / limit);
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 text-sm text-gray-500">
      <span>Page {page}/{totalPages} — {total.toLocaleString()} entrées</span>
      <div className="flex gap-2">
        <button onClick={() => onPage(page - 1)} disabled={page === 1}
          className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40">
          <ChevronLeft size={15} />
        </button>
        <button onClick={() => onPage(page + 1)} disabled={page === totalPages}
          className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40">
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}

// ── Tab: Vue générale ─────────────────────────────────────────────────────────

function TabOverview({ stats, clients, growth, funnel, refreshing, onRefresh }: {
  stats: AdminStats; clients: AdminClient[]; growth: GrowthPoint[]; funnel: FunnelStep[];
  refreshing: boolean; onRefresh: () => void;
}) {
  const conversionRate = stats.totalLeads > 0
    ? ((stats.leadsBreakdown.converted ?? 0) / stats.totalLeads * 100).toFixed(1)
    : '0';

  return (
    <div className="space-y-8">
      {/* KPIs plateforme */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Plateforme</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Users}         label="Clients enregistrés"   value={stats.totalClients}     color="bg-indigo-500" />
          <StatCard icon={Wifi}          label="WhatsApp connectés"     value={stats.waConnected}      color="bg-green-500" sub={`sur ${stats.totalClients} comptes`} />
          <StatCard icon={MessageCircle} label="Contacts CRM"           value={stats.totalCrmContacts} color="bg-blue-500" />
          <StatCard icon={Activity}      label="Contacts audience"      value={stats.totalAudience}    color="bg-violet-500" />
        </div>
      </div>

      {/* KPIs activité */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Activité globale</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={TrendingUp}   label="Total leads"           value={stats.totalLeads}    color="bg-amber-500" />
          <StatCard icon={CheckCircle2} label="Taux de conversion"    value={`${conversionRate}%`} color="bg-emerald-500" sub={`${stats.leadsBreakdown.converted ?? 0} convertis`} />
          <StatCard icon={Package}      label="Produits enregistrés"  value={stats.totalProducts} color="bg-cyan-500" />
          <StatCard icon={ShoppingCart} label="Ventes enregistrées"   value={stats.totalSales}    color="bg-pink-500" />
        </div>
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="font-semibold text-gray-900 mb-4">Croissance audience — 30 derniers jours</h3>
          {growth.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={growth} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                <defs>
                  <linearGradient id="gradAud" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={d => new Date(d).toLocaleDateString('fr', { day: '2-digit', month: '2-digit' })} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip labelFormatter={d => new Date(d).toLocaleDateString('fr', { day: '2-digit', month: 'long' })} formatter={(v: number) => [v, 'Nouveaux contacts']} />
                <Area type="monotone" dataKey="count" stroke="#6366f1" fill="url(#gradAud)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center text-gray-400 text-sm">Aucune donnée sur 30 jours</div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="font-semibold text-gray-900 mb-4">Funnel leads — tous clients</h3>
          {funnel.some(f => f.count > 0) ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={funnel} layout="vertical" margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="status" tick={{ fontSize: 11 }} tickFormatter={s => FUNNEL_LABELS[s] ?? s} width={90} />
                <Tooltip formatter={(v: number, _n, p) => [v, FUNNEL_LABELS[p.payload.status] ?? p.payload.status]} />
                <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                  {funnel.map(e => <Cell key={e.status} fill={FUNNEL_COLORS[e.status] ?? '#6366f1'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center text-gray-400 text-sm">Aucun lead enregistré</div>
          )}
        </div>
      </div>

      {/* Clients table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Clients ({clients.length})</h3>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400">{clients.filter(c => c.waConnected).length} WhatsApp actifs</span>
            <button onClick={onRefresh} disabled={refreshing}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 disabled:opacity-40">
              <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} /> Actualiser
            </button>
          </div>
        </div>
        {clients.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-gray-400 gap-2">
            <Users size={32} className="opacity-30" />
            <p className="text-sm">Aucun client enregistré</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['Client', 'WhatsApp', 'Secteur', 'Audience', 'Leads CRM', 'Dernière activité'].map(h => (
                    <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {clients.map(c => (
                  <tr key={c.userId} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-gray-800">{c.companyName ?? 'Sans nom'}</p>
                      <p className="text-xs text-gray-400 font-mono mt-0.5">{c.userId.slice(0, 16)}…</p>
                    </td>
                    <td className="px-5 py-3.5">
                      <WaBadge connected={c.waConnected} />
                      {c.waPhone && <p className="text-xs text-gray-500 font-mono mt-1">{c.waPhone}</p>}
                    </td>
                    <td className="px-5 py-3.5">
                      {c.businessSector
                        ? <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 text-xs">{c.businessSector}</span>
                        : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                    <td className="px-5 py-3.5 font-semibold text-gray-800">{c.audienceCount.toLocaleString()}</td>
                    <td className="px-5 py-3.5 font-semibold text-gray-800">{c.crmContactCount.toLocaleString()}</td>
                    <td className="px-5 py-3.5 text-xs text-gray-400">{formatDateTime(c.lastSeenAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent syncs */}
      {stats.recentSyncs.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="font-semibold text-gray-900 mb-4">Dernières synchronisations</h3>
          <div className="space-y-2">
            {stats.recentSyncs.map((s, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                <div className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
                <span className="text-gray-500 font-mono text-xs">{s.clientId.slice(0, 16)}…</span>
                {s.waAccountId && <span className="text-gray-400 text-xs">({s.waAccountId})</span>}
                <span className="ml-auto text-xs text-gray-400">{formatDateTime(s.syncedAt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab: Audience contacts ────────────────────────────────────────────────────

function TabAudience({ clients }: { clients: AdminClient[] }) {
  const [result, setResult] = useState<PagedResult<AdminAudienceContact> | null>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filterClient, setFilterClient] = useState('');
  const [filterConsent, setFilterConsent] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const res = await adminApi.getContacts({
        page: p, limit: 50,
        search: search || undefined,
        clientId: filterClient || undefined,
        consentStatus: filterConsent || undefined,
        contactStatus: filterStatus || undefined,
      });
      setResult(res);
      setPage(p);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [search, filterClient, filterConsent, filterStatus]);

  useEffect(() => { load(1); }, [load]);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2 flex-1 min-w-[200px] bg-gray-50 rounded-lg px-3 py-2 border border-gray-200">
          <Search size={13} className="text-gray-400 shrink-0" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Numéro, nom, secteur…"
            className="flex-1 bg-transparent outline-none text-sm text-gray-700 placeholder-gray-400" />
        </div>
        <select value={filterClient} onChange={e => setFilterClient(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 outline-none">
          <option value="">Tous les clients</option>
          {clients.map(c => <option key={c.userId} value={c.userId}>{c.companyName ?? c.userId.slice(0, 12)}</option>)}
        </select>
        <select value={filterConsent} onChange={e => setFilterConsent(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 outline-none">
          <option value="">Consentement : Tous</option>
          <option value="unknown">Inconnu</option>
          <option value="granted">Accordé</option>
          <option value="revoked">Révoqué</option>
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 outline-none">
          <option value="">Statut : Tous</option>
          <option value="active">Actif</option>
          <option value="blocked">Bloqué</option>
          <option value="unsubscribed">Désabonné</option>
        </select>
        {result && <span className="ml-auto text-xs text-gray-400">{result.total.toLocaleString()} contacts</span>}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400 text-sm gap-3">
            <span className="w-5 h-5 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
            Chargement…
          </div>
        ) : !result || result.data.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-2">
            <Users size={32} className="opacity-30" />
            <p className="text-sm">Aucun contact trouvé</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    {['', 'Contact', 'Client', 'Compte WA', 'Secteur', 'Consentement', 'Statut', 'Source', 'Synchronisé', 'Créé le'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {result.data.map(c => (
                    <>
                      <tr key={c.id}
                        className="hover:bg-indigo-50/40 transition-colors cursor-pointer"
                        onClick={() => setExpanded(expanded === c.id ? null : c.id)}>
                        {/* Expand toggle */}
                        <td className="px-3 py-3 text-gray-400 text-xs">{expanded === c.id ? '▼' : '▶'}</td>
                        {/* Contact */}
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-800">{c.displayName ?? '—'}</p>
                          <p className="text-xs text-gray-400 font-mono">{formatPhone(c.phoneNumber)}</p>
                        </td>
                        {/* Client */}
                        <td className="px-4 py-3">
                          <p className="text-gray-700">{c.clientCompany ?? '—'}</p>
                          <p className="text-xs text-gray-400 font-mono">{c.clientId.slice(0, 10)}…</p>
                        </td>
                        {/* WA account */}
                        <td className="px-4 py-3 text-xs text-gray-500 font-mono">{c.waAccountId ?? '—'}</td>
                        {/* Sector */}
                        <td className="px-4 py-3">
                          {c.businessSector
                            ? <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 text-xs">{c.businessSector}</span>
                            : <span className="text-gray-300 text-xs">—</span>}
                        </td>
                        {/* Consent */}
                        <td className="px-4 py-3">
                          {(() => { const s = CONSENT_STYLE[c.consentStatus] ?? CONSENT_STYLE.unknown; return (
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>{s.label}</span>
                          ); })()}
                        </td>
                        {/* Status */}
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            c.contactStatus === 'active' ? 'bg-blue-100 text-blue-700'
                            : c.contactStatus === 'blocked' ? 'bg-orange-100 text-orange-700'
                            : 'bg-gray-100 text-gray-500'
                          }`}>{c.contactStatus}</span>
                        </td>
                        {/* Source */}
                        <td className="px-4 py-3 text-xs text-gray-500">{c.source}</td>
                        {/* Synced at */}
                        <td className="px-4 py-3 text-xs text-gray-400">{formatDate(c.syncedAt)}</td>
                        {/* Created at */}
                        <td className="px-4 py-3 text-xs text-gray-400">{formatDate(c.createdAt)}</td>
                      </tr>

                      {/* Expanded detail row */}
                      {expanded === c.id && (
                        <tr key={`${c.id}-detail`} className="bg-indigo-50/60">
                          <td colSpan={10} className="px-8 py-4">
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 text-xs">
                              {[
                                { label: 'ID contact', value: c.id },
                                { label: 'ID client', value: c.clientId },
                                { label: 'Numéro complet', value: c.phoneNumber },
                                { label: 'Compte WA', value: c.waAccountId ?? '—' },
                                { label: 'Secteur (contact)', value: c.businessSector ?? '—' },
                                { label: 'Secteur (client)', value: c.clientSector ?? '—' },
                                { label: 'Consentement', value: c.consentStatus },
                                { label: 'Statut', value: c.contactStatus },
                                { label: 'Source', value: c.source },
                                { label: 'Dernier contact', value: formatDateTime(c.lastContactedAt) },
                                { label: 'Synchronisé le', value: formatDateTime(c.syncedAt) },
                                { label: 'Créé le', value: formatDateTime(c.createdAt) },
                                { label: 'Mis à jour', value: formatDateTime(c.updatedAt) },
                              ].map(({ label, value }) => (
                                <div key={label}>
                                  <p className="font-semibold text-gray-500 mb-0.5">{label}</p>
                                  <p className="text-gray-800 break-all font-mono">{value}</p>
                                </div>
                              ))}
                              {c.tags.length > 0 && (
                                <div>
                                  <p className="font-semibold text-gray-500 mb-1">Tags</p>
                                  <div className="flex flex-wrap gap-1">
                                    {c.tags.map(t => <span key={t} className="px-1.5 py-0.5 rounded bg-gray-200 text-gray-700">{t}</span>)}
                                  </div>
                                </div>
                              )}
                              {c.segments.length > 0 && (
                                <div>
                                  <p className="font-semibold text-gray-500 mb-1">Segments</p>
                                  <div className="flex flex-wrap gap-1">
                                    {c.segments.map(s => <span key={s} className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700">{s}</span>)}
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} total={result.total} limit={result.limit} onPage={p => load(p)} />
          </>
        )}
      </div>
    </div>
  );
}

// ── Tab: CRM Leads ────────────────────────────────────────────────────────────

function TabLeads({ clients }: { clients: AdminClient[] }) {
  const [result, setResult] = useState<PagedResult<AdminLead> | null>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filterClient, setFilterClient] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const res = await adminApi.getLeads({
        page: p, limit: 50,
        search: search || undefined,
        clientId: filterClient || undefined,
        leadStatus: filterStatus || undefined,
      });
      setResult(res);
      setPage(p);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [search, filterClient, filterStatus]);

  useEffect(() => { load(1); }, [load]);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2 flex-1 min-w-[200px] bg-gray-50 rounded-lg px-3 py-2 border border-gray-200">
          <Search size={13} className="text-gray-400 shrink-0" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Numéro, nom, produit, ville…"
            className="flex-1 bg-transparent outline-none text-sm text-gray-700 placeholder-gray-400" />
        </div>
        <select value={filterClient} onChange={e => setFilterClient(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 outline-none">
          <option value="">Tous les clients</option>
          {clients.map(c => <option key={c.userId} value={c.userId}>{c.companyName ?? c.userId.slice(0, 12)}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 outline-none">
          <option value="">Statut : Tous</option>
          {['cold','warm','hot','converted','lost'].map(s => (
            <option key={s} value={s}>{FUNNEL_LABELS[s]}</option>
          ))}
        </select>
        {result && <span className="ml-auto text-xs text-gray-400">{result.total.toLocaleString()} leads</span>}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400 text-sm gap-3">
            <span className="w-5 h-5 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
            Chargement…
          </div>
        ) : !result || result.data.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-2">
            <MessageCircle size={32} className="opacity-30" />
            <p className="text-sm">Aucun lead trouvé</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    {['', 'Contact', 'Client', 'Statut', 'Score', 'Produit', 'Budget', 'Ville', 'Agent', 'IA', 'Dernier msg'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {result.data.map(lead => (
                    <>
                      <tr key={lead.id}
                        className="hover:bg-indigo-50/40 transition-colors cursor-pointer"
                        onClick={() => setExpanded(expanded === lead.id ? null : lead.id)}>
                        <td className="px-3 py-3 text-gray-400 text-xs">{expanded === lead.id ? '▼' : '▶'}</td>
                        {/* Contact */}
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-800">{lead.leadName ?? lead.displayName ?? '—'}</p>
                          <p className="text-xs text-gray-400 font-mono">{formatPhone(lead.phone)}</p>
                        </td>
                        {/* Client */}
                        <td className="px-4 py-3 text-gray-700 text-xs">{lead.clientCompany ?? lead.userId.slice(0, 10) + '…'}</td>
                        {/* Status */}
                        <td className="px-4 py-3">
                          {(() => { const s = LEAD_STATUS_STYLE[lead.leadStatus] ?? LEAD_STATUS_STYLE.cold; return (
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>
                              {FUNNEL_LABELS[lead.leadStatus] ?? lead.leadStatus}
                            </span>
                          ); })()}
                        </td>
                        {/* Score */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 rounded-full bg-gray-100">
                              <div className="h-1.5 rounded-full transition-all"
                                style={{ width: `${lead.leadScore}%`, background: lead.leadScore > 60 ? '#f97316' : lead.leadScore > 30 ? '#60a5fa' : '#94a3b8' }} />
                            </div>
                            <span className="text-xs font-semibold text-gray-700">{lead.leadScore}</span>
                          </div>
                        </td>
                        {/* Product */}
                        <td className="px-4 py-3 text-xs text-gray-600 max-w-[120px] truncate">{lead.leadProduct ?? '—'}</td>
                        {/* Budget */}
                        <td className="px-4 py-3 text-xs text-gray-600">{lead.leadBudget ?? '—'}</td>
                        {/* City */}
                        <td className="px-4 py-3 text-xs text-gray-600">{lead.leadCity ?? '—'}</td>
                        {/* Agent */}
                        <td className="px-4 py-3 text-xs text-gray-600">{lead.assignedAgent ?? '—'}</td>
                        {/* AI */}
                        <td className="px-4 py-3">
                          {lead.aiEnabled
                            ? <Bot size={14} className="text-green-500" />
                            : <BotOff size={14} className="text-gray-300" />}
                        </td>
                        {/* Last msg */}
                        <td className="px-4 py-3 text-xs text-gray-400">{formatDate(lead.lastMessageAt)}</td>
                      </tr>

                      {/* Expanded detail */}
                      {expanded === lead.id && (
                        <tr key={`${lead.id}-detail`} className="bg-indigo-50/60">
                          <td colSpan={11} className="px-8 py-4">
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 text-xs">
                              {[
                                { label: 'ID lead',        value: lead.id },
                                { label: 'ID client',      value: lead.userId },
                                { label: 'Numéro WA',      value: formatPhone(lead.phone) },
                                { label: 'Nom affiché',    value: lead.displayName ?? '—' },
                                { label: 'Nom lead',       value: lead.leadName ?? '—' },
                                { label: 'Besoin',         value: lead.leadNeed ?? '—' },
                                { label: 'Budget',         value: lead.leadBudget ?? '—' },
                                { label: 'Ville',          value: lead.leadCity ?? '—' },
                                { label: 'Urgence',        value: lead.leadUrgency ?? '—' },
                                { label: 'Produit',        value: lead.leadProduct ?? '—' },
                                { label: 'Score',          value: String(lead.leadScore) },
                                { label: 'Statut lead',    value: FUNNEL_LABELS[lead.leadStatus] ?? lead.leadStatus },
                                { label: 'Agent assigné',  value: lead.assignedAgent ?? '—' },
                                { label: 'IA activée',     value: lead.aiEnabled ? 'Oui' : 'Non' },
                                { label: 'Source',         value: lead.source ?? '—' },
                                { label: 'Dernier msg',    value: formatDateTime(lead.lastMessageAt) },
                                { label: 'Créé le',        value: formatDateTime(lead.createdAt) },
                              ].map(({ label, value }) => (
                                <div key={label}>
                                  <p className="font-semibold text-gray-500 mb-0.5">{label}</p>
                                  <p className="text-gray-800 break-all">{value}</p>
                                </div>
                              ))}
                              {lead.tags.length > 0 && (
                                <div>
                                  <p className="font-semibold text-gray-500 mb-1">Tags</p>
                                  <div className="flex flex-wrap gap-1">
                                    {lead.tags.map(t => (
                                      <span key={t.tag.id} className="px-1.5 py-0.5 rounded text-xs text-white" style={{ background: t.tag.color }}>{t.tag.name}</span>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} total={result.total} limit={result.limit} onPage={p => load(p)} />
          </>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'audience' | 'leads';

export function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [clients, setClients] = useState<AdminClient[]>([]);
  const [growth, setGrowth] = useState<GrowthPoint[]>([]);
  const [funnel, setFunnel] = useState<FunnelStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<Tab>('overview');

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const [s, c, g, f] = await Promise.all([
        adminApi.getStats(),
        adminApi.getClients(),
        adminApi.getAudienceGrowth(),
        adminApi.getLeadFunnel(),
      ]);
      setStats(s);
      setClients(c);
      setGrowth(g);
      setFunnel(f);
    } catch (e: any) {
      setError(e.message ?? 'Erreur de chargement');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 gap-3 text-gray-400">
        <span className="w-6 h-6 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
        Chargement du dashboard admin…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-gray-500">
        <Shield size={40} className="text-red-400" />
        <p className="font-medium text-red-600">{error}</p>
        <p className="text-sm text-gray-400">Vérifiez que votre email est dans ADMIN_EMAILS</p>
      </div>
    );
  }

  const TABS: { id: Tab; label: string; count?: number }[] = [
    { id: 'overview', label: '📊 Vue générale' },
    { id: 'audience', label: '👥 Audience', count: stats?.totalAudience },
    { id: 'leads',    label: '💬 Leads CRM', count: stats?.totalCrmContacts },
  ];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Shield size={18} className="text-indigo-600" />
            <span className="text-xs font-semibold text-indigo-600 uppercase tracking-wide">Admin SaaS</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard Général</h1>
          <p className="text-sm text-gray-500 mt-0.5">Vue d'ensemble de tous les clients de la plateforme</p>
        </div>
        <button onClick={() => load(true)} disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border border-gray-200 hover:bg-gray-50 text-gray-600 transition-colors disabled:opacity-50">
          <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
          Actualiser
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.id
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className={`px-1.5 py-0.5 rounded-full text-xs ${tab === t.id ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-500'}`}>
                {t.count.toLocaleString()}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'overview' && (
        <TabOverview stats={stats!} clients={clients} growth={growth} funnel={funnel} refreshing={refreshing} onRefresh={() => load(true)} />
      )}
      {tab === 'audience' && <TabAudience clients={clients} />}
      {tab === 'leads' && <TabLeads clients={clients} />}
    </div>
  );
}
