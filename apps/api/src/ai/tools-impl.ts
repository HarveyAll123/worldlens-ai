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
  yearOf,
  type ActionOption,
  type ClientAction,
  type EventSummary,
  type ServerToolName,
  type WorldEvent,
} from '@worldlens/shared';
import { CONFLICTS } from '@worldlens/shared/data';
import { findCountry, resolvePlace } from '@worldlens/shared/geo-data';
import type { EventRepository } from '../data/repository';
import type { HistoricalBordersProvider } from '../providers/borders';
import { selectBorderSnapshot } from '../providers/borders';
import type { PaymentService } from '../payments/service';

export interface ToolContext {
  repo: EventRepository;
  borders: HistoricalBordersProvider;
  payments: PaymentService;
  nowMs: number;
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
  return e.references
    .filter((r) => !e.isDemo)
    .map((r) => ({ title: r.title, url: r.url, publisher: r.publisher }));
}

async function findActionOptions(ctx: ToolContext, budget?: number, eventId?: string) {
  const out: Array<{ event: WorldEvent; option: ActionOption }> = [];
  const candidates: WorldEvent[] = [];
  if (eventId) {
    const e = await ctx.repo.getEvent(eventId, ctx.nowMs);
    if (e) candidates.push(e);
  } else {
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

export async function runServerTool(name: ServerToolName, rawArgs: unknown, ctx: ToolContext): Promise<ToolOutcome> {
  const parsed = serverToolSchemas[name].safeParse(rawArgs ?? {});
  if (!parsed.success) {
    return { ok: false, result: { error: `Invalid arguments: ${parsed.error.issues[0]?.message ?? 'invalid'}` }, citations: [] };
  }
  const citations: CitationOut[] = [];
  switch (name) {
    case 'search_events':
    case 'search_history': {
      const a = parsed.data as { query: string; from?: string; to?: string; limit: number; kind?: 'news' | 'historical' | 'any' };
      const kind = name === 'search_history' ? 'historical' : (a.kind ?? 'any');
      const window =
        a.from || a.to
          ? { startMs: a.from ? parseIso(a.from) : Number.NEGATIVE_INFINITY, endMs: a.to ? periodAt(parseIso(a.to), 'day').endMs : Number.POSITIVE_INFINITY }
          : null;
      const results = await ctx.repo.search(a.query, { limit: 40, nowMs: ctx.nowMs, includeDemo: true });
      const out = [];
      for (const r of results) {
        if (r.type === 'NEWS' || r.type === 'HISTORY') {
          if (kind === 'news' && r.type !== 'NEWS') continue;
          if (kind === 'historical' && r.type !== 'HISTORY') continue;
          if (window && r.time && !intersects(temporalSpan(r.time), window)) continue;
          out.push({ type: r.type, id: r.eventId, title: r.title, date: r.time ? formatTemporal(r.time) : null, location: r.subtitle, demo: r.isDemo });
        } else if (kind === 'any') {
          out.push({ type: r.type, id: r.id, title: r.title, subtitle: r.subtitle ?? null });
        }
        if (out.length >= a.limit) break;
      }
      return { ok: true, result: { results: out, note: out.length === 0 ? 'No matching events in the WorldLens dataset.' : undefined }, citations };
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
      const sources = await ctx.repo.getSources(articles.map((a) => a.sourceId));
      const byId = new Map(sources.map((s) => [s.id, s]));
      for (const a of articles) {
        if (!a.isDemo) citations.push({ title: a.headline, url: a.url, publisher: byId.get(a.sourceId)?.name ?? 'Unknown' });
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
            country: s.country,
            type: s.sourceType,
            national_perspective: s.nationalPerspective,
            political_rating: s.rating.value,
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
      if (isBeforeNavigable(ms)) return { ok: false, result: { error: TEMPORAL_CONFIG.comingSoonLabel }, citations };
      const sel = selectBorderSnapshot(ms);
      let matches: string[] | undefined;
      let fetchError: string | undefined;
      if (sel.available && a.entity) {
        const needle = normalizeText(a.entity);
        if (sel.source === 'historical-basemaps' && sel.snapshotYear !== null) {
          try {
            const feats = await ctx.borders.snapshot(sel.snapshotYear, 'low');
            matches = [...new Set(feats.map((f) => f.properties.name).filter((n) => normalizeText(n).includes(needle)))].slice(0, 10);
          } catch {
            fetchError = 'Border dataset could not be loaded right now.';
          }
        } else {
          const c = findCountry(a.entity);
          matches = c ? [c.name] : [];
        }
      }
      return { ok: true, result: { ...sel, ...(matches ? { matching_polities: matches } : {}), ...(fetchError ? { fetch_error: fetchError } : {}) }, citations };
    }
    case 'get_frontline_at_date': {
      const a = parsed.data as { date: string; conflict_id?: string };
      const lines = await ctx.repo.frontlinesAt(parseIso(a.date), a.conflict_id);
      return {
        ok: true,
        result:
          lines.length === 0
            ? { available: false, reason: 'No verified frontline or control-line geometry is loaded for this date. WorldLens does not invent frontlines.' }
            : { available: true, lines: lines.map((l) => ({ id: l.id, name: l.name, valid_from: l.validFrom, valid_to: l.validTo, certainty: l.certainty, side_a: l.sideA, side_b: l.sideB, confidence: l.confidence, source: l.source })) },
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
          .filter((e) => !needle || normalizeText(`${e.title} ${e.location.name}`).includes(needle) || (country && e.location.countryCode === country.iso3))
          .slice(0, 6)
          .map(eventBrief);
        return { date: iso, year: yearOf(ms), events, borders: selectBorderSnapshot(ms) };
      };
      return { ok: true, result: { a: await side(a.date_a), b: await side(a.date_b) }, citations };
    }
    case 'compare_frontlines': {
      const a = parsed.data as { conflict_id: string; date_a: string; date_b: string };
      const [la, lb] = await Promise.all([
        ctx.repo.frontlinesAt(parseIso(a.date_a), a.conflict_id),
        ctx.repo.frontlinesAt(parseIso(a.date_b), a.conflict_id),
      ]);
      const known = CONFLICTS.find((c) => c.id === a.conflict_id);
      return {
        ok: true,
        result: {
          conflict: known?.name ?? a.conflict_id,
          a: la.length ? la.map((l) => l.name) : 'unavailable',
          b: lb.length ? lb.map((l) => l.name) : 'unavailable',
          note: 'Frontline comparison is only possible where verified, dated geometry exists for both dates.',
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
          sandbox_notice: 'All options are PayPal SANDBOX demonstrations. No real money is transferred and no real charity receives funds.',
          options: found.map(({ event, option }) => ({
            option_id: option.id,
            event_id: event.id,
            event_title: event.title,
            event_is_demo: event.isDemo,
            title: option.title,
            purpose: option.purpose,
            payee: option.beneficiary.name,
            payee_disclosure: option.beneficiary.disclosure,
            suggested_amounts_usd: option.suggestedAmounts.filter((x) => a.budget_usd === undefined || x <= a.budget_usd),
            min_usd: option.minAmount,
            max_usd: option.maxAmount,
            informational_links: option.informationalLinks.map((l) => `${l.name}: ${l.url}`),
          })),
        },
        citations,
      };
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
        return { ok: false, result: { error: err instanceof Error ? err.message : 'Payment status unavailable' }, citations };
      }
    }
  }
}

/** Validate a client tool call and resolve it into a concrete action for the browser. */
export async function prepareClientAction(name: string, rawArgs: unknown, ctx: ToolContext): Promise<ToolOutcome> {
  if (!isClientTool(name)) return { ok: false, result: { error: `Unknown tool ${name}` }, citations: [] };
  const parsed = clientToolSchemas[name].safeParse(rawArgs ?? {});
  if (!parsed.success) {
    return { ok: false, result: { error: `Invalid arguments: ${parsed.error.issues[0]?.message ?? 'invalid'}` }, citations: [] };
  }
  const queued = (action: ClientAction, detail: Record<string, unknown> = {}): ToolOutcome => ({
    ok: true,
    result: { status: 'queued for the user’s globe', ...detail },
    citations: [],
    action,
  });
  switch (name) {
    case 'fly_to': {
      const a = parsed.data as { place?: string; lat?: number; lon?: number; altitude_km?: number; label?: string };
      if (a.lat !== undefined && a.lon !== undefined) return queued({ tool: 'fly_to', args: a });
      const r = resolvePlace(a.place!);
      if (!r) return { ok: false, result: { error: `Unknown place "${a.place}". Try a country, city or sea name, or give coordinates.` }, citations: [] };
      return queued(
        { tool: 'fly_to', args: { lat: r.lat, lon: r.lon, altitude_km: a.altitude_km ?? r.altitudeM / 1000, label: a.label ?? r.name } },
        { resolved: r.name },
      );
    }
    case 'set_time': {
      const a = parsed.data as { date: string; resolution?: 'century' | 'decade' | 'year' | 'month' | 'day' | 'hour' };
      const ms = parseIso(a.date);
      if (isBeforeNavigable(ms)) {
        return { ok: false, result: { error: `${TEMPORAL_CONFIG.comingSoonLabel}. The earliest navigable year is ${TEMPORAL_CONFIG.minNavigableYear}.` }, citations: [] };
      }
      if (ms > ctx.nowMs) return { ok: false, result: { error: 'Cannot navigate to the future. Use return_to_live for the present.' }, citations: [] };
      return queued({ tool: 'set_time', args: a });
    }
    case 'return_to_live':
      return queued({ tool: 'return_to_live', args: {} });
    case 'highlight_region': {
      const a = parsed.data as { country: string };
      if (normalizeText(a.country) === 'none') return queued({ tool: 'highlight_region', args: { country: 'none' } });
      const c = findCountry(a.country);
      if (!c) return { ok: false, result: { error: `Unknown modern country "${a.country}"` }, citations: [] };
      return queued({ tool: 'highlight_region', args: { country: c.iso3 } }, { resolved: c.name });
    }
    case 'show_events':
      return queued({ tool: 'show_events', args: parsed.data as ClientAction['args'] } as ClientAction);
    case 'toggle_layer':
      return queued({ tool: 'toggle_layer', args: parsed.data as { layer: 'news'; enabled: boolean } });
    case 'open_event': {
      const a = parsed.data as { event_id: string };
      const e = await ctx.repo.getEvent(a.event_id, ctx.nowMs);
      if (!e) return { ok: false, result: { error: 'Event not found' }, citations: [] };
      return queued({ tool: 'open_event', args: a }, { title: e.title });
    }
    case 'open_take_action': {
      const a = parsed.data as { event_id: string; action_option_id: string; amount_usd?: number };
      const e = await ctx.repo.getEvent(a.event_id, ctx.nowMs);
      const options = e ? ctx.repo.actionOptions(e) : [];
      const opt = options.find((o) => o.id === a.action_option_id);
      if (!e || !opt) return { ok: false, result: { error: 'That action is not available for that event.' }, citations: [] };
      const amount = a.amount_usd !== undefined ? Math.min(opt.maxAmount, Math.max(opt.minAmount, a.amount_usd)) : undefined;
      return queued(
        { tool: 'open_take_action', args: { ...a, ...(amount !== undefined ? { amount_usd: amount } : {}) } },
        { note: 'Only the review screen was opened. The user must confirm and approve in PayPal; no payment has been made.' },
      );
    }
  }
  return { ok: false, result: { error: 'Unhandled tool' }, citations: [] };
}

export function isKnownTool(name: string): boolean {
  return isServerTool(name) || isClientTool(name);
}
