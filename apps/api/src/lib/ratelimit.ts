/**
 * Token-bucket rate limiter keyed by client (per isolate). Good enough to stop accidental
 * floods and casual abuse; for strict global limits put Cloudflare WAF rate-limiting rules in
 * front of the Worker (see DEPLOYMENT.md).
 */
export class RateLimiter {
  private buckets = new Map<string, { tokens: number; updated: number }>();
  constructor(
    private readonly capacity: number,
    private readonly refillPerMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  static perMinute(n: number, now?: () => number): RateLimiter {
    return new RateLimiter(n, n / 60_000, now);
  }

  take(key: string, cost = 1): { ok: boolean; retryAfterS: number } {
    const t = this.now();
    const b = this.buckets.get(key) ?? { tokens: this.capacity, updated: t };
    b.tokens = Math.min(this.capacity, b.tokens + (t - b.updated) * this.refillPerMs);
    b.updated = t;
    if (b.tokens >= cost) {
      b.tokens -= cost;
      this.buckets.set(key, b);
      return { ok: true, retryAfterS: 0 };
    }
    this.buckets.set(key, b);
    if (this.buckets.size > 10_000) this.buckets.clear();
    return { ok: false, retryAfterS: Math.ceil((cost - b.tokens) / this.refillPerMs / 1000) };
  }
}

export function clientKey(headers: Headers): string {
  return (
    headers.get('cf-connecting-ip') ??
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    headers.get('x-real-ip') ??
    'local'
  );
}
