/**
 * Borders, country highlight and frontline layers. Political geography is dynamic geometry
 * drawn over the imagery — never baked into textures.
 *
 * Certainty styling:  CERTAIN solid · APPROXIMATE dashed · DISPUTED amber dashed ·
 * RECONSTRUCTED faint dotted.
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
  private lines = new Cesium.PolylineCollection();
  private labels = new Cesium.LabelCollection();
  private fill: Cesium.Primitive | null = null;
  stats = { polygons: 0, labels: 0 };

  constructor(private readonly scene: Cesium.Scene) {
    scene.primitives.add(this.lines);
    scene.primitives.add(this.labels);
  }

  clear(): void {
    this.lines.removeAll();
    this.labels.removeAll();
    if (this.fill) {
      this.scene.primitives.remove(this.fill);
      this.fill = null;
    }
    this.stats = { polygons: 0, labels: 0 };
    this.scene.requestRender();
  }

  setFeatures(features: BorderFeatureLike[], opts: { fills: boolean; labelBudget: number }): void {
    this.clear();
    const instances: Cesium.GeometryInstance[] = [];
    const labelCandidates: Array<{ name: string; area: number; lon: number; lat: number }> = [];
    let count = 0;
    for (const f of features) {
      for (const poly of polygons(f.geometry)) {
        const outer = poly[0];
        if (!outer || outer.length < 4) continue;
        count++;
        this.lines.add({
          positions: ringPositions(outer),
          width: f.properties.certainty === 'DISPUTED' ? 2 : 1.4,
          material: borderMaterial(f.properties.certainty),
        });
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
    const seen = new Set<string>();
    for (const c of labelCandidates.sort((a, b) => b.area - a.area)) {
      if (this.labels.length >= opts.labelBudget) break;
      if (seen.has(c.name) || c.area < 4) continue;
      seen.add(c.name);
      this.labels.add({
        position: Cesium.Cartesian3.fromDegrees(c.lon, c.lat),
        text: c.name,
        font: '600 11px "Inter", system-ui, sans-serif',
        fillColor: Cesium.Color.fromCssColorString('#f8fafc').withAlpha(0.85),
        outlineColor: Cesium.Color.BLACK.withAlpha(0.7),
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        translucencyByDistance: new Cesium.NearFarScalar(2.0e6, 1.0, 1.4e7, 0.0),
      });
    }
    this.stats = { polygons: count, labels: this.labels.length };
    this.scene.requestRender();
  }

  destroy(): void {
    this.clear();
    this.scene.primitives.remove(this.lines);
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

export class FrontlineLayer {
  private lines = new Cesium.PolylineCollection();
  private labels = new Cesium.LabelCollection();
  stats = { lines: 0 };
  constructor(private readonly scene: Cesium.Scene) {
    scene.primitives.add(this.lines);
    scene.primitives.add(this.labels);
  }
  set(lines: Frontline[]): void {
    this.lines.removeAll();
    this.labels.removeAll();
    for (const f of lines) {
      const parts =
        f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates;
      const material = () =>
        f.certainty === 'CERTAIN'
          ? Cesium.Material.fromType('Color', { color: COLORS.frontline })
          : Cesium.Material.fromType('PolylineDash', { color: COLORS.frontline, dashLength: 12 });
      for (const part of parts) {
        const flat: number[] = [];
        for (const [lon, lat] of part) flat.push(lon!, lat!);
        this.lines.add({
          positions: Cesium.Cartesian3.fromDegreesArray(flat),
          width: 3,
          material: material(),
        });
      }
      const first = parts[0]?.[Math.floor((parts[0]?.length ?? 1) / 2)];
      if (first)
        this.labels.add({
          position: Cesium.Cartesian3.fromDegrees(first[0]!, first[1]!),
          text: f.name,
          font: '600 12px "Inter", system-ui, sans-serif',
          fillColor: Cesium.Color.WHITE,
          showBackground: true,
          backgroundColor: COLORS.frontline.withAlpha(0.8),
          pixelOffset: new Cesium.Cartesian2(0, -14),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        });
    }
    this.stats = { lines: lines.length };
    this.scene.requestRender();
  }
}
