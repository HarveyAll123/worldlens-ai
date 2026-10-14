/**
 * Event markers drawn with Cesium primitive collections (PointPrimitiveCollection +
 * LabelCollection) — far cheaper than Entities for hundreds of markers.
 *
 * Markers are culled behind the horizon and clustered in screen space. Clustering runs when
 * the camera moves noticeably (throttled), never on every frame.
 */
import * as Cesium from 'cesium';
import type { EventSummary } from '@worldlens/shared';
import { clusterScreenPoints, pickLabels, type ScreenPoint } from './clustering';
import { COLORS, eventColor } from './styles';

export type PickId =
  { kind: 'event'; id: string } | { kind: 'cluster'; ids: string[]; lat: number; lon: number };

export interface EventLayerSettings {
  maxEvents: number;
  maxLabels: number;
  clusterCellPx: number;
  labels: boolean;
}

const scratchNormal = new Cesium.Cartesian3();
const scratchDiff = new Cesium.Cartesian3();
const scratchWin = new Cesium.Cartesian2();

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export class EventLayer {
  private points = new Cesium.PointPrimitiveCollection();
  private labels = new Cesium.LabelCollection();
  private events: EventSummary[] = [];
  private positions = new Map<string, Cesium.Cartesian3>();
  private selectedId: string | null = null;
  private settings: EventLayerSettings = {
    maxEvents: 400,
    maxLabels: 40,
    clusterCellPx: 60,
    labels: true,
  };
  private visible = true;
  stats = { visibleEvents: 0, visibleLabels: 0, clusters: 0 };

  constructor(private readonly scene: Cesium.Scene) {
    scene.primitives.add(this.points);
    scene.primitives.add(this.labels);
  }

  destroy(): void {
    this.scene.primitives.remove(this.points);
    this.scene.primitives.remove(this.labels);
  }

  setEvents(events: EventSummary[]): void {
    this.events = [...events].sort((a, b) => b.importance - a.importance);
    this.positions.clear();
    for (const e of this.events) {
      this.positions.set(e.id, Cesium.Cartesian3.fromDegrees(e.location.lon, e.location.lat, 0));
    }
    this.recluster();
  }

  setSettings(s: Partial<EventLayerSettings>): void {
    this.settings = { ...this.settings, ...s };
    this.recluster();
  }

  setSelected(id: string | null): void {
    this.selectedId = id;
    this.recluster();
  }

  setVisible(v: boolean): void {
    this.visible = v;
    this.points.show = v;
    this.labels.show = v;
    this.scene.requestRender();
  }

  /** Recompute horizon culling, clustering and labels for the current camera. */
  recluster(): void {
    this.points.removeAll();
    this.labels.removeAll();
    if (!this.visible || this.events.length === 0) {
      this.stats = { visibleEvents: 0, visibleLabels: 0, clusters: 0 };
      this.scene.requestRender();
      return;
    }
    const scene = this.scene;
    const camPos = scene.camera.positionWC;
    const ellipsoid = scene.globe.ellipsoid;
    const width = scene.canvas.clientWidth;
    const height = scene.canvas.clientHeight;
    const screen: ScreenPoint[] = [];
    const byId = new Map<string, EventSummary>();
    for (const e of this.events.slice(0, this.settings.maxEvents)) {
      const p = this.positions.get(e.id)!;
      const n = ellipsoid.geodeticSurfaceNormal(p, scratchNormal);
      if (Cesium.Cartesian3.dot(Cesium.Cartesian3.subtract(camPos, p, scratchDiff), n) <= 0)
        continue; // behind the horizon
      const w = Cesium.SceneTransforms.worldToWindowCoordinates(scene, p, scratchWin);
      if (!w || w.x < -40 || w.y < -40 || w.x > width + 40 || w.y > height + 40) continue;
      byId.set(e.id, e);
      screen.push({
        id: e.id,
        x: w.x,
        y: w.y,
        weight:
          e.importance * 10 + (e.id === this.selectedId ? 1000 : 0) + (e.kind === 'news' ? 3 : 0),
      });
    }
    const clusters = clusterScreenPoints(screen, this.settings.clusterCellPx);
    const singles = clusters
      .filter((c) => c.ids.length === 1)
      .map((c) => ({
        id: c.ids[0]!,
        weight: byId.get(c.ids[0]!)!.importance + (c.ids[0] === this.selectedId ? 100 : 0),
      }));
    const labelled = this.settings.labels
      ? pickLabels(singles, this.settings.maxLabels)
      : new Set<string>();
    let visibleEvents = 0;
    for (const c of clusters) {
      const rep = byId.get(c.representativeId)!;
      const pos = this.positions.get(rep.id)!;
      visibleEvents += c.ids.length;
      if (c.ids.length === 1) {
        const selected = rep.id === this.selectedId;
        this.points.add({
          position: pos,
          pixelSize: selected ? 16 : 7 + rep.importance * 1.4,
          color: selected ? COLORS.selected : eventColor(rep.kind, rep.category),
          outlineColor: rep.isDemo ? COLORS.demoOutline : COLORS.outline,
          outlineWidth: rep.isDemo ? 2.5 : 1.5,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          id: { kind: 'event', id: rep.id } satisfies PickId,
        });
        if (labelled.has(rep.id)) {
          this.labels.add({
            position: pos,
            text: truncate(rep.title, 42),
            font: '500 13px "Inter", system-ui, sans-serif',
            fillColor: COLORS.label,
            showBackground: true,
            backgroundColor: COLORS.labelBg,
            backgroundPadding: new Cesium.Cartesian2(7, 4),
            pixelOffset: new Cesium.Cartesian2(12, -2),
            horizontalOrigin: Cesium.HorizontalOrigin.LEFT,
            verticalOrigin: Cesium.VerticalOrigin.CENTER,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            id: { kind: 'event', id: rep.id } satisfies PickId,
          });
        }
      } else {
        const lat = c.ids.reduce((s, id) => s + byId.get(id)!.location.lat, 0) / c.ids.length;
        const lon = c.ids.reduce((s, id) => s + byId.get(id)!.location.lon, 0) / c.ids.length;
        const id: PickId = { kind: 'cluster', ids: c.ids, lat, lon };
        this.points.add({
          position: pos,
          pixelSize: Math.min(34, 14 + Math.log2(c.ids.length) * 5),
          color: COLORS.cluster.withAlpha(0.92),
          outlineColor: eventColor(rep.kind, rep.category),
          outlineWidth: 3,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          id,
        });
        this.labels.add({
          position: pos,
          text: String(c.ids.length),
          font: '700 12px "Inter", system-ui, sans-serif',
          fillColor: Cesium.Color.fromCssColorString('#0b1220'),
          horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          id,
        });
      }
    }
    this.stats = {
      visibleEvents,
      visibleLabels: this.labels.length,
      clusters: clusters.filter((c) => c.ids.length > 1).length,
    };
    this.scene.requestRender();
  }
}
