// The Canonn page of the built site, which holds the maps of the Canonn ED3D map
// project.
//
// The page is a host of its own: it gives the map a catalog of one entry per manifest
// row, fetches the files of the entry the user picks and parses them in a worker. It
// writes `window.galaxyMap` and `window.canonnTiming`, and the spec reads the page
// through those two alone.
//
// The renderer check gates this project, so a run that reaches this file is a run on the
// card. `e2e/00-renderer.spec.ts` is what fails a software renderer.
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const CANONN = fileURLToPath(
  new URL('../apps/demo/demo-data/canonn/', import.meta.url),
);

/** One file of one manifest row: the set it reads, and what the map calls each key. */
interface ManifestFile {
  path: string;
  categories: Record<string, { name: string; color: number[] }>;
}

/** One row of the manifest, which is one entry of the catalog. */
interface ManifestRow {
  id: string;
  label: string;
  group: string;
  description: string;
  systemCount: number;
  files: ManifestFile[];
}

const manifest = JSON.parse(
  readFileSync(`${CANONN}index.json`, 'utf8'),
) as ManifestRow[];

/** The entry the page opens on, which `apps/demo/canonn/main.ts` names. */
const OPENING = 'GR';

/** The bytes the ceiling of the opening set holds. */
const OPENING_CEILING = 1_000_000;

/** One row by its id, or the failure that names it. */
function rowOf(id: string): ManifestRow {
  const row = manifest.find((entry) => entry.id === id);
  if (row === undefined) throw new Error(`The manifest holds no entry ${id}`);
  return row;
}

/**
 * How many distinct systems one row holds, over every file it names.
 *
 * A record is one site and a system holds more than one: the five codex files of the
 * largest entry name 47,331 records of 43,674 systems. The map draws one point per
 * system, so this is the count it reports after the load, and a record the map dropped
 * for size would show as a count under it.
 */
function distinctNamesOf(row: ManifestRow): number {
  const names = new Set<string>();
  for (const file of row.files) {
    const set = JSON.parse(readFileSync(`${CANONN}${file.path}`, 'utf8')) as {
      records: { name: string }[];
    };
    for (const record of set.records) names.add(record.name.toLowerCase());
  }
  return names.size;
}

/** The bytes one row reads, as the committed files hold them. */
function bytesOf(row: ManifestRow): number {
  return row.files.reduce(
    (total, file) => total + statSync(`${CANONN}${file.path}`).size,
    0,
  );
}

/**
 * The name of the committed set one request asks for. The build writes each set as an
 * asset of its own, with an eight character hash in the name, so the name of the
 * manifest comes back by cutting the hash off.
 */
const SET_REQUEST = /\/assets\/([\w.-]+)-[A-Za-z0-9_-]{8}\.json(\?|$)/;

function setNameOf(url: string): string | null {
  const found = SET_REQUEST.exec(url);
  return found === null ? null : `${found[1] as string}.json`;
}

/** Collects the name of every set the page asks for, in the order it asks. */
function watchSets(page: Page): string[] {
  const asked: string[] = [];
  page.on('request', (request) => {
    const name = setNameOf(request.url());
    if (name !== null) asked.push(name);
  });
  return asked;
}

/** Waits until the page has built its map and drawn the entry it opens on. */
async function waitForPage(page: Page): Promise<void> {
  await page.waitForFunction(() => window.galaxyMap !== undefined, undefined, {
    timeout: 60000,
  });
  await page.evaluate(() => window.galaxyMap?.ready);
}

/** Loads one entry and reads what the map holds after it. */
async function loadEntry(
  page: Page,
  id: string,
): Promise<{
  rejected: string[];
  categories: { name: string; color: number[] }[];
  systems: number;
  loaded: string | undefined;
}> {
  return await page.evaluate(async (entry) => {
    const map = window.galaxyMap;
    if (map === undefined) throw new Error('The page has no map.');
    const report = await map.loadDataset(entry);
    const categories = [];
    for (let at = 0; at < map.categoryCount(); at += 1) {
      const category = map.getCategory(at);
      if (category !== null) {
        categories.push({ name: category.name, color: [...category.color] });
      }
    }
    return {
      rejected: report.systems.rejected.map((one) => one.reason),
      categories,
      systems: map.systemCount(),
      loaded: map.getLoadedDataset()?.id,
    };
  }, id);
}

/** What one row names its categories, with the colour it gives each of them. */
function namedCategories(row: ManifestRow): { name: string; color: number[] }[] {
  const held = new Map<string, { name: string; color: number[] }>();
  for (const file of row.files) {
    for (const category of Object.values(file.categories)) {
      if (!held.has(category.name)) {
        held.set(category.name, { name: category.name, color: category.color });
      }
    }
  }
  return [...held.values()];
}

/**
 * Two entries that read one file and give its records their own names and colours. The
 * pair with the fewest records comes first, so the test loads two small sets.
 */
function sharedPair(): { path: string; first: ManifestRow; second: ManifestRow } {
  const byPath = new Map<string, ManifestRow[]>();
  for (const row of manifest) {
    if (row.files.length !== 1) continue;
    const path = (row.files[0] as ManifestFile).path;
    byPath.set(path, [...(byPath.get(path) ?? []), row]);
  }
  const found = [...byPath.entries()]
    .flatMap(([path, rows]) =>
      rows.length < 2
        ? []
        : [{ path, first: rows[0] as ManifestRow, second: rows[1] as ManifestRow }],
    )
    .filter((pair) => {
      const first = namedCategories(pair.first)
        .map((one) => one.name)
        .sort();
      const second = namedCategories(pair.second)
        .map((one) => one.name)
        .sort();
      return first.join('|') !== second.join('|');
    })
    .sort((a, b) => a.first.systemCount - b.first.systemCount);
  const pair = found[0];
  if (pair === undefined)
    throw new Error('No two entries of the manifest share a file.');
  return pair;
}

/** The entry with the most records, which is the one the readings are taken over. */
const LARGEST = [...manifest].sort(
  (a, b) => b.systemCount - a.systemCount,
)[0] as ManifestRow;

/** The entry that reads the most files, which is the multi-file path. */
const MULTI_FILE = 'Aliens';

/**
 * The mean animation frame interval the load of a set may leave, in milliseconds.
 *
 * One frame at 60 Hz is 16.7 ms. The reading covers the fetch, the parse and the build
 * of the records, and it ends where the records reach `loadDataset`: the write itself is
 * what `dataset-catalog` gives 40 ms, and that cost is not this page's.
 */
const INTERVAL_BUDGET_MS = 18;

/**
 * The time the hover pick, the pin, the ring and the name label placement must stay
 * under, in milliseconds.
 *
 * `e2e/frame-budget.spec.ts` holds the same budget over a set that spec generates. The
 * reading below is over the largest entry this page ships, which is the widest category
 * table of the repository, so the two cover different shapes of the same work.
 */
const SELECTION_BUDGET_MS = 2;

/**
 * Waits for a number of animation frames, and moves the pointer on the canvas in each
 * one. A map nobody touches draws at the idle rate, so a reading of the work one frame
 * does must hold the map awake, as a user who keeps the pointer on it does.
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
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
    },
    { frames: count, pixelX: x, pixelY: y },
  );
}

test.describe('the Canonn page', () => {
  test('gives the map one entry per manifest row', async ({ page }) => {
    await page.goto('./canonn/');
    await waitForPage(page);

    const entries = await page.evaluate(() => window.galaxyMap?.getDatasets() ?? []);
    expect(entries.map((entry) => entry.id)).toEqual(manifest.map((row) => row.id));
    expect(entries.map((entry) => entry.label)).toEqual(
      manifest.map((row) => row.label),
    );
    expect(entries.map((entry) => entry.collection)).toEqual(
      manifest.map((row) => row.group),
    );
    expect(entries.map((entry) => entry.systemCount)).toEqual(
      manifest.map((row) => row.systemCount),
    );
    // The dataset dialog shows the line, so an entry with none opens on a blank panel.
    expect(entries.map((entry) => entry.description)).toEqual(
      manifest.map((row) => row.description),
    );
  });

  test('opens on a set under 1 MB and fetches that set alone', async ({ page }) => {
    const asked = watchSets(page);

    await page.goto('./canonn/');
    await waitForPage(page);

    const opening = rowOf(OPENING);
    const loaded = await page.evaluate(() => window.galaxyMap?.getLoadedDataset()?.id);
    const held = await page.evaluate(() => window.galaxyMap?.systemCount() ?? -1);
    console.log('the opening entry', { loaded, held, bytes: bytesOf(opening), asked });

    expect(loaded).toBe(OPENING);
    expect(held).toBeGreaterThan(0);
    expect(bytesOf(opening)).toBeLessThan(OPENING_CEILING);
    // The page fetched the files of that entry and no other set.
    expect([...asked].sort()).toEqual(opening.files.map((file) => file.path).sort());
    for (const name of asked) {
      expect(
        statSync(`${CANONN}${name}`).size,
        `${name} is larger than the opening ceiling`,
      ).toBeLessThan(OPENING_CEILING);
    }
  });

  test('loads a set with the categories its row names', async ({ page }) => {
    await page.goto('./canonn/');
    await waitForPage(page);

    const row = rowOf('BM');
    const asked = watchSets(page);
    const reading = await loadEntry(page, row.id);
    console.log('the set the page loaded', { asked, reading });

    expect(reading.loaded).toBe(row.id);
    expect(reading.rejected).toEqual([]);
    expect(reading.systems).toBeGreaterThan(0);
    expect(reading.categories.map((one) => one.name).sort()).toEqual(
      namedCategories(row)
        .map((one) => one.name)
        .sort(),
    );
    // The page fetched the files that entry names and no others.
    expect([...asked].sort()).toEqual(row.files.map((file) => file.path).sort());
  });

  test('loads an entry that reads many files', async ({ page }) => {
    await page.goto('./canonn/');
    await waitForPage(page);

    const row = rowOf(MULTI_FILE);
    expect(row.files.length).toBeGreaterThan(1);
    const asked = watchSets(page);
    const reading = await loadEntry(page, row.id);
    console.log('the multi-file entry', {
      files: row.files.length,
      asked: asked.length,
      systems: reading.systems,
      rejected: reading.rejected,
    });

    expect(reading.loaded).toBe(row.id);
    expect(reading.rejected).toEqual([]);
    expect(reading.systems).toBeGreaterThan(0);
    expect([...asked].sort()).toEqual(row.files.map((file) => file.path).sort());
    expect(reading.categories.map((one) => one.name).sort()).toEqual(
      namedCategories(row)
        .map((one) => one.name)
        .sort(),
    );
  });

  test('gives two entries of one file their own names and colours', async ({
    page,
  }) => {
    const pair = sharedPair();
    await page.goto('./canonn/');
    await waitForPage(page);

    const first = await loadEntry(page, pair.first.id);
    const second = await loadEntry(page, pair.second.id);
    console.log('the two entries of', pair.path, {
      first: first.categories,
      second: second.categories,
    });

    expect(first.categories).toEqual(namedCategories(pair.first));
    expect(second.categories).toEqual(namedCategories(pair.second));
    expect(first.categories).not.toEqual(second.categories);
    // One file holds one set of records, so the two entries hold the same count.
    expect(first.systems).toBe(second.systems);
  });

  test('keeps the loop turning and the pick in budget over the largest set', async ({
    page,
  }) => {
    test.setTimeout(180000);
    await page.goto('./canonn/');
    await waitForPage(page);

    const reading = await page.evaluate(async (id) => {
      const map = window.galaxyMap;
      if (map === undefined) throw new Error('The page has no map.');
      map.debug.resetFrameIntervalStats();
      // The window ends where the records reach `loadDataset`, which is where the page
      // writes its own reading, and not after the write of the set.
      const done = map.loadDataset(id);
      const stats = await new Promise<{
        frames: number;
        meanMs: number;
        worstMs: number;
      }>((resolve) => {
        const step = (): void => {
          if (window.canonnTiming?.id === id) {
            resolve(map.debug.frameIntervalStats());
            return;
          }
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
      const report = await done;
      return {
        stats,
        timing: window.canonnTiming,
        systems: map.systemCount(),
        rejected: report.systems.rejected.map((one) => one.reason),
        categories: map.categoryCount(),
      };
    }, LARGEST.id);
    console.log('the interval over the largest load', LARGEST.id, reading);

    expect(reading.systems).toBeGreaterThan(0);
    // The largest entry is the one that reaches the record bound, so `over-capacity` can
    // appear here and nowhere else. The map took every record the entry holds, and drew
    // one point per system.
    expect(reading.rejected).toEqual([]);
    expect(reading.systems).toBe(distinctNamesOf(LARGEST));
    // The loop kept drawing while the page fetched, parsed and built the records.
    expect(reading.stats.frames).toBeGreaterThan(2);
    expect(reading.stats.meanMs).toBeLessThanOrEqual(INTERVAL_BUDGET_MS);

    // The selection work over that same set, which is the densest set the page ships:
    // 43,674 systems inside one region of the galaxy. `e2e/frame-budget.spec.ts` reads
    // the same budget over a set it generates and spreads, and nothing else in the suite
    // reads the pick over the data this page commits.
    const box = await page.locator('canvas').boundingBox();
    if (box === null) throw new Error('The page has no canvas.');
    const pixelX = box.x + box.width / 2;
    const pixelY = box.y + box.height / 2;
    await page.evaluate(() => {
      const map = window.galaxyMap;
      const system = map?.getSystem(0) ?? null;
      if (map === undefined || system === null) return;
      map.setView({ cursor: [...system.position], distance: 500, yaw: 0, pitch: 35 });
    });
    await hoverFrames(page, 5, pixelX, pixelY);
    const hovered = await page.evaluate(
      () => window.galaxyMap?.getHover()?.name ?? null,
    );
    await page.evaluate(() => {
      window.galaxyMap?.debug.resetSelectionSampling();
      window.galaxyMap?.debug.resetFrameStats();
    });
    await hoverFrames(page, 120, pixelX, pixelY);
    const selection = await page.evaluate(
      () =>
        window.galaxyMap?.debug.selectionSampling() ?? {
          frames: 0,
          meanMs: Number.POSITIVE_INFINITY,
          worstMs: Number.POSITIVE_INFINITY,
        },
    );
    const draw = await page.evaluate(
      () => window.galaxyMap?.debug.frameStats().meanMs ?? -1,
    );
    console.log('the selection work over the largest set', LARGEST.id, {
      hovered,
      categories: reading.categories,
      drawMs: draw,
      ...selection,
    });

    // The pick found a system, so the reading covers the whole of the work.
    expect(hovered).not.toBeNull();
    // The count is of drawn frames: the sampling runs inside the draw.
    expect(selection.frames).toBeGreaterThanOrEqual(110);
    expect(selection.meanMs).toBeLessThanOrEqual(SELECTION_BUDGET_MS);
  });
});

// The dataset library shows the manifest's groups as a row of collection chips, in place
// of the group headers the old side list drew.
test.describe('the dataset library of the page', () => {
  test('shows one chip per group of the manifest, sorted by name', async ({ page }) => {
    await page.goto('./canonn/');
    await waitForPage(page);

    const dialog = page.locator('.gm-hud__dialog');
    await page.locator('.gm-hud__dataset').click();
    await expect(dialog).toBeVisible();

    const names = await dialog
      .locator('.gm-hud__collection-name')
      .evaluateAll((nodes) => nodes.map((node) => node.textContent ?? ''));
    const cards = await dialog.locator('.gm-hud__dataset-card').count();
    console.log('the chips of the Canonn page', { names, cards });

    const groups = [...new Set(manifest.map((row) => row.group))]
      .sort((left, right) => left.localeCompare(right))
      .map((name) => name.toUpperCase());
    expect(names).toEqual(['ALL', ...groups]);
    expect(cards).toBe(manifest.length);

    // One chip keeps the entries of that group alone.
    const first = groups[0] as string;
    const kept = manifest.filter((row) => row.group.toUpperCase() === first).length;
    await dialog.locator('.gm-hud__collection').filter({ hasText: first }).click();
    await expect(dialog.locator('.gm-hud__dataset-card')).toHaveCount(kept);

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });
});
