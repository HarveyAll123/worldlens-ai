/**
 * Place names on the globe — cities, oceans and seas, lakes, rivers, mountains, deserts —
 * drawn as Cesium labels (and small dots for cities), placed by placeNames.ts.
 *
 * - Accurate as the view moves: each name is fixed to its place on the globe (clamped to the
 *   terrain when 3D terrain is on, so a mountain's name does not slide off it as the camera
 *   tilts); names behind the globe are hidden every frame.
 * - Tidy: re-placed when the camera settles, after the event titles (EventLayer.relabel), so a
 *   name never covers an event's marker or title, a country name or a panel. New names fade in.
 */
import * as Cesium from 'cesium';
import type { PlaceName } from '@worldlens/shared';
import {
  MAX_BIAS,
  PLACE_STYLE,
  inZoom,
  placeBudget,
  placeFont,
  placePlaceNames,
  placeText,
  webZoom,
  type PlaceCandidate,
  type Rect,
} from './placeNames';

interface Item {
  place: PlaceName;
  position: Cesium.Cartesian3;
}

interface Shown {
  label: Cesium.Label;
  dot: Cesium.PointPrimitive | null;
  side: 'center' | 'right' | 'left';
  /** When it appeared (fades in over FADE_MS). */
  born: number;
  alpha: number;
  facing: boolean;
  item: Item;
}

const FADE_MS = 180;
const scratchWin = new Cesium.Cartesian2();
const scratchNormal = new Cesium.Cartesian3();
const scratchDiff = new Cesium.Cartesian3();
const TEXT = Cesium.Color.fromCssColorString('#f8fafc');
const HALO = Cesium.Color.fromCssColorString('#05070b');

let measureCtx: CanvasRenderingContext2D | null | undefined;
const widths = new Map<string, number>();
/** The rendered width of a name in its font (cached). */
function textWidth(text: string, font: string): number {
  const key = `${font}|${text}`;
  const cached = widths.get(key);
  if (cached !== undefined) return cached;
  if (measureCtx === undefined) measureCtx = document.createElement('canvas').getContext('2d');
  let w = text.length * 6.5;
  if (measureCtx) {
    measureCtx.font = font;
    w = measureCtx.measureText(text).width;
  }
  widths.set(key, w);
  return w;
}

export class PlaceLabelLayer {
  private labels: Cesium.LabelCollection;
  private dots = new Cesium.PointPrimitiveCollection();
  private items: Item[] = [];
  private shown = new Map<string, Shown>();
  private enabled = true;
  private clamp = false;
  stats = { labels: 0 };

  constructor(private readonly scene: Cesium.Scene) {
    // `scene` lets names clamp to the terrain; the translucent pass draws them after markers.
    this.labels = new Cesium.LabelCollection({
      scene,
      blendOption: Cesium.BlendOption.TRANSLUCENT,
    });
    scene.primitives.add(this.dots);
    scene.primitives.add(this.labels);
  }

  destroy(): void {
    this.scene.primitives.remove(this.labels);
    this.scene.primitives.remove(this.dots);
  }

  /** The names (sorted by zoom, as the data file is). */
  setPlaces(places: PlaceName[]): void {
    this.items = [...places]
      .sort((a, b) => a.minZoom - b.minZoom)
      .map((place) => ({ place, position: Cesium.Cartesian3.fromDegrees(place.lon, place.lat) }));
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
    for (const s of this.shown.values()) s.label.heightReference = this.heightReference();
  }

  private heightReference(): Cesium.HeightReference {
    return this.clamp ? Cesium.HeightReference.CLAMP_TO_GROUND : Cesium.HeightReference.NONE;
  }

  private clear(): void {
    this.labels.removeAll();
    this.dots.removeAll();
    this.shown.clear();
    this.stats = { labels: 0 };
    this.scene.requestRender();
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
      if (!this.facing(item.position)) continue;
      const w = Cesium.SceneTransforms.worldToWindowCoordinates(
        this.scene,
        item.position,
        scratchWin,
      );
      if (!w || w.x < 0 || w.x > width || w.y < safe.top || w.y > height - safe.bottom) continue;
      const text = placeText(p);
      const style = PLACE_STYLE[p.kind];
      candidates.push({
        place: p,
        x: w.x,
        y: w.y,
        width: textWidth(text, placeFont(p.kind)) + 4,
        height: style.size + 5,
      });
    }
    const placed = placePlaceNames(candidates, obstacles, placeBudget(width, height));
    const keep = new Set(placed.map((p) => p.place.id));
    for (const [id, s] of this.shown)
      if (!keep.has(id)) {
        this.labels.remove(s.label);
        if (s.dot) this.dots.remove(s.dot);
        this.shown.delete(id);
      }
    const now = performance.now();
    const byId = new Map(this.items.map((i) => [i.place.id, i]));
    for (const p of placed) {
      const prev = this.shown.get(p.place.id);
      if (prev && prev.side === p.side) continue;
      if (prev) {
        this.labels.remove(prev.label);
        if (prev.dot) this.dots.remove(prev.dot);
      }
      const item = byId.get(p.place.id)!;
      this.shown.set(p.place.id, this.draw(item, p.side, prev ? now - FADE_MS : now));
    }
    this.stats = { labels: this.shown.size };
    this.cull();
    this.scene.requestRender();
  }

  private draw(item: Item, side: Shown['side'], born: number): Shown {
    const p = item.place;
    const style = PLACE_STYLE[p.kind];
    const offset = side === 'right' ? 6 : side === 'left' ? -6 : 0;
    const label = this.labels.add({
      position: item.position,
      text: placeText(p),
      font: placeFont(p.kind),
      fillColor: TEXT.withAlpha(0),
      outlineColor: HALO.withAlpha(0),
      outlineWidth: 3,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      horizontalOrigin:
        side === 'right'
          ? Cesium.HorizontalOrigin.LEFT
          : side === 'left'
            ? Cesium.HorizontalOrigin.RIGHT
            : Cesium.HorizontalOrigin.CENTER,
      verticalOrigin: Cesium.VerticalOrigin.CENTER,
      pixelOffset: new Cesium.Cartesian2(offset, 0),
      heightReference: this.heightReference(),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    });
    const dot = style.dot
      ? this.dots.add({
          position: item.position,
          pixelSize: style.dot === 'capital' ? 6 : 4,
          // A capital is a ring, a city a dot — small and white, unlike event markers.
          color: style.dot === 'capital' ? Cesium.Color.TRANSPARENT : TEXT.withAlpha(0),
          outlineColor: style.dot === 'capital' ? TEXT.withAlpha(0) : HALO.withAlpha(0),
          outlineWidth: style.dot === 'capital' ? 1.5 : 1,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        })
      : null;
    return { label, dot, side, born, alpha: -1, facing: true, item };
  }

  /** Where the shown names are on screen now (diagnostics and tests: nothing may overlap). */
  boxes(): { name: string; x: number; y: number; width: number; height: number }[] {
    const out: { name: string; x: number; y: number; width: number; height: number }[] = [];
    for (const s of this.shown.values()) {
      if (!s.facing) continue;
      const w = Cesium.SceneTransforms.worldToWindowCoordinates(
        this.scene,
        s.item.position,
        scratchWin,
      );
      if (!w) continue;
      const p = s.item.place;
      const width = textWidth(placeText(p), placeFont(p.kind));
      const height = PLACE_STYLE[p.kind].size + 3;
      const x =
        s.side === 'right' ? w.x + 6 : s.side === 'left' ? w.x - 6 - width : w.x - width / 2;
      out.push({ name: p.name, x, y: w.y - height / 2, width, height });
    }
    return out;
  }

  /** Every frame: fade new names in, hide those that went behind the globe. */
  update(): void {
    if (this.shown.size === 0) return;
    const now = performance.now();
    let animating = false;
    for (const s of this.shown.values()) {
      const t = Math.min(1, (now - s.born) / FADE_MS);
      if (t < 1) animating = true;
      if (t !== s.alpha) {
        s.alpha = t;
        const style = PLACE_STYLE[s.item.place.kind];
        s.label.fillColor = TEXT.withAlpha(style.alpha * t);
        s.label.outlineColor = HALO.withAlpha(0.7 * t);
        if (s.dot) {
          if (style.dot === 'capital') s.dot.outlineColor = TEXT.withAlpha(0.9 * t);
          else {
            s.dot.color = TEXT.withAlpha(0.9 * t);
            s.dot.outlineColor = HALO.withAlpha(0.8 * t);
          }
        }
      }
    }
    this.cull();
    if (animating) this.scene.requestRender();
  }

  private cull(): void {
    let changed = false;
    for (const s of this.shown.values()) {
      const facing = this.facing(s.item.position);
      if (facing === s.facing) continue;
      s.facing = facing;
      s.label.show = facing;
      if (s.dot) s.dot.show = facing;
      changed = true;
    }
    if (changed) this.scene.requestRender();
  }
}
