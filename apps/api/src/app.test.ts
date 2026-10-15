import { describe, expect, it } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { utcMs, type ClientAction } from '@worldlens/shared';
import { createApp } from './app';
import { createDeps } from './deps';
import type { Env } from './env';
import {
  AiUnavailableError,
  type AiProvider,
  type AiTurnRequest,
  type AiTurnResponse,
} from './ai/provider';
import { FakePayPal } from './testing/fake-paypal';
import { MemoryPaymentStore, type PaymentStore } from './payments/store';
import { redactSecrets } from './lib/redact';
import { classifyDatabaseUrl } from './data/sql';
import { describeDbError } from './data/postgres';
import { selectBorderSnapshot, HistoricalBordersProvider } from './providers/borders';
import { ProviderHealth } from './providers/health';
import { commonsFileFromUrl } from './providers/wikipedia';

const NOW = utcMs(2026, 10, 14, 11, 25, 42);
const offlineFetch = async () => new Response('offline', { status: 503 });

function setup(
  opts: {
    env?: Partial<Env>;
    ai?: AiProvider;
    paypal?: FakePayPal;
    paymentStore?: PaymentStore;
  } = {},
) {
  const paypal = opts.paypal;
  const env: Env = {
    GDELT_ENABLED: 'false',
    ...(paypal
      ? {
          PAYPAL_CLIENT_ID: 'test-client-id',
          PAYPAL_CLIENT_SECRET: 'test-secret',
          PAYPAL_WEBHOOK_ID: 'WH-TEST',
        }
      : {}),
    ...opts.env,
  };
  let n = 0;
  const deps = createDeps(env, {
    now: () => NOW,
    fetchImpl: paypal ? paypal.fetch : offlineFetch,
    ...(opts.ai ? { ai: opts.ai } : {}),
    ...(opts.paymentStore ? { paymentStore: opts.paymentStore } : {}),
    newId: () => `testid${String(++n).padStart(6, '0')}`,
  });
  const app = createApp(deps);
  const req = (path: string, init?: RequestInit) => app.request(path, init);
  const json = async <T = Record<string, unknown>>(path: string, init?: RequestInit) => {
    const r = await req(path, init);
    return { status: r.status, body: (await r.json()) as T, headers: r.headers };
  };
  const post = (path: string, body: unknown) =>
    json(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  return { app, deps, req, json, post };
}

const chat = (
  text: string,
  extra: Partial<{ selectedEventId: string | null; mode: 'live' | 'historical' }> = {},
) => ({
  messages: [{ role: 'user', content: text }],
  context: {
    mode: extra.mode ?? 'live',
    timeIso: '2026-10-14T11:25:42Z',
    resolution: 'day',
    selectedEventId: extra.selectedEventId ?? null,
    camera: { lat: 20, lon: 100, altitudeKm: 12000 },
  },
});

describe('health, config and security headers', () => {
  it('reports providers without leaking secrets', async () => {
    const { json } = setup({ paypal: new FakePayPal() });
    const { status, body, headers } = await json('/api/health');
    expect(status).toBe(200);
    expect(JSON.stringify(body)).not.toContain('test-secret');
    expect(headers.get('x-content-type-options')).toBe('nosniff');
    expect(headers.get('x-frame-options')).toBe('DENY');
    const cfg = await json<{ paypal: { clientId: string; environment: string } }>('/api/config');
    expect(cfg.body.paypal.clientId).toBe('test-client-id');
    expect(cfg.body.paypal.environment).toBe('sandbox');
  });
  it('only allows configured CORS origins', async () => {
    const { req } = setup();
    const ok = await req('/api/config', { headers: { Origin: 'http://localhost:5173' } });
    expect(ok.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    const bad = await req('/api/config', { headers: { Origin: 'https://evil.example' } });
    expect(bad.headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('events', () => {
  it('LIVE mode returns labelled demo events', async () => {
    const { json } = setup();
    const { body } = await json<{ events: Array<{ id: string; isDemo: boolean; title: string }> }>(
      '/api/events?mode=live',
    );
    expect(body.events.length).toBeGreaterThan(3);
    for (const e of body.events) if (e.isDemo) expect(e.title.startsWith('DEMO:')).toBe(true);
  });
  it('historical mode finds Waterloo on 18 June 1815 at day resolution', async () => {
    const { json } = setup();
    const { body } = await json<{ events: Array<{ id: string }>; finestPrecision: string }>(
      '/api/events?mode=historical&t=1815-06-18&res=day',
    );
    expect(body.events.map((e) => e.id)).toContain('hist-battle-of-waterloo');
    expect(body.finestPrecision).toBe('day');
  });
  it('includes Wikidata battles unless the battle layer is off', async () => {
    const { json } = setup();
    const url = '/api/events?mode=historical&t=1916-07-01&res=day';
    const on = await json<{ events: Array<{ id: string }> }>(url);
    expect(on.body.events.map((e) => e.id)).toContain('wd-Q132568'); // Battle of the Somme
    const off = await json<{ events: Array<{ id: string }> }>(`${url}&battles=0`);
    expect(off.body.events.some((e) => e.id.startsWith('wd-'))).toBe(false);
  });
  it('returns the ceasefire lines valid on a date', async () => {
    const { json } = setup();
    const ids = async (t: string) =>
      (
        await json<{ frontlines: Array<{ id: string }> }>(`/api/geo/frontlines?t=${t}`)
      ).body.frontlines.map((f) => f.id);
    expect(await ids('1949-01-01')).toEqual(['line-korea-38th-parallel-1945']);
    expect(await ids('1960-01-01')).toEqual(['line-korea-mdl-1953']);
    expect((await ids('2026-10-15')).sort()).toEqual([
      'line-cyprus-1974',
      'line-golan-1974',
      'line-kashmir-loc-1972',
      'line-korea-mdl-1953',
      'line-western-sahara-berm',
    ]);
  });
  it('rejects dates before 1800 (Coming Soon)', async () => {
    const { json } = setup();
    const { status, body } = await json<{ message: string }>(
      '/api/events?mode=historical&t=1750&res=year',
    );
    expect(status).toBe(400);
    expect(body.message).toBe('Before 1800 — Coming Soon');
  });
  it('filters by viewport bbox', async () => {
    const { json } = setup();
    const { body } = await json<{ events: Array<{ id: string }> }>(
      '/api/events?mode=historical&t=1945&res=year&bbox=5,45,20,56',
    );
    const ids = body.events.map((e) => e.id);
    expect(ids).toContain('hist-german-surrender-1945');
    expect(ids).not.toContain('hist-hiroshima-nagasaki');
  });
  it('returns sources with perspectives; real ratings stay UNRATED', async () => {
    const { json } = setup();
    const { body } = await json<{
      sources: Array<{ rating: { value: string; illustrative: boolean } }>;
      perspectives: { byCountry: Record<string, number> };
    }>('/api/events/demo-news-taiwan-strait-drills/sources');
    expect(body.sources.length).toBeGreaterThanOrEqual(5);
    for (const s of body.sources)
      if (s.rating.value !== 'UNRATED') expect(s.rating.illustrative).toBe(true);
    expect(Object.keys(body.perspectives.byCountry).length).toBeGreaterThanOrEqual(4);
  });
  it('exposes Take Action only where it makes sense', async () => {
    const { json } = setup();
    const quake = await json<{ actions: unknown[] }>('/api/events/demo-news-sulawesi-quake-relief');
    expect(quake.body.actions.length).toBe(1);
    const drills = await json<{ actions: unknown[] }>('/api/events/demo-news-taiwan-strait-drills');
    expect(drills.body.actions.length).toBe(0);
    const hist = await json<{ actions: unknown[] }>('/api/events/hist-battle-of-waterloo');
    expect(hist.body.actions.length).toBe(0);
  });
  it('returns THEN ↔ NOW context, newest first', async () => {
    const { json } = setup();
    const { body } = await json<{ related: Array<{ event: { id: string } }> }>(
      '/api/events/demo-news-scs-shoal-standoff/context',
    );
    const ids = body.related.map((r) => r.event.id);
    expect(ids[0]).toBe('hist-south-china-sea-arbitration');
    expect(ids).toContain('hist-battle-of-paracel-islands');
  });
  it('falls back to heuristic framing when AI is unavailable and labels allegations', async () => {
    const { post } = setup();
    const { body } = await post('/api/events/demo-news-scs-shoal-standoff/framing', {});
    const framing = (
      body as {
        framing: { method: string; commonlyReported: Array<{ kind: string }>; caveats: string[] };
      }
    ).framing;
    expect(framing.method).toBe('heuristic');
    expect(framing.commonlyReported.some((c) => c.kind === 'allegation')).toBe(true);
    expect(framing.caveats.join(' ')).toContain('DEMO');
  });
  it('degrades gracefully when Wikipedia is unreachable', async () => {
    const { json } = setup();
    const { status, body } = await json<{ available: boolean }>(
      '/api/history/wikipedia?title=Battle_of_Waterloo',
    );
    expect(status).toBe(200);
    expect(body.available).toBe(false);
  });
});

describe('search', () => {
  const cases: Array<[string, string, string]> = [
    ['Berlin 1945', 'PLACE', 'Berlin'],
    ['Waterloo', 'HISTORY', 'Battle of Waterloo'],
    ['South China Sea', 'PLACE', 'South China Sea'],
    ['Napoleonic Wars', 'CONFLICT', 'Napoleonic Wars'],
    ['Ukraine', 'PLACE', 'Ukraine'],
  ];
  for (const [q, type, title] of cases) {
    it(`"${q}" → ${type} ${title}`, async () => {
      const { json } = setup();
      const { body } = await json<{ results: Array<{ type: string; title: string }> }>(
        `/api/search?q=${encodeURIComponent(q)}`,
      );
      expect(body.results.some((r) => r.type === type && r.title === title)).toBe(true);
    });
  }
  it('"Berlin 1945" also finds 1945 Berlin history; "Indonesia 1965" finds 1965 events', async () => {
    const { json } = setup();
    const berlin = await json<{ results: Array<{ eventId?: string }> }>(
      '/api/search?q=Berlin%201945',
    );
    expect(berlin.body.results.map((r) => r.eventId)).toContain('hist-battle-of-berlin');
    const indo = await json<{ results: Array<{ eventId?: string }> }>(
      '/api/search?q=Indonesia%201965',
    );
    expect(indo.body.results.map((r) => r.eventId)).toContain('hist-30-september-movement');
  });
});

describe('offline assistant (no AI key)', () => {
  const tools = (actions: ClientAction[]) => actions.map((a) => a.tool);

  it('"What is happening near Taiwan?" returns to live, flies there and opens a nearby event', async () => {
    const { post } = setup();
    const { body } = await post('/api/ai/chat', chat('What is happening near Taiwan?'));
    const r = body as { mode: string; actions: ClientAction[]; reply: string; notice: string };
    expect(r.mode).toBe('offline');
    expect(tools(r.actions)).toEqual(
      expect.arrayContaining(['return_to_live', 'fly_to', 'open_event']),
    );
    expect(r.reply).toContain('DEMO');
    expect(r.notice).toContain('AI is not configured');
  });
  it("walks Germany's territorial changes 1933–1945 with honest border notes", async () => {
    const { post } = setup();
    const { body } = await post(
      '/api/ai/chat',
      chat("Show me Germany's territorial changes between 1933 and 1945"),
    );
    const r = body as { actions: ClientAction[]; reply: string };
    expect(r.actions[0]).toEqual({ tool: 'set_time', args: { date: '1933', resolution: 'year' } });
    expect(r.actions).toContainEqual({ tool: 'highlight_region', args: { country: 'DEU' } });
    const opened = r.actions
      .filter((a) => a.tool === 'open_event')
      .map((a) => (a.args as { event_id: string }).event_id);
    expect(opened).toEqual(
      expect.arrayContaining([
        'hist-saar-referendum-1935',
        'hist-anschluss',
        'hist-munich-agreement',
      ]),
    );
    expect(r.reply).toMatch(/1930|snapshot|approximate/i);
  });
  it('"I have $20. How can I help?" opens a review screen only — never pays', async () => {
    const { post } = setup();
    const { body } = await post('/api/ai/chat', chat('I have $20. How can I help?'));
    const r = body as { actions: ClientAction[]; reply: string };
    const take = r.actions.find((a) => a.tool === 'open_take_action');
    expect(take).toBeDefined();
    expect((take!.args as { amount_usd: number }).amount_usd).toBe(20);
    expect(r.reply).toMatch(/SANDBOX/);
    expect(r.reply).toMatch(/no real money/i);
  });
  it('"Why does this matter historically?" tours linked history', async () => {
    const { post } = setup();
    const { body } = await post(
      '/api/ai/chat',
      chat('Why does this matter historically?', {
        selectedEventId: 'demo-news-taiwan-strait-drills',
      }),
    );
    const r = body as { actions: ClientAction[]; reply: string };
    expect(r.actions.filter((a) => a.tool === 'set_time').length).toBeGreaterThanOrEqual(3);
    expect(r.reply).toContain('Third Taiwan Strait Crisis');
  });
  it('validates chat requests', async () => {
    const { post } = setup();
    const { status } = await post('/api/ai/chat', { messages: [], context: {} });
    expect(status).toBe(400);
  });
});

/** A scripted model: returns queued responses in order. */
class ScriptedAi implements AiProvider {
  readonly name = 'scripted';
  readonly available = true;
  requests: AiTurnRequest[] = [];
  constructor(private script: Array<Anthropic.Beta.BetaContentBlock[] | Error>) {}
  modelFor(): string {
    return 'claude-opus-5-5';
  }
  async turn(req: AiTurnRequest): Promise<AiTurnResponse> {
    this.requests.push(structuredClone(req));
    const next = this.script.shift();
    if (!next) throw new Error('script exhausted');
    if (next instanceof Error) throw next;
    const toolUse = next.some((b) => b.type === 'tool_use');
    return {
      model: 'claude-opus-5-5',
      content: next,
      stopReason: toolUse ? 'tool_use' : 'end_turn',
      usage: { input_tokens: 1000, output_tokens: 200 },
    };
  }
}
const toolUse = (id: string, name: string, input: unknown) =>
  ({
    type: 'tool_use',
    id,
    name,
    input,
    caller: { type: 'direct' },
  }) as unknown as Anthropic.Beta.BetaContentBlock;
const textBlock = (text: string) =>
  ({ type: 'text', text, citations: null }) as unknown as Anthropic.Beta.BetaContentBlock;

describe('AI agent tool layer', () => {
  it('validates tool calls, resolves places, rejects unsafe or invalid calls', async () => {
    const ai = new ScriptedAi([
      [
        toolUse('t1', 'fly_to', { place: 'Taiwan' }),
        toolUse('t2', 'set_time', { date: '1750' }),
        toolUse('t3', 'capture_payment', { order: 'X' }),
        toolUse('t4', 'open_event', { event_id: 'does-not-exist' }),
        toolUse('t5', 'search_events', { query: 'Taiwan Strait' }),
      ],
      [textBlock('Here is the Taiwan Strait. [DEMO] scenario shown.')],
    ]);
    const { post } = setup({ ai });
    const { body } = await post('/api/ai/chat', chat('Take me to Taiwan'));
    const r = body as {
      mode: string;
      actions: ClientAction[];
      toolTrace: Array<{ tool: string; ok: boolean }>;
      usage: { costUsd: number };
    };
    expect(r.mode).toBe('ai');
    expect(r.actions).toHaveLength(1);
    expect(r.actions[0]!.tool).toBe('fly_to');
    expect((r.actions[0]!.args as { lat: number }).lat).toBeCloseTo(23.65, 1);
    const ok = Object.fromEntries(r.toolTrace.map((t) => [t.tool, t.ok]));
    expect(ok).toEqual({
      fly_to: true,
      set_time: false,
      capture_payment: false,
      open_event: false,
      search_events: true,
    });
    expect(r.usage.costUsd).toBeGreaterThan(0);
    // Tool results were sent back as one user message with is_error for failures.
    const second = ai.requests[1]!;
    const results = second.messages[second.messages.length - 1]!.content as Array<{
      type: string;
      is_error?: boolean;
    }>;
    expect(results.filter((b) => b.type === 'tool_result')).toHaveLength(5);
    expect(results.filter((b) => b.is_error)).toHaveLength(3);
  });

  it('falls back to the offline assistant when the AI provider fails', async () => {
    const ai = new ScriptedAi([new AiUnavailableError('AI provider unreachable')]);
    const { post } = setup({ ai });
    const { body } = await post('/api/ai/chat', chat('Return to live'));
    const r = body as { mode: string; actions: ClientAction[]; notice: string };
    expect(r.mode).toBe('offline');
    expect(r.actions[0]?.tool).toBe('return_to_live');
    expect(r.notice).toContain('unreachable');
  });
});

describe('PayPal sandbox payments', () => {
  const terms = {
    beneficiary: 'WorldLens Sandbox Relief Fund',
    purpose: 'Emergency relief — demo scenario',
    sandboxAcknowledged: true,
  };
  const order = (amount = '20.00', extra: Record<string, unknown> = {}) => ({
    actionOptionId: 'act-quake-relief-sandbox',
    eventId: 'demo-news-sulawesi-quake-relief',
    amount,
    currency: 'USD',
    reviewedTerms: terms,
    ...extra,
  });

  it('reports not-configured without pretending success', async () => {
    const { post } = setup();
    const { status, body } = await post('/api/payments/orders', order());
    expect(status).toBe(503);
    expect((body as { error: string }).error).toBe('PAYPAL_NOT_CONFIGURED');
  });

  it('creates an order, captures after approval, and is idempotent', async () => {
    const pp = new FakePayPal();
    const { post, json } = setup({ paypal: pp });
    const created = await post('/api/payments/orders', order());
    expect(created.status).toBe(200);
    const { orderId, paymentId } = created.body as { orderId: string; paymentId: string };
    expect(pp.orders.get(orderId)!.amount).toEqual({ currency_code: 'USD', value: '20.00' });
    expect(pp.orders.get(orderId)!.description).toContain('SANDBOX DEMO');

    // Capturing before buyer approval must not succeed.
    const early = await post(`/api/payments/orders/${orderId}/capture`, {});
    expect(early.status).toBe(502);

    pp.approve(orderId);
    const cap = await post(`/api/payments/orders/${orderId}/capture`, {});
    expect(cap.status).toBe(200);
    const payment = (cap.body as { payment: { state: string; captureId: string; amount: string } })
      .payment;
    expect(payment.state).toBe('CAPTURED');
    expect(payment.captureId).toBe(`CAP${orderId}`);

    const again = await post(`/api/payments/orders/${orderId}/capture`, {});
    expect((again.body as { payment: { state: string } }).payment.state).toBe('CAPTURED');
    const refreshed = await json<{ payment: { state: string } }>(`/api/payments/${paymentId}`);
    expect(refreshed.body.payment.state).toBe('CAPTURED');
  });

  it('records cancellation and never reports success for a cancelled order', async () => {
    const pp = new FakePayPal();
    const { post } = setup({ paypal: pp });
    const { orderId } = (await post('/api/payments/orders', order('5'))).body as {
      orderId: string;
    };
    const cancelled = await post(`/api/payments/orders/${orderId}/cancel`, {});
    expect((cancelled.body as { payment: { state: string } }).payment.state).toBe('CANCELLED');
  });

  it('rejects mismatched terms, out-of-range amounts and options not offered for the event', async () => {
    const { post } = setup({ paypal: new FakePayPal() });
    expect(
      (
        await post(
          '/api/payments/orders',
          order('20', { reviewedTerms: { ...terms, purpose: 'Something else' } }),
        )
      ).status,
    ).toBe(409);
    expect((await post('/api/payments/orders', order('9999'))).status).toBe(400);
    expect(
      (
        await post(
          '/api/payments/orders',
          order('20', { eventId: 'demo-news-taiwan-strait-drills' }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await post(
          '/api/payments/orders',
          order('20', { reviewedTerms: { ...terms, sandboxAcknowledged: false } }),
        )
      ).status,
    ).toBe(400);
  });

  it('refuses live payments in this build', async () => {
    const { post } = setup({ paypal: new FakePayPal(), env: { PAYPAL_ENVIRONMENT: 'live' } });
    const { status } = await post('/api/payments/orders', order());
    expect(status).toBe(403);
  });

  it('maps an instrument decline to a clear, non-success result', async () => {
    const pp = new FakePayPal();
    const { post } = setup({ paypal: pp });
    const { orderId } = (await post('/api/payments/orders', order())).body as { orderId: string };
    pp.approve(orderId);
    pp.nextCaptureIssue = 'INSTRUMENT_DECLINED';
    const r = await post(`/api/payments/orders/${orderId}/capture`, {});
    expect(r.status).toBe(422);
    expect((r.body as { error: string }).error).toBe('INSTRUMENT_DECLINED');
  });

  it('verifies webhooks, processes each event once, and never downgrades a capture', async () => {
    const pp = new FakePayPal();
    const { post, req, deps } = setup({ paypal: pp });
    const { orderId, paymentId } = (await post('/api/payments/orders', order())).body as {
      orderId: string;
      paymentId: string;
    };
    const hook = (
      id: string,
      type: string,
      resource: Record<string, unknown>,
      sig = 'valid-signature',
    ) =>
      req('/api/paypal/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'paypal-auth-algo': 'SHA256withRSA',
          'paypal-cert-url': 'https://api.sandbox.paypal.com/v1/notifications/certs/CERT',
          'paypal-transmission-id': `tx-${id}`,
          'paypal-transmission-sig': sig,
          'paypal-transmission-time': '2026-10-14T11:30:00Z',
        },
        body: JSON.stringify({ id, event_type: type, resource }),
      });
    const bad = await hook('WH-0', 'PAYMENT.CAPTURE.COMPLETED', { id: 'CAPX' }, 'forged');
    expect(bad.status).toBe(401);

    const completed = {
      id: 'CAP123',
      status: 'COMPLETED',
      custom_id: paymentId,
      supplementary_data: { related_ids: { order_id: orderId } },
    };
    const r1 = await hook('WH-1', 'PAYMENT.CAPTURE.COMPLETED', completed);
    expect(await r1.json()).toEqual({
      status: 'processed',
      eventType: 'PAYMENT.CAPTURE.COMPLETED',
    });
    const r2 = await hook('WH-1', 'PAYMENT.CAPTURE.COMPLETED', completed);
    expect(await r2.json()).toEqual({
      status: 'duplicate',
      eventType: 'PAYMENT.CAPTURE.COMPLETED',
    });
    // A late "approved" event must not downgrade CAPTURED.
    await hook('WH-2', 'CHECKOUT.ORDER.APPROVED', { id: orderId, status: 'APPROVED' });
    const rec = await deps.paymentStore.get(paymentId);
    expect(rec?.state).toBe('CAPTURED');
    expect(rec?.captureId).toBe('CAP123');
  });

  const webhookRequest = (id: string, type: string, resource: Record<string, unknown>) =>
    ({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'paypal-auth-algo': 'SHA256withRSA',
        'paypal-cert-url': 'https://api.sandbox.paypal.com/v1/notifications/certs/CERT',
        'paypal-transmission-id': `tx-${id}`,
        'paypal-transmission-sig': 'valid-signature',
        'paypal-transmission-time': '2026-10-14T11:30:00Z',
      },
      body: JSON.stringify({ id, event_type: type, resource }),
    }) satisfies RequestInit;

  it('handles a webhook again after its processing failed instead of dropping it', async () => {
    const store = new MemoryPaymentStore();
    let failNext = false;
    const flaky: PaymentStore = Object.assign(Object.create(store) as PaymentStore, {
      getByOrderId: async (orderId: string) => {
        if (failNext) {
          failNext = false;
          throw new Error('database unreachable');
        }
        return store.getByOrderId(orderId);
      },
    });
    const { post, req } = setup({ paypal: new FakePayPal(), paymentStore: flaky });
    const { orderId, paymentId } = (await post('/api/payments/orders', order())).body as {
      orderId: string;
      paymentId: string;
    };
    const resource = {
      id: 'CAP777',
      status: 'COMPLETED',
      custom_id: paymentId,
      supplementary_data: { related_ids: { order_id: orderId } },
    };
    failNext = true;
    const first = await req(
      '/api/paypal/webhook',
      webhookRequest('WH-R1', 'PAYMENT.CAPTURE.COMPLETED', resource),
    );
    expect(first.status).toBe(500); // PayPal will retry
    const retry = await req(
      '/api/paypal/webhook',
      webhookRequest('WH-R1', 'PAYMENT.CAPTURE.COMPLETED', resource),
    );
    expect(await retry.json()).toMatchObject({ status: 'processed' });
    expect((await store.get(paymentId))?.state).toBe('CAPTURED');
    const again = await req(
      '/api/paypal/webhook',
      webhookRequest('WH-R1', 'PAYMENT.CAPTURE.COMPLETED', resource),
    );
    expect(await again.json()).toMatchObject({ status: 'duplicate' });
  });

  it('answers 409 while another delivery of the same event is being processed', async () => {
    const store = new MemoryPaymentStore();
    const { post, req } = setup({ paypal: new FakePayPal(), paymentStore: store });
    const { orderId } = (await post('/api/payments/orders', order())).body as { orderId: string };
    const resource = { id: orderId, status: 'APPROVED' };
    expect(await store.claimWebhook('WH-L1')).toBe('claimed'); // in flight elsewhere
    const r = await req(
      '/api/paypal/webhook',
      webhookRequest('WH-L1', 'CHECKOUT.ORDER.APPROVED', resource),
    );
    expect(r.status).toBe(409);
  });

  it('a webhook decided on a stale read cannot overwrite a concurrent capture', async () => {
    const store = new MemoryPaymentStore();
    let stale = false;
    // The webhook's read returns the record as it was before capture() (another isolate).
    const racing: PaymentStore = Object.assign(Object.create(store) as PaymentStore, {
      getByOrderId: async (orderId: string) => {
        const r = await store.getByOrderId(orderId);
        return r && stale ? { ...r, state: 'CREATED' as const, captureId: null } : r;
      },
    });
    const pp = new FakePayPal();
    const { post, req } = setup({ paypal: pp, paymentStore: racing });
    const { orderId, paymentId } = (await post('/api/payments/orders', order())).body as {
      orderId: string;
      paymentId: string;
    };
    pp.approve(orderId);
    expect((await post(`/api/payments/orders/${orderId}/capture`, {})).status).toBe(200);
    stale = true;
    const r = await req(
      '/api/paypal/webhook',
      webhookRequest('WH-S1', 'CHECKOUT.ORDER.APPROVED', { id: orderId, status: 'APPROVED' }),
    );
    expect(r.status).toBe(200);
    const rec = await store.get(paymentId);
    expect(rec?.state).toBe('CAPTURED');
    expect(rec?.captureId).not.toBeNull();
  });
});

describe('database configuration never leaks credentials', () => {
  const PASSWORD = 'S3cretPassw0rd';
  it.each([
    [`psql 'postgresql://worldlens_app:${PASSWORD}@ep-x-pooler.us-east-2.aws.neon.tech/neondb'`],
    [`postgresql://worldlens_app:ab/${PASSWORD}@ep-x-pooler.us-east-2.aws.neon.tech/neondb`],
    [`postgresql://app:${PASSWORD}@db.example.org/worldlens`],
  ])('reports a fixed reason for %#', async (url) => {
    const { json } = setup({ env: { DATABASE_URL: url } });
    const health = await json('/api/health');
    const text = JSON.stringify(health.body);
    expect(text).not.toContain(PASSWORD);
    const db = (
      health.body.providers as Array<{ name: string; state: string; lastError: string }>
    ).find((p) => p.name === 'database');
    expect(db?.state).toBe('down');
    expect(db?.lastError).toMatch(/DATABASE_URL/);
    expect(health.body.repository).toBe('memory');
  });

  it('only Neon hosts go to the Neon HTTP driver', () => {
    expect(
      classifyDatabaseUrl('postgresql://u:p@ep-a-pooler.eu-central-1.aws.neon.tech/db').kind,
    ).toBe('neon');
    expect(classifyDatabaseUrl("'postgresql://u:p@ep-a.us-east-2.aws.neon.tech/db'").kind).toBe(
      'neon',
    );
    expect(classifyDatabaseUrl('postgresql://u:p@LOCALHOST:5432/db').kind).toBe('local');
    expect(classifyDatabaseUrl('postgres://u:p@127.0.0.2/db').kind).toBe('local');
    expect(classifyDatabaseUrl('postgresql://u:p@neon.tech.evil.example/db').kind).toBe('other');
    expect(classifyDatabaseUrl('https://u:p@ep-a.aws.neon.tech/db').kind).toBe('invalid');
  });

  it('redacts connection strings from driver errors', () => {
    const driverMessage = `Database connection string provided to neon() is not a valid URL (connection string: 'postgresql://worldlens_app:${PASSWORD}@ep-x.aws.neon.tech/neondb')`;
    expect(redactSecrets(driverMessage)).not.toContain(PASSWORD);
    expect(redactSecrets(`fetch https://user:${PASSWORD}@example.org/x failed`)).not.toContain(
      PASSWORD,
    );
    expect(describeDbError(new Error(driverMessage)).message).not.toContain(PASSWORD);
    const sqlError = Object.assign(new Error('permission denied for table events'), {
      code: '42501',
    });
    expect(describeDbError(sqlError).message).toBe(
      'permission denied for table events (SQLSTATE 42501)',
    );
  });
});

describe('border selection never extrapolates silently', () => {
  it('chooses exact, nearby, modern or unavailable explicitly', () => {
    const exact = selectBorderSnapshot(utcMs(1815, 6, 18));
    expect(exact).toMatchObject({ available: true, snapshotYear: 1815, gapYears: 0 });
    const near = selectBorderSnapshot(utcMs(1933));
    expect(near).toMatchObject({ available: true, snapshotYear: 1930, gapYears: 3 });
    expect(selectBorderSnapshot(utcMs(1975)).available).toBe(false);
    expect(
      selectBorderSnapshot(utcMs(1975)).available === false && selectBorderSnapshot(utcMs(1975)),
    ).toMatchObject({
      reason: expect.stringContaining('does not extrapolate'),
    });
    expect(selectBorderSnapshot(utcMs(2020))).toMatchObject({
      available: true,
      source: 'natural-earth',
    });
  });
  it('processes and simplifies snapshot features, marking them APPROXIMATE', () => {
    const p = new HistoricalBordersProvider('https://example.invalid/', new ProviderHealth());
    const feats = p.process(
      {
        features: [
          {
            properties: { NAME: 'Testland', BORDERPRECISION: 3 },
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [0, 0],
                  [1, 0],
                  [1, 1],
                  [0.5, 1.0001],
                  [0, 1],
                  [0, 0],
                ],
              ],
            },
          },
          {
            properties: { NAME: '' },
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [0, 0],
                  [1, 0],
                  [1, 1],
                  [0, 0],
                ],
              ],
            },
          },
          { properties: { NAME: 'Broken' }, geometry: null },
        ],
      },
      0.01,
    );
    expect(feats).toHaveLength(1);
    expect(feats[0]!.properties.certainty).toBe('APPROXIMATE');
    expect(feats[0]!.properties.datasetPrecision).toBe(3);
  });
});

describe('Wikimedia Commons image URLs', () => {
  it('recognises Commons files on both upload and thumb hosts', () => {
    expect(
      commonsFileFromUrl(
        'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e1/FullMoon2010.jpg/330px-FullMoon2010.jpg',
      ),
    ).toBe('File:FullMoon2010.jpg');
    expect(
      commonsFileFromUrl(
        'https://thumb.wikimedia.org/wikipedia/commons/thumb/4/41/A_Man_on_the_Moon%2C_AS11-40-5903_%28cropped%29.jpg/330px-A_Man_on_the_Moon.jpg?utm_source=en.wikipedia.org',
      ),
    ).toBe('File:A_Man_on_the_Moon,_AS11-40-5903_(cropped).jpg');
    expect(
      commonsFileFromUrl(
        'https://upload.wikimedia.org/wikipedia/commons/b/b8/Treaty.jpg?utm_source=en.wikipedia.org',
      ),
    ).toBe('File:Treaty.jpg');
  });
  it('rejects non-Commons (possibly non-free) images', () => {
    expect(
      commonsFileFromUrl(
        'https://thumb.wikimedia.org/wikipedia/en/thumb/b/ba/Eiffel_Tower_logo.svg/330px-Eiffel_Tower_logo.svg.png',
      ),
    ).toBeNull();
    expect(commonsFileFromUrl('https://example.com/wikipedia/commons/a/ab/X.jpg')).toBeNull();
  });
});
