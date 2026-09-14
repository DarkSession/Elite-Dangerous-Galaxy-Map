import { expect, test } from '@playwright/test';
import { openMap } from './helpers';

/** The frame time the map must stay under, in milliseconds. */
const BUDGET_MS = 16.7;

const SOL: [number, number, number] = [0, 0, 0];
const GALACTIC_CENTRE: [number, number, number] = [15, -35, 25895];
// The cloud pass draws in full from 12,000 light years, and the sprite layers per
// pixel peak between 12,000 and 30,000, so both distances are in the list. The list
// also holds the three close views. 4,000 light years is the worst fill of the star
// field: the star weight is still 1, the coarsest class is the 1,280 light year
// sector, nearly every boxel is capped and most sprites sit at the 16 pixel clamp.
const DISTANCES = [500, 1000, 2000, 4000, 12000, 20000, 30000, 120000];

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

/** The four zoom distances the marker budget reads. */
const SYSTEM_DISTANCES = [500, 4000, 20000, 120000];

test('eight views stay under budget with 10,000 systems', async ({ page }) => {
  test.setTimeout(180000);
  await openMap(page);

  const count = await page.evaluate(() => {
    const map = window.galaxyMap;
    if (map === undefined) return -1;
    map.addCategories([{ name: 'Empire', color: [153, 230, 255] }]);
    // A fixed generator over the model bounds, so every run adds the same systems.
    let state = 4711;
    const unit = (): number => {
      state = (state * 1103515245 + 12345) & 0x7fffffff;
      return state / 0x7fffffff;
    };
    const records: Record<string, unknown>[] = [];
    for (let index = 0; index < 10000; index += 1) {
      records.push({
        name: `S${index}`,
        coords: {
          x: -49985 + unit() * 100000,
          y: -40985 + unit() * 81910,
          z: -24105 + unit() * 100000,
        },
        primaryCategory: 'Empire',
      });
    }
    map.addSystems(records);
    return map.systemCount();
  });
  expect(count).toBe(10000);

  for (const cursor of [SOL, GALACTIC_CENTRE]) {
    for (const distance of SYSTEM_DISTANCES) {
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
        `10,000 systems, cursor ${cursor.join(',')} distance ${distance}: ` +
          `${mean.toFixed(3)} ms`,
      );
      expect(mean).toBeGreaterThan(0);
      expect(mean).toBeLessThan(BUDGET_MS);
    }
  }
});
