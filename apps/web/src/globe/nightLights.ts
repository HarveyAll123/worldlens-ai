/**
 * City lights on the night side, kept to the era: there are none before electric street
 * lighting (arc lamps in Paris 1878, Wabash — the first town lit electrically — 1880, Edison's
 * Pearl Street station 1882), and the one satellite composite we have (NASA, 2016) is thinned
 * out for earlier years so only the brightest city cores show at first and the rest fill in
 * over the decades.
 */
export const LIGHTS_FROM_YEAR = 1880;
/** Year of the NASA VIIRS night-lights composite. */
export const LIGHTS_DATA_YEAR = 2016;

export interface NightLightsLook {
  /** Layer opacity on the night side, 0–1. */
  alpha: number;
  /** Pixels dimmer than this (0–1, lifted intensity of the 2016 data) are hidden. */
  cut: number;
}

const MS_PER_YEAR = 365.2425 * 86_400_000;

/** Fractional calendar year (1970-01-01 = 1970.0). */
export function yearOf(ms: number): number {
  return 1970 + ms / MS_PER_YEAR;
}

/** How the night lights look on a date; null when there were no electric lights yet. */
export function nightLightsAt(ms: number): NightLightsLook | null {
  const year = yearOf(ms);
  if (year < LIGHTS_FROM_YEAR) return null;
  const t = Math.min(1, (year - LIGHTS_FROM_YEAR) / (LIGHTS_DATA_YEAR - LIGHTS_FROM_YEAR));
  // Electrification was slow: a few city centres by 1900, most of the lights only after 1950.
  return {
    alpha: 1 - 0.7 * (1 - t ** 0.6),
    cut: 0.95 * (1 - t ** 1.3),
  };
}
