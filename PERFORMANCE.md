# Performance

WorldLens adapts to the device instead of assuming a gaming GPU. This document describes the mechanisms, the quality tiers, the AUTO algorithm and — most importantly — **what has actually been measured and what has not**.

> **Honest summary.** The adaptive system is implemented and unit-tested. The only measurements so far come from a **GPU-less cloud container** (CPU-only SwiftShader WebGL), where WorldLens settles on LOW / 30 FPS target and achieves **~7 FPS**. That environment cannot reach 30 FPS even with an empty scene (measured below). **60 FPS has not been measured** on any device, and no claim of 60 FPS is made.

## Mechanisms

| Mechanism                 | Where                                                                                              | Effect                                                                                                                          |
| ------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Render on demand          | `GlobeController` (`requestRenderMode: true`, `maximumRenderTimeChange: ∞`)                        | No frames are rendered while nothing changes; an idle globe costs ~0 GPU.                                                       |
| Screen-space clustering   | `globe/clustering.ts` (grid, tier-dependent cell size)                                             | Hundreds of events become a handful of cluster markers; re-run (debounced) when the camera moves.                               |
| Horizon culling           | `globe/EventLayer.ts`                                                                              | Markers behind the Earth are skipped before clustering; markers ignore depth so they don't flicker against terrain.             |
| Marker / label budgets    | `maxEvents`, `maxLabels` per tier                                                                  | Labels go to the most important singles only.                                                                                   |
| Border simplification     | API `providers/borders.ts` (Douglas–Peucker 0.15° / 0.06° / 0.02° by tier), cached per year+detail | Lower tiers download and draw far fewer vertices.                                                                               |
| One material per polyline | `globe/GeometryLayers.ts`                                                                          | Cesium batches polylines with equal materials, so this costs no extra draw calls (and avoids shared-material destruction bugs). |
| Viewport-bounded data     | `useVisibleEvents` (debounced bbox + time window)                                                  | Only events intersecting the camera's view rectangle and the selected period are fetched.                                       |
| Code splitting            | Vite `manualChunks`; `GlobeController` loaded with dynamic `import()`                              | The UI shell (239 KB / 72 KB gzip) renders before Cesium (4.17 MB / 1.12 MB gzip) arrives.                                      |
| Reduced motion            | `prefers-reduced-motion`                                                                           | Camera flights become cuts; no idle animation.                                                                                  |

## Quality tiers

Defined in `apps/web/src/perf/tiers.ts`.

| Setting                        | LOW          | MEDIUM            | HIGH                                                |
| ------------------------------ | ------------ | ----------------- | --------------------------------------------------- |
| Resolution scale range         | 0.5 – 0.85   | 0.8 – 1.0         | 1.0 – 2.0 (HiDPI, capped at the device pixel ratio) |
| `maximumScreenSpaceError`      | 6            | 2.5               | 1.5                                                 |
| Tile cache                     | 80           | 200               | 400                                                 |
| Terrain (MapTiler, if key)     | off          | on                | on                                                  |
| Sky / ground atmosphere        | off          | on                | on                                                  |
| Lighting                       | off          | on                | on                                                  |
| Anti-aliasing                  | none         | FXAA              | MSAA ×4                                             |
| Max markers / labels           | 120 / 12     | 400 / 40          | 800 / 80                                            |
| Cluster cell                   | 84 px        | 60 px             | 46 px                                               |
| Border fills / detail / labels | no / low / 0 | yes / medium / 25 | yes / high / 60                                     |
| Animations, hover picking      | off          | on                | on                                                  |

**Initial guess** (`initialTier`): LOW for software renderers (SwiftShader, llvmpipe, “Basic Render”), Save-Data, ≤2 cores or ≤2 GB memory, and small touch screens with less than 6 GB; MEDIUM otherwise. AUTO corrects the guess within seconds. HIGH is only reached by measured headroom or by choosing it manually.

## AUTO algorithm

`apps/web/src/perf/PerformanceManager.ts` (unit-tested in `PerformanceManager.test.ts`):

1. Every rendered frame (`scene.postRender`) records the interval since the previous frame in a rolling window of 90. Intervals over 250 ms are ignored as idle gaps (render-on-demand means idle time is not slowness).
2. Once per second, if there are at least 30 samples and no change happened in the last **3 s (cooldown)**, compare the **p75** frame time with the budget (`1000 / targetFps`):
   - p75 > 1.2 × budget → a bad evaluation; **2 in a row** degrade.
   - p75 < 0.7 × budget → a good evaluation; **5 in a row** improve.
   - anything in between resets both streaks.
3. **Degrade**: lower the resolution scale by 0.1 within the tier's range; when the range is exhausted, drop a tier; on LOW at the minimum scale, if the device can't hold ~50 FPS, switch the **target to 30 FPS** (“weak hardware, stabilise at 30 FPS”) instead of thrashing.
4. **Improve**: mirror image — return to a 60 FPS target only if p75 is below 80 % of the 60 FPS budget, then raise resolution, then raise the tier.
5. Every change clears the sample window (old samples describe old settings) and is logged with its reason.

A manual choice (LOW / MEDIUM / HIGH in the Layers menu) pins the tier; AUTO is the default.

## Diagnostics

Open with **Shift+D**, `?diag=1`, or Layers → Developer diagnostics. It shows FPS, p50/p90 frame time, tier, preference, target FPS, resolution scale, effective pixel ratio, camera altitude, visible events/labels/clusters/polygons/frontlines, network and API request counts, imagery and terrain providers, canvas size, the WebGL renderer string, and the last decisions with their reasons. `window.__worldlens.diagnostics()` returns the same object (used by the performance test).

## Measurements

### 1 · Adaptive run (`e2e/performance.spec.ts`)

25 s of continuous drag-rotation of the globe, then the diagnostics are written to `perf-results/perf-<timestamp>.json`.

| Field          | Value                                                                                                    |
| -------------- | -------------------------------------------------------------------------------------------------------- |
| Measured at    | 2026-10-14T13:09Z                                                                                        |
| Browser        | Playwright Chromium (headless), 1440×900 viewport                                                        |
| WebGL renderer | `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)` — **software, no GPU** |
| Machine        | cloud container, 4 vCPU                                                                                  |
| Final state    | tier **LOW**, resolution scale **0.5** (canvas 720×450), target **30 FPS**                               |
| Result         | **7 FPS**, frame time p50 127.7 ms, p90 196.2 ms (161 frames)                                            |
| Decisions      | start LOW at 0.7 → `lower resolution` 0.6 → 0.5 → `weak hardware, stabilise at 30 FPS`                   |

A repeat run (2026-10-14T13:23Z) gave the same final state and 7 FPS (p50 133.8 ms, p90 168.0 ms).

The manager behaved as designed (graduated steps, no oscillation, started on LOW because of the software renderer), but **the 30 FPS target was not achieved in this environment.**

### 2 · Where the time goes on SwiftShader (manual experiment)

Same container, viewport 1280×800, LOW pinned. A `requestAnimationFrame` loop rotated the camera every frame for 3 s per row; FPS = frames Cesium actually rendered ÷ 3 s.

| Configuration                                 | Canvas   | Rendered FPS |
| --------------------------------------------- | -------- | ------------ |
| scale 1.0                                     | 1280×800 | 1.0          |
| scale 0.5 (the LOW floor)                     | 640×400  | 7.3          |
| scale 0.25                                    | 320×200  | 11.7         |
| scale 0.5, sky box off                        | 640×400  | 6.7          |
| scale 0.5, sky box + fog off                  | 640×400  | 7.7          |
| scale 0.5, all markers/borders hidden         | 640×400  | 9.3          |
| scale 0.5, **globe hidden too (empty scene)** | 640×400  | 13.3         |

Conclusions:

- Frame rate here is dominated by pixel count (software fill-rate and compositing), not by WorldLens content: an **empty Cesium scene reaches only ~13 FPS**. No setting can bring this environment to 30 FPS.
- Sky box and fog make no measurable difference; markers/borders cost ~20 %.
- Lowering LOW's floor from 0.5 to 0.25 would gain ~60 % here but makes markers and labels unreadable. The floor stays at **0.5**; on real (even weak, integrated) GPUs fill-rate is orders of magnitude higher, so this trade-off should be revisited only with measurements from such hardware.

### Not measured

- Any **hardware GPU** (integrated or discrete), so **no 30 FPS or 60 FPS claim** is made for real devices.
- Real phones and tablets (responsive layouts were tested in emulated viewports only).
- Satellite imagery and terrain (MapTiler not reachable from the build environment); measurements used bundled Natural Earth II imagery.
- Long sessions (memory growth over hours).

## Measuring on your machine

```bash
pnpm install
PW_GPU=1 pnpm exec playwright test e2e/performance.spec.ts --headed
cat perf-results/perf-*.json      # renderer string, tier, FPS, p50/p90, decisions
```

`PW_GPU=1` disables the forced SwiftShader flags so Chromium uses the real GPU; `--headed` avoids headless compositing. The test runs against the Vite dev server (unminified), so treat its numbers as a lower bound for the production build. Please publish the renderer string with any number. In a normal browser, open `?diag=1` and rotate the globe for 20–30 s to read the same figures.
