/**
 * Builds the compact geodata shipped with WorldLens from Natural Earth (public domain).
 *
 *   pnpm data:build                       # downloads Natural Earth from GitHub
 *   NE_DIR=/path/to/natural-earth-vector/geojson pnpm data:build   # use a local checkout
 *
 * Outputs (committed; public domain):
 *   packages/shared/src/data/geo/countries.json   – country index (name, ISO3, bbox, label point)
 *   packages/shared/src/data/geo/places.json      – ~1,250 populated places for search/geocoding
 *   apps/web/public/data/countries-110m.json      – simplified outlines for highlight/modern borders
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  countVertices,
  geometryBBox,
  roundGeometry,
  simplifyPolygonGeometry,
  type PolyGeometry,
} from '../packages/shared/src/geo';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
// Pinned Natural Earth commit for reproducibility.
const NE_COMMIT = 'ca96624a56bd078437bca8184e78163e5039ad19';
const NE_RAW = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${NE_COMMIT}/geojson`;

interface Feature {
  properties: Record<string, unknown>;
  geometry: PolyGeometry | { type: 'Point'; coordinates: [number, number] };
}

async function load(name: string): Promise<{ features: Feature[] }> {
  const local = process.env.NE_DIR;
  if (local) return JSON.parse(await readFile(path.join(local, name), 'utf8'));
  const res = await fetch(`${NE_RAW}/${name}`);
  if (!res.ok) throw new Error(`Download failed for ${name}: ${res.status}`);
  return (await res.json()) as { features: Feature[] };
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() && v !== '-99' ? v.trim() : null);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

async function main() {
  const countries = await load('ne_110m_admin_0_countries.geojson');
  const places = await load('ne_50m_populated_places_simple.geojson');

  const index: unknown[] = [];
  const outlines: unknown[] = [];
  let vertices = 0;
  for (const f of countries.features) {
    const p = f.properties;
    const g = f.geometry as PolyGeometry;
    // ISO_A3 is -99 for a few entities (France, Norway, Kosovo …); fall back to ADM0_A3.
    const iso3 = str(p.ISO_A3) ?? str(p.ADM0_A3);
    const name = str(p.NAME) ?? str(p.ADMIN);
    if (!iso3 || !name) continue;
    const bbox = geometryBBox(g);
    const lon = num(p.LABEL_X);
    const lat = num(p.LABEL_Y);
    index.push({
      iso3,
      name,
      nameLong: str(p.NAME_LONG) ?? name,
      formal: str(p.FORMAL_EN),
      continent: str(p.CONTINENT),
      sovereign: str(p.SOVEREIGNT),
      bbox: [bbox.west, bbox.south, bbox.east, bbox.north].map((v) => Math.round(v * 100) / 100),
      label: lon !== null && lat !== null ? [lon, lat].map((v) => Math.round(v * 100) / 100) : null,
    });
    const simplified = simplifyPolygonGeometry(g, 0.05);
    if (!simplified) continue;
    const rounded = roundGeometry(simplified, 2);
    vertices += countVertices(rounded);
    outlines.push({ type: 'Feature', properties: { iso3, name }, geometry: rounded });
  }

  const placeIndex = places.features
    .map((f) => {
      const p = f.properties;
      const g = f.geometry as { type: 'Point'; coordinates: [number, number] };
      return {
        name: str(p.name),
        ascii: str(p.nameascii),
        country: str(p.adm0name),
        iso3: str(p.adm0_a3),
        admin1: str(p.adm1name),
        lat: Math.round(g.coordinates[1] * 1000) / 1000,
        lon: Math.round(g.coordinates[0] * 1000) / 1000,
        rank: num(p.scalerank) ?? 10,
        pop: num(p.pop_max) ?? 0,
        capital: num(p.adm0cap) === 1,
      };
    })
    .filter((p) => p.name && p.iso3)
    .sort((a, b) => a.rank - b.rank || b.pop - a.pop);

  const sharedDir = path.join(root, 'packages/shared/src/data/geo');
  const webDir = path.join(root, 'apps/web/public/data');
  await mkdir(sharedDir, { recursive: true });
  await mkdir(webDir, { recursive: true });
  await writeFile(path.join(sharedDir, 'countries.json'), JSON.stringify(index));
  await writeFile(path.join(sharedDir, 'places.json'), JSON.stringify(placeIndex));
  await writeFile(
    path.join(webDir, 'countries-110m.json'),
    JSON.stringify({
      type: 'FeatureCollection',
      metadata: {
        source: 'Natural Earth 1:110m Admin 0 – Countries',
        license: 'Public domain',
        url: 'https://www.naturalearthdata.com/',
        commit: NE_COMMIT,
        note: 'De facto boundaries as depicted by Natural Earth; simplified (0.05°) for display.',
      },
      features: outlines,
    }),
  );
  console.log(
    `countries: ${index.length} (outline vertices ${vertices}); places: ${placeIndex.length}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
