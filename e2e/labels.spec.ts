import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { startState, waitForReady } from './helpers';

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
  await page.goto(`./?view=${visits}${fragment}`);
  await waitForReady(page);
  // This opener navigates by itself, so it takes the start state the helper gives.
  await startState(page);
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

/** How near the frame edge a pushed label sits, in CSS pixels. */
const LABEL_EDGE = 8;

/** The box of one label, or null when the page shows no label of that name. */
async function readLabelBox(page: Page, name: string): Promise<LabelReading | null> {
  const labels = await readLabels(page);
  return labels.find((label) => label.name === name) ?? null;
}

/** The centre of one label box, or null when the page shows no label of that name. */
async function readLabelCentre(
  page: Page,
  name: string,
): Promise<{ x: number; y: number } | null> {
  const label = await readLabelBox(page, name);
  if (label === null) return null;
  return { x: label.left + label.width / 2, y: label.top + label.height / 2 };
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

/** One reading of a label box centre, taken in one animation frame. */
interface AnchorReading {
  readonly t: number;
  readonly x: number | null;
  readonly y: number | null;
}

/**
 * Reads the centre of one label in every animation frame for a span of milliseconds.
 * The reading starts in the frame after the page takes the view the test gives it.
 */
async function trackLabel(
  page: Page,
  name: string,
  spanMs: number,
  cursor: [number, number, number],
): Promise<AnchorReading[]> {
  return page.evaluate(
    async ([label, span, x, y, z]) => {
      window.galaxyMap?.setView({ cursor: [x as number, y as number, z as number] });
      const readings: { t: number; x: number | null; y: number | null }[] = [];
      const started = performance.now();
      return await new Promise<typeof readings>((resolve) => {
        const step = (): void => {
          const element = Array.from(document.querySelectorAll('.region-label')).find(
            (node) => node.textContent === label,
          );
          const t = performance.now() - started;
          if (element === undefined) readings.push({ t, x: null, y: null });
          else {
            const box = element.getBoundingClientRect();
            readings.push({
              t,
              x: box.left + box.width / 2,
              y: box.top + box.height / 2,
            });
          }
          if (t >= (span as number)) resolve(readings);
          else requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
    },
    [name, spanMs, cursor[0], cursor[1], cursor[2]] as const,
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

  test('a pushed label comes back to the middle of its region', async ({ page }) => {
    // The camera moves 22,000 light years along `x`, which leaves `Inner Orion Spur` at
    // the left edge of the frame. The camera then comes back, and the label is at the
    // middle of the region within a few frames.
    await openView(page, '#c=0,0,0&d=20000&p=35&y=0');
    await page.waitForTimeout(2000);
    const middle = await readLabelCentre(page, 'Inner Orion Spur');
    expect(middle).not.toBeNull();

    await page.evaluate(() => window.galaxyMap?.setView({ cursor: [22000, 0, 0] }));
    await page.waitForTimeout(3000);
    const pushed = await readLabelBox(page, 'Inner Orion Spur');
    expect(pushed).not.toBeNull();
    console.log('the pushed label sits at', JSON.stringify(pushed));
    // The label is against the left edge of the frame.
    expect((pushed as LabelReading).left).toBeLessThan(LABEL_EDGE);

    const readings = await trackLabel(page, 'Inner Orion Spur', 2000, [0, 0, 0]);
    const target = middle as { x: number; y: number };
    const away = (reading: AnchorReading): number =>
      reading.x === null
        ? Number.POSITIVE_INFINITY
        : Math.hypot(reading.x - target.x, (reading.y as number) - target.y);
    const first = readings[0] as AnchorReading;
    const last = readings[readings.length - 1] as AnchorReading;
    let worstMove = 0;
    for (let index = 1; index < readings.length; index += 1) {
      const before = readings[index - 1] as AnchorReading;
      const after = readings[index] as AnchorReading;
      if (before.x === null || after.x === null) continue;
      worstMove = Math.max(
        worstMove,
        Math.hypot(after.x - before.x, (after.y as number) - (before.y as number)),
      );
    }
    const reached = (mark: number): number | null =>
      readings.find((reading) => away(reading) <= mark)?.t ?? null;
    console.log(
      'the label starts',
      away(first).toFixed(1),
      'CSS pixels from the middle over',
      readings.length,
      'frames, and reaches 20 pixels after',
      reached(20),
      'ms, 8 after',
      reached(8),
      'ms and 2 after',
      reached(2),
      'ms, with a worst frame move of',
      worstMove.toFixed(2),
    );

    // The camera move leaves the anchor a long way from the middle of the region.
    expect(away(first)).toBeGreaterThan(50);
    // No frame is dropped, so the label travels and does not blink.
    expect(readings.filter((reading) => reading.x === null).length).toBe(0);
    // The filter takes it there in steps of no more than 20 CSS pixels a frame, so the
    // label slides and does not jump.
    expect(worstMove).toBeLessThan(21);
    // It reaches the middle of the region and does not crawl. The camera jump moves the
    // target as well as the anchor, so the target smoothing and the anchor filter run in
    // series. The spec reads 382 milliseconds for this push.
    const arrival = reached(8);
    expect(arrival).not.toBeNull();
    expect(arrival as number).toBeLessThan(400);
    expect(away(last)).toBeLessThan(2);
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
