import { useMemo } from 'react';
import { useThemeStore } from './useTheme';

/**
 * Categorical palettes for the charts, one per theme, both validated for colour-vision
 * deficiency and contrast on their surface (dataviz validate_palette). Fixed order: a
 * series keeps its colour whatever the filter shows.
 */
export const CHART_PALETTE = {
  light: ['#5B5FEA', '#0D9488', '#D97706', '#E11D48', '#0284C7', '#7C3AED', '#F97316', '#EC4899'],
  dark:  ['#6E72F0', '#14A89A', '#C98009', '#F0466A', '#8F5CF2', '#1F9BDB', '#FB923C', '#F472B6'],
} as const;

/** What a recharts chart needs to sit on the current theme's surface. */
export function useChartTheme() {
  const theme = useThemeStore(s => s.theme);
  return useMemo(() => {
    const dark = theme === 'dark';
    return {
      theme,
      colors: CHART_PALETTE[theme] as readonly string[],
      brand: dark ? '#6E72F0' : '#5B5FEA',
      success: dark ? '#14A89A' : '#0D9488',
      warning: dark ? '#C98009' : '#D97706',
      danger: dark ? '#F0466A' : '#E11D48',
      /** Grid lines and axis strokes: recessive. */
      grid: dark ? 'rgba(148, 163, 184, 0.14)' : 'rgba(15, 23, 42, 0.07)',
      axis: dark ? '#8795AB' : '#66738A',
      tickFontSize: 11,
      /** The tooltip card. */
      tooltip: {
        contentStyle: {
          background: dark ? 'rgba(18, 24, 39, 0.92)' : 'rgba(255, 255, 255, 0.94)',
          border: `1px solid ${dark ? 'rgba(52, 66, 89, 0.9)' : 'rgba(228, 232, 240, 0.9)'}`,
          borderRadius: 14,
          boxShadow: '0 12px 40px -12px rgb(15 23 42 / 0.25)',
          backdropFilter: 'blur(12px)',
          color: dark ? '#EDF1F7' : '#0F172A',
          fontSize: 12,
          padding: '8px 12px',
        },
        labelStyle: { color: dark ? '#B8C2D3' : '#3F4B5F', fontWeight: 600, marginBottom: 4 },
        itemStyle: { color: dark ? '#EDF1F7' : '#0F172A', padding: 0 },
        cursor: { fill: dark ? 'rgba(148, 163, 184, 0.08)' : 'rgba(15, 23, 42, 0.04)' },
      },
    };
  }, [theme]);
}
