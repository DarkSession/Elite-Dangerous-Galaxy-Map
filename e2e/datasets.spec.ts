// The dataset catalog, the dataset field and the dataset library dialog, read through
// the browser.
//
// Every test of the first part builds a second map over a canvas of its own, with a
// catalog the test wrote. Each entry's `load()` returns records the test made, so the
// suite reaches no host but the page's own. The tests of the last part read the demo
// page's own catalog: six entries that import a committed file and one that reads the
// factions dump, which those tests serve from a fixture of their own.
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import {
  dumpFaction,
  dumpSystem,
  FULL_SET,
  openMap,
  serveFactionsDump,
  FACTIONS_DUMP_URL,
} from './helpers';

test.use({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });

/** The six entries whose records the repository commits, in the order the page gives. */
const COMMITTED_IDS = [
  'guardian-ruins',
  'guardian-structures',
  'notable-systems',
  'uia',
  'adamastor',
  'thargoid-war',
];

/**
 * The dump fixture: four factions, of which `Canonn` names three systems and
 * `Canonn Deep Space Research` names two. `Shared System` is in both.
 */
const DUMP_FIXTURE = [
  '[',
  dumpFaction('Another Faction', [dumpSystem('Elsewhere', 1, true)]),
  dumpFaction('Canonn', [
    dumpSystem('Canonn Home', 10, true),
    dumpSystem('Canonn Home', 10, false),
    dumpSystem('Canonn Outpost', 11, false),
    dumpSystem('Shared System', 12, true),
  ]),
  dumpFaction('Canonn Deep Space Research', [
    dumpSystem('Shared System', 12, false),
    dumpSystem('Research Post', 13, true),
  ]),
  dumpFaction('A Last Faction', [dumpSystem('Nowhere', 2, true)]),
  ']',
].join('\n');

/** A dump of three factions, none of which the entry names. */
const DUMP_WITHOUT_CANONN = [
  '[',
  dumpFaction('Another Faction', [dumpSystem('Elsewhere', 1, true)]),
  dumpFaction('A Second Faction', [dumpSystem('Nowhere', 2, true)]),
  dumpFaction('A Third Faction', [dumpSystem('Somewhere', 3, true)]),
  ']',
].join('\n');

/** What the test asks one catalog entry to be. */
interface EntryBuild {
  readonly id: string;
  readonly label?: string;
  readonly collection?: string;
  readonly region?: string;
  readonly description?: string;
  readonly systemCount?: number;
  /** How many records the entry's `load()` gives back. */
  readonly systems?: number;
  /** How many categories the entry's `load()` gives back. */
  readonly categories?: number;
  /** How long the `load()` takes, in milliseconds. It returns at once with none. */
  readonly delay?: number;
  /** True makes the `load()` reject. */
  readonly fail?: boolean;
  /** The `bounds` the entry names, which the load writes on the map. */
  readonly bounds?: unknown;
  /** The `view` the entry names, which the load opens the camera at. */
  readonly view?: unknown;
  /**
   * The two opposite corners of the box the entry's systems span. The entry then holds
   * two records, one at each corner, and `systems` is not read.
   */
  readonly corners?: readonly [
    readonly [number, number, number],
    readonly [number, number, number],
  ];
}

/** What the test asks the second map to be. */
interface MapBuild {
  readonly entries: readonly EntryBuild[];
  /** The id of the entry the map loads at start. */
  readonly dataset?: string;
  /** False leaves the `datasets` option out, so the map gets no catalog. */
  readonly catalog?: boolean;
  /** False builds the map with no HUD. */
  readonly hud?: boolean;
  /** True turns the dataset step arrows on, which are off by default. */
  readonly arrows?: boolean;
  /** True gives the map back before the first load settles, so a test reads the wait. */
  readonly noWait?: boolean;
  /** The `bounds` option the map takes. */
  readonly bounds?: unknown;
  /** The `startView` option the map takes. */
  readonly startView?: unknown;
}

/**
 * Opens the demo page, then builds a second map with a catalog of its own. The demo
 * map goes down first, so the tests below drive one HUD and one catalog.
 */
async function openDatasets(page: Page, build: MapBuild): Promise<void> {
  await openMap(page);
  await page.evaluate(async (options: MapBuild) => {
    const factory = window.galaxyMapFactory;
    if (factory === undefined) throw new Error('The page has no map factory.');
    window.galaxyMap?.dispose();
    const wrap = document.createElement('div');
    wrap.id = 'dataset-wrap';
    wrap.style.cssText = 'position: absolute; inset: 0;';
    const canvas = document.createElement('canvas');
    canvas.style.cssText =
      'display: block; width: 100%; height: 100%; touch-action: none;';
    wrap.appendChild(canvas);
    document.body.appendChild(wrap);

    window.__datasetLoads = [];
    // The records are made here and not inside `load()`, so a measured load reads the
    // time of the library's own work and not the time of the test's own array build.
    const contentOf = (
      entry: EntryBuild,
    ): { categories: unknown[]; systems: unknown[] } => {
      const categories: { name: string }[] = [];
      for (let index = 0; index < (entry.categories ?? 1); index += 1) {
        categories.push({
          name: `${entry.id.toUpperCase()} ${index}`,
          color: [153, 230, 255],
          maxDrawRange: 200000,
          description: `The category ${index} of ${entry.id}.`,
        } as never);
      }
      const systems: unknown[] = [];
      if (entry.corners !== undefined) {
        const [low, high] = entry.corners;
        for (const [at, corner] of [low, high].entries()) {
          systems.push({
            name: `${entry.id}-corner-${at}`,
            coords: { x: corner[0], y: corner[1], z: corner[2] },
            categories: [(categories[0] as { name: string }).name],
          });
        }
        return { categories: categories as unknown[], systems };
      }
      for (let index = 0; index < (entry.systems ?? 0); index += 1) {
        // The line wraps every 10,000 records and steps along `z`. A straight ramp of
        // the index leaves the model bounds at a full set, and the reader would then
        // reject most of the records as `out-of-bounds`.
        systems.push({
          name: `${entry.id}-${index}`,
          coords: { x: (index % 10000) - 5000, y: 0, z: ((index / 10000) | 0) * 20 },
          categories: [
            (categories[index % categories.length] as { name: string }).name,
          ],
        });
      }
      return { categories: categories as unknown[], systems };
    };

    const datasets = options.entries.map((entry) => {
      const content = contentOf(entry);
      return {
        id: entry.id,
        label: entry.label ?? entry.id,
        ...(entry.collection === undefined ? {} : { collection: entry.collection }),
        ...(entry.region === undefined ? {} : { region: entry.region }),
        ...(entry.description === undefined ? {} : { description: entry.description }),
        ...(entry.systemCount === undefined ? {} : { systemCount: entry.systemCount }),
        ...(entry.bounds === undefined ? {} : { bounds: entry.bounds }),
        ...(entry.view === undefined ? {} : { view: entry.view }),
        load: (): unknown => {
          window.__datasetLoads?.push(entry.id);
          if (entry.fail === true) {
            return Promise.reject(new Error(`The load of ${entry.id} failed.`));
          }
          if (entry.delay === undefined) return content;
          return new Promise((resolve) => {
            setTimeout(() => resolve(content), entry.delay);
          });
        },
      };
    });

    const map = factory(canvas, {
      hud:
        options.hud === false
          ? false
          : options.arrows === true
            ? { datasetArrows: true }
            : true,
      ...(options.catalog === false ? {} : { datasets }),
      ...(options.dataset === undefined ? {} : { dataset: options.dataset }),
      ...(options.bounds === undefined ? {} : { bounds: options.bounds }),
      ...(options.startView === undefined ? {} : { startView: options.startView }),
    } as never);
    window.__datasetMap = map;
    if (options.noWait !== true) await map.ready;
  }, build);
}

/** The root of the HUD the tests drive. */
function hud(page: Page): Locator {
  return page.locator('#dataset-wrap .gm-hud');
}

/** The dataset field of the top bar. */
function field(page: Page): Locator {
  return hud(page).locator('.gm-hud__dataset');
}

/** The dataset library dialog. */
function dialog(page: Page): Locator {
  return hud(page).locator('.gm-hud__dialog');
}

/** What the map holds now. */
async function reading(page: Page): Promise<{
  systems: number;
  categories: number;
  loaded: string | null;
  filter: string;
  selection: string | null;
}> {
  return page.evaluate(() => {
    const map = window.__datasetMap;
    return {
      systems: map?.systemCount() ?? -1,
      categories: map?.categoryCount() ?? -1,
      loaded: map?.getLoadedDataset()?.id ?? null,
      filter: map?.getNameFilter() ?? '',
      selection: map?.getSelection()?.name ?? null,
    };
  });
}

/** Loads one dataset and says whether the promise resolved. */
async function loadDataset(
  page: Page,
  id: string,
): Promise<{ ok: boolean; message: string }> {
  return page.evaluate(async (name) => {
    try {
      await window.__datasetMap?.loadDataset(name);
      return { ok: true, message: '' };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : '' };
    }
  }, id);
}

/** The browsable bounds the map holds. */
async function readBounds(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(
    () => (window.__datasetMap?.getBounds() ?? {}) as Record<string, unknown>,
  );
}

/** The view the map holds, rounded to whole light years and whole degrees. */
async function readView(page: Page): Promise<{
  cursor: [number, number, number];
  distance: number;
  yaw: number;
  pitch: number;
}> {
  return page.evaluate(() => {
    const view = window.__datasetMap?.getView();
    if (view === undefined) {
      return {
        cursor: [0, 0, 0] as [number, number, number],
        distance: -1,
        yaw: -1,
        pitch: -1,
      };
    }
    return {
      cursor: [...view.cursor] as [number, number, number],
      distance: view.distance,
      yaw: view.yaw,
      pitch: view.pitch,
    };
  });
}

/** Draws frames and gives back the mean milliseconds a frame took. */
async function drawFrames(page: Page, count: number): Promise<number> {
  return page.evaluate(
    (many) => window.__datasetMap?.debug.measureFrames(many) ?? -1,
    count,
  );
}

test('a load replaces the set and clears the selection and the filter', async ({
  page,
}) => {
  await openDatasets(page, {
    entries: [
      { id: 'first', systems: 5, categories: 2 },
      { id: 'second', systems: 3, categories: 1 },
    ],
    dataset: 'first',
  });

  const before = await reading(page);
  console.log('the map at start', before);
  expect(before).toMatchObject({ systems: 5, categories: 2, loaded: 'first' });

  await page.evaluate(() => {
    const map = window.__datasetMap;
    map?.setSelection('first-2');
    map?.setNameFilter('sol');
  });
  // `setSelection` starts a flight to the system, which moves the view over 600 ms. The
  // reading below is a comparison of two views, so it waits for the flight to end first.
  // Without the wait the two readings come from two moments of one flight and differ.
  await page.waitForFunction(
    () => (window.__datasetMap?.debug.selectionFlightMs() ?? 0) === 0,
  );
  const view = await page.evaluate(() => window.__datasetMap?.getView());

  const result = await loadDataset(page, 'second');
  const after = await reading(page);
  console.log('the map after the load', after);

  expect(result.ok).toBe(true);
  expect(after).toEqual({
    systems: 3,
    categories: 1,
    loaded: 'second',
    filter: '',
    selection: null,
  });
  // The load does not move the view: a host that wants to fly to the new set does it
  // when the promise settles.
  const now = await page.evaluate(() => window.__datasetMap?.getView());
  expect(now).toEqual(view);
});

test('a failed load leaves the map as it was', async ({ page }) => {
  await openDatasets(page, {
    entries: [
      { id: 'good', systems: 4, categories: 2, bounds: { mode: 'auto' } },
      { id: 'bad', fail: true, bounds: { mode: 'unrestricted' } },
    ],
    dataset: 'good',
  });
  const view = await readView(page);

  const result = await loadDataset(page, 'bad');
  const after = await reading(page);
  const bounds = await readBounds(page);
  const frame = await drawFrames(page, 10);
  console.log('the failed load', result, 'the map after it', { after, bounds });

  expect(result.ok).toBe(false);
  expect(result.message).toContain('The load of bad failed.');
  expect(after).toMatchObject({ systems: 4, categories: 2, loaded: 'good' });
  // The bounds and the view are the ones the entry that loaded named.
  expect(bounds).toEqual({ mode: 'auto' });
  expect(await readView(page)).toEqual(view);
  expect(frame).toBeGreaterThan(0);
});

test('an unknown id rejects and changes nothing', async ({ page }) => {
  await openDatasets(page, {
    entries: [{ id: 'only', systems: 2 }],
    dataset: 'only',
  });

  const result = await loadDataset(page, 'nothing');
  const after = await reading(page);
  console.log('the unknown id', result);

  expect(result.ok).toBe(false);
  expect(result.message).toContain('nothing');
  expect(after).toMatchObject({ systems: 2, loaded: 'only' });
});

test('a full set of 50,000 systems switches inside the 40 ms budget', async ({
  page,
}) => {
  await openDatasets(page, {
    entries: [
      { id: 'full-a', systems: FULL_SET, categories: 256 },
      {
        id: 'full-b',
        systems: FULL_SET,
        categories: 256,
        bounds: { mode: 'auto' },
        view: { fit: 'systems' },
      },
    ],
    dataset: 'full-a',
  });

  const before = await reading(page);
  expect(before).toMatchObject({ systems: FULL_SET, categories: 256 });

  const measure = await page.evaluate(async () => {
    const map = window.__datasetMap;
    const started = performance.now();
    await map?.loadDataset('full-b');
    return performance.now() - started;
  });
  const after = await reading(page);
  const frame = await drawFrames(page, 10);
  console.log('the switch took', measure, 'ms, and the map holds', after);

  expect(after).toMatchObject({ systems: FULL_SET, categories: 256, loaded: 'full-b' });
  // The two new steps of the load are inside the measurement.
  expect(await readBounds(page)).toEqual({ mode: 'auto' });
  expect(measure).toBeLessThan(40);
  expect(frame).toBeGreaterThan(0);
});

// The same switch, measured with the dialog open, is in `e2e/dataset-cost.spec.ts`. It
// reads a time and asserts on it, so it belongs in the timed pass on one worker.
test('the later load wins and the earlier one rejects as cancelled', async ({
  page,
}) => {
  await openDatasets(page, {
    entries: [
      { id: 'start', systems: 2, categories: 1 },
      { id: 'slow', systems: 7, categories: 1, delay: 300, bounds: { mode: 'auto' } },
      { id: 'fast', systems: 3, categories: 1 },
    ],
    dataset: 'start',
    bounds: { mode: 'unrestricted' },
  });

  const results = await page.evaluate(async () => {
    const map = window.__datasetMap;
    const settle = async (promise: Promise<unknown> | undefined): Promise<string> => {
      try {
        await promise;
        return 'resolved';
      } catch (error) {
        return error instanceof Error ? error.message : 'rejected';
      }
    };
    const first = map?.loadDataset('slow');
    const second = map?.loadDataset('fast');
    const readings = await Promise.all([settle(second), settle(first)]);
    await new Promise((resolve) => setTimeout(resolve, 500));
    return readings;
  });
  const after = await reading(page);
  console.log('the two loads', results, 'the map after them', after);

  expect(results[0]).toBe('resolved');
  expect(results[1]).toContain('cancelled');
  expect(after).toMatchObject({ systems: 3, loaded: 'fast' });
  // The cancelled load wrote no bounds, so the reading is the option the map took.
  expect(await readBounds(page)).toEqual({ mode: 'unrestricted' });
});

test('the start load reads the named entry', async ({ page }) => {
  await openDatasets(page, {
    entries: [
      { id: 'one', systems: 1 },
      { id: 'two', systems: 2 },
      { id: 'three', systems: 3 },
    ],
    dataset: 'three',
  });

  const after = await reading(page);
  console.log('the start load read', after);
  expect(after).toMatchObject({ systems: 3, loaded: 'three' });
});

test('ready settles when the start load rejects, and the map draws', async ({
  page,
}) => {
  await openDatasets(page, {
    entries: [{ id: 'bad', fail: true }],
    dataset: 'bad',
  });

  const after = await reading(page);
  const frame = await drawFrames(page, 10);
  console.log('the map after the failed start load', after, 'the frame', frame);

  // `openDatasets` awaits `ready`, so the test reaching this line is the reading that
  // `ready` settled after a load that rejected.
  expect(after).toMatchObject({ systems: 0, loaded: null });
  expect(frame).toBeGreaterThan(0);
  expect(await field(page).count()).toBe(1);
});

test('the bar carries the dataset field only with a catalog', async ({ page }) => {
  await openDatasets(page, {
    entries: [
      { id: 'one', label: 'One', systems: 1 },
      { id: 'two', label: 'Two', systems: 2 },
    ],
    dataset: 'one',
  });

  await expect(field(page)).toHaveCount(1);
  await expect(field(page)).toContainText('One');
  // The field sits beside the region name and does not replace it.
  await expect(hud(page).locator('.gm-hud__region')).toHaveCount(1);
  await expect(hud(page).locator('.gm-hud__title')).toHaveCount(1);
  await expect(hud(page).locator('.gm-hud__zoom')).toHaveCount(1);
  await expect(hud(page).locator('.gm-hud__reset')).toHaveCount(1);

  await page.evaluate(() => {
    window.__datasetMap?.dispose();
    document.getElementById('dataset-wrap')?.remove();
  });
  await openDatasets(page, { entries: [], catalog: false });

  const empty = await page.evaluate(() => window.__datasetMap?.getDatasets().length);
  console.log('the catalog of the second map holds', empty, 'entries');
  expect(empty).toBe(0);
  await expect(field(page)).toHaveCount(0);
  await expect(hud(page).locator('.gm-hud__region')).toHaveCount(1);
  await expect(hud(page).locator('.gm-hud__zoom')).toHaveCount(1);
  await expect(hud(page).locator('.gm-hud__reset')).toHaveCount(1);
});

// The dataset library: a search box, a row of collection chips and a grid of cards. One
// click on a card loads that entry.

/** The cards of the grid. */
function cards(page: Page): Locator {
  return dialog(page).locator('.gm-hud__dataset-card');
}

/** One card by the id of its entry, because the card text holds the collection too. */
function cardOf(page: Page, id: string): Locator {
  return dialog(page).locator(`.gm-hud__dataset-card[data-name="${id}"]`);
}

/** The chips of the collection row. */
function chips(page: Page): Locator {
  return dialog(page).locator('.gm-hud__collection');
}

/** The line in the dialog's header. */
function headerCount(page: Page): Locator {
  return dialog(page).locator('.gm-hud__dialog-count');
}

// The scenario "The search box narrows the grid".
test('the search box narrows the grid', async ({ page }) => {
  await openDatasets(page, {
    entries: [
      { id: 'ruins', label: 'Guardian Ruins', collection: 'Canonn', systems: 2 },
      { id: 'structures', label: 'Guardian Structures', collection: 'Canonn' },
      { id: 'notable', label: 'Notable Systems', collection: 'Canonn' },
    ],
    dataset: 'ruins',
  });

  await field(page).click();
  await expect(cards(page)).toHaveCount(3);
  await expect(headerCount(page)).toHaveText('3 DATASETS');

  await dialog(page).locator('.gm-hud__dialog-filter').fill('notable');
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page).first()).toContainText('Notable Systems');
  await expect(headerCount(page)).toHaveText('1 OF 3');

  await dialog(page).locator('.gm-hud__dialog-filter').fill('nothing here');
  await expect(cards(page)).toHaveCount(0);
  await expect(dialog(page).locator('.gm-hud__dataset-empty')).toBeVisible();
});

// The scenario "The search box reads the label alone".
test('the search box reads the label alone', async ({ page }) => {
  await openDatasets(page, {
    entries: [
      {
        id: 'ruins',
        label: 'Guardian Ruins',
        collection: 'Canonn Research Group',
        systems: 2,
      },
      {
        id: 'structures',
        label: 'Guardian Structures',
        collection: 'Canonn Research Group',
      },
      { id: 'notable', label: 'Notable Systems', collection: 'Canonn Research Group' },
    ],
    dataset: 'ruins',
  });

  await field(page).click();
  await dialog(page).locator('.gm-hud__dialog-filter').fill('canonn');
  await expect(cards(page)).toHaveCount(0);
  await expect(dialog(page).locator('.gm-hud__dataset-empty')).toBeVisible();
  await expect(dialog(page).locator('.gm-hud__dataset-empty')).toHaveText(
    'NO DATASET NAME MATCHES THAT FILTER',
  );
});

// The scenario "A chip keeps one collection".
test('a chip keeps one collection', async ({ page }) => {
  await openDatasets(page, {
    entries: [
      { id: 'one', label: 'One', collection: 'Canonn', systems: 2 },
      { id: 'two', label: 'Two', collection: 'Canonn' },
      { id: 'three', label: 'Three', collection: 'Canonn' },
      { id: 'four', label: 'Four', collection: 'Thargoid War' },
      { id: 'five', label: 'Five', collection: 'Thargoid War' },
    ],
    dataset: 'one',
  });

  await field(page).click();
  const labels = await chips(page).evaluateAll((nodes) =>
    nodes.map((node) => (node.textContent ?? '').trim()),
  );
  console.log('the chips of the dialog', labels);
  expect(labels).toEqual(['ALL5', 'CANONN3', 'THARGOID WAR2']);

  await chips(page).filter({ hasText: 'THARGOID WAR' }).click();
  await expect(cards(page)).toHaveCount(2);
  await expect(headerCount(page)).toHaveText('2 OF 5');

  // A second click on the chip that is already picked keeps every entry again.
  await chips(page).filter({ hasText: 'THARGOID WAR' }).click();
  await expect(cards(page)).toHaveCount(5);
  await expect(headerCount(page)).toHaveText('5 DATASETS');
});

// The scenario "One collection draws no chip row".
test('one collection draws no chip row', async ({ page }) => {
  await openDatasets(page, {
    entries: [
      { id: 'one', label: 'One', collection: 'Canonn', systems: 2 },
      { id: 'two', label: 'Two', collection: 'Canonn' },
      { id: 'three', label: 'Three', collection: 'Canonn' },
      { id: 'four', label: 'Four', collection: 'Canonn' },
    ],
    dataset: 'one',
  });

  await field(page).click();
  await expect(dialog(page).locator('.gm-hud__collections')).toBeHidden();

  // A catalog that names no collection at all draws no chip row either.
  await openDatasets(page, {
    entries: [
      { id: 'one', label: 'One', systems: 2 },
      { id: 'two', label: 'Two' },
      { id: 'three', label: 'Three' },
      { id: 'four', label: 'Four' },
    ],
    dataset: 'one',
  });

  await field(page).click();
  await expect(dialog(page).locator('.gm-hud__collections')).toBeHidden();
});

// The scenario "The chips are sorted by name".
test('the chips are sorted by name', async ({ page }) => {
  await openDatasets(page, {
    entries: [
      { id: 'one', label: 'One', collection: 'Zeta', systems: 2 },
      { id: 'two', label: 'Two', collection: 'Alpha' },
      { id: 'three', label: 'Three', collection: 'Mu' },
    ],
    dataset: 'one',
  });

  await field(page).click();
  const names = await dialog(page)
    .locator('.gm-hud__collection-name')
    .evaluateAll((nodes) => nodes.map((node) => node.textContent ?? ''));
  console.log('the chip names in the order the row draws them', names);

  expect(names).toEqual(['ALL', 'ALPHA', 'MU', 'ZETA']);
});

// The scenario "One collection takes one colour".
test('one collection takes one colour', async ({ page }) => {
  await openDatasets(page, {
    entries: [
      { id: 'one', label: 'One', collection: 'Canonn', systems: 2 },
      { id: 'two', label: 'Two', collection: 'Canonn' },
      { id: 'three', label: 'Three', collection: 'Thargoid War' },
    ],
    dataset: 'one',
  });

  await field(page).click();
  const reading = await page.evaluate(() => {
    const colourOf = (element: Element | null): string =>
      element === null ? '' : getComputedStyle(element).backgroundColor;
    const chipOf = (name: string): string =>
      colourOf(
        document.querySelector(
          `#dataset-wrap .gm-hud__collection[data-name="${name}"] .gm-hud__collection-swatch`,
        ),
      );
    const cardOf = (id: string): string =>
      colourOf(
        document.querySelector(
          `#dataset-wrap .gm-hud__dataset-card[data-name="${id}"] .gm-hud__card-swatch`,
        ),
      );
    return {
      canonnChip: chipOf('Canonn'),
      warChip: chipOf('Thargoid War'),
      one: cardOf('one'),
      two: cardOf('two'),
      three: cardOf('three'),
    };
  });
  console.log('the swatch colours', reading);

  expect(reading.one).toBe(reading.canonnChip);
  expect(reading.two).toBe(reading.canonnChip);
  expect(reading.three).toBe(reading.warChip);
  expect(reading.canonnChip).not.toBe(reading.warChip);
});

// The scenarios "The grid holds a catalog of 256" and "The dialog's rows go when it
// closes".
test('the grid holds a catalog of 256, and its cards go when the dialog closes', async ({
  page,
}) => {
  const entries: EntryBuild[] = [];
  for (let index = 0; index < 256; index += 1) {
    entries.push({
      id: `set-${index}`,
      label: `Set ${index}`,
      collection: `Collection ${index % 3}`,
      ...(index === 0 ? { systems: 2 } : {}),
    });
  }
  await openDatasets(page, { entries, dataset: 'set-0' });

  const closed = await hud(page).locator('*').count();
  await field(page).click();

  await expect(cards(page)).toHaveCount(256);
  await expect(chips(page)).toHaveCount(4);
  await expect(headerCount(page)).toHaveText('256 DATASETS');
  const open = await hud(page).locator('*').count();

  await page.keyboard.press('Escape');
  await expect(dialog(page)).toBeHidden();
  const again = await hud(page).locator('*').count();
  console.log('the HUD nodes closed', closed, 'open', open, 'closed again', again);

  // The bound is 256 cards of at most 5 elements each.
  expect(open - closed).toBeLessThanOrEqual(1280);
  expect(Math.abs(again - closed)).toBeLessThanOrEqual(20);
});

// The scenarios "A card click loads the dataset", "The loaded card closes the dialog and
// loads nothing" and "A card names its fields in its title".
test('a card click loads the dataset and the loaded card loads nothing', async ({
  page,
}) => {
  await openDatasets(page, {
    entries: [
      { id: 'one', label: 'One', collection: 'Canonn', systems: 2, categories: 1 },
      {
        id: 'two',
        label: 'Two',
        collection: 'Canonn',
        region: 'Second Region',
        description: 'The second.',
        systemCount: 5,
        systems: 5,
        categories: 2,
      },
    ],
    dataset: 'one',
  });

  await field(page).click();
  const second = cards(page).filter({ hasText: 'Two' });
  // The card carries the fields the detail pane showed, in its `title`.
  const title = await second.getAttribute('title');
  console.log('the title of the second card', title);
  expect(title).toContain('Second Region');
  expect(title).toContain('The second.');
  expect(title).toContain('5 SYSTEMS');

  await second.click();
  await expect(dialog(page)).toBeHidden();
  await expect(field(page)).toContainText('Two');
  const after = await reading(page);
  console.log('the map after the card click', after);
  expect(after).toMatchObject({ systems: 5, categories: 2, loaded: 'two' });

  // A click on the card of the loaded entry closes the dialog and loads nothing.
  await field(page).click();
  await expect(cards(page).filter({ hasText: 'Two' })).toHaveAttribute(
    'aria-current',
    'true',
  );
  await cards(page).filter({ hasText: 'Two' }).click();
  await expect(dialog(page)).toBeHidden();
  const loads = await page.evaluate(() => window.__datasetLoads ?? []);
  console.log('the loads the page counted', loads);
  expect(loads).toEqual(['one', 'two']);
  expect((await reading(page)).loaded).toBe('two');
});

// The scenario "Closing the dialog loads nothing".
test('closing the dialog loads nothing', async ({ page }) => {
  await openDatasets(page, {
    entries: [
      { id: 'one', label: 'One', systems: 2 },
      { id: 'two', label: 'Two', systems: 3 },
    ],
    dataset: 'one',
  });

  await field(page).click();
  await dialog(page).locator('.gm-hud__dialog-close').click();
  await expect(dialog(page)).toBeHidden();
  expect((await reading(page)).loaded).toBe('one');
});

// The scenarios "A loading card holds the dialog open" and "The field shows a spinner
// while a load runs".
test('a loading card holds the dialog open and the field shows the spinner', async ({
  page,
}) => {
  await openDatasets(page, {
    entries: [
      { id: 'one', label: 'One', systems: 2 },
      { id: 'slow', label: 'Slow', systems: 4, delay: 700 },
    ],
    dataset: 'one',
  });

  await field(page).click();
  const slow = cardOf(page, 'slow');
  await slow.click();

  // The dialog stays open with the spinner on the card the user clicked, and the field
  // shows the same spinner in place of its chevron.
  await expect(dialog(page)).toBeVisible();
  await expect(slow.locator('.gm-hud__spinner')).toBeVisible();
  await expect(slow).toHaveAttribute('data-loading', 'true');
  await expect(hud(page).locator('.gm-hud__dataset .gm-hud__spinner')).toBeVisible();
  await expect(hud(page).locator('.gm-hud__dataset-caret')).toBeHidden();

  await expect(dialog(page)).toBeHidden({ timeout: 10000 });
  await expect(hud(page).locator('.gm-hud__dataset-caret')).toBeVisible();
  await expect(hud(page).locator('.gm-hud__dataset .gm-hud__spinner')).toBeHidden();
  expect((await reading(page)).loaded).toBe('slow');
});

// The scenario "A second click starts no second load".
test('a second click starts no second load', async ({ page }) => {
  await openDatasets(page, {
    entries: [
      { id: 'one', label: 'One', systems: 2 },
      { id: 'slow', label: 'Slow', systems: 4, delay: 1500 },
      { id: 'other', label: 'Other', systems: 6 },
    ],
    dataset: 'one',
  });

  await field(page).click();
  await cardOf(page, 'slow').click();
  // The dialog stays open, so the second click lands on a card while the load runs.
  await expect(dialog(page)).toBeVisible();
  await cardOf(page, 'other').click();

  await expect(dialog(page)).toBeHidden({ timeout: 10000 });
  const loads = await page.evaluate(() => window.__datasetLoads ?? []);
  const after = await reading(page);
  console.log('the loads', loads, 'the map', after);

  expect(loads).toEqual(['one', 'slow']);
  expect(after).toMatchObject({ systems: 4, loaded: 'slow' });
});

// Escape and a click outside close the dialog while a load runs, and the load continues.
test('Escape closes the dialog during a load and the load continues', async ({
  page,
}) => {
  await openDatasets(page, {
    entries: [
      { id: 'one', label: 'One', systems: 2 },
      { id: 'slow', label: 'Slow', systems: 4, delay: 700 },
    ],
    dataset: 'one',
  });

  await field(page).click();
  await cardOf(page, 'slow').click();
  await expect(dialog(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toBeHidden();
  // The field carries the load after the dialog closes.
  await expect(field(page)).toHaveAttribute('data-loading', 'true');

  await expect(field(page)).toHaveAttribute('data-loading', 'false', {
    timeout: 10000,
  });
  const after = await reading(page);
  console.log('the map after the dialog closed during the load', after);
  expect(after).toMatchObject({ systems: 4, loaded: 'slow' });
});

// The scenario "A step arrow takes the focus back after the load".
test('a step arrow takes the keyboard focus back when the load ends', async ({
  page,
}) => {
  await openDatasets(page, {
    entries: [
      { id: 'one', label: 'One', systems: 2 },
      { id: 'slow', label: 'Slow', systems: 4, delay: 700 },
      { id: 'three', label: 'Three', systems: 3 },
    ],
    dataset: 'one',
    arrows: true,
  });

  const next = hud(page).locator('.gm-hud__dataset-step[data-name="next"]');
  await next.focus();
  await page.keyboard.press('Enter');

  // The load disables both arrows, so the pressed one drops the focus to the body.
  await expect(next).toBeDisabled();
  expect(await page.evaluate(() => document.activeElement?.tagName ?? '')).not.toBe(
    'BUTTON',
  );

  await expect(field(page)).toHaveAttribute('data-loading', 'false', {
    timeout: 10000,
  });
  await expect(next).toBeEnabled();
  // The arrow enables again, and it takes the focus back, so a second press needs no
  // new tab of the keyboard.
  expect(
    await page.evaluate(
      () => document.activeElement?.getAttribute('data-name') ?? null,
    ),
  ).toBe('next');
  expect(await reading(page)).toMatchObject({ loaded: 'slow' });
});

// The scenario "A dialog opened again during a load stays open".
test('a dialog opened again during a load stays open when the load settles', async ({
  page,
}) => {
  await openDatasets(page, {
    entries: [
      { id: 'one', label: 'One', systems: 2 },
      { id: 'slow', label: 'Slow', systems: 4, delay: 700 },
    ],
    dataset: 'one',
  });

  await field(page).click();
  await cardOf(page, 'slow').click();
  // The first open goes while the load runs, and a second open follows it.
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toBeHidden();
  await field(page).click();
  await expect(dialog(page)).toBeVisible();

  // The load of the first open settles here. It closed the dialog it was started from,
  // and it leaves the second one where the user put it.
  await expect(field(page)).toHaveAttribute('data-loading', 'false', {
    timeout: 10000,
  });
  await expect(dialog(page)).toBeVisible();
  expect(await reading(page)).toMatchObject({ loaded: 'slow' });
});

// The scenario "The counter reads a dash before the first load".
test('the counter reads a dash before the first load', async ({ page }) => {
  // The first entry settles after 1500 ms and the page does not wait for it, so the
  // test reads the counter while the first load runs. The spec names 300 ms; the longer
  // wait leaves room for the HUD's own dynamic import on a cold browser.
  await openDatasets(page, {
    entries: [
      { id: 'one', label: 'One', systems: 2, delay: 1500 },
      { id: 'two', label: 'Two', systems: 3 },
      { id: 'three', label: 'Three', systems: 4 },
    ],
    dataset: 'one',
    arrows: true,
    noWait: true,
  });

  const counter = hud(page).locator('.gm-hud__dataset-counter');
  await expect(counter).toHaveText('- / 3');
  await expect(counter).toHaveText('1 / 3', { timeout: 10000 });
});

// The scenario "A rejected start load leaves both arrows disabled".
test('a rejected start load leaves both arrows disabled', async ({ page }) => {
  // The map always starts a load, so this is the only way to reach a bar whose map holds
  // no entry of the catalog. Neither step names a target, so neither button enables. The
  // user loads an entry from the dialog, which the field beside the arrows opens.
  await openDatasets(page, {
    entries: [
      { id: 'bad', label: 'Bad', fail: true },
      { id: 'good', label: 'Good', systems: 3 },
    ],
    dataset: 'bad',
    arrows: true,
  });

  const previous = hud(page).locator('.gm-hud__dataset-step[data-name="previous"]');
  const next = hud(page).locator('.gm-hud__dataset-step[data-name="next"]');
  const counter = hud(page).locator('.gm-hud__dataset-counter');
  console.log('the arrows after the failed start load', {
    previous: await previous.isDisabled(),
    next: await next.isDisabled(),
    counter: await counter.textContent(),
  });

  await expect(previous).toBeDisabled();
  await expect(next).toBeDisabled();
  await expect(counter).toHaveText('- / 2');
});

test('the open field carries the accent border', async ({ page }) => {
  await openDatasets(page, {
    entries: [
      { id: 'one', label: 'One', systems: 2 },
      { id: 'two', label: 'Two', systems: 3 },
    ],
    dataset: 'one',
  });

  const read = async (): Promise<{ expanded: string | null; border: string }> =>
    field(page).evaluate((element: HTMLElement) => ({
      expanded: element.getAttribute('aria-expanded'),
      border: getComputedStyle(element).borderTopColor,
    }));

  const closed = await read();
  await field(page).click();
  await expect(dialog(page)).toBeVisible();
  const open = await read();
  await dialog(page).locator('.gm-hud__dialog-close').click();
  await expect(dialog(page)).toBeHidden();
  const again = await read();
  console.log('the dataset field border', { closed, open, again });

  expect(closed.expanded).toBe('false');
  expect(open.expanded).toBe('true');
  expect(again.expanded).toBe('false');
  // `#ff9a3c` is the accent the mockup draws on the open field.
  expect(open.border).toBe('rgb(255, 154, 60)');
  expect(closed.border).not.toBe(open.border);
  expect(again.border).toBe(closed.border);
});

// The scenarios "The dataset dialog holds and returns the focus" and "Tab reaches every
// control of the dataset library".
test('the dialog holds the focus and gives it back to the field', async ({ page }) => {
  await openDatasets(page, {
    entries: [
      { id: 'one', label: 'One', collection: 'Canonn', systems: 2 },
      { id: 'two', label: 'Two', collection: 'Thargoid War', systems: 3 },
    ],
    dataset: 'one',
  });

  await field(page).focus();
  await page.keyboard.press('Enter');
  await expect(dialog(page)).toBeVisible();

  const inside = async (): Promise<boolean> =>
    page.evaluate(() => {
      const frame = document.querySelector('#dataset-wrap .gm-hud__dialog-frame');
      return frame !== null && frame.contains(document.activeElement);
    });
  expect(await inside()).toBe(true);

  // Tab through every control of the dialog and once more. The focus stays inside, and
  // the search box, each chip, each card and the close button are each reached once.
  // The focus starts on the search box, so one pass of `controls` presses reaches every
  // other control once and comes back to the search box.
  const controls = await dialog(page).locator('button, input').count();
  const seen: string[] = [];
  for (let step = 0; step < controls; step += 1) {
    await page.keyboard.press('Tab');
    expect(await inside()).toBe(true);
    seen.push(
      await page.evaluate(() => {
        const active = document.activeElement;
        return active instanceof HTMLElement ? active.className : '';
      }),
    );
  }
  console.log('the focus ring of the dialog', seen);
  // Three chips, two cards, the close button and the search box.
  expect(seen.filter((name) => name.includes('gm-hud__collection'))).toHaveLength(3);
  expect(seen.filter((name) => name.includes('gm-hud__dataset-card'))).toHaveLength(2);
  expect(seen.filter((name) => name.includes('gm-hud__dialog-close'))).toHaveLength(1);
  expect(seen.filter((name) => name.includes('gm-hud__dialog-filter'))).toHaveLength(1);

  await page.keyboard.press('Escape');
  await expect(dialog(page)).toBeHidden();
  const back = await page.evaluate(
    () => document.activeElement?.className.includes('gm-hud__dataset') === true,
  );
  console.log('the focus is back on the field', back);
  expect(back).toBe(true);
});

test('Escape closes the dialog first and the selection second', async ({ page }) => {
  await openDatasets(page, {
    entries: [
      { id: 'one', label: 'One', systems: 4 },
      { id: 'two', label: 'Two', systems: 3 },
    ],
    dataset: 'one',
  });

  await page.evaluate(() => {
    window.__datasetMap?.setSelection('one-1');
  });
  await field(page).click();
  await expect(dialog(page)).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(dialog(page)).toBeHidden();
  expect((await reading(page)).selection).toBe('one-1');

  await page.keyboard.press('Escape');
  expect((await reading(page)).selection).toBeNull();
});

// The scenario "The dialog fetches nothing".
test('the dialog calls no load to fill itself', async ({ page }) => {
  await openDatasets(page, {
    entries: [
      { id: 'one', label: 'One', collection: 'Canonn', systems: 2 },
      { id: 'two', label: 'Two', collection: 'Canonn', systems: 3 },
      { id: 'three', label: 'Three', systems: 4 },
    ],
    dataset: 'one',
  });

  await field(page).click();
  await dialog(page).locator('.gm-hud__dialog-filter').fill('t');
  await dialog(page).locator('.gm-hud__dialog-filter').fill('');
  await chips(page).filter({ hasText: 'CANONN' }).click();
  await expect(cards(page)).toHaveCount(2);

  // The entry with no collection sits under the OTHER chip.
  const names = await dialog(page)
    .locator('.gm-hud__collection-name')
    .evaluateAll((nodes) => nodes.map((node) => node.textContent ?? ''));
  expect(names).toEqual(['ALL', 'CANONN', 'OTHER']);

  const loads = await page.evaluate(() => window.__datasetLoads ?? []);
  console.log('the loads after opening, searching and picking a chip', loads);
  expect(loads).toEqual(['one']);
});

test('the Thargoid war set restricts the bounds and frames itself', async ({
  page,
}) => {
  // The entry names `bounds: { mode: 'auto' }` and `view: { fit: 'systems' }`, so the
  // first three conditions of the rule that holds the camera hold for it. It frames all
  // the same, because the page opens 60,000 light years out and the far zoom limit of
  // this entry's bounds is 3,816. The camera is outside the bounds, so condition 4 fails.
  // That margin is why the demo page is unaffected by the rule.
  await openMap(page, '', { demoData: true });
  const atStart = await page.evaluate(
    () => (window.galaxyMap?.getBounds() ?? {}) as Record<string, unknown>,
  );

  const war = await page.evaluate(async () => {
    await window.galaxyMap?.loadDataset('thargoid-war');
    const view = window.galaxyMap?.getView();
    return {
      bounds: (window.galaxyMap?.getBounds() ?? {}) as Record<string, unknown>,
      distance: view?.distance ?? -1,
      systems: window.galaxyMap?.systemCount() ?? -1,
    };
  });

  const away = await page.evaluate(async () => {
    await window.galaxyMap?.loadDataset('guardian-ruins');
    return (window.galaxyMap?.getBounds() ?? {}) as Record<string, unknown>;
  });
  console.log('the bounds of the demo sets', { atStart, war, away });

  expect(atStart).toEqual({ mode: 'unrestricted' });
  expect(war.bounds).toEqual({ mode: 'auto' });
  expect(war.systems).toBeGreaterThan(0);
  // `fit` frames the set, so the camera stands off less than the far limit of the model.
  expect(war.distance).toBeGreaterThan(0);
  expect(war.distance).toBeLessThan(120000);
  expect(away).toEqual({ mode: 'unrestricted' });
});

test('the demo page carries the seven sets', async ({ page }) => {
  await openMap(page, '', { demoData: true });

  const catalog = await page.evaluate(() => ({
    ids: window.galaxyMap?.getDatasets().map((entry) => entry.id) ?? [],
    collections: window.galaxyMap?.getDatasets().map((entry) => entry.collection) ?? [],
    loaded: window.galaxyMap?.getLoadedDataset()?.id ?? null,
  }));
  console.log('the demo catalog', catalog);
  expect(catalog.ids).toEqual([
    'guardian-ruins',
    'guardian-structures',
    'notable-systems',
    'uia',
    'adamastor',
    'multifaction',
    'thargoid-war',
  ]);
  expect(catalog.collections).toEqual([
    'Canonn Research Group',
    'Canonn Research Group',
    'Canonn Research Group',
    'Canonn Research Group',
    'Canonn Research Group',
    'Canonn Research Group',
    'DCoH Overwatch archive',
  ]);
  expect(catalog.loaded).toBe('guardian-ruins');

  const readings: {
    systems: number;
    categories: number;
    spheres: number;
    lines: number;
  }[] = [];
  for (const id of COMMITTED_IDS) {
    readings.push(
      await page.evaluate(async (name) => {
        await window.galaxyMap?.loadDataset(name);
        return {
          systems: window.galaxyMap?.systemCount() ?? -1,
          categories: window.galaxyMap?.categoryCount() ?? -1,
          spheres: window.galaxyMap?.sphereCount() ?? -1,
          lines: window.galaxyMap?.lineCount() ?? -1,
        };
      }, id),
    );
  }
  console.log('the six committed sets read', readings);
  expect(readings).toEqual([
    { systems: 212, categories: 3, spheres: 0, lines: 0 },
    { systems: 163, categories: 10, spheres: 0, lines: 0 },
    { systems: 16, categories: 4, spheres: 0, lines: 0 },
    { systems: 1116, categories: 19, spheres: 54, lines: 983 },
    { systems: 8, categories: 10, spheres: 0, lines: 8 },
    { systems: 189, categories: 4, spheres: 0, lines: 0 },
  ]);
});

test('every shape of the two shape sets names a category', async ({ page }) => {
  await openMap(page, '', { demoData: true });

  const reading = await page.evaluate(async () => {
    const map = window.galaxyMap;
    if (map === undefined) throw new Error('The page has no map.');
    await map.loadDataset('uia');
    const named: string[] = [];
    const unnamed: string[] = [];
    let gammaVelorum: string | null = null;
    for (let index = 0; index < map.sphereCount(); index += 1) {
      const info = map.getShapeInfo('sphere', index);
      if (info === null) continue;
      const first = info.categories[0];
      if (info.name === 'Gamma Velorum') gammaVelorum = first ?? null;
      if (first === undefined) unnamed.push(info.name ?? '');
      else named.push(first);
    }
    let lines = 0;
    let linesWithoutCategory = 0;
    let linesWithColour = 0;
    const lineNames: string[] = [];
    for (let index = 0; index < map.lineCount(); index += 1) {
      const info = map.getShapeInfo('line', index);
      if (info === null) continue;
      lines += 1;
      if (info.categories.length === 0) linesWithoutCategory += 1;
      if (map.getLine(index)?.color !== undefined) linesWithColour += 1;
      if (lineNames.length < 3) lineNames.push(info.name ?? '');
    }
    return {
      spheres: map.sphereCount(),
      named: named.length,
      unnamed,
      gammaVelorum,
      categories: [...new Set(named)].sort(),
      lines,
      linesWithoutCategory,
      linesWithColour,
      lineNames,
    };
  });
  console.log('the shapes of the UIA set', reading);

  // 53 of the 54 spheres carry the marker category of their list. The Gamma Velorum
  // sphere carries the category the converter adds for its list, because the source
  // pushes no marker at its centre and so gives that list no marker category.
  expect(reading.spheres).toBe(54);
  expect(reading.named).toBe(54);
  expect(reading.unnamed).toEqual([]);
  expect(reading.categories).toEqual([
    'Gamma Velorum Zone',
    'Permit Locked Centers',
    'Permit Unlocked Centers',
    'Thargoid Systems',
  ]);
  // The category list is a set, so it says that one sphere names the added category and
  // not which one. This reading names the sphere the scenario names.
  expect(reading.gammaVelorum).toBe('Gamma Velorum Zone');
  // Every line names a category and takes that category's colour, so it carries none of
  // its own.
  expect(reading.lines).toBe(983);
  expect(reading.linesWithoutCategory).toBe(0);
  expect(reading.linesWithColour).toBe(0);
  // A line names itself and not its category: the waypoint lines name their table and the
  // hyperdiction lines name their two ends.
  for (const name of reading.lineNames) {
    expect(name).not.toBe('All Hyperdictions');
    expect(name.length).toBeGreaterThan(0);
  }
});

test('a switch away from a shape set clears the shapes', async ({ page }) => {
  await openMap(page, '', { demoData: true });

  const readings = await page.evaluate(async () => {
    await window.galaxyMap?.loadDataset('uia');
    const withShapes = window.galaxyMap?.sphereCount() ?? -1;
    await window.galaxyMap?.loadDataset('guardian-ruins');
    return { withShapes, after: window.galaxyMap?.sphereCount() ?? -1 };
  });
  console.log('the sphere count over the switch', readings);
  expect(readings.withShapes).toBe(54);
  expect(readings.after).toBe(0);
});

test('a second load leaves only its own shapes', async ({ page }) => {
  await openMap(page, '', { demoData: true });

  // The second load starts before the first settles, so the first loses its ticket and
  // rejects as cancelled. Its listener never runs, so its spheres never reach the map.
  const reading = await page.evaluate(async () => {
    const map = window.galaxyMap;
    if (map === undefined) throw new Error('The page has no map.');
    const first = map.loadDataset('uia').then(
      () => 'kept',
      () => 'cancelled',
    );
    await map.loadDataset('adamastor');
    return {
      first: await first,
      spheres: map.sphereCount(),
      lines: map.lineCount(),
      loaded: map.getLoadedDataset()?.id ?? null,
    };
  });
  console.log('the shapes after the second load', reading);
  expect(reading.first).toBe('cancelled');
  expect(reading.loaded).toBe('adamastor');
  expect(reading.spheres).toBe(0);
  expect(reading.lines).toBe(8);
});

test('the Adamastor lines connect the markers', async ({ page }) => {
  await openMap(page, '', { demoData: true });

  const reading = await page.evaluate(async () => {
    const map = window.galaxyMap;
    if (map === undefined) throw new Error('The page has no map.');
    await map.loadDataset('adamastor');
    const positions = new Map<string, [number, number, number]>();
    for (let index = 0; index < map.systemCount(); index += 1) {
      const system = map.getSystem(index);
      if (system !== null)
        positions.set(system.position.join(','), [...system.position]);
    }
    // The first point of any line that is the position of a system of the set.
    let end: [number, number, number] | null = null;
    for (let index = 0; index < map.lineCount() && end === null; index += 1) {
      const line = map.getLine(index);
      if (line === null) continue;
      for (const point of line.points) {
        if (positions.has(point.join(','))) {
          end = [...point];
          break;
        }
      }
    }
    const first = map.getLine(0);
    if (end === null) {
      return { lines: map.lineCount(), firstPoints: first?.points.length ?? 0, end };
    }
    // Put the camera on that point, so the marker draws where the line ends.
    map.setView({ cursor: [...end], distance: 400 });
    map.debug.drawNow();
    const at = map.debug.project(end);
    const picked = map.systemAt(Math.round(at.x), Math.round(at.y));
    const marker = picked === null ? null : map.debug.project([...picked.position]);
    return {
      lines: map.lineCount(),
      firstPoints: first?.points.length ?? 0,
      end,
      at,
      picked: picked === null ? null : picked.name,
      marker,
    };
  });
  console.log('the line over the markers', reading);
  // Every line of the file reached the map, so no line was rejected.
  expect(reading.lines).toBe(8);
  expect(reading.firstPoints).toBeGreaterThan(1);
  expect(reading.end).not.toBeNull();
  // The pick at the pixel of the line end reads a marker, so the two are at one place.
  expect(reading.picked).not.toBeNull();
  const at = reading.at as { x: number; y: number };
  const marker = reading.marker as { x: number; y: number };
  expect(Math.abs(marker.x - at.x)).toBeLessThanOrEqual(2);
  expect(Math.abs(marker.y - at.y)).toBeLessThanOrEqual(2);
});

test('the sixth entry fetches nothing at start', async ({ page, baseURL }) => {
  const blocked: string[] = [];
  const origin = new URL(baseURL as string).origin;
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.startsWith(origin) || url.startsWith('data:') || url.startsWith('blob:')) {
      await route.continue();
      return;
    }
    blocked.push(url);
    await route.abort();
  });

  await openMap(page, '', { demoData: true });
  const catalog = await page.evaluate(
    () => window.galaxyMap?.getDatasets().map((entry) => entry.id) ?? [],
  );
  const entry = await page.evaluate(
    () =>
      window.galaxyMap?.getDatasets().find((held) => held.id === 'multifaction') ??
      null,
  );
  console.log('the catalog and the blocked requests', catalog, blocked);

  expect(catalog).toContain('multifaction');
  expect(entry?.label).toBe('Canonn Factions');
  // The entry reads its records when the user loads it, so it carries no count.
  expect(entry?.systemCount).toBeUndefined();
  expect(blocked).toEqual([]);
});

test('the multifaction set loads from a fixture', async ({ page }) => {
  await serveFactionsDump(page, DUMP_FIXTURE);
  await openMap(page, '', { demoData: true });

  const reading = await page.evaluate(async () => {
    const map = window.galaxyMap;
    if (map === undefined) throw new Error('The page has no map.');
    await map.loadDataset('multifaction');
    let shared = null;
    for (let index = 0; index < map.systemCount(); index += 1) {
      const held = map.getSystem(index);
      if (held?.name === 'Shared System') shared = held;
    }
    return {
      systems: map.systemCount(),
      categories: map.categoryCount(),
      spheres: map.sphereCount(),
      lines: map.lineCount(),
      loaded: map.getLoadedDataset()?.id ?? null,
      shared: shared === null ? null : { categories: [...shared.categories] },
      sphere: map.getShapeInfo('sphere', 0),
    };
  });
  console.log('the multifaction set', reading);

  // The fixture holds 4 systems between the two factions, the set carries 6 categories
  // and the 48 spheres come from the committed file.
  expect(reading.systems).toBe(4);
  expect(reading.categories).toBe(6);
  expect(reading.spheres).toBe(48);
  expect(reading.lines).toBe(0);
  expect(reading.loaded).toBe('multifaction');
  // The first faction of the entry's order gives the shared system its first category.
  expect(reading.shared?.categories).toEqual([
    'Canonn Controlled',
    'Canonn Deep Space Research Present',
  ]);
  // A sphere names its permit category and carries no colour of its own.
  expect(reading.sphere?.categories).toEqual(['Permit Locked Sector']);
});

test('a failed fetch leaves the map as it was', async ({ page }) => {
  await page.route(FACTIONS_DUMP_URL, async (route) => {
    await route.fulfill({ status: 500, body: 'no' });
  });
  await openMap(page, '', { demoData: true });

  const reading = await page.evaluate(async () => {
    const map = window.galaxyMap;
    if (map === undefined) throw new Error('The page has no map.');
    await map.loadDataset('guardian-ruins');
    const before = { systems: map.systemCount(), loaded: map.getLoadedDataset()?.id };
    let rejected = false;
    try {
      await map.loadDataset('multifaction');
    } catch {
      rejected = true;
    }
    const frames = await new Promise<number>((resolve) => {
      let count = 0;
      const step = (): void => {
        count += 1;
        if (count >= 10) {
          resolve(count);
          return;
        }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    return {
      rejected,
      before,
      after: { systems: map.systemCount(), loaded: map.getLoadedDataset()?.id },
      spheres: map.sphereCount(),
      frames,
    };
  });
  console.log('the map after the failed fetch', reading);

  expect(reading.rejected).toBe(true);
  expect(reading.after).toEqual(reading.before);
  expect(reading.after.loaded).toBe('guardian-ruins');
  expect(reading.spheres).toBe(0);
  // The frame loop kept running, so the failure left the page drawing.
  expect(reading.frames).toBe(10);
});

test('a dump that names neither faction rejects', async ({ page }) => {
  await serveFactionsDump(page, DUMP_WITHOUT_CANONN);
  await openMap(page, '', { demoData: true });

  const reading = await page.evaluate(async () => {
    const map = window.galaxyMap;
    if (map === undefined) throw new Error('The page has no map.');
    const before = { systems: map.systemCount(), loaded: map.getLoadedDataset()?.id };
    let message = '';
    try {
      await map.loadDataset('multifaction');
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    return {
      message,
      before,
      after: { systems: map.systemCount(), loaded: map.getLoadedDataset()?.id },
    };
  });
  console.log('the map after the dump that names neither faction', reading);

  expect(reading.message.length).toBeGreaterThan(0);
  expect(reading.after).toEqual(reading.before);
});

test('a browser with no DecompressionStream rejects the load', async ({ page }) => {
  await serveFactionsDump(page, DUMP_FIXTURE);
  await openMap(page, '', { demoData: true });

  // The map opens first, and the global goes for the load alone. The galaxy model is a
  // PNG that `src/galaxy-model/png.ts` opens with the same call, so a page that starts
  // without the global builds no model and never reports itself ready.
  const reading = await page.evaluate(async () => {
    const map = window.galaxyMap;
    if (map === undefined) throw new Error('The page has no map.');
    const before = map.systemCount();
    const held = window.DecompressionStream;
    let message = '';
    try {
      // The entry reads a gzip file, so a browser that cannot open one cannot load it.
      Reflect.deleteProperty(window, 'DecompressionStream');
      await map.loadDataset('multifaction');
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    } finally {
      window.DecompressionStream = held;
    }
    return { message, before, after: map.systemCount() };
  });
  console.log('the map with no DecompressionStream', reading);

  expect(reading.message).toContain('DecompressionStream');
  expect(reading.after).toBe(reading.before);
});

test('the card reads FETCHED ON LOAD for the entry that fetches', async ({ page }) => {
  await openMap(page, '', { demoData: true, hud: true });

  const demoHud = page.locator('.gm-hud');
  const demoDialog = demoHud.locator('.gm-hud__dialog');
  await demoHud.locator('.gm-hud__dataset').click();
  const demoCards = demoDialog.locator('.gm-hud__dataset-card');

  // The card carries the region, the description and the count in its `title`. The entry
  // that fetches carries no count, because it reads its records when the user loads it.
  const fetched = await demoCards
    .filter({ hasText: 'Canonn Factions' })
    .getAttribute('title');
  const counted = await demoCards
    .filter({ hasText: 'Adamastor Routes' })
    .getAttribute('title');
  console.log('the two card titles', { fetched, counted });

  expect(fetched).toContain('FETCHED ON LOAD');
  expect(counted).toContain('8 SYSTEMS');

  await page.keyboard.press('Escape');
  await expect(demoDialog).toBeHidden();
});

// The scenario "The Gamma Velorum category holds a shape and no system". The converter
// adds the category for the one `g_soi` sphere, and the source pushes no marker for that
// list, so the category holds one shape and no record. The test reads the rows of the
// panel, because the scenario is about which tab lists the category.
test('the Gamma Velorum category holds a shape and no system', async ({ page }) => {
  await openMap(page, '', { demoData: true, hud: true });
  await page.evaluate(async () => {
    await window.galaxyMap?.loadDataset('uia');
  });

  const demoHud = page.locator('.gm-hud');
  const name = 'Gamma Velorum Zone';
  const row = demoHud.locator(`.gm-hud__category-row[data-name="${name}"]`);
  await expect(demoHud.locator('.gm-hud__tab[data-name="shapes"]')).toBeEnabled();
  await expect(row).toBeHidden();

  await demoHud.locator('.gm-hud__tab[data-name="shapes"]').click();
  await expect(row).toBeVisible();
  const count = await row.locator('.gm-hud__category-count').textContent();
  console.log('the Gamma Velorum row of the shapes tab reads', count);

  expect(count).toBe('1');
});

// The bounds and the view a catalog entry names. `farZoomLimit` is `radius / sin(30)`,
// which is twice the radius, because the field of view is 60 degrees.
test.describe('an entry frames its set', () => {
  /** The box the `fit` scenarios use, and the distance `fit` works out from it. */
  const BOX: [[number, number, number], [number, number, number]] = [
    [-100, -50, -100],
    [100, 50, 100],
  ];
  const FIT_DISTANCE = Math.hypot(200, 100, 200);

  test("an entry's bounds take effect on its load", async ({ page }) => {
    await openDatasets(page, {
      entries: [
        { id: 'near', systems: 4, bounds: { mode: 'auto' } },
        { id: 'far', systems: 4 },
      ],
      dataset: 'near',
      bounds: { mode: 'unrestricted' },
    });

    const first = await readBounds(page);
    expect((await loadDataset(page, 'far')).ok).toBe(true);
    const second = await readBounds(page);
    console.log("the entry's bounds", { first, second });

    expect(first).toEqual({ mode: 'auto' });
    expect(second).toEqual({ mode: 'unrestricted' });
  });

  test('a dataset load writes the bounds and getBounds reads it', async ({ page }) => {
    await openDatasets(page, {
      entries: [{ id: 'plain', systems: 4 }],
      dataset: 'plain',
      bounds: { mode: 'unrestricted' },
    });

    await page.evaluate(() => {
      window.__datasetMap?.setBounds({
        mode: 'sphere',
        centre: [0, 0, 0],
        radiusLy: 500,
      });
    });
    const host = await readBounds(page);
    expect((await loadDataset(page, 'plain')).ok).toBe(true);
    const after = await readBounds(page);
    console.log("the host's own bounds", { host, after });

    expect(host).toMatchObject({ mode: 'sphere' });
    // The next load restores the option, and not the sphere the host set.
    expect(after).toEqual({ mode: 'unrestricted' });
  });

  test('the bounds reach a listener', async ({ page }) => {
    await openDatasets(page, {
      entries: [
        { id: 'plain', systems: 4 },
        { id: 'held', systems: 4, bounds: { mode: 'auto' } },
      ],
      dataset: 'plain',
      bounds: { mode: 'unrestricted' },
    });

    const heard = await page.evaluate(async () => {
      const map = window.__datasetMap;
      const seen: unknown[] = [];
      const stop = map?.onDatasetChange(() => {
        seen.push(map.getBounds());
      });
      await map?.loadDataset('held');
      stop?.();
      return seen;
    });
    console.log('the bounds a listener read', heard);

    expect(heard).toContainEqual({ mode: 'auto' });
  });

  test('a restricted set holds the camera', async ({ page }) => {
    await openDatasets(page, {
      entries: [
        {
          id: 'small',
          bounds: { mode: 'auto' },
          corners: [
            [-200, -200, -200],
            [200, 200, 200],
          ],
        },
      ],
      dataset: 'small',
      bounds: { mode: 'unrestricted' },
    });

    await page.evaluate(() => {
      window.__datasetMap?.setView({
        cursor: [30000, 0, 0],
        distance: 100000,
        yaw: 0,
        pitch: 35,
      });
      window.__datasetMap?.debug.drawNow();
    });
    const view = await readView(page);
    console.log('the clamped view', view);

    // The box is 200 light years on each side of the centre, grown by the 1,000 light
    // year margin an `auto` bound takes.
    for (const axis of [0, 1, 2]) {
      expect(Math.abs(view.cursor[axis] as number)).toBeLessThanOrEqual(1200);
    }
    // The far zoom limit of that box, which is twice half its diagonal. The margin of
    // one part in a million holds the last bit of the double the clamp writes.
    expect(view.distance).toBeLessThanOrEqual(Math.hypot(2400, 2400, 2400) + 1e-6);
  });

  test('`fit` frames the set', async ({ page }) => {
    await openDatasets(page, {
      entries: [{ id: 'framed', corners: BOX, view: { fit: 'systems' } }],
      dataset: 'framed',
    });

    const view = await readView(page);
    console.log('the fitted view', view);

    for (const axis of [0, 1, 2]) {
      expect(Math.abs(view.cursor[axis] as number)).toBeLessThan(1e-6);
    }
    expect(Math.abs(view.distance - FIT_DISTANCE)).toBeLessThan(1e-6);
  });

  test('`fit` ends a running flight', async ({ page }) => {
    // A flight writes the view every frame. The entry takes the camera, so the flight
    // ends at the load. Without that, the flight takes the view back on the next frame
    // and the camera goes to the old target instead of the box. The test below reads the
    // wheel glide, which is the second writer.
    await openDatasets(page, {
      entries: [
        { id: 'first', systems: 4 },
        { id: 'framed', corners: BOX, view: { fit: 'systems' } },
      ],
      dataset: 'first',
    });

    const outcome = await page.evaluate(async () => {
      const map = window.__datasetMap;
      if (map === undefined) return 'none';
      const flight = map.flyTo({ cursor: [20000, 0, 0], distance: 60000 });
      await map.loadDataset('framed');
      return flight;
    });
    // The load settles in a task of its own, so the frames after it run here.
    await page.waitForTimeout(400);
    const view = await readView(page);
    console.log('the view after a load over a flight', { outcome, view });

    expect(outcome).toBe('interrupted');
    for (const axis of [0, 1, 2]) {
      expect(Math.abs(view.cursor[axis] as number)).toBeLessThan(1e-6);
    }
    expect(Math.abs(view.distance - FIT_DISTANCE)).toBeLessThan(1e-6);
  });

  test('`system` opens on that record, after the pending start would have gone', async ({
    page,
  }) => {
    // The `system` field of an entry is resolved at the load, because the load wrote
    // the set a step before. The start view holds its own name over the frames a host
    // may take to add the record, and it drops it after 600 of them. An entry that
    // rode that hold would move nowhere on a page that has drawn longer.
    await openDatasets(page, {
      entries: [
        { id: 'first', systems: 4 },
        { id: 'named', corners: BOX, view: { system: 'named-corner-0' } },
      ],
      dataset: 'first',
    });

    // 700 drawn frames, which is past the 600 the pending start holds for.
    await page.evaluate(() => {
      for (let count = 0; count < 700; count += 1) {
        window.__datasetMap?.debug.drawNow();
      }
    });

    expect((await loadDataset(page, 'named')).ok).toBe(true);
    const view = await readView(page);
    console.log('the view of an entry naming a system', view);

    expect(view.cursor).toEqual([-100, -50, -100]);
  });

  test('`fit` ends the wheel glide', async ({ page }) => {
    await openDatasets(page, {
      entries: [
        { id: 'first', systems: 4 },
        { id: 'framed', corners: BOX, view: { fit: 'systems' } },
      ],
      dataset: 'first',
    });

    const before = await page.evaluate(() => {
      document
        .querySelector('#dataset-wrap canvas')
        ?.dispatchEvent(
          new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true }),
        );
      return window.__datasetMap?.debug.zoomTargetLy() ?? null;
    });
    expect(before).not.toBeNull();

    expect((await loadDataset(page, 'framed')).ok).toBe(true);
    const after = await page.evaluate(
      () => window.__datasetMap?.debug.zoomTargetLy() ?? null,
    );
    // The glide steps the distance every frame, so a target left over would drag the
    // camera off the box the entry asked to be framed.
    await page.waitForTimeout(400);
    const view = await readView(page);
    console.log('the view after a load over a glide', { before, after, view });

    expect(after).toBeNull();
    expect(Math.abs(view.distance - FIT_DISTANCE)).toBeLessThan(1e-6);
  });

  test('a named field wins over `fit`', async ({ page }) => {
    await openDatasets(page, {
      entries: [{ id: 'framed', corners: BOX, view: { fit: 'systems', pitch: 60 } }],
      dataset: 'framed',
    });

    const view = await readView(page);
    console.log('the fitted view with a pitch', view);

    expect(Math.abs(view.distance - FIT_DISTANCE)).toBeLessThan(1e-6);
    expect(view.pitch).toBe(60);
  });

  test('a deep link beats the entry at start', async ({ page }) => {
    await openDatasets(page, {
      entries: [{ id: 'framed', corners: BOX, view: { fit: 'systems' } }],
      dataset: 'framed',
      startView: { cursor: [500, 0, 500], distance: 1000, yaw: 0, pitch: 35 },
    });

    const atStart = await readView(page);
    expect((await loadDataset(page, 'framed')).ok).toBe(true);
    const afterLoad = await readView(page);
    console.log('the deep link', { atStart, afterLoad });

    expect(atStart.cursor[0]).toBeCloseTo(500, 3);
    expect(atStart.cursor[2]).toBeCloseTo(500, 3);
    for (const axis of [0, 1, 2]) {
      expect(Math.abs(afterLoad.cursor[axis] as number)).toBeLessThan(1e-6);
    }
  });

  test('an entry with no view leaves the camera', async ({ page }) => {
    await openDatasets(page, {
      entries: [
        { id: 'first', systems: 4 },
        { id: 'second', systems: 4 },
      ],
      dataset: 'first',
    });

    await page.evaluate(() => {
      window.__datasetMap?.setView({
        cursor: [120, 30, 60],
        distance: 4000,
        yaw: 25,
        pitch: 40,
      });
    });
    const before = await readView(page);
    expect((await loadDataset(page, 'second')).ok).toBe(true);
    const after = await readView(page);
    console.log('the view over a load with no view', { before, after });

    expect(after).toEqual(before);
  });
});

// The rule that holds the camera where the entry's bounds already show the new set. Each
// test reads the five conditions of `dataset-catalog` through the public handle.
test.describe('a load holds a camera that shows the new set', () => {
  /** The box the entries of one region span, and the distance `fit` writes for it. */
  const BOX: [[number, number, number], [number, number, number]] = [
    [-100, -50, -100],
    [100, 50, 100],
  ];
  const FIT_DISTANCE = Math.hypot(200, 100, 200);
  /** The `auto` bound of that box, which grows it by 1,000 light years on each axis. */
  const AUTO_LIMIT = Math.hypot(2200, 2100, 2200);

  /** Two entries of one region, each naming the same `auto` bound and a `fit` view. */
  const REGION: EntryBuild[] = [
    {
      id: 'week-one',
      corners: BOX,
      bounds: { mode: 'auto' },
      view: { fit: 'systems' },
    },
    {
      id: 'week-two',
      corners: BOX,
      bounds: { mode: 'auto' },
      view: { fit: 'systems' },
    },
  ];

  /** Writes the view the test wants the camera to hold before the next load. */
  async function setView(
    page: Page,
    next: {
      cursor: [number, number, number];
      distance: number;
      yaw: number;
      pitch: number;
    },
  ): Promise<void> {
    await page.evaluate((view) => {
      window.__datasetMap?.setView(view);
    }, next);
  }

  test('a step inside the bounds holds the camera', async ({ page }) => {
    await openDatasets(page, { entries: REGION, dataset: 'week-one' });
    await setView(page, {
      cursor: [120, 30, 60],
      distance: 800,
      yaw: 25,
      pitch: 40,
    });

    const before = await readView(page);
    expect((await loadDataset(page, 'week-two')).ok).toBe(true);
    const after = await readView(page);
    console.log('the view over a step inside the bounds', { before, after });

    // The camera is inside the new bounds and stands off more than the frame would, so
    // the entry's view does not apply at all.
    expect(before.distance).toBeGreaterThan(FIT_DISTANCE);
    expect(before.distance).toBeLessThan(AUTO_LIMIT);
    expect(after).toEqual(before);
  });

  test('a camera outside the new bounds is framed', async ({ page }) => {
    await openDatasets(page, {
      entries: [
        {
          id: 'wide',
          corners: [
            [-20000, 0, -20000],
            [20000, 0, 20000],
          ],
          bounds: { mode: 'auto' },
          view: { fit: 'systems' },
        },
        REGION[1] as EntryBuild,
      ],
      dataset: 'wide',
    });
    // 50,000 light years is inside the wide entry's far zoom limit and far outside the
    // 3,753 of the narrow one, so condition 4 fails.
    await setView(page, { cursor: [0, 0, 0], distance: 50000, yaw: 25, pitch: 40 });

    expect((await loadDataset(page, 'week-two')).ok).toBe(true);
    const after = await readView(page);
    console.log('the view over a load from outside the bounds', after);

    expect(Math.abs(after.distance - FIT_DISTANCE)).toBeLessThan(1e-6);
  });

  test('a camera zoomed in closer than the frame is framed again', async ({ page }) => {
    await openDatasets(page, {
      entries: [
        {
          id: 'tiny',
          corners: [
            [-10, -10, -10],
            [10, 10, 10],
          ],
          bounds: { mode: 'auto' },
          view: { fit: 'systems' },
        },
        REGION[1] as EntryBuild,
      ],
      dataset: 'tiny',
    });

    const before = await readView(page);
    expect((await loadDataset(page, 'week-two')).ok).toBe(true);
    const after = await readView(page);
    console.log('the view over a load from inside the frame', { before, after });

    // The frame of the small set leaves the camera nearer than the frame of the wide
    // one, which is condition 5.
    expect(before.distance).toBeLessThan(FIT_DISTANCE);
    expect(Math.abs(after.distance - FIT_DISTANCE)).toBeLessThan(1e-6);
  });

  test('a camera zoomed out past the frame keeps its view', async ({ page }) => {
    await openDatasets(page, {
      entries: [
        {
          id: 'tiny',
          corners: [
            [-10, -10, -10],
            [10, 10, 10],
          ],
          bounds: { mode: 'auto' },
          view: { fit: 'systems' },
        },
        REGION[1] as EntryBuild,
      ],
      dataset: 'tiny',
    });
    await setView(page, { cursor: [0, 0, 0], distance: 1500, yaw: 25, pitch: 40 });

    const before = await readView(page);
    expect((await loadDataset(page, 'week-two')).ok).toBe(true);
    const after = await readView(page);
    console.log('the view over a load from outside the frame', { before, after });

    expect(before.distance).toBeGreaterThan(FIT_DISTANCE);
    expect(before.distance).toBeLessThan(AUTO_LIMIT);
    expect(after).toEqual(before);
  });

  test('an entry with no bounds still frames its systems', async ({ page }) => {
    await openDatasets(page, {
      entries: [
        REGION[0] as EntryBuild,
        { id: 'free', corners: BOX, view: { fit: 'systems' } },
      ],
      dataset: 'week-one',
    });
    // The camera stands inside the box and past its frame, so an entry that named the
    // same `auto` bound would hold it.
    await setView(page, { cursor: [0, 0, 0], distance: 800, yaw: 25, pitch: 40 });

    expect((await loadDataset(page, 'free')).ok).toBe(true);
    const after = await readView(page);
    console.log('the view over a load of an entry with no bounds', after);

    expect(Math.abs(after.distance - FIT_DISTANCE)).toBeLessThan(1e-6);
  });

  test('a named field beats a camera inside the bounds', async ({ page }) => {
    await openDatasets(page, {
      entries: [
        REGION[0] as EntryBuild,
        {
          id: 'angled',
          corners: BOX,
          bounds: { mode: 'auto' },
          view: { fit: 'systems', pitch: 60 },
        },
      ],
      dataset: 'week-one',
    });
    await setView(page, { cursor: [120, 30, 60], distance: 800, yaw: 25, pitch: 40 });

    expect((await loadDataset(page, 'angled')).ok).toBe(true);
    const after = await readView(page);
    console.log('the view over a load naming a pitch', after);

    expect(Math.abs(after.distance - FIT_DISTANCE)).toBeLessThan(1e-6);
    expect(after.pitch).toBe(60);
  });

  test('the start load frames its systems although the camera is inside its bounds', async ({
    page,
  }) => {
    // The sphere holds the default camera, which stands at the origin 60,000 light years
    // out, and its far zoom limit is 80,000. All five conditions would hold but for the
    // start load, which has no camera the user chose.
    await openDatasets(page, {
      entries: [
        {
          id: 'start',
          corners: [
            [100, 50, 100],
            [300, 150, 300],
          ],
          bounds: { mode: 'sphere', centre: [0, 0, 0], radiusLy: 40000 },
          view: { fit: 'systems' },
        },
      ],
      dataset: 'start',
    });

    const view = await readView(page);
    console.log('the view after the start load', view);

    expect(view.cursor[0]).toBeCloseTo(200, 6);
    expect(view.cursor[1]).toBeCloseTo(100, 6);
    expect(view.cursor[2]).toBeCloseTo(200, 6);
    expect(Math.abs(view.distance - FIT_DISTANCE)).toBeLessThan(1e-6);
  });

  test('an auto bound over an empty set applies the view', async ({ page }) => {
    // An `auto` bound over a set with no system resolves to unrestricted, so the view
    // applies. A `fit` over an empty set moves the camera nowhere, so the flight is the
    // reading that tells the two paths apart: an applied view ends a flight.
    await openDatasets(page, {
      entries: [
        REGION[0] as EntryBuild,
        {
          id: 'nothing',
          systems: 0,
          bounds: { mode: 'auto' },
          view: { fit: 'systems' },
        },
      ],
      dataset: 'week-one',
    });
    await setView(page, { cursor: [0, 0, 0], distance: 800, yaw: 25, pitch: 40 });

    const outcome = await page.evaluate(async () => {
      const map = window.__datasetMap;
      if (map === undefined) return 'none';
      const flight = map.flyTo({ cursor: [500, 0, 500], distance: 1000 });
      await map.loadDataset('nothing');
      return flight;
    });
    console.log('the flight over a load of an empty set', outcome);

    expect(outcome).toBe('interrupted');
  });

  test('a held view lets a running flight land', async ({ page }) => {
    await openDatasets(page, { entries: REGION, dataset: 'week-one' });
    await setView(page, { cursor: [0, 0, 0], distance: 1500, yaw: 25, pitch: 40 });

    const outcome = await page.evaluate(async () => {
      const map = window.__datasetMap;
      if (map === undefined) return 'none';
      const flight = map.flyTo({ cursor: [500, 0, 500], distance: 1000 });
      await map.loadDataset('week-two');
      return flight;
    });
    const after = await readView(page);
    console.log('the flight over a held load', { outcome, after });

    // A held view takes the camera from nobody, so it ends no flight.
    expect(outcome).toBe('landed');
    expect(after.cursor[0]).toBeCloseTo(500, 3);
    expect(after.cursor[2]).toBeCloseTo(500, 3);
  });

  test('a held load lets a pending start view land', async ({ page }) => {
    // A `startView` naming a record the start set does not hold waits for that record.
    // An applied view drops the wait, and a held view leaves it, so the start view still
    // centres the camera in the first frame a set holds the record.
    const sphere = { mode: 'sphere', centre: [0, 0, 0], radiusLy: 40000 };
    await openDatasets(page, {
      entries: [
        { id: 'first', corners: BOX, bounds: sphere, view: { fit: 'systems' } },
        {
          id: 'later',
          corners: [
            [1000, 0, 1000],
            [1200, 100, 1200],
          ],
          bounds: sphere,
          view: { fit: 'systems' },
        },
      ],
      dataset: 'first',
      startView: { system: 'later-corner-0' },
    });

    const before = await readView(page);
    expect((await loadDataset(page, 'later')).ok).toBe(true);
    await page.waitForTimeout(400);
    const after = await readView(page);
    console.log('the view over a held load with a pending start', { before, after });

    // The deep link held the entry's view at start, so the camera stands where the map
    // opens: at the origin, 60,000 light years out.
    expect(before.distance).toBeCloseTo(60000, 3);
    expect(after.cursor[0]).toBeCloseTo(1000, 6);
    expect(after.cursor[1]).toBeCloseTo(0, 6);
    expect(after.cursor[2]).toBeCloseTo(1000, 6);
    // The camera kept the distance the user was given, because the view was held.
    expect(after.distance).toBeCloseTo(60000, 3);
  });
});
