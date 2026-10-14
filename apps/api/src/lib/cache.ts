/** Small TTL + LRU cache (per isolate). Persistent caching uses the Cache API / R2 where available. */
export class TtlCache<V> {
  private map = new Map<string, { value: V; expires: number }>();
  constructor(
    private readonly maxEntries = 500,
    private readonly now: () => number = Date.now,
  ) {}

  get(key: string): V | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (hit.expires <= this.now()) {
      this.map.delete(key);
      return undefined;
    }
    // refresh recency
    this.map.delete(key);
    this.map.set(key, hit);
    return hit.value;
  }

  /** Returns the value even if expired (for stale-if-error fallbacks). */
  getStale(key: string): V | undefined {
    return this.map.get(key)?.value;
  }

  set(key: string, value: V, ttlMs: number): void {
    this.map.delete(key);
    this.map.set(key, { value, expires: this.now() + ttlMs });
    while (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }

  delete(key: string): void {
    this.map.delete(key);
  }

  get size(): number {
    return this.map.size;
  }
}

/** Coalesce concurrent loads of the same key. */
export class SingleFlight<V> {
  private inflight = new Map<string, Promise<V>>();
  run(key: string, fn: () => Promise<V>): Promise<V> {
    const existing = this.inflight.get(key);
    if (existing) return existing;
    const p = fn().finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }
}

/** 64-bit FNV-1a as hex — stable ids for URLs and cache keys (not cryptographic). */
export function fnv1a64(input: string): string {
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let i = 0; i < input.length; i++) {
    h ^= BigInt(input.charCodeAt(i));
    h = (h * prime) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, '0');
}
