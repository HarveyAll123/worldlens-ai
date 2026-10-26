/** Typed client for the WorldLens API. Every call is counted for the diagnostics panel. */
import type {
  ActionOption,
  Article,
  ClientAction,
  CreatePaymentRequest,
  EventRelation,
  EventSummary,
  Framing,
  Frontline,
  Granularity,
  NewsSource,
  PaymentRecord,
  Resolution,
  SearchResult,
  WorldEvent,
} from '@worldlens/shared';

const BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

export const apiStats = { requests: 0, failures: 0 };

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit & { signal?: AbortSignal }): Promise<T> {
  apiStats.requests++;
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init?.headers ?? {}),
      },
    });
  } catch (err) {
    apiStats.failures++;
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError('The WorldLens API is unreachable.', 0, 'NETWORK');
  }
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    apiStats.failures++;
    const b = body as { message?: string; error?: string } | null;
    throw new ApiError(
      b?.message ?? `Request failed (${res.status})`,
      res.status,
      b?.error ?? null,
    );
  }
  return body as T;
}

export interface EventsResponse {
  events: EventSummary[];
  total: number;
  truncated: boolean;
  window: { start: string; end: string };
  finestPrecision: Granularity | null;
  live?: { count: number; lastIngestedAt: string | null; provider: string | null; state: string };
}

export interface AppConfig {
  temporal: { minNavigableYear: number; comingSoonLabel: string | null };
  ai: { available: boolean };
  paypal: {
    configured: boolean;
    environment: 'sandbox' | 'live';
    clientId: string | null;
    webhooksConfigured: boolean;
    diagnostics?: {
      hasClientId: boolean;
      hasClientSecret: boolean;
      environment: string;
      hasWebhookId: boolean;
    };
  };
  news: { liveProvider: string | null };
}

export interface SourcesResponse {
  eventId: string;
  isDemo: boolean;
  articles: Article[];
  sources: NewsSource[];
  perspectives: {
    byRating: Record<string, number>;
    byCountry: Record<string, number>;
    byType: Record<string, number>;
  };
}

export interface RelatedResponse {
  related: Array<{ relation: EventRelation; direction: 'out' | 'in'; event: EventSummary }>;
}

export interface WikipediaResponse {
  available: boolean;
  message?: string;
  summary: null | {
    title: string;
    description: string | null;
    extract: string;
    pageUrl: string;
    image: WorldEvent['image'] | null;
  };
}

export interface BordersResponse {
  selection:
    | {
        available: true;
        source: 'historical-basemaps' | 'natural-earth';
        snapshotYear: number | null;
        requestedYear: number;
        gapYears: number;
        certainty: string;
        license: string;
        citation: string;
        note: string;
      }
    | { available: false; requestedYear?: number; reason: string };
  features: Array<{
    type: 'Feature';
    properties: {
      name: string;
      subjectTo: string | null;
      certainty: 'APPROXIMATE' | 'DISPUTED' | 'CERTAIN' | 'RECONSTRUCTED';
    };
    geometry:
      | { type: 'Polygon'; coordinates: number[][][] }
      | { type: 'MultiPolygon'; coordinates: number[][][][] };
  }> | null;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatResponse {
  mode: 'ai' | 'offline';
  reply: string;
  actions: unknown[];
  citations: Array<{ title: string; url: string; publisher: string }>;
  toolTrace: Array<{ tool: string; ok: boolean; kind: 'server' | 'client'; summary: string }>;
  model?: string;
  usage?: { inputTokens: number; outputTokens: number; costUsd: number };
  notice?: string;
}

export const api = {
  config: () => call<AppConfig>('/api/config'),
  events: (
    p: {
      mode: 'live' | 'historical';
      t?: string;
      res: Resolution;
      bbox?: string | null;
      kinds?: string;
      demo: boolean;
      battles: boolean;
      limit: number;
    },
    signal?: AbortSignal,
  ) => {
    const q = new URLSearchParams({
      mode: p.mode,
      res: p.res,
      demo: p.demo ? '1' : '0',
      battles: p.battles ? '1' : '0',
      limit: String(p.limit),
    });
    if (p.t) q.set('t', p.t);
    if (p.bbox) q.set('bbox', p.bbox);
    if (p.kinds) q.set('kinds', p.kinds);
    return call<EventsResponse>(`/api/events?${q}`, { signal });
  },
  density: (from: string, to: string, bins: number) =>
    call<{ counts: number[] }>(
      `/api/events/density?${new URLSearchParams({ from, to, bins: String(bins) })}`,
    ),
  event: (id: string) =>
    call<{ event: WorldEvent; actions: ActionOption[] }>(`/api/events/${encodeURIComponent(id)}`),
  sources: (id: string) => call<SourcesResponse>(`/api/events/${encodeURIComponent(id)}/sources`),
  context: (id: string) => call<RelatedResponse>(`/api/events/${encodeURIComponent(id)}/context`),
  framing: (id: string) =>
    call<{ framing: Framing | null; message?: string }>(
      `/api/events/${encodeURIComponent(id)}/framing`,
      { method: 'POST', body: '{}' },
    ),
  wikipedia: (title: string) =>
    call<WikipediaResponse>(`/api/history/wikipedia?${new URLSearchParams({ title })}`),
  borders: (t: string, detail: 'low' | 'medium' | 'high', signal?: AbortSignal) =>
    call<BordersResponse>(`/api/geo/borders?${new URLSearchParams({ t, detail })}`, { signal }),
  frontlines: (t: string) =>
    call<{ frontlines: Frontline[]; note?: string }>(
      `/api/geo/frontlines?${new URLSearchParams({ t })}`,
    ),
  search: (q: string, signal?: AbortSignal) =>
    call<{ results: SearchResult[] }>(`/api/search?${new URLSearchParams({ q })}`, { signal }),
  chat: (body: { messages: ChatMessage[]; context: unknown }) =>
    call<ChatResponse>('/api/ai/chat', { method: 'POST', body: JSON.stringify(body) }),
  createPayment: (body: CreatePaymentRequest) =>
    call<{ paymentId: string; orderId: string; state: string; environment: string }>(
      '/api/payments/orders',
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
    ),
  capturePayment: (orderId: string) =>
    call<{ payment: PaymentRecord; verified: boolean; verifiedBy: string }>(
      `/api/payments/orders/${encodeURIComponent(orderId)}/capture`,
      {
        method: 'POST',
        body: '{}',
      },
    ),
  cancelPayment: (orderId: string) =>
    call<{ payment: PaymentRecord | null }>(
      `/api/payments/orders/${encodeURIComponent(orderId)}/cancel`,
      { method: 'POST', body: '{}' },
    ),
  paymentStatus: (id: string) =>
    call<{ payment: PaymentRecord; verified: boolean; verifiedBy: string }>(
      `/api/payments/${encodeURIComponent(id)}`,
    ),
};

export type { ClientAction };
