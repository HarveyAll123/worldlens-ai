/**
 * Temporal model.
 *
 * Times are carried as epoch milliseconds (UTC). JavaScript's Date supports roughly
 * ±273,000 years, so nothing in this module assumes a 1800 floor — the navigable floor
 * is configuration (`TEMPORAL_CONFIG.minNavigableYear`) and can be moved earlier later
 * without changing data structures.
 *
 * Years are astronomical (year 0 = 1 BCE). Use `utcMs()` instead of `Date.UTC()` because
 * `Date.UTC()` maps years 0–99 to 1900–1999.
 */
import { z } from 'zod';

export const TEMPORAL_CONFIG = {
  /** First year the navigator lets the user reach. Data structures do not depend on it. */
  minNavigableYear: 1800,
  /** Shown immediately before the navigable range. Set to null once earlier eras ship. */
  comingSoonLabel: 'Before 1800 — Coming Soon' as string | null,
  /** How far back LIVE mode looks for current events. */
  liveWindowHours: 72,
} as const;

/** Granularities, coarsest → finest. */
export const GRANULARITIES = [
  'century',
  'decade',
  'year',
  'month',
  'day',
  'hour',
  'minute',
] as const;
export type Granularity = (typeof GRANULARITIES)[number];
export const GranularitySchema = z.enum(GRANULARITIES);

/** Navigator resolutions are a subset of granularities. */
export const RESOLUTIONS = ['century', 'decade', 'year', 'month', 'day', 'hour'] as const;
export type Resolution = (typeof RESOLUTIONS)[number];
export const ResolutionSchema = z.enum(RESOLUTIONS);

/**
 * Accepts ISO 8601 dates, including extended years ("+001815-06-18", "-000500-01-01")
 * and date-only forms ("1815", "1815-06", "1815-06-18").
 */
export const IsoInstantSchema = z
  .string()
  .regex(
    /^[+-]?\d{4,6}(-\d{2}(-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?)?)?)?$/,
    'Expected an ISO 8601 date or date-time',
  );

/**
 * Precision metadata attached to every temporal record.
 *  - `precision`: finest unit actually known ("unknown-day" ⇒ precision "month").
 *  - `approximate`: "circa" — the value itself is uncertain.
 *  - `end`: present for ranges (inclusive, at the same precision unless stated).
 */
export const TemporalSchema = z.object({
  start: IsoInstantSchema,
  end: IsoInstantSchema.optional(),
  precision: GranularitySchema,
  approximate: z.boolean().default(false),
  label: z.string().max(80).optional(),
});
export type Temporal = z.infer<typeof TemporalSchema>;

/** The storage-level labels used in the database `date_precision` column. */
export const DATE_PRECISION_LABELS = [
  'minute',
  'hour',
  'day',
  'month',
  'year',
  'decade',
  'century',
  'approximate',
  'range',
  'unknown-day',
] as const;
export type DatePrecisionLabel = (typeof DATE_PRECISION_LABELS)[number];

export function precisionLabel(t: Temporal): DatePrecisionLabel {
  if (t.approximate) return 'approximate';
  if (t.end) return 'range';
  if (t.precision === 'month') return 'unknown-day';
  return t.precision;
}

const MS = {
  minute: 60_000,
  hour: 3_600_000,
  day: 86_400_000,
} as const;

/** Build a UTC timestamp without Date.UTC's 0–99 → 1900s quirk. */
export function utcMs(year: number, month = 1, day = 1, hour = 0, minute = 0, second = 0): number {
  const d = new Date(0);
  d.setUTCFullYear(year, month - 1, day);
  d.setUTCHours(hour, minute, second, 0);
  return d.getTime();
}

export function yearOf(ms: number): number {
  return new Date(ms).getUTCFullYear();
}

/** Parse an ISO instant (see IsoInstantSchema) to epoch ms. Partial dates resolve to their start. */
export function parseIso(value: string): number {
  const m =
    /^([+-]?\d{4,6})(?:-(\d{2})(?:-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})?)?)?)?$/.exec(
      value,
    );
  if (!m) throw new Error(`Invalid ISO instant: ${value}`);
  const [, y, mo, d, h, mi, s, frac, tz] = m;
  let ms = utcMs(
    Number(y),
    mo ? Number(mo) : 1,
    d ? Number(d) : 1,
    h ? Number(h) : 0,
    mi ? Number(mi) : 0,
    s ? Number(s) : 0,
  );
  if (frac) ms += Number(frac.padEnd(3, '0'));
  if (tz && tz !== 'Z') {
    const sign = tz.startsWith('-') ? -1 : 1;
    const [th, tm] = tz.slice(1).split(':').map(Number) as [number, number];
    ms -= sign * (th * 60 + tm) * MS.minute;
  }
  return ms;
}

function pad(n: number, width = 2): string {
  return String(Math.abs(n)).padStart(width, '0');
}

/** Format epoch ms as ISO 8601, using the extended-year form outside 0000–9999. */
export function toIso(ms: number): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const year = y >= 0 && y <= 9999 ? pad(y, 4) : `${y < 0 ? '-' : '+'}${pad(y, 6)}`;
  return `${year}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(
    d.getUTCMinutes(),
  )}:${pad(d.getUTCSeconds())}Z`;
}

/** Truncate to the start of the calendar period containing `ms`. */
export function floorTo(ms: number, unit: Granularity): number {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  switch (unit) {
    case 'century':
      return utcMs(Math.floor(y / 100) * 100);
    case 'decade':
      return utcMs(Math.floor(y / 10) * 10);
    case 'year':
      return utcMs(y);
    case 'month':
      return utcMs(y, d.getUTCMonth() + 1);
    case 'day':
      return utcMs(y, d.getUTCMonth() + 1, d.getUTCDate());
    case 'hour':
      return Math.floor(ms / MS.hour) * MS.hour;
    case 'minute':
      return Math.floor(ms / MS.minute) * MS.minute;
  }
}

/** Add `n` calendar units. */
export function addUnits(ms: number, unit: Granularity, n: number): number {
  const d = new Date(ms);
  switch (unit) {
    case 'century':
      d.setUTCFullYear(d.getUTCFullYear() + 100 * n);
      return d.getTime();
    case 'decade':
      d.setUTCFullYear(d.getUTCFullYear() + 10 * n);
      return d.getTime();
    case 'year':
      d.setUTCFullYear(d.getUTCFullYear() + n);
      return d.getTime();
    case 'month': {
      const day = d.getUTCDate();
      d.setUTCDate(1);
      d.setUTCMonth(d.getUTCMonth() + n);
      const dim = new Date(utcMs(d.getUTCFullYear(), d.getUTCMonth() + 2, 1) - MS.day).getUTCDate();
      d.setUTCDate(Math.min(day, dim));
      return d.getTime();
    }
    case 'day':
      return ms + n * MS.day;
    case 'hour':
      return ms + n * MS.hour;
    case 'minute':
      return ms + n * MS.minute;
  }
}

/** The calendar period [start, end) that contains `ms` at the given resolution. */
export function periodAt(ms: number, unit: Granularity): { startMs: number; endMs: number } {
  const startMs = floorTo(ms, unit);
  return { startMs, endMs: addUnits(startMs, unit, 1) };
}

/** Inclusive [startMs, endMs) span that a temporal record covers given its precision. */
export function temporalSpan(t: Temporal): { startMs: number; endMs: number } {
  const startMs = floorTo(parseIso(t.start), t.precision);
  const endBase = t.end ? floorTo(parseIso(t.end), t.precision) : startMs;
  return { startMs, endMs: addUnits(endBase, t.precision, 1) };
}

export function intersects(
  a: { startMs: number; endMs: number },
  b: { startMs: number; endMs: number },
): boolean {
  return a.startMs < b.endMs && b.startMs < a.endMs;
}

export function minNavigableMs(): number {
  return utcMs(TEMPORAL_CONFIG.minNavigableYear);
}

/** Clamp a requested time into the navigable range [minNavigable, now]. */
export function clampToNavigable(ms: number, nowMs: number): number {
  return Math.min(Math.max(ms, minNavigableMs()), nowMs);
}

export function isBeforeNavigable(ms: number): boolean {
  return ms < minNavigableMs();
}

const GRANULARITY_RANK: Record<Granularity, number> = {
  century: 0,
  decade: 1,
  year: 2,
  month: 3,
  day: 4,
  hour: 5,
  minute: 6,
};

export function isFinerOrEqual(a: Granularity, b: Granularity): boolean {
  return GRANULARITY_RANK[a] >= GRANULARITY_RANK[b];
}

export function finestOf(values: Granularity[]): Granularity | null {
  let best: Granularity | null = null;
  for (const v of values)
    if (best === null || GRANULARITY_RANK[v] > GRANULARITY_RANK[best]) best = v;
  return best;
}

/**
 * Resolutions the navigator may offer around `ms`. Never finer than the data can support:
 *  - `finestDataPrecision` is the finest precision among records near the selected time
 *    (null when nothing is loaded — then we allow down to "day" for modern dates only).
 *  - Hour resolution is offered only when data near the time is actually hour-precise.
 */
export function allowedResolutions(
  ms: number,
  nowMs: number,
  finestDataPrecision: Granularity | null,
): Resolution[] {
  const out: Resolution[] = ['century', 'decade', 'year'];
  const cap: Granularity =
    finestDataPrecision ??
    (nowMs - ms < 366 * MS.day ? 'day' : yearOf(ms) >= 1900 ? 'month' : 'year');
  for (const r of ['month', 'day', 'hour'] as const) {
    if (isFinerOrEqual(cap, r)) out.push(r);
  }
  return out;
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const MONTHS_TITLE = MONTHS.map((m) => m[0] + m.slice(1).toLowerCase());

function yearLabel(y: number): string {
  return y <= 0 ? `${1 - y} BCE` : String(y);
}

/** Format an instant at a resolution, e.g. "18 JUN 1815" (day) or "1810s" (decade). */
export function formatAt(ms: number, unit: Granularity, opts: { upper?: boolean } = {}): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const months = opts.upper === false ? MONTHS_TITLE : MONTHS;
  const mon = months[d.getUTCMonth()]!;
  switch (unit) {
    case 'century': {
      const c = Math.floor(y / 100) * 100;
      return `${yearLabel(c)}s`;
    }
    case 'decade': {
      const dec = Math.floor(y / 10) * 10;
      return `${yearLabel(dec)}s`;
    }
    case 'year':
      return yearLabel(y);
    case 'month':
      return `${mon} ${yearLabel(y)}`;
    case 'day':
      return `${d.getUTCDate()} ${mon} ${yearLabel(y)}`;
    case 'hour':
      return `${d.getUTCDate()} ${mon} ${yearLabel(y)}, ${pad(d.getUTCHours())}:00 UTC`;
    case 'minute':
      return `${d.getUTCDate()} ${mon} ${yearLabel(y)}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
  }
}

/** Human-readable label for a temporal record that never shows more precision than known. */
export function formatTemporal(t: Temporal): string {
  if (t.label) return t.label;
  const start = formatAt(parseIso(t.start), t.precision, { upper: false });
  const prefix = t.approximate ? 'c. ' : '';
  if (!t.end) return prefix + start;
  const end = formatAt(parseIso(t.end), t.precision, { upper: false });
  if (end === start) return prefix + start;
  return `${prefix}${start} – ${end}`;
}

/** "14 OCT 2026" + "11:25:42 UTC" for the LIVE clock. */
export function formatLiveClock(ms: number): { date: string; time: string } {
  const d = new Date(ms);
  return {
    date: formatAt(ms, 'day'),
    time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`,
  };
}

/** Coarser/finer neighbours of a resolution. */
export function coarser(r: Resolution): Resolution | null {
  const i = RESOLUTIONS.indexOf(r);
  return i > 0 ? RESOLUTIONS[i - 1]! : null;
}
export function finer(r: Resolution): Resolution | null {
  const i = RESOLUTIONS.indexOf(r);
  return i < RESOLUTIONS.length - 1 ? RESOLUTIONS[i + 1]! : null;
}

/** Pick a sensible resolution for a temporal record (used when jumping to an event). */
export function resolutionFor(t: Temporal): Resolution {
  if (t.precision === 'minute') return 'hour';
  return t.precision;
}

/** Visible span of the navigator track for a resolution (in units of that resolution's parent). */
export function trackSpan(
  centerMs: number,
  resolution: Resolution,
  nowMs: number,
): { startMs: number; endMs: number } {
  const min = minNavigableMs();
  const spans: Record<Resolution, [Granularity, number]> = {
    century: ['year', 0], // whole navigable range
    decade: ['year', 60],
    year: ['year', 12],
    month: ['month', 24],
    day: ['day', 62],
    hour: ['hour', 72],
  };
  if (resolution === 'century') return { startMs: min, endMs: nowMs };
  const [unit, count] = spans[resolution];
  let startMs = addUnits(centerMs, unit, -count / 2);
  let endMs = addUnits(centerMs, unit, count / 2);
  if (endMs > nowMs) {
    const shift = endMs - nowMs;
    endMs = nowMs;
    startMs -= shift;
  }
  if (startMs < min) {
    const shift = min - startMs;
    startMs = min;
    endMs = Math.min(nowMs, endMs + shift);
  }
  return { startMs, endMs };
}
