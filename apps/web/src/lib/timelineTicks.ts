import { formatAt, type Resolution } from '@worldlens/shared';

/**
 * Tick marks and labels for the timeline track. Labels must fit the track the user actually
 * has: a phone track is ~260 px (~180 px beside "Before 1800"), so the hour view's
 * "27 Oct 2026, 23:00 UTC" labels piled on top of each other and ran past the end. Each zoom
 * level starts from the spacing wide screens always had and only spaces ticks out (and shortens
 * labels) until they fit; ticks sit on calendar boundaries (00/06/12/18 h, Mondays, the 1st and
 * 15th, quarters, round years) rather than wherever the window happened to start.
 */

export interface Tick {
  ms: number;
  label: string;
}

/** Labels are 10 px Inter, 4 px right of their tick (widths measured, rounded up). */
const INSET_PX = 4;
const GAP_PX = 8;
/** However wide the track, at most this many labels (the density wide screens always had). */
const MAX_LABELS = 10;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

type Step =
  | { unit: 'hour'; every: number }
  | { unit: 'week' }
  | { unit: 'half-month' }
  | { unit: 'month'; every: number }
  | { unit: 'year'; every: number };

/** Steps per track zoom, finest first. */
const LADDERS: Record<Resolution, Step[]> = {
  century: [20, 40, 50, 100].map((every) => ({ unit: 'year', every })),
  decade: [10, 20, 50].map((every) => ({ unit: 'year', every })),
  year: [1, 2, 5, 10].map((every) => ({ unit: 'year', every })),
  month: [3, 6, 12].map((every) => ({ unit: 'month', every })),
  day: [{ unit: 'week' }, { unit: 'half-month' }, { unit: 'month', every: 1 }],
  hour: [3, 6, 12, 24].map((every) => ({ unit: 'hour', every })),
};

export function labelWidth(label: string): number {
  let px = INSET_PX;
  for (const ch of label)
    px += /\d/.test(ch) ? 6.5 : /[A-Z]/.test(ch) ? 7 : /[a-z]/.test(ch) ? 5.6 : 2.8;
  return px;
}

/** Start of the UTC hour / day / month / year containing `ms`, and the next one. */
function walk(unit: 'hour' | 'day' | 'month' | 'year', ms: number, next: boolean): number {
  const d = new Date(ms);
  if (unit === 'hour') d.setUTCMinutes(0, 0, 0);
  else d.setUTCHours(0, 0, 0, 0);
  if (unit === 'month' || unit === 'year') d.setUTCDate(1);
  if (unit === 'year') d.setUTCMonth(0);
  if (next) {
    if (unit === 'hour') d.setUTCHours(d.getUTCHours() + 1);
    else if (unit === 'day') d.setUTCDate(d.getUTCDate() + 1);
    else if (unit === 'month') d.setUTCMonth(d.getUTCMonth() + 1);
    else d.setUTCFullYear(d.getUTCFullYear() + 1);
  }
  return d.getTime();
}

function tickTimes(step: Step, startMs: number, endMs: number): number[] {
  const unit = step.unit === 'week' || step.unit === 'half-month' ? 'day' : step.unit;
  const on = (ms: number): boolean => {
    const d = new Date(ms);
    switch (step.unit) {
      case 'hour':
        return d.getUTCHours() % step.every === 0;
      case 'week':
        return d.getUTCDay() === 1;
      case 'half-month':
        return d.getUTCDate() === 1 || d.getUTCDate() === 15;
      case 'month':
        return d.getUTCMonth() % step.every === 0;
      case 'year':
        return d.getUTCFullYear() % step.every === 0;
    }
  };
  const out: number[] = [];
  let ms = walk(unit, startMs, false);
  for (let guard = 0; ms <= endMs && guard < 5000; guard++) {
    if (ms >= startMs && on(ms)) out.push(ms);
    ms = walk(unit, ms, true);
  }
  return out;
}

function label(step: Step, ms: number, short: boolean): string {
  const d = new Date(ms);
  const dayMonth = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  const newYear = d.getUTCMonth() === 0 && d.getUTCDate() === 1;
  switch (step.unit) {
    case 'hour':
      // Hours read as times; midnight carries the date instead.
      return d.getUTCHours() === 0 ? dayMonth : `${String(d.getUTCHours()).padStart(2, '0')}:00`;
    case 'week':
    case 'half-month':
      if (!short) return formatAt(ms, 'day', { upper: false });
      return newYear ? formatAt(ms, 'year') : dayMonth;
    case 'month':
      if (!short) return formatAt(ms, 'month', { upper: false });
      return d.getUTCMonth() === 0 ? formatAt(ms, 'year') : MONTHS[d.getUTCMonth()]!;
    case 'year':
      return formatAt(ms, 'year');
  }
}

/** Labels laid out left to right: whether each clears the next, and all stay on the track. */
function fits(ticks: Tick[], x: (ms: number) => number): boolean {
  if (ticks.length > MAX_LABELS) return false;
  for (let i = 0; i + 1 < ticks.length; i++)
    if (x(ticks[i + 1]!.ms) - x(ticks[i]!.ms) < labelWidth(ticks[i]!.label) + GAP_PX) return false;
  return true;
}

export function timelineTicks(
  startMs: number,
  endMs: number,
  view: Resolution,
  trackPx: number,
): Tick[] {
  const width = Math.max(1, trackPx);
  const x = (ms: number) => ((ms - startMs) / Math.max(1, endMs - startMs)) * width;
  // A label that would run past the end of the track is left out.
  const onTrack = (ticks: Tick[]) => ticks.filter((t) => x(t.ms) + labelWidth(t.label) <= width);
  let last: Tick[] = [];
  for (const step of LADDERS[view]) {
    const times = tickTimes(step, startMs, endMs);
    for (const short of step.unit === 'hour' || step.unit === 'year' ? [true] : [false, true]) {
      const ticks = onTrack(times.map((ms) => ({ ms, label: label(step, ms, short) })));
      if (ticks.length > 0 && fits(ticks, x)) return ticks;
      last = ticks;
    }
  }
  // Nothing fits (a very narrow track): keep every label that clears the one before it.
  const out: Tick[] = [];
  let free = -Infinity;
  for (const t of last) {
    if (x(t.ms) < free) continue;
    out.push(t);
    free = x(t.ms) + labelWidth(t.label) + GAP_PX;
  }
  return out.slice(0, MAX_LABELS);
}
