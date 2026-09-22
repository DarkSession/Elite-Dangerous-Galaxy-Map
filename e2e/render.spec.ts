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

// The scenario "A host resizes the canvas box". A host can change the box with no
// resize of the window, as when it opens a side panel.
test.describe('the canvas box', () => {
  test.use({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });

  test('a host resizes the canvas box', async ({ page }) => {
    await openMap(page);
    // Past the settle window, so the loop has stopped and only the box change wakes it.
    await page.waitForTimeout(2000);

    const reading = await page.evaluate(async () => {
      const map = window.__galaxyMap;
      const canvas = document.getElementById('map');
      if (map?.readRect === undefined || !(canvas instanceof HTMLCanvasElement)) {
        return { firstSum: -1, size: [0, 0] };
      }
      const readRect = map.readRect.bind(map);
      const nextFrame = (): Promise<void> =>
        new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      /**
       * The sum of the colour bytes of the whole drawing buffer. The probe scales a CSS rectangle
       * by the ratio of the buffer width to the box width, so the height it asks for is
       * the buffer height over that ratio.
       */
      const sum = (): number => {
        const ratio = canvas.width / canvas.clientWidth;
        const tall = Math.floor(canvas.height / ratio);
        const bytes = readRect(0, 0, canvas.clientWidth, tall);
        // The colour bytes alone. The context has no alpha, so an empty buffer reads
        // 255 in the alpha byte of each pixel.
        let total = 0;
        for (let index = 0; index < bytes.length; index += 4) {
          total +=
            (bytes[index] as number) +
            (bytes[index + 1] as number) +
            (bytes[index + 2] as number);
        }
        return total;
      };
      canvas.style.width = '600px';
      // The frame of the change runs the box observer after this callback. The read
      // below runs in the next frame, before the loop renders into the new size, so it
      // reads the buffer that the page painted for the frame of the change.
      await nextFrame();
      await nextFrame();
      const firstSum = sum();
      await nextFrame();
      return { firstSum, size: map.drawingBufferSize?.() ?? [0, 0] };
    });
    console.log('the canvas after a change of its box', reading);

    expect(reading.size[0]).toBe(600);
    expect(reading.firstSum).toBeGreaterThan(0);
  });
});

// The point cloud worker sends the detail grid it decoded, so the page fetches the PNG
// once, in the worker. A worker keeps a resource timeline of its own, so its fetch is
// not in the list of the page.
test('the page fetches no detail grid of its own', async ({ page }) => {
  await openMap(page);
  const entries = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .filter((name) => name.includes('galaxy-detail')),
  );
  console.log('the detail grid entries of the page', entries);

  expect(entries).toEqual([]);
});
