/** Tracks the last known state of each external provider so the UI can explain degradations. */
export type ProviderName =
  | 'gdelt'
  | 'wikipedia'
  | 'wikimedia-commons'
  | 'historical-basemaps'
  | 'anthropic'
  | 'paypal'
  | 'database';

export interface ProviderStatus {
  name: ProviderName;
  configured: boolean;
  state: 'ok' | 'degraded' | 'down' | 'unconfigured' | 'unknown';
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
}

export class ProviderHealth {
  private status = new Map<ProviderName, ProviderStatus>();
  constructor(private readonly now: () => number = Date.now) {}

  register(name: ProviderName, configured: boolean): void {
    if (!this.status.has(name))
      this.status.set(name, {
        name,
        configured,
        state: configured ? 'unknown' : 'unconfigured',
        lastSuccessAt: null,
        lastErrorAt: null,
        lastError: null,
      });
  }

  ok(name: ProviderName): void {
    const s = this.get(name);
    s.state = 'ok';
    s.lastSuccessAt = new Date(this.now()).toISOString();
  }

  fail(name: ProviderName, err: unknown): void {
    const s = this.get(name);
    s.state = s.lastSuccessAt ? 'degraded' : 'down';
    s.lastErrorAt = new Date(this.now()).toISOString();
    s.lastError = (err instanceof Error ? err.message : String(err)).slice(0, 200);
  }

  get(name: ProviderName): ProviderStatus {
    this.register(name, true);
    return this.status.get(name)!;
  }

  all(): ProviderStatus[] {
    return [...this.status.values()];
  }
}
