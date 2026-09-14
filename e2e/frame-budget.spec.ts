import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openMap } from './helpers';
import { TRACED_CORNER } from './region-views';

/** The frame time the map must stay under, in milliseconds. */
const BUDGET_MS = 16.7;

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

  for (const cursor of [SOL, GALACTIC_CENTRE]) {
    for (const distance of DISTANCES) {
      const mean = await page.evaluate(
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
      console.log(
        `cursor ${cursor.join(',')} distance ${distance}: ${mean.toFixed(3)} ms`,
      );
      expect(mean).toBeGreaterThan(0);
      expect(mean).toBeLessThan(BUDGET_MS);
    }
  }
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
 * Adds 10,000 systems of one category, spread over the model bounds. A fixed generator
 * makes the same set on every run.
 */
async function addSpreadSystems(page: Page): Promise<number> {
  return page.evaluate(() => {
    const map = window.galaxyMap;
    if (map === undefined) return -1;
    map.addCategories([{ name: 'Empire', color: [153, 230, 255] }]);
    let state = 4711;
    const unit = (): number => {
      state = (state * 1103515245 + 12345) & 0x7fffffff;
      return state / 0x7fffffff;
    };
    const records: Record<string, unknown>[] = [];
    for (let index = 0; index < 10000; index += 1) {
      records.push({
        name: `S${index}`,
        coords: {
          x: -49985 + unit() * 100000,
          y: -40985 + unit() * 81910,
          z: -24105 + unit() * 100000,
        },
        primaryCategory: 'Empire',
      });
    }
    map.addSystems(records);
    return map.systemCount();
  });
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

test('eight views stay under budget with 10,000 systems', async ({ page }) => {
  test.setTimeout(180000);
  await openMap(page);
  expect(await addSpreadSystems(page)).toBe(10000);

  for (const cursor of [SOL, GALACTIC_CENTRE]) {
    for (const distance of SYSTEM_DISTANCES) {
      const mean = await measureView(page, cursor, distance);
      console.log(
        `10,000 systems, cursor ${cursor.join(',')} distance ${distance}: ` +
          `${mean.toFixed(3)} ms`,
      );
      expect(mean).toBeGreaterThan(0);
      expect(mean).toBeLessThan(BUDGET_MS);
    }
  }
});

// The 10 light year view is the most costly of the five for the marker pass: the glow
// sprite is at its 30 CSS pixel cap there, so every marker inside its category's range
// fills the cap and the pass writes the largest number of fragments it ever writes.
test('the closest zoom is under budget with 10,000 systems', async ({ page }) => {
  test.setTimeout(180000);
  await openMap(page);
  expect(await addSpreadSystems(page)).toBe(10000);

  for (const cursor of [SOL, GALACTIC_CENTRE]) {
    const mean = await measureView(page, cursor, 10);
    console.log(
      `10,000 systems, cursor ${cursor.join(',')} distance 10: ${mean.toFixed(3)} ms`,
    );
    expect(mean).toBeGreaterThan(0);
    expect(mean).toBeLessThan(BUDGET_MS);
  }
});

// The worst case the marker pass draws: every one of the 10,000 markers is inside its
// category's draw range and every glow sprite is at its cap.
test('the closest zoom is under budget with every marker in range', async ({
  page,
}) => {
  test.setTimeout(180000);
  await openMap(page);

  const count = await page.evaluate(() => {
    const map = window.galaxyMap;
    if (map === undefined) return -1;
    map.addCategories([{ name: 'Near', color: [153, 230, 255], maxDrawRange: 300000 }]);
    let state = 907;
    const unit = (): number => {
      state = (state * 1103515245 + 12345) & 0x7fffffff;
      return state / 0x7fffffff;
    };
    const records: Record<string, unknown>[] = [];
    for (let index = 0; index < 10000; index += 1) {
      // Every system sits inside a ball of 10,000 light years around Sol, so no marker
      // is cut by the range and all 10,000 draw. The cube root spreads them evenly
      // through the ball rather than around its centre.
      const radius = 10000 * Math.cbrt(unit());
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
        primaryCategory: 'Near',
      });
    }
    map.addSystems(records);
    return map.systemCount();
  });
  expect(count).toBe(10000);

  const mean = await measureView(page, SOL, 10);
  const drawn = await page.evaluate(
    () => window.__galaxyMap?.systemMarkerCount?.() ?? -1,
  );
  console.log(
    `10,000 markers in range, cursor 0,0,0 distance 10: ${mean.toFixed(3)} ms, ` +
      `${drawn} drawn`,
  );
  expect(drawn).toBe(10000);
  expect(mean).toBeGreaterThan(0);
  expect(mean).toBeLessThan(BUDGET_MS);
});

// The traced boundary set is the one the `accurate` mode draws. It holds 22,718 vertices
// against the smoothed set's 68,672, over the same 123 instanced calls, so it is the
// cheaper of the two. The views are at a corner of it, inside the band where the overlay
// draws in full, at the two closest zooms.
test('the accurate region mode is under budget at the closest zooms', async ({
  page,
}) => {
  test.setTimeout(180000);
  await openMap(page);
  await page.evaluate(() => {
    window.galaxyMap?.setRegionMode('accurate');
  });
  expect(await page.evaluate(() => window.galaxyMap?.getRegionMode())).toBe('accurate');

  for (const distance of [500, 10]) {
    const mean = await measureView(page, TRACED_CORNER.bend, distance);
    console.log(`the accurate overlay at distance ${distance}: ${mean.toFixed(3)} ms`);
    expect(mean).toBeGreaterThan(0);
    expect(mean).toBeLessThan(BUDGET_MS);
  }
});

/** The animation frame interval the map must stay under, in milliseconds. */
const INTERVAL_BUDGET_MS = 18;

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

/** What the page reports about the animation frames it drew. */
interface IntervalStats {
  readonly frames: number;
  readonly meanMs: number;
  readonly worstMs: number;
}

/**
 * Resets the interval reading, waits 120 frames and gives back every statistic. The
 * worst frame and the frame count say what a mean over the budget was: many slightly
 * late frames are load on the machine, and one long stall is a defect in the page.
 */
async function intervalOver120Frames(page: Page): Promise<IntervalStats> {
  await page.evaluate(() => window.__galaxyMap?.resetFrameIntervalStats?.());
  await waitFrames(page, 120);
  return page.evaluate(
    () =>
      window.__galaxyMap?.frameIntervalStats?.() ?? {
        frames: 0,
        meanMs: Number.POSITIVE_INFINITY,
        worstMs: Number.POSITIVE_INFINITY,
      },
  );
}

// The reading below is the guard on the instrument. A still map draws one frame per
// display refresh, so a 60 Hz display gives 16.7 ms. A mean under 15 ms means the
// browser is not pacing animation frames to the display, and every 18 ms budget in this
// file is void until that is fixed, rather than passing by default.
test('a still map paces its animation frames to the display', async ({ page }) => {
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
  expect(stats.meanMs).toBeGreaterThanOrEqual(15);
  expect(stats.meanMs).toBeLessThanOrEqual(INTERVAL_BUDGET_MS);
});

test('the selection work stays inside its budget', async ({ page }) => {
  test.setTimeout(180000);
  await openMap(page);
  expect(await addSpreadSystems(page)).toBe(10000);

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
  await waitFrames(page, 120);
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
  expect(stats.frames).toBeGreaterThanOrEqual(110);
  expect(stats.meanMs).toBeLessThanOrEqual(SELECTION_BUDGET_MS);
});

test('the frame interval holds with the selection work running', async ({ page }) => {
  test.setTimeout(180000);
  await openMap(page);
  expect(await addSpreadSystems(page)).toBe(10000);

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
  console.log('the interval with 10,000 systems and the pick', stats);

  expect(stats.frames).toBeGreaterThanOrEqual(110);
  expect(stats.meanMs).toBeLessThanOrEqual(INTERVAL_BUDGET_MS);
});

test('the frame interval holds with the HUD on', async ({ page }) => {
  test.setTimeout(180000);
  await openMap(page, '', { hud: true });
  expect(await addSpreadSystems(page)).toBe(10000);

  // The demo page builds the HUD, so the panels below are the page's own.
  await expect(page.locator('.gm-hud__category-row[data-name="Empire"]')).toBeVisible();
  await page.locator('.gm-hud__category-expand[data-name="Empire"]').click();
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
    expect(readings?.vertices).toBeGreaterThan(0);
    expect((readings?.on ?? 0) - (readings?.off ?? 0)).toBeLessThanOrEqual(1);
  }
});
