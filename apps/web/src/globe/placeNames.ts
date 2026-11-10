/**
 * Which place names the globe shows, and where (pure; PlaceLabelLayer draws them).
 *
 * - What: each name appears from the web-map zoom Natural Earth gives it (cities by size, the
 *   Pacific before the Gulf of Aden), a little sooner or later by kind.
 * - Where: most important first, each only where it overlaps nothing already taken — event
 *   markers and titles, country names, open panels, and the names placed before it — up to a
 *   budget for the screen's size. Cities sit beside a small dot (right, else left); other names
 *   centre on their place. Re-run when the camera settles, never while it moves.
 */
import type { PlaceKindCode, PlaceName } from '@worldlens/shared';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Web-map zoom of a view (256-px tiles at the equator), from its metres per pixel. */
export function webZoom(metresPerPixel: number): number {
  return Math.log2(156_543.03 / Math.max(1e-3, metresPerPixel));
}

interface Style {
  size: number;
  italic: boolean;
  upper: boolean;
  /** Text brightness: water and land quieter than cities. */
  alpha: number;
  /** Shown this much sooner (+) or later (−) than Natural Earth's zoom. */
  bias: number;
  /** Placement priority over others at the same zoom. */
  weight: number;
  prefix?: string;
  /** Cities: a dot at the place, the name beside it. */
  dot?: 'city' | 'capital';
}

/**
 * Cartographic convention, monochrome (DESIGN.md): cities upright, capitals brighter; water
 * italic; mountain ranges, deserts and landforms in capitals, quieter; peaks with a ▲.
 */
export const PLACE_STYLE: Record<PlaceKindCode, Style> = {
  C: { size: 12, italic: false, upper: false, alpha: 0.95, bias: 0.4, weight: 40, dot: 'capital' },
  c: { size: 11, italic: false, upper: false, alpha: 0.82, bias: 0, weight: 20, dot: 'city' },
  o: { size: 12, italic: true, upper: true, alpha: 0.6, bias: 1, weight: 50 },
  s: { size: 11, italic: true, upper: false, alpha: 0.6, bias: 0.3, weight: 30 },
  l: { size: 10.5, italic: true, upper: false, alpha: 0.62, bias: 0, weight: 18 },
  r: { size: 10.5, italic: true, upper: false, alpha: 0.6, bias: -0.2, weight: 10 },
  m: { size: 10, italic: false, upper: true, alpha: 0.55, bias: 0.3, weight: 26 },
  p: { size: 10.5, italic: false, upper: false, alpha: 0.7, bias: -0.3, weight: 8, prefix: '▲ ' },
  d: { size: 10, italic: false, upper: true, alpha: 0.55, bias: 0.3, weight: 26 },
  f: { size: 10, italic: false, upper: true, alpha: 0.5, bias: -0.2, weight: 6 },
  i: { size: 10.5, italic: false, upper: false, alpha: 0.6, bias: -0.2, weight: 6 },
};

/** Names appear a little later than on a flat web map: the globe is busier. */
export const DENSITY_BIAS = -0.3;
/** The latest any kind appears relative to the zoom (for scanning the zoom-sorted list). */
export const MAX_BIAS = Math.max(...Object.values(PLACE_STYLE).map((s) => s.bias)) + DENSITY_BIAS;

export function placeText(p: Pick<PlaceName, 'name' | 'kind'>): string {
  const s = PLACE_STYLE[p.kind];
  return `${s.prefix ?? ''}${s.upper ? p.name.toUpperCase() : p.name}`;
}

export function placeFont(kind: PlaceKindCode): string {
  const s = PLACE_STYLE[kind];
  return `${s.italic ? 'italic ' : ''}400 ${s.size}px "Inter Variable", "Inter", system-ui, sans-serif`;
}

/** Whether a place's name belongs in a view at this zoom. */
export const inZoom = (p: PlaceName, zoom: number) =>
  p.minZoom <= zoom + PLACE_STYLE[p.kind].bias + DENSITY_BIAS;

/** How many names a screen holds before the globe gets busy. */
export const placeBudget = (width: number, height: number) =>
  Math.round(Math.min(90, Math.max(14, (width * height) / 15_000)));

export interface PlaceCandidate {
  place: PlaceName;
  /** Where the place is on screen. */
  x: number;
  y: number;
  /** The name's size on screen. */
  width: number;
  height: number;
}

export interface PlacedName {
  place: PlaceName;
  side: 'center' | 'right' | 'left';
  rect: Rect;
}

const DOT_GAP = 6;

const weightOf = (c: PlaceCandidate) => PLACE_STYLE[c.place.kind].weight - c.place.minZoom * 10;

export function placePlaceNames(
  candidates: PlaceCandidate[],
  obstacles: Rect[],
  budget: number,
  pad = 4,
): PlacedName[] {
  const taken: Rect[] = [...obstacles];
  const out: PlacedName[] = [];
  const clash = (r: Rect) =>
    taken.some(
      (o) =>
        r.x < o.x + o.width + pad &&
        r.x + r.width + pad > o.x &&
        r.y < o.y + o.height + pad &&
        r.y + r.height + pad > o.y,
    );
  const order = [...candidates].sort(
    (a, b) => weightOf(b) - weightOf(a) || a.place.id.localeCompare(b.place.id),
  );
  for (const c of order) {
    if (out.length >= budget) break;
    const top = c.y - c.height / 2;
    const dot = PLACE_STYLE[c.place.kind].dot;
    if (dot) {
      // The dot marks the place: it must be clear too, then the name beside it.
      const mark = { x: c.x - 4, y: c.y - 4, width: 8, height: 8 };
      if (clash(mark)) continue;
      const right = { x: c.x + DOT_GAP, y: top, width: c.width, height: c.height };
      const left = { x: c.x - DOT_GAP - c.width, y: top, width: c.width, height: c.height };
      const side = !clash(right) ? 'right' : !clash(left) ? 'left' : null;
      if (!side) continue;
      const rect = side === 'right' ? right : left;
      taken.push(mark, rect);
      out.push({ place: c.place, side, rect });
      continue;
    }
    const rect = { x: c.x - c.width / 2, y: top, width: c.width, height: c.height };
    if (clash(rect)) continue;
    taken.push(rect);
    out.push({ place: c.place, side: 'center', rect });
  }
  return out;
}
