import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { FULL_SET, openMap } from './helpers';
import type { SystemRecordInput } from '../packages/galaxy-map/src/scene-data/real-systems';
import type {
  LineInput,
  SphereInput,
} from '../packages/galaxy-map/src/scene-data/shapes';

test.use({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });

/** The colour every category in this file takes. */
const CORE: [number, number, number] = [153, 230, 255];

/** What the test asks the page to build the HUD with. */
interface HudBuild {
  /** What `regions` the map is built with. A non-boolean reads the default. */
  readonly regions?: unknown;
  /** The title in the top bar. */
  readonly title?: string;
  /**
   * What the `details` loader answers with. The footer buttons come from the loader, so
   * a test that wants one asks for it here. `one` gives one button that counts its
   * calls, `throwing` gives one whose `onSelect` throws, `pending` never settles and
   * `rejecting` fails.
   */
  readonly actions?: 'one' | 'throwing' | 'pending' | 'rejecting';
  /**
   * True makes the `details` loader answer with one `markdown` value, so the panel draws
   * a host section under the description.
   */
  readonly section?: boolean;
  /**
   * True gives the map a catalog of one entry, so the top bar carries the dataset field
   * and a click on it opens the dataset library dialog. `e2e/datasets.spec.ts` reads the
   * catalog itself; here the dialog is only an element to measure.
   */
  readonly datasets?: boolean;
  /**
   * How many entries that catalog holds. With more than one the map loads the second,
   * so both step arrows have a neighbour to load. The default is one.
   */
  readonly datasetCount?: number;
  /** What `datasetArrows` the HUD is built with. A non-boolean reads the default. */
  readonly datasetArrows?: unknown;
  /**
   * How many collections those entries spread over. With none the entries take the two
   * names `First` and `Second`, which is what every test but the chip row reads.
   */
  readonly datasetCollections?: number;
  /**
   * True adds one sphere after the map builds, so the **Shapes** switch is shown and the
   * **SHAPES** tab is not disabled. The panel drops the switch on a map that holds no
   * shape.
   */
  readonly shape?: boolean;
  /**
   * True adds one category and one record that names two icons, so the **System icons**
   * switch is shown. The panel drops the switch on a map where no record names one.
   */
  readonly iconRecord?: boolean;
  /**
   * True builds the map with the nebula source the demo page holds, so the options
   * panel carries the sixth switch. The default gives no source, which is the state a
   * host that never asks for the nebulae is in.
   */
  readonly nebulae?: boolean;
  /** What `lockedOptions` the HUD is built with. A non-array reads the default. */
  readonly lockedOptions?: unknown;
  /** What `systemNames` the map is built with. A non-boolean reads the default. */
  readonly systemNames?: unknown;
  /** What `systemIcons` the map is built with. A non-boolean reads the default. */
  readonly systemIcons?: unknown;
  /** What `grid` the map is built with. */
  readonly grid?: boolean;
}

/**
 * Opens the demo page, then builds a second map with the HUD on, over a canvas of its
 * own that covers the window. The second map is the one every HUD test drives.
 */
async function openHud(page: Page, build: HudBuild = {}): Promise<void> {
  await openMap(page);
  await page.evaluate(async (options: HudBuild) => {
    const factory = window.galaxyMapFactory;
    if (factory === undefined) throw new Error('The page has no map factory.');
    // The demo page builds a HUD of its own. It comes down first, so the tests below
    // drive one HUD and read one tab ring.
    window.galaxyMap?.dispose();
    const wrap = document.createElement('div');
    wrap.id = 'hud-wrap';
    wrap.style.cssText = 'position: absolute; inset: 0;';
    const canvas = document.createElement('canvas');
    canvas.style.cssText =
      'display: block; width: 100%; height: 100%; touch-action: none;';
    wrap.appendChild(canvas);
    document.body.appendChild(wrap);

    window.__hudActionCalls = [];
    const answer: Record<string, unknown> = {};
    if (options.actions !== undefined) {
      answer['actions'] = [
        {
          label: 'TOOL NAME 1',
          onSelect: (system: { name: string }): void => {
            window.__hudActionCalls?.push(system.name);
            if (options.actions === 'throwing') {
              throw new Error('The host action failed.');
            }
          },
        },
      ];
    }
    if (options.section === true) {
      answer['values'] = [{ label: 'HISTORY', markdown: 'A line of history.' }];
    }
    const details =
      options.actions === undefined && options.section !== true
        ? undefined
        : options.actions === 'pending'
          ? (): Promise<never> => new Promise<never>(() => undefined)
          : options.actions === 'rejecting'
            ? (): Promise<never> =>
                Promise.reject(new Error('The details loader failed.'))
            : (): unknown => answer;
    const hudOptions: Record<string, unknown> = {};
    if (options.title !== undefined) hudOptions['title'] = options.title;
    if (details !== undefined) hudOptions['details'] = details;
    if ('lockedOptions' in options) {
      hudOptions['lockedOptions'] = options.lockedOptions;
    }
    if ('datasetArrows' in options) {
      hudOptions['datasetArrows'] = options.datasetArrows;
    }
    const hud = Object.keys(hudOptions).length === 0 ? true : hudOptions;
    const count = options.datasetCount ?? 1;
    const datasets =
      options.datasets === true
        ? Array.from({ length: count }, (_unused: unknown, index: number) => ({
            id: `set-${String(index)}`,
            label: `Set ${String(index)}`,
            collection:
              options.datasetCollections === undefined
                ? index % 2 === 0
                  ? 'First'
                  : 'Second'
                : `Collection ${String(index % options.datasetCollections)}`,
            load: (): unknown => ({ categories: [], systems: [] }),
          }))
        : undefined;
    const source = options.nebulae === true ? window.galaxyMapNebulae : undefined;
    const map = factory(canvas, {
      hud,
      regions: options.regions,
      ...('systemNames' in options ? { systemNames: options.systemNames } : {}),
      ...('systemIcons' in options ? { systemIcons: options.systemIcons } : {}),
      ...(options.grid === undefined ? {} : { grid: options.grid }),
      ...(datasets === undefined ? {} : { datasets }),
      // The map loads the middle entry, so the previous arrow and the next arrow each
      // have a neighbour to load.
      ...(datasets === undefined || count < 2
        ? {}
        : { dataset: `set-${String(Math.floor(count / 2))}` }),
      ...(source === undefined ? {} : { nebulae: source }),
    } as never);
    window.__hudMap = map;
    await map.ready;
    // The two readings the map options panel follows. A map with no shape shows no
    // **Shapes** switch, and a map where no record names an icon shows no **System
    // icons** switch, so a test that reads one asks for it here.
    if (options.shape === true) {
      map.addSpheres([
        { name: 'One sphere', position: [0, 0, 0], radius: 50, color: [255, 154, 60] },
      ] as never);
    }
    if (options.iconRecord === true) {
      map.addCategories([
        { name: 'Icons', color: [153, 230, 255], maxDrawRange: 200000 },
      ] as never);
      map.addSystems([
        {
          name: 'An icon record',
          coords: { x: 0, y: 0, z: 400 },
          categories: ['Icons'],
          icons: ['titan', 'mission'],
        },
      ] as never);
    }
  }, build);
  // The panel reads the two on its tick, which runs 10 times a second.
  if (build.shape === true || build.iconRecord === true) {
    await page.waitForTimeout(200);
  }
}

/** The root of the HUD the tests drive. */
function hud(page: Page): Locator {
  return page.locator('#hud-wrap .gm-hud');
}

/** The background alpha of each named element of the HUD, by selector. */
async function readAlphas(
  page: Page,
  selectors: readonly string[],
): Promise<Record<string, number>> {
  return page.evaluate((names) => {
    const out: Record<string, number> = {};
    for (const name of names) {
      const element = document.querySelector(`#hud-wrap .gm-hud ${name}`);
      if (element === null) {
        out[name] = -1;
        continue;
      }
      const parts = getComputedStyle(element)
        .backgroundColor.replace(/[^\d,.]/g, '')
        .split(',')
        .map(Number);
      // An opaque colour reads `rgb(r, g, b)` and carries no alpha.
      out[name] = parts[3] ?? 1;
    }
    return out;
  }, selectors);
}

/** Adds categories to the HUD's map. */
async function addCategories(page: Page, names: readonly string[]): Promise<void> {
  await page.evaluate(
    (value) => {
      window.__hudMap?.addCategories(
        value.names.map((name) => ({
          name,
          color: value.color,
          maxDrawRange: 200000,
          description: `About ${name}`,
        })),
      );
    },
    { names, color: CORE },
  );
}

/**
 * Adds records to the HUD's map. The cast is at the call, because a test also passes a
 * record the input type refuses and the reader rejects at run time.
 */
async function addSystems(page: Page, records: readonly unknown[]): Promise<number> {
  return page.evaluate(
    (list) =>
      window.__hudMap?.addSystems(list as readonly SystemRecordInput[]).added ?? -1,
    records,
  );
}

/** A record the reader accepts. */
function record(
  name: string,
  position: readonly [number, number, number],
  category: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    name,
    coords: { x: position[0], y: position[1], z: position[2] },
    categories: [category],
    ...extra,
  };
}

/** A record that names no category, which an uncategorised set holds. */
function plain(
  name: string,
  position: readonly [number, number, number],
): Record<string, unknown> {
  return { name, coords: { x: position[0], y: position[1], z: position[2] } };
}

/** The rows of the flat list, in the order the list holds them. */
async function flatRowNames(page: Page): Promise<string[]> {
  return hud(page)
    .locator('.gm-hud__flat-list .gm-hud__system-row')
    .evaluateAll((rows) =>
      rows.map((row) => (row as HTMLElement).dataset['name'] ?? ''),
    );
}

/** Adds spheres to the HUD's map and returns how many the reader kept. */
async function addSpheres(page: Page, spheres: readonly unknown[]): Promise<number> {
  return page.evaluate(
    (list) => window.__hudMap?.addSpheres(list as readonly SphereInput[]).added ?? -1,
    spheres,
  );
}

/** Adds lines to the HUD's map and returns how many the reader kept. */
async function addLines(page: Page, lines: readonly unknown[]): Promise<number> {
  return page.evaluate(
    (list) => window.__hudMap?.addLines(list as readonly LineInput[]).added ?? -1,
    lines,
  );
}

/** A line of two points, which is the cheapest shape a category can hold. */
function line(
  name: string,
  category: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    name,
    points: [
      [0, 0, 0],
      [100, 0, 0],
    ],
    categories: [category],
    ...extra,
  };
}

/** Replaces the view of the HUD's map. */
async function setView(
  page: Page,
  next: {
    cursor?: readonly [number, number, number];
    distance?: number;
    yaw?: number;
    pitch?: number;
  },
): Promise<void> {
  await page.evaluate((value) => {
    window.__hudMap?.setView(value as never);
  }, next);
}

/** Reads the view of the HUD's map. */
async function readView(page: Page): Promise<{
  cursor: [number, number, number];
  distance: number;
  yaw: number;
  pitch: number;
}> {
  return page.evaluate(() => {
    const view = window.__hudMap?.getView();
    if (view === undefined) throw new Error('The HUD map has no view.');
    return view;
  });
}

test.describe('the HUD shell', () => {
  test('the default map builds no HUD', async ({ page }) => {
    await openMap(page);
    const reading = await page.evaluate(async () => {
      const factory = window.galaxyMapFactory;
      if (factory === undefined) return null;
      const wrap = document.createElement('div');
      const canvas = document.createElement('canvas');
      canvas.style.cssText = 'width: 320px; height: 240px;';
      wrap.appendChild(canvas);
      document.body.appendChild(wrap);
      const map = factory(canvas);
      await map.ready;
      const parent = canvas.parentElement;
      const result = {
        hudIsNull: map.hud === null,
        inParent: parent?.querySelectorAll('.gm-hud').length ?? -1,
      };
      map.dispose();
      wrap.remove();
      return result;
    });

    expect(reading).not.toBeNull();
    expect(reading?.hudIsNull).toBe(true);
    expect(reading?.inParent).toBe(0);
  });

  test('the option builds the HUD in the canvas parent', async ({ page }) => {
    await openHud(page);
    const reading = await page.evaluate(() => {
      const map = window.__hudMap;
      const element = map?.hud?.element ?? null;
      const wrap = document.getElementById('hud-wrap');
      return {
        hasHud: map?.hud !== null && map?.hud !== undefined,
        inParent: element !== null && element.parentElement === wrap,
      };
    });
    expect(reading.hasHud).toBe(true);
    expect(reading.inParent).toBe(true);

    await expect(hud(page).locator('.gm-hud__top-bar')).toHaveCount(1);
    await expect(hud(page).locator('.gm-hud__category-panel')).toHaveCount(1);
    await expect(hud(page).locator('.gm-hud__options-panel')).toHaveCount(1);
    await expect(hud(page).locator('.gm-hud__info')).toHaveCount(1);
  });

  test('the style element is added once', async ({ page }) => {
    await openHud(page);
    const count = await page.evaluate(async () => {
      const factory = window.galaxyMapFactory;
      if (factory === undefined) return -1;
      const canvas = document.createElement('canvas');
      canvas.style.cssText = 'width: 320px; height: 240px;';
      document.body.appendChild(canvas);
      const second = factory(canvas, { hud: true } as never);
      await second.ready;
      const reading = document.querySelectorAll('#gm-hud-styles').length;
      second.dispose();
      canvas.remove();
      return reading;
    });
    expect(count).toBe(1);
  });

  test('the HUD makes no third-party request', async ({ page, baseURL }) => {
    const blocked: string[] = [];
    const origin = new URL(baseURL ?? 'http://127.0.0.1:4173').origin;
    await page.route('**/*', async (route) => {
      const url = route.request().url();
      if (
        url.startsWith(origin) ||
        url.startsWith('data:') ||
        url.startsWith('blob:')
      ) {
        await route.continue();
        return;
      }
      blocked.push(url);
      await route.abort();
    });

    await openHud(page);
    // The style sheet loads its faces on first paint, so the panels must be laid out
    // before the reading.
    await expect(hud(page).locator('.gm-hud__category-panel')).toBeVisible();
    const box = await hud(page).locator('.gm-hud__category-panel').boundingBox();

    console.log('the blocked requests', blocked);
    expect(blocked).toEqual([]);
    expect(box?.width).toBe(316);
  });

  test('the HUD goes on dispose', async ({ page }) => {
    await openHud(page);
    await expect(hud(page)).toHaveCount(1);
    const left = await page.evaluate(() => {
      window.__hudMap?.dispose();
      const wrap = document.getElementById('hud-wrap');
      return {
        inParent: wrap?.querySelectorAll('.gm-hud').length ?? -1,
        canvases: wrap?.querySelectorAll('canvas').length ?? -1,
        narrow:
          wrap?.querySelectorAll(
            '.gm-hud__drawer-tab, .gm-hud__scrim, .gm-hud__right, .gm-hud__right-empty',
          ).length ?? -1,
      };
    });
    expect(left.inParent).toBe(0);
    // The canvas the caller gave stays in the page.
    expect(left.canvases).toBe(1);
    // The elements of the narrow layout go with the root that holds them.
    expect(left.narrow).toBe(0);
  });
});

// The scenarios "No panel blurs its backdrop", "The panels over the map hold their
// contrast" and "The covering elements keep the alpha they had". A blurred backdrop over
// a canvas re-blurs in every frame, and Firefox does that on the CPU, so no element of
// the HUD carries the property. `browser-suite` holds the reading and the budget.
test.describe('the panel backdrop', () => {
  /** A record with one picture the page serves from its own origin. */
  const pictured = (): Record<string, unknown> =>
    record('Pictured', [0, 0, 100], 'Alpha', {
      images: [{ url: '/picture-one.png', caption: 'APPROACH VECTOR' }],
    });

  test('no element blurs its backdrop', async ({ page }) => {
    await openHud(page, { datasets: true });
    await addCategories(page, ['Alpha']);
    await addSystems(page, [pictured()]);
    await select(page, 'Pictured');
    await expect(hud(page).locator('.gm-hud__info')).toBeVisible();
    await hud(page).locator('.gm-hud__dataset').click();
    await expect(hud(page).locator('.gm-hud__dialog')).toBeVisible();

    const blurred = await hud(page).evaluateAll((roots) => {
      const found: { className: string; filter: string }[] = [];
      for (const root of roots) {
        for (const element of [root, ...root.querySelectorAll('*')]) {
          const style = getComputedStyle(element);
          // The prefixed property is read as well, because a browser that knows only
          // that one reports an empty string for the standard name.
          const filter =
            style.backdropFilter === ''
              ? style.getPropertyValue('-webkit-backdrop-filter')
              : style.backdropFilter;
          if (filter !== 'none' && filter !== '') {
            found.push({ className: (element as HTMLElement).className, filter });
          }
        }
      }
      return found;
    });
    const counted = await hud(page).evaluateAll(
      (roots) => roots[0]?.querySelectorAll('*').length ?? 0,
    );
    console.log('the blurred elements of', counted, 'read', blurred);

    // The reading says nothing if the HUD is not built, so the element count is part of
    // the assertion.
    expect(counted).toBeGreaterThan(50);
    expect(blurred).toEqual([]);
  });

  test('the panels over the map hold their contrast', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['Alpha']);
    await addSystems(page, [record('One', [0, 0, 100], 'Alpha')]);
    await select(page, 'One');
    await expect(hud(page).locator('.gm-hud__info')).toBeVisible();

    const alphas = await readAlphas(page, [
      '.gm-hud__category-panel',
      '.gm-hud__options-panel',
      '.gm-hud__info',
    ]);
    console.log('the panel alphas', alphas);

    for (const [selector, alpha] of Object.entries(alphas)) {
      expect(alpha, selector).toBeGreaterThanOrEqual(0.92);
    }
  });

  test('the covering elements keep the alpha they had', async ({ page }) => {
    await openHud(page, { datasets: true });
    await addCategories(page, ['Alpha']);
    await addSystems(page, [pictured()]);
    await select(page, 'Pictured');

    await hud(page).locator('.gm-hud__thumb').first().click();
    await expect(hud(page).locator('.gm-hud__lightbox')).toBeVisible();
    const lightbox = await readAlphas(page, ['.gm-hud__lightbox']);
    await hud(page).locator('.gm-hud__lightbox-close').click();
    await expect(hud(page).locator('.gm-hud__lightbox')).toBeHidden();

    // The dialog scrim covers the whole HUD, so it opens after the lightbox reading.
    await hud(page).locator('.gm-hud__dataset').click();
    await expect(hud(page).locator('.gm-hud__dialog')).toBeVisible();
    const dialog = await readAlphas(page, ['.gm-hud__dialog', '.gm-hud__dialog-frame']);
    console.log('the covering alphas', { ...lightbox, ...dialog });

    expect(dialog['.gm-hud__dialog']).toBeCloseTo(0.78, 2);
    expect(dialog['.gm-hud__dialog-frame']).toBeCloseTo(0.97, 2);
    expect(lightbox['.gm-hud__lightbox']).toBeCloseTo(0.88, 2);
  });
});

test.describe('the HUD and the map input', () => {
  test('a drag between the panels still orbits', async ({ page }) => {
    await openHud(page);
    const before = await readView(page);
    await page.mouse.move(800, 450);
    await page.mouse.down();
    await page.mouse.move(860, 480, { steps: 6 });
    await page.mouse.up();
    const after = await readView(page);
    console.log('the orbit readings', before, after);

    expect(after.yaw - before.yaw).toBeCloseTo(18, 3);
    expect(after.pitch - before.pitch).toBeCloseTo(9, 3);
  });

  test('a wheel over a panel does not zoom', async ({ page }) => {
    await openHud(page);
    const before = await readView(page);
    await page.mouse.move(180, 400);
    for (let notch = 0; notch < 5; notch += 1) {
      await page.mouse.wheel(0, -100);
    }
    const after = await readView(page);
    console.log('the wheel readings', before.distance, after.distance);

    expect(after.distance).toBe(before.distance);
  });

  test('a drag on a panel does not orbit', async ({ page }) => {
    await openHud(page);
    const before = await readView(page);
    // The panel is at the bottom of the left column, whose bottom follows the viewport
    // height, so the drag reads the panel's own box and does not name a point.
    const panel = await hud(page).locator('.gm-hud__options-panel').boundingBox();
    const from = {
      x: (panel?.x ?? 0) + 20,
      y: (panel?.y ?? 0) + (panel?.height ?? 0) / 2,
    };
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 100, from.y, { steps: 6 });
    await page.mouse.up();
    const after = await readView(page);

    expect(after.yaw).toBe(before.yaw);
    expect(after.pitch).toBe(before.pitch);
  });
});

/** Draws one frame of the HUD's map and reads how many markers it drew. */
async function markerCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const map = window.__hudMap;
    if (map === undefined) return -1;
    map.debug.drawNow();
    return map.debug.systemMarkerCount();
  });
}

/** The colour dot of a category row, which switches the category. */
function categoryDot(page: Page, name: string): Locator {
  return hud(page).locator(`.gm-hud__category-dot[data-name="${name}"]`);
}

/** The rest of a category row, which opens the list and folds it. */
function categoryRow(page: Page, name: string): Locator {
  return hud(page).locator(`.gm-hud__category-row[data-name="${name}"]`);
}

/** One tab of the category panel. */
function panelTab(page: Page, name: 'systems' | 'shapes'): Locator {
  return hud(page).locator(`.gm-hud__tab[data-name="${name}"]`);
}

/** The system rows of the expanded list. */
function systemRows(page: Page): Locator {
  return hud(page).locator('.gm-hud__system-row');
}

/** The system rows of one category's list. */
function rowsOf(page: Page, name: string): Locator {
  return hud(page).locator(
    `.gm-hud__category-group[data-name="${name}"] .gm-hud__system-row`,
  );
}

/** The names on the rows of one category's list, in the order the list holds them. */
async function rowNames(page: Page, name: string): Promise<string[]> {
  return rowsOf(page, name).evaluateAll((rows) =>
    rows.map((row) => (row as HTMLElement).dataset['name'] ?? ''),
  );
}

/** The names of the categories whose lists are open, in the panel's own order. */
async function openCategories(page: Page): Promise<string[]> {
  return hud(page)
    .locator('.gm-hud__category-row[aria-expanded="true"]')
    .evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLElement).dataset['name'] ?? ''),
    );
}

/** Adds `count` categories, each with `systems` systems whose names all hold `a`. */
async function addGrid(page: Page, count: number, systems: number): Promise<number> {
  return page.evaluate(
    (value) => {
      const map = window.__hudMap;
      if (map === undefined) return -1;
      const names: string[] = [];
      for (let index = 0; index < value.count; index += 1) {
        names.push(`Cat a ${String(index).padStart(3, '0')}`);
      }
      map.addCategories(
        names.map((name) => ({ name, color: value.color, maxDrawRange: 200000 })),
      );
      const records: SystemRecordInput[] = [];
      for (let group = 0; group < value.count; group += 1) {
        for (let index = 0; index < value.systems; index += 1) {
          records.push({
            name: `Star a ${String(group).padStart(3, '0')} ${String(index).padStart(4, '0')}`,
            coords: { x: group * 7, y: 0, z: index * 3 },
            categories: [names[group] as string],
          });
        }
      }
      return map.addSystems(records).added;
    },
    { count, systems, color: CORE },
  );
}

/** What the page holds the keyboard focus on. */
interface ActiveElement {
  readonly connected: boolean;
  readonly className: string;
  readonly url: string;
  readonly name: string;
  readonly identity: string;
  readonly isBody: boolean;
}

/** Reads the element the keyboard focus is on. */
async function activeElement(page: Page): Promise<ActiveElement | null> {
  return page.evaluate(() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return null;
    return {
      connected: active.isConnected,
      className: active.className,
      url: active.dataset['url'] ?? '',
      name: active.dataset['name'] ?? '',
      identity: active.dataset['identity'] ?? '',
      isBody: active === document.body,
    };
  });
}

/** Counts the rebuilds the map asks the HUD for, from this call on. */
async function countRefreshes(page: Page): Promise<void> {
  await page.evaluate(() => {
    const handle = window.__hudMap?.hud;
    if (handle === null || handle === undefined) return;
    window.__hudRefreshCalls = 0;
    const original = handle.refresh.bind(handle);
    handle.refresh = (): void => {
      window.__hudRefreshCalls = (window.__hudRefreshCalls ?? 0) + 1;
      original();
    };
  });
}

/** How many rebuilds the map asked for since the count started. */
async function refreshCount(page: Page): Promise<number> {
  return page.evaluate(() => window.__hudRefreshCalls ?? -1);
}

/** Selects a system on the HUD's map by its name. */
async function select(page: Page, name: string): Promise<void> {
  await page.evaluate((value) => {
    window.__hudMap?.setSelection(value);
  }, name);
}

test.describe('the top bar', () => {
  test('the bar reads the view', async ({ page }) => {
    await openHud(page);
    await setView(page, { cursor: [0, 0, 0], distance: 1500 });
    await page.waitForTimeout(200);

    await expect(hud(page).locator('.gm-hud__zoom-value')).toHaveText('1,500 LY');
    await expect(hud(page).locator('.gm-hud__region')).toHaveText('Inner Orion Spur');
  });

  test('the title takes the option', async ({ page }) => {
    await openHud(page, { title: 'DEEP SPACE CHART' });
    await expect(hud(page).locator('.gm-hud__title')).toHaveText('DEEP SPACE CHART');
  });

  test('reset returns the default view', async ({ page }) => {
    await openHud(page);
    await setView(page, {
      cursor: [1000, 200, 3000],
      distance: 4000,
      yaw: 90,
      pitch: 60,
    });
    await hud(page).locator('.gm-hud__reset').click();
    const view = await readView(page);
    console.log('the view after reset', view);

    expect(view.cursor).toEqual([0, 0, 0]);
    expect(view.distance).toBe(60000);
    expect(view.pitch).toBe(35);
    expect(view.yaw).toBe(0);
  });

  test('the bar does not rewrite itself every frame', async ({ page }) => {
    await openHud(page);
    await page.waitForTimeout(300);
    const writes = await page.evaluate(async () => {
      const zoom = document.querySelector('#hud-wrap .gm-hud__zoom-value');
      if (zoom === null) return -1;
      let count = 0;
      const observer = new MutationObserver((records) => {
        count += records.length;
      });
      observer.observe(zoom, {
        childList: true,
        characterData: true,
        subtree: true,
        attributes: true,
      });
      for (let frame = 0; frame < 120; frame += 1) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
      observer.disconnect();
      return count;
    });
    console.log('the zoom writes over 120 frames', writes);

    expect(writes).toBe(0);
  });

  // The scenario "The dataset field is centred on the bar".
  test('the dataset field is centred on the bar', async ({ page }) => {
    await openHud(page, { datasets: true });
    const reading = await page.evaluate(() => {
      const bar = document.querySelector('#hud-wrap .gm-hud__top-bar');
      const field = document.querySelector('#hud-wrap .gm-hud__dataset');
      if (bar === null || field === null) return null;
      const barBox = bar.getBoundingClientRect();
      const fieldBox = field.getBoundingClientRect();
      return {
        bar: barBox.left + barBox.width / 2,
        field: fieldBox.left + fieldBox.width / 2,
      };
    });
    console.log('the centre of the bar and of the field', reading);
    if (reading === null) throw new Error('The bar holds no dataset field.');

    expect(Math.abs(reading.bar - reading.field)).toBeLessThanOrEqual(2);
  });

  // The scenario "The centre group is centred while the arrows are on". The arrows and
  // the counter sit inside the centre group, so it is the group that holds the middle of
  // the bar. The counter follows the next arrow, as the mockup draws it, so the field
  // itself sits a little left of the middle.
  test('the centre group is centred while the arrows are on', async ({ page }) => {
    await openHud(page, { datasets: true, datasetCount: 3, datasetArrows: true });
    const reading = await page.evaluate(() => {
      const bar = document.querySelector('#hud-wrap .gm-hud__top-bar');
      const centre = document.querySelector('#hud-wrap .gm-hud__top-centre');
      if (bar === null || centre === null) return null;
      const barBox = bar.getBoundingClientRect();
      const centreBox = centre.getBoundingClientRect();
      return {
        bar: barBox.left + barBox.width / 2,
        centre: centreBox.left + centreBox.width / 2,
      };
    });
    console.log('the centre of the bar and of the centre group', reading);
    if (reading === null) throw new Error('The bar holds no centre group.');

    expect(Math.abs(reading.bar - reading.centre)).toBeLessThanOrEqual(2);
  });

  // The scenario "A long title does not push the field off centre".
  test('a long title does not push the field off centre', async ({ page }) => {
    await openHud(page, {
      datasets: true,
      title: 'A GALACTIC CARTOGRAPHICS CHART OF THE WHOLE OF THE GALAXY',
    });
    const reading = await page.evaluate(() => {
      const bar = document.querySelector('#hud-wrap .gm-hud__top-bar');
      const field = document.querySelector('#hud-wrap .gm-hud__dataset');
      const title = document.querySelector('#hud-wrap .gm-hud__title');
      if (bar === null || field === null || title === null) return null;
      const barBox = bar.getBoundingClientRect();
      const fieldBox = field.getBoundingClientRect();
      return {
        bar: barBox.left + barBox.width / 2,
        field: fieldBox.left + fieldBox.width / 2,
        clipped: title.scrollWidth > title.clientWidth,
      };
    });
    console.log('the centres with a long title', reading);
    if (reading === null) throw new Error('The bar holds no dataset field.');

    expect(Math.abs(reading.bar - reading.field)).toBeLessThanOrEqual(2);
    expect(reading.clipped).toBe(true);
  });

  // The field's caret is a vector now, and a turning spinner takes its place while a
  // load runs. `e2e/datasets.spec.ts` reads the spinner over a real load.
  test('the field ends in a vector chevron', async ({ page }) => {
    await openHud(page, { datasets: true });
    const caret = hud(page).locator('.gm-hud__dataset-caret');
    await expect(caret).toBeVisible();
    await expect(caret.locator('svg')).toHaveCount(1);
    await expect(hud(page).locator('.gm-hud__dataset .gm-hud__spinner')).toBeHidden();
  });

  // The scenario "The arrows are off by default" of `dataset-catalog`.
  test('the bar holds no step arrow by default', async ({ page }) => {
    await openHud(page, { datasets: true, datasetCount: 3 });

    await expect(hud(page).locator('.gm-hud__dataset')).toHaveCount(1);
    expect(await hud(page).locator('.gm-hud__dataset-step').count()).toBe(0);
    expect(await hud(page).locator('.gm-hud__dataset-counter').count()).toBe(0);
  });

  // The scenario "An unreadable option leaves the arrows off".
  test('an unreadable arrows option leaves the arrows off', async ({ page }) => {
    await openHud(page, { datasets: true, datasetCount: 3, datasetArrows: 'yes' });

    expect(await hud(page).locator('.gm-hud__dataset-step').count()).toBe(0);
  });

  // The scenario "The arrows step through the catalog".
  test('the arrows step through the catalog', async ({ page }) => {
    await openHud(page, { datasets: true, datasetCount: 3, datasetArrows: true });
    const counter = hud(page).locator('.gm-hud__dataset-counter');
    const next = hud(page).locator('.gm-hud__dataset-step[data-name="next"]');
    await expect(counter).toHaveText('2 / 3');

    await next.click();
    await expect(counter).toHaveText('3 / 3');
    await expect(hud(page).locator('.gm-hud__dataset-value')).toHaveText('Set 2');
    expect(
      await page.evaluate(() => window.__hudMap?.getLoadedDataset()?.id ?? null),
    ).toBe('set-2');
  });

  // The scenario "The arrows stop at the ends".
  test('the arrows stop at the ends of the catalog', async ({ page }) => {
    await openHud(page, { datasets: true, datasetCount: 3, datasetArrows: true });
    const previous = hud(page).locator('.gm-hud__dataset-step[data-name="previous"]');
    const next = hud(page).locator('.gm-hud__dataset-step[data-name="next"]');

    await previous.click();
    await expect(hud(page).locator('.gm-hud__dataset-counter')).toHaveText('1 / 3');
    await expect(previous).toBeDisabled();
    await expect(next).toBeEnabled();
    // Each button names the entry it loads, and the end of the catalog where there is
    // none.
    await expect(previous).toHaveAttribute('aria-label', 'First dataset');
    await expect(next).toHaveAttribute('aria-label', 'Next dataset, Set 1');

    await next.click();
    await next.click();
    await expect(hud(page).locator('.gm-hud__dataset-counter')).toHaveText('3 / 3');
    await expect(next).toBeDisabled();
    await expect(previous).toBeEnabled();
    await expect(next).toHaveAttribute('aria-label', 'Last dataset');
  });
});

test.describe('the category browser', () => {
  // The scenario "The two tabs share one border".
  test('the two tabs share one border', async ({ page }) => {
    await openHud(page);
    const boxes = await hud(page)
      .locator('.gm-hud__tab')
      .evaluateAll((nodes) =>
        nodes.map((node) => {
          const box = node.getBoundingClientRect();
          return { left: box.left, right: box.right };
        }),
      );
    console.log('the boxes of the two tabs', boxes);

    expect(boxes).toHaveLength(2);
    const first = boxes[0] as { left: number; right: number };
    const second = boxes[1] as { left: number; right: number };
    expect(Math.abs(first.right - second.left)).toBeLessThanOrEqual(1);
  });

  // The scenario "The row icon turns when the list opens".
  test('the row icon turns when the list opens', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['Alpha']);
    await addSystems(page, [record('One', [0, 0, 100], 'Alpha')]);
    await expect(categoryRow(page, 'Alpha')).toBeVisible();

    const turn = async (): Promise<string> =>
      hud(page)
        .locator('.gm-hud__category-chevron')
        .first()
        .evaluate((element: HTMLElement) => getComputedStyle(element).transform);

    const folded = await turn();
    await categoryRow(page, 'Alpha').click();
    await page.waitForTimeout(200);
    const open = await turn();
    console.log('the chevron transform folded and open', { folded, open });

    // The identity reads `none` or the identity matrix, and 180 degrees reads
    // `matrix(-1, 0, 0, -1, 0, 0)`.
    expect(['none', 'matrix(1, 0, 0, 1, 0, 0)']).toContain(folded);
    expect(open).toBe('matrix(-1, 0, 0, -1, 0, 0)');
  });

  test('a row toggles its category', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['Alpha', 'Beta']);
    await addSystems(page, [
      record('One', [0, 0, 100], 'Alpha'),
      record('Two', [0, 0, 200], 'Beta'),
    ]);
    await expect(categoryRow(page, 'Alpha')).toBeVisible();

    await categoryDot(page, 'Alpha').click();
    const count = await markerCount(page);
    const visible = await page.evaluate(
      () => window.__hudMap?.isCategoryVisible('Alpha') ?? true,
    );
    console.log('the marker count after the toggle', count);

    expect(count).toBe(1);
    expect(visible).toBe(false);
  });

  test('the rest of the row opens the list', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['Alpha', 'Beta']);
    await addSystems(page, [
      record('One', [0, 0, 100], 'Alpha'),
      record('Two', [0, 0, 200], 'Beta'),
    ]);
    await expect(categoryRow(page, 'Alpha')).toBeVisible();

    // The dot switches the category and the rest of the row opens the list. Each one
    // leaves the other alone.
    await categoryRow(page, 'Alpha').click();
    const opened = await openCategories(page);
    const stillOn = await page.evaluate(
      () => window.__hudMap?.isCategoryVisible('Alpha') ?? false,
    );
    await categoryRow(page, 'Alpha').click();
    const folded = await openCategories(page);

    await categoryDot(page, 'Alpha').click();
    const afterDot = await openCategories(page);
    console.log('the open lists', { opened, stillOn, folded, afterDot });

    expect(opened).toEqual(['Alpha']);
    expect(stillOn).toBe(true);
    expect(folded).toEqual([]);
    expect(afterDot).toEqual([]);
  });

  test('the counts read the primary category', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['A', 'B']);
    await addSystems(page, [
      record('One', [0, 0, 100], 'A'),
      record('Two', [0, 0, 200], 'A', { categories: ['A', 'B'] }),
    ]);
    await expect(categoryRow(page, 'A')).toBeVisible();

    await expect(categoryRow(page, 'A').locator('.gm-hud__category-count')).toHaveText(
      '2',
    );
  });

  // The row's switch brings a system back through any category it belongs to, so the
  // count says how many systems that row holds and not how many name it first.
  test('the counts read the secondary categories as well', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['A', 'B']);
    await addSystems(page, [
      record('One', [0, 0, 100], 'A'),
      record('Two', [0, 0, 200], 'A', { categories: ['A', 'B'] }),
    ]);
    await expect(categoryRow(page, 'B')).toBeVisible();

    await expect(categoryRow(page, 'B').locator('.gm-hud__category-count')).toHaveText(
      '1',
    );
  });

  // The demo set holds 166 systems with more than one ruin layout, so the three counts
  // add up to 414 over 212 systems.
  test('the counts hold with the demo set', async ({ page }) => {
    await openMap(page, '', { hud: true, demoData: true });
    const rows = page.locator('.gm-hud__category-row');
    await expect(rows).toHaveCount(3);

    const counts = await rows.evaluateAll((elements) =>
      elements.map((element) =>
        Number(
          (
            element.querySelector('.gm-hud__category-count')?.textContent ?? '0'
          ).replace(/,/g, ''),
        ),
      ),
    );
    const systems = await page.evaluate(() => window.galaxyMap?.systemCount() ?? -1);
    const total = counts.reduce((sum, count) => sum + count, 0);
    console.log('the demo set counts', { counts, total, systems });

    expect(systems).toBe(212);
    expect(total).toBeGreaterThan(systems);
  });

  test('the row shows the category description as its tooltip', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['Alpha']);
    // A category with nothing in it has no row, and the test waits for the row before it
    // starts, so `Alpha` holds one system of its own before the batches run.
    await addSystems(page, [record('Sol', [0, 0, 0], 'Alpha')]);
    await expect(categoryRow(page, 'Alpha')).toHaveAttribute('title', 'About Alpha');
  });

  test('a search rewrites the counts, and a row with no match keeps its row', async ({
    page,
  }) => {
    await openHud(page);
    await addCategories(page, ['A', 'B']);
    await addSystems(page, [
      record('Sol', [0, 0, 100], 'A'),
      record('Solati', [0, 0, 200], 'A'),
      record('Achenar', [0, 0, 300], 'A'),
      record('Beta', [0, 0, 400], 'B'),
    ]);
    await expect(categoryRow(page, 'B')).toBeVisible();

    await hud(page).locator('.gm-hud__search').fill('sol');
    await page.waitForTimeout(300);
    const filtered = await categoryCounts(page);
    console.log('the counts under a filter', filtered);

    expect(filtered).toEqual(['2 of 3', '0 of 1']);
    // The row of `B` matches nothing and is still in the panel, and its dot still
    // switches the category.
    await expect(categoryRow(page, 'B')).toBeVisible();
    await categoryDot(page, 'B').click();
    expect(
      await page.evaluate(() => window.__hudMap?.isCategoryVisible('B') ?? true),
    ).toBe(false);

    await hud(page).locator('.gm-hud__search').fill('');
    await page.waitForTimeout(300);

    expect(await categoryCounts(page)).toEqual(['3', '1']);
  });

  test('an uncategorised set shows a flat list that selects and filters', async ({
    page,
  }) => {
    await openHud(page);
    await addSystems(page, [
      plain('Solati', [0, 0, 200]),
      plain('Sol', [0, 0, 100]),
      plain('Achenar', [0, 0, 300]),
    ]);
    await expect(hud(page).locator('.gm-hud__flat-list')).toBeVisible();

    expect(await categoryNames(page)).toEqual([]);
    expect(await flatRowNames(page)).toEqual(['Achenar', 'Sol', 'Solati']);
    // The list draws at the panel's own width, with no sideways scroll.
    const width = await hud(page)
      .locator('.gm-hud__flat-list')
      .evaluate((node) => ({ scroll: node.scrollWidth, client: node.clientWidth }));
    console.log('the flat list width', width);
    expect(width.scroll).toBeLessThanOrEqual(width.client);
    await expect(
      hud(page).locator('.gm-hud__bulk-button[data-name="all"]'),
    ).toBeDisabled();
    await expect(
      hud(page).locator('.gm-hud__bulk-button[data-name="none"]'),
    ).toBeDisabled();

    await hud(page).locator('.gm-hud__search').fill('sol');
    await page.waitForTimeout(300);

    expect(await flatRowNames(page)).toEqual(['Sol', 'Solati']);

    await hud(page).locator('.gm-hud__system-row[data-name="Sol"]').click();

    expect(
      await page.evaluate(() => window.__hudMap?.getSelection()?.name ?? null),
    ).toBe('Sol');
  });

  test('the shapes tab shows a flat list for uncategorised shapes', async ({
    page,
  }) => {
    await openHud(page);
    await addCategories(page, ['A']);
    await addSystems(page, [record('Sol', [0, 0, 100], 'A')]);
    await addSpheres(page, [
      { name: 'Alpha Zone', position: [0, 0, 0], radius: 100, color: [1, 2, 3] },
      { name: 'Beta Zone', position: [0, 0, 400], radius: 100, color: [1, 2, 3] },
    ]);
    await expect(panelTab(page, 'shapes')).toBeEnabled();
    await panelTab(page, 'shapes').click();
    await expect(hud(page).locator('.gm-hud__flat-list')).toBeVisible();

    expect(await categoryNames(page)).toEqual([]);
    expect(await flatRowNames(page)).toEqual(['Alpha Zone', 'Beta Zone']);
  });

  test('one categorised thing removes the flat list', async ({ page }) => {
    await openHud(page);
    await addSystems(page, [plain('Sol', [0, 0, 100])]);
    await expect(hud(page).locator('.gm-hud__flat-list')).toBeVisible();

    // The set is cleared first, because a set that holds an uncategorised system takes
    // no category, which `real-systems` states.
    await page.evaluate(() => window.__hudMap?.clearSystems());
    await addCategories(page, ['A']);
    await addSystems(page, [record('Achenar', [0, 0, 200], 'A')]);
    await expect(categoryRow(page, 'A')).toBeVisible();

    expect(await categoryNames(page)).toEqual(['A']);
    await expect(hud(page).locator('.gm-hud__flat-list')).toHaveCount(0);
  });

  test('ALL and NONE move every row', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['A', 'B', 'C']);
    await addSystems(page, [
      record('One', [0, 0, 100], 'A'),
      record('Two', [0, 0, 200], 'B'),
      record('Three', [0, 0, 300], 'C'),
    ]);
    await expect(categoryRow(page, 'A')).toBeVisible();

    await hud(page).locator('.gm-hud__bulk-button[data-name="none"]').click();
    const none = await markerCount(page);
    await hud(page).locator('.gm-hud__bulk-button[data-name="all"]').click();
    const all = await markerCount(page);
    console.log('the marker counts', { none, all });

    expect(none).toBe(0);
    expect(all).toBe(3);
  });

  // A category the table already holds is replaced, and neither count changes. The
  // panel must still follow the table, so the rebuild cannot read the counts alone.
  test('a recoloured category takes the new colour', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['Alpha']);
    await addSystems(page, [record('Sol', [0, 0, 0], 'Alpha')]);
    await expect(categoryRow(page, 'Alpha')).toBeVisible();

    const swatch = categoryDot(page, 'Alpha').locator('.gm-hud__category-swatch');
    const colour = (): Promise<string> =>
      swatch.evaluate((element) => getComputedStyle(element).backgroundColor);
    expect(await colour()).toBe('rgb(153, 230, 255)');

    await page.evaluate(() => {
      window.__hudMap?.addCategories([{ name: 'Alpha', color: [255, 80, 20] }]);
    });
    // The rebuild runs in the next frame, so the reading waits for it.
    await expect.poll(colour).toBe('rgb(255, 80, 20)');
    const counts = await page.evaluate(() => ({
      categories: window.__hudMap?.categoryCount() ?? -1,
      systems: window.__hudMap?.systemCount() ?? -1,
    }));
    console.log('the recoloured swatch counts', counts);

    expect(counts).toEqual({ categories: 1, systems: 1 });
  });

  // A record replaced under the same `id64` changes no count either. The list must show
  // the new name.
  test('a replaced record takes the new name in the list', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['Alpha']);
    await addSystems(page, [record('Old Name', [0, 0, 0], 'Alpha', { id64: '77' })]);
    await expect(categoryRow(page, 'Alpha')).toBeVisible();
    await categoryRow(page, 'Alpha').click();
    await expect(systemRows(page)).toHaveCount(1);

    await addSystems(page, [record('New Name', [0, 0, 0], 'Alpha', { id64: '77' })]);
    await expect(systemRows(page)).toHaveCount(1);
    await expect(systemRows(page).first()).toHaveAttribute('data-name', 'New Name');
  });
});

// The map rebuilds the HUD panels for a data change and for nothing else. A rebuild
// makes every row again, so it drops the focus of a keyboard user and the scroll of the
// expanded list.
test.describe('the HUD rebuild', () => {
  test('a call that adds nothing rebuilds nothing', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['Alpha']);
    await addSystems(page, [record('Sol', [0, 0, 0], 'Alpha')]);
    await expect(categoryRow(page, 'Alpha')).toBeVisible();
    await countRefreshes(page);

    await categoryRow(page, 'Alpha').focus();
    await page.evaluate(() => {
      window.__hudMap?.addSystems([]);
      window.__hudMap?.addCategories([]);
    });
    // Four frames at 60 Hz, which is longer than the frame the rebuild would run in.
    await page.waitForTimeout(70);
    const calls = await refreshCount(page);
    const focused = await activeElement(page);
    console.log('the rebuilds for a call that adds nothing', { calls, focused });

    expect(calls).toBe(0);
    expect(focused?.name).toBe('Alpha');
  });

  // A rebuild replaces every control. A user who works the HUD with the keyboard must
  // stay on the control under the focus, and not fall to the page body.
  test('a rebuild keeps the focus on the thumbnail', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['Alpha']);
    await addSystems(page, [
      record('Pictured', [0, 0, 100], 'Alpha', {
        images: [{ url: '/picture-one.png', caption: 'APPROACH VECTOR' }],
      }),
    ]);
    await select(page, 'Pictured');
    await hud(page).locator('.gm-hud__thumb').first().focus();
    await countRefreshes(page);

    await addSystems(page, [record('Second', [0, 0, 200], 'Alpha')]);
    await expect.poll(() => refreshCount(page)).toBe(1);
    const focused = await activeElement(page);
    console.log('the focus after a rebuild', focused);

    expect(focused?.isBody).toBe(false);
    expect(focused?.connected).toBe(true);
    expect(focused?.className).toBe('gm-hud__thumb');
    expect(focused?.url).toBe('/picture-one.png');
  });

  test('a rebuild keeps the focus on the category row', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['Alpha']);
    await addSystems(page, [record('Sol', [0, 0, 0], 'Alpha')]);
    await expect(categoryRow(page, 'Alpha')).toBeVisible();
    await categoryRow(page, 'Alpha').focus();
    await countRefreshes(page);

    await addSystems(page, [record('Second', [0, 0, 200], 'Alpha')]);
    await expect.poll(() => refreshCount(page)).toBe(1);
    const focused = await activeElement(page);
    console.log('the focus on the row after a rebuild', focused);

    expect(focused?.isBody).toBe(false);
    expect(focused?.connected).toBe(true);
    expect(focused?.className).toBe('gm-hud__category-row');
    expect(focused?.name).toBe('Alpha');
  });

  // The rebuild of the category list makes the groups with empty system lists, and the
  // rows arrive one line later. A focused system row must still hold the focus.
  test('a rebuild keeps the focus on the system row', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['Alpha']);
    await addSystems(page, [
      record('Sol', [0, 0, 0], 'Alpha'),
      record('Achenar', [0, 0, 300], 'Alpha'),
    ]);
    await expect(categoryRow(page, 'Alpha')).toBeVisible();
    await categoryRow(page, 'Alpha').click();
    await expect(systemRows(page)).toHaveCount(2);

    const row = systemRows(page).first();
    const identity = await row.getAttribute('data-identity');
    await row.focus();
    await countRefreshes(page);

    await addSystems(page, [record('Second', [0, 0, 200], 'Alpha')]);
    await expect.poll(() => refreshCount(page)).toBe(1);
    const focused = await activeElement(page);
    console.log('the focus on the system row after a rebuild', focused);

    expect(focused?.isBody).toBe(false);
    expect(focused?.connected).toBe(true);
    expect(focused?.className).toBe('gm-hud__system-row');
    expect(focused?.identity).toBe(identity);
  });

  test('many batches in one frame cost one rebuild', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['Alpha']);
    // A category with nothing in it has no row, so the set holds one system.
    await addSystems(page, [record('Sol', [0, 0, 0], 'Alpha')]);
    await expect(categoryRow(page, 'Alpha')).toBeVisible();
    await countRefreshes(page);

    const added = await page.evaluate(() => {
      let total = 0;
      // 100 batches of 10, the way a host that streams an upstream adds them. No frame
      // runs between them, because the loop below does not give the browser the turn.
      for (let batch = 0; batch < 100; batch += 1) {
        const records: SystemRecordInput[] = [];
        for (let index = 0; index < 10; index += 1) {
          const id = batch * 10 + index;
          records.push({
            name: `S${id}`,
            coords: { x: id, y: 0, z: 0 },
            categories: ['Alpha'],
          });
        }
        total += window.__hudMap?.addSystems(records).added ?? 0;
      }
      return total;
    });
    await page.waitForTimeout(70);
    const calls = await refreshCount(page);
    console.log('the rebuilds for 100 batches', { added, calls });

    expect(added).toBe(1000);
    expect(calls).toBe(1);
    // The 1,000 the loop adds, and `Sol`, which the row the test waited for is made of.
    await expect(
      categoryRow(page, 'Alpha').locator('.gm-hud__category-count'),
    ).toHaveText('1,001');
  });
});

test.describe('the search box', () => {
  test('typing narrows the markers and the lists', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['Alpha']);
    await addSystems(page, [
      record('Sol', [0, 0, 0], 'Alpha'),
      record('Solati', [0, 0, 200], 'Alpha'),
      record('Achenar', [0, 0, 300], 'Alpha'),
    ]);
    await expect(categoryRow(page, 'Alpha')).toBeVisible();
    await categoryRow(page, 'Alpha').click();

    await hud(page).locator('.gm-hud__search').fill('sol');
    await page.waitForTimeout(300);
    const count = await markerCount(page);
    const names = await systemRows(page).evaluateAll((rows) =>
      rows.map((row) => (row as HTMLElement).dataset['name'] ?? ''),
    );
    console.log('the filtered markers and rows', count, names);

    expect(count).toBe(2);
    expect(names).toEqual(['Sol', 'Solati']);
  });

  test('clearing the box brings every marker back', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['Alpha']);
    await addSystems(page, [
      record('Sol', [0, 0, 0], 'Alpha'),
      record('Achenar', [0, 0, 300], 'Alpha'),
    ]);
    await expect(categoryRow(page, 'Alpha')).toBeVisible();

    await hud(page).locator('.gm-hud__search').fill('sol');
    await page.waitForTimeout(300);
    expect(await markerCount(page)).toBe(1);

    await hud(page).locator('.gm-hud__search').fill('');
    await page.waitForTimeout(300);
    expect(await markerCount(page)).toBe(2);
  });

  test('the box does not call the filter on every key', async ({ page }) => {
    await openHud(page);
    await page.evaluate(() => {
      const map = window.__hudMap;
      if (map === undefined) return;
      const original = map.setNameFilter.bind(map);
      window.__filterCalls = 0;
      map.setNameFilter = (text: string): void => {
        window.__filterCalls = (window.__filterCalls ?? 0) + 1;
        original(text);
      };
    });

    await hud(page).locator('.gm-hud__search').pressSequentially('abcdefghij', {
      delay: 18,
    });
    await page.waitForTimeout(300);
    const calls = await page.evaluate(() => window.__filterCalls ?? -1);
    console.log('the filter calls for 10 keys', calls);

    expect(calls).toBeGreaterThan(0);
    expect(calls).toBeLessThanOrEqual(3);
  });

  // The map compares the filter text as the host gave it, with no trim. The list must
  // read the same rule, or a row shows a system whose marker the map does not draw.
  test('a trailing space empties the list and the markers alike', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['Alpha']);
    await addSystems(page, [
      record('Sol', [0, 0, 0], 'Alpha'),
      record('Achenar', [0, 0, 300], 'Alpha'),
    ]);
    await expect(categoryRow(page, 'Alpha')).toBeVisible();
    await categoryRow(page, 'Alpha').click();

    await hud(page).locator('.gm-hud__search').fill('sol ');
    // The wait is on the count of rows and not on the clock. The box gives the text to
    // the filter 150 ms after the key, and a list that folds holds its rows for the 140
    // ms it takes to close, so a fixed wait of 300 ms lands inside the close.
    await expect(systemRows(page)).toHaveCount(0);
    const count = await markerCount(page);
    const rows = await systemRows(page).count();
    console.log('the markers and rows for a trailing space', { count, rows });

    expect(count).toBe(0);
    expect(rows).toBe(0);
  });

  // The HUD holds a real `input`, and the map listens for keys on the window. The two
  // meet only in the browser, so the guard is read here and not in a unit test alone.
  test('typing in the search box does not move the cursor', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['Alpha']);
    await addSystems(page, [record('Sol', [0, 0, 0], 'Alpha')]);
    await expect(categoryRow(page, 'Alpha')).toBeVisible();
    await setView(page, { cursor: [0, 0, 0], distance: 1000, yaw: 0, pitch: 35 });

    const before = await readView(page);
    await hud(page).locator('.gm-hud__search').click();
    await hud(page).locator('.gm-hud__search').pressSequentially('wasd', { delay: 30 });
    // The cursor moves at a quarter of the distance per second while a key is held, so
    // one second is long enough to read a move of 250 light years.
    await page.waitForTimeout(1000);
    const after = await readView(page);
    const text = await hud(page).locator('.gm-hud__search').inputValue();
    console.log('the view while the box holds the keys', { before, after, text });

    expect(text).toBe('wasd');
    expect(after.cursor).toEqual(before.cursor);
    expect(after.distance).toBe(before.distance);
  });

  test('typing in the search box does not turn the camera', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['Alpha']);
    await addSystems(page, [record('Sol', [0, 0, 0], 'Alpha')]);
    await expect(categoryRow(page, 'Alpha')).toBeVisible();
    await setView(page, { cursor: [0, 0, 0], distance: 20000, yaw: 0, pitch: 35 });

    const before = await readView(page);
    await hud(page).locator('.gm-hud__search').click();
    await hud(page).locator('.gm-hud__search').pressSequentially('qe', { delay: 30 });
    // The turn keys move the yaw by 60 degrees a second, so one second is long enough to
    // read a turn.
    await page.waitForTimeout(1000);
    const after = await readView(page);
    const text = await hud(page).locator('.gm-hud__search').inputValue();
    console.log('the yaw while the box holds the turn keys', { before, after, text });

    expect(text).toBe('qe');
    expect(after.yaw).toBe(before.yaw);
  });

  /** Adds the categories `A`, `B` and `C` and the four systems the scenarios read. */
  async function addSearchSet(page: Page): Promise<void> {
    await addCategories(page, ['A', 'B', 'C']);
    await addSystems(page, [
      record('Alpha', [0, 0, 100], 'A'),
      record('Beta', [0, 0, 200], 'A'),
      record('Alpha Two', [0, 0, 300], 'B'),
      record('Gamma', [0, 0, 400], 'C'),
    ]);
    await expect(categoryRow(page, 'C')).toBeVisible();
  }

  test('a search opens every category that holds a match', async ({ page }) => {
    await openHud(page);
    await addSearchSet(page);
    // Every row is folded, because the panel opens none and the test expanded none.
    expect(await openCategories(page)).toEqual([]);

    await hud(page).locator('.gm-hud__search').fill('alpha');
    await page.waitForTimeout(300);
    const open = await openCategories(page);
    console.log('the open categories for the text alpha', open);

    expect(open).toEqual(['A', 'B']);
    expect(await rowNames(page, 'A')).toEqual(['Alpha']);
    expect(await rowNames(page, 'B')).toEqual(['Alpha Two']);
    expect(await rowNames(page, 'C')).toEqual([]);
  });

  test('a search opens a category that is switched off', async ({ page }) => {
    await openHud(page);
    await addSearchSet(page);
    await categoryDot(page, 'B').click();
    expect(
      await page.evaluate(() => window.__hudMap?.isCategoryVisible('B') ?? true),
    ).toBe(false);

    await hud(page).locator('.gm-hud__search').fill('alpha');
    await page.waitForTimeout(300);
    const open = await openCategories(page);
    console.log('the open categories with B switched off', open);

    expect(open).toContain('B');
    expect(await rowNames(page, 'B')).toEqual(['Alpha Two']);
  });

  test('a list folded during a search stays folded', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['Alpha', 'Beta', 'Gamma']);
    await addSystems(page, [
      record('Anvil Alpha', [0, 0, 100], 'Alpha'),
      record('Anvil Beta', [0, 0, 200], 'Beta'),
      record('Anvil Gamma', [0, 0, 300], 'Gamma'),
    ]);
    await expect(categoryRow(page, 'Gamma')).toBeVisible();

    await hud(page).locator('.gm-hud__search').fill('a');
    await page.waitForTimeout(300);
    expect(await openCategories(page)).toEqual(['Alpha', 'Beta', 'Gamma']);

    await categoryRow(page, 'Beta').click();
    expect(await openCategories(page)).toEqual(['Alpha', 'Gamma']);

    // The camera move runs the panel's poll, and the refresh is the rebuild itself. The
    // open set is state, so neither writes it.
    await setView(page, { cursor: [0, 0, 0], distance: 12000, yaw: 20, pitch: 35 });
    await page.waitForTimeout(300);
    expect(await openCategories(page)).toEqual(['Alpha', 'Gamma']);
    await page.evaluate(() => {
      window.__hudMap?.hud?.refresh();
    });
    const afterRebuild = await openCategories(page);
    console.log('the open categories after the rebuild', afterRebuild);
    expect(afterRebuild).toEqual(['Alpha', 'Gamma']);

    // One more letter that keeps all three categories writes the set again.
    await hud(page).locator('.gm-hud__search').fill('an');
    await page.waitForTimeout(300);
    expect(await openCategories(page)).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  test('clearing the box leaves one open list', async ({ page }) => {
    await openHud(page);
    await addSearchSet(page);
    await categoryRow(page, 'C').click();
    expect(await openCategories(page)).toEqual(['C']);

    await hud(page).locator('.gm-hud__search').fill('alpha');
    await page.waitForTimeout(300);
    const during = await openCategories(page);

    await hud(page).locator('.gm-hud__search').fill('');
    await page.waitForTimeout(300);
    const after = await openCategories(page);
    console.log('the open categories during and after the search', { during, after });

    expect(during).toEqual(['A', 'B']);
    expect(after).toEqual(['C']);
  });
});

// A row click selects, and the block reads the view right after it. The reduced-motion
// setting writes the end state in one frame, so the readings are the ones the block held
// before the selection flight existed.
test.describe('the expanded system list', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('the list opens, closes and holds one category at a time', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['Alpha', 'Beta']);
    await addSystems(page, [
      record('One', [0, 0, 100], 'Alpha'),
      record('Two', [0, 0, 200], 'Beta'),
    ]);
    await expect(categoryRow(page, 'Alpha')).toBeVisible();

    await categoryRow(page, 'Alpha').click();
    await expect(systemRows(page)).toHaveCount(1);
    await expect(systemRows(page).first()).toHaveAttribute('data-name', 'One');

    await categoryRow(page, 'Beta').click();
    await expect(systemRows(page)).toHaveCount(1);
    await expect(systemRows(page).first()).toHaveAttribute('data-name', 'Two');

    await categoryRow(page, 'Beta').click();
    await expect(systemRows(page)).toHaveCount(0);
  });

  test('the list is capped and says so', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['Alpha']);
    const added = await page.evaluate(() => {
      const records = [];
      for (let index = 0; index < 1000; index += 1) {
        records.push({
          name: `System ${String(index).padStart(4, '0')}`,
          coords: { x: index, y: 0, z: index },
          categories: ['Alpha'],
        });
      }
      return window.__hudMap?.addSystems(records).added ?? -1;
    });
    expect(added).toBe(1000);
    await expect(categoryRow(page, 'Alpha')).toBeVisible();

    await categoryRow(page, 'Alpha').click();
    await expect(systemRows(page)).toHaveCount(200);
    await expect(hud(page).locator('.gm-hud__system-cut')).toHaveText('200 of 1,000');
  });

  test('a row selects and centres', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['Alpha']);
    await addSystems(page, [
      record('S1', [100, 0, 100], 'Alpha'),
      record('S2', [200, 0, 200], 'Alpha'),
      record('S3', [300, 0, 300], 'Alpha'),
      record('S4', [400, 0, 400], 'Alpha'),
    ]);
    await expect(categoryRow(page, 'Alpha')).toBeVisible();
    await setView(page, { cursor: [0, 0, 0], distance: 20000, yaw: 40 });

    await categoryRow(page, 'Alpha').click();
    await systemRows(page).nth(2).click();
    const view = await readView(page);
    const selected = await page.evaluate(
      () => window.__hudMap?.getSelection()?.name ?? null,
    );
    console.log('the view after the row click', view, selected);

    expect(selected).toBe('S3');
    expect(view.cursor).toEqual([300, 0, 300]);
    expect(view.distance).toBe(500);
    expect(view.yaw).toBe(40);
  });

  test('one system shows in every list it belongs to', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['A', 'B']);
    await addSystems(page, [
      record('Both', [0, 0, 100], 'A', { categories: ['A', 'B'] }),
    ]);
    await expect(categoryRow(page, 'A')).toBeVisible();

    await categoryRow(page, 'A').click();
    await expect(systemRows(page)).toHaveCount(1);
    await expect(systemRows(page).first()).toHaveAttribute('data-name', 'Both');

    await categoryRow(page, 'B').click();
    await expect(systemRows(page)).toHaveCount(1);
    await expect(systemRows(page).first()).toHaveAttribute('data-name', 'Both');
  });

  test('a row holds the name alone', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['Alpha']);
    await addSystems(page, [record('Sol', [0, 0, 0], 'Alpha')]);
    await expect(categoryRow(page, 'Alpha')).toBeVisible();

    await categoryRow(page, 'Alpha').click();
    await expect(systemRows(page)).toHaveCount(1);
    const row = await systemRows(page)
      .first()
      .evaluate((node: HTMLElement) => ({
        text: node.textContent ?? '',
        distance: node.getAttribute('data-distance'),
        after: getComputedStyle(node, '::after').content,
      }));
    console.log('the reading of one system row', row);

    expect(row.text).toBe('Sol');
    expect(row.distance).toBeNull();
    // The row's own box holds no second reading, so its `::after` draws nothing.
    expect(['none', 'normal', '']).toContain(row.after);
  });

  test('the rows are shared over the open lists', async ({ page }) => {
    await openHud(page);
    expect(await addGrid(page, 4, 300)).toBe(1200);
    await expect(categoryRow(page, 'Cat a 003')).toBeVisible();

    await hud(page).locator('.gm-hud__search').fill('a');
    await page.waitForTimeout(300);
    const open = await openCategories(page);
    const counts: number[] = [];
    for (const name of open) counts.push(await rowsOf(page, name).count());
    const cuts = await hud(page)
      .locator('.gm-hud__system-cut')
      .evaluateAll((nodes) => nodes.map((node) => node.textContent ?? ''));
    const total = await systemRows(page).count();
    console.log('the rows of four open lists', { open, counts, cuts, total });

    expect(open).toHaveLength(4);
    expect(counts).toEqual([50, 50, 50, 50]);
    expect(cuts).toEqual(['50 of 300', '50 of 300', '50 of 300', '50 of 300']);
    expect(total).toBe(200);
  });

  test('more open lists than rows', async ({ page }) => {
    await openHud(page);
    expect(await addGrid(page, 256, 3)).toBe(768);
    await expect(categoryRow(page, 'Cat a 255')).toBeVisible();

    await hud(page).locator('.gm-hud__search').fill('a');
    await page.waitForTimeout(300);
    const open = await openCategories(page);
    const total = await systemRows(page).count();
    const cuts = await hud(page)
      .locator('.gm-hud__system-cut')
      .evaluateAll((nodes) => nodes.map((node) => node.textContent ?? ''));
    const empty = cuts.filter((text) => text === '0 of 3').length;
    console.log('the rows of 256 open lists', {
      open: open.length,
      total,
      cuts: cuts.length,
      empty,
    });

    expect(open).toHaveLength(256);
    expect(total).toBe(200);
    // The first 200 lists hold one row each and say 1 of 3. The other 56 hold none and
    // still state the count they hold, so the user narrows the filter to read them.
    expect(empty).toBe(56);
    expect(cuts.filter((text) => text === '1 of 3')).toHaveLength(200);
  });

  test('a row turns its category on again', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['Alpha']);
    await addSystems(page, [record('S1', [100, 0, 100], 'Alpha')]);
    await expect(categoryRow(page, 'Alpha')).toBeVisible();

    await categoryRow(page, 'Alpha').click();
    await categoryDot(page, 'Alpha').click();
    expect(
      await page.evaluate(() => window.__hudMap?.isCategoryVisible('Alpha') ?? true),
    ).toBe(false);

    await systemRows(page).first().click();
    expect(
      await page.evaluate(() => window.__hudMap?.isCategoryVisible('Alpha') ?? false),
    ).toBe(true);
  });
});

/** The names of the category rows the panel shows, in its own order. */
async function categoryNames(page: Page): Promise<string[]> {
  return hud(page)
    .locator('.gm-hud__category-row')
    .evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLElement).dataset['name'] ?? ''),
    );
}

/** The count each category row shows, in the panel's own order. */
async function categoryCounts(page: Page): Promise<string[]> {
  return hud(page)
    .locator('.gm-hud__category-row .gm-hud__category-count')
    .evaluateAll((nodes) => nodes.map((node) => node.textContent ?? ''));
}

/** The height of the first element a selector names under the HUD, in CSS pixels. */
async function heightOf(page: Page, selector: string): Promise<number> {
  return page.evaluate((name) => {
    const element = document.querySelector(`#hud-wrap .gm-hud ${name}`);
    return element === null ? -1 : element.getBoundingClientRect().height;
  }, selector);
}

/** The heights of every element a selector names under the HUD, added up. */
async function totalHeight(page: Page, selector: string): Promise<number> {
  return page.evaluate((name) => {
    let total = 0;
    for (const element of document.querySelectorAll(`#hud-wrap .gm-hud ${name}`)) {
      total += element.getBoundingClientRect().height;
    }
    return total;
  }, selector);
}

/** Waits until no flight runs. */
async function waitForStill(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => window.__hudMap?.isFlying() ?? false))
    .toBe(false);
}

test.describe('the two tabs of the category panel', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('each tab lists the categories that hold its own kind', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['A', 'B', 'C']);
    await addSystems(page, [record('One', [0, 0, 100], 'A')]);
    await addSpheres(page, [
      { position: [0, 0, 0], radius: 100, categories: ['B'], name: 'Ball' },
    ]);
    await addLines(page, [line('Ribbon', 'A')]);
    await expect(categoryRow(page, 'A')).toBeVisible();

    const systemTab = await categoryNames(page);
    const systemCounts = await categoryCounts(page);
    await panelTab(page, 'shapes').click();
    await expect(categoryRow(page, 'B')).toBeVisible();
    const shapeTab = await categoryNames(page);
    const shapeCounts = await categoryCounts(page);
    console.log('the rows of the two tabs', {
      systemTab,
      systemCounts,
      shapeTab,
      shapeCounts,
    });

    // A category that holds neither a system nor a shape has no row in either tab: a
    // row that counts nothing switches nothing the user can see.
    expect(systemTab).toEqual(['A']);
    expect(systemCounts).toEqual(['1']);
    expect(shapeTab).toEqual(['A', 'B']);
    expect(shapeCounts).toEqual(['1', '1']);
  });

  test('the shapes tab is disabled with no shape', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['Alpha']);
    await addSystems(page, [record('Sol', [0, 0, 0], 'Alpha')]);
    await expect(categoryRow(page, 'Alpha')).toBeVisible();
    expect(await panelTab(page, 'shapes').isDisabled()).toBe(true);

    await addSpheres(page, [
      { position: [0, 0, 0], radius: 100, categories: ['Alpha'] },
    ]);
    // The panel rebuilds on the next poll, which is 100 ms away.
    await expect(panelTab(page, 'shapes')).toBeEnabled();
  });

  test('the panel falls back when the shapes go', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['Alpha']);
    await addSystems(page, [record('Sol', [0, 0, 0], 'Alpha')]);
    await addSpheres(page, [
      { position: [0, 0, 0], radius: 100, categories: ['Alpha'] },
    ]);
    await expect(panelTab(page, 'shapes')).toBeEnabled();
    await panelTab(page, 'shapes').click();
    await expect(panelTab(page, 'shapes')).toHaveAttribute('aria-pressed', 'true');

    await page.evaluate(() => {
      window.__hudMap?.clearShapes();
    });
    await expect(panelTab(page, 'systems')).toHaveAttribute('aria-pressed', 'true');
    await expect(panelTab(page, 'shapes')).toBeDisabled();
  });

  test('NONE does not move a category the tab hides', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['A', 'B']);
    await addSystems(page, [record('One', [0, 0, 100], 'A')]);
    await addSpheres(page, [{ position: [0, 0, 0], radius: 100, categories: ['B'] }]);
    await expect(categoryRow(page, 'A')).toBeVisible();

    await hud(page).locator('.gm-hud__bulk-button[data-name="none"]').click();
    const reading = await page.evaluate(() => ({
      a: window.__hudMap?.isCategoryVisible('A') ?? true,
      b: window.__hudMap?.isCategoryVisible('B') ?? false,
    }));
    console.log('the two categories after NONE on the systems tab', reading);

    expect(reading.a).toBe(false);
    expect(reading.b).toBe(true);
  });

  test('NONE in the shapes tab leaves the systems', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['A']);
    await addSystems(page, [record('One', [0, 0, 100], 'A')]);
    await addSpheres(page, [{ position: [0, 0, 0], radius: 100, categories: ['A'] }]);
    await expect(panelTab(page, 'shapes')).toBeEnabled();
    await panelTab(page, 'shapes').click();

    await hud(page).locator('.gm-hud__bulk-button[data-name="none"]').click();
    const count = await markerCount(page);
    const reading = await page.evaluate(() => ({
      systems: window.__hudMap?.isCategoryVisible('A') ?? false,
      shapes: window.__hudMap?.isShapeCategoryVisible('A') ?? true,
    }));
    console.log('the category after NONE on the shapes tab', { count, ...reading });

    // The two buttons act on the kind of the shown tab alone, so the marker stays.
    expect(count).toBe(1);
    expect(reading.systems).toBe(true);
    expect(reading.shapes).toBe(false);
  });

  test('a row reads the flag of its own tab', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['A']);
    await addSystems(page, [record('One', [0, 0, 100], 'A')]);
    await addSpheres(page, [{ position: [0, 0, 0], radius: 100, categories: ['A'] }]);
    await expect(panelTab(page, 'shapes')).toBeEnabled();

    // The dot of the systems tab takes the markers off. The row of the same category in
    // the shapes tab reads its own flag, which nothing moved.
    await categoryDot(page, 'A').click();
    await expect(categoryDot(page, 'A')).toHaveAttribute('aria-pressed', 'false');
    await panelTab(page, 'shapes').click();
    await expect(categoryDot(page, 'A')).toHaveAttribute('aria-pressed', 'true');

    await categoryDot(page, 'A').click();
    await expect(categoryDot(page, 'A')).toHaveAttribute('aria-pressed', 'false');
    await panelTab(page, 'systems').click();
    await expect(categoryDot(page, 'A')).toHaveAttribute('aria-pressed', 'false');

    const reading = await page.evaluate(() => ({
      systems: window.__hudMap?.isCategoryVisible('A') ?? true,
      shapes: window.__hudMap?.isShapeCategoryVisible('A') ?? true,
    }));
    console.log('the two flags of the one category', reading);

    expect(reading.systems).toBe(false);
    expect(reading.shapes).toBe(false);
  });

  test('each tab keeps the list the user opened', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['Alpha']);
    await addSystems(page, [record('Sol', [0, 0, 0], 'Alpha')]);
    await addSpheres(page, [
      { position: [0, 0, 0], radius: 100, categories: ['Alpha'], name: 'Ball' },
    ]);
    await expect(panelTab(page, 'shapes')).toBeEnabled();

    await categoryRow(page, 'Alpha').click();
    await expect(systemRows(page)).toHaveCount(1);
    await expect(systemRows(page).first()).toHaveAttribute('data-name', 'Sol');

    // The shapes tab holds an open set of its own, which starts folded.
    await panelTab(page, 'shapes').click();
    await expect(systemRows(page)).toHaveCount(0);

    // The systems tab reads as the user left it.
    await panelTab(page, 'systems').click();
    await expect(systemRows(page)).toHaveCount(1);
    await expect(systemRows(page).first()).toHaveAttribute('data-name', 'Sol');
  });

  test('the box filters the shapes in the shapes tab', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['Alpha']);
    await addSpheres(page, [
      { position: [0, 0, 0], radius: 100, categories: ['Alpha'], name: 'Sol Zone' },
      {
        position: [0, 0, 400],
        radius: 100,
        categories: ['Alpha'],
        name: 'Solati Zone',
      },
      {
        position: [0, 0, 800],
        radius: 100,
        categories: ['Alpha'],
        name: 'Achenar Zone',
      },
    ]);
    await expect(panelTab(page, 'shapes')).toBeEnabled();
    await panelTab(page, 'shapes').click();

    await hud(page).locator('.gm-hud__search').fill('sol');
    await page.waitForTimeout(300);
    const filters = await page.evaluate(() => ({
      shapes: window.__hudMap?.getShapeNameFilter() ?? '',
      systems: window.__hudMap?.getNameFilter() ?? '',
    }));
    const names = await rowNames(page, 'Alpha');
    console.log('the shape filter and the open list', filters, names);

    expect(filters.shapes).toBe('sol');
    expect(filters.systems).toBe('');
    expect(names).toEqual(['Sol Zone', 'Solati Zone']);
  });

  test('a change of tab clears the filter it leaves', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['Alpha']);
    await addSystems(page, [
      record('Sol', [0, 0, 0], 'Alpha'),
      record('Achenar', [0, 0, 300], 'Alpha'),
    ]);
    await addSpheres(page, [
      { position: [0, 0, 0], radius: 100, categories: ['Alpha'] },
    ]);
    await expect(panelTab(page, 'shapes')).toBeEnabled();

    await hud(page).locator('.gm-hud__search').fill('sol');
    await page.waitForTimeout(300);
    expect(await markerCount(page)).toBe(1);

    await panelTab(page, 'shapes').click();
    const filter = await page.evaluate(() => window.__hudMap?.getNameFilter() ?? 'x');
    const box = await hud(page).locator('.gm-hud__search').inputValue();
    const markers = await markerCount(page);
    console.log('the system filter after the tab change', { filter, box, markers });

    expect(filter).toBe('');
    expect(box).toBe('');
    expect(markers).toBe(2);
  });

  test('a shape row names the shape', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['Alpha']);
    await addSpheres(page, [
      {
        position: [0, 0, 0],
        radius: 100,
        categories: ['Alpha'],
        name: 'Col 70 Sector',
      },
    ]);
    await addLines(page, [
      {
        points: [
          [0, 0, 0],
          [100, 0, 0],
        ],
        categories: ['Alpha'],
      },
    ]);
    await expect(panelTab(page, 'shapes')).toBeEnabled();
    await panelTab(page, 'shapes').click();
    await categoryRow(page, 'Alpha').click();

    // A shape that carries no name reads its kind and its place in the set.
    await expect(systemRows(page)).toHaveCount(2);
    expect(await rowNames(page, 'Alpha')).toEqual(['Col 70 Sector', 'LINE 0']);
  });

  test('a shape row flies the camera and selects nothing', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['Alpha']);
    await addSystems(page, [record('Sol', [0, 0, 0], 'Alpha')]);
    await addSpheres(page, [
      {
        position: [1000, 0, 2000],
        radius: 500,
        categories: ['Alpha'],
        name: 'Ball',
      },
    ]);
    await select(page, 'Sol');
    await waitForStill(page);
    await setView(page, { cursor: [0, 0, 0], distance: 20000, yaw: 40 });

    await panelTab(page, 'shapes').click();
    await categoryRow(page, 'Alpha').click();
    await expect(systemRows(page)).toHaveCount(1);
    await systemRows(page).first().click();
    await waitForStill(page);
    const view = await readView(page);
    const selected = await page.evaluate(
      () => window.__hudMap?.getSelection()?.name ?? null,
    );
    console.log('the view after the shape row click', view, selected);

    // Half the field of view is 30 degrees, so twice the reach fills the frame.
    expect(view.cursor).toEqual([1000, 0, 2000]);
    expect(view.distance).toBe(1000);
    expect(view.yaw).toBe(40);
    expect(selected).toBe('Sol');
  });

  test('a shape row turns its category back on', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['Alpha']);
    await addSpheres(page, [
      { position: [0, 0, 0], radius: 100, categories: ['Alpha'], name: 'Ball' },
    ]);
    await expect(panelTab(page, 'shapes')).toBeEnabled();
    await panelTab(page, 'shapes').click();

    // The dot of a shapes row writes the shape flag, and the row click turns that same
    // flag back on. The markers of the category are unmoved by either click.
    await categoryDot(page, 'Alpha').click();
    expect(
      await page.evaluate(
        () => window.__hudMap?.isShapeCategoryVisible('Alpha') ?? true,
      ),
    ).toBe(false);

    await categoryRow(page, 'Alpha').click();
    await systemRows(page).first().click();
    expect(
      await page.evaluate(
        () => window.__hudMap?.isShapeCategoryVisible('Alpha') ?? false,
      ),
    ).toBe(true);
  });

  test('a full shape set does not grow the panel', async ({ page }) => {
    test.setTimeout(120000);
    await openHud(page);
    const added = await page.evaluate(() => {
      const map = window.__hudMap;
      if (map === undefined) return [-1, -1, -1];
      const names: string[] = [];
      for (let index = 0; index < 20; index += 1) names.push(`Zone ${index}`);
      map.addCategories(
        names.map((name) => ({ name, color: [153, 230, 255] as const })),
      );
      const spheres = [];
      for (let index = 0; index < 1024; index += 1) {
        spheres.push({
          position: [index * 3, 0, index] as [number, number, number],
          radius: 50,
          categories: [names[index % 20] as string],
        });
      }
      const lines = [];
      for (let index = 0; index < 4096; index += 1) {
        lines.push({
          points: [
            [index, 0, 0],
            [index, 0, 100],
          ] as [number, number, number][],
          categories: [names[index % 20] as string],
        });
      }
      return [
        map.categoryCount(),
        map.addSpheres(spheres).added,
        map.addLines(lines).added,
      ];
    });
    expect(added).toEqual([20, 1024, 4096]);

    await expect(panelTab(page, 'shapes')).toBeEnabled();
    await panelTab(page, 'shapes').click();
    await expect(categoryRow(page, 'Zone 0')).toBeVisible();
    await categoryRow(page, 'Zone 0').click();
    await expect(systemRows(page)).toHaveCount(200);

    const nodes = await page.evaluate(
      () => document.querySelectorAll('#hud-wrap .gm-hud *').length,
    );
    // `refresh()` rebuilds every panel, so the reading is the cost of the category
    // rebuild and a little more. The shape read goes through `getShapeInfo`, which
    // copies no line point.
    const rebuildMs = await page.evaluate(() => {
      const handle = window.__hudMap?.hud ?? null;
      if (handle === null) return -1;
      const start = performance.now();
      handle.refresh();
      return performance.now() - start;
    });
    console.log('the panel with 1,024 spheres and 4,096 lines', { nodes, rebuildMs });

    expect(nodes).toBeLessThan(900);
    expect(rebuildMs).toBeGreaterThan(0);
    expect(rebuildMs).toBeLessThan(40);
  });
});

test.describe('the height of an open list', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('the open list takes the space the rows leave', async ({ page }) => {
    await openHud(page);
    // 3 categories of 1,000 systems each. Every list is longer than the panel, so each
    // one is held by the cap and not by the rows it holds.
    expect(await addGrid(page, 3, 1000)).toBe(3000);
    await expect(categoryRow(page, 'Cat a 002')).toBeVisible();

    await categoryRow(page, 'Cat a 000').click();
    await expect(systemRows(page)).toHaveCount(200);
    const area = await heightOf(page, '.gm-hud__category-list');
    const rows = await totalHeight(page, '.gm-hud__category-line');
    const list = await heightOf(page, '.gm-hud__system-list[data-open="true"]');
    console.log('the open list against the list area', { area, rows, list });

    expect(area - rows).toBeGreaterThan(0.5 * area);
    expect(Math.abs(list - (area - rows))).toBeLessThanOrEqual(2);
  });

  test('the open list keeps half the panel', async ({ page }) => {
    await openHud(page);
    // 40 categories fill the list area by themselves, so the rows leave the open list
    // nothing and the rule gives it half the area.
    expect(await addGrid(page, 40, 25)).toBe(1000);
    await expect(categoryRow(page, 'Cat a 039')).toBeVisible();

    await categoryRow(page, 'Cat a 000').click();
    await expect(systemRows(page)).toHaveCount(25);
    const area = await heightOf(page, '.gm-hud__category-list');
    const rows = await totalHeight(page, '.gm-hud__category-line');
    const list = await heightOf(page, '.gm-hud__system-list[data-open="true"]');
    console.log('the open list against half the panel', { area, rows, list });

    expect(rows).toBeGreaterThan(0.5 * area);
    expect(list).toBeGreaterThanOrEqual(0.5 * area - 2);
    expect(list).toBeLessThanOrEqual(0.5 * area + 2);
  });

  test('a short list takes the height of its rows', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['A', 'B', 'C']);
    await addSystems(page, [
      record('One', [0, 0, 100], 'A'),
      record('Two', [0, 0, 200], 'A'),
      record('Three', [0, 0, 300], 'B'),
      record('Four', [0, 0, 400], 'C'),
    ]);
    await expect(categoryRow(page, 'C')).toBeVisible();

    await categoryRow(page, 'A').click();
    await expect(systemRows(page)).toHaveCount(2);
    const area = await heightOf(page, '.gm-hud__category-list');
    const row = await heightOf(page, '.gm-hud__system-row');
    const list = await heightOf(page, '.gm-hud__system-list[data-open="true"]');
    console.log('the short list against the area', { area, row, list });

    // The cap is a cap and not a height: a list of two rows takes two rows.
    expect(Math.abs(list - 2 * row)).toBeLessThanOrEqual(2);
    expect(list).toBeLessThan(0.5 * area);
  });
});

test.describe('the movement of an open list', () => {
  test('the list moves when it opens', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['Alpha']);
    await addSystems(page, [
      record('One', [0, 0, 100], 'Alpha'),
      record('Two', [0, 0, 200], 'Alpha'),
    ]);
    await expect(categoryRow(page, 'Alpha')).toBeVisible();

    const duration = async (): Promise<string> =>
      page.evaluate(() => {
        const element = document.querySelector(
          '#hud-wrap .gm-hud .gm-hud__system-list',
        );
        return element === null ? '' : getComputedStyle(element).transitionDuration;
      });
    const withMotion = await duration();

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(() => {
      window.__hudMap?.hud?.refresh();
    });
    const reduced = await duration();
    console.log('the transition duration of the list', { withMotion, reduced });

    expect(withMotion).toBe('0.14s');
    expect(reduced).toBe('0s');
  });

  test('the list grows over more than one frame', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['Alpha']);
    await addSystems(page, [
      record('One', [0, 0, 100], 'Alpha'),
      record('Two', [0, 0, 200], 'Alpha'),
    ]);
    await expect(categoryRow(page, 'Alpha')).toBeVisible();

    await categoryRow(page, 'Alpha').click();
    const first = await page.evaluate(async () => {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const element = document.querySelector(
        '#hud-wrap .gm-hud .gm-hud__system-list[data-open="true"]',
      );
      return element === null ? -1 : element.getBoundingClientRect().height;
    });
    await page.waitForTimeout(300);
    const settled = await heightOf(page, '.gm-hud__system-list[data-open="true"]');
    console.log('the height of the list over the movement', { first, settled });

    expect(settled).toBeGreaterThan(0);
    expect(first).toBeLessThan(settled);
  });

  test('reduced motion takes the list to its height at once', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openHud(page);
    await addCategories(page, ['Alpha']);
    await addSystems(page, [
      record('One', [0, 0, 100], 'Alpha'),
      record('Two', [0, 0, 200], 'Alpha'),
    ]);
    await expect(categoryRow(page, 'Alpha')).toBeVisible();

    await categoryRow(page, 'Alpha').click();
    const first = await page.evaluate(async () => {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const element = document.querySelector(
        '#hud-wrap .gm-hud .gm-hud__system-list[data-open="true"]',
      );
      return element === null ? -1 : element.getBoundingClientRect().height;
    });
    await page.waitForTimeout(300);
    const settled = await heightOf(page, '.gm-hud__system-list[data-open="true"]');
    console.log('the height of the list with reduced motion', { first, settled });

    expect(first).toBe(settled);
    expect(settled).toBeGreaterThan(0);
  });
});

/**
 * The name of every switch the map options panel **shows**, in order. A switch the map
 * cannot act on is hidden and not rebuilt, so the reading skips a hidden button rather
 * than counting elements.
 */
async function optionNames(page: Page): Promise<string[]> {
  return hud(page)
    .locator('.gm-hud__options-panel .gm-hud__toggle:not([hidden])')
    .evaluateAll((nodes) => nodes.map((node) => node.dataset['name'] ?? ''));
}

test.describe('the map options panel', () => {
  test('the regions switch changes the overlay', async ({ page }) => {
    await openHud(page);
    const regions = hud(page).locator('.gm-hud__toggle[data-name="galactic-regions"]');
    expect(await page.evaluate(() => window.__hudMap?.areRegionsVisible())).toBe(true);
    await expect(regions).toHaveAttribute('aria-pressed', 'true');

    await regions.click();
    expect(await page.evaluate(() => window.__hudMap?.areRegionsVisible())).toBe(false);
    await expect(regions).toHaveAttribute('aria-pressed', 'false');
  });

  test('the panel opens on the state the options named', async ({ page }) => {
    await openHud(page, { regions: false });
    await expect(
      hud(page).locator('.gm-hud__toggle[data-name="galactic-regions"]'),
    ).toHaveAttribute('aria-pressed', 'false');
  });

  test('the panel holds no segmented control', async ({ page }) => {
    await openHud(page, { shape: true, iconRecord: true });
    expect(await hud(page).locator('.gm-hud__segment').count()).toBe(0);
    const switches = await optionNames(page);
    console.log('the switches of the map options panel', switches);
    expect(switches).toEqual([
      'galactic-regions',
      'system-names',
      'system-icons',
      'coordinate-grid',
      'shapes',
    ]);
  });

  /**
   * The view Barnard's Loop fills, at a zoom distance inside the nebula band. It is the
   * `BRIGHT_VIEW` of `e2e/nebulae.spec.ts`, written as a view rather than a fragment,
   * because the HUD tests drive a map of their own and not the page URL.
   */
  const NEBULA_VIEW = {
    cursor: [624.4, -425.9, -1229.5] as const,
    distance: 6000,
    pitch: 35,
    yaw: 0,
  };

  test('the nebulae switch removes the sprites', async ({ page }) => {
    await openHud(page, { nebulae: true });
    await expect
      .poll(() =>
        page.evaluate(() => window.__hudMap?.debug.nebulaeAttached() ?? false),
      )
      .toBe(true);
    await setView(page, NEBULA_VIEW);
    const drawn = async (): Promise<number> =>
      page.evaluate(() => {
        window.__hudMap?.debug.drawNow();
        return window.__hudMap?.debug.nebulaDrawnCount() ?? -1;
      });

    const before = await drawn();
    await hud(page).locator('.gm-hud__toggle[data-name="nebulae"]').click();
    const after = await drawn();
    console.log('the drawn count before and after the click', { before, after });

    expect(before).toBeGreaterThan(0);
    expect(after).toBe(0);
    await expect(
      hud(page).locator('.gm-hud__toggle[data-name="nebulae"]'),
    ).toHaveAttribute('aria-pressed', 'false');
  });

  test('the panel holds a sixth switch with a nebula source', async ({ page }) => {
    await openHud(page, { nebulae: true, shape: true, iconRecord: true });
    const switches = await optionNames(page);
    console.log('the switches with a nebula source', switches);
    expect(switches).toEqual([
      'galactic-regions',
      'system-names',
      'system-icons',
      'coordinate-grid',
      'shapes',
      'nebulae',
    ]);
    await expect(
      hud(page).locator('.gm-hud__toggle[data-name="nebulae"]'),
    ).toContainText('Nebulae');
  });

  test('the panel holds no nebulae switch with no source', async ({ page }) => {
    await openHud(page, { shape: true, iconRecord: true });
    const labels = await hud(page)
      .locator('.gm-hud__options-panel .gm-hud__toggle:not([hidden])')
      .evaluateAll((nodes) => nodes.map((node) => node.textContent ?? ''));
    console.log('the switch labels with no nebula source', labels);
    expect(await optionNames(page)).toHaveLength(5);
    await expect(
      hud(page).locator('.gm-hud__toggle[data-name="nebulae"]'),
    ).toBeHidden();
    expect(labels.some((label) => label.includes('Nebulae'))).toBe(false);
  });

  test('the nebulae switch calls the map and reads the state', async ({ page }) => {
    await openHud(page, { nebulae: true });
    const nebulae = hud(page).locator('.gm-hud__toggle[data-name="nebulae"]');
    await expect(nebulae).toHaveAttribute('aria-pressed', 'true');

    await nebulae.click();
    expect(await page.evaluate(() => window.__hudMap?.areNebulaeVisible())).toBe(false);
    await expect(nebulae).toHaveAttribute('aria-pressed', 'false');

    // A change through the handle moves the control, as it does for the other four.
    await page.evaluate(() => {
      window.__hudMap?.setNebulaeVisible(true);
    });
    await expect(nebulae).toHaveAttribute('aria-pressed', 'true');
  });

  // The scenario "The shapes switch follows the shape set".
  test('the shapes switch follows the shape set', async ({ page }) => {
    await openHud(page);
    const shapes = hud(page).locator('.gm-hud__toggle[data-name="shapes"]');
    expect(await page.evaluate(() => window.__hudMap?.sphereCount())).toBe(0);
    await expect(shapes).toBeHidden();

    await page.evaluate(() => {
      window.__hudMap?.addSpheres([
        { name: 'One sphere', position: [0, 0, 0], radius: 50, color: [255, 154, 60] },
      ] as never);
    });
    await expect(shapes).toBeVisible();
    await expect(shapes).toContainText('Shapes');
    await expect(shapes).toHaveAttribute('aria-pressed', 'true');

    await shapes.click();
    expect(await page.evaluate(() => window.__hudMap?.areShapesVisible())).toBe(false);
    await expect(shapes).toHaveAttribute('aria-pressed', 'false');

    await page.evaluate(() => {
      window.__hudMap?.clearShapes();
    });
    await expect(shapes).toBeHidden();
  });

  // The scenario "The system icons switch follows the records".
  test('the system icons switch follows the records', async ({ page }) => {
    await openHud(page);
    const icons = hud(page).locator('.gm-hud__toggle[data-name="system-icons"]');
    await addCategories(page, ['Alpha']);
    expect(await addSystems(page, [record('No icons', [0, 0, 100], 'Alpha')])).toBe(1);
    await page.waitForTimeout(200);
    await expect(icons).toBeHidden();

    expect(
      await addSystems(page, [
        record('Two icons', [0, 0, 200], 'Alpha', { icons: ['titan', 'mission'] }),
      ]),
    ).toBe(1);
    await expect(icons).toBeVisible();
    await expect(icons).toHaveAttribute('aria-pressed', 'true');

    await page.evaluate(() => {
      window.__hudMap?.clearSystems();
    });
    await expect(icons).toBeHidden();
  });

  // The scenario "A dropped switch keeps its state". The map option itself does not move
  // when its switch goes.
  test('a dropped switch keeps its state', async ({ page }) => {
    await openHud(page, { shape: true });
    const shapes = hud(page).locator('.gm-hud__toggle[data-name="shapes"]');
    await shapes.click();
    expect(await page.evaluate(() => window.__hudMap?.areShapesVisible())).toBe(false);

    await page.evaluate(() => {
      window.__hudMap?.clearShapes();
    });
    await expect(shapes).toBeHidden();
    expect(await page.evaluate(() => window.__hudMap?.areShapesVisible())).toBe(false);

    await page.evaluate(() => {
      window.__hudMap?.addSpheres([
        {
          name: 'Another sphere',
          position: [0, 0, 0],
          radius: 50,
          color: [255, 154, 60],
        },
      ] as never);
    });
    await expect(shapes).toBeVisible();
    await expect(shapes).toHaveAttribute('aria-pressed', 'false');
  });

  // The scenario "A map that moves nothing holds no panel".
  test('a map that moves nothing holds no panel', async ({ page }) => {
    await openHud(page, { lockedOptions: ['regions', 'systemNames', 'grid'] });
    const panel = hud(page).locator('.gm-hud__options-panel');
    await expect(panel).toBeHidden();
    await expect(hud(page).locator('.gm-hud__category-panel')).toBeVisible();

    await page.evaluate(() => {
      window.__hudMap?.addSpheres([
        { name: 'One sphere', position: [0, 0, 0], radius: 50, color: [255, 154, 60] },
      ] as never);
    });
    await expect(panel).toBeVisible();
    expect(await optionNames(page)).toEqual(['shapes']);
  });

  test('the switches call the map and open on the state the map is in', async ({
    page,
  }) => {
    await openHud(page);
    const names = hud(page).locator('.gm-hud__toggle[data-name="system-names"]');
    const grid = hud(page).locator('.gm-hud__toggle[data-name="coordinate-grid"]');
    await expect(names).toHaveAttribute('aria-pressed', 'false');
    await expect(grid).toHaveAttribute('aria-pressed', 'false');

    await names.click();
    await grid.click();
    const reading = await page.evaluate(() => ({
      names: window.__hudMap?.areSystemNamesVisible() ?? false,
      grid: window.__hudMap?.isGridVisible() ?? false,
    }));

    expect(reading.names).toBe(true);
    expect(reading.grid).toBe(true);
    await expect(names).toHaveAttribute('aria-pressed', 'true');
    await expect(grid).toHaveAttribute('aria-pressed', 'true');
  });

  test('a change through the handle moves the control', async ({ page }) => {
    await openHud(page, { shape: true });
    await page.evaluate(() => {
      window.__hudMap?.setGridVisible(true);
      window.__hudMap?.setShapesVisible(false);
    });
    await expect(
      hud(page).locator('.gm-hud__toggle[data-name="coordinate-grid"]'),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(
      hud(page).locator('.gm-hud__toggle[data-name="shapes"]'),
    ).toHaveAttribute('aria-pressed', 'false');
  });

  // The scenario "The names switch opens on the state the options named". The test
  // above, which builds the map with no `systemNames`, reads the other half: the switch
  // opens off.
  test('the names switch opens on the state the options named', async ({ page }) => {
    await openHud(page, { systemNames: true });
    const names = hud(page).locator('.gm-hud__toggle[data-name="system-names"]');
    await expect(names).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => window.__hudMap?.areSystemNamesVisible())).toBe(
      true,
    );
  });

  // The scenario "The grid switch opens on the state the options named". The test above
  // that reads the switches of a bare map covers the off half.
  test('the grid switch opens on the state the options named', async ({ page }) => {
    await openHud(page, { grid: true });
    const grid = hud(page).locator('.gm-hud__toggle[data-name="coordinate-grid"]');
    await expect(grid).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => window.__hudMap?.isGridVisible())).toBe(true);
  });

  // The scenario "The system icons switch moves the stacks". The stacks draw on the
  // canvas, so the reading is the placement count of the frame and not an element count.
  test('the system icons switch moves the stacks', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['Alpha']);
    await setView(page, { cursor: [0, 0, 0], distance: 1000, yaw: 0, pitch: 35 });
    expect(
      await addSystems(page, [
        record('One', [0, 0, 0], 'Alpha', { icons: ['titan', 'mission'] }),
      ]),
    ).toBe(1);
    const icons = hud(page).locator('.gm-hud__toggle[data-name="system-icons"]');
    const count = async (): Promise<number> =>
      page.evaluate(() => {
        window.__hudMap?.debug.drawNow();
        return (window.__hudMap?.debug.iconPlacements() ?? []).filter(
          (one) => one.kind === 'icon',
        ).length;
      });
    // A vector loads asynchronously, so the first frames place fewer icons.
    await expect.poll(count, { timeout: 15000 }).toBe(2);
    await expect(icons).toHaveAttribute('aria-pressed', 'true');

    await icons.click();
    const off = await count();
    await expect(icons).toHaveAttribute('aria-pressed', 'false');
    await icons.click();
    const on = await count();
    console.log('the icon counts over the switch', { off, on });

    expect(off).toBe(0);
    expect(on).toBe(2);
    await expect(icons).toHaveAttribute('aria-pressed', 'true');
  });

  // The scenario "The HUD draws over an icon stack". The stacks are pixels of the canvas
  // now, so every element of the page draws over them and the reading is the element at
  // the middle of an icon. The test moves the system until its stack lies under the
  // options panel, because a stack at the middle of the screen lies under no panel.
  test('the HUD draws over an icon stack', async ({ page }) => {
    // The sphere draws the **Shapes** switch, which makes the panel its full height. The
    // test does not clear the shapes, so the panel keeps that height throughout.
    await openHud(page, { shape: true });
    await addCategories(page, ['Alpha']);
    await setView(page, { cursor: [0, 0, 0], distance: 1000, yaw: 0, pitch: 35 });
    const panel = await hud(page).locator('.gm-hud__options-panel').boundingBox();
    if (panel === null) throw new Error('The HUD holds no options panel.');
    // Near the foot of the panel, because the stack rises about 120 pixels over the
    // marker and the panel sits at the foot of the window.
    const target = {
      x: panel.x + panel.width / 2,
      y: panel.y + panel.height - 12,
    };

    /** Draws a frame and reads where a game position lands, in CSS pixels. */
    const projectOf = async (
      point: [number, number, number],
    ): Promise<{ x: number; y: number }> =>
      page.evaluate((where) => {
        window.__hudMap?.debug.drawNow();
        return window.__hudMap?.debug.project(where) ?? { x: -1, y: -1 };
      }, point);

    // Two probes of 100 light years give the pixels a light year moves near the cursor.
    // The perspective divide makes the scale change with the offset, so one step of that
    // scale falls short of a target far from the cursor. The loop reads where the place
    // lands and takes another step, until the place is within 2 pixels of the target.
    expect(await addSystems(page, [record('One', [0, 0, 0], 'Alpha')])).toBe(1);
    const centre = await projectOf([0, 0, 0]);
    const right = await projectOf([100, 0, 0]);
    const up = await projectOf([0, 100, 0]);
    const place: [number, number, number] = [0, 0, 0];
    for (let pass = 0; pass < 8; pass += 1) {
      const at = await projectOf(place);
      if (Math.abs(at.x - target.x) < 2 && Math.abs(at.y - target.y) < 2) break;
      place[0] += ((target.x - at.x) * 100) / (right.x - centre.x);
      place[1] += ((target.y - at.y) * 100) / (up.y - centre.y);
    }
    await page.evaluate(() => {
      window.__hudMap?.clearSystems();
    });
    expect(
      await addSystems(page, [
        record('One', place, 'Alpha', { icons: ['titan', 'mission'] }),
      ]),
    ).toBe(1);
    // A vector loads asynchronously, so the first frames place fewer icons.
    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            window.__hudMap?.debug.drawNow();
            return (window.__hudMap?.debug.iconPlacements() ?? []).filter(
              (one) => one.kind === 'icon',
            ).length;
          }),
        { timeout: 15000 },
      )
      .toBe(2);

    const reading = await page.evaluate(() => {
      window.__hudMap?.debug.drawNow();
      const stack = (window.__hudMap?.debug.iconPlacements() ?? []).filter(
        (one) => one.kind === 'icon',
      );
      const icon = stack[0];
      if (icon === undefined) return null;
      const at = {
        x: icon.left + icon.width / 2,
        y: icon.top + icon.height / 2,
      };
      const element = document.elementFromPoint(at.x, at.y);
      return {
        at,
        icons: stack.length,
        tag: element?.tagName ?? '',
        className: element?.className ?? '',
        inHud: window.__hudMap?.hud?.element?.contains(element) ?? false,
      };
    });
    console.log('the element over the stack', { panel, target, reading });
    if (reading === null) throw new Error('The frame placed no icon.');

    expect(reading.icons).toBeGreaterThan(0);
    // The precondition of the scenario: the stack lies under the options panel.
    expect(reading.at.x).toBeGreaterThanOrEqual(panel.x);
    expect(reading.at.x).toBeLessThanOrEqual(panel.x + panel.width);
    expect(reading.at.y).toBeGreaterThanOrEqual(panel.y);
    expect(reading.at.y).toBeLessThanOrEqual(panel.y + panel.height);
    // The HUD panel is over the canvas, so the point reads the panel and not the canvas.
    expect(reading.tag).not.toBe('CANVAS');
    expect(reading.inHud).toBe(true);
  });

  // The scenario "The system icons switch opens on the option". The test above, which
  // builds the map with no `systemIcons`, reads the other half: the switch opens on.
  test('the icons switch opens on the state the options named', async ({ page }) => {
    await openHud(page, { systemIcons: false, iconRecord: true });
    await expect(
      hud(page).locator('.gm-hud__toggle[data-name="system-icons"]'),
    ).toHaveAttribute('aria-pressed', 'false');
    expect(await page.evaluate(() => window.__hudMap?.areSystemIconsVisible())).toBe(
      false,
    );
  });

  // The scenario "A locked option draws no switch".
  test('a locked option draws no switch', async ({ page }) => {
    await openHud(page, {
      lockedOptions: ['grid', 'shapes'],
      shape: true,
      iconRecord: true,
    });
    const switches = await optionNames(page);
    console.log('the switches with the grid and the shapes locked', switches);

    expect(switches).toEqual(['galactic-regions', 'system-names', 'system-icons']);
  });

  // The first half of the scenario "Every switch locked drops the panel".
  test('every switch locked drops the panel', async ({ page }) => {
    await openHud(page, {
      lockedOptions: ['regions', 'systemNames', 'systemIcons', 'grid', 'shapes'],
      shape: true,
      iconRecord: true,
    });

    // The reading is whether the panel is shown and not a count of elements: a panel
    // every lock took is not built, and a panel the map emptied carries `hidden`. The
    // user cannot tell the two apart.
    await expect(hud(page).locator('.gm-hud__options-panel')).toBeHidden();
    await expect(hud(page).locator('.gm-hud__category-panel')).toBeVisible();
  });

  // The second half: the same five names on a map that holds a nebula source leave the
  // Nebulae switch, because the count of switches the panel would hold is not fixed.
  test('the five names leave the nebulae switch', async ({ page }) => {
    await openHud(page, {
      nebulae: true,
      shape: true,
      iconRecord: true,
      lockedOptions: ['regions', 'systemNames', 'systemIcons', 'grid', 'shapes'],
    });

    expect(await optionNames(page)).toEqual(['nebulae']);
  });

  // The scenario "The nebulae switch locks with the rest".
  test('the nebulae switch locks with the rest', async ({ page }) => {
    await openHud(page, {
      nebulae: true,
      lockedOptions: [
        'regions',
        'systemNames',
        'systemIcons',
        'grid',
        'shapes',
        'nebulae',
      ],
    });
    await expect
      .poll(() =>
        page.evaluate(() => window.__hudMap?.debug.nebulaeAttached() ?? false),
      )
      .toBe(true);
    await setView(page, NEBULA_VIEW);
    const drawn = await page.evaluate(() => {
      window.__hudMap?.debug.drawNow();
      return window.__hudMap?.debug.nebulaDrawnCount() ?? -1;
    });
    console.log('the drawn count with every switch locked', drawn);

    await expect(hud(page).locator('.gm-hud__options-panel')).toBeHidden();
    expect(drawn).toBeGreaterThan(0);
  });

  // The scenario "A locked option still moves through the handle". A lock holds the
  // user, not the host.
  test('a locked option still moves through the handle', async ({ page }) => {
    await openHud(page, { grid: true, lockedOptions: ['grid'] });
    const gridSwitch = hud(page).locator(
      '.gm-hud__toggle[data-name="coordinate-grid"]',
    );
    expect(await page.evaluate(() => window.__hudMap?.isGridVisible())).toBe(true);
    expect(await gridSwitch.count()).toBe(0);

    await page.evaluate(() => {
      window.__hudMap?.setGridVisible(false);
      window.__hudMap?.debug.drawNow();
    });
    const after = await page.evaluate(() => ({
      on: window.__hudMap?.isGridVisible() ?? true,
      vertices: window.__hudMap?.debug.gridVertexCount() ?? -1,
    }));
    console.log('the grid after the handle call', after);

    expect(after.on).toBe(false);
    expect(after.vertices).toBe(0);
    expect(await gridSwitch.count()).toBe(0);
  });

  // The scenario "A lock list the HUD cannot read is ignored", first list. `nebulae` is
  // a name the panel holds, so the unknown name here is `datasets`.
  test('an unknown name in the lock list is ignored', async ({ page }) => {
    await openHud(page, {
      lockedOptions: ['datasets', 7],
      shape: true,
      iconRecord: true,
    });

    expect(await optionNames(page)).toEqual([
      'galactic-regions',
      'system-names',
      'system-icons',
      'coordinate-grid',
      'shapes',
    ]);
  });

  // The same scenario, second list: a `lockedOptions` that is not an array.
  test('a lock list that is not an array is ignored', async ({ page }) => {
    await openHud(page, { lockedOptions: 'grid', shape: true, iconRecord: true });

    expect(await optionNames(page)).toEqual([
      'galactic-regions',
      'system-names',
      'system-icons',
      'coordinate-grid',
      'shapes',
    ]);
  });
});

/** The label of every field the information panel shows. */
async function fieldLabels(page: Page): Promise<string[]> {
  return hud(page)
    .locator('.gm-hud__field-label')
    .evaluateAll((nodes) => nodes.map((node) => node.textContent ?? ''));
}

/** The value beside one field label. */
function fieldValue(page: Page, label: string): Locator {
  return hud(page)
    .locator('.gm-hud__field', { hasText: label })
    .locator('.gm-hud__field-value');
}

test.describe('the information panel', () => {
  test('the panel opens on a selection and shows the record', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['Alpha']);
    await addSystems(page, [
      record('Shinrarta Dezhra', [55, 17, 27], 'Alpha', {
        allegiance: 'Independent',
        population: 85206935,
        description: 'The pilots federation holds the only access to this system.',
      }),
    ]);
    await expect(hud(page).locator('.gm-hud__info')).toBeHidden();

    await select(page, 'Shinrarta Dezhra');
    await expect(hud(page).locator('.gm-hud__info')).toBeVisible();
    await expect(hud(page).locator('.gm-hud__info-name')).toHaveText(
      'Shinrarta Dezhra',
    );
    const labels = await fieldLabels(page);
    console.log('the field labels', labels);

    expect(labels).toEqual([
      'POSITION',
      'DISTANCE FROM SOL',
      'RANGE',
      'REGION',
      'ALLEGIANCE',
      'POPULATION',
    ]);
    await expect(fieldValue(page, 'POSITION')).toHaveText('55 / 17 / 27');
    await expect(fieldValue(page, 'ALLEGIANCE')).toHaveText('Independent');
    await expect(fieldValue(page, 'POPULATION')).toHaveText('85,206,935');
    await expect(hud(page).locator('.gm-hud__description')).toHaveText(
      'The pilots federation holds the only access to this system.',
    );
    await expect(hud(page).locator('.gm-hud__chip')).toHaveText(['Alpha']);
  });

  test('the position keeps its fraction', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['Alpha']);
    await addSystems(page, [
      record('Fractional', [-9530.9375, -910.28125, 19808.125], 'Alpha'),
    ]);
    await select(page, 'Fractional');

    const value = await fieldValue(page, 'POSITION').textContent();
    console.log('the position field of a fractional record', value);

    expect(value).toBe('-9,530.9375 / -910.28125 / 19,808.125');
  });

  test('a whole coordinate shows no decimal point', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['Alpha']);
    await addSystems(page, [record('Half', [100, 0, -25.5], 'Alpha')]);
    await select(page, 'Half');

    const value = await fieldValue(page, 'POSITION').textContent();
    console.log('the position field of a part whole record', value);

    expect(value).toBe('100 / 0 / -25.5');
  });

  test('the distance fields stay whole', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['Alpha']);
    await addSystems(page, [record('Half', [100, 0, -25.5], 'Alpha')]);
    await select(page, 'Half');
    // The selection flies the camera in and caps the distance at 500 light years. The
    // panel rewrites the range at 10 times a second, so the reading waits for both.
    await expect
      .poll(() => page.evaluate(() => window.__hudMap?.getView().distance ?? -1))
      .toBeLessThanOrEqual(500);
    await page.waitForTimeout(200);

    const fromSol = await fieldValue(page, 'DISTANCE FROM SOL').textContent();
    const range = await fieldValue(page, 'RANGE').textContent();
    console.log('the distance fields', { fromSol, range });

    // The record sits 103 light years from Sol and the camera is within 500, so neither
    // field passes 1,000 and neither shows a separator. The separator is what the
    // scenario "the position keeps its fraction" reads, in `-9,530.9375`.
    expect(fromSol).toMatch(/^\d+ LY$/);
    expect(range).toMatch(/^\d+ LY$/);
  });

  /** Waits until no selection flight runs on the HUD's map. */
  async function waitForFlightEnd(page: Page): Promise<void> {
    await expect
      .poll(() => page.evaluate(() => window.__hudMap?.debug.selectionFlightMs() ?? -1))
      .toBe(0);
  }

  /** The range field as a number of light years, after the panel's 10 Hz rewrite. */
  async function rangeLy(page: Page): Promise<number> {
    await page.waitForTimeout(200);
    const text = (await fieldValue(page, 'RANGE').textContent()) ?? '';
    return Number(text.replace(/[^\d.-]/g, ''));
  }

  // The scenario "A landed selection reads a range of zero". The owner chose this
  // reading: a selection puts the cursor on the system, so nothing is left to measure.
  test('a landed selection reads a range of zero', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['Alpha']);
    await addSystems(page, [record('Far', [3000, 0, 0], 'Alpha')]);
    await select(page, 'Far');
    await waitForFlightEnd(page);

    const range = await fieldValue(page, 'RANGE').textContent();
    console.log('the range of a landed selection', range);

    expect(range).toBe('0 LY');
  });

  // The scenario "An orbit does not change the range".
  test('an orbit does not change the range', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['Alpha']);
    await addSystems(page, [record('Far', [3000, 0, 0], 'Alpha')]);
    await select(page, 'Far');
    await waitForFlightEnd(page);
    // A pan of 400 light years, written as a cursor move, so the reading is a known one.
    await setView(page, { cursor: [3400, 0, 0] });
    const before = await rangeLy(page);

    await setView(page, { yaw: 120, pitch: 75 });
    const after = await rangeLy(page);
    console.log('the range across an orbit', { before, after });

    expect(Math.abs(before - 400)).toBeLessThanOrEqual(1);
    expect(Math.abs(after - 400)).toBeLessThanOrEqual(1);
  });

  // The scenario "A zoom does not change the range".
  test('a zoom does not change the range', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['Alpha']);
    await addSystems(page, [record('Far', [3000, 0, 0], 'Alpha')]);
    await select(page, 'Far');
    await waitForFlightEnd(page);
    await setView(page, { cursor: [3400, 0, 0], distance: 500 });
    const before = await rangeLy(page);

    await setView(page, { distance: 20000 });
    const after = await rangeLy(page);
    console.log('the range across a zoom', { before, after });

    expect(Math.abs(before - 400)).toBeLessThanOrEqual(1);
    expect(Math.abs(after - 400)).toBeLessThanOrEqual(1);
  });

  /** The box of the grid and of each field, in CSS pixels. */
  async function fieldBoxes(page: Page): Promise<{
    grid: number;
    fields: { width: number; top: number }[];
  }> {
    return hud(page).evaluate((root: HTMLElement) => {
      const grid = root.querySelector('.gm-hud__field-grid') as HTMLElement;
      const fields = [...grid.querySelectorAll('.gm-hud__field')] as HTMLElement[];
      return {
        grid: grid.getBoundingClientRect().width,
        fields: fields.map((field) => {
          const box = field.getBoundingClientRect();
          return { width: box.width, top: box.top };
        }),
      };
    });
  }

  test('the position takes both columns and the two distances share a row', async ({
    page,
  }) => {
    await openHud(page);
    await addCategories(page, ['Alpha']);
    // The record carries no field of its own, so the grid holds the four every record
    // shows: the position, the distance from Sol, the range and the region.
    await addSystems(page, [record('Sol', [0, 0, 0], 'Alpha')]);
    await select(page, 'Sol');

    const labels = await fieldLabels(page);
    expect(labels).toEqual(['POSITION', 'DISTANCE FROM SOL', 'RANGE', 'REGION']);

    const boxes = await fieldBoxes(page);
    console.log('the field grid of the four fields', boxes);

    const [position, fromSol, range, region] = boxes.fields as {
      width: number;
      top: number;
    }[];
    expect(boxes.fields).toHaveLength(4);
    expect(
      Math.abs((region as { width: number }).width - boxes.grid),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs((position as { width: number }).width - boxes.grid),
    ).toBeLessThanOrEqual(1);
    // Each of the two distances is about half the grid, less half the 10 pixel gap.
    for (const field of [fromSol, range] as { width: number }[]) {
      expect(field.width * 2).toBeLessThan(boxes.grid + 12);
      expect(field.width * 2).toBeGreaterThan(boxes.grid - 12);
    }
    expect(
      Math.abs((fromSol as { top: number }).top - (range as { top: number }).top),
    ).toBeLessThanOrEqual(1);
    expect((fromSol as { top: number }).top).toBeGreaterThan(
      (position as { top: number }).top,
    );
  });

  test('the position value does not wrap', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['Alpha']);
    await addSystems(page, [
      record('Fractional', [-9530.9375, -910.28125, 19808.125], 'Alpha'),
    ]);
    await select(page, 'Fractional');

    // The reading finds the element and measures it in one call. The panel rebuilds its
    // fields while the selection flight runs, so an element a locator resolved in an
    // earlier call can be off the document by the time the measure runs, and a detached
    // element reads a height of 0 and no line height at all.
    const value = await hud(page).evaluate((root: HTMLElement) => {
      const fields = [...root.querySelectorAll('.gm-hud__field')] as HTMLElement[];
      const field = fields.find(
        (box) => box.querySelector('.gm-hud__field-label')?.textContent === 'POSITION',
      );
      const node = field?.querySelector('.gm-hud__field-value') as HTMLElement | null;
      if (node === null || node === undefined) return null;
      return {
        text: node.textContent ?? '',
        height: node.getBoundingClientRect().height,
        lineHeight: parseFloat(getComputedStyle(node).lineHeight),
      };
    });
    console.log('the box of the longest position value', value);

    expect(value).not.toBeNull();
    const read = value as NonNullable<typeof value>;
    expect(read.text).toBe('-9,530.9375 / -910.28125 / 19,808.125');
    // The value's box is one line high, by the line height its own style gives.
    expect(read.height).toBeGreaterThan(0);
    expect(read.height).toBeLessThan(read.lineHeight * 1.5);
  });

  test('an odd count of fields leaves no empty cell', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['Alpha']);
    // The position and the region take two cells each, so the four fields every record
    // shows fill six cells and leave the grid full. A grid of n fields fills n + 2
    // cells. Five fields leave the last one alone on its row, and six fill the grid.
    await addSystems(page, [
      record('Five', [0, 0, 100], 'Alpha', { primaryStar: 'G' }),
      record('Six', [0, 0, 200], 'Alpha', { primaryStar: 'G', allegiance: 'Empire' }),
    ]);

    await select(page, 'Five');
    expect(await fieldLabels(page)).toEqual([
      'POSITION',
      'DISTANCE FROM SOL',
      'RANGE',
      'REGION',
      'PRIMARY STAR',
    ]);
    const five = await fieldBoxes(page);
    console.log('the field grid of five fields', five);
    expect(five.fields).toHaveLength(5);
    expect(
      Math.abs((five.fields[4] as { width: number }).width - five.grid),
    ).toBeLessThanOrEqual(1);

    await select(page, 'Six');
    expect(await fieldLabels(page)).toEqual([
      'POSITION',
      'DISTANCE FROM SOL',
      'RANGE',
      'REGION',
      'PRIMARY STAR',
      'ALLEGIANCE',
    ]);
    const six = await fieldBoxes(page);
    console.log('the field grid of six fields', six);
    expect(six.fields).toHaveLength(6);
    const last = (six.fields[5] as { width: number }).width;
    expect(last * 2).toBeLessThan(six.grid + 12);
    expect(last * 2).toBeGreaterThan(six.grid - 12);
    // The grid holds no empty cell: the last field sits on the row of the one before it.
    expect(
      Math.abs(
        (six.fields[5] as { top: number }).top - (six.fields[4] as { top: number }).top,
      ),
    ).toBeLessThanOrEqual(1);
  });

  /**
   * Holds back every script the page asks for from now on, for a span of milliseconds.
   * The region cell table loads on the first `regionNameAtExact`, and nothing else is
   * fetched after the map is ready, so this holds that one load back and gives the test
   * a window in which the region field is still empty.
   */
  async function holdBackTheLookup(page: Page, delayMs: number): Promise<void> {
    await page.route('**/*.js', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      await route.continue();
    });
  }

  test("the panel names the system's region", async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['Alpha']);
    await addSystems(page, [
      record('Sol', [0, 0, 0], 'Alpha'),
      record('Core', [15, -35, 25895], 'Alpha'),
    ]);

    await select(page, 'Sol');
    await expect(fieldValue(page, 'REGION')).toHaveText('Inner Orion Spur');

    await select(page, 'Core');
    await expect(fieldValue(page, 'REGION')).toHaveText('Galactic Centre');
  });

  test('the region field is exact', async ({ page }) => {
    // The unit scenario of `src/scene-data/region-lines.test.ts` found this point. Its
    // own 49.3494 light year cell holds `Sanguineous Rim` and its 197.3976 light year
    // coarse cell holds `Inner Orion Spur`.
    const point: [number, number, number] = [-857.675, 0, -1379.602];
    await openHud(page);
    await addCategories(page, ['Alpha']);
    await addSystems(page, [record('Edge', point, 'Alpha')]);
    await select(page, 'Edge');

    await expect(fieldValue(page, 'REGION')).toHaveText('Sanguineous Rim');
    const coarse = await page.evaluate(
      (where) => window.__hudMap?.regionNameAt(where as [number, number, number]),
      point,
    );
    console.log('the coarse reading at the same point', coarse);
    expect(coarse).toBe('Inner Orion Spur');
  });

  test('a position off the region map reads Unknown', async ({ page }) => {
    // The point lies inside the model bounds and outside the codex region map, at the
    // far corner of the model. The record reader refuses a position outside the model
    // bounds, so a record cannot be selected there and the panel cannot read one.
    await openHud(page);
    await addCategories(page, ['Alpha']);
    const added = await addSystems(page, [
      record('Outside', [-49900, 0, 75800], 'Alpha'),
    ]);
    expect(added).toBe(1);
    await select(page, 'Outside');

    await expect(fieldValue(page, 'REGION')).toHaveText('Unknown');
  });

  test('a stale lookup does not write', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['Alpha']);
    await addSystems(page, [
      record('Sol', [0, 0, 0], 'Alpha'),
      record('Core', [15, -35, 25895], 'Alpha'),
    ]);
    // The first lookup fetches the table, so it is held back long enough for the second
    // selection to come first.
    await holdBackTheLookup(page, 1500);

    await select(page, 'Sol');
    await select(page, 'Core');
    await expect(fieldValue(page, 'REGION')).toHaveText('Galactic Centre', {
      timeout: 10000,
    });
    // The first lookup resolves after the second, so a panel that took every answer
    // would write `Inner Orion Spur` over it.
    await page.waitForTimeout(1000);
    await expect(fieldValue(page, 'REGION')).toHaveText('Galactic Centre');
  });

  test('the grid does not reflow when the region arrives', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['Alpha']);
    await addSystems(page, [record('Sol', [0, 0, 0], 'Alpha')]);
    await holdBackTheLookup(page, 2000);

    await select(page, 'Sol');
    const empty = await fieldValue(page, 'REGION').textContent();
    const before = await fieldBoxes(page);
    await expect(fieldValue(page, 'REGION')).toHaveText('Inner Orion Spur', {
      timeout: 10000,
    });
    const after = await fieldBoxes(page);
    console.log('the field boxes before and after the region', { before, after });

    expect(empty).toBe('');
    expect(after).toEqual(before);
  });

  test('a record with no description hides that section', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['Alpha']);
    await addSystems(page, [record('Bare', [0, 0, 100], 'Alpha')]);
    await select(page, 'Bare');

    await expect(hud(page).locator('.gm-hud__info')).toBeVisible();
    await expect(hud(page).locator('.gm-hud__description')).toHaveCount(0);
    await expect(hud(page).locator('.gm-hud__thumbs')).toHaveCount(0);
  });

  test('centre view moves the cursor alone', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['Alpha']);
    await addSystems(page, [record('Far', [0, 0, 400], 'Alpha')]);
    await select(page, 'Far');
    await setView(page, { cursor: [0, 0, 0], distance: 500, yaw: 40, pitch: 50 });

    const before = await readView(page);
    await hud(page).locator('.gm-hud__centre').click();
    const after = await readView(page);
    console.log('the views around centre view', before, after);

    expect(after.cursor).toEqual([0, 0, 400]);
    expect(after.distance).toBe(before.distance);
    expect(after.yaw).toBe(before.yaw);
    expect(after.pitch).toBe(before.pitch);
  });

  test('centre view keeps the distance at a far zoom', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['Alpha']);
    await addSystems(page, [record('Far', [0, 0, 400], 'Alpha')]);
    await select(page, 'Far');
    await setView(page, { cursor: [800, 0, 400], distance: 4000 });

    await hud(page).locator('.gm-hud__centre').click();
    const view = await readView(page);
    console.log('the view after centre view', view);

    expect(view.cursor).toEqual([0, 0, 400]);
    expect(view.distance).toBe(4000);
  });

  test('the close button clears the selection', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['Alpha']);
    await addSystems(page, [record('Bare', [0, 0, 100], 'Alpha')]);
    await select(page, 'Bare');
    await expect(hud(page).locator('.gm-hud__info')).toBeVisible();

    await hud(page).locator('.gm-hud__info-close').click();
    expect(await page.evaluate(() => window.__hudMap?.getSelection())).toBeNull();
    await expect(hud(page).locator('.gm-hud__info')).toBeHidden();
  });

  test('a host action gets the selected system', async ({ page }) => {
    await openHud(page, { actions: 'one' });
    await addCategories(page, ['Alpha']);
    await addSystems(page, [record('Bare', [0, 0, 100], 'Alpha')]);
    await select(page, 'Bare');

    await hud(page).locator('.gm-hud__action').click();
    const calls = await page.evaluate(() => window.__hudActionCalls ?? []);
    console.log('the action calls', calls);

    expect(calls).toEqual(['Bare']);
  });

  test('a failing host action does not stop the map', async ({ page }) => {
    await openHud(page, { actions: 'throwing' });
    await addCategories(page, ['Alpha']);
    await addSystems(page, [record('Bare', [0, 0, 100], 'Alpha')]);
    await select(page, 'Bare');

    await hud(page).locator('.gm-hud__action').click();
    const frames = await page.evaluate(async () => {
      for (let frame = 0; frame < 10; frame += 1) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
      return window.__hudMap?.getView() ?? null;
    });
    console.log('the view after the failing action', frames);

    expect(frames).not.toBeNull();
    expect(frames?.distance).toBeGreaterThan(0);
  });

  test('the footer holds the centre view button before the answer', async ({
    page,
  }) => {
    await openHud(page, { actions: 'pending' });
    await addCategories(page, ['Alpha']);
    await addSystems(page, [record('Bare', [0, 0, 100], 'Alpha')]);
    await select(page, 'Bare');
    await expect(hud(page).locator('.gm-hud__centre')).toBeVisible();
    const whileLoading = await hud(page).locator('.gm-hud__action').count();
    console.log('the host buttons while the load runs', whileLoading);

    expect(whileLoading).toBe(0);

    await openHud(page, { actions: 'rejecting' });
    await addCategories(page, ['Alpha']);
    await addSystems(page, [record('Bare', [0, 0, 100], 'Alpha')]);
    await select(page, 'Bare');
    await expect(hud(page).locator('.gm-hud__centre')).toBeVisible();
    const afterFailure = await hud(page).locator('.gm-hud__action').count();
    console.log('the host buttons after the load failed', afterFailure);

    expect(afterFailure).toBe(0);
  });
});

/** The copy button of the name or of the position. */
function copyButton(page: Page, name: 'name' | 'position'): Locator {
  return hud(page).locator(`.gm-hud__copy[data-name="${name}"]`);
}

/** The state and the accessible name of one copy button. */
async function copyState(
  page: Page,
  name: 'name' | 'position',
): Promise<{ state: string; label: string }> {
  return copyButton(page, name).evaluate((element) => ({
    state: element.getAttribute('data-state') ?? '',
    label: element.getAttribute('aria-label') ?? '',
  }));
}

test.describe('the copy buttons', () => {
  test('the name button copies the name', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openHud(page);
    await addCategories(page, ['Alpha']);
    await addSystems(page, [record('Marked System AB-1', [0, 0, 100], 'Alpha')]);
    await select(page, 'Marked System AB-1');

    await copyButton(page, 'name').click();
    const text = await page.evaluate(() => navigator.clipboard.readText());
    const selected = await page.evaluate(
      () => window.__hudMap?.getSelection()?.name ?? null,
    );
    console.log('the clipboard after the name copy', text);

    expect(text).toBe('Marked System AB-1');
    expect(selected).toBe('Marked System AB-1');
  });

  test('the position button copies three whole numbers', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openHud(page);
    await addCategories(page, ['Alpha']);
    await addSystems(page, [record('Marked', [1235, -20, 25895], 'Alpha')]);
    await select(page, 'Marked');
    // The panel keeps the thousands separators. The copy drops them, so what is copied
    // pastes into a field that takes a number.
    await expect(
      hud(page).locator('.gm-hud__field').first().locator('.gm-hud__field-value'),
    ).toHaveText('1,235 / -20 / 25,895');

    await copyButton(page, 'position').click();
    const text = await page.evaluate(() => navigator.clipboard.readText());
    console.log('the clipboard after the position copy', text);

    expect(text).toBe('1235 / -20 / 25895');
  });

  test('the position button copies a fraction', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openHud(page);
    await addCategories(page, ['Alpha']);
    await addSystems(page, [record('Marked', [1234.5, -20, 25895], 'Alpha')]);
    await select(page, 'Marked');

    await copyButton(page, 'position').click();
    const text = await page.evaluate(() => navigator.clipboard.readText());
    console.log('the clipboard after the fraction copy', text);

    expect(text).toBe('1234.5 / -20 / 25895');
  });

  test('the tick shows and goes', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openHud(page);
    await addCategories(page, ['Alpha']);
    await addSystems(page, [record('Ticked', [0, 0, 100], 'Alpha')]);
    await select(page, 'Ticked');

    await copyButton(page, 'name').click();
    await expect
      .poll(() => copyState(page, 'name'))
      .toEqual({
        state: 'copied',
        label: 'Copied',
      });

    await page.waitForTimeout(1600);
    expect(await copyState(page, 'name')).toEqual({
      state: 'idle',
      label: 'Copy system name',
    });
  });

  test('only one tick at a time', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openHud(page);
    await addCategories(page, ['Alpha']);
    await addSystems(page, [record('Ticked', [0, 0, 100], 'Alpha')]);
    await select(page, 'Ticked');

    await copyButton(page, 'name').click();
    await expect
      .poll(() => copyState(page, 'name'))
      .toEqual({
        state: 'copied',
        label: 'Copied',
      });
    await copyButton(page, 'position').click();
    await expect
      .poll(() => copyState(page, 'position'))
      .toEqual({
        state: 'copied',
        label: 'Copied',
      });

    expect(await copyState(page, 'name')).toEqual({
      state: 'idle',
      label: 'Copy system name',
    });
  });

  test('a refused write does not break the panel', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['Alpha']);
    await addSystems(page, [record('Refused', [0, 0, 100], 'Alpha')]);
    await select(page, 'Refused');
    // The clipboard write rejects, as it does when the browser refuses the permission.
    await page.evaluate(() => {
      Object.defineProperty(navigator.clipboard, 'writeText', {
        configurable: true,
        value: () => Promise.reject(new Error('The write is refused.')),
      });
    });

    await copyButton(page, 'name').click();
    await copyButton(page, 'position').click();
    const view = await page.evaluate(async () => {
      for (let frame = 0; frame < 10; frame += 1) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
      return window.__hudMap?.getView() ?? null;
    });
    console.log('the view after the refused writes', view);

    expect(await copyState(page, 'name')).toEqual({
      state: 'idle',
      label: 'Copy system name',
    });
    expect(await copyState(page, 'position')).toEqual({
      state: 'idle',
      label: 'Copy position',
    });
    await expect(hud(page).locator('.gm-hud__info-name')).toHaveText('Refused');
    expect(view?.distance).toBeGreaterThan(0);
  });
});

/**
 * The computed `user-select` of every element the selector matches, under the HUD the
 * tests drive. The count is part of the reading, so a selector that matches nothing
 * cannot read as a pass.
 */
async function selectionOf(page: Page, selector: string): Promise<string[]> {
  return hud(page)
    .locator(selector)
    .evaluateAll((nodes) =>
      nodes.map((node) => getComputedStyle(node).userSelect ?? ''),
    );
}

/** The computed `user-select` of every element inside one panel, the panel included. */
async function selectionInside(page: Page, selector: string): Promise<string[]> {
  return hud(page)
    .locator(selector)
    .evaluateAll((roots) =>
      roots.flatMap((root) =>
        [root, ...root.querySelectorAll('*')].map(
          (node) => getComputedStyle(node).userSelect ?? '',
        ),
      ),
    );
}

test.describe('the readouts of the information panel are selectable', () => {
  /** A record with a description, a category, a position and two pictures. */
  const readable = (): Record<string, unknown> =>
    record('Pictured', [0, 0, 100], 'Alpha', {
      description: 'A **body** of text the reader may copy.',
      images: [{ url: '/picture-one.png', caption: 'APPROACH VECTOR' }],
    });

  test('the readouts read as text', async ({ page }) => {
    await openHud(page, { section: true });
    await addCategories(page, ['Alpha']);
    await addSystems(page, [readable()]);
    await select(page, 'Pictured');
    await expect(
      hud(page).locator('.gm-hud__description[data-name="HISTORY"]'),
    ).toBeVisible();

    const reading: Record<string, string[]> = {};
    for (const selector of [
      '.gm-hud__info-name',
      '.gm-hud__field-value',
      '.gm-hud__description',
      '.gm-hud__description p',
      '.gm-hud__chip',
    ]) {
      reading[selector] = await selectionOf(page, selector);
    }
    console.log('the readouts read', reading);

    for (const [selector, values] of Object.entries(reading)) {
      expect(values.length, selector).toBeGreaterThan(0);
      for (const value of values) expect(value, selector).toBe('text');
    }
  });

  test('the labels and the controls stay unselectable', async ({ page }) => {
    await openHud(page, { actions: 'one', section: true });
    await addCategories(page, ['Alpha']);
    await addSystems(page, [readable()]);
    await select(page, 'Pictured');
    await expect(hud(page).locator('.gm-hud__action')).toBeVisible();

    const reading: Record<string, string[]> = {};
    for (const selector of [
      '.gm-hud__field-label',
      '.gm-hud__section-title',
      '.gm-hud__info-close',
      '.gm-hud__copy',
      '.gm-hud__footer-button',
      '.gm-hud__thumb',
      '.gm-hud__thumb-caption',
    ]) {
      reading[selector] = await selectionOf(page, selector);
    }
    console.log('the labels and the controls read', reading);

    for (const [selector, values] of Object.entries(reading)) {
      expect(values.length, selector).toBeGreaterThan(0);
      for (const value of values) expect(value, selector).toBe('none');
    }
  });

  test('the other panels stay unselectable', async ({ page }) => {
    await openHud(page, { datasets: true });
    await addCategories(page, ['Alpha']);
    await addSystems(page, [readable()]);
    await hud(page).locator('.gm-hud__dataset').click();
    await expect(hud(page).locator('.gm-hud__dialog')).toBeVisible();

    const reading: Record<string, string[]> = {};
    for (const selector of [
      '.gm-hud__top-bar',
      '.gm-hud__category-panel',
      '.gm-hud__options-panel',
      '.gm-hud__dialog',
    ]) {
      reading[selector] = await selectionInside(page, selector);
    }
    console.log(
      'the element counts of the other panels',
      Object.fromEntries(
        Object.entries(reading).map(([name, values]) => [name, values.length]),
      ),
    );

    for (const [selector, values] of Object.entries(reading)) {
      expect(values.length, selector).toBeGreaterThan(1);
      for (const value of values) expect(value, selector).toBe('none');
    }
  });

  test('a field value can be selected', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['Alpha']);
    await addSystems(page, [readable()]);
    await select(page, 'Pictured');
    await expect(fieldValue(page, 'POSITION')).toBeVisible();

    const reading = await fieldValue(page, 'POSITION').evaluate((node) => {
      const view = node.ownerDocument.defaultView;
      const selection = view?.getSelection() ?? null;
      const range = node.ownerDocument.createRange();
      range.selectNodeContents(node);
      selection?.removeAllRanges();
      selection?.addRange(range);
      return { shown: node.textContent ?? '', selected: selection?.toString() ?? '' };
    });
    console.log('the selected position', reading);

    expect(reading.shown).not.toBe('');
    expect(reading.selected).toBe(reading.shown);
  });

  test('a drag on the panel does not move the camera', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['Alpha']);
    await addSystems(page, [readable()]);
    await select(page, 'Pictured');
    const description = hud(page).locator('.gm-hud__description').first();
    await expect(description).toBeVisible();
    // The selection flies the camera to the system, and the flight is still running when
    // the panel appears. A view read across it would move with the flight and not with
    // the drag.
    await waitForStill(page);

    const before = await readView(page);
    const area = await description.boundingBox();
    if (area === null) throw new Error('The description has no box.');
    await page.mouse.move(area.x + 4, area.y + area.height / 2);
    await page.mouse.down();
    await page.mouse.move(area.x + 4 + 120, area.y + area.height / 2, { steps: 12 });
    await page.mouse.up();
    const after = await readView(page);
    console.log('the view across the drag', { before, after });

    expect(after).toEqual(before);
  });
});

test.describe('the images and the lightbox', () => {
  /** A record with two pictures the page serves from its own origin. */
  const withImages = (): Record<string, unknown> =>
    record('Pictured', [0, 0, 100], 'Alpha', {
      images: [
        { url: '/picture-one.png', caption: 'APPROACH VECTOR' },
        { url: '/picture-two.png', caption: 'ORBITAL PLANE' },
      ],
    });

  test('the images are lazy and send no referrer', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['Alpha']);
    await addSystems(page, [withImages()]);
    await select(page, 'Pictured');

    const attributes = await hud(page)
      .locator('.gm-hud__thumb-image')
      .evaluateAll((nodes) =>
        nodes.map((node) => ({
          loading: node.getAttribute('loading'),
          referrer: node.getAttribute('referrerpolicy'),
        })),
      );
    console.log('the thumbnail attributes', attributes);

    expect(attributes).toHaveLength(2);
    for (const entry of attributes) {
      expect(entry.loading).toBe('lazy');
      expect(entry.referrer).toBe('no-referrer');
    }
  });

  test('a thumbnail opens the lightbox', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['Alpha']);
    await addSystems(page, [withImages()]);
    await select(page, 'Pictured');

    await hud(page).locator('.gm-hud__thumb').first().click();
    const box = hud(page).locator('.gm-hud__lightbox');
    await expect(box).toBeVisible();
    await expect(box.locator('.gm-hud__lightbox-image')).toHaveAttribute(
      'src',
      '/picture-one.png',
    );
    await expect(box.locator('.gm-hud__lightbox-system')).toHaveText('Pictured');
    await expect(box.locator('.gm-hud__lightbox-caption')).toHaveText(
      'APPROACH VECTOR',
    );
  });

  // The placeholder holds the caption in the middle of the lightbox frame, and the
  // picture fits inside the frame rather than covering it. A caption left in place reads
  // through the bars each side of the picture and through its transparent parts.
  test('the caption behind the picture goes when the picture loads', async ({
    page,
  }) => {
    const served = record('Served', [0, 0, 100], 'Alpha', {
      images: [{ url: 'demo-images/ruins-site.svg', caption: 'SITE PLAN' }],
    });

    await openHud(page);
    await addCategories(page, ['Alpha']);
    await addSystems(page, [served]);
    await select(page, 'Served');

    await hud(page).locator('.gm-hud__thumb').first().click();
    const box = hud(page).locator('.gm-hud__lightbox');
    await expect(box).toBeVisible();
    // The picture is not there in the same turn as the click, so the reading repeats.
    await expect(box.locator('.gm-hud__lightbox-placeholder')).toBeHidden();
    await expect(box.locator('.gm-hud__lightbox-image')).toBeVisible();
    // The footer still names the picture, so the caption is not lost.
    await expect(box.locator('.gm-hud__lightbox-caption')).toHaveText('SITE PLAN');
  });

  // The box writes the `src` and then reads the element. The element still reports the
  // picture before it in the same turn, so a reading that did not first compare the two
  // paths would hide the caption for the whole load of a second picture.
  test('the caption shows while a second picture loads', async ({ page }) => {
    // The assignment happens inside the executor, which TypeScript's flow analysis does
    // not follow, so the variable carries a definite assignment assertion.
    let release!: () => void;
    const held = new Promise<void>((done) => {
      release = done;
    });
    // The second picture waits until the test lets it through, so the load window is long
    // enough to read. The request stays on the page's own origin.
    await page.route('**/demo-images/structure-site.svg', async (route) => {
      await held;
      await route.continue();
    });

    const served = record('Served', [0, 0, 100], 'Alpha', {
      images: [
        { url: 'demo-images/ruins-site.svg', caption: 'SITE PLAN' },
        { url: 'demo-images/structure-site.svg', caption: 'APPROACH VECTOR' },
      ],
    });

    await openHud(page);
    await addCategories(page, ['Alpha']);
    await addSystems(page, [served]);
    await select(page, 'Served');

    const box = hud(page).locator('.gm-hud__lightbox');
    const placeholder = box.locator('.gm-hud__lightbox-placeholder');

    await hud(page).locator('.gm-hud__thumb').first().click();
    await expect(placeholder).toBeHidden();
    await hud(page).locator('.gm-hud__lightbox-close').click();

    // The second picture is still held, so its caption must be in view.
    await hud(page).locator('.gm-hud__thumb').nth(1).click();
    await expect(placeholder).toBeVisible();
    await expect(placeholder).toHaveText('APPROACH VECTOR');

    release();
    await expect(placeholder).toBeHidden();
  });

  test('the caption stays when the picture does not load', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['Alpha']);
    await addSystems(page, [withImages()]);
    await select(page, 'Pictured');

    // `/picture-one.png` is not a file the page serves, so the picture fails.
    await hud(page).locator('.gm-hud__thumb').first().click();
    const box = hud(page).locator('.gm-hud__lightbox');
    await expect(box).toBeVisible();
    await expect(box.locator('.gm-hud__lightbox-image')).toBeHidden();
    await expect(box.locator('.gm-hud__lightbox-placeholder')).toHaveText(
      'APPROACH VECTOR',
    );
  });

  test('a click in the lightbox closes it', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['Alpha']);
    await addSystems(page, [withImages()]);
    await select(page, 'Pictured');

    await hud(page).locator('.gm-hud__thumb').first().click();
    await expect(hud(page).locator('.gm-hud__lightbox')).toBeVisible();
    await hud(page).locator('.gm-hud__lightbox-close').click();
    await expect(hud(page).locator('.gm-hud__lightbox')).toBeHidden();
  });

  // A rebuild of the panel replaces every thumbnail while the box is open. The focus
  // must come back to an element the document still holds, and not to an element the
  // rebuild threw away, which leaves a keyboard user at the top of the page.
  test('Escape gives the focus back after a rebuild', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['Alpha']);
    await addSystems(page, [withImages()]);
    await select(page, 'Pictured');

    await hud(page).locator('.gm-hud__thumb').first().click();
    await expect(hud(page).locator('.gm-hud__lightbox')).toBeVisible();

    await countRefreshes(page);
    await addSystems(page, [record('Second', [0, 0, 200], 'Alpha')]);
    await expect.poll(() => refreshCount(page)).toBe(1);

    await page.keyboard.press('Escape');
    await expect(hud(page).locator('.gm-hud__lightbox')).toBeHidden();
    const focused = await activeElement(page);
    console.log('the focus after the rebuild', focused);

    expect(focused?.isBody).toBe(false);
    expect(focused?.connected).toBe(true);
    expect(focused?.className).toBe('gm-hud__thumb');
    expect(focused?.url).toBe('/picture-one.png');
  });

  // The selection can go while the box is open, through a host call or a listener. The
  // panel then rebuilds to hidden, so no thumbnail and no panel control can take the
  // focus, and the focus must still land on a live element.
  test('Escape gives the focus back after the selection goes', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['Alpha']);
    await addSystems(page, [withImages()]);
    await select(page, 'Pictured');

    await hud(page).locator('.gm-hud__thumb').first().click();
    await expect(hud(page).locator('.gm-hud__lightbox')).toBeVisible();

    await page.evaluate(() => {
      window.__hudMap?.setSelection(null);
    });
    await expect(hud(page).locator('.gm-hud__info')).toBeHidden();

    await page.keyboard.press('Escape');
    await expect(hud(page).locator('.gm-hud__lightbox')).toBeHidden();
    const focused = await activeElement(page);
    console.log('the focus after the selection went', focused);

    expect(focused?.isBody).toBe(false);
    expect(focused?.connected).toBe(true);
  });

  // A record names its pictures by path. The built page must serve them, and a 404 is
  // not a cross-origin request, so the third-party test above does not see it. The
  // record below is the test's own and names two pictures the build serves from
  // `public/`. The path is relative, because the site is served under a base path and a
  // path that starts with `/` would resolve against the origin and miss it.
  //
  // The browser suite may put the demo set on the map, but no browser test selects a
  // record of it: every one of those names a picture on another host, and the HUD would
  // fetch a thumbnail from Canonn.
  test('a picture of the built page loads', async ({ page }) => {
    const pictures = [
      { url: 'demo-images/ruins-site.svg', caption: 'SITE PLAN' },
      { url: 'demo-images/structure-site.svg', caption: 'APPROACH VECTOR' },
    ];
    const served = record('Served', [0, 0, 100], 'Alpha', { images: pictures });

    await openHud(page);
    await addCategories(page, ['Alpha']);
    expect(await addSystems(page, [served])).toBe(1);
    await select(page, 'Served');

    const images = hud(page).locator('.gm-hud__thumb-image');
    await expect(images).toHaveCount(pictures.length);
    // Every picture of the record is read, and not the first alone. A typo in the second
    // path would ship unseen otherwise.
    const read = (): Promise<
      { source: string | null; width: number; complete: boolean }[]
    > =>
      images.evaluateAll((nodes) =>
        nodes.map((node) => ({
          source: node.getAttribute('src'),
          width: (node as HTMLImageElement).naturalWidth,
          complete: (node as HTMLImageElement).complete,
        })),
      );

    expect((await read()).map((reading) => reading.source)).toEqual(
      pictures.map((picture) => picture.url),
    );
    // The thumbnails load lazily, so the pictures are not there in the same turn as the
    // selection. The reading repeats until every picture has arrived.
    await expect
      .poll(async () =>
        (await read()).every((reading) => reading.complete && reading.width > 0),
      )
      .toBe(true);
    console.log('the pictures of the built page', await read());
  });

  test('a broken image keeps its caption', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['Alpha']);
    await addSystems(page, [withImages()]);
    await select(page, 'Pictured');

    // The two URLs above name no file the preview server holds, so both fail to load.
    const thumb = hud(page).locator('.gm-hud__thumb').first();
    await expect(thumb).toBeVisible();
    await expect(thumb.locator('.gm-hud__thumb-caption')).toHaveText('APPROACH VECTOR');
    await expect(thumb.locator('.gm-hud__thumb-image')).toBeHidden();
  });
});

/**
 * The picture of the demo, which is 400 by 300, and one of 4,000 by 3,000 the test
 * serves from `e2e/fixtures`. The small one is the size the lightbox must not enlarge,
 * and the large one is the size it must hold to the map.
 */
const SMALL_PICTURE = 'demo-images/ruins-site.svg';
const LARGE_PICTURE = 'demo-images/large-picture.svg';

/** Serves the 4,000 by 3,000 fixture at the large picture's address. */
async function serveLargePicture(page: Page): Promise<void> {
  await page.route(`**/${LARGE_PICTURE}`, async (route) => {
    await route.fulfill({
      contentType: 'image/svg+xml',
      path: fileURLToPath(new URL('./fixtures/large-picture.svg', import.meta.url)),
    });
  });
}

/** Opens the lightbox on one picture and waits until the picture is drawn. */
async function openLightbox(page: Page, url: string): Promise<void> {
  await openHud(page);
  await addCategories(page, ['Alpha']);
  await addSystems(page, [
    record('Served', [0, 0, 100], 'Alpha', {
      images: [{ url, caption: 'SITE PLAN' }],
    }),
  ]);
  await select(page, 'Served');
  await hud(page).locator('.gm-hud__thumb').first().click();
  await expect(hud(page).locator('.gm-hud__lightbox')).toBeVisible();
  await expect(hud(page).locator('.gm-hud__lightbox-placeholder')).toBeHidden();
}

/** The drawn size of the picture, of the frame and of the whole lightbox. */
async function lightboxSizes(page: Page): Promise<{
  image: { width: number; height: number };
  frame: { width: number; height: number };
  box: { width: number; height: number };
}> {
  return hud(page)
    .locator('.gm-hud__lightbox')
    .evaluate((node) => {
      const read = (element: Element | null): { width: number; height: number } => {
        const area = element?.getBoundingClientRect();
        return { width: area?.width ?? -1, height: area?.height ?? -1 };
      };
      return {
        image: read(node.querySelector('.gm-hud__lightbox-image')),
        frame: read(node.querySelector('.gm-hud__lightbox-frame')),
        box: { width: node.clientWidth, height: node.clientHeight },
      };
    });
}

test.describe('the lightbox fits the picture', () => {
  test('a small picture is not enlarged', async ({ page }) => {
    await openLightbox(page, SMALL_PICTURE);
    const sizes = await lightboxSizes(page);
    console.log('the sizes at a ratio of 1', sizes);

    expect(sizes.image.width).toBeCloseTo(400, 0);
    expect(sizes.image.height).toBeCloseTo(300, 0);
  });

  test('the frame does not run past the picture', async ({ page }) => {
    await openLightbox(page, SMALL_PICTURE);
    const sizes = await lightboxSizes(page);
    console.log('the frame over the picture', sizes);

    expect(sizes.frame.width - sizes.image.width).toBeLessThanOrEqual(48);
    expect(sizes.frame.height - sizes.image.height).toBeLessThanOrEqual(48);
    expect(sizes.frame.width).toBeGreaterThanOrEqual(sizes.image.width);
    expect(sizes.frame.height).toBeGreaterThanOrEqual(sizes.image.height);
  });

  test('a large picture still fits the map', async ({ page }) => {
    await serveLargePicture(page);
    await openLightbox(page, LARGE_PICTURE);
    const sizes = await lightboxSizes(page);
    console.log('the sizes of the large picture', sizes);

    expect(sizes.image.width).toBeLessThanOrEqual(1180);
    expect(sizes.image.width).toBeLessThanOrEqual(sizes.box.width * 0.86 + 0.5);
    expect(sizes.image.height).toBeLessThanOrEqual(sizes.box.height * 0.82 + 0.5);
    expect(sizes.image.width / sizes.image.height).toBeCloseTo(4 / 3, 2);
  });

  test('the same picture keeps its size when the box opens again', async ({ page }) => {
    // The box writes the size when it opens, and a picture it already holds raises no
    // `load` to write it again. A hidden box reads a room of 0 by 0, so an open that
    // measures too early draws the picture at 0 by 0 the second time.
    await openLightbox(page, SMALL_PICTURE);
    const first = await lightboxSizes(page);
    await hud(page).locator('.gm-hud__lightbox-close').click();
    await expect(hud(page).locator('.gm-hud__lightbox')).toBeHidden();

    await hud(page).locator('.gm-hud__thumb').first().click();
    await expect(hud(page).locator('.gm-hud__lightbox')).toBeVisible();
    const second = await lightboxSizes(page);
    console.log('the sizes of the same picture twice', { first, second });

    expect(second.image.width).toBeCloseTo(first.image.width, 0);
    expect(second.image.height).toBeCloseTo(first.image.height, 0);
    expect(second.image.width).toBeCloseTo(400, 0);
  });

  test('a lightbox with no picture still reads', async ({ page }) => {
    // `/picture-one.png` is not a file the page serves, so the picture fails.
    await openHud(page);
    await addCategories(page, ['Alpha']);
    await addSystems(page, [
      record('Pictured', [0, 0, 100], 'Alpha', {
        images: [{ url: '/picture-one.png', caption: 'APPROACH VECTOR' }],
      }),
    ]);
    await select(page, 'Pictured');
    await hud(page).locator('.gm-hud__thumb').first().click();
    await expect(hud(page).locator('.gm-hud__lightbox')).toBeVisible();
    await expect(hud(page).locator('.gm-hud__lightbox-image')).toBeHidden();

    const sizes = await lightboxSizes(page);
    console.log('the frame with no picture', sizes);

    expect(sizes.frame.width).toBeGreaterThanOrEqual(260);
    expect(sizes.frame.height).toBeGreaterThanOrEqual(160);
    await expect(hud(page).locator('.gm-hud__lightbox-placeholder')).toHaveText(
      'APPROACH VECTOR',
    );
  });
});

// The cap follows the device pixel ratio, so this block runs at a ratio of 2. The
// viewport is tall enough for 600 CSS pixels of picture: 82 percent of 900 is 738.
test.describe('the lightbox cap at a device pixel ratio of 2', () => {
  test.use({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });

  test('a small picture draws at twice its pixels', async ({ page }) => {
    await openLightbox(page, SMALL_PICTURE);
    const sizes = await lightboxSizes(page);
    console.log('the sizes at a ratio of 2', sizes);

    expect(sizes.image.width).toBeCloseTo(800, 0);
    expect(sizes.image.height).toBeCloseTo(600, 0);
  });
});

test.describe('the Escape key', () => {
  test('Escape unwinds one step at a time', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['Alpha']);
    await addSystems(page, [
      record('Pictured', [0, 0, 100], 'Alpha', {
        images: [{ url: '/picture-one.png', caption: 'APPROACH VECTOR' }],
      }),
    ]);
    await select(page, 'Pictured');
    await hud(page).locator('.gm-hud__thumb').first().click();
    await expect(hud(page).locator('.gm-hud__lightbox')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(hud(page).locator('.gm-hud__lightbox')).toBeHidden();
    expect(
      await page.evaluate(() => window.__hudMap?.getSelection()?.name ?? null),
    ).toBe('Pictured');

    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => window.__hudMap?.getSelection())).toBeNull();
    await expect(hud(page).locator('.gm-hud__info')).toBeHidden();
  });

  test('Escape with nothing open does nothing', async ({ page }) => {
    await openHud(page);
    const before = await readView(page);
    await page.keyboard.press('Escape');
    const after = await readView(page);

    expect(after).toEqual(before);
    expect(await page.evaluate(() => window.__hudMap?.getSelection())).toBeNull();
  });
});

test.describe('the keyboard', () => {
  test('the movement keys work with a button focused', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['Alpha']);
    await addSystems(page, [record('Sol', [0, 0, 0], 'Alpha')]);
    await expect(categoryRow(page, 'Alpha')).toBeVisible();
    await setView(page, { cursor: [0, 0, 0], distance: 20000, pitch: 89 });

    await categoryRow(page, 'Alpha').focus();
    await page.keyboard.down('w');
    await page.waitForTimeout(1000);
    await page.keyboard.up('w');
    const view = await readView(page);
    const moved = Math.hypot(view.cursor[0], view.cursor[1], view.cursor[2]);
    console.log('the cursor after one second of W', view.cursor, moved);

    // The keys move the cursor one quarter of the distance in one second.
    expect(moved).toBeGreaterThan(1000);
  });

  test('a turn key works with a button focused', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['Alpha']);
    await addSystems(page, [record('Sol', [0, 0, 0], 'Alpha')]);
    await expect(categoryRow(page, 'Alpha')).toBeVisible();
    await setView(page, { cursor: [0, 0, 0], distance: 20000, yaw: 0, pitch: 35 });

    await categoryRow(page, 'Alpha').focus();
    await page.keyboard.down('e');
    await page.waitForTimeout(1000);
    await page.keyboard.up('e');
    const view = await readView(page);
    console.log('the yaw after one second of E', view.yaw);

    // The turn keys move the yaw by 60 degrees a second.
    expect(view.yaw).toBeGreaterThan(20);
  });

  test('Enter and Space work a control', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['Alpha']);
    await addSystems(page, [record('Sol', [0, 0, 0], 'Alpha')]);
    await expect(categoryRow(page, 'Alpha')).toBeVisible();

    // The dot is the control that switches the category.
    await categoryDot(page, 'Alpha').focus();
    await page.keyboard.press('Enter');
    expect(
      await page.evaluate(() => window.__hudMap?.isCategoryVisible('Alpha') ?? true),
    ).toBe(false);

    await page.keyboard.press(' ');
    expect(
      await page.evaluate(() => window.__hudMap?.isCategoryVisible('Alpha') ?? false),
    ).toBe(true);
  });

  test('Tab reaches every control', async ({ page }) => {
    await openHud(page, { datasets: true, datasetCount: 3, datasetArrows: true });
    await addCategories(page, ['Alpha', 'Beta']);
    // One record names two icons, so the **System icons** switch is shown: the panel
    // drops it on a map where no record names one, and a hidden switch takes no focus.
    await addSystems(page, [
      record('Tabbed', [0, 0, 100], 'Alpha', { icons: ['titan', 'mission'] }),
      record('Second', [0, 0, 200], 'Beta'),
    ]);
    // The shapes tab is disabled with no shape, and a disabled button takes no focus,
    // so the set holds one shape. The **Shapes** switch follows the same set.
    await addLines(page, [line('Ribbon', 'Alpha')]);
    await page.waitForTimeout(200);
    await expect(categoryRow(page, 'Beta')).toBeVisible();
    // The information panel holds the two copy buttons, so the sweep opens it first.
    await select(page, 'Tabbed');
    await expect(hud(page).locator('.gm-hud__info-name')).toHaveText('Tabbed');

    await hud(page).locator('.gm-hud__search').focus();
    // One pass of the tab ring. The sweep stops when the focus comes back to the box it
    // started from, so each control is counted once.
    const seen: string[] = [];
    for (let step = 0; step < 40; step += 1) {
      await page.keyboard.press('Tab');
      const stop = await page.evaluate(() => {
        const active = document.activeElement;
        if (!(active instanceof HTMLElement)) return '';
        const name = active.dataset['name'] ?? '';
        return `${active.className}|${name}`;
      });
      if (stop === 'gm-hud__search|') break;
      seen.push(stop);
    }
    console.log('the focus sweep', seen);

    const wanted = [
      'gm-hud__tab|systems',
      'gm-hud__tab|shapes',
      'gm-hud__category-dot|Alpha',
      'gm-hud__category-row|Alpha',
      'gm-hud__category-dot|Beta',
      'gm-hud__category-row|Beta',
      'gm-hud__bulk-button|all',
      'gm-hud__bulk-button|none',
      'gm-hud__toggle|galactic-regions',
      'gm-hud__toggle|system-names',
      'gm-hud__toggle|system-icons',
      'gm-hud__toggle|coordinate-grid',
      'gm-hud__toggle|shapes',
      'gm-hud__dataset-step|previous',
      'gm-hud__dataset|',
      'gm-hud__dataset-step|next',
      'gm-hud__reset|',
      'gm-hud__copy|name',
      'gm-hud__copy|position',
    ];
    for (const entry of wanted) {
      expect(seen.filter((name) => name === entry)).toHaveLength(1);
    }
    // This map holds no nebula source, so the panel builds no sixth switch and the ring
    // reaches none.
    expect(seen).not.toContain('gm-hud__toggle|nebulae');
  });

  test('Tab reaches the nebulae switch where the map holds one', async ({ page }) => {
    await openHud(page, { nebulae: true, shape: true });
    await hud(page).locator('.gm-hud__toggle[data-name="shapes"]').focus();
    await page.keyboard.press('Tab');
    const after = await page.evaluate(() => {
      const active = document.activeElement;
      if (!(active instanceof HTMLElement)) return '';
      return `${active.className}|${active.dataset['name'] ?? ''}`;
    });
    console.log('the control after the shapes switch', after);

    // The sixth switch follows the fifth one, so a keyboard user reaches it in the
    // order the panel shows.
    expect(after).toBe('gm-hud__toggle|nebulae');
  });

  test('the controls carry their state and their names', async ({ page }) => {
    await openHud(page, { shape: true });
    await addCategories(page, ['Alpha']);
    await addSystems(page, [record('Sol', [0, 0, 0], 'Alpha')]);
    await expect(categoryRow(page, 'Alpha')).toBeVisible();

    const switches = await hud(page)
      .locator('.gm-hud__options-panel .gm-hud__toggle:not([hidden])')
      .evaluateAll((nodes) =>
        nodes.map((node) => ({
          pressed: node.getAttribute('aria-pressed'),
          text: node.textContent ?? '',
        })),
      );
    console.log('the map option switches', switches);
    expect(switches.length).toBeGreaterThan(0);
    for (const entry of switches) {
      expect(entry.pressed === 'true' || entry.pressed === 'false').toBe(true);
      expect(entry.text.length).toBeGreaterThan(0);
    }

    await expect(
      hud(page).locator('.gm-hud__toggle[data-name="system-names"]'),
    ).toHaveAttribute('aria-pressed', 'false');
    await expect(
      hud(page).locator('.gm-hud__toggle[data-name="coordinate-grid"]'),
    ).toHaveAttribute('aria-pressed', 'false');
    await expect(
      hud(page).locator('.gm-hud__toggle[data-name="shapes"]'),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(categoryDot(page, 'Alpha')).toHaveAttribute('aria-pressed', 'true');
    await expect(categoryDot(page, 'Alpha')).toHaveAttribute('aria-label', 'Alpha');
    await expect(categoryRow(page, 'Alpha')).toContainText('Alpha');
    await expect(categoryRow(page, 'Alpha')).toHaveAttribute('aria-expanded', 'false');
    await expect(panelTab(page, 'systems')).toHaveAttribute('aria-pressed', 'true');
    await expect(panelTab(page, 'shapes')).toHaveAttribute('aria-pressed', 'false');
  });

  // The scenario "A panel of fewer switches still reports each state".
  test('a panel of fewer switches still reports each state', async ({ page }) => {
    await openHud(page, { lockedOptions: ['grid', 'shapes'], iconRecord: true });
    await hud(page)
      .locator('.gm-hud__options-panel .gm-hud__toggle:not([hidden])')
      .first()
      .focus();

    const reached: { name: string; pressed: string | null; text: string }[] = [];
    for (let step = 0; step < 5; step += 1) {
      const stop = await page.evaluate(() => {
        const active = document.activeElement;
        if (!(active instanceof HTMLElement)) return null;
        return {
          className: active.className,
          name: active.dataset['name'] ?? '',
          pressed: active.getAttribute('aria-pressed'),
          text: active.textContent ?? '',
        };
      });
      if (stop === null || !stop.className.includes('gm-hud__toggle')) break;
      reached.push({ name: stop.name, pressed: stop.pressed, text: stop.text });
      await page.keyboard.press('Tab');
    }
    console.log('the switches the tab ring reached', reached);

    expect(reached.map((one) => one.name)).toEqual([
      'galactic-regions',
      'system-names',
      'system-icons',
    ]);
    for (const one of reached) {
      expect(one.pressed === 'true' || one.pressed === 'false').toBe(true);
      expect(one.text.length).toBeGreaterThan(0);
    }

    // Each one acts on Enter and on Space, as it does on a click.
    await hud(page).locator('.gm-hud__toggle[data-name="galactic-regions"]').focus();
    await page.keyboard.press('Enter');
    expect(await page.evaluate(() => window.__hudMap?.areRegionsVisible())).toBe(false);
    await page.keyboard.press(' ');
    expect(await page.evaluate(() => window.__hudMap?.areRegionsVisible())).toBe(true);
  });

  // The scenario "A hidden switch takes no focus".
  test('a hidden switch takes no focus', async ({ page }) => {
    await openHud(page);
    await hud(page).locator('.gm-hud__toggle[data-name="galactic-regions"]').focus();

    const reached: string[] = [];
    for (let step = 0; step < 6; step += 1) {
      const stop = await page.evaluate(() => {
        const active = document.activeElement;
        if (!(active instanceof HTMLElement)) return null;
        return {
          className: active.className,
          name: active.dataset['name'] ?? '',
        };
      });
      if (stop === null || !stop.className.includes('gm-hud__toggle')) break;
      reached.push(stop.name);
      await page.keyboard.press('Tab');
    }
    console.log('the switches the tab ring reached on a bare map', reached);

    expect(reached).toEqual(['galactic-regions', 'system-names', 'coordinate-grid']);
  });

  test('the lightbox holds and returns the focus', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['Alpha']);
    await addSystems(page, [
      record('Pictured', [0, 0, 100], 'Alpha', {
        images: [{ url: '/picture-one.png', caption: 'APPROACH VECTOR' }],
      }),
    ]);
    await select(page, 'Pictured');

    const thumb = hud(page).locator('.gm-hud__thumb').first();
    await thumb.focus();
    await page.keyboard.press('Enter');
    const inside = await page.evaluate(() => {
      const active = document.activeElement;
      const box = document.querySelector('#hud-wrap .gm-hud__lightbox');
      return active !== null && box !== null && box.contains(active);
    });
    expect(inside).toBe(true);

    await page.keyboard.press('Escape');
    const back = await page.evaluate(() => document.activeElement?.className ?? '');
    console.log('the focus after the close', back);
    expect(back).toBe('gm-hud__thumb');
  });
});

test.describe('the HUD budget', () => {
  // A selection flies the camera for 600 ms, and the top bar follows the view each frame
  // of the flight. The reading below is of a still map, so the flight is off.
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('the HUD adds no work to a still frame', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['Alpha']);
    await addSystems(page, [record('Bare', [0, 0, 100], 'Alpha')]);
    await select(page, 'Bare');
    // The view-driven readouts settle inside 200 ms, so the count starts after them.
    await page.waitForTimeout(300);

    const { writes, styleCalls } = await page.evaluate(async () => {
      const root = document.querySelector('#hud-wrap .gm-hud');
      if (!(root instanceof HTMLElement)) return { writes: -1, styleCalls: -1 };
      let count = 0;
      const observer = new MutationObserver((records) => {
        count += records.length;
      });
      observer.observe(root, {
        childList: true,
        characterData: true,
        attributes: true,
        subtree: true,
      });
      // A write of the value an element already carries makes no mutation record, so
      // the mutation count cannot see it. The test counts the calls themselves as well.
      // A still frame builds no element, so the set of HUD styles is fixed here.
      const styles = new WeakSet<CSSStyleDeclaration>([root.style]);
      for (const element of root.querySelectorAll<HTMLElement | SVGElement>('*')) {
        styles.add(element.style);
      }
      const prototype = CSSStyleDeclaration.prototype;
      const setProperty = prototype.setProperty;
      let calls = 0;
      prototype.setProperty = function (
        this: CSSStyleDeclaration,
        ...args: Parameters<CSSStyleDeclaration['setProperty']>
      ): void {
        if (styles.has(this)) calls += 1;
        setProperty.apply(this, args);
      };
      try {
        for (let frame = 0; frame < 120; frame += 1) {
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        }
      } finally {
        prototype.setProperty = setProperty;
        observer.disconnect();
      }
      return { writes: count, styleCalls: calls };
    });
    console.log('the HUD DOM writes over 120 still frames', writes);
    console.log('the HUD style writes over 120 still frames', styleCalls);

    expect(writes).toBe(0);
    expect(styleCalls).toBe(0);
  });

  test('the node count does not follow the set', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['Alpha']);
    const added = await page.evaluate((total: number) => {
      const records: SystemRecordInput[] = [];
      let state = 4711;
      const unit = (): number => {
        state = (state * 1103515245 + 12345) & 0x7fffffff;
        return state / 0x7fffffff;
      };
      for (let index = 0; index < total; index += 1) {
        records.push({
          name: `S${String(index).padStart(6, '0')}`,
          coords: {
            x: -49985 + unit() * 100000,
            y: -40985 + unit() * 81910,
            z: -24105 + unit() * 100000,
          },
          categories: ['Alpha'],
        });
      }
      return window.__hudMap?.addSystems(records).added ?? -1;
    }, FULL_SET);
    expect(added).toBe(FULL_SET);

    await expect(categoryRow(page, 'Alpha')).toBeVisible();
    await categoryRow(page, 'Alpha').click();
    await expect(systemRows(page)).toHaveCount(200);

    const nodes = await page.evaluate(
      () => document.querySelectorAll('#hud-wrap .gm-hud *').length,
    );
    console.log('the HUD element count with a full set', nodes);

    expect(nodes).toBeLessThan(600);
  });

  test('the node count does not follow the count of open lists', async ({ page }) => {
    await openHud(page);
    // 40 categories of 250 systems each, every name holding `a`.
    expect(await addGrid(page, 40, 250)).toBe(10000);
    await expect(categoryRow(page, 'Cat a 039')).toBeVisible();

    // The count with every list closed, at the same 40 categories. The growth from this
    // count to the open one is what the shared row budget bounds. A category row costs
    // about 13 elements, so 40 closed categories already cost 539, and an absolute bound
    // would read the count of categories and not the count of open lists.
    const closedNodes = await page.evaluate(
      () => document.querySelectorAll('#hud-wrap .gm-hud *').length,
    );

    await hud(page).locator('.gm-hud__search').fill('a');
    await page.waitForTimeout(300);
    const open = await openCategories(page);
    const rows = await systemRows(page).count();
    const nodes = await page.evaluate(
      () => document.querySelectorAll('#hud-wrap .gm-hud *').length,
    );
    console.log('the HUD element count with 40 open lists', {
      open: open.length,
      rows,
      nodes,
      closedNodes,
    });

    expect(open.length).toBeGreaterThanOrEqual(2);
    expect(rows).toBe(200);
    expect(nodes - closedNodes).toBeLessThan(600);
  });
});

// The wide layout, against the narrow one the media queries add below 1400 pixels and
// below 720. Every reading of this file is at 1600 by 900, which is above both widths, so
// a rule that escaped a query fails one of these.
test.describe('the wide layout', () => {
  /** The bounding box of one element of the HUD, read from the page. */
  async function boxOf(
    page: Page,
    selector: string,
  ): Promise<{ left: number; top: number; width: number; height: number } | null> {
    return hud(page).evaluate((root, name) => {
      const element = root.querySelector(name);
      if (element === null) return null;
      const at = element.getBoundingClientRect();
      return { left: at.left, top: at.top, width: at.width, height: at.height };
    }, selector);
  }

  /** True while `checkVisibility` says the element is drawn. */
  async function drawn(page: Page, selector: string): Promise<boolean> {
    return hud(page).evaluate((root, name) => {
      const element = root.querySelector(name);
      return element instanceof HTMLElement && element.checkVisibility();
    }, selector);
  }

  test('the wide layout is unmoved', async ({ page }) => {
    await openHud(page);
    const left = await boxOf(page, '.gm-hud__left');
    const info = await boxOf(page, '.gm-hud__info');
    const bar = await boxOf(page, '.gm-hud__top-bar');
    const shown = {
      region: await drawn(page, '.gm-hud__region'),
      leftTab: await drawn(page, '.gm-hud__drawer-tab--left'),
      rightTab: await drawn(page, '.gm-hud__drawer-tab--right'),
      scrim: await drawn(page, '.gm-hud__scrim'),
      placeholder: await drawn(page, '.gm-hud__right-empty'),
    };
    console.log('the wide boxes', { left, info, bar }, shown);

    expect(left?.left).toBe(22);
    expect(left?.width).toBe(316);
    // The information panel is hidden while nothing is selected, so its width is read
    // with one selected below. Here the wrapper must add no box of its own.
    expect(info?.width).toBe(0);
    expect(bar?.height).toBe(54);
    expect(shown).toEqual({
      region: true,
      leftTab: false,
      rightTab: false,
      scrim: false,
      placeholder: false,
    });
  });

  test('the information panel keeps its wide box', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['Alpha']);
    await addSystems(page, [record('One', [0, 0, 100], 'Alpha')]);
    await select(page, 'One');
    await expect(hud(page).locator('.gm-hud__info')).toBeVisible();
    const info = await boxOf(page, '.gm-hud__info');
    console.log('the wide information panel', info);

    expect(info?.left).toBe(1198);
    expect(info?.top).toBe(70);
    expect(info?.width).toBe(380);
    expect(await drawn(page, '.gm-hud__right-empty')).toBe(false);
  });

  test('the wide layout keeps its sizes', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['Alpha']);
    await addSystems(page, [record('One', [0, 0, 100], 'Alpha')]);
    await select(page, 'One');
    await expect(hud(page).locator('.gm-hud__info')).toBeVisible();

    const dot = await boxOf(page, '.gm-hud__category-dot');
    const copy = await boxOf(page, '.gm-hud__copy');
    const close = await boxOf(page, '.gm-hud__info-close');
    console.log('the wide control sizes', { dot, copy, close });

    expect(dot?.width).toBe(20);
    expect(dot?.height).toBe(20);
    expect(copy?.width).toBe(20);
    expect(copy?.height).toBe(20);
    expect(close?.width).toBe(24);
    expect(close?.height).toBe(24);
  });

  test('the wide dialog is unmoved', async ({ page }) => {
    await openHud(page, { datasets: true, datasetCount: 6 });
    await hud(page).locator('.gm-hud__dataset').click();
    await expect(hud(page).locator('.gm-hud__dialog')).toBeVisible();

    const frame = await boxOf(page, '.gm-hud__dialog-frame');
    const lefts = await hud(page)
      .locator('.gm-hud__dataset-card')
      .evaluateAll((nodes) =>
        nodes.map((node) => Math.round(node.getBoundingClientRect().left)),
      );
    console.log('the wide dialog', frame, lefts);

    expect(frame?.width).toBeCloseTo(1040, 0);
    expect(frame?.height).toBeCloseTo(680, 0);
    expect(new Set(lefts).size).toBeGreaterThan(1);
  });

  test('the wide chip row wraps', async ({ page }) => {
    await openHud(page, { datasets: true, datasetCount: 8, datasetCollections: 8 });
    await hud(page).locator('.gm-hud__dataset').click();
    await expect(hud(page).locator('.gm-hud__dialog')).toBeVisible();

    const reading = await hud(page)
      .locator('.gm-hud__collections')
      .evaluate((row) => ({
        scrollWidth: row.scrollWidth,
        clientWidth: row.clientWidth,
        tops: [...row.children].map((chip) =>
          Math.round(chip.getBoundingClientRect().top),
        ),
      }));
    console.log('the wide chip row', reading);

    expect(reading.scrollWidth).toBe(reading.clientWidth);
    expect(new Set(reading.tops).size).toBeGreaterThan(1);
  });

  test('the wide layout writes no drawer state', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['Alpha']);
    await addSystems(page, [record('One', [0, 0, 100], 'Alpha')]);
    await select(page, 'One');
    await page.waitForTimeout(400);
    const held = await hud(page).evaluate((root) => root.getAttribute('data-panel'));
    console.log('the attribute at the wide width', held);
    expect(held).toBeNull();

    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => window.__hudMap?.getSelection())).toBeNull();
  });
});
