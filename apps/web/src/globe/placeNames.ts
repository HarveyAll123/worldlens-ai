/**
 * Which place names the globe shows, where, and how they look (pure; PlaceLabelLayer draws them).
 *
 * - What: each name appears from the web-map zoom Natural Earth gives it (cities by size, the
 *   Pacific before the Gulf of Aden), a little sooner or later by kind.
 * - Where: most important first, each only where it overlaps nothing already taken — event
 *   markers and titles, country names, open panels, and the names placed before it — up to a
 *   budget for the screen's size. Cities sit beside a small dot (right, else left); other names
 *   centre on their place. Re-run when the camera settles, never while it moves.
 * - In between, while the view moves: no name is added, but one that would touch an event's
 *   marker or title, or a more important name, steps aside until it is clear (namesInTheClear).
 */
import type { PlaceKindCode, PlaceName } from '@worldlens/shared';
import type { TextStyle } from './textSprites';

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
  /** Text colour: brightness is the hierarchy — capitals brightest, landforms quietest. */
  color: string;
  /** Space between letters, in em: names in capitals read better spaced. */
  tracking: number;
  /** Shown this much sooner (+) or later (−) than Natural Earth's zoom. */
  bias: number;
  /** Placement priority over others at the same zoom. */
  weight: number;
  prefix?: string;
  /** Cities: a dot at the place, the name beside it. */
  dot?: 'city' | 'capital';
}

/**
 * Cartographic convention, monochrome (DESIGN.md): cities upright, capitals brighter and a
 * size up; water italic; mountain ranges, deserts and landforms in spaced capitals; peaks with
 * a ▲. Every colour is opaque and near white — a name has to read on snow, sand, sea and the
 * night side alike — so the hierarchy is size and brightness, never see-through text.
 */
export const PLACE_STYLE: Record<PlaceKindCode, Style> = {
  C: {
    size: 13.5,
    italic: false,
    upper: false,
    color: '#ffffff',
    tracking: 0,
    bias: 0.4,
    weight: 40,
    dot: 'capital',
  },
  c: {
    size: 12.5,
    italic: false,
    upper: false,
    color: '#f3f5f8',
    tracking: 0,
    bias: 0,
    weight: 20,
    dot: 'city',
  },
  o: {
    size: 13.5,
    italic: true,
    upper: true,
    color: '#e7ecf3',
    tracking: 0.16,
    bias: 1,
    weight: 50,
  },
  s: {
    size: 12.5,
    italic: true,
    upper: false,
    color: '#e7ecf3',
    tracking: 0.02,
    bias: 0.3,
    weight: 30,
  },
  l: {
    size: 12,
    italic: true,
    upper: false,
    color: '#e4e9f0',
    tracking: 0.02,
    bias: 0,
    weight: 18,
  },
  r: {
    size: 12,
    italic: true,
    upper: false,
    color: '#e4e9f0',
    tracking: 0.02,
    bias: -0.2,
    weight: 10,
  },
  m: {
    size: 11.5,
    italic: false,
    upper: true,
    color: '#e2e6ec',
    tracking: 0.1,
    bias: 0.3,
    weight: 26,
  },
  p: {
    size: 12,
    italic: false,
    upper: false,
    color: '#eceff3',
    tracking: 0,
    bias: -0.3,
    weight: 8,
    prefix: '▲ ',
  },
  d: {
    size: 11.5,
    italic: false,
    upper: true,
    color: '#e2e6ec',
    tracking: 0.1,
    bias: 0.3,
    weight: 26,
  },
  f: {
    size: 11,
    italic: false,
    upper: true,
    color: '#d9dee5',
    tracking: 0.08,
    bias: -0.2,
    weight: 6,
  },
  i: {
    size: 12,
    italic: false,
    upper: false,
    color: '#e7ecf3',
    tracking: 0,
    bias: -0.2,
    weight: 6,
  },
};

/** The dark edge that separates a name from whatever is behind it. */
const HALO = 'rgba(4, 6, 10, 0.92)';

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

const textStyles = new Map<PlaceKindCode, TextStyle>();
/** How a kind of name is drawn (one object per kind, so drawn names can be cached by it). */
export function placeTextStyle(kind: PlaceKindCode): TextStyle {
  let style = textStyles.get(kind);
  if (!style) {
    const s = PLACE_STYLE[kind];
    style = {
      font: placeFont(kind),
      size: s.size,
      fill: s.color,
      halo: HALO,
      haloWidth: 3,
      tracking: s.tracking * s.size,
    };
    textStyles.set(kind, style);
  }
  return style;
}

/** A name's box on screen: its width is the text's, its height the line's. */
export const nameHeight = (kind: PlaceKindCode) => PLACE_STYLE[kind].size + 5;

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

export const DOT_GAP = 6;

/** Where a name's box is, for a place at (x, y): beside its dot, or centred on the place. */
export function nameBox(
  x: number,
  y: number,
  side: PlacedName['side'],
  width: number,
  height: number,
): Rect {
  const left =
    side === 'right' ? x + DOT_GAP : side === 'left' ? x - DOT_GAP - width : x - width / 2;
  return { x: left, y: y - height / 2, width, height };
}

const overlap = (a: Rect, b: Rect, pad: number) =>
  a.x < b.x + b.width + pad &&
  a.x + a.width + pad > b.x &&
  a.y < b.y + b.height + pad &&
  a.y + a.height + pad > b.y;

export interface MovingName {
  /** The name's box where its place is on screen now. */
  box: Rect;
  /** The place on screen, when the name has a dot there (cities). */
  dot: { x: number; y: number } | null;
  /** Hidden since an earlier frame. */
  hidden: boolean;
}

/** A hidden name returns only with this much room, a shown one leaves at this little. */
const RETURN_PAD = 7;
const LEAVE_PAD = 2;

/**
 * Between two placements, while the view moves: which of the shown names (most important first)
 * may stay — those clear of every obstacle (event markers and titles, which move with the map
 * but not in step with the names when the view zooms or tilts) and of the names kept before
 * them. Nothing is added here; a name that stepped aside needs a wider gap to come back than it
 * needed to stay, so it does not flicker on the edge.
 */
export function namesInTheClear(names: MovingName[], obstacles: Rect[]): boolean[] {
  const kept: Rect[] = [];
  return names.map((n) => {
    const pad = n.hidden ? RETURN_PAD : LEAVE_PAD;
    const mark = n.dot ? { x: n.dot.x - 4, y: n.dot.y - 4, width: 8, height: 8 } : null;
    const hit = (o: Rect) => overlap(n.box, o, pad) || (mark !== null && overlap(mark, o, pad));
    if (obstacles.some(hit) || kept.some(hit)) return false;
    kept.push(n.box);
    if (mark) kept.push(mark);
    return true;
  });
}

const weightOf = (c: PlaceCandidate) => PLACE_STYLE[c.place.kind].weight - c.place.minZoom * 10;

/** A centred name may run this far (of its width) past the screen's edge; a city's not at all. */
const MAX_CUT = 0.3;

/**
 * `frame`: the screen's width. A city's name goes on the side where all of it shows (a name cut
 * off at the edge reads as a mistake: "Københ"); with room on neither side it waits for a view
 * that has it. A centred name — a sea, a range — may run a little over the edge.
 */
export function placePlaceNames(
  candidates: PlaceCandidate[],
  obstacles: Rect[],
  budget: number,
  pad = 4,
  frame?: { width: number },
): PlacedName[] {
  const taken: Rect[] = [...obstacles];
  const out: PlacedName[] = [];
  const shows = (r: Rect, cut: number) => {
    if (!frame) return true;
    const hidden = Math.max(0, -r.x) + Math.max(0, r.x + r.width - frame.width);
    return hidden <= r.width * cut;
  };
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
      const free = (r: Rect) => shows(r, 0) && !clash(r);
      const side = free(right) ? 'right' : free(left) ? 'left' : null;
      if (!side) continue;
      const rect = side === 'right' ? right : left;
      taken.push(mark, rect);
      out.push({ place: c.place, side, rect });
      continue;
    }
    const rect = { x: c.x - c.width / 2, y: top, width: c.width, height: c.height };
    if (!shows(rect, MAX_CUT) || clash(rect)) continue;
    taken.push(rect);
    out.push({ place: c.place, side: 'center', rect });
  }
  return out;
}
