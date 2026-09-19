import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { channels, openMap } from './helpers';
import type { SystemRecordInput } from '../src/scene-data/real-systems';

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
): SystemRecordInput {
  const value: Record<string, unknown> = {
    name,
    coords: { x: position[0], y: position[1], z: position[2] },
    primaryCategory: category,
  };
  if (id64 !== undefined) value['id64'] = id64;
  return value as SystemRecordInput;
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

/**
 * Adds records through the handle. The cast is at the call, because a test also passes
 * a record the input type refuses and the reader rejects at run time.
 */
async function addSystems(page: Page, records: readonly unknown[]): Promise<number> {
  return page.evaluate(
    (list) =>
      window.galaxyMap?.addSystems(list as readonly SystemRecordInput[]).added ?? -1,
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

/** The milliseconds left in the running selection flight, and 0 when none runs. */
async function flightMs(page: Page): Promise<number> {
  return page.evaluate(() => window.__galaxyMap?.selectionFlightMs?.() ?? -1);
}

/** Waits until no flight runs, or until the wait runs out. */
async function waitForFlightEnd(page: Page): Promise<void> {
  await page.waitForFunction(
    () => (window.__galaxyMap?.selectionFlightMs?.() ?? 0) === 0,
    undefined,
    { timeout: 5000 },
  );
  await waitFrames(page);
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
    // The disc reads the range alone. A range of 20,000 light years reads the floor of
    // 7, so the pick radius is 7.5. A range of 10 reads the cap of 16, so the pick
    // radius is 12, and the camera goes onto the system at the closest zoom.
    const far = atRange(cursor, 1000, 20000);
    await addSystems(page, [record('Far', far, 'Alpha')]);
    await setView(page, cursor, 1000);
    const farScreen = await projectOf(page, far);
    const insideFloor = await nameAt(page, farScreen.x + 7, farScreen.y);
    const outsideFloor = await nameAt(page, farScreen.x + 8, farScreen.y);

    await page.evaluate(() => {
      window.galaxyMap?.clearSystems();
    });
    await addSystems(page, [record('Near', cursor, 'Alpha')]);
    await setView(page, cursor, 10);
    const nearScreen = await projectOf(page, cursor);
    const insideCap = await nameAt(page, nearScreen.x + 12, nearScreen.y);
    const outsideCap = await nameAt(page, nearScreen.x + 13, nearScreen.y);
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

  // The old pick radius read `focalCss`, which follows the viewport height, so the same
  // system at the same range was a wider target in a tall canvas than in a short one.
  test('holds the pick radius through a viewport change', async ({ page }) => {
    const cursor: [number, number, number] = [0, 0, 0];
    await page.setViewportSize({ width: 1280, height: 1080 });
    await openMap(page, '#c=0,0,0&d=1000&p=35&y=0');
    await addCategory(page, 'Alpha');
    const where = atRange(cursor, 1000, 4000);
    await addSystems(page, [record('One', where, 'Alpha')]);

    /** The largest whole pixel offset at which the pick still names the system. */
    const largestHit = async (): Promise<number> => {
      await setView(page, cursor, 1000);
      const screen = await projectOf(page, where);
      let last = -1;
      for (let offset = 0; offset <= 20; offset += 1) {
        const name = await nameAt(page, screen.x + offset, screen.y);
        if (name === 'One') last = offset;
      }
      return last;
    };

    const tall = await largestHit();
    await page.setViewportSize({ width: 1280, height: 400 });
    await drawFrame(page);
    const short = await largestHit();
    console.log('the pick radius at two viewports', { tall, short });

    expect(tall).toBeGreaterThan(0);
    expect(short).toBe(tall);
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
      const records: SystemRecordInput[] = [];
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

// Every test of this block reads the view, or a mark that follows it, right after a
// selection. The reduced-motion setting writes the end state in one frame, so the
// readings are the ones the block held before the flight existed. `test.use` is scoped
// to this block, so the flight tests further down still fly.
test.describe('the selection', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

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
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

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

  test('reduced motion arrives at once', async ({ page }) => {
    const place: [number, number, number] = [400, 0, 0];
    await openMap(page, '#c=0,0,0&d=20000&p=35&y=0');
    await addCategory(page, 'Alpha');
    await addSystems(page, [record('One', place, 'Alpha')]);
    await setView(page, [0, 0, 0], 20000);

    await page.evaluate(() => {
      window.galaxyMap?.setSelection('One');
    });
    await waitFrames(page);
    const view = await readView(page);
    const left = await flightMs(page);
    console.log('the reduced motion selection', { view, left });

    expect(view.cursor).toEqual(place);
    expect(view.distance).toBe(500);
    expect(left).toBe(0);
  });
});

// The flight tests take no `test.use`, so the browser reports its own motion setting and
// the map flies. `test.use` is scoped to a file or a block, so this block must stay out
// of the blocks above.
test.describe('the selection flight', () => {
  const START: [number, number, number] = [0, 0, 0];

  test('a far selection comes in to 500 light years', async ({ page }) => {
    const place: [number, number, number] = [400, 0, 0];
    await openMap(page, '#c=0,0,0&d=20000&p=60&y=40');
    await addCategory(page, 'Alpha');
    await addSystems(page, [record('One', place, 'Alpha')]);
    await setView(page, START, 20000, 40, 60);

    const before = await flightMs(page);
    await page.evaluate(() => {
      window.galaxyMap?.setSelection('One');
    });
    await waitFrames(page);
    const during = await readView(page);
    const left = await flightMs(page);
    await page.waitForTimeout(2500);
    const after = await readView(page);
    const ended = await flightMs(page);
    console.log('the flight', { before, during, left, after, ended });

    expect(before).toBe(0);
    expect(left).toBeGreaterThan(0);
    expect(during.distance).toBeLessThan(20000);
    expect(during.distance).toBeGreaterThan(500);
    expect(during.cursor[0]).toBeGreaterThan(0);
    expect(during.cursor[0]).toBeLessThan(400);
    expect(after.cursor).toEqual(place);
    expect(after.distance).toBe(500);
    expect(after.yaw).toBeCloseTo(40, 6);
    expect(after.pitch).toBeCloseTo(60, 6);
    expect(ended).toBe(0);
  });

  test('a click at a far view centres and comes in', async ({ page }) => {
    const place = atRange(START, 20000, 19000);
    await openMap(page, '#c=0,0,0&d=20000&p=35&y=0');
    await addCategory(page, 'Alpha');
    await addSystems(page, [record('One', place, 'Alpha')]);
    await setView(page, START, 20000);

    const screen = await projectOf(page, place);
    await page.mouse.move(screen.x, screen.y);
    await page.mouse.down({ button: 'left' });
    await page.mouse.up({ button: 'left' });
    await waitFrames(page);
    const during = await readView(page);
    await page.waitForTimeout(2500);
    const after = await readView(page);
    const name = await selectionName(page);
    console.log('the click flight', { during, after, name });

    expect(during.distance).toBeLessThan(20000);
    expect(during.cursor).not.toEqual(START);
    expect(name).toBe('One');
    expect(after.distance).toBe(500);
    for (let axis = 0; axis < 3; axis += 1) {
      expect(
        Math.abs((after.cursor[axis] as number) - (place[axis] as number)),
      ).toBeLessThan(1e-6);
    }
  });

  test('a second selection flies from where the first reached', async ({ page }) => {
    const first: [number, number, number] = [400, 0, 0];
    const second: [number, number, number] = [-600, 0, 0];
    await openMap(page, '#c=0,0,0&d=20000&p=35&y=0');
    await addCategory(page, 'Alpha');
    await addSystems(page, [
      record('First', first, 'Alpha'),
      record('Second', second, 'Alpha'),
    ]);
    await setView(page, START, 20000);

    await page.evaluate(() => {
      window.galaxyMap?.setSelection('First');
    });
    await page.waitForTimeout(100);
    const reached = await readView(page);
    await page.evaluate(() => {
      window.galaxyMap?.setSelection('Second');
    });
    await waitFrames(page);
    const during = await readView(page);
    await page.waitForTimeout(2500);
    const after = await readView(page);
    console.log('the second flight', { reached, during, after });

    // The first flight moved the cursor toward `first` and the zoom in, and the second
    // starts from there: the distance never rises and the cursor turns back at once.
    expect(reached.cursor[0]).toBeGreaterThan(0);
    expect(reached.distance).toBeLessThan(20000);
    expect(during.distance).toBeLessThanOrEqual(reached.distance);
    expect(during.cursor[0]).toBeLessThan(reached.cursor[0]);
    expect(after.cursor).toEqual(second);
    expect(after.distance).toBe(500);
  });

  test('a close view keeps its distance', async ({ page }) => {
    const place: [number, number, number] = [40, 0, 0];
    await openMap(page, '#c=0,0,0&d=100&p=35&y=0');
    await addCategory(page, 'Alpha');
    await addSystems(page, [record('One', place, 'Alpha')]);
    await setView(page, START, 100);

    await page.evaluate(() => {
      window.galaxyMap?.setSelection('One');
    });
    await waitForFlightEnd(page);
    const view = await readView(page);
    console.log('the close flight', view);

    expect(view.cursor).toEqual(place);
    expect(view.distance).toBe(100);
  });

  test('clearing the selection leaves the view and starts no flight', async ({
    page,
  }) => {
    await openMap(page, '#c=0,0,0&d=20000&p=35&y=0');
    await addCategory(page, 'Alpha');
    await addSystems(page, [record('One', [400, 0, 0], 'Alpha')]);
    await setView(page, START, 20000);

    await page.evaluate(() => {
      window.galaxyMap?.setSelection('One');
    });
    await waitForFlightEnd(page);
    const before = await readView(page);
    await page.evaluate(() => {
      window.galaxyMap?.setSelection(null);
    });
    await waitFrames(page);
    const after = await readView(page);
    const left = await flightMs(page);
    console.log('the cleared selection flight', { before, after, left });

    expect(after).toEqual(before);
    expect(left).toBe(0);
  });

  test('a wheel notch ends the flight', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=20000&p=35&y=0');
    await addCategory(page, 'Alpha');
    await addSystems(page, [record('One', [400, 0, 0], 'Alpha')]);
    await setView(page, START, 20000);

    await page.evaluate(() => {
      window.galaxyMap?.setSelection('One');
    });
    await page.waitForTimeout(100);
    // The wheel event goes to the canvas in one task with the two readings, so no frame
    // runs between them. The wheel sets a target and moves no view, so the two readings
    // are the same. The frames of the 2,500 ms wait carry the camera to the target.
    const notch = await page.evaluate(() => {
      const map = window.galaxyMap;
      const canvas = document.getElementById('map');
      if (map === undefined || canvas === null) return null;
      const before = map.getView();
      canvas.dispatchEvent(
        new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true }),
      );
      return { before, after: map.getView() };
    });
    const left = await flightMs(page);
    await page.waitForTimeout(2500);
    const rested = await readView(page);
    console.log('the wheel notch', { notch, left, rested });

    expect(notch).not.toBeNull();
    const before = notch?.before;
    const after = notch?.after;
    expect(before?.distance).toBeLessThan(20000);
    expect(before?.distance).toBeGreaterThan(500);
    expect(after?.distance).toBe(before?.distance);
    expect(left).toBe(0);
    expect(rested.distance).toBeCloseTo((before?.distance ?? 0) / 1.15, 2);
    expect(rested.cursor).toEqual(after?.cursor);
  });

  test('a drag ends the flight', async ({ page }) => {
    const place: [number, number, number] = [400, 0, 0];
    await openMap(page, '#c=0,0,0&d=20000&p=35&y=0');
    await addCategory(page, 'Alpha');
    await addSystems(page, [record('One', place, 'Alpha')]);
    await setView(page, START, 20000);

    await page.evaluate(() => {
      window.galaxyMap?.setSelection('One');
    });
    await page.waitForTimeout(100);
    await page.mouse.move(640, 360);
    await page.mouse.down({ button: 'left' });
    await page.mouse.move(700, 360, { steps: 6 });
    await page.mouse.up({ button: 'left' });
    await page.waitForTimeout(2500);
    const after = await readView(page);
    console.log('the orbit that ends the flight', after);

    expect(after.cursor).not.toEqual(place);
    expect(after.cursor[0]).toBeLessThan(400);
    expect(after.yaw).toBeCloseTo(18, 0);
    expect(await flightMs(page)).toBe(0);
  });

  // A user who holds a movement key before the map starts a flight sends no new
  // `keydown` until the auto-repeat of the browser. The map reads the held key before it
  // advances the flight, so the flight ends without taking a single frame of its ease.
  // Without that, the flight would write the view again after every move and the key
  // would do nothing for 600 ms.
  test('a held movement key ends the flight', async ({ page }) => {
    const place: [number, number, number] = [400, 0, 0];
    await openMap(page, '#c=0,0,0&d=20000&p=35&y=0');
    await addCategory(page, 'Alpha');
    await addSystems(page, [record('One', place, 'Alpha')]);
    await setView(page, START, 20000, 0, 35);

    // The yaw is 0, so W moves the cursor along z alone. The system sits on x, so the
    // key and the flight move the view along different axes and the reading tells them
    // apart. The test above, 'a far selection comes in to 500 light years', reads the
    // same selection with no key held and ends on the system at a distance of 500.
    await page.keyboard.down('KeyW');
    await page.evaluate(() => {
      window.galaxyMap?.setSelection('One');
    });
    await waitFrames(page);
    const left = await flightMs(page);
    await page.waitForTimeout(2500);
    const after = await readView(page);
    await page.keyboard.up('KeyW');
    console.log('the held key against the flight', { left, after });

    // The flight is over, and it took no frame at all.
    expect(left).toBe(0);
    // The key moved the view along z, and it kept moving after the flight would have
    // ended.
    expect(after.cursor[2]).toBeGreaterThan(500);
    // The flight never advanced. It would have carried x toward 400 and the distance
    // down toward 500, and the ease is steep enough that one frame alone moves both.
    // W runs along z at this yaw, so nothing else can hold x at its start.
    expect(after.cursor[0]).toBe(0);
    expect(after.distance).toBe(20000);
  });

  test('a turn key ends a running selection flight', async ({ page }) => {
    const place: [number, number, number] = [400, 0, 0];
    await openMap(page, '#c=0,0,0&d=20000&p=35&y=0');
    await addCategory(page, 'Alpha');
    await addSystems(page, [record('One', place, 'Alpha')]);
    await setView(page, START, 20000, 0, 35);

    await page.evaluate(() => {
      window.galaxyMap?.setSelection('One');
    });
    await page.waitForTimeout(100);
    const reached = await readView(page);
    // `E` is a movement key, so one frame of it ends the flight. The turn runs 60
    // degrees a second, so one frame moves the yaw by about 1 degree.
    await page.keyboard.down('KeyE');
    await waitFrames(page);
    await page.keyboard.up('KeyE');
    await page.waitForTimeout(2500);
    const after = await readView(page);
    const left = await flightMs(page);
    console.log('the turn key against the flight', { reached, after, left });

    expect(left).toBe(0);
    // The flight stopped where it had reached. It never came to the system.
    expect(after.cursor).not.toEqual(place);
    expect(after.cursor[0]).toBeLessThan(400);
    expect(after.cursor[0]).toBeGreaterThanOrEqual(reached.cursor[0]);
    expect(after.distance).toBeGreaterThan(500);
    // The turn moved the yaw alone.
    expect(after.yaw).toBeGreaterThan(0.2);
    expect(after.yaw).toBeLessThan(45);
    expect(after.pitch).toBeCloseTo(35, 6);
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
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

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
    const records: SystemRecordInput[] = [];
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
      const records: SystemRecordInput[] = [];
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

  // The scenario "A name label carries a stroke and no shadow".
  test('a name label carries a stroke and no shadow', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=1000&p=35&y=0');
    await addCategory(page, 'Alpha');
    // The systems stand 30 light years apart, which is about 19 CSS pixels at this view,
    // so the overlap rule drops none of the ten labels.
    const records = [];
    for (let index = 0; index < 10; index += 1) {
      records.push(record(`S${index}`, [0, (index - 5) * 30, 0], 'Alpha'));
    }
    await addSystems(page, records);
    await setView(page, [0, 0, 0], 1000);
    await page.evaluate(() => {
      window.galaxyMap?.setSystemNamesVisible(true);
    });
    await drawFrame(page);

    const read = await page.evaluate(() =>
      [...document.querySelectorAll('.gm-system-label')].map((element) => {
        const style = getComputedStyle(element);
        return {
          shadow: style.textShadow,
          width: style.webkitTextStrokeWidth,
          colour: style.webkitTextStrokeColor,
          order: style.paintOrder,
        };
      }),
    );
    console.log('the name label edge', read[0], `of ${read.length}`);

    expect(read.length).toBeGreaterThan(0);
    for (const label of read) {
      expect(label.shadow).toBe('none');
      expect(label.width).toBe('2px');
      const [red, green, blue, alpha] = channels(label.colour);
      expect(Math.abs(red), label.colour).toBeLessThanOrEqual(2);
      expect(Math.abs(green), label.colour).toBeLessThanOrEqual(2);
      expect(Math.abs(blue), label.colour).toBeLessThanOrEqual(2);
      expect(alpha).toBeCloseTo(0.9, 2);
      // `stroke fill markers` is the full order, so a browser may drop the keywords the
      // order implies. Chromium serialises the computed value as `stroke`.
      expect(['stroke', 'stroke fill']).toContain(label.order);
    }
  });
});

// The scenario "A selection outside the bounds lands on the nearest allowed cursor".
test('a selection outside the bounds lands on the nearest allowed cursor', async ({
  page,
}) => {
  await openMap(page, '#c=0,0,0&d=500&p=35&y=0');
  await addCategory(page, 'Alpha');
  await addSystems(page, [record('Far', [5000, 0, 0], 'Alpha')]);
  await page.evaluate(() => {
    window.galaxyMap?.setBounds({ mode: 'sphere', centre: [0, 0, 0], radiusLy: 100 });
    window.galaxyMap?.setSelection('Far');
  });
  await waitForFlightEnd(page);

  const landed = await page.evaluate(() => ({
    name: window.galaxyMap?.getSelection()?.name ?? null,
    view: window.__galaxyMap?.getView?.() ?? null,
  }));
  const where = await projectOf(page, [5000, 0, 0]);
  console.log('the landed selection outside the bounds', landed, where);

  // The selection holds. The camera goes as near as the bounds allow and no nearer, so
  // the system itself is off the middle of the canvas.
  expect(landed.name).toBe('Far');
  expect(landed.view?.cursor).toEqual([100, 0, 0]);
  expect(Math.hypot(where.x - 640, where.y - 360)).toBeGreaterThan(50);
});

// The scenario "A restricted zoom limit caps the path". Task 1.7 waited for item 3,
// because the cap it reads is the far zoom limit of a bound.
test('a restricted zoom limit caps the path', async ({ page }) => {
  await openMap(page, '#c=0,0,0&d=4000&p=35&y=0');
  await addCategory(page, 'Alpha');
  await addSystems(page, [record('Across', [2000, 0, 0], 'Alpha')]);

  const peak = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        window.galaxyMap?.setBounds({
          mode: 'sphere',
          centre: [0, 0, 0],
          radiusLy: 2000,
        });
        window.galaxyMap?.setView({ cursor: [-2000, 0, 0], distance: 4000 });
        window.galaxyMap?.setSelection('Across');
        let largest = 0;
        const step = (): void => {
          largest = Math.max(largest, window.__galaxyMap?.getView?.().distance ?? 0);
          if ((window.__galaxyMap?.selectionFlightMs?.() ?? 0) === 0) {
            resolve(largest);
            return;
          }
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }),
  );
  console.log('the largest distance the capped flight reached', peak);

  // The path asks for 4,647 light years at its top: a 4,000 light year move from 4,000
  // out to the 500 light year end distance. The bound caps the frame at 4,000, so the
  // flight holds there over the middle of the path and never writes more.
  //
  // The cap is `R / sin(30 degrees)` and not the round 4,000: `Math.sin(Math.PI / 6)` is
  // 0.49999999999999994, so the limit the map holds is 4,000.0000000000005.
  const cap = 2000 / Math.sin(Math.PI / 6);
  expect(peak).toBeLessThanOrEqual(cap);
  expect(peak).toBeCloseTo(4000, 6);
});

/** A point at an exact range from the cursor, on the view axis toward the camera. */
function atCursorRange(
  cursor: readonly [number, number, number],
  range: number,
): [number, number, number] {
  const pitch = (PITCH * Math.PI) / 180;
  return [
    cursor[0],
    cursor[1] + Math.sin(pitch) * range,
    cursor[2] - Math.cos(pitch) * range,
  ];
}

// The scenario "A drawn marker is pickable however far the camera stands off".
test('a drawn marker is pickable however far the camera stands off', async ({
  page,
}) => {
  const cursor: [number, number, number] = [0, 0, 0];
  const where = atCursorRange(cursor, 1500);
  await openMap(page, '#c=0,0,0&d=2000&p=35&y=0');
  await page.evaluate(() => {
    window.galaxyMap?.addCategories([
      { name: 'Alpha', color: [153, 230, 255], maxDrawRange: 2000 },
    ]);
  });
  await addSystems(page, [record('One', where, 'Alpha')]);

  // The camera stands 20,000 light years off. The cursor stays 1,500 light years from the
  // system, which is inside the category's range, so the marker draws.
  await setView(page, cursor, 20000);
  const spot = await projectOf(page, where);
  const reading = await page.evaluate(
    (pixel) => ({
      count: window.galaxyMap?.debug.systemMarkerCount() ?? -1,
      name: window.galaxyMap?.systemAt(pixel.x, pixel.y)?.name ?? null,
    }),
    spot,
  );
  console.log('the far camera reading', { spot, reading });

  expect(reading.count).toBe(1);
  expect(reading.name).toBe('One');
});

// The scenario "The ring, the pin and the name follow the same gate".
test('the ring, the pin and the name follow the same gate', async ({ page }) => {
  const cursor: [number, number, number] = [0, 0, 0];
  const where = atCursorRange(cursor, 1500);
  await openMap(page, '#c=0,0,0&d=2000&p=35&y=0');
  await page.evaluate(() => {
    window.galaxyMap?.addCategories([
      { name: 'Alpha', color: [153, 230, 255], maxDrawRange: 2000 },
    ]);
    window.galaxyMap?.setSystemNamesVisible(true);
  });
  await addSystems(page, [record('One', where, 'Alpha')]);
  await page.evaluate(() => {
    window.galaxyMap?.setSelection('One');
  });
  await waitForFlightEnd(page);

  // The selection brought the cursor onto the system, so the view goes back out to hold
  // the system 1,500 light years from the cursor with the camera 20,000 light years off.
  await setView(page, cursor, 20000);
  const spot = await projectOf(page, where);
  // The ring follows the hover and not the selection, so the pointer moves onto the
  // marker before the frame that is read.
  await page.mouse.move(spot.x, spot.y);
  await drawFrame(page);
  const marks = await markCounts(page);
  console.log('the marks at a 20,000 light year stand-off', { spot, marks });

  expect(marks.pins).toBe(1);
  expect(marks.rings).toBe(1);
  expect(marks.labels).toBeGreaterThan(0);
});

// The `systemNames` option of `GalaxyMapOptions`, which sets the state the map starts
// in. The tests build a map of their own, because the option is read once at the build.
test.describe('the system names option', () => {
  /**
   * Builds a map with the `systemNames` the test names, over a canvas of its own, and
   * adds 10 systems in view. The demo page's map comes down first, so the label count
   * of the document is the count of this map alone.
   */
  async function buildNamesMap(page: Page, options: unknown): Promise<void> {
    await page.evaluate(async (settings) => {
      const factory = window.galaxyMapFactory;
      if (factory === undefined) throw new Error('The page has no map factory.');
      window.galaxyMap?.dispose();
      const wrap = document.createElement('div');
      wrap.id = 'names-wrap';
      wrap.style.cssText = 'position: absolute; inset: 0;';
      const canvas = document.createElement('canvas');
      canvas.style.cssText = 'display: block; width: 100%; height: 100%;';
      wrap.appendChild(canvas);
      document.body.appendChild(wrap);
      const map = factory(canvas, {
        ...(settings as Record<string, unknown>),
        startView: { cursor: [0, 0, 0], distance: 1000, yaw: 0, pitch: 35 },
      } as never);
      window.__namesMap = map;
      await map.ready;
      map.addCategories([
        { name: 'Alpha', color: [153, 230, 255], maxDrawRange: 200000 },
      ]);
      const records = [];
      for (let index = 0; index < 10; index += 1) {
        records.push({
          name: `S${index}`,
          coords: { x: (index - 5) * 100 + 50, y: 0, z: 0 },
          primaryCategory: 'Alpha',
        });
      }
      map.addSystems(records as never);
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
    }, options);
  }

  /** Takes the map of the test down, so the next build counts its own labels. */
  async function dropNamesMap(page: Page): Promise<void> {
    await page.evaluate(() => {
      window.__namesMap?.dispose();
      delete window.__namesMap;
      document.getElementById('names-wrap')?.remove();
    });
  }

  test.afterEach(async ({ page }) => {
    await dropNamesMap(page);
  });

  // The scenario "The option starts the labels on".
  test('the option starts the labels on', async ({ page }) => {
    await openMap(page);
    await buildNamesMap(page, { systemNames: true });
    const on = (await markCounts(page)).labels;
    await dropNamesMap(page);

    await buildNamesMap(page, {});
    const off = (await markCounts(page)).labels;
    console.log('the label counts of the two maps', { on, off });

    expect(on).toBe(10);
    expect(off).toBe(0);
  });

  // The scenario "An unreadable option keeps the labels off".
  test('an unreadable option keeps the labels off', async ({ page }) => {
    await openMap(page);
    await buildNamesMap(page, { systemNames: 'yes' });
    const reading = await page.evaluate(
      () => window.__namesMap?.areSystemNamesVisible() ?? true,
    );
    const labels = (await markCounts(page)).labels;
    console.log('the reading of an unreadable option', { reading, labels });

    expect(reading).toBe(false);
    expect(labels).toBe(0);
  });
});
