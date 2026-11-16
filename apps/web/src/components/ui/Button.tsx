import { type ButtonHTMLAttributes } from 'react';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
}

const VARIANTS = {
  primary: 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-soft hover:shadow-glow',
  secondary: 'bg-surface border border-line text-fg-2 hover:text-fg hover:bg-surface-2 hover:border-line-strong',
  ghost: 'text-fg-2 hover:text-fg hover:bg-surface-2',
  danger: 'bg-red-600 hover:bg-red-700 text-white shadow-soft',
};
const SIZES = { sm: 'px-3 py-2 text-xs rounded-lg', md: 'px-4 py-2.5 text-sm rounded-xl' };

export function Button({ loading, variant = 'primary', size = 'md', className = '', children, disabled, ...props }: Props) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 font-medium transition-all duration-150 active:scale-[0.98] disabled:active:scale-100 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:shadow-soft ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
    >
      {loading && (
        <span className={`spinner ${variant === 'primary' || variant === 'danger' ? '' : 'spinner-dark'}`} />
      )}
      {children}
    </button>
  );
}
