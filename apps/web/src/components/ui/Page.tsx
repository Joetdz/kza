import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight, type LucideIcon } from 'lucide-react';
import { useCountUp } from '../../hooks/useCountUp';

/** A page's title, what it is about, and its actions on the right. */
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[22px] sm:text-[26px] font-bold tracking-tight text-fg leading-tight truncate">{title}</h1>
        {subtitle && <p className="text-xs sm:text-sm text-fg-3 mt-1 truncate">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

/**
 * The page's main action. On a desk it sits in the header (pass `desktop`); on a phone it
 * floats above the bottom bar, under the thumb.
 */
export function Fab({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="lg:hidden fixed right-4 z-30 flex items-center gap-2 pl-4 pr-5 h-14 rounded-2xl bg-indigo-600 text-white font-semibold text-sm shadow-glow active:scale-95 animate-pop"
      style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom))' }}
    >
      <Icon size={20} /> {label}
    </button>
  );
}

/** A headline figure; its number counts up when it appears or changes. */
export function Stat({ label, value, hint, tone = 'default' }: {
  label: string; value: string; hint?: ReactNode; tone?: 'default' | 'positive' | 'negative' | 'warning';
}) {
  const shown = useCountUp(value);
  const color = { default: 'text-fg', positive: 'text-emerald-700', negative: 'text-red-700', warning: 'text-amber-700' }[tone];
  return (
    <div className="card p-4 min-w-0">
      <p className="text-xs font-medium text-fg-3 truncate">{label}</p>
      <p className={`mt-1 text-xl sm:text-2xl font-bold tracking-tight truncate ${color}`}>{shown}</p>
      {hint && <p className="text-[11px] text-fg-4 mt-0.5 truncate">{hint}</p>}
    </div>
  );
}

/** Nothing to show yet: what this place is for, and how to start. */
export function EmptyState({ icon: Icon, title, text, action }: { icon: LucideIcon; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="card border-dashed py-14 px-6 flex flex-col items-center text-center animate-fade-in">
      <div className="w-14 h-14 rounded-2xl bg-indigo-600/10 text-indigo-700 flex items-center justify-center mb-4">
        <Icon size={26} />
      </div>
      <p className="font-semibold text-fg">{title}</p>
      {text && <p className="text-sm text-fg-3 mt-1 max-w-sm">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** Pages 1 … n with the neighbours of the current one. */
export function Pagination({ page, totalPages, onPage, summary }: { page: number; totalPages: number; onPage: (p: number) => void; summary?: ReactNode }) {
  if (totalPages <= 1) return null;
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1)
    .filter(n => n === 1 || n === totalPages || Math.abs(n - page) <= 1)
    .reduce<(number | '…')[]>((acc, n, i, arr) => {
      if (i > 0 && n - (arr[i - 1] as number) > 1) acc.push('…');
      acc.push(n);
      return acc;
    }, []);
  const btn = 'h-9 min-w-9 px-2 rounded-xl text-sm font-medium transition-colors';
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="text-xs sm:text-sm text-fg-3">{summary}</span>
      <div className="flex items-center gap-1">
        <button onClick={() => onPage(Math.max(1, page - 1))} disabled={page === 1} aria-label="Page précédente"
          className={`${btn} border border-line text-fg-2 hover:bg-surface-2 disabled:opacity-40`}>
          <ChevronLeft size={16} className="mx-auto" />
        </button>
        {pages.map((n, i) => n === '…'
          ? <span key={`e${i}`} className="px-1 text-fg-4 text-sm">…</span>
          : (
            <button key={n} onClick={() => onPage(n)} aria-current={page === n ? 'page' : undefined}
              className={`${btn} hidden sm:block ${page === n ? 'bg-indigo-600 text-white shadow-soft' : 'border border-line text-fg-2 hover:bg-surface-2'}`}>
              {n}
            </button>
          ))}
        <span className="sm:hidden text-sm text-fg-2 px-2 tabular-nums">{page} / {totalPages}</span>
        <button onClick={() => onPage(Math.min(totalPages, page + 1))} disabled={page === totalPages} aria-label="Page suivante"
          className={`${btn} border border-line text-fg-2 hover:bg-surface-2 disabled:opacity-40`}>
          <ChevronRight size={16} className="mx-auto" />
        </button>
      </div>
    </div>
  );
}

/** A titled group of fields inside a form. */
export function FormSection({ title, icon: Icon, children, aside }: { title: string; icon?: LucideIcon; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-fg-3">
          {Icon && <Icon size={13} />} {title}
        </h3>
        {aside}
      </div>
      {children}
    </section>
  );
}
