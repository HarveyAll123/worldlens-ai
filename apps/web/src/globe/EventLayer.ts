/**
 * Event markers drawn with Cesium primitive collections (PointPrimitiveCollection +
 * LabelCollection) — far cheaper than Entities for hundreds of markers.
 *
 * Smoothness rules (markers used to flicker while the camera moved):
 *  - Clusters are anchored to the map (clustering.ts), so panning never regroups them; they
 *    are rebuilt only when the zoom crosses a level, or the events / selection change — and
 *    then only the clusters that actually changed are replaced.
 *  - Every frame only toggles visibility for markers behind the globe; nothing is recreated.
 *  - Text labels are re-placed (without overlaps) when the camera settles, not while it moves.
 */
import * as Cesium from 'cesium';
import type { EventSummary } from '@worldlens/shared';
import { clusterGeo, clusterLevel, placeLabels } from './clustering';
import { COLORS, eventColor } from './styles';

export type PickId =
  { kind: 'event'; id: string } | { kind: 'cluster'; ids: string[]; lat: number; lon: number };

export interface EventLayerSettings {
  maxEvents: number;
  maxLabels: number;
  clusterCellPx: number;
  labels: boolean;
}

interface Drawn {
  signature: string;
  ids: string[];
  position: Cesium.Cartesian3;
  point: Cesium.PointPrimitive;
  /** Member count on clusters. */
  count: Cesium.Label | null;
  /** Event title on single markers (only when placed). */
  title: Cesium.Label | null;
  /** Which side of the marker the title sits on (flips near the screen edge). */
  titleSide?: 'left' | 'right';
  visible: boolean;
}

const scratchNormal = new Cesium.Cartesian3();
const scratchDiff = new Cesium.Cartesian3();
const scratchWin = new Cesium.Cartesian2();
const TITLE_CHARS = 42;

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export class EventLayer {
  private points = new Cesium.PointPrimitiveCollection();
  // Translucent pass only: markers and labels both sit at the near plane (no depth test), so
  // whichever drew first won — cluster counts drawn in the opaque pass vanished under their
  // circle depending on the view. The translucent pass runs after the markers and passes at
  // equal depth, so counts and titles are always on top.
  private labels = new Cesium.LabelCollection({ blendOption: Cesium.BlendOption.TRANSLUCENT });
  private events: EventSummary[] = [];
  private byId = new Map<string, EventSummary>();
  private positions = new Map<string, Cesium.Cartesian3>();
  private selectedId: string | null = null;
  private settings: EventLayerSettings = {
    maxEvents: 400,
    maxLabels: 40,
    clusterCellPx: 60,
    labels: true,
  };
  private visible = true;
  private level: number | null = null;
  private drawn = new Map<string, Drawn>();
  stats = { visibleEvents: 0, visibleLabels: 0, clusters: 0 };

  constructor(private readonly scene: Cesium.Scene) {
    window.addEventListener('worldlens:chrome', () => this.relabel());
    scene.primitives.add(this.points);
    scene.primitives.add(this.labels);
  }

  destroy(): void {
    this.scene.primitives.remove(this.points);
    this.scene.primitives.remove(this.labels);
  }

  setEvents(events: EventSummary[]): void {
    this.events = [...events].sort((a, b) => b.importance - a.importance);
    this.byId = new Map(this.events.map((e) => [e.id, e]));
    this.positions = new Map(
      this.events.map((e) => [
        e.id,
        this.positions.get(e.id) ??
          Cesium.Cartesian3.fromDegrees(e.location.lon, e.location.lat, 0),
      ]),
    );
    this.recluster();
    this.relabel();
  }

  setSettings(s: Partial<EventLayerSettings>): void {
    const regroup =
      s.clusterCellPx !== undefined && s.clusterCellPx !== this.settings.clusterCellPx;
    this.settings = { ...this.settings, ...s };
    if (regroup) this.level = null;
    this.recluster();
    this.relabel();
  }

  setSelected(id: string | null): void {
    this.selectedId = id;
    this.recluster();
    this.relabel();
  }

  setVisible(v: boolean): void {
    this.visible = v;
    this.points.show = v;
    this.labels.show = v;
    this.scene.requestRender();
  }

  /**
   * Every rendered frame: re-cluster only if the zoom moved to another level, and hide
   * markers that have gone behind the globe. Cheap — nothing is created or destroyed here
   * unless the level changed.
   */
  update(): void {
    if (!this.visible || this.events.length === 0) return;
    const level = clusterLevel(this.wantedCellDeg(), this.level);
    if (level !== this.level) {
      this.level = level;
      this.recluster();
      this.relabel();
      return;
    }
    this.cull();
  }

  /** Cluster cell, in degrees, that spans `clusterCellPx` pixels at the current zoom. */
  private wantedCellDeg(): number {
    const camera = this.scene.camera;
    const height = Math.max(1, camera.positionCartographic.height);
    const fovy = (camera.frustum as Cesium.PerspectiveFrustum).fovy ?? 1;
    const metresPerPixel =
      (2 * height * Math.tan(fovy / 2)) / Math.max(1, this.scene.canvas.clientHeight);
    return (metresPerPixel * this.settings.clusterCellPx) / 111_320;
  }

  /** Rebuild clusters for the current level, replacing only the ones that changed. */
  recluster(): void {
    if (this.level === null) this.level = clusterLevel(this.wantedCellDeg(), null);
    const shown = this.visible ? this.events.slice(0, this.settings.maxEvents) : [];
    const clusters = clusterGeo(
      shown.map((e) => ({
        id: e.id,
        lat: e.location.lat,
        lon: e.location.lon,
        weight:
          e.importance * 10 + (e.id === this.selectedId ? 1000 : 0) + (e.kind === 'news' ? 3 : 0),
      })),
      this.level,
    );
    const next = new Map<string, Drawn>();
    for (const c of clusters) {
      const signature = `${c.ids.join(',')}|${c.ids.includes(this.selectedId ?? '') ? this.selectedId : ''}`;
      const existing = this.drawn.get(c.key);
      if (existing && existing.signature === signature) {
        next.set(c.key, existing);
        this.drawn.delete(c.key);
        continue;
      }
      next.set(c.key, this.create(c.ids, c.representativeId, signature));
    }
    for (const d of this.drawn.values()) this.remove(d);
    this.drawn = next;
    this.cull();
    this.scene.requestRender();
  }

  private create(ids: string[], repId: string, signature: string): Drawn {
    const rep = this.byId.get(repId)!;
    const position = this.positions.get(repId)!;
    if (ids.length === 1) {
      const selected = rep.id === this.selectedId;
      const point = this.points.add({
        position,
        pixelSize: selected ? 16 : 7 + rep.importance * 1.4,
        color: selected ? COLORS.selected : eventColor(rep.kind, rep.category),
        outlineColor: rep.isDemo ? COLORS.demoOutline : COLORS.outline,
        outlineWidth: rep.isDemo ? 2.5 : 1.5,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        id: { kind: 'event', id: rep.id } satisfies PickId,
      });
      return { signature, ids, position, point, count: null, title: null, visible: true };
    }
    const members = ids.map((id) => this.byId.get(id)!);
    const lat = members.reduce((s, e) => s + e.location.lat, 0) / members.length;
    const lon = members.reduce((s, e) => s + e.location.lon, 0) / members.length;
    const id: PickId = { kind: 'cluster', ids, lat, lon };
    const point = this.points.add({
      position,
      pixelSize: Math.min(34, 14 + Math.log2(ids.length) * 5),
      // Opaque: a translucent point is drawn after (over) the count label on top of it.
      color: COLORS.cluster,
      outlineColor: eventColor(rep.kind, rep.category),
      outlineWidth: 3,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      id,
    });
    const count = this.labels.add({
      position,
      text: String(ids.length),
      font: '500 11.5px "Inter Variable", "Inter", system-ui, sans-serif',
      fillColor: Cesium.Color.fromCssColorString('#0b1220'),
      horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
      verticalOrigin: Cesium.VerticalOrigin.CENTER,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      id,
    });
    return { signature, ids, position, point, count, title: null, visible: true };
  }

  private remove(d: Drawn): void {
    this.points.remove(d.point);
    if (d.count) this.labels.remove(d.count);
    if (d.title) this.labels.remove(d.title);
  }

  /** Hide markers behind the globe (they draw on top of it otherwise). */
  private cull(): void {
    let changed = false;
    const camPos = this.scene.camera.positionWC;
    const ellipsoid = this.scene.globe.ellipsoid;
    let visibleEvents = 0;
    let clustersShown = 0;
    let labelsShown = 0;
    for (const d of this.drawn.values()) {
      const n = ellipsoid.geodeticSurfaceNormal(d.position, scratchNormal);
      const facing =
        Cesium.Cartesian3.dot(Cesium.Cartesian3.subtract(camPos, d.position, scratchDiff), n) > 0;
      if (facing !== d.visible) {
        changed = true;
        d.visible = facing;
        d.point.show = facing;
        if (d.count) d.count.show = facing;
        if (d.title) d.title.show = facing;
      }
      if (facing) {
        visibleEvents += d.ids.length;
        if (d.ids.length > 1) clustersShown++;
        if (d.title) labelsShown++;
      }
    }
    this.stats = { visibleEvents, visibleLabels: labelsShown, clusters: clustersShown };
    // Called every frame from preRender: only ask for another frame when something changed.
    if (changed) this.scene.requestRender();
  }

  /** Re-place event titles without overlaps. Called when the camera settles. */
  relabel(): void {
    const width = this.scene.canvas.clientWidth;
    const height = this.scene.canvas.clientHeight;
    // Keep labels clear of the chrome: the detached card on the right and the top dock.
    const wide = window.matchMedia('(min-width: 768px)').matches;
    const safe = {
      left: 8,
      top: 78,
      bottom: wide ? 128 : 196,
    };
    // Any open panel marks itself as an occluder; labels never sit behind glass.
    const occluders = [...document.querySelectorAll('[data-label-occluder]')]
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0)
      .map((r) => ({
        left: r.left - 10,
        right: r.right + 10,
        top: r.top - 10,
        bottom: r.bottom + 10,
      }));
    const obscured = (x: number, y: number, w: number, h: number) =>
      occluders.some((o) => x < o.right && x + w > o.left && y < o.bottom && y + h > o.top);
    type Candidate = {
      id: string;
      x: number;
      y: number;
      width: number;
      height: number;
      weight: number;
    };
    const candidates: Candidate[] = [];
    const wanted = new Map<string, { side: 'left' | 'right'; text: string }>();
    if (this.settings.labels)
      for (const [key, d] of this.drawn) {
        if (d.ids.length !== 1 || !d.visible) continue;
        const w = Cesium.SceneTransforms.worldToWindowCoordinates(
          this.scene,
          d.position,
          scratchWin,
        );
        if (!w || w.x < 0 || w.y < 0 || w.x > width || w.y > height) continue;
        if (w.y < safe.top || w.y > height - safe.bottom) continue;
        const e = this.byId.get(d.ids[0]!)!;
        const roomRight = width - safe.left - (w.x + 14);
        const roomLeft = w.x - 14 - safe.left;
        const side: 'left' | 'right' = roomRight >= 120 || roomRight >= roomLeft ? 'right' : 'left';
        const room = side === 'right' ? roomRight : roomLeft;
        const maxChars = Math.floor((room - 20) / 7.2);
        const chars = Math.min(TITLE_CHARS, e.title.length, maxChars);
        if (chars < 10) continue;
        const text = truncate(e.title, chars);
        const labelWidth = chars * 7.2 + 18;
        const labelX = side === 'right' ? w.x + 10 : w.x - 10 - labelWidth;
        if (labelX < safe.left || labelX + labelWidth > width - safe.left) continue;
        if (obscured(labelX, w.y - 11, labelWidth, 22)) continue;
        candidates.push({
          id: key,
          x: labelX,
          y: w.y - 11,
          width: labelWidth,
          height: 22,
          weight: e.importance + (e.id === this.selectedId ? 100 : 0),
        });
        wanted.set(key, { side, text });
      }
    const chosen = placeLabels(candidates, this.settings.maxLabels);
    for (const [key, d] of this.drawn) {
      const want = chosen.has(key) ? wanted.get(key) : undefined;
      if (want) {
        if (!d.title || d.titleSide !== want.side || d.title.text !== want.text) {
          if (d.title) this.labels.remove(d.title);
          const e = this.byId.get(d.ids[0]!)!;
          d.title = this.labels.add({
            position: d.position,
            text: want.text,
            font: '400 12px "Inter Variable", "Inter", system-ui, sans-serif',
            fillColor: COLORS.label,
            showBackground: true,
            backgroundColor: COLORS.labelBg,
            backgroundPadding: new Cesium.Cartesian2(7, 4),
            pixelOffset: new Cesium.Cartesian2(want.side === 'right' ? 12 : -12, -2),
            horizontalOrigin:
              want.side === 'right' ? Cesium.HorizontalOrigin.LEFT : Cesium.HorizontalOrigin.RIGHT,
            verticalOrigin: Cesium.VerticalOrigin.CENTER,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            show: d.visible,
            id: { kind: 'event', id: e.id } satisfies PickId,
          });
          d.titleSide = want.side;
        }
      } else if (d.title) {
        this.labels.remove(d.title);
        d.title = null;
        d.titleSide = undefined;
      }
    }
    this.cull();
    this.scene.requestRender();
  }
}
