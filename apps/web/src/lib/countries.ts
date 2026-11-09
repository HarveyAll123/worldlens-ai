/**
 * Selecting dated countries (OpenHistoricalMap polities): from a click on the globe, or from
 * search. The OHM files load on first use.
 */
import type { QueryClient } from '@tanstack/react-query';
import { floorTo, parseIso, toIso, type Resolution } from '@worldlens/shared';
import { activeOn, followCountry, polityAt, type OhmPolity, type PolityMatch } from '../globe/ohm';
import { ohmCoarseQuery, ohmIndexQuery, ohmSuccessionQuery } from '../hooks/useData';
import { useAppStore, type CountrySelection } from '../state/store';

function dayOf(s: { mode: string; timeMs: number }): string {
  return toIso(floorTo(s.mode === 'live' ? Date.now() : s.timeMs, 'day')).slice(0, 10);
}

function currentDay(): string {
  return dayOf(useAppStore.getState());
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
  s.openCountry(toSelection(p));
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
  s.openCountry(c);
  flyToCountry(c);
  s.announce(`Showing ${c.name}`);
}

/**
 * Keep a selected country in step with the timeline. When the date leaves the period of the
 * selected borders, the panel and outline move to the same country's borders of that day, or
 * its successor / predecessor, or whoever holds its land (followCountry); with nothing to
 * follow, the panel closes. Returns the unsubscribe function.
 */
export function followCountriesInTime(qc: QueryClient): () => void {
  let latest = 0;
  return useAppStore.subscribe(
    (s) => [s.selectedCountry, dayOf(s)] as const,
    async ([selected, day]) => {
      if (!selected) return;
      if (selected.start <= day && (!selected.end || selected.end > day)) return;
      const run = ++latest;
      const [index, coarse, succession] = await Promise.all([
        qc.ensureQueryData(ohmIndexQuery),
        qc.ensureQueryData(ohmCoarseQuery),
        qc.ensureQueryData(ohmSuccessionQuery),
      ]);
      const s = useAppStore.getState();
      // A newer date or another selection arrived while the data loaded.
      if (run !== latest || s.selectedCountry !== selected || dayOf(s) !== day) return;
      const result = followCountry(selected, index.polities, succession, day, coarse.ways);
      if (result.kind === 'keep') return;
      if (result.kind === 'close') {
        s.selectCountry(null);
        s.announce(`${selected.name} did not exist on this date`);
        return;
      }
      const next = toSelection(result.polity);
      s.selectCountry(next);
      if (next.name !== selected.name) s.announce(`Now ${next.name}`);
    },
    { equalityFn: (a, b) => a[0] === b[0] && a[1] === b[1] },
  );
}
