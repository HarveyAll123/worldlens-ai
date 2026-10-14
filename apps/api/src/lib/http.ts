/** Outbound HTTP with timeouts and bounded retries. Every external call goes through here. */

export type FetchLike = (input: string | Request, init?: RequestInit) => Promise<Response>;

export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly provider: string,
    readonly status: number | null = null,
    readonly body: string | null = null,
  ) {
    super(message);
    this.name = 'UpstreamError';
  }
}

export interface FetchOptions extends RequestInit {
  timeoutMs?: number;
  /** Retries for network errors / 429 / 5xx only. Never used for non-idempotent calls without a request id. */
  retries?: number;
  provider: string;
  fetchImpl?: FetchLike;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function fetchWithTimeout(url: string, opts: FetchOptions): Promise<Response> {
  const { timeoutMs = 8000, retries = 0, provider, fetchImpl = fetch, ...init } = opts;
  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, { ...init, signal: controller.signal });
      clearTimeout(timer);
      if ((res.status === 429 || res.status >= 500) && attempt < retries) {
        await sleep(250 * 2 ** attempt);
        continue;
      }
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < retries) {
        await sleep(250 * 2 ** attempt);
        continue;
      }
    }
  }
  const msg = lastErr instanceof Error ? lastErr.message : 'request failed';
  throw new UpstreamError(`${provider}: ${msg}`, provider);
}

export async function fetchJson<T = unknown>(url: string, opts: FetchOptions): Promise<T> {
  const res = await fetchWithTimeout(url, {
    ...opts,
    headers: { Accept: 'application/json', ...(opts.headers ?? {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new UpstreamError(`${opts.provider}: HTTP ${res.status}`, opts.provider, res.status, text.slice(0, 500));
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new UpstreamError(`${opts.provider}: invalid JSON`, opts.provider, res.status, text.slice(0, 200));
  }
}
