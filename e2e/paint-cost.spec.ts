// The main-thread paint cost of a camera move, read in Firefox.
//
// Chromium and Firefox do not share a paint path. Chromium blurs on the GPU and Firefox
// blurs on the CPU, so a CSS property that costs Chromium 1 ms a frame can cost Firefox
// 7 ms. `browser-suite` states the budget, the view and the readings it comes from.
//
// The instrument is the animation frame interval with the frame rate uncapped, which the
// `firefox` project of `playwright.config.ts` sets with `layout.frame_rate: 0`. A browser
// locked to the display runs at 16.7 ms a frame and hides every cost below it: the two
// blurs cost 7.5 ms a frame, in a frame of 12.1 ms, and dropped no frame at all.
//
// `debug.measureFrames` is the wrong instrument here. It draws at a fixed view and sees
// no CSS paint, so it would read none of this cost.
//
// The panel scenario reads the rise as a paired statistic. It takes four pairs, each pair
// one flat move and one blurred move beside it, and the second and the third pair turn
// the order around and read the blurred move first. A pair reads its blurred mean beside
// a flat mean of the same moment. The pair therefore keeps the drift of the whole test
// out of the rise. The drift inside a pair is left, and the order decides its sign, so
// asserts on the median of the four rises: the median holds one rise of each order, and
// it drops the largest and the smallest reading.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openMap } from './helpers';
import type { SystemRecordInput } from '../packages/galaxy-map/src/scene-data/real-systems';

/** The main-thread work a frame of the move may cost, in milliseconds. */
const BUDGET_MS = 7;

/**
 * How far the label blur must move the reading, in milliseconds. The label shadow rise
 * reads 9.9 ms against this floor, which is nearly five times it, so one pair of readings
 * carries it. `browser-suite` states the rule: a floor that sits within 2 ms of its rise
 * comes from a recorded distribution, and this floor does not sit that close.
 */
const RISE_MS = 2;

/**
 * How far the panel blur must move the reading, in milliseconds. The statistic is the
 * median of four pairs, which `browser-suite` states. It records 24 medians of this blur,
 * which span 2.106 to 2.993 ms with a standard deviation of 0.341 ms. The rule the spec
 * states holds the floor at **at most** the smallest reading of a recorded run less
 * 0.3 ms, which gives 1.806 ms. This floor sits under that, with 0.606 ms of margin below
 * the smallest of the 24.
 */
const PANEL_RISE_MS = 1.5;

/** How many frames the move runs, and how many of them the mean drops. */
const FRAMES = 200;
const WARM_FRAMES = 20;

test.use({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });

/**
 * Adds 10,000 systems spread over a box of 400 by 60 by 400 light years around the
 * origin. A fixed generator makes the same set on every run.
 */
async function addSystems(page: Page): Promise<number> {
  return page.evaluate(() => {
    const map = window.galaxyMap;
    if (map === undefined) return -1;
    map.addCategories([{ name: 'Empire', color: [153, 230, 255] }]);
    let state = 4711;
    const unit = (): number => {
      state = (state * 1103515245 + 12345) & 0x7fffffff;
      return state / 0x7fffffff;
    };
    const records: SystemRecordInput[] = [];
    for (let index = 0; index < 10000; index += 1) {
      records.push({
        name: `S${index}`,
        coords: {
          x: -200 + unit() * 400,
          y: -30 + unit() * 60,
          z: -200 + unit() * 400,
        },
        primaryCategory: 'Empire',
      });
    }
    map.addSystems(records);
    return map.systemCount();
  });
}

/** What one run of the move read. */
interface Reading {
  readonly frames: number;
  readonly meanMs: number;
  readonly worstMs: number;
  /** How many overlay labels the last frame of the move held. */
  readonly labels: number;
  /** How many of those were coordinate labels. */
  readonly gridLabels: number;
  /** How many HUD panels had a box on the screen in the last frame. */
  readonly panels: number;
  /** The boxes of those panels, in CSS pixels. */
  readonly panelBoxes: string[];
}

/**
 * Runs the move the budget states and reads the mean interval over its last 180 frames.
 *
 * The camera turns 0.3 degrees and sets its distance to `40 * (1 + 0.3 * sin(f / 20))`
 * light years in each frame, so it turns and moves at once. The first 20 frames carry
 * the warm-up cost of the view, so the reading resets after them.
 */
async function move(page: Page, frames = FRAMES): Promise<Reading> {
  return page.evaluate(
    async (count) => {
      const map = window.galaxyMap;
      const probe = window.__galaxyMap;
      const empty = {
        frames: 0,
        meanMs: Number.POSITIVE_INFINITY,
        worstMs: Number.POSITIVE_INFINITY,
        labels: 0,
        gridLabels: 0,
        panels: 0,
        panelBoxes: [] as string[],
      };
      if (map === undefined || probe === undefined) return empty;
      for (let frame = 0; frame < count.frames; frame += 1) {
        if (frame === count.warm) probe.resetFrameIntervalStats?.();
        map.setView({
          cursor: [0, 0, 0],
          distance: 40 * (1 + 0.3 * Math.sin(frame / 20)),
          yaw: 0.3 * frame,
          pitch: 35,
        });
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
      }
      const stats = probe.frameIntervalStats?.() ?? empty;
      const gridLabels = document.querySelectorAll('.gm-grid-label').length;
      const labels = gridLabels + document.querySelectorAll('.gm-system-label').length;
      let panels = 0;
      const panelBoxes: string[] = [];
      for (const element of document.querySelectorAll('.gm-hud__panel')) {
        const box = element.getBoundingClientRect();
        if (box.width > 0 && box.height > 0) {
          panels += 1;
          panelBoxes.push(`${Math.round(box.width)}x${Math.round(box.height)}`);
        }
      }
      return { ...stats, labels, gridLabels, panels, panelBoxes };
    },
    { frames, warm: WARM_FRAMES },
  );
}

/**
 * Adds one rule to a style sheet of the page, under an id of the caller's choice. It
 * removes an element of that id first, so a second call replaces the rule it wrote.
 *
 * A stylesheet rule and not a per-element style: the overlay builds labels while the
 * test runs, so a write to the elements that exist now reaches none of the labels the
 * next frame builds.
 */
async function addRule(page: Page, id: string, rule: string): Promise<void> {
  await page.evaluate(
    (written) => {
      document.getElementById(written.id)?.remove();
      const element = document.createElement('style');
      element.id = written.id;
      element.textContent = written.rule;
      document.head.append(element);
    },
    { id, rule },
  );
}

/** Takes the rule of that id off the page, so the next move reads the flat state. */
async function removeRule(page: Page, id: string): Promise<void> {
  await page.evaluate((written) => {
    document.getElementById(written)?.remove();
  }, id);
}

/** Opens the page with the HUD on, the 10,000 systems, the names on and the grid on. */
async function openForMove(page: Page): Promise<void> {
  // The HUD is part of the reading and not scenery. Two of its panels carry half the
  // cost this budget exists to hold, and `openMap` removes the HUD unless a test asks.
  await openMap(page, '', { hud: true });
  expect(await addSystems(page)).toBe(10000);
  await page.evaluate(() => {
    window.galaxyMap?.setSystemNamesVisible(true);
    window.galaxyMap?.setGridVisible(true);
  });
  await expect(page.locator('.gm-hud__category-row[data-name="Empire"]')).toBeVisible();
  const size = await page.evaluate(
    () => window.__galaxyMap?.drawingBufferSize?.() ?? [0, 0],
  );
  expect(size).toEqual([1920, 1080]);
}

/** The id and the rule that put the blurred backdrop back on the HUD panels. */
const PANEL_BLUR_ID = 'paint-cost-panel-blur';
const PANEL_BLUR_RULE =
  '.gm-hud__panel { -webkit-backdrop-filter: blur(10px) !important;' +
  ' backdrop-filter: blur(10px) !important; }';

/** Which move of a pair runs first. */
type PairOrder = 'flat first' | 'blurred first';

/**
 * The order of the four pairs. Two read the flat move first and two read the blurred
 * move first, so the drift inside a pair reaches the four rises with both signs.
 */
const PAIR_ORDERS = [
  'flat first',
  'blurred first',
  'blurred first',
  'flat first',
] as const;

/** What one pair of moves read. */
interface Pair {
  readonly order: PairOrder;
  readonly flatMs: number;
  readonly blurredMs: number;
  readonly riseMs: number;
  /** The boxes of the HUD panels of the flat move, in CSS pixels. */
  readonly panelBoxes: readonly string[];
}

/** The four pairs, and the flat reading of the first one. */
interface PanelReading {
  readonly pairs: readonly Pair[];
  readonly flat: Reading;
}

/** Runs one pair of moves in the order the caller names. */
async function movePair(
  page: Page,
  order: PairOrder,
): Promise<{ flat: Reading; blurred: Reading }> {
  if (order === 'flat first') {
    const flat = await move(page);
    await addRule(page, PANEL_BLUR_ID, PANEL_BLUR_RULE);
    const blurred = await move(page);
    await removeRule(page, PANEL_BLUR_ID);
    return { flat, blurred };
  }
  await addRule(page, PANEL_BLUR_ID, PANEL_BLUR_RULE);
  const blurred = await move(page);
  await removeRule(page, PANEL_BLUR_ID);
  const flat = await move(page);
  return { flat, blurred };
}

/** Reads the rise of one pair. */
function pairOf(order: PairOrder, flat: Reading, blurred: Reading): Pair {
  return {
    order,
    flatMs: flat.meanMs,
    blurredMs: blurred.meanMs,
    riseMs: blurred.meanMs - flat.meanMs,
    panelBoxes: flat.panelBoxes,
  };
}

/**
 * Runs the four pairs and gives back each rise with the reading it came from.
 *
 * Each pair reads its blurred mean beside a flat mean of the same moment, which holds
 * the drift of the whole test out of the rise.
 */
async function panelPairs(page: Page): Promise<PanelReading> {
  const first = await movePair(page, PAIR_ORDERS[0]);
  const pairs: Pair[] = [pairOf(PAIR_ORDERS[0], first.flat, first.blurred)];
  for (const order of PAIR_ORDERS.slice(1)) {
    const next = await movePair(page, order);
    pairs.push(pairOf(order, next.flat, next.blurred));
  }
  // The readings are the evidence `browser-suite` records, and the order of a pair tells
  // a warm flat move from a cold one.
  console.log('the four pairs of the panel backdrop', pairs);
  return { pairs, flat: first.flat };
}

/** The median of four readings, which is the mean of the middle two when sorted. */
function medianOfFour(values: readonly number[]): number {
  // The mean of the middle two reads the middle of four readings alone. A caller that
  // gives another count gets a number that is not the median of what it gave.
  expect(values).toHaveLength(4);
  const sorted = [...values].sort((one, other) => one - other);
  return (sorted[1] + sorted[2]) / 2;
}

// The scenario "The camera move holds the budget".
test('the camera move holds the paint budget', async ({ page }) => {
  test.setTimeout(180000);
  await openForMove(page);

  const reading = await move(page);
  console.log('the camera move', reading);

  // The label count and the panel count are part of the assertion and not of the setup.
  // A change to the overlap rule or to the HUD could leave a page with no labels and no
  // panels, and the reading would then pass while it measures none of the cost.
  expect(reading.labels).toBeGreaterThanOrEqual(8);
  expect(reading.panels).toBeGreaterThanOrEqual(2);
  expect(reading.frames).toBeGreaterThanOrEqual(FRAMES - WARM_FRAMES - 10);
  expect(reading.meanMs).toBeGreaterThan(0);
  expect(reading.meanMs).toBeLessThanOrEqual(BUDGET_MS);
});

// The scenario "The blurred shadow fails the budget".
test('the blurred label shadow fails the budget', async ({ page }) => {
  test.setTimeout(180000);
  await openForMove(page);

  const flat = await move(page);
  // The rule puts the old label look back, which is the shadow **and** no stroke. The
  // stroke has to go: with a stroke on the glyphs Firefox takes another text path, and
  // the same shadow then costs 2.4 ms a frame rather than 9.9.
  await addRule(
    page,
    'paint-cost-label-shadow',
    '.gm-grid-label { -webkit-text-stroke: 0 !important; text-shadow:' +
      ' 0 0 10px rgba(2, 12, 20, 0.75), 0 1px 2px rgba(2, 12, 20, 0.55) !important; }' +
      '.gm-system-label { -webkit-text-stroke: 0 !important;' +
      ' text-shadow: 0 0 8px #000, 0 1px 3px #000 !important; }',
  );
  const blurred = await move(page);
  console.log('the label shadow against the flat reading', { flat, blurred });

  expect(flat.labels).toBeGreaterThanOrEqual(8);
  expect(blurred.meanMs).toBeGreaterThan(BUDGET_MS);
  expect(blurred.meanMs - flat.meanMs).toBeGreaterThanOrEqual(RISE_MS);
});

// The scenario "The blurred panel fails the budget".
test('the blurred panel backdrop fails the budget', async ({ page }) => {
  test.setTimeout(180000);
  await openForMove(page);

  const reading = await panelPairs(page);
  const flat = reading.flat;
  const median = medianOfFour(reading.pairs.map((pair) => pair.riseMs));
  console.log('the median rise of the panel backdrop', median);

  // The rise alone, and not a number the mean must pass. The panel blur costs about
  // 2.5 ms a frame over a flat reading of 3.8 to 4.7 ms. The mean with it reads 5.9 to
  // 7.6 ms over 96 readings of this tree, and 29 of them reach 7 ms. It therefore passes
  // the budget on some runs and not on others.
  //
  // The statistic is the median of the four rises, which is the mean of the middle two
  // of the sorted readings. A single pair reads 1.82 to 3.30 ms for the same blur, so a
  // floor inside that spread fails a correct tree. The median holds one rise of each
  // order, which cancels the drift inside a pair, and it drops the largest and the
  // smallest reading. `browser-suite` holds the readings the floor comes from.
  expect(flat.panels).toBeGreaterThanOrEqual(2);
  expect(median).toBeGreaterThanOrEqual(PANEL_RISE_MS);
});
