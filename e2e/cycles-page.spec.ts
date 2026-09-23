// The cycles page of the built site, which holds every cycle of the Thargoid war.
//
// The page is a host of its own: it gives the map a catalog of one entry per cycle and
// loads the first one at start. It writes `window.galaxyMap` and no other hook, so the
// spec reads the page through the public handle alone.
//
// The renderer check gates this project, so a run that reaches this file is a run on the
// card. `e2e/00-renderer.spec.ts` is what fails a software renderer.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// The file reads the HUD, so it names a viewport above the drawer breakpoint. Playwright's
// default of 1280 is inside the band where the panel columns become drawers.
test.use({ viewport: { width: 1600, height: 900 } });

const CYCLES = fileURLToPath(
  new URL('../apps/demo/demo-data/cycles/', import.meta.url),
);

/** One row of the manifest the page reads. */
interface CycleRow {
  cycle: number;
  count: number;
}

/** One record of a committed cycle. */
interface CycleRecord {
  name: string;
  coords: { x: number; y: number; z: number };
}

function readJson<T>(name: string): T {
  return JSON.parse(readFileSync(`${CYCLES}${name}`, 'utf8')) as T;
}

const manifest = readJson<CycleRow[]>('index.json');
const FIRST = manifest[0] as CycleRow;
const SECOND = manifest[1] as CycleRow;

/** The file name of one cycle, which the build pads to three digits. */
function fileOf(row: CycleRow): string {
  return `${String(row.cycle).padStart(3, '0')}.json`;
}

/**
 * The address of one cycle file, as the browser asks for it. The build makes one chunk
 * per cycle and names it after the file, so the cycle number opens the name of the
 * chunk.
 */
const CYCLE_REQUEST = /\/(\d{3})(-[\w-]+)?\.(js|json)(\?|$)/;

/** Waits until the page has built its map and drawn the cycle it opens on. */
async function waitForPage(page: Page): Promise<void> {
  await page.waitForFunction(() => window.galaxyMap !== undefined, undefined, {
    timeout: 60000,
  });
  await page.evaluate(() => window.galaxyMap?.ready);
}

/** The names of the records the map holds. */
async function heldNames(page: Page): Promise<string[]> {
  return await page.evaluate(() => {
    const map = window.galaxyMap;
    if (map === undefined) return [];
    const found: string[] = [];
    for (let at = 0; at < map.systemCount(); at += 1) {
      const system = map.getSystem(at);
      if (system !== null) found.push(system.name);
    }
    return found;
  });
}

/** The view the page holds, as four plain numbers. */
async function readView(page: Page): Promise<{
  cursor: [number, number, number];
  distance: number;
  yaw: number;
  pitch: number;
}> {
  return await page.evaluate(() => {
    const view = window.galaxyMap?.getView();
    return {
      cursor: [...(view?.cursor ?? [0, 0, 0])] as [number, number, number],
      distance: view?.distance ?? -1,
      yaw: view?.yaw ?? -1,
      pitch: view?.pitch ?? -1,
    };
  });
}

/** The two opposite corners of the box one cycle's records span. */
function boxOf(row: CycleRow): { min: number[]; max: number[] } {
  const set = readJson<{ systems: CycleRecord[] }>(fileOf(row));
  const axes = ['x', 'y', 'z'] as const;
  return {
    min: axes.map((axis) => Math.min(...set.systems.map((one) => one.coords[axis]))),
    max: axes.map((axis) => Math.max(...set.systems.map((one) => one.coords[axis]))),
  };
}

/**
 * The seven sets of the demo page. The cycles page is a host of its own, so its catalog
 * holds the cycles and none of these.
 */
const DEMO_PAGE_SETS = [
  'guardian-ruins',
  'guardian-structures',
  'notable-systems',
  'uia',
  'adamastor',
  'multifaction',
  'thargoid-war',
];

test.describe('the cycles page', () => {
  test('gives the map one entry per cycle and none of the demo page sets', async ({
    page,
  }) => {
    await page.goto('./cycles/');
    await waitForPage(page);

    const entries = await page.evaluate(() => window.galaxyMap?.getDatasets() ?? []);
    expect(entries.map((entry) => entry.id)).toEqual(
      manifest.map((row) => `cycle-${row.cycle}`),
    );
    for (const id of DEMO_PAGE_SETS) {
      expect(
        entries.map((entry) => entry.id),
        `the catalog holds ${id}`,
      ).not.toContain(id);
    }
    // One cycle holds the bubble alone, so every entry names the box of its own records
    // and opens the camera on it.
    for (const entry of entries) {
      expect(entry.bounds, `${entry.id} names another bound`).toEqual({ mode: 'auto' });
      expect(entry.view, `${entry.id} names another view`).toEqual({ fit: 'systems' });
    }
  });

  test('opens on the first cycle and fetches that one file', async ({ page }) => {
    const asked: string[] = [];
    page.on('request', (request) => {
      if (CYCLE_REQUEST.test(request.url())) asked.push(request.url());
    });

    await page.goto('./cycles/');
    await waitForPage(page);

    const loaded = await page.evaluate(() => window.galaxyMap?.getLoadedDataset()?.id);
    expect(loaded).toBe(`cycle-${FIRST.cycle}`);
    expect(await page.evaluate(() => window.galaxyMap?.systemCount())).toBe(
      FIRST.count,
    );
    expect(asked, `the page asked for ${asked.join(', ')}`).toHaveLength(1);
  });

  test('holds the records of the second cycle alone after a switch', async ({
    page,
  }) => {
    const asked: string[] = [];
    await page.goto('./cycles/');
    await waitForPage(page);

    page.on('request', (request) => {
      if (CYCLE_REQUEST.test(request.url())) asked.push(request.url());
    });
    await page.evaluate(
      async (id) => await window.galaxyMap?.loadDataset(id),
      `cycle-${SECOND.cycle}`,
    );

    const set = readJson<{ systems: CycleRecord[] }>(fileOf(SECOND));
    const names = await heldNames(page);
    expect(names.length).toBe(SECOND.count);
    expect([...names].sort()).toEqual(set.systems.map((one) => one.name).sort());
    expect(asked, `the switch asked for ${asked.join(', ')}`).toHaveLength(1);
  });
});

// The page turns `datasetArrows` on, because its catalog is one entry per week of the
// war in order. The scenarios "The arrows step through the catalog" and "The arrows stop
// at the ends" read the page's own catalog.
test.describe('the step arrows of the cycles page', () => {
  test('the counter steps with the next arrow', async ({ page }) => {
    await page.goto('./cycles/');
    await waitForPage(page);

    const counter = page.locator('.gm-hud__dataset-counter');
    const next = page.locator('.gm-hud__dataset-step[data-name="next"]');
    const total = manifest.length;
    await expect(counter).toHaveText(`1 / ${String(total)}`);

    await next.click();
    await expect(counter).toHaveText(`2 / ${String(total)}`, { timeout: 30000 });
    const loaded = await page.evaluate(() => window.galaxyMap?.getLoadedDataset()?.id);
    console.log('the cycle after one step', loaded);
    expect(loaded).toBe(`cycle-${SECOND.cycle}`);
  });

  test('the arrows stop at the ends of the catalog', async ({ page }) => {
    await page.goto('./cycles/');
    await waitForPage(page);

    const previous = page.locator('.gm-hud__dataset-step[data-name="previous"]');
    const next = page.locator('.gm-hud__dataset-step[data-name="next"]');
    const last = manifest[manifest.length - 1] as { cycle: number };

    // The page opens on the first cycle, so the previous arrow has nothing to load.
    await expect(previous).toBeDisabled();
    await expect(next).toBeEnabled();

    await page.evaluate(
      async (id) => await window.galaxyMap?.loadDataset(id),
      `cycle-${last.cycle}`,
    );
    await expect(next).toBeDisabled();
    await expect(previous).toBeEnabled();
  });
});

// The step arrows exist so that a reader compares one week against the next at one angle
// and one zoom. The requirement "A step between cycles holds a camera inside the bounds"
// states the rule, and `dataset-catalog` states the four conditions it reads.
test.describe('the camera over a step between cycles', () => {
  test('stepping to the next cycle holds a view that shows it', async ({ page }) => {
    await page.goto('./cycles/');
    await waitForPage(page);

    const counter = page.locator('.gm-hud__dataset-counter');
    const next = page.locator('.gm-hud__dataset-step[data-name="next"]');
    const total = manifest.length;
    await expect(counter).toHaveText(`1 / ${String(total)}`);

    // 1,500 light years takes in the whole front. It is above the second cycle's frame
    // of 223 and under the far zoom limit of its `auto` bound, which is 3,675.
    await page.evaluate(() => {
      window.galaxyMap?.setView({ distance: 1500, yaw: 90, pitch: 20 });
    });
    const before = await readView(page);

    await next.click();
    await expect(counter).toHaveText(`2 / ${String(total)}`, { timeout: 30000 });
    const after = await readView(page);
    const loaded = await page.evaluate(() => window.galaxyMap?.getLoadedDataset()?.id);
    const held = await page.evaluate(() => window.galaxyMap?.systemCount());
    console.log('the view over a step of the war', { before, after, loaded, held });

    expect(after).toEqual(before);
    expect(loaded).toBe(`cycle-${SECOND.cycle}`);
    expect(held).toBe(SECOND.count);
  });

  test('stepping to the next cycle holds a camera on one system', async ({ page }) => {
    await page.goto('./cycles/');
    await waitForPage(page);

    const counter = page.locator('.gm-hud__dataset-counter');
    const next = page.locator('.gm-hud__dataset-step[data-name="next"]');
    const total = manifest.length;
    await expect(counter).toHaveText(`1 / ${String(total)}`);

    // The cursor is on the first record of the first cycle, and 20 light years is far
    // under the frame of the second cycle. The `auto` bound of the second cycle grows its
    // box by 1,000 light years, so the cursor is inside it.
    const first = readJson<{ systems: CycleRecord[] }>(fileOf(FIRST)).systems[0];
    if (first === undefined) throw new Error('The first cycle holds no record.');
    const { x, y, z } = first.coords;
    await page.evaluate(
      (cursor) => {
        window.galaxyMap?.setView({ cursor, distance: 20, yaw: 90, pitch: 20 });
      },
      [x, y, z] as [number, number, number],
    );
    const before = await readView(page);

    await next.click();
    await expect(counter).toHaveText(`2 / ${String(total)}`, { timeout: 30000 });
    const after = await readView(page);
    const held = await page.evaluate(() => window.galaxyMap?.systemCount());
    console.log('the view over a step from one system', { first, before, after, held });

    expect(before.distance).toBe(20);
    expect(after).toEqual(before);
    expect(held).toBe(SECOND.count);
  });

  test('an untouched camera is held over a wider cycle', async ({ page }) => {
    await page.goto('./cycles/');
    await waitForPage(page);

    const counter = page.locator('.gm-hud__dataset-counter');
    const next = page.locator('.gm-hud__dataset-step[data-name="next"]');
    const before = await readView(page);

    await next.click();
    await expect(counter).toHaveText(`2 / ${String(manifest.length)}`, {
      timeout: 30000,
    });
    const after = await readView(page);
    console.log('the view over an untouched step', { before, after });

    // The war grows, so the camera at the first cycle's frame is nearer than the frame of
    // the second. The frame distance is `2 * R`, where `R` is half the diagonal of the box.
    const box = boxOf(SECOND);
    const frame = Math.hypot(
      ...[0, 1, 2].map((axis) => (box.max[axis] as number) - (box.min[axis] as number)),
    );
    expect(before.distance).toBeLessThan(frame);
    expect(after).toEqual(before);
  });
});

// The page keeps the loaded cycle in the `dataset` parameter and the view in the fragment,
// so a reader can copy the address and open the same picture.
test.describe('the address of the cycles page', () => {
  test('carries the cycle and the view, and opens on them again', async ({
    page,
    context,
  }) => {
    await page.goto('./cycles/');
    await waitForPage(page);

    const id = `cycle-${String((manifest[4] as CycleRow).cycle)}`;
    await page.evaluate(async (wanted) => {
      await window.galaxyMap?.loadDataset(wanted);
      window.galaxyMap?.setView({ distance: 1500, yaw: 90, pitch: 20 });
    }, id);
    await page.waitForFunction(
      (wanted) =>
        window.location.search.includes(`dataset=${wanted}`) &&
        window.location.hash.includes('d=1500'),
      id,
    );
    const address = page.url();
    const before = await readView(page);

    const copy = await context.newPage();
    await copy.goto(address);
    await waitForPage(copy);
    const loaded = await copy.evaluate(() => window.galaxyMap?.getLoadedDataset()?.id);
    const after = await readView(copy);
    console.log('the view over a copied address', { address, before, after });

    expect(loaded).toBe(id);
    expect(after.distance).toBeCloseTo(before.distance, 3);
    expect(after.yaw).toBeCloseTo(before.yaw, 3);
    expect(after.pitch).toBeCloseTo(before.pitch, 3);
    for (const axis of [0, 1, 2]) {
      expect(after.cursor[axis]).toBeCloseTo(before.cursor[axis] as number, 3);
    }
  });
});
