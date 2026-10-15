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
import { api } from '../lib/api';
import { showCountry } from '../lib/countries';
import { useAppStore } from '../state/store';
import { LayerMenu } from './LayerMenu';
import { Badge } from './ui';

/** LIVE + real UTC clock, or HISTORICAL MODE + the selected (non-ticking) timestamp. */
export function LiveStatus({ compact = false }: { compact?: boolean }) {
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
    const local = new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return (
      <div className="flex items-center gap-2.5" data-testid="live-status" aria-live="off">
        <span className="inline-flex items-center gap-1.5 rounded-md bg-live/15 px-2 py-1 text-[11px] font-bold tracking-[0.14em] text-live">
          <span className="live-dot h-2 w-2 rounded-full bg-live" aria-hidden />
          LIVE
        </span>
        <span className="font-mono text-[12px] leading-tight tabular-nums text-slate-200">
          <span className="block">{date}</span>
          <span className="block text-slate-400">
            {time}
            {!compact && <span className="ml-2 text-slate-500">· local {local}</span>}
          </span>
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2.5" data-testid="historical-status">
      <span className="rounded-md bg-history/15 px-2 py-1 text-[11px] font-bold tracking-[0.12em] text-history">
        HISTORICAL MODE
      </span>
      {!compact && (
        <span
          className="font-mono text-[12px] tabular-nums text-slate-200"
          data-testid="historical-time"
        >
          {formatAt(timeMs, resolution)}
        </span>
      )}
      <button
        type="button"
        onClick={returnToLive}
        className="rounded-md border border-white/15 px-2 py-1 text-[12px] font-medium text-slate-100 hover:bg-white/10"
        data-testid="return-to-live"
      >
        Return to Live
      </button>
    </div>
  );
}

const TYPE_STYLE: Record<SearchResult['type'], string> = {
  NEWS: 'text-news border-news/40',
  HISTORY: 'text-history border-history/40',
  PLACE: 'text-sky-300 border-sky-300/40',
  ENTITY: 'text-pink-200 border-pink-200/40',
  CONFLICT: 'text-rose-300 border-rose-300/40',
};

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
  if (r.eventId) s.selectEvent(r.eventId);
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
        className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[14px] text-slate-100 placeholder:text-slate-500 focus:border-sky-300/50 focus:bg-white/10"
        data-testid="search-input"
      />
      {error && <p className="mt-1 text-xs text-amber-300">{error}</p>}
      {open && items.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="glass scroll-thin absolute left-0 right-0 top-full z-40 mt-1 max-h-80 overflow-auto rounded-lg p-1 shadow-2xl"
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
              className: `flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-[13px] ${i === active ? 'bg-white/10' : ''}`,
              'data-testid': 'search-result',
            };
            if (item.kind === 'country') {
              const { m } = item;
              const desc = m.polity.wikidata ? flags.data?.[m.polity.wikidata]?.description : null;
              const years = `${m.start.slice(0, 4)}–${m.end ? m.end.slice(0, 4) : 'today'}`;
              return (
                <li key={`country-${m.polity.wikidata ?? m.polity.name}`} {...common}>
                  <span className="mt-0.5 shrink-0 rounded border border-amber-200/40 px-1 text-[10px] font-bold tracking-wider text-amber-200">
                    COUNTRY
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-slate-100">{m.polity.name}</span>
                    <span className="block truncate text-[11px] text-slate-400">
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
                  className={`mt-0.5 shrink-0 rounded border px-1 text-[10px] font-bold tracking-wider ${TYPE_STYLE[r.type]}`}
                >
                  {r.type}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-slate-100">{r.title}</span>
                  {r.subtitle && (
                    <span className="block truncate text-[11px] text-slate-400">{r.subtitle}</span>
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
  const setSheet = useAppStore((s) => s.setSheet);

  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start gap-3 p-3">
      <div className="glass pointer-events-auto flex items-center gap-3 rounded-xl px-3 py-2">
        <span className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
          <svg viewBox="0 0 64 64" className="h-5 w-5" aria-hidden>
            <circle cx="32" cy="32" r="27" fill="#16365c" />
            <ellipse
              cx="32"
              cy="32"
              rx="27"
              ry="9.5"
              fill="none"
              stroke="#f5c76b"
              strokeWidth="3"
            />
          </svg>
          <span className={mobile ? 'sr-only' : ''}>WorldLens</span>
        </span>
        <span className="h-6 w-px bg-white/10" aria-hidden />
        <LiveStatus compact={mobile} />
      </div>
      {!mobile && (
        <div className="glass pointer-events-auto w-[min(420px,36vw)] rounded-xl p-1.5">
          <SearchBox />
        </div>
      )}
      <div className="pointer-events-auto ml-auto flex items-center gap-2">
        {mobile && (
          <button
            type="button"
            onClick={() => setSheet('search', true)}
            className="glass rounded-xl px-3 py-2.5 text-[13px] font-medium"
            aria-label="Search"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
          </button>
        )}
        <button
          type="button"
          onClick={() => (mobile ? setSheet('assistant', true) : setAssistantOpen(!assistantOpen))}
          aria-pressed={!mobile ? assistantOpen : undefined}
          className="glass rounded-xl px-3 py-2 text-[13px] font-semibold text-sky-100 hover:bg-white/10"
          data-testid="open-assistant"
        >
          <span aria-hidden>✦</span> {mobile ? 'AI' : 'Ask AI'}
        </button>
        <LayerMenu />
      </div>
    </header>
  );
}
