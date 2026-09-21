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

  test('opens the camera on the box of the cycle it loads', async ({ page }) => {
    await page.goto('./cycles/');
    await waitForPage(page);
    await page.evaluate(
      async (id) => await window.galaxyMap?.loadDataset(id),
      `cycle-${SECOND.cycle}`,
    );

    const set = readJson<{ systems: CycleRecord[] }>(fileOf(SECOND));
    const axes = ['x', 'y', 'z'] as const;
    const view = await page.evaluate(() => window.galaxyMap?.getView());
    expect(view).toBeDefined();
    for (const [index, axis] of axes.entries()) {
      const values = set.systems.map((one) => one.coords[axis]);
      const at = view?.cursor[index] as number;
      expect(at, `the cursor sits off the box on ${axis}`).toBeGreaterThanOrEqual(
        Math.min(...values),
      );
      expect(at, `the cursor sits off the box on ${axis}`).toBeLessThanOrEqual(
        Math.max(...values),
      );
    }
    expect(view?.distance).toBeGreaterThan(0);
  });
});
