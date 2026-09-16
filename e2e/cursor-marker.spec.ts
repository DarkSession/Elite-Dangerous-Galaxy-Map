import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openMap } from './helpers';

test.use({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });

/** The fill the ring and the four arrows carry. */
const MARKER_FILL = '#3EF8FB';

/** The view the reported fault was seen at, where the cursor sits far below the plane. */
const OFF_PLANE_VIEW =
  '#c=1840.85884,-15539.75557,16507.94703&d=20016.72348&p=58.57998&y=24.66002';

/** Replaces the view and draws one frame. */
async function setView(
  page: Page,
  cursor: readonly [number, number, number],
  distance: number,
  pitch = 45,
  yaw = 0,
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
    { cursor, distance, pitch, yaw },
  );
}

/** The screen box of the ring, in CSS pixels, or null where no marker draws. */
async function ringBox(
  page: Page,
): Promise<{ left: number; top: number; width: number; height: number } | null> {
  return page.evaluate(() => {
    const ring = document.querySelector('.gm-cursor-marker-ring');
    if (ring === null) return null;
    const box = ring.getBoundingClientRect();
    return { left: box.left, top: box.top, width: box.width, height: box.height };
  });
}

/**
 * Where the centre of the ring lands on the screen, in CSS pixels, or null where no
 * marker draws.
 *
 * The reading is the image of the ring's own centre and not the middle of its bounding
 * box. The two are not the same: a circle on the plane projects to a conic whose box is
 * wider on the near side, so the middle of the box sits a few pixels toward the camera.
 */
async function ringCentre(page: Page): Promise<{ x: number; y: number } | null> {
  return page.evaluate(() => {
    const marker = document.querySelector('.gm-cursor-marker') as SVGElement | null;
    const host = marker?.parentElement ?? null;
    if (marker === null || host === null) return null;
    // The ring's centre sits at (80, 80) of a 160 unit view box, which is the middle of
    // the element's own CSS box whatever that box measures. The reading takes the box
    // from the element rather than holding a copy of `CURSOR_MARKER_SIZE_CSS`, so a
    // change of the marker's size does not move this test. The browser's own matrix
    // takes the point to the screen, with the divide by `w` the perspective needs.
    const style = getComputedStyle(marker);
    const half = parseFloat(style.width) / 2;
    const matrix = new DOMMatrix(style.transform);
    const point = new DOMPoint(half, half, 0, 1).matrixTransform(matrix);
    const box = host.getBoundingClientRect();
    return { x: box.left + point.x / point.w, y: box.top + point.y / point.w };
  });
}

/** Where the cursor of the current view projects, in CSS pixels of the canvas. */
async function cursorOnScreen(page: Page): Promise<{ x: number; y: number } | null> {
  return page.evaluate(() => {
    const map = window.galaxyMap;
    const canvas = document.querySelector('canvas');
    if (map === undefined || canvas === null) return null;
    const view = map.getView();
    const place = map.debug.project(view.cursor);
    const box = canvas.getBoundingClientRect();
    return { x: box.left + place.x, y: box.top + place.y };
  });
}

test.describe('the cursor marker', () => {
  test('the marker carries four arrows and one ring', async ({ page }) => {
    await openMap(page);
    await setView(page, [0, 0, 0], 1000);
    const reading = await page.evaluate(() => {
      const marker = document.querySelector('.gm-cursor-marker');
      if (marker === null) return null;
      const arrows = [...marker.querySelectorAll('.gm-cursor-marker-arrow')];
      return {
        markers: document.querySelectorAll('.gm-cursor-marker').length,
        rings: marker.querySelectorAll('.gm-cursor-marker-ring').length,
        arrows: arrows.length,
        fills: arrows.map((arrow) => arrow.getAttribute('fill')),
        turns: arrows.map((arrow) => (arrow as SVGElement).dataset['turn']),
        ringFill: marker.querySelector('.gm-cursor-marker-ring')?.getAttribute('fill'),
      };
    });
    expect(reading).not.toBeNull();
    expect(reading?.markers).toBe(1);
    expect(reading?.rings).toBe(1);
    expect(reading?.arrows).toBe(4);
    expect(reading?.ringFill).toBe(MARKER_FILL);
    expect(reading?.fills).toEqual([
      MARKER_FILL,
      MARKER_FILL,
      MARKER_FILL,
      MARKER_FILL,
    ]);
    // Each arrow is the first turned about the centre of the box, so one points along
    // each of the game `x` and `z` axes.
    expect(reading?.turns).toEqual(['0', '90', '180', '270']);
  });

  test('the marker sits at the cursor', async ({ page }) => {
    await openMap(page);
    await setView(page, [1200, -300, -800], 2000, 45, 30);
    const centre = await ringCentre(page);
    const cursor = await cursorOnScreen(page);
    expect(centre).not.toBeNull();
    expect(cursor).not.toBeNull();
    console.log('the ring centre and the cursor', { centre, cursor });
    expect(Math.abs((centre?.x ?? 0) - (cursor?.x ?? 0))).toBeLessThan(1);
    expect(Math.abs((centre?.y ?? 0) - (cursor?.y ?? 0))).toBeLessThan(1);
  });

  test('the marker lies on the plane', async ({ page }) => {
    await openMap(page);
    await setView(page, [0, 0, 0], 1000, 89);
    const steep = await ringBox(page);
    await setView(page, [0, 0, 0], 1000, 30);
    const shallow = await ringBox(page);
    expect(steep).not.toBeNull();
    expect(shallow).not.toBeNull();
    const steepShare = (steep?.height ?? 0) / (steep?.width ?? 1);
    const shallowShare = (shallow?.height ?? 0) / (shallow?.width ?? 1);
    console.log('the two ring boxes', { steep, shallow, steepShare, shallowShare });
    expect(Math.abs(steepShare - 1)).toBeLessThan(0.05);
    expect(shallowShare).toBeGreaterThan(0.4);
    expect(shallowShare).toBeLessThan(0.6);
  });

  test('the marker holds its size on the screen', async ({ page }) => {
    await openMap(page);
    const widths: number[] = [];
    for (const distance of [100, 1000, 10000]) {
      await setView(page, [0, 0, 0], distance, 89);
      const box = await ringBox(page);
      expect(box).not.toBeNull();
      widths.push(box?.width ?? 0);
    }
    console.log('the ring widths', widths);
    for (const width of widths) {
      // The box is 96 CSS pixels and the ring's outer radius is 48 of 160 view box
      // units, so the ring is 2 * 48 / 160 * 96 = 57.6 CSS pixels across.
      expect(Math.abs(width - 57.6)).toBeLessThan(3);
    }
  });

  // The scenario "The marker shrinks as the camera pulls back".
  test('the marker shrinks as the camera pulls back', async ({ page }) => {
    await openMap(page);
    const widths: number[] = [];
    for (const distance of [12000, 30000, 60000, 120000]) {
      await setView(page, [0, 0, 0], distance, 89);
      const box = await ringBox(page);
      expect(box).not.toBeNull();
      widths.push(box?.width ?? 0);
    }
    console.log('the ring widths across the size band', widths);
    // The box is 96, 78.3, 40 and 40 CSS pixels, and the ring measures 0.6 of it.
    const wanted = [58, 47, 24, 24];
    for (let index = 0; index < wanted.length; index += 1) {
      expect(
        Math.abs((widths[index] as number) - (wanted[index] as number)),
      ).toBeLessThan(3);
    }
  });

  test('the marker follows the cursor off the plane', async ({ page }) => {
    await openMap(page, OFF_PLANE_VIEW);
    await page.evaluate(() => {
      window.galaxyMap?.debug.drawNow();
    });
    const markers = await page.evaluate(
      () => document.querySelectorAll('.gm-cursor-marker').length,
    );
    const centre = await ringCentre(page);
    const cursor = await cursorOnScreen(page);
    expect(markers).toBe(1);
    expect(centre).not.toBeNull();
    expect(cursor).not.toBeNull();
    console.log('the off-plane reading', { centre, cursor });
    expect(Math.abs((centre?.x ?? 0) - (cursor?.x ?? 0))).toBeLessThan(1);
    expect(Math.abs((centre?.y ?? 0) - (cursor?.y ?? 0))).toBeLessThan(1);
  });

  test('the switch removes the marker', async ({ page }) => {
    await openMap(page);
    await setView(page, [0, 0, 0], 1000);
    const count = async (): Promise<number> =>
      page.evaluate(() => document.querySelectorAll('.gm-cursor-marker').length);
    const first = await count();
    await page.evaluate(() => {
      window.galaxyMap?.setCursorMarkerVisible(false);
      window.galaxyMap?.debug.drawNow();
    });
    const second = await count();
    await page.evaluate(() => {
      window.galaxyMap?.setCursorMarkerVisible(true);
      window.galaxyMap?.debug.drawNow();
    });
    const third = await count();
    expect([first, second, third]).toEqual([1, 0, 1]);
  });

  test('the option chooses the marker at start-up', async ({ page }) => {
    await openMap(page);
    const reading = await page.evaluate(async () => {
      const factory = window.galaxyMapFactory;
      if (factory === undefined) return null;
      const build = async (
        options: { cursorMarker?: boolean } | undefined,
      ): Promise<{ on: boolean; markers: number }> => {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'position: absolute; width: 320px; height: 240px;';
        const canvas = document.createElement('canvas');
        canvas.style.cssText = 'display: block; width: 100%; height: 100%;';
        wrap.appendChild(canvas);
        document.body.appendChild(wrap);
        const map = factory(canvas, options);
        await map.ready;
        map.debug.drawNow();
        const result = {
          on: map.getCursorMarkerVisible(),
          markers: wrap.querySelectorAll('.gm-cursor-marker').length,
        };
        map.dispose();
        wrap.remove();
        return result;
      };
      const off = await build({ cursorMarker: false });
      const plain = await build(undefined);
      return { off, plain };
    });
    expect(reading).not.toBeNull();
    expect(reading?.off).toEqual({ on: false, markers: 0 });
    expect(reading?.plain).toEqual({ on: true, markers: 1 });
  });

  test('a selection pin draws over the marker', async ({ page }) => {
    await openMap(page);
    await page.evaluate(() => {
      const map = window.galaxyMap;
      if (map === undefined) return;
      const view = map.getView();
      map.addCategories([
        { name: 'Alpha', color: [153, 230, 255], maxDrawRange: 200000 },
      ]);
      map.addSystems([
        {
          name: 'MARKER TEST',
          coords: { x: view.cursor[0], y: view.cursor[1], z: view.cursor[2] },
          primaryCategory: 'Alpha',
        },
      ]);
      // The identity of a record with no `id64` is its name.
      map.setSelection('MARKER TEST');
      map.debug.drawNow();
    });
    const reading = await page.evaluate(() => {
      const marker = document.querySelector('.gm-cursor-marker');
      const pin = document.querySelector('.gm-system-pin');
      if (marker === null || pin === null) return null;
      const levelOf = (node: Element): number => {
        const level = getComputedStyle(node).zIndex;
        return level === 'auto' ? Number.NaN : Number(level);
      };
      return { marker: levelOf(marker), pin: levelOf(pin) };
    });
    console.log('the two stacking levels', reading);
    expect(reading).not.toBeNull();
    // Both carry a number, so the browser orders them by the number and not by the tree.
    expect(Number.isFinite(reading?.marker ?? Number.NaN)).toBe(true);
    expect(reading?.pin).toBeGreaterThan(reading?.marker ?? 0);
  });
});
