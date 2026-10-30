/**
 * Borders, country highlight and frontline layers. Political geography is dynamic geometry
 * drawn over the imagery — never baked into textures.
 *
 * Certainty styling:  CERTAIN solid · APPROXIMATE dashed · DISPUTED amber dashed ·
 * RECONSTRUCTED faint dotted.
 *
 * With 3D terrain on, lines are draped on the ground (GroundPolylinePrimitive); lines at sea
 * level would otherwise drift away from mountain borders as the camera tilts or zooms in.
 */
import * as Cesium from 'cesium';
import type { Frontline } from '@worldlens/shared';
import { COLORS, fillColor } from './styles';

type Certainty = 'CERTAIN' | 'APPROXIMATE' | 'DISPUTED' | 'RECONSTRUCTED';
type Ring = number[][];
type PolyGeom =
  { type: 'Polygon'; coordinates: Ring[] } | { type: 'MultiPolygon'; coordinates: Ring[][] };
export interface BorderFeatureLike {
  properties: { name: string; certainty: Certainty };
  geometry: PolyGeom;
}
/** Boundary lines without polygons (Natural Earth land boundaries: no coastlines). */
export interface BorderLineLike {
  properties: { certainty: Certainty };
  geometry:
    | { type: 'LineString'; coordinates: number[][] }
    | { type: 'MultiLineString'; coordinates: number[][][] };
}

export interface BorderLabel {
  name: string;
  lon: number;
  lat: number;
  /** Size proxy (degrees²); larger entities are labelled first. */
  area: number;
}

interface Stroke {
  positions: Cesium.Cartesian3[];
  width: number;
  /** Strokes with the same key share one material (one ground primitive). */
  key: string;
  material: () => Cesium.Material;
}

function strokePositions(points: number[][]): Cesium.Cartesian3[] | null {
  const flat: number[] = [];
  let prev: number[] | undefined;
  for (const pt of points) {
    if (prev && prev[0] === pt[0] && prev[1] === pt[1]) continue;
    flat.push(pt[0]!, pt[1]!);
    prev = pt;
  }
  return flat.length >= 4 ? Cesium.Cartesian3.fromDegreesArray(flat) : null;
}

/**
 * Polylines either on the ellipsoid (cheap) or draped on terrain. Draped lines are built
 * asynchronously, so the previous lines stay on screen until the new ones are ready — moving
 * through dates then swaps borders instead of blinking them out for a few seconds.
 */
class LineSet {
  private collection = new Cesium.PolylineCollection();
  private ground: Cesium.GroundPolylinePrimitive[] = [];
  private outgoing: Cesium.GroundPolylinePrimitive[] = [];
  private removeSwap: (() => void) | null = null;

  constructor(private readonly scene: Cesium.Scene) {
    scene.primitives.add(this.collection);
  }

  set(strokes: Stroke[], clampToGround: boolean): void {
    const draped = clampToGround && Cesium.GroundPolylinePrimitive.isSupported(this.scene);
    // Keep the current draped lines until their replacement is ready.
    this.dropOutgoing();
    this.outgoing = draped ? this.ground : [];
    if (!draped) for (const p of this.ground) this.scene.groundPrimitives.remove(p);
    this.ground = [];
    this.collection.removeAll();
    if (draped) {
      const groups = new Map<string, Stroke[]>();
      for (const s of strokes) groups.set(s.key, [...(groups.get(s.key) ?? []), s]);
      for (const group of groups.values()) {
        const primitive = new Cesium.GroundPolylinePrimitive({
          geometryInstances: group.map(
            (s) =>
              new Cesium.GeometryInstance({
                geometry: new Cesium.GroundPolylineGeometry({
                  positions: s.positions,
                  width: s.width,
                }),
              }),
          ),
          appearance: new Cesium.PolylineMaterialAppearance({ material: group[0]!.material() }),
          asynchronous: true,
        });
        this.scene.groundPrimitives.add(primitive);
        this.ground.push(primitive);
      }
      if (this.outgoing.length) {
        const pending = this.ground;
        this.removeSwap = this.scene.postRender.addEventListener(() => {
          if (pending.every((p) => p.ready)) this.dropOutgoing();
          else this.scene.requestRender();
        });
      }
    } else {
      for (const s of strokes)
        this.collection.add({ positions: s.positions, width: s.width, material: s.material() });
    }
    this.scene.requestRender();
  }

  private dropOutgoing(): void {
    this.removeSwap?.();
    this.removeSwap = null;
    for (const p of this.outgoing) this.scene.groundPrimitives.remove(p);
    this.outgoing = [];
  }

  clear(): void {
    this.dropOutgoing();
    this.collection.removeAll();
    for (const p of this.ground) this.scene.groundPrimitives.remove(p);
    this.ground = [];
  }

  destroy(): void {
    this.clear();
    this.scene.primitives.remove(this.collection);
  }
}

function ringPositions(ring: Ring): Cesium.Cartesian3[] {
  const flat: number[] = [];
  for (const [lon, lat] of ring) flat.push(lon!, lat!);
  return Cesium.Cartesian3.fromDegreesArray(flat);
}

function polygons(g: PolyGeom): Ring[][] {
  return g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
}

function ringArea(ring: Ring): number {
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++)
    a += ring[i]![0]! * ring[i + 1]![1]! - ring[i + 1]![0]! * ring[i]![1]!;
  return Math.abs(a / 2);
}

/**
 * A polyline owns (and destroys) its material, so each polyline gets a fresh instance.
 * PolylineCollection batches by material type + uniforms, so this costs no extra draw calls.
 */
function borderMaterial(c: Certainty): Cesium.Material {
  const dash = (color: Cesium.Color, dashLength: number, pattern?: number) =>
    Cesium.Material.fromType('PolylineDash', {
      color,
      gapColor: Cesium.Color.TRANSPARENT,
      dashLength,
      ...(pattern ? { dashPattern: pattern } : {}),
    });
  switch (c) {
    case 'CERTAIN':
      return Cesium.Material.fromType('Color', { color: COLORS.borderCertain });
    case 'DISPUTED':
      return dash(COLORS.borderDisputed, 10);
    case 'RECONSTRUCTED':
      return dash(COLORS.borderReconstructed, 6, 0xf0f0);
    default:
      return dash(COLORS.borderApprox, 14);
  }
}

export class BordersLayer {
  private lines: LineSet;
  private labels = new Cesium.LabelCollection();
  private fill: Cesium.Primitive | null = null;
  stats = { polygons: 0, labels: 0 };

  constructor(private readonly scene: Cesium.Scene) {
    this.lines = new LineSet(scene);
    scene.primitives.add(this.labels);
  }

  clear(): void {
    this.lines.clear();
    this.labels.removeAll();
    if (this.fill) {
      this.scene.primitives.remove(this.fill);
      this.fill = null;
    }
    this.stats = { polygons: 0, labels: 0 };
    this.scene.requestRender();
  }

  /**
   * `features` give fills, labels and (with `outlines`) the drawn border; `lines` are drawn as
   * well — modern borders pass Natural Earth land boundaries here and switch outlines off, so
   * coarse polygon coastlines are not drawn over the imagery.
   */
  setFeatures(
    features: BorderFeatureLike[],
    opts: {
      fills: boolean;
      labelBudget: number;
      outlines: boolean;
      lines?: BorderLineLike[];
      /** Explicit name labels (used instead of labels derived from the polygons). */
      labels?: BorderLabel[];
      clampToGround: boolean;
    },
  ): void {
    // Lines are not cleared here: LineSet.set keeps the current lines on screen until their
    // replacements are ready, so redraws (new date, camera move) never blank the borders.
    this.labels.removeAll();
    if (this.fill) {
      this.scene.primitives.remove(this.fill);
      this.fill = null;
    }
    const strokes: Stroke[] = [];
    const stroke = (points: number[][], certainty: Certainty) => {
      const positions = strokePositions(points);
      if (positions)
        strokes.push({
          positions,
          width: certainty === 'DISPUTED' ? 2 : 1.4,
          key: certainty,
          material: () => borderMaterial(certainty),
        });
    };
    for (const l of opts.lines ?? []) {
      const parts =
        l.geometry.type === 'LineString' ? [l.geometry.coordinates] : l.geometry.coordinates;
      for (const part of parts) stroke(part, l.properties.certainty);
    }
    const instances: Cesium.GeometryInstance[] = [];
    const labelCandidates: Array<{ name: string; area: number; lon: number; lat: number }> = [];
    let count = 0;
    for (const f of features) {
      for (const poly of polygons(f.geometry)) {
        const outer = poly[0];
        if (!outer || outer.length < 4) continue;
        count++;
        if (opts.outlines) stroke(outer, f.properties.certainty);
        const area = ringArea(outer);
        if (opts.fills && area > 0.05) {
          try {
            instances.push(
              new Cesium.GeometryInstance({
                geometry: new Cesium.PolygonGeometry({
                  polygonHierarchy: new Cesium.PolygonHierarchy(
                    ringPositions(outer),
                    poly.slice(1).map((h) => new Cesium.PolygonHierarchy(ringPositions(h))),
                  ),
                  height: 0,
                  granularity: Cesium.Math.RADIANS_PER_DEGREE * 2,
                  vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
                }),
                attributes: {
                  color: Cesium.ColorGeometryInstanceAttribute.fromColor(
                    fillColor(f.properties.name, 0.13),
                  ),
                },
              }),
            );
          } catch {
            /* skip degenerate polygon */
          }
        }
        let sx = 0;
        let sy = 0;
        for (const [lon, lat] of outer) {
          sx += lon!;
          sy += lat!;
        }
        labelCandidates.push({
          name: f.properties.name,
          area,
          lon: sx / outer.length,
          lat: sy / outer.length,
        });
      }
    }
    this.lines.set(strokes, opts.clampToGround);
    if (instances.length) {
      this.fill = new Cesium.Primitive({
        geometryInstances: instances,
        appearance: new Cesium.PerInstanceColorAppearance({
          translucent: true,
          closed: false,
          flat: true,
        }),
        asynchronous: true,
      });
      this.scene.primitives.add(this.fill);
    }
    this.setLabels(opts.labels ?? labelCandidates, opts.labelBudget);
    this.stats = { polygons: count, labels: this.labels.length };
    this.scene.requestRender();
  }

  /** Replace only the name labels (cheap; lines and fills are untouched). */
  setLabels(candidates: BorderLabel[], budget: number): void {
    this.labels.removeAll();
    const seen = new Set<string>();
    for (const c of [...candidates].sort((a, b) => b.area - a.area)) {
      if (this.labels.length >= budget) break;
      if (seen.has(c.name) || c.area < 4) continue;
      seen.add(c.name);
      this.labels.add({
        position: Cesium.Cartesian3.fromDegrees(c.lon, c.lat),
        text: c.name,
        font: '400 10.5px "Inter Variable", "Inter", system-ui, sans-serif',
        fillColor: Cesium.Color.fromCssColorString('#f8fafc').withAlpha(0.85),
        outlineColor: Cesium.Color.BLACK.withAlpha(0.7),
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        translucencyByDistance: new Cesium.NearFarScalar(2.0e6, 1.0, 1.4e7, 0.0),
      });
    }
    this.stats = { ...this.stats, labels: this.labels.length };
    this.scene.requestRender();
  }

  destroy(): void {
    this.clear();
    this.lines.destroy();
    this.scene.primitives.remove(this.labels);
  }
}

export class HighlightLayer {
  private lines = new Cesium.PolylineCollection();
  constructor(private readonly scene: Cesium.Scene) {
    scene.primitives.add(this.lines);
  }
  set(geometry: PolyGeom | null): void {
    this.lines.removeAll();
    if (geometry)
      for (const poly of polygons(geometry))
        if (poly[0])
          this.lines.add({
            positions: ringPositions(poly[0]),
            width: 6,
            material: Cesium.Material.fromType('PolylineGlow', {
              color: COLORS.highlight,
              glowPower: 0.25,
              taperPower: 1,
            }),
          });
    this.scene.requestRender();
  }
}

/** Glowing outline for a selected country: flat coordinate arrays [lon, lat, lon, lat, …]. */
export class OutlineLayer {
  private lines = new Cesium.PolylineCollection();
  constructor(private readonly scene: Cesium.Scene) {
    scene.primitives.add(this.lines);
  }
  set(parts: number[][] | null): void {
    this.lines.removeAll();
    for (const flat of parts ?? []) {
      if (flat.length < 4) continue;
      this.lines.add({
        positions: Cesium.Cartesian3.fromDegreesArray(flat),
        width: 5,
        material: Cesium.Material.fromType('PolylineGlow', {
          color: COLORS.highlight,
          glowPower: 0.3,
          taperPower: 1,
        }),
      });
    }
    this.scene.requestRender();
  }
}

export class FrontlineLayer {
  private lines: LineSet;
  private labels = new Cesium.LabelCollection();
  stats = { lines: 0 };
  constructor(private readonly scene: Cesium.Scene) {
    this.lines = new LineSet(scene);
    scene.primitives.add(this.labels);
  }
  set(lines: Frontline[], clampToGround: boolean): void {
    this.labels.removeAll();
    const strokes: Stroke[] = [];
    for (const f of lines) {
      const parts =
        f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates;
      const solid = f.certainty === 'CERTAIN';
      const material = () =>
        solid
          ? Cesium.Material.fromType('Color', { color: COLORS.frontline })
          : Cesium.Material.fromType('PolylineDash', { color: COLORS.frontline, dashLength: 12 });
      for (const part of parts) {
        const positions = strokePositions(part);
        if (positions)
          strokes.push({ positions, width: 3, key: solid ? 'solid' : 'dash', material });
      }
      // Label the longest part, at its middle vertex.
      const longest = [...parts].sort((a, b) => b.length - a.length)[0];
      const first = longest?.[Math.floor(longest.length / 2)];
      if (first)
        this.labels.add({
          position: Cesium.Cartesian3.fromDegrees(first[0]!, first[1]!),
          text: f.name,
          font: '400 11.5px "Inter Variable", "Inter", system-ui, sans-serif',
          fillColor: Cesium.Color.WHITE,
          showBackground: true,
          backgroundColor: COLORS.frontline.withAlpha(0.8),
          pixelOffset: new Cesium.Cartesian2(0, -14),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          // Names only once zoomed in: from orbit, neighbouring lines' labels pile up.
          translucencyByDistance: new Cesium.NearFarScalar(3.0e6, 1.0, 7.0e6, 0.0),
        });
    }
    this.lines.set(strokes, clampToGround);
    this.stats = { lines: lines.length };
    this.scene.requestRender();
  }
}
