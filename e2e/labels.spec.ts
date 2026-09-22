import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  readRegionLabelRanges,
  settleLabels,
  startState,
  waitForReady,
} from './helpers';
import { NO_LINE_VIEW } from './region-views';

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
  /** The opacity of the element, which carries the zoom fade. */
  readonly opacity: number;
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
        opacity: Number(getComputedStyle(element).opacity),
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

/**
 * What share of the plane samples each region holds, in per cent, worked out by the test
 * itself. It sweeps the same grid of screen points and resolves each one against the
 * coarse region grid. The share is of the points that land on a region, so a frame that
 * is half sky still gives shares that add to 100.
 */
async function readRegionSharesOnScreen(
  page: Page,
  spacing = 16,
): Promise<Map<string, number>> {
  const rows = await page.evaluate((step: number) => {
    const read = window.__galaxyMap?.regionNameAtScreen;
    if (read === undefined) return [];
    const counts = new Map<string, number>();
    let total = 0;
    for (let y = step / 2; y < window.innerHeight; y += step) {
      for (let x = step / 2; x < window.innerWidth; x += step) {
        const name = read(x, y);
        if (name === null) continue;
        counts.set(name, (counts.get(name) ?? 0) + 1);
        total += 1;
      }
    }
    return Array.from(counts, ([name, count]) => ({
      name,
      share: total === 0 ? 0 : (100 * count) / total,
    }));
  }, spacing);
  rows.sort((first, second) => second.share - first.share);
  return new Map(rows.map((row) => [row.name, row.share]));
}

/**
 * How many pixels of the frame the region pass changes. The reading draws the frame
 * twice, once with the pass and once without it, and counts the bytes that differ. A
 * frame with no boundary in it reads 0.
 */
async function changedByRegionPass(page: Page): Promise<number> {
  const read = async (on: boolean): Promise<number[]> =>
    page.evaluate((next: boolean) => {
      const probe = window.__galaxyMap;
      const canvas = document.getElementById('map');
      if (probe?.readRect === undefined || !(canvas instanceof HTMLCanvasElement)) {
        return [];
      }
      probe.setPasses?.({ regions: next });
      probe.drawNow?.();
      // `readRect` takes CSS pixels and reads the device pixels under them.
      const bytes = probe.readRect(0, 0, canvas.clientWidth, canvas.clientHeight);
      return Array.from(bytes);
    }, on);
  const withPass = await read(true);
  const withoutPass = await read(false);
  await page.evaluate(() => {
    window.__galaxyMap?.setPasses?.({ regions: true });
    window.__galaxyMap?.drawNow?.();
  });
  let changed = 0;
  for (let index = 0; index < withPass.length; index += 4) {
    if (
      withPass[index] !== withoutPass[index] ||
      withPass[index + 1] !== withoutPass[index + 1] ||
      withPass[index + 2] !== withoutPass[index + 2]
    ) {
      changed += 1;
    }
  }
  return changed;
}

/**
 * The range fade of the boundary and of a label, read at a range in light years. It is
 * the same smooth step `src/render/region-pass.ts` holds, written out here so the test
 * reads a figure of its own and not the one the page computed.
 */
function rangeFade(rangeLy: number): number {
  const t = Math.min(1, Math.max(0, (rangeLy - 5000) / (8000 - 5000)));
  return t * t * (3 - 2 * t);
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
      let started: number | null = null;
      return await new Promise<typeof readings>((resolve) => {
        // The time each reading carries is the timestamp of the animation frame and not
        // a wall clock reading. The map paces its own rates by that timestamp, and a
        // callback can run some milliseconds after the frame it belongs to: after an
        // idle stretch the two clocks are a frame apart, and a rate measured against the
        // wall clock would then read twice the rate the map applied.
        const step = (now: number): void => {
          started ??= now;
          const element = Array.from(document.querySelectorAll('.region-label')).find(
            (node) => node.textContent === label,
          );
          const t = now - started;
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
    // Every zoom is every zoom the overlay draws in, which is the same set of zooms the
    // boundary draws in. The label takes the range fade at its own plane anchor, so the
    // name goes at the same distance the line beside it goes. A zoom of 1,000 light years
    // takes the name away, and the HUD's top bar names the region there instead.
    //
    // The ladder moves with the fade, which now runs from 5,000 to 8,000 light years.
    // One rung must read an anchor strictly inside that band, and the test fails when
    // none does, so the run measures the slope rather than assuming it.
    //
    // The anchor range runs far past the zoom at this pitch, because the anchor is the
    // part of the region the frame shows and that part sits up the frame. The two are
    // not one ratio: it runs from 1.17 at 20,000 light years to 2.60 at 2,500. Over the
    // close end `range = 4,400 + 0.84 * zoom` fits the readings. The 2,500 rung reads
    // 6,504.6 light years, the middle of the fade, and the 1,000 rung is the first at
    // which the label leaves the page.
    const measured: { distance: number; rangeLy: number }[] = [];
    for (const distance of [20000, 15000, 10000, 2500, 1000]) {
      await openView(page, `#c=0,0,0&d=${distance}&p=35&y=0`);
      await settleLabels(page);
      const ranges = await readRegionLabelRanges(page);
      const spur = ranges.find((label) => label.name === 'Inner Orion Spur');
      console.log(
        `the Inner Orion Spur label at ${distance} light years`,
        spur === undefined ? 'is not on the page' : JSON.stringify(spur),
      );

      if (distance === 20000) {
        expect(spur, 'no Inner Orion Spur label at 20,000 light years').toBeDefined();
        const box = await readLabelBox(page, 'Inner Orion Spur');
        expect(insideViewport(box as LabelReading, 1280, 720)).toBe(true);
      }
      if (distance === 1000) {
        // The anchor falls under 5,000 light years there, where the range fade reads 0.
        expect(spur, 'an Inner Orion Spur label at 1,000 light years').toBeUndefined();
      }
      if (spur === undefined) continue;
      measured.push({ distance, rangeLy: spur.rangeLy });
      // The zoom fade is 1 at and below 20,000 light years, so the opacity is the range
      // fade alone, which is `smoothstep(5000, 8000, range)`.
      expect(Math.abs(spur.opacity - rangeFade(spur.rangeLy))).toBeLessThan(0.05);
    }
    console.log('the anchor range at each zoom', measured);
    // At least one rung reads the slope. Without this clause the ladder could read the
    // fade at 1 at every zoom that carries the label and at 0 at the one that does not.
    const onTheSlope = measured.filter(
      (reading) => reading.rangeLy > 5000 && reading.rangeLy < 8000,
    );
    console.log('the readings strictly inside the fade band', onTheSlope);
    expect(
      onTheSlope.length,
      'a reading strictly inside the fade band',
    ).toBeGreaterThan(0);
  });

  test('the sweep does not run when the frame can carry no label', async ({ page }) => {
    // The two views read the two halves of the gate. At a pitch of 89 degrees and a zoom
    // of 2,500 light years the corner rays meet the plane at about 3,900 light years,
    // under the floor of 5,000, so the range half closes. At 60,000 light years the plane
    // runs far past the floor and the zoom half closes.
    for (const fragment of ['#c=0,0,0&d=2500&p=89&y=0', '#c=0,0,0&d=60000&p=35&y=0']) {
      await openView(page, fragment);
      // The counter is cumulative, so it is reset after the view is set. An earlier
      // frame would otherwise leave the count above 0.
      await page.evaluate(() => window.__galaxyMap?.resetLabelSampling?.());
      await page.evaluate(async () => {
        for (let frame = 0; frame < 60; frame += 1) {
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        }
      });
      const sampling = await page.evaluate(
        () =>
          window.__galaxyMap?.labelSampling?.() ?? {
            frames: -1,
            meanMs: -1,
            worstMs: -1,
          },
      );
      console.log('the sampling at', fragment, sampling);

      expect(await readLabels(page), `a label at ${fragment}`).toEqual([]);
      expect(sampling.frames, `frames at ${fragment}`).toBe(0);
      expect(sampling.meanMs, `meanMs at ${fragment}`).toBe(0);
      expect(sampling.worstMs, `worstMs at ${fragment}`).toBe(0);
    }
  });

  test('no label where no line draws', async ({ page }) => {
    // Every plane point of this frame is under the 8,000 light year range floor, so the
    // band draws nothing. Before this requirement the names stood over a frame with no
    // lines under them. A unit test searches for the view and `e2e/region-views.ts`
    // records it, so the view moves with the floor.
    const view = NO_LINE_VIEW.view;
    const place = view.cursor.map((value) => value.toFixed(5)).join(',');
    await openView(
      page,
      `#c=${place}&d=${view.distance}&p=${view.pitch}&y=${view.yaw}&g=1`,
    );
    const labels = await readLabels(page);
    const changed = await changedByRegionPass(page);
    console.log(
      'the labels over the frame with no lines',
      labels.map((label) => label.name),
      'and the pixels the region pass changes',
      changed,
    );
    expect(labels).toEqual([]);
    expect(changed, 'the frame holds a boundary').toBe(0);
  });

  test('a region with nothing on screen carries no label', async ({ page }) => {
    await openView(page, '#c=0,0,0&d=12000&p=35&y=0');
    const labels = await readLabels(page);
    const shown = await readRegionsOnScreen(page);
    console.log(
      'the regions the frame shows at 12,000 light years',
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
    // The zoom is 20,000 light years so that the range fade takes nothing: the camera
    // sits 11,472 light years above the plane and the nearest plane point in the frame
    // is 12,657 away, so every anchor clears the 8,000 light year floor. The 5 per cent
    // clause then reads the placement alone. The shares are measured by the test and not
    // written into it.
    for (const yaw of [0, 180]) {
      await openView(page, `#c=0,0,0&d=20000&p=35&y=${yaw}`);
      const labels = await readLabels(page);
      const shares = await readRegionSharesOnScreen(page);
      const share = (name: string): number => shares.get(name) ?? 0;
      console.log(
        `the shares the test measured at a yaw of ${yaw}:`,
        Array.from(shares).map(([name, value]) => `${name} ${value.toFixed(1)}%`),
      );

      expect(labels.map((label) => label.name)).toContain('Inner Orion Spur');
      for (const label of labels) {
        expect(
          share(label.name),
          `${label.name} holds under 1 percent of the screen`,
        ).toBeGreaterThanOrEqual(1);
      }
      for (const [name, value] of shares) {
        if (value < 5) continue;
        expect(
          labels.map((label) => label.name),
          `${name} holds ${value.toFixed(1)} percent and carries no label`,
        ).toContain(name);
      }
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

    // The camera move leaves the anchor a long way from the middle of the region. The
    // first reading is taken in the frame after the jump, and the jump takes the target
    // whole, so the anchor has already run one step of its cap by then: the reading is
    // 47.5 CSS pixels and it was about 70 while the target crept as well.
    expect(away(first)).toBeGreaterThan(40);
    // No frame is dropped, so the label travels and does not blink.
    expect(readings.filter((reading) => reading.x === null).length).toBe(0);
    // The filter takes it there at the cap of 1,200 CSS pixels a second, so the label
    // slides and does not jump. The bound is a rate and not a figure per frame, because
    // the display decides how long a frame is.
    for (let index = 1; index < readings.length; index += 1) {
      const before = readings[index - 1] as AnchorReading;
      const after = readings[index] as AnchorReading;
      if (before.x === null || after.x === null) continue;
      const move = Math.hypot(
        after.x - before.x,
        (after.y as number) - (before.y as number),
      );
      // One CSS pixel of slack covers the step the projection solve leaves.
      expect(move).toBeLessThanOrEqual((1200 * (after.t - before.t)) / 1000 + 1);
    }
    // It reaches the middle of the region and does not crawl. The push is a `setView`,
    // which the page marks as a view jump, so the target is taken whole and the anchor
    // runs alone. The reading the spec holds is printed above.
    const arrival = reached(8);
    expect(arrival).not.toBeNull();
    expect(arrival as number).toBeLessThan(400);
    expect(away(last)).toBeLessThan(2);
  });

  test('a redraw leaves every label where it was', async ({ page }) => {
    // Every call outside the frame loop passes 0 seconds, so a redraw does not advance
    // the label filter. The test pushes the labels first, so the filter has somewhere to
    // go and a redraw that advanced it would move them.
    await openView(page, '#c=0,0,0&d=20000&p=35&y=0');
    await page.waitForTimeout(2000);
    await page.evaluate(() => window.galaxyMap?.setView({ cursor: [22000, 0, 0] }));
    // The frame loop settles the labels of the new view first. Without the wait the
    // reading before the redraws is of the view the camera left, and the first redraw
    // would move every label for that reason and not for the seconds it reads.
    await page.waitForTimeout(3000);
    const boxes = await page.evaluate(() => {
      const read = (): { name: string; left: number; top: number }[] =>
        Array.from(document.querySelectorAll('.region-label')).map((node) => {
          const box = node.getBoundingClientRect();
          return {
            name: node.textContent ?? '',
            left: box.left,
            top: box.top,
          };
        });
      const before = read();
      for (let draw = 0; draw < 30; draw += 1) window.galaxyMap?.debug.drawNow();
      return { before, after: read() };
    });
    expect(boxes.before.length).toBeGreaterThan(0);
    expect(boxes.after).toEqual(boxes.before);
  });

  // The scenario "The labels settle before the loop drops to the idle rate". A map
  // nobody touches draws every frame for 1200 milliseconds after a change, and stops
  // after that. A label that still eased at 1200 milliseconds would therefore stop
  // short of its place.
  test('no label moves after the settle window', async ({ page }) => {
    await openView(page, '#c=0,0,0&d=20000&p=35&y=0');
    await page.waitForTimeout(2000);

    const boxes = await page.evaluate(async () => {
      const read = (): { name: string; left: number; top: number }[] =>
        Array.from(document.querySelectorAll('.region-label')).map((node) => {
          const box = node.getBoundingClientRect();
          return { name: node.textContent ?? '', left: box.left, top: box.top };
        });
      // The jump of the settle measurement: 22,000 light years, which is the widest
      // move a label makes in the test set.
      window.galaxyMap?.setView({ cursor: [22000, 0, 0] });
      await new Promise<void>((resolve) => setTimeout(resolve, 1300));
      const atSettle = read();
      await new Promise<void>((resolve) => setTimeout(resolve, 1200));
      return { atSettle, later: read() };
    });

    console.log('the labels at the end of the settle window', boxes.atSettle.length);

    expect(boxes.atSettle.length).toBeGreaterThan(0);
    // A tenth of a CSS pixel: under the quarter pixel the measurement calls a move, and
    // over the rounding of `getBoundingClientRect`.
    for (const [index, label] of boxes.atSettle.entries()) {
      const after = boxes.later[index];
      expect(after?.name, `the label ${index}`).toBe(label.name);
      expect(Math.abs((after?.left ?? 0) - label.left), label.name).toBeLessThan(0.1);
      expect(Math.abs((after?.top ?? 0) - label.top), label.name).toBeLessThan(0.1);
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
      // The check runs on every animation frame, and it moves the pointer as a user's
      // hand does, because a map nobody touches draws no frame.
      () => {
        document.querySelector('canvas')?.dispatchEvent(
          new PointerEvent('pointermove', {
            clientX: 4,
            clientY: 4,
            pointerId: 1,
            pointerType: 'mouse',
          }),
        );
        // A pointer move renders no canvas, so the wake is what holds the loop drawing
        // while the sweep fills its 300 frames.
        window.__galaxyMap?.wake?.();
        return (window.__galaxyMap?.labelSampling?.().frames ?? 0) >= 300;
      },
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
