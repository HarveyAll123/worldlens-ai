/**
 * A dated country (OpenHistoricalMap polity) as it was on the selected date: the flag in use
 * that day, the period these borders were in force, capital and a Wikipedia summary.
 * Historical flags are shown exactly as they were (no symbols removed or blurred).
 */
import { floorTo, formatAt, parseIso, toIso, type Granularity } from '@worldlens/shared';
import { flagForPolity } from '../globe/ohm';
import { useOhmFlags, useWikipedia } from '../hooks/useData';
import { flyToCountry } from '../lib/countries';
import { useAppStore, type CountrySelection } from '../state/store';
import { Badge, ExternalLink, Section, Spinner } from './ui';

/** "1941-04-14" → "14 Apr 1941", "1941-04" → "Apr 1941", "1941" → "1941". */
export function formatOhmDate(d: string): string {
  const unit: Granularity = d.length >= 10 ? 'day' : d.length >= 7 ? 'month' : 'year';
  return formatAt(parseIso(d), unit, { upper: false });
}

function period(start: string | null, end: string | null): string {
  if (!start && !end) return 'dates not recorded';
  return `${start ? formatOhmDate(start) : '…'} – ${end ? formatOhmDate(end) : 'present'}`;
}

const commonsImage = (file: string, width: number) =>
  `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=${width}`;
const commonsPage = (file: string) =>
  `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file.replace(/ /g, '_'))}`;

export function CountryPanel({
  country,
  onBack,
}: {
  country: CountrySelection;
  onBack: () => void;
}) {
  const mode = useAppStore((s) => s.mode);
  const timeMs = useAppStore((s) => s.timeMs);
  const day = toIso(floorTo(mode === 'live' ? Date.now() : timeMs, 'day')).slice(0, 10);
  const flags = useOhmFlags(true);
  const entry = country.wikidata ? flags.data?.[country.wikidata] : undefined;
  const flag = flags.data ? flagForPolity(flags.data, country.wikidata, country, day) : null;
  const wiki = useWikipedia(entry?.wiki ?? undefined);
  const extract = wiki.data?.summary?.extract;

  return (
    <article
      className="scroll-thin flex h-full flex-col overflow-y-auto"
      data-testid="country-panel"
    >
      <div className="px-4 pt-3">
        <button
          type="button"
          onClick={onBack}
          className="text-[12.5px] text-slate-300 hover:text-white"
        >
          ← Events
        </button>
      </div>

      {flag ? (
        <figure className="m-0 px-4 pt-3">
          <img
            src={commonsImage(flag.file, 480)}
            alt={`Flag of ${country.name}`}
            referrerPolicy="no-referrer"
            className="max-h-40 w-auto max-w-full rounded border border-white/10 bg-white/5 object-contain"
            data-testid="country-flag"
            onError={(e) => ((e.target as HTMLElement).style.display = 'none')}
          />
          <figcaption
            className="pt-1 text-[10.5px] text-slate-500"
            data-testid="country-flag-caption"
          >
            {flag.owner ? `Flag of ${flag.owner}, ` : 'Flag '}
            {flag.nearest
              ? `nearest recorded — in use ${period(flag.start, flag.end)}`
              : flag.start || flag.end
                ? `in use ${period(flag.start, flag.end)}`
                : '(dates of use not recorded)'}{' '}
            · Wikimedia Commons · <ExternalLink href={commonsPage(flag.file)}>source</ExternalLink>
          </figcaption>
        </figure>
      ) : flags.isLoading ? (
        <div className="px-4 pt-3">
          <Spinner label="Loading flag" />
        </div>
      ) : (
        <p className="px-4 pt-3 text-[11.5px] text-slate-500" data-testid="country-no-flag">
          No flag is recorded for {country.name} on this date.
        </p>
      )}

      <div className="px-4 pb-3 pt-3">
        <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
          <Badge tone="history">Country</Badge>
          {!country.end && <Badge>Exists today</Badge>}
        </div>
        <h2
          className="text-[18px] font-semibold leading-snug text-white"
          data-testid="country-name"
        >
          {country.name}
        </h2>
        {entry?.description && (
          <p className="mt-1 text-[12.5px] text-slate-300">{entry.description}</p>
        )}
      </div>

      <Section title="Borders shown">
        <p className="text-[13px] text-slate-200" data-testid="country-period">
          {period(country.start, country.end)}
        </p>
        <p className="mt-1 text-[11.5px] leading-snug text-slate-400">
          The borders on the globe are this version of {country.name}; they change on the dates
          OpenHistoricalMap records.
        </p>
        <button
          type="button"
          onClick={() => flyToCountry(country)}
          className="mt-2 rounded-md border border-white/15 px-2.5 py-1 text-[12px] text-slate-200 hover:bg-white/10"
        >
          Show on globe
        </button>
      </Section>

      {!!entry?.capitals.length && (
        <Section title={entry.capitals.length > 1 ? 'Capitals' : 'Capital'}>
          <p className="text-[13px] text-slate-200">{entry.capitals.join(' · ')}</p>
          {entry.capitals.length > 1 && (
            <p className="mt-1 text-[11px] text-slate-500">Over the state’s whole history.</p>
          )}
        </Section>
      )}

      <Section title="Learn more">
        {extract && (
          <blockquote className="mb-2 border-l-2 border-white/15 pl-3 text-[12.5px] leading-relaxed text-slate-300">
            {extract.slice(0, 520)}
            {extract.length > 520 ? '…' : ''}
            <footer className="mt-1 text-[10.5px] text-slate-500">
              From Wikipedia, CC BY-SA 4.0
            </footer>
          </blockquote>
        )}
        {entry?.wiki && (
          <ExternalLink
            href={`https://en.wikipedia.org/wiki/${encodeURIComponent(entry.wiki)}`}
            className="text-[13px] font-medium"
          >
            Read on Wikipedia →
          </ExternalLink>
        )}
        {!entry && !flags.isLoading && (
          <p className="text-[12px] text-slate-400">No Wikidata record is linked to this entry.</p>
        )}
        <p className="mt-2 text-[10.5px] text-slate-500">
          Borders: OpenHistoricalMap (CC0). Flag dates, capital and description: Wikidata (CC0).
          {country.wikidata && (
            <>
              {' '}
              <ExternalLink href={`https://www.wikidata.org/wiki/${country.wikidata}`}>
                {country.wikidata}
              </ExternalLink>
            </>
          )}
        </p>
      </Section>
    </article>
  );
}
