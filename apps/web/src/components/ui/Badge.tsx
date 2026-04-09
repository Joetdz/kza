interface Props {
  children: React.ReactNode;
  color?: 'gray' | 'green' | 'red' | 'amber' | 'blue' | 'indigo' | 'purple';
  size?: 'sm' | 'md';
}

const colors = {
  gray:   'bg-gray-100 text-gray-700',
  green:  'bg-emerald-100 text-emerald-700',
  red:    'bg-red-100 text-red-700',
  amber:  'bg-amber-100 text-amber-700',
  blue:   'bg-blue-100 text-blue-700',
  indigo: 'bg-indigo-100 text-indigo-700',
  purple: 'bg-purple-100 text-purple-700',
};

export function Badge({ children, color = 'gray', size = 'md' }: Props) {
  return (
    <span className={`inline-flex items-center font-medium rounded-full ${colors[color]} ${size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm'}`}>
      {children}
    </span>
  );
}
