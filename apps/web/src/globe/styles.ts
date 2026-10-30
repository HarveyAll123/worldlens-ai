/** Colours for globe primitives — restrained, legible on satellite imagery. */
import * as Cesium from 'cesium';
import type { EventCategory, EventKind } from '@worldlens/shared';

export const COLORS = {
  news: Cesium.Color.fromCssColorString('#f2f2f2'),
  historical: Cesium.Color.fromCssColorString('#d4d4d4').withAlpha(0.85),
  disaster: Cesium.Color.fromCssColorString('#f2f2f2'),
  demoOutline: Cesium.Color.WHITE.withAlpha(0.6),
  outline: Cesium.Color.fromCssColorString('#08080a').withAlpha(0.85),
  selected: Cesium.Color.WHITE,
  cluster: Cesium.Color.fromCssColorString('#f2f2f2'),
  label: Cesium.Color.fromCssColorString('#f5f5f5'),
  labelBg: Cesium.Color.fromCssColorString('#08080a').withAlpha(0.55),
  borderCertain: Cesium.Color.fromCssColorString('#f1f5f9').withAlpha(0.8),
  borderApprox: Cesium.Color.fromCssColorString('#e2e8f0').withAlpha(0.55),
  borderDisputed: Cesium.Color.WHITE.withAlpha(0.85),
  borderReconstructed: Cesium.Color.fromCssColorString('#cbd5e1').withAlpha(0.35),
  highlight: Cesium.Color.WHITE,
  frontline: Cesium.Color.fromCssColorString('#e0685f'),
};

export function eventColor(kind: EventKind, category: EventCategory): Cesium.Color {
  if (kind === 'news' && (category === 'disaster' || category === 'humanitarian'))
    return COLORS.disaster;
  return kind === 'news' ? COLORS.news : COLORS.historical;
}

/** Deterministic soft fill colour per polity name. */
export function fillColor(name: string, alpha: number): Cesium.Color {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return Cesium.Color.fromHsl((h % 360) / 360, 0.45, 0.6, alpha);
}
