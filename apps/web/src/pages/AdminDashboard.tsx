import { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  AreaChart, Area, Cell, PieChart, Pie, Legend,
} from 'recharts';
import {
  Users, Wifi, WifiOff, MessageCircle, Package,
  ShoppingCart, TrendingUp, RefreshCw, Shield,
  Activity, CheckCircle2, Search, ChevronLeft, ChevronRight,
  Bot, BotOff, Tag, Plus, Trash2, Eye, EyeOff, Check, X,
  Building2, Download, DollarSign, ArrowDownCircle, Sparkles,
} from 'lucide-react';
import {
  adminApi,
  AdminOverview, AdminStats, AdminClient, AdminBusiness,
  RevenueDetail, SalesDetail, ExpensesDetail, ProductsDetail, UserDetail,
  GrowthPoint, FunnelStep, AdminAudienceContact, AdminLead, PagedResult,
} from '../api/admin';
import { categoriesApi, ProductCategory } from '../api';

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

function fmtNum(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + ' M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + ' k';
  return n.toLocaleString('fr-FR', { maximumFractionDigits: 0 });
}

const STATUS_COLORS: Record<string, string> = {
  paid: '#22c55e', pending: '#f59e0b', cancelled: '#ef4444',
};
const STATUS_LABELS: Record<string, string> = {
  paid: 'Payées', pending: 'En attente', cancelled: 'Annulées',
};

function KpiCard({ icon: Icon, label, value, sub, color, trend, onClick, active }: {
  icon: React.ElementType; label: string; value: string; sub?: string;
  color: string; trend?: { positive: boolean; label: string };
  onClick?: () => void; active?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-2xl border shadow-sm p-5 flex flex-col gap-3 transition-all
        ${onClick ? 'cursor-pointer hover:shadow-md' : ''}
        ${active ? 'ring-2 ring-indigo-500 border-indigo-200 shadow-md' : 'border-gray-100'}
      `}
    >
      <div className="flex items-start justify-between">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
          <Icon size={18} className="text-white" />
        </div>
        <div className="flex items-center gap-1.5">
          {trend && (
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${trend.positive ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'}`}>
              {trend.label}
            </span>
          )}
          {onClick && (
            <span className="text-xs text-gray-300 select-none">{active ? '▲' : '▼'}</span>
          )}
        </div>
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900 leading-tight">{value}</p>
        <p className="text-sm text-gray-500 mt-0.5">{label}</p>
        {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
      </div>
    </div>
  );
}

// ── Detail panel shell ────────────────────────────────────────────────────────

function DetailShell({ title, icon: Icon, onClose, loading, children }: {
  title: string; icon: React.ElementType; onClose: () => void;
  loading: boolean; children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-indigo-100 shadow-lg overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 bg-indigo-50/50">
        <div className="flex items-center gap-2">
          <Icon size={15} className="text-indigo-500" />
          <h3 className="font-semibold text-gray-900 text-sm">{title}</h3>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
          <X size={15} />
        </button>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-12 gap-2 text-gray-400 text-sm">
          <span className="w-5 h-5 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
          Chargement…
        </div>
      ) : children}
    </div>
  );
}

function MiniKpi({ label, value, color = 'text-gray-900' }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-gray-50 rounded-xl p-3">
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}

function SBadge({ status }: { status: string }) {
  const s: Record<string, string> = {
    paid: 'bg-green-100 text-green-700', pending: 'bg-amber-100 text-amber-700', cancelled: 'bg-red-100 text-red-500',
  };
  const l: Record<string, string> = { paid: 'Payée', pending: 'En attente', cancelled: 'Annulée' };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s[status] ?? 'bg-gray-100 text-gray-600'}`}>{l[status] ?? status}</span>;
}

// ── Detail: CA ────────────────────────────────────────────────────────────────

function DetailCA({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<RevenueDetail | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { adminApi.getRevenueDetail().then(setData).finally(() => setLoading(false)); }, []);

  const avgPerSale = data && data.byBusiness.reduce((s, b) => s + b.saleCount, 0) > 0
    ? data.byBusiness.reduce((s, b) => s + b.revenue, 0) / data.byBusiness.reduce((s, b) => s + b.saleCount, 0)
    : 0;

  return (
    <DetailShell title="Détail — Chiffre d'affaires" icon={DollarSign} onClose={onClose} loading={loading}>
      {data && (
        <div className="p-5 space-y-5">
          <div className="grid grid-cols-3 gap-3">
            <MiniKpi label="Businesses avec CA" value={data.byBusiness.filter(b => b.revenue > 0).length.toString()} />
            <MiniKpi label="CA moyen / vente" value={fmtNum(avgPerSale)} color="text-indigo-600" />
            <MiniKpi label="Canal principal" value={data.byChannel[0]?.channel ?? '—'} color="text-emerald-600" />
          </div>
          <div className="grid lg:grid-cols-2 gap-5">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">CA par canal</p>
              {data.byChannel.length > 0 ? (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={data.byChannel} layout="vertical" margin={{ left: 0, right: 20, top: 2, bottom: 2 }}>
                    <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={fmtNum} />
                    <YAxis type="category" dataKey="channel" tick={{ fontSize: 11 }} width={80} />
                    <Tooltip formatter={(v: number) => [fmtNum(v), 'CA']} />
                    <Bar dataKey="revenue" fill="#6366f1" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="text-sm text-gray-400 text-center py-8">Aucune donnée</p>}
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Top 20 ventes</p>
              <div className="overflow-auto max-h-52 rounded-xl border border-gray-100">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>{['Date', 'Business', 'Client', 'Canal', 'CA'].map(h => <th key={h} className="text-left px-3 py-2 font-semibold text-gray-500">{h}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {data.topSales.map(s => (
                      <tr key={s.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-400">{formatDate(s.date)}</td>
                        <td className="px-3 py-2 text-gray-700 max-w-[90px] truncate">{s.businessName ?? '—'}</td>
                        <td className="px-3 py-2 text-gray-600">{s.customer ?? '—'}</td>
                        <td className="px-3 py-2 text-gray-500">{s.channel}</td>
                        <td className="px-3 py-2 font-bold text-indigo-700">{fmtNum(s.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">CA par business</p>
            <div className="overflow-auto max-h-48 rounded-xl border border-gray-100">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>{['Business', 'Devise', 'CA', 'Ventes'].map(h => <th key={h} className="text-left px-3 py-2 font-semibold text-gray-500">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.byBusiness.map((b, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium text-gray-800">{b.name}</td>
                      <td className="px-3 py-2"><span className="px-1.5 py-0.5 rounded bg-gray-100 font-mono text-gray-600">{b.currency}</span></td>
                      <td className="px-3 py-2 font-bold text-indigo-700">{fmtNum(b.revenue)}</td>
                      <td className="px-3 py-2 text-gray-600">{b.saleCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </DetailShell>
  );
}

// ── Detail: Ventes ────────────────────────────────────────────────────────────

function DetailVentes({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<SalesDetail | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { adminApi.getSalesDetail().then(setData).finally(() => setLoading(false)); }, []);

  const channelTotals = data?.byChannel.reduce((acc, r) => {
    acc[r.channel] = (acc[r.channel] ?? 0) + r.count;
    return acc;
  }, {} as Record<string, number>) ?? {};
  const channelData = Object.entries(channelTotals).map(([channel, count]) => ({ channel, count })).sort((a, b) => b.count - a.count);

  return (
    <DetailShell title="Détail — Ventes" icon={ShoppingCart} onClose={onClose} loading={loading}>
      {data && (
        <div className="p-5 space-y-5">
          <div className="grid lg:grid-cols-2 gap-5">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Ventes par canal</p>
              {channelData.length > 0 ? (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={channelData} layout="vertical" margin={{ left: 0, right: 20, top: 2, bottom: 2 }}>
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="channel" tick={{ fontSize: 11 }} width={80} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#ec4899" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="text-sm text-gray-400 text-center py-8">Aucune donnée</p>}
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Statut par canal</p>
              <div className="overflow-auto max-h-52 rounded-xl border border-gray-100">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>{['Canal', 'Statut', 'Nb'].map(h => <th key={h} className="text-left px-3 py-2 font-semibold text-gray-500">{h}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {data.byChannel.map((r, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-700">{r.channel}</td>
                        <td className="px-3 py-2"><SBadge status={r.status} /></td>
                        <td className="px-3 py-2 font-semibold text-gray-800">{r.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">30 dernières ventes</p>
            <div className="overflow-auto max-h-56 rounded-xl border border-gray-100">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>{['Date', 'Business', 'Client', 'Canal', 'Statut', 'Total'].map(h => <th key={h} className="text-left px-3 py-2 font-semibold text-gray-500">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.recentSales.map(s => (
                    <tr key={s.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-400">{formatDate(s.date)}</td>
                      <td className="px-3 py-2 text-gray-700 max-w-[80px] truncate">{s.businessName ?? '—'}</td>
                      <td className="px-3 py-2 text-gray-600">{s.customer ?? '—'}</td>
                      <td className="px-3 py-2 text-gray-500">{s.channel}</td>
                      <td className="px-3 py-2"><SBadge status={s.status} /></td>
                      <td className="px-3 py-2 font-semibold text-gray-800">{fmtNum(s.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </DetailShell>
  );
}

// ── Detail: Dépenses ──────────────────────────────────────────────────────────

function DetailDepenses({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<ExpensesDetail | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { adminApi.getExpensesDetail().then(setData).finally(() => setLoading(false)); }, []);

  return (
    <DetailShell title="Détail — Dépenses" icon={ArrowDownCircle} onClose={onClose} loading={loading}>
      {data && (
        <div className="p-5 space-y-5">
          <div className="grid grid-cols-3 gap-3">
            <MiniKpi label="Catégorie principale" value={data.byCategory[0]?.category ?? '—'} />
            <MiniKpi label="Business le + dépensier" value={data.byBusiness[0]?.name ?? '—'} color="text-red-500" />
            <MiniKpi label="Nb transactions" value={data.byCategory.reduce((s, r) => s + r.count, 0).toString()} />
          </div>
          <div className="grid lg:grid-cols-2 gap-5">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Dépenses par catégorie</p>
              {data.byCategory.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={data.byCategory} layout="vertical" margin={{ left: 0, right: 20, top: 2, bottom: 2 }}>
                    <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={fmtNum} />
                    <YAxis type="category" dataKey="category" tick={{ fontSize: 10 }} width={100} />
                    <Tooltip formatter={(v: number) => [fmtNum(v), 'Total']} />
                    <Bar dataKey="total" fill="#f87171" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="text-sm text-gray-400 text-center py-8">Aucune donnée</p>}
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Par business</p>
              <div className="overflow-auto max-h-52 rounded-xl border border-gray-100">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>{['Business', 'Total', 'Nb'].map(h => <th key={h} className="text-left px-3 py-2 font-semibold text-gray-500">{h}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {data.byBusiness.map((b, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-medium text-gray-800">{b.name}</td>
                        <td className="px-3 py-2 font-bold text-red-500">{fmtNum(b.total)}</td>
                        <td className="px-3 py-2 text-gray-500">{b.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">25 dernières dépenses</p>
            <div className="overflow-auto max-h-48 rounded-xl border border-gray-100">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>{['Date', 'Business', 'Catégorie', 'Description', 'Montant'].map(h => <th key={h} className="text-left px-3 py-2 font-semibold text-gray-500">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.recent.map(e => (
                    <tr key={e.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-400">{formatDate(e.date)}</td>
                      <td className="px-3 py-2 text-gray-700 max-w-[80px] truncate">{e.businessName ?? '—'}</td>
                      <td className="px-3 py-2"><span className="px-1.5 py-0.5 rounded bg-red-50 text-red-600">{e.category}</span></td>
                      <td className="px-3 py-2 text-gray-500 max-w-[120px] truncate">{e.description || '—'}</td>
                      <td className="px-3 py-2 font-bold text-red-500">{fmtNum(e.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </DetailShell>
  );
}

// ── Detail: Bénéfice ──────────────────────────────────────────────────────────

function DetailBenefice({ topBusinesses, onClose }: { topBusinesses: AdminOverview['topBusinesses']; onClose: () => void }) {
  const sorted = [...topBusinesses].sort((a, b) => b.profit - a.profit);
  const profitable = sorted.filter(b => b.profit > 0).length;

  return (
    <DetailShell title="Détail — Bénéfice net" icon={Sparkles} onClose={onClose} loading={false}>
      <div className="p-5 space-y-5">
        <div className="grid grid-cols-3 gap-3">
          <MiniKpi label="Businesses bénéficiaires" value={profitable.toString()} color="text-emerald-600" />
          <MiniKpi label="Businesses en déficit" value={(sorted.length - profitable).toString()} color="text-red-500" />
          <MiniKpi label="Meilleur bénéfice" value={sorted[0] ? `${sorted[0].name}: ${fmtNum(sorted[0].profit)}` : '—'} color="text-emerald-600" />
        </div>
        <div className="grid lg:grid-cols-2 gap-5">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Bénéfice par business</p>
            {sorted.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={sorted} layout="vertical" margin={{ left: 0, right: 20, top: 2, bottom: 2 }}>
                  <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={fmtNum} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={90} />
                  <Tooltip formatter={(v: number) => [fmtNum(v), 'Bénéfice']} />
                  <Bar dataKey="profit" radius={[0, 4, 4, 0]}>
                    {sorted.map((b, i) => <Cell key={i} fill={b.profit >= 0 ? '#22c55e' : '#ef4444'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="text-sm text-gray-400 text-center py-8">Aucune donnée</p>}
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">CA vs Dépenses vs Bénéfice</p>
            <div className="overflow-auto max-h-56 rounded-xl border border-gray-100">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>{['Business', 'Devise', 'CA', 'Dépenses', 'Bénéfice'].map(h => <th key={h} className="text-left px-3 py-2 font-semibold text-gray-500">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {sorted.map(b => (
                    <tr key={b.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium text-gray-800 max-w-[80px] truncate">{b.name}</td>
                      <td className="px-3 py-2"><span className="px-1.5 py-0.5 rounded bg-gray-100 font-mono text-gray-500">{b.currency}</span></td>
                      <td className="px-3 py-2 text-indigo-700 font-semibold">{fmtNum(b.revenue)}</td>
                      <td className="px-3 py-2 text-red-500">{fmtNum(b.expenseTotal)}</td>
                      <td className={`px-3 py-2 font-bold ${b.profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {b.profit >= 0 ? '+' : ''}{fmtNum(b.profit)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </DetailShell>
  );
}

// ── Detail: Produits ──────────────────────────────────────────────────────────

function DetailProduits({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<ProductsDetail | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { adminApi.getProductsDetail().then(setData).finally(() => setLoading(false)); }, []);

  return (
    <DetailShell title="Détail — Produits" icon={Package} onClose={onClose} loading={loading}>
      {data && (
        <div className="p-5 space-y-5">
          <div className="grid grid-cols-3 gap-3">
            <MiniKpi label="Produits en stock" value={data.activeCount.toString()} color="text-emerald-600" />
            <MiniKpi label="Produits épuisés" value={data.lowStockCount.toString()} color="text-red-500" />
            <MiniKpi label="Total catalogués" value={(data.activeCount + data.lowStockCount).toString()} />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Top 25 produits par CA généré</p>
            <div className="overflow-auto max-h-64 rounded-xl border border-gray-100">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>{['#', 'Produit', 'Business', 'CA', 'Qté vendue', 'Stock'].map(h => <th key={h} className="text-left px-3 py-2 font-semibold text-gray-500">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.topByRevenue.map((p, i) => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                      <td className="px-3 py-2 font-medium text-gray-800 max-w-[120px] truncate">{p.name}</td>
                      <td className="px-3 py-2 text-gray-500 max-w-[80px] truncate">{p.businessName ?? '—'}</td>
                      <td className="px-3 py-2 font-bold text-indigo-700">{fmtNum(p.revenue)}</td>
                      <td className="px-3 py-2 text-gray-600">{p.qtySold.toLocaleString()}</td>
                      <td className={`px-3 py-2 font-semibold ${p.stock <= 0 ? 'text-red-500' : 'text-emerald-600'}`}>{p.stock}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </DetailShell>
  );
}

// ── Detail: Utilisateurs ──────────────────────────────────────────────────────

function DetailUsers({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<UserDetail[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  useEffect(() => { adminApi.getUsersDetail().then(setData).finally(() => setLoading(false)); }, []);

  const filtered = (data ?? []).filter(u =>
    !search || u.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <DetailShell title="Détail — Utilisateurs" icon={Users} onClose={onClose} loading={loading}>
      {data && (
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <MiniKpi label="Total utilisateurs" value={data.length.toString()} />
            <MiniKpi label="Avec WA connecté" value={data.filter(u => u.waConnected).length.toString()} color="text-green-600" />
            <MiniKpi label="Sans business" value={data.filter(u => u.businessCount === 0).length.toString()} color="text-amber-500" />
          </div>
          <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 border border-gray-200">
            <Search size={13} className="text-gray-400 shrink-0" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Filtrer par email…"
              className="flex-1 bg-transparent outline-none text-sm text-gray-700 placeholder-gray-400" />
          </div>
          <div className="overflow-auto max-h-64 rounded-xl border border-gray-100">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 sticky top-0">
                <tr>{['Email', 'Businesses', 'WhatsApp', 'Inscrit le'].map(h => <th key={h} className="text-left px-3 py-2 font-semibold text-gray-500">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(u => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium text-gray-800">{u.email}</td>
                    <td className="px-3 py-2">
                      {u.businesses.length > 0
                        ? <span className="text-gray-600">{u.businesses.slice(0, 2).join(', ')}{u.businesses.length > 2 ? ` +${u.businesses.length - 2}` : ''}</span>
                        : <span className="text-gray-300">—</span>
                      }
                    </td>
                    <td className="px-3 py-2"><WaBadge connected={u.waConnected} /></td>
                    <td className="px-3 py-2 text-gray-400">{formatDate(u.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </DetailShell>
  );
}

type DetailKey = 'ca' | 'depenses' | 'benefice' | 'ventes' | 'users' | 'produits' | null;

function TabOverview({ overview, refreshing, onRefresh }: {
  overview: AdminOverview; refreshing: boolean; onRefresh: () => void;
}) {
  const { totalRevenue, totalExpenses, netProfit, totalSalesCount, salesBreakdown,
    totalProducts, totalUsers, totalBusinesses, waConnected, revenueByDay, topBusinesses } = overview;

  const [detail, setDetail] = useState<DetailKey>(null);
  const toggle = (key: DetailKey) => setDetail(d => d === key ? null : key);

  const paidRate = totalSalesCount > 0
    ? ((salesBreakdown.paid / totalSalesCount) * 100).toFixed(0)
    : '0';

  const pieData = Object.entries(salesBreakdown)
    .filter(([, v]) => v > 0)
    .map(([status, value]) => ({ name: STATUS_LABELS[status] ?? status, value, status }));

  return (
    <div className="space-y-4">

      {/* Row 1 — Activité commerciale */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Activité commerciale — toutes devises · <span className="text-indigo-400 normal-case font-normal">Cliquez sur une carte pour les détails</span></p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard icon={DollarSign} color="bg-indigo-500"
            label="Chiffre d'affaires" value={fmtNum(totalRevenue)}
            sub={`${salesBreakdown.paid.toLocaleString()} ventes payées`}
            onClick={() => toggle('ca')} active={detail === 'ca'} />
          <KpiCard icon={ArrowDownCircle} color="bg-red-400"
            label="Dépenses" value={fmtNum(totalExpenses)}
            sub="Total toutes dépenses"
            onClick={() => toggle('depenses')} active={detail === 'depenses'} />
          <KpiCard icon={Sparkles} color={netProfit >= 0 ? 'bg-emerald-500' : 'bg-orange-500'}
            label="Bénéfice net" value={fmtNum(netProfit)}
            sub={netProfit >= 0 ? 'CA − dépenses' : 'Déficit'}
            trend={netProfit >= 0 ? { positive: true, label: '+ positif' } : { positive: false, label: '− déficit' }}
            onClick={() => toggle('benefice')} active={detail === 'benefice'} />
          <KpiCard icon={ShoppingCart} color="bg-pink-500"
            label="Total ventes" value={totalSalesCount.toLocaleString()}
            sub={`${paidRate}% converties en payé`}
            onClick={() => toggle('ventes')} active={detail === 'ventes'} />
        </div>
      </div>

      {/* Detail panels — row 1 */}
      {detail === 'ca'       && <DetailCA        onClose={() => setDetail(null)} />}
      {detail === 'depenses' && <DetailDepenses   onClose={() => setDetail(null)} />}
      {detail === 'benefice' && <DetailBenefice   topBusinesses={topBusinesses} onClose={() => setDetail(null)} />}
      {detail === 'ventes'   && <DetailVentes     onClose={() => setDetail(null)} />}

      {/* Row 2 — Plateforme */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Plateforme</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard icon={Users}     color="bg-violet-500" label="Utilisateurs"        value={totalUsers.toLocaleString()}
            onClick={() => toggle('users')} active={detail === 'users'} />
          <KpiCard icon={Building2} color="bg-blue-500"   label="Businesses"          value={totalBusinesses.toLocaleString()} sub={`${waConnected} WA connectés`} />
          <KpiCard icon={Wifi}      color="bg-green-500"  label="WA connectés"        value={waConnected.toLocaleString()} sub={`sur ${totalBusinesses} businesses`} />
          <KpiCard icon={Package}   color="bg-cyan-500"   label="Produits catalogués" value={totalProducts.toLocaleString()}
            onClick={() => toggle('produits')} active={detail === 'produits'} />
        </div>
      </div>

      {/* Detail panels — row 2 */}
      {detail === 'users'    && <DetailUsers     onClose={() => setDetail(null)} />}
      {detail === 'produits' && <DetailProduits  onClose={() => setDetail(null)} />}

      {/* Charts */}
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">CA — 30 derniers jours</h3>
            <button onClick={onRefresh} disabled={refreshing}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 disabled:opacity-40">
              <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} /> Actualiser
            </button>
          </div>
          {revenueByDay.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={revenueByDay} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                <defs>
                  <linearGradient id="gradCA" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" tick={{ fontSize: 10 }}
                  tickFormatter={d => new Date(d).toLocaleDateString('fr', { day: '2-digit', month: '2-digit' })} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => fmtNum(v)} />
                <Tooltip
                  labelFormatter={d => new Date(d).toLocaleDateString('fr', { day: '2-digit', month: 'long' })}
                  formatter={(v: number, name: string) => [name === 'revenue' ? fmtNum(v) : v, name === 'revenue' ? 'CA' : 'Ventes']}
                />
                <Area type="monotone" dataKey="revenue" stroke="#6366f1" fill="url(#gradCA)" strokeWidth={2} name="revenue" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center text-gray-400 text-sm">Aucune vente payée sur 30 jours</div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="font-semibold text-gray-900 mb-4">Ventes par statut</h3>
          {pieData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" cx="50%" cy="50%" innerRadius={45} outerRadius={70}>
                    {pieData.map(entry => <Cell key={entry.status} fill={STATUS_COLORS[entry.status] ?? '#6366f1'} />)}
                  </Pie>
                  <Tooltip formatter={(v: number, _n, p) => [v, p.payload.name]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 mt-3">
                {pieData.map(d => (
                  <div key={d.status} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: STATUS_COLORS[d.status] }} />
                      <span className="text-gray-600">{d.name}</span>
                    </span>
                    <span className="font-semibold text-gray-800">{d.value.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="h-48 flex items-center justify-center text-gray-400 text-sm">Aucune vente</div>
          )}
        </div>
      </div>

      {/* Top businesses */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Top businesses par CA</h3>
          <p className="text-xs text-gray-400 mt-0.5">Montants en devise locale, non convertis</p>
        </div>
        {topBusinesses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-2">
            <Building2 size={30} className="opacity-20" />
            <p className="text-sm">Aucun business avec des ventes</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['#', 'Business', 'Devise', 'CA', 'Ventes', 'Dépenses', 'Bénéfice', 'Produits'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {topBusinesses.map((b, i) => (
                  <tr key={b.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3.5 text-xs text-gray-400 font-mono">{i + 1}</td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        {b.logoUrl
                          ? <img src={b.logoUrl} alt="" className="w-7 h-7 rounded-lg object-cover shrink-0 border border-gray-100" />
                          : <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0 text-indigo-400 text-xs font-bold">{b.name[0]}</div>}
                        <span className="font-medium text-gray-800 whitespace-nowrap">{b.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5"><span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs font-mono">{b.currency}</span></td>
                    <td className="px-4 py-3.5 font-bold text-indigo-700 whitespace-nowrap">{fmtNum(b.revenue)}</td>
                    <td className="px-4 py-3.5 text-gray-700">{b.saleCount.toLocaleString()}</td>
                    <td className="px-4 py-3.5 text-red-500 whitespace-nowrap">{fmtNum(b.expenseTotal)}</td>
                    <td className={`px-4 py-3.5 font-semibold whitespace-nowrap ${b.profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {b.profit >= 0 ? '+' : ''}{fmtNum(b.profit)}
                    </td>
                    <td className="px-4 py-3.5 text-gray-600">{b.productCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
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

// ── Tab: Catégories produits ──────────────────────────────────────────────────

function TabCategories() {
  const [cats, setCats] = useState<ProductCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [seeding, setSeeding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setCats(await categoriesApi.getAllAdmin()); }
    catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSeed = async () => {
    setSeeding(true);
    try { await categoriesApi.seed(); await load(); }
    catch (e: any) { setError(e.message); }
    finally { setSeeding(false); }
  };

  const handleAdd = async () => {
    if (!newName.trim()) return;
    setAdding(true);
    try { await categoriesApi.create(newName.trim()); setNewName(''); await load(); }
    catch (e: any) { setError(e.message); }
    finally { setAdding(false); }
  };

  const handleToggle = async (cat: ProductCategory) => {
    setSaving(cat.id);
    try { await categoriesApi.update(cat.id, { active: !cat.active }); await load(); }
    catch (e: any) { setError(e.message); }
    finally { setSaving(null); }
  };

  const handleRename = async (id: string) => {
    if (!editName.trim()) return;
    setSaving(id);
    try { await categoriesApi.update(id, { name: editName.trim() }); setEditId(null); await load(); }
    catch (e: any) { setError(e.message); }
    finally { setSaving(null); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer cette catégorie ?')) return;
    setSaving(id);
    try { await categoriesApi.remove(id); await load(); }
    catch (e: any) { setError(e.message); }
    finally { setSaving(null); }
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 flex items-center justify-between">
          {error}
          <button onClick={() => setError(null)}><X size={14} /></button>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Tag size={16} className="text-indigo-500" />
            <h3 className="font-semibold text-gray-900">Catégories produits ({cats.length})</h3>
          </div>
          <div className="flex gap-2">
            {cats.length === 0 && !loading && (
              <button onClick={handleSeed} disabled={seeding}
                className="flex items-center gap-1.5 text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                {seeding ? <RefreshCw size={12} className="animate-spin" /> : <Plus size={12} />}
                Initialiser les catégories
              </button>
            )}
          </div>
        </div>

        {/* Ajouter */}
        <div className="px-5 py-3 border-b border-gray-50 flex gap-2">
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            placeholder="Nouvelle catégorie..."
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-300"
          />
          <button onClick={handleAdd} disabled={adding || !newName.trim()}
            className="flex items-center gap-1.5 text-sm bg-indigo-600 text-white px-3 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors">
            <Plus size={14} /> Ajouter
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-gray-400 gap-2">
            <span className="w-5 h-5 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
            Chargement…
          </div>
        ) : cats.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-2">
            <Tag size={32} className="opacity-20" />
            <p className="text-sm">Aucune catégorie. Cliquez sur "Initialiser" pour ajouter les catégories par défaut.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {cats.map(cat => (
              <div key={cat.id} className={`flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors ${!cat.active ? 'opacity-50' : ''}`}>
                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: cat.active ? '#6366f1' : '#d1d5db' }} />

                {editId === cat.id ? (
                  <input
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleRename(cat.id); if (e.key === 'Escape') setEditId(null); }}
                    autoFocus
                    className="flex-1 border border-indigo-300 rounded-lg px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                ) : (
                  <span
                    className="flex-1 text-sm text-gray-800 cursor-pointer hover:text-indigo-600"
                    onDoubleClick={() => { setEditId(cat.id); setEditName(cat.name); }}>
                    {cat.name}
                    <span className="ml-2 text-xs text-gray-400 font-mono">{cat.slug}</span>
                  </span>
                )}

                <div className="flex items-center gap-1 shrink-0">
                  {editId === cat.id ? (
                    <>
                      <button onClick={() => handleRename(cat.id)} disabled={saving === cat.id}
                        className="p-1.5 rounded-lg bg-green-50 text-green-600 hover:bg-green-100">
                        <Check size={13} />
                      </button>
                      <button onClick={() => setEditId(null)}
                        className="p-1.5 rounded-lg bg-gray-50 text-gray-400 hover:bg-gray-100">
                        <X size={13} />
                      </button>
                    </>
                  ) : (
                    <button onClick={() => { setEditId(cat.id); setEditName(cat.name); }}
                      className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 text-xs">
                      Renommer
                    </button>
                  )}
                  <button onClick={() => handleToggle(cat)} disabled={saving === cat.id}
                    className={`p-1.5 rounded-lg transition-colors ${cat.active ? 'text-green-600 hover:bg-green-50' : 'text-gray-400 hover:bg-gray-100'}`}
                    title={cat.active ? 'Désactiver' : 'Activer'}>
                    {cat.active ? <Eye size={14} /> : <EyeOff size={14} />}
                  </button>
                  <button onClick={() => handleDelete(cat.id)} disabled={saving === cat.id}
                    className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="px-5 py-3 border-t border-gray-50 text-xs text-gray-400">
          Double-cliquez sur un nom pour le renommer. Les catégories désactivées n'apparaissent pas dans le formulaire produit.
        </div>
      </div>
    </div>
  );
}

// ── Tab: Businesses ───────────────────────────────────────────────────────────

function TabBusinesses() {
  const [businesses, setBusinesses] = useState<AdminBusiness[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    adminApi.getBusinesses()
      .then(setBusinesses)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = businesses.filter(b => {
    const q = search.toLowerCase();
    return !q
      || b.name.toLowerCase().includes(q)
      || (b.ownerEmail ?? '').toLowerCase().includes(q)
      || (b.city ?? '').toLowerCase().includes(q)
      || b.whatsappPhone.includes(q);
  });

  function exportCsv() {
    const headers = ['Nom', 'Propriétaire', 'Secteur', 'Ville', 'Pays', 'Devise', 'WA Phone', 'Phone', 'WA Connecté', 'Produits', 'Ventes', 'Créé le'];
    const rows = filtered.map(b => [
      b.name,
      b.ownerEmail ?? '',
      b.sector ?? '',
      b.city ?? '',
      b.country,
      b.currency,
      b.whatsappPhone,
      b.phone ?? '',
      b.waConnected ? 'Oui' : 'Non',
      b.productCount,
      b.saleCount,
      formatDate(b.createdAt),
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `businesses-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Building2 size={16} className="text-indigo-500" />
            <h3 className="font-semibold text-gray-900">Businesses ({filtered.length})</h3>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 border border-gray-200 min-w-[200px]">
              <Search size={13} className="text-gray-400 shrink-0" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Nom, email, ville, WA…"
                className="flex-1 bg-transparent outline-none text-sm text-gray-700 placeholder-gray-400" />
            </div>
            <button onClick={exportCsv}
              className="flex items-center gap-1.5 text-xs px-3 py-2 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors">
              <Download size={13} /> Export CSV
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-14 text-gray-400 gap-2">
            <span className="w-5 h-5 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
            Chargement…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-gray-400 gap-2">
            <Building2 size={32} className="opacity-20" />
            <p className="text-sm">Aucun business trouvé</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['Business', 'Propriétaire', 'Secteur', 'Ville', 'Devise', 'WA Phone', 'WhatsApp', 'Produits', 'Ventes', 'Créé le'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(b => (
                  <tr key={b.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {b.logoUrl
                          ? <img src={b.logoUrl} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0 border border-gray-100" />
                          : <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0">
                              <Building2 size={14} className="text-indigo-400" />
                            </div>
                        }
                        <div>
                          <p className="font-medium text-gray-800 whitespace-nowrap">{b.name}</p>
                          {b.isDefault && <span className="text-[10px] text-indigo-500 font-semibold">Par défaut</span>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{b.ownerEmail ?? '—'}</td>
                    <td className="px-4 py-3">
                      {b.sector
                        ? <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 text-xs whitespace-nowrap">{b.sector}</span>
                        : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">{b.city ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs font-mono">{b.currency}</span>
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-gray-600 whitespace-nowrap">{b.whatsappPhone}</td>
                    <td className="px-4 py-3"><WaBadge connected={b.waConnected} /></td>
                    <td className="px-4 py-3 font-semibold text-gray-700 text-center">{b.productCount}</td>
                    <td className="px-4 py-3 font-semibold text-gray-700 text-center">{b.saleCount}</td>
                    <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{formatDate(b.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'audience' | 'leads' | 'categories' | 'businesses';

export function AdminDashboard() {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [clients, setClients] = useState<AdminClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<Tab>('overview');

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const [ov, s, c] = await Promise.all([
        adminApi.getOverview(),
        adminApi.getStats(),
        adminApi.getClients(),
      ]);
      setOverview(ov);
      setStats(s);
      setClients(c);
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
    { id: 'overview',    label: '📊 Vue générale' },
    { id: 'audience',    label: '👥 Audience',   count: stats?.totalAudience },
    { id: 'leads',       label: '💬 Leads CRM',  count: stats?.totalCrmContacts },
    { id: 'businesses',  label: '🏢 Businesses', count: overview?.totalBusinesses },
    { id: 'categories',  label: '🏷 Catégories' },
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
        <TabOverview overview={overview!} refreshing={refreshing} onRefresh={() => load(true)} />
      )}
      {tab === 'audience' && <TabAudience clients={clients} />}
      {tab === 'leads' && <TabLeads clients={clients} />}
      {tab === 'businesses' && <TabBusinesses />}
      {tab === 'categories' && <TabCategories />}
    </div>
  );
}
