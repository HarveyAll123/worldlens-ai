import type { Resolution } from '@worldlens/shared';

/**
 * Unit the track and the step buttons move in: years on the 1800–now overview (a single day
 * picked there left almost nothing on the map).
 */
export function trackUnit(view: Resolution, resolution: Resolution): Resolution {
  return view === 'century' || resolution === 'century' ? 'year' : resolution;
}

/**
 * Track zoom after the selected resolution changes: the full range in LIVE, and picking a year
 * on the overview keeps the overview (the Y button zooms in explicitly). Zooming in on the first
 * click used to land on a single day of a two-month track.
 */
export function viewAfter(
  view: Resolution,
  resolution: Resolution,
  mode: 'live' | 'historical',
): Resolution {
  if (mode === 'live' && resolution === 'day') return 'century';
  if (view === 'century' && resolution === 'year') return 'century';
  return resolution;
}

/**
 * Edge scrolling for the timeline drag. Holding the pointer within `zone` px of either end of
 * the track — or past it — pushes the visible window through time.
 */

/** -1…-1.4 at/after the left edge, 0 inside, up to 1.4 at/after the right edge. */
export function edgePush(x: number, left: number, right: number): number {
  const zone = Math.min(48, (right - left) * 0.08);
  const raw =
    x < left + zone ? -(left + zone - x) / zone : x > right - zone ? (x - right + zone) / zone : 0;
  return Math.sign(raw) * Math.min(1.4, Math.abs(raw));
}

/**
 * How far (ms) the window moves in `dt` seconds: quadratic in the push so a light touch of the
 * edge creeps and a hard push moves, capped at ~0.7 window widths per second.
 */
export function edgeShift(push: number, windowMs: number, dt: number): number {
  return Math.sign(push) * push * push * 0.35 * windowMs * dt;
}
