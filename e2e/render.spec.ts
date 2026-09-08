import { expect, test } from '@playwright/test';
import { luminanceAt, openMap, projectPoint } from './helpers';

const SOL: [number, number, number] = [0, 0, 0];
const GALACTIC_CENTRE: [number, number, number] = [15, -35, 25895];

test.describe('the renderer', () => {
  test('compiles a program and reports the error text of a broken one', async ({
    page,
  }) => {
    await openMap(page);

    const good = await page.evaluate(() =>
      window.__galaxyMap?.compileTestProgram?.(
        `#version 300 es
precision highp float;
void main() { gl_Position = vec4(0.0, 0.0, 0.0, 1.0); }`,
        `#version 300 es
precision highp float;
out vec4 fragColour;
void main() { fragColour = vec4(1.0); }`,
      ),
    );
    expect(good).toBeNull();

    const bad = await page.evaluate(() =>
      window.__galaxyMap?.compileTestProgram?.(
        `#version 300 es
void main() { this is not glsl }`,
        `#version 300 es
precision highp float;
out vec4 fragColour;
void main() { fragColour = vec4(1.0); }`,
      ),
    );
    expect(bad).toContain('did not compile');
  });

  test('draws the point cloud, and the frame is not black', async ({ page }) => {
    await openMap(page);
    await page.evaluate(() => {
      window.__galaxyMap?.setPasses?.({ volume: false, points: true });
      window.__galaxyMap?.drawNow?.();
    });

    const centre = await projectPoint(page, GALACTIC_CENTRE);
    expect(await luminanceAt(page, centre)).toBeGreaterThan(0.01);

    const bright = await page.evaluate(() => {
      const map = window.__galaxyMap;
      if (map?.readPixel === undefined) return 0;
      let best = 0;
      for (let y = 40; y < 680; y += 20) {
        for (let x = 40; x < 1240; x += 20) {
          const [red, green, blue] = map.readPixel(x, y);
          best = Math.max(best, (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255);
        }
      }
      return best;
    });
    expect(bright).toBeGreaterThan(0.02);
  });

  test('draws the volume alone brighter at the centre than at Sol', async ({
    page,
  }) => {
    await openMap(page);
    await page.evaluate(() => {
      window.__galaxyMap?.setPasses?.({ volume: true, points: false });
      window.__galaxyMap?.drawNow?.();
    });

    const centre = await projectPoint(page, GALACTIC_CENTRE);
    const sol = await projectPoint(page, SOL);
    const centreLuminance = await luminanceAt(page, centre);
    const solLuminance = await luminanceAt(page, sol);

    expect(centreLuminance).toBeGreaterThan(solLuminance);
    expect(centreLuminance).toBeGreaterThan(0.5);
  });

  test('measures a positive mean frame time', async ({ page }) => {
    await openMap(page);
    const mean = await page.evaluate(
      () => window.__galaxyMap?.measureFrames?.(10) ?? -1,
    );
    expect(mean).toBeGreaterThan(0);
  });
});

test.describe('the canvas', () => {
  test.use({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 2 });

  test('gives a 1600 by 1200 drawing buffer at 800 by 600 and ratio 2', async ({
    page,
  }) => {
    await openMap(page);
    const size = await page.evaluate(
      () => window.__galaxyMap?.drawingBufferSize?.() ?? [0, 0],
    );
    expect(size).toEqual([1600, 1200]);
  });
});
