import { useEffect, useRef, useState } from 'react';

/** The first number in a formatted string: « 1 250 000 FC » → 1250000, 0 decimals, ','. */
function parseFigure(text: string) {
  const m = /-?\d(?:[\d   ,.]*\d)?/.exec(text);
  if (!m) return null;
  const token = m[0];
  // A decimal part: the last ',' or '.' followed by one or two digits at the end.
  const dec = /[.,](\d{1,2})$/.exec(token);
  const decimals = dec ? dec[1].length : 0;
  const digits = (dec ? token.slice(0, dec.index) : token).replace(/[^\d-]/g, '');
  const value = Number(`${digits}${dec ? `.${dec[1]}` : ''}`);
  return Number.isFinite(value) ? { token, value, decimals, index: m.index } : null;
}

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * A figure that counts up to its value when it appears or changes, keeping the format
 * of the string it came in (« 1 250 000 FC » counts in francs). Off for anyone who asked
 * for less motion; the exact string shows at the end in every case.
 */
export function useCountUp(display: string, duration = 750): string {
  const [shown, setShown] = useState(display);
  const from = useRef(0);
  const frame = useRef(0);

  useEffect(() => {
    cancelAnimationFrame(frame.current);
    const fig = parseFigure(display);
    if (!fig || reducedMotion() || fig.value === from.current) {
      from.current = fig?.value ?? 0;
      setShown(display);
      return;
    }
    const start = performance.now();
    const base = from.current;
    const render = (n: number) =>
      display.slice(0, fig.index)
      + n.toLocaleString('fr-FR', { minimumFractionDigits: fig.decimals, maximumFractionDigits: fig.decimals })
      + display.slice(fig.index + fig.token.length);
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      if (t < 1) {
        setShown(render(base + (fig.value - base) * eased));
        frame.current = requestAnimationFrame(tick);
      } else {
        from.current = fig.value;
        setShown(display);
      }
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [display, duration]);

  return shown;
}
