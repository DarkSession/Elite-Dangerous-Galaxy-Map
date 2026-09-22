// The cost reading of the category panel's count pass.
//
// The spec is in the timed pass of `scripts/e2e.mjs`, on one worker. The test reads a
// time and asserts on it, and a reading taken beside five other browsers is not the
// reading the budget states. Every other test of the HUD is in `e2e/hud.spec.ts`, which
// runs in the parallel pass.
import { expect, test } from '@playwright/test';
import { FULL_SET, openMap } from './helpers';
import type { SystemRecordInput } from '../packages/galaxy-map/src/scene-data/real-systems';

test.use({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });

/** The colour every category in this file takes. */
const CORE: [number, number, number] = [153, 230, 255];

/** The names of the eight categories the records share. */
const NAMES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

test('the count pass holds its budget', async ({ page }) => {
  await openMap(page);
  // The demo page builds a HUD of its own. It comes down first, so the test drives one
  // HUD over a canvas of its own that covers the window.
  await page.evaluate(async (color) => {
    const factory = window.galaxyMapFactory;
    if (factory === undefined) throw new Error('The page has no map factory.');
    window.galaxyMap?.dispose();
    const wrap = document.createElement('div');
    wrap.id = 'hud-wrap';
    wrap.style.cssText = 'position: absolute; inset: 0;';
    const canvas = document.createElement('canvas');
    canvas.style.cssText =
      'display: block; width: 100%; height: 100%; touch-action: none;';
    wrap.appendChild(canvas);
    document.body.appendChild(wrap);
    const map = factory(canvas, { hud: true });
    window.__hudMap = map;
    await map.ready;
    map.addCategories(
      ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((name) => ({
        name,
        color,
        maxDrawRange: 200000,
        description: `About ${name}`,
      })),
    );
  }, CORE);

  const added = await page.evaluate(
    (value) => {
      const records: SystemRecordInput[] = [];
      for (let index = 0; index < value.total; index += 1) {
        records.push({
          name: `S${index}`,
          coords: { x: index * 0.01, y: 0, z: 100 },
          categories: [
            value.names[index % 8] as string,
            value.names[(index + 1) % 8] as string,
            value.names[(index + 2) % 8] as string,
            value.names[(index + 3) % 8] as string,
          ],
        });
      }
      return window.__hudMap?.addSystems(records).added ?? -1;
    },
    { names: NAMES, total: FULL_SET },
  );
  expect(added).toBe(FULL_SET);

  const hud = page.locator('#hud-wrap .gm-hud');
  await expect(hud.locator('.gm-hud__category-row[data-name="A"]')).toBeVisible();

  await hud.locator('.gm-hud__search').fill('s');
  await page.waitForTimeout(300);
  const countMs = await page.evaluate(
    () => window.__hudMap?.debug.categoryCountMs() ?? -1,
  );
  console.log('the count pass', { countMs });

  expect(countMs).toBeGreaterThanOrEqual(0);
  expect(countMs).toBeLessThan(2);
});
