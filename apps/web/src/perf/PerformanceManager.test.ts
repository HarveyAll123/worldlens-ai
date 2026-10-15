import { describe, expect, it } from 'vitest';
import { PerformanceManager } from './PerformanceManager';
import { initialTier } from './tiers';

function harness(
  initial: 'LOW' | 'MEDIUM' | 'HIGH',
  pref: 'AUTO' | 'LOW' | 'MEDIUM' | 'HIGH' = 'AUTO',
  maxResolution = 1,
) {
  let t = 0;
  const pm = new PerformanceManager(initial, pref, { now: () => t, maxResolution });
  const run = (frameMs: number, seconds: number) => {
    const frames = Math.floor((seconds * 1000) / frameMs);
    for (let i = 0; i < frames; i++) {
      t += frameMs;
      pm.frame();
    }
  };
  return { pm, run, advance: (ms: number) => (t += ms) };
}

describe('PerformanceManager', () => {
  it('measures FPS from frame intervals and ignores idle gaps', () => {
    const { pm, run, advance } = harness('MEDIUM', 'MEDIUM');
    run(1000 / 60, 2);
    advance(5000); // idle (requestRenderMode) — must not count as a 5 s frame
    run(1000 / 60, 1);
    expect(pm.stats().fps).toBeGreaterThanOrEqual(58);
    expect(pm.stats().frameTimeP90).toBeLessThan(20);
  });

  it('degrades gradually: resolution first, then tier, with hysteresis', () => {
    const { pm, run } = harness('MEDIUM');
    const start = pm.quality;
    expect(start).toEqual({ tier: 'MEDIUM', resolutionScale: 1, targetFps: 60 });
    run(28, 2.5); // ~36 FPS — over budget
    const first = pm.decisions[0]!;
    expect(first.to.tier).toBe('MEDIUM');
    expect(first.to.resolutionScale).toBe(0.9);
    run(28, 30);
    expect(pm.quality.tier).toBe('LOW');
    // Never more than one change per cooldown window.
    for (let i = 1; i < pm.decisions.length; i++) {
      expect(pm.decisions[i]!.at - pm.decisions[i - 1]!.at).toBeGreaterThanOrEqual(3000);
    }
  });

  it('renders at the display resolution on high-DPI screens, and lowers it gradually', () => {
    const { pm, run } = harness('MEDIUM', 'AUTO', 2);
    expect(pm.quality.resolutionScale).toBe(2); // Retina: crisp, not stretched CSS pixels
    run(28, 2.5);
    expect(pm.decisions[0]!.to).toMatchObject({ tier: 'MEDIUM', resolutionScale: 1.9 });
  });

  it('never exceeds the display resolution and never gets blurrier by moving up a tier', () => {
    expect(harness('HIGH', 'AUTO', 1).pm.quality.resolutionScale).toBe(1);
    expect(harness('HIGH', 'AUTO', 2).pm.quality.resolutionScale).toBe(2);
    const { pm, run } = harness('MEDIUM', 'AUTO', 2);
    run(5, 40); // lots of headroom
    expect(pm.quality.tier).toBe('HIGH');
    expect(pm.quality.resolutionScale).toBe(2);
  });

  it('stabilises weak hardware at a 30 FPS target instead of thrashing', () => {
    const { pm, run } = harness('LOW');
    run(40, 60); // 25 FPS even at minimum quality
    expect(pm.quality.tier).toBe('LOW');
    expect(pm.quality.targetFps).toBe(30);
    expect(pm.quality.resolutionScale).toBeCloseTo(0.5);
    const changes = pm.decisions.length;
    run(31, 30); // ~32 FPS: within the 30 FPS budget → no further changes
    expect(pm.decisions.length).toBe(changes);
  });

  it('does not oscillate around the threshold', () => {
    const { pm, run } = harness('MEDIUM');
    for (let i = 0; i < 20; i++) {
      run(17.5, 1); // just over 16.7 ms but within 1.2× tolerance
      run(16, 1);
    }
    expect(pm.decisions.length).toBe(0);
  });

  it('upgrades only after sustained headroom', () => {
    const { pm, run } = harness('LOW');
    run(8, 3);
    expect(pm.decisions.length).toBe(0); // needs 5 consecutive good evaluations
    run(8, 40);
    expect(pm.quality.tier).not.toBe('LOW');
  });

  it('respects manual tiers', () => {
    const { pm, run } = harness('MEDIUM', 'HIGH');
    run(40, 20);
    expect(pm.quality.tier).toBe('HIGH');
    pm.setPreference('LOW');
    expect(pm.quality.tier).toBe('LOW');
  });

  it('guesses a conservative initial tier', () => {
    expect(
      initialTier({
        devicePixelRatio: 1,
        isTouch: false,
        smallScreen: false,
        gpuRenderer: 'Google SwiftShader',
      }),
    ).toBe('LOW');
    expect(
      initialTier({ devicePixelRatio: 2, isTouch: true, smallScreen: true, deviceMemoryGb: 3 }),
    ).toBe('LOW');
    expect(
      initialTier({
        devicePixelRatio: 2,
        isTouch: false,
        smallScreen: false,
        hardwareConcurrency: 8,
        deviceMemoryGb: 8,
      }),
    ).toBe('MEDIUM');
  });
});
