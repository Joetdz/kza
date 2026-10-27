import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronRight, X } from 'lucide-react';
import type { FirstStep, FirstStepCheck } from '@kza/shared';
import { useStore } from '../store/useStore';
import { useSegment } from '../hooks/useSegment';

interface Progress { visited: string[]; hidden: boolean }

// Per business and per browser: a convenience, not something to keep reliably.
const storageKey = (businessId: string) => `kza:first-steps:${businessId}`;

function readProgress(businessId: string): Progress {
  try {
    const raw = localStorage.getItem(storageKey(businessId));
    if (raw) return { visited: [], hidden: false, ...JSON.parse(raw) };
  } catch { /* storage unavailable */ }
  return { visited: [], hidden: false };
}

function writeProgress(businessId: string, progress: Progress) {
  try { localStorage.setItem(storageKey(businessId), JSON.stringify(progress)); } catch { /* storage unavailable */ }
}

/** Getting-started checklist for the business's segment, shown on the dashboard until done or dismissed. */
export function FirstSteps() {
  const { products, sales, expenses, currentBusinessId } = useStore();
  const { segment, firstSteps } = useSegment();
  const businessId = currentBusinessId ?? '';
  const [progress, setProgress] = useState(() => readProgress(businessId));
  const [forBusiness, setForBusiness] = useState(businessId);

  // Switching business shows that business's own progress.
  if (forBusiness !== businessId) {
    setForBusiness(businessId);
    setProgress(readProgress(businessId));
  }

  const hasData: Record<FirstStepCheck, boolean> = {
    products: products.length > 0,
    sales:    sales.length > 0,
    expenses: expenses.length > 0,
  };
  const isDone = (s: FirstStep) => (s.doneWhen ? hasData[s.doneWhen] : progress.visited.includes(s.to));
  const doneCount = firstSteps.filter(isDone).length;

  if (!businessId || progress.hidden || firstSteps.length === 0 || doneCount === firstSteps.length) return null;

  const update = (next: Progress) => { setProgress(next); writeProgress(businessId, next); };
  const markVisited = (s: FirstStep) => {
    if (!s.doneWhen && !progress.visited.includes(s.to)) update({ ...progress, visited: [...progress.visited, s.to] });
  };

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-indigo-100">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h2 className="font-semibold text-gray-900">Premiers pas {segment ? `· ${segment.emoji} ${segment.label}` : ''}</h2>
          <p className="text-xs text-gray-500 mt-0.5">{doneCount} sur {firstSteps.length} — quelques minutes pour être opérationnel.</p>
        </div>
        <button onClick={() => update({ ...progress, hidden: true })} title="Masquer"
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors shrink-0">
          <X size={16} />
        </button>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-3">
        <div className="h-full bg-indigo-500 transition-all" style={{ width: `${(doneCount / firstSteps.length) * 100}%` }} />
      </div>
      <ul className="divide-y divide-gray-50">
        {firstSteps.map(s => {
          const done = isDone(s);
          return (
            <li key={s.to + s.label}>
              <Link to={s.to} onClick={() => markVisited(s)}
                className="flex items-center gap-3 py-2.5 group">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                  done ? 'bg-emerald-500 text-white' : 'border-2 border-gray-200'
                }`}>
                  {done && <Check size={12} />}
                </span>
                <span className={`flex-1 text-sm ${done ? 'text-gray-400 line-through' : 'text-gray-700 group-hover:text-indigo-600'}`}>{s.label}</span>
                {!done && <ChevronRight size={16} className="text-gray-300 group-hover:text-indigo-500" />}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
