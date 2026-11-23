import type { MetricDef, Unit } from './metrics';

export function formatValue(unit: Unit, v: number | null | undefined, opts: { compact?: boolean; signed?: boolean } = {}): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const sign = opts.signed && v > 0 ? '+' : '';
  switch (unit) {
    case 'aud':
      if (opts.compact || Math.abs(v) >= 1_000_000) {
        if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}m`;
        return `$${Math.round(v / 1000)}k`;
      }
      return `$${Math.round(v).toLocaleString('en-AU')}`;
    case 'audWeekly':
      return `$${Math.round(v).toLocaleString('en-AU')}/wk`;
    case 'pct':
      return `${sign}${v.toFixed(Math.abs(v) < 10 ? 1 : 0)}%`;
    case 'ratio':
      return `${v.toFixed(1)}×`;
    case 'years':
      return `${v.toFixed(v < 10 ? 1 : 0)} yrs`;
    case 'points':
      return `${sign}${v.toFixed(1)} pts`;
    case 'days':
      return `${sign}${Math.round(v)} days`;
    case 'months':
      return `${v.toFixed(1)} mo`;
    case 'km':
      return `${v.toFixed(1)} km`;
    case 'decile':
      return `${Math.round(v)} / 10`;
    case 'count':
      return Math.round(v).toLocaleString('en-AU');
    case 'index':
      return v.toFixed(0);
  }
}

export function formatMetric(def: MetricDef, v: number | null | undefined, compact = false): string {
  const signed = def.key.endsWith('Trend') || def.key.startsWith('growth') || def.key.startsWith('rentGrowth') || def.key === 'popGrowth' || def.key === 'valueGap' || def.key === 'neighbourGap';
  return formatValue(def.unit, v, { compact, signed });
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' });
}

export function formatDistance(m: number | null | undefined): string {
  if (m == null) return '—';
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;
}

export function formatScore(v: number | null | undefined): string {
  return v == null ? '—' : Math.round(v).toString();
}

/** "just now", "5 minutes ago", "3 hours ago", "2 days ago", "5 weeks ago". */
export function formatAgo(iso: string, now = Date.now()): string {
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'} ago`;
  if (mins < 1) return 'just now';
  if (mins < 60) return plural(mins, 'minute');
  const hours = Math.round(mins / 60);
  if (hours < 24) return plural(hours, 'hour');
  const days = Math.round(hours / 24);
  if (days < 14) return plural(days, 'day');
  return plural(Math.round(days / 7), 'week');
}

/** Full local date and time, for tooltips. */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}
