import {
  TEMPORAL_CONFIG,
  formatTemporal,
  parseIso,
  precisionLabel,
  type Temporal,
} from '@worldlens/shared';

/** News older than this is news of the past: it shows on its own day, not at LIVE. */
export const LIVE_WINDOW_MS = TEMPORAL_CONFIG.liveWindowHours * 3_600_000;

export function relativeTime(iso: string, now = Date.now()): string {
  const diff = now - parseIso(iso);
  const m = Math.round(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 60) return `${d} days ago`;
  // News of the past (2000 onwards): months, then years.
  if (d < 730) return `${Math.round(d / 30.44)} months ago`;
  return `${Math.round(d / 365.25)} years ago`;
}

const PRECISION_TEXT: Record<string, string> = {
  minute: 'exact to the minute',
  hour: 'exact to the hour',
  day: 'exact date',
  month: 'month known, day unknown',
  'unknown-day': 'month known, day unknown',
  year: 'year only',
  decade: 'decade only',
  century: 'century only',
  approximate: 'approximate date',
  range: 'date range',
};

export function temporalWithPrecision(t: Temporal): { label: string; precision: string } {
  return {
    label: formatTemporal(t),
    precision: PRECISION_TEXT[precisionLabel(t)] ?? precisionLabel(t),
  };
}

export function safeExternalUrl(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return null;
    if (u.hostname.endsWith('.invalid')) return null;
    return u.toString();
  } catch {
    return null;
  }
}
