/**
 * The world's land as polygons from OpenStreetMap's coastline (osmdata.openstreetmap.de,
 * "simplified land polygons": simplified to about 300 m, islets under about a third of a
 * square kilometre left out). © OpenStreetMap contributors, Open Database License.
 *
 * Coasts drawn from this agree with satellite imagery to a few hundred metres, which Natural
 * Earth's do not (its 1:50m land has no Vis, no Split peninsula; its 1:10m is off by a
 * kilometre or more in places). Lakes are land here: OpenStreetMap's coastline is the sea's.
 *
 * The download (24 MB) is kept in node_modules/.cache/osm-land.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';

const here = path.dirname(fileURLToPath(import.meta.url));
const CACHE =
  process.env.OSM_LAND_CACHE_DIR ?? path.resolve(here, '../../node_modules/.cache/osm-land');
const NAME = 'simplified-land-polygons-complete-3857';
export const OSM_LAND_URL = `https://osmdata.openstreetmap.de/download/${NAME}.zip`;
export const OSM_LAND_CREDIT =
  '© OpenStreetMap contributors (osmdata.openstreetmap.de, simplified land polygons), Open Database License 1.0';

/** A closed ring of [lon, lat]; the first point is not repeated at the end. */
export type Ring = Array<[number, number]>;
/** One piece of land: its outline first, then any holes (inland seas mapped as coastline). */
export type LandPolygon = Ring[];

/** One file out of a zip archive (no zip64, which a 24 MB archive does not need). */
function unzipEntry(zip: Buffer, suffix: string): Buffer {
  let eocd = zip.length - 22;
  while (eocd >= 0 && zip.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('not a zip archive');
  const count = zip.readUInt16LE(eocd + 10);
  let at = zip.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    if (zip.readUInt32LE(at) !== 0x02014b50) throw new Error('zip directory is damaged');
    const method = zip.readUInt16LE(at + 10);
    const packed = zip.readUInt32LE(at + 20);
    const nameLen = zip.readUInt16LE(at + 28);
    const extraLen = zip.readUInt16LE(at + 30);
    const commentLen = zip.readUInt16LE(at + 32);
    const local = zip.readUInt32LE(at + 42);
    const name = zip.toString('utf8', at + 46, at + 46 + nameLen);
    if (name.endsWith(suffix)) {
      const from = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      const data = zip.subarray(from, from + packed);
      if (method === 0) return Buffer.from(data);
      if (method === 8) return inflateRawSync(data);
      throw new Error(`zip method ${method} is not supported`);
    }
    at += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(`no ${suffix} in the archive`);
}

const R = 6378137;
const lonOf = (x: number) => (x / R) * (180 / Math.PI);
const latOf = (y: number) => (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * (180 / Math.PI);

/** Polygons of an ESRI shapefile in Web Mercator, as longitude and latitude. */
function polygonsOf(shp: Buffer): LandPolygon[] {
  if (shp.readInt32BE(0) !== 9994) throw new Error('not a shapefile');
  const out: LandPolygon[] = [];
  for (let at = 100; at + 8 <= shp.length;) {
    const words = shp.readInt32BE(at + 4);
    const rec = at + 8;
    at = rec + words * 2;
    if (shp.readInt32LE(rec) !== 5) continue; // not a polygon (null shapes)
    const parts = shp.readInt32LE(rec + 36);
    const points = shp.readInt32LE(rec + 40);
    const first = rec + 44 + parts * 4;
    const rings: LandPolygon = [];
    for (let p = 0; p < parts; p++) {
      const from = shp.readInt32LE(rec + 44 + p * 4);
      const to = p + 1 < parts ? shp.readInt32LE(rec + 44 + (p + 1) * 4) : points;
      const ring: Ring = [];
      // The last point repeats the first.
      for (let k = from; k < to - 1; k++)
        ring.push([
          lonOf(shp.readDoubleLE(first + k * 16)),
          latOf(shp.readDoubleLE(first + k * 16 + 8)),
        ]);
      if (ring.length >= 3) rings.push(ring);
    }
    if (rings.length) out.push(rings);
  }
  return out;
}

export async function loadOsmLand(): Promise<LandPolygon[]> {
  const file = path.join(CACHE, `${NAME}.zip`);
  let zip: Buffer;
  try {
    zip = await readFile(file);
  } catch {
    const res = await fetch(OSM_LAND_URL);
    if (!res.ok) throw new Error(`OpenStreetMap land polygons download failed: ${res.status}`);
    zip = Buffer.from(await res.arrayBuffer());
    await mkdir(CACHE, { recursive: true });
    await writeFile(file, zip);
  }
  return polygonsOf(unzipEntry(zip, '.shp'));
}

/** Area of a ring in square kilometres (spherical excess, good to a fraction of a percent). */
export function ringAreaKm2(ring: Ring): number {
  let sum = 0;
  const rad = Math.PI / 180;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i]!;
    const [x2, y2] = ring[(i + 1) % ring.length]!;
    sum += (x2 - x1) * rad * (2 + Math.sin(y1 * rad) + Math.sin(y2 * rad));
  }
  return Math.abs((sum * 6371.0088 * 6371.0088) / 2);
}
