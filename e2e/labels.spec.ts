import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { waitForReady } from './helpers';

/** How many views this file has opened, so each one gets its own address. */
let visits = 0;

/**
 * Opens a view and waits until the page has drawn it.
 *
 * A `page.goto` that changes only the fragment does not reload the document, and the
 * page then answers with the labels of the view before. The counter in the query makes
 * every navigation a full load, so every reading belongs to the view the test asked
 * for.
 */
async function openView(page: Page, fragment = ''): Promise<void> {
  visits += 1;
  await page.goto(`/?view=${visits}${fragment}`);
  await waitForReady(page);
}

/** One label on the page. */
interface LabelReading {
  readonly name: string;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** One region the last sweep of the page found, with the samples it holds. */
interface SampleCount {
  readonly id: number;
  readonly name: string;
  readonly count: number;
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

/** Reads the samples of the last frame, by region, most first. */
async function readSampleCounts(page: Page): Promise<SampleCount[]> {
  return page.evaluate(() => window.__galaxyMap?.regionSampleCounts?.() ?? []);
}

/** How many samples of the last frame landed on the plane inside the model bounds. */
async function readSampleTotal(page: Page): Promise<number> {
  return page.evaluate(() => window.__galaxyMap?.regionSampleTotal?.() ?? 0);
}

/**
 * The names of the regions the frame shows, worked out by the test itself: it sweeps a
 * grid of screen points and resolves each one against the coarse region grid. It reads
 * none of the counts the label code made, so the reading can disagree with the page.
 */
async function readRegionsOnScreen(page: Page, spacing = 16): Promise<Set<string>> {
  const names = await page.evaluate((step: number) => {
    const read = window.__galaxyMap?.regionNameAtScreen;
    if (read === undefined) return [];
    const found = new Set<string>();
    for (let y = step / 2; y < window.innerHeight; y += step) {
      for (let x = step / 2; x < window.innerWidth; x += step) {
        const name = read(x, y);
        if (name !== null) found.add(name);
      }
    }
    return Array.from(found);
  }, spacing);
  return new Set(names);
}

/** True when a box lies inside a viewport. */
function insideViewport(label: LabelReading, width: number, height: number): boolean {
  return (
    label.left >= 0 &&
    label.top >= 0 &&
    label.left + label.width <= width &&
    label.top + label.height <= height
  );
}

test.describe('the labels at 1280 by 720', () => {
  test.use({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });

  test('no label at the far view', async ({ page }) => {
    await openView(page);
    expect(await readLabels(page)).toEqual([]);
  });

  test('the core is named', async ({ page }) => {
    await openView(page, '#c=15,0,25895&d=20000&p=35&y=0');
    const labels = await readLabels(page);
    const counts = await readSampleCounts(page);
    const total = await readSampleTotal(page);
    const candidates = counts.filter((row) => row.count >= 0.01 * total);
    const rank = candidates.findIndex((row) => row.name === 'Galactic Centre') + 1;
    console.log(
      'the core view holds',
      total,
      'samples,',
      candidates.length,
      'candidates, and Galactic Centre ranks',
      rank,
      'by sample count with',
      candidates.find((row) => row.name === 'Galactic Centre')?.count,
      'samples',
    );
    console.log(
      'the labels at the core',
      labels.map((label) => label.name),
    );

    const core = labels.find((label) => label.name === 'Galactic Centre');
    expect(core).toBeDefined();
    expect(insideViewport(core as LabelReading, 1280, 720)).toBe(true);
    // The scenario: it is placed although at least 12 regions hold more samples, so a
    // count order alone would reach the cap of 12 before it.
    const beating = candidates.filter(
      (row) =>
        row.name !== 'Galactic Centre' &&
        row.count >
          (candidates.find((other) => other.name === 'Galactic Centre')?.count ?? 0),
    );
    console.log('regions that hold more samples than the core', beating.length);
    expect(beating.length).toBeGreaterThanOrEqual(12);
  });

  test('the region the camera is inside is named at every zoom', async ({ page }) => {
    for (const distance of [20000, 10000, 4000, 1000, 500]) {
      await openView(page, `#c=0,0,0&d=${distance}&p=35&y=0`);
      const labels = await readLabels(page);
      const spur = labels.find((label) => label.name === 'Inner Orion Spur');
      expect(
        spur,
        `no Inner Orion Spur label at ${distance} light years`,
      ).toBeDefined();
      expect(insideViewport(spur as LabelReading, 1280, 720)).toBe(true);
    }
  });

  test('a region with nothing on screen carries no label', async ({ page }) => {
    await openView(page, '#c=0,0,0&d=500&p=35&y=0');
    const labels = await readLabels(page);
    const shown = await readRegionsOnScreen(page);
    console.log(
      'the regions the frame shows at 500 light years',
      Array.from(shown),
      'and the labels',
      labels.map((label) => label.name),
    );
    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) {
      expect(shown.has(label.name), `${label.name} is not on the screen`).toBe(true);
    }
  });

  test('the camera keeps the label of the region it sits in when it turns away', async ({
    page,
  }) => {
    await openView(page, '#c=0,0,0&d=500&p=35&y=0');
    const toward = await readLabels(page);
    const towardCounts = await readSampleCounts(page);
    console.log(
      'the samples looking toward the centroid',
      towardCounts.map((row) => `${row.name} ${row.count}`),
    );
    expect(toward.map((label) => label.name)).toEqual(['Inner Orion Spur']);

    await openView(page, '#c=0,0,0&d=500&p=35&y=180');
    const away = await readLabels(page);
    const awayCounts = await readSampleCounts(page);
    const total = await readSampleTotal(page);
    const share = (name: string): number =>
      (100 * (awayCounts.find((row) => row.name === name)?.count ?? 0)) / total;
    console.log(
      'the samples looking away, of',
      total,
      'landed:',
      awayCounts.map(
        (row) => `${row.name} ${row.count} ${share(row.name).toFixed(1)}%`,
      ),
    );
    // The expected names are written out rather than read back from the counts the
    // label code made, so this test can fail. The three are the regions that clear the
    // 1 percent rule in that frame: 91.3, 7.5 and 1.2 percent.
    expect(away.map((label) => label.name)).toContain('Inner Orion Spur');
    for (const label of away) {
      expect(
        ['Inner Orion Spur', 'Sanguineous Rim', 'Elysian Shore'],
        `${label.name} is none of the three regions the frame shows`,
      ).toContain(label.name);
    }
  });

  test('labels neither crowd nor overlap', async ({ page }) => {
    await openView(page, '#c=15,0,25895&d=20000&p=35&y=0');
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
});

test.describe('the sampling budget at 1920 by 1080', () => {
  test.use({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });

  test('the sampling stays inside its budget', async ({ page }) => {
    await openView(page, '#c=15,0,25895&d=20000&p=35&y=0');
    const total = await readSampleTotal(page);
    await page.evaluate(() => window.__galaxyMap?.resetLabelSampling?.());
    await page.waitForFunction(
      () => (window.__galaxyMap?.labelSampling?.().frames ?? 0) >= 300,
      undefined,
      { timeout: 120000 },
    );
    const sampling = await page.evaluate(
      () =>
        window.__galaxyMap?.labelSampling?.() ?? { frames: 0, meanMs: 0, worstMs: 0 },
    );
    console.log(
      'the sweep read',
      total,
      'landed samples and took a mean of',
      sampling.meanMs.toFixed(3),
      'ms and a worst of',
      sampling.worstMs.toFixed(3),
      'ms over',
      sampling.frames,
      'frames',
    );
    expect(sampling.frames).toBeGreaterThanOrEqual(300);
    expect(sampling.meanMs).toBeLessThan(2);
    expect(sampling.worstMs).toBeLessThan(4);
  });
});
