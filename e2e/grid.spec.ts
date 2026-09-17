import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { channels, openMap } from './helpers';

test.use({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });

/** Every scene pass off, so the frame the grid draws over is black. */
const SCENE_OFF = {
  volume: false,
  clouds: false,
  points: false,
  stars: false,
  glow: false,
  regions: false,
  systems: false,
};

/** The galactic centre in game coordinates. */
const GALACTIC_CENTRE: [number, number, number] = [15, -35, 25895];

/**
 * The two views the background merge scenarios read, one over the galactic core and one
 * over the dark space between the arms. One frame at 4,000 light years does not hold
 * both, so the pair is two views and not one.
 *
 * The readings the pair gave at 1920x1080, from `backgroundReading()`:
 *
 * | view | zoom  | mean luminance | luminance at the crossing | blue at it |
 * | ---- | ----- | -------------- | ------------------------- | ---------- |
 * | core | 4,000 | 0.652          | 0.684                     | 163 of 255 |
 * | core | 2,000 | 0.662          | 0.673                     | 161 of 255 |
 * | dark | 4,000 | 0.058          | 0.045                     | 16 of 255  |
 * | dark | 2,000 | 0.050          | 0.041                     | 15 of 255  |
 *
 * Both cursors sit on a crossing of the 10,000 light year level and of the 1,000 light
 * year level, so the label level carries a line through the middle of the frame at both
 * zooms.
 */
const CORE_VIEW: [number, number, number] = [0, 0, 20000];

/** The dark view of the pair. It sits 40,432 light years from the galactic centre. */
const DARK_VIEW: [number, number, number] = [-40000, 0, 20000];

/** Replaces the view and draws one frame. */
async function setView(
  page: Page,
  cursor: readonly [number, number, number],
  distance: number,
  pitch = 89,
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

/** Turns the grid on or off and draws one frame. */
async function setGrid(page: Page, on: boolean): Promise<void> {
  await page.evaluate((value) => {
    window.galaxyMap?.setGridVisible(value);
    window.galaxyMap?.debug.drawNow();
  }, on);
}

/** Switches passes and draws one frame. */
async function setPasses(page: Page, passes: Record<string, boolean>): Promise<void> {
  await page.evaluate((next) => {
    window.galaxyMap?.debug.setPasses(next);
  }, passes);
}

/** The spacing of the label level of the last frame, in light years. */
async function spacingOf(page: Page): Promise<number> {
  return page.evaluate(() => window.galaxyMap?.debug.gridSpacingLy() ?? 0);
}

/** How many vertices the last grid draw issued. */
async function vertexCount(page: Page): Promise<number> {
  return page.evaluate(() => window.galaxyMap?.debug.gridVertexCount() ?? -1);
}

/**
 * The light the grid adds to a rectangle of the frame, one reading for each pixel, on
 * the red channel from 0 to 1. The tone map writes about 10 of 255 into a black frame,
 * so a reading of the frame alone holds that floor as well as the grid. The helper draws
 * the same view with the grid off and with it on and gives back the difference.
 */
async function gridLight(
  page: Page,
  left: number,
  top: number,
  width: number,
  height = 1,
): Promise<number[]> {
  return page.evaluate(
    (input) => {
      const map = window.galaxyMap;
      if (map === undefined) return [];
      const on = map.isGridVisible();
      map.setGridVisible(false);
      map.debug.drawNow();
      const without = map.debug.readRect(
        input.left,
        input.top,
        input.width,
        input.height,
      );
      map.setGridVisible(true);
      map.debug.drawNow();
      const withGrid = map.debug.readRect(
        input.left,
        input.top,
        input.width,
        input.height,
      );
      map.setGridVisible(on);
      map.debug.drawNow();
      const out: number[] = [];
      for (let index = 0; index < withGrid.length; index += 4) {
        const gap = (withGrid[index] as number) - (without[index] as number);
        out.push(Math.max(0, gap) / 255);
      }
      return out;
    },
    { left, top, width, height },
  );
}

/**
 * The largest light the grid adds in a window on a plane point. A projected point falls
 * between two pixels, so a reading of the single pixel under the point misses the line.
 */
async function gridRedAt(
  page: Page,
  point: readonly [number, number, number],
  span = 3,
): Promise<number> {
  const screen = await page.evaluate(
    (where) =>
      window.galaxyMap?.debug.project(where as [number, number, number]) ?? {
        x: 0,
        y: 0,
      },
    point,
  );
  const side = span * 2 + 1;
  const values = await gridLight(
    page,
    Math.round(screen.x) - span,
    Math.round(screen.y) - span,
    side,
    side,
  );
  return values.reduce((best, value) => Math.max(best, value), 0);
}

/** The red channel of a row of the frame, from 0 to 1, left to right. */
async function rawRedAt(
  page: Page,
  point: readonly [number, number, number],
  span = 3,
): Promise<number> {
  return page.evaluate(
    (input) => {
      const map = window.galaxyMap;
      if (map === undefined) return -1;
      const screen = map.debug.project(input.where as [number, number, number]);
      const side = input.span * 2 + 1;
      const bytes = map.debug.readRect(
        Math.round(screen.x) - input.span,
        Math.round(screen.y) - input.span,
        side,
        side,
      );
      let best = 0;
      for (let index = 0; index < bytes.length; index += 4) {
        best = Math.max(best, bytes[index] as number);
      }
      return best / 255;
    },
    { where: point, span },
  );
}

/** The run of lit pixels around a column, as a count and a sum of light. */
function lineAt(
  row: number[],
  centre: number,
  span: number,
): {
  count: number;
  light: number;
} {
  let count = 0;
  let light = 0;
  for (let at = centre - span; at <= centre + span; at += 1) {
    const value = row[at] ?? 0;
    light += value;
    if (value > 0.02) count += 1;
  }
  return { count, light };
}

/** The column of the brightest pixel of a row, weighted over its neighbours. */
function centroidOf(row: number[], centre: number, span: number): number {
  let total = 0;
  let weighted = 0;
  for (let at = centre - span; at <= centre + span; at += 1) {
    const value = row[at] ?? 0;
    total += value;
    weighted += value * at;
  }
  return total === 0 ? -1 : weighted / total;
}

test.describe('the grid geometry', () => {
  test('draws every line on a constant game coordinate', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=1000&p=89&y=0');
    await setPasses(page, SCENE_OFF);
    await setGrid(page, true);
    await setView(page, [0, 0, 0], 1000);

    // The line of constant `x` through the cursor runs down the middle of the frame.
    // Two rows well apart read the same line.
    const reading = await page.evaluate(() => {
      const map = window.galaxyMap;
      if (map === undefined) return null;
      const middle = map.debug.project([0, 0, 0]);
      const rows = [Math.round(middle.y) - 200, Math.round(middle.y) + 200];
      const out: { row: number; row0: number[]; centre: number }[] = [];
      for (const row of rows) {
        const bytes = map.debug.readRect(Math.round(middle.x) - 12, row, 25, 1);
        const values: number[] = [];
        for (let index = 0; index < bytes.length; index += 4) {
          values.push((bytes[index] as number) / 255);
        }
        out.push({ row, row0: values, centre: Math.round(middle.x) - 12 });
      }
      return out;
    });

    const rows = reading as NonNullable<typeof reading>;
    const points: [number, number, number][] = [];
    for (const entry of rows) {
      const column = centroidOf(entry.row0, 12, 12) + entry.centre;
      expect(column).toBeGreaterThan(0);
      const point = await page.evaluate(
        (where) => window.galaxyMap?.debug.planePointAt(where.x, where.y) ?? null,
        { x: column, y: entry.row },
      );
      points.push(point as [number, number, number]);
    }
    console.log('the line of constant x', points);

    const firstX = (points[0] as [number, number, number])[0];
    const secondX = (points[1] as [number, number, number])[0];
    expect(Math.abs(firstX - secondX)).toBeLessThan(2);
    // The line the two rows read sits on a whole multiple of 100 light years, which is
    // the finest level the frame draws at this zoom.
    expect(Math.abs(firstX / 100 - Math.round(firstX / 100))).toBeLessThan(0.02);
  });

  test('draws three vertices in one call at every zoom inside the band', async ({
    page,
  }) => {
    await openMap(page, '#c=0,0,0&d=1000&p=89&y=0');
    await setPasses(page, SCENE_OFF);
    await setGrid(page, true);

    // The camera distance band closes at 12,000 light years, so the three readings sit
    // inside it and the fourth sits beyond it, where the pass does not draw at all.
    const readings: { distance: number; vertices: number; spacing: number }[] = [];
    for (const distance of [10, 1000, 11000, 120000]) {
      await setView(page, [0, 0, 0], distance);
      readings.push({
        distance,
        vertices: await vertexCount(page),
        spacing: await spacingOf(page),
      });
    }
    const levels = await page.evaluate(
      () => window.galaxyMap?.debug.gridLevels().length ?? -1,
    );
    console.log('the grid vertex count', readings, { levels });

    for (const reading of readings.slice(0, 3)) {
      expect(reading.vertices).toBe(3);
    }
    const closed = readings[3] as (typeof readings)[number];
    expect(closed.vertices).toBe(0);
    expect(closed.spacing).toBe(0);
    expect(levels).toBe(0);
  });

  test('sits a line on its coordinate at the closest zoom', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=1000&p=89&y=0');
    await setPasses(page, SCENE_OFF);
    await setGrid(page, true);
    await setView(page, [45000, 0, 45000], 10);

    const reading = await page.evaluate(() => {
      const map = window.galaxyMap;
      if (map === undefined) return null;
      const middle = map.debug.project([45000, 0, 45000]);
      // The 1 light year level is 93.5 CSS pixels apart at this zoom, so the line one
      // spacing to the side sits well clear of the middle one.
      const centre = Math.round(middle.x) + 94;
      const row = Math.round(middle.y);
      const bytes = map.debug.readRect(centre - 12, row, 25, 1);
      const values: number[] = [];
      for (let index = 0; index < bytes.length; index += 4) {
        values.push((bytes[index] as number) / 255);
      }
      return { values, left: centre - 12, row };
    });

    const read = reading as NonNullable<typeof reading>;
    const column = centroidOf(read.values, 12, 12) + read.left;
    expect(column).toBeGreaterThan(0);
    const point = await page.evaluate(
      (where) => window.galaxyMap?.debug.planePointAt(where.x, where.y) ?? null,
      { x: column, y: read.row },
    );
    const gameX = (point as [number, number, number])[0];
    console.log('the line at 45,000 light years', { gameX });

    expect(Math.abs(gameX - Math.round(gameX))).toBeLessThan(0.05);
  });

  test('moves with the cursor off the plane', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=1000&p=89&y=0');
    await setPasses(page, SCENE_OFF);
    await setGrid(page, true);

    await setView(page, [0, 0, 0], 1000);
    const onPlane = await gridRedAt(page, [100, 0, 0]);
    const planeAtZero = await page.evaluate(
      () =>
        document.querySelector('.gm-grid-label')?.textContent?.split(' : ')[1] ?? '',
    );
    const cameraAtZero = await page.evaluate(() => {
      const view = window.galaxyMap?.getView();
      if (view === undefined) return 0;
      return view.cursor[1] + Math.sin((view.pitch * Math.PI) / 180) * view.distance;
    });

    await setView(page, [0, -600, 0], 1000);
    const offPlane = await gridRedAt(page, [100, -600, 0]);
    const stale = await gridRedAt(page, [100, 0, 0]);
    const planeAtLow = await page.evaluate(
      () =>
        document.querySelector('.gm-grid-label')?.textContent?.split(' : ')[1] ?? '',
    );
    const cameraAtLow = await page.evaluate(() => {
      const view = window.galaxyMap?.getView();
      if (view === undefined) return 0;
      return view.cursor[1] + Math.sin((view.pitch * Math.PI) / 180) * view.distance;
    });
    console.log('the plane of the grid', {
      onPlane,
      offPlane,
      stale,
      planeAtZero,
      planeAtLow,
      cameraAtZero,
      cameraAtLow,
    });

    // The `y` of the plane is the middle number of every crossing label.
    expect(planeAtZero).toBe('0');
    expect(planeAtLow).toBe('-600');
    // The camera sits above the plane in both frames.
    expect(cameraAtZero).toBeGreaterThan(0);
    expect(cameraAtLow).toBeGreaterThan(-600);
    // The grid follows the cursor: the line draws on the new plane and not on the old.
    expect(onPlane).toBeGreaterThan(0.1);
    expect(offPlane).toBeGreaterThan(0.1);
    expect(stale).toBeLessThan(0.5 * offPlane);
  });

  test('stops at the model bounds', async ({ page }) => {
    // The zoom sits inside the camera distance band and not on its endpoint, so the
    // grid draws at full strength here.
    await openMap(page, '#c=0,0,0&d=3000&p=89&y=0');
    await setPasses(page, SCENE_OFF);
    await setGrid(page, true);
    // The view rule clamps the cursor to the model bounds, so this puts it on the upper
    // `x` bound without the test naming the number.
    await setView(page, [1e9, 0, 0], 3000);

    const cursorX = await page.evaluate(
      () => window.galaxyMap?.getView().cursor[0] ?? 0,
    );
    const middle = await page.evaluate(
      () => window.galaxyMap?.debug.project([0, 0, 0]) ?? { x: 0, y: 0 },
    );
    const row = await gridLight(page, 0, Math.round(middle.y), 1920);
    let last = -1;
    let lit = 0;
    for (let column = 0; column < row.length; column += 1) {
      if ((row[column] as number) > 0.02) {
        last = column;
        lit += 1;
      }
    }
    const beyond =
      last < 0
        ? null
        : await page.evaluate(
            (where) => window.galaxyMap?.debug.planePointAt(where.x, where.y) ?? null,
            { x: last + 0.5, y: Math.round(middle.y) },
          );
    console.log('the grid at the bound', { cursorX, lit, last, beyond });

    expect(lit).toBeGreaterThan(0);
    const point = beyond as [number, number, number];
    // One CSS pixel is about 3.2 light years at this zoom, so the last lit column may
    // sit about nine pixels past the bound and no further.
    expect(point[0]).toBeLessThan(cursorX + 30);
  });
});

test.describe('the grid look', () => {
  test('draws a coarse line bolder and brighter than a fine one', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=1000&p=89&y=0');
    await setPasses(page, SCENE_OFF);
    await setGrid(page, true);
    await setView(page, [0, 0, 0], 1000);

    const middle = await page.evaluate(
      () => window.galaxyMap?.debug.project([0, 0, 0]) ?? { x: 0, y: 0 },
    );
    const fine = await page.evaluate(
      () => window.galaxyMap?.debug.project([100, 0, 0]) ?? { x: 0, y: 0 },
    );
    // The row sits clear of the lines of constant `z`, which run across it: the one
    // through the cursor is at the middle row and the next is 93.5 CSS pixels away.
    const row = Math.round(middle.y) - 40;
    const left = Math.round(Math.min(middle.x, fine.x)) - 20;
    const values = await gridLight(page, left, row, 140);
    const bold = lineAt(values, Math.round(middle.x) - left, 6);
    const light = lineAt(values, Math.round(fine.x) - left, 6);
    console.log('the two levels', { bold, light, middle, fine });

    expect(bold.count).toBeGreaterThan(light.count);
    expect(bold.light).toBeGreaterThanOrEqual(1.4 * light.light);
  });

  test('draws a crossing no brighter than its lines', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=1000&p=89&y=0');
    await setPasses(page, SCENE_OFF);
    await setGrid(page, true);
    await setView(page, [0, 0, 0], 1000);

    const crossing = await gridRedAt(page, [0, 0, 0]);
    const alongZ = await gridRedAt(page, [0, 0, 450]);
    const alongX = await gridRedAt(page, [450, 0, 0]);
    console.log('the crossing', { crossing, alongZ, alongX });

    expect(crossing).toBeGreaterThan(0.1);
    expect(crossing).toBeLessThanOrEqual(Math.max(alongZ, alongX) + 1 / 255);
  });

  // The scenario "The bold level reads over the galactic core".
  test('reads over the galactic core', async ({ page }) => {
    await openMap(page, '#c=15,-35,25895&d=1000&p=89&y=0');
    await setView(page, GALACTIC_CENTRE, 1000);

    const reading = await page.evaluate((centre) => {
      const map = window.galaxyMap;
      if (map === undefined) return null;
      // A point on the line of constant `x` of the label level, away from a crossing.
      const screen = map.debug.project([0, centre[1], centre[2] + 450]);
      const left = Math.round(screen.x) - 4;
      const top = Math.round(screen.y) - 4;
      map.setGridVisible(false);
      map.debug.drawNow();
      const off = map.debug.readRect(left, top, 9, 9);
      map.setGridVisible(true);
      map.debug.drawNow();
      const on = map.debug.readRect(left, top, 9, 9);
      let best = 0;
      for (let index = 0; index < off.length; index += 4) {
        for (let channel = 0; channel < 3; channel += 1) {
          const gap = Math.abs(
            (on[index + channel] as number) - (off[index + channel] as number),
          );
          best = Math.max(best, gap);
        }
      }
      return { best };
    }, GALACTIC_CENTRE);
    console.log('the grid over the core', reading);

    // The bound was 4 of 255 under the floor of 0.30 and the tint toward the background.
    // The floor is now 0.55 and the line over the core is a deep blue against cream
    // rather than a dimmed orange, so the same line moves a channel by more than twice
    // what it moved.
    expect((reading as NonNullable<typeof reading>).best).toBeGreaterThanOrEqual(10);
  });

  test('antialiases a line across its width', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=1000&p=89&y=3');
    await setPasses(page, SCENE_OFF);
    await setGrid(page, true);
    // A small yaw slants the line, so the 20 rows read it at 20 places inside a pixel.
    await setView(page, [0, 0, 0], 1000, 89, 3);

    const totals = await page.evaluate(() => {
      const map = window.galaxyMap;
      if (map === undefined) return [];
      const middle = map.debug.project([0, 0, 0]);
      const rows: { row: number; left: number }[] = [];
      // The 20 rows sit inside one band of the lines of constant `z`, which run across
      // them 93.5 CSS pixels apart, so no row holds a second line.
      for (let step = 0; step < 20; step += 1) {
        const row = Math.round(middle.y) + 22 + step * 2;
        const onPlane = map.debug.planePointAt(middle.x, row);
        if (onPlane === null) continue;
        const centre = map.debug.project([0, onPlane[1], onPlane[2]]);
        rows.push({ row, left: Math.round(centre.x) - 8 });
      }
      const readAll = (): number[] => {
        const out: number[] = [];
        for (const entry of rows) {
          const bytes = map.debug.readRect(entry.left, entry.row, 17, 1);
          let total = 0;
          for (let index = 0; index < bytes.length; index += 4) {
            total += bytes[index] as number;
          }
          out.push(total);
        }
        return out;
      };
      map.setGridVisible(false);
      map.debug.drawNow();
      const without = readAll();
      map.setGridVisible(true);
      map.debug.drawNow();
      const withGrid = readAll();
      return withGrid.map((value, index) => (value - (without[index] as number)) / 255);
    });
    console.log('the light across the line', totals);

    expect(totals.length).toBe(20);
    const mean = totals.reduce((sum, value) => sum + value, 0) / totals.length;
    for (const total of totals) {
      expect(Math.abs(total - mean) / mean).toBeLessThan(0.1);
    }
  });

  test('draws under the marker', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=1000&p=35&y=0');
    await page.evaluate(() => {
      window.galaxyMap?.addCategories([
        { name: 'Alpha', color: [153, 230, 255], maxDrawRange: 200000 },
      ]);
      window.galaxyMap?.addSystems([
        { name: 'One', coords: { x: 0, y: 0, z: 0 }, primaryCategory: 'Alpha' },
      ]);
    });
    await setView(page, [0, 0, 0], 1000, 35);

    // The marker sits at the cursor, which is the crossing of two lines of the grid.
    // The view is close, where the grid band is full and the background under it is
    // dark, so the merge takes nothing off the line and the reading does not move.
    const marker = await page.evaluate(() => {
      const map = window.galaxyMap;
      if (map === undefined) return null;
      const screen = map.debug.project([0, 0, 0]);
      map.setGridVisible(false);
      map.debug.drawNow();
      const off = map.debug.readPixel(screen.x, screen.y);
      map.setGridVisible(true);
      map.debug.drawNow();
      const on = map.debug.readPixel(screen.x, screen.y);
      return { off, on };
    });
    console.log('the marker over the grid', marker);

    const markerRead = marker as NonNullable<typeof marker>;
    expect(markerRead.on).toEqual(markerRead.off);
  });

  test('draws under the region boundary', async ({ page }) => {
    // 8,000 light years is where the grid band still leaves 0.50 of its alpha, and none
    // at 12,000. The pitch is 5 degrees and not 89, because the boundary takes a range
    // fade per pixel now: it draws nothing under 10,000 light years and in full beyond
    // 20,000. At 89 degrees every pixel reads a plane point about 8,000 light years from
    // the camera and the boundary would draw nowhere in the frame. A pitch of 5 reaches
    // toward the horizon, where the plane is tens of thousands of light years off.
    await openMap(page, '#c=0,0,0&d=8000&p=5&y=0');
    await setView(page, [0, 0, 0], 8000, 5);

    const order = await page.evaluate(() => {
      const map = window.galaxyMap;
      if (map === undefined) return null;
      const side = 800;
      const left = 560;
      const top = 140;
      const read = (grid: boolean, regions: boolean): Uint8Array => {
        map.setGridVisible(grid);
        map.debug.setPasses({ regions });
        map.debug.drawNow();
        return map.debug.readRect(left, top, side, side);
      };
      // The four frames: neither overlay, the grid alone, the boundary alone and both.
      const without = read(false, false);
      const gridOnly = read(true, false);
      const lines = read(false, true);
      const withGrid = read(true, true);
      map.debug.setPasses({ regions: true });

      const magnitude = (frame: Uint8Array, base: Uint8Array, at: number): number => {
        let best = 0;
        for (let channel = 0; channel < 3; channel += 1) {
          best = Math.max(
            best,
            Math.abs((frame[at + channel] as number) - (base[at + channel] as number)),
          );
        }
        return best;
      };

      // The crossing is the pixel where the product of the grid's own contribution and
      // the boundary's own contribution is largest, among the pixels whose own plane
      // point lies beyond the far end of the boundary's range fade. Nearer than that the
      // boundary draws less than its full alpha, and the ratio below would read the fade
      // and not the order of the two passes.
      const view = map.getView();
      const yaw = (view.yaw * Math.PI) / 180;
      const pitch = (view.pitch * Math.PI) / 180;
      const flat = Math.cos(pitch);
      const camera: [number, number, number] = [
        view.cursor[0] - flat * Math.sin(yaw) * view.distance,
        view.cursor[1] + Math.sin(pitch) * view.distance,
        view.cursor[2] - flat * Math.cos(yaw) * view.distance,
      ];
      const rangeAt = (at: number): number => {
        const pixel = at / 4;
        const point = map.debug.planePointAt(
          left + (pixel % side),
          top + Math.floor(pixel / side),
        );
        if (point === null) return 0;
        return Math.hypot(
          point[0] - camera[0],
          point[1] - camera[1],
          point[2] - camera[2],
        );
      };

      const products: { at: number; product: number }[] = [];
      for (let at = 0; at < without.length; at += 4) {
        const product =
          magnitude(gridOnly, without, at) * magnitude(lines, without, at);
        if (product > 0) products.push({ at, product });
      }
      products.sort((first, second) => second.product - first.product);
      let crossing = -1;
      let rows = 0;
      for (const candidate of products) {
        if (rangeAt(candidate.at) <= 20000) continue;
        crossing = candidate.at;
        break;
      }
      // The strip of rows that read beyond the range fade, so a failure says whether the
      // view holds the strip at all or only holds no crossing inside it.
      for (let row = 0; row < side; row += 1) {
        if (rangeAt(row * side * 4) > 20000) rows += 1;
      }
      if (crossing < 0) {
        return {
          error:
            `no pixel of the rectangle carries both overlays beyond 20,000 light ` +
            `years: ${products.length} pixels carry both, and ${rows} of the ` +
            `${side} rows read beyond the fade`,
        } as const;
      }

      // The channel that carries the largest grid contribution there.
      let channel = 0;
      let bestGrid = 0;
      for (let index = 0; index < 3; index += 1) {
        const gap = Math.abs(
          (gridOnly[crossing + index] as number) -
            (without[crossing + index] as number),
        );
        if (gap > bestGrid) {
          bestGrid = gap;
          channel = index;
        }
      }

      // The comparison is the nearest pixel that carries the same grid contribution
      // within a tenth and no boundary contribution at all.
      const pixel = crossing / 4;
      const crossingX = pixel % side;
      const crossingY = Math.floor(pixel / side);
      const target = magnitude(gridOnly, without, crossing);
      let comparison = -1;
      let bestRange = Infinity;
      for (let at = 0; at < without.length; at += 4) {
        if (magnitude(lines, without, at) !== 0) continue;
        const grid = magnitude(gridOnly, without, at);
        if (Math.abs(grid - target) > 0.1 * target) continue;
        const other = at / 4;
        const dx = (other % side) - crossingX;
        const dy = Math.floor(other / side) - crossingY;
        const range = dx * dx + dy * dy;
        if (range < bestRange) {
          bestRange = range;
          comparison = at;
        }
      }
      if (comparison < 0) return null;

      const kept =
        (withGrid[crossing + channel] as number) -
        (lines[crossing + channel] as number);
      const full =
        (gridOnly[comparison + channel] as number) -
        (without[comparison + channel] as number);
      return { channel, target, kept, full, rows, ratio: kept / full };
    });
    console.log('the boundary over the grid', order);

    expect(order).not.toBeNull();
    const read = order as NonNullable<typeof order>;
    expect('error' in read ? read.error : '').toBe('');
    if ('error' in read) return;
    // The boundary draws after the grid, so it keeps only a part of what the grid put
    // down under it. If the grid drew last the ratio would be 1. The rule gives
    // `1 - 0.62`, that is 0.38, where the profile alpha is 1.
    expect(read.ratio).toBeGreaterThanOrEqual(0.25);
    expect(read.ratio).toBeLessThanOrEqual(0.7);
  });
});

test.describe('the background reading', () => {
  test('follows the picture in the two views', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=4000&p=89&y=0');
    // The region overlay draws at every zoom under 30,000 light years now, and this
    // reading is an absolute one, so the overlay goes.
    await setPasses(page, { regions: false });
    await setGrid(page, true);

    const readings = await page.evaluate(
      (views) => {
        const map = window.galaxyMap;
        if (map === undefined) return [];
        const out: unknown[] = [];
        for (const cursor of views) {
          map.setView({
            cursor: cursor as [number, number, number],
            distance: 4000,
            yaw: 0,
            pitch: 89,
          });
          map.debug.drawNow();
          const reading = map.debug.backgroundReading();
          if (reading === null) {
            out.push(null);
            continue;
          }
          let sum = 0;
          let worstChannel = 0;
          let worstLuminance = 0;
          for (const texel of reading.texels) {
            sum += texel.luminance;
            for (const channel of [texel.r, texel.g, texel.b]) {
              worstChannel = Math.max(worstChannel, Math.abs(channel - 0.5));
            }
            const own = 0.2126 * texel.r + 0.7152 * texel.g + 0.0722 * texel.b;
            worstLuminance = Math.max(worstLuminance, Math.abs(own - texel.luminance));
          }
          out.push({
            width: reading.width,
            height: reading.height,
            mean: sum / reading.texels.length,
            worstChannel,
            worstLuminance,
          });
        }
        return out;
      },
      [CORE_VIEW, DARK_VIEW] as unknown as number[][],
    );
    console.log('the reading of the two views', readings);

    const [core, dark] = readings as {
      width: number;
      height: number;
      mean: number;
      worstChannel: number;
      worstLuminance: number;
    }[];
    for (const reading of [core, dark]) {
      expect(reading.width).toBe(120);
      expect(reading.height).toBe(68);
      // Every channel of every texel sits between 0 and 1, so no reading is above 0.5
      // away from the middle of that range.
      expect(reading.worstChannel).toBeLessThanOrEqual(0.5);
      expect(reading.worstLuminance).toBeLessThan(1e-6);
    }
    expect(core.mean).toBeGreaterThanOrEqual(0.55);
    expect(dark.mean).toBeLessThanOrEqual(0.1);
  });

  test('holds no reading and no storage with the grid off', async ({ page }) => {
    // The fragment carries `g=0`, so the page draws its first frame with the grid
    // already off. The demo site turns the grid on at start, and one frame with it on
    // builds the target. The test reads the storage and not only the last reading, so
    // it has to open on a page that never drew the grid.
    await openMap(page, '#c=0,0,0&d=4000&p=89&y=0&g=0');
    await setGrid(page, false);

    const reading = await page.evaluate(() => {
      const map = window.galaxyMap;
      if (map === undefined) return null;
      map.debug.drawNow();
      return {
        texels: map.debug.backgroundReading(),
        size: map.debug.backgroundSize(),
      };
    });
    console.log('the reading with the grid off', reading);

    const read = reading as NonNullable<typeof reading>;
    expect(read.texels).toBeNull();
    expect(read.size).toEqual([0, 0]);
  });

  test('holds still under the grain', async ({ page }) => {
    await openMap(page, '#c=0,0,10000&d=4000&p=89&y=0');
    // The region overlay draws at every zoom under 30,000 light years now, and this
    // reading is an absolute one, so the overlay goes.
    await setPasses(page, { regions: false });
    await setGrid(page, true);

    const steps = await page.evaluate(() => {
      const map = window.galaxyMap;
      if (map === undefined) return [];
      const out: number[] = [];
      // The camera has to move. No shader of this map takes a time uniform and the tone
      // map's dither is a fixed hash of the pixel, so 30 still frames are the same
      // bytes. 20 light years at this zoom is 4.67 CSS pixels, about three tenths of a
      // 16 pixel reading texel.
      for (let frame = 0; frame < 30; frame += 1) {
        map.setView({
          cursor: [frame * 20, 0, 10000],
          distance: 4000,
          yaw: 0,
          pitch: 89,
        });
        map.debug.drawNow();
        const reading = map.debug.backgroundReading();
        if (reading === null) return [];
        const column = Math.floor((960 / 1920) * reading.width);
        const row = Math.floor((540 / 1080) * reading.height);
        const texel = reading.texels[row * reading.width + column];
        if (texel === undefined) return [];
        out.push(texel.luminance);
      }
      return out;
    });
    let worst = 0;
    for (let frame = 1; frame < steps.length; frame += 1) {
      worst = Math.max(
        worst,
        Math.abs((steps[frame] as number) - (steps[frame - 1] as number)),
      );
    }
    console.log('the reading under a fixed point', { frames: steps.length, worst });

    expect(steps).toHaveLength(30);
    // The bound is 0.05 and not 0.02. No order of the chain reaches 0.02: a box average
    // has a hard edge, so a bright star sprite counts in full inside a texel and not at
    // all outside it. The measured worst step is 0.2417 with the average in linear light
    // and 0.0232 with the tone map first. 0.05 is what holds the reading inside the 0.08
    // to 0.55 merge band, where a step of the reading moves the weight.
    expect(worst).toBeLessThan(0.05);
  });
});

test.describe('the grid and the background', () => {
  /** The change the grid makes at the cursor's crossing, channel by channel. */
  async function changeAt(
    page: Page,
    cursor: readonly [number, number, number],
    distance: number,
  ): Promise<{
    pointL: number;
    pointB: number;
    mean: number;
    best: number;
    change: [number, number, number];
  }> {
    return page.evaluate(
      (input) => {
        const map = window.galaxyMap;
        if (map === undefined) throw new Error('no map');
        map.setGridVisible(true);
        map.setView({
          cursor: input.cursor as [number, number, number],
          distance: input.distance,
          yaw: 0,
          pitch: 89,
        });
        map.debug.drawNow();
        const reading = map.debug.backgroundReading();
        if (reading === null) throw new Error('no reading');
        const screen = map.debug.project(input.cursor as [number, number, number]);
        const column = Math.floor((screen.x / 1920) * reading.width);
        const row = Math.floor((screen.y / 1080) * reading.height);
        const texel = reading.texels[row * reading.width + column];
        if (texel === undefined) throw new Error('no texel');
        let sum = 0;
        for (const one of reading.texels) sum += one.luminance;

        const side = 7;
        const left = Math.round(screen.x) - 3;
        const top = Math.round(screen.y) - 3;
        const withGrid = map.debug.readRect(left, top, side, side);
        map.setGridVisible(false);
        map.debug.drawNow();
        const without = map.debug.readRect(left, top, side, side);
        map.setGridVisible(true);
        map.debug.drawNow();

        let best = 0;
        let bestAt = 0;
        for (let at = 0; at < withGrid.length; at += 4) {
          let magnitude = 0;
          for (let channel = 0; channel < 3; channel += 1) {
            magnitude = Math.max(
              magnitude,
              Math.abs(
                (withGrid[at + channel] as number) - (without[at + channel] as number),
              ),
            );
          }
          if (magnitude > best) {
            best = magnitude;
            bestAt = at;
          }
        }
        return {
          pointL: texel.luminance,
          pointB: Math.round(texel.b * 255),
          mean: sum / reading.texels.length,
          best,
          change: [
            (withGrid[bestAt] as number) - (without[bestAt] as number),
            (withGrid[bestAt + 1] as number) - (without[bestAt + 1] as number),
            (withGrid[bestAt + 2] as number) - (without[bestAt + 2] as number),
          ] as [number, number, number],
        };
      },
      { cursor, distance },
    );
  }

  test('recedes over a bright background', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=4000&p=89&y=0');
    // The region overlay draws at every zoom under 30,000 light years now, and this
    // reading is an absolute one, so the overlay goes.
    await setPasses(page, { regions: false });
    const core = await changeAt(page, CORE_VIEW, 4000);
    const dark = await changeAt(page, DARK_VIEW, 4000);
    console.log('the grid over the two views', { core, dark });

    // The premises of the pair, read through `backgroundReading()`.
    expect(core.pointL).toBeGreaterThan(0.55);
    expect(dark.pointL).toBeLessThan(0.1);
    // The line's own blue is 60 of 255, so the dark view's blue has to be under it for
    // the line's blue to rise there.
    expect(dark.pointB).toBeLessThan(60);

    // The reading is a magnitude. Over the core the line is `rgb(16, 74, 120)`, whose
    // luminance is 0.254, and the tone-mapped core reads about 0.93, so a line over the
    // core removes light rather than adding it.
    // The floor holds the grid readable over the core.
    expect(core.best).toBeGreaterThanOrEqual(24);
    expect(dark.best).toBeGreaterThanOrEqual(2);
    // The ratio under 1 holds the grid back over the core.
    const ratio = core.best / dark.best;
    expect(ratio).toBeGreaterThanOrEqual(0.4);
    expect(ratio).toBeLessThanOrEqual(0.8);
  });

  // The scenario "The line darkens over the core and keeps its hue".
  test('darkens over the core and keeps its hue', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=4000&p=89&y=0');
    const core = await changeAt(page, CORE_VIEW, 4000);
    const dark = await changeAt(page, DARK_VIEW, 4000);
    console.log('the change channel by channel', {
      core: core.change,
      dark: dark.change,
    });

    // Over the dark space the line is a light cyan, whose blue is its largest channel,
    // so every channel rises and blue rises the most.
    for (const channel of dark.change) expect(channel).toBeGreaterThan(0);
    expect(dark.change[2]).toBeGreaterThan(dark.change[0]);
    expect(dark.change[2]).toBeGreaterThan(dark.change[1]);

    // Over the core the line is a deep blue against a cream background, so every channel
    // falls, and red falls most because red is where the two stand furthest apart.
    for (const channel of core.change) expect(channel).toBeLessThan(0);
    expect(core.change[0]).toBeLessThan(core.change[1]);
    expect(core.change[0]).toBeLessThan(core.change[2]);
  });
});

test.describe('the grid switch and its probes', () => {
  test('is off unless the options ask for it', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=1000&p=89&y=0');
    const start = await page.evaluate(() => window.galaxyMap?.isGridVisible() ?? true);
    const startVertices = await vertexCount(page);

    await setGrid(page, true);
    const onVertices = await vertexCount(page);
    await setGrid(page, false);
    const offVertices = await vertexCount(page);
    console.log('the grid switch', { start, startVertices, onVertices, offVertices });

    expect(start).toBe(false);
    expect(startVertices).toBe(0);
    expect(onVertices).toBe(3);
    expect(offVertices).toBe(0);
  });

  test('reaches the next frame', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=1000&p=89&y=0');
    await setPasses(page, SCENE_OFF);
    await setView(page, [0, 0, 0], 1000);

    const first = await rawRedAt(page, [0, 0, 0]);
    await setGrid(page, true);
    const on = await rawRedAt(page, [0, 0, 0]);
    await setGrid(page, false);
    const off = await rawRedAt(page, [0, 0, 0]);
    console.log('the switch in one frame', { first, on, off });

    expect(on).toBeGreaterThan(first + 0.1);
    expect(off).not.toBe(on);
    expect(off).toBe(first);
  });

  test('reports the levels of the frame it drew', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=1000&p=89&y=0');
    await setGrid(page, true);
    await setView(page, [0, 0, 0], 1000);

    const reading = await page.evaluate(() => ({
      spacing: window.galaxyMap?.debug.gridSpacingLy() ?? 0,
      levels: window.galaxyMap?.debug.gridLevels() ?? [],
    }));
    console.log('the grid levels', reading);

    expect(reading.spacing).toBe(1000);
    expect(reading.levels).toHaveLength(6);
    const bold = reading.levels[3] as (typeof reading.levels)[number];
    expect(bold.spacingLy).toBe(1000);
    expect(bold.screenCss).toBeGreaterThan(934);
    expect(bold.screenCss).toBeLessThan(936);
    expect(bold.alpha).toBeGreaterThan(0.44);
    expect(bold.alpha).toBeLessThan(0.46);
    expect((reading.levels[0] as (typeof reading.levels)[number]).alpha).toBe(0);
  });

  test('reports nothing with the grid off', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=1000&p=89&y=0');
    await setGrid(page, true);
    const on = await page.evaluate(() => ({
      vertices: window.__galaxyMap?.gridVertexCount?.() ?? -1,
      spacing: window.__galaxyMap?.gridSpacingLy?.() ?? -1,
      levels: window.__galaxyMap?.gridLevels?.().length ?? -1,
    }));

    await setGrid(page, false);
    const off = await page.evaluate(() => ({
      vertices: window.__galaxyMap?.gridVertexCount?.() ?? -1,
      spacing: window.__galaxyMap?.gridSpacingLy?.() ?? -1,
      levels: window.__galaxyMap?.gridLevels?.().length ?? -1,
    }));
    console.log('the grid probes', { on, off });

    expect(on.vertices).toBe(3);
    expect(on.levels).toBe(6);
    expect(off.vertices).toBe(0);
    expect(off.spacing).toBe(0);
    expect(off.levels).toBe(0);
  });

  // The scenario "The label level follows the zoom".
  test('follows the label level through the zoom', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=1000&p=89&y=0');
    await setGrid(page, true);

    const readings: number[] = [];
    for (const distance of [100, 200, 300, 1000, 3000, 11000]) {
      await setView(page, [0, 0, 0], distance);
      readings.push(await spacingOf(page));
    }
    console.log('the label level', readings);

    // Only 100 and 1,000 light years ever carry a number.
    expect(readings).toEqual([100, 100, 1000, 1000, 1000, 1000]);
  });
});

test.describe('the grid labels', () => {
  // The scenario "A crossing label reads its own coordinates".
  test('read the three coordinates of their own crossing', async ({ page }) => {
    await openMap(page, '#c=1000,-600,2000&d=1000&p=89&y=0');
    await setGrid(page, true);
    await setView(page, [1000, -600, 2000], 1000);

    const texts = await page.evaluate(() =>
      [...document.querySelectorAll('.gm-grid-label')].map(
        (element) => element.textContent ?? '',
      ),
    );
    console.log('the crossing labels', texts);

    expect(texts.length).toBeGreaterThan(0);
    for (const text of texts) {
      const parts = text.split(' : ');
      expect(parts, text).toHaveLength(3);
      const numbers = parts.map((part) => Number(part.replace(/,/g, '')));
      for (const part of parts) expect(part, text).toMatch(/^-?[\d,]+$/);
      expect((numbers[0] as number) % 1000, text).toBe(0);
      expect(numbers[1], text).toBe(-600);
      expect((numbers[2] as number) % 1000, text).toBe(0);
      // A number of four digits or more carries a thousands separator. A crossing at
      // `x` = 0 reads `0` and one at `y` = -600 reads `-600`, and neither carries one.
      for (const part of parts) {
        const digits = part.replace(/[-,]/g, '').length;
        expect(part.includes(','), `${text} / ${part}`).toBe(digits >= 4);
      }
    }
  });

  // The scenario "The label count is capped".
  test('cap the crossing label count at 8', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=1000&p=5&y=0');
    await setGrid(page, true);
    await setView(page, [0, 0, 0], 1000, 5);

    const count = await page.evaluate(
      () => document.querySelectorAll('.gm-grid-label').length,
    );
    console.log('the label count at a pitch of 5', count);

    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(8);
  });

  // The scenario "The plane label goes". The grid carried one more element at the lower
  // edge of the canvas, which read the `y` of the plane on its own. That `y` is the
  // middle number of every crossing label now.
  test('carry the plane height in every crossing label', async ({ page }) => {
    await openMap(page, '#c=0,-600,0&d=1000&p=89&y=0');
    await setGrid(page, true);
    await setView(page, [0, -600, 0], 1000);

    const reading = await page.evaluate(() => {
      const host = document.getElementById('labels');
      const crossings = [...document.querySelectorAll('.gm-grid-label')];
      return {
        // Every label element of the host is a crossing label, so the overlay holds no
        // label of its own beside them.
        extra:
          (host?.querySelectorAll('[class*="grid"]').length ?? 0) - crossings.length,
        readings: window.galaxyMap?.debug.gridLabelReadings().length ?? -1,
        texts: crossings.map((element) => element.textContent ?? ''),
      };
    });
    console.log('the labels and the plane height', reading);

    expect(reading.texts.length).toBeGreaterThan(0);
    expect(reading.readings).toBe(reading.texts.length);
    expect(reading.extra).toBe(0);
    for (const text of reading.texts) {
      expect(text.split(' : ')[1], text).toBe('-600');
    }
  });

  test('go with the switch', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=1000&p=89&y=0');
    await setGrid(page, true);
    await setView(page, [0, 0, 0], 1000);
    const on = await page.evaluate(
      () => document.querySelectorAll('.gm-grid-label').length,
    );

    await setGrid(page, false);
    const off = await page.evaluate(
      () => document.querySelectorAll('.gm-grid-label').length,
    );
    console.log('the labels with the switch', { on, off });

    expect(on).toBeGreaterThan(0);
    expect(off).toBe(0);
  });

  // The scenario "A label lies on the plane".
  test('lie on the plane and not upright on the screen', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=1000&p=30&y=0');
    await setGrid(page, true);
    await setView(page, [0, 0, 0], 1000, 30);

    const reading = await page.evaluate(() => {
      const map = window.galaxyMap;
      if (map === undefined) return null;
      const held = map.debug.gridLabelReadings();
      if (held.length === 0) return null;
      // The label nearest the cursor, which projects to the middle of the frame.
      const centre = map.debug.project(map.getView().cursor);
      let best = held[0] as (typeof held)[0];
      let bestRange = Infinity;
      for (const label of held) {
        const range = Math.hypot(label.x - centre.x, label.y - centre.y);
        if (range < bestRange) {
          bestRange = range;
          best = label;
        }
      }
      const corners = best.corners;
      const edge = (first: number, second: number): number => {
        const one = corners[first] as { x: number; y: number };
        const other = corners[second] as { x: number; y: number };
        return Math.hypot(one.x - other.x, one.y - other.y);
      };
      const angle = (first: number, second: number): number => {
        const one = corners[first] as { x: number; y: number };
        const other = corners[second] as { x: number; y: number };
        return Math.atan2(other.y - one.y, other.x - one.x);
      };
      // The grid line of constant `z` through the same crossing runs along the game
      // `x` axis, which is the direction the label's own width runs in.
      const cursor = map.getView().cursor;
      const from = map.debug.project([cursor[0] - 100, cursor[1], cursor[2]]);
      const to = map.debug.project([cursor[0] + 100, cursor[1], cursor[2]]);
      return {
        text: best.text,
        far: edge(0, 1),
        near: edge(3, 2),
        topAngle: angle(0, 1),
        bottomAngle: angle(3, 2),
        lineAngle: Math.atan2(to.y - from.y, to.x - from.x),
      };
    });
    expect(reading).not.toBeNull();
    const read = reading as NonNullable<typeof reading>;
    console.log('the label quad at a pitch of 30 degrees', read);

    // The top edge is the far one: the element's local `y` runs along the game `-z`
    // axis and the camera sits on the `-z` side at a yaw of 0.
    expect(read.far).toBeLessThan(read.near * 0.95);
    const away = (angle: number): number => {
      const gap = Math.abs(angle - read.lineAngle) % (2 * Math.PI);
      return Math.min(gap, 2 * Math.PI - gap) * (180 / Math.PI);
    };
    expect(away(read.topAngle)).toBeLessThan(2);
    expect(away(read.bottomAngle)).toBeLessThan(2);
  });

  // The scenario "A label follows the grid cell it sits in".
  test('hold one share of the cell at every zoom', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=1000&p=89&y=0');
    await setGrid(page, true);

    const shares: number[] = [];
    for (const distance of [800, 1000, 1250]) {
      await setView(page, [0, 0, 0], distance);
      const reading = await page.evaluate(() => {
        const held = window.galaxyMap?.debug.gridLabelReadings() ?? [];
        const first = held[0];
        if (first === undefined) return null;
        return {
          spacing: window.galaxyMap?.debug.gridSpacingLy() ?? 0,
          share: first.capHeightCss / first.spacingCss,
        };
      });
      expect(reading).not.toBeNull();
      expect(reading?.spacing).toBe(1000);
      shares.push(reading?.share ?? 0);
    }
    console.log('the cap height over the spacing', shares);

    const first = shares[0] as number;
    for (const share of shares) {
      expect(Math.abs(share / first - 1)).toBeLessThan(0.02);
      expect(share).toBeLessThanOrEqual(0.1 + 1e-6);
    }
  });

  // The scenario "A label fades with its distance from the cursor".
  test('fade with the distance from the cursor', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=200&p=89&y=0');
    await setGrid(page, true);

    /** The reach of the label of the crossing at the origin, or -1. */
    const reachAt = async (
      cursor: readonly [number, number, number],
    ): Promise<number> => {
      await setView(page, cursor, 200);
      return page.evaluate(() => {
        const held = window.galaxyMap?.debug.gridLabelReadings() ?? [];
        const label = held.find((one) => one.text.startsWith('0 : 0 : 0'));
        return label?.reach ?? -1;
      });
    };

    // The 100 light year level carries the numbers at a zoom of 200 light years.
    const spacing = await spacingOf(page);
    const away = await reachAt([90, 0, 0]);
    const on = await reachAt([0, 0, 0]);
    console.log('the reach at 90 light years and at the crossing', {
      spacing,
      away,
      on,
    });

    expect(spacing).toBe(100);
    // The reach is 2 spacings, so 90 light years is 0.45 of it and the fade reads 0.55.
    expect(away).toBeGreaterThan(0.53);
    expect(away).toBeLessThan(0.57);
    expect(Math.abs(on - 1)).toBeLessThan(0.02);
  });

  // The scenario "No label stands past the reach".
  test('stand no label past the reach', async ({ page }) => {
    await openMap(page, '#c=40,0,-30&d=200&p=89&y=0');
    await setGrid(page, true);
    await setView(page, [40, 0, -30], 200);

    const reading = await page.evaluate(() => {
      const map = window.galaxyMap;
      if (map === undefined) return null;
      const cursor = map.getView().cursor;
      return {
        spacing: map.debug.gridSpacingLy(),
        labels: map.debug.gridLabelReadings().map((label) => {
          const parts = label.text
            .split(' : ')
            .map((part) => Number(part.replace(/,/g, '')));
          return {
            text: label.text,
            away: Math.hypot(
              (parts[0] as number) - cursor[0],
              (parts[2] as number) - cursor[2],
            ),
          };
        }),
      };
    });
    expect(reading).not.toBeNull();
    const read = reading as NonNullable<typeof reading>;
    console.log('the labels and their distance from the cursor', read);

    expect(read.spacing).toBe(100);
    expect(read.labels.length).toBeGreaterThan(0);
    for (const label of read.labels) {
      // The reach is 2 spacings of the 100 light year level.
      expect(label.away, label.text).toBeLessThan(200);
    }
  });

  // The scenario "A label is no wider than the cell it names".
  test('draw no label wider than the cell it names', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=1000&p=89&y=0');
    await setGrid(page, true);

    let widest = 0;
    for (const distance of [150, 1000]) {
      await setView(page, [0, 0, 0], distance);
      const labels = await page.evaluate(() =>
        (window.galaxyMap?.debug.gridLabelReadings() ?? []).map((label) => {
          const corners = label.corners;
          const one = corners[0] as { x: number; y: number };
          const other = corners[1] as { x: number; y: number };
          const top = Math.hypot(one.x - other.x, one.y - other.y);
          const third = corners[3] as { x: number; y: number };
          const fourth = corners[2] as { x: number; y: number };
          const bottom = Math.hypot(third.x - fourth.x, third.y - fourth.y);
          // The mean of the two edges is the quad's width on the screen. The near edge
          // is a little longer than the far one and the spacing is read at the crossing
          // between them, so one edge alone would carry the perspective of its own row.
          return {
            text: label.text,
            share: (top + bottom) / 2 / label.spacingCss,
          };
        }),
      );
      console.log(`the label widths at ${distance} light years`, labels);
      expect(labels.length).toBeGreaterThan(0);
      for (const label of labels) {
        // The placement holds the label's width to 0.6 of a spacing on the plane
        // exactly. The screen reading carries a residue of 0.07 per cent, because the
        // quad's width is a pair of chords either side of the crossing and the spacing is
        // the projection's local rate at the crossing itself.
        expect(label.share, label.text).toBeLessThanOrEqual(0.6006);
        widest = Math.max(widest, label.share);
      }
    }
    expect(widest).toBeGreaterThan(0.4);
  });

  // Task 8.10, which reads the sharpness of the transformed text. No scenario of
  // `coordinate-grid` states it: the placement's geometry is read by "A label lies on the
  // plane" and its rasterisation is a look fault the task guards.
  test('draw the transformed text as sharply as upright text', async ({ page }) => {
    await openMap(page, '#c=-40000,0,20000&d=1000&p=30&y=0');
    // A black frame, so the only structure in the reading is the text itself.
    await setPasses(page, SCENE_OFF);
    await setGrid(page, true);
    await setView(page, [-40000, 0, 20000], 1000, 30);
    await page.waitForTimeout(300);

    // The label nearest the cursor, and an upright copy of the same text at the same
    // width on the screen, placed over an empty part of the frame.
    const boxes = await page.evaluate(() => {
      const map = window.galaxyMap;
      const host = document.getElementById('labels');
      if (map === undefined || host === null) return null;
      const held = map.debug.gridLabelReadings();
      if (held.length === 0) return null;
      const centre = map.debug.project(map.getView().cursor);
      let best = held[0] as (typeof held)[0];
      let bestRange = Infinity;
      for (const label of held) {
        const range = Math.hypot(label.x - centre.x, label.y - centre.y);
        if (range < bestRange) {
          bestRange = range;
          best = label;
        }
      }
      const elements = [...document.querySelectorAll('.gm-grid-label')];
      const element = elements[held.indexOf(best)] as HTMLElement | undefined;
      if (element === undefined) return null;
      const on = element.getBoundingClientRect();

      // The width of the transformed quad on the screen, as the mean of its two edges.
      const corners = best.corners;
      const lengthOf = (first: number, second: number): number => {
        const one = corners[first] as { x: number; y: number };
        const other = corners[second] as { x: number; y: number };
        return Math.hypot(one.x - other.x, one.y - other.y);
      };
      const wantWidth = (lengthOf(0, 1) + lengthOf(3, 2)) / 2;

      const copy = document.createElement('div');
      copy.id = 'upright-copy';
      copy.textContent = best.text;
      const style = copy.style;
      style.position = 'absolute';
      style.left = '60px';
      style.top = '820px';
      style.whiteSpace = 'nowrap';
      style.letterSpacing = '0';
      style.color = getComputedStyle(element).color;
      style.opacity = element.style.opacity;
      style.paintOrder = getComputedStyle(element).paintOrder;
      style.webkitTextStroke = getComputedStyle(element).webkitTextStroke;
      style.font = `100px/100px ${getComputedStyle(element).fontFamily}`;
      host.append(copy);
      const at100 = copy.getBoundingClientRect().width;
      const size = (wantWidth / at100) * 100;
      style.font = `${size}px/${size}px ${getComputedStyle(element).fontFamily}`;
      const upright = copy.getBoundingClientRect();
      return {
        text: best.text,
        size,
        on: { x: on.left, y: on.top, width: on.width, height: on.height },
        upright: {
          x: upright.left,
          y: upright.top,
          width: upright.width,
          height: upright.height,
        },
      };
    });
    expect(boxes).not.toBeNull();
    const read = boxes as NonNullable<typeof boxes>;

    const shot = (await page.screenshot({ type: 'png' })).toString('base64');

    const contrasts = await page.evaluate(
      async (input) => {
        const image = new Image();
        await new Promise<void>((resolve, reject) => {
          image.onload = (): void => {
            resolve();
          };
          image.onerror = (): void => {
            reject(new Error('the screenshot did not decode'));
          };
          image.src = `data:image/png;base64,${input.shot}`;
        });
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext('2d');
        if (context === null) throw new Error('the page gave no 2D context');
        context.drawImage(image, 0, 0);

        /**
         * The edge contrast of one box: the mean of the largest tenth of the horizontal
         * luminance steps, over the range of the box. A soft raster spreads the same
         * step over more columns, so the reading falls.
         */
        const contrastOf = (box: {
          x: number;
          y: number;
          width: number;
          height: number;
        }): number => {
          const left = Math.max(0, Math.floor(box.x));
          const top = Math.max(0, Math.floor(box.y));
          const width = Math.min(Math.ceil(box.width), canvas.width - left);
          const height = Math.min(Math.ceil(box.height), canvas.height - top);
          if (width < 4 || height < 2) return 0;
          const data = context.getImageData(left, top, width, height).data;
          const lumAt = (column: number, row: number): number => {
            const at = (row * width + column) * 4;
            return (
              0.2126 * (data[at] as number) +
              0.7152 * (data[at + 1] as number) +
              0.0722 * (data[at + 2] as number)
            );
          };
          const steps: number[] = [];
          let low = 255;
          let high = 0;
          for (let row = 0; row < height; row += 1) {
            for (let column = 0; column < width; column += 1) {
              const value = lumAt(column, row);
              low = Math.min(low, value);
              high = Math.max(high, value);
              if (column > 0) steps.push(Math.abs(value - lumAt(column - 1, row)));
            }
          }
          if (steps.length === 0 || high - low < 1) return 0;
          steps.sort((one, other) => other - one);
          const top10 = steps.slice(0, Math.max(1, Math.round(steps.length / 10)));
          const mean = top10.reduce((sum, one) => sum + one, 0) / top10.length;
          return mean / (high - low);
        };

        return {
          plane: contrastOf(input.on),
          upright: contrastOf(input.upright),
        };
      },
      { shot, on: read.on, upright: read.upright },
    );
    console.log('the edge contrast of the two renders', {
      contrasts,
      share: contrasts.plane / contrasts.upright,
      label: read,
    });

    await page.evaluate(() => {
      document.getElementById('upright-copy')?.remove();
    });

    expect(contrasts.upright).toBeGreaterThan(0);
    const share = contrasts.plane / contrasts.upright;
    // The bound is 0.75 and not 0.85. It read 0.922 while a label was a whole spacing
    // wide; at a width share of 0.6 the same reading is about 0.805, because a smaller
    // glyph loses proportionally more of its edge to the transform's resampling. The
    // guard is here to catch a gross blur in the placement, not to bound the physics of
    // small text: building the element one octave larger moved the reading only from
    // 0.809 to 0.813, so the loss is not under-sampling of the source.
    expect(share).toBeGreaterThanOrEqual(0.75);
    expect(share).toBeLessThanOrEqual(1.15);
  });

  // The scenario "A number stands clear of the lines it names".
  test('stand every number clear of the lines it names', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=1000&p=89&y=0');
    await setGrid(page, true);
    await setView(page, [0, 0, 0], 1000);

    const labels = await page.evaluate(() =>
      (window.galaxyMap?.debug.gridLabelReadings() ?? []).map((label) => ({
        text: label.text,
        crossing: { x: label.x, y: label.y },
        corners: label.corners.map((corner) => ({ x: corner.x, y: corner.y })),
        spacingCss: label.spacingCss,
      })),
    );
    console.log('the labels and their own crossings', labels);
    expect(labels.length).toBeGreaterThan(0);

    for (const label of labels) {
      const corners = label.corners;
      expect(corners, label.text).toHaveLength(4);
      // The crossing is inside the quad when it stays on the same side of all four
      // edges. The quad is convex, so the sign of the cross product answers it.
      let sides = 0;
      for (let index = 0; index < 4; index += 1) {
        const one = corners[index] as { x: number; y: number };
        const two = corners[(index + 1) % 4] as { x: number; y: number };
        const cross =
          (two.x - one.x) * (label.crossing.y - one.y) -
          (two.y - one.y) * (label.crossing.x - one.x);
        sides += cross >= 0 ? 1 : -1;
      }
      expect(Math.abs(sides), `${label.text} inside its own quad`).toBeLessThan(4);

      const gaps = corners.map((corner) =>
        Math.hypot(corner.x - label.crossing.x, corner.y - label.crossing.y),
      );
      const nearest = Math.min(...gaps);
      // The gap of 0.04 of a spacing on each axis puts the corner `0.04 * sqrt(2)` of a
      // spacing from the crossing, that is 0.057, and the bound is 0.12.
      expect(nearest / label.spacingCss, `${label.text} nearest corner`).toBeLessThan(
        0.12,
      );
      // The nearest corner is the label's own bottom right, which is the third of the
      // four corners `plane-overlay` reports. A wrong sign on either axis reads the same
      // distance and names another corner.
      expect(gaps.indexOf(nearest), `${label.text} which corner`).toBe(2);
    }
  });

  // The scenario "Every corner of the cursor's own cell carries a number".
  test('carry a number on every corner of the cursor own cell', async ({ page }) => {
    await openMap(page, '#c=5,0,5&d=200&p=89&y=0');
    await setGrid(page, true);
    await setView(page, [5, 0, 5], 200);

    const reading = await page.evaluate(() => {
      const map = window.galaxyMap;
      if (map === undefined) return null;
      return {
        spacing: map.debug.gridSpacingLy(),
        labels: map.debug.gridLabelReadings().map((label) => {
          const parts = label.text
            .split(' : ')
            .map((part) => Number(part.replace(/,/g, '')));
          return {
            text: label.text,
            x: parts[0] as number,
            z: parts[2] as number,
            reach: label.reach,
          };
        }),
      };
    });
    expect(reading).not.toBeNull();
    const read = reading as NonNullable<typeof reading>;
    console.log('the labels around the cursor', read);

    // The 100 light year level carries the numbers at a zoom of 200 light years, and the
    // cursor sits 5 light years from the crossing at the origin on each axis.
    expect(read.spacing).toBe(100);
    const wanted = [
      [0, 0],
      [0, 100],
      [100, 0],
      [100, 100],
    ] as const;
    for (const [x, z] of wanted) {
      const found = read.labels.find((label) => label.x === x && label.z === z);
      expect(found, `the corner ${x} : ${z}`).toBeDefined();
    }
    // The four corners sit at 7.1, 95.1, 95.1 and 134.4 light years from the cursor. The
    // old reach of 1.2 spacings left the quadrant beyond the cursor with no number.
    const furthest = read.labels.find((label) => label.x === 100 && label.z === 100);
    expect(furthest).toBeDefined();
    const away = Math.hypot(95, 95);
    expect(away).toBeCloseTo(134.4, 1);
    // The reach of 2 spacings draws that corner at 0.33 of its own opacity.
    expect((furthest as { reach: number }).reach).toBeGreaterThan(0.31);
    expect((furthest as { reach: number }).reach).toBeLessThan(0.35);
  });

  // The scenario "A label recedes over a bright background".
  test('recede a label over a bright background', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=1000&p=89&y=0');
    // The region overlay draws at every zoom under 30,000 light years now, and this
    // reading is an absolute one, so the overlay goes.
    await setPasses(page, { regions: false });
    await setGrid(page, true);

    /** The label nearest the cursor, with its opacity, its colour and its stroke. */
    const labelAt = async (
      cursor: readonly [number, number, number],
    ): Promise<{
      opacity: number;
      colour: number[];
      stroke: string;
      count: number;
    }> => {
      await page.evaluate((where) => {
        window.galaxyMap?.setView({
          cursor: where as [number, number, number],
          distance: 1000,
          yaw: 0,
          pitch: 89,
        });
      }, cursor);
      // The reading goes back to the processor without waiting for the card, so the
      // labels of a frame read the reading of the frame before. A few real frames put
      // the reading of this view under the labels.
      await page.waitForTimeout(300);
      return page.evaluate(() => {
        const map = window.galaxyMap;
        const labels = [
          ...document.querySelectorAll('.gm-grid-label'),
        ] as HTMLElement[];
        const centre = map?.debug.project(map.getView().cursor) ?? { x: 960, y: 540 };
        let best: HTMLElement | null = null;
        let bestRange = Infinity;
        for (const label of labels) {
          const box = label.getBoundingClientRect();
          const range = Math.hypot(
            box.left + box.width / 2 - centre.x,
            box.top + box.height / 2 - centre.y,
          );
          if (range < bestRange) {
            bestRange = range;
            best = label;
          }
        }
        if (best === null) {
          return { opacity: -1, colour: [], stroke: '', count: labels.length };
        }
        const colour = getComputedStyle(best)
          .color.replace(/[^\d,.]/g, '')
          .split(',')
          .map((part) => Number(part));
        return {
          opacity: Number(best.style.opacity),
          colour,
          stroke: getComputedStyle(best).webkitTextStrokeColor,
          count: labels.length,
        };
      });
    };

    const core = await labelAt(CORE_VIEW);
    const dark = await labelAt(DARK_VIEW);
    console.log('the label in the two views', { core, dark });

    expect(core.count).toBeGreaterThan(0);
    expect(dark.count).toBeGreaterThan(0);
    // The label nearest the cursor holds the reach fade at 1 and the line factor at 1
    // at a pitch of 89 degrees, so the reading is of the background rule alone.
    expect(core.opacity).toBeGreaterThanOrEqual(0.7 * 0.8);
    expect(core.opacity).toBeLessThanOrEqual(0.8 * 0.8);
    expect(dark.opacity).toBeGreaterThan(0.95 * 0.8);
    const near = (reading: number[], wanted: number[]): number =>
      Math.max(...wanted.map((one, at) => Math.abs((reading[at] ?? -999) - one)));
    expect(near(core.colour, [20, 88, 140])).toBeLessThanOrEqual(8);
    expect(near(dark.colour, [140, 235, 240])).toBeLessThanOrEqual(8);
    // The dark edge is a stroke now, and it is the same cool dark the blurred glow used.
    // A pure black edge draws a second outline that no part of the picture carries.
    for (const stroke of [core.stroke, dark.stroke]) {
      expect(stroke).not.toBe('rgb(0, 0, 0)');
      expect(stroke).not.toBe('rgba(0, 0, 0, 0.9)');
    }
  });

  // The scenario "A label carries a stroke and no shadow".
  test('carry a stroke and no shadow', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=1000&p=89&y=0');
    await setGrid(page, true);
    await setView(page, [0, 0, 0], 1000, 89);

    const read = await page.evaluate(() =>
      [...document.querySelectorAll('.gm-grid-label')].map((element) => {
        const style = getComputedStyle(element);
        return {
          shadow: style.textShadow,
          width: style.webkitTextStrokeWidth,
          colour: style.webkitTextStrokeColor,
          order: style.paintOrder,
        };
      }),
    );
    console.log('the coordinate label edge', read[0], `of ${read.length}`);

    expect(read.length).toBeGreaterThan(0);
    for (const label of read) {
      expect(label.shadow).toBe('none');
      expect(label.width).toBe('2.5px');
      const [red, green, blue, alpha] = channels(label.colour);
      expect(Math.abs(red - 2), label.colour).toBeLessThanOrEqual(2);
      expect(Math.abs(green - 12), label.colour).toBeLessThanOrEqual(2);
      expect(Math.abs(blue - 20), label.colour).toBeLessThanOrEqual(2);
      expect(alpha).toBeCloseTo(0.9, 2);
      // `stroke fill markers` is the full order, so a browser may drop the keywords the
      // order implies. Chromium serialises the computed value as `stroke`.
      expect(['stroke', 'stroke fill']).toContain(label.order);
    }
  });
});

test.describe('the camera distance band', () => {
  test('reads the three probes inside the band and beyond it', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=3000&p=89&y=0');
    await setPasses(page, SCENE_OFF);
    await setGrid(page, true);

    await setView(page, [0, 0, 0], 3000);
    const near = await page.evaluate(() => ({
      vertices: window.galaxyMap?.debug.gridVertexCount() ?? -1,
      spacing: window.galaxyMap?.debug.gridSpacingLy() ?? -1,
      levels: window.galaxyMap?.debug.gridLevels().length ?? -1,
    }));

    await setView(page, [0, 0, 0], 60000);
    const wide = await page.evaluate(() => ({
      vertices: window.galaxyMap?.debug.gridVertexCount() ?? -1,
      spacing: window.galaxyMap?.debug.gridSpacingLy() ?? -1,
      levels: window.galaxyMap?.debug.gridLevels().length ?? -1,
      labels: document.querySelectorAll('.gm-grid-label').length,
      on: window.galaxyMap?.isGridVisible() ?? false,
    }));
    console.log('the probes inside and beyond the band', { near, wide });

    expect(near.vertices).toBe(3);
    expect(near.spacing).toBe(1000);
    expect(near.levels).toBe(6);
    // The switch is still on, and the band alone empties the frame.
    expect(wide.on).toBe(true);
    expect(wide.vertices).toBe(0);
    expect(wide.spacing).toBe(0);
    expect(wide.levels).toBe(0);
    expect(wide.labels).toBe(0);
  });

  // The scenario "The alpha carries the band". The band halves between 4,000 and 8,000
  // light years. A level's own alpha follows its spacing on the screen, which the zoom
  // moves as well, so the halving shows on a level whose spacing rule is already at its
  // top: the 10,000 light year level is 2,338 CSS pixels apart at 4,000 light years and
  // 1,169 at 8,000, both over the 400 the rule saturates at. The 1,000 light year level
  // is inside that rule's ramp at both zooms, so it is read here and not asserted on.
  test('reports the alpha the band leaves', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=4000&p=89&y=0');
    await setGrid(page, true);

    await setView(page, [0, 0, 0], 4000);
    const full = await page.evaluate(() => window.galaxyMap?.debug.gridLevels() ?? []);
    await setView(page, [0, 0, 0], 8000);
    const half = await page.evaluate(() => window.galaxyMap?.debug.gridLevels() ?? []);
    console.log('the alpha at 4,000 and at 8,000', {
      coarseFull: full[4],
      coarseHalf: half[4],
      fineFull: full[3],
      fineHalf: half[3],
    });

    const coarseFull = full[4] as (typeof full)[number];
    const coarseHalf = half[4] as (typeof half)[number];
    expect(coarseFull.spacingLy).toBe(10000);
    expect(coarseHalf.spacingLy).toBe(10000);
    expect(coarseFull.alpha).toBeCloseTo(0.45, 2);
    expect(coarseHalf.alpha).toBeCloseTo(coarseFull.alpha / 2, 2);
  });

  // The scenario "A wide view draws no grid".
  test('draws the same pixels at the start view with the switch on and off', async ({
    page,
  }) => {
    await openMap(page, '#c=0,0,0&d=60000&p=35&y=0');
    await setView(page, [0, 0, 0], 60000, 35);

    const reading = await page.evaluate(() => {
      const map = window.galaxyMap;
      const canvas = document.querySelector('canvas');
      if (map === undefined || !(canvas instanceof HTMLCanvasElement)) return null;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      map.setGridVisible(false);
      map.debug.drawNow();
      const off = map.debug.readRect(0, 0, width, height);
      map.setGridVisible(true);
      map.debug.drawNow();
      const on = map.debug.readRect(0, 0, width, height);
      let different = 0;
      for (let index = 0; index < on.length; index += 1) {
        if (on[index] !== off[index]) different += 1;
      }
      return {
        different,
        bytes: on.length,
        vertices: map.debug.gridVertexCount(),
        labels: document.querySelectorAll('.gm-grid-label').length,
      };
    });
    console.log('the start view with the grid on and off', reading);

    const read = reading as NonNullable<typeof reading>;
    expect(read.bytes).toBe(1920 * 1080 * 4);
    expect(read.different).toBe(0);
    expect(read.vertices).toBe(0);
    expect(read.labels).toBe(0);
  });
});

test.describe('the grid labels and their lines', () => {
  // The scenario "Every label sits on a line".
  test('sit every label on a pixel the grid lit', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=3000&p=5&y=0');
    await setPasses(page, SCENE_OFF);
    await setGrid(page, true);
    await setView(page, [0, 0, 0], 3000, 5);

    const reading = await page.evaluate(() => {
      const map = window.galaxyMap;
      const canvas = document.querySelector('canvas');
      if (map === undefined || !(canvas instanceof HTMLCanvasElement)) return null;
      // The reading is taken at the label's **anchor**, which is the crossing itself.
      // The label's own box stands clear of the crossing by design, so the middle of the
      // box lies inside the cell, where no line draws.
      const spots: { text: string; x: number; y: number }[] = [];
      for (const held of map.debug.gridLabelReadings()) {
        spots.push({
          text: held.text,
          x: Math.round(held.x),
          y: Math.round(held.y),
        });
      }
      const readAll = (): number[] =>
        spots.map((spot) => {
          const left = Math.min(
            Math.max(0, spot.x - 3),
            Math.max(0, canvas.clientWidth - 7),
          );
          const top = Math.min(
            Math.max(0, spot.y - 3),
            Math.max(0, canvas.clientHeight - 7),
          );
          const bytes = map.debug.readRect(left, top, 7, 7);
          let best = 0;
          for (let index = 0; index < bytes.length; index += 4) {
            best = Math.max(best, bytes[index] as number);
          }
          return best;
        });
      map.setGridVisible(false);
      map.debug.drawNow();
      const off = readAll();
      map.setGridVisible(true);
      map.debug.drawNow();
      const on = readAll();
      return spots.map((spot, index) => ({
        ...spot,
        light: ((on[index] as number) - (off[index] as number)) / 255,
      }));
    });

    const labels = reading as NonNullable<typeof reading>;
    console.log('the labels and the light under them', labels);

    expect(labels.length).toBeGreaterThan(0);
    expect(labels.length).toBeLessThanOrEqual(8);
    for (const label of labels) {
      expect(label.light, `the label "${label.text}"`).toBeGreaterThan(0.01);
    }
  });

  // The scenario "A label goes out with its lines".
  test('leave the overlay where the band leaves 0.011 of the alpha', async ({
    page,
  }) => {
    await openMap(page, '#c=0,0,0&d=11500&p=89&y=0');
    await setGrid(page, true);

    await setView(page, [0, 0, 0], 11500);
    const far = await page.evaluate(() => ({
      labels: document.querySelectorAll('.gm-grid-label').length,
      spacing: window.galaxyMap?.debug.gridSpacingLy() ?? -1,
      vertices: window.galaxyMap?.debug.gridVertexCount() ?? -1,
    }));

    await setView(page, [0, 0, 0], 3000);
    const near = await page.evaluate(
      () => document.querySelectorAll('.gm-grid-label').length,
    );
    console.log('the labels at 11,500 and at 3,000 light years', { far, near });

    // The pass still draws at 11,500 light years and the label level is still 1,000,
    // so the label gate and not the switch is what empties the overlay.
    expect(far.vertices).toBe(3);
    expect(far.spacing).toBe(1000);
    expect(far.labels).toBe(0);
    expect(near).toBeGreaterThan(0);
  });

  // The scenario "No label stands past the last line".
  test('place no label past the model bound', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=1000&p=89&y=0');
    await setGrid(page, true);
    // The view rule clamps the cursor to the upper `x` bound of the model.
    await setView(page, [1e9, 0, 0], 1000);

    const reading = await page.evaluate(() => ({
      cursorX: window.galaxyMap?.getView().cursor[0] ?? 0,
      texts: [...document.querySelectorAll('.gm-grid-label')].map(
        (element) => element.textContent ?? '',
      ),
    }));
    console.log('the labels at the bound', reading);

    expect(reading.texts.length).toBeGreaterThan(0);
    expect(reading.texts.some((text) => text.startsWith('50,000 : '))).toBe(true);
    for (const text of reading.texts) {
      const x = Number((text.split(' : ')[0] ?? '').replace(/,/g, ''));
      expect(x).toBeLessThanOrEqual(reading.cursorX);
    }
  });
});

test.describe('the grid label readings', () => {
  test('match the labels the overlay holds', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=3000&p=5&y=0');
    await setGrid(page, true);
    await setView(page, [0, 0, 0], 3000, 5);

    const reading = await page.evaluate(() => {
      const map = window.galaxyMap;
      const canvas = document.querySelector('canvas');
      if (map === undefined || !(canvas instanceof HTMLCanvasElement)) return null;
      const box = canvas.getBoundingClientRect();
      const elements = [...document.querySelectorAll('.gm-grid-label')].map(
        (element) => {
          const at = element.getBoundingClientRect();
          return {
            text: element.textContent ?? '',
            left: at.left - box.left,
            top: at.top - box.top,
            width: at.width,
            height: at.height,
            opacity: Number((element as HTMLElement).style.opacity),
          };
        },
      );
      return { elements, readings: map.debug.gridLabelReadings() };
    });
    expect(reading).not.toBeNull();
    const read = reading as NonNullable<typeof reading>;
    console.log('the grid label readings', read.readings.length);

    expect(read.readings.length).toBeGreaterThan(0);
    expect(read.readings.length).toBe(read.elements.length);
    for (let index = 0; index < read.readings.length; index += 1) {
      const held = read.readings[index] as (typeof read.readings)[0];
      const element = read.elements[index] as (typeof read.elements)[0];
      expect(held.text).toBe(element.text);
      // The element's screen box is the upright box around the label's own quad, so every
      // corner the reading holds lies inside it. The anchor is the crossing, which the
      // label now stands clear of, so the anchor is outside that box.
      for (const corner of held.corners) {
        expect(corner.x).toBeGreaterThanOrEqual(element.left - 1);
        expect(corner.x).toBeLessThanOrEqual(element.left + element.width + 1);
        expect(corner.y).toBeGreaterThanOrEqual(element.top - 1);
        expect(corner.y).toBeLessThanOrEqual(element.top + element.height + 1);
      }
      expect(held.opacity).toBeCloseTo(element.opacity, 2);
    }
  });

  test('a label does not draw stronger than its line', async ({ page }) => {
    // The dark space between the arms, at the pitch that reaches furthest toward the
    // horizon. The background takes nothing off a label there, so the reading is of the
    // line factor alone.
    await openMap(page, '#c=-40000,0,20000&d=3000&p=5&y=0');
    // The region overlay draws at every zoom under 30,000 light years now, and this
    // reading is an absolute one, so the overlay goes.
    await setPasses(page, { regions: false });
    await setGrid(page, true);
    await setView(page, [-40000, 0, 20000], 3000, 5);
    // The background reading is one frame behind the picture, so a few real frames put
    // the reading of this view under the labels.
    await page.waitForTimeout(300);

    const reading = await page.evaluate(() => {
      const map = window.galaxyMap;
      if (map === undefined) return null;
      const held = map.debug.gridLabelReadings();
      const background = map.debug.backgroundReading();
      const canvas = document.querySelector('canvas');
      if (background === null || !(canvas instanceof HTMLCanvasElement)) return null;
      const box = canvas.getBoundingClientRect();
      const boxes = [...document.querySelectorAll('.gm-grid-label')].map((element) => {
        const at = element.getBoundingClientRect();
        return {
          x: at.left + at.width / 2 - box.left,
          y: at.top + at.height / 2 - box.top,
        };
      });
      // The same background weight rule the module uses, read at the centre of the
      // label's own box.
      const weightAt = (x: number, y: number): number => {
        const column = Math.floor((x / 1920) * background.width);
        const row = Math.floor((y / 1080) * background.height);
        const texel = background.texels[row * background.width + column];
        if (texel === undefined) return 1;
        const merge = Math.min(
          1,
          Math.max(0, (texel.luminance - 0.08) / (0.55 - 0.08)),
        );
        const smooth = merge * merge * (3 - 2 * merge);
        return 1 - (1 - 0.75) * smooth;
      };
      return held.map((label, index) => {
        const centre = boxes[index] ?? { x: label.x, y: label.y };
        return {
          text: label.text,
          top: label.y,
          alpha: label.alpha,
          reach: label.reach,
          opacity: label.opacity,
          weight: weightAt(centre.x, centre.y),
        };
      });
    });
    expect(reading).not.toBeNull();
    const labels = reading as NonNullable<typeof reading>;
    console.log('the label opacity against its line', labels.slice(0, 6));

    expect(labels.length).toBeGreaterThan(1);
    for (const label of labels) {
      const want = ((0.8 * label.alpha) / 0.45) * label.reach * label.weight;
      expect(Math.abs(label.opacity - want)).toBeLessThanOrEqual(0.01);
      expect(label.opacity).toBeLessThanOrEqual(0.8);
      // No label is placed below the gate, so the line factor never goes under 0.2.
      expect(label.alpha).toBeGreaterThanOrEqual(0.09);
    }
    const highest = labels.reduce((best, label) =>
      label.top < best.top ? label : best,
    );
    const middle = labels.reduce((best, label) =>
      Math.abs(label.top - 540) < Math.abs(best.top - 540) ? label : best,
    );
    console.log('the highest and the middle label', { highest, middle });
    expect(highest.opacity).toBeLessThan(middle.opacity);
  });
});

test.describe('the lattice reach', () => {
  /** The level whose lattice the zoom bound cut, in light years. */
  const FINE_LY = 100;

  /** The level the numbers sit on at every zoom these two readings take. */
  const NUMBERED_LY = 1000;

  /**
   * The largest radius about the cursor, in CSS pixels, at which the 100 light year
   * level lights a pixel of the frame.
   *
   * The reading is the largest radius anywhere in the frame and not the radius along the
   * row through the cursor: the row reading is quantised by the level's own line
   * spacing, which is 23.4 CSS pixels at a camera distance of 4,000 light years.
   *
   * A pixel counts only where the 100 light year level lit it: near a line of that level
   * on one axis, and clear of every line of the numbered level, which draws over the
   * whole frame. The finer levels light no pixel at this camera distance, because the 10
   * light year level is 2.3 CSS pixels apart and a level under 8 draws nothing.
   */
  async function fineLevelRadius(page: Page): Promise<number> {
    return page.evaluate(
      (input) => {
        const map = window.galaxyMap;
        if (map === undefined) return -1;
        const view = map.getView();
        const size = map.debug.viewport();
        const wide = Math.floor(size.width);
        const tall = Math.floor(size.height);

        const on = map.isGridVisible();
        map.setGridVisible(false);
        map.debug.drawNow();
        const without = map.debug.readRect(0, 0, wide, tall);
        map.setGridVisible(true);
        map.debug.drawNow();
        const withGrid = map.debug.readRect(0, 0, wide, tall);
        map.setGridVisible(on);
        map.debug.drawNow();

        const centre = map.debug.project(view.cursor);
        // The light years one CSS pixel covers at the cursor's own range.
        const perPixel = view.distance / (tall / (2 * Math.tan(Math.PI / 6)));
        const offset = (value: number, spacing: number): number =>
          Math.abs(value - Math.round(value / spacing) * spacing);

        let best = -1;
        for (let row = 0; row < tall; row += 1) {
          for (let column = 0; column < wide; column += 1) {
            const index = (row * wide + column) * 4;
            if ((withGrid[index] as number) <= (without[index] as number)) continue;
            const radius = Math.hypot(column + 0.5 - centre.x, row + 0.5 - centre.y);
            if (radius <= best) continue;
            const point = map.debug.planePointAt(column + 0.5, row + 0.5);
            if (point === null) continue;
            const fine = Math.min(
              offset(point[0], input.fine),
              offset(point[2], input.fine),
            );
            const numbered = Math.min(
              offset(point[0], input.numbered),
              offset(point[2], input.numbered),
            );
            // Three CSS pixels covers the line and the one pixel coverage ramp beside
            // it. Eight holds the reading clear of the numbered level's own wider line.
            if (fine > 3 * perPixel) continue;
            if (numbered < 8 * perPixel) continue;
            best = radius;
          }
        }
        return best;
      },
      { fine: FINE_LY, numbered: NUMBERED_LY },
    );
  }

  /**
   * What the bottom row of the frame holds, read for the 100 light year level.
   *
   * `lines` counts the runs of lit pixels of that level, clear of the numbered level.
   * `middleAway` is the distance on the plane from the cursor to the point under the
   * middle column, in light years, and `spacingCss` is the level's spacing on the screen
   * at that point.
   */
  async function bottomRowLines(
    page: Page,
    cursor: readonly [number, number, number],
  ): Promise<{ lines: number; middleAway: number; spacingCss: number }> {
    return page.evaluate(
      (input) => {
        const map = window.galaxyMap;
        const empty = { lines: 0, middleAway: -1, spacingCss: -1 };
        if (map === undefined) return empty;
        const size = map.debug.viewport();
        const wide = Math.floor(size.width);
        const row = Math.floor(size.height) - 1;

        const on = map.isGridVisible();
        map.setGridVisible(false);
        map.debug.drawNow();
        const without = map.debug.readRect(0, row, wide, 1);
        map.setGridVisible(true);
        map.debug.drawNow();
        const withGrid = map.debug.readRect(0, row, wide, 1);
        map.setGridVisible(on);
        map.debug.drawNow();

        const points: ([number, number, number] | null)[] = [];
        for (let column = 0; column < wide; column += 1) {
          points.push(map.debug.planePointAt(column + 0.5, row + 0.5));
        }
        const lit = (column: number): boolean =>
          (withGrid[column * 4] as number) > (without[column * 4] as number);
        const offset = (value: number, spacing: number): number =>
          Math.abs(value - Math.round(value / spacing) * spacing);

        let lines = 0;
        let column = 0;
        while (column < wide) {
          if (!lit(column)) {
            column += 1;
            continue;
          }
          let end = column;
          while (end + 1 < wide && lit(end + 1)) end += 1;
          const middle = Math.round((column + end) / 2);
          const point = points[middle] ?? null;
          const next = points[Math.min(middle + 1, wide - 1)] ?? null;
          if (point !== null && next !== null) {
            // The light years one CSS pixel covers here, read beside the line.
            const step = Math.max(
              Math.hypot(next[0] - point[0], next[2] - point[2]),
              1e-6,
            );
            const fine = Math.min(
              offset(point[0], input.fine),
              offset(point[2], input.fine),
            );
            const numbered = Math.min(
              offset(point[0], input.numbered),
              offset(point[2], input.numbered),
            );
            if (fine <= 3 * step && numbered > 8 * step) lines += 1;
          }
          column = end + 1;
        }

        const middleColumn = Math.floor(wide / 2);
        const middlePoint = points[middleColumn] ?? null;
        const nextPoint = points[Math.min(middleColumn + 1, wide - 1)] ?? null;
        if (middlePoint === null || nextPoint === null) return { ...empty, lines };
        const middleAway = Math.hypot(
          middlePoint[0] - input.cursor[0],
          middlePoint[2] - input.cursor[2],
        );
        const perPixel = Math.max(
          Math.hypot(nextPoint[0] - middlePoint[0], nextPoint[2] - middlePoint[2]),
          1e-6,
        );
        return { lines, middleAway, spacingCss: input.fine / perPixel };
      },
      { fine: FINE_LY, numbered: NUMBERED_LY, cursor },
    );
  }

  // The scenario "The lattice runs to the edge of the frame". The pitch of 89 degrees
  // reads the far side of the frame, where the level's own reach of 10,000 light years
  // ends outside it.
  test('runs the lattice to the edge of the frame', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=4000&p=89&y=0');
    await setPasses(page, SCENE_OFF);
    await setGrid(page, true);
    await setView(page, [0, 0, 0], 4000, 89, 0);

    const numbered = await spacingOf(page);
    const radius = await fineLevelRadius(page);
    console.log('the largest radius of the 100 light year level', {
      numbered,
      radius,
    });

    expect(numbered).toBe(NUMBERED_LY);
    // The zoom bound ended the level at 374 CSS pixels. The frame's own corner sits
    // 1,101 CSS pixels from the middle of a 1920x1080 frame.
    expect(radius).toBeGreaterThan(900);
  });

  // The scenario "The lattice draws past the old zoom bound at a shallow pitch". The
  // pitch of 45 degrees reads the near side of the frame, where the zoom bound of
  // `0.4 * d` reached 1,600 light years and the plane point is 2,070 away.
  test('draws the lattice past the old zoom bound at a shallow pitch', async ({
    page,
  }) => {
    // The cursor sits 50 light years off a crossing of the 100 light year level on both
    // axes, so the bottom row does not lie on a line. The yaw of 30 degrees makes that
    // row cross both families of lines.
    const cursor: [number, number, number] = [50, 0, 50];
    await openMap(page, '#c=50,0,50&d=4000&p=45&y=30');
    await setPasses(page, SCENE_OFF);
    await setGrid(page, true);
    await setView(page, cursor, 4000, 45, 30);

    const numbered = await spacingOf(page);
    const reading = await bottomRowLines(page, cursor);
    console.log('the bottom row at a pitch of 45 degrees', { numbered, ...reading });

    expect(numbered).toBe(NUMBERED_LY);
    // The camera sits 2,828 light years above the plane and 2,828 behind the cursor,
    // and the bottom row looks 75 degrees below the horizontal.
    expect(reading.middleAway).toBeGreaterThan(1900);
    expect(reading.middleAway).toBeLessThan(2250);
    expect(reading.spacingCss).toBeGreaterThan(25);
    expect(reading.lines).toBeGreaterThan(0);
  });
});
