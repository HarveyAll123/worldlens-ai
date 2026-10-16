import { useEffect, useState } from 'react';
import { goToTourStep } from '../ai/actionExecutor';
import { apiStats } from '../lib/api';
import { useAppStore } from '../state/store';
import { getGlobe } from './GlobeView';
import type { GlobeDiagnostics } from '../globe/GlobeController';

/** Hidden developer diagnostics (Shift+D, ?diag=1, or the Layers menu). */
export function DiagnosticsPanel() {
  const open = useAppStore((s) => s.diagnosticsOpen);
  const setOpen = useAppStore((s) => s.setDiagnostics);
  const [d, setD] = useState<GlobeDiagnostics | null>(null);

  useEffect(() => {
    if (new URLSearchParams(location.search).has('diag')) setOpen(true);
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (e.shiftKey && e.key.toLowerCase() === 'd' && tag !== 'INPUT' && tag !== 'TEXTAREA')
        setOpen(!useAppStore.getState().diagnosticsOpen);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen]);

  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => setD(getGlobe()?.diagnostics() ?? null), 500);
    return () => clearInterval(t);
  }, [open]);

  if (!open) return null;
  const rows: Array<[string, string | number]> = d
    ? [
        ['FPS (active frames)', d.fps],
        ['Frame time p50 / p90', `${d.frameTimeP50} / ${d.frameTimeP90} ms`],
        ['Quality', `${d.tier} (${d.preference})`],
        ['Target', `${d.targetFps} FPS`],
        ['Resolution scale', `${d.resolutionScale} (px ratio ${d.effectivePixelRatio})`],
        ['Canvas', d.canvas],
        ['Lighting', d.lighting],
        ['Camera altitude', `${d.cameraAltitudeKm.toLocaleString()} km`],
        ['Visible events', `${d.visibleEvents} (${d.clusters} clusters)`],
        ['Visible labels', d.visibleLabels],
        ['Visible polygons', d.visiblePolygons],
        ['Frontlines', d.frontlines],
        [
          'Network requests',
          `${d.networkRequests} (API ${apiStats.requests}, failed ${apiStats.failures})`,
        ],
        ['Frames rendered', d.framesRendered],
        ['Imagery / terrain', `${d.imagery} / ${d.terrain}`],
        ['GPU', d.gpu],
      ]
    : [];
  return (
    <aside
      className="glass pointer-events-auto absolute left-3 top-20 z-40 w-[290px] rounded-xl p-3 font-mono text-[11px]"
      aria-label="Developer diagnostics"
      data-testid="diagnostics"
    >
      <div className="mb-1.5 flex items-center">
        <strong className="text-[11px] tracking-wider text-slate-200">DIAGNOSTICS</strong>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="ml-auto text-slate-400 hover:text-white"
          aria-label="Close diagnostics"
        >
          ✕
        </button>
      </div>
      <dl className="space-y-0.5">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-2">
            <dt className="text-slate-400">{k}</dt>
            <dd
              className="m-0 truncate text-right text-slate-100"
              data-testid={`diag-${k.split(' ')[0]!.toLowerCase()}`}
            >
              {v}
            </dd>
          </div>
        ))}
      </dl>
      {d && d.decisions.length > 0 && (
        <ul className="mt-2 space-y-0.5 border-t border-white/10 pt-1.5 text-[10px] text-slate-400">
          {d.decisions.map((x, i) => (
            <li key={i}>
              → {x.tier} @{x.scale} ({x.targetFps}fps): {x.reason}
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

/** Tour controls for multi-step AI answers. Auto-advances unless paused or reduced motion. */
export function TourBar() {
  const tour = useAppStore((s) => s.tour);
  const setTour = useAppStore((s) => s.setTour);
  useEffect(() => {
    if (!tour?.playing) return;
    if (tour.index >= tour.steps.length - 1) {
      setTour({ ...tour, playing: false });
      return;
    }
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;
    const t = setTimeout(() => goToTourStep(tour.index + 1), 3400);
    return () => clearTimeout(t);
  }, [tour, setTour]);
  if (!tour) return null;
  return (
    <div
      className="glass pointer-events-auto flex items-center gap-1 rounded-full px-2 py-1 text-[12px]"
      role="group"
      aria-label="Guided tour"
      data-testid="tour-bar"
    >
      <span className="px-1 text-slate-300">
        Tour {tour.index + 1}/{tour.steps.length}
      </span>
      <button
        type="button"
        className="rounded-full px-2 py-0.5 hover:bg-white/10 disabled:opacity-30"
        disabled={tour.index === 0}
        onClick={() => goToTourStep(tour.index - 1)}
        aria-label="Previous step"
      >
        ‹
      </button>
      <button
        type="button"
        className="rounded-full px-2 py-0.5 hover:bg-white/10"
        onClick={() => setTour({ ...tour, playing: !tour.playing })}
      >
        {tour.playing ? 'Pause' : 'Play'}
      </button>
      <button
        type="button"
        className="rounded-full px-2 py-0.5 hover:bg-white/10 disabled:opacity-30"
        disabled={tour.index >= tour.steps.length - 1}
        onClick={() => goToTourStep(tour.index + 1)}
        aria-label="Next step"
      >
        ›
      </button>
      <button
        type="button"
        className="rounded-full px-2 py-0.5 text-slate-400 hover:bg-white/10"
        onClick={() => setTour(null)}
      >
        End
      </button>
    </div>
  );
}

export function Announcer() {
  const msg = useAppStore((s) => s.announcement);
  const mode = useAppStore((s) => s.mode);
  const [text, setText] = useState('');
  useEffect(() => setText(msg), [msg]);
  useEffect(() => setText(mode === 'live' ? 'Live mode' : 'Historical mode'), [mode]);
  return (
    <div className="sr-only" aria-live="polite" role="status">
      {text}
    </div>
  );
}
