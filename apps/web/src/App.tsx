import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { AssistantPanel } from './components/AssistantPanel';
import { CountryPanel } from './components/CountryPanel';
import { EventDetail } from './components/EventDetail';
import { ErrorBoundary } from './components/ErrorBoundary';
import { EventList } from './components/EventList';
import { GlobeView } from './components/GlobeView';
import { Announcer, DiagnosticsPanel, TourBar } from './components/Overlays';
import { TakeActionModal } from './components/TakeActionModal';
import { TemporalNavigator } from './components/TemporalNavigator';
import { SearchBox, TopBar } from './components/TopBar';
import { Notice } from './components/ui';
import { useConfig } from './hooks/useData';
import { useIsMobile, useMediaQuery } from './hooks/useMedia';
import { followCountriesInTime } from './lib/countries';
import { useAppStore } from './state/store';

function PanelBody() {
  const selected = useAppStore((s) => s.selectedEventId);
  const selectEvent = useAppStore((s) => s.selectEvent);
  const country = useAppStore((s) => s.selectedCountry);
  const selectCountry = useAppStore((s) => s.selectCountry);
  if (country) return <CountryPanel country={country} onBack={() => selectCountry(null)} />;
  return selected ? <EventDetail id={selected} onBack={() => selectEvent(null)} /> : <EventList />;
}

function MobileSheet() {
  const sheet = useAppStore((s) => s.sheet);
  const expanded = useAppStore((s) => s.sheetExpanded);
  const setSheet = useAppStore((s) => s.setSheet);
  const setExpanded = useAppStore((s) => s.setSheetExpanded);
  const selected = useAppStore((s) => s.selectedEventId);
  const country = useAppStore((s) => s.selectedCountry);
  const label =
    sheet === 'assistant'
      ? 'Ask WorldLens'
      : sheet === 'search'
        ? 'Search'
        : country
          ? 'Country'
          : selected
            ? 'Event details'
            : 'Events';
  return (
    <section
      className={`glass pointer-events-auto absolute inset-x-3 bottom-3 z-20 flex flex-col rounded-[var(--radius-outer)] transition-[height] duration-300 ${expanded ? 'h-[62dvh]' : 'h-[64px]'}`}
      aria-label={label}
      data-testid="bottom-sheet"
    >
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full shrink-0 flex-col items-center gap-1 px-4 pb-2 pt-2"
        aria-expanded={expanded}
        data-testid="sheet-handle"
      >
        <span className="h-1 w-10 rounded-full bg-white/25" aria-hidden />
        <span className="text-[13px] font-normal text-white/80">{label}</span>
      </button>
      {expanded && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div
            className="flex shrink-0 gap-1 px-3 pb-2 text-[12px]"
            role="tablist"
            aria-label="Panel"
          >
            {(['events', 'assistant', 'search'] as const).map((v) => {
              const on = sheet === v || (v === 'events' && sheet === 'detail');
              return (
                <button
                  key={v}
                  role="tab"
                  type="button"
                  aria-selected={on}
                  onClick={() => setSheet(v)}
                  className={`rounded-full px-3 py-1 ${
                    on
                      ? 'bg-[var(--active-bg)] text-[var(--active-fg)]'
                      : 'text-white/55 hover:bg-white/[0.06] hover:text-white/85'
                  }`}
                >
                  {v === 'assistant' ? 'Ask AI' : v === 'events' ? 'Events' : 'Search'}
                </button>
              );
            })}
          </div>
          <div className="min-h-0 flex-1">
            {sheet === 'assistant' ? (
              <AssistantPanel />
            ) : sheet === 'search' ? (
              <div className="px-3 pb-3">
                <SearchBox autoFocus onDone={() => setSheet('events', false)} />
              </div>
            ) : (
              <PanelBody />
            )}
          </div>
        </div>
      )}
    </section>
  );
}

export function App() {
  const mobile = useIsMobile();
  const wide = useMediaQuery('(min-width: 1024px)');
  const assistantOpen = useAppStore((s) => s.assistantOpen);
  const setAssistantOpen = useAppStore((s) => s.setAssistantOpen);
  const config = useConfig();
  const [notice, setNotice] = useState<string | null>(null);
  const queryClient = useQueryClient();
  // A selected country follows the timeline (its borders of the day, successor, or closes).
  useEffect(() => followCountriesInTime(queryClient), [queryClient]);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <a href="#event-list" className="skip-link">
        Skip to events list
      </a>
      <ErrorBoundary label="The 3D globe">
        <GlobeView
          onQuality={(q) => useAppStore.setState({ qualityTier: q.tier })}
          onNotice={setNotice}
        />
      </ErrorBoundary>
      <TopBar mobile={mobile} />

      <div className="pointer-events-none absolute left-3 right-3 top-[68px] z-20 flex flex-col items-center gap-2 md:right-[404px] md:items-start">
        <div className="pointer-events-auto w-full max-w-[860px]">
          <TemporalNavigator compact={mobile || !wide} />
        </div>
        <TourBar />
      </div>

      {!mobile && (
        <aside
          className="glass pointer-events-auto absolute bottom-3 right-3 top-3 z-20 flex w-[380px] flex-col overflow-hidden rounded-[var(--radius-outer)]"
          aria-label="Context panel"
          data-testid="context-panel"
        >
          <ErrorBoundary label="The context panel">
            {assistantOpen ? (
              <AssistantPanel onClose={() => setAssistantOpen(false)} />
            ) : (
              <PanelBody />
            )}
          </ErrorBoundary>
        </aside>
      )}
      {mobile && <MobileSheet />}

      <div className="pointer-events-none absolute inset-x-3 bottom-[84px] z-20 flex flex-col items-center gap-2 md:bottom-4">
        {config.isError && (
          <div className="pointer-events-auto">
            <Notice tone="danger">
              The WorldLens API is unreachable. The globe still works; data will load when it
              returns.
            </Notice>
          </div>
        )}
        {notice && (
          <div
            className="glass pointer-events-auto flex w-max max-w-[min(460px,86vw)] items-start gap-2 rounded-full px-3 py-1.5 text-[11px] leading-snug text-white/60"
            data-testid="basemap-notice"
          >
            <span>{notice}</span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="text-white/40 hover:text-white"
              aria-label="Dismiss imagery notice"
            >
              ✕
            </button>
          </div>
        )}
      </div>
      <DiagnosticsPanel />
      <TakeActionModal />
      <Announcer />
    </div>
  );
}
