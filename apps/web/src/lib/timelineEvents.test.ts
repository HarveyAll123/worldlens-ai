import { describe, expect, it } from 'vitest';
import { utcMs, type EventSummary, type Granularity } from '@worldlens/shared';
import type { EventsResponse } from './api';
import { eventsAt } from './timelineEvents';

function event(id: string, start: string, end?: string, precision: Granularity = 'day') {
  return {
    id,
    kind: 'historical',
    isDemo: false,
    title: id,
    category: 'conflict',
    time: { start, ...(end ? { end } : {}), precision, approximate: false },
    location: { name: id, lat: 50, lon: 4, precision: 'exact', confidence: 1 },
    importance: 3,
    confidence: 1,
    articleCount: 0,
    sourceCount: 0,
    hasTakeAction: false,
  } satisfies EventSummary;
}

function response(events: EventSummary[], live = false): EventsResponse {
  return {
    events,
    total: events.length,
    truncated: true,
    window: { start: '', end: '' },
    finestPrecision: 'day',
    ...(live ? { live: { count: 1, lastIngestedAt: null, provider: null, state: 'ok' } } : {}),
  };
}

const ids = (r: EventsResponse) => r.events.map((e) => e.id);

describe('events at the selected time', () => {
  const waterloo = event('waterloo', '1815-06-18');
  const vienna = event('vienna', '1814-09', '1815-06', 'month');
  const leipzig = event('leipzig', '1813-10-16', '1813-10-19');
  const loaded = response([waterloo, vienna, leipzig]);

  it('drops the events of a response that fall outside the selected period', () => {
    expect(ids(eventsAt(loaded, 'historical', utcMs(1813), 'year'))).toEqual(['leipzig']);
    expect(ids(eventsAt(loaded, 'historical', utcMs(1815), 'year'))).toEqual([
      'waterloo',
      'vienna',
    ]);
    // A range stays on screen for every day it covers.
    expect(ids(eventsAt(loaded, 'historical', utcMs(1815, 6, 18), 'day'))).toEqual([
      'waterloo',
      'vienna',
    ]);
    expect(ids(eventsAt(loaded, 'historical', utcMs(1813, 10, 19), 'day'))).toEqual(['leipzig']);
    expect(ids(eventsAt(loaded, 'historical', utcMs(1900), 'year'))).toEqual([]);
  });

  it('counts only what is shown', () => {
    const shown = eventsAt(loaded, 'historical', utcMs(1813), 'year');
    expect(shown.total).toBe(1);
    expect(shown.truncated).toBe(false);
    // The precision of the response still decides which resolutions are offered.
    expect(shown.finestPrecision).toBe('day');
  });

  it('returns the response itself when every event is in the period', () => {
    expect(eventsAt(loaded, 'historical', utcMs(1810), 'decade')).toBe(loaded);
  });

  it('keeps LIVE responses and hides dated ones in LIVE mode', () => {
    const live = response([event('today', '2026-10-30')], true);
    expect(eventsAt(live, 'live', 0, 'day')).toBe(live);
    expect(ids(eventsAt(loaded, 'live', 0, 'day'))).toEqual([]);
  });
});
