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

/** The flags that put the host's card behind WebGL. Both projects take them. */
const launchArguments = [
  '--no-sandbox',
  '--use-gl=angle',
  '--use-angle=vulkan',
  '--ignore-gpu-blocklist',
  '--enable-gpu-rasterization',
  ...extraArguments,
];

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
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
      name: 'chromium-gpu',
      // The touch spec needs a touch-capable context, which the project below gives it.
      // Every other spec runs here, so `e2e/look.spec.ts` and its committed baseline
      // image are read by one project alone.
      testIgnore: 'touch.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chromium',
        launchOptions: { args: launchArguments },
      },
    },
    {
      // `devices['Desktop Chrome']` sets `hasTouch: false`, so a touch context is a
      // project of its own. It shares the GPU launch arguments and runs the renderer
      // check, so the new context asserts hardware rendering as `chromium-gpu` does.
      name: 'chromium-touch',
      testMatch: ['00-renderer.spec.ts', 'touch.spec.ts'],
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chromium',
        hasTouch: true,
        launchOptions: { args: launchArguments },
      },
    },
  ],
  webServer: {
    // The suite serves the demo site build, which carries the page and the demo data.
    // `pnpm build` emits the library, which has no page to open.
    command: 'pnpm build:demo-site && pnpm preview',
    url: 'http://localhost:4173/Elite-Dangerous-Galaxy-Map/',
    // Always build and serve the code under test. A server left over from an
    // earlier run would serve a stale bundle.
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
