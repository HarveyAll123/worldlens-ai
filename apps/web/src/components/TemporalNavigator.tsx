/**
 * Temporal navigator: 1800 → LIVE, with "Before 1800 — Coming Soon" immediately to the left.
 * Resolution (century … hour) is limited to what the data near the selected time supports.
 * Keyboard: ←/→ one unit · Shift+←/→ ten units · PageUp/PageDown one coarser unit ·
 * Home = 1800 · End = LIVE · +/− zoom resolution.
 */
import { useQuery } from '@tanstack/react-query';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  RESOLUTIONS,
  TEMPORAL_CONFIG,
  addUnits,
  allowedResolutions,
  coarser,
  finer,
  floorTo,
  formatAt,
  minNavigableMs,
  toIso,
  trackSpan,
  type Resolution,
} from '@worldlens/shared';
import { api } from '../lib/api';
import { useVisibleEvents } from '../hooks/useData';
import { TIER_SETTINGS } from '../perf/tiers';
import { useAppStore } from '../state/store';

const RES_LABEL: Record<Resolution, string> = {
  century: 'Century',
  decade: 'Decade',
  year: 'Year',
  month: 'Month',
  day: 'Day',
  hour: 'Hour',
};
const RES_SHORT: Record<Resolution, string> = {
  century: 'C',
  decade: '10y',
  year: 'Y',
  month: 'M',
  day: 'D',
  hour: 'H',
};

/** Tick unit and label format for each zoom level. */
const TICKS: Record<
  Resolution,
  { unit: 'century' | 'decade' | 'year' | 'month' | 'day' | 'hour'; step: number; fmt: Resolution }
> = {
  century: { unit: 'decade', step: 2, fmt: 'year' },
  decade: { unit: 'decade', step: 1, fmt: 'year' },
  year: { unit: 'year', step: 1, fmt: 'year' },
  month: { unit: 'month', step: 3, fmt: 'month' },
  day: { unit: 'day', step: 7, fmt: 'day' },
  hour: { unit: 'hour', step: 12, fmt: 'hour' },
};

export function TemporalNavigator({ compact }: { compact: boolean }) {
  const mode = useAppStore((s) => s.mode);
  const storeTime = useAppStore((s) => s.timeMs);
  const resolution = useAppStore((s) => s.resolution);
  const setTime = useAppStore((s) => s.setTime);
  const setResolution = useAppStore((s) => s.setResolution);
  const returnToLive = useAppStore((s) => s.returnToLive);
  const tier = useAppStore((s) => s.qualityTier);
  const events = useVisibleEvents(TIER_SETTINGS[tier].maxEvents);
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const timeMs = mode === 'live' ? nowMs : storeTime;
  const [viewRes, setViewRes] = useState<Resolution>('century');
  // The track zoom follows the selected resolution, but the default view shows the full range.
  useEffect(() => {
    setViewRes(mode === 'live' && resolution === 'day' ? 'century' : resolution);
  }, [resolution, mode]);

  const span = useMemo(() => trackSpan(timeMs, viewRes, nowMs), [timeMs, viewRes, nowMs]);
  const min = minNavigableMs();
  const allowed = allowedResolutions(timeMs, nowMs, events.data?.finestPrecision ?? null);

  useEffect(() => {
    if (
      mode === 'historical' &&
      !events.isFetching &&
      events.data &&
      !allowed.includes(resolution)
    ) {
      setResolution(allowed[allowed.length - 1]!);
    }
  }, [allowed, events.data, events.isFetching, mode, resolution, setResolution]);

  const density = useQuery({
    queryKey: ['density', viewRes === 'century' ? 'all' : `${span.startMs}-${span.endMs}`],
    queryFn: () => api.density(toIso(span.startMs), toIso(span.endMs), 120),
    staleTime: 3_600_000,
    retry: 0,
  });

  const fraction = (ms: number) => (ms - span.startMs) / Math.max(1, span.endMs - span.startMs);
  const msAt = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el) return timeMs;
      const r = el.getBoundingClientRect();
      const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
      return span.startMs + f * (span.endMs - span.startMs);
    },
    [span, timeMs],
  );

  const commit = useCallback(
    (ms: number, res: Resolution = resolution) => {
      const clamped = Math.min(nowMs, Math.max(min, ms));
      if (nowMs - clamped < 60_000) return returnToLive();
      // Snap to the resolution unit so the display never claims more precision than chosen.
      const effective: Resolution = allowed.includes(res) ? res : allowed[allowed.length - 1]!;
      setTime(
        floorTo(clamped, effective === 'century' ? 'year' : effective),
        effective === 'century' ? 'year' : effective,
      );
    },
    [allowed, min, nowMs, resolution, returnToLive, setTime],
  );

  const step = (n: number, unit: Resolution = resolution) =>
    commit(addUnits(timeMs, unit === 'century' ? 'decade' : unit, n), resolution);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const r = resolution === 'century' ? 'year' : resolution;
    switch (e.key) {
      case 'ArrowLeft':
      case 'ArrowDown':
        e.preventDefault();
        commit(addUnits(timeMs, r, e.shiftKey ? -10 : -1));
        break;
      case 'ArrowRight':
      case 'ArrowUp':
        e.preventDefault();
        commit(addUnits(timeMs, r, e.shiftKey ? 10 : 1));
        break;
      case 'PageUp':
        e.preventDefault();
        commit(addUnits(timeMs, coarser(r) ?? 'century', -1));
        break;
      case 'PageDown':
        e.preventDefault();
        commit(addUnits(timeMs, coarser(r) ?? 'century', 1));
        break;
      case 'Home':
        e.preventDefault();
        commit(min, 'year');
        break;
      case 'End':
        e.preventDefault();
        returnToLive();
        break;
      case '+':
      case '=': {
        const f = finer(resolution);
        if (f && allowed.includes(f)) setResolution(f);
        break;
      }
      case '-': {
        const c = coarser(resolution);
        if (c) setResolution(c);
        break;
      }
    }
  };

  // Pointer precision depends on zoom: a pixel at century zoom is months wide, so pick years.
  const POINTER_RES: Record<Resolution, Resolution> = {
    century: 'year',
    decade: 'year',
    year: 'month',
    month: 'day',
    day: 'day',
    hour: 'hour',
  };
  const pointerRes = POINTER_RES[viewRes];
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setDragging(true);
    commit(msAt(e.clientX), pointerRes);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragging) commit(msAt(e.clientX), pointerRes);
  };
  const onWheel = (e: React.WheelEvent) => {
    if (Math.abs(e.deltaY) < 4) return;
    const next = e.deltaY < 0 ? finer(viewRes) : coarser(viewRes);
    if (next && (e.deltaY > 0 || allowed.includes(next))) {
      setViewRes(next);
      if (e.deltaY < 0 && mode === 'historical') setResolution(next);
    }
  };

  const ticks = useMemo(() => {
    const t = TICKS[viewRes];
    const out: Array<{ ms: number; label: string }> = [];
    let ms = floorTo(span.startMs, t.unit);
    let guard = 0;
    while (ms <= span.endMs && guard++ < 400) {
      if (ms >= span.startMs) out.push({ ms, label: formatAt(ms, t.fmt, { upper: false }) });
      ms = addUnits(ms, t.unit, t.step);
    }
    const maxTicks = compact ? 5 : 11;
    const stride = Math.max(1, Math.ceil(out.length / maxTicks));
    return out.filter((_, i) => i % stride === 0);
  }, [span, viewRes, compact]);

  const counts = density.data?.counts ?? [];
  const maxCount = Math.max(1, ...counts);
  const showComingSoon = TEMPORAL_CONFIG.comingSoonLabel && span.startMs <= min + 1;
  const thumbLeft = `${Math.min(100, Math.max(0, fraction(timeMs) * 100))}%`;
  const valueText =
    mode === 'live' ? `Live, ${formatAt(nowMs, 'minute')}` : formatAt(timeMs, resolution);

  return (
    <nav
      aria-label="Temporal navigator"
      className="glass pointer-events-auto rounded-2xl px-3 pb-2 pt-2 md:px-4"
      data-testid="temporal-navigator"
    >
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <div
          role="group"
          aria-label="Time resolution"
          className="flex overflow-hidden rounded-lg border border-white/10 text-[11.5px]"
        >
          {RESOLUTIONS.map((r) => {
            const ok = allowed.includes(r);
            return (
              <button
                key={r}
                type="button"
                disabled={!ok}
                aria-pressed={resolution === r}
                title={
                  ok ? RES_LABEL[r] : `${RES_LABEL[r]} — not supported by the data at this date`
                }
                onClick={() => {
                  setResolution(r);
                  setViewRes(r);
                  if (mode === 'historical') commit(timeMs, r);
                }}
                className={`px-2 py-1 font-medium ${resolution === r && mode === 'historical' ? 'bg-white/15 text-white' : 'text-slate-300 hover:bg-white/10'} disabled:cursor-not-allowed disabled:text-slate-600`}
              >
                {compact ? RES_SHORT[r] : RES_LABEL[r]}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => step(-1)}
            className="rounded-md px-2 py-1 text-slate-200 hover:bg-white/10"
            aria-label={`Back one ${resolution}`}
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => step(1)}
            className="rounded-md px-2 py-1 text-slate-200 hover:bg-white/10"
            aria-label={`Forward one ${resolution}`}
          >
            ›
          </button>
        </div>
        <span className="ml-auto font-mono text-[12px] tabular-nums text-slate-300" aria-hidden>
          {mode === 'live' ? 'LIVE' : formatAt(timeMs, resolution)}
        </span>
        {mode === 'historical' && (
          <button
            type="button"
            onClick={returnToLive}
            className="rounded-md bg-live/15 px-2 py-1 text-[11.5px] font-semibold text-live hover:bg-live/25"
          >
            Return to Live
          </button>
        )}
      </div>
      <div className="flex items-stretch gap-1.5">
        {showComingSoon && (
          <div
            className="coming-soon flex shrink-0 items-center justify-center rounded-md border border-dashed border-white/15 px-2 text-center text-[10.5px] font-medium leading-tight text-slate-400"
            style={{ width: compact ? 74 : 112 }}
            aria-disabled="true"
            data-testid="coming-soon"
            title="Dates before 1800 are not available yet"
          >
            {TEMPORAL_CONFIG.comingSoonLabel}
          </div>
        )}
        <div className="relative min-w-0 flex-1">
          <div
            ref={trackRef}
            role="slider"
            tabIndex={0}
            aria-label="Selected time"
            aria-valuemin={min}
            aria-valuemax={nowMs}
            aria-valuenow={Math.round(timeMs)}
            aria-valuetext={valueText}
            onKeyDown={onKeyDown}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={() => setDragging(false)}
            onPointerCancel={() => setDragging(false)}
            onWheel={onWheel}
            className="relative h-11 cursor-pointer touch-none select-none rounded-md bg-white/[0.04]"
            data-testid="timeline-track"
          >
            <div
              className="absolute inset-x-0 bottom-3 flex h-5 items-end gap-px px-px opacity-70"
              aria-hidden
            >
              {counts.map((c, i) => (
                <span
                  key={i}
                  className="flex-1 rounded-[1px] bg-history/55"
                  style={{ height: `${c ? 18 + (c / maxCount) * 82 : 0}%` }}
                />
              ))}
            </div>
            {ticks.map((t) => (
              <span
                key={t.ms}
                className="absolute top-0 h-full border-l border-white/10"
                style={{ left: `${fraction(t.ms) * 100}%` }}
                aria-hidden
              >
                <span className="absolute left-1 top-0.5 whitespace-nowrap text-[10px] text-slate-500">
                  {t.label}
                </span>
              </span>
            ))}
            <span
              className="absolute right-0 top-0 h-full w-1 rounded-r-md bg-live/70"
              aria-hidden
            />
            <span
              className={`absolute top-0 h-full w-0.5 -translate-x-1/2 ${mode === 'live' ? 'bg-live' : 'bg-white'}`}
              style={{ left: thumbLeft }}
              aria-hidden
            >
              <span
                className={`absolute -top-1 left-1/2 h-3 w-3 -translate-x-1/2 rounded-full ${mode === 'live' ? 'bg-live' : 'bg-white'} shadow`}
              />
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={returnToLive}
          className={`shrink-0 rounded-md px-2 text-[11px] font-bold tracking-wider ${mode === 'live' ? 'bg-live/20 text-live' : 'border border-live/40 text-live hover:bg-live/15'}`}
          aria-label="Jump to live"
        >
          LIVE
        </button>
      </div>
    </nav>
  );
}
