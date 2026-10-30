import { intersects, periodAt, temporalSpan, type Resolution } from '@worldlens/shared';
import type { EventsResponse } from './api';

/**
 * The part of an events response that belongs on screen at the selected time.
 *
 * The last response stays up while the next period loads, and the timeline can move on again
 * before that lands, so the response on hand is often for another period. Its events outside
 * the selected period are dropped here; they used to stay on the globe until a request for
 * the new period finished.
 */
export function eventsAt(
  data: EventsResponse,
  mode: 'live' | 'historical',
  timeMs: number,
  resolution: Resolution,
): EventsResponse {
  let events = data.events;
  if (mode === 'live') {
    // The LIVE window follows the server's clock, so only a dated response is out of place.
    if (!data.live) events = [];
  } else {
    const period = periodAt(timeMs, resolution);
    events = events.filter((e) => intersects(temporalSpan(e.time), period));
  }
  // Same object when nothing was dropped, so the globe does not rebuild its markers.
  if (events.length === data.events.length) return data;
  return { ...data, events, total: events.length, truncated: false };
}
