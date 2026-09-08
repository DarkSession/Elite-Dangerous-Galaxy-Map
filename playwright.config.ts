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

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  timeout: 180_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL: 'http://localhost:4173',
  },
  projects: [
    {
      name: 'chromium-gpu',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chromium',
        launchOptions: {
          args: [
            '--no-sandbox',
            '--use-gl=angle',
            '--use-angle=vulkan',
            '--ignore-gpu-blocklist',
            '--enable-gpu-rasterization',
            ...extraArguments,
          ],
        },
      },
    },
  ],
  webServer: {
    command: 'pnpm build && pnpm preview',
    url: 'http://localhost:4173',
    // Always build and serve the code under test. A server left over from an
    // earlier run would serve a stale bundle.
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
