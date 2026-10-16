import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { floorTo, toIso } from '@worldlens/shared';
import { TIER_SETTINGS } from '../perf/tiers';
import type { QualityState } from '../perf/PerformanceManager';
import type { GlobeController } from '../globe/GlobeController';
import type { BorderFeatureLike } from '../globe/GeometryLayers';
import {
  activeOn,
  borderLines as ohmLines,
  landBorders,
  polityLabels,
  tilesInView,
} from '../globe/ohm';
import {
  useBorderLines,
  useBorders,
  useCountryOutlines,
  useFrontlines,
  useOhmCoarseWays,
  useOhmDetail,
  useOhmIndex,
  useVisibleEvents,
  type BorderLineScale,
} from '../hooks/useData';
import { useReducedMotion } from '../hooks/useMedia';
import { identifyCountry } from '../lib/countries';
import { useAppStore } from '../state/store';

const DAY_MS = 86_400_000;

/**
 * Moment the sun is placed for: now in LIVE; the selected hour when the timeline is at hour
 * level; otherwise the selected day at the current time of day (past dates rarely record the
 * hour, and the night side should still show).
 */
function sunTime(): number {
  const { mode, timeMs, resolution } = useAppStore.getState();
  const now = Date.now();
  if (mode === 'live') return now;
  if (resolution === 'hour') return timeMs;
  return floorTo(timeMs, 'day') + (now % DAY_MS);
}

/**
 * Border detail follows the camera: world-scale data looks wrong up close, fine data is
 * wasted (and slow) from orbit. Historical snapshots: API detail levels; modern borders:
 * Natural Earth 1:110m / 1:50m / 1:10m land boundaries.
 */
/** Below this altitude, dated borders use ~100 m geometry for the area in view. */
const OHM_DETAIL_BELOW_KM = 900;

function historicalDetail(altitudeKm: number): 'low' | 'medium' | 'high' {
  if (altitudeKm < 1_500) return 'high';
  if (altitudeKm < 6_000) return 'medium';
  return 'low';
}
function modernScale(altitudeKm: number): BorderLineScale {
  if (altitudeKm < 2_000) return '10m';
  if (altitudeKm < 8_000) return '50m';
  return '110m';
}

let controllerRef: GlobeController | null = null;
export const getGlobe = () => controllerRef;

/** Globe updates must never take the rest of the UI down. */
function safely(label: string, fn: () => void): void {
  try {
    fn();
  } catch (err) {
    console.error(`[globe] ${label} failed`, err);
  }
}

export function GlobeView({
  onQuality,
  onNotice,
}: {
  onQuality: (q: QualityState) => void;
  onNotice: (n: string | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const creditsRef = useRef<HTMLDivElement>(null);
  const [globe, setGlobe] = useState<GlobeController | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reducedMotion = useReducedMotion();
  const [tier, setTier] = useState<QualityState['tier']>('MEDIUM');

  useEffect(() => {
    if (!containerRef.current || !creditsRef.current) return;
    let disposed = false;
    let cleanup: (() => void) | null = null;
    // CesiumJS (~1 MB gzip) is code-split so the UI shell renders first on slow devices.
    void import('../globe/GlobeController')
      .then(({ GlobeController: Ctor }) => {
        if (disposed || !containerRef.current || !creditsRef.current) return;
        cleanup = start(Ctor);
      })
      .catch((err: unknown) => {
        console.error(err);
        setError('The 3D globe could not be loaded. The event list and timeline still work.');
      });
    const start = (Ctor: typeof GlobeController): (() => void) | null => {
      let gl: GlobeController;
      try {
        gl = new Ctor(
          containerRef.current!,
          creditsRef.current!,
          {
            onPick: (p) => {
              const s = useAppStore.getState();
              if (!p) return;
              if (p.kind === 'event') {
                s.selectEvent(p.id);
                s.setSheet('detail', true);
              } else {
                const alt = Math.max(200, s.camera.altitudeKm / 3);
                s.flyTo({ lat: p.lat, lon: p.lon, altitudeKm: alt });
              }
            },
            onGlobeClick: (lon, lat) => void identifyCountry(queryClient, lon, lat),
            onCamera: (c) => useAppStore.getState().setCamera(c),
            onBaseMapNotice: onNotice,
            onQuality: (q) => {
              setTier(q.tier);
              onQuality(q);
            },
          },
          {
            mapTilerKey: import.meta.env.VITE_MAPTILER_API_KEY,
            quality: useAppStore.getState().quality,
            reducedMotion,
          },
        );
      } catch (err) {
        console.error(err);
        setError(
          'Your browser could not start the 3D globe (WebGL unavailable). The event list and timeline still work.',
        );
        return null;
      }
      controllerRef = gl;
      setGlobe(gl);
      setTier(gl.perf.quality.tier);
      onQuality(gl.perf.quality);
      gl.intro();
      (window as unknown as { __worldlens?: unknown }).__worldlens = {
        diagnostics: () => gl.diagnostics(),
        perf: gl.perf,
      };

      const unsubs = [
        useAppStore.subscribe(
          (s) => s.flyRequest,
          (req) => req && gl.flyTo(req.lat, req.lon, req.altitudeKm),
        ),
        useAppStore.subscribe(
          (s) => s.selectedEventId,
          (id) => gl.setSelected(id),
        ),
        useAppStore.subscribe(
          (s) => s.quality,
          (q) => gl.setQualityPreference(q),
        ),
        useAppStore.subscribe(
          (s) => s.layers.labels,
          (on) => gl.setLabels(on),
        ),
        useAppStore.subscribe(
          (s) => [s.dayNight, s.nightLights] as const,
          ([dayNight, nightLights]) => gl.setNightOptions({ dayNight, nightLights }),
          { equalityFn: (a, b) => a[0] === b[0] && a[1] === b[1], fireImmediately: true },
        ),
        useAppStore.subscribe(
          (s) => [s.mode, s.timeMs, s.resolution] as const,
          () => gl.setLightingTime(sunTime()),
          {
            equalityFn: (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2],
            fireImmediately: true,
          },
        ),
      ];
      // Keep the day/night terminator moving with the clock (one render per minute).
      const sun = setInterval(() => {
        const s = useAppStore.getState();
        if (s.mode === 'live' || s.resolution !== 'hour') gl.setLightingTime(sunTime());
      }, 60_000);
      return () => {
        unsubs.forEach((u) => u());
        clearInterval(sun);
        controllerRef = null;
        gl.destroy();
      };
    };
    return () => {
      disposed = true;
      cleanup?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => globe?.setReducedMotion(reducedMotion), [globe, reducedMotion]);

  const settings = TIER_SETTINGS[tier];
  const events = useVisibleEvents(settings.maxEvents);
  const layers = useAppStore((s) => s.layers);
  const highlightIso3 = useAppStore((s) => s.highlightIso3);
  const mode = useAppStore((s) => s.mode);
  const timeMs = useAppStore((s) => s.timeMs);

  useEffect(() => {
    if (globe && events.data) safely('events', () => globe.setEvents(events.data.events));
  }, [globe, events.data]);

  // Borders. LIVE: today's boundaries from Natural Earth. Historical: OpenHistoricalMap's dated
  // borders (they change on the exact day a state, colony or occupation regime begins or ends),
  // falling back to the API's world-scale snapshots if those files cannot be loaded.
  const altitudeKm = useAppStore((s) => s.camera.altitudeKm);
  const viewBox = useAppStore((s) => s.camera.bbox);
  const historicalBorders = layers.borders && mode === 'historical';
  const selectedCountry = useAppStore((s) => s.selectedCountry);
  const ohmIndex = useOhmIndex(historicalBorders);
  const ohmCoarse = useOhmCoarseWays(historicalBorders || !!selectedCountry);
  const ohm = historicalBorders && !ohmIndex.isError && !ohmCoarse.isError;
  const day = toIso(floorTo(timeMs, 'day')).slice(0, 10);
  const detailTiles = useMemo(
    () =>
      ohm && ohmIndex.data && altitudeKm < OHM_DETAIL_BELOW_KM
        ? tilesInView(viewBox, ohmIndex.data)
        : [],
    [ohm, ohmIndex.data, altitudeKm, viewBox],
  );
  const ohmDetail = useOhmDetail(detailTiles);
  const ohmActive = useMemo(
    () => (ohmIndex.data ? activeOn(ohmIndex.data.polities, day) : null),
    [ohmIndex.data, day],
  );
  // Borders only change when the set of polities does — not on every day scrubbed through.
  const activeKey = ohmActive?.map((p) => `${p.start} ${p.name}`).join('\n') ?? '';
  // Zoomed in, only borders around the view are drawn (draping thousands on terrain is slow).
  const ohmCullBox = altitudeKm < OHM_DETAIL_BELOW_KM ? viewBox : null;
  const ohmLinesToDraw = useMemo(
    () =>
      ohmActive && ohmCoarse.data
        ? ohmLines(
            landBorders(ohmActive, ohmCoarse.data.ways, ohmCoarse.data.classes),
            ohmCoarse.data.ways,
            ohmDetail,
            ohmCullBox,
          )
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeKey, ohmCoarse.data, ohmDetail, ohmCullBox],
  );
  const ohmLabels = useMemo(
    () => (ohmActive ? polityLabels(ohmActive, viewBox) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeKey, viewBox],
  );

  const borders = useBorders(layers.borders && !ohm, historicalDetail(altitudeKm));
  const modern =
    layers.borders &&
    borders.data?.selection.available === true &&
    borders.data.selection.source === 'natural-earth';
  const borderLines = useBorderLines(modernScale(altitudeKm), modern);
  const outlines = useCountryOutlines(!!highlightIso3 || modern);

  useEffect(() => {
    if (!globe) return;
    safely('borders', () => {
      if (ohm) {
        if (ohmLinesToDraw) globe.setBorders([], ohmLinesToDraw, ohmLabels);
        return;
      }
      if (!layers.borders || !borders.data?.selection.available) return globe.setBorders(null);
      const sel = borders.data.selection;
      if (sel.source === 'natural-earth') {
        // Land boundary lines are drawn; the 1:110m polygons only place the country labels.
        if (!outlines.data || !borderLines.data) return;
        const feats: BorderFeatureLike[] = outlines.data.features.map((f) => ({
          properties: { name: f.properties.name, certainty: 'CERTAIN' },
          geometry: f.geometry,
        }));
        globe.setBorders(feats, borderLines.data.features);
      } else if (borders.data.features) {
        globe.setBorders(borders.data.features as BorderFeatureLike[]);
      }
    });
    // Labels are refreshed separately below, so camera moves do not rebuild the lines.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    globe,
    ohm,
    ohmLinesToDraw,
    layers.borders,
    borders.data,
    outlines.data,
    borderLines.data,
    tier,
  ]);

  useEffect(() => {
    if (globe && ohm && ohmLabels) safely('border labels', () => globe.setBorderLabels(ohmLabels));
  }, [globe, ohm, ohmLabels]);

  useEffect(() => {
    if (!globe) return;
    const f = highlightIso3
      ? outlines.data?.features.find((x) => x.properties.iso3 === highlightIso3)
      : null;
    safely('highlight', () => globe.setHighlight(f ? f.geometry : null));
  }, [globe, highlightIso3, outlines.data]);

  // Outline of the selected country: its borders on land (its coast is left to the imagery).
  useEffect(() => {
    if (!globe) return;
    safely('country outline', () => {
      const data = ohmCoarse.data;
      if (!selectedCountry || !data) return globe.setCountryOutline(null);
      globe.setCountryOutline(
        selectedCountry.ways
          .filter((w) => data.classes[w] !== '0')
          .map((w) => ohmDetail.get(w) ?? data.ways[w])
          .filter((flat): flat is number[] => !!flat),
      );
    });
  }, [globe, selectedCountry, ohmCoarse.data, ohmDetail]);

  const frontlines = useFrontlines(layers.frontlines);
  useEffect(() => {
    if (globe)
      safely('frontlines', () =>
        globe.setFrontlines(layers.frontlines ? (frontlines.data?.frontlines ?? []) : []),
      );
  }, [globe, layers.frontlines, frontlines.data]);

  useEffect(() => {
    globe?.setEventsVisible(layers.news || layers.history);
  }, [globe, layers.news, layers.history]);

  return (
    <div className="absolute inset-0" data-mode={mode} data-time={timeMs}>
      <div
        ref={containerRef}
        className="absolute inset-0"
        role="application"
        aria-label="Interactive 3D globe. Use the events list for a text alternative."
        data-testid="globe"
      />
      {error && (
        <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-slate-300">
          <p className="glass max-w-md rounded-xl p-4">{error}</p>
        </div>
      )}
      <div
        ref={creditsRef}
        className="credits pointer-events-auto absolute bottom-[132px] left-3 max-w-[60vw] md:bottom-[118px]"
        aria-label="Map data credits"
      />
    </div>
  );
}
