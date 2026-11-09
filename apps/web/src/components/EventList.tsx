/** Text route to the events on the globe (accessibility; works without WebGL). */
import { parseIso, type EventSummary } from '@worldlens/shared';
import { useVisibleEvents } from '../hooks/useData';
import { temporalWithPrecision } from '../lib/format';
import { TIER_SETTINGS } from '../perf/tiers';
import { useAppStore } from '../state/store';
import { Notice, Spinner } from './ui';

export function selectAndFly(e: EventSummary): void {
  const s = useAppStore.getState();
  s.openEvent(e.id);
  s.flyTo({
    lat: e.location.lat,
    lon: e.location.lon,
    altitudeKm: e.location.precision === 'city' ? 700 : 2200,
  });
}

/**
 * The text of an event row: a dim line (kind · date · Demo · Take action), the bright title,
 * and a dim line with the place and source count — `place={false}` where a header names it.
 */
export function EventRowLines({ e, place = true }: { e: EventSummary; place?: boolean }) {
  const t = temporalWithPrecision(e.time);
  const sources =
    e.kind === 'news' && e.sourceCount > 0
      ? `${e.sourceCount} source${e.sourceCount === 1 ? '' : 's'}`
      : null;
  const footer = [place ? e.location.name : null, sources].filter(Boolean).join(' · ');
  return (
    <>
      <span className="flex min-w-0 items-center gap-1.5 text-[10.5px] text-white/35">
        <span className="text-white/55">{e.kind === 'news' ? 'News' : 'History'}</span>
        <span aria-hidden>·</span>
        <span className="tabular truncate">{t.label}</span>
        {e.isDemo && (
          <>
            <span aria-hidden>·</span>
            <span>Demo</span>
          </>
        )}
        {e.hasTakeAction && (
          <>
            <span aria-hidden>·</span>
            <span className="text-white/70">Take action</span>
          </>
        )}
      </span>
      <span className="mt-1 block text-[12.5px] leading-snug text-white/90">{e.title}</span>
      {footer && (
        <span className="mt-0.5 block truncate text-[10.5px] text-white/40">{footer}</span>
      )}
    </>
  );
}

export function EventList() {
  const tier = useAppStore((s) => s.qualityTier);
  const mode = useAppStore((s) => s.mode);
  const kindFilter = useAppStore((s) => s.kindFilter);
  const setKindFilter = useAppStore((s) => s.setKindFilter);
  const selectedId = useAppStore((s) => s.selectedEventId);
  const q = useVisibleEvents(TIER_SETTINGS[tier].maxEvents);
  const events = (q.data?.events ?? [])
    .slice()
    .sort((a, b) => b.importance - a.importance || parseIso(b.time.start) - parseIso(a.time.start));
  const live = q.data && 'live' in q.data ? q.data.live : undefined;

  return (
    <div
      id="event-list"
      tabIndex={-1}
      className="flex h-full min-h-0 flex-col"
      data-testid="event-list"
    >
      <div className="flex items-center gap-2 px-3.5 pb-2 pt-3">
        <h2 className="text-[12px] text-white/55">
          {mode === 'live' ? 'Current events' : 'Events in this period'}
          <span className="tabular ml-1.5 text-white/30">{q.data?.total ?? 0}</span>
        </h2>
        {q.isFetching && <Spinner label="" />}
        <div
          role="group"
          aria-label="Filter events"
          className="ml-auto flex rounded-full bg-white/[0.05] p-0.5 text-[10.5px]"
        >
          {(['all', 'news', 'historical'] as const).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kindFilter === k}
              onClick={() => setKindFilter(k)}
              className={`rounded-full px-2.5 py-1 transition-colors ${
                kindFilter === k
                  ? 'bg-[var(--active-bg)] text-[var(--active-fg)]'
                  : 'text-white/50 hover:text-white/85'
              }`}
            >
              {k === 'historical' ? 'History' : k === 'all' ? 'All' : 'News'}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-2 px-3.5 pb-2">
        {mode === 'live' && live && live.provider && live.count === 0 && (
          <Notice tone="info">
            Live news is{' '}
            {live.state === 'down' || live.state === 'degraded'
              ? 'unavailable right now'
              : 'loading'}{' '}
            — showing labelled DEMO scenarios meanwhile.
          </Notice>
        )}
        {mode === 'live' && live && !live.provider && (
          <Notice tone="info">
            Live news ingestion is disabled on this server; showing labelled DEMO scenarios.
          </Notice>
        )}
        {q.isError && (
          <Notice tone="danger">
            Events could not be loaded. The globe stays usable; try again shortly.
          </Notice>
        )}
        {q.data?.truncated && (
          <p className="text-[10.5px] text-white/35">
            Showing the most important {events.length}. Zoom in or narrow the time range for more.
          </p>
        )}
      </div>
      <ul className="scroll-thin min-h-0 flex-1 overflow-y-auto px-1.5 pb-3">
        {events.map((e) => {
          const selected = selectedId === e.id;
          return (
            <li key={e.id} className="border-b border-white/[0.05] last:border-0">
              <button
                type="button"
                onClick={() => selectAndFly(e)}
                aria-current={selected ? 'true' : undefined}
                className={`w-full rounded-[10px] px-2.5 py-2.5 text-left transition-colors ${
                  selected ? 'bg-white/[0.09]' : 'hover:bg-white/[0.05]'
                }`}
                data-testid="event-list-item"
              >
                <EventRowLines e={e} />
              </button>
            </li>
          );
        })}
        {q.data && events.length === 0 && (
          <li className="px-3 py-8 text-center text-[11.5px] text-white/40">
            {mode === 'live'
              ? 'No current events in view.'
              : 'No events recorded for this period and view. Try a coarser resolution or zoom out.'}
          </li>
        )}
      </ul>
    </div>
  );
}
