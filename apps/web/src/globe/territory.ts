/**
 * The Territories layer: countries of the day filled with their colours, and — where a war's
 * front is reconstructed (packages/shared fronts.ts) — the ground each side holds inside the
 * other's countries in the holder's colour, so occupation shows and moves with the front.
 *
 * OpenHistoricalMap gives each country the ways that bound it, not a polygon: its rings are
 * stitched here from those ways (they share end points). Everything is painted to map tiles
 * on a canvas (painted over one another, then shown at one opacity, so overlapping countries
 * never add up) and kept to the land (land.ts): a country is bounded by its waters, and its
 * colour belongs on its ground. Up close the tiles are painted from the detailed ways and the
 * detailed coast; from far away, from the coarse ones.
 */
import {
  ringArea,
  ringFrom,
  stitchOrder,
  unwrapRing,
  type FrontTheatre,
  type LonLat,
  type RingStep,
} from '@worldlens/shared';
import type { LandRing, LandSource, TileLand } from './land';
import type { OhmPolity } from './ohm';
import { polityColor, sideColor } from './territoryColors';

export { stitchOrder, stitchRings } from '@worldlens/shared';

/* -------------------------------------------------------------------- shapes */

export interface PolityShape {
  name: string;
  tier: 2 | 3;
  color: string;
  /** Closed rings as flat [lon, lat, …]; longitudes run on past ±180 where a ring crosses it. */
  rings: number[][];
  /** West, south, east, north of the rings (east may exceed 180). */
  bbox: [number, number, number, number];
  area: number;
  /** Its boundary where that is a coast or lies at sea (lines, not rings). */
  coast: number[][];
  /**
   * How far past that boundary (degrees) its colour reaches on land that no country is mapped
   * as holding: islands and headlands just outside the line drawn for it.
   */
  reach: number;
  /** The same shape from the detailed ways loaded so far (null: none of this country's). */
  fine: { rings: number[][]; coast: number[][] } | null;
}

/** Twelve nautical miles, a state's territorial sea: land inside it is taken as the state's. */
const REACH_DEG = 0.2;

interface Outline {
  order: RingStep[][];
  /** Places in the country's way list of its ways at the coast or at sea. */
  coastal: number[];
  shape: PolityShape;
  /** Which detailed ways `shape.fine` was built from. */
  fineKey: string;
}

const outlines = new WeakMap<OhmPolity, Outline | null>();

function unwrapLine(line: number[]): number[] {
  const out = line.slice();
  let shift = 0;
  for (let k = 2; k < out.length; k += 2) {
    const step = line[k]! - line[k - 2]!;
    if (step > 180) shift -= 360;
    else if (step < -180) shift += 360;
    out[k] = line[k]! + shift;
  }
  return out;
}

/** Rings cut to the part of a shape that counts (carried ground), still closed on their first point. */
function kept(rings: number[][], clip: OhmPolity['clip']): number[][] {
  if (!clip) return rings;
  const out: number[][] = [];
  for (const ring of rings)
    for (const turn of [0, 360, -360]) {
      const cut = clipRing(ring, turn, clip);
      if (cut) out.push([...cut, cut[0]!, cut[1]!]);
    }
  return out;
}

function keptLines(lines: number[][], clip: OhmPolity['clip']): number[][] {
  if (!clip) return lines;
  return lines.flatMap((line) => [0, 360, -360].flatMap((turn) => clipLine(line, turn, clip)));
}

/**
 * A country's fillable shape from its boundary ways (kept per country). `classes` (one
 * character per way: '2' inland, otherwise coastal or at sea) says where its coast is;
 * `fine` holds the detailed lines of the ways loaded so far.
 */
export function polityShape(
  p: OhmPolity,
  coarse: number[][],
  classes?: string,
  fine?: Map<number, number[]>,
): PolityShape | null {
  let outline = outlines.get(p);
  if (outline === undefined) {
    const lines = p.ways.map((w) => coarse[w]);
    const order = stitchOrder(lines);
    const rings = kept(
      order
        .map((steps) => ringFrom(steps, (i) => lines[i]!))
        .filter((ring) => ring.length >= 8)
        .map(unwrapRing)
        .filter((r): r is number[] => !!r),
      p.clip,
    );
    outline = null;
    if (rings.length) {
      let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
      let area = 0;
      for (const r of rings) {
        area += ringArea(r);
        for (let k = 0; k < r.length; k += 2) {
          w = Math.min(w, r[k]!);
          e = Math.max(e, r[k]!);
          s = Math.min(s, r[k + 1]!);
          n = Math.max(n, r[k + 1]!);
        }
      }
      const coastal = classes
        ? p.ways.flatMap((way, i) =>
            classes[way] !== '2' && (lines[i]?.length ?? 0) >= 4 ? [i] : [],
          )
        : [];
      outline = {
        order,
        coastal,
        fineKey: '',
        shape: {
          name: p.name,
          tier: p.tier,
          color: polityColor(p.name),
          rings,
          bbox: [w, s, e, n],
          area,
          coast: keptLines(
            coastal.map((i) => unwrapLine(lines[i]!)),
            p.clip,
          ),
          // A city state's colour does not reach as far as a great power's.
          reach: Math.min(REACH_DEG, 0.25 * Math.sqrt(area)),
          fine: null,
        },
      };
    }
    outlines.set(p, outline);
  }
  if (!outline) return null;
  if (fine?.size) {
    let have = 0;
    let sum = 0;
    for (const way of p.ways)
      if ((fine.get(way)?.length ?? 0) >= 4) {
        have++;
        sum += way;
      }
    const fineKey = have ? `${have}:${sum}` : '';
    if (fineKey !== outline.fineKey) {
      const line = (i: number) => {
        const way = p.ways[i]!;
        const f = fine.get(way);
        return f && f.length >= 4 ? f : coarse[way]!;
      };
      // A new object: whatever was kept for the old shape (paths, pieces) is dropped with it.
      outline.shape = {
        ...outline.shape,
        fine: have
          ? {
              rings: kept(
                outline.order
                  .map((steps) => ringFrom(steps, line))
                  .filter((ring) => ring.length >= 8)
                  .map(unwrapRing)
                  .filter((r): r is number[] => !!r),
                p.clip,
              ),
              coast: keptLines(
                outline.coastal.map((i) => unwrapLine(line(i))),
                p.clip,
              ),
            }
          : null,
      };
      outline.fineKey = fineKey;
    }
  }
  return outline.shape;
}

export interface WarZone {
  id: string;
  colorA: string;
  colorB: string;
  /** Countries that are each side's own: ground the other side holds in them is recoloured. */
  politiesA: RegExp;
  politiesB: RegExp;
  /** The ground each side holds (small polygons of [lon, lat]). */
  a: LonLat[][];
  b: LonLat[][];
  bbox: [number, number, number, number];
}

export function warZone(
  theatre: FrontTheatre,
  areas: { a: LonLat[][]; b: LonLat[][] },
): WarZone | null {
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const poly of [...areas.a, ...areas.b])
    for (const [x, y] of poly) {
      w = Math.min(w, x);
      e = Math.max(e, x);
      s = Math.min(s, y);
      n = Math.max(n, y);
    }
  if (w === Infinity) return null;
  return {
    id: theatre.id,
    colorA: sideColor(theatre.colorA),
    colorB: sideColor(theatre.colorB),
    politiesA: new RegExp(theatre.politiesA, 'i'),
    politiesB: new RegExp(theatre.politiesB, 'i'),
    a: areas.a,
    b: areas.b,
    bbox: [w, s, e, n],
  };
}

export interface TerritoryScene {
  /** Changes whenever what is painted does. */
  key: string;
  /** Changes whenever the countries' own picture does (the war zones aside). */
  baseKey: string;
  /** In painting order: occupation regimes first, then states from the largest down. */
  polities: PolityShape[];
  zones: Array<WarZone & { ownA: PolityShape[]; ownB: PolityShape[] }>;
  /** Absent until it has loaded: the colours then reach territorial waters. */
  land: LandSource | null;
}

export function territoryScene(input: {
  active: OhmPolity[];
  /** Ground carried where nobody is mapped (OhmIndex.carried): painted under the countries. */
  carried?: OhmPolity[];
  coarse: number[][];
  /** One character per way: '2' inland, otherwise coastal or at sea. */
  classes?: string;
  /** Detailed lines of the ways loaded so far. */
  fine?: Map<number, number[]>;
  zones: WarZone[];
  land: LandSource | null;
  /** Names the set of countries (and the detail loaded); `zonesKey` the war zones' state. */
  baseKey: string;
  zonesKey: string;
}): TerritoryScene {
  const shapes = (list: OhmPolity[]) =>
    list
      .map((p) => polityShape(p, input.coarse, input.classes, input.fine))
      .filter((s): s is PolityShape => !!s)
      // Occupation regimes lie under the states (a state mapped over one wins); among states
      // the small ones are painted last, so enclaves and city states show.
      .sort((x, y) => (x.tier === y.tier ? y.area - x.area : y.tier - x.tier));
  // Carried ground under everything: whoever is mapped there is painted over it.
  const polities = [...shapes(input.carried ?? []), ...shapes(input.active)];
  const baseKey = `${input.baseKey}|${input.land ? 'land' : ''}`;
  return {
    key: `${baseKey}|${input.zonesKey}`,
    baseKey,
    polities,
    zones: input.zones.map((z) => ({
      ...z,
      ownA: polities.filter((p) => z.politiesA.test(p.name)),
      ownB: polities.filter((p) => z.politiesB.test(p.name)),
    })),
    land: input.land,
  };
}

/* ------------------------------------------------------------------ painting */

export interface TileRect {
  west: number;
  south: number;
  east: number;
  north: number;
}

/** The detailed cell a close-up tile lies in (land.ts): shapes are cut to it once, then reused. */
export interface TileCell {
  key: number;
  rect: [number, number, number, number];
}

/** The whole-degree turns (…, -360, 0, 360) at which a box meets a rectangle. */
function turns(
  bbox: [number, number, number, number],
  west: number,
  south: number,
  east: number,
  north: number,
  pad = 0,
): number[] {
  if (bbox[3] + pad < south || bbox[1] - pad > north) return [];
  const out: number[] = [];
  for (const t of [-360, 0, 360])
    if (bbox[2] + pad + t >= west && bbox[0] - pad + t <= east) out.push(t);
  return out;
}

/** Whether anything of the scene falls in the tile. */
export function tileHasTerritory(scene: TerritoryScene, rect: TileRect): boolean {
  return scene.polities.some(
    (p) => turns(p.bbox, rect.west, rect.south, rect.east, rect.north, p.reach).length > 0,
  );
}

/** Sutherland–Hodgman on a flat closed ring: the part on the kept side of one straight line. */
function clipHalf(ring: number[], axis: 0 | 1, at: number, keepGreater: boolean): number[] {
  const out: number[] = [];
  const n = ring.length;
  for (let k = 0; k < n; k += 2) {
    const j = (k + 2) % n;
    const a = ring[k + axis]!;
    const b = ring[j + axis]!;
    const ain = keepGreater ? a >= at : a <= at;
    const bin = keepGreater ? b >= at : b <= at;
    if (ain) out.push(ring[k]!, ring[k + 1]!);
    if (ain !== bin) {
      const t = (at - a) / (b - a);
      if (axis === 0) out.push(at, ring[k + 1]! + t * (ring[j + 1]! - ring[k + 1]!));
      else out.push(ring[k]! + t * (ring[j]! - ring[k]!), at);
    }
  }
  return out;
}

/** A closed flat ring (its last point repeating the first), moved `turn` degrees east, cut to a box. */
export function clipRing(
  ring: number[],
  turn: number,
  [w, s, e, n]: [number, number, number, number],
): number[] | null {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (let k = 0; k < ring.length; k += 2) {
    const x = ring[k]! + turn;
    const y = ring[k + 1]!;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  if (x1 < w || x0 > e || y1 < s || y0 > n) return null;
  let r = ring.slice(0, -2);
  if (turn) for (let k = 0; k < r.length; k += 2) r[k] = r[k]! + turn;
  if (x0 < w) r = clipHalf(r, 0, w, true);
  if (x1 > e) r = clipHalf(r, 0, e, false);
  if (y0 < s) r = clipHalf(r, 1, s, true);
  if (y1 > n) r = clipHalf(r, 1, n, false);
  return r.length >= 6 ? r : null;
}

/** The runs of a line that pass through a box (a point to either side kept, so strokes run on). */
export function clipLine(
  line: number[],
  turn: number,
  [w, s, e, n]: [number, number, number, number],
): number[][] {
  const out: number[][] = [];
  let run: number[] | null = null;
  const inside = (k: number) => {
    const x = line[k]! + turn;
    const y = line[k + 1]!;
    return x >= w && x <= e && y >= s && y <= n;
  };
  for (let k = 0; k < line.length; k += 2) {
    const here = inside(k);
    const near = here || (k >= 2 && inside(k - 2)) || (k + 2 < line.length && inside(k + 2));
    if (near) {
      if (!run) out.push((run = []));
      run.push(line[k]! + turn, line[k + 1]!);
    } else run = null;
  }
  return out.filter((r) => r.length >= 4);
}

interface Paths {
  fill?: Path2D;
  coast?: Path2D;
  /** Cut to a detailed cell, turns applied: by the cell's key. */
  cells?: Map<number, { fill: Path2D | null; coast: Path2D | null }>;
}

const paths = new WeakMap<object, Paths>();
const pathsOf = (o: object): Paths => {
  let p = paths.get(o);
  if (!p) paths.set(o, (p = {}));
  return p;
};

function ringsPath(rings: number[][]): Path2D {
  const path = new Path2D();
  for (const r of rings) {
    if (r.length < 6) continue;
    path.moveTo(r[0]!, r[1]!);
    for (let k = 2; k < r.length; k += 2) path.lineTo(r[k]!, r[k + 1]!);
    path.closePath();
  }
  return path;
}

function linesPath(lines: number[][]): Path2D {
  const path = new Path2D();
  for (const l of lines) {
    if (l.length < 4) continue;
    path.moveTo(l[0]!, l[1]!);
    for (let k = 2; k < l.length; k += 2) path.lineTo(l[k]!, l[k + 1]!);
  }
  return path;
}

/** Past a cell's edges, so a tile on the edge is painted whole. */
const CELL_PAD = 0.05;

/** A country's shape inside one detailed cell, from its detailed ways where they are loaded. */
function inCell(shape: PolityShape, cell: TileCell): { fill: Path2D | null; coast: Path2D | null } {
  const kept = pathsOf(shape);
  kept.cells ??= new Map();
  let piece = kept.cells.get(cell.key);
  if (piece) return piece;
  const [w, s, e, n] = cell.rect;
  const box: [number, number, number, number] = [
    w - CELL_PAD,
    s - CELL_PAD,
    e + CELL_PAD,
    n + CELL_PAD,
  ];
  const rings: number[][] = [];
  for (const t of turns(shape.bbox, box[0], box[1], box[2], box[3]))
    for (const ring of shape.fine?.rings ?? shape.rings) {
      const cut = clipRing(ring, t, box);
      if (cut) rings.push(cut);
    }
  const pad = shape.reach + CELL_PAD;
  const far: [number, number, number, number] = [w - pad, s - pad, e + pad, n + pad];
  const lines: number[][] = [];
  if (shape.reach > 0)
    for (const t of turns(shape.bbox, far[0], far[1], far[2], far[3], shape.reach))
      for (const line of shape.fine?.coast ?? shape.coast) lines.push(...clipLine(line, t, far));
  piece = {
    fill: rings.length ? ringsPath(rings) : null,
    coast: lines.length ? linesPath(lines) : null,
  };
  kept.cells.set(cell.key, piece);
  return piece;
}

function areaPath(polys: LonLat[][]): Path2D {
  const kept = pathsOf(polys);
  if (!kept.fill) {
    const path = new Path2D();
    for (const poly of polys) {
      path.moveTo(poly[0]![0], poly[0]![1]);
      for (let i = 1; i < poly.length; i++) path.lineTo(poly[i]![0], poly[i]![1]);
      path.closePath();
    }
    kept.fill = path;
  }
  return kept.fill;
}

function landPath(ring: LandRing): Path2D {
  const kept = pathsOf(ring);
  kept.fill ??= ringsPath([ring.flat]);
  return kept.fill;
}

type Ctx = CanvasRenderingContext2D;

function frame(rect: TileRect, size: number) {
  const sx = size / (rect.east - rect.west);
  const sy = size / (rect.north - rect.south);
  return {
    sx,
    sy,
    place: (c: Ctx, turn = 0) =>
      c.setTransform(sx, 0, 0, -sy, (turn - rect.west) * sx, rect.north * sy),
    matrix: (turn = 0) => new DOMMatrix([sx, 0, 0, -sy, (turn - rect.west) * sx, rect.north * sy]),
    reset: (c: Ctx) => {
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalCompositeOperation = 'source-over';
    },
  };
}

/**
 * Paints the countries of one map tile (a plain latitude/longitude rectangle) onto a square
 * canvas: each country's reach past its coast first, the countries over that, and all of it
 * kept to the land. `cell` is given for close-up tiles: shapes are then cut to it (and come
 * from the detailed ways).
 */
export function paintCountries(
  ctx: Ctx,
  scene: TerritoryScene,
  rect: TileRect,
  size: number,
  land: TileLand,
  cell: TileCell | null,
): void {
  const f = frame(rect, size);
  f.reset(ctx);
  ctx.clearRect(0, 0, size, size);
  if (land === 'sea') return;
  const near = scene.polities
    .map((shape) => ({
      shape,
      at: turns(shape.bbox, rect.west, rect.south, rect.east, rect.north, shape.reach),
    }))
    .filter((d) => d.at.length);
  if (!near.length) return;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'butt';
  for (const { shape, at } of near) {
    if (shape.reach <= 0) continue;
    ctx.strokeStyle = shape.color;
    ctx.lineWidth = shape.reach * 2;
    if (cell) {
      const piece = inCell(shape, cell).coast;
      if (!piece) continue;
      f.place(ctx);
      ctx.stroke(piece);
    } else if (shape.coast.length) {
      const kept = pathsOf(shape);
      kept.coast ??= linesPath(shape.coast);
      for (const t of at) {
        f.place(ctx, t);
        ctx.stroke(kept.coast);
      }
    }
  }
  for (const { shape, at } of near) {
    ctx.fillStyle = shape.color;
    if (cell) {
      const piece = inCell(shape, cell).fill;
      if (!piece) continue;
      f.place(ctx);
      ctx.fill(piece, 'evenodd');
    } else {
      const kept = pathsOf(shape);
      kept.fill ??= ringsPath(shape.rings);
      for (const t of at) {
        f.place(ctx, t);
        ctx.fill(kept.fill, 'evenodd');
      }
    }
  }
  f.reset(ctx);
  if (land === 'land') return;
  // Keep only what is on land, and off the great lakes.
  const meets = ([w, s, e, n]: LandRing['bbox']) =>
    e >= rect.west && w <= rect.east && n >= rect.south && s <= rect.north;
  const onTile = f.matrix();
  const ground = new Path2D();
  for (const ring of land.land) if (meets(ring.bbox)) ground.addPath(landPath(ring), onTile);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.fill(ground, 'evenodd');
  const water = new Path2D();
  let lakes = 0;
  for (const ring of land.lakes)
    if (meets(ring.bbox)) {
      water.addPath(landPath(ring), onTile);
      lakes++;
    }
  if (lakes) {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fill(water, 'evenodd');
  }
  f.reset(ctx);
}

/** Whether a war zone of the scene reaches the tile (it is then painted over the countries). */
export function tileHasZones(scene: TerritoryScene, rect: TileRect): boolean {
  return scene.zones.some(
    (z) => turns(z.bbox, rect.west, rect.south, rect.east, rect.north).length > 0,
  );
}

/**
 * Paints the war zones of a tile over its countries (`ctx` already holds them; `countries` is
 * that same picture, untouched): ground one side holds inside the other's countries, in the
 * holder's colour. `scratch` is a second canvas of the same size.
 */
export function paintZones(
  ctx: Ctx,
  scratch: Ctx,
  scene: TerritoryScene,
  countries: CanvasImageSource,
  rect: TileRect,
  size: number,
  cell: TileCell | null,
): void {
  const f = frame(rect, size);
  for (const zone of scene.zones) {
    const at = turns(zone.bbox, rect.west, rect.south, rect.east, rect.north);
    if (!at.length) continue;
    for (const [own, held, color] of [
      [zone.ownB, zone.a, zone.colorA],
      [zone.ownA, zone.b, zone.colorB],
    ] as Array<[PolityShape[], LonLat[][], string]>) {
      if (!held.length) continue;
      // Those countries' shapes on this tile, as one path (so one operation keeps to them).
      const inside = new Path2D();
      let any = false;
      for (const shape of own) {
        if (cell) {
          const piece = inCell(shape, cell).fill;
          if (!piece) continue;
          inside.addPath(piece, f.matrix());
          any = true;
        } else {
          const kept = pathsOf(shape);
          kept.fill ??= ringsPath(shape.rings);
          for (const t of turns(shape.bbox, rect.west, rect.south, rect.east, rect.north)) {
            inside.addPath(kept.fill, f.matrix(t));
            any = true;
          }
        }
      }
      if (!any) continue;
      f.reset(scratch);
      scratch.clearRect(0, 0, size, size);
      scratch.fillStyle = color;
      for (const t of at) {
        f.place(scratch, t);
        scratch.fill(areaPath(held));
      }
      scratch.setTransform(1, 0, 0, 1, 0, 0);
      scratch.globalCompositeOperation = 'destination-in';
      // (Not even–odd: two of those countries may overlap, and must not cancel out.)
      scratch.fill(inside, 'nonzero');
      // … and to what is painted at all: the land.
      scratch.drawImage(countries, 0, 0);
      f.reset(ctx);
      ctx.drawImage(scratch.canvas, 0, 0);
    }
  }
  f.reset(ctx);
}
