import { expect, test } from '@playwright/test';

const SOFTWARE_NAMES = ['SwiftShader', 'llvmpipe', 'Software'];

test('the page draws on the hardware renderer', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(
    () =>
      typeof window.__galaxyMap?.renderer === 'string' &&
      window.__galaxyMap.renderer.length > 0,
    undefined,
    { timeout: 20000 },
  );
  const renderer = await page.evaluate(() => window.__galaxyMap?.renderer ?? '');

  expect(renderer, 'the page exposes no renderer string').toBeTruthy();
  expect(renderer.length, 'the renderer string is empty').toBeGreaterThan(0);
  for (const name of SOFTWARE_NAMES) {
    expect(renderer, `the renderer is software: ${renderer}`).not.toContain(name);
  }
  console.log('renderer:', renderer);
});
