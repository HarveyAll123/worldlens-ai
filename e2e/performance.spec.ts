/**
 * Measures real frame rates while the camera moves, and records the PerformanceManager's
 * decisions. Results are written to perf-results/ with the browser/GPU description so the
 * numbers in PERFORMANCE.md come from actual runs, not claims.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';

interface Diag {
  fps: number;
  frameTimeP50: number;
  frameTimeP90: number;
  tier: string;
  targetFps: number;
  resolutionScale: number;
  gpu: string;
  canvas: string;
  framesRendered: number;
  decisions: unknown[];
}

async function spin(page: Page, seconds: number) {
  // Drag across the globe repeatedly to generate continuous frames.
  const box = (await page.getByTestId('globe').boundingBox())!;
  const y = box.y + box.height * 0.45;
  const end = Date.now() + seconds * 1000;
  while (Date.now() < end) {
    await page.mouse.move(box.x + box.width * 0.3, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.55, y + 10, { steps: 18 });
    await page.mouse.up();
  }
}

test('adaptive quality under continuous camera motion', async ({ page, browserName }) => {
  test.setTimeout(150_000);
  await openApp(page, '/?diag=1');
  await page.waitForTimeout(3000);
  await spin(page, 25);
  const d = (await page.evaluate(() =>
    (
      window as unknown as { __worldlens: { diagnostics: () => unknown } }
    ).__worldlens.diagnostics(),
  )) as Diag;
  const ua = await page.evaluate(() => navigator.userAgent);
  mkdirSync('perf-results', { recursive: true });
  const result = {
    measuredAt: new Date().toISOString(),
    browser: `${browserName} ${ua}`,
    gpu: d.gpu,
    canvas: d.canvas,
    tier: d.tier,
    targetFps: d.targetFps,
    resolutionScale: d.resolutionScale,
    fps: d.fps,
    frameTimeP50: d.frameTimeP50,
    frameTimeP90: d.frameTimeP90,
    framesRendered: d.framesRendered,
    decisions: d.decisions,
  };
  writeFileSync(`perf-results/perf-${Date.now()}.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  expect(d.framesRendered).toBeGreaterThan(30);
  // On software rendering the manager must settle on LOW with a stable 30 FPS target.
  if (/swiftshader|llvmpipe/i.test(d.gpu)) {
    expect(d.tier).toBe('LOW');
  }
});
