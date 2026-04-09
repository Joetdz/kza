import { type ButtonHTMLAttributes } from 'react';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
}

const VARIANTS = {
  primary: 'bg-indigo-600 hover:bg-indigo-700 text-white',
  secondary: 'border border-gray-200 text-gray-700 hover:bg-gray-50',
  danger: 'bg-red-500 hover:bg-red-600 text-white',
};

export function Button({ loading, variant = 'primary', className = '', children, disabled, ...props }: Props) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
    >
      {loading && (
        <span className={`spinner ${variant !== 'primary' ? 'spinner-dark' : ''}`} />
      )}
      {children}
    </button>
  );
}
