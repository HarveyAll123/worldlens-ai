/**
 * Base-map providers behind a small interface so imagery/terrain can be swapped later.
 *
 *  - Satellite imagery: MapTiler "satellite-v2" raster tiles. The tile URL template is read
 *    from MapTiler's TileJSON (https://api.maptiler.com/tiles/satellite-v2/tiles.json?key=…)
 *    instead of being hard-coded.
 *  - Terrain: MapTiler "terrain-quantized-mesh-v2" via CesiumTerrainProvider (as in
 *    MapTiler's Cesium guide), without vertex normals (see createTerrain).
 *  - Fallback (no key or provider failure): Natural Earth II imagery bundled with CesiumJS
 *    (served locally, works offline) on the WGS84 ellipsoid.
 *  - Night lights: NASA GIBS VIIRS city lights, drawn only on the night side.
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

const GIBS_ATTRIBUTION =
  '<a href="https://www.earthdata.nasa.gov/data/tools/gibs" target="_blank" rel="noopener noreferrer">Night lights: NASA GIBS / VIIRS (2016)</a>';

type TileImage = ImageBitmap | HTMLImageElement | HTMLCanvasElement;

const LIFT = Uint8ClampedArray.from({ length: 256 }, (_, i) =>
  Math.round(255 * Math.sqrt(i / 255)),
);

/**
 * NASA's night-lights tiles are grey with the intensity repeated in the alpha channel, so dim
 * lights (and every light once tiles are averaged down for a whole-globe view) almost vanish.
 * Lift the intensity (square root, in colour and alpha alike) and give it the warm colour of
 * street lamps. The result keeps the input's type: Cesium flips ImageBitmaps itself when it
 * fetches them, so returning a canvas for a bitmap would turn tiles upside down.
 */
async function warmLights(image: TileImage): Promise<TileImage> {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return image;
  ctx.drawImage(image, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const p = data.data;
  for (let i = 0; i < p.length; i += 4) {
    const v = LIFT[p[i + 3]!]!;
    p[i] = v;
    p[i + 1] = v * 0.8;
    p[i + 2] = v * 0.48;
    p[i + 3] = v;
  }
  ctx.putImageData(data, 0, 0);
  return image instanceof ImageBitmap
    ? createImageBitmap(canvas, { premultiplyAlpha: 'none' })
    : canvas;
}

class WarmLightsProvider extends Cesium.UrlTemplateImageryProvider {
  override requestImage(
    x: number,
    y: number,
    level: number,
    request?: Cesium.Request,
  ): Promise<Cesium.ImageryTypes> | undefined {
    return super.requestImage(x, y, level, request)?.then((img) => warmLights(img as TileImage));
  }
}

/**
 * City lights for the night side: NASA GIBS "VIIRS_Night_Lights" (Suomi NPP, 2016 composite;
 * public domain, no key, CORS-enabled). Web Mercator tiles up to level 8 (~500 m).
 */
export function createNightLights(): Cesium.ImageryProvider {
  return new WarmLightsProvider({
    url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Night_Lights/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png',
    maximumLevel: 8,
    credit: new Cesium.Credit(GIBS_ATTRIBUTION, false),
  });
}

export async function createTerrain(
  key: string | undefined,
  enabled: boolean,
): Promise<{ kind: TerrainKind; provider: Cesium.TerrainProvider }> {
  if (!key || !enabled)
    return { kind: 'ellipsoid', provider: new Cesium.EllipsoidTerrainProvider() };
  try {
    // No vertex normals: with them Cesium switches to per-vertex terrain lighting, which ignores
    // the night-only alpha of the city-lights layer (lights showed in daylight) and never fades
    // the night out when zooming in. The satellite imagery already has its relief shading.
    const provider = await Cesium.CesiumTerrainProvider.fromUrl(
      new Cesium.Resource({
        url: 'https://api.maptiler.com/tiles/terrain-quantized-mesh-v2/',
        queryParameters: { key },
      }),
      { requestVertexNormals: false },
    );
    return { kind: 'maptiler', provider };
  } catch (err) {
    console.warn('[globe] MapTiler terrain unavailable, using ellipsoid', err);
    return { kind: 'ellipsoid', provider: new Cesium.EllipsoidTerrainProvider() };
  }
}
