import { describe, expect, it } from 'vitest';
import {
  TEMPORAL_CONFIG,
  addUnits,
  allowedResolutions,
  clampToNavigable,
  floorTo,
  formatAt,
  formatLiveClock,
  formatTemporal,
  isBeforeNavigable,
  minNavigableMs,
  parseIso,
  periodAt,
  precisionLabel,
  temporalSpan,
  toIso,
  trackSpan,
  utcMs,
  yearOf,
} from '../temporal';

const NOW = utcMs(2026, 10, 14, 11, 25, 42);

describe('temporal model', () => {
  it('builds UTC timestamps for years below 100 without Date.UTC quirks', () => {
    expect(yearOf(utcMs(45))).toBe(45);
    expect(yearOf(utcMs(-500))).toBe(-500);
    expect(toIso(utcMs(-500))).toBe('-000500-01-01T00:00:00Z');
  });

  it('parses partial and extended ISO dates', () => {
    expect(parseIso('1815')).toBe(utcMs(1815));
    expect(parseIso('1815-06')).toBe(utcMs(1815, 6));
    expect(parseIso('1815-06-18')).toBe(utcMs(1815, 6, 18));
    expect(parseIso('2026-10-14T11:25:42Z')).toBe(NOW);
    expect(parseIso('2026-10-14T18:25:42+07:00')).toBe(NOW);
    expect(parseIso('+001815-06-18')).toBe(utcMs(1815, 6, 18));
    expect(() => parseIso('June 1815')).toThrow();
  });

  it('enforces the 1800 navigable minimum without baking it into the data model', () => {
    expect(TEMPORAL_CONFIG.minNavigableYear).toBe(1800);
    expect(minNavigableMs()).toBe(utcMs(1800));
    expect(clampToNavigable(utcMs(1700), NOW)).toBe(utcMs(1800));
    expect(clampToNavigable(utcMs(2030), NOW)).toBe(NOW);
    expect(isBeforeNavigable(utcMs(1799, 12, 31))).toBe(true);
    expect(isBeforeNavigable(utcMs(1800))).toBe(false);
    // Earlier dates remain representable for a future release.
    expect(parseIso('-000500')).toBeLessThan(minNavigableMs());
    expect(TEMPORAL_CONFIG.comingSoonLabel).toBe('Before 1800 — Coming Soon');
  });

  it('computes calendar periods and unit arithmetic', () => {
    const t = utcMs(1815, 6, 18, 14);
    expect(floorTo(t, 'century')).toBe(utcMs(1800));
    expect(floorTo(t, 'decade')).toBe(utcMs(1810));
    expect(periodAt(t, 'year')).toEqual({ startMs: utcMs(1815), endMs: utcMs(1816) });
    expect(addUnits(utcMs(2024, 1, 31), 'month', 1)).toBe(utcMs(2024, 2, 29));
    expect(addUnits(utcMs(1815, 6, 18), 'day', 2)).toBe(utcMs(1815, 6, 20));
  });

  it('never formats more precision than the record has', () => {
    expect(formatTemporal({ start: '1815-06-18', precision: 'day', approximate: false })).toBe(
      '18 Jun 1815',
    );
    expect(formatTemporal({ start: '1815-04', precision: 'month', approximate: false })).toBe(
      'Apr 1815',
    );
    expect(formatTemporal({ start: '1880', precision: 'year', approximate: true })).toBe('c. 1880');
    expect(
      formatTemporal({
        start: '1914-07-28',
        end: '1918-11-11',
        precision: 'day',
        approximate: false,
      }),
    ).toBe('28 Jul 1914 – 11 Nov 1918');
    expect(precisionLabel({ start: '1815-04', precision: 'month', approximate: false })).toBe(
      'unknown-day',
    );
    expect(precisionLabel({ start: '1880', precision: 'year', approximate: true })).toBe(
      'approximate',
    );
    expect(
      precisionLabel({ start: '1914', end: '1918', precision: 'year', approximate: false }),
    ).toBe('range');
  });

  it('spans records over their whole precision unit', () => {
    const span = temporalSpan({ start: '1815-04', precision: 'month', approximate: false });
    expect(span).toEqual({ startMs: utcMs(1815, 4), endMs: utcMs(1815, 5) });
  });

  it('formats the LIVE clock in UTC', () => {
    expect(formatLiveClock(NOW)).toEqual({ date: '14 OCT 2026', time: '11:25:42 UTC' });
    expect(formatAt(utcMs(1815), 'decade')).toBe('1810s');
  });

  it('only offers resolutions the data supports', () => {
    expect(allowedResolutions(utcMs(1815, 6, 18), NOW, 'day')).toEqual([
      'century',
      'decade',
      'year',
      'month',
      'day',
    ]);
    // Borders are dated to the day, so day resolution exists even without day-precise events.
    expect(allowedResolutions(utcMs(1815), NOW, null)).toEqual([
      'century',
      'decade',
      'year',
      'month',
      'day',
    ]);
    expect(allowedResolutions(NOW - 3_600_000, NOW, 'hour')).toContain('hour');
    expect(allowedResolutions(NOW - 3_600_000, NOW, 'day')).not.toContain('hour');
  });

  it('keeps the navigator track inside [1800, now]', () => {
    const s = trackSpan(utcMs(1802), 'year', NOW);
    expect(s.startMs).toBe(utcMs(1800));
    expect(s.endMs).toBeLessThanOrEqual(NOW);
    const live = trackSpan(NOW, 'day', NOW);
    expect(live.endMs).toBe(NOW);
  });
});
