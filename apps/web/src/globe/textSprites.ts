/**
 * Sharp text for the globe: each string is drawn once, at the screen's own pixel density, into
 * a small bitmap that an overlay canvas then copies onto whole pixels every frame.
 *
 * Why not Cesium labels: they are part of the 3D picture. That picture is rendered below the
 * screen's resolution whenever frames get slow (perf/PerformanceManager) and stretched back, and
 * its letters come from one distance-field texture scaled to every size — small text smears
 * first. A 2D canvas above the globe keeps the screen's full resolution whatever the globe does.
 */

export interface TextStyle {
  /** CSS font shorthand. */
  font: string;
  /** Font size, CSS px. */
  size: number;
  fill: string;
  /** The dark edge round the letters. */
  halo: string;
  /** Its width, CSS px (half of it lies outside the letters). */
  haloWidth: number;
  /** Extra space between letters, CSS px. */
  tracking: number;
}

export interface Sprite {
  image: HTMLCanvasElement;
  /** The text's left edge and the middle of its capital letters, inside the image (device px). */
  ox: number;
  oy: number;
  /** The text's width, CSS px. */
  width: number;
}

/** A soft shadow under the edge: keeps a name apart from busy imagery without a plate. */
const GLOW_PX = 2.5;
const GLOW = 'rgba(0, 0, 0, 0.6)';
/** Inter: capital letters are this tall, so half of it above the baseline is their middle. */
const CAP_HEIGHT = 0.727;
const MAX_SPRITES = 700;

type Ctx = CanvasRenderingContext2D & { letterSpacing?: string };

function setFont(ctx: Ctx, style: TextStyle): void {
  ctx.font = style.font;
  // Not in every browser yet; where it is missing, names are simply unspaced (and measured so).
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${style.tracking}px`;
}

export class TextSprites {
  private sprites = new Map<TextStyle, Map<string, Sprite>>();
  private widths = new Map<TextStyle, Map<string, number>>();
  private count = 0;
  private measureCtx: Ctx | null | undefined;

  constructor(private dpr: number) {}

  /** The screen's pixel density changed (another display, browser zoom): draw afresh. */
  setDensity(dpr: number): void {
    if (dpr === this.dpr) return;
    this.dpr = dpr;
    this.sprites.clear();
    this.count = 0;
  }

  /** Fonts arrived or changed: widths and bitmaps made with the fallback font are stale. */
  clear(): void {
    this.sprites.clear();
    this.widths.clear();
    this.count = 0;
  }

  /** The width of a text in a style, CSS px. */
  measure(text: string, style: TextStyle): number {
    let byText = this.widths.get(style);
    if (!byText) this.widths.set(style, (byText = new Map()));
    const cached = byText.get(text);
    if (cached !== undefined) return cached;
    if (this.measureCtx === undefined)
      this.measureCtx = document.createElement('canvas').getContext('2d') as Ctx | null;
    let width = text.length * style.size * 0.56;
    if (this.measureCtx) {
      setFont(this.measureCtx, style);
      width = this.measureCtx.measureText(text).width;
    }
    byText.set(text, width);
    return width;
  }

  /** The bitmap of a text in a style (drawn on first use), or null where canvases are missing. */
  get(text: string, style: TextStyle): Sprite | null {
    let byText = this.sprites.get(style);
    if (!byText) this.sprites.set(style, (byText = new Map()));
    const cached = byText.get(text);
    if (cached) return cached;
    if (this.count >= MAX_SPRITES) {
      // A long session names thousands of places; start over rather than keep them all.
      this.sprites.clear();
      this.count = 0;
      this.sprites.set(style, (byText = new Map()));
    }
    const sprite = this.draw(text, style);
    if (sprite) {
      byText.set(text, sprite);
      this.count++;
    }
    return sprite;
  }

  private draw(text: string, style: TextStyle): Sprite | null {
    const image = document.createElement('canvas');
    const ctx = image.getContext('2d') as Ctx | null;
    if (!ctx) return null;
    const dpr = this.dpr;
    const width = this.measure(text, style);
    const pad = Math.ceil(style.haloWidth / 2 + GLOW_PX + 1);
    // Room for the tallest letters and accents above the baseline and the longest tails below.
    const above = Math.ceil(style.size * 1.08);
    const below = Math.ceil(style.size * 0.32);
    image.width = Math.ceil((width + pad * 2) * dpr);
    image.height = Math.ceil((above + below + pad * 2) * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    setFont(ctx, style);
    ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round';
    const x = pad;
    const baseline = pad + above;
    // 1. the soft shadow with the edge, 2. the edge again, firm, 3. the letters on top.
    ctx.strokeStyle = style.halo;
    ctx.lineWidth = style.haloWidth;
    ctx.shadowColor = GLOW;
    ctx.shadowBlur = GLOW_PX * dpr;
    ctx.strokeText(text, x, baseline);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.strokeText(text, x, baseline);
    ctx.fillStyle = style.fill;
    ctx.fillText(text, x, baseline);
    return {
      image,
      ox: Math.round(x * dpr),
      oy: Math.round((baseline - (style.size * CAP_HEIGHT) / 2) * dpr),
      width,
    };
  }
}
