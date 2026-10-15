/**
 * Adaptive performance manager.
 *
 * Measures real frame intervals (from Cesium's postRender) in a rolling window and, in AUTO
 * mode, adjusts quality gradually:
 *   1. resolution scale moves in 0.1 steps within the current tier's range;
 *   2. only when the range is exhausted does the tier change.
 * Hysteresis: degrading needs 2 consecutive bad evaluations, upgrading needs 5 consecutive
 * good ones, and every change starts a cooldown. This prevents oscillation.
 *
 * Targets: 60 FPS by default. If the device cannot hold ~50 FPS even at the lowest setting,
 * the target becomes 30 FPS ("weak hardware") so the experience stays stable instead of
 * thrashing; it returns to 60 when there is clear headroom.
 *
 * Because the globe uses requestRenderMode, idle periods render no frames. Intervals longer
 * than `maxIntervalMs` are treated as idle gaps and ignored.
 */
import { TIERS, TIER_SETTINGS, type QualityPreference, type QualityTier } from './tiers';

export interface QualityState {
  tier: QualityTier;
  resolutionScale: number;
  targetFps: 30 | 60;
}

export interface PerfStats {
  fps: number;
  frameTimeP50: number;
  frameTimeP90: number;
  samples: number;
  framesRendered: number;
}

export interface PerfDecision {
  at: number;
  from: QualityState;
  to: QualityState;
  reason: string;
}

export interface PerformanceManagerOptions {
  windowSize?: number;
  evaluateEveryMs?: number;
  cooldownMs?: number;
  maxIntervalMs?: number;
  allowHigh?: boolean;
  /**
   * Highest useful resolution scale: the display's pixel ratio (capped at 2). Scale 1 renders
   * at CSS pixels, which a high-DPI screen then stretches — blurry text, lines and imagery.
   */
  maxResolution?: number;
  now?: () => number;
}

const round1 = (v: number) => Math.round(v * 10) / 10;

export class PerformanceManager {
  private intervals: number[] = [];
  private lastFrameAt: number | null = null;
  private lastEvalAt = 0;
  private lastChangeAt = -Infinity;
  private badStreak = 0;
  private goodStreak = 0;
  private framesRendered = 0;
  private listeners = new Set<(q: QualityState) => void>();
  readonly decisions: PerfDecision[] = [];
  private q: QualityState;
  private preference: QualityPreference;

  private readonly windowSize: number;
  private readonly evaluateEveryMs: number;
  private readonly cooldownMs: number;
  private readonly maxIntervalMs: number;
  private readonly allowHigh: boolean;
  private readonly maxResolution: number;
  private readonly now: () => number;

  constructor(
    initial: QualityTier,
    preference: QualityPreference = 'AUTO',
    opts: PerformanceManagerOptions = {},
  ) {
    this.windowSize = opts.windowSize ?? 90;
    this.evaluateEveryMs = opts.evaluateEveryMs ?? 1000;
    this.cooldownMs = opts.cooldownMs ?? 3000;
    this.maxIntervalMs = opts.maxIntervalMs ?? 250;
    this.allowHigh = opts.allowHigh ?? true;
    this.maxResolution = opts.maxResolution ?? 1;
    this.now = opts.now ?? (() => performance.now());
    this.preference = preference;
    const tier = preference === 'AUTO' ? initial : preference;
    // Start sharp (the display's own resolution); LOW starts mid-range for weak devices.
    this.q = { tier, resolutionScale: this.maxRes(tier), targetFps: 60 };
    if (tier === 'LOW')
      this.q.resolutionScale = round1(
        (TIER_SETTINGS.LOW.resolutionMin + TIER_SETTINGS.LOW.resolutionMax) / 2,
      );
  }

  /** A tier's top resolution on this display (no point exceeding its pixel ratio). */
  private maxRes(tier: QualityTier): number {
    const s = TIER_SETTINGS[tier];
    return Math.max(s.resolutionMin, Math.min(s.resolutionMax, this.maxResolution));
  }

  get quality(): QualityState {
    return { ...this.q };
  }

  get mode(): QualityPreference {
    return this.preference;
  }

  onChange(fn: (q: QualityState) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Manual tier or AUTO. Manual tiers pin the tier at its default resolution. */
  setPreference(p: QualityPreference): void {
    this.preference = p;
    this.badStreak = this.goodStreak = 0;
    if (p !== 'AUTO')
      this.apply({ tier: p, resolutionScale: this.maxRes(p), targetFps: 60 }, `manual ${p}`);
  }

  /** Call once per rendered frame. */
  frame(): void {
    const t = this.now();
    this.framesRendered++;
    if (this.lastFrameAt !== null) {
      const dt = t - this.lastFrameAt;
      if (dt > 0 && dt <= this.maxIntervalMs) {
        this.intervals.push(dt);
        if (this.intervals.length > this.windowSize) this.intervals.shift();
      }
    }
    this.lastFrameAt = t;
    if (t - this.lastEvalAt >= this.evaluateEveryMs) {
      this.lastEvalAt = t;
      this.evaluate(t);
    }
  }

  stats(): PerfStats {
    const s = [...this.intervals].sort((a, b) => a - b);
    const pct = (p: number) =>
      s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))]! : 0;
    const mean = s.length ? s.reduce((a, b) => a + b, 0) / s.length : 0;
    return {
      fps: mean ? Math.round(1000 / mean) : 0,
      frameTimeP50: Math.round(pct(0.5) * 10) / 10,
      frameTimeP90: Math.round(pct(0.9) * 10) / 10,
      samples: s.length,
      framesRendered: this.framesRendered,
    };
  }

  private evaluate(t: number): void {
    if (this.preference !== 'AUTO' || this.intervals.length < 30) return;
    if (t - this.lastChangeAt < this.cooldownMs) return;
    const s = [...this.intervals].sort((a, b) => a - b);
    const p75 = s[Math.floor(s.length * 0.75)]!;
    const budget = 1000 / this.q.targetFps;
    if (p75 > budget * 1.2) {
      this.goodStreak = 0;
      if (++this.badStreak >= 2) this.degrade(p75);
    } else if (p75 < budget * 0.7) {
      this.badStreak = 0;
      if (++this.goodStreak >= 5) this.improve(p75);
    } else {
      this.badStreak = 0;
      this.goodStreak = 0;
    }
  }

  private degrade(p75: number): void {
    const s = TIER_SETTINGS[this.q.tier];
    const reason = `p75 ${p75.toFixed(1)} ms over ${(1000 / this.q.targetFps).toFixed(1)} ms budget`;
    if (this.q.resolutionScale - 0.1 >= s.resolutionMin - 1e-6) {
      return this.apply(
        { ...this.q, resolutionScale: round1(this.q.resolutionScale - 0.1) },
        `${reason}: lower resolution`,
      );
    }
    const i = TIERS.indexOf(this.q.tier);
    if (i > 0) {
      const lower = TIERS[i - 1]!;
      return this.apply(
        { ...this.q, tier: lower, resolutionScale: this.maxRes(lower) },
        `${reason}: drop to ${lower}`,
      );
    }
    if (this.q.targetFps === 60 && p75 > (1000 / 50) * 1.0) {
      return this.apply(
        { ...this.q, targetFps: 30 },
        `${reason}: weak hardware, stabilise at 30 FPS`,
      );
    }
  }

  private improve(p75: number): void {
    const reason = `p75 ${p75.toFixed(1)} ms with headroom`;
    if (this.q.targetFps === 30) {
      // Only return to a 60 FPS target if we could plausibly hold it.
      if (p75 < (1000 / 60) * 0.8)
        return this.apply({ ...this.q, targetFps: 60 }, `${reason}: retarget 60 FPS`);
      return;
    }
    if (this.q.resolutionScale + 0.1 <= this.maxRes(this.q.tier) + 1e-6) {
      return this.apply(
        { ...this.q, resolutionScale: round1(this.q.resolutionScale + 0.1) },
        `${reason}: raise resolution`,
      );
    }
    const i = TIERS.indexOf(this.q.tier);
    const next = TIERS[i + 1];
    if (next && (next !== 'HIGH' || this.allowHigh)) {
      return this.apply(
        {
          ...this.q,
          tier: next,
          // A better tier never renders less sharply than the current one.
          resolutionScale: Math.min(
            this.maxRes(next),
            Math.max(TIER_SETTINGS[next].resolutionMin, this.q.resolutionScale),
          ),
        },
        `${reason}: raise to ${next}`,
      );
    }
  }

  private apply(to: QualityState, reason: string): void {
    const from = this.q;
    if (
      from.tier === to.tier &&
      from.resolutionScale === to.resolutionScale &&
      from.targetFps === to.targetFps
    )
      return;
    this.q = to;
    this.lastChangeAt = this.now();
    this.badStreak = 0;
    this.goodStreak = 0;
    // Older samples describe the previous settings.
    this.intervals = [];
    this.decisions.push({ at: this.lastChangeAt, from, to, reason });
    if (this.decisions.length > 50) this.decisions.shift();
    for (const l of this.listeners) l({ ...to });
  }
}
