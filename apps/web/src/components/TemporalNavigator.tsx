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
  useLayoutEffect,
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
import { edgePush, edgeShift, trackUnit, viewAfter } from '../lib/timelineDrag';
import { timelineTicks } from '../lib/timelineTicks';
import { useVisibleEvents } from '../hooks/useData';
import { TIER_SETTINGS } from '../perf/tiers';
import { useAppStore } from '../state/store';
import { Icon } from './ui';

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
  // In the store: the assistant plays and pauses the timeline too (play_timeline).
  const playing = useAppStore((s) => s.timelinePlaying);
  const speed = useAppStore((s) => s.timelineSpeed);
  const setPlaying = (v: boolean | ((p: boolean) => boolean)) => {
    const st = useAppStore.getState();
    st.setTimelinePlaying(typeof v === 'function' ? v(st.timelinePlaying) : v);
  };
  const setSpeed = (v: (p: number) => number) => {
    const st = useAppStore.getState();
    st.setTimelineSpeed(v(st.timelineSpeed));
  };
  const [editing, setEditing] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const timeMs = mode === 'live' ? nowMs : storeTime;
  const [viewRes, setViewRes] = useState<Resolution>('century');
  // The track zoom follows the selected resolution; the overview stays for picked years.
  useEffect(() => {
    setViewRes((view) => viewAfter(view, resolution));
  }, [resolution]);
  // Going LIVE (Return to Live, End, dragging to now) shows the full range again. Only on the
  // switch itself, so the resolution buttons still zoom while LIVE.
  useEffect(() => {
    if (mode === 'live') setViewRes('century');
  }, [mode]);
  const unitRes = trackUnit(viewRes, resolution);

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
    (ms: number, res: Resolution = unitRes) => {
      const clamped = Math.min(nowMs, Math.max(min, ms));
      if (nowMs - clamped < 60_000) return returnToLive();
      // Snap to the resolution unit so the display never claims more precision than chosen.
      const effective: Resolution = allowed.includes(res) ? res : allowed[allowed.length - 1]!;
      setTime(
        floorTo(clamped, effective === 'century' ? 'year' : effective),
        effective === 'century' ? 'year' : effective,
      );
    },
    [allowed, min, nowMs, unitRes, returnToLive, setTime],
  );

  const step = (n: number) => commit(addUnits(timeMs, unitRes, n));

  const onKeyDown = (e: React.KeyboardEvent) => {
    const r = unitRes;
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

  // Dragging moves in units of the selected resolution (years on the overview) and never
  // changes the track zoom: committing at a finer unit used to zoom in mid-drag, which made
  // dragging run away.
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
    const unit = unitRes;
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
  }, [playing, speed, unitRes]);

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

  const showComingSoon = TEMPORAL_CONFIG.comingSoonLabel && span.startMs <= min + 1;
  // Labels are laid out for the track's real width (a phone's is a third of a desktop's). It is
  // re-measured before paint when "Before 1800" comes or goes with the zoom, and on resizes.
  const [trackPx, setTrackPx] = useState(compact ? 260 : 760);
  useLayoutEffect(() => {
    if (trackRef.current) setTrackPx(Math.round(trackRef.current.getBoundingClientRect().width));
  }, [showComingSoon, compact]);
  useEffect(() => {
    const el = trackRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setTrackPx(Math.round(entry.contentRect.width));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const ticks = useMemo(
    () => timelineTicks(span.startMs, span.endMs, viewRes, trackPx),
    [span, viewRes, trackPx],
  );

  const counts = density.data?.counts ?? [];
  const maxCount = Math.max(1, ...counts);
  const shownMs = previewMs ?? timeMs;
  const thumbLeft = `${Math.min(100, Math.max(0, fraction(shownMs) * 100))}%`;
  const valueText =
    mode === 'live' ? `Live, ${formatAt(nowMs, 'minute')}` : formatAt(timeMs, resolution);

  return (
    <nav
      aria-label="Temporal navigator"
      className="glass-chrome pointer-events-auto rounded-[var(--radius-outer)] px-2 py-1.5 md:px-2.5 md:py-2"
      data-testid="temporal-navigator"
    >
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        <div
          role="group"
          aria-label="Time resolution"
          className="flex rounded-full bg-white/[0.05] p-0.5 text-[11px]"
        >
          {RESOLUTIONS.map((r) => {
            const ok = allowed.includes(r);
            // The overview (C) selects years; Y means the zoomed-in year track.
            const pressed =
              mode === 'historical' &&
              (r === 'century'
                ? viewRes === 'century'
                : resolution === r && !(r === 'year' && viewRes === 'century'));
            return (
              <button
                key={r}
                type="button"
                disabled={!ok}
                aria-pressed={pressed}
                title={
                  ok ? RES_LABEL[r] : `${RES_LABEL[r]} — not supported by the data at this date`
                }
                onClick={() => {
                  setResolution(r);
                  setViewRes(r);
                  if (mode === 'historical') commit(timeMs, r);
                }}
                className={`rounded-full py-1 transition-colors ${compact ? 'px-1.5' : 'px-2.5'} ${
                  pressed
                    ? 'bg-[var(--active-bg)] text-[var(--active-fg)]'
                    : 'text-white/55 hover:text-white/90'
                } disabled:cursor-not-allowed disabled:text-white/20 disabled:hover:text-white/20`}
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
            className={`${compact ? 'hidden' : 'grid'} h-7 w-7 place-items-center rounded-full text-white/65 transition-colors hover:bg-white/[0.08] hover:text-white`}
            aria-label={`Back ten ${resolution === 'century' ? 'decades' : `${resolution}s`}`}
            title="Back 10 (Shift+←)"
          >
            <Icon name="chevrons-left" className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => step(-1)}
            className={`grid place-items-center rounded-full text-white/65 transition-colors hover:bg-white/[0.08] hover:text-white ${compact ? 'h-6 w-6' : 'h-7 w-7'}`}
            aria-label={`Back one ${resolution}`}
            title="Back 1 (←)"
          >
            <Icon name="chevron-left" className="h-3.5 w-3.5" />
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
            className={`grid place-items-center rounded-full transition-colors ${compact ? 'h-6 w-6' : 'h-7 w-7'} ${
              playing
                ? 'bg-[var(--active-bg)] text-[var(--active-fg)]'
                : 'text-white/75 hover:bg-white/[0.08] hover:text-white'
            }`}
          >
            <Icon name={playing ? 'pause' : 'play'} className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={() => step(1)}
            className={`grid place-items-center rounded-full text-white/65 transition-colors hover:bg-white/[0.08] hover:text-white ${compact ? 'h-6 w-6' : 'h-7 w-7'}`}
            aria-label={`Forward one ${resolution}`}
            title="Forward 1 (→)"
          >
            <Icon name="chevron-right" className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => step(10)}
            className={`${compact ? 'hidden' : 'grid'} h-7 w-7 place-items-center rounded-full text-white/65 transition-colors hover:bg-white/[0.08] hover:text-white`}
            aria-label={`Forward ten ${resolution === 'century' ? 'decades' : `${resolution}s`}`}
            title="Forward 10 (Shift+→)"
          >
            <Icon name="chevrons-right" className="h-3.5 w-3.5" />
          </button>
          {playing && (
            <button
              type="button"
              onClick={() => setSpeed((v) => (v >= 8 ? 1 : v * 2))}
              className="tabular rounded-full px-1.5 py-1 text-[10.5px] text-white/55 transition-colors hover:bg-white/[0.08] hover:text-white/90"
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
              className="tabular w-32 rounded-full border border-white/20 bg-white/[0.06] px-2.5 py-1 text-[11.5px] text-white outline-none focus:border-white/40"
            />
          </form>
        ) : (
          <button
            type="button"
            onClick={() => {
              setDraft(mode === 'live' ? '' : toIso(timeMs).slice(0, 10));
              setEditing(true);
            }}
            className="tabular ml-auto flex items-center gap-1.5 rounded-full px-2 py-1 text-[11.5px] text-white/70 transition-colors hover:bg-white/[0.08] hover:text-white"
            title="Type a date to jump to it"
            aria-label="Go to a date"
          >
            <Icon name="calendar" className="h-3.5 w-3.5 text-white/40" />
            {/* Phones show the selected date too: nothing else there did (the top bar only
                has Return to Live). LIVE keeps the icon; the top bar shows the clock. */}
            {(!compact || mode === 'historical') && (
              <span data-testid="navigator-date">
                {mode === 'live'
                  ? 'Jump to date'
                  : formatAt(shownMs, dragging ? unitRes : resolution)}
              </span>
            )}
          </button>
        )}
        {mode === 'historical' && (
          <button
            type="button"
            onClick={returnToLive}
            className="rounded-full bg-[var(--active-bg)] px-2.5 py-1 text-[11px] text-[var(--active-fg)] transition-colors hover:bg-white"
          >
            Return to Live
          </button>
        )}
      </div>
      <div className="flex items-stretch gap-1.5">
        {showComingSoon && (
          <div
            className="coming-soon flex shrink-0 items-center justify-center rounded-[10px] border border-dashed border-white/12 px-2 text-center text-[10px] leading-tight text-white/35"
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
            className="relative h-11 cursor-pointer touch-none select-none rounded-[var(--radius-inner)] bg-white/[0.04]"
            data-testid="timeline-track"
          >
            <div
              className="absolute inset-x-0 bottom-3 flex h-5 items-end gap-px px-px opacity-60"
              aria-hidden
            >
              {counts.map((c, i) => (
                <span
                  key={i}
                  className="flex-1 rounded-[1px] bg-white/25"
                  style={{ height: `${c ? 8 + (c / maxCount) * 52 : 0}%` }}
                />
              ))}
            </div>
            {ticks.map((t) => (
              <span
                key={t.ms}
                className="absolute top-0 h-full border-l border-white/[0.08]"
                style={{ left: `${fraction(t.ms) * 100}%` }}
                aria-hidden
              >
                <span className="tabular absolute left-1 top-0.5 whitespace-nowrap text-[10px] text-white/30">
                  {t.label}
                </span>
              </span>
            ))}
            <span
              className="absolute top-0 h-full w-0.5 -translate-x-1/2 bg-white"
              style={{ left: thumbLeft }}
              aria-hidden
            >
              <span className="absolute -top-1 left-1/2 h-3 w-3 -translate-x-1/2 rounded-full bg-white" />
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={returnToLive}
          className={`shrink-0 px-1 text-[10.5px] tracking-[0.1em] transition-colors ${
            mode === 'live' ? 'text-white/30' : 'text-white/70 hover:text-white'
          }`}
          aria-label="Jump to live"
        >
          LIVE
        </button>
      </div>
    </nav>
  );
}
