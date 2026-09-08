import { expect, test } from '@playwright/test';
import { openMap } from './helpers';

/** The frame time the map must stay under, in milliseconds. */
const BUDGET_MS = 16.7;

const SOL: [number, number, number] = [0, 0, 0];
const GALACTIC_CENTRE: [number, number, number] = [15, -35, 25895];
const DISTANCES = [2000, 20000, 120000];

test.use({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });

test('every view stays inside the frame budget', async ({ page }) => {
  test.setTimeout(180000);
  await openMap(page);

  const size = await page.evaluate(
    () => window.__galaxyMap?.drawingBufferSize?.() ?? [0, 0],
  );
  expect(size).toEqual([1920, 1080]);

  for (const cursor of [SOL, GALACTIC_CENTRE]) {
    for (const distance of DISTANCES) {
      const mean = await page.evaluate(
        (view) => {
          window.__galaxyMap?.setView?.({
            cursor: view.cursor,
            distance: view.distance,
            yaw: 0,
            pitch: 35,
          });
          return window.__galaxyMap?.measureFrames?.(300) ?? Number.POSITIVE_INFINITY;
        },
        { cursor, distance },
      );
      console.log(
        `cursor ${cursor.join(',')} distance ${distance}: ${mean.toFixed(3)} ms`,
      );
      expect(mean).toBeGreaterThan(0);
      expect(mean).toBeLessThan(BUDGET_MS);
    }
  }
});
