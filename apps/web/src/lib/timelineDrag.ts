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
