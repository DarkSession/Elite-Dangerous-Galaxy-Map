import { defineConfig, devices } from '@playwright/test';

// Headless Chromium turns the GPU off by default, so the browser needs the dev
// container flags from `.devcontainer/README.md`. The ANGLE backend is Vulkan: the
// `gl-egl` path reaches only the Mesa software driver in this container, and Vulkan
// reaches the NVIDIA card, headless and headed. `e2e/00-renderer.spec.ts` asserts it.
// The renderer test must also fail on a browser without the card. Set
// GALAXY_MAP_EXTRA_CHROMIUM_ARGS=--disable-gpu to check that.
const extraArguments = (process.env['GALAXY_MAP_EXTRA_CHROMIUM_ARGS'] ?? '')
  .split(',')
  .filter((argument) => argument.length > 0);

/** The flags that put the host's card behind WebGL. Every project takes them. */
const launchArguments = [
  '--no-sandbox',
  '--use-gl=angle',
  '--use-angle=vulkan',
  '--ignore-gpu-blocklist',
  '--enable-gpu-rasterization',
  ...extraArguments,
];

/**
 * The specs that read a time and assert on it. They share one card and one set of
 * cores with every other spec, so a reading taken beside five other browsers is not
 * the reading the budget states. `pnpm test:e2e` gives them a pass of their own, on
 * one worker, after the parallel pass ends.
 */
const timedSpecs = [
  'frame-budget.spec.ts',
  'nebula-cost.spec.ts',
  'count-cost.spec.ts',
  'stars.spec.ts',
  'labels.spec.ts',
];

/**
 * What the Firefox project runs. Chromium and Firefox do not share a paint path:
 * Chromium blurs on the GPU and Firefox blurs on the CPU, so a CSS property that costs
 * Chromium 1 ms a frame can cost Firefox 7 ms. They do not share a WebGL driver either,
 * and a format one accepts the other can refuse. The project therefore reads the card,
 * as every project does, the paint cost of a camera move, and one drawn frame of the
 * nebulae. It runs no other spec: the rest of the suite reads behaviour that does not
 * follow the browser, and `e2e/look.spec.ts` holds one committed baseline image, taken
 * in Chromium, that a second browser cannot match pixel for pixel.
 *
 * No spec this project runs holds a baseline image, for that same reason.
 * `tests/browser-suite.test.ts` asserts it.
 */
const firefoxSpecs = [
  '00-renderer.spec.ts',
  'paint-cost.spec.ts',
  'nebulae-firefox.spec.ts',
];

/**
 * How many spec files run at once in the parallel pass. The container has 32 cores
 * and one card, and each worker holds a browser with its own WebGL context, so the
 * default leaves the card room. Set GALAXY_MAP_E2E_WORKERS to read a different count.
 */
const workers = Number(process.env['GALAXY_MAP_E2E_WORKERS'] ?? 6);

export default defineConfig({
  testDir: 'e2e',
  // A worker takes a whole file, and the tests inside it run in their written order.
  fullyParallel: false,
  workers,
  reporter: [['list']],
  timeout: 180_000,
  expect: { timeout: 20_000 },
  use: {
    // The demo site is served under the base path its GitHub Pages address carries, so
    // every navigation in `e2e/` is relative to it. A path that starts with `/`
    // resolves against the origin and misses the base path.
    baseURL: 'http://localhost:4173/Galaxy-Map/',
  },
  projects: [
    {
      // The hardware check gates every other project, because a reading taken on a
      // software renderer is not a reading of this map. A project that fails its
      // dependency does not run, so the suite stops at the card and says why.
      name: 'renderer-check',
      testMatch: ['00-renderer.spec.ts'],
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chromium',
        launchOptions: { args: launchArguments },
      },
    },
    {
      name: 'chromium-gpu',
      // The touch spec needs a touch-capable context, which the project below gives it.
      // Every other spec but the timed ones runs here, so `e2e/look.spec.ts` and its
      // committed baseline image are read by one project alone. The paint budget is
      // Firefox's: Chromium reads 0.8 ms for the same move and would pass whatever the
      // CPU paint cost, which is the fault the budget exists to catch.
      testIgnore: [
        '00-renderer.spec.ts',
        'touch.spec.ts',
        'paint-cost.spec.ts',
        ...timedSpecs,
      ],
      dependencies: ['renderer-check'],
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chromium',
        launchOptions: { args: launchArguments },
      },
    },
    {
      // `devices['Desktop Chrome']` sets `hasTouch: false`, so a touch context is a
      // project of its own. It shares the GPU launch arguments and runs the renderer
      // check, so the new context asserts hardware rendering as the project above does.
      name: 'chromium-touch',
      testMatch: ['00-renderer.spec.ts', 'touch.spec.ts'],
      dependencies: ['renderer-check'],
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chromium',
        hasTouch: true,
        launchOptions: { args: launchArguments },
      },
    },
    {
      // Firefox. It needs none of the Chromium flags above: it reaches the card headless
      // with its default settings. `scripts/e2e.mjs` runs it in the timed pass, on one
      // worker, because it reads a time.
      name: 'firefox',
      testMatch: firefoxSpecs,
      dependencies: ['renderer-check'],
      use: {
        ...devices['Desktop Firefox'],
        launchOptions: {
          firefoxUserPrefs: {
            // Firefox answers `NVIDIA GeForce GTX 980, or similar` for every NVIDIA
            // card. The sanitizer off, `WEBGL_debug_renderer_info` gives the card the
            // container passed through and the renderer check reads the true string.
            'webgl.sanitize-unmasked-renderer': false,
            // A browser locked to the display runs at 16.7 ms a frame and hides every
            // cost below it. Uncapped, `requestAnimationFrame` runs as fast as the work
            // allows, and the mean interval is then the per-frame main-thread cost.
            'layout.frame_rate': 0,
          },
        },
      },
    },
    {
      // The timed specs. `scripts/e2e.mjs` runs this project on its own, on one worker.
      name: 'chromium-timed',
      testMatch: timedSpecs,
      dependencies: ['renderer-check'],
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chromium',
        launchOptions: { args: launchArguments },
      },
    },
  ],
  webServer: [
    {
      // The suite serves the demo site build, which carries the page and the demo data.
      // `pnpm build` emits the library, which has no page to open.
      //
      // Always build and serve the code under test. A server left over from an earlier
      // run would serve a stale bundle. The second pass of `pnpm test:e2e` sets
      // GALAXY_MAP_E2E_BUILT, because the first pass built the same tree a moment before.
      command: process.env['GALAXY_MAP_E2E_BUILT']
        ? 'pnpm preview'
        : 'pnpm build:demo-site && pnpm preview',
      url: 'http://localhost:4173/Galaxy-Map/',
      reuseExistingServer: false,
      timeout: 300_000,
    },
    {
      // The second origin. The icon tests read one vector with
      // `Access-Control-Allow-Origin` and the same vector without it, which the demo
      // site cannot serve: a fixture it serves itself is same-origin.
      //
      // The port is fixed, as 4173 is, so a run left over from an earlier job holds it.
      // The project's one-Playwright-run-at-a-time rule therefore covers two ports.
      command: 'node e2e/fixtures/icon-origin-server.mjs',
      url: 'http://localhost:4174/requests',
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});
