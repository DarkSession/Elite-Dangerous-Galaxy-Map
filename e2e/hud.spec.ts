import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { openMap } from './helpers';

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

/** Adds records to the HUD's map. */
async function addSystems(page: Page, records: readonly unknown[]): Promise<number> {
  return page.evaluate(
    (list) => window.__hudMap?.addSystems(list).added ?? -1,
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
    await expect(categoryRow(page, 'B').locator('.gm-hud__category-count')).toHaveText(
      '0',
    );
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
        const records: Record<string, unknown>[] = [];
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
});

test.describe('the expanded system list', () => {
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
      'POSITION (LY)',
      'DISTANCE FROM SOL',
      'RANGE',
      'ALLEGIANCE',
      'POPULATION',
    ]);
    await expect(fieldValue(page, 'POSITION (LY)')).toHaveText('55 / 17 / 27');
    await expect(fieldValue(page, 'ALLEGIANCE')).toHaveText('Independent');
    await expect(fieldValue(page, 'POPULATION')).toHaveText('85,206,935');
    await expect(hud(page).locator('.gm-hud__description')).toHaveText(
      'The pilots federation holds the only access to this system.',
    );
    await expect(hud(page).locator('.gm-hud__chip')).toHaveText(['Alpha']);
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

  // The demo records name their pictures by path. The built page must serve them, and a
  // 404 is not a cross-origin request, so the third-party test above does not see it.
  // The demo data itself loads in the dev server alone, so the record comes from the
  // same file the demo page reads and the test puts it on the map.
  test('a demo picture loads from the built page', async ({ page }) => {
    interface DemoImage {
      readonly url: string;
    }
    interface DemoSystem {
      readonly name: string;
      readonly primaryCategory: string;
      readonly secondaryCategories?: readonly string[];
      readonly images?: readonly DemoImage[];
    }
    const demo = JSON.parse(
      readFileSync(new URL('../src/app/demo-systems.json', import.meta.url), 'utf8'),
    ) as { readonly systems: readonly DemoSystem[] };
    const pictured = demo.systems.find(
      (system) => (system.images?.length ?? 0) > 0,
    ) as DemoSystem;
    expect(pictured).toBeDefined();

    await openHud(page);
    await addCategories(page, [
      pictured.primaryCategory,
      ...(pictured.secondaryCategories ?? []),
    ]);
    expect(await addSystems(page, [pictured])).toBe(1);
    await select(page, pictured.name);

    const images = hud(page).locator('.gm-hud__thumb-image');
    await expect(images).toHaveCount(pictured.images?.length ?? 0);
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
      pictured.images?.map((image) => image.url),
    );
    // The thumbnails load lazily, so the pictures are not there in the same turn as the
    // selection. The reading repeats until every picture has arrived.
    await expect
      .poll(async () =>
        (await read()).every((reading) => reading.complete && reading.width > 0),
      )
      .toBe(true);
    console.log('the demo pictures', await read());
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
    await expect(categoryRow(page, 'Beta')).toBeVisible();

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
      const records: Record<string, unknown>[] = [];
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
});
