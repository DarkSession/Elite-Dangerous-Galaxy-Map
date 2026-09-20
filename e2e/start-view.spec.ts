import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openMap } from './helpers';
import type {
  GalaxyMapOptions,
  MapView,
} from '../packages/galaxy-map/src/app/create-map';

test.use({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });

/** The record every test of this file adds, away from the origin. */
const TARGET: [number, number, number] = [1000, 0, 0];

/**
 * Builds a second map with the options a test names and waits for its first frame.
 *
 * The map is a second one and not the demo page's, because `startView` is read once when
 * the map is built. The demo page also writes the view from the URL fragment after the
 * build, which would beat the option.
 */
async function buildMap(page: Page, options: unknown): Promise<void> {
  await page.evaluate(async (settings) => {
    const factory = window.galaxyMapFactory;
    if (factory === undefined)
      throw new Error('The page holds no library entry point.');
    const wrap = document.createElement('div');
    wrap.id = 'start-wrap';
    wrap.style.cssText =
      'position: absolute; left: 0; top: 0; width: 640px; height: 480px;';
    const canvas = document.createElement('canvas');
    canvas.id = 'start-canvas';
    canvas.style.cssText = 'display: block; width: 100%; height: 100%;';
    wrap.appendChild(canvas);
    document.body.appendChild(wrap);
    const map = factory(canvas, settings as GalaxyMapOptions);
    window.__startMap = map;
    await map.ready;
  }, options);
}

test.afterEach(async ({ page }) => {
  await page.evaluate(() => {
    window.__startMap?.dispose();
    delete window.__startMap;
    document.getElementById('start-wrap')?.remove();
  });
});

/** The view of the second map. */
async function startView(page: Page): Promise<MapView | null> {
  return page.evaluate(() => window.__startMap?.getView() ?? null);
}

/** Adds the one category and the one record the pending-start tests wait for. */
async function addTarget(page: Page): Promise<void> {
  await page.evaluate((where) => {
    window.__startMap?.addCategories([{ name: 'Empire', color: [153, 230, 255] }]);
    window.__startMap?.addSystems([
      {
        name: 'Target',
        coords: { x: where[0], y: where[1], z: where[2] },
        primaryCategory: 'Empire',
      },
    ]);
  }, TARGET);
}

/** Waits until the second map has drawn two more animation frames. */
async function waitFrames(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

// The scenario "A start view at coordinates opens there".
test('a start view at coordinates opens there', async ({ page }) => {
  await openMap(page);
  await buildMap(page, {
    startView: { cursor: [1000, 0, 2000], distance: 400, yaw: 90, pitch: -20 },
  });
  const view = await startView(page);
  console.log('the view a start view opened at', view);

  expect(view).toEqual({ cursor: [1000, 0, 2000], distance: 400, yaw: 90, pitch: -20 });
});

// The scenario "A start view fills its gaps from the default".
test('a start view fills its gaps from the default', async ({ page }) => {
  await openMap(page);
  await buildMap(page, { startView: { distance: 400 } });
  const view = await startView(page);
  console.log('the view a part start view opened at', view);

  expect(view).toEqual({ cursor: [0, 0, 0], distance: 400, yaw: 0, pitch: 35 });
});

// The scenario "A start view does not fly".
test('a start view does not fly', async ({ page }) => {
  await openMap(page);
  await buildMap(page, { startView: { distance: 400 } });
  const reading = await page.evaluate(() => ({
    distance: window.__startMap?.getView().distance ?? -1,
    flight: window.__startMap?.debug.selectionFlightMs() ?? -1,
  }));
  console.log('the first frame of a start view', reading);

  expect(reading.distance).toBe(400);
  expect(reading.flight).toBe(0);
});

// The scenario "A start view on a system waits for the record".
test('a start view on a system waits for the record', async ({ page }) => {
  await openMap(page);
  await buildMap(page, { startView: { system: 'Target', distance: 400 } });
  const before = await startView(page);
  await addTarget(page);
  await waitFrames(page);
  const after = await startView(page);
  console.log('the view before and after the record', before, after);

  // The record is away from the origin, because the default cursor is the origin.
  expect(before).toEqual({ cursor: [0, 0, 0], distance: 400, yaw: 0, pitch: 35 });
  expect(after?.cursor).toEqual(TARGET);
  expect(after?.distance).toBe(400);
});

// The scenario "A start view on a system does not select it".
test('a start view on a system does not select it', async ({ page }) => {
  await openMap(page);
  await buildMap(page, { startView: { system: 'Target' } });
  await addTarget(page);
  await waitFrames(page);
  const reading = await page.evaluate(() => ({
    selection: window.__startMap?.getSelection()?.name ?? null,
    cursor: window.__startMap?.getView().cursor ?? null,
  }));
  console.log('the selection after a pending start landed', reading);

  expect(reading.selection).toBeNull();
  expect(reading.cursor).toEqual(TARGET);
});

// The scenario "The user's input drops a pending start".
test("the user's input drops a pending start", async ({ page }) => {
  await openMap(page);
  await buildMap(page, { startView: { system: 'Target' } });
  await page.evaluate(() => {
    document
      .getElementById('start-canvas')
      ?.dispatchEvent(
        new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true }),
      );
  });
  await addTarget(page);
  await waitFrames(page);
  const view = await startView(page);
  console.log('the view after a notch dropped the pending start', view);

  expect(view?.cursor).toEqual([0, 0, 0]);
});

// The scenario "A pending start expires".
test('a pending start expires', async ({ page }) => {
  await openMap(page);
  await buildMap(page, { startView: { system: 'Target' } });
  // 600 drawn frames, taken through `drawNow` rather than through 600 animation frames,
  // which would take ten seconds at 60 Hz.
  await page.evaluate(() => {
    for (let frame = 0; frame < 600; frame += 1) window.__startMap?.debug.drawNow();
  });
  await waitFrames(page);
  await addTarget(page);
  await waitFrames(page);
  const view = await startView(page);
  console.log('the view after the pending start expired', view);

  expect(view?.cursor).toEqual([0, 0, 0]);
});

// The scenario "A cursor beats a system".
test('a cursor beats a system', async ({ page }) => {
  await openMap(page);
  await buildMap(page, { startView: { cursor: [500, 0, 0], system: 'Target' } });
  await addTarget(page);
  await waitFrames(page);
  const view = await startView(page);
  console.log('the view where the host named both', view);

  expect(view?.cursor).toEqual([500, 0, 0]);
});

// The scenario "An unreadable start view opens the default".
test('an unreadable start view opens the default', async ({ page }) => {
  await openMap(page);
  await buildMap(page, { startView: { cursor: [700, 0, 0], distance: Number.NaN } });
  const view = await startView(page);
  console.log('the view an unreadable start view opened at', view);

  // The setting is ignored in whole, so the readable cursor beside the unreadable
  // distance is ignored with it.
  expect(view).toEqual({ cursor: [0, 0, 0], distance: 60000, yaw: 0, pitch: 35 });
});
