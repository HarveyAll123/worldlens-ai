/**
 * The land's outline for the Territories layer: countries' colours are kept on it, off the
 * sea and the great lakes (OpenHistoricalMap bounds a country by its waters, not its coast).
 *
 * Built by `pnpm data:land` (scripts/build-land.ts) from OpenStreetMap's coastline, in two
 * levels: the whole world coarsely, for map tiles seen from far away, and a grid of cells in
 * detail (about 150 m), each fetched when a tile inside it is first painted.
 */

export interface LandRing {
  /** Flat [lon, lat, …]; the ring closes back to its first point. */
  flat: number[];
  /** West, south, east, north. */
  bbox: [number, number, number, number];
}

export interface LandShape {
  land: LandRing[];
  /** Large lakes (their islands as rings inside them): cut out of the land. */
  lakes: LandRing[];
}

export interface LandJson {
  scale: number;
  land: number[][];
  lakes?: number[][];
}

function decodeRing(deltas: number[], scale: number): LandRing {
  const flat: number[] = [];
  let [x, y] = [0, 0];
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  for (let k = 0; k + 1 < deltas.length; k += 2) {
    x = k ? x + deltas[k]! : deltas[k]!;
    y = k ? y + deltas[k + 1]! : deltas[k + 1]!;
    const lon = x / scale;
    const lat = y / scale;
    flat.push(lon, lat);
    if (lon < w) w = lon;
    if (lon > e) e = lon;
    if (lat < s) s = lat;
    if (lat > n) n = lat;
  }
  return { flat, bbox: [w, s, e, n] };
}

/** Rings stored as whole numbers of 1/scale degrees, each point after the first a difference. */
export function decodeLand(json: LandJson): LandShape {
  return {
    land: json.land.map((r) => decodeRing(r, json.scale)),
    lakes: (json.lakes ?? []).map((r) => decodeRing(r, json.scale)),
  };
}

export interface LandCellIndex {
  /** Cells are the map tiles of this level of the plain latitude/longitude grid. */
  level: number;
  deg: number;
  cols: number;
  rows: number;
  /** One character per cell, west to east then south to north: 0 sea, 1 land, 2 has a file. */
  kinds: string;
}

/** What a map tile's colours are kept to: nothing (open sea), everything, or these shapes. */
export type TileLand = LandShape | 'sea' | 'land';

/**
 * Land for any map tile: the coarse world for tiles above the cells' level, the tile's cell
 * (fetched once, then kept) from there down.
 */
export class LandSource {
  private readonly cells = new Map<number, TileLand | Promise<TileLand>>();

  constructor(
    readonly low: LandShape,
    private readonly index: LandCellIndex | null,
    private readonly fetchCell: (name: string) => Promise<LandJson>,
  ) {}

  /** Whether tiles of this level are painted from the detailed cells. */
  detailed(level: number): boolean {
    return !!this.index && level >= this.index.level;
  }

  /** The detailed cell that holds a point (its tile's south-west corner, say). */
  cellAt(lon: number, lat: number): { key: number; rect: [number, number, number, number] } | null {
    const i = this.index;
    if (!i) return null;
    const eps = i.deg * 1e-6;
    const col = Math.min(i.cols - 1, Math.max(0, Math.floor((lon + 180 + eps) / i.deg)));
    const row = Math.min(i.rows - 1, Math.max(0, Math.floor((lat + 90 + eps) / i.deg)));
    const west = -180 + col * i.deg;
    const south = -90 + row * i.deg;
    return { key: row * i.cols + col, rect: [west, south, west + i.deg, south + i.deg] };
  }

  /** Land for the tile of `level` whose south-west corner is here; a promise while its cell loads. */
  forTile(west: number, south: number, level: number): TileLand | Promise<TileLand> {
    const i = this.index;
    if (!i || level < i.level) return this.low;
    const cell = this.cellAt(west, south)!;
    const known = this.cells.get(cell.key);
    if (known) return known;
    const kind = i.kinds[cell.key];
    if (kind !== '2') {
      const value: TileLand = kind === '1' ? 'land' : 'sea';
      this.cells.set(cell.key, value);
      return value;
    }
    const name = `c${cell.key % i.cols}_${Math.floor(cell.key / i.cols)}`;
    const loading = this.fetchCell(name).then(
      (json): TileLand => {
        const shape = decodeLand(json);
        this.cells.set(cell.key, shape);
        return shape;
      },
      (): TileLand => {
        // Not to be had (offline): the coarse outline will do, and is asked for again later.
        this.cells.delete(cell.key);
        return this.low;
      },
    );
    this.cells.set(cell.key, loading);
    return loading;
  }
}
