/**
 * Selecting dated countries (OpenHistoricalMap polities): from a click on the globe, or from
 * search. The OHM files load on first use.
 */
import type { QueryClient } from '@tanstack/react-query';
import { floorTo, parseIso, toIso, type Resolution } from '@worldlens/shared';
import { activeOn, polityAt, type OhmPolity, type PolityMatch } from '../globe/ohm';
import { ohmCoarseQuery, ohmIndexQuery } from '../hooks/useData';
import { useAppStore, type CountrySelection } from '../state/store';

function currentDay(): string {
  const s = useAppStore.getState();
  return toIso(floorTo(s.mode === 'live' ? Date.now() : s.timeMs, 'day')).slice(0, 10);
}

export function toSelection(p: OhmPolity): CountrySelection {
  return {
    name: p.name,
    start: p.start,
    end: p.end,
    wikidata: p.wikidata,
    label: p.label,
    bbox: p.bbox,
    ways: p.ways,
  };
}

/** Camera altitude that frames a country's extent. */
function altitudeFor(c: CountrySelection): number {
  const [w, s, e, n] = c.bbox;
  const latSpan = n - s;
  const lonSpan = Math.min(e - w, 120) * Math.cos(((s + n) / 2) * (Math.PI / 180));
  return Math.min(9_000, Math.max(350, Math.max(latSpan, lonSpan) * 111 * 1.9));
}

export function flyToCountry(c: CountrySelection): void {
  useAppStore.getState().flyTo({
    lat: c.label[1],
    lon: c.label[0],
    altitudeKm: altitudeFor(c),
    label: c.name,
  });
}

/** Clicked point → the country covering it on the selected date (null on open sea). */
export async function identifyCountry(qc: QueryClient, lon: number, lat: number): Promise<void> {
  const [index, coarse] = await Promise.all([
    qc.ensureQueryData(ohmIndexQuery),
    qc.ensureQueryData(ohmCoarseQuery),
  ]);
  const s = useAppStore.getState();
  const p = polityAt(activeOn(index.polities, currentDay()), coarse.ways, lon, lat);
  if (!p) {
    if (s.selectedCountry) s.selectCountry(null);
    return;
  }
  s.selectCountry(toSelection(p));
  s.setSheet('detail', true);
  s.announce(`${p.name}`);
}

/** A search result: move the timeline into the country's period if needed, fly, select. */
export function showCountry(m: PolityMatch): void {
  const s = useAppStore.getState();
  if (!m.activeNow) {
    const res: Resolution =
      m.polity.start.length >= 10 ? 'day' : m.polity.start.length >= 7 ? 'month' : 'year';
    s.setTime(parseIso(m.polity.start), res);
  }
  const c = toSelection(m.polity);
  s.setLayer('borders', true);
  s.selectCountry(c);
  s.setSheet('detail', true);
  flyToCountry(c);
  s.announce(`Showing ${c.name}`);
}
