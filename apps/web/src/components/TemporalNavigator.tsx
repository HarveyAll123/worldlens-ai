/**
 * Temporal navigator: 1800 → LIVE, with "Before 1800 — Coming Soon" immediately to the left.
 * Resolution (century … hour) is limited to what the data near the selected time supports.
 * Keyboard: ←/→ one unit · Shift+←/→ ten units · PageUp/PageDown one coarser unit ·
 * Home = 1800 · End = LIVE · +/− zoom resolution · Space = play/pause.
 * Pointer: drag the track (the window stays still while dragging) · wheel/swipe steps through
 * time · pinch or Ctrl/⌘+wheel zooms · click the date to type one (1941, 1941-06, 1941-06-22).
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
import { parseDateInput } from '../lib/dateInput';
import { edgePush, edgeShift } from '../lib/timelineDrag';
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
  /** Time under the pointer while dragging (the store is updated at a steady pace). */
  const [previewMs, setPreviewMs] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [editing, setEditing] = useState(false);
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

  // The visible window stays put while the selected time moves inside it; it only re-centres
  // when the time leaves the window (or the zoom changes) — and never during a drag, where a
  // moving window made the track slide under the pointer. Dragging into either edge scrolls
  // the window at a controlled speed instead (edgeScroll).
  const [anchorMs, setAnchorMs] = useState(timeMs);
  const span = useMemo(() => trackSpan(anchorMs, viewRes, nowMs), [anchorMs, viewRes, nowMs]);
  useEffect(() => {
    if (dragging || viewRes === 'century') return;
    // Only when the time has left the window (stepping/playing past its end) — releasing a
    // drag near an edge leaves the window where it is.
    if (timeMs < span.startMs || timeMs > span.endMs) setAnchorMs(timeMs);
  }, [timeMs, span, dragging, viewRes]);
  useEffect(() => setAnchorMs(timeMs), [viewRes]); // eslint-disable-line react-hooks/exhaustive-deps
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
      case ' ':
        e.preventDefault();
        setPlaying((p) => !p);
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

  // Dragging moves in units of the selected resolution and never changes it: committing at a
  // finer unit used to zoom the track in mid-drag, which made dragging run away.
  const dragUnit: Resolution = resolution === 'century' ? 'year' : resolution;
  const lastCommit = useRef(0);
  const previewRef = useRef<number | null>(null);
  const draggingRef = useRef(false);
  const pointerX = useRef<number | null>(null);
  const dragPointer = useRef<number | null>(null);
  const anchorRef = useRef(anchorMs);
  anchorRef.current = anchorMs;
  const edgeFrame = useRef<number | null>(null);
  const lastEdgeTick = useRef(0);

  const preview = (ms: number) => {
    previewRef.current = ms;
    setPreviewMs(ms);
    // The thumb follows the pointer every frame; the globe and data follow ~6 times a second.
    if (performance.now() - lastCommit.current > 160) {
      lastCommit.current = performance.now();
      commit(ms);
    }
  };

  /**
   * Edge scrolling: holding the pointer at (or past) either end of the track while dragging
   * slides the window through time — faster the further past the edge, capped at about 0.7
   * windows per second — so the whole range is reachable without the window running away.
   */
  const edgeScroll = () => {
    edgeFrame.current = null;
    const el = trackRef.current;
    const x = pointerX.current;
    if (!el || x === null || !draggingRef.current || viewRes === 'century') return;
    const r = el.getBoundingClientRect();
    const push = edgePush(x, r.left, r.right);
    if (push === 0) return;
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastEdgeTick.current) / 1000);
    lastEdgeTick.current = now;
    const current = trackSpan(anchorRef.current, viewRes, nowMs);
    const width = current.endMs - current.startMs;
    const shift = edgeShift(push, width, dt);
    // Keep the anchor where the window can still move (trackSpan clamps the window itself).
    const anchor = Math.min(
      nowMs - width / 2,
      Math.max(min + width / 2, anchorRef.current + shift),
    );
    anchorRef.current = anchor;
    setAnchorMs(anchor);
    const next = trackSpan(anchor, viewRes, nowMs);
    const f = Math.min(1, Math.max(0, (x - r.left) / r.width));
    preview(next.startMs + f * (next.endMs - next.startMs));
    edgeFrame.current = requestAnimationFrame(edgeScroll);
  };
  const startEdgeScroll = () => {
    if (edgeFrame.current !== null) return;
    lastEdgeTick.current = performance.now();
    edgeFrame.current = requestAnimationFrame(edgeScroll);
  };
  useEffect(
    () => () => {
      if (edgeFrame.current !== null) cancelAnimationFrame(edgeFrame.current);
    },
    [],
  );

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    try {
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    } catch {
      /* not an active pointer (synthetic events): dragging still works inside the track */
    }
    setPlaying(false);
    setDragging(true);
    draggingRef.current = true;
    dragPointer.current = e.pointerId;
    pointerX.current = e.clientX;
    const ms = msAt(e.clientX);
    previewRef.current = ms;
    setPreviewMs(ms);
    lastCommit.current = performance.now();
    commit(ms);
    startEdgeScroll();
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging || e.pointerId !== dragPointer.current) return;
    // Button already up (released outside the window without a pointerup): finish the drag.
    if (e.pointerType === 'mouse' && e.buttons === 0) return endDrag();
    pointerX.current = e.clientX;
    preview(msAt(e.clientX));
    startEdgeScroll();
  };
  const endDrag = () => {
    if (!dragging) return;
    setDragging(false);
    draggingRef.current = false;
    pointerX.current = null;
    if (edgeFrame.current !== null) cancelAnimationFrame(edgeFrame.current);
    edgeFrame.current = null;
    if (previewRef.current !== null) commit(previewRef.current);
    previewRef.current = null;
    setPreviewMs(null);
  };
  // Wheel / two-finger swipe steps through time; pinch (Ctrl+wheel) or ⌘+wheel zooms.
  const wheelAcc = useRef(0);
  const onWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      if (Math.abs(e.deltaY) < 2) return;
      const next = e.deltaY < 0 ? finer(viewRes) : coarser(viewRes);
      if (next && (e.deltaY > 0 || allowed.includes(next))) {
        setViewRes(next);
        if (e.deltaY < 0 && mode === 'historical') setResolution(next);
      }
      return;
    }
    wheelAcc.current += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    const steps = Math.trunc(wheelAcc.current / 60);
    if (!steps) return;
    wheelAcc.current -= steps * 60;
    setPlaying(false);
    step(steps);
  };

  // Play: advance one unit at a time; stops at LIVE or when the user takes over.
  const timeRef = useRef(timeMs);
  timeRef.current = timeMs;
  const commitRef = useRef(commit);
  commitRef.current = commit;
  const liveRef = useRef(returnToLive);
  liveRef.current = returnToLive;
  useEffect(() => {
    if (!playing) return;
    const unit: Resolution = resolution === 'century' ? 'decade' : resolution;
    const timer = setInterval(() => {
      const next = addUnits(timeRef.current, unit, 1);
      if (next >= Date.now() - 60_000) {
        setPlaying(false);
        liveRef.current();
        return;
      }
      commitRef.current(next);
    }, 900 / speed);
    return () => clearInterval(timer);
  }, [playing, speed, resolution]);

  const [draft, setDraft] = useState('');
  const jumpTo = (text: string) => {
    const parsed = parseDateInput(text);
    setEditing(false);
    if (!parsed) return;
    setPlaying(false);
    setResolution(parsed.resolution);
    setViewRes(parsed.resolution);
    commit(parsed.ms, parsed.resolution);
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
  const shownMs = previewMs ?? timeMs;
  const thumbLeft = `${Math.min(100, Math.max(0, fraction(shownMs) * 100))}%`;
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
        <div className="flex items-center gap-0.5" role="group" aria-label="Step and play">
          <button
            type="button"
            onClick={() => step(-10)}
            className="rounded-md px-2 py-1 text-[15px] leading-none text-slate-200 hover:bg-white/10"
            aria-label={`Back ten ${resolution === 'century' ? 'decades' : `${resolution}s`}`}
            title="Back 10 (Shift+←)"
          >
            «
          </button>
          <button
            type="button"
            onClick={() => step(-1)}
            className="rounded-md px-2.5 py-1 text-[15px] leading-none text-slate-200 hover:bg-white/10"
            aria-label={`Back one ${resolution}`}
            title="Back 1 (←)"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => {
              if (mode === 'live' && !playing) commit(min, 'year');
              setPlaying((p) => !p);
            }}
            aria-pressed={playing}
            aria-label={playing ? 'Pause' : 'Play through time'}
            title={playing ? 'Pause (Space)' : 'Play through time (Space)'}
            className={`rounded-md px-2.5 py-1 text-[13px] leading-none ${playing ? 'bg-white/15 text-white' : 'text-slate-200 hover:bg-white/10'}`}
          >
            {playing ? '❚❚' : '▶'}
          </button>
          <button
            type="button"
            onClick={() => step(1)}
            className="rounded-md px-2.5 py-1 text-[15px] leading-none text-slate-200 hover:bg-white/10"
            aria-label={`Forward one ${resolution}`}
            title="Forward 1 (→)"
          >
            ›
          </button>
          <button
            type="button"
            onClick={() => step(10)}
            className="rounded-md px-2 py-1 text-[15px] leading-none text-slate-200 hover:bg-white/10"
            aria-label={`Forward ten ${resolution === 'century' ? 'decades' : `${resolution}s`}`}
            title="Forward 10 (Shift+→)"
          >
            »
          </button>
          {playing && (
            <button
              type="button"
              onClick={() => setSpeed((v) => (v >= 8 ? 1 : v * 2))}
              className="rounded-md px-1.5 py-1 font-mono text-[11px] text-slate-300 hover:bg-white/10"
              aria-label={`Playback speed ${speed}×`}
              title="Playback speed"
            >
              {speed}×
            </button>
          )}
        </div>
        {editing ? (
          <form
            className="ml-auto"
            onSubmit={(e) => {
              e.preventDefault();
              jumpTo(draft);
            }}
          >
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => setEditing(false)}
              onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}
              placeholder="1941-06-22"
              aria-label="Go to date (year, year-month or year-month-day)"
              className="w-32 rounded-md border border-white/15 bg-black/30 px-2 py-0.5 font-mono text-[12px] text-white outline-none focus:border-white/40"
            />
          </form>
        ) : (
          <button
            type="button"
            onClick={() => {
              setDraft(mode === 'live' ? '' : toIso(timeMs).slice(0, 10));
              setEditing(true);
            }}
            className="ml-auto rounded-md px-1.5 py-0.5 font-mono text-[12px] tabular-nums text-slate-200 hover:bg-white/10"
            title="Type a date to jump to it"
            aria-label="Go to a date"
          >
            {mode === 'live' ? 'LIVE' : formatAt(shownMs, dragging ? dragUnit : resolution)}
          </button>
        )}
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
            onPointerUp={(e) => e.pointerId === dragPointer.current && endDrag()}
            onPointerCancel={(e) => e.pointerId === dragPointer.current && endDrag()}
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
