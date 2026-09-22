import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  dumpFaction,
  dumpSystem,
  FULL_SET,
  openMap,
  serveFactionsDump,
} from './helpers';
import { TRACED_CORNER } from './region-views';
import { DEFAULT_NEBULA_OCCLUSION } from '../packages/galaxy-map/src/render/nebula-slot';
import type { SystemRecordInput } from '../packages/galaxy-map/src/scene-data/real-systems';

/** The frame time the map must stay under, in milliseconds. */
const BUDGET_MS = 16.7;

/**
 * The mean the icon placement sweep must stay under, in milliseconds, over a set of
 * 50,000 systems with 4 icons each at 1920x1080. The sweep cost 1.49 ms while it built a
 * record and a category object for each candidate.
 */
const ICON_SWEEP_BUDGET_MS = 1.2;

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

  // The nebula march reads the density volume between the camera and each record. The
  // constant is at its default here, and the test sets it so the reading states which
  // frame it measured.
  await page.evaluate((value) => {
    window.__galaxyMap?.setNebulaOcclusion?.(value);
  }, DEFAULT_NEBULA_OCCLUSION);

  // The most nebula records any one view draws. The nebulae fade out above 20,000
  // light years, so some views in the list draw none. One view with nebulae is enough
  // to state the budget holds with the nebula pass at work.
  let mostNebulae = 0;
  // The worst covered area and the worst dropped count over the 16 views. The drawing
  // buffer here is 1,920 by 1,080, which is the largest screen the suite visits and so
  // the hardest case for a budget stated in screen areas.
  let mostCovered = 0;
  let mostDropped = 0;

  for (const cursor of [SOL, GALACTIC_CENTRE]) {
    for (const distance of DISTANCES) {
      const report = await page.evaluate(
        (view) => {
          window.__galaxyMap?.setView?.({
            cursor: view.cursor,
            distance: view.distance,
            yaw: 0,
            pitch: 35,
          });
          const mean =
            window.__galaxyMap?.measureFrames?.(300) ?? Number.POSITIVE_INFINITY;
          const drawn = window.__galaxyMap?.nebulaDrawnCount?.() ?? 0;
          return {
            mean,
            nebulae: drawn,
            covered: window.__galaxyMap?.nebulaCoveredArea?.() ?? 0,
            dropped: (window.__galaxyMap?.nebulaAboveFloorCount?.() ?? 0) - drawn,
          };
        },
        { cursor, distance },
      );
      console.log(
        `cursor ${cursor.join(',')} distance ${distance}: ` +
          `${report.mean.toFixed(3)} ms, ${report.nebulae} nebulae, ` +
          `${report.covered.toFixed(3)} screen areas, ${report.dropped} dropped`,
      );
      mostNebulae = Math.max(mostNebulae, report.nebulae);
      mostCovered = Math.max(mostCovered, report.covered);
      // Above the band the zoom weight is 0, so the selection keeps nothing and every
      // record above the size floor reads as dropped. The budget is what this counts,
      // so the reading is taken at the views that draw.
      if (report.nebulae > 0) mostDropped = Math.max(mostDropped, report.dropped);
      expect(report.mean).toBeGreaterThan(0);
      expect(report.mean).toBeLessThan(BUDGET_MS);
    }
  }

  // A measured floor, not an estimate. The near end of the band is open, so 500, 1,000,
  // 2,000, 4,000 and 12,000 light years all draw at weight 1, and the floor is set by a
  // near view. The count is no longer capped: the covered-area budget of
  // `src/scene-data/nebulae.ts` stops at 4 screen areas, and the committed record file
  // does not reach that at any view this suite visits, so every record above the size
  // floor draws. The floor is the cursor at Sol and 500 light years, which draws 178
  // records. Over the 16 views the run that set this floor read a worst mean of 1.649 ms
  // against the 16.7 ms budget.
  expect(mostNebulae).toBeGreaterThanOrEqual(178);

  // The covered-area reading of this change, over every camera this suite visits that
  // draws a nebula, at 1,920 by 1,080. The worst is 0.047 screen areas against a budget
  // of 4, and the dropped count is 0 at every one of those views, so the budget is never
  // reached and no record the size floor admits is left out.
  console.log('the worst covered area', { mostCovered, mostDropped });
  expect(mostCovered).toBeLessThan(4);
  expect(mostDropped).toBe(0);
});

// The 10 light year view is the new closest zoom. The field adds no light there, but it
// still builds its boxel table and runs its suppression sweep, because the effective
// zoom distance holds at 640 light years. The view is in the suite so that cost is
// measured where it is paid and not assumed from the 500 light year reading.
test('the closest zoom is under budget', async ({ page }) => {
  test.setTimeout(180000);
  await openMap(page);

  for (const cursor of [SOL, GALACTIC_CENTRE]) {
    const mean = await page.evaluate(
      (view) => {
        window.__galaxyMap?.setView?.({
          cursor: view.cursor,
          distance: 10,
          yaw: 0,
          pitch: 35,
        });
        return window.__galaxyMap?.measureFrames?.(300) ?? Number.POSITIVE_INFINITY;
      },
      { cursor },
    );
    console.log(`cursor ${cursor.join(',')} distance 10: ${mean.toFixed(3)} ms`);
    expect(mean).toBeGreaterThan(0);
    expect(mean).toBeLessThan(BUDGET_MS);
  }
});

/** The four zoom distances the marker budget reads. */
const SYSTEM_DISTANCES = [500, 4000, 20000, 120000];

/**
 * Adds `count` systems of one category, spread over the model bounds. A fixed generator
 * makes the same set on every run. The count is a full set unless a test names another,
 * because a test whose subject is the set reads the bound.
 */
async function addSpreadSystems(
  page: Page,
  withIcons = false,
  count = FULL_SET,
): Promise<number> {
  return page.evaluate(
    (options: { icons: boolean; count: number }) => {
      const map = window.galaxyMap;
      if (map === undefined) return -1;
      map.addCategories([{ name: 'Empire', color: [153, 230, 255] }]);
      let state = 4711;
      const unit = (): number => {
        state = (state * 1103515245 + 12345) & 0x7fffffff;
        return state / 0x7fffffff;
      };
      const records: SystemRecordInput[] = [];
      for (let index = 0; index < options.count; index += 1) {
        records.push({
          name: `S${index}`,
          coords: {
            x: -49985 + unit() * 100000,
            y: -40985 + unit() * 81910,
            z: -24105 + unit() * 100000,
          },
          categories: ['Empire'],
          ...(options.icons
            ? { icons: ['titan', 'mission', 'waypoint', 'bookmark'] }
            : {}),
        } as SystemRecordInput);
      }
      map.addSystems(records);
      return map.systemCount();
    },
    { icons: withIcons, count },
  );
}

/** Measures the mean frame time of one view over 300 frames. */
async function measureView(
  page: Page,
  cursor: [number, number, number],
  distance: number,
): Promise<number> {
  return page.evaluate(
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
}

test('eight views stay under budget with 50,000 systems', async ({ page }) => {
  test.setTimeout(180000);
  await openMap(page);
  expect(await addSpreadSystems(page)).toBe(FULL_SET);

  for (const cursor of [SOL, GALACTIC_CENTRE]) {
    for (const distance of SYSTEM_DISTANCES) {
      const mean = await measureView(page, cursor, distance);
      console.log(
        `${FULL_SET} systems, cursor ${cursor.join(',')} distance ${distance}: ` +
          `${mean.toFixed(3)} ms`,
      );
      expect(mean).toBeGreaterThan(0);
      expect(mean).toBeLessThan(BUDGET_MS);
    }
  }
});

// The scenario "The cull holds the frame budget with a full set" of `real-systems`. The
// cull now measures from the cursor, and at the default view that cuts nothing: the
// furthest star of the disk is about 73,000 light years from Sol, inside the 120,000
// light year default. The old camera rule cut a band of the outer disk here, so this view
// draws more markers than it did and the budget must still hold.
test('the default view holds the budget with every marker drawn', async ({ page }) => {
  test.setTimeout(180000);
  await openMap(page);
  expect(await addSpreadSystems(page)).toBe(FULL_SET);

  const mean = await measureView(page, SOL, 60000);
  const drawn = await page.evaluate(
    () => window.galaxyMap?.debug.systemMarkerCount() ?? -1,
  );
  console.log(
    `${FULL_SET} systems at the default view: ${mean.toFixed(3)} ms, ${drawn} markers drawn`,
  );

  expect(mean).toBeGreaterThan(0);
  expect(mean).toBeLessThan(BUDGET_MS);
  // Every marker of the set draws. Under the camera rule this view drew 8,322 of 10,000
  // markers, which is the reading the cull rule was written on.
  expect(drawn).toBe(FULL_SET);
});

// The 10 light year view is the most costly of the five for the marker pass: the disc
// is at its 16 CSS pixel cap there and the glow sprite is 2.5 times that, so every
// marker inside its category's range fills the 40 CSS pixel cap and the pass writes the
// largest number of fragments it ever writes.
test('the closest zoom is under budget with 50,000 systems', async ({ page }) => {
  test.setTimeout(180000);
  await openMap(page);
  expect(await addSpreadSystems(page)).toBe(FULL_SET);

  for (const cursor of [SOL, GALACTIC_CENTRE]) {
    const mean = await measureView(page, cursor, 10);
    console.log(
      `${FULL_SET} systems, cursor ${cursor.join(',')} distance 10: ${mean.toFixed(3)} ms`,
    );
    expect(mean).toBeGreaterThan(0);
    expect(mean).toBeLessThan(BUDGET_MS);
  }
});

// The worst case the marker pass draws: every one of the markers is inside its
// category's draw range, and every glow sprite is at or near its 40 CSS pixel cap. The
// systems sit within 10 light years of Sol and the camera is 10 light years out, so the
// range of a marker runs from 0 to 20 light years. The size curve reads 16 CSS pixels at
// 10 light years and below and 14.3 at 20, so the sprite runs from 40 down to 35.7.
test('the closest zoom is under budget with every marker in range', async ({
  page,
}) => {
  test.setTimeout(180000);
  await openMap(page);

  const count = await page.evaluate((total: number) => {
    const map = window.galaxyMap;
    if (map === undefined) return -1;
    map.addCategories([{ name: 'Near', color: [153, 230, 255], maxDrawRange: 300000 }]);
    let state = 907;
    const unit = (): number => {
      state = (state * 1103515245 + 12345) & 0x7fffffff;
      return state / 0x7fffffff;
    };
    const records: SystemRecordInput[] = [];
    for (let index = 0; index < total; index += 1) {
      // Every system sits inside a ball of 10 light years around Sol, so no marker is
      // cut by the range, every marker draws and each one is close enough for the size
      // curve to give it the largest sprite. The cube root spreads them evenly through
      // the ball rather than around its centre.
      const radius = 10 * Math.cbrt(unit());
      const height = 2 * unit() - 1;
      const ring = Math.sqrt(Math.max(0, 1 - height * height));
      const angle = 2 * Math.PI * unit();
      records.push({
        name: `N${index}`,
        coords: {
          x: radius * ring * Math.cos(angle),
          y: radius * height,
          z: radius * ring * Math.sin(angle),
        },
        categories: ['Near'],
      });
    }
    map.addSystems(records);
    return map.systemCount();
  }, FULL_SET);
  expect(count).toBe(FULL_SET);

  const mean = await measureView(page, SOL, 10);
  const drawn = await page.evaluate(
    () => window.__galaxyMap?.systemMarkerCount?.() ?? -1,
  );
  console.log(
    `${FULL_SET} markers in range, cursor 0,0,0 distance 10: ${mean.toFixed(3)} ms, ` +
      `${drawn} drawn`,
  );
  expect(drawn).toBe(FULL_SET);
  expect(mean).toBeGreaterThan(0);
  expect(mean).toBeLessThan(BUDGET_MS);
});

// The boundary set the overlay draws holds 5,727 vertices, which is 67.11 KiB, over 123
// instanced calls. The views are at a corner of it, at close zooms. The pass draws at
// every zoom under 30,000 light years, so 4,000 is in the list, and 12,000 is where the
// range fade reaches full opacity.
test('the region overlay is under budget at the close end of the band', async ({
  page,
}) => {
  test.setTimeout(180000);
  await openMap(page);
  expect(await page.evaluate(() => window.galaxyMap?.areRegionsVisible())).toBe(true);

  for (const distance of [4000, 12000]) {
    const mean = await measureView(page, TRACED_CORNER.bend, distance);
    console.log(`the region overlay at distance ${distance}: ${mean.toFixed(3)} ms`);
    expect(mean).toBeGreaterThan(0);
    expect(mean).toBeLessThan(BUDGET_MS);
  }

  // The overlay's own cost, against the same view with the pass switched off.
  await page.evaluate(() => {
    window.__galaxyMap?.setPasses?.({ regions: false });
  });
  const off = await measureView(page, TRACED_CORNER.bend, 4000);
  await page.evaluate(() => {
    window.__galaxyMap?.setPasses?.({ regions: true });
  });
  const on = await measureView(page, TRACED_CORNER.bend, 4000);
  console.log(
    `the region overlay at 4,000 light years: ${off.toFixed(3)} ms off, ` +
      `${on.toFixed(3)} ms on`,
  );
  expect(on - off).toBeLessThanOrEqual(1);
});

/** The animation frame interval the map must stay under, in milliseconds. */
const INTERVAL_BUDGET_MS = 18;

/** The longest single animation frame interval the map may take, in milliseconds. */
const WORST_INTERVAL_MS = 33;

/** The time the hover pick and the overlay marks must stay under, in milliseconds. */
const SELECTION_BUDGET_MS = 2;

/** Waits for a number of animation frames inside the page. */
async function waitFrames(page: Page, count: number): Promise<void> {
  await page.evaluate(async (frames) => {
    for (let index = 0; index < frames; index += 1) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
  }, count);
}

/**
 * Waits for a number of animation frames, and moves the pointer on the canvas in each
 * one. A map nobody touches draws no frame at all, so a reading of the work one frame
 * does must hold the map awake, as a user who keeps the pointer on it does.
 *
 * A pointer move alone renders no canvas, so each frame calls the wake probe beside the
 * move. The move keeps the pick in the work the reading covers.
 */
async function hoverFrames(
  page: Page,
  count: number,
  x: number,
  y: number,
): Promise<void> {
  await page.evaluate(
    async ({ frames, pixelX, pixelY }) => {
      const canvas = document.querySelector('canvas');
      if (canvas === null) return;
      for (let index = 0; index < frames; index += 1) {
        // The point moves by half a pixel and back, so the hover holds the same system.
        const offset = index % 2 === 0 ? 0 : 0.5;
        canvas.dispatchEvent(
          new PointerEvent('pointermove', {
            bubbles: true,
            pointerId: 1,
            pointerType: 'mouse',
            clientX: pixelX + offset,
            clientY: pixelY,
          }),
        );
        window.__galaxyMap?.wake?.();
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
    },
    { frames: count, pixelX: x, pixelY: y },
  );
}

/** What the page reports about the animation frames it drew. */
interface IntervalStats {
  readonly frames: number;
  readonly meanMs: number;
  readonly worstMs: number;
  /** The frames the map drew inside the window, which the turn count does not give. */
  readonly draws: number;
}

/**
 * Resets the interval reading, holds the map awake for 120 frames and gives back every
 * statistic. The worst frame and the frame count say what a mean over the budget was:
 * many slightly late frames are load on the machine, and one long stall is a defect in
 * the page. The map is held awake because a map nobody touches draws no frame at all,
 * and a turn of the loop that draws nothing costs nothing to read. The draw count comes
 * back with the reading, so every caller can prove its window drew.
 */
async function intervalOver120Frames(
  page: Page,
  x = 960,
  y = 540,
): Promise<IntervalStats> {
  await page.evaluate(() => {
    window.__galaxyMap?.resetFrameIntervalStats?.();
    window.__galaxyMap?.resetFrameStats?.();
  });
  // The default is the middle of the 1920x1080 viewport, so a test that hovers a system
  // there keeps it. A test at another viewport names its own point.
  await hoverFrames(page, 120, x, y);
  return page.evaluate(() => ({
    ...(window.__galaxyMap?.frameIntervalStats?.() ?? {
      frames: 0,
      meanMs: Number.POSITIVE_INFINITY,
      worstMs: Number.POSITIVE_INFINITY,
    }),
    draws: window.__galaxyMap?.frameStats?.().frames ?? 0,
  }));
}

// The reading below is the guard on the instrument. The loop turns once per display
// refresh, so a 60 Hz display gives 16.7 ms. A mean under 15 ms means the browser is not
// pacing animation frames to the display, and every 18 ms budget in this file is void
// until that is fixed, rather than passing by default.
test('the map paces its animation frames to the display', async ({ page }) => {
  test.setTimeout(120000);
  await openMap(page);
  await page.evaluate(() => {
    window.__galaxyMap?.setView?.({
      cursor: [0, 0, 0],
      distance: 20000,
      yaw: 0,
      pitch: 35,
    });
  });

  const stats = await intervalOver120Frames(page);
  console.log('the still animation frame interval', stats);

  expect(stats.frames).toBeGreaterThanOrEqual(110);
  expect(stats.draws).toBeGreaterThanOrEqual(110);
  expect(stats.meanMs).toBeGreaterThanOrEqual(15);
  expect(stats.meanMs).toBeLessThanOrEqual(INTERVAL_BUDGET_MS);
});

test('the selection work stays inside its budget', async ({ page }) => {
  test.setTimeout(180000);
  await openMap(page);
  expect(await addSpreadSystems(page)).toBe(FULL_SET);

  // The cursor goes on one system, so its marker draws at the middle of the screen and
  // the pointer below hovers it.
  const position = await page.evaluate(() => {
    const map = window.galaxyMap;
    const system = map?.getSystem(0) ?? null;
    if (map === undefined || system === null) return null;
    map.setSystemNamesVisible(true);
    map.setView({ cursor: [...system.position], distance: 500, yaw: 0, pitch: 35 });
    return system.position;
  });
  expect(position).not.toBeNull();

  await page.mouse.move(960, 540);
  await waitFrames(page, 5);
  const hovered = await page.evaluate(() => window.galaxyMap?.getHover()?.name ?? null);

  await page.evaluate(() => window.__galaxyMap?.resetSelectionSampling?.());
  await hoverFrames(page, 120, 960, 540);
  const stats = await page.evaluate(
    () =>
      window.__galaxyMap?.selectionSampling?.() ?? {
        frames: 0,
        meanMs: Number.POSITIVE_INFINITY,
        worstMs: Number.POSITIVE_INFINITY,
      },
  );
  console.log('the selection work over 120 frames', { hovered, ...stats });

  expect(hovered).not.toBeNull();
  // The count is of drawn frames: the sampling runs inside the draw.
  expect(stats.frames).toBeGreaterThanOrEqual(110);
  expect(stats.meanMs).toBeLessThanOrEqual(SELECTION_BUDGET_MS);
});

// The scenario "The icon placement holds the budget at a full set" of `system-selection`.
// It is the reading above with every record carrying four icons and the icon switch on.
//
// **The reading is the frame interval and not the selection work.** The stacks draw on
// the canvas, so the pass selects and places them inside `render` and the selection work
// statistics no longer see them: a reading of those would pass by measuring nothing. The
// interval covers the draw and the overlay work together, so work that moved from one to
// the other cannot hide from it. `system-icons` holds the draw-time reading of the same
// work, which the draw budget test below takes.
test('the icon placement holds the frame interval budget', async ({ page }) => {
  test.setTimeout(180000);
  await openMap(page);
  expect(await addSpreadSystems(page, true)).toBe(FULL_SET);

  const position = await page.evaluate(() => {
    const map = window.galaxyMap;
    const system = map?.getSystem(0) ?? null;
    if (map === undefined || system === null) return null;
    map.setSystemNamesVisible(true);
    map.setSystemIconsVisible(true);
    map.setView({ cursor: [...system.position], distance: 500, yaw: 0, pitch: 35 });
    return system.position;
  });
  expect(position).not.toBeNull();

  await page.mouse.move(960, 540);
  await waitFrames(page, 5);
  const hovered = await page.evaluate(() => window.galaxyMap?.getHover()?.name ?? null);

  await page.evaluate(() => {
    window.__galaxyMap?.resetSelectionSampling?.();
    window.__galaxyMap?.resetFrameIntervalStats?.();
    window.__galaxyMap?.resetFrameStats?.();
  });
  await hoverFrames(page, 120, 960, 540);
  const reading = await page.evaluate(() => ({
    ...(window.__galaxyMap?.selectionSampling?.() ?? {
      frames: 0,
      meanMs: Number.POSITIVE_INFINITY,
      worstMs: Number.POSITIVE_INFINITY,
    }),
    interval: window.__galaxyMap?.frameIntervalStats?.() ?? {
      frames: 0,
      meanMs: Number.POSITIVE_INFINITY,
      worstMs: Number.POSITIVE_INFINITY,
    },
    icons: (window.galaxyMap?.debug.iconPlacements() ?? []).filter(
      (one) => one.kind === 'icon',
    ).length,
    arrows: (window.galaxyMap?.debug.iconPlacements() ?? []).filter(
      (one) => one.kind === 'arrow',
    ).length,
    // The scenario "The full sweep costs under 1.2 ms" of `system-icons`. The probe is
    // the mean of the last 120 sweeps, which is the 120 frames above.
    sweepMs: window.__galaxyMap?.iconSweepMs?.() ?? Number.POSITIVE_INFINITY,
  }));
  console.log('the selection work with 4 icons a record', { hovered, ...reading });

  expect(hovered).not.toBeNull();
  // The frame drew a stack. A frame that drew none would measure no placement at all.
  expect(reading.icons).toBeGreaterThan(0);
  expect(reading.arrows).toBeGreaterThan(0);
  expect(reading.interval.frames).toBeGreaterThanOrEqual(110);
  expect(reading.interval.meanMs).toBeLessThanOrEqual(INTERVAL_BUDGET_MS);
  expect(reading.sweepMs).toBeGreaterThan(0);
  expect(reading.sweepMs).toBeLessThanOrEqual(ICON_SWEEP_BUDGET_MS);
});

// The scenario "A full set of icons holds the draw budget" of `system-icons`. The pass
// selects, places and draws the stacks inside `render`, so its cost falls in the
// draw-time budget of `far-view-rendering` and the measurement function is the same one
// the views above take. The cursor is a system of the set, so the frame the reading
// covers carries a stack: a frame that placed none would hold the budget by doing
// nothing.
test('a full set of icons holds the draw budget', async ({ page }) => {
  test.setTimeout(180000);
  await openMap(page);
  expect(await addSpreadSystems(page, true)).toBe(FULL_SET);

  const cursor = await page.evaluate(() => {
    const map = window.galaxyMap;
    const system = map?.getSystem(0) ?? null;
    if (map === undefined || system === null) return null;
    map.setSystemIconsVisible(true);
    return [...system.position] as [number, number, number];
  });
  expect(cursor).not.toBeNull();

  /** How many icons and arrows the last frame placed. */
  const placed = async (): Promise<number> =>
    page.evaluate(() => (window.galaxyMap?.debug.iconPlacements() ?? []).length);

  for (const distance of [2000, 20000]) {
    await measureView(page, cursor as [number, number, number], distance);
    // A vector loads asynchronously, so the first frames of the set place fewer icons.
    await expect.poll(placed, { timeout: 15000 }).toBeGreaterThan(0);
    const mean = await measureView(page, cursor as [number, number, number], distance);
    const held = await placed();
    console.log(
      `${FULL_SET} systems with 4 icons each at ${distance}: ${mean.toFixed(3)} ms, ` +
        `${held} placements`,
    );

    expect(mean).toBeGreaterThan(0);
    expect(mean).toBeLessThan(BUDGET_MS);
    expect(held).toBeGreaterThan(0);
  }
});

test('the frame interval holds with the selection work running', async ({ page }) => {
  test.setTimeout(180000);
  await openMap(page);
  expect(await addSpreadSystems(page)).toBe(FULL_SET);

  await page.evaluate(() => {
    const map = window.galaxyMap;
    const system = map?.getSystem(0) ?? null;
    if (map === undefined || system === null) return;
    map.setSystemNamesVisible(true);
    map.setView({ cursor: [...system.position], distance: 500, yaw: 0, pitch: 35 });
  });
  await page.mouse.move(960, 540);
  await waitFrames(page, 5);

  const stats = await intervalOver120Frames(page);
  console.log('the interval with a full set and the pick', stats);

  expect(stats.frames).toBeGreaterThanOrEqual(110);
  expect(stats.draws).toBeGreaterThanOrEqual(110);
  expect(stats.meanMs).toBeLessThanOrEqual(INTERVAL_BUDGET_MS);
});

test('the frame interval holds with the HUD on', async ({ page }) => {
  test.setTimeout(180000);
  await openMap(page, '', { hud: true });
  expect(await addSpreadSystems(page)).toBe(FULL_SET);

  // The demo page builds the HUD, so the panels below are the page's own.
  await expect(page.locator('.gm-hud__category-row[data-name="Empire"]')).toBeVisible();
  // The rest of the row opens the list. The dot beside it switches the category.
  await page.locator('.gm-hud__category-row[data-name="Empire"]').click();
  await expect(page.locator('.gm-hud__system-row')).toHaveCount(200);
  await page.evaluate(() => {
    const system = window.galaxyMap?.getSystem(0) ?? null;
    if (system !== null) window.galaxyMap?.setSelection(system.id64 ?? system.name);
  });
  await expect(page.locator('.gm-hud__info')).toBeVisible();
  await waitFrames(page, 10);

  const stats = await intervalOver120Frames(page);
  console.log('the interval with the HUD on', stats);

  expect(stats.frames).toBeGreaterThanOrEqual(110);
  expect(stats.draws).toBeGreaterThanOrEqual(110);
  expect(stats.meanMs).toBeLessThanOrEqual(INTERVAL_BUDGET_MS);
});

// The grid's cost is fill and not vertices, so it is read at the shallowest pitch, where
// its far lines crowd the horizon and its near lines cross the whole frame, and again at
// the steepest, where the whole grid is in view at once.
test('the grid draws inside its budget', async ({ page }) => {
  test.setTimeout(180000);
  await openMap(page);

  for (const pitch of [5, 89]) {
    const readings = await page.evaluate(async (angle) => {
      const map = window.galaxyMap;
      const probe = window.__galaxyMap;
      if (map === undefined || probe?.measureFrames === undefined) return null;
      map.setView({ cursor: [0, 0, 0], distance: 4000, yaw: 0, pitch: angle });
      map.setGridVisible(false);
      // The first reading after a view change carries the warm-up cost of that view, so
      // it is thrown away and both readings below start from a warm state.
      probe.measureFrames(120);
      const off = probe.measureFrames(300);
      map.setGridVisible(true);
      const on = probe.measureFrames(300);
      const vertices = probe.gridVertexCount?.() ?? -1;
      map.setGridVisible(false);
      return { off, on, vertices };
    }, pitch);
    console.log(`the grid at pitch ${pitch}`, readings);

    expect(readings).not.toBeNull();
    expect(readings?.vertices).toBe(3);
    expect((readings?.on ?? 0) - (readings?.off ?? 0)).toBeLessThanOrEqual(1);
  }
});

// The coordinate labels are DOM elements and not a draw pass, so `measureFrames` does
// not see them. The animation frame interval does, because the sweep and the element
// writes both run inside it.
test('the grid labels hold the frame rate', async ({ page }) => {
  test.setTimeout(180000);
  await openMap(page);
  // The count stays at 10,000 and does not follow the bound. The subject is the label
  // sweep and the set is the backdrop, and the scenario names 10,000 systems.
  expect(await addSpreadSystems(page, false, 10000)).toBe(10000);

  await page.evaluate(() => {
    const map = window.galaxyMap;
    if (map === undefined) return;
    map.setView({ cursor: [0, 0, 0], distance: 1000, yaw: 0, pitch: 5 });
    map.setGridVisible(true);
  });
  await waitFrames(page, 10);
  const labels = await page.evaluate(
    () => document.querySelectorAll('.gm-grid-label').length,
  );

  const stats = await intervalOver120Frames(page);
  console.log('the interval with the grid labels on', { labels, ...stats });

  expect(labels).toBeGreaterThan(0);
  expect(stats.frames).toBeGreaterThanOrEqual(110);
  expect(stats.draws).toBeGreaterThanOrEqual(110);
  expect(stats.meanMs).toBeLessThanOrEqual(INTERVAL_BUDGET_MS);
});

// The read of the background reading back to the processor runs on the main thread, so
// the animation frame interval is the instrument that sees it. The camera moves in every
// frame of the reading below, so the map draws a new picture each time and the read has
// a new reading to take.
test('reading the background back does not stall the frame', async ({ page }) => {
  test.setTimeout(180000);
  await openMap(page);

  await page.evaluate(() => {
    window.galaxyMap?.setView({ cursor: [0, 0, 0], distance: 4000, yaw: 0, pitch: 5 });
    window.galaxyMap?.setGridVisible(true);
  });
  await waitFrames(page, 10);

  const stats = await page.evaluate(async () => {
    const map = window.galaxyMap;
    window.__galaxyMap?.resetFrameIntervalStats?.();
    window.__galaxyMap?.resetFrameStats?.();
    for (let frame = 0; frame < 120; frame += 1) {
      map?.setView({ cursor: [frame * 20, 0, 0], distance: 4000, yaw: 0, pitch: 5 });
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          resolve();
        });
      });
    }
    return {
      ...(window.__galaxyMap?.frameIntervalStats?.() ?? {
        frames: 0,
        meanMs: Number.POSITIVE_INFINITY,
        worstMs: Number.POSITIVE_INFINITY,
      }),
      draws: window.__galaxyMap?.frameStats?.().frames ?? 0,
    };
  });
  const size = await page.evaluate(
    () => window.galaxyMap?.debug.backgroundSize() ?? [0, 0],
  );
  console.log('the interval with the background read back', { size, ...stats });

  // The reading has to be in the path, or the measurement says nothing.
  expect(size).toEqual([120, 68]);
  expect(stats.frames).toBeGreaterThanOrEqual(110);
  expect(stats.draws).toBeGreaterThanOrEqual(110);
  expect(stats.meanMs).toBeLessThanOrEqual(INTERVAL_BUDGET_MS);
  expect(stats.worstMs).toBeLessThanOrEqual(WORST_INTERVAL_MS);
});

// The flight moves the view every frame for 600 ms, so it writes a new view matrix, a
// new marker overlay and a new label position in each of about 21 frames. The reading
// covers the flight alone, because the statistics reset one frame before it starts.
test('the selection flight holds the frame rate', async ({ page }) => {
  test.setTimeout(180000);
  await openMap(page);
  // The count stays at 10,000 and does not follow the bound. The subject is the flight
  // and the set is the backdrop, and the scenario names 10,000 systems.
  expect(await addSpreadSystems(page, false, 10000)).toBe(10000);

  await page.evaluate(() => {
    window.galaxyMap?.setView({
      cursor: [0, 0, 0],
      distance: 20000,
      yaw: 0,
      pitch: 35,
    });
  });
  await waitFrames(page, 10);

  const started = await page.evaluate(() => {
    const map = window.galaxyMap;
    const system = map?.getSystem(0) ?? null;
    if (map === undefined || system === null) return false;
    window.__galaxyMap?.resetFrameIntervalStats?.();
    map.setSelection(system.id64 ?? system.name);
    return true;
  });
  expect(started).toBe(true);

  await page.waitForFunction(
    () => (window.__galaxyMap?.selectionFlightMs?.() ?? 0) === 0,
    undefined,
    { timeout: 5000 },
  );
  const stats = await page.evaluate(
    () =>
      window.__galaxyMap?.frameIntervalStats?.() ?? {
        frames: 0,
        meanMs: Number.POSITIVE_INFINITY,
        worstMs: Number.POSITIVE_INFINITY,
      },
  );
  console.log('the interval over the flight', stats);

  expect(stats.frames).toBeGreaterThanOrEqual(10);
  expect(stats.meanMs).toBeLessThanOrEqual(INTERVAL_BUDGET_MS);
});

/**
 * Adds 1,024 spheres and 4,096 lines whose points come to 65,536, spread over the model
 * bounds, and reports how long the two calls took on the main thread.
 */
async function addFullShapeSet(page: Page): Promise<{
  spheres: number;
  lines: number;
  points: number;
  readMs: number;
}> {
  return page.evaluate(() => {
    const map = window.galaxyMap;
    if (map === undefined) {
      return { spheres: -1, lines: -1, points: 0, readMs: Number.POSITIVE_INFINITY };
    }
    let state = 1237;
    const unit = (): number => {
      state = (state * 1103515245 + 12345) & 0x7fffffff;
      return state / 0x7fffffff;
    };
    const place = (): [number, number, number] => [
      -49985 + unit() * 100000,
      -40985 + unit() * 81910,
      -24105 + unit() * 100000,
    ];
    const spheres = [];
    for (let index = 0; index < 1024; index += 1) {
      spheres.push({
        position: place(),
        radius: 100 + unit() * 900,
        color: [0, 255, 255],
      });
    }
    // 4,096 lines of 16 points come to 65,536, which is the point bound.
    const lines = [];
    for (let index = 0; index < 4096; index += 1) {
      const start = place();
      const points: [number, number, number][] = [];
      for (let step = 0; step < 16; step += 1) {
        points.push([start[0] + step * 40, start[1] + step * 8, start[2] + step * 40]);
      }
      lines.push({ points, color: [255, 0, 255], width: 2 });
    }
    const started = performance.now();
    const sphereReport = map.addSpheres(spheres as never);
    const lineReport = map.addLines(lines as never);
    const readMs = performance.now() - started;
    return {
      spheres: sphereReport.added,
      lines: lineReport.added,
      points: 4096 * 16,
      readMs,
    };
  });
}

// The shape set is read on the main thread, so the read is one task and not a worker
// message. `dataset-catalog` holds a dataset switch to 40 milliseconds, and a full shape
// set is the same kind of work.
test('a full shape set is read inside its budget', async ({ page }) => {
  test.setTimeout(120000);
  await openMap(page);
  const reading = await addFullShapeSet(page);
  console.log('the shape set read', reading);

  expect(reading.spheres).toBe(1024);
  expect(reading.lines).toBe(4096);
  expect(reading.readMs).toBeLessThan(40);
});

// The whole set at the widest viewport, with the markers and the HUD in the frame. The
// camera moves over the whole reading, so the pass is measured while the view changes
// every frame and not on a still map.
test('a full shape set holds the frame rate', async ({ page }) => {
  test.setTimeout(180000);
  await openMap(page, '', { hud: true });
  expect(await addSpreadSystems(page)).toBe(FULL_SET);
  const added = await addFullShapeSet(page);
  expect(added.spheres).toBe(1024);
  expect(added.lines).toBe(4096);

  await page.evaluate(() => {
    window.galaxyMap?.setView({
      cursor: [0, 0, 0],
      distance: 20000,
      yaw: 0,
      pitch: 35,
    });
  });
  await waitFrames(page, 10);

  const stats = await page.evaluate(async () => {
    const map = window.galaxyMap;
    window.__galaxyMap?.resetFrameIntervalStats?.();
    const started = performance.now();
    // The camera pans 1,000 light years and zooms from 20,000 to 2,000 over two seconds.
    await new Promise<void>((resolve) => {
      const step = (): void => {
        const share = Math.min(1, (performance.now() - started) / 2000);
        map?.setView({
          cursor: [1000 * share, 0, 0],
          distance: 20000 - 18000 * share,
          yaw: 0,
          pitch: 35,
        });
        if (share >= 1) {
          resolve();
          return;
        }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    return (
      window.__galaxyMap?.frameIntervalStats?.() ?? {
        frames: 0,
        meanMs: Number.POSITIVE_INFINITY,
        worstMs: Number.POSITIVE_INFINITY,
      }
    );
  });
  console.log('the interval over the shape set', stats);

  expect(stats.frames).toBeGreaterThanOrEqual(60);
  expect(stats.meanMs).toBeLessThanOrEqual(INTERVAL_BUDGET_MS);
});

/**
 * The longest animation frame interval the read of the dump may leave, in milliseconds.
 *
 * The page fetches the dump and moves the body to a worker, so the inflate never holds
 * the main thread. One frame at 60 Hz is 16.7 ms and a dropped frame gives 33.3, so this
 * bound fails where the read drops one frame. A read on the main thread leaves a gap of
 * about 70 ms, because Chromium inflates a body it already holds in one burst.
 */
const DUMP_WORST_MS = 25;

/**
 * A fixture of the factions dump, about 62 MB of text.
 *
 * The two factions the entry wants sit at its end, so the reader reads the whole file and
 * the measure covers the worst case: the order of the dump is not stated anywhere.
 */
function bigDumpFixture(): string {
  const lines: string[] = ['['];
  // One line of 1.03 MB, which is near the 2.33 MB longest line of the live dump. Sixty
  // of them carry the 62 MB the reading below asks for.
  const systems = Array.from({ length: 10000 }, (_, index) =>
    dumpSystem(`Filler System ${index}`, 1000 + index, index % 3 === 0),
  );
  for (let line = 0; line < 60; line += 1) {
    lines.push(dumpFaction(`Filler Faction ${line}`, systems));
  }
  lines.push(
    dumpFaction('Canonn', [
      dumpSystem('Canonn Home', 10, true),
      dumpSystem('Canonn Outpost', 11, false),
    ]),
  );
  lines.push(
    dumpFaction('Canonn Deep Space Research', [dumpSystem('Research Post', 13, true)]),
  );
  lines.push(']');
  return lines.join('\n');
}

// The page fetches the dump and moves the body to a worker, which inflates it and reads
// it. The budget is the frame interval and not the whole read: the time the fetch takes
// is the network's. The reading is of the loop and not of the draw, because a read of a
// dump touches nothing on the screen until it lands.
test('the loop keeps turning while the dump is read', async ({ page }) => {
  test.setTimeout(300000);
  const fixture = bigDumpFixture();
  console.log('the dump fixture holds', fixture.length, 'bytes');
  expect(fixture.length).toBeGreaterThan(60_000_000);
  await serveFactionsDump(page, fixture);
  await openMap(page, '', { demoData: true, hud: true });
  await waitFrames(page, 10);

  const reading = await page.evaluate(async () => {
    const map = window.galaxyMap;
    window.__galaxyMap?.resetFrameIntervalStats?.();
    const started = performance.now();
    await map?.loadDataset('multifaction');
    return {
      systems: map?.systemCount() ?? -1,
      spheres: map?.sphereCount() ?? -1,
      loadMs: performance.now() - started,
      stats: window.__galaxyMap?.frameIntervalStats?.() ?? {
        frames: 0,
        meanMs: Number.POSITIVE_INFINITY,
        worstMs: Number.POSITIVE_INFINITY,
      },
    };
  });
  console.log('the interval over the dump read', reading);

  // The two factions at the end of the file reached the map, so the read covered it all.
  expect(reading.systems).toBe(3);
  expect(reading.spheres).toBe(48);
  // The frame loop kept running while the read ran.
  expect(reading.stats.frames).toBeGreaterThan(10);
  expect(reading.stats.worstMs).toBeLessThan(DUMP_WORST_MS);
});

/**
 * The largest shape set the map takes, with 256 categories over it.
 *
 * Each shape names 4 categories, which is the count the budget states. The set carries no
 * colour of its own, so every shape draws in the colour of the first category it names
 * that is on.
 */
async function addCategorisedShapeSet(page: Page): Promise<{
  categories: number;
  spheres: number;
  lines: number;
}> {
  return page.evaluate(() => {
    const map = window.galaxyMap;
    if (map === undefined) return { categories: -1, spheres: -1, lines: -1 };
    let state = 8191;
    const unit = (): number => {
      state = (state * 1103515245 + 12345) & 0x7fffffff;
      return state / 0x7fffffff;
    };
    const place = (): [number, number, number] => [
      -49985 + unit() * 100000,
      -40985 + unit() * 81910,
      -24105 + unit() * 100000,
    ];
    const names: string[] = [];
    const categories = [];
    for (let index = 0; index < 256; index += 1) {
      const name = `Sweep ${index}`;
      names.push(name);
      categories.push({ name, color: [255, 128, 0] });
    }
    map.addCategories(categories as never);
    // Four names for one shape, spread over the table so the sweep reads no one row twice.
    const four = (index: number): string[] => [
      names[index % 256] as string,
      names[(index * 7 + 1) % 256] as string,
      names[(index * 13 + 2) % 256] as string,
      names[(index * 29 + 3) % 256] as string,
    ];
    const spheres = [];
    for (let index = 0; index < 1024; index += 1) {
      const naming = four(index);
      spheres.push({
        position: place(),
        radius: 100 + unit() * 900,
        categories: naming,
      });
    }
    // 4,096 lines of 16 points come to 65,536, which is the point bound.
    const lines = [];
    for (let index = 0; index < 4096; index += 1) {
      const start = place();
      const points: [number, number, number][] = [];
      for (let step = 0; step < 16; step += 1) {
        points.push([start[0] + step * 40, start[1] + step * 8, start[2] + step * 40]);
      }
      const naming = four(index + 1);
      lines.push({
        points,
        width: 2,
        categories: naming,
      });
    }
    map.addSpheres(spheres as never);
    map.addLines(lines as never);
    return {
      categories: map.categoryCount(),
      spheres: map.sphereCount(),
      lines: map.lineCount(),
    };
  });
}

/**
 * Switches the shapes of all 256 categories on or off, draws a frame, and reads the
 * sweep. It calls `setShapeCategoryVisible`, because `setCategoryVisible` reaches the
 * markers alone and sweeps no shape: the reading would then be 0 for every switch.
 */
async function switchEveryCategory(page: Page, visible: boolean): Promise<number> {
  await page.evaluate((on) => {
    for (let index = 0; index < 256; index += 1) {
      window.galaxyMap?.setShapeCategoryVisible(`Sweep ${index}`, on);
    }
  }, visible);
  await waitFrames(page, 2);
  return page.evaluate(() => window.galaxyMap?.debug.shapeSweepMs() ?? -1);
}

// The sweep of the shape flags runs when a category changes and the frame reads the set,
// so the reading is of the frame after the change. `map-shapes` budgets it at 2 ms for the
// first switch that follows the arrival of the set, and at 1 ms for every switch after it.
// The set arrives with a sweep of its own, and the switch that follows it still runs code
// the engine has not compiled, so it reads about five times the cost of the switches that
// follow. Both are far under one frame.
test('the shape flag sweep holds its budget', async ({ page }) => {
  test.setTimeout(120000);
  await openMap(page);
  const set = await addCategorisedShapeSet(page);
  expect(set.categories).toBe(256);
  expect(set.spheres).toBe(1024);
  expect(set.lines).toBe(4096);
  await waitFrames(page, 2);

  // One NONE call of the HUD, which turns every category off before the next frame.
  const first = await switchEveryCategory(page, false);
  const readings = [first];
  for (let run = 0; run < 3; run += 1) {
    readings.push(await switchEveryCategory(page, run % 2 === 0));
  }
  const last = readings[readings.length - 1] as number;
  console.log('the shape sweep in ms', readings);

  // A reading of 0 is a fast sweep and not a missing one: Chromium gives
  // `performance.now()` in steps of 0.1 milliseconds. The budgets are the upper bounds.
  expect(first).toBeGreaterThanOrEqual(0);
  expect(first).toBeLessThan(2);
  expect(last).toBeLessThan(1);
});

// Nothing in the map is driven by a clock, so a map nobody touches draws the picture it
// drew before. The loop stops 1200 milliseconds after the last change, and every change
// brings it back. The name of the test is the name of the scenario: the idle rate is now
// zero.
test('a still map draws at the idle rate and wakes on a change', async ({ page }) => {
  test.setTimeout(120000);
  await openMap(page);
  // Past the settle window that opening the map opened, which is 1200 milliseconds.
  await page.waitForTimeout(2000);

  const still = await page.evaluate(async () => {
    window.__galaxyMap?.resetFrameStats?.();
    window.__galaxyMap?.resetFrameIntervalStats?.();
    await new Promise<void>((resolve) => setTimeout(resolve, 2000));
    return {
      draws: window.__galaxyMap?.frameStats?.().frames ?? -1,
      turns: window.__galaxyMap?.frameIntervalStats?.().frames ?? -1,
    };
  });
  console.log('two still seconds', still);

  // The loop stops, so the map costs no frame and no turn at all.
  expect(still.draws).toBe(0);
  expect(still.turns).toBe(0);

  const moved = await page.evaluate(async () => {
    window.__galaxyMap?.resetFrameStats?.();
    window.__galaxyMap?.setView?.({
      cursor: [0, 0, 0],
      distance: 3000,
      yaw: 10,
      pitch: 35,
    });
    await new Promise<void>((resolve) => setTimeout(resolve, 300));
    return window.__galaxyMap?.frameStats?.().frames ?? -1;
  });
  console.log('the draws in 300 milliseconds after a view change', moved);

  // At the rate of the display 300 milliseconds is 18 frames. A map that woke draws
  // every one of them; a map that did not would draw one or two.
  expect(moved).toBeGreaterThan(10);

  // A switch on the handle changes the picture without a write of the view. The HUD
  // holds four of them, so a map that slept through one would follow a click 200
  // milliseconds late.
  const switched = await page.evaluate(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 2000));
    window.__galaxyMap?.resetFrameStats?.();
    window.galaxyMap?.setGridVisible(false);
    for (let index = 0; index < 3; index += 1) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
    return window.__galaxyMap?.frameStats?.().frames ?? -1;
  });
  console.log('the draws in three frames after the grid switch', switched);

  expect(switched).toBeGreaterThan(0);

  // The scenario "A wheel notch wakes the loop". A notch sets the glide target and moves
  // the view only when the loop turns, so the input itself is what starts a stopped loop.
  const wheeled = await page.evaluate(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 2000));
    window.__galaxyMap?.resetFrameStats?.();
    document
      .querySelector('canvas')
      ?.dispatchEvent(
        new WheelEvent('wheel', { deltaY: -120, clientX: 960, clientY: 540 }),
      );
    await new Promise<void>((resolve) => setTimeout(resolve, 300));
    return window.__galaxyMap?.frameStats?.().frames ?? -1;
  });
  console.log('the draws in 300 milliseconds after one wheel notch', wheeled);

  expect(wheeled).toBeGreaterThan(10);
});

// The scenario "An icon texture wakes the loop". The icon vector is fetched after the
// frame that named it drew, which is the one thing the map fetches for itself. The route
// below holds the answer past the settle window, so the loop is stopped when it lands.
test('an icon texture wakes the loop', async ({ page }) => {
  test.setTimeout(120000);
  const icon = 'demo-images/ruins-site.svg';
  await page.route(`**/${icon}`, async (route) => {
    await new Promise<void>((resolve) => setTimeout(resolve, 2500));
    await route.continue();
  });
  await openMap(page);
  await page.waitForTimeout(2000);

  await page.evaluate((url) => {
    const map = window.galaxyMap;
    if (map === undefined) return;
    map.addCategories([{ name: 'Empire', color: [153, 230, 255] }]);
    map.setView({ cursor: [0, 0, 0], distance: 500, yaw: 0, pitch: 35 });
    map.addSystems([
      {
        name: 'One',
        coords: { x: 0, y: 0, z: 0 },
        categories: ['Empire'],
        icons: [{ url, color: [255, 0, 255] }],
      },
    ]);
  }, icon);

  // Past the settle window the add opened. The vector is still in flight, so the loop
  // is stopped and the next draw is the one the landing wakes.
  await page.waitForTimeout(2000);
  const before = await page.evaluate(() => {
    window.__galaxyMap?.resetFrameStats?.();
    return {
      draws: window.__galaxyMap?.frameStats?.().frames ?? -1,
      icons: (window.galaxyMap?.debug.iconPlacements() ?? []).filter(
        (one) => one.kind === 'icon',
      ).length,
    };
  });

  await page.waitForFunction(
    () =>
      (window.galaxyMap?.debug.iconPlacements() ?? []).some(
        (one) => one.kind === 'icon',
      ),
    undefined,
    { timeout: 30000, polling: 100 },
  );
  const after = await page.evaluate(() => ({
    draws: window.__galaxyMap?.frameStats?.().frames ?? -1,
    icons: (window.galaxyMap?.debug.iconPlacements() ?? []).filter(
      (one) => one.kind === 'icon',
    ).length,
  }));
  console.log('the icon texture landing', { before, after });

  expect(before.icons).toBe(0);
  expect(after.draws).toBeGreaterThan(0);
  expect(after.icons).toBe(1);
});

// The scenario "A held key holds the loop" of `far-view-rendering`, and the requirement
// that a flight in progress holds the loop awake. Both move the view on every turn, so
// both hold the loop through the wake that every view write makes.
test('a flight and a held key hold the loop', async ({ page }) => {
  test.setTimeout(120000);
  await openMap(page);
  await page.waitForTimeout(2000);

  const flown = await page.evaluate(async () => {
    window.__galaxyMap?.resetFrameStats?.();
    void window.galaxyMap?.flyTo({ cursor: [0, 0, 20000], distance: 6000 });
    await new Promise<void>((resolve) => setTimeout(resolve, 3000));
    return window.__galaxyMap?.frameStats?.().frames ?? -1;
  });
  console.log('the draws in three seconds of a flight', flown);

  expect(flown).toBeGreaterThan(100);

  await page.waitForTimeout(2000);
  await page.evaluate(() => window.__galaxyMap?.resetFrameStats?.());
  await page.mouse.move(960, 540);
  await page.keyboard.down('w');
  await page.waitForTimeout(3000);
  await page.keyboard.up('w');
  const held = await page.evaluate(
    () => window.__galaxyMap?.frameStats?.().frames ?? -1,
  );
  console.log('the draws in three seconds of a held key', held);

  expect(held).toBeGreaterThan(100);
});

// The scenario "A pointer move over a still camera renders no canvas". The renderer reads
// no hover: the ring and the hovered name are overlay elements, so the turn runs the pick
// and the marker overlay and renders nothing.
test('a pointer move over a still camera renders no canvas', async ({ page }) => {
  test.setTimeout(120000);
  await openMap(page);
  expect(await addSpreadSystems(page, false, 1000)).toBe(1000);

  // The cursor goes on one system, so its marker draws at the middle of the screen and
  // the pointer below hovers it.
  await page.evaluate(() => {
    const map = window.galaxyMap;
    const system = map?.getSystem(0) ?? null;
    if (map === undefined || system === null) return;
    map.setView({ cursor: [...system.position], distance: 500, yaw: 0, pitch: 35 });
  });
  await page.mouse.move(960, 540);
  await waitFrames(page, 5);

  // Past the settle window, so the loop has stopped.
  await page.waitForTimeout(2000);
  await page.evaluate(() => window.__galaxyMap?.resetFrameStats?.());

  const until = Date.now() + 3000;
  let step = 0;
  while (Date.now() < until) {
    step += 1;
    await page.mouse.move(960 + (step % 2), 540);
    await page.waitForTimeout(16);
  }

  const reading = await page.evaluate(() => ({
    draws: window.__galaxyMap?.frameStats?.().frames ?? -1,
    hovered: window.galaxyMap?.getHover()?.name ?? null,
    rings: document.querySelectorAll('.gm-system-ring').length,
    ring: document.querySelector('.gm-system-ring')?.getBoundingClientRect() ?? null,
  }));
  console.log('three seconds of pointer moves over a still camera', reading);

  expect(reading.draws).toBe(0);
  expect(reading.hovered).not.toBeNull();
  expect(reading.rings).toBe(1);
  const box = reading.ring as {
    left: number;
    right: number;
    top: number;
    bottom: number;
  };
  expect(Math.abs((box.left + box.right) / 2 - 960)).toBeLessThan(3);
  expect(Math.abs((box.top + box.bottom) / 2 - 540)).toBeLessThan(3);
});

/*
 * The narrow layout. The scrim covers the whole canvas while a drawer is open, and it is
 * a flat colour with no filter, so the compositor draws one translucent layer over the
 * frame and does no per-frame work of its own. The claim is read and not assumed: a
 * blurred overlay is re-blurred every frame and a flat one is not.
 *
 * The reading is here and not in `e2e/hud-mobile.spec.ts`, because that file runs on
 * several workers and a time taken beside five other browsers is a reading of the
 * machine.
 */
test.describe('the narrow layout', () => {
  test.use({ viewport: { width: 412, height: 880 }, deviceScaleFactor: 1 });

  test('the scrim costs no measurable frame time', async ({ page }) => {
    test.setTimeout(180000);
    await openMap(page, '', { hud: true });
    expect(await addSpreadSystems(page)).toBe(FULL_SET);
    await waitFrames(page, 10);

    // The middle of the 412 by 880 viewport.
    const closed = await intervalOver120Frames(page, 206, 440);
    await page.locator('.gm-hud__drawer-tab--left').click();
    await page.waitForTimeout(400);
    expect(await page.locator('.gm-hud').getAttribute('data-panel')).toBe('left');
    const open = await intervalOver120Frames(page, 206, 440);
    console.log('the frame interval with the scrim', { closed, open });

    expect(closed.frames).toBeGreaterThanOrEqual(110);
    expect(open.frames).toBeGreaterThanOrEqual(110);
    // The map must have drawn in both windows. A window that drew less has a shorter mean
    // interval, and the reading would then pass for the wrong reason.
    expect(closed.draws).toBeGreaterThanOrEqual(110);
    expect(open.draws).toBeGreaterThanOrEqual(110);
    expect(open.meanMs).toBeLessThanOrEqual(closed.meanMs + 1);
  });
});
