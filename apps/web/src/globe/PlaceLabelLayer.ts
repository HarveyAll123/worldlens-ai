/**
 * Place names on the globe — cities, oceans and seas, lakes, rivers, mountains, deserts —
 * placed by placeNames.ts and drawn on a 2D canvas that lies over the 3D picture.
 *
 * - Sharp: the canvas has the screen's full resolution, whatever resolution the globe itself is
 *   rendered at (it drops when frames are slow), and every name is copied onto whole pixels
 *   from a bitmap drawn once (textSprites.ts). Names used to be Cesium labels, inside the 3D
 *   picture: soft at the best of times, smeared whenever the globe's resolution went down.
 * - Accurate as the view moves: each name is fixed to its place on the globe (at the terrain's
 *   height when 3D terrain is on, so a mountain's name does not slide off it as the camera
 *   tilts) and redrawn with every frame of the globe; names behind the globe are left out.
 * - Tidy: placed when the camera settles, after the event titles (EventLayer.relabel), so a
 *   name never covers an event's marker or title, a country name or a panel. While the view
 *   moves, a name that would run into an event steps aside until it is clear again. Names fade
 *   in and out.
 */
import * as Cesium from 'cesium';
import type { PlaceName } from '@worldlens/shared';
import {
  DOT_GAP,
  MAX_BIAS,
  PLACE_STYLE,
  inZoom,
  nameBox,
  nameHeight,
  namesInTheClear,
  placeBudget,
  placePlaceNames,
  placeText,
  placeTextStyle,
  webZoom,
  type PlaceCandidate,
  type Rect,
} from './placeNames';
import { TextSprites } from './textSprites';

interface Item {
  place: PlaceName;
  text: string;
  position: Cesium.Cartesian3;
}

interface Shown {
  item: Item;
  side: 'center' | 'right' | 'left';
  /** Where the name is fixed: its place, at the terrain's height when names sit on the ground. */
  position: Cesium.Cartesian3;
  height: number;
  /** Opacity now, on its way to `target`. */
  alpha: number;
  target: 0 | 1;
  /** Dropped by the last placement: fades out, then goes. */
  leaving: boolean;
  /** In front of the globe and in the frame, as of the last frame. */
  inView: boolean;
  /** Its place on screen as of the last frame, CSS px. */
  x: number;
  y: number;
}

const FADE_IN_MS = 180;
const FADE_OUT_MS = 110;
/** The longest step a fade takes in one frame (frames are far apart when the globe idles). */
const MAX_STEP_MS = 50;
/** Sharper than this is not visible, and a phone's canvas would get needlessly large. */
const MAX_DENSITY = 3;
/** Names this far outside the frame are still drawn (their text may reach into it). */
const MARGIN = 260;
/** Names put back on the terrain per frame (its detail arrives over time). */
const HEIGHTS_PER_FRAME = 6;
const TAU = Math.PI * 2;
const EDGE = 'rgba(4, 6, 10, 0.92)';

const scratchWin = new Cesium.Cartesian2();
const scratchNormal = new Cesium.Cartesian3();
const scratchDiff = new Cesium.Cartesian3();
const scratchCarto = new Cesium.Cartographic();

export class PlaceLabelLayer {
  private readonly canvas: HTMLCanvasElement;
  /** Made here (no canvas was given): removed again with the layer. */
  private readonly ownCanvas: boolean;
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly sprites: TextSprites;
  private items: Item[] = [];
  private byId = new Map<string, Item>();
  private shown = new Map<string, Shown>();
  /** What is drawn, most important first. */
  private order: Shown[] = [];
  private enabled = true;
  private clamp = false;
  /** The view the names were last placed for: any other view is "moving". */
  private placedView = new Cesium.Matrix4();
  private placedSize = { width: 0, height: 0 };
  private lastFrame = 0;
  private heightCursor = 0;
  private painted = false;
  private readonly instant = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  private readonly onFonts = () => {
    this.sprites.clear();
    this.onInvalidate?.();
    this.scene.requestRender();
  };
  /** What a name must keep clear of right now — event markers and titles, where they are. */
  liveObstacles: (() => Rect[]) | null = null;
  /** The names need placing again (a font arrived, so their widths changed). */
  onInvalidate: (() => void) | null = null;
  stats = { labels: 0 };

  /**
   * `canvas`: where to draw — an element laid exactly over the globe's own canvas, under every
   * panel, that lets clicks and touches through (GlobeView renders it). Without one, the layer
   * makes its own beside the globe's canvas.
   */
  constructor(
    private readonly scene: Cesium.Scene,
    canvas?: HTMLCanvasElement,
  ) {
    this.ownCanvas = !canvas;
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.setAttribute('aria-hidden', 'true');
      Object.assign(canvas.style, {
        position: 'absolute',
        left: '0',
        top: '0',
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      });
      scene.canvas.parentElement?.appendChild(canvas);
    }
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.sprites = new TextSprites(this.density());
    // A canvas draws with a web font only once it has loaded: ask for both faces now, and
    // draw afresh whenever one arrives (names in other alphabets bring their own files).
    const fonts = document.fonts as FontFaceSet | undefined;
    if (fonts?.addEventListener) {
      fonts.addEventListener('loadingdone', this.onFonts);
      void Promise.all(
        ['400', 'italic 400'].map((face) => fonts.load(`${face} 12px "Inter Variable"`)),
      ).then(this.onFonts, () => undefined);
    }
  }

  destroy(): void {
    (document.fonts as FontFaceSet | undefined)?.removeEventListener?.('loadingdone', this.onFonts);
    this.painted = true;
    this.wipe();
    if (this.ownCanvas) this.canvas.remove();
  }

  /** The names (sorted by zoom, as the data file is). */
  setPlaces(places: PlaceName[]): void {
    this.items = [...places]
      .sort((a, b) => a.minZoom - b.minZoom)
      .map((place) => ({
        place,
        text: placeText(place),
        position: Cesium.Cartesian3.fromDegrees(place.lon, place.lat),
      }));
    this.byId = new Map(this.items.map((i) => [i.place.id, i]));
    this.clear();
  }

  setEnabled(v: boolean): void {
    this.enabled = v;
    if (!v) this.clear();
  }

  /** With 3D terrain, names sit on the ground (their place, as the camera tilts). */
  setClampToGround(v: boolean): void {
    if (v === this.clamp) return;
    this.clamp = v;
    for (const s of this.order) this.settle(s);
    this.scene.requestRender();
  }

  private density(): number {
    return Math.min(MAX_DENSITY, Math.max(1, window.devicePixelRatio || 1));
  }

  private clear(): void {
    this.shown.clear();
    this.order = [];
    this.stats = { labels: 0 };
    this.wipe();
    this.scene.requestRender();
  }

  private wipe(): void {
    if (!this.painted) return;
    this.ctx?.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx?.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.painted = false;
  }

  private metresPerPixel(): number {
    const camera = this.scene.camera;
    const height = Math.max(1, camera.positionCartographic.height);
    const fovy = (camera.frustum as Cesium.PerspectiveFrustum).fovy ?? 1;
    return (2 * height * Math.tan(fovy / 2)) / Math.max(1, this.scene.canvas.clientHeight);
  }

  private facing(position: Cesium.Cartesian3): boolean {
    const n = this.scene.globe.ellipsoid.geodeticSurfaceNormal(position, scratchNormal);
    const toCamera = Cesium.Cartesian3.subtract(
      this.scene.camera.positionWC,
      position,
      scratchDiff,
    );
    return Cesium.Cartesian3.dot(toCamera, n) > 0;
  }

  /** Put a name on the ground under it (or back on the ellipsoid without 3D terrain). */
  private settle(s: Shown): void {
    const p = s.item.place;
    let height = 0;
    if (this.clamp) {
      const ground = this.scene.globe.getHeight(
        Cesium.Cartographic.fromDegrees(p.lon, p.lat, 0, scratchCarto),
      );
      // No terrain loaded there yet: keep what we had.
      if (ground === undefined) return;
      height = ground;
    }
    if (Math.abs(height - s.height) < 1) return;
    s.height = height;
    s.position =
      height === 0 ? s.item.position : Cesium.Cartesian3.fromDegrees(p.lon, p.lat, height);
  }

  /**
   * Re-place the names for the settled view. `obstacles`: screen boxes already taken (event
   * markers and titles, country names, panels); `safe`: the top bar and timeline margins.
   */
  relabel(obstacles: Rect[], safe: { top: number; bottom: number }): void {
    if (!this.enabled || this.items.length === 0) return this.clear();
    const width = this.scene.canvas.clientWidth;
    const height = this.scene.canvas.clientHeight;
    const zoom = webZoom(this.metresPerPixel());
    // What the camera sees (null when the sky shows): a cheap first cut before projecting.
    const view = this.scene.camera.computeViewRectangle(this.scene.globe.ellipsoid);
    const candidates: PlaceCandidate[] = [];
    for (const item of this.items) {
      const p = item.place;
      if (p.minZoom > zoom + MAX_BIAS) break;
      if (!inZoom(p, zoom)) continue;
      if (view && !Cesium.Rectangle.contains(view, Cesium.Cartographic.fromDegrees(p.lon, p.lat)))
        continue;
      // A name already shown is judged where it is drawn: on the terrain, when it sits there.
      const position = this.shown.get(p.id)?.position ?? item.position;
      if (!this.facing(position)) continue;
      const w = Cesium.SceneTransforms.worldToWindowCoordinates(this.scene, position, scratchWin);
      if (!w || w.x < 0 || w.x > width || w.y < safe.top || w.y > height - safe.bottom) continue;
      candidates.push({
        place: p,
        x: w.x,
        y: w.y,
        width: this.sprites.measure(item.text, placeTextStyle(p.kind)) + 4,
        height: nameHeight(p.kind),
      });
    }
    const placed = placePlaceNames(candidates, obstacles, placeBudget(width, height), 4, {
      width,
    });
    const keep = new Set(placed.map((p) => p.place.id));
    const leaving: Shown[] = [];
    for (const [id, s] of this.shown)
      if (!keep.has(id)) {
        s.leaving = true;
        s.target = 0;
        leaving.push(s);
      }
    const order: Shown[] = [];
    for (const p of placed) {
      let s = this.shown.get(p.place.id);
      if (!s) {
        const item = this.byId.get(p.place.id)!;
        s = {
          item,
          side: p.side,
          position: item.position,
          height: 0,
          alpha: 0,
          target: 1,
          leaving: false,
          inView: false,
          x: 0,
          y: 0,
        };
        this.settle(s);
        this.shown.set(p.place.id, s);
      }
      s.side = p.side;
      s.leaving = false;
      s.target = 1;
      order.push(s);
    }
    this.order = [...order, ...leaving];
    Cesium.Matrix4.clone(this.scene.camera.viewMatrix, this.placedView);
    this.placedSize = { width, height };
    this.stats = { labels: order.length };
    this.scene.requestRender();
  }

  /**
   * Where the names on screen are now (diagnostics and tests: nothing may overlap). Names that
   * stepped aside, are on their way out, or lie outside the frame are not on screen.
   */
  boxes(): { name: string; x: number; y: number; width: number; height: number }[] {
    const out: { name: string; x: number; y: number; width: number; height: number }[] = [];
    const frameWidth = this.scene.canvas.clientWidth;
    const frameHeight = this.scene.canvas.clientHeight;
    for (const s of this.order) {
      if (s.leaving || s.target === 0 || !this.facing(s.position)) continue;
      const w = Cesium.SceneTransforms.worldToWindowCoordinates(this.scene, s.position, scratchWin);
      if (!w) continue;
      const p = s.item.place;
      const width = this.sprites.measure(s.item.text, placeTextStyle(p.kind));
      const box = nameBox(w.x, w.y, s.side, width, nameHeight(p.kind) - 2);
      if (box.x > frameWidth || box.x + box.width < 0) continue;
      if (box.y > frameHeight || box.y + box.height < 0) continue;
      out.push({ name: p.name, ...box });
    }
    return out;
  }

  /**
   * With every frame of the globe: draw the names where their places are now, fade the new
   * ones in and the dropped ones out, and — while the view is not the one they were placed
   * for — let those that would touch an event step aside.
   */
  update(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const scene = this.scene;
    const width = scene.canvas.clientWidth;
    const height = scene.canvas.clientHeight;
    const dpr = this.density();
    const pw = Math.max(1, Math.round(width * dpr));
    const ph = Math.max(1, Math.round(height * dpr));
    if (this.canvas.width !== pw || this.canvas.height !== ph) {
      // Resizing empties a canvas.
      this.canvas.width = pw;
      this.canvas.height = ph;
      this.painted = false;
      this.sprites.setDensity(dpr);
    }
    if (this.order.length === 0) return this.wipe();
    const now = performance.now();
    const step = this.instant ? Infinity : Math.min(MAX_STEP_MS, now - this.lastFrame);
    this.lastFrame = now;

    for (const s of this.order) {
      s.inView = false;
      if (!this.facing(s.position)) continue;
      const w = Cesium.SceneTransforms.worldToWindowCoordinates(scene, s.position, scratchWin);
      if (!w || w.x < -MARGIN || w.x > width + MARGIN || w.y < -MARGIN || w.y > height + MARGIN)
        continue;
      s.x = w.x;
      s.y = w.y;
      s.inView = true;
    }

    const moving =
      !Cesium.Matrix4.equals(scene.camera.viewMatrix, this.placedView) ||
      width !== this.placedSize.width ||
      height !== this.placedSize.height;
    if (moving) {
      const live = this.order.filter((s) => s.inView && !s.leaving);
      const clear = namesInTheClear(
        live.map((s) => {
          const kind = s.item.place.kind;
          const text = this.sprites.measure(s.item.text, placeTextStyle(kind));
          return {
            box: nameBox(s.x, s.y, s.side, text, nameHeight(kind) - 2),
            dot: PLACE_STYLE[kind].dot ? { x: s.x, y: s.y } : null,
            hidden: s.target === 0,
          };
        }),
        this.liveObstacles?.() ?? [],
      );
      live.forEach((s, i) => (s.target = clear[i] ? 1 : 0));
    } else {
      // The view they were placed for: every placed name has its room.
      for (const s of this.order) if (!s.leaving) s.target = 1;
    }

    if (this.clamp)
      for (let i = 0; i < Math.min(HEIGHTS_PER_FRAME, this.order.length); i++) {
        this.heightCursor = (this.heightCursor + 1) % this.order.length;
        this.settle(this.order[this.heightCursor]!);
      }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, pw, ph);
    let animating = false;
    let gone = false;
    for (const s of this.order) {
      if (s.alpha !== s.target) {
        s.alpha =
          s.target > s.alpha
            ? Math.min(1, s.alpha + step / FADE_IN_MS)
            : Math.max(0, s.alpha - step / FADE_OUT_MS);
        if (s.alpha !== s.target) animating = true;
      }
      if (s.leaving && s.alpha === 0) gone = true;
      else if (s.inView && s.alpha > 0) this.paint(ctx, s, dpr);
    }
    ctx.globalAlpha = 1;
    this.painted = true;
    if (gone) {
      this.order = this.order.filter((s) => !(s.leaving && s.alpha === 0));
      for (const [id, s] of this.shown) if (s.leaving && s.alpha === 0) this.shown.delete(id);
    }
    // The globe draws only when asked: keep it going until the fades are done.
    if (animating) scene.requestRender();
  }

  /** One name (and its dot), on whole device pixels. */
  private paint(ctx: CanvasRenderingContext2D, s: Shown, dpr: number): void {
    const kind = s.item.place.kind;
    const sprite = this.sprites.get(s.item.text, placeTextStyle(kind));
    if (!sprite) return;
    const x = Math.round(s.x * dpr);
    const y = Math.round(s.y * dpr);
    ctx.globalAlpha = s.alpha;
    const dot = PLACE_STYLE[kind].dot;
    if (dot === 'capital') {
      // A capital is a ring, a city a dot — small and white, unlike event markers.
      ctx.beginPath();
      ctx.arc(x, y, 3.2 * dpr, 0, TAU);
      ctx.lineWidth = 3.6 * dpr;
      ctx.strokeStyle = EDGE;
      ctx.stroke();
      ctx.lineWidth = 1.6 * dpr;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
    } else if (dot === 'city') {
      ctx.beginPath();
      ctx.arc(x, y, 3.2 * dpr, 0, TAU);
      ctx.fillStyle = EDGE;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y, 2.2 * dpr, 0, TAU);
      ctx.fillStyle = '#f3f5f8';
      ctx.fill();
    }
    const text = Math.round(sprite.width * dpr);
    const gap = Math.round(DOT_GAP * dpr);
    const left =
      s.side === 'right' ? x + gap : s.side === 'left' ? x - gap - text : x - Math.round(text / 2);
    ctx.drawImage(sprite.image, left - sprite.ox, y - sprite.oy);
  }
}
