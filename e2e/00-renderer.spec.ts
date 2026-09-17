import { expect, test } from '@playwright/test';
import { startState } from './helpers';

const SOFTWARE_NAMES = ['SwiftShader', 'llvmpipe', 'Software'];

test('the page draws on the hardware renderer', async ({ page, browserName }) => {
  await page.goto('./');
  await page.waitForFunction(
    () =>
      typeof window.__galaxyMap?.renderer === 'string' &&
      window.__galaxyMap.renderer.length > 0,
    undefined,
    { timeout: 20000 },
  );
  // This file navigates by itself, so it takes the start state the helper gives.
  await startState(page);
  const renderer = await page.evaluate(() => window.__galaxyMap?.renderer ?? '');

  expect(renderer, 'the page exposes no renderer string').toBeTruthy();
  expect(renderer.length, 'the renderer string is empty').toBeGreaterThan(0);
  for (const name of SOFTWARE_NAMES) {
    expect(renderer, `the renderer is software: ${renderer}`).not.toContain(name);
  }
  if (browserName === 'firefox') {
    // Firefox answers `NVIDIA GeForce GTX 980, or similar` for every NVIDIA card, which
    // separates hardware from software but names no card. The project turns
    // `webgl.sanitize-unmasked-renderer` off, and this is what that buys.
    expect(renderer, `the renderer string is sanitized: ${renderer}`).not.toContain(
      'or similar',
    );
  }
  console.log('renderer:', renderer);
});
