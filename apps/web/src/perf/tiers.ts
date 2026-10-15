/** Quality tiers. AUTO moves between these (and within them, gradually) based on measurements. */
export type QualityTier = 'LOW' | 'MEDIUM' | 'HIGH';
export type QualityPreference = 'AUTO' | QualityTier;
export const TIERS: QualityTier[] = ['LOW', 'MEDIUM', 'HIGH'];

export interface TierSettings {
  /** Resolution scale range (multiplier of CSS pixels). AUTO adjusts within it in 0.1 steps. */
  resolutionMin: number;
  resolutionMax: number;
  /** Globe terrain/imagery level-of-detail (higher = coarser, cheaper). */
  maximumScreenSpaceError: number;
  tileCacheSize: number;
  terrain: boolean;
  skyAtmosphere: boolean;
  groundAtmosphere: boolean;
  lighting: boolean;
  fog: boolean;
  msaaSamples: number;
  /** Event markers and labels the globe may draw at once. */
  maxEvents: number;
  maxLabels: number;
  /** Screen-space clustering cell size; larger = more aggressive clustering. */
  clusterCellPx: number;
  /** Polygon fills for borders (outlines are always shown). */
  borderFills: boolean;
  borderLabels: number;
  /** Decorative animations (marker pulse, idle rotation). */
  animations: boolean;
  /** Hover picking costs a pick pass per mouse move. */
  hoverPicking: boolean;
  /** City-level 3D content (none bundled yet) — always disabled on LOW. */
  cityContent: boolean;
}

export const TIER_SETTINGS: Record<QualityTier, TierSettings> = {
  LOW: {
    resolutionMin: 0.5,
    resolutionMax: 0.85,
    maximumScreenSpaceError: 6,
    tileCacheSize: 80,
    terrain: false,
    skyAtmosphere: false,
    groundAtmosphere: false,
    lighting: false,
    fog: true,
    msaaSamples: 1,
    maxEvents: 120,
    maxLabels: 12,
    clusterCellPx: 84,
    borderFills: false,
    borderLabels: 0,
    animations: false,
    hoverPicking: false,
    cityContent: false,
  },
  MEDIUM: {
    resolutionMin: 0.8,
    // Up to 2× on high-DPI screens (capped at the display's pixel ratio): crisp text and lines.
    resolutionMax: 2.0,
    maximumScreenSpaceError: 2.5,
    tileCacheSize: 200,
    terrain: true,
    skyAtmosphere: true,
    groundAtmosphere: true,
    lighting: true,
    fog: true,
    msaaSamples: 4,
    maxEvents: 400,
    maxLabels: 40,
    clusterCellPx: 60,
    borderFills: true,
    borderLabels: 25,
    animations: true,
    hoverPicking: true,
    cityContent: false,
  },
  HIGH: {
    resolutionMin: 1.0,
    resolutionMax: 2.0,
    maximumScreenSpaceError: 1.5,
    tileCacheSize: 400,
    terrain: true,
    skyAtmosphere: true,
    groundAtmosphere: true,
    lighting: true,
    fog: true,
    msaaSamples: 4,
    maxEvents: 800,
    maxLabels: 80,
    clusterCellPx: 46,
    borderFills: true,
    borderLabels: 60,
    animations: true,
    hoverPicking: true,
    cityContent: true,
  },
};

export interface DeviceHints {
  hardwareConcurrency?: number;
  deviceMemoryGb?: number;
  devicePixelRatio: number;
  isTouch: boolean;
  smallScreen: boolean;
  gpuRenderer?: string | null;
  saveData?: boolean;
}

/** Initial guess before measurements exist. AUTO corrects it within seconds. */
export function initialTier(h: DeviceHints): QualityTier {
  const gpu = (h.gpuRenderer ?? '').toLowerCase();
  if (/swiftshader|llvmpipe|software|basic render|mesa offscreen/.test(gpu)) return 'LOW';
  if (h.saveData) return 'LOW';
  if ((h.hardwareConcurrency ?? 8) <= 2 || (h.deviceMemoryGb ?? 8) <= 2) return 'LOW';
  if (h.isTouch && h.smallScreen) return (h.deviceMemoryGb ?? 4) >= 6 ? 'MEDIUM' : 'LOW';
  return 'MEDIUM';
}
