/**
 * Offline assistant — deterministic intent handling used when no AI provider is configured,
 * the daily budget is exhausted, or the provider fails. It drives the same validated tool
 * layer as the AI agent, so the globe behaves the same way; it simply cannot reason freely.
 */
import {
  extractYears,
  formatTemporal,
  haversineKm,
  normalizeText,
  type ClientAction,
  type WorldEvent,
} from '@worldlens/shared';
import { findCountry, resolvePlace } from '@worldlens/shared/geo-data';
import type { ChatRequest, ChatResponse, ToolTraceEntry } from './agent';
import {
  prepareClientAction,
  runServerTool,
  type CitationOut,
  type ToolContext,
} from './tools-impl';

const NOTICE =
  'Offline assistant (rule-based): the AI model is unavailable, so answers come directly from WorldLens data.';

class Session {
  actions: ClientAction[] = [];
  citations: CitationOut[] = [];
  trace: ToolTraceEntry[] = [];
  constructor(readonly ctx: ToolContext) {}

  async client(tool: string, args: Record<string, unknown>): Promise<boolean> {
    const o = await prepareClientAction(tool, args, this.ctx);
    this.trace.push({
      tool,
      ok: o.ok,
      kind: 'client',
      summary: JSON.stringify(o.result).slice(0, 140),
    });
    if (o.action) this.actions.push(o.action);
    return o.ok;
  }

  async server<T = Record<string, unknown>>(
    tool: Parameters<typeof runServerTool>[0],
    args: Record<string, unknown>,
  ): Promise<T | null> {
    const o = await runServerTool(tool, args, this.ctx);
    this.trace.push({
      tool,
      ok: o.ok,
      kind: 'server',
      summary: JSON.stringify(o.result).slice(0, 140),
    });
    this.citations.push(...o.citations);
    return o.ok ? (o.result as T) : null;
  }

  done(reply: string): ChatResponse {
    const seen = new Set<string>();
    return {
      mode: 'offline',
      reply,
      actions: this.actions,
      citations: this.citations
        .filter((c) => (seen.has(c.url) ? false : (seen.add(c.url), true)))
        .slice(0, 10),
      toolTrace: this.trace,
      notice: NOTICE,
    };
  }
}

const demoTag = (e: { isDemo?: boolean; demo?: boolean }) => (e.isDemo || e.demo ? ' [DEMO]' : '');

function placeAfter(text: string, words: string[]): string | null {
  const re = new RegExp(
    `\\b(?:${words.join('|')})\\s+(?:the\\s+)?([a-z][a-z .'-]{1,60}?)(?:\\s+(?:in|during|between|from|on|around)\\b.*)?[?.!]*$`,
    'i',
  );
  const m = re.exec(text.trim());
  return m?.[1]?.trim() ?? null;
}

export async function runOfflineAssistant(
  req: ChatRequest,
  ctx: ToolContext,
): Promise<ChatResponse> {
  const s = new Session(ctx);
  const text = req.messages[req.messages.length - 1]!.content.trim();
  const lower = text.toLowerCase();
  const years = extractYears(text);

  // 1. "I have $20. How can I help?"
  const money = /\$\s?(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s?(?:usd|dollars?)\b/i.exec(text);
  if (money || /\b(how can i help|donate|donation|contribute|take action)\b/i.test(lower)) {
    const budget = money ? Number(money[1] ?? money[2]) : undefined;
    const found = await s.server<{ options: Array<Record<string, unknown>> }>(
      'find_action_options',
      {
        ...(budget ? { budget_usd: budget } : {}),
        ...(req.context.selectedEventId ? { event_id: req.context.selectedEventId } : {}),
      },
    );
    const options = found?.options ?? [];
    if (options.length === 0) {
      return s.done(
        'There are no Take Action options for the current events. Take Action appears only on humanitarian events (all PayPal sandbox demos).',
      );
    }
    const first = options[0]!;
    const amounts = (first.suggested_amounts_usd as number[]) ?? [];
    const amount = budget ?? amounts[amounts.length - 1] ?? (first.min_usd as number);
    await s.client('open_event', { event_id: first.event_id as string });
    await s.client('open_take_action', {
      event_id: first.event_id as string,
      action_option_id: first.option_id as string,
      amount_usd: amount,
    });
    const lines = options
      .slice(0, 4)
      .map(
        (o) => `• ${o.title} — for “${o.event_title}”${o.event_is_demo ? ' [DEMO scenario]' : ''}`,
      );
    return s.done(
      [
        'Here are the Take Action options I found:',
        ...lines,
        '',
        `I opened the review screen for the first one${budget ? ` with $${amount.toFixed(2)}` : ''}. These are PayPal SANDBOX demos: no real money moves, and the payee is a demo merchant, not a charity. Nothing is paid until you review the details and approve it in PayPal yourself.`,
      ].join('\n'),
    );
  }

  // 2. Return to live.
  if (/^(live|go live)$|\b(back|return|go)\b.*\b(live|present|today|now)\b/i.test(lower)) {
    await s.client('return_to_live', {});
    return s.done(
      'Back to LIVE. The globe now shows current events (demo scenarios are labelled DEMO).',
    );
  }

  // 4. Territorial changes of a country between two years.
  if (years.length >= 2 || /\b(territor|border|annex)/i.test(lower)) {
    const country = findCountryInText(text);
    if (country && years.length >= 1) {
      const y1 = Math.min(...years);
      const y2 = Math.max(...years);
      await s.client('set_time', { date: String(y1), resolution: 'year' });
      await s.client('fly_to', { place: country.name });
      await s.client('highlight_region', { country: country.iso3 });
      await s.client('toggle_layer', { layer: 'borders', enabled: true });
      const hits = await s.server<{
        results: Array<{ id: string; title: string; date: string | null; type: string }>;
      }>('search_history', {
        query: country.name,
        from: String(y1),
        to: `${y2}-12-31`,
        limit: 12,
      });
      const events: WorldEvent[] = [];
      for (const r of hits?.results ?? []) {
        const e = await ctx.repo.getEvent(r.id, ctx.nowMs);
        if (e && (e.category === 'territorial' || e.tags.includes('territorial-change')))
          events.push(e);
      }
      events.sort((a, b) => a.time.start.localeCompare(b.time.start));
      for (const e of events.slice(0, 8)) {
        await s.client('set_time', { date: e.time.start, resolution: 'day' });
        await s.client('open_event', { event_id: e.id });
      }
      const ba = await s.server<Record<string, unknown>>('get_border_at_date', {
        date: String(y1),
        entity: country.name,
      });
      const bb = await s.server<Record<string, unknown>>('get_border_at_date', {
        date: String(y2),
        entity: country.name,
      });
      const border = (b: Record<string, unknown> | null, y: number) =>
        !b
          ? `${y}: border data unavailable.`
          : b.available
            ? `${y}: ${b.note as string}`
            : `${y}: ${b.reason as string}`;
      for (const e of events)
        s.citations.push(
          ...e.references.map((r) => ({ title: r.title, url: r.url, publisher: r.publisher })),
        );
      return s.done(
        [
          `Territorial changes involving ${country.name}, ${y1}–${y2} (from WorldLens’s curated events):`,
          ...(events.length
            ? events.map((e) => `• ${formatTemporal(e.time)} — ${e.title}`)
            : ['• No curated territorial events found for that range.']),
          '',
          'Border geometry:',
          `• ${border(ba, y1)}`,
          `• ${border(bb, y2)}`,
          '',
          'I’ve highlighted the modern outline and turned on the borders layer; the timeline will step through the events.',
        ].join('\n'),
      );
    }
  }

  // 3. "Why does this matter historically?" / historical context for the selected event.
  if (
    /\b(why does (this|it) matter|historical context|historically|context|background|then and now|led to (this|it))\b/i.test(
      lower,
    )
  ) {
    const id = req.context.selectedEventId;
    if (!id)
      return s.done(
        'Select an event first, then ask again and I will walk through its historical context.',
      );
    const ev = await s.server<{ title: string; demo?: boolean }>('get_event', { event_id: id });
    const ctxRes = await s.server<{ related: Array<Record<string, unknown>> }>(
      'get_historical_context',
      { event_id: id },
    );
    const related = (ctxRes?.related ?? []).slice(0, 5);
    if (related.length === 0)
      return s.done(`WorldLens has no linked historical context for “${ev?.title ?? id}” yet.`);
    for (const r of related) {
      const e = await ctx.repo.getEvent(r.id as string, ctx.nowMs);
      if (!e) continue;
      await s.client('set_time', {
        date: e.time.start,
        resolution: e.time.precision === 'minute' ? 'hour' : e.time.precision,
      });
      await s.client('fly_to', {
        lat: e.location.lat,
        lon: e.location.lon,
        altitude_km: e.location.precision === 'city' ? 600 : 1500,
      });
      await s.client('open_event', { event_id: e.id });
    }
    const lines = related.map(
      (r) =>
        `• ${r.date} — ${r.title}${demoTag(r)} (${String(r.relation).toLowerCase().replace(/_/g, ' ')}, confidence ${r.confidence})${r.notes ? `: ${r.notes}` : ''}`,
    );
    return s.done(
      [
        `Historical context for “${ev?.title ?? id}”${ev?.demo ? ' [DEMO scenario]' : ''}:`,
        ...lines,
        '',
        'I’m stepping the globe and timeline through these. Links show relevant context, not proven causation.',
      ].join('\n'),
    );
  }

  // 5. "What is happening near/in X?"
  const near = /\b(happening|going on|news|latest)\b/i.test(lower)
    ? placeAfter(text, ['near', 'in', 'around', 'at', 'about', 'from'])
    : null;
  if (near) {
    const place = resolvePlace(near);
    if (!place) return s.done(`I couldn’t find a place called “${near}”.`);
    await s.client('return_to_live', {});
    await s.client('fly_to', {
      lat: place.lat,
      lon: place.lon,
      altitude_km: Math.max(800, place.altitudeM / 1000),
      label: place.name,
    });
    await s.client('show_events', { kind: 'news' });
    const live = await ctx.repo.listEvents({
      mode: 'live',
      timeMs: ctx.nowMs,
      resolution: 'day',
      nowMs: ctx.nowMs,
      bbox: null,
      kinds: ['news'],
      includeDemo: true,
      limit: 300,
    });
    const nearby = live.events
      .map((e) => ({ e, d: haversineKm(place.lat, place.lon, e.location.lat, e.location.lon) }))
      .filter((x) => x.d <= 1500)
      .sort((a, b) => a.d - b.d)
      .slice(0, 5);
    if (nearby.length === 0)
      return s.done(
        `LIVE: no current events are clustered near ${place.name} in WorldLens right now.`,
      );
    await s.client('open_event', { event_id: nearby[0]!.e.id });
    return s.done(
      [
        `LIVE — events near ${place.name}:`,
        ...nearby.map(
          ({ e }) =>
            `• ${e.title}${e.isDemo && !e.title.startsWith('DEMO') ? ' [DEMO]' : ''} (${e.sourceCount} source${e.sourceCount === 1 ? '' : 's'})`,
        ),
        '',
        'I opened the closest one. Check “Source coverage” to see who reported what; demo items are synthetic.',
      ].join('\n'),
    );
  }

  // 6. Go to a place, optionally at a year ("Berlin 1945", "show me Waterloo").
  const results = await ctx.repo.search(text, { limit: 6, nowMs: ctx.nowMs, includeDemo: true });
  const top = results[0];
  if (top) {
    if (
      top.time &&
      (top.type === 'HISTORY' || top.type === 'CONFLICT' || (top.type === 'PLACE' && years.length))
    ) {
      await s.client('set_time', {
        date: top.time.start,
        resolution:
          top.type === 'HISTORY'
            ? top.time.precision === 'minute'
              ? 'hour'
              : top.time.precision
            : 'year',
      });
    } else if (top.type === 'NEWS') {
      await s.client('return_to_live', {});
    }
    if (top.lat !== undefined && top.lon !== undefined) {
      await s.client('fly_to', {
        lat: top.lat,
        lon: top.lon,
        altitude_km: (top.altitude ?? 800_000) / 1000,
        label: top.title,
      });
    }
    const eventHit = results.find((r) => r.eventId);
    if (eventHit?.eventId) await s.client('open_event', { event_id: eventHit.eventId });
    return s.done(
      [
        'Here’s what I found:',
        ...results
          .slice(0, 4)
          .map(
            (r) =>
              `• ${r.type}: ${r.title}${r.subtitle ? ` — ${r.subtitle}` : ''}${r.isDemo ? ' [DEMO]' : ''}`,
          ),
      ].join('\n'),
    );
  }

  return s.done(
    'I couldn’t match that to WorldLens data. Try a place (“South China Sea”), an event (“Waterloo”), a place and year (“Berlin 1945”), “What is happening near Taiwan?”, or “I have $20. How can I help?”.',
  );
}

function findCountryInText(text: string) {
  const words = normalizeText(text.replace(/['\u2019]s\b/gi, '')).split(' ');
  for (let n = 3; n >= 1; n--)
    for (let i = 0; i + n <= words.length; i++) {
      const c = findCountry(words.slice(i, i + n).join(' '));
      if (c) return c;
    }
  return null;
}
