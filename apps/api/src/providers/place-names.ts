/**
 * The globe's place names (cities, rivers, lakes, seas, mountains, deserts — Natural Earth,
 * scripts/build-place-names.ts), read once from the web app's static file, so the assistant's
 * highlight_place knows whether a place is on the map before saying it marked it. If the file
 * cannot be reached it tries again a minute later.
 */
import {
  PLACE_KIND,
  decodePlaceNames,
  findPlaceNames,
  type PlaceGroup,
  type PlaceName,
  type PlaceNameRaw,
} from '@worldlens/shared';
import { fetchWithTimeout, type FetchLike } from '../lib/http';

const RETRY_AFTER_MS = 60_000;

export class PlaceNameIndex {
  private places: Promise<PlaceName[] | null> | null = null;
  private failedAt: number | null = null;

  constructor(
    private readonly url: string,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  private load(): Promise<PlaceName[] | null> {
    if (this.places) return this.places;
    if (this.failedAt !== null && this.now() - this.failedAt < RETRY_AFTER_MS)
      return Promise.resolve(null);
    this.places = (async () => {
      try {
        const res = await fetchWithTimeout(this.url, {
          provider: 'place-names',
          timeoutMs: 8000,
          fetchImpl: this.fetchImpl,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return decodePlaceNames((await res.json()) as { places: PlaceNameRaw[] });
      } catch {
        this.places = null;
        this.failedAt = this.now();
        return null;
      }
    })();
    return this.places;
  }

  /**
   * The places a name may mean, best first; null when the list cannot be read (as opposed to an
   * empty list: no such place).
   */
  async find(name: string, group: PlaceGroup | 'any' = 'any'): Promise<PlaceName[] | null> {
    const places = await this.load();
    return places ? findPlaceNames(places, name, group) : null;
  }
}

export const placeKindLabel = (p: PlaceName) => PLACE_KIND[p.kind].label;
