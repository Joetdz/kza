import { useMemo, useState } from 'react';
import { Download, FileSpreadsheet, FileText, RefreshCw, CheckCircle } from 'lucide-react';
import { useStore } from '../store/useStore';
import { computeProductAnalytics, computeGlobalKpis } from '../utils/calculations';
import { exportToExcel } from '../utils/exportExcel';
import { exportAnalyticsPdf } from '../utils/exportPdf';
import { useCurrency } from '../hooks/useCurrency';

export function Export() {
  const { products, sales, expenses, goals, dateRange, cpaThreshold, hydrate } = useStore();
  const { fmt: MAD } = useCurrency();
  const { from, to } = dateRange;
  const [exporting, setExporting] = useState<string | null>(null);
  const [showReset, setShowReset] = useState(false);

  const analytics = useMemo(
    () => computeProductAnalytics(products, sales, expenses, cpaThreshold, from, to),
    [products, sales, expenses, cpaThreshold, from, to]
  );

  const kpis = useMemo(
    () => computeGlobalKpis(products, sales, expenses, from, to),
    [products, sales, expenses, from, to]
  );

  const handleExcel = async () => {
    setExporting('excel');
    try {
      exportToExcel(products, sales, expenses, analytics);
    } finally {
      setTimeout(() => setExporting(null), 1500);
    }
  };

  const handlePdf = async () => {
    setExporting('pdf');
    try {
      exportAnalyticsPdf(analytics, kpis);
    } finally {
      setTimeout(() => setExporting(null), 1500);
    }
  };

  const stats = {
    products: products.length,
    sales: sales.length,
    expenses: expenses.length,
    goals: goals.length,
    totalRevenue: kpis.totalRevenue,
    netProfit: kpis.netProfit,
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Export de données</h1>
        <p className="text-sm text-gray-500">Téléchargez vos rapports en Excel ou PDF</p>
      </div>

      {/* Summary */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
        <h2 className="font-semibold text-gray-900 mb-4">Résumé des données</h2>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Produits', value: stats.products },
            { label: 'Ventes', value: stats.sales },
            { label: 'Dépenses', value: stats.expenses },
            { label: 'Objectifs', value: stats.goals },
          ].map(item => (
            <div key={item.label} className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
              <span className="text-sm text-gray-600">{item.label}</span>
              <span className="font-bold text-gray-900">{item.value}</span>
            </div>
          ))}
          <div className="col-span-2 flex items-center justify-between bg-indigo-50 rounded-xl px-4 py-3">
            <span className="text-sm text-indigo-700 font-medium">CA total (période)</span>
            <span className="font-bold text-indigo-700">{MAD(stats.totalRevenue)}</span>
          </div>
          <div className="col-span-2 flex items-center justify-between bg-emerald-50 rounded-xl px-4 py-3">
            <span className="text-sm text-emerald-700 font-medium">Profit net (période)</span>
            <span className={`font-bold ${stats.netProfit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{MAD(stats.netProfit)}</span>
          </div>
        </div>
      </div>

      {/* Export options */}
      <div className="space-y-3">
        {/* Excel */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600">
              <FileSpreadsheet size={24} />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900">Export Excel (.xlsx)</h3>
              <p className="text-sm text-gray-500 mt-1">
                4 feuilles: Produits, Ventes, Dépenses, Analytique
              </p>
              <ul className="mt-2 space-y-1">
                {['Tous les produits avec KPIs', 'Historique des ventes par ligne', 'Toutes les dépenses catégorisées', 'Analyse financière complète par produit'].map(item => (
                  <li key={item} className="flex items-center gap-2 text-xs text-gray-500">
                    <CheckCircle size={12} className="text-emerald-500 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <button
              onClick={handleExcel}
              disabled={exporting === 'excel'}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors shrink-0"
            >
              {exporting === 'excel' ? <RefreshCw size={16} className="animate-spin" /> : <Download size={16} />}
              Télécharger
            </button>
          </div>
        </div>

        {/* PDF */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-red-50 rounded-xl text-red-600">
              <FileText size={24} />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900">Rapport PDF Analytique</h3>
              <p className="text-sm text-gray-500 mt-1">
                Tableau analytique formaté avec KPIs globaux
              </p>
              <ul className="mt-2 space-y-1">
                {['KPIs globaux en en-tête', 'Tableau par produit: CA, marge, ROI, CPA', 'Classement stratégique (scale/stop/...)', 'Rotation de stock'].map(item => (
                  <li key={item} className="flex items-center gap-2 text-xs text-gray-500">
                    <CheckCircle size={12} className="text-red-400 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <button
              onClick={handlePdf}
              disabled={exporting === 'pdf'}
              className="flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors shrink-0"
            >
              {exporting === 'pdf' ? <RefreshCw size={16} className="animate-spin" /> : <Download size={16} />}
              Télécharger
            </button>
          </div>
        </div>
      </div>

      {/* Reset */}
      <div className="bg-red-50 border border-red-100 rounded-2xl p-5">
        <h3 className="font-semibold text-red-900 mb-1">Zone dangereuse</h3>
        <p className="text-sm text-red-700 mb-3">Réinitialiser toutes les données avec les données de démonstration.</p>
        {!showReset ? (
          <button
            onClick={() => setShowReset(true)}
            className="text-sm text-red-600 border border-red-200 hover:bg-red-100 px-4 py-2 rounded-xl transition-colors"
          >
            Rafraîchir les données
          </button>
        ) : (
          <div className="flex gap-3">
            <button onClick={() => setShowReset(false)} className="flex-1 px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600">Annuler</button>
            <button
              onClick={() => { hydrate(); setShowReset(false); }}
              className="flex-1 px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700"
            >
              Confirmer le rechargement
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
