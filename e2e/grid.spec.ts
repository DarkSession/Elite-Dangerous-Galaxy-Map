import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openMap } from './helpers';

test.use({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });

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

/** Replaces the view and draws one frame. */
async function setView(
  page: Page,
  cursor: readonly [number, number, number],
  distance: number,
  pitch = 89,
): Promise<void> {
  await page.evaluate(
    (next) => {
      window.galaxyMap?.setView({
        cursor: next.cursor as [number, number, number],
        distance: next.distance,
        yaw: 0,
        pitch: next.pitch,
      });
      window.galaxyMap?.debug.drawNow();
    },
    { cursor, distance, pitch },
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

/** The spacing of the grid of the last frame, in light years. */
async function spacingOf(page: Page): Promise<number> {
  return page.evaluate(() => window.galaxyMap?.debug.gridSpacingLy() ?? 0);
}

/** How many vertices the last grid draw issued. */
async function vertexCount(page: Page): Promise<number> {
  return page.evaluate(() => window.galaxyMap?.debug.gridVertexCount() ?? -1);
}

/** One grid line the last frame drew. */
interface DrawnLine {
  /** True for a line of constant `x`, false for a line of constant `z`. */
  readonly alongZ: boolean;
  /** The game coordinate the line holds, in light years. */
  readonly coordinate: number;
  /** The offset from the cursor, in spacings. */
  readonly offset: number;
  /** True on every fifth line from the middle. */
  readonly major: boolean;
}

/** The lines the last frame drew, read from the plane offsets of its vertices. */
async function drawnLines(page: Page): Promise<DrawnLine[]> {
  const raw = await page.evaluate(() => {
    const map = window.galaxyMap;
    if (map === undefined) return { planes: [] as number[], cursor: [0, 0, 0] };
    return {
      planes: Array.from(map.debug.gridPlanes()),
      cursor: map.getView().cursor,
    };
  });
  const lines: DrawnLine[] = [];
  for (let vertex = 0; vertex + 5 < raw.planes.length; vertex += 6) {
    const firstX = raw.planes[vertex] as number;
    const firstZ = raw.planes[vertex + 1] as number;
    const secondX = raw.planes[vertex + 3] as number;
    const major = (raw.planes[vertex + 2] as number) > 0.5;
    const alongZ = Math.abs(secondX - firstX) < 1e-6;
    const offset = alongZ ? firstX : firstZ;
    const base = alongZ ? (raw.cursor[0] as number) : (raw.cursor[2] as number);
    lines.push({ alongZ, offset, coordinate: base + offset, major });
  }
  return lines;
}

/**
 * The largest red channel the grid writes in a 7 by 7 window on a plane point, from 0
 * to 1. A grid line is one device pixel wide and a projected point falls between two
 * pixels, so a reading of the single pixel under the point misses the line.
 */
async function gridRedAt(
  page: Page,
  point: readonly [number, number, number],
): Promise<number> {
  return page.evaluate((where) => {
    const map = window.galaxyMap;
    if (map === undefined) return -1;
    const screen = map.debug.project(where as [number, number, number]);
    const bytes = map.debug.readRect(
      Math.round(screen.x) - 3,
      Math.round(screen.y) - 3,
      7,
      7,
    );
    let best = 0;
    for (let index = 0; index < bytes.length; index += 4) {
      best = Math.max(best, bytes[index] as number);
    }
    return best / 255;
  }, point);
}

test.describe('the coordinate grid', () => {
  test('holds a fixed line count at every zoom', async ({ page }) => {
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
      expect(reading.vertices).toBeGreaterThan(0);
      expect(reading.vertices).toBeLessThanOrEqual(516);
    }
  });

  test('follows the cursor', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=1000&p=89&y=0');
    await setPasses(page, SCENE_OFF);
    await setGrid(page, true);
    await setView(page, [0, 0, 0], 1000);

    const spacing = await spacingOf(page);
    const middleOf = async (): Promise<number> => {
      const lines = (await drawnLines(page)).filter((line) => line.alongZ);
      let best = lines[0] as DrawnLine;
      for (const line of lines) {
        if (Math.abs(line.offset) < Math.abs(best.offset)) best = line;
      }
      return best.coordinate;
    };

    const before = await middleOf();
    await setView(page, [10 * spacing, 0, 0], 1000);
    const after = await middleOf();
    console.log('the grid middle line', { spacing, before, after });

    expect(after - before).toBeCloseTo(10 * spacing, 6);
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
    const lines = (await drawnLines(page)).filter((line) => line.alongZ);
    const beyond = lines.filter((line) => line.coordinate > cursorX + 1e-6);
    console.log('the grid at the bound', {
      cursorX,
      lines: lines.length,
      beyond: beyond.length,
    });

    expect(lines.length).toBeGreaterThan(0);
    // Half the lines of constant `x` lie past the bound and are left out.
    expect(lines.length).toBeLessThan(129);
    expect(beyond.length).toBe(0);
  });

  test('draws a line of constant game coordinate', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=1000&p=89&y=0');
    await setPasses(page, SCENE_OFF);
    await setGrid(page, true);
    await setView(page, [0, 0, 0], 1000);

    const spacing = await spacingOf(page);
    const reading = await page.evaluate((step) => {
      const map = window.galaxyMap;
      if (map === undefined) return null;
      // Two points on the middle line of constant `x`, which runs through the cursor.
      const first = map.debug.project([0, 0, -2 * step]);
      const second = map.debug.project([0, 0, 2 * step]);
      return {
        firstPoint: map.debug.planePointAt(first.x, first.y),
        secondPoint: map.debug.planePointAt(second.x, second.y),
      };
    }, spacing);
    const firstRed = await gridRedAt(page, [0, 0, -2 * spacing]);
    const secondRed = await gridRedAt(page, [0, 0, 2 * spacing]);
    console.log('the line of constant x', { spacing, firstRed, secondRed, reading });

    const read = reading as NonNullable<typeof reading>;
    expect(firstRed).toBeGreaterThan(0.04);
    expect(secondRed).toBeGreaterThan(0.04);
    const firstX = (read.firstPoint as number[])[0] as number;
    const secondX = (read.secondPoint as number[])[0] as number;
    expect(Math.abs(firstX - secondX)).toBeLessThan(1);
    expect(Math.abs(firstX / spacing - Math.round(firstX / spacing))).toBeLessThan(
      0.01,
    );
  });

  test('fades to nothing at its edge', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=1000&p=30&y=0');
    await setPasses(page, SCENE_OFF);
    await setGrid(page, true);
    await setView(page, [0, 0, 0], 1000, 30);

    const spacing = await spacingOf(page);
    const readings: number[] = [];
    for (const step of [0, 32, 64]) {
      readings.push(await gridRedAt(page, [0, 0, step * spacing]));
    }
    console.log('the grid fade', { spacing, readings });

    // The edge of the grid is 64 spacings from the cursor, which is at least 2,560 CSS
    // pixels at the 40 pixel floor of the spacing rule. The only view that puts it on
    // the screen is a shallow one, where the lines of the last spacings stack inside one
    // pixel row. The reading at the edge therefore holds the light of the lines behind
    // it and not the light of the edge line, which is 0. The test reads that the fade
    // falls and that the edge holds under a fifth of the light at the cursor.
    expect(readings[0] as number).toBeGreaterThan(readings[1] as number);
    expect(readings[1] as number).toBeGreaterThan(readings[2] as number);
    expect(readings[2] as number).toBeLessThan(0.2 * (readings[0] as number));
  });

  test('draws every fifth line brighter', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=1000&p=89&y=0');
    await setPasses(page, SCENE_OFF);
    await setGrid(page, true);
    await setView(page, [0, 0, 0], 1000);

    const spacing = await spacingOf(page);
    // Each reading sits half a spacing along `z` from a crossing, so it reads one line.
    const middle = await gridRedAt(page, [0, 0, 0.5 * spacing]);
    const next = await gridRedAt(page, [spacing, 0, 0.5 * spacing]);
    const fifth = await gridRedAt(page, [5 * spacing, 0, 0.5 * spacing]);
    console.log('the fifth line', { spacing, middle, next, fifth });

    expect(middle / next).toBeGreaterThan(1.6);
    expect(middle / next).toBeLessThan(2.4);
    expect(fifth / next).toBeGreaterThan(1.6);
    expect(fifth / next).toBeLessThan(2.4);
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

    // The marker sits at the cursor, which is the crossing of the two middle lines.
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
      const side = 400;
      const left = 440;
      const top = 160;
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
    expect(onVertices).toBeGreaterThan(0);
    expect(offVertices).toBe(0);
  });

  // The two probes read the same frame. A stale plane buffer would report lines that
  // the switch took off the screen.
  test('reports no plane after the switch goes off', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=1000&p=89&y=0');
    await setGrid(page, true);
    const on = await page.evaluate(() => ({
      vertices: window.__galaxyMap?.gridVertexCount?.() ?? -1,
      planes: window.__galaxyMap?.gridPlanes?.().length ?? -1,
    }));

    await setGrid(page, false);
    const off = await page.evaluate(() => ({
      vertices: window.__galaxyMap?.gridVertexCount?.() ?? -1,
      planes: window.__galaxyMap?.gridPlanes?.().length ?? -1,
    }));
    console.log('the grid probes', { on, off });

    expect(on.vertices).toBeGreaterThan(0);
    expect(on.planes).toBe(on.vertices * 3);
    expect(off.vertices).toBe(0);
    expect(off.planes).toBe(0);
  });
});
