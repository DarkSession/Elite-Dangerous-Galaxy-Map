// The touch gestures, read through the whole path from a touch event to the view.
//
// `playwright.config.ts` runs this file in the `chromium-touch` project alone, because
// `devices['Desktop Chrome']` sets `hasTouch: false` and a touch context is a project of
// its own. The events come from the Chrome DevTools protocol, so the browser makes the
// pointer events itself and the test drives no synthetic event.
import { expect, test } from '@playwright/test';
import type { CDPSession, Page } from '@playwright/test';
import { openMap } from './helpers';
import type { SystemRecordInput } from '../packages/galaxy-map/src/scene-data/real-systems';

test.use({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });

/** One finger the test holds on the screen. */
interface Finger {
  readonly id: number;
  readonly x: number;
  readonly y: number;
}

/**
 * Drives the touch screen. The browser keeps the active points and makes one pointer
 * event for each point that changed, so every call states the points that are down.
 */
class Touchscreen {
  private readonly held = new Map<number, Finger>();

  constructor(private readonly session: CDPSession) {}

  private points(): Finger[] {
    return [...this.held.values()];
  }

  private async send(
    type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel',
    points: Finger[],
  ): Promise<void> {
    await this.session.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: points.map((point) => ({
        x: point.x,
        y: point.y,
        id: point.id,
      })),
    });
  }

  /** Puts one finger down. */
  async down(id: number, x: number, y: number): Promise<void> {
    this.held.set(id, { id, x, y });
    await this.send('touchStart', this.points());
  }

  /** Moves one or more fingers in one event. */
  async move(moves: readonly Finger[]): Promise<void> {
    for (const move of moves) this.held.set(move.id, move);
    await this.send('touchMove', this.points());
  }

  /** Lifts one finger. */
  async up(id: number): Promise<void> {
    const point = this.held.get(id);
    if (point === undefined) throw new Error(`the finger ${id} is not down`);
    this.held.delete(id);
    await this.send('touchEnd', [point]);
  }

  /**
   * Takes every finger away without a lift, which raises `pointercancel` on each one.
   * This is what the browser or the operating system does when a notification shade
   * opens, the orientation changes, or one touch point more than the device holds goes
   * down. The protocol refuses a `touchCancel` that names a point, so a cancel is of
   * the whole gesture and not of one finger.
   */
  async cancelAll(): Promise<void> {
    if (this.held.size === 0) throw new Error('no finger is down');
    this.held.clear();
    await this.send('touchCancel', []);
  }
}

/** Opens the map and gives back the touch screen that drives it. */
async function openTouch(page: Page, fragment = ''): Promise<Touchscreen> {
  await openMap(page, fragment);
  return new Touchscreen(await page.context().newCDPSession(page));
}

/** The view the map holds. */
async function readView(page: Page): Promise<{
  cursor: [number, number, number];
  distance: number;
  yaw: number;
  pitch: number;
}> {
  return page.evaluate(
    () =>
      window.__galaxyMap?.getView?.() ?? {
        cursor: [0, 0, 0] as [number, number, number],
        distance: 0,
        yaw: 0,
        pitch: 0,
      },
  );
}

/** The plane point under a CSS pixel, at the cursor's height. */
async function planePointAt(
  page: Page,
  x: number,
  y: number,
): Promise<[number, number, number] | null> {
  return page.evaluate(
    (where) => window.__galaxyMap?.planePointAt?.(where.x, where.y) ?? null,
    { x, y },
  );
}

/** The CSS pixel a game position projects to. */
async function projectOf(
  page: Page,
  point: [number, number, number],
): Promise<{ x: number; y: number }> {
  return page.evaluate(
    (where) => window.__galaxyMap?.project?.(where) ?? { x: -1, y: -1 },
    point,
  );
}

test('one finger moves the cursor', async ({ page }) => {
  const screen = await openTouch(page);
  await page.evaluate(() => {
    window.__galaxyMap?.setView?.({
      cursor: [0, 0, 0],
      distance: 20000,
      yaw: 0,
      pitch: 35,
    });
  });
  const before = await readView(page);

  const start = { x: 500, y: 400 };
  const end = { x: 700, y: 400 };
  const point = await planePointAt(page, start.x, start.y);
  expect(point).not.toBeNull();

  await screen.down(1, start.x, start.y);
  await screen.move([{ id: 1, x: start.x + 100, y: start.y }]);
  await screen.move([{ id: 1, x: end.x, y: end.y }]);
  await screen.up(1);

  const where = await projectOf(page, point as [number, number, number]);
  expect(Math.abs(where.x - end.x)).toBeLessThan(1);
  expect(Math.abs(where.y - end.y)).toBeLessThan(1);

  const after = await readView(page);
  expect(after.yaw).toBeCloseTo(before.yaw, 6);
  expect(after.pitch).toBeCloseTo(before.pitch, 6);
});

test('two fingers turn the camera', async ({ page }) => {
  const screen = await openTouch(page);
  const before = await readView(page);
  expect(before.yaw).toBe(0);
  expect(before.pitch).toBe(35);

  const first = { x: 500, y: 300 };
  const second = { x: 700, y: 300 };
  await screen.down(1, first.x, first.y);
  await screen.down(2, second.x, second.y);
  // Both fingers move by the same step, so the gap holds and the middle carries the
  // whole move: 60 CSS pixels of yaw and 30 of pitch, at 0.3 degrees a pixel.
  await screen.move([
    { id: 1, x: first.x + 60, y: first.y + 30 },
    { id: 2, x: second.x + 60, y: second.y + 30 },
  ]);
  await screen.up(1);
  await screen.up(2);

  const after = await readView(page);
  expect(after.yaw).toBeCloseTo(18, 3);
  expect(after.pitch).toBeCloseTo(44, 3);
  expect(Math.abs(after.distance - before.distance)).toBeLessThan(1);
  expect(after.cursor[0]).toBeCloseTo(before.cursor[0], 3);
  expect(after.cursor[1]).toBeCloseTo(before.cursor[1], 3);
  expect(after.cursor[2]).toBeCloseTo(before.cursor[2], 3);
});

test('a pinch ends the wheel glide', async ({ page }) => {
  const screen = await openTouch(page);
  await page.evaluate(() => {
    window.__galaxyMap?.setView?.({
      cursor: [0, 0, 0],
      distance: 20000,
      yaw: 0,
      pitch: 35,
    });
  });

  await page.mouse.move(640, 360);
  await page.mouse.wheel(0, -100);
  // One frame of the glide, which is what the scenario opens with.
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  );
  expect(
    await page.evaluate(() => window.__galaxyMap?.zoomTargetLy?.() ?? null),
  ).not.toBe(null);

  await screen.down(1, 500, 300);
  await screen.down(2, 700, 300);
  // The pinch ends the glide where the second finger lands, so this is the distance the
  // glide had reached.
  const reached = (await readView(page)).distance;
  expect(await page.evaluate(() => window.__galaxyMap?.zoomTargetLy?.() ?? null)).toBe(
    null,
  );

  // The gap goes from 200 to 400 CSS pixels, so the distance halves.
  await screen.move([
    { id: 1, x: 400, y: 300 },
    { id: 2, x: 800, y: 300 },
  ]);
  const after = await readView(page);
  expect(Math.abs(after.distance - reached / 2)).toBeLessThan(1);
});

test('a tap selects and a drag does not', async ({ page }) => {
  const screen = await openTouch(page);
  await page.evaluate(() => {
    window.galaxyMap?.addCategories([
      { name: 'Core', color: [153, 230, 255], maxDrawRange: 200000 },
    ]);
    window.galaxyMap?.addSystems([
      {
        name: 'Tap Target',
        coords: { x: 0, y: 0, z: 0 },
        primaryCategory: 'Core',
      } as unknown as SystemRecordInput,
    ]);
    window.galaxyMap?.setView({
      cursor: [0, 0, 0],
      distance: 2000,
      yaw: 0,
      pitch: 35,
    });
    window.galaxyMap?.debug.drawNow();
  });

  const marker = await projectOf(page, [0, 0, 0]);
  await screen.down(1, marker.x, marker.y);
  await screen.up(1);
  expect(
    await page.evaluate(() => window.galaxyMap?.getSelection()?.name ?? null),
  ).toBe('Tap Target');

  await page.evaluate(() => {
    window.galaxyMap?.setSelection(null);
    window.galaxyMap?.setView({
      cursor: [0, 0, 0],
      distance: 2000,
      yaw: 0,
      pitch: 35,
    });
    window.galaxyMap?.debug.drawNow();
  });
  const again = await projectOf(page, [0, 0, 0]);
  await screen.down(1, again.x, again.y);
  await screen.move([{ id: 1, x: again.x + 40, y: again.y }]);
  await screen.up(1);
  expect(
    await page.evaluate(() => window.galaxyMap?.getSelection()?.name ?? null),
  ).toBe(null);
});

test('a cancelled touch does not select', async ({ page }) => {
  const screen = await openTouch(page);
  await page.evaluate(() => {
    window.galaxyMap?.addCategories([
      { name: 'Core', color: [153, 230, 255], maxDrawRange: 200000 },
    ]);
    window.galaxyMap?.addSystems([
      {
        name: 'Tap Target',
        coords: { x: 0, y: 0, z: 0 },
        primaryCategory: 'Core',
      } as unknown as SystemRecordInput,
      {
        name: 'Other',
        coords: { x: 900, y: 0, z: 0 },
        primaryCategory: 'Core',
      } as unknown as SystemRecordInput,
    ]);
    window.galaxyMap?.setView({
      cursor: [0, 0, 0],
      distance: 2000,
      yaw: 0,
      pitch: 35,
    });
    window.galaxyMap?.debug.drawNow();
  });

  // The finger goes down on the marker and the browser takes the pointer away inside
  // both tap limits. The same finger lifted would select, which `a tap selects and a
  // drag does not` reads.
  const marker = await projectOf(page, [0, 0, 0]);
  await screen.down(1, marker.x, marker.y);
  await screen.cancelAll();
  expect(
    await page.evaluate(() => window.galaxyMap?.getSelection()?.name ?? null),
  ).toBe(null);

  // The map keeps the selection it already holds as well.
  await page.evaluate(() => {
    window.galaxyMap?.setSelection('Other');
    window.galaxyMap?.setView({
      cursor: [0, 0, 0],
      distance: 2000,
      yaw: 0,
      pitch: 35,
    });
    window.galaxyMap?.debug.drawNow();
  });
  const again = await projectOf(page, [0, 0, 0]);
  await screen.down(1, again.x, again.y);
  await screen.cancelAll();
  expect(
    await page.evaluate(() => window.galaxyMap?.getSelection()?.name ?? null),
  ).toBe('Other');
});

test('a gesture ends a running selection flight', async ({ page }) => {
  const screen = await openTouch(page);
  await page.evaluate(() => {
    window.galaxyMap?.addCategories([
      { name: 'Core', color: [153, 230, 255], maxDrawRange: 200000 },
    ]);
    window.galaxyMap?.addSystems([
      {
        name: 'Far Away',
        coords: { x: 4000, y: 0, z: 4000 },
        primaryCategory: 'Core',
      } as unknown as SystemRecordInput,
    ]);
    window.galaxyMap?.setView({
      cursor: [0, 0, 0],
      distance: 20000,
      yaw: 0,
      pitch: 35,
    });
    window.galaxyMap?.setSelection('Far Away');
  });
  expect(
    await page.evaluate(() => window.__galaxyMap?.selectionFlightMs?.() ?? 0),
  ).toBeGreaterThan(0);

  const start = { x: 500, y: 400 };
  await screen.down(1, start.x, start.y);
  // The gesture raises the input hook before it reads the view, so the flight is over
  // and the plane point below is the one the drag holds.
  expect(
    await page.evaluate(() => window.__galaxyMap?.selectionFlightMs?.() ?? -1),
  ).toBe(0);
  const reached = await readView(page);
  const point = await planePointAt(page, start.x, start.y);
  expect(point).not.toBeNull();

  const end = { x: 550, y: 400 };
  await screen.move([{ id: 1, x: end.x, y: end.y }]);
  await screen.up(1);

  const where = await projectOf(page, point as [number, number, number]);
  expect(Math.abs(where.x - end.x)).toBeLessThan(1);
  expect(Math.abs(where.y - end.y)).toBeLessThan(1);
  // The flight was going to 500 light years, so a cursor read from the view it was
  // flying to would sit elsewhere.
  expect(reached.distance).toBeGreaterThan(500);
});

test('the canvas takes the touches', async ({ page }) => {
  await openMap(page);
  // The demo page states `touch-action: none` for its own canvas in its style sheet, so
  // this test builds a map over a canvas that states none.
  await page.evaluate(async () => {
    const factory = window.galaxyMapFactory;
    if (factory === undefined) throw new Error('The page has no map factory.');
    window.galaxyMap?.dispose();
    const wrap = document.createElement('div');
    wrap.id = 'touch-wrap';
    wrap.style.cssText = 'position: absolute; inset: 0;';
    const canvas = document.createElement('canvas');
    canvas.id = 'touch-canvas';
    canvas.style.cssText = 'display: block; width: 100%; height: 100%;';
    wrap.appendChild(canvas);
    document.body.appendChild(wrap);
    const map = factory(canvas);
    window.__touchMap = map;
    await map.ready;
  });

  const read = async (): Promise<string> =>
    page.evaluate(() => {
      const canvas = document.getElementById('touch-canvas');
      return canvas === null ? '' : getComputedStyle(canvas).touchAction;
    });

  expect(await read()).toBe('none');
  await page.evaluate(() => {
    window.__touchMap?.dispose();
  });
  expect(await read()).toBe('auto');
});
