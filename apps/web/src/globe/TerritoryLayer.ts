/**
 * Shows a TerritoryScene (territory.ts) on the globe as map tiles painted on demand, draped
 * like any imagery. A new scene (another date) is a new set of tiles: they load under the
 * old ones, which stay until the new are ready, so the colours never blink.
 */
import * as Cesium from 'cesium';
import type { TileLand } from './land';
import {
  paintCountries,
  paintZones,
  tileHasTerritory,
  tileHasZones,
  type TerritoryScene,
  type TileCell,
  type TileRect,
} from './territory';

const TILE = 256;
/**
 * A tile at this level is about 0.18° wide, a pixel of it some 75 m: as fine as the boundary
 * and coast data painted on it (about 100 m). Closer than that the colours' edges go soft.
 */
const MAX_LEVEL = 10;
/** If the new tiles are still loading after this, they are shown anyway. */
const SWAP_AFTER_MS = 1200;
/**
 * Tiles of countries kept from one scene to the next: while the timeline plays, only the war
 * zones change from hour to hour, and are painted over these.
 */
const KEPT_TILES = 220;

/** How much painting the tiles have taken (for diagnostics and performance checks). */
export const territoryPainting = { tiles: 0, kept: 0, ms: 0 };

let blank: HTMLCanvasElement | null = null;
let scratch: CanvasRenderingContext2D | null = null;
const kept = new Map<string, HTMLCanvasElement>();

const newCanvas = () =>
  Object.assign(document.createElement('canvas'), { width: TILE, height: TILE });

function blankTile(): HTMLCanvasElement {
  blank ??= Object.assign(document.createElement('canvas'), { width: 1, height: 1 });
  return blank;
}

/** The imagery provider Cesium asks for tiles (a plain latitude/longitude grid). */
class TerritoryTiles {
  readonly tilingScheme = new Cesium.GeographicTilingScheme();
  readonly rectangle = this.tilingScheme.rectangle;
  readonly tileWidth = TILE;
  readonly tileHeight = TILE;
  readonly minimumLevel = 0;
  readonly maximumLevel = MAX_LEVEL;
  readonly tileDiscardPolicy = undefined;
  readonly errorEvent = new Cesium.Event();
  // The colours are kept to OpenStreetMap's coastline (ODbL): credited with the map's other sources.
  readonly credit = new Cesium.Credit('Coastline © OpenStreetMap contributors', false);
  readonly proxy = undefined;
  readonly hasAlphaChannel = true;

  constructor(private readonly scene: TerritoryScene) {}

  getTileCredits(): Cesium.Credit[] {
    return [];
  }

  pickFeatures(): undefined {
    return undefined;
  }

  requestImage(x: number, y: number, level: number): Promise<HTMLCanvasElement> {
    const r = this.tilingScheme.tileXYToRectangle(x, y, level);
    const rect: TileRect = {
      west: Cesium.Math.toDegrees(r.west),
      south: Cesium.Math.toDegrees(r.south),
      east: Cesium.Math.toDegrees(r.east),
      north: Cesium.Math.toDegrees(r.north),
    };
    const scene = this.scene;
    if (!tileHasTerritory(scene, rect)) return Promise.resolve(blankTile());
    const source = scene.land;
    const cell = source?.detailed(level) ? source.cellAt(rect.west, rect.south) : null;
    const paint = (land: TileLand) => this.paint(`${level}/${x}/${y}`, rect, land, cell);
    // Without the land's outline (not loaded yet) the colours reach territorial waters.
    const land = source ? source.forTile(rect.west, rect.south, level) : 'land';
    return land instanceof Promise ? land.then(paint) : Promise.resolve(paint(land));
  }

  private paint(id: string, rect: TileRect, land: TileLand, cell: TileCell | null) {
    if (land === 'sea') return blankTile();
    const began = performance.now();
    try {
      return this.tile(id, rect, land, cell);
    } finally {
      territoryPainting.tiles++;
      territoryPainting.ms += performance.now() - began;
    }
  }

  private tile(id: string, rect: TileRect, land: TileLand, cell: TileCell | null) {
    const scene = this.scene;
    const key = `${scene.baseKey}/${id}`;
    let countries = kept.get(key);
    if (countries) {
      kept.delete(key);
      territoryPainting.kept++;
    } else {
      countries = newCanvas();
      const ctx = countries.getContext('2d');
      if (ctx) paintCountries(ctx, scene, rect, TILE, land, cell);
    }
    // Most recently used last; the oldest go when there are too many.
    kept.set(key, countries);
    if (kept.size > KEPT_TILES)
      for (const old of kept.keys()) {
        kept.delete(old);
        if (kept.size <= KEPT_TILES) break;
      }
    if (!tileHasZones(scene, rect)) return countries;
    const canvas = newCanvas();
    const ctx = canvas.getContext('2d');
    scratch ??= newCanvas().getContext('2d');
    if (!ctx || !scratch) return countries;
    ctx.drawImage(countries, 0, 0);
    paintZones(ctx, scratch, scene, countries, rect, TILE, cell);
    return canvas;
  }
}

export class TerritoryLayer {
  private current: Cesium.ImageryLayer | null = null;
  private pending: Cesium.ImageryLayer | null = null;
  private pendingSince = 0;
  private key: string | null = null;
  /** A scene asked for while another was still loading: shown next (the latest wins). */
  private queued: TerritoryScene | null = null;
  private stopWatching: (() => void) | null = null;
  stats = { countries: 0, zones: 0 };

  constructor(
    private readonly viewer: Cesium.Viewer,
    private readonly alpha = 0.46,
  ) {}

  set(scene: TerritoryScene | null): void {
    const layers = this.viewer.imageryLayers;
    if (!scene) {
      this.stopWatching?.();
      this.stopWatching = null;
      for (const layer of [this.current, this.pending]) if (layer) layers.remove(layer, true);
      this.current = this.pending = null;
      this.queued = null;
      this.key = null;
      this.stats = { countries: 0, zones: 0 };
      kept.clear();
      this.viewer.scene.requestRender();
      return;
    }
    if (scene.key === this.key) return;
    this.key = scene.key;
    this.stats = { countries: scene.polities.length, zones: scene.zones.length };
    if (this.pending) {
      // Let the one that is loading finish (scrubbing the timeline would otherwise restart
      // the load for ever and show nothing new); this one follows it.
      this.queued = scene;
      return;
    }
    const layer = new Cesium.ImageryLayer(
      new TerritoryTiles(scene) as unknown as Cesium.ImageryProvider,
      // Loaded unseen under the layer it replaces (a little, not zero: an invisible layer
      // may not be loaded at all).
      { alpha: this.current ? 0.004 : this.alpha },
    );
    layers.add(layer);
    if (!this.current) {
      this.current = layer;
      this.viewer.scene.requestRender();
      return;
    }
    this.pending = layer;
    this.pendingSince = performance.now();
    this.watch();
    this.viewer.scene.requestRender();
  }

  /** Swaps to the pending layer once its tiles are in. */
  private watch(): void {
    if (this.stopWatching) return;
    const scene = this.viewer.scene;
    this.stopWatching = scene.postRender.addEventListener(() => {
      if (!this.pending) {
        this.stopWatching?.();
        this.stopWatching = null;
        return;
      }
      const waited = performance.now() - this.pendingSince;
      // A frame or two must pass before the globe knows it has tiles to load.
      const ready = (waited > 60 && scene.globe.tilesLoaded) || waited > SWAP_AFTER_MS;
      if (!ready) {
        scene.requestRender();
        return;
      }
      this.pending.alpha = this.alpha;
      if (this.current) this.viewer.imageryLayers.remove(this.current, true);
      this.current = this.pending;
      this.pending = null;
      this.stopWatching?.();
      this.stopWatching = null;
      scene.requestRender();
      const next = this.queued;
      this.queued = null;
      if (next) {
        this.key = null;
        this.set(next);
      }
    });
  }

  destroy(): void {
    this.set(null);
  }
}
