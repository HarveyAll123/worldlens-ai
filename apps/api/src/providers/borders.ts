/**
 * Temporal border geometry.
 *
 * Sources:
 *  1. Historical snapshots from aourednik/historical-basemaps (GPL-3.0), fetched at runtime
 *     from a pinned commit and NOT vendored into this repository. Each file is a world-scale
 *     snapshot for one year; certainty is treated as APPROXIMATE regardless of the dataset's
 *     own BORDERPRECISION field because the maps are explicitly work-in-progress.
 *  2. Modern de facto boundaries from Natural Earth (public domain) served by the web app.
 *
 * Selection rule — never silent extrapolation:
 *  - For a requested date we pick the nearest snapshot within ±tolerance years and report
 *    the gap explicitly. Outside the tolerance we return `available: false` with a reason.
 */
import { z } from 'zod';
import {
  MultiPolygonSchema,
  PolygonSchema,
  countVertices,
  roundGeometry,
  simplifyPolygonGeometry,
  yearOf,
  type PolyGeometry,
} from '@worldlens/shared';
import { SingleFlight, TtlCache } from '../lib/cache';
import { fetchJson, type FetchLike } from '../lib/http';
import type { ProviderHealth } from './health';

/** Snapshot years available in the pinned historical-basemaps commit (≥ 1783). */
export const BASEMAP_YEARS = [
  1783, 1800, 1815, 1878, 1880, 1900, 1914, 1920, 1930, 1938, 1945, 1960, 1994, 2000, 2010,
];
/** Natural Earth modern boundaries are shown from this year onward. */
export const MODERN_FROM_YEAR = 2011;
export const SNAPSHOT_TOLERANCE_YEARS = 5;

const FeatureSchema = z.object({
  properties: z.record(z.string(), z.unknown()).nullable(),
  geometry: z.union([PolygonSchema, MultiPolygonSchema]).nullable(),
});
const CollectionSchema = z.object({ features: z.array(z.unknown()) });

export interface BorderFeature {
  type: 'Feature';
  properties: {
    name: string;
    subjectTo: string | null;
    partOf: string | null;
    certainty: 'APPROXIMATE' | 'DISPUTED';
    datasetPrecision: number | null;
  };
  geometry: PolyGeometry;
}

export type BorderSelection =
  | {
      available: true;
      source: 'historical-basemaps' | 'natural-earth';
      snapshotYear: number | null;
      requestedYear: number;
      gapYears: number;
      certainty: 'APPROXIMATE';
      license: string;
      citation: string;
      note: string;
    }
  | { available: false; requestedYear: number; reason: string };

export function selectBorderSnapshot(dateMs: number): BorderSelection {
  const year = yearOf(dateMs);
  if (year >= MODERN_FROM_YEAR) {
    return {
      available: true,
      source: 'natural-earth',
      snapshotYear: null,
      requestedYear: year,
      gapYears: 0,
      certainty: 'APPROXIMATE',
      license: 'Public domain',
      citation: 'Natural Earth 1:110m Admin 0 – Countries (de facto boundaries)',
      note: 'Modern de facto boundaries at world scale. Disputed areas are shown as depicted by Natural Earth.',
    };
  }
  let best: number | null = null;
  for (const y of BASEMAP_YEARS)
    if (best === null || Math.abs(y - year) < Math.abs(best - year)) best = y;
  if (best === null || Math.abs(best - year) > SNAPSHOT_TOLERANCE_YEARS) {
    return {
      available: false,
      requestedYear: year,
      reason: `No border snapshot within ±${SNAPSHOT_TOLERANCE_YEARS} years of ${year}. WorldLens does not extrapolate borders.`,
    };
  }
  return {
    available: true,
    source: 'historical-basemaps',
    snapshotYear: best,
    requestedYear: year,
    gapYears: Math.abs(best - year),
    certainty: 'APPROXIMATE',
    license: 'GPL-3.0',
    citation: `historical-basemaps (A. Ourednik et al.), world_${best}.geojson`,
    note:
      best === year
        ? `World-scale snapshot for ${best}. Boundaries are approximate.`
        : `Nearest available snapshot is ${best} (${Math.abs(best - year)} year${Math.abs(best - year) === 1 ? '' : 's'} from ${year}). Boundaries may differ on the selected date and are approximate.`,
  };
}

const TOLERANCES = { low: 0.15, medium: 0.06, high: 0.02 } as const;
export type BorderDetail = keyof typeof TOLERANCES;

export class HistoricalBordersProvider {
  private cache = new TtlCache<BorderFeature[]>(40);
  private flight = new SingleFlight<BorderFeature[]>();

  constructor(
    private readonly baseUrl: string,
    private readonly health: ProviderHealth,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly r2?: R2Bucket,
  ) {}

  async snapshot(year: number, detail: BorderDetail): Promise<BorderFeature[]> {
    if (!BASEMAP_YEARS.includes(year)) throw new Error(`No snapshot for ${year}`);
    const key = `basemap:${year}:${detail}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    return this.flight.run(key, async () => {
      const r2Key = `historical-basemaps/${year}-${detail}.json`;
      if (this.r2) {
        const obj = await this.r2.get(r2Key).catch(() => null);
        if (obj) {
          const features = (await obj.json()) as BorderFeature[];
          this.cache.set(key, features, 24 * 3_600_000);
          return features;
        }
      }
      try {
        const raw = await fetchJson(`${this.baseUrl}world_${year}.geojson`, {
          provider: 'historical-basemaps',
          timeoutMs: 15000,
          retries: 1,
          fetchImpl: this.fetchImpl,
        });
        const features = this.process(raw, TOLERANCES[detail]);
        this.health.ok('historical-basemaps');
        this.cache.set(key, features, 24 * 3_600_000);
        if (this.r2) await this.r2.put(r2Key, JSON.stringify(features)).catch(() => undefined);
        return features;
      } catch (err) {
        this.health.fail('historical-basemaps', err);
        const stale = this.cache.getStale(key);
        if (stale) return stale;
        throw err;
      }
    });
  }

  process(raw: unknown, tolerance: number): BorderFeature[] {
    const coll = CollectionSchema.parse(raw);
    const out: BorderFeature[] = [];
    for (const f of coll.features) {
      const parsed = FeatureSchema.safeParse(f);
      if (!parsed.success || !parsed.data.geometry) continue;
      const p = parsed.data.properties ?? {};
      const name = typeof p.NAME === 'string' ? p.NAME.trim() : '';
      if (!name) continue;
      const simplified = simplifyPolygonGeometry(parsed.data.geometry as PolyGeometry, tolerance);
      if (!simplified) continue;
      const geometry = roundGeometry(simplified, 3);
      if (countVertices(geometry) < 4) continue;
      out.push({
        type: 'Feature',
        properties: {
          name: name.slice(0, 120),
          subjectTo: typeof p.SUBJECTO === 'string' ? p.SUBJECTO.slice(0, 120) : null,
          partOf: typeof p.PARTOF === 'string' ? p.PARTOF.slice(0, 120) : null,
          certainty: 'APPROXIMATE',
          datasetPrecision: typeof p.BORDERPRECISION === 'number' ? p.BORDERPRECISION : null,
        },
        geometry,
      });
    }
    return out;
  }
}
