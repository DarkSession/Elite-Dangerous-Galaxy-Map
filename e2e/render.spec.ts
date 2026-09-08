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

  test('draws the point cloud above the background', async ({ page }) => {
    await openMap(page);
    const centre = await projectPoint(page, GALACTIC_CENTRE);

    // The tone map puts the frame over a dark grey, so the test measures against the
    // corners instead of against black.
    const readFrame = async (): Promise<{
      centre: number;
      bright: number;
      corners: number;
    }> =>
      page.evaluate((where) => {
        const readPixel = window.__galaxyMap?.readPixel;
        if (readPixel === undefined) return { centre: 0, bright: 0, corners: 0 };
        const luminance = (x: number, y: number): number => {
          const [red, green, blue] = readPixel(x, y);
          return (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
        };
        let bright = 0;
        for (let y = 40; y < 680; y += 20) {
          for (let x = 40; x < 1240; x += 20) {
            bright = Math.max(bright, luminance(x, y));
          }
        }
        const corners =
          (luminance(2, 2) +
            luminance(1277, 2) +
            luminance(2, 717) +
            luminance(1277, 717)) /
          4;
        return { centre: luminance(where.x, where.y), bright, corners };
      }, centre);

    await page.evaluate(() => {
      window.__galaxyMap?.setPasses?.({
        volume: false,
        clouds: false,
        glow: false,
        points: true,
      });
      window.__galaxyMap?.drawNow?.();
    });
    const points = await readFrame();
    expect(points.centre - points.corners).toBeGreaterThan(0.3);
    expect(points.bright - points.corners).toBeGreaterThan(0.3);

    await page.evaluate(() => {
      window.__galaxyMap?.setPasses?.({
        volume: false,
        clouds: false,
        glow: false,
        points: false,
      });
      window.__galaxyMap?.drawNow?.();
    });
    const empty = await readFrame();
    expect(empty.centre - empty.corners).toBeLessThan(0.3);
    expect(empty.bright - empty.corners).toBeLessThan(0.3);
  });

  test('draws the volume alone brighter at the centre than at Sol', async ({
    page,
  }) => {
    await openMap(page);
    await page.evaluate(() => {
      window.__galaxyMap?.setPasses?.({
        volume: true,
        clouds: false,
        glow: false,
        points: false,
      });
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
