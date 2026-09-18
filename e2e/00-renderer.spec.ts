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

// A context that cannot blend into a 32-bit float target draws every sphere at a share of
// 1 and caps no line, which is the frame this change replaces. Both browsers of the gate
// give both extensions, so a run that reads the fallback measures the wrong frame. This
// test runs in every project, and the shape tests read the buffer itself in Chromium.
test('the context blends into a float target', async ({ page }) => {
  await page.goto('./');
  // This file navigates by itself, so it takes the start state the helper gives.
  await startState(page);
  const extensions = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (gl === null) return null;
    return {
      colour: gl.getExtension('EXT_color_buffer_float') !== null,
      blend: gl.getExtension('EXT_float_blend') !== null,
    };
  });
  console.log('the float extensions', extensions);

  expect(extensions, 'the browser gives no WebGL2 context').not.toBeNull();
  expect(extensions?.colour, 'the context gives no EXT_color_buffer_float').toBe(true);
  expect(extensions?.blend, 'the context gives no EXT_float_blend').toBe(true);
});
