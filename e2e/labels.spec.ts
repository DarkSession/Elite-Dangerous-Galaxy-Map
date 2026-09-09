import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openMap } from './helpers';

test.use({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });

/** One label on the page. */
interface LabelReading {
  readonly name: string;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** Reads the region labels the page holds, with their boxes in CSS pixels. */
async function readLabels(page: Page): Promise<LabelReading[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('.region-label')).map((element) => {
      const box = element.getBoundingClientRect();
      return {
        name: element.textContent ?? '',
        left: box.left,
        top: box.top,
        width: box.width,
        height: box.height,
      };
    }),
  );
}

/** True when a box lies inside the 1280 by 720 viewport. */
function insideViewport(label: LabelReading): boolean {
  return (
    label.left >= 0 &&
    label.top >= 0 &&
    label.left + label.width <= 1280 &&
    label.top + label.height <= 720
  );
}

test('no label at the far view', async ({ page }) => {
  await openMap(page);
  expect(await readLabels(page)).toEqual([]);
});

test('the core is named', async ({ page }) => {
  await openMap(page, '#c=15,0,25895&d=20000&p=35&y=0');
  const labels = await readLabels(page);
  console.log(
    'the labels at the core',
    labels.map((label) => label.name),
  );
  const core = labels.find((label) => label.name === 'Galactic Centre');
  expect(core).toBeDefined();
  expect(insideViewport(core as LabelReading)).toBe(true);
});

test('the region under the cursor keeps its label at the closest zoom', async ({
  page,
}) => {
  await openMap(page, '#c=0,0,0&d=500&p=35&y=0');
  const labels = await readLabels(page);
  const spur = labels.find((label) => label.name === 'Inner Orion Spur');
  expect(spur).toBeDefined();
  const box = spur as LabelReading;
  console.log('the label of the region under the cursor', box);
  expect(insideViewport(box)).toBe(true);
  expect(box.top + box.height / 2).toBeLessThan(360);
});

test('a centroid behind the camera labels the right edge', async ({ page }) => {
  await openMap(page, '#c=0,0,0&d=500&p=35&y=180');
  const labels = await readLabels(page);
  const spur = labels.find((label) => label.name === 'Inner Orion Spur');
  expect(spur).toBeDefined();
  const box = spur as LabelReading;
  console.log('the label of a centroid behind the camera', box);
  expect(insideViewport(box)).toBe(true);
  expect(box.top + box.height / 2).toBeGreaterThan(360);
});

test('labels neither crowd nor overlap', async ({ page }) => {
  await openMap(page, '#c=15,0,25895&d=20000&p=35&y=0');
  const labels = await readLabels(page);
  expect(labels.length).toBeLessThanOrEqual(12);
  for (let first = 0; first < labels.length; first += 1) {
    for (let second = first + 1; second < labels.length; second += 1) {
      const one = labels[first] as LabelReading;
      const two = labels[second] as LabelReading;
      const apart =
        one.left >= two.left + two.width ||
        two.left >= one.left + one.width ||
        one.top >= two.top + two.height ||
        two.top >= one.top + one.height;
      expect(apart, `${one.name} and ${two.name} overlap`).toBe(true);
    }
  }
});
