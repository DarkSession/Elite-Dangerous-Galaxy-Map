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
const timedSpecs = ['frame-budget.spec.ts', 'stars.spec.ts', 'labels.spec.ts'];

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
    baseURL: 'http://localhost:4173/Elite-Dangerous-Galaxy-Map/',
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
      // committed baseline image are read by one project alone.
      testIgnore: ['00-renderer.spec.ts', 'touch.spec.ts', ...timedSpecs],
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
  webServer: {
    // The suite serves the demo site build, which carries the page and the demo data.
    // `pnpm build` emits the library, which has no page to open.
    //
    // Always build and serve the code under test. A server left over from an earlier
    // run would serve a stale bundle. The second pass of `pnpm test:e2e` sets
    // GALAXY_MAP_E2E_BUILT, because the first pass built the same tree a moment before.
    command: process.env['GALAXY_MAP_E2E_BUILT']
      ? 'pnpm preview'
      : 'pnpm build:demo-site && pnpm preview',
    url: 'http://localhost:4173/Elite-Dangerous-Galaxy-Map/',
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
