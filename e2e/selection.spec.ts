import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openMap } from './helpers';

test.use({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });

/** The colour every category in this file takes. */
const CORE: [number, number, number] = [153, 230, 255];

/** The pitch every view in this file takes, unless a test names another. */
const PITCH = 35;

/**
 * A point at an exact range from the camera of a view, near the middle of the screen.
 * `cameraDirection` puts the camera at `cursor + distance * (0, sin(pitch), -cos(pitch))`
 * at a yaw of 0, so `lateral` moves the point sideways on the screen and leaves the
 * range alone.
 */
function atRange(
  cursor: readonly [number, number, number],
  distance: number,
  range: number,
  lateral = 0,
): [number, number, number] {
  const pitch = (PITCH * Math.PI) / 180;
  const along = Math.sqrt(range * range - lateral * lateral);
  return [
    cursor[0] + lateral,
    cursor[1] + Math.sin(pitch) * (distance - along),
    cursor[2] - Math.cos(pitch) * (distance - along),
  ];
}

/** A record the reader accepts. */
function record(
  name: string,
  position: readonly [number, number, number],
  category: string,
  id64?: string,
): Record<string, unknown> {
  const value: Record<string, unknown> = {
    name,
    coords: { x: position[0], y: position[1], z: position[2] },
    primaryCategory: category,
  };
  if (id64 !== undefined) value['id64'] = id64;
  return value;
}

/** Adds one category that draws at every range. */
async function addCategory(page: Page, name: string): Promise<void> {
  await page.evaluate(
    (value) => {
      window.galaxyMap?.addCategories([
        { name: value.name, color: value.color, maxDrawRange: 200000 },
      ]);
    },
    { name, color: CORE },
  );
}

/** Adds records through the handle. */
async function addSystems(page: Page, records: readonly unknown[]): Promise<number> {
  return page.evaluate(
    (list) => window.galaxyMap?.addSystems(list).added ?? -1,
    records,
  );
}

/** Replaces the view and draws one frame. */
async function setView(
  page: Page,
  cursor: readonly [number, number, number],
  distance: number,
  yaw = 0,
  pitch = PITCH,
): Promise<void> {
  await page.evaluate(
    (next) => {
      window.galaxyMap?.setView({
        cursor: next.cursor as [number, number, number],
        distance: next.distance,
        yaw: next.yaw,
        pitch: next.pitch,
      });
      window.galaxyMap?.debug.drawNow();
    },
    { cursor, distance, yaw, pitch },
  );
}

/** Draws one frame. */
async function drawFrame(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.galaxyMap?.debug.drawNow();
  });
}

/** Waits until the page has drawn two more animation frames. */
async function waitFrames(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

/** The CSS pixel a game position projects to. */
async function projectOf(
  page: Page,
  point: readonly [number, number, number],
): Promise<{ x: number; y: number }> {
  return page.evaluate(
    (where) =>
      window.galaxyMap?.debug.project(where as [number, number, number]) ?? {
        x: -1,
        y: -1,
      },
    point,
  );
}

/** The name of the system under a canvas pixel, or null. */
async function nameAt(page: Page, x: number, y: number): Promise<string | null> {
  return page.evaluate(
    (where) => window.galaxyMap?.systemAt(where.x, where.y)?.name ?? null,
    { x, y },
  );
}

/** Starts a log of every selection the listeners hear. */
async function watchSelection(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.__selectionLog = [];
    window.galaxyMap?.onSelectionChange((system) => {
      window.__selectionLog?.push(system === null ? null : system.name);
    });
  });
}

/** Reads the log of selections. */
async function selectionLog(page: Page): Promise<(string | null)[]> {
  return page.evaluate(() => window.__selectionLog ?? []);
}

/** The name of the selected system, or null. */
async function selectionName(page: Page): Promise<string | null> {
  return page.evaluate(() => window.galaxyMap?.getSelection()?.name ?? null);
}

/** The name of the hovered system, or null. */
async function hoverName(page: Page): Promise<string | null> {
  return page.evaluate(() => window.galaxyMap?.getHover()?.name ?? null);
}

/** The view as the handle reads it. */
async function readView(page: Page): Promise<{
  cursor: [number, number, number];
  distance: number;
  yaw: number;
  pitch: number;
}> {
  return page.evaluate(
    () =>
      window.galaxyMap?.getView() ?? {
        cursor: [0, 0, 0] as [number, number, number],
        distance: 0,
        yaw: 0,
        pitch: 0,
      },
  );
}

test.describe('the pick', () => {
  test('names the system under each marker', async ({ page }) => {
    const cursor: [number, number, number] = [0, 0, 0];
    await openMap(page, '#c=0,0,0&d=1000&p=35&y=0');
    await addCategory(page, 'Alpha');
    const places: [number, number, number][] = [
      [-200, 0, 0],
      [0, 0, 0],
      [200, 0, 0],
    ];
    await addSystems(
      page,
      places.map((place, index) => record(`S${index}`, place, 'Alpha')),
    );
    await setView(page, cursor, 1000);

    const names: (string | null)[] = [];
    for (const place of places) {
      const screen = await projectOf(page, place);
      names.push(await nameAt(page, screen.x, screen.y));
    }
    console.log('the pick under each marker', names);

    expect(names).toEqual(['S0', 'S1', 'S2']);
  });

  test('holds the pick radius at the floor and at the cap', async ({ page }) => {
    const cursor: [number, number, number] = [0, 0, 0];
    await openMap(page, '#c=0,0,0&d=1000&p=35&y=0');
    await addCategory(page, 'Alpha');
    // At 720 CSS rows the disc is `623.5 * 20 / range` CSS pixels, clamped to 7 and 12.
    // A range of 3,000 reads the floor of 7 and a range of 500 reads the cap of 12, so
    // the pick radius is 7.5 and 10 CSS pixels.
    const far = atRange(cursor, 1000, 3000);
    const near = atRange(cursor, 1000, 500);
    await addSystems(page, [record('Far', far, 'Alpha')]);
    await setView(page, cursor, 1000);
    const farScreen = await projectOf(page, far);
    const insideFloor = await nameAt(page, farScreen.x + 7, farScreen.y);
    const outsideFloor = await nameAt(page, farScreen.x + 8, farScreen.y);

    await page.evaluate(() => {
      window.galaxyMap?.clearSystems();
    });
    await addSystems(page, [record('Near', near, 'Alpha')]);
    await drawFrame(page);
    const nearScreen = await projectOf(page, near);
    const insideCap = await nameAt(page, nearScreen.x + 10, nearScreen.y);
    const outsideCap = await nameAt(page, nearScreen.x + 11, nearScreen.y);
    console.log('the pick radius', {
      insideFloor,
      outsideFloor,
      insideCap,
      outsideCap,
    });

    expect(insideFloor).toBe('Far');
    expect(outsideFloor).toBeNull();
    expect(insideCap).toBe('Near');
    expect(outsideCap).toBeNull();
  });

  test('takes the nearer of two overlapping markers', async ({ page }) => {
    const cursor: [number, number, number] = [0, 0, 0];
    await openMap(page, '#c=0,0,0&d=1000&p=35&y=0');
    await addCategory(page, 'Alpha');
    const nearPlace = atRange(cursor, 1000, 400);
    const farPlace = atRange(cursor, 1000, 900);
    await addSystems(page, [
      record('Far', farPlace, 'Alpha'),
      record('Near', nearPlace, 'Alpha'),
    ]);
    await setView(page, cursor, 1000);

    const nearScreen = await projectOf(page, nearPlace);
    const farScreen = await projectOf(page, farPlace);
    const gap = Math.hypot(nearScreen.x - farScreen.x, nearScreen.y - farScreen.y);
    const name = await nameAt(page, nearScreen.x, nearScreen.y);
    console.log('the overlapping markers', { gap, name });

    expect(gap).toBeLessThan(1);
    expect(name).toBe('Near');
  });

  test('finds nothing behind the camera', async ({ page }) => {
    const cursor: [number, number, number] = [0, 0, 0];
    await openMap(page, '#c=0,0,0&d=1000&p=35&y=0');
    await addCategory(page, 'Alpha');
    await addSystems(page, [record('One', atRange(cursor, 1000, 400), 'Alpha')]);
    await setView(page, cursor, 1000);
    // A yaw of 180 turns the camera around the cursor, so the system stands behind it.
    await setView(page, cursor, 1000, 180);

    const names: (string | null)[] = [];
    for (const [x, y] of [
      [1, 1],
      [1279, 1],
      [1, 719],
      [1279, 719],
      [640, 360],
    ]) {
      names.push(await nameAt(page, x as number, y as number));
    }
    console.log('behind the camera', names);

    expect(names.every((name) => name === null)).toBe(true);
  });

  test('finds nothing in a category that is off', async ({ page }) => {
    const cursor: [number, number, number] = [0, 0, 0];
    const place = atRange(cursor, 1000, 400);
    await openMap(page, '#c=0,0,0&d=1000&p=35&y=0');
    await addCategory(page, 'Alpha');
    await addSystems(page, [record('One', place, 'Alpha')]);
    await setView(page, cursor, 1000);
    const screen = await projectOf(page, place);
    const before = await nameAt(page, screen.x, screen.y);

    await page.evaluate(() => {
      window.galaxyMap?.setCategoryVisible('Alpha', false);
    });
    await drawFrame(page);
    const after = await nameAt(page, screen.x, screen.y);
    console.log('the hidden category', { before, after });

    expect(before).toBe('One');
    expect(after).toBeNull();
  });

  test('finds nothing the name filter drops', async ({ page }) => {
    const cursor: [number, number, number] = [0, 0, 0];
    const place = atRange(cursor, 1000, 400);
    await openMap(page, '#c=0,0,0&d=1000&p=35&y=0');
    await addCategory(page, 'Alpha');
    await addSystems(page, [record('Sol', place, 'Alpha')]);
    await setView(page, cursor, 1000);
    const screen = await projectOf(page, place);
    const before = await nameAt(page, screen.x, screen.y);

    await page.evaluate(() => {
      window.galaxyMap?.setNameFilter('zzz');
    });
    await drawFrame(page);
    const after = await nameAt(page, screen.x, screen.y);
    console.log('the filtered marker', { before, after });

    expect(before).toBe('Sol');
    expect(after).toBeNull();
  });

  test('holds its time bound at a full set', async ({ page }) => {
    const cursor: [number, number, number] = [0, 0, 0];
    await openMap(page, '#c=0,0,0&d=4000&p=35&y=0');
    await addCategory(page, 'Alpha');
    const added = await page.evaluate(() => {
      const records: Record<string, unknown>[] = [];
      for (let index = 0; index < 10000; index += 1) {
        const column = index % 100;
        const row = Math.floor(index / 100);
        records.push({
          name: `S${index}`,
          coords: { x: (column - 50) * 20, y: (row - 50) * 20, z: 0 },
          primaryCategory: 'Alpha',
        });
      }
      return window.galaxyMap?.addSystems(records).added ?? -1;
    });
    await setView(page, cursor, 4000);

    const mean = await page.evaluate(() => {
      const map = window.galaxyMap;
      if (map === undefined) return -1;
      // A warm-up call keeps the compiler's first pass out of the reading.
      map.systemAt(640, 360);
      const start = performance.now();
      for (let index = 0; index < 200; index += 1) {
        map.systemAt(320 + (index % 640), 180 + (index % 360));
      }
      return (performance.now() - start) / 200;
    });
    console.log('the pick over a full set', { added, mean });

    expect(added).toBe(10000);
    expect(mean).toBeLessThanOrEqual(1);
  });
});

test.describe('the selection', () => {
  test('a click selects and the listener hears it', async ({ page }) => {
    const cursor: [number, number, number] = [0, 0, 0];
    const place = atRange(cursor, 1000, 400);
    await openMap(page, '#c=0,0,0&d=1000&p=35&y=0');
    await addCategory(page, 'Alpha');
    await addSystems(page, [record('One', place, 'Alpha')]);
    await setView(page, cursor, 1000);
    await watchSelection(page);

    const screen = await projectOf(page, place);
    await page.mouse.move(screen.x, screen.y);
    await page.mouse.down({ button: 'left' });
    await page.waitForTimeout(100);
    await page.mouse.up({ button: 'left' });

    const log = await selectionLog(page);
    const name = await selectionName(page);
    console.log('the click', { log, name });

    expect(log).toEqual(['One']);
    expect(name).toBe('One');
  });

  test('a drag does not select', async ({ page }) => {
    const cursor: [number, number, number] = [0, 0, 0];
    const place = atRange(cursor, 1000, 400);
    await openMap(page, '#c=0,0,0&d=1000&p=35&y=0');
    await addCategory(page, 'Alpha');
    await addSystems(page, [record('One', place, 'Alpha')]);
    await setView(page, cursor, 1000);
    await watchSelection(page);

    const screen = await projectOf(page, place);
    await page.mouse.move(screen.x, screen.y);
    await page.mouse.down({ button: 'left' });
    await page.mouse.move(screen.x + 40, screen.y, { steps: 4 });
    await page.mouse.move(screen.x, screen.y, { steps: 4 });
    await page.waitForTimeout(100);
    await page.mouse.up({ button: 'left' });

    const log = await selectionLog(page);
    const name = await selectionName(page);
    console.log('the drag', { log, name });

    expect(log).toEqual([]);
    expect(name).toBeNull();
  });

  test('a click on empty space keeps the selection', async ({ page }) => {
    const cursor: [number, number, number] = [0, 0, 0];
    const place = atRange(cursor, 1000, 400);
    await openMap(page, '#c=0,0,0&d=1000&p=35&y=0');
    await addCategory(page, 'Alpha');
    await addSystems(page, [record('One', place, 'Alpha')]);
    await setView(page, cursor, 1000);
    await page.evaluate(() => {
      window.galaxyMap?.setSelection('One');
    });

    const screen = await projectOf(page, place);
    await page.mouse.move(screen.x + 200, screen.y);
    await page.mouse.down({ button: 'left' });
    await page.waitForTimeout(100);
    await page.mouse.up({ button: 'left' });

    expect(await selectionName(page)).toBe('One');
  });

  test('the hover follows the pointer and clears on leave', async ({ page }) => {
    const cursor: [number, number, number] = [0, 0, 0];
    const place = atRange(cursor, 1000, 400);
    await openMap(page, '#c=0,0,0&d=1000&p=35&y=0');
    await addCategory(page, 'Alpha');
    await addSystems(page, [record('One', place, 'Alpha')]);
    await setView(page, cursor, 1000);

    const screen = await projectOf(page, place);
    await page.mouse.move(screen.x, screen.y);
    await waitFrames(page);
    const onMarker = await hoverName(page);

    // A pointer that leaves the canvas clears the hover. The canvas fills the window,
    // so the test raises the event the browser raises when the pointer leaves it.
    await page.evaluate(() => {
      document.getElementById('map')?.dispatchEvent(new PointerEvent('pointerleave'));
    });
    await waitFrames(page);
    const offCanvas = await hoverName(page);
    console.log('the hover', { onMarker, offCanvas });

    expect(onMarker).toBe('One');
    expect(offCanvas).toBeNull();
  });

  test('the hover follows a camera move with the pointer still', async ({ page }) => {
    const cursor: [number, number, number] = [0, 0, 0];
    const place = atRange(cursor, 1000, 400);
    await openMap(page, '#c=0,0,0&d=1000&p=35&y=0');
    await addCategory(page, 'Alpha');
    await addSystems(page, [record('One', place, 'Alpha')]);
    // The first view puts the marker 300 CSS pixels left of the middle of the screen.
    await setView(page, [400, 0, 0], 1000);

    await page.mouse.move(640, 360);
    await waitFrames(page);
    const before = await hoverName(page);

    await setView(page, cursor, 1000);
    await waitFrames(page);
    const after = await hoverName(page);
    console.log('the hover after a camera move', { before, after });

    expect(before).toBeNull();
    expect(after).toBe('One');
  });

  test('a replaced record keeps the selection', async ({ page }) => {
    const cursor: [number, number, number] = [0, 0, 0];
    const place = atRange(cursor, 1000, 400);
    await openMap(page, '#c=0,0,0&d=1000&p=35&y=0');
    await addCategory(page, 'Alpha');
    await addSystems(page, [record('First', place, 'Alpha', '1000')]);
    await setView(page, cursor, 1000);
    await page.evaluate(() => {
      window.galaxyMap?.setSelection('1000');
    });
    await watchSelection(page);

    await addSystems(page, [record('Second', place, 'Alpha', '1000')]);
    const log = await selectionLog(page);
    const name = await selectionName(page);
    console.log('the replaced record', { log, name });

    expect(name).toBe('Second');
    expect(log).toEqual([]);
  });

  test('clearing the set clears the selection', async ({ page }) => {
    const cursor: [number, number, number] = [0, 0, 0];
    const place = atRange(cursor, 1000, 400);
    await openMap(page, '#c=0,0,0&d=1000&p=35&y=0');
    await addCategory(page, 'Alpha');
    await addSystems(page, [record('One', place, 'Alpha')]);
    await setView(page, cursor, 1000);
    await page.evaluate(() => {
      window.galaxyMap?.setSelection('One');
    });
    await watchSelection(page);

    await page.evaluate(() => {
      window.galaxyMap?.clearSystems();
    });
    const log = await selectionLog(page);
    console.log('the cleared set', log);

    expect(await selectionName(page)).toBeNull();
    expect(log).toEqual([null]);
  });

  test('an unknown identity clears the selection', async ({ page }) => {
    const cursor: [number, number, number] = [0, 0, 0];
    const place = atRange(cursor, 1000, 400);
    await openMap(page, '#c=0,0,0&d=1000&p=35&y=0');
    await addCategory(page, 'Alpha');
    await addSystems(page, [record('One', place, 'Alpha')]);
    await setView(page, cursor, 1000);
    await page.evaluate(() => {
      window.galaxyMap?.setSelection('One');
      window.galaxyMap?.setSelection('nothing');
    });

    expect(await selectionName(page)).toBeNull();
  });

  test('a hidden selected system stays selected', async ({ page }) => {
    const cursor: [number, number, number] = [0, 0, 0];
    const place = atRange(cursor, 1000, 400);
    await openMap(page, '#c=0,0,0&d=1000&p=35&y=0');
    await addCategory(page, 'Alpha');
    await addSystems(page, [record('One', place, 'Alpha')]);
    await setView(page, cursor, 1000);
    await page.evaluate(() => {
      window.galaxyMap?.setSelection('One');
      window.galaxyMap?.setCategoryVisible('Alpha', false);
    });
    await drawFrame(page);

    const markers = await page.evaluate(
      () => window.galaxyMap?.debug.systemMarkerCount() ?? -1,
    );
    console.log('the hidden selection', { markers });

    expect(await selectionName(page)).toBe('One');
    expect(markers).toBe(0);
  });
});

test.describe('the selection view rule', () => {
  test('a far selection comes in to 500 light years', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=20000&p=60&y=40');
    await addCategory(page, 'Alpha');
    const place: [number, number, number] = [400, 0, 0];
    await addSystems(page, [record('One', place, 'Alpha')]);
    await setView(page, [0, 0, 0], 20000, 40, 60);

    await page.evaluate(() => {
      window.galaxyMap?.setSelection('One');
    });
    const view = await readView(page);
    console.log('the far selection', view);

    expect(view.cursor).toEqual(place);
    expect(view.distance).toBe(500);
    expect(view.yaw).toBeCloseTo(40, 6);
    expect(view.pitch).toBeCloseTo(60, 6);
  });

  test('a close view keeps its distance', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=100&p=35&y=0');
    await addCategory(page, 'Alpha');
    const place: [number, number, number] = [40, 0, 0];
    await addSystems(page, [record('One', place, 'Alpha')]);
    await setView(page, [0, 0, 0], 100);

    await page.evaluate(() => {
      window.galaxyMap?.setSelection('One');
    });
    const view = await readView(page);
    console.log('the close view', view);

    expect(view.cursor).toEqual(place);
    expect(view.distance).toBe(100);
  });

  test('a selection at exactly 500 light years keeps its distance', async ({
    page,
  }) => {
    await openMap(page, '#c=0,0,0&d=500&p=35&y=0');
    await addCategory(page, 'Alpha');
    const place: [number, number, number] = [100, 0, 0];
    await addSystems(page, [record('One', place, 'Alpha')]);
    await setView(page, [0, 0, 0], 500);

    await page.evaluate(() => {
      window.galaxyMap?.setSelection('One');
    });
    const view = await readView(page);
    console.log('the selection at 500', view);

    expect(view.cursor).toEqual(place);
    expect(view.distance).toBe(500);
  });

  test('a click at a far view centres and comes in', async ({ page }) => {
    const cursor: [number, number, number] = [0, 0, 0];
    const place = atRange(cursor, 20000, 19000);
    await openMap(page, '#c=0,0,0&d=20000&p=35&y=0');
    await addCategory(page, 'Alpha');
    await addSystems(page, [record('One', place, 'Alpha')]);
    await setView(page, cursor, 20000);

    const screen = await projectOf(page, place);
    await page.mouse.move(screen.x, screen.y);
    await page.mouse.down({ button: 'left' });
    await page.waitForTimeout(100);
    await page.mouse.up({ button: 'left' });

    const view = await readView(page);
    const name = await selectionName(page);
    console.log('the click at a far view', { view, name });

    expect(name).toBe('One');
    expect(view.distance).toBe(500);
    for (let axis = 0; axis < 3; axis += 1) {
      expect(
        Math.abs((view.cursor[axis] as number) - (place[axis] as number)),
      ).toBeLessThan(1e-6);
    }
  });

  test('the selected system sits at the centre of the screen', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=20000&p=35&y=0');
    await addCategory(page, 'Alpha');
    const far: [number, number, number] = [400, 0, 0];
    const near: [number, number, number] = [-300, 0, 0];
    await addSystems(page, [
      record('Far', far, 'Alpha'),
      record('Near', near, 'Alpha'),
    ]);

    await setView(page, [0, 0, 0], 20000);
    await page.evaluate(() => {
      window.galaxyMap?.setSelection('Far');
    });
    await drawFrame(page);
    const farScreen = await projectOf(page, far);

    await setView(page, [0, 0, 0], 100);
    await page.evaluate(() => {
      window.galaxyMap?.setSelection('Near');
    });
    await drawFrame(page);
    const nearScreen = await projectOf(page, near);
    console.log('the centred selection', { farScreen, nearScreen });

    for (const screen of [farScreen, nearScreen]) {
      expect(Math.abs(screen.x - 640)).toBeLessThanOrEqual(1);
      expect(Math.abs(screen.y - 360)).toBeLessThanOrEqual(1);
    }
  });

  test('clearing the selection leaves the view', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=20000&p=35&y=0');
    await addCategory(page, 'Alpha');
    await addSystems(page, [record('One', [400, 0, 0], 'Alpha')]);
    await setView(page, [0, 0, 0], 20000);

    await page.evaluate(() => {
      window.galaxyMap?.setSelection('One');
    });
    const before = await readView(page);
    await page.evaluate(() => {
      window.galaxyMap?.setSelection(null);
    });
    const after = await readView(page);
    console.log('the cleared selection', { before, after });

    expect(after).toEqual(before);
  });
});

/** How many of each mark the overlay holds. */
async function markCounts(page: Page): Promise<{
  pins: number;
  rings: number;
  labels: number;
}> {
  return page.evaluate(() => ({
    pins: document.querySelectorAll('.gm-system-pin').length,
    rings: document.querySelectorAll('.gm-system-ring').length,
    labels: document.querySelectorAll('.gm-system-label').length,
  }));
}

/** The box of the first element of a class, in CSS pixels. */
async function boxOf(
  page: Page,
  selector: string,
): Promise<{ left: number; top: number; right: number; bottom: number } | null> {
  return page.evaluate((name) => {
    const element = document.querySelector(name);
    if (element === null) return null;
    const box = element.getBoundingClientRect();
    return { left: box.left, top: box.top, right: box.right, bottom: box.bottom };
  }, selector);
}

test.describe('the overlay marks', () => {
  test('the pin draws over the selected marker', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=1000&p=35&y=0');
    await addCategory(page, 'Alpha');
    const place: [number, number, number] = [100, 0, 0];
    await addSystems(page, [record('One', place, 'Alpha')]);
    await setView(page, [0, 0, 0], 1000);
    await page.evaluate(() => {
      window.galaxyMap?.setSelection('One');
    });
    await drawFrame(page);

    // The selection puts the system at the cursor at a distance of 500 light years, so
    // its range is 500 and its disc reads the cap of 12 CSS pixels.
    const marker = await projectOf(page, place);
    const box = await boxOf(page, '.gm-system-pin');
    const fill = await page.evaluate(
      () => document.querySelector('.gm-system-pin path')?.getAttribute('fill') ?? '',
    );
    const counts = await markCounts(page);
    console.log('the pin', { marker, box, fill });

    expect(counts.pins).toBe(1);
    expect(fill).toBe('#00CDF7');
    expect(box).not.toBeNull();
    const tip = (box as { bottom: number }).bottom;
    expect(Math.abs(tip - (marker.y - (12 / 2 + 2)))).toBeLessThanOrEqual(1);
  });

  test('only the selected system carries a pin', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=1000&p=35&y=0');
    await addCategory(page, 'Alpha');
    await addSystems(page, [
      record('One', [-100, 0, 0], 'Alpha'),
      record('Two', [0, 0, 0], 'Alpha'),
      record('Three', [100, 0, 0], 'Alpha'),
    ]);
    await setView(page, [0, 0, 0], 1000);
    await page.evaluate(() => {
      window.galaxyMap?.setSelection('Two');
    });
    await drawFrame(page);

    expect((await markCounts(page)).pins).toBe(1);
  });

  test('the pin goes when the marker goes', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=1000&p=35&y=0');
    await addCategory(page, 'Alpha');
    await addSystems(page, [record('One', [100, 0, 0], 'Alpha')]);
    await setView(page, [0, 0, 0], 1000);
    await page.evaluate(() => {
      window.galaxyMap?.setSelection('One');
      window.galaxyMap?.setCategoryVisible('Alpha', false);
    });
    await drawFrame(page);
    const off = (await markCounts(page)).pins;

    await page.evaluate(() => {
      window.galaxyMap?.setCategoryVisible('Alpha', true);
    });
    await drawFrame(page);
    const on = (await markCounts(page)).pins;
    console.log('the pin and the marker', { off, on });

    expect(off).toBe(0);
    expect(on).toBe(1);
  });

  test('the pin follows the marker through a camera move', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=1000&p=35&y=0');
    await addCategory(page, 'Alpha');
    const place: [number, number, number] = [0, 0, 0];
    await addSystems(page, [record('One', place, 'Alpha')]);
    await page.evaluate(() => {
      window.galaxyMap?.setSelection('One');
    });
    // The cursor moves off the system, so an orbit moves the marker on the screen. The
    // range stays under 1,039 light years, where the disc holds the cap of 12, so the
    // offset the pin keeps is the same at both readings.
    await setView(page, [200, 0, 0], 500);
    await drawFrame(page);

    const readOffset = async (): Promise<number> => {
      const marker = await projectOf(page, place);
      const box = await boxOf(page, '.gm-system-pin');
      return marker.y - (box as { bottom: number }).bottom;
    };
    const before = await readOffset();
    const beforeScreen = await projectOf(page, place);

    await page.mouse.move(640, 360);
    await page.mouse.down({ button: 'left' });
    await page.mouse.move(700, 360, { steps: 6 });
    await page.mouse.up({ button: 'left' });
    await drawFrame(page);

    const after = await readOffset();
    const afterScreen = await projectOf(page, place);
    console.log('the pin through an orbit', {
      before,
      after,
      beforeScreen,
      afterScreen,
    });

    expect(Math.abs(afterScreen.x - beforeScreen.x)).toBeGreaterThan(10);
    expect(Math.abs(after - before)).toBeLessThanOrEqual(1);
  });

  test('the ring appears and goes with the hover', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=1000&p=35&y=0');
    await addCategory(page, 'Alpha');
    const place = atRange([0, 0, 0], 1000, 400);
    await addSystems(page, [record('One', place, 'Alpha')]);
    await setView(page, [0, 0, 0], 1000);

    const screen = await projectOf(page, place);
    await page.mouse.move(screen.x, screen.y);
    await waitFrames(page);
    const onMarker = (await markCounts(page)).rings;

    await page.mouse.move(screen.x + 200, screen.y);
    await waitFrames(page);
    const away = (await markCounts(page)).rings;
    console.log('the ring', { onMarker, away });

    expect(onMarker).toBe(1);
    expect(away).toBe(0);
  });

  test('a hovered and selected system carries both marks', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=1000&p=35&y=0');
    await addCategory(page, 'Alpha');
    const place: [number, number, number] = [0, 0, 0];
    await addSystems(page, [record('One', place, 'Alpha')]);
    await page.evaluate(() => {
      window.galaxyMap?.setSelection('One');
    });
    await waitFrames(page);

    const screen = await projectOf(page, place);
    await page.mouse.move(screen.x, screen.y);
    await waitFrames(page);

    const counts = await markCounts(page);
    const ring = await boxOf(page, '.gm-system-ring');
    const pin = await boxOf(page, '.gm-system-pin');
    console.log('both marks', { counts, ring, pin, screen });

    expect(counts.rings).toBe(1);
    expect(counts.pins).toBe(1);
    const ringBox = ring as { left: number; right: number };
    const pinBox = pin as { left: number; right: number };
    expect(Math.abs((ringBox.left + ringBox.right) / 2 - screen.x)).toBeLessThan(1);
    expect(Math.abs((pinBox.left + pinBox.right) / 2 - screen.x)).toBeLessThan(1);
  });

  test('the switch turns the name labels on and off', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=1000&p=35&y=0');
    await addCategory(page, 'Alpha');
    const records: Record<string, unknown>[] = [];
    for (let index = 0; index < 10; index += 1) {
      records.push(record(`S${index}`, [(index - 5) * 100 + 50, 0, 0], 'Alpha'));
    }
    await addSystems(page, records);
    await setView(page, [0, 0, 0], 1000);
    const before = (await markCounts(page)).labels;

    await page.evaluate(() => {
      window.galaxyMap?.setSystemNamesVisible(true);
    });
    await drawFrame(page);
    const on = (await markCounts(page)).labels;

    await page.evaluate(() => {
      window.galaxyMap?.setSystemNamesVisible(false);
    });
    await drawFrame(page);
    const after = (await markCounts(page)).labels;
    console.log('the name switch', { before, on, after });

    expect(before).toBe(0);
    expect(on).toBe(10);
    expect(after).toBe(0);
  });

  test('the hovered and the selected system are labelled with the switch off', async ({
    page,
  }) => {
    await openMap(page, '#c=0,0,0&d=1000&p=35&y=0');
    await addCategory(page, 'Alpha');
    const first = atRange([0, 0, 0], 1000, 400, -200);
    const second = atRange([0, 0, 0], 1000, 400, 200);
    await addSystems(page, [
      record('First', first, 'Alpha'),
      record('Second', second, 'Alpha'),
    ]);
    await setView(page, [0, 0, 0], 1000);
    await page.evaluate(() => {
      window.galaxyMap?.setSelection('First');
    });
    const screen = await projectOf(page, second);
    await page.mouse.move(screen.x, screen.y);
    await waitFrames(page);

    const names = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.gm-system-label'))
        .map((element) => element.textContent ?? '')
        .sort(),
    );
    const namesOn = await page.evaluate(
      () => window.galaxyMap?.areSystemNamesVisible() ?? true,
    );
    console.log('the two marks with the switch off', { names, namesOn });

    expect(namesOn).toBe(false);
    expect(names).toEqual(['First', 'Second']);
  });

  test('the name label count is capped at a full set', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=4000&p=35&y=0');
    await addCategory(page, 'Alpha');
    const added = await page.evaluate(() => {
      const records: Record<string, unknown>[] = [];
      // The grid is 192 light years wide, which is about 30 CSS pixels at this view, so
      // the labels of the nearest systems do not all fall on each other and the count
      // reaches the cap rather than the overlap rule.
      for (let index = 0; index < 10000; index += 1) {
        const column = index % 100;
        const row = Math.floor(index / 100);
        records.push({
          name: `S${index}`,
          coords: { x: (column - 50) * 192, y: (row - 50) * 192, z: 0 },
          primaryCategory: 'Alpha',
        });
      }
      return window.galaxyMap?.addSystems(records).added ?? -1;
    });
    await setView(page, [0, 0, 0], 4000);
    await page.evaluate(() => {
      window.galaxyMap?.setSystemNamesVisible(true);
    });
    await drawFrame(page);

    const labels = (await markCounts(page)).labels;
    console.log('the capped label count', { added, labels });

    expect(added).toBe(10000);
    expect(labels).toBeLessThanOrEqual(64);
    expect(labels).toBeGreaterThan(0);
  });

  test('two labels do not overlap', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=1000&p=35&y=0');
    await addCategory(page, 'Alpha');
    // Four CSS pixels apart at a distance of 1,000 light years is 6.4 light years.
    await addSystems(page, [
      record('First', [0, 0, 0], 'Alpha'),
      record('Second', [6.415, 0, 0], 'Alpha'),
    ]);
    await setView(page, [0, 0, 0], 1000);
    await page.evaluate(() => {
      window.galaxyMap?.setSystemNamesVisible(true);
    });
    await drawFrame(page);

    const gap = Math.abs(
      (await projectOf(page, [0, 0, 0])).x - (await projectOf(page, [6.415, 0, 0])).x,
    );
    const labels = (await markCounts(page)).labels;
    console.log('the overlapping labels', { gap, labels });

    expect(Math.abs(gap - 4)).toBeLessThan(1);
    expect(labels).toBe(1);
  });
});
