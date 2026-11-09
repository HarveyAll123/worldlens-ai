/**
 * Several events pinned to one spot ("Germany", "Delhi, India") make a cluster that no zoom can
 * split — and a cluster clicked from as close as a cluster click flies cannot be split by
 * flying either — so clicking it lists them here, next to the marker, to choose one: news and
 * history alike. A floating glass card (DESIGN.md): monochrome, generously rounded, a stacked header
 * (dim count over the bright place), the event list's rows, subtle 160 ms entrance. It never
 * sits under the top bar, the timeline or another panel, and closes with ×, Escape, a press
 * elsewhere, or when the globe moves.
 */
import { parseIso, type EventSummary } from '@worldlens/shared';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '../state/store';
import { EventRowLines } from './EventList';
import { Icon } from './ui';

/** Space between the marker and the card, and around the card. */
const GAP = 22;
const MARGIN = 12;
/** Keep clear of the top bar and the timeline (as globe labels do, see EventLayer.relabel). */
const SAFE_TOP = 78;
const SAFE_BOTTOM_WIDE = 128;
const SAFE_BOTTOM_PHONE = 196;

type Box = { left: number; top: number; right: number; bottom: number };

/**
 * Where the card goes: beside the marker (right, else left), within the safe area and clear of
 * other panels; if neither side fits, as close to the marker as the screen allows.
 */
export function placeCard(
  at: { x: number; y: number },
  card: { width: number; height: number },
  view: { width: number; height: number; safeBottom: number },
  avoid: Box[],
): { left: number; top: number } {
  const maxTop = Math.max(SAFE_TOP, view.height - view.safeBottom - card.height);
  const top = Math.min(maxTop, Math.max(SAFE_TOP, at.y - 28));
  const fits = (left: number) =>
    left >= MARGIN &&
    left + card.width <= view.width - MARGIN &&
    !avoid.some(
      (o) =>
        left < o.right && left + card.width > o.left && top < o.bottom && top + card.height > o.top,
    );
  const right = at.x + GAP;
  const left = at.x - GAP - card.width;
  if (fits(right)) return { left: right, top };
  if (fits(left)) return { left, top };
  return {
    left: Math.min(view.width - MARGIN - card.width, Math.max(MARGIN, right)),
    top,
  };
}

export function PlacePicker({ events }: { events: EventSummary[] }) {
  const picker = useAppStore((s) => s.placePicker);
  const setPicker = useAppStore((s) => s.setPlacePicker);
  const selectedId = useAppStore((s) => s.selectedEventId);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const rows = useMemo(() => {
    if (!picker) return [];
    const byId = new Map(events.map((e) => [e.id, e]));
    return picker.ids
      .map((id) => byId.get(id))
      .filter((e): e is EventSummary => !!e)
      .sort(
        (a, b) => b.importance - a.importance || parseIso(b.time.start) - parseIso(a.time.start),
      );
  }, [picker, events]);
  const open = !!picker && rows.length >= 2;

  // Another period or filter took the events away: nothing left to choose between.
  useEffect(() => {
    if (picker && rows.length < 2) setPicker(null);
  }, [picker, rows.length, setPicker]);

  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setPicker(null);
    };
    // pointerdown, in the capture phase: the globe cancels the later mouse events.
    const press = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setPicker(null);
    };
    window.addEventListener('keydown', key, true);
    window.addEventListener('pointerdown', press, true);
    return () => {
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('pointerdown', press, true);
    };
  }, [open, setPicker]);

  // Measure, then place beside the marker; hidden until placed so it never jumps.
  useLayoutEffect(() => {
    const el = ref.current;
    const parent = el?.offsetParent as HTMLElement | null;
    if (!open || !el || !parent) return setPos(null);
    const frame = parent.getBoundingClientRect();
    const avoid = [...document.querySelectorAll('[data-label-occluder]')]
      .filter((o) => o !== el)
      .map((o) => o.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0)
      .map((r) => ({
        left: r.left - frame.left - MARGIN,
        right: r.right - frame.left + MARGIN,
        top: r.top - frame.top - MARGIN,
        bottom: r.bottom - frame.top + MARGIN,
      }));
    const wide = window.matchMedia('(min-width: 768px)').matches;
    setPos(
      placeCard(
        picker,
        { width: el.offsetWidth, height: el.offsetHeight },
        {
          width: frame.width,
          height: frame.height,
          safeBottom: wide ? SAFE_BOTTOM_WIDE : SAFE_BOTTOM_PHONE,
        },
        avoid,
      ),
    );
  }, [open, picker, rows.length]);

  // Keyboard and screen-reader users land in the card (Tab reaches the rows); focusing the card,
  // not a row, avoids a focus ring that would read as a selection after a mouse click.
  useEffect(() => {
    if (pos) ref.current?.focus({ preventScroll: true });
  }, [pos]);

  if (!open) return null;
  // The name most of them share ("Berlin"), the most important one's on a tie.
  const tally = new Map<string, number>();
  for (const e of rows) tally.set(e.location.name, (tally.get(e.location.name) ?? 0) + 1);
  const place = [...tally].reduce((best, cur) => (cur[1] > best[1] ? cur : best))[0];
  // Exactly one place, or a few close ones ("Near Berlin", each row then names its own).
  const onePlace = rows.every((e) => e.location.name === place);
  const heading = onePlace ? place : `Near ${place}`;
  const news = rows.filter((e) => e.kind === 'news').length;
  const history = rows.length - news;
  const counts = [news && `${news} news`, history && `${history} history`].filter(Boolean);

  const choose = (e: EventSummary) => {
    const s = useAppStore.getState();
    s.setPlacePicker(null);
    s.openEvent(e.id);
  };

  return (
    <div
      ref={ref}
      data-label-occluder
      role="dialog"
      tabIndex={-1}
      aria-label={`${rows.length} events ${onePlace ? 'at' : 'near'} ${place}`}
      className="glass pop-in absolute z-30 flex outline-none w-[300px] max-w-[calc(100vw-24px)] flex-col rounded-[var(--radius-outer)] p-1.5"
      style={pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0, visibility: 'hidden' }}
      data-testid="place-picker"
    >
      <div className="flex items-start gap-2 px-2.5 pb-1.5 pt-2">
        <div className="min-w-0 flex-1">
          <p className="tabular truncate text-[10.5px] text-white/35">
            {rows.length} events here
            {counts.length > 1 && <> · {counts.join(' · ')}</>}
          </p>
          <h2 className="mt-0.5 truncate text-[13px] text-white/90">{heading}</h2>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={() => setPicker(null)}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-white/55 transition-colors hover:bg-white/[0.08] hover:text-white"
        >
          <Icon name="close" className="h-3.5 w-3.5" />
        </button>
      </div>
      <ul className="scroll-thin max-h-[min(340px,calc(100dvh-300px))] min-h-0 overflow-y-auto px-0.5 pb-0.5">
        {rows.map((e) => (
          <li key={e.id} className="border-b border-white/[0.05] last:border-0">
            <button
              type="button"
              onClick={() => choose(e)}
              aria-current={selectedId === e.id ? 'true' : undefined}
              className={`w-full rounded-[14px] px-2.5 py-2.5 text-left transition-colors ${
                selectedId === e.id ? 'bg-white/[0.09]' : 'hover:bg-white/[0.05]'
              }`}
              data-testid="place-picker-item"
            >
              <EventRowLines e={e} place={!onePlace} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
