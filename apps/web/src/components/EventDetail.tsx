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
import { api, type SourcesResponse } from '../lib/api';
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
          {e.kind === 'news' ? 'Current event' : 'History'}
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
                  {src?.nationalPerspective && (
                    <span className="text-white/35"> · {src.nationalPerspective}</span>
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

function Bar({
  label,
  value,
  max,
  tone,
}: {
  label: string;
  value: number;
  max: number;
  tone?: string;
}) {
  return (
    <li className="grid grid-cols-[minmax(0,9rem)_1fr_1.5rem] items-center gap-2 text-[12px]">
      <span className="truncate text-white/70">{label}</span>
      <span className="h-1.5 rounded-full bg-white/[0.05]">
        <span
          className={`block h-1.5 rounded-full ${tone ?? 'bg-white/[0.05]0'}`}
          style={{ width: `${(value / Math.max(1, max)) * 100}%` }}
        />
      </span>
      <span className="text-right tabular-nums text-white/50">{value}</span>
    </li>
  );
}

function RatingDetails({ s }: { s: NewsSource }) {
  if (s.rating.value === 'UNRATED') return null;
  return (
    <li className="text-[11.5px] text-white/50">
      <span className="text-white/85">{s.name}</span>: {s.rating.value}
      {s.rating.illustrative && <Badge tone="demo">illustrative</Badge>} — {s.rating.methodology}{' '}
      Source: {s.rating.source}; confidence {s.rating.confidence}; reviewed {s.rating.lastReviewed}.
    </li>
  );
}

function CoveragePerspectives({ data }: { data: SourcesResponse }) {
  const c = data.perspectives;
  const country = Object.entries(c.byCountry).sort((a, b) => b[1] - a[1]);
  const type = Object.entries(c.byType).sort((a, b) => b[1] - a[1]);
  const maxC = Math.max(...country.map(([, v]) => v), 1);
  const maxT = Math.max(...type.map(([, v]) => v), 1);
  const unrated = c.byRating.UNRATED ?? 0;
  return (
    <Section id="sec-perspectives" title="Coverage perspectives" testId="coverage-perspectives">
      <p className="mb-2 text-[11.5px] text-white/50">
        Orientation metadata describes publishers, never the event itself.
      </p>
      <h4 className="mb-1 text-[12px] font-medium text-white/85">National perspective</h4>
      <ul className="mb-3 space-y-1">
        {country.map(([k, v]) => (
          <Bar key={k} label={k} value={v} max={maxC} />
        ))}
      </ul>
      <h4 className="mb-1 text-[12px] font-medium text-white/85">Publisher type</h4>
      <ul className="mb-3 space-y-1">
        {type.map(([k, v]) => (
          <Bar key={k} label={k.replace(/-/g, ' ')} value={v} max={maxT} tone="bg-history/60" />
        ))}
      </ul>
      <h4 className="mb-1 text-[12px] font-medium text-white/85">
        Political orientation (publishers)
      </h4>
      <ul className="mb-2 space-y-1">
        {RATING_ORDER.filter((r) => c.byRating[r]).map((r) => (
          <Bar
            key={r}
            label={r}
            value={c.byRating[r]!}
            max={data.sources.length}
            tone={r === 'UNRATED' ? 'bg-white/25' : 'bg-white/50'}
          />
        ))}
      </ul>
      {unrated > 0 && (
        <p className="text-[11px] text-white/35">
          UNRATED means no rating with a documented methodology, source, confidence and review date
          is loaded for that publisher. WorldLens never guesses ratings.
        </p>
      )}
      <ul className="mt-1 space-y-1">
        {data.sources.map((s) => (
          <RatingDetails key={s.id} s={s} />
        ))}
      </ul>
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
