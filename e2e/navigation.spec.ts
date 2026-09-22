import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openMap } from './helpers';
import type { SystemRecordInput } from '../packages/galaxy-map/src/scene-data/real-systems';

test.use({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });

test('a right drag keeps the plane point under the pointer', async ({ page }) => {
  await openMap(page);

  const start = { x: 500, y: 400 };
  const end = { x: 700, y: 400 };

  const planePoint = await page.evaluate(
    (where) => window.__galaxyMap?.planePointAt?.(where.x, where.y) ?? null,
    start,
  );
  expect(planePoint).not.toBeNull();

  await page.mouse.move(start.x, start.y);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(start.x + 100, start.y, { steps: 5 });
  await page.mouse.move(end.x, end.y, { steps: 5 });
  await page.mouse.up({ button: 'right' });

  const screen = await page.evaluate(
    (point) => window.__galaxyMap?.project?.(point) ?? { x: -1, y: -1 },
    planePoint as [number, number, number],
  );
  expect(Math.abs(screen.x - end.x)).toBeLessThan(1);
  expect(Math.abs(screen.y - end.y)).toBeLessThan(1);
});

test('W moves the cursor one quarter of the distance in a second', async ({ page }) => {
  await openMap(page);
  await page.evaluate(() => {
    window.__galaxyMap?.setView?.({
      cursor: [0, 0, 0],
      distance: 20000,
      yaw: 0,
      pitch: 89,
    });
  });

  await page.mouse.move(640, 360);
  await page.keyboard.down('w');
  const before = await page.evaluate(() => ({
    time: performance.now(),
    cursor: window.__galaxyMap?.getView?.().cursor ?? [0, 0, 0],
  }));
  await page.waitForTimeout(1000);
  const after = await page.evaluate(() => ({
    time: performance.now(),
    cursor: window.__galaxyMap?.getView?.().cursor ?? [0, 0, 0],
  }));
  await page.keyboard.up('w');

  const seconds = (after.time - before.time) / 1000;
  const moved = Math.hypot(
    after.cursor[0] - before.cursor[0],
    after.cursor[1] - before.cursor[1],
    after.cursor[2] - before.cursor[2],
  );
  console.log('held W for', seconds.toFixed(3), 's and moved', moved.toFixed(0), 'ly');
  expect(Math.abs(moved - 5000)).toBeLessThan(500);
  // Yaw 0 looks toward +z, which is the screen-up direction.
  expect(after.cursor[2] - before.cursor[2]).toBeGreaterThan(0);

  const old = await page.evaluate(
    (point) => window.__galaxyMap?.project?.(point) ?? { x: -1, y: -1 },
    before.cursor as [number, number, number],
  );
  expect(old.y).toBeGreaterThan(361);
});

test('E turns the camera right and moves nothing else', async ({ page }) => {
  await openMap(page);
  await page.evaluate(() => {
    window.__galaxyMap?.setView?.({
      cursor: [0, 0, 0],
      distance: 20000,
      yaw: 0,
      pitch: 35,
    });
  });

  await page.mouse.move(640, 360);
  await page.keyboard.down('e');
  const before = await page.evaluate(() => ({
    time: performance.now(),
    view: window.__galaxyMap?.getView?.(),
  }));
  await page.waitForTimeout(1000);
  const after = await page.evaluate(() => ({
    time: performance.now(),
    view: window.__galaxyMap?.getView?.(),
  }));
  await page.keyboard.up('e');

  const seconds = (after.time - before.time) / 1000;
  const turned = (after.view?.yaw ?? 0) - (before.view?.yaw ?? 0);
  console.log(
    'held E for',
    seconds.toFixed(3),
    's and turned',
    turned.toFixed(2),
    'deg',
  );

  // 60 degrees a second, within a tenth. The bound is the frame the press and the
  // reading fall between and not the rate itself.
  expect(Math.abs(turned - 60 * seconds)).toBeLessThan(6);
  expect(after.view?.pitch).toBeCloseTo(before.view?.pitch as number, 6);
  expect(after.view?.distance).toBeCloseTo(before.view?.distance as number, 6);
  expect(after.view?.cursor).toEqual(before.view?.cursor);
});

test('Q turns the camera the other way', async ({ page }) => {
  await openMap(page);
  await page.evaluate(() => {
    window.__galaxyMap?.setView?.({
      cursor: [0, 0, 0],
      distance: 20000,
      yaw: 180,
      pitch: 35,
    });
  });

  await page.mouse.move(640, 360);
  await page.keyboard.down('q');
  const before = await page.evaluate(() => window.__galaxyMap?.getView?.().yaw ?? 0);
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => window.__galaxyMap?.getView?.().yaw ?? 0);
  await page.keyboard.up('q');
  console.log('held Q for 0.5 s from', before, 'to', after);

  expect(after).toBeLessThan(before);
});

test('a release outside the page stops the turn', async ({ page }) => {
  await openMap(page);
  await page.evaluate(() => {
    window.__galaxyMap?.setView?.({
      cursor: [0, 0, 0],
      distance: 20000,
      yaw: 0,
      pitch: 35,
    });
  });

  await page.mouse.move(640, 360);
  await page.keyboard.down('e');
  await page.waitForTimeout(200);
  // A `keyup` whose target is the window is what a release outside the page sends.
  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE' }));
  });
  await page.waitForTimeout(100);
  const first = await page.evaluate(() => window.__galaxyMap?.getView?.().yaw ?? 0);
  await page.waitForTimeout(500);
  const second = await page.evaluate(() => window.__galaxyMap?.getView?.().yaw ?? 0);
  await page.keyboard.up('e');
  console.log('the yaw after the release', { first, second });

  expect(second).toBeCloseTo(first, 6);
});

test('a zoom writes the distance into the fragment', async ({ page }) => {
  await openMap(page);
  await page.evaluate(() => {
    window.__galaxyMap?.setView?.({
      cursor: [0, 0, 0],
      distance: 34500,
      yaw: 0,
      pitch: 35,
    });
  });
  await page.waitForTimeout(600);

  await page.mouse.move(640, 360);
  await page.mouse.wheel(0, -100);

  await page.waitForFunction(
    () => window.location.hash.includes('d=30000'),
    undefined,
    {
      timeout: 1000,
    },
  );
  // The scenario "The glide writes the landed distance to the fragment". The write that
  // carries the landing is the second one after the notch, so the fragment holds the
  // distance the camera reached and not a distance it passed through.
  const landed = await page.evaluate(
    () => window.__galaxyMap?.getView?.().distance ?? -1,
  );
  console.log('the distance the fragment write carried', landed);
  expect(page.url()).toContain('d=30000');
  expect(landed).toBeCloseTo(30000, 2);
});

test('a stored fragment still loads', async ({ page }) => {
  // The close zoom limit has moved twice, from 2,000 to 500 and then to 10 light
  // years. A fragment written before either move must load unchanged, so the page must
  // not re-clamp the distance it reads.
  await openMap(page, '#c=0,0,0&d=2000&p=35&y=0');
  const view = await page.evaluate(() => window.__galaxyMap?.getView?.() ?? null);
  expect(view?.distance).toBe(2000);
  expect(view?.cursor).toEqual([0, 0, 0]);
});

test('a fragment below the old limit now loads', async ({ page }) => {
  // The close zoom limit moved from 500 to 10 light years, so a distance the old limit
  // would have clamped loads as it was written.
  await openMap(page, '#c=0,0,0&d=50&p=35&y=0');
  const near = await page.evaluate(() => window.__galaxyMap?.getView?.() ?? null);
  expect(near?.distance).toBe(50);

  await openMap(page, '#c=0,0,0&d=1&p=35&y=0');
  const clamped = await page.evaluate(() => window.__galaxyMap?.getView?.() ?? null);
  expect(clamped?.distance).toBe(10);
});

test('a right drag opens no context menu', async ({ page }) => {
  await openMap(page);
  await page.evaluate(() => {
    window.__openContextMenus = 0;
    document.addEventListener('contextmenu', (event) => {
      if (!event.defaultPrevented) {
        window.__openContextMenus = (window.__openContextMenus ?? 0) + 1;
      }
    });
  });

  await page.mouse.move(500, 400);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(560, 430, { steps: 5 });
  await page.mouse.up({ button: 'right' });

  expect(await page.evaluate(() => window.__openContextMenus ?? -1)).toBe(0);
});

test('a left drag turns the camera around the cursor', async ({ page }) => {
  await openMap(page);

  await page.mouse.move(500, 400);
  await page.mouse.down({ button: 'left' });
  await page.mouse.move(560, 430, { steps: 5 });
  await page.mouse.up({ button: 'left' });

  const view = await page.evaluate(() => window.__galaxyMap?.getView?.());
  expect(view?.yaw).toBeCloseTo(18, 3);
  expect(view?.pitch).toBeCloseTo(44, 3);
  expect(view?.cursor).toEqual([0, 0, 0]);
});

// The near plane is `min(10, distance / 10)`. It is 10 light years at every zoom
// distance of 100 and above, which is every zoom distance the map reached before the
// close limit moved, so no view that drew before this change draws differently.
test('the near plane changes no view that draws today', async ({ page }) => {
  for (const fragment of ['', '#c=0,0,0&d=500&p=35&y=0']) {
    await openMap(page, fragment);
    await page.evaluate(() => {
      window.__galaxyMap?.setNearPlane?.(null);
      window.__galaxyMap?.drawNow?.();
    });
    const byTheRule = await page.locator('#map').screenshot();

    await page.evaluate(() => {
      window.__galaxyMap?.setNearPlane?.(10);
      window.__galaxyMap?.drawNow?.();
    });
    const fixed = await page.locator('#map').screenshot();

    expect(Buffer.compare(byTheRule, fixed), `the view "${fragment}"`).toBe(0);
  }
});

// The cursor sits exactly one zoom distance from the camera, so a fixed near plane of
// 10 light years would clip it away at the closest zoom.
test('a marker at the cursor draws at the closest zoom', async ({ page }) => {
  await openMap(page, '#c=0,0,0&d=10&p=35&y=0');
  await page.evaluate(() => {
    // The region overlay draws at every zoom under 30,000 light years now, and this
    // reading is an absolute one, so the overlay goes.
    window.galaxyMap?.debug.setPasses({ regions: false });
    window.galaxyMap?.addCategories([{ name: 'Empire', color: [153, 230, 255] }]);
    window.galaxyMap?.addSystems([
      { name: 'Sol', coords: { x: 0, y: 0, z: 0 }, categories: ['Empire'] },
    ]);
    window.galaxyMap?.debug.drawNow();
  });

  const pixel = await page.evaluate(() => {
    const map = window.galaxyMap;
    if (map === undefined) return [0, 0, 0, 0];
    const screen = map.debug.project([0, 0, 0]);
    return map.debug.readPixel(screen.x, screen.y);
  });
  console.log('the marker at the closest zoom', pixel);

  expect(Math.abs((pixel[0] as number) - 153)).toBeLessThanOrEqual(2);
  expect(Math.abs((pixel[1] as number) - 230)).toBeLessThanOrEqual(2);
  expect(Math.abs((pixel[2] as number) - 255)).toBeLessThanOrEqual(2);
});

// The `g` field of the fragment, which `map-navigation` states. Each test opens the
// demo site's own start state, because the helper's default turns the grid off.
test('a fresh load draws the grid and a g=0 fragment does not', async ({ page }) => {
  await openMap(page, '#c=0,0,0&d=1000&p=35&y=0', { demoData: true });
  const on = await page.evaluate(() => {
    window.galaxyMap?.debug.drawNow();
    return {
      switch: window.galaxyMap?.isGridVisible() ?? false,
      vertices: window.galaxyMap?.debug.gridVertexCount() ?? -1,
    };
  });

  await openMap(page, '#c=0,0,0&d=1000&p=35&y=0&g=0', { demoData: true });
  const off = await page.evaluate(() => {
    window.galaxyMap?.debug.drawNow();
    return {
      switch: window.galaxyMap?.isGridVisible() ?? true,
      vertices: window.galaxyMap?.debug.gridVertexCount() ?? -1,
    };
  });
  console.log('the grid of the fragment', { on, off });

  expect(on.switch).toBe(true);
  expect(on.vertices).toBe(3);
  expect(off.switch).toBe(false);
  expect(off.vertices).toBe(0);
});

test('the HUD grid switch writes the field', async ({ page }) => {
  // The one test of this file that reads the HUD. The map options panel is a drawer
  // below 1400 pixels, so the switch is drawn only above that width. Every other test
  // here reads the canvas with no HUD and keeps the 1280 by 720 viewport of the file.
  await page.setViewportSize({ width: 1600, height: 900 });
  await openMap(page, '#c=0,0,0&d=1000&p=35&y=0', { demoData: true, hud: true });
  const toggle = page.locator('.gm-hud__toggle[data-name="coordinate-grid"]');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');

  await toggle.click();
  await page.waitForFunction(() => window.location.hash.includes('g=0'), undefined, {
    timeout: 2000,
  });

  await toggle.click();
  await page.waitForFunction(() => window.location.hash.includes('g=1'), undefined, {
    timeout: 2000,
  });
  console.log('the fragment after the switch', page.url());
  expect(page.url()).toContain('g=1');
});

// The scenario "A later fragment moves the switch".
test('a later fragment moves the switch and one with no g leaves it', async ({
  page,
}) => {
  await openMap(page, '#c=0,0,0&d=1000&p=35&y=0', { demoData: true });
  expect(await page.evaluate(() => window.galaxyMap?.isGridVisible())).toBe(true);

  await page.evaluate(() => {
    window.location.hash = '#c=0,0,0&d=8000&p=50&y=0&g=0';
  });
  await page.waitForFunction(() => window.galaxyMap?.isGridVisible() === false, {
    timeout: 2000,
  });

  await page.evaluate(() => {
    window.location.hash = '#c=0,0,0&d=9000&p=50&y=0';
  });
  await page.waitForFunction(() => window.galaxyMap?.getView().distance === 9000, {
    timeout: 2000,
  });
  const after = await page.evaluate(() => window.galaxyMap?.isGridVisible() ?? true);
  console.log('the switch after a fragment with no g', after);

  expect(after).toBe(false);
});

// One forward notch from 20,000 light years, which is 17,391.30.
const ONE_NOTCH_LY = 20000 / 1.15;

/** Sends one forward wheel notch to the canvas. */
function sendNotch(): void {
  document
    .getElementById('map')
    ?.dispatchEvent(
      new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true }),
    );
}

// The scenario "A notch moves nothing in its own frame".
test('the wheel sets a target and does not move the camera in the same task', async ({
  page,
}) => {
  await openMap(page, '#c=0,0,0&d=20000&p=35&y=0');

  // The wheel event and the two readings run in one task, so no frame runs between
  // them. The notch sets a target and writes no distance.
  const notch = await page.evaluate(() => {
    const before = window.__galaxyMap?.getView?.().distance ?? -1;
    document
      .getElementById('map')
      ?.dispatchEvent(
        new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true }),
      );
    return {
      before,
      after: window.__galaxyMap?.getView?.().distance ?? -1,
      target: window.__galaxyMap?.zoomTargetLy?.() ?? null,
    };
  });
  console.log('the notch in its own task', notch);

  expect(notch.before).toBe(20000);
  expect(notch.after).toBe(20000);
  expect(notch.target).toBeCloseTo(ONE_NOTCH_LY, 2);
});

// The scenario "The glide lands on the target".
test('the glide lands on the target', async ({ page }) => {
  await openMap(page, '#c=0,0,0&d=20000&p=35&y=0');

  await page.evaluate(sendNotch);
  await page.waitForTimeout(500);
  const landed = await page.evaluate(() => ({
    distance: window.__galaxyMap?.getView?.().distance ?? -1,
    target: window.__galaxyMap?.zoomTargetLy?.() ?? null,
  }));
  console.log('the landed glide', landed);

  expect(landed.distance).toBeCloseTo(ONE_NOTCH_LY, 2);
  expect(landed.target).toBeNull();
});

// The scenario "A host that writes the view ends the glide".
test('a host that writes the view ends the glide', async ({ page }) => {
  await openMap(page, '#c=0,0,0&d=20000&p=35&y=0');

  await page.evaluate(sendNotch);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          window.__galaxyMap?.setView?.({ distance: 8000 });
          resolve();
        });
      }),
  );
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => ({
    distance: window.__galaxyMap?.getView?.().distance ?? -1,
    target: window.__galaxyMap?.zoomTargetLy?.() ?? null,
  }));
  console.log('the view after the host write', after);

  expect(after.distance).toBe(8000);
  expect(after.target).toBeNull();
});

// The scenario "The wheel event raises no view change listener".
test('the wheel event raises no view change listener', async ({ page }) => {
  await openMap(page, '#c=0,0,0&d=20000&p=35&y=0');
  await page.evaluate(() => {
    window.__viewChangeCount = 0;
    window.galaxyMap?.onViewChange(() => {
      window.__viewChangeCount = (window.__viewChangeCount ?? 0) + 1;
    });
  });

  const atNotch = await page.evaluate(() => {
    document
      .getElementById('map')
      ?.dispatchEvent(
        new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true }),
      );
    return window.__viewChangeCount ?? -1;
  });
  await page.waitForTimeout(500);
  const afterGlide = await page.evaluate(() => window.__viewChangeCount ?? -1);
  await page.waitForTimeout(500);
  const atRest = await page.evaluate(() => window.__viewChangeCount ?? -1);
  console.log('the view change counts', { atNotch, afterGlide, atRest });

  expect(atNotch).toBe(0);
  expect(afterGlide).toBeGreaterThan(5);
  expect(atRest).toBe(afterGlide);
});

// The scenario "Reduced motion takes the notch at once".
test.describe('under reduced motion', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('a notch applies at once under reduced motion', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=20000&p=35&y=0');

    const notch = await page.evaluate(() => {
      document
        .getElementById('map')
        ?.dispatchEvent(
          new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true }),
        );
      return {
        distance: window.__galaxyMap?.getView?.().distance ?? -1,
        target: window.__galaxyMap?.zoomTargetLy?.() ?? null,
      };
    });
    console.log('the notch under reduced motion', notch);

    expect(notch.distance).toBeCloseTo(ONE_NOTCH_LY, 2);
    expect(notch.target).toBeNull();
  });
});

test.describe('the browsable bounds', () => {
  /** Waits for the next frame, which is where `auto` bounds follow a change of the set. */
  async function nextFrame(page: Page): Promise<void> {
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        }),
    );
  }

  /** A record the reader accepts, in the one category these tests add. */
  function record(
    name: string,
    position: readonly [number, number, number],
  ): SystemRecordInput {
    return {
      name,
      coords: { x: position[0], y: position[1], z: position[2] },
      categories: ['Empire'],
    };
  }

  /** Adds the one category these records name. A record of an unknown category rejects. */
  async function addCategory(page: Page): Promise<void> {
    await page.evaluate(() => {
      window.galaxyMap?.addCategories([{ name: 'Empire', color: [153, 230, 255] }]);
    });
  }

  /** Adds records through the handle and lets the next frame read the new box. */
  async function addSystems(
    page: Page,
    records: readonly SystemRecordInput[],
  ): Promise<void> {
    const report = await page.evaluate(
      (list) => window.galaxyMap?.addSystems(list) ?? null,
      records,
    );
    expect(report?.added).toBe(records.length);
    await nextFrame(page);
  }

  /**
   * The far zoom limit the map holds, read through the clamp itself: a write of a
   * distance past every limit comes back as the limit. The map states no reading of its
   * own, and a host reads it the same way.
   */
  async function farLimit(page: Page): Promise<number> {
    return page.evaluate(() => {
      window.galaxyMap?.setView({ distance: 1e9 });
      return window.__galaxyMap?.getView?.().distance ?? -1;
    });
  }

  /** Writes a cursor and reads back what the clamp made of it. */
  async function cursorAfter(
    page: Page,
    cursor: readonly [number, number, number],
  ): Promise<[number, number, number]> {
    return page.evaluate((next) => {
      window.galaxyMap?.setView({ cursor: next as [number, number, number] });
      return (window.__galaxyMap?.getView?.().cursor ?? [-1, -1, -1]) as [
        number,
        number,
        number,
      ];
    }, cursor);
  }

  // The scenario "Auto bounds follow the systems".
  test('auto bounds follow the systems', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=2000&p=35&y=0');
    await addCategory(page);
    await page.evaluate(() => {
      window.galaxyMap?.setBounds({ mode: 'auto' });
    });
    await addSystems(page, [
      record('Low', [-500, 0, -500]),
      record('High', [500, 0, 500]),
    ]);

    const cursor = await cursorAfter(page, [5000, 0, 0]);
    console.log('the cursor under auto bounds', cursor);

    // The box edge of 500 plus the 1,000 light year default margin.
    expect(cursor[0]).toBeCloseTo(1500, 6);
  });

  // The scenario "Auto bounds widen as records arrive".
  test('auto bounds widen as records arrive', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=2000&p=35&y=0');
    await addCategory(page);
    await page.evaluate(() => {
      window.galaxyMap?.setBounds({ mode: 'auto' });
    });

    await addSystems(page, [record('One', [0, 0, 0])]);
    const first = await farLimit(page);
    await addSystems(page, [record('Two', [10000, 0, 0])]);
    const second = await farLimit(page);
    console.log('the far limit before and after the second record', first, second);

    expect(second).toBeGreaterThan(first);
  });

  // The scenario "Auto bounds with an empty set do not restrict".
  test('auto bounds with an empty set do not restrict', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=2000&p=35&y=0');
    await page.evaluate(() => {
      window.galaxyMap?.setBounds({ mode: 'auto' });
    });
    await nextFrame(page);

    const cursor = await cursorAfter(page, [40000, 0, 0]);
    const limit = await farLimit(page);
    console.log('the empty auto bounds', cursor, limit);

    expect(cursor).toEqual([40000, 0, 0]);
    expect(limit).toBe(120000);
  });

  // The scenario "Clearing the systems resets auto bounds".
  test('clearing the systems resets auto bounds', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=2000&p=35&y=0');
    await addCategory(page);
    await page.evaluate(() => {
      window.galaxyMap?.setBounds({ mode: 'auto' });
    });
    await addSystems(page, [
      record('Low', [-500, 0, -500]),
      record('High', [500, 0, 500]),
    ]);
    expect((await cursorAfter(page, [40000, 0, 0]))[0]).toBeCloseTo(1500, 6);

    await page.evaluate(() => {
      window.galaxyMap?.clearSystems();
    });
    await nextFrame(page);
    const cursor = await cursorAfter(page, [40000, 0, 0]);
    console.log('the cursor after the clear', cursor);

    expect(cursor).toEqual([40000, 0, 0]);
  });

  // The scenario "A sphere bound caps the zoom".
  test('a sphere bound caps the zoom', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=1000&p=35&y=0');
    await page.evaluate(() => {
      window.galaxyMap?.setBounds({
        mode: 'sphere',
        centre: [0, 0, 0],
        radiusLy: 3000,
      });
      const canvas = document.getElementById('map');
      for (let notch = 0; notch < 100; notch += 1) {
        canvas?.dispatchEvent(
          new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true }),
        );
      }
    });
    await page.waitForTimeout(1000);
    const view = await page.evaluate(() => window.__galaxyMap?.getView?.() ?? null);
    console.log('the view after 100 backward notches', view);

    // `2 * R`, where the sphere just fills the height of the frame.
    expect(view?.distance).toBeCloseTo(6000, 6);
  });

  // The scenario "Narrowing the bounds moves the camera in".
  test('narrowing the bounds moves the camera in', async ({ page }) => {
    await openMap(page, '#c=40000,0,0&d=100000&p=35&y=0');
    await page.evaluate(() => {
      window.__viewChangeCount = 0;
      window.galaxyMap?.onViewChange(() => {
        window.__viewChangeCount = (window.__viewChangeCount ?? 0) + 1;
      });
      window.galaxyMap?.setBounds({
        mode: 'sphere',
        centre: [0, 0, 0],
        radiusLy: 1000,
      });
    });
    await nextFrame(page);
    const after = await page.evaluate(() => ({
      view: window.__galaxyMap?.getView?.() ?? null,
      calls: window.__viewChangeCount ?? -1,
    }));
    console.log('the view after the narrowing', after);

    expect(after.view?.cursor).toEqual([1000, 0, 0]);
    expect(after.view?.distance).toBeCloseTo(2000, 6);
    expect(after.calls).toBeGreaterThan(0);
  });

  // The scenario "Narrowing the bounds drops a running zoom glide".
  //
  // `reclampView` in `src/app/create-map.ts` ends the glide where the clamp moved the
  // view **or** where the target is outside the new far limit. A test of the second one
  // must make the first one impossible. This test therefore derives the bound from the
  // readings it takes: it reads the live distance `d` and the target `t` in the same
  // task as the call, and sets a sphere radius of `(d + t) / 4`. The far limit of that
  // sphere is `(d + t) / 2`, which sits between `d` and `t` while the glide runs. The
  // clamp then has nothing to do, and only the dropped target holds the camera.
  //
  // A fixed radius of 1,000 gave a far limit of 2,000 and a window of one frame. The
  // glide passes 2,000 at 50 ms, which is frame 3, and it lands on its target at
  // 383 ms. The test lets one frame run and then makes a round trip to the page, so the
  // glide often passed the fixed limit first and the reading came from the clamp.
  test('narrowing the bounds drops a running zoom glide', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=1000&p=35&y=0');
    const started = await page.evaluate(() => {
      const canvas = document.getElementById('map');
      for (let notch = 0; notch < 10; notch += 1) {
        canvas?.dispatchEvent(
          new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true }),
        );
      }
      return window.__galaxyMap?.zoomTargetLy?.() ?? null;
    });
    // One frame of the glide runs, so the camera is in flight when the bound lands.
    await nextFrame(page);
    const reading = await page.evaluate(() => {
      const before = window.__galaxyMap?.getView?.() ?? null;
      const beforeDistance = before?.distance ?? -1;
      const beforeTarget = window.__galaxyMap?.zoomTargetLy?.() ?? null;
      // The centre is the origin, which is where this view opens. `reclampView` reads
      // `moved` from the cursor as well as the distance, so another centre would move
      // the cursor and the test would read the clamp again.
      const radiusLy = (beforeDistance + (beforeTarget ?? 0)) / 4;
      window.galaxyMap?.setBounds({ mode: 'sphere', centre: [0, 0, 0], radiusLy });
      const after = window.__galaxyMap?.getView?.() ?? null;
      return {
        beforeCursor: before?.cursor ?? null,
        beforeDistance,
        beforeTarget,
        radiusLy,
        afterCursor: after?.cursor ?? null,
        afterDistance: after?.distance ?? -1,
        afterTarget: window.__galaxyMap?.zoomTargetLy?.() ?? null,
      };
    });
    await page.waitForTimeout(1000);
    const after = await page.evaluate(() => window.__galaxyMap?.getView?.() ?? null);
    console.log('the glide against the derived bound', { started, reading, after });

    // The far limit of that sphere. `farZoomLimit` clamps its result between
    // `MIN_DISTANCE` and `MAX_DISTANCE`, and this line does not. The two readings
    // therefore agree only while the limit is inside that window.
    //
    // The two assertions on the readings after the call carry the proof whatever the
    // clamp does. A real limit under the distance moves the distance. A real limit over
    // the target leaves the target alone. Either one fails the test.
    const farLimit = reading.radiusLy / Math.sin(Math.PI / 6);

    expect(started).toBeGreaterThan(3000);
    expect(reading.beforeTarget).not.toBeNull();
    expect(farLimit).toBeGreaterThan(reading.beforeDistance);
    expect(farLimit).toBeLessThan(reading.beforeTarget as number);
    // The cursor did not move, so `moved` was false and the clamp did nothing.
    expect(reading.afterCursor).toEqual(reading.beforeCursor);
    expect(reading.afterDistance).toBe(reading.beforeDistance);
    expect(reading.afterTarget).toBeNull();
    expect(after?.distance).toBe(reading.beforeDistance);
  });

  // The scenario "An unreadable bound changes nothing".
  test('an unreadable bound changes nothing', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=2000&p=35&y=0');
    const reading = await page.evaluate(() => {
      window.galaxyMap?.setBounds({
        mode: 'sphere',
        centre: [0, 0, 0],
        radiusLy: 3000,
      });
      window.galaxyMap?.setBounds({ mode: 'sphere', centre: [0, 0, 0], radiusLy: 0 });
      return window.galaxyMap?.getBounds() ?? null;
    });
    console.log('the bounds after the unreadable write', reading);

    expect(reading).toEqual({ mode: 'sphere', centre: [0, 0, 0], radiusLy: 3000 });
  });

  // The scenario "The bounds do not hide anything".
  test('the bounds do not hide anything', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=2000&p=35&y=0');
    await page.evaluate(() => {
      window.galaxyMap?.addCategories([{ name: 'Empire', color: [153, 230, 255] }]);
      window.galaxyMap?.setBounds({ mode: 'sphere', centre: [0, 0, 0], radiusLy: 100 });
    });
    // One system inside the bounds and one far outside them.
    await addSystems(page, [record('Near', [0, 0, 0]), record('Far', [5000, 0, 0])]);
    const count = await page.evaluate(() => {
      window.galaxyMap?.debug.drawNow();
      return window.galaxyMap?.debug.systemMarkerCount() ?? -1;
    });
    console.log('the marker count under a 100 light year sphere', count);

    // The bounds hold where the user may go. They cut nothing from the frame.
    expect(count).toBe(2);
  });
});

// The requirement "The host turns individual inputs off" of `map-navigation`.
test.describe('the interaction switches', () => {
  /** The pitch and the zoom every test below opens at. */
  const VIEW = '#c=0,0,0&d=4000&p=35&y=0';

  /** Adds one category and one system at the cursor, and draws a frame. */
  async function addMarker(page: Page): Promise<void> {
    const added = await page.evaluate(() => {
      window.galaxyMap?.addCategories([
        { name: 'Empire', color: [153, 230, 255], maxDrawRange: 200000 },
      ]);
      const report = window.galaxyMap?.addSystems([
        { name: 'Target', coords: { x: 0, y: 0, z: 0 }, categories: ['Empire'] },
      ]);
      window.galaxyMap?.debug.drawNow();
      return report?.added ?? -1;
    });
    expect(added).toBe(1);
  }

  /** Turns switches off and reads every one back. */
  async function turnOff(
    page: Page,
    off: Record<string, boolean>,
  ): Promise<Record<string, boolean>> {
    return page.evaluate((next) => {
      window.galaxyMap?.setInteraction(next);
      return window.galaxyMap?.getInteraction() as unknown as Record<string, boolean>;
    }, off);
  }

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

  test('every switch is on where the host names none', async ({ page }) => {
    await openMap(page, VIEW);
    const switches = await page.evaluate(() => window.galaxyMap?.getInteraction());
    console.log('the switches of a map that names none', switches);
    expect(switches).toEqual({
      zoom: true,
      orbit: true,
      pan: true,
      keys: true,
      select: true,
    });
  });

  // The scenario "The zoom switch stops the wheel".
  test('the zoom switch stops the wheel', async ({ page }) => {
    await openMap(page, VIEW);
    const read = await turnOff(page, { zoom: false });
    expect(read['zoom']).toBe(false);
    // The other four are untouched, which is the partial setting rule.
    expect(read['orbit']).toBe(true);

    const before = await readView(page);
    await page.mouse.move(640, 360);
    for (let notch = 0; notch < 5; notch += 1) await page.mouse.wheel(0, -120);
    await page.waitForTimeout(300);
    const after = await readView(page);
    console.log('the wheel with the zoom off', { before, after });
    expect(after.distance).toBe(before.distance);
  });

  // The scenario "A disabled wheel does not scroll the page".
  test('a disabled wheel does not scroll the page', async ({ page }) => {
    await openMap(page, VIEW);
    await turnOff(page, { zoom: false });
    // The page is made taller than the window, so a wheel the canvas let through would
    // move it.
    await page.evaluate(() => {
      document.body.style.height = '4000px';
    });
    await page.mouse.move(640, 360);
    await page.mouse.wheel(0, 240);
    await page.waitForTimeout(200);
    const scrolled = await page.evaluate(() => window.scrollY);
    console.log('the page offset after the wheel', scrolled);
    expect(scrolled).toBe(0);
  });

  // The scenario "The orbit switch stops the left drag but not the click".
  test('the orbit switch stops the left drag and the drag is no click', async ({
    page,
  }) => {
    await openMap(page, VIEW);
    await addMarker(page);
    await turnOff(page, { orbit: false });

    const before = await readView(page);
    await page.mouse.move(640, 360);
    await page.mouse.down();
    await page.mouse.move(680, 360, { steps: 4 });
    await page.mouse.up();
    const after = await readView(page);
    const selection = await page.evaluate(
      () => window.galaxyMap?.getSelection()?.name ?? null,
    );
    console.log('the left drag with the orbit off', { before, after, selection });

    expect(after.yaw).toBe(before.yaw);
    expect(after.pitch).toBe(before.pitch);
    // The press passed the 4 pixel limit, so the release is not a click.
    expect(selection).toBeNull();
  });

  // The scenario "The select switch stops the click".
  test('the select switch stops the click and leaves the hover', async ({ page }) => {
    await openMap(page, VIEW);
    await addMarker(page);
    await turnOff(page, { select: false });

    const at = await page.evaluate(
      () => window.galaxyMap?.debug.project([0, 0, 0]) ?? { x: -1, y: -1 },
    );
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.mouse.up();
    await page.evaluate(() => {
      window.galaxyMap?.debug.drawNow();
    });
    const reading = await page.evaluate(() => ({
      selection: window.galaxyMap?.getSelection()?.name ?? null,
      hover: window.galaxyMap?.getHover()?.name ?? null,
    }));
    console.log('the click with the select off', reading);

    expect(reading.selection).toBeNull();
    expect(reading.hover).toBe('Target');
  });

  // The scenario "Every switch off still draws and still answers".
  test('every switch off still draws and still answers', async ({ page }) => {
    await openMap(page, VIEW);
    await addMarker(page);
    await turnOff(page, {
      zoom: false,
      orbit: false,
      pan: false,
      keys: false,
      select: false,
    });

    const reading = await page.evaluate(() => {
      window.galaxyMap?.debug.drawNow();
      const at = window.galaxyMap?.debug.project([0, 0, 0]) ?? { x: -1, y: -1 };
      return {
        named: window.galaxyMap?.systemAt(at.x, at.y)?.name ?? null,
        drawn: window.galaxyMap?.debug.systemMarkerCount() ?? -1,
      };
    });
    console.log('the map with every switch off', reading);

    expect(reading.named).toBe('Target');
    expect(reading.drawn).toBe(1);
  });

  // The scenario "The host can still move the camera".
  test('the host can still move the camera', async ({ page }) => {
    await openMap(page, VIEW);
    await turnOff(page, {
      zoom: false,
      orbit: false,
      pan: false,
      keys: false,
      select: false,
    });
    await page.evaluate(() => {
      window.galaxyMap?.setView({ distance: 777 });
    });
    const view = await readView(page);
    console.log('the view a host wrote with every switch off', view);
    expect(view.distance).toBeCloseTo(777, 6);
  });

  // The scenario "The keys switch stops the movement keys".
  test('the keys switch stops the movement keys', async ({ page }) => {
    await openMap(page, VIEW);
    await turnOff(page, { keys: false });

    const before = await readView(page);
    await page.mouse.move(640, 360);
    await page.keyboard.down('w');
    await page.waitForTimeout(400);
    await page.keyboard.up('w');
    const after = await readView(page);
    console.log('the W key with the keys off', { before, after });
    expect(after.cursor).toEqual(before.cursor);
  });

  // The scenario "A switch takes effect during a drag".
  test('a switch takes effect during a drag', async ({ page }) => {
    await openMap(page, VIEW);

    const before = await readView(page);
    await page.mouse.move(640, 360);
    await page.mouse.down();
    await page.mouse.move(660, 360, { steps: 2 });
    const midway = await readView(page);
    await turnOff(page, { orbit: false });
    await page.mouse.move(680, 360, { steps: 2 });
    await page.mouse.up();
    const after = await readView(page);
    console.log('the drag the switch cut off', { before, midway, after });

    // 20 pixels at 0.3 degrees a pixel is 6 degrees, and the second 20 add nothing.
    expect(midway.yaw).not.toBe(before.yaw);
    expect(after.yaw).toBe(midway.yaw);
  });
});
