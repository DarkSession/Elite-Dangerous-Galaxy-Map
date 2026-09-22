// The cost reading of a full-set dataset switch made from the dataset library dialog.
//
// The spec is in the timed pass of `scripts/e2e.mjs`, on one worker. The test reads a
// time and asserts on it, and a reading taken beside five other browsers is not the
// reading the budget states: the same test reads 30 to 36 ms on one worker and 42.9 ms
// in the parallel pass. Every other test of the dataset library is in
// `e2e/datasets.spec.ts`, which runs in the parallel pass.
import { expect, test } from '@playwright/test';
import { FULL_SET, openMap } from './helpers';

test.use({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });

/** How many cards the grid holds, which is the bound the frame budget states. */
const CARDS = 256;

test('a full set switches inside the 40 ms budget with the dialog open', async ({
  page,
}) => {
  await openMap(page);
  // The grid holds the 256 cards the bound allows, so the reading covers the dialog's
  // own work as well as the load's: the click rebuilds the grid twice, once for the
  // spinner and once when the load settles.
  await page.evaluate(
    async ({ full, cards }) => {
      const factory = window.galaxyMapFactory;
      if (factory === undefined) throw new Error('The page has no map factory.');
      // The demo page builds a HUD of its own. It comes down first, so the test drives
      // one HUD over a canvas of its own that covers the window.
      window.galaxyMap?.dispose();
      const wrap = document.createElement('div');
      wrap.id = 'dataset-wrap';
      wrap.style.cssText = 'position: absolute; inset: 0;';
      const canvas = document.createElement('canvas');
      canvas.style.cssText =
        'display: block; width: 100%; height: 100%; touch-action: none;';
      wrap.appendChild(canvas);
      document.body.appendChild(wrap);

      // The records are made here and not inside `load()`, so the measured load reads
      // the time of the library's own work and not the time of the test's array build.
      const contentOf = (id: string): { categories: unknown[]; systems: unknown[] } => {
        const categories: { name: string }[] = [];
        for (let index = 0; index < cards; index += 1) {
          categories.push({
            name: `${id.toUpperCase()} ${index}`,
            color: [153, 230, 255],
            maxDrawRange: 200000,
            description: `The category ${index} of ${id}.`,
          } as never);
        }
        const systems: unknown[] = [];
        for (let index = 0; index < full; index += 1) {
          // The line wraps every 10,000 records and steps along `z`. A straight ramp of
          // the index leaves the model bounds, and the reader would then reject most of
          // the records as `out-of-bounds`.
          systems.push({
            name: `${id}-${index}`,
            coords: { x: (index % 10000) - 5000, y: 0, z: ((index / 10000) | 0) * 20 },
            categories: [
              (categories[index % categories.length] as { name: string }).name,
            ],
          });
        }
        return { categories: categories as unknown[], systems };
      };

      const heavy = (id: string, label: string, extra: object): unknown => {
        const content = contentOf(id);
        return { id, label, ...extra, load: (): unknown => content };
      };
      const datasets: unknown[] = [
        heavy('full-a', 'Full A', {}),
        heavy('full-b', 'Full B', {
          bounds: { mode: 'auto' },
          view: { fit: 'systems' },
        }),
      ];
      // The rest of the grid. They load nothing, and they are there to make the card
      // count the bound the budget states.
      for (let index = 0; index < cards - 2; index += 1) {
        datasets.push({
          id: `filler-${String(index)}`,
          label: `Filler ${String(index)}`,
          collection: `Collection ${String(index % 3)}`,
          load: (): unknown => ({ categories: [], systems: [] }),
        });
      }

      const map = factory(canvas, {
        hud: true,
        datasets,
        dataset: 'full-a',
      } as never);
      window.__datasetMap = map;
      await map.ready;
    },
    { full: FULL_SET, cards: CARDS },
  );

  await page.locator('#dataset-wrap .gm-hud__dataset').click();
  await expect(page.locator('#dataset-wrap .gm-hud__dataset-card')).toHaveCount(CARDS);

  // The reading runs in the page and ends on the attribute that hides the dialog, so it
  // holds no round trip of the test runner.
  const measure = await page.evaluate(async () => {
    const card = document.querySelector<HTMLElement>(
      '#dataset-wrap .gm-hud__dataset-card[data-name="full-b"]',
    );
    const shown = document.querySelector<HTMLElement>('#dataset-wrap .gm-hud__dialog');
    if (card === null || shown === null) throw new Error('The dialog is not open.');
    const closed = new Promise<void>((resolve) => {
      const watch = new MutationObserver(() => {
        if (shown.hidden) {
          watch.disconnect();
          resolve();
        }
      });
      watch.observe(shown, { attributes: true, attributeFilter: ['hidden'] });
    });
    const started = performance.now();
    card.click();
    await closed;
    return performance.now() - started;
  });
  const after = await page.evaluate(() => {
    const map = window.__datasetMap;
    return {
      systems: map?.systemCount() ?? -1,
      categories: map?.categoryCount() ?? -1,
      loaded: map?.getLoadedDataset()?.id ?? null,
    };
  });
  console.log('the switch with the dialog open took', measure, 'ms, and holds', after);

  expect(after).toMatchObject({
    systems: FULL_SET,
    categories: CARDS,
    loaded: 'full-b',
  });
  expect(measure).toBeLessThan(40);
});
