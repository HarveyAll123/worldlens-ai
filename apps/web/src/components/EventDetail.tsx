import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import {
  parseIso,
  resolutionFor,
  type ActionOption,
  type Framing,
  type NewsSource,
  type PoliticalRatingValue,
  type WorldEvent,
} from '@worldlens/shared';
import { api, type PublisherPlace, type SourcesResponse } from '../lib/api';
import { eventPrompts } from '../lib/askPrompts';
import { relativeTime, safeExternalUrl, temporalWithPrecision } from '../lib/format';
import { useEventDetail, useRelated, useSources, useWikipedia } from '../hooks/useData';
import { useAppStore } from '../state/store';
import { Badge, ExternalLink, Icon, Notice, Section, Spinner } from './ui';

const RELATION_LABEL: Record<string, string> = {
  PRECEDED_BY: 'Earlier context',
  LED_TO: 'Led to',
  PART_OF: 'Part of',
  RELATED_TO: 'Related',
  RESPONSE_TO: 'Response to',
  ESCALATION_OF: 'Escalation of',
  TERRITORIAL_CHANGE: 'Territorial change',
  PEACE_AGREEMENT: 'Peace agreement',
};

const RATING_ORDER: PoliticalRatingValue[] = [
  'LEFT',
  'CENTER-LEFT',
  'CENTER',
  'CENTER-RIGHT',
  'RIGHT',
  'MIXED',
  'UNRATED',
];

// The question waits in the store with its event (shown above the question in the chat, and
// told to the model): the chat sends it once shown — at once when docked beside the card,
// otherwise after it takes over the shared card or the phone sheet.
function askAi(text: string, e: WorldEvent) {
  const s = useAppStore.getState();
  s.setPendingQuestion({ text, about: { eventId: e.id, title: e.title } });
  if (window.matchMedia('(max-width: 767px)').matches) s.setSheet('assistant', true);
  else s.setAssistantOpen(true);
}

function ImageBlock({ image, alt }: { image: NonNullable<WorldEvent['image']>; alt: string }) {
  const url = safeExternalUrl(image.url);
  if (!url) return null;
  const page = safeExternalUrl(image.sourcePageUrl);
  return (
    <figure className="m-0">
      <img
        src={url}
        alt={image.alt ?? alt}
        loading="lazy"
        referrerPolicy="no-referrer"
        className="h-44 w-full object-cover"
        onError={(e) => ((e.target as HTMLElement).style.display = 'none')}
      />
      <figcaption className="px-4 pt-1 text-[10.5px] text-white/35">
        {image.credit} · {image.license}
        {page && (
          <>
            {' · '}
            <ExternalLink href={page}>source</ExternalLink>
          </>
        )}
      </figcaption>
    </figure>
  );
}

function Header({ e }: { e: WorldEvent }) {
  const t = temporalWithPrecision(e.time);
  return (
    <div className="px-4 pb-3 pt-3">
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        <Badge tone={e.kind === 'news' ? 'news' : 'history'}>
          {e.kind !== 'news'
            ? 'History'
            : Date.now() - Date.parse(e.time.end ?? e.time.start) < 72 * 3_600_000
              ? 'Current event'
              : 'News'}
        </Badge>
        <Badge>{e.category}</Badge>
        {e.isDemo && <Badge tone="demo">DEMO</Badge>}
      </div>
      <h2
        className="text-[17px] font-normal leading-snug tracking-[-0.01em] text-white"
        data-testid="event-title"
      >
        {e.title}
      </h2>
      <p className="mt-1 text-[12.5px] text-white/70">
        <span>{e.location.name}</span>
        {e.location.precision !== 'city' && e.location.precision !== 'exact' && (
          <span className="text-white/35"> (location {e.location.precision})</span>
        )}
      </p>
      <p className="text-[12.5px] text-white/50">
        <time dateTime={e.time.start}>{t.label}</time>
        <span className="text-white/35"> · {t.precision}</span>
        {e.kind === 'news' && (
          <span className="text-white/35"> · {relativeTime(e.updatedAt ?? e.time.start)}</span>
        )}
      </p>
    </div>
  );
}

function Participants({ e }: { e: WorldEvent }) {
  if (!e.participants.length) return null;
  return (
    <Section
      id="sec-participants"
      title={
        e.kind === 'news' && e.participants.some((p) => p.role === 'mentioned')
          ? 'Participants (mentioned)'
          : 'Participants'
      }
    >
      <ul className="flex flex-wrap gap-1.5">
        {e.participants.map((p) => (
          <li
            key={p.name}
            className="rounded-full border border-white/[0.08] bg-white/[0.05] px-2 py-0.5 text-[12px] text-white/85"
          >
            {p.name}
          </li>
        ))}
      </ul>
    </Section>
  );
}

function SourceCoverage({ data }: { data: SourcesResponse }) {
  const byId = new Map(data.sources.map((s) => [s.id, s]));
  return (
    <Section
      id="sec-sources"
      title={`Source coverage (${data.articles.length})`}
      testId="source-coverage"
    >
      {data.isDemo && (
        <p className="mb-2 text-[11.5px] text-white/80">
          Fictional outlets and articles (DEMO) — no external pages.
        </p>
      )}
      <ul className="space-y-2">
        {[...data.articles]
          .sort((a, b) => parseIso(b.publishedAt) - parseIso(a.publishedAt))
          .map((a) => {
            const src = byId.get(a.sourceId);
            const href = a.isDemo ? null : safeExternalUrl(a.url);
            return (
              <li key={a.id} className="text-[13px] leading-snug">
                <span className="text-[11px] text-white/50">
                  {src?.name ?? a.sourceId}
                  {(src?.nationalPerspective ?? data.places?.[a.sourceId]?.name) && (
                    <span className="text-white/35">
                      {' '}
                      · {src?.nationalPerspective ?? data.places?.[a.sourceId]?.name}
                    </span>
                  )}
                  {a.origin && (
                    <span className="text-white/35">
                      {' '}
                      · via {a.origin === 'rss' ? 'RSS' : 'GDELT'}
                    </span>
                  )}{' '}
                  · {relativeTime(a.publishedAt)}
                </span>
                <span className="block text-white/90">
                  {href ? (
                    <ExternalLink href={href} className="text-white/90">
                      {a.headline}
                    </ExternalLink>
                  ) : (
                    a.headline
                  )}
                </span>
              </li>
            );
          })}
      </ul>
      <p className="mt-2 text-[10.5px] text-white/35">
        Headlines link to the original publishers. WorldLens does not republish articles.
      </p>
    </Section>
  );
}

const SOURCE_TYPE: Record<NewsSource['sourceType'], string> = {
  'wire-agency': 'News agency',
  'public-broadcaster': 'Public broadcaster',
  'state-media': 'State media',
  commercial: 'Commercial',
  nonprofit: 'Nonprofit',
  'reader-funded': 'Reader-funded',
  local: 'Local outlet',
  government: 'Government',
  'demo-fictional': 'Fictional (demo)',
  unknown: 'Type unknown',
};

const RATING_TEXT: Record<PoliticalRatingValue, string> = {
  LEFT: 'Left',
  'CENTER-LEFT': 'Center-left',
  CENTER: 'Center',
  'CENTER-RIGHT': 'Center-right',
  RIGHT: 'Right',
  MIXED: 'Mixed',
  UNRATED: 'Not rated',
};

/** How many publishers the list shows before "Show all". */
const PUBLISHERS_SHOWN = 5;

/**
 * Where a publisher is based, on the globe: its country outlined and the camera over it (on a
 * phone the sheet steps down so the globe shows). Again on the outlined country: the outline goes.
 */
function showPlace(p: PublisherPlace) {
  const s = useAppStore.getState();
  if (p.lat === undefined || p.lon === undefined) return;
  if (p.iso3 && s.highlightIso3 === p.iso3) return s.setHighlight(null);
  s.setHighlight(p.iso3);
  s.flyTo({ lat: p.lat, lon: p.lon, altitudeKm: p.altitudeKm ?? 1500, label: p.name });
  if (window.matchMedia('(max-width: 767px)').matches) s.setSheetExpanded(false);
  s.announce(`Showing ${p.name}`);
}

function PublisherRow({
  s,
  place,
  articles,
}: {
  s: NewsSource;
  place: PublisherPlace | undefined;
  articles: number;
}) {
  const site = s.isDemo ? null : safeExternalUrl(`https://${s.domain}`);
  const rated = s.rating.value !== 'UNRATED';
  const where = place?.name ?? s.nationalPerspective ?? 'Country unknown';
  // An outlet outside the registry is known by its site: the name is the link.
  const bare = s.name === s.domain;
  // Its kind (Wikidata: "TV station") and its type, once each.
  const kinds = [s.format, s.sourceType === 'unknown' ? null : SOURCE_TYPE[s.sourceType]].filter(
    (k, i, all): k is string =>
      !!k && all.findIndex((x) => x?.toLowerCase() === k.toLowerCase()) === i,
  );
  const facts = [...kinds, where, `${articles} article${articles === 1 ? '' : 's'}`];
  const ratingLink = s.rating.sourceUrl ? safeExternalUrl(s.rating.sourceUrl) : null;
  const community = !!s.rating.source?.startsWith('Wikidata');
  return (
    <li className="min-w-0 px-3 py-2.5" data-testid="coverage-publisher">
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="min-w-0 flex-1 truncate text-[13px] text-white/90">
          {bare && site ? (
            <ExternalLink href={site} className="text-white/90">
              {s.name}
            </ExternalLink>
          ) : (
            s.name
          )}
        </span>
        <span className={`shrink-0 text-[11px] ${rated ? 'text-white/75' : 'text-white/35'}`}>
          {RATING_TEXT[s.rating.value]}
        </span>
      </div>
      <p className="truncate text-[11px] text-white/50">{facts.join(' · ')}</p>
      {s.ownership && (
        <p className="truncate text-[11px] text-white/35" title={s.ownership}>
          Owner: {s.ownership}
        </p>
      )}
      {site && !bare && (
        <ExternalLink href={site} className="text-[11px] text-white/40">
          {s.domain}
        </ExternalLink>
      )}
      {rated && (
        <p
          className="mt-0.5 text-[10.5px] leading-snug text-white/35"
          data-testid="coverage-rating"
        >
          {s.rating.illustrative ? 'Illustrative rating (demo) · ' : ''}
          {s.rating.statement ? `“${s.rating.statement}” · ` : ''}
          {ratingLink ? (
            <ExternalLink href={ratingLink} className="text-white/45">
              {s.rating.source}
            </ExternalLink>
          ) : (
            s.rating.source
          )}
          {community ? ', community-edited' : ''} · {s.rating.confidence} confidence ·{' '}
          {community ? 'checked' : 'reviewed'} {s.rating.lastReviewed}
        </p>
      )}
    </li>
  );
}

/**
 * Who reported the event and where they are based: the countries (shown on the globe on a tap),
 * each publisher with its type, owner and site, and its left–right rating only where a
 * documented rating is loaded — never guessed.
 */
function CoveragePerspectives({ data }: { data: SourcesResponse }) {
  const places = data.places ?? {};
  const highlight = useAppStore((s) => s.highlightIso3);
  const [all, setAll] = useState(false);
  const perSource = new Map<string, number>();
  for (const a of data.articles) perSource.set(a.sourceId, (perSource.get(a.sourceId) ?? 0) + 1);
  // Most articles first; at a tie, rated outlets, then those WorldLens or Wikidata describes,
  // then bare sites.
  const rank = (s: NewsSource) =>
    (s.rating.value !== 'UNRATED' ? 0 : 2) + (s.sourceType === 'unknown' && !s.wikidata ? 1 : 0);
  const publishers = [...data.sources].sort(
    (a, b) =>
      (perSource.get(b.id) ?? 0) - (perSource.get(a.id) ?? 0) ||
      rank(a) - rank(b) ||
      a.name.localeCompare(b.name),
  );
  // Countries, most publishers first; publishers with no known country are counted apart.
  const countries = new Map<string, { place: PublisherPlace; n: number }>();
  let unplaced = 0;
  for (const s of publishers) {
    const p = places[s.id];
    if (!p) {
      unplaced++;
      continue;
    }
    const key = p.iso3 ?? p.name;
    const c = countries.get(key);
    if (c) c.n++;
    else countries.set(key, { place: p, n: 1 });
  }
  const byCountry = [...countries.values()].sort((a, b) => b.n - a.n);
  const ratings = new Map<PoliticalRatingValue, number>();
  for (const s of publishers) ratings.set(s.rating.value, (ratings.get(s.rating.value) ?? 0) + 1);
  const rated = publishers.length - (ratings.get('UNRATED') ?? 0);
  const shown = all ? publishers : publishers.slice(0, PUBLISHERS_SHOWN);
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
  return (
    <Section id="sec-perspectives" title="Coverage perspectives" testId="coverage-perspectives">
      <p className="text-[11.5px] leading-snug text-white/50">
        Who reported this and where they are based. Ratings describe publishers, never the event.
      </p>
      <p className="tabular mt-1 text-[11px] text-white/35">
        {plural(publishers.length, 'publisher')} ·{' '}
        {byCountry.length === 1 ? '1 country' : `${byCountry.length} countries`} ·{' '}
        {rated ? `${rated} rated` : 'none rated'}
      </p>

      {byCountry.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-[10.5px] text-white/40">Based in — show it on the globe</p>
          <ul className="flex flex-wrap gap-1.5">
            {byCountry.map(({ place, n }) => {
              const active = !!place.iso3 && highlight === place.iso3;
              // A country the map does not know is named only.
              if (place.lat === undefined)
                return (
                  <li
                    key={place.name}
                    className="flex h-8 max-w-[15rem] items-center gap-1.5 rounded-full border border-white/[0.06] px-3 text-[12px] text-white/55"
                  >
                    <span className="truncate">{place.name}</span>
                    <span className="tabular shrink-0 opacity-70">{n}</span>
                  </li>
                );
              return (
                <li key={place.iso3 ?? place.name}>
                  <button
                    type="button"
                    onClick={() => showPlace(place)}
                    aria-pressed={place.iso3 ? active : undefined}
                    title={
                      active
                        ? `Hide the outline of ${place.name}`
                        : `Show ${place.name} on the globe`
                    }
                    className={`flex h-8 max-w-[15rem] items-center gap-1.5 rounded-full border px-3 text-[12px] transition-colors duration-150 ease-out ${
                      active
                        ? 'border-transparent bg-[var(--active-bg)] text-[var(--active-fg)]'
                        : 'border-white/12 text-white/80 hover:bg-white/[0.08] hover:text-white'
                    }`}
                    data-testid="coverage-country"
                  >
                    <Icon name="pin" className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{place.name}</span>
                    <span className="tabular shrink-0 opacity-55">{n}</span>
                  </button>
                </li>
              );
            })}
            {unplaced > 0 && (
              <li className="flex h-8 items-center rounded-full border border-white/[0.06] px-3 text-[12px] text-white/40">
                Unknown <span className="tabular ml-1.5 opacity-70">{unplaced}</span>
              </li>
            )}
          </ul>
        </div>
      )}

      <div className="mt-3">
        <p className="mb-1.5 text-[10.5px] text-white/40">Publishers</p>
        <ul className="divide-y divide-white/[0.06] rounded-[14px] border border-white/[0.07] bg-white/[0.02]">
          {shown.map((s) => (
            <PublisherRow
              key={s.id}
              s={s}
              place={places[s.id]}
              articles={perSource.get(s.id) ?? 0}
            />
          ))}
        </ul>
        {publishers.length > PUBLISHERS_SHOWN && (
          <button
            type="button"
            onClick={() => setAll(!all)}
            className="mt-1.5 h-8 rounded-full px-3 text-[11.5px] text-white/55 transition-colors duration-150 ease-out hover:bg-white/[0.06] hover:text-white/85"
            data-testid="coverage-show-all"
          >
            {all ? 'Show fewer' : `Show all ${publishers.length} publishers`}
          </button>
        )}
      </div>

      {publishers.some(
        (s) => places[s.id]?.basis === 'gdelt-list' || places[s.id]?.basis === 'wikidata',
      ) && (
        <p className="mt-2 text-[10.5px] leading-snug text-white/35">
          Outlets outside WorldLens's publisher list are described from Wikidata where it knows
          their website, and placed by it or by GDELT's list of news outlets by country (2018),
          which can be out of date.
        </p>
      )}

      <div className="mt-3">
        <p className="mb-1 text-[10.5px] text-white/40">Political orientation</p>
        {rated === 0 ? (
          <p className="text-[11.5px] leading-snug text-white/50" data-testid="coverage-unrated">
            Not rated. WorldLens shows a left–right rating only where a published source states one
            — Wikidata's "political alignment", with its method and date. None of these outlets has
            one, so nothing is guessed.
          </p>
        ) : (
          <>
            <p className="tabular text-[12px] text-white/75">
              {RATING_ORDER.filter((r) => ratings.get(r))
                .map((r) => `${RATING_TEXT[r]} ${ratings.get(r)}`)
                .join(' · ')}
            </p>
            {publishers.some((s) => s.rating.source?.startsWith('Wikidata')) && (
              <p className="mt-1 text-[10.5px] leading-snug text-white/35">
                From Wikidata's "political alignment" statements, edited by its community: low
                confidence unless the statement cites a source. Outlets without one are not rated;
                nothing is guessed.
              </p>
            )}
          </>
        )}
      </div>
    </Section>
  );
}

const KIND_TONE = {
  fact: 'ok',
  claim: 'neutral',
  allegation: 'warn',
  assessment: 'history',
} as const;

function SourceFraming({ eventId, sources }: { eventId: string; sources: NewsSource[] }) {
  const m = useMutation({ mutationFn: () => api.framing(eventId) });
  const name = (id: string) => sources.find((s) => s.id === id)?.name ?? id;
  const f: Framing | null | undefined = m.data?.framing;
  return (
    <Section
      id="sec-framing"
      title="How sources frame this event"
      testId="source-framing"
      actions={
        !f && (
          <button
            type="button"
            onClick={() => m.mutate()}
            disabled={m.isPending}
            className="rounded-md border border-white/12 px-2 py-0.5 text-[11.5px] text-white/90 hover:bg-white/10"
            data-testid="compare-framing"
          >
            {m.isPending ? 'Comparing…' : 'Compare'}
          </button>
        )
      }
    >
      {!f && !m.isPending && !m.data?.message && (
        <p className="text-[12px] text-white/50">
          Compare what outlets agree on, where they differ, and how they frame it.
        </p>
      )}
      {m.isPending && <Spinner label="Comparing coverage" />}
      {m.isError && <Notice tone="danger">Comparison unavailable right now.</Notice>}
      {m.data?.message && <p className="text-[12px] text-white/50">{m.data.message}</p>}
      {f && (
        <div className="space-y-3 text-[12.5px]">
          <p className="text-[11px] text-white/35">
            Method:{' '}
            {f.method === 'ai' ? `AI-assisted (${f.model ?? 'model'})` : 'automated heuristic'} ·
            labels distinguish fact, claim, allegation and assessment.
          </p>
          {f.sharedTopics && f.sharedTopics.length > 0 && (
            <p className="text-white/70">
              <span className="text-white/50">Topics shared across outlets:</span>{' '}
              {f.sharedTopics.join(', ')}
            </p>
          )}
          <div>
            <h4 className="mb-1 font-medium text-white/85">Commonly reported</h4>
            <ul className="space-y-1.5">
              {f.commonlyReported.length === 0 && (
                <li className="text-white/50">
                  No statement is corroborated strongly enough to list as commonly reported.
                </li>
              )}
              {f.commonlyReported.map((c, i) => (
                <li key={i} className="flex gap-2">
                  <Badge tone={KIND_TONE[c.kind]}>{c.kind}</Badge>
                  <span className="text-white/85">
                    {c.text}{' '}
                    <span className="text-white/35">— {c.sourceIds.map(name).join(', ')}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          {f.disagreements.length > 0 && (
            <div>
              <h4 className="mb-1 font-medium text-white/85">Points of disagreement</h4>
              {f.disagreements.map((d, i) => (
                <div key={i} className="mb-1.5">
                  <p className="text-white/70">{d.topic}</p>
                  <ul className="ml-3 list-disc text-white/50">
                    {d.positions.map((p, j) => (
                      <li key={j}>{p.text}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
          <div>
            <h4 className="mb-1 font-medium text-white/85">Differences in framing</h4>
            <ul className="space-y-1 text-white/70">
              {f.framingDifferences.map((d) => (
                <li key={d.sourceId}>
                  <span className="text-white/50">{name(d.sourceId)}:</span> {d.framing}
                </li>
              ))}
            </ul>
          </div>
          <ul className="space-y-0.5 text-[11px] text-white/35">
            {f.caveats.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}

function HistoricalContext({ id }: { id: string }) {
  const q = useRelated(id);
  const related = q.data?.related ?? [];
  if (q.isLoading) return null;
  return (
    <Section id="sec-context" title="Historical context · Then ↔ Now" testId="historical-context">
      {related.length === 0 ? (
        <p className="text-[12px] text-white/50">No linked context in WorldLens yet.</p>
      ) : (
        <ol className="space-y-1">
          {related.map((r) => (
            <li key={`${r.relation.fromId}-${r.relation.toId}-${r.relation.type}`}>
              <button
                type="button"
                className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-white/[0.06]"
                onClick={() => {
                  const s = useAppStore.getState();
                  if (r.event.kind === 'news') s.returnToLive();
                  else s.setTime(parseIso(r.event.time.start), resolutionFor(r.event.time));
                  s.selectEvent(r.event.id);
                  s.flyTo({
                    lat: r.event.location.lat,
                    lon: r.event.location.lon,
                    altitudeKm: 1200,
                  });
                }}
                data-testid="context-item"
              >
                <span className="text-[11px] text-white/35">
                  {temporalWithPrecision(r.event.time).label} ·{' '}
                  {RELATION_LABEL[r.relation.type] ?? r.relation.type} · confidence{' '}
                  {Math.round(r.relation.confidence * 100)}%
                </span>
                <span className="block text-[13px] text-white/90">
                  {r.event.title} {r.event.isDemo && <Badge tone="demo">DEMO</Badge>}
                </span>
                {r.relation.notes && (
                  <span className="block text-[11.5px] text-white/50">{r.relation.notes}</span>
                )}
              </button>
            </li>
          ))}
        </ol>
      )}
      <p className="mt-1 text-[10.5px] text-white/35">
        Links show relevant context, not proven causation.
      </p>
    </Section>
  );
}

function TakeActionSection({ e, actions }: { e: WorldEvent; actions: ActionOption[] }) {
  const open = useAppStore((s) => s.openTakeAction);
  if (!actions.length) return null;
  return (
    <Section id="sec-action" title="Take action" testId="take-action">
      <div className="sandbox-banner mb-2 rounded-md border border-sandbox/40 px-2 py-1 text-center text-[11px] font-normal tracking-wider text-sandbox">
        SANDBOX DEMO — NO REAL MONEY TRANSFERRED
      </div>
      <ul className="space-y-2">
        {actions.map((a) => (
          <li key={a.id} className="rounded-lg border border-white/[0.08] p-3">
            <p className="text-[13.5px] font-medium text-white/90">{a.title}</p>
            <p className="mt-0.5 text-[12px] text-white/50">{a.description}</p>
            <button
              type="button"
              onClick={() => open({ eventId: e.id, optionId: a.id })}
              className="mt-2 rounded-full bg-[var(--active-bg)] px-3.5 py-1.5 text-[12px] text-[var(--active-fg)] transition-colors hover:bg-white"
              data-testid="review-action"
            >
              Review &amp; continue
            </button>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/** Three prompts fitted to this event (lib/askPrompts.ts), each sent with the event. */
/**
 * The three suggested questions, then "Custom question": the user's own, about this event.
 * Rendered with key={e.id}, so another event in the card starts with the button again.
 */
function AskAi({ e }: { e: WorldEvent }) {
  const [writing, setWriting] = useState(false);
  const [text, setText] = useState('');
  const canAsk = text.trim().length > 0;
  const close = () => {
    setWriting(false);
    setText('');
  };
  return (
    <Section id="sec-ask" title="Ask AI">
      <div className="flex flex-wrap gap-1.5">
        {eventPrompts(e).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => askAi(p, e)}
            className="rounded-full border border-white/12 px-2.5 py-1 text-[12px] text-white/85 transition-colors hover:bg-white/[0.06]"
            data-testid="ask-ai-prompt"
          >
            {p}
          </button>
        ))}
      </div>
      {writing ? (
        <form
          className="mt-2 flex items-center gap-1.5 rounded-full bg-white/[0.05] py-1 pl-3 pr-1 transition-colors focus-within:bg-white/[0.09]"
          onSubmit={(ev) => {
            ev.preventDefault();
            if (!canAsk) return;
            askAi(text.trim(), e);
            close();
          }}
          data-testid="ask-ai-custom-form"
        >
          <input
            autoFocus
            value={text}
            maxLength={1000}
            onChange={(ev) => setText(ev.target.value)}
            onKeyDown={(ev) => {
              if (ev.key === 'Escape') {
                ev.stopPropagation();
                close();
              }
            }}
            // Leaving it empty puts the button back.
            onBlur={() => {
              if (!canAsk) close();
            }}
            placeholder="Your question about this event"
            aria-label={`Your question about “${e.title}”`}
            className="min-w-0 flex-1 bg-transparent text-[12.5px] text-white/90 placeholder:text-white/35"
            data-testid="ask-ai-custom-input"
          />
          <button
            type="submit"
            disabled={!canAsk}
            className={`grid h-7 w-7 shrink-0 place-items-center rounded-full transition-colors ${
              canAsk
                ? 'bg-[var(--active-bg)] text-[var(--active-fg)] hover:bg-white'
                : 'text-white/30'
            }`}
            aria-label="Ask"
            data-testid="ask-ai-custom-send"
          >
            <Icon name="chevron-right" className="h-4 w-4" />
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setWriting(true)}
          className="mt-2 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] text-white/55 transition-colors hover:bg-white/[0.06] hover:text-white/85"
          data-testid="ask-ai-custom"
        >
          <Icon name="pencil" className="h-3.5 w-3.5" />
          Custom question
        </button>
      )}
    </Section>
  );
}

function NewsBody({ e, actions }: { e: WorldEvent; actions: ActionOption[] }) {
  const sources = useSources(e.id, e.kind === 'news');
  return (
    <>
      <Section id="sec-summary" title="Summary">
        {e.summary ? (
          <p className="text-[13.5px] leading-relaxed text-white/85">{e.summary}</p>
        ) : (
          <p className="text-[12.5px] text-white/50">
            Reported by {e.sourceCount} outlet(s). A summary is not available; see the source
            coverage below.
          </p>
        )}
        <p className="mt-1.5 text-[11px] text-white/35">
          {e.provenance.provider === 'gdelt'
            ? `Discovered via GDELT · clustered automatically from ${e.articleCount} article(s) · confidence ${Math.round(e.confidence * 100)}%`
            : e.provenance.note}
        </p>
      </Section>
      {e.whyItMatters && (
        <Section id="sec-why" title="Why it matters">
          <p className="text-[13px] leading-relaxed text-white/70">{e.whyItMatters}</p>
        </Section>
      )}
      <Participants e={e} />
      {sources.data && <SourceCoverage data={sources.data} />}
      {sources.data && sources.data.sources.length > 0 && (
        <CoveragePerspectives data={sources.data} />
      )}
      {sources.data && <SourceFraming eventId={e.id} sources={sources.data.sources} />}
      <HistoricalContext id={e.id} />
      <AskAi key={e.id} e={e} />
      <TakeActionSection e={e} actions={actions} />
    </>
  );
}

function HistoryBody({ e }: { e: WorldEvent }) {
  const wiki = useWikipedia(e.wikipediaTitle);
  const ref = e.references[0];
  return (
    <>
      <Section id="sec-summary" title="What happened">
        <p className="text-[13.5px] leading-relaxed text-white/85">{e.summary}</p>
      </Section>
      {e.whyItMatters && (
        <Section id="sec-why" title="Why it mattered">
          <p className="text-[13px] leading-relaxed text-white/70">{e.whyItMatters}</p>
        </Section>
      )}
      <Participants e={e} />
      <HistoricalContext id={e.id} />
      <Section id="sec-learn" title="Learn more" testId="learn-more">
        {wiki.data?.summary?.extract && (
          <blockquote className="mb-2 border-l-2 border-white/12 pl-3 text-[12.5px] leading-relaxed text-white/70">
            {wiki.data.summary.extract.slice(0, 420)}
            {wiki.data.summary.extract.length > 420 ? '…' : ''}
            <footer className="mt-1 text-[10.5px] text-white/35">
              From Wikipedia, CC BY-SA 4.0
            </footer>
          </blockquote>
        )}
        {wiki.data && !wiki.data.available && (
          <p className="mb-2 text-[11.5px] text-white/35">{wiki.data.message}</p>
        )}
        {ref && (
          <ExternalLink href={ref.url} className="text-[13px] font-medium">
            Read on Wikipedia →
          </ExternalLink>
        )}
        <p className="mt-2 text-[10.5px] text-white/35">
          Dates and summaries are from the WorldLens curated dataset; Wikipedia is linked for
          further reading.
        </p>
      </Section>
      <AskAi key={e.id} e={e} />
    </>
  );
}

const SECTION_INDEX: Array<[string, string]> = [
  ['sec-summary', 'Summary'],
  ['sec-why', 'Why'],
  ['sec-participants', 'Participants'],
  ['sec-sources', 'Sources'],
  ['sec-perspectives', 'Perspectives'],
  ['sec-framing', 'Framing'],
  ['sec-context', 'Then ↔ Now'],
  ['sec-action', 'Take action'],
  ['sec-learn', 'Learn more'],
];

export function EventDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const q = useEventDetail(id);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [sections, setSections] = useState<string[]>([]);
  const wiki = useWikipedia(
    q.data?.event.kind === 'historical' ? q.data.event.wikipediaTitle : undefined,
  );
  const headingRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, [id]);
  const e = q.data?.event;
  // A live story that a later ingestion merged into another event answers with that event: go
  // on under its id, so the globe marks it and its sources load (an open card, a "From" link).
  const servedId = e?.id;
  useEffect(() => {
    if (servedId && servedId !== id && useAppStore.getState().selectedEventId === id)
      useAppStore.getState().selectEvent(servedId);
  }, [servedId, id]);
  const image = e?.image ?? wiki.data?.summary?.image ?? null;
  // The index reflects what is actually rendered (sections mount as data resolves).
  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const update = () =>
      setSections(
        SECTION_INDEX.filter(([sid]) => root.querySelector(`#${sid}`)).map(([sid]) => sid),
      );
    update();
    const observer = new MutationObserver(update);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [id]);
  return (
    <article
      className="flex h-full min-h-0 flex-col"
      aria-labelledby="event-detail-heading"
      data-testid="event-detail"
    >
      <div
        ref={headingRef}
        tabIndex={-1}
        className="flex items-center gap-2 px-3 pb-1 pt-2.5 outline-none"
      >
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] text-white/50 transition-colors hover:bg-white/[0.06] hover:text-white"
          data-testid="back-to-list"
        >
          <Icon name="arrow-left" className="h-3.5 w-3.5" />
          Events
        </button>
        <span id="event-detail-heading" className="sr-only">
          {e?.title ?? 'Event'}
        </span>
      </div>
      {sections.length > 1 && (
        <nav
          className="flex shrink-0 flex-wrap gap-0.5 px-2.5 pb-1.5"
          aria-label="Sections"
          data-testid="section-index"
        >
          {sections.map((sid) => (
            <button
              key={sid}
              type="button"
              onClick={() =>
                scrollRef.current
                  ?.querySelector(`#${sid}`)
                  ?.scrollIntoView({ block: 'start', behavior: 'smooth' })
              }
              className="shrink-0 rounded-full px-2 py-0.5 text-[10.5px] text-white/45 transition-colors hover:bg-white/[0.06] hover:text-white/90"
            >
              {SECTION_INDEX.find(([s]) => s === sid)?.[1]}
            </button>
          ))}
        </nav>
      )}
      <div ref={scrollRef} className="scroll-thin min-h-0 flex-1 overflow-y-auto pb-6">
        {q.isLoading && (
          <div className="p-4">
            <Spinner />
          </div>
        )}
        {q.isError && (
          <div className="p-4">
            <Notice tone="danger">This event could not be loaded.</Notice>
          </div>
        )}
        {e && (
          <>
            {e.isDemo && (
              <div className="px-4 pt-2">
                <Notice tone="demo" testId="demo-banner">
                  <strong>DEMO</strong> — synthetic scenario for evaluation. Not real reporting;
                  outlets are fictional.
                </Notice>
              </div>
            )}
            {image && <div className="mt-2">{<ImageBlock image={image} alt={e.title} />}</div>}
            <Header e={e} />
            {e.kind === 'news' ? (
              <NewsBody e={e} actions={q.data!.actions} />
            ) : (
              <HistoryBody e={e} />
            )}
          </>
        )}
      </div>
    </article>
  );
}
