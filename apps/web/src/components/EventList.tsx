/** Text route to the events on the globe (accessibility; works without WebGL). */
import { parseIso, type EventSummary } from '@worldlens/shared';
import { useVisibleEvents } from '../hooks/useData';
import { temporalWithPrecision } from '../lib/format';
import { TIER_SETTINGS } from '../perf/tiers';
import { useAppStore } from '../state/store';
import { Badge, Notice, Spinner } from './ui';

export function selectAndFly(e: EventSummary): void {
  const s = useAppStore.getState();
  s.selectEvent(e.id);
  s.flyTo({
    lat: e.location.lat,
    lon: e.location.lon,
    altitudeKm: e.location.precision === 'city' ? 700 : 2200,
  });
}

export function EventList() {
  const tier = useAppStore((s) => s.qualityTier);
  const mode = useAppStore((s) => s.mode);
  const kindFilter = useAppStore((s) => s.kindFilter);
  const setKindFilter = useAppStore((s) => s.setKindFilter);
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
      <div className="flex items-center gap-2 px-4 pb-2 pt-3">
        <h2 className="text-[13px] font-semibold text-slate-100">
          {mode === 'live' ? 'Current events' : 'Events in this period'}
          <span className="ml-1.5 font-normal text-slate-400">({q.data?.total ?? 0})</span>
        </h2>
        {q.isFetching && <Spinner label="" />}
        <div
          role="group"
          aria-label="Filter events"
          className="ml-auto flex rounded-lg border border-white/10 text-[11px]"
        >
          {(['all', 'news', 'historical'] as const).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kindFilter === k}
              onClick={() => setKindFilter(k)}
              className={`px-2 py-0.5 capitalize ${kindFilter === k ? 'bg-white/15 text-white' : 'text-slate-400 hover:bg-white/10'}`}
            >
              {k === 'historical' ? 'History' : k}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-2 px-4 pb-2">
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
          <p className="text-[11px] text-slate-500">
            Showing the most important {events.length}. Zoom in or narrow the time range for more.
          </p>
        )}
      </div>
      <ul className="scroll-thin min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-3">
        {events.map((e) => {
          const t = temporalWithPrecision(e.time);
          return (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => selectAndFly(e)}
                className="w-full rounded-lg px-2.5 py-2 text-left hover:bg-white/[0.06] focus-visible:bg-white/[0.06]"
                data-testid="event-list-item"
              >
                <span className="flex items-center gap-1.5">
                  <Badge tone={e.kind === 'news' ? 'news' : 'history'}>
                    {e.kind === 'news' ? 'News' : 'History'}
                  </Badge>
                  {e.isDemo && <Badge tone="demo">DEMO</Badge>}
                  {e.hasTakeAction && <Badge tone="sandbox">Take action</Badge>}
                  <span className="ml-auto text-[11px] text-slate-500">{t.label}</span>
                </span>
                <span className="mt-1 block text-[13.5px] leading-snug text-slate-100">
                  {e.title}
                </span>
                <span className="block text-[11.5px] text-slate-400">
                  {e.location.name}
                  {e.kind === 'news' &&
                    e.sourceCount > 0 &&
                    ` · ${e.sourceCount} source${e.sourceCount === 1 ? '' : 's'}`}
                </span>
              </button>
            </li>
          );
        })}
        {q.data && events.length === 0 && (
          <li className="px-3 py-6 text-center text-[12.5px] text-slate-400">
            {mode === 'live'
              ? 'No current events in view.'
              : 'No events recorded for this period and view. Try a coarser resolution or zoom out.'}
          </li>
        )}
      </ul>
    </div>
  );
}
