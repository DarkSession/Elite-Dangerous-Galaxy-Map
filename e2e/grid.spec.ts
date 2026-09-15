import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openMap } from './helpers';

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
      () => document.querySelector('.gm-grid-plane-label')?.textContent ?? '',
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
      () => document.querySelector('.gm-grid-plane-label')?.textContent ?? '',
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

    expect(planeAtZero).toContain('0');
    expect(planeAtLow).toContain('-600');
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

    // The bound was 12 of 255 before the merge. Over a background of 0.55 luminance and
    // above the merge leaves 0.30 of the level's alpha, so the same line moves a channel
    // by about a third of what it moved. The floor is what holds this bound above zero.
    expect((reading as NonNullable<typeof reading>).best).toBeGreaterThanOrEqual(4);
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
    await openMap(page, '#c=0,0,0&d=8000&p=89&y=0');
    // 8,000 light years is where the product of the two bands is largest: the grid band
    // leaves 0.50 of its alpha there and none at 12,000, and the region band leaves
    // 0.65 of its opacity there and none at 5,000.
    await setView(page, [0, 0, 0], 8000, 89);

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
      // the boundary's own contribution is largest.
      let crossing = -1;
      let bestProduct = 0;
      for (let at = 0; at < without.length; at += 4) {
        const product =
          magnitude(gridOnly, without, at) * magnitude(lines, without, at);
        if (product > bestProduct) {
          bestProduct = product;
          crossing = at;
        }
      }
      if (crossing < 0) return null;

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
      return { channel, target, kept, full, ratio: kept / full };
    });
    console.log('the boundary over the grid', order);

    const read = order as NonNullable<typeof order>;
    // The boundary draws after the grid, so it keeps only a part of what the grid put
    // down under it. If the grid drew last the ratio would be 1.
    expect(read.ratio).toBeGreaterThanOrEqual(0.45);
    expect(read.ratio).toBeLessThanOrEqual(0.85);
  });
});

test.describe('the background reading', () => {
  test('follows the picture in the two views', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=4000&p=89&y=0');
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
    const core = await changeAt(page, CORE_VIEW, 4000);
    const dark = await changeAt(page, DARK_VIEW, 4000);
    console.log('the grid over the two views', { core, dark });

    // The premises of the pair, read through `backgroundReading()`.
    expect(core.pointL).toBeGreaterThan(0.55);
    expect(dark.pointL).toBeLessThan(0.1);
    // The line's own blue is 60 of 255, so the dark view's blue has to be under it for
    // the line's blue to rise there.
    expect(dark.pointB).toBeLessThan(60);

    // The reading is a magnitude. `rgb(255, 154, 60)` has a luminance of 0.662 and the
    // tone-mapped core reads about 0.93, so a line over the core removes light.
    expect(core.best).toBeGreaterThanOrEqual(2);
    expect(dark.best).toBeGreaterThanOrEqual(2);
    const ratio = core.best / dark.best;
    expect(ratio).toBeGreaterThanOrEqual(0.02);
    expect(ratio).toBeLessThanOrEqual(0.2);
  });

  test('takes the background hue over the core', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=4000&p=89&y=0');
    const core = await changeAt(page, CORE_VIEW, 4000);
    const dark = await changeAt(page, DARK_VIEW, 4000);
    console.log('the change channel by channel', {
      core: core.change,
      dark: dark.change,
    });

    // Over the dark space every channel rises and red rises the most.
    for (const channel of dark.change) expect(channel).toBeGreaterThan(0);
    expect(dark.change[0]).toBeGreaterThan(dark.change[1]);
    expect(dark.change[0]).toBeGreaterThan(dark.change[2]);

    // Over the core no channel rises by more than 2 of 255, and blue falls. Taking 0.60
    // of the background's hue leaves the line its warmth, so blue is where it reads.
    for (const channel of core.change) expect(channel).toBeLessThanOrEqual(2);
    expect(core.change[2]).toBeLessThan(0);
  });

  test('recedes a label over a bright background', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=2000&p=89&y=0');
    await setGrid(page, true);

    /** The opacity and the shadow of the crossing label nearest the frame centre. */
    const labelAt = async (
      cursor: readonly [number, number, number],
    ): Promise<{ opacity: number; shadow: string; count: number }> => {
      await page.evaluate((where) => {
        window.galaxyMap?.setView({
          cursor: where as [number, number, number],
          distance: 2000,
          yaw: 0,
          pitch: 89,
        });
      }, cursor);
      // The reading goes back to the processor without waiting for the card, so the
      // labels of a frame read the reading of the frame before. A few real frames put
      // the reading of this view under the labels.
      await page.waitForTimeout(300);
      return page.evaluate(() => {
        const labels = [
          ...document.querySelectorAll('.gm-grid-label'),
        ] as HTMLElement[];
        let best: HTMLElement | null = null;
        let bestRange = Infinity;
        for (const label of labels) {
          const box = label.getBoundingClientRect();
          const dx = box.left + box.width / 2 - 960;
          const dy = box.top + box.height / 2 - 540;
          const range = dx * dx + dy * dy;
          if (range < bestRange) {
            bestRange = range;
            best = label;
          }
        }
        if (best === null) return { opacity: -1, shadow: '', count: labels.length };
        return {
          opacity: Number(best.style.opacity),
          shadow: best.style.textShadow,
          count: labels.length,
        };
      });
    };

    const core = await labelAt(CORE_VIEW);
    const dark = await labelAt(DARK_VIEW);
    console.log('the label opacity in the two views', { core, dark });

    expect(core.count).toBeGreaterThan(0);
    expect(dark.count).toBeGreaterThan(0);
    expect(core.opacity).toBeGreaterThanOrEqual(0.4 * 0.8);
    expect(core.opacity).toBeLessThanOrEqual(0.55 * 0.8);
    expect(dark.opacity).toBeGreaterThan(0.75 * 0.8);
    for (const shadow of [core.shadow, dark.shadow]) {
      expect(shadow).not.toContain('#000');
      expect(shadow).not.toContain('rgb(0, 0, 0)');
    }
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

  test('follows the label level through the zoom', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=1000&p=89&y=0');
    await setGrid(page, true);

    const readings: number[] = [];
    for (const distance of [200, 1000, 3000]) {
      await setView(page, [0, 0, 0], distance);
      readings.push(await spacingOf(page));
    }
    console.log('the label level', readings);

    expect(readings).toEqual([100, 1000, 10000]);
  });
});

test.describe('the grid labels', () => {
  test('read the coordinates of their own crossing', async ({ page }) => {
    await openMap(page, '#c=1000,0,2000&d=1000&p=89&y=0');
    await setGrid(page, true);
    await setView(page, [1000, 0, 2000], 1000);

    const labels = await page.evaluate(() => {
      const out: { text: string; left: number; top: number; screen: number[] }[] = [];
      for (const element of document.querySelectorAll('.gm-grid-label')) {
        const text = element.textContent ?? '';
        const parts = text.split(', ').map((part) => Number(part));
        const box = (element as HTMLElement).getBoundingClientRect();
        const canvas = document.querySelector('canvas')?.getBoundingClientRect();
        const screen = window.galaxyMap?.debug.project([
          parts[0] as number,
          0,
          parts[1] as number,
        ]) ?? { x: -1, y: -1 };
        out.push({
          text,
          left: box.left + box.width / 2 - (canvas?.left ?? 0),
          top: box.top + box.height / 2 - (canvas?.top ?? 0),
          screen: [screen.x, screen.y],
        });
      }
      return out;
    });
    console.log('the crossing labels', labels.slice(0, 6), { count: labels.length });

    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) {
      const parts = label.text.split(', ');
      expect(parts).toHaveLength(2);
      for (const part of parts) expect(Number(part) % 1000).toBe(0);
      expect(Math.abs(label.left - (label.screen[0] as number))).toBeLessThanOrEqual(2);
      expect(Math.abs(label.top - (label.screen[1] as number))).toBeLessThanOrEqual(2);
    }
  });

  test('cap the crossing label count at 32', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=1000&p=5&y=0');
    await setGrid(page, true);
    await setView(page, [0, 0, 0], 1000, 5);

    const count = await page.evaluate(
      () => document.querySelectorAll('.gm-grid-label').length,
    );
    console.log('the label count at a pitch of 5', count);

    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(32);
  });

  test('read the height of the plane', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=1000&p=89&y=0');
    await setGrid(page, true);
    await setView(page, [0, -600, 0], 1000);

    const label = await page.evaluate(
      () => document.querySelector('.gm-grid-plane-label')?.textContent ?? null,
    );
    console.log('the plane label', label);

    expect(label).not.toBeNull();
    expect(label).toContain('-600');
  });

  test('go with the switch', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=1000&p=89&y=0');
    await setGrid(page, true);
    await setView(page, [0, 0, 0], 1000);
    const on = await page.evaluate(
      () => document.querySelectorAll('.gm-grid-label, .gm-grid-plane-label').length,
    );

    await setGrid(page, false);
    const off = await page.evaluate(
      () => document.querySelectorAll('.gm-grid-label, .gm-grid-plane-label').length,
    );
    console.log('the labels with the switch', { on, off });

    expect(on).toBeGreaterThan(0);
    expect(off).toBe(0);
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
      labels: document.querySelectorAll('.gm-grid-label, .gm-grid-plane-label').length,
      on: window.galaxyMap?.isGridVisible() ?? false,
    }));
    console.log('the probes inside and beyond the band', { near, wide });

    expect(near.vertices).toBe(3);
    expect(near.spacing).toBe(10000);
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
        labels: document.querySelectorAll('.gm-grid-label, .gm-grid-plane-label')
          .length,
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
      const box = canvas.getBoundingClientRect();
      const spots: { text: string; x: number; y: number }[] = [];
      for (const element of document.querySelectorAll('.gm-grid-label')) {
        const at = element.getBoundingClientRect();
        spots.push({
          text: element.textContent ?? '',
          x: Math.round(at.left + at.width / 2 - box.left),
          y: Math.round(at.top + at.height / 2 - box.top),
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
    expect(labels.length).toBeLessThanOrEqual(32);
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

    // The pass still draws at 11,500 light years and the label level is still 10,000,
    // so the label gate and not the switch is what empties the overlay.
    expect(far.vertices).toBe(3);
    expect(far.spacing).toBe(10000);
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
    expect(reading.texts.some((text) => text.startsWith('50000,'))).toBe(true);
    for (const text of reading.texts) {
      const x = Number(text.split(', ')[0]);
      expect(x).toBeLessThanOrEqual(reading.cursorX);
    }
  });
});
