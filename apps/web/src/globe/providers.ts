/**
 * Base-map providers behind a small interface so imagery/terrain can be swapped later.
 *
 *  - Satellite imagery: MapTiler "satellite-v2" raster tiles. The tile URL template is read
 *    from MapTiler's TileJSON (https://api.maptiler.com/tiles/satellite-v2/tiles.json?key=…)
 *    instead of being hard-coded.
 *  - Terrain: MapTiler "terrain-quantized-mesh-v2" via CesiumTerrainProvider (as in
 *    MapTiler's Cesium guide), with vertex normals for lighting.
 *  - Fallback (no key or provider failure): Natural Earth II imagery bundled with CesiumJS
 *    (served locally, works offline) on the WGS84 ellipsoid.
 */
import * as Cesium from 'cesium';

export type ImageryKind = 'maptiler-satellite' | 'natural-earth-ii';
export type TerrainKind = 'maptiler' | 'ellipsoid';

export interface BaseMap {
  imagery: ImageryKind;
  provider: Cesium.ImageryProvider;
  notice: string | null;
}

const MAPTILER_ATTRIBUTION =
  '<a href="https://www.maptiler.com/copyright/" target="_blank" rel="noopener noreferrer">© MapTiler</a> ' +
  '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a>';

interface TileJson {
  tiles?: unknown;
  maxzoom?: unknown;
  minzoom?: unknown;
  tileSize?: unknown;
}

function isMapTilerTemplate(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  try {
    const u = new URL(v.replace(/\{[xyz]\}/g, '0'));
    return u.protocol === 'https:' && u.hostname.endsWith('maptiler.com');
  } catch {
    return false;
  }
}

async function naturalEarth(notice: string | null): Promise<BaseMap> {
  const provider = await Cesium.TileMapServiceImageryProvider.fromUrl(
    Cesium.buildModuleUrl('Assets/Textures/NaturalEarthII'),
  );
  return { imagery: 'natural-earth-ii', provider, notice };
}

export async function createBaseMap(key: string | undefined): Promise<BaseMap> {
  if (!key) {
    return naturalEarth(
      'Development imagery (Natural Earth II, bundled with CesiumJS). Add VITE_MAPTILER_API_KEY for satellite imagery and terrain.',
    );
  }
  try {
    const res = await fetch(
      `https://api.maptiler.com/tiles/satellite-v2/tiles.json?key=${encodeURIComponent(key)}`,
    );
    if (!res.ok) throw new Error(`MapTiler TileJSON HTTP ${res.status}`);
    const tj = (await res.json()) as TileJson;
    const template = Array.isArray(tj.tiles) ? tj.tiles[0] : null;
    if (!isMapTilerTemplate(template)) throw new Error('Unexpected MapTiler TileJSON');
    const maxzoom = typeof tj.maxzoom === 'number' ? tj.maxzoom : 19;
    const size = typeof tj.tileSize === 'number' ? tj.tileSize : 256;
    const provider = new Cesium.UrlTemplateImageryProvider({
      url: template,
      maximumLevel: maxzoom,
      tileWidth: size,
      tileHeight: size,
      credit: new Cesium.Credit(MAPTILER_ATTRIBUTION, true),
    });
    return { imagery: 'maptiler-satellite', provider, notice: null };
  } catch (err) {
    console.warn('[globe] MapTiler imagery unavailable, using fallback', err);
    return naturalEarth(
      'Satellite imagery is unavailable right now — showing bundled Natural Earth II imagery.',
    );
  }
}

export async function createTerrain(
  key: string | undefined,
  enabled: boolean,
): Promise<{ kind: TerrainKind; provider: Cesium.TerrainProvider }> {
  if (!key || !enabled)
    return { kind: 'ellipsoid', provider: new Cesium.EllipsoidTerrainProvider() };
  try {
    const provider = await Cesium.CesiumTerrainProvider.fromUrl(
      new Cesium.Resource({
        url: 'https://api.maptiler.com/tiles/terrain-quantized-mesh-v2/',
        queryParameters: { key },
      }),
      { requestVertexNormals: true },
    );
    return { kind: 'maptiler', provider };
  } catch (err) {
    console.warn('[globe] MapTiler terrain unavailable, using ellipsoid', err);
    return { kind: 'ellipsoid', provider: new Cesium.EllipsoidTerrainProvider() };
  }
}
