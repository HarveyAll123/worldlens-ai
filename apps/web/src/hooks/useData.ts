/** TanStack Query hooks. Only what the camera/time/layers need is requested. */
import { keepPreviousData, queryOptions, useQueries, useQuery } from '@tanstack/react-query';
import { floorTo, toIso, type Resolution } from '@worldlens/shared';
import { useEffect, useMemo, useState } from 'react';
import type { BorderLineLike } from '../globe/GeometryLayers';
import { parseOhmIndex, type Succession } from '../globe/ohm';
import { api } from '../lib/api';
import { eventsAt } from '../lib/timelineEvents';
import { useAppStore } from '../state/store';
import { useThrottled } from './useThrottled';

export function useConfig() {
  return useQuery({ queryKey: ['config'], queryFn: api.config, staleTime: 60_000, retry: 1 });
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function useVisibleEvents(limit: number) {
  const mode = useAppStore((s) => s.mode);
  const timeMs = useAppStore((s) => s.timeMs);
  const resolution = useAppStore((s) => s.resolution);
  const bbox = useAppStore((s) => s.camera.bbox);
  const layers = useAppStore((s) => s.layers);
  const kindFilter = useAppStore((s) => s.kindFilter);
  const period = mode === 'live' ? 'live' : toIso(floorTo(timeMs, resolution));
  // Mode travels with the period so a request never mixes "live" and a date. Throttled, not
  // debounced: a dragged timeline changes the period every ~160 ms, so a debounce only fired
  // once the drag stopped and the map kept the events of the period the drag started in.
  const wanted = useMemo(
    () => ({ mode, period, resolution, bbox }),
    [mode, period, resolution, bbox],
  );
  const key = useThrottled(wanted, mode === 'live' ? 0 : 150);

  const kinds = [
    layers.news && kindFilter !== 'historical' ? 'news' : null,
    layers.history && kindFilter !== 'news' && key.mode === 'historical' ? 'historical' : null,
  ].filter(Boolean) as string[];
  const query = useQuery({
    queryKey: [
      'events',
      key.mode,
      key.period,
      key.resolution,
      key.bbox,
      kinds.join(','),
      layers.demo,
      layers.battles,
      limit,
    ],
    queryFn: ({ signal }) =>
      kinds.length === 0
        ? Promise.resolve({
            events: [],
            total: 0,
            truncated: false,
            window: { start: '', end: '' },
            finestPrecision: null,
          })
        : api.events(
            {
              mode: key.mode,
              ...(key.mode === 'historical' ? { t: key.period } : {}),
              res: key.resolution as Resolution,
              bbox: key.bbox,
              kinds: kinds.join(','),
              demo: layers.demo,
              battles: layers.battles,
              limit,
            },
            signal,
          ),
    placeholderData: keepPreviousData,
    refetchInterval: key.mode === 'live' ? 60_000 : false,
    staleTime: key.mode === 'live' ? 30_000 : 5 * 60_000,
  });
  // Only the events of the selected time, even while the response is for an earlier one.
  const data = useMemo(
    () => query.data && eventsAt(query.data, mode, timeMs, resolution),
    [query.data, mode, timeMs, resolution],
  );
  // Getters, not a spread: reading every field would re-render callers on any query change.
  return {
    data,
    get isFetching() {
      return query.isFetching;
    },
    get isError() {
      return query.isError;
    },
  };
}

export function useEventDetail(id: string | null) {
  return useQuery({
    queryKey: ['event', id],
    queryFn: () => api.event(id!),
    enabled: !!id,
    staleTime: 60_000,
  });
}

export function useSources(id: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['sources', id],
    queryFn: () => api.sources(id!),
    enabled: !!id && enabled,
    staleTime: 60_000,
  });
}

export function useRelated(id: string | null) {
  return useQuery({
    queryKey: ['related', id],
    queryFn: () => api.context(id!),
    enabled: !!id,
    staleTime: 5 * 60_000,
  });
}

export function useWikipedia(title: string | undefined) {
  return useQuery({
    queryKey: ['wiki', title],
    queryFn: () => api.wikipedia(title!),
    enabled: !!title,
    staleTime: 24 * 3_600_000,
    retry: 0,
  });
}

export function useBorders(enabled: boolean, detail: 'low' | 'medium' | 'high') {
  const mode = useAppStore((s) => s.mode);
  const timeMs = useAppStore((s) => s.timeMs);
  const year = new Date(mode === 'live' ? Date.now() : timeMs).getUTCFullYear();
  const debouncedYear = useDebounced(year, 250);
  return useQuery({
    queryKey: ['borders', debouncedYear, detail],
    queryFn: ({ signal }) => api.borders(String(debouncedYear).padStart(4, '0'), detail, signal),
    enabled,
    staleTime: 24 * 3_600_000,
    placeholderData: keepPreviousData,
    retry: 0,
  });
}

export function useFrontlines(enabled: boolean) {
  const mode = useAppStore((s) => s.mode);
  const timeMs = useAppStore((s) => s.timeMs);
  const day = toIso(floorTo(mode === 'live' ? Date.now() : timeMs, 'day'));
  return useQuery({
    queryKey: ['frontlines', day],
    queryFn: () => api.frontlines(day),
    enabled,
    staleTime: 3_600_000,
  });
}

export type BorderLineScale = '110m' | '50m' | '10m';

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} unavailable`);
  return (await res.json()) as T;
}

/** OpenHistoricalMap dated borders: polity index (names, dates, ways) — loaded once. */
export const ohmIndexQuery = queryOptions({
  queryKey: ['ohm-index'],
  queryFn: async () => parseOhmIndex(await fetchJson('/data/ohm/polities.json')),
  staleTime: Number.POSITIVE_INFINITY,
  retry: 1,
});

/** Simplified (~2 km) geometry of every OHM way and where it lies (inland / coast / sea). */
export const ohmCoarseQuery = queryOptions({
  queryKey: ['ohm-ways-coarse'],
  queryFn: () => fetchJson<{ ways: number[][]; classes: string }>('/data/ohm/ways-coarse.json'),
  staleTime: Number.POSITIVE_INFINITY,
  retry: 1,
});

export interface FlagsEntry {
  label: string | null;
  related?: string[];
  wiki: string | null;
  description: string | null;
  capitals: string[];
  flags: Array<[string, string | null, string | null, boolean]>;
}

/** Flags (with the dates each was in use) and facts per Wikidata id (scripts/build-flags.ts). */
export const ohmFlagsQuery = queryOptions({
  queryKey: ['ohm-flags'],
  queryFn: async () =>
    (await fetchJson<{ items: Record<string, FlagsEntry> }>('/data/ohm/flags.json')).items,
  staleTime: Number.POSITIVE_INFINITY,
  retry: 1,
});

/** Which country comes before / after which (Wikidata), for a selection following the date. */
export const ohmSuccessionQuery = queryOptions({
  queryKey: ['ohm-succession'],
  queryFn: async () => (await fetchJson<{ items: Succession }>('/data/ohm/succession.json')).items,
  staleTime: Number.POSITIVE_INFINITY,
  retry: 1,
});

export function useOhmIndex(enabled: boolean) {
  return useQuery({ ...ohmIndexQuery, enabled });
}

export function useOhmCoarseWays(enabled: boolean) {
  return useQuery({ ...ohmCoarseQuery, enabled });
}

export function useOhmFlags(enabled: boolean) {
  return useQuery({ ...ohmFlagsQuery, enabled });
}

/** Detailed (~100 m) OHM way geometry for the tiles in view; merged into one map. */
export function useOhmDetail(tiles: string[]): Map<number, number[]> {
  const results = useQueries({
    queries: tiles.map((tile) => ({
      queryKey: ['ohm-ways', tile],
      queryFn: async () => {
        const res = await fetch(`/data/ohm/ways-${tile}.json`);
        if (!res.ok) throw new Error('detail tile unavailable');
        return ((await res.json()) as { ways: Record<string, number[]> }).ways;
      },
      staleTime: Number.POSITIVE_INFINITY,
      retry: 1,
    })),
  });
  // Rebuild the merged map only when a tile finishes loading or the tile set changes.
  const key = `${tiles.join(',')}|${results.map((r) => r.dataUpdatedAt).join(',')}`;
  return useMemo(() => {
    const out = new Map<number, number[]>();
    for (const r of results)
      if (r.data) for (const [k, v] of Object.entries(r.data)) out.set(Number(k), v);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

/** Natural Earth land boundary lines (public domain) for modern borders, by map scale. */
export function useBorderLines(scale: BorderLineScale, enabled: boolean) {
  return useQuery({
    queryKey: ['border-lines', scale],
    queryFn: async () => {
      const res = await fetch(`/data/borders-${scale}.json`);
      if (!res.ok) throw new Error('border lines unavailable');
      return (await res.json()) as { features: BorderLineLike[] };
    },
    enabled,
    staleTime: Number.POSITIVE_INFINITY,
    // Keep drawing the previous scale while a finer one loads.
    placeholderData: keepPreviousData,
  });
}

/** Natural Earth outlines (public domain), loaded lazily for highlights and modern labels. */
export function useCountryOutlines(enabled: boolean) {
  return useQuery({
    queryKey: ['countries-110m'],
    queryFn: async () => {
      const res = await fetch('/data/countries-110m.json');
      if (!res.ok) throw new Error('outlines unavailable');
      return (await res.json()) as {
        features: Array<{
          properties: { iso3: string; name: string };
          geometry:
            | { type: 'Polygon'; coordinates: number[][][] }
            | { type: 'MultiPolygon'; coordinates: number[][][][] };
        }>;
      };
    },
    enabled,
    staleTime: Number.POSITIVE_INFINITY,
  });
}
