import { expect, test } from '@playwright/test';
import { openMap } from './helpers';

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
  expect(page.url()).toContain('d=30000');
});

test('a stored fragment still loads', async ({ page }) => {
  // The zoom limit fell from 2,000 to 500 light years. A fragment written before that
  // must load unchanged, so the page must not re-clamp the distance it reads.
  await openMap(page, '#c=0,0,0&d=2000&p=35&y=0');
  const view = await page.evaluate(() => window.__galaxyMap?.getView?.() ?? null);
  expect(view?.distance).toBe(2000);
  expect(view?.cursor).toEqual([0, 0, 0]);
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
