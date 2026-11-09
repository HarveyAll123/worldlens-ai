/**
 * Owns the Cesium Viewer and all globe layers. React mounts it once; afterwards it is driven
 * by store subscriptions and explicit method calls (no per-frame React work).
 */
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import type { EventSummary, Frontline } from '@worldlens/shared';
import { PerformanceManager, type QualityState } from '../perf/PerformanceManager';
import { TIER_SETTINGS, initialTier, type QualityPreference } from '../perf/tiers';
import { EventLayer, type PickId } from './EventLayer';
import {
  BordersLayer,
  FrontlineLayer,
  HighlightLayer,
  OutlineLayer,
  type BorderFeatureLike,
  type BorderLabel,
  type BorderLineLike,
} from './GeometryLayers';
import { nightLightsAt, type NightLightsLook } from './nightLights';
import {
  createBaseMap,
  createNightLights,
  createTerrain,
  type ImageryKind,
  type TerrainKind,
} from './providers';

export interface GlobeCallbacks {
  /** A marker click; `at` is the click in CSS pixels from the globe's top-left corner. */
  onPick: (pick: PickId | null, at: { x: number; y: number }) => void;
  /** The camera started moving (drag, zoom, fly) — anchored popups close. */
  onCameraMoveStart?: () => void;
  /** A click on the globe surface that hit no marker. */
  onGlobeClick?: (lon: number, lat: number) => void;
  onCamera: (c: { lat: number; lon: number; altitudeKm: number; bbox: string | null }) => void;
  onBaseMapNotice: (notice: string | null) => void;
  onQuality: (q: QualityState) => void;
}

export interface GlobeDiagnostics {
  fps: number;
  frameTimeP50: number;
  frameTimeP90: number;
  framesRendered: number;
  tier: string;
  preference: QualityPreference;
  targetFps: number;
  resolutionScale: number;
  effectivePixelRatio: number;
  cameraAltitudeKm: number;
  visibleEvents: number;
  visibleLabels: number;
  clusters: number;
  visiblePolygons: number;
  frontlines: number;
  networkRequests: number;
  imagery: ImageryKind | 'loading';
  terrain: TerrainKind;
  /** "night side + lights 85 %", "night side", or why the globe is evenly lit. */
  lighting: string;
  canvas: string;
  gpu: string;
  decisions: Array<{ reason: string; tier: string; scale: number; targetFps: number }>;
}

/** Any label collection still waiting for glyphs (LabelCollection#ready is private API). */
function labelsPending(scene: Cesium.Scene): boolean {
  const primitives = scene.primitives;
  for (let i = 0; i < primitives.length; i++) {
    const p: unknown = primitives.get(i);
    if (
      p instanceof Cesium.LabelCollection &&
      p.show &&
      p.length > 0 &&
      (p as unknown as { ready?: boolean }).ready === false
    )
      return true;
  }
  return false;
}

/** Camera altitudes for the night side: full above, fading out below, gone below the second. */
const NIGHT_FULL_ABOVE_M = 6_000_000;
const NIGHT_GONE_BELOW_M = 1_000_000;

function gpuRenderer(canvas: HTMLCanvasElement): string | null {
  try {
    const gl = (canvas.getContext('webgl2') ??
      canvas.getContext('webgl')) as WebGLRenderingContext | null;
    if (!gl) return null;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext
      ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL))
      : String(gl.getParameter(gl.RENDERER));
  } catch {
    return null;
  }
}

/** Below this camera altitude, border and frontline lines are draped on 3D terrain. */
const DRAPE_BELOW_KM = 800;

export class GlobeController {
  readonly viewer: Cesium.Viewer;
  readonly perf: PerformanceManager;
  private events: EventLayer;
  private borders: BordersLayer;
  private highlight: HighlightLayer;
  private frontlines: FrontlineLayer;
  private countryOutline: OutlineLayer;
  private imagery: ImageryKind | 'loading' = 'loading';
  private terrainKind: TerrainKind = 'ellipsoid';
  private terrainWanted: boolean | null = null;
  private removeListeners: Array<() => void> = [];
  private gpu: string;
  private reducedMotion: boolean;
  private networkRequests = 0;
  private perfObserver: PerformanceObserver | null = null;
  private destroyed = false;

  constructor(
    container: HTMLElement,
    creditContainer: HTMLElement,
    private readonly cb: GlobeCallbacks,
    opts: { mapTilerKey?: string; quality: QualityPreference; reducedMotion: boolean },
  ) {
    this.reducedMotion = opts.reducedMotion;
    this.mapTilerKey = opts.mapTilerKey;
    const probe = document.createElement('canvas');
    this.gpu = gpuRenderer(probe) ?? 'unknown';
    const nav = navigator as Navigator & {
      deviceMemory?: number;
      connection?: { saveData?: boolean };
    };
    const tier = initialTier({
      hardwareConcurrency: nav.hardwareConcurrency,
      deviceMemoryGb: nav.deviceMemory,
      devicePixelRatio: window.devicePixelRatio || 1,
      isTouch: matchMedia('(pointer: coarse)').matches,
      smallScreen: Math.min(window.innerWidth, window.innerHeight) < 600,
      gpuRenderer: this.gpu,
      saveData: nav.connection?.saveData,
    });
    this.perf = new PerformanceManager(tier, opts.quality, {
      allowHigh: (window.devicePixelRatio || 1) > 1 || window.innerWidth > 1600,
      maxResolution: Math.min(2, window.devicePixelRatio || 1),
    });

    this.viewer = new Cesium.Viewer(container, {
      baseLayer: false,
      terrainProvider: new Cesium.EllipsoidTerrainProvider(),
      animation: false,
      timeline: false,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
      vrButton: false,
      projectionPicker: false,
      scene3DOnly: true,
      requestRenderMode: true,
      maximumRenderTimeChange: Number.POSITIVE_INFINITY,
      creditContainer,
      orderIndependentTranslucency: false,
      useBrowserRecommendedResolution: true,
      msaaSamples: 1,
      shouldAnimate: false,
      contextOptions: { webgl: { powerPreference: 'high-performance', alpha: false } },
    });

    const scene = this.viewer.scene;
    const globe = scene.globe;
    scene.backgroundColor = Cesium.Color.BLACK;
    globe.baseColor = Cesium.Color.fromCssColorString('#0a1626');
    globe.showGroundAtmosphere = true;
    globe.dynamicAtmosphereLighting = true;
    globe.dynamicAtmosphereLightingFromSun = true;
    // The night side fades out as the camera comes close (so zoomed-in maps stay readable).
    // Cesium starts that at ~13,600 km altitude; keep the night down to country-sized views.
    globe.lightingFadeInDistance = globe.ellipsoid.maximumRadius + NIGHT_FULL_ABOVE_M;
    globe.lightingFadeOutDistance = globe.ellipsoid.maximumRadius + NIGHT_GONE_BELOW_M;
    if (scene.moon) scene.moon.show = false;
    scene.fog.enabled = true;
    scene.screenSpaceCameraController.minimumZoomDistance = 800;
    scene.screenSpaceCameraController.maximumZoomDistance = 45_000_000;
    // Start from a calm, far view; the intro fly gives the performance manager real frames.
    this.viewer.camera.setView({ destination: Cesium.Cartesian3.fromDegrees(40, 18, 30_000_000) });

    this.events = new EventLayer(scene);
    this.borders = new BordersLayer(scene);
    this.highlight = new HighlightLayer(scene);
    this.frontlines = new FrontlineLayer(scene);
    this.countryOutline = new OutlineLayer(scene);

    this.applyQuality(this.perf.quality);
    this.removeListeners.push(
      this.perf.onChange((q) => {
        this.applyQuality(q);
        cb.onQuality(q);
      }),
    );
    this.removeListeners.push(
      scene.postRender.addEventListener(() => {
        this.perf.frame();
        // Letters for new label text are drawn into Cesium's glyph atlas in the background; in
        // request-render mode nothing asked for the frame that shows them, so new labels
        // stayed with missing letters ("attle of a e has") until the camera next moved.
        if (labelsPending(scene)) scene.requestRender();
      }),
    );
    this.removeListeners.push(
      scene.preRender.addEventListener(() => {
        this.events.update();
        this.fadeNightLights();
      }),
    );
    this.removeListeners.push(scene.camera.moveEnd.addEventListener(() => this.reportCamera()));
    this.removeListeners.push(
      scene.camera.moveStart.addEventListener(() => cb.onCameraMoveStart?.()),
    );

    const handler = new Cesium.ScreenSpaceEventHandler(scene.canvas);
    handler.setInputAction((e: { position: Cesium.Cartesian2 }) => {
      const picked = scene.pick(e.position) as { id?: PickId } | undefined;
      const id =
        picked?.id && typeof picked.id === 'object' && 'kind' in picked.id ? picked.id : null;
      cb.onPick(id, { x: e.position.x, y: e.position.y });
      if (id) return;
      const hit = scene.camera.pickEllipsoid(e.position, scene.globe.ellipsoid);
      if (!hit) return;
      const carto = Cesium.Cartographic.fromCartesian(hit);
      cb.onGlobeClick?.(
        Cesium.Math.toDegrees(carto.longitude),
        Cesium.Math.toDegrees(carto.latitude),
      );
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    handler.setInputAction((e: { endPosition: Cesium.Cartesian2 }) => {
      if (!TIER_SETTINGS[this.perf.quality.tier].hoverPicking) return;
      const picked = scene.pick(e.endPosition) as { id?: unknown } | undefined;
      scene.canvas.style.cursor = picked?.id ? 'pointer' : 'grab';
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
    this.removeListeners.push(() => handler.destroy());

    if (typeof PerformanceObserver !== 'undefined') {
      this.perfObserver = new PerformanceObserver((list) => {
        this.networkRequests += list.getEntries().length;
      });
      try {
        this.perfObserver.observe({ type: 'resource', buffered: true });
      } catch {
        this.perfObserver = null;
      }
    }

    void createBaseMap(opts.mapTilerKey).then((base) => {
      if (this.destroyed) return;
      // At the bottom: the night-lights layer may already be on top of it.
      this.viewer.imageryLayers.add(new Cesium.ImageryLayer(base.provider), 0);
      this.imagery = base.imagery;
      cb.onBaseMapNotice(base.notice);
      scene.requestRender();
    });
    this.syncTerrain();
  }

  private mapTilerKey: string | undefined;

  private syncTerrain(): void {
    const wanted = TIER_SETTINGS[this.perf.quality.tier].terrain && !!this.mapTilerKey;
    if (wanted === this.terrainWanted) return;
    this.terrainWanted = wanted;
    void createTerrain(this.mapTilerKey, wanted).then(({ kind, provider }) => {
      if (this.destroyed || this.terrainWanted !== wanted) return;
      this.viewer.scene.terrainProvider = provider;
      this.terrainKind = kind;
      // Redraw lines so they drape on (or come off) the terrain.
      this.drawBorders();
      this.drawFrontlines();
      this.viewer.scene.requestRender();
    });
  }

  private applyQuality(q: QualityState): void {
    const s = TIER_SETTINGS[q.tier];
    const scene = this.viewer.scene;
    const globe = scene.globe;
    const dpr = window.devicePixelRatio || 1;
    // useBrowserRecommendedResolution=true renders at CSS pixels; scales above 1 opt into HiDPI.
    this.viewer.useBrowserRecommendedResolution = q.resolutionScale <= 1;
    this.viewer.resolutionScale =
      q.resolutionScale <= 1 ? q.resolutionScale : Math.min(q.resolutionScale, dpr) / dpr;
    globe.maximumScreenSpaceError = s.maximumScreenSpaceError;
    globe.tileCacheSize = s.tileCacheSize;
    globe.preloadSiblings = q.tier === 'HIGH';
    globe.showGroundAtmosphere = s.groundAtmosphere;
    if (scene.skyAtmosphere) scene.skyAtmosphere.show = s.skyAtmosphere;
    scene.fog.enabled = s.fog;
    // FXAA smears text and thin lines. High-DPI screens need no anti-aliasing at native
    // resolution; elsewhere the tier's MSAA (geometry only — labels stay sharp) is used.
    scene.postProcessStages.fxaa.enabled = false;
    scene.msaaSamples = dpr >= 1.5 ? 1 : s.msaaSamples;
    scene.highDynamicRange = false;
    this.lighting = s.lighting;
    this.syncLighting();
    this.events.setSettings({
      maxEvents: s.maxEvents,
      maxLabels: s.maxLabels,
      clusterCellPx: s.clusterCellPx,
    });
    this.syncTerrain();
    scene.requestRender();
  }

  /** The quality tier allows lighting (off on LOW). */
  private lighting = true;
  private lightingTimeMs: number | null = null;
  /** User settings: night side, and city lights on it. */
  private dayNight = true;
  private nightLights = true;
  private nightLayer: Cesium.ImageryLayer | null = null;
  private nightLook: NightLightsLook | null = null;

  /** Sun position for lighting. null = uniform lighting (used when the time-of-day is unknown). */
  setLightingTime(ms: number | null): void {
    this.lightingTimeMs = ms;
    if (ms !== null) this.viewer.clock.currentTime = Cesium.JulianDate.fromDate(new Date(ms));
    this.syncLighting();
  }

  /** Night side on/off (off = evenly lit globe) and city lights on the night side. */
  setNightOptions(o: { dayNight: boolean; nightLights: boolean }): void {
    this.dayNight = o.dayNight;
    this.nightLights = o.nightLights;
    this.syncLighting();
  }

  private lightingStatus(): string {
    if (!this.dayNight) return 'evenly lit (setting off)';
    if (!this.lighting) return 'evenly lit (LOW quality)';
    if (this.lightingTimeMs === null) return 'evenly lit (time of day not set)';
    const layer = this.nightLayer;
    return layer?.show
      ? `night side + lights ${Math.round(layer.nightAlpha * 100)} %, cut ${layer.colorToAlphaThreshold.toFixed(2)}`
      : 'night side';
  }

  private syncLighting(): void {
    const time = this.lighting && this.dayNight ? this.lightingTimeMs : null;
    this.viewer.scene.globe.enableLighting = time !== null;
    // No lights before electric lighting; fewer and dimmer further back (nightLights.ts).
    const look = time !== null && this.nightLights ? nightLightsAt(time) : null;
    this.nightLook = look;
    if (look && !this.nightLayer) {
      this.nightLayer = new Cesium.ImageryLayer(createNightLights(), {
        dayAlpha: 0,
        colorToAlpha: Cesium.Color.BLACK,
      });
      this.viewer.imageryLayers.add(this.nightLayer);
    }
    if (this.nightLayer) {
      this.nightLayer.show = !!look;
      if (look) this.nightLayer.colorToAlphaThreshold = look.cut;
    }
    this.fadeNightLights();
    this.viewer.scene.requestRender();
  }

  /**
   * Every frame: the lights fade with the night side as the camera comes close (lights over a
   * daylit-looking map would glare), and are brightened by as much as the night side is
   * darkened (GlobeFS shades full night to 30 %), so they keep the same strength at any zoom.
   */
  private fadeNightLights(): void {
    const layer = this.nightLayer;
    if (!layer?.show || !this.nightLook) return;
    const globe = this.viewer.scene.globe;
    const distance = Cesium.Cartesian3.magnitude(this.viewer.camera.positionWC);
    const fade = Cesium.Math.clamp(
      (distance - globe.lightingFadeOutDistance) /
        (globe.lightingFadeInDistance - globe.lightingFadeOutDistance),
      0,
      1,
    );
    layer.nightAlpha = this.nightLook.alpha * fade;
    layer.brightness = 1 / (1 - 0.7 * fade);
  }

  setQualityPreference(p: QualityPreference): void {
    this.perf.setPreference(p);
    this.applyQuality(this.perf.quality);
    this.cb.onQuality(this.perf.quality);
  }

  setReducedMotion(v: boolean): void {
    this.reducedMotion = v;
  }

  setEvents(events: EventSummary[]): void {
    this.events.setEvents(events);
  }

  setEventsVisible(v: boolean): void {
    this.events.setVisible(v);
  }

  setLabels(v: boolean): void {
    this.events.setSettings({ labels: v });
  }

  setSelected(id: string | null): void {
    this.events.setSelected(id);
  }

  private bordersState: {
    features: BorderFeatureLike[];
    lines: BorderLineLike[] | null;
    labels: BorderLabel[] | null;
  } | null = null;
  private frontlinesState: Frontline[] = [];

  private altitudeKm = 20_000;

  /**
   * Lines are draped on the ground when 3D terrain is active and the camera is close enough
   * for terrain to shift them visibly; from farther out, plain lines are as good and far cheaper.
   */
  private get clampToGround(): boolean {
    return this.terrainKind !== 'ellipsoid' && this.altitudeKm < DRAPE_BELOW_KM;
  }

  /**
   * `features` drive labels and fills; when `lines` are given (modern Natural Earth land
   * boundaries) they are drawn instead of the polygon outlines.
   */
  setBorders(
    features: BorderFeatureLike[] | null,
    lines: BorderLineLike[] | null = null,
    labels: BorderLabel[] | null = null,
  ): void {
    this.bordersState = features ? { features, lines, labels } : null;
    this.drawBorders();
  }

  /** Update border name labels only (e.g. as the view moves) without rebuilding the lines. */
  setBorderLabels(labels: BorderLabel[]): void {
    if (!this.bordersState) return;
    this.bordersState = { ...this.bordersState, labels };
    this.borders.setLabels(labels, TIER_SETTINGS[this.perf.quality.tier].borderLabels);
  }

  private drawBorders(): void {
    if (!this.bordersState) return this.borders.clear();
    const s = TIER_SETTINGS[this.perf.quality.tier];
    const { features, lines, labels } = this.bordersState;
    this.borders.setFeatures(features, {
      fills: s.borderFills,
      labelBudget: s.borderLabels,
      outlines: !lines,
      ...(lines ? { lines } : {}),
      ...(labels ? { labels } : {}),
      clampToGround: this.clampToGround,
    });
  }

  setHighlight(geometry: BorderFeatureLike['geometry'] | null): void {
    this.highlight.set(geometry);
  }

  /** Glowing outline of the selected country (null clears it). */
  setCountryOutline(parts: number[][] | null): void {
    this.countryOutline.set(parts);
  }

  setFrontlines(lines: Frontline[]): void {
    this.frontlinesState = lines;
    this.drawFrontlines();
  }

  private drawFrontlines(): void {
    this.frontlines.set(this.frontlinesState, this.clampToGround);
  }

  flyTo(lat: number, lon: number, altitudeKm: number): void {
    const destination = Cesium.Cartesian3.fromDegrees(lon, lat, Math.max(1, altitudeKm) * 1000);
    const camera = this.viewer.camera;
    camera.cancelFlight();
    if (this.reducedMotion) {
      camera.setView({ destination });
      this.reportCamera();
    } else {
      camera.flyTo({
        destination,
        duration: 2.2,
        easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT,
      });
    }
  }

  intro(): void {
    this.flyTo(22, 60, 19_000);
  }

  private reportCamera(): void {
    const camera = this.viewer.camera;
    const carto = camera.positionCartographic;
    const rect = camera.computeViewRectangle(this.viewer.scene.globe.ellipsoid);
    const altitudeKm = carto.height / 1000;
    const wasDraped = this.clampToGround;
    this.altitudeKm = altitudeKm;
    if (this.clampToGround !== wasDraped) {
      this.drawBorders();
      this.drawFrontlines();
    }
    let bbox: string | null = null;
    if (rect && altitudeKm < 4000) {
      const d = Cesium.Math.toDegrees;
      bbox = [d(rect.west), d(rect.south), d(rect.east), d(rect.north)]
        .map((v) => v.toFixed(2))
        .join(',');
    }
    this.cb.onCamera({
      lat: Cesium.Math.toDegrees(carto.latitude),
      lon: Cesium.Math.toDegrees(carto.longitude),
      altitudeKm,
      bbox,
    });
    this.events.relabel();
  }

  diagnostics(): GlobeDiagnostics {
    const s = this.perf.stats();
    const q = this.perf.quality;
    const canvas = this.viewer.scene.canvas;
    return {
      ...s,
      tier: q.tier,
      preference: this.perf.mode,
      targetFps: q.targetFps,
      resolutionScale: q.resolutionScale,
      effectivePixelRatio: Math.round((canvas.width / Math.max(1, canvas.clientWidth)) * 100) / 100,
      cameraAltitudeKm: Math.round(this.viewer.camera.positionCartographic.height / 1000),
      visibleEvents: this.events.stats.visibleEvents,
      visibleLabels: this.events.stats.visibleLabels + this.borders.stats.labels,
      clusters: this.events.stats.clusters,
      visiblePolygons: this.borders.stats.polygons,
      frontlines: this.frontlines.stats.lines,
      networkRequests: this.networkRequests,
      imagery: this.imagery,
      terrain: this.terrainKind,
      lighting: this.lightingStatus(),
      canvas: `${canvas.width}×${canvas.height}`,
      gpu: this.gpu,
      decisions: this.perf.decisions.slice(-6).map((d) => ({
        reason: d.reason,
        tier: d.to.tier,
        scale: d.to.resolutionScale,
        targetFps: d.to.targetFps,
      })),
    };
  }

  destroy(): void {
    this.destroyed = true;
    for (const r of this.removeListeners) r();
    this.perfObserver?.disconnect();
    this.events.destroy();
    this.borders.destroy();
    this.viewer.destroy();
  }
}
