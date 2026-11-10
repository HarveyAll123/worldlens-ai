/**
 * The publisher directory, by domain, for outlets outside WorldLens's own registry: where each
 * is based (GDELT's list of news outlets by country, 2018) and, where Wikidata knows the
 * outlet, its name, kind, owner and left–right alignment (scripts/build-publishers.ts). Read
 * from the web app's static files (apps/web/public/data/publishers/NN.json) — only the file a
 * domain is in, once, then kept. If the files cannot be reached, outlets stay as they are and it
 * tries again a minute later.
 */
import {
  decodePublisherEntry,
  publisherDomains,
  publisherShard,
  type PublisherEntry,
  type PublisherEntryRaw,
} from '@worldlens/shared';
import { fetchWithTimeout, type FetchLike } from '../lib/http';

const RETRY_AFTER_MS = 60_000;

type Shard = Record<string, PublisherEntryRaw>;

export class PublisherDirectory {
  private shards = new Map<number, Promise<Shard | null>>();
  private failedAt = new Map<number, number>();

  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  private shard(i: number): Promise<Shard | null> {
    const cached = this.shards.get(i);
    if (cached) return cached;
    const failed = this.failedAt.get(i);
    if (failed !== undefined && this.now() - failed < RETRY_AFTER_MS) return Promise.resolve(null);
    const load = (async () => {
      try {
        const res = await fetchWithTimeout(`${this.baseUrl}${String(i).padStart(2, '0')}.json`, {
          provider: 'publisher-directory',
          timeoutMs: 6000,
          fetchImpl: this.fetchImpl,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as Shard;
      } catch {
        this.shards.delete(i);
        this.failedAt.set(i, this.now());
        return null;
      }
    })();
    this.shards.set(i, load);
    return load;
  }

  /** What the directory has for each host's outlet (hosts it does not list are left out). */
  async lookup(hosts: string[]): Promise<Map<string, PublisherEntry>> {
    const out = new Map<string, PublisherEntry>();
    await Promise.all(
      [...new Set(hosts)].map(async (host) => {
        for (const d of publisherDomains(host)) {
          const raw = (await this.shard(publisherShard(d)))?.[d];
          if (raw) {
            out.set(host, decodePublisherEntry(raw));
            return;
          }
        }
      }),
    );
    return out;
  }
}
