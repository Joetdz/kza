import { useState, useEffect } from 'react';

interface Props {
  value: number;
  onChange: (val: number) => void;
  min?: number;
  className?: string;
  placeholder?: string;
}

/**
 * Input numérique qui autorise les décimaux (7.5, 6.3...).
 * Garde un état string local pour permettre les états intermédiaires
 * comme "7." sans écraser le point avant que l'utilisateur finisse.
 */
export function NumberInput({ value, onChange, min = 0, className, placeholder }: Props) {
  const [local, setLocal] = useState(value === 0 ? '' : String(value));

  // Sync quand la valeur change depuis l'extérieur (ex: reset du formulaire)
  useEffect(() => {
    const num = parseFloat(local);
    if (isNaN(num) || num !== value) {
      setLocal(value === 0 ? '' : String(value));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <input
      type="text"
      inputMode="decimal"
      placeholder={placeholder ?? '0'}
      value={local}
      onChange={e => {
        const raw = e.target.value.replace(',', '.');
        setLocal(raw);
        const num = parseFloat(raw);
        if (!isNaN(num) && num >= min) onChange(num);
        else if (raw === '' || raw === '-') onChange(0);
      }}
      onBlur={() => {
        // Nettoie l'affichage à la perte du focus
        const num = parseFloat(local);
        setLocal(isNaN(num) || num < min ? '0' : String(num));
      }}
      className={className}
    />
  );
}
