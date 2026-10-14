/** Colours for globe primitives — restrained, legible on satellite imagery. */
import * as Cesium from 'cesium';
import type { EventCategory, EventKind } from '@worldlens/shared';

export const COLORS = {
  news: Cesium.Color.fromCssColorString('#f4b75a'),
  historical: Cesium.Color.fromCssColorString('#8fd3c3'),
  disaster: Cesium.Color.fromCssColorString('#ff8a65'),
  demoOutline: Cesium.Color.fromCssColorString('#c4b5fd'),
  outline: Cesium.Color.fromCssColorString('#0b1220').withAlpha(0.85),
  selected: Cesium.Color.WHITE,
  cluster: Cesium.Color.fromCssColorString('#e8eef7'),
  label: Cesium.Color.fromCssColorString('#f3f6fb'),
  labelBg: Cesium.Color.fromCssColorString('#0b1220').withAlpha(0.72),
  borderCertain: Cesium.Color.fromCssColorString('#f1f5f9').withAlpha(0.85),
  borderApprox: Cesium.Color.fromCssColorString('#e2e8f0').withAlpha(0.7),
  borderDisputed: Cesium.Color.fromCssColorString('#fbbf24').withAlpha(0.9),
  borderReconstructed: Cesium.Color.fromCssColorString('#cbd5e1').withAlpha(0.45),
  highlight: Cesium.Color.fromCssColorString('#f8d27a'),
  frontline: Cesium.Color.fromCssColorString('#ef6b5b'),
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
