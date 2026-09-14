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

  test('draws three vertices in one call at every zoom', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=1000&p=89&y=0');
    await setPasses(page, SCENE_OFF);
    await setGrid(page, true);

    const readings: { distance: number; vertices: number; spacing: number }[] = [];
    for (const distance of [10, 1000, 120000]) {
      await setView(page, [0, 0, 0], distance);
      readings.push({
        distance,
        vertices: await vertexCount(page),
        spacing: await spacingOf(page),
      });
    }
    console.log('the grid vertex count', readings);

    for (const reading of readings) {
      expect(reading.vertices).toBe(3);
    }
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
    await openMap(page, '#c=0,0,0&d=120000&p=89&y=0');
    await setPasses(page, SCENE_OFF);
    await setGrid(page, true);
    // The view rule clamps the cursor to the model bounds, so this puts it on the upper
    // `x` bound without the test naming the number.
    await setView(page, [1e9, 0, 0], 120000);

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
    // One CSS pixel is about 192 light years at this zoom, so the last lit column may
    // sit a few pixels past the bound and no further.
    expect(point[0]).toBeLessThan(cursorX + 600);
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

    expect((reading as NonNullable<typeof reading>).best).toBeGreaterThanOrEqual(12);
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

  test('draws under the marker and the region boundary', async ({ page }) => {
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

    const boundary = await page.evaluate(() => {
      const map = window.galaxyMap;
      if (map === undefined) return null;
      map.setView({ cursor: [0, 0, 0], distance: 6000, yaw: 0, pitch: 89 });
      const side = 600;
      const left = 660;
      const top = 240;
      map.setGridVisible(false);
      map.debug.setPasses({ regions: false });
      const without = map.debug.readRect(left, top, side, side);
      map.debug.setPasses({ regions: true });
      const lines = map.debug.readRect(left, top, side, side);
      // The most opaque boundary pixel is the one the overlay changed the most.
      let best = -1;
      let bestGap = 0;
      for (let index = 0; index < lines.length; index += 4) {
        let gap = 0;
        for (let channel = 0; channel < 3; channel += 1) {
          gap += Math.abs(
            (lines[index + channel] as number) - (without[index + channel] as number),
          );
        }
        if (gap > bestGap) {
          bestGap = gap;
          best = index;
        }
      }
      if (best < 0) return null;
      map.setGridVisible(true);
      map.debug.drawNow();
      const withGrid = map.debug.readRect(left, top, side, side);
      return {
        gap: bestGap,
        lines: [lines[best], lines[best + 1], lines[best + 2]],
        withGrid: [withGrid[best], withGrid[best + 1], withGrid[best + 2]],
      };
    });
    console.log('the boundary over the grid', boundary);

    const markerRead = marker as NonNullable<typeof marker>;
    expect(markerRead.on).toEqual(markerRead.off);

    const boundaryRead = boundary as NonNullable<typeof boundary>;
    expect(boundaryRead.gap).toBeGreaterThan(20);
    for (let channel = 0; channel < 3; channel += 1) {
      expect(
        Math.abs(
          (boundaryRead.withGrid[channel] as number) -
            (boundaryRead.lines[channel] as number),
        ),
      ).toBeLessThanOrEqual(2);
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
