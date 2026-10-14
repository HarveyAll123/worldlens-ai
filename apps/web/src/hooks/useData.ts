/** TanStack Query hooks. Only what the camera/time/layers need is requested. */
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { floorTo, toIso, type Resolution } from '@worldlens/shared';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAppStore } from '../state/store';

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
  // Debounce mode together with the period so a request never mixes "live" and a date.
  const key = useDebounced({ mode, period, resolution, bbox }, mode === 'live' ? 0 : 180);

  const kinds = [
    layers.news && kindFilter !== 'historical' ? 'news' : null,
    layers.history && kindFilter !== 'news' && key.mode === 'historical' ? 'historical' : null,
  ].filter(Boolean) as string[];
  return useQuery({
    queryKey: [
      'events',
      key.mode,
      key.period,
      key.resolution,
      key.bbox,
      kinds.join(','),
      layers.demo,
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
              limit,
            },
            signal,
          ),
    placeholderData: keepPreviousData,
    refetchInterval: key.mode === 'live' ? 60_000 : false,
    staleTime: key.mode === 'live' ? 30_000 : 5 * 60_000,
  });
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

/** Natural Earth outlines (public domain), loaded lazily for highlights and modern borders. */
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
