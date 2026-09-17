// The host's own camera call. The requirement "The host flies the camera through the
// handle" of `library-package` states every scenario below.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openMap } from './helpers';
import type { SystemRecordInput } from '../src/scene-data/real-systems';

test.use({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });

/** How a flight ended, as the handle reports it. */
type Outcome = 'landed' | 'interrupted';

/** Reads the view the map holds. */
async function readView(page: Page): Promise<{
  cursor: [number, number, number];
  distance: number;
  yaw: number;
  pitch: number;
}> {
  return page.evaluate(
    () =>
      window.galaxyMap?.getView() ?? {
        cursor: [-1, -1, -1] as [number, number, number],
        distance: -1,
        yaw: -1,
        pitch: -1,
      },
  );
}

/** Adds one category that draws at every range, and one system in it. */
async function addSystem(
  page: Page,
  name: string,
  place: readonly [number, number, number],
): Promise<void> {
  const added = await page.evaluate(
    (value) => {
      window.galaxyMap?.addCategories([
        { name: 'Empire', color: [153, 230, 255], maxDrawRange: 200000 },
      ]);
      const record = {
        name: value.name,
        coords: { x: value.place[0], y: value.place[1], z: value.place[2] },
        primaryCategory: 'Empire',
      } as unknown as SystemRecordInput;
      return window.galaxyMap?.addSystems([record]).added ?? -1;
    },
    { name, place },
  );
  expect(added).toBe(1);
}

test.describe('the host flight', () => {
  // The scenario "A host flies to coordinates".
  test('flies to coordinates and settles as landed', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=20000&p=35&y=0');

    const reading = await page.evaluate(async () => {
      const map = window.galaxyMap;
      if (map === undefined) return null;
      const promise = map.flyTo({ cursor: [2000, 0, 0], distance: 300 });
      // The view one frame into the flight, which is neither end of the path.
      const midway = await new Promise<{
        cursor: [number, number, number];
        distance: number;
      }>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const view = map.getView();
            resolve({ cursor: view.cursor, distance: view.distance });
          });
        });
      });
      const how = await promise;
      return { midway, how, flying: map.isFlying(), view: map.getView() };
    });
    console.log('the flight to coordinates', reading);

    expect(reading).not.toBeNull();
    const read = reading as NonNullable<typeof reading>;
    expect(read.midway.cursor[0]).toBeGreaterThan(0);
    expect(read.midway.cursor[0]).toBeLessThan(2000);
    expect(read.how).toBe('landed' satisfies Outcome);
    expect(read.flying).toBe(false);
    expect(read.view.cursor).toEqual([2000, 0, 0]);
    expect(read.view.distance).toBeCloseTo(300, 6);
  });

  // The scenario "A partial target keeps the rest of the view".
  test('keeps the fields the target leaves out', async ({ page }) => {
    await openMap(page, '#c=1000,0,-500&d=4000&p=60&y=40');

    const how = await page.evaluate(
      async () => (await window.galaxyMap?.flyTo({ distance: 100 })) ?? 'none',
    );
    const view = await readView(page);
    console.log('the zoom in place', { how, view });

    expect(how).toBe('landed' satisfies Outcome);
    expect(view.distance).toBeCloseTo(100, 6);
    expect(view.cursor).toEqual([1000, 0, -500]);
    expect(view.yaw).toBeCloseTo(40, 6);
    expect(view.pitch).toBeCloseTo(60, 6);
  });

  // The scenario "A flight does not select".
  test('flies to a system and selects nothing', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=4000&p=35&y=0');
    await addSystem(page, 'Target', [1500, 0, 0]);

    const reading = await page.evaluate(async () => {
      const how = await window.galaxyMap?.flyTo({ system: 'Target' });
      return {
        how,
        selection: window.galaxyMap?.getSelection()?.name ?? null,
        view: window.galaxyMap?.getView(),
      };
    });
    console.log('the flight to a system', reading);

    expect(reading.how).toBe('landed' satisfies Outcome);
    expect(reading.selection).toBeNull();
    expect(reading.view?.cursor).toEqual([1500, 0, 0]);
  });

  // The scenario "An interrupted flight settles as interrupted".
  test('settles as interrupted where the user takes the camera', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=20000&p=35&y=0');

    const started = page.evaluate(
      async () => (await window.galaxyMap?.flyTo({ cursor: [20000, 0, 0] })) ?? 'none',
    );
    await page.waitForTimeout(100);
    await page.mouse.move(640, 360);
    await page.mouse.wheel(0, -120);
    const how = await started;
    const flying = await page.evaluate(() => window.galaxyMap?.isFlying() ?? true);
    const view = await readView(page);
    console.log('the interrupted flight', { how, flying, view });

    expect(how).toBe('interrupted' satisfies Outcome);
    expect(flying).toBe(false);
    // The flight stopped where it had reached, short of its target.
    expect(view.cursor[0]).toBeLessThan(20000);
  });

  // The scenario "A second flight interrupts the first".
  test('lets a second flight interrupt the first', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=20000&p=35&y=0');

    const reading = await page.evaluate(async () => {
      const map = window.galaxyMap;
      if (map === undefined) return null;
      const first = map.flyTo({ cursor: [20000, 0, 0], distance: 500 });
      await new Promise((resolve) => setTimeout(resolve, 100));
      const second = map.flyTo({ cursor: [-5000, 0, 0], distance: 800 });
      return {
        first: await first,
        second: await second,
        view: map.getView(),
      };
    });
    console.log('the two flights', reading);

    const read = reading as NonNullable<typeof reading>;
    expect(read.first).toBe('interrupted' satisfies Outcome);
    expect(read.second).toBe('landed' satisfies Outcome);
    expect(read.view.cursor).toEqual([-5000, 0, 0]);
    expect(read.view.distance).toBeCloseTo(800, 6);
  });

  // The scenario "An unknown system flies nowhere".
  test('flies nowhere for a system the set does not hold', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=4000&p=35&y=0');
    const before = await readView(page);

    const reading = await page.evaluate(async () => {
      const how = await window.galaxyMap?.flyTo({ system: 'nothing' });
      return { how, flying: window.galaxyMap?.isFlying() ?? true };
    });
    const after = await readView(page);
    console.log('the unknown system', { ...reading, after });

    expect(reading.how).toBe('landed' satisfies Outcome);
    expect(reading.flying).toBe(false);
    expect(after).toEqual(before);
  });

  // The same scenario, with a flight already running. `isFlying` is false after the
  // call, so the call ends the flight it found.
  test('ends a running flight for a system the set does not hold', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=20000&p=35&y=0');

    const reading = await page.evaluate(async () => {
      const map = window.galaxyMap;
      if (map === undefined) return null;
      const first = map.flyTo({ cursor: [20000, 0, 0], distance: 500 });
      await new Promise((resolve) => setTimeout(resolve, 100));
      const unknown = await map.flyTo({ system: 'nothing' });
      const held = map.getView();
      return { first: await first, unknown, flying: map.isFlying(), held };
    });
    const after = await readView(page);
    console.log('the unknown system over a running flight', { ...reading, after });

    const read = reading as NonNullable<typeof reading>;
    expect(read.first).toBe('interrupted' satisfies Outcome);
    expect(read.unknown).toBe('landed' satisfies Outcome);
    expect(read.flying).toBe(false);
    // The view stays where the call found it: the flight moved it part of the way and
    // nothing moves it after.
    expect(after.cursor[0]).toBeGreaterThan(0);
    expect(after.cursor[0]).toBeLessThan(20000);
    expect(after).toEqual(read.held);
  });

  // The scenario "A flight with animate false arrives at once".
  test('takes the target in the next frame with animate false', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=20000&p=35&y=0');

    const reading = await page.evaluate(async () => {
      const map = window.galaxyMap;
      if (map === undefined) return null;
      const how = map.flyTo(
        { cursor: [9000, 0, 0], distance: 700 },
        { animate: false },
      );
      // The view is read before the promise is awaited, so the reading is of the frame
      // the call itself wrote.
      const view = map.getView();
      return { how: await how, view, flying: map.isFlying() };
    });
    console.log('the flight with animate false', reading);

    const read = reading as NonNullable<typeof reading>;
    expect(read.how).toBe('landed' satisfies Outcome);
    expect(read.flying).toBe(false);
    expect(read.view.cursor).toEqual([9000, 0, 0]);
    expect(read.view.distance).toBeCloseTo(700, 6);
  });

  // The scenario "The flight-end listener reports both endings".
  test('reports both endings to the flight-end listener', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=20000&p=35&y=0');

    await page.evaluate(() => {
      window.__flightEnds = [];
      window.galaxyMap?.onFlightEnd((how) => {
        window.__flightEnds?.push(how);
      });
    });

    await page.evaluate(
      async () =>
        await window.galaxyMap?.flyTo({ cursor: [3000, 0, 0], distance: 900 }),
    );
    const second = page.evaluate(
      async () => (await window.galaxyMap?.flyTo({ cursor: [-20000, 0, 0] })) ?? 'none',
    );
    await page.waitForTimeout(100);
    // A drag of the left button, which orbits and therefore takes the camera.
    await page.mouse.move(640, 360);
    await page.mouse.down();
    await page.mouse.move(700, 360);
    await page.mouse.up();
    expect(await second).toBe('interrupted' satisfies Outcome);

    const heard = await page.evaluate(() => window.__flightEnds ?? []);
    console.log('the flight-end listener', heard);
    expect(heard).toEqual(['landed', 'interrupted']);
  });

  // The scenario "A flight works with the inputs off".
  test('flies with every interaction switch off', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=20000&p=35&y=0');

    const reading = await page.evaluate(async () => {
      const map = window.galaxyMap;
      if (map === undefined) return null;
      map.setInteraction({
        zoom: false,
        orbit: false,
        pan: false,
        keys: false,
        select: false,
      });
      const how = await map.flyTo({ cursor: [2500, 0, 0], distance: 400 });
      return { how, switches: map.getInteraction(), view: map.getView() };
    });
    console.log('the flight with the inputs off', reading);

    const read = reading as NonNullable<typeof reading>;
    expect(read.how).toBe('landed' satisfies Outcome);
    expect(read.switches).toEqual({
      zoom: false,
      orbit: false,
      pan: false,
      keys: false,
      select: false,
    });
    expect(read.view.cursor).toEqual([2500, 0, 0]);
    expect(read.view.distance).toBeCloseTo(400, 6);
  });

  // The requirement states that a target outside the bounds is clamped and that the
  // promise still settles with `'landed'`.
  test('lands on the nearest view a sphere bound allows', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=4000&p=35&y=0');

    const reading = await page.evaluate(async () => {
      const map = window.galaxyMap;
      if (map === undefined) return null;
      map.setBounds({ mode: 'sphere', centre: [0, 0, 0], radiusLy: 1000 });
      const how = await map.flyTo({ cursor: [9000, 0, 0], distance: 100000 });
      return { how, view: map.getView() };
    });
    console.log('the clamped flight', reading);

    const read = reading as NonNullable<typeof reading>;
    expect(read.how).toBe('landed' satisfies Outcome);
    expect(read.view.cursor).toEqual([1000, 0, 0]);
    // The far limit of a sphere of radius 1,000 is twice the radius.
    expect(read.view.distance).toBeCloseTo(2000, 6);
  });

  // The scenario "A flight that only turns still runs" of `library-package`.
  test('turns the camera in place over a flight of its own', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=4000&p=35&y=0');

    const reading = await page.evaluate(async () => {
      const map = window.galaxyMap;
      if (map === undefined) return null;
      const promise = map.flyTo({ yaw: 180 });
      const flying = map.isFlying();
      const midway = await new Promise<number>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve(map.getView().yaw));
        });
      });
      return { flying, midway, how: await promise, view: map.getView() };
    });
    console.log('the turn in place', reading);

    const read = reading as NonNullable<typeof reading>;
    expect(read.flying).toBe(true);
    // The camera is part way round, so the frame is neither the start nor the end.
    expect(read.midway).toBeGreaterThan(0);
    expect(read.midway).toBeLessThan(180);
    expect(read.how).toBe('landed' satisfies Outcome);
    expect(read.view.yaw).toBeCloseTo(180, 6);
    expect(read.view.cursor).toEqual([0, 0, 0]);
    expect(read.view.distance).toBeCloseTo(4000, 6);
  });

  // The requirement states that a selection interrupts a flight the host started.
  test('settles as interrupted where a selection takes the camera', async ({
    page,
  }) => {
    await openMap(page, '#c=0,0,0&d=20000&p=35&y=0');
    await addSystem(page, 'Target', [1500, 0, 0]);

    const reading = await page.evaluate(async () => {
      const map = window.galaxyMap;
      if (map === undefined) return null;
      const flight = map.flyTo({ cursor: [-20000, 0, 0] });
      await new Promise((resolve) => setTimeout(resolve, 100));
      map.setSelection('Target');
      return { how: await flight, selection: map.getSelection()?.name ?? null };
    });
    console.log('the flight a selection cut off', reading);

    const read = reading as NonNullable<typeof reading>;
    expect(read.how).toBe('interrupted' satisfies Outcome);
    expect(read.selection).toBe('Target');
  });
});
