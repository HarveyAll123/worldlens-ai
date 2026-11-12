/**
 * Implementations of the AI tool layer. Server tools read data; client tools are validated,
 * resolved (place names → coordinates) and returned to the browser as actions. Nothing
 * here can create or capture a payment.
 */
import {
  TEMPORAL_CONFIG,
  clientToolSchemas,
  formatTemporal,
  intersects,
  isBeforeNavigable,
  isClientTool,
  isServerTool,
  normalizeText,
  parseIso,
  periodAt,
  precisionLabel,
  serverToolSchemas,
  temporalSpan,
  toIso,
  yearOf,
  type ActionOption,
  type ClientAction,
  type EventSummary,
  type PlaceGroup,
  type ServerToolName,
  type WorldEvent,
} from '@worldlens/shared';
import { CONFLICTS } from '@worldlens/shared/data';
import { changesBetween, dayNumber, theatreActive } from '@worldlens/shared';
import {
  FRONT_THEATRES,
  frontBriefs,
  frontTheatreList,
  occupationBriefs,
} from '@worldlens/shared/fronts-data';
import { findCountry, resolvePlace } from '@worldlens/shared/geo-data';
import type { EventRepository } from '../data/repository';
import type { HistoricalBordersProvider } from '../providers/borders';
import { selectBorderSnapshot } from '../providers/borders';
import { PaymentError, type PaymentService } from '../payments/service';
import { describePublishers } from '../data/publishers';
import type { PublisherDirectory } from '../providers/publisher-directory';
import { placeKindLabel, type PlaceNameIndex } from '../providers/place-names';

export interface ToolContext {
  repo: EventRepository;
  borders: HistoricalBordersProvider;
  payments: PaymentService;
  /** Where outlets outside the registry are based (GDELT's list); absent in some tests. */
  publishers?: PublisherDirectory;
  /** The globe's place names (highlight_place); absent in some tests. */
  places?: PlaceNameIndex;
  nowMs: number;
  /** The signed-in user's searches and opened events/countries; absent for guests. */
  activity?: (limit: number) => Promise<ActivityItem[]>;
  /** The user turned "AI reads my history" off in their AI settings. */
  activityOff?: boolean;
  /** Signed in (not a guest): account settings, AI settings and history exist. */
  signedIn?: boolean;
}

/** Panels that belong to an account; a guest gets the sign-in window instead. */
const ACCOUNT_PANELS = new Set(['account', 'ai_settings', 'history']);
const NEWS_FROM_MS = Date.UTC(2000, 0, 1);

export interface ActivityItem {
  kind: 'search' | 'event' | 'country';
  ref: string;
  title: string;
  detail: Record<string, unknown>;
  viewedAt: string;
}

/** One line per activity item, for the model (data, never instructions). */
export function activityLine(i: ActivityItem): string {
  const d = i.detail as {
    result?: { title?: string };
    eventKind?: string;
    place?: string;
    start?: string;
    end?: string | null;
  };
  const when = i.viewedAt.slice(0, 16).replace('T', ' ');
  if (i.kind === 'search')
    return `${when} searched "${i.title}"${d.result?.title ? ` → chose "${d.result.title}"` : ''}`;
  if (i.kind === 'country')
    return `${when} opened country ${i.title}${d.start ? ` (${d.start.slice(0, 4)}–${d.end ? d.end.slice(0, 4) : 'now'})` : ''}`;
  return `${when} opened ${d.eventKind === 'historical' ? 'historical event' : 'news event'} "${i.title}" (event_id ${i.ref}${d.place ? `, ${d.place}` : ''}${d.start ? `, ${d.start.slice(0, 10)}` : ''})`;
}

export interface CitationOut {
  title: string;
  url: string;
  publisher: string;
}

export interface ToolOutcome {
  ok: boolean;
  result: unknown;
  citations: CitationOut[];
  action?: ClientAction;
}

function eventBrief(e: EventSummary | WorldEvent) {
  return {
    id: e.id,
    title: e.title,
    kind: e.kind,
    demo: e.isDemo,
    date: formatTemporal(e.time),
    date_precision: precisionLabel(e.time),
    location: e.location.name,
    location_precision: e.location.precision,
    category: e.category,
  };
}

function wikiCitation(e: WorldEvent): CitationOut[] {
  if (e.isDemo) return [];
  return e.references.map((r) => ({ title: r.title, url: r.url, publisher: r.publisher }));
}

async function findActionOptions(ctx: ToolContext, budget?: number, eventId?: string) {
  const out: Array<{ event: WorldEvent; option: ActionOption }> = [];
  const candidates: WorldEvent[] = [];
  if (eventId) {
    const e = await ctx.repo.getEvent(eventId, ctx.nowMs);
    if (e && ctx.repo.actionOptions(e).length > 0) candidates.push(e);
  }
  if (candidates.length === 0) {
    const list = await ctx.repo.listEvents({
      mode: 'live',
      timeMs: ctx.nowMs,
      resolution: 'day',
      nowMs: ctx.nowMs,
      bbox: null,
      kinds: ['news'],
      includeDemo: true,
      limit: 200,
    });
    for (const s of list.events) {
      if (!s.hasTakeAction && !['disaster', 'humanitarian'].includes(s.category)) continue;
      const e = await ctx.repo.getEvent(s.id, ctx.nowMs);
      if (e) candidates.push(e);
    }
  }
  for (const e of candidates)
    for (const option of ctx.repo.actionOptions(e)) {
      if (budget !== undefined && option.minAmount > budget) continue;
      out.push({ event: e, option });
    }
  return out;
}

export async function runServerTool(
  name: ServerToolName,
  rawArgs: unknown,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const parsed = serverToolSchemas[name].safeParse(rawArgs ?? {});
  if (!parsed.success) {
    return {
      ok: false,
      result: { error: `Invalid arguments: ${parsed.error.issues[0]?.message ?? 'invalid'}` },
      citations: [],
    };
  }
  const citations: CitationOut[] = [];
  switch (name) {
    case 'search_events':
    case 'search_history': {
      const a = parsed.data as {
        query: string;
        from?: string;
        to?: string;
        limit: number;
        kind?: 'news' | 'historical' | 'any';
      };
      const kind = name === 'search_history' ? 'historical' : (a.kind ?? 'any');
      const window =
        a.from || a.to
          ? {
              startMs: a.from ? parseIso(a.from) : Number.NEGATIVE_INFINITY,
              endMs: a.to ? periodAt(parseIso(a.to), 'day').endMs : Number.POSITIVE_INFINITY,
            }
          : null;
      const results = await ctx.repo.search(a.query, {
        limit: 40,
        nowMs: ctx.nowMs,
        includeDemo: true,
        // News of the past (2000 on, from Wikipedia) too.
        includePast: kind !== 'historical',
        ...(window ? { window } : {}),
      });
      const out = [];
      for (const r of results) {
        if (r.type === 'NEWS' || r.type === 'HISTORY') {
          if (kind === 'news' && r.type !== 'NEWS') continue;
          if (kind === 'historical' && r.type !== 'HISTORY') continue;
          if (window && r.time && !intersects(temporalSpan(r.time), window)) continue;
          out.push({
            type: r.type,
            id: r.eventId,
            title: r.title,
            date: r.time ? formatTemporal(r.time) : null,
            location: r.subtitle,
            demo: r.isDemo,
          });
        } else if (kind === 'any') {
          out.push({ type: r.type, id: r.id, title: r.title, subtitle: r.subtitle ?? null });
        }
        if (out.length >= a.limit) break;
      }
      return {
        ok: true,
        result: {
          results: out,
          note: out.length === 0 ? 'No matching events in the WorldLens dataset.' : undefined,
        },
        citations,
      };
    }
    case 'get_event': {
      const e = await ctx.repo.getEvent((parsed.data as { event_id: string }).event_id, ctx.nowMs);
      if (!e) return { ok: false, result: { error: 'Event not found' }, citations };
      citations.push(...wikiCitation(e));
      return {
        ok: true,
        result: {
          ...eventBrief(e),
          summary: e.summary ?? null,
          why_it_matters: e.whyItMatters ?? null,
          participants: e.participants.map((p) => p.name),
          references: e.references.map((r) => r.url),
          article_count: e.articleCount,
          source_count: e.sourceCount,
          has_take_action: e.hasTakeAction,
          confidence: e.confidence,
          provenance: e.provenance,
          demo_notice: e.isDemo ? 'SYNTHETIC DEMO SCENARIO — not real reporting.' : undefined,
        },
        citations,
      };
    }
    case 'get_event_sources': {
      const id = (parsed.data as { event_id: string }).event_id;
      const e = await ctx.repo.getEvent(id, ctx.nowMs);
      if (!e) return { ok: false, result: { error: 'Event not found' }, citations };
      const articles = await ctx.repo.getArticles(id, ctx.nowMs);
      const { sources, places } = await describePublishers(
        await ctx.repo.getSources(articles.map((a) => a.sourceId)),
        ctx.publishers,
      );
      const byId = new Map(sources.map((s) => [s.id, s]));
      for (const a of articles) {
        if (!a.isDemo)
          citations.push({
            title: a.headline,
            url: a.url,
            publisher: byId.get(a.sourceId)?.name ?? 'Unknown',
          });
      }
      return {
        ok: true,
        result: {
          demo: e.isDemo,
          articles: articles.map((a) => ({
            headline: a.headline,
            snippet: a.snippet ?? null,
            publisher: byId.get(a.sourceId)?.name ?? a.sourceId,
            source_id: a.sourceId,
            published: a.publishedAt,
            url: a.isDemo ? null : a.url,
          })),
          publishers: sources.map((s) => ({
            id: s.id,
            name: s.name,
            domain: s.domain,
            country: s.country,
            // Where it is based, and how WorldLens knows (registry, Wikidata, the feed, GDELT 2018).
            based_in: places[s.id]
              ? { country: places[s.id]!.name, basis: places[s.id]!.basis }
              : null,
            type: s.sourceType,
            kind: s.format ?? null,
            ownership: s.ownership,
            national_perspective: s.nationalPerspective,
            political_rating: s.rating.value,
            // Where a rating comes from, in its own words, and how sure it is.
            rating_source: s.rating.source,
            rating_words: s.rating.statement ?? null,
            rating_confidence: s.rating.confidence,
            rating_is_illustrative: s.rating.illustrative,
            rating_methodology: s.rating.methodology,
          })),
        },
        citations,
      };
    }
    case 'get_historical_context': {
      const id = (parsed.data as { event_id: string }).event_id;
      const related = await ctx.repo.getRelated(id, ctx.nowMs);
      return {
        ok: true,
        result: {
          related: related.map((r) => ({
            ...eventBrief(r.event),
            relation: r.direction === 'out' ? r.relation.type : `inverse of ${r.relation.type}`,
            confidence: r.relation.confidence,
            notes: r.relation.notes ?? null,
            source: r.relation.source,
          })),
          note: 'Relations indicate relevant context; they do not assert strict causation unless typed LED_TO.',
        },
        citations,
      };
    }
    case 'get_border_at_date': {
      const a = parsed.data as { date: string; entity?: string };
      const ms = parseIso(a.date);
      if (isBeforeNavigable(ms))
        return { ok: false, result: { error: TEMPORAL_CONFIG.comingSoonLabel }, citations };
      const sel = selectBorderSnapshot(ms);
      let matches: string[] | undefined;
      let fetchError: string | undefined;
      if (sel.available && a.entity) {
        const needle = normalizeText(a.entity);
        if (sel.source === 'historical-basemaps' && sel.snapshotYear !== null) {
          try {
            const feats = await ctx.borders.snapshot(sel.snapshotYear, 'low');
            matches = [
              ...new Set(
                feats
                  .map((f) => f.properties.name)
                  .filter((n) => normalizeText(n).includes(needle)),
              ),
            ].slice(0, 10);
          } catch {
            fetchError = 'Border dataset could not be loaded right now.';
          }
        } else {
          const c = findCountry(a.entity);
          matches = c ? [c.name] : [];
        }
      }
      return {
        ok: true,
        result: {
          ...sel,
          ...(matches ? { matching_polities: matches } : {}),
          ...(fetchError ? { fetch_error: fetchError } : {}),
        },
        citations,
      };
    }
    case 'get_frontline_at_date': {
      const a = parsed.data as { date: string; conflict_id?: string };
      const ms = parseIso(a.date);
      const lines = await ctx.repo.frontlinesAt(ms, a.conflict_id);
      // Fronts of past wars, reconstructed for this moment from when places changed hands.
      const fronts = frontBriefs(ms, a.conflict_id).map(({ sources, ...f }) => ({
        ...f,
        sources: sources.slice(0, 3),
      }));
      // Countries held whole by another on this date (no front to draw): painted on the map.
      const occupations = occupationBriefs(ms, a.conflict_id);
      return {
        ok: true,
        result:
          lines.length === 0 && fronts.length === 0 && occupations.length === 0
            ? {
                available: false,
                reason:
                  'No front line or control line is loaded for this date. WorldLens does not invent frontlines.',
                // What exists, so another date or war can be offered.
                reconstructed_fronts_exist_for: frontTheatreList(a.conflict_id),
              }
            : {
                available: true,
                ...(occupations.length ? { occupations_in_force: occupations } : {}),
                ...(fronts.length
                  ? {
                      fronts,
                      fronts_note:
                        'These fronts are reconstructions, not surveyed lines: say "approximately" and name places, not exact courses.',
                    }
                  : {}),
                lines: lines.map((l) => ({
                  id: l.id,
                  name: l.name,
                  valid_from: l.validFrom,
                  valid_to: l.validTo,
                  certainty: l.certainty,
                  side_a: l.sideA,
                  side_b: l.sideB,
                  confidence: l.confidence,
                  source: l.source,
                })),
              },
        citations,
      };
    }
    case 'compare_dates': {
      const a = parsed.data as { date_a: string; date_b: string; region?: string };
      const side = async (iso: string) => {
        const ms = parseIso(iso);
        const list = await ctx.repo.listEvents({
          mode: 'historical',
          timeMs: ms,
          resolution: 'year',
          nowMs: ctx.nowMs,
          bbox: null,
          kinds: ['historical', 'news'],
          includeDemo: false,
          limit: 100,
        });
        const needle = a.region ? normalizeText(a.region) : null;
        const country = a.region ? findCountry(a.region) : null;
        const events = list.events
          .filter(
            (e) =>
              !needle ||
              normalizeText(`${e.title} ${e.location.name}`).includes(needle) ||
              (country && e.location.countryCode === country.iso3),
          )
          .slice(0, 6)
          .map(eventBrief);
        return { date: iso, year: yearOf(ms), events, borders: selectBorderSnapshot(ms) };
      };
      return { ok: true, result: { a: await side(a.date_a), b: await side(a.date_b) }, citations };
    }
    case 'compare_frontlines': {
      const a = parsed.data as { conflict_id: string; date_a: string; date_b: string };
      const [msA, msB] = [parseIso(a.date_a), parseIso(a.date_b)];
      const [la, lb] = await Promise.all([
        ctx.repo.frontlinesAt(msA, a.conflict_id),
        ctx.repo.frontlinesAt(msB, a.conflict_id),
      ]);
      const known = CONFLICTS.find((c) => c.id === a.conflict_id);
      // Reconstructed fronts: what changed hands between the two dates.
      const [dayA, dayB] = [dayNumber(msA), dayNumber(msB)];
      const fronts = FRONT_THEATRES.filter(
        (t) => t.conflictId === a.conflict_id && (theatreActive(t, dayA) || theatreActive(t, dayB)),
      ).map((t) => {
        const { toA, toB } = changesBetween(t, Math.min(dayA, dayB), Math.max(dayA, dayB));
        return {
          name: t.name,
          certainty: 'RECONSTRUCTED',
          [`taken_by_${t.sideA}`]: toA.slice(0, 120),
          [`taken_by_${t.sideB}`]: toB.slice(0, 120),
          places_that_changed_hands: toA.length + toB.length,
        };
      });
      const names = (list: typeof la, ms: number) => {
        const all = [
          ...list.map((l) => l.name),
          ...frontBriefs(ms, a.conflict_id).map((f) => `${f.name} (reconstructed)`),
        ];
        return all.length ? all : 'unavailable';
      };
      return {
        ok: true,
        result: {
          conflict: known?.name ?? a.conflict_id,
          a: names(la, msA),
          b: names(lb, msB),
          ...(fronts.length ? { fronts_between_the_dates: fronts } : {}),
          note: 'Reconstructed fronts are approximate: exact where a listed place changed hands, interpolated in between. Ceasefire lines compare only where dated geometry exists for both dates.',
        },
        citations,
      };
    }
    case 'find_action_options': {
      const a = parsed.data as { budget_usd?: number; event_id?: string };
      const found = await findActionOptions(ctx, a.budget_usd, a.event_id);
      return {
        ok: true,
        result: {
          sandbox_notice:
            'All options are PayPal SANDBOX demonstrations. No real money is transferred and no real charity receives funds.',
          options: found.map(({ event, option }) => ({
            option_id: option.id,
            event_id: event.id,
            event_title: event.title,
            event_is_demo: event.isDemo,
            title: option.title,
            purpose: option.purpose,
            payee: option.beneficiary.name,
            payee_disclosure: option.beneficiary.disclosure,
            suggested_amounts_usd: option.suggestedAmounts.filter(
              (x) => a.budget_usd === undefined || x <= a.budget_usd,
            ),
            min_usd: option.minAmount,
            max_usd: option.maxAmount,
            informational_links: option.informationalLinks.map((l) => `${l.name}: ${l.url}`),
          })),
        },
        citations,
      };
    }
    case 'list_events': {
      const a = parsed.data as {
        date: string;
        span?: 'day' | 'month' | 'year' | 'decade';
        kind: 'news' | 'historical' | 'any';
        limit: number;
      };
      const ms = parseIso(a.date);
      if (isBeforeNavigable(ms))
        return {
          ok: false,
          result: {
            error: `${TEMPORAL_CONFIG.comingSoonLabel}. The earliest year is ${TEMPORAL_CONFIG.minNavigableYear}.`,
          },
          citations,
        };
      if (ms > ctx.nowMs)
        return { ok: false, result: { error: 'That date is in the future.' }, citations };
      const span =
        a.span ??
        (/^\d{4}-\d{2}-\d{2}/.test(a.date)
          ? 'day'
          : /^\d{4}-\d{2}$/.test(a.date)
            ? 'month'
            : 'year');
      const list = await ctx.repo.listEvents({
        mode: 'historical',
        timeMs: ms,
        resolution: span,
        nowMs: ctx.nowMs,
        bbox: null,
        kinds: a.kind === 'any' ? ['historical', 'news'] : [a.kind],
        includeDemo: false,
        limit: a.limit,
      });
      const period = periodAt(ms, span);
      const noNews = a.kind === 'news' && period.endMs <= NEWS_FROM_MS;
      return {
        ok: true,
        result: {
          period: { from: toIso(period.startMs), to: toIso(period.endMs), span },
          events: list.events.map(eventBrief),
          total: list.total,
          note:
            list.events.length > 0
              ? undefined
              : noNews
                ? 'News starts in 2000; before that WorldLens has historical events only.'
                : 'Nothing in WorldLens for this period.',
        },
        citations,
      };
    }
    case 'get_my_activity': {
      const a = parsed.data as { query?: string; kind: string; limit: number };
      if (!ctx.activity)
        return {
          ok: true,
          result: ctx.activityOff
            ? { signed_in: true, reading_history_off: true, items: [] }
            : { signed_in: false, items: [] },
          citations,
        };
      const q = a.query?.trim().toLowerCase();
      const items = (await ctx.activity(200))
        .filter((i) => a.kind === 'any' || i.kind === a.kind)
        .filter((i) => !q || activityLine(i).toLowerCase().includes(q))
        .slice(0, a.limit);
      return { ok: true, result: { signed_in: true, items: items.map(activityLine) }, citations };
    }
    case 'get_payment_status': {
      try {
        const rec = await ctx.payments.refresh((parsed.data as { payment_id: string }).payment_id);
        return {
          ok: true,
          result: {
            state: rec.state,
            amount: rec.amount,
            currency: rec.currency,
            environment: rec.environment,
            capture_id: rec.captureId,
            verified_by: 'PayPal Orders API (server-side GET)',
            success: rec.state === 'CAPTURED',
          },
          citations,
        };
      } catch (err) {
        return {
          ok: false,
          // Only our own, user-facing payment errors are passed on (to the model and the public
          // tool trace); anything else may be a driver message with internal details.
          result: {
            error:
              err instanceof PaymentError
                ? err.message
                : 'Payment status is unavailable right now. Do not assume the payment succeeded.',
          },
          citations,
        };
      }
    }
  }
}

/** Validate a client tool call and resolve it into a concrete action for the browser. */
export async function prepareClientAction(
  name: string,
  rawArgs: unknown,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  if (!isClientTool(name))
    return { ok: false, result: { error: `Unknown tool ${name}` }, citations: [] };
  const parsed = clientToolSchemas[name].safeParse(rawArgs ?? {});
  if (!parsed.success) {
    return {
      ok: false,
      result: { error: `Invalid arguments: ${parsed.error.issues[0]?.message ?? 'invalid'}` },
      citations: [],
    };
  }
  const queued = (action: ClientAction, detail: Record<string, unknown> = {}): ToolOutcome => ({
    ok: true,
    result: { status: 'queued for the user’s globe', ...detail },
    citations: [],
    action,
  });
  switch (name) {
    case 'fly_to': {
      const a = parsed.data as {
        place?: string;
        lat?: number;
        lon?: number;
        altitude_km?: number;
        label?: string;
      };
      if (a.lat !== undefined && a.lon !== undefined) return queued({ tool: 'fly_to', args: a });
      const r = resolvePlace(a.place!);
      if (!r)
        return {
          ok: false,
          result: {
            error: `Unknown place "${a.place}". Try a country, city or sea name, or give coordinates.`,
          },
          citations: [],
        };
      return queued(
        {
          tool: 'fly_to',
          args: {
            lat: r.lat,
            lon: r.lon,
            altitude_km: a.altitude_km ?? r.altitudeM / 1000,
            label: a.label ?? r.name,
          },
        },
        { resolved: r.name },
      );
    }
    case 'set_time': {
      const a = parsed.data as {
        date: string;
        resolution?: 'century' | 'decade' | 'year' | 'month' | 'day' | 'hour';
      };
      const ms = parseIso(a.date);
      if (isBeforeNavigable(ms)) {
        return {
          ok: false,
          result: {
            error: `${TEMPORAL_CONFIG.comingSoonLabel}. The earliest navigable year is ${TEMPORAL_CONFIG.minNavigableYear}.`,
          },
          citations: [],
        };
      }
      if (ms > ctx.nowMs)
        return {
          ok: false,
          result: { error: 'Cannot navigate to the future. Use return_to_live for the present.' },
          citations: [],
        };
      return queued({ tool: 'set_time', args: a });
    }
    case 'return_to_live':
      return queued({ tool: 'return_to_live', args: {} });
    // Relative to the user's current view, applied in the browser (camera state lives there).
    case 'zoom':
      return queued({ tool: 'zoom', args: parsed.data as { direction: 'in' | 'out' } });
    case 'pan':
      return queued({ tool: 'pan', args: parsed.data as { direction: 'north' } });
    case 'highlight_region': {
      const a = parsed.data as { country: string };
      if (normalizeText(a.country) === 'none')
        return queued({ tool: 'highlight_region', args: { country: 'none' } });
      const c = findCountry(a.country);
      if (!c)
        return {
          ok: false,
          result: { error: `Unknown modern country "${a.country}"` },
          citations: [],
        };
      return queued({ tool: 'highlight_region', args: { country: c.iso3 } }, { resolved: c.name });
    }
    case 'highlight_place': {
      const a = parsed.data as { name: string; kind: PlaceGroup | 'any' };
      if (normalizeText(a.name) === 'none')
        return queued({ tool: 'highlight_place', args: { name: 'none', kind: 'any' } });
      const found = ctx.places ? await ctx.places.find(a.name, a.kind) : null;
      if (found === null)
        return {
          ok: false,
          result: { error: 'The map of place names is unavailable right now.' },
          citations: [],
        };
      const p = found[0];
      if (!p)
        return {
          ok: false,
          result: {
            error: `No ${a.kind === 'any' ? 'place' : a.kind} named "${a.name}" on WorldLens's map. Use highlight_region for countries, or fly_to for other places.`,
          },
          citations: [],
        };
      return queued(
        { tool: 'highlight_place', args: { name: p.name, kind: a.kind, id: p.id } },
        {
          resolved: `${p.name} (${placeKindLabel(p)})`,
          lat: p.lat,
          lon: p.lon,
          note: 'Marked on the globe, which flies there.',
        },
      );
    }
    case 'show_events':
      return queued({
        tool: 'show_events',
        args: parsed.data as ClientAction['args'],
      } as ClientAction);
    case 'toggle_layer':
      return queued({
        tool: 'toggle_layer',
        args: parsed.data as { layer: 'news'; enabled: boolean },
      });
    case 'open_event': {
      const a = parsed.data as { event_id: string };
      const e = await ctx.repo.getEvent(a.event_id, ctx.nowMs);
      if (!e) return { ok: false, result: { error: 'Event not found' }, citations: [] };
      return queued({ tool: 'open_event', args: a }, { title: e.title });
    }
    case 'set_display':
      return queued({ tool: 'set_display', args: parsed.data as { quality?: 'auto' } });
    // Countries of the day (OpenHistoricalMap) are matched in the browser, where their data is.
    case 'open_country':
      return queued({ tool: 'open_country', args: parsed.data as { name: string } });
    case 'set_ai_settings': {
      const a = parsed.data as {
        remember_chats?: boolean;
        read_history?: boolean;
        agent_mode?: boolean;
      };
      if ((a.remember_chats !== undefined || a.read_history !== undefined) && !ctx.signedIn)
        return {
          ok: false,
          result: {
            error:
              'The user is a guest: remembering chats and reading history are settings of an account. Offer to open the sign-in window (open_panel sign_in).',
          },
          citations: [],
        };
      return queued(
        { tool: 'set_ai_settings', args: a },
        a.agent_mode === false
          ? {
              note: 'After this answer you are in Chat mode: you answer but no longer operate the app. The user switches back with Agent at the top of the chat.',
            }
          : {},
      );
    }
    case 'open_panel': {
      const a = parsed.data as { panel: string; section?: string };
      if (a.section && a.panel !== 'account')
        return {
          ok: false,
          result: { error: 'section is for panel "account" only' },
          citations: [],
        };
      if (ACCOUNT_PANELS.has(a.panel) && !ctx.signedIn)
        return queued(
          { tool: 'open_panel', args: { panel: 'sign_in' } },
          {
            note: 'The user is a guest (not signed in), so the sign-in window opened instead: guests have no account settings, AI settings or history.',
          },
        );
      return queued(
        { tool: 'open_panel', args: a as { panel: 'account' } },
        a.panel === 'account'
          ? {
              note: 'Opened and pointed only. The user types, confirms or deletes anything there themselves: guide them step by step if they need it. Never ask for their password, a code or their email address.',
            }
          : {},
      );
    }
    case 'play_timeline': {
      const a = parsed.data as { playing: boolean; from?: string };
      if (a.from) {
        const ms = parseIso(a.from);
        if (isBeforeNavigable(ms) || ms > ctx.nowMs)
          return {
            ok: false,
            result: {
              error: `Start between ${TEMPORAL_CONFIG.minNavigableYear} and today.`,
            },
            citations: [],
          };
      }
      return queued(
        { tool: 'play_timeline', args: parsed.data as { playing: boolean } },
        a.playing ? { note: 'It plays until LIVE, or until the user pauses or takes over.' } : {},
      );
    }
    case 'open_take_action': {
      const a = parsed.data as { event_id: string; action_option_id: string; amount_usd?: number };
      const e = await ctx.repo.getEvent(a.event_id, ctx.nowMs);
      const options = e ? ctx.repo.actionOptions(e) : [];
      const opt = options.find((o) => o.id === a.action_option_id);
      if (!e || !opt)
        return {
          ok: false,
          result: { error: 'That action is not available for that event.' },
          citations: [],
        };
      const amount =
        a.amount_usd !== undefined
          ? Math.min(opt.maxAmount, Math.max(opt.minAmount, a.amount_usd))
          : undefined;
      return queued(
        {
          tool: 'open_take_action',
          args: { ...a, ...(amount !== undefined ? { amount_usd: amount } : {}) },
        },
        {
          note: 'Only the review screen was opened. The user must confirm and approve in PayPal; no payment has been made.',
        },
      );
    }
  }
  return { ok: false, result: { error: 'Unhandled tool' }, citations: [] };
}

export function isKnownTool(name: string): boolean {
  return isServerTool(name) || isClientTool(name);
}
