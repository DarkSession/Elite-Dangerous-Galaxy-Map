// The nine sample pages of the built site.
//
// Each one is a page a reader of the wiki opens, so the reading is the reader's: the page
// draws, and it raises no error. The sample writes no test hook, so the spec reads the
// pixels the renderer left. The context keeps its drawing buffer, so a 2D canvas reads
// the middle of the map at any time.
//
// The renderer check gates this project, so a run that reaches this file is a run on the
// card. `e2e/00-renderer.spec.ts` is what fails a software renderer.
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// The file reads the HUD, so it names a viewport above the drawer breakpoint. Playwright's
// default of 1280 is inside the band where the panel columns become drawers.
test.use({ viewport: { width: 1600, height: 900 } });

const examples = fileURLToPath(new URL('../apps/demo/examples/', import.meta.url));

/** The sample identifiers, which are the directory names, sorted. */
const SAMPLE_IDS = readdirSync(examples)
  .filter((name) => statSync(join(examples, name)).isDirectory())
  .sort();

/** The side of the block at the middle of the canvas the reading takes, in pixels. */
const BLOCK = 40;

/** The 48 CSS pixel square at the top left corner, which the placement keeps clear. */
const CORNER = 48;

/**
 * The sum of the three channels above which a pixel is drawn and not the background. The
 * page opens on a black field, so any light the renderer put down passes it.
 */
const LIT = 9;

/** Waits until the middle of the canvas holds a pixel that is not the background. */
async function waitForDrawnCentre(page: Page): Promise<void> {
  await page.waitForFunction(
    ([block, lit]) => {
      const canvas = document.querySelector('canvas');
      if (canvas === null || canvas.width === 0) return false;
      const patch = document.createElement('canvas');
      patch.width = block;
      patch.height = block;
      const context = patch.getContext('2d');
      if (context === null) return false;
      context.drawImage(
        canvas,
        Math.round(canvas.width / 2 - block / 2),
        Math.round(canvas.height / 2 - block / 2),
        block,
        block,
        0,
        0,
        block,
        block,
      );
      const { data } = context.getImageData(0, 0, block, block);
      for (let at = 0; at < data.length; at += 4) {
        const sum =
          (data[at] as number) + (data[at + 1] as number) + (data[at + 2] as number);
        if (sum > lit) return true;
      }
      return false;
    },
    [BLOCK, LIT] as const,
    { timeout: 60000 },
  );
}

test.describe('the sample pages', () => {
  test('are the nine of the examples directory', () => {
    expect(SAMPLE_IDS.length).toBe(9);
  });

  // A sample page carries the shared stylesheet and no rule of its own for a library
  // element, so it reads whether the library places its own overlay elements without
  // help from the page. `spheres-and-lines` opens at 900 light years with a pitch of
  // -25 degrees, so the frame holds the horizon and the sweep places a label on load.
  // `the-camera` also reaches the band with no camera move of its own, but its last
  // line is a `flyTo`, so a reading of that page lands at an unpinned point of the
  // flight.
  test('spheres-and-lines places its region labels', async ({ page }) => {
    await page.goto('./examples/spheres-and-lines/');
    await waitForDrawnCentre(page);
    // The labels arrive with the sweep, which runs after the first drawn frame.
    await page.waitForFunction(
      () => document.querySelectorAll('.region-label').length > 0,
      undefined,
      { timeout: 30000 },
    );

    const reading = await page.evaluate(() => ({
      places: [...document.querySelectorAll('.region-label')].map((element) => {
        const box = element.getBoundingClientRect();
        return {
          position: getComputedStyle(element).position,
          left: box.left,
          top: box.top,
          right: box.right,
          bottom: box.bottom,
        };
      }),
      viewport: { width: window.innerWidth, height: window.innerHeight },
    }));
    console.log('the sample page labels', reading.places);

    expect(reading.places.length).toBeGreaterThan(0);
    const corners = new Set<string>();
    for (const place of reading.places) {
      expect(place.position).toBe('absolute');
      // Wholly inside the corner square is the stack in normal flow. A label the
      // placement chose to draw there passes, because part of its box lies outside.
      const inCorner =
        place.left >= 0 &&
        place.top >= 0 &&
        place.right <= CORNER &&
        place.bottom <= CORNER;
      expect(
        inCorner,
        `a label lies in the top left corner: ${JSON.stringify(place)}`,
      ).toBe(false);
      expect(place.right).toBeLessThanOrEqual(reading.viewport.width);
      expect(place.bottom).toBeLessThanOrEqual(reading.viewport.height);
      corners.add(`${place.left},${place.top}`);
    }
    expect(corners.size).toBe(reading.places.length);
  });

  for (const id of SAMPLE_IDS) {
    test(`${id} draws and raises no error`, async ({ page }) => {
      // Both readings: an uncaught exception, and an error the page wrote to the console.
      // A file the page asks for and the site does not serve is the second kind, so a
      // sample that names a picture or an icon names one the build publishes.
      const errors: string[] = [];
      page.on('pageerror', (reason) => errors.push(reason.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });

      await page.goto(`./examples/${id}/`);
      await waitForDrawnCentre(page);

      expect(errors, `${id} raised ${errors.join(', ')}`).toEqual([]);
    });
  }

  // `hud.datasetArrows` is off by default, and this is the one sample page that asks for
  // it. The page is what `docs/wiki/Examples/A-dataset-catalog.md` states the option by.
  test('the dataset catalog sample draws the step arrows and the counter', async ({
    page,
  }) => {
    await page.goto('./examples/a-dataset-catalog/');
    await waitForDrawnCentre(page);

    await expect(page.locator('.gm-hud__dataset-step')).toHaveCount(2);
    await expect(
      page.locator('.gm-hud__dataset-step[data-name="previous"]'),
    ).toHaveCount(1);
    await expect(page.locator('.gm-hud__dataset-step[data-name="next"]')).toHaveCount(
      1,
    );
    // The counter reads a dash in place of the place while the first load runs, so the
    // reading allows both.
    await expect(page.locator('.gm-hud__dataset-counter')).toHaveText(
      /^(\d+|-) \/ \d+$/,
    );
  });
});
