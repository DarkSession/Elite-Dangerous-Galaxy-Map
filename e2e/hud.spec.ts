import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { openMap } from './helpers';
import type { SystemRecordInput } from '../src/scene-data/real-systems';

test.use({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });

/** The colour every category in this file takes. */
const CORE: [number, number, number] = [153, 230, 255];

/** What the test asks the page to build the HUD with. */
interface HudBuild {
  /** The region overlay mode the map opens in. */
  readonly regionMode?: string;
  /** The title in the top bar. */
  readonly title?: string;
  /** One footer action, which counts its calls or throws. */
  readonly actions?: 'one' | 'throwing';
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
    const actions =
      options.actions === undefined
        ? undefined
        : [
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
    const hud =
      options.title === undefined && actions === undefined
        ? true
        : { title: options.title, actions };
    const map = factory(canvas, {
      hud,
      regionMode: options.regionMode,
    } as never);
    window.__hudMap = map;
    await map.ready;
  }, build);
}

/** The root of the HUD the tests drive. */
function hud(page: Page): Locator {
  return page.locator('#hud-wrap .gm-hud');
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
    primaryCategory: category,
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
      };
    });
    expect(left.inParent).toBe(0);
    // The canvas the caller gave stays in the page.
    expect(left.canvases).toBe(1);
  });
});

test.describe('the HUD and the map input', () => {
  test('a drag between the panels still orbits', async ({ page }) => {
    await openHud(page);
    const before = await readView(page);
    await page.mouse.move(640, 360);
    await page.mouse.down();
    await page.mouse.move(700, 390, { steps: 6 });
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
    await page.mouse.move(180, 640);
    await page.mouse.down();
    await page.mouse.move(280, 640, { steps: 6 });
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

/** The category row of a name. */
function categoryRow(page: Page, name: string): Locator {
  return hud(page).locator(`.gm-hud__category-row[data-name="${name}"]`);
}

/** The expand button of a category row. */
function expandButton(page: Page, name: string): Locator {
  return hud(page).locator(`.gm-hud__category-expand[data-name="${name}"]`);
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
    .locator('.gm-hud__category-expand[aria-expanded="true"]')
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
            primaryCategory: names[group] as string,
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
});

test.describe('the category browser', () => {
  test('a row toggles its category', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['Alpha', 'Beta']);
    await addSystems(page, [
      record('One', [0, 0, 100], 'Alpha'),
      record('Two', [0, 0, 200], 'Beta'),
    ]);
    await expect(categoryRow(page, 'Alpha')).toBeVisible();

    await categoryRow(page, 'Alpha').click();
    const count = await markerCount(page);
    const visible = await page.evaluate(
      () => window.__hudMap?.isCategoryVisible('Alpha') ?? true,
    );
    console.log('the marker count after the toggle', count);

    expect(count).toBe(1);
    expect(visible).toBe(false);
  });

  test('the counts read the primary category', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['A', 'B']);
    await addSystems(page, [
      record('One', [0, 0, 100], 'A'),
      record('Two', [0, 0, 200], 'A', { secondaryCategories: ['B'] }),
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
      record('Two', [0, 0, 200], 'A', { secondaryCategories: ['B'] }),
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
    await expect(categoryRow(page, 'Alpha')).toHaveAttribute('title', 'About Alpha');
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

    const swatch = categoryRow(page, 'Alpha').locator('.gm-hud__category-swatch');
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
    await expandButton(page, 'Alpha').click();
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
    await expandButton(page, 'Alpha').click();
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
            primaryCategory: 'Alpha',
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
    await expect(
      categoryRow(page, 'Alpha').locator('.gm-hud__category-count'),
    ).toHaveText('1,000');
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
    await expandButton(page, 'Alpha').click();

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
    await expandButton(page, 'Alpha').click();

    await hud(page).locator('.gm-hud__search').fill('sol ');
    await page.waitForTimeout(300);
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
    await categoryRow(page, 'B').click();
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

    await expandButton(page, 'Beta').click();
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
    await expandButton(page, 'C').click();
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

    await expandButton(page, 'Alpha').click();
    await expect(systemRows(page)).toHaveCount(1);
    await expect(systemRows(page).first()).toHaveAttribute('data-name', 'One');

    await expandButton(page, 'Beta').click();
    await expect(systemRows(page)).toHaveCount(1);
    await expect(systemRows(page).first()).toHaveAttribute('data-name', 'Two');

    await expandButton(page, 'Beta').click();
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
          primaryCategory: 'Alpha',
        });
      }
      return window.__hudMap?.addSystems(records).added ?? -1;
    });
    expect(added).toBe(1000);
    await expect(categoryRow(page, 'Alpha')).toBeVisible();

    await expandButton(page, 'Alpha').click();
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

    await expandButton(page, 'Alpha').click();
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
      record('Both', [0, 0, 100], 'A', { secondaryCategories: ['B'] }),
    ]);
    await expect(categoryRow(page, 'A')).toBeVisible();

    await expandButton(page, 'A').click();
    await expect(systemRows(page)).toHaveCount(1);
    await expect(systemRows(page).first()).toHaveAttribute('data-name', 'Both');

    await expandButton(page, 'B').click();
    await expect(systemRows(page)).toHaveCount(1);
    await expect(systemRows(page).first()).toHaveAttribute('data-name', 'Both');
  });

  test('a row holds the name alone', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['Alpha']);
    await addSystems(page, [record('Sol', [0, 0, 0], 'Alpha')]);
    await expect(categoryRow(page, 'Alpha')).toBeVisible();

    await expandButton(page, 'Alpha').click();
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

    await expandButton(page, 'Alpha').click();
    await categoryRow(page, 'Alpha').click();
    expect(
      await page.evaluate(() => window.__hudMap?.isCategoryVisible('Alpha') ?? true),
    ).toBe(false);

    await systemRows(page).first().click();
    expect(
      await page.evaluate(() => window.__hudMap?.isCategoryVisible('Alpha') ?? false),
    ).toBe(true);
  });
});

test.describe('the map options panel', () => {
  test('the region buttons change the mode', async ({ page }) => {
    await openHud(page);
    await hud(page).locator('.gm-hud__segment[data-name="accurate"]').click();
    expect(await page.evaluate(() => window.__hudMap?.getRegionMode())).toBe(
      'accurate',
    );
    await expect(
      hud(page).locator('.gm-hud__segment[data-name="accurate"]'),
    ).toHaveAttribute('aria-pressed', 'true');

    await hud(page).locator('.gm-hud__segment[data-name="off"]').click();
    expect(await page.evaluate(() => window.__hudMap?.getRegionMode())).toBe('off');
    await expect(
      hud(page).locator('.gm-hud__segment[data-name="off"]'),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(
      hud(page).locator('.gm-hud__segment[data-name="accurate"]'),
    ).toHaveAttribute('aria-pressed', 'false');
  });

  test('the panel opens on the mode the options named', async ({ page }) => {
    await openHud(page, { regionMode: 'accurate' });
    await expect(
      hud(page).locator('.gm-hud__segment[data-name="accurate"]'),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  test('the switches call the map and open off', async ({ page }) => {
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
    await openHud(page);
    await page.evaluate(() => window.__hudMap?.setGridVisible(true));
    await expect(
      hud(page).locator('.gm-hud__toggle[data-name="coordinate-grid"]'),
    ).toHaveAttribute('aria-pressed', 'true');
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

    expect(value).toBe('-9,530.938 / -910.281 / 19,808.125');
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
    // field passes 1,000 and neither shows a separator.
    expect(fromSol).toMatch(/^\d+ LY$/);
    expect(range).toMatch(/^\d+ LY$/);
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
    expect(read.text).toBe('-9,530.938 / -910.281 / 19,808.125');
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

  test('Enter and Space work a control', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['Alpha']);
    await expect(categoryRow(page, 'Alpha')).toBeVisible();

    await categoryRow(page, 'Alpha').focus();
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
    await openHud(page);
    await addCategories(page, ['Alpha', 'Beta']);
    await addSystems(page, [record('Tabbed', [0, 0, 100], 'Alpha')]);
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
      'gm-hud__category-row|Alpha',
      'gm-hud__category-row|Beta',
      'gm-hud__bulk-button|all',
      'gm-hud__bulk-button|none',
      'gm-hud__segment|off',
      'gm-hud__segment|simplified',
      'gm-hud__segment|accurate',
      'gm-hud__toggle|system-names',
      'gm-hud__toggle|coordinate-grid',
      'gm-hud__reset|',
      'gm-hud__copy|name',
      'gm-hud__copy|position',
    ];
    for (const entry of wanted) {
      expect(seen.filter((name) => name === entry)).toHaveLength(1);
    }
  });

  test('the controls carry their state and their names', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['Alpha']);
    await expect(categoryRow(page, 'Alpha')).toBeVisible();

    const segments = await hud(page)
      .locator('.gm-hud__segment')
      .evaluateAll((nodes) =>
        nodes.map((node) => ({
          pressed: node.getAttribute('aria-pressed'),
          text: node.textContent ?? '',
        })),
      );
    console.log('the region segments', segments);
    expect(segments.filter((entry) => entry.pressed === 'true')).toHaveLength(1);
    for (const entry of segments) expect(entry.text.length).toBeGreaterThan(0);

    await expect(
      hud(page).locator('.gm-hud__toggle[data-name="system-names"]'),
    ).toHaveAttribute('aria-pressed', 'false');
    await expect(
      hud(page).locator('.gm-hud__toggle[data-name="coordinate-grid"]'),
    ).toHaveAttribute('aria-pressed', 'false');
    await expect(categoryRow(page, 'Alpha')).toHaveAttribute('aria-pressed', 'true');
    await expect(categoryRow(page, 'Alpha')).toContainText('Alpha');
    await expect(expandButton(page, 'Alpha')).toHaveAttribute(
      'aria-label',
      'List systems',
    );
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
  // A selection flies the camera for 350 ms, and the top bar follows the view each frame
  // of the flight. The reading below is of a still map, so the flight is off.
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('the HUD adds no work to a still frame', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['Alpha']);
    await addSystems(page, [record('Bare', [0, 0, 100], 'Alpha')]);
    await select(page, 'Bare');
    // The view-driven readouts settle inside 200 ms, so the count starts after them.
    await page.waitForTimeout(300);

    const writes = await page.evaluate(async () => {
      const root = document.querySelector('#hud-wrap .gm-hud');
      if (root === null) return -1;
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
      for (let frame = 0; frame < 120; frame += 1) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
      observer.disconnect();
      return count;
    });
    console.log('the HUD DOM writes over 120 still frames', writes);

    expect(writes).toBe(0);
  });

  test('the node count does not follow the set', async ({ page }) => {
    await openHud(page);
    await addCategories(page, ['Alpha']);
    const added = await page.evaluate(() => {
      const records: SystemRecordInput[] = [];
      let state = 4711;
      const unit = (): number => {
        state = (state * 1103515245 + 12345) & 0x7fffffff;
        return state / 0x7fffffff;
      };
      for (let index = 0; index < 10000; index += 1) {
        records.push({
          name: `S${String(index).padStart(5, '0')}`,
          coords: {
            x: -49985 + unit() * 100000,
            y: -40985 + unit() * 81910,
            z: -24105 + unit() * 100000,
          },
          primaryCategory: 'Alpha',
        });
      }
      return window.__hudMap?.addSystems(records).added ?? -1;
    });
    expect(added).toBe(10000);

    await expect(categoryRow(page, 'Alpha')).toBeVisible();
    await expandButton(page, 'Alpha').click();
    await expect(systemRows(page)).toHaveCount(200);

    const nodes = await page.evaluate(
      () => document.querySelectorAll('#hud-wrap .gm-hud *').length,
    );
    console.log('the HUD element count with 10,000 systems', nodes);

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
