import { useState } from 'react';
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
import { useIsMobile } from './hooks/useMedia';
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
      className={`glass pointer-events-auto absolute inset-x-0 bottom-[108px] z-20 flex flex-col rounded-t-2xl transition-[height] duration-300 ${expanded ? 'h-[62dvh]' : 'h-[64px]'}`}
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
        <span className="text-[13px] font-medium text-slate-200">{label}</span>
      </button>
      {expanded && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div
            className="flex shrink-0 gap-1 px-3 pb-2 text-[12px]"
            role="tablist"
            aria-label="Panel"
          >
            {(['events', 'assistant', 'search'] as const).map((v) => (
              <button
                key={v}
                role="tab"
                type="button"
                aria-selected={sheet === v || (v === 'events' && sheet === 'detail')}
                onClick={() => setSheet(v)}
                className={`rounded-full px-3 py-1 capitalize ${sheet === v || (v === 'events' && sheet === 'detail') ? 'bg-white/15 text-white' : 'text-slate-400'}`}
              >
                {v === 'assistant' ? 'Ask AI' : v}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1">
            {sheet === 'assistant' ? (
              <AssistantPanel />
            ) : sheet === 'search' ? (
              <div className="p-3">
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
  const assistantOpen = useAppStore((s) => s.assistantOpen);
  const setAssistantOpen = useAppStore((s) => s.setAssistantOpen);
  const config = useConfig();
  const [notice, setNotice] = useState<string | null>(null);

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

      <div className="pointer-events-none absolute left-3 right-3 top-[76px] z-20 flex flex-col items-start gap-2 md:left-auto md:right-[436px] md:items-end">
        {config.isError && (
          <Notice tone="danger">
            The WorldLens API is unreachable. The globe still works; data will load when it returns.
          </Notice>
        )}
      </div>

      {!mobile && (
        <aside
          className="glass pointer-events-auto absolute bottom-[124px] right-3 top-[76px] z-20 flex w-[410px] flex-col overflow-hidden rounded-2xl"
          aria-label="Context panel"
          data-testid="context-panel"
        >
          <ErrorBoundary label="The context panel">
            <PanelBody />
          </ErrorBoundary>
        </aside>
      )}
      {!mobile && assistantOpen && (
        <aside className="glass pointer-events-auto absolute bottom-[124px] left-3 top-[76px] z-20 flex w-[380px] flex-col overflow-hidden rounded-2xl">
          <ErrorBoundary label="The assistant">
            <AssistantPanel onClose={() => setAssistantOpen(false)} />
          </ErrorBoundary>
        </aside>
      )}
      {mobile && <MobileSheet />}

      <div
        className="pointer-events-none absolute inset-x-3 bottom-3 z-30 flex flex-col gap-2"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex justify-center">
          <TourBar />
        </div>
        <TemporalNavigator compact={mobile} />
      </div>

      {notice && (
        <div
          className="pointer-events-auto absolute left-1/2 top-[132px] z-10 flex w-max max-w-[min(420px,80vw)] -translate-x-1/2 items-start gap-2 rounded-lg border border-white/10 bg-black/45 px-2.5 py-1.5 text-[11px] leading-snug text-slate-300 backdrop-blur md:top-[78px]"
          data-testid="basemap-notice"
        >
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-slate-400 hover:text-white"
            aria-label="Dismiss imagery notice"
          >
            ✕
          </button>
        </div>
      )}
      <DiagnosticsPanel />
      <TakeActionModal />
      <Announcer />
    </div>
  );
}
