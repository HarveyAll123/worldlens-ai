import { useEffect, useRef, useState } from 'react';
import { TIER_SETTINGS } from '../perf/tiers';
import type { QualityState } from '../perf/PerformanceManager';
import type { GlobeController } from '../globe/GlobeController';
import type { BorderFeatureLike } from '../globe/GeometryLayers';
import { useBorders, useCountryOutlines, useFrontlines, useVisibleEvents } from '../hooks/useData';
import { useReducedMotion } from '../hooks/useMedia';
import { useAppStore } from '../state/store';

/** Natural Earth entities whose sovereignty/recognition is disputed (shown with DISPUTED styling). */
const DISPUTED_ISO3 = new Set(['TWN', 'KOS', 'SOL', 'CYN', 'ESH', 'PSE', 'SAH']);

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
          (s) => [s.mode, s.timeMs, s.resolution] as const,
          ([mode, timeMs, resolution]) =>
            gl.setLightingTime(
              mode === 'live' ? Date.now() : resolution === 'hour' ? timeMs : null,
            ),
          {
            equalityFn: (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2],
            fireImmediately: true,
          },
        ),
      ];
      // Keep the day/night terminator current in LIVE mode (one render per minute).
      const sun = setInterval(() => {
        if (useAppStore.getState().mode === 'live') gl.setLightingTime(Date.now());
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

  // Borders: historical snapshots from the API; modern boundaries from Natural Earth.
  const borders = useBorders(layers.borders, settings.borderDetail);
  const needOutlines =
    !!highlightIso3 ||
    (layers.borders &&
      borders.data?.selection.available === true &&
      borders.data.selection.source === 'natural-earth');
  const outlines = useCountryOutlines(needOutlines);

  useEffect(() => {
    if (!globe) return;
    safely('borders', () => {
      if (!layers.borders || !borders.data?.selection.available) return globe.setBorders(null);
      const sel = borders.data.selection;
      if (sel.source === 'natural-earth') {
        if (!outlines.data) return;
        const feats: BorderFeatureLike[] = outlines.data.features.map((f) => ({
          properties: {
            name: f.properties.name,
            certainty: DISPUTED_ISO3.has(f.properties.iso3) ? 'DISPUTED' : 'CERTAIN',
          },
          geometry: f.geometry,
        }));
        globe.setBorders(feats);
      } else if (borders.data.features) {
        globe.setBorders(borders.data.features as BorderFeatureLike[]);
      }
    });
  }, [globe, layers.borders, borders.data, outlines.data, tier]);

  useEffect(() => {
    if (!globe) return;
    const f = highlightIso3
      ? outlines.data?.features.find((x) => x.properties.iso3 === highlightIso3)
      : null;
    safely('highlight', () => globe.setHighlight(f ? f.geometry : null));
  }, [globe, highlightIso3, outlines.data]);

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
