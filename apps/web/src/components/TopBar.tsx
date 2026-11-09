import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  floorTo,
  formatAt,
  formatLiveClock,
  parseIso,
  resolutionFor,
  toIso,
  type SearchResult,
} from '@worldlens/shared';
import { searchPolities, type PolityMatch } from '../globe/ohm';
import { useOhmFlags, useOhmIndex } from '../hooks/useData';
import { useMediaQuery } from '../hooks/useMedia';
import { api } from '../lib/api';
import { showCountry } from '../lib/countries';
import { sheetTabOpen, useAppStore } from '../state/store';
import { HelpSheet } from './HelpSheet';
import { LayerMenu } from './LayerMenu';
import { Badge, Icon } from './ui';

/** LIVE + real UTC clock, or HISTORICAL MODE + the selected (non-ticking) timestamp. */
export function LiveStatus({
  compact = false,
  minimal = false,
}: {
  compact?: boolean;
  minimal?: boolean;
}) {
  const mode = useAppStore((s) => s.mode);
  const timeMs = useAppStore((s) => s.timeMs);
  const resolution = useAppStore((s) => s.resolution);
  const returnToLive = useAppStore((s) => s.returnToLive);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (mode !== 'live') return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [mode]);

  if (mode === 'live') {
    const { date, time } = formatLiveClock(now);
    return (
      <div className="flex min-w-0 items-center gap-2" data-testid="live-status" aria-live="off">
        <span className="live-dot h-1.5 w-1.5 shrink-0 rounded-full bg-live" aria-hidden />
        <span className="hidden text-[10.5px] tracking-[0.1em] text-white/85 sm:inline">LIVE</span>
        {!minimal && (
          <span className="tabular truncate text-[11.5px] tracking-[0.01em] text-white/70">
            {compact ? time.replace(/:\d\d UTC$/, ' UTC') : date}
            {!compact && <span className="text-white/40"> · {time}</span>}
          </span>
        )}
      </div>
    );
  }
  return (
    <div className="flex min-w-0 items-center gap-2" data-testid="historical-status">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full border border-white/60" aria-hidden />
      <span className="hidden text-[10.5px] tracking-[0.1em] text-white/70 sm:inline">
        Historical
      </span>
      {!compact && !minimal && (
        <span
          className="tabular truncate text-[11.5px] text-white/80"
          data-testid="historical-time"
        >
          {formatAt(timeMs, resolution)}
        </span>
      )}
      <button
        type="button"
        onClick={returnToLive}
        className="ml-1 shrink-0 rounded-full bg-[var(--active-bg)] px-2.5 py-1 text-[11px] text-[var(--active-fg)] transition-colors hover:bg-white"
        data-testid="return-to-live"
      >
        Return to Live
      </button>
    </div>
  );
}

const TYPE_STYLE = 'border-white/15 text-white/55';

export function applySearchResult(r: SearchResult): void {
  const s = useAppStore.getState();
  if (r.type === 'NEWS') s.returnToLive();
  else if (r.time)
    s.setTime(
      parseIso(r.time.start),
      r.type === 'HISTORY' || r.type === 'ENTITY' ? resolutionFor(r.time) : 'year',
    );
  if (r.lat !== undefined && r.lon !== undefined)
    s.flyTo({
      lat: r.lat,
      lon: r.lon,
      altitudeKm: (r.altitude ?? 1_000_000) / 1000,
      label: r.title,
    });
  if (r.eventId) s.openEvent(r.eventId);
  s.announce(`Showing ${r.title}`);
}

export function SearchBox({
  autoFocus = false,
  onDone,
}: {
  autoFocus?: boolean;
  onDone?: () => void;
}) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      api
        .search(q.trim(), ctrl.signal)
        .then((r) => {
          setResults(r.results);
          setError(null);
          setOpen(true);
          setActive(r.results.length ? 0 : -1);
        })
        .catch((err: unknown) => {
          if ((err as Error).name !== 'AbortError') setError('Search is unavailable right now.');
        });
    }, 160);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  // Historical countries (OpenHistoricalMap) are matched in the browser and listed first.
  const searching = q.trim().length >= 2;
  const ohmIndex = useOhmIndex(searching);
  const flags = useOhmFlags(searching);
  const mode = useAppStore((s) => s.mode);
  const timeMs = useAppStore((s) => s.timeMs);
  const day = toIso(floorTo(mode === 'live' ? Date.now() : timeMs, 'day')).slice(0, 10);
  const countries = useMemo(
    () => (searching && ohmIndex.data ? searchPolities(ohmIndex.data.polities, q, day, 5) : []),
    [searching, ohmIndex.data, q, day],
  );
  type Item = { kind: 'country'; m: PolityMatch } | { kind: 'result'; r: SearchResult };
  const items: Item[] = [
    ...countries.map((m): Item => ({ kind: 'country', m })),
    ...results.map((r): Item => ({ kind: 'result', r })),
  ];
  useEffect(() => {
    if (countries.length && !open && document.activeElement === inputRef.current) setOpen(true);
  }, [countries.length, open]);

  const choose = (item: Item) => {
    if (item.kind === 'country') showCountry(item.m);
    else applySearchResult(item.r);
    setOpen(false);
    setQ('');
    inputRef.current?.blur();
    onDone?.();
  };

  return (
    <div className="relative w-full">
      <label htmlFor={`${listId}-input`} className="sr-only">
        Search places, events, people, conflicts and dates
      </label>
      <Icon
        name="search"
        className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/35"
      />
      <input
        id={`${listId}-input`}
        ref={inputRef}
        autoFocus={autoFocus}
        type="search"
        role="combobox"
        aria-expanded={open && items.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-opt-${active}` : undefined}
        placeholder="Search “Berlin 1945”, “Waterloo”, “South China Sea”…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => items.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(items.length - 1, a + 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === 'Enter' && items[Math.max(0, active)]) {
            e.preventDefault();
            choose(items[Math.max(0, active)]!);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
        className="h-9 w-full rounded-full border-0 bg-white/[0.05] py-0 pl-9 pr-4 text-[12.5px] text-white/90 placeholder:text-white/30 hover:bg-white/[0.08] focus:bg-white/[0.09]"
        data-testid="search-input"
      />
      {error && <p className="mt-1 text-xs text-white/70">{error}</p>}
      {open && items.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="glass scroll-thin absolute left-0 right-0 top-full z-40 mt-2 max-h-80 overflow-auto rounded-[var(--radius-inner)] p-1"
        >
          {items.map((item, i) => {
            const common = {
              id: `${listId}-opt-${i}`,
              role: 'option' as const,
              'aria-selected': i === active,
              onMouseDown: (e: React.MouseEvent) => {
                e.preventDefault();
                choose(item);
              },
              onMouseEnter: () => setActive(i),
              className: `flex cursor-pointer items-start gap-2 rounded-[10px] px-2 py-2 text-[12.5px] ${i === active ? 'bg-white/[0.09]' : ''}`,
              'data-testid': 'search-result',
            };
            if (item.kind === 'country') {
              const { m } = item;
              const desc = m.polity.wikidata ? flags.data?.[m.polity.wikidata]?.description : null;
              const years = `${m.start.slice(0, 4)}–${m.end ? m.end.slice(0, 4) : 'today'}`;
              return (
                <li key={`country-${m.polity.wikidata ?? m.polity.name}`} {...common}>
                  <span className="mt-0.5 shrink-0 rounded-full border border-white/20 px-1.5 py-px text-[10px] text-white/60">
                    Country
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-white/90">{m.polity.name}</span>
                    <span className="block truncate text-[11px] text-white/45">
                      {years}
                      {m.activeNow ? ' · on the selected date' : ' · jumps to its time'}
                      {desc ? ` · ${desc}` : ''}
                    </span>
                  </span>
                </li>
              );
            }
            const r = item.r;
            return (
              <li key={`${r.type}-${r.id}`} {...common}>
                <span
                  className={`mt-0.5 shrink-0 rounded-full border px-1.5 py-px text-[10px] ${TYPE_STYLE}`}
                >
                  {r.type}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-white/90">{r.title}</span>
                  {r.subtitle && (
                    <span className="block truncate text-[11px] text-white/45">{r.subtitle}</span>
                  )}
                </span>
                {r.isDemo && <Badge tone="demo">DEMO</Badge>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function TopBar({ mobile }: { mobile: boolean }) {
  const setAssistantOpen = useAppStore((s) => s.setAssistantOpen);
  const assistantOpen = useAppStore((s) => s.assistantOpen);
  // Phones: the buttons are the bottom sheet's tabs (Search, Ask AI, Layers, Events); the one
  // whose tab is open is highlighted, and tapping it again closes the sheet.
  const toggleSheetTab = useAppStore((s) => s.toggleSheetTab);
  const searchOpen = useAppStore((s) => sheetTabOpen(s, 'search'));
  const aiOpen = useAppStore((s) => sheetTabOpen(s, 'assistant'));
  const eventsOpen = useAppStore((s) => sheetTabOpen(s, 'events'));
  const cardOpen = useAppStore((s) => s.cardOpen);
  const setCardOpen = useAppStore((s) => s.setCardOpen);
  const selected = useAppStore((s) => s.selectedEventId);
  const country = useAppStore((s) => s.selectedCountry);
  const wide = useMediaQuery('(min-width: 1024px)');
  // With the chat docked on the left, the card on the right only ever holds events/countries.
  const docked = useAppStore((s) => s.chatDocked);
  const sharesCard = assistantOpen && !docked;
  const cardLabel = sharesCard ? 'Assistant' : country ? 'Country' : selected ? 'Event' : 'Events';
  const cardShown = mobile ? eventsOpen : cardOpen;
  const aiShown = mobile ? aiOpen : assistantOpen;

  return (
    <header className="pointer-events-none absolute left-3 right-3 top-3 z-30 flex items-center justify-between gap-2">
      <div className="glass-chrome pointer-events-auto flex h-12 shrink-0 items-center gap-2 rounded-full pl-3.5 pr-3">
        <span className="flex shrink-0 items-center gap-2 text-[13px] tracking-tight text-white/90">
          <Icon name="globe" className="h-[18px] w-[18px] text-white/70 md:h-5 md:w-5" />
          <span className={mobile || !wide ? 'sr-only' : ''}>WorldLens</span>
        </span>
        <span
          className="mx-2.5 hidden w-px shrink-0 self-stretch bg-white/12 sm:block"
          aria-hidden
        />
        <div className="min-w-0 shrink-0">
          <LiveStatus compact={mobile} minimal={!mobile && !wide} />
        </div>
      </div>

      {!mobile && (
        <div className="glass-chrome pointer-events-auto flex h-12 min-w-0 max-w-[560px] flex-1 items-center rounded-full p-1.5">
          <SearchBox />
        </div>
      )}

      <div className="glass-chrome pointer-events-auto flex h-12 shrink-0 items-center gap-0.5 rounded-full pl-1.5 pr-1.5">
        {mobile && (
          <button
            type="button"
            onClick={() => toggleSheetTab('search')}
            aria-pressed={searchOpen}
            className={`grid h-9 w-9 place-items-center rounded-full transition-colors ${
              searchOpen
                ? 'bg-white/[0.12] text-white'
                : 'text-white/70 hover:bg-white/[0.08] hover:text-white'
            }`}
            aria-label="Search"
          >
            <Icon name="search" className="h-[18px] w-[18px]" />
          </button>
        )}
        <button
          type="button"
          onClick={() => (mobile ? toggleSheetTab('assistant') : setAssistantOpen(!assistantOpen))}
          aria-pressed={aiShown}
          aria-label="Ask AI"
          className={`flex h-9 items-center gap-1.5 rounded-full px-3 text-[12.5px] transition-colors ${
            aiShown
              ? 'bg-white/[0.12] text-white'
              : 'text-white/70 hover:bg-white/[0.08] hover:text-white'
          }`}
          data-testid="open-assistant"
        >
          <Icon name="sparkle" className="h-4 w-4 md:h-5 md:w-5" />
          <span className={mobile ? 'hidden sm:inline lg:hidden' : 'hidden lg:inline'}>
            {mobile ? 'AI' : 'Ask AI'}
          </span>
        </button>
        <span
          className="mx-0.5 hidden w-px shrink-0 self-stretch bg-white/12 md:block"
          aria-hidden
        />
        <HelpSheet />
        <span
          className="mx-0.5 hidden w-px shrink-0 self-stretch bg-white/12 md:block"
          aria-hidden
        />
        <LayerMenu />
        <span
          className="mx-0.5 hidden w-px shrink-0 self-stretch bg-white/12 md:block"
          aria-hidden
        />
        <button
          type="button"
          onClick={() => {
            if (mobile) return toggleSheetTab('events');
            // With the assistant in the card, the first click returns the card to Events instead
            // of merely hiding it; otherwise the card could never leave the chat.
            if (sharesCard && cardOpen) {
              setAssistantOpen(false);
              setCardOpen(true);
              return;
            }
            setCardOpen(!cardOpen);
          }}
          aria-expanded={cardShown}
          aria-controls={mobile ? 'bottom-sheet' : 'context-card'}
          aria-label={cardLabel}
          className={`flex h-9 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] transition-colors ${
            cardShown
              ? 'bg-white/[0.12] text-white'
              : 'text-white/70 hover:bg-white/[0.08] hover:text-white'
          }`}
          data-testid="toggle-context-card"
        >
          <Icon name="panel" className="h-4 w-4 md:h-5 md:w-5" />
          <span className={mobile ? 'hidden sm:inline lg:hidden' : 'hidden lg:inline'}>
            {cardLabel}
          </span>
        </button>
      </div>
    </header>
  );
}
