import { describe, expect, it } from 'vitest';
import { LIGHTS_FROM_YEAR, nightLightsAt, yearOf } from './nightLights';

const at = (iso: string) => Date.parse(iso);

describe('nightLightsAt', () => {
  it('has no lights before electric street lighting', () => {
    expect(nightLightsAt(at('1815-06-18T22:00:00Z'))).toBeNull();
    expect(nightLightsAt(at('1879-12-31T23:00:00Z'))).toBeNull();
    expect(nightLightsAt(at(`${LIGHTS_FROM_YEAR}-01-02T00:00:00Z`))).not.toBeNull();
  });

  it('shows only the brightest cores early on and fills in over time', () => {
    const y1900 = nightLightsAt(at('1900-01-01T00:00:00Z'))!;
    const y1950 = nightLightsAt(at('1950-01-01T00:00:00Z'))!;
    const y1990 = nightLightsAt(at('1990-01-01T00:00:00Z'))!;
    expect(y1900.cut).toBeGreaterThan(y1950.cut);
    expect(y1950.cut).toBeGreaterThan(y1990.cut);
    expect(y1900.alpha).toBeLessThan(y1950.alpha);
    expect(y1950.alpha).toBeLessThan(y1990.alpha);
  });

  it('is the full 2016 data from 2016 on', () => {
    expect(nightLightsAt(at('2016-06-01T00:00:00Z'))).toEqual({ alpha: 1, cut: 0 });
    expect(nightLightsAt(at('2026-10-15T20:00:00Z'))).toEqual({ alpha: 1, cut: 0 });
  });

  it('computes fractional years', () => {
    expect(yearOf(0)).toBe(1970);
    expect(yearOf(at('2000-07-02T00:00:00Z'))).toBeCloseTo(2000.5, 2);
  });
});
