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

const examples = fileURLToPath(new URL('../apps/demo/examples/', import.meta.url));

/** The sample identifiers, which are the directory names, sorted. */
const SAMPLE_IDS = readdirSync(examples)
  .filter((name) => statSync(join(examples, name)).isDirectory())
  .sort();

/** The side of the block at the middle of the canvas the reading takes, in pixels. */
const BLOCK = 40;

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
});
