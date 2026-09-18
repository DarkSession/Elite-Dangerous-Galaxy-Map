import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openMap } from './helpers';
import type { SystemRecordInput } from '../src/scene-data/real-systems';
import type { LineInput, SphereInput } from '../src/scene-data/shapes';

test.use({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });

/** The colour every category in this file takes. */
const MARKER: [number, number, number] = [255, 255, 0];

/** The pitch every view in this file takes, unless a test names another. */
const PITCH = 35;

/**
 * The camera position of a view, by the rule `src/camera/projection.ts` holds: the
 * cursor plus the camera direction times the distance.
 */
function cameraOf(
  cursor: readonly [number, number, number],
  distance: number,
  pitch = PITCH,
  yaw = 0,
): [number, number, number] {
  const toRadians = Math.PI / 180;
  const horizontal = Math.cos(pitch * toRadians);
  return [
    cursor[0] - horizontal * Math.sin(yaw * toRadians) * distance,
    cursor[1] + Math.sin(pitch * toRadians) * distance,
    cursor[2] - horizontal * Math.cos(yaw * toRadians) * distance,
  ];
}

/** The unit vector from the camera to the cursor. */
function forwardOf(pitch = PITCH, yaw = 0): [number, number, number] {
  const toRadians = Math.PI / 180;
  const horizontal = Math.cos(pitch * toRadians);
  return [
    horizontal * Math.sin(yaw * toRadians),
    -Math.sin(pitch * toRadians),
    horizontal * Math.cos(yaw * toRadians),
  ];
}

/** A record the reader accepts. */
function record(
  name: string,
  position: readonly [number, number, number],
): SystemRecordInput {
  return {
    name,
    coords: { x: position[0], y: position[1], z: position[2] },
    primaryCategory: 'Alpha',
  } as SystemRecordInput;
}

/** Adds one category that draws at every range. */
async function addCategory(page: Page): Promise<void> {
  await page.evaluate((colour) => {
    window.galaxyMap?.addCategories([
      {
        name: 'Alpha',
        color: colour as [number, number, number],
        maxDrawRange: 200000,
      },
    ]);
  }, MARKER);
}

/** Adds records through the handle. */
async function addSystems(page: Page, records: readonly unknown[]): Promise<number> {
  return page.evaluate(
    (list) =>
      window.galaxyMap?.addSystems(list as readonly SystemRecordInput[]).added ?? -1,
    records,
  );
}

/** Adds spheres through the handle and returns how many the reader kept. */
async function addSpheres(page: Page, spheres: readonly unknown[]): Promise<number> {
  return page.evaluate(
    (list) => window.galaxyMap?.addSpheres(list as readonly SphereInput[]).added ?? -1,
    spheres,
  );
}

/** Adds lines through the handle and returns how many the reader kept. */
async function addLines(page: Page, lines: readonly unknown[]): Promise<number> {
  return page.evaluate(
    (list) => window.galaxyMap?.addLines(list as readonly LineInput[]).added ?? -1,
    lines,
  );
}

/** Replaces the view and draws one frame. */
async function setView(
  page: Page,
  cursor: readonly [number, number, number],
  distance: number,
  pitch = PITCH,
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
    { cursor, distance, yaw, pitch },
  );
}

/** Draws one frame at once. */
async function drawNow(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.galaxyMap?.debug.drawNow();
  });
}

/** Turns the `shapes` pass switch on or off and draws one frame. */
async function setShapePass(page: Page, on: boolean): Promise<void> {
  await page.evaluate((value) => {
    window.galaxyMap?.debug.setPasses({ shapes: value });
  }, on);
}

/** Projects a game position to a CSS pixel of the canvas. */
async function project(
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

/** Reads one pixel of the frame, in CSS pixels from the top left. */
async function colourAt(
  page: Page,
  x: number,
  y: number,
): Promise<[number, number, number]> {
  return page.evaluate(
    (where) => {
      const read = window.galaxyMap?.debug.readPixel(
        Math.round(where.x),
        Math.round(where.y),
      ) ?? [0, 0, 0, 0];
      return [read[0], read[1], read[2]] as [number, number, number];
    },
    { x, y },
  );
}

/** How far two colours stand apart, over the three channels. */
function colourDistance(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/**
 * A hash of the whole frame. Two frames with the same hash are the same frame: the
 * sum runs inside the page, so the millions of bytes do not cross the protocol.
 */
async function frameHash(page: Page): Promise<string> {
  return page.evaluate(() => {
    const debug = window.galaxyMap?.debug;
    const canvas = document.getElementById('map');
    if (debug === undefined || !(canvas instanceof HTMLCanvasElement)) return 'none';
    const bytes = debug.readRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    // An FNV-1a hash over two 32-bit words, so two frames that differ in one byte give
    // two different strings.
    let first = 0x811c9dc5;
    let second = 0x01000193;
    for (let index = 0; index < bytes.length; index += 1) {
      first = Math.imul(first ^ (bytes[index] as number), 0x01000193);
      second = Math.imul(second + (bytes[index] as number), 0x85ebca6b) ^ index;
    }
    return `${(first >>> 0).toString(16)}:${(second >>> 0).toString(16)}:${bytes.length}`;
  });
}

/**
 * How many rows of one column the shapes cover, read at half of the strongest change.
 * The reader takes the frame with the shapes on against the frame with them off, so the
 * star field behind the line does not enter the count. It compares the channels one by
 * one and not the luminance, because a line whose luminance matches the field behind it
 * still changes the colour of every row it covers.
 */
async function coveredRows(
  page: Page,
  x: number,
): Promise<{ rows: number; peak: number }> {
  const withShapes = await columnColours(page, x);
  await setShapePass(page, false);
  const without = await columnColours(page, x);
  await setShapePass(page, true);
  const difference = withShapes.map((colour, index) => {
    const other = without[index] as [number, number, number];
    return Math.max(
      Math.abs(colour[0] - other[0]),
      Math.abs(colour[1] - other[1]),
      Math.abs(colour[2] - other[2]),
    );
  });
  const peak = Math.max(...difference);
  if (peak <= 4) return { rows: 0, peak };
  return { rows: difference.filter((value) => value >= peak / 2).length, peak };
}

/** The colour of every row of one column of the canvas, from the top row down. */
async function columnColours(
  page: Page,
  x: number,
): Promise<[number, number, number][]> {
  return page.evaluate((where) => {
    const debug = window.galaxyMap?.debug;
    const canvas = document.getElementById('map');
    if (debug === undefined || !(canvas instanceof HTMLCanvasElement)) return [];
    const bytes = debug.readRect(Math.round(where), 0, 1, canvas.clientHeight);
    const rows: [number, number, number][] = [];
    for (let index = 0; index < bytes.length; index += 4) {
      rows.push([
        bytes[index] as number,
        bytes[index + 1] as number,
        bytes[index + 2] as number,
      ]);
    }
    return rows;
  }, x);
}

test.describe('the shape members of the handle', () => {
  test('the handle carries the shape members', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=5000&p=35&y=0');
    const reading = await page.evaluate(() => {
      const map = window.galaxyMap;
      if (map === undefined) return null;
      map.addSpheres([{ position: [0, 0, 0], radius: 100, color: [255, 0, 0] }]);
      map.addLines([
        {
          points: [
            [0, 0, 0],
            [100, 0, 0],
          ],
          color: [0, 255, 0],
        },
      ]);
      const names = [
        'addSpheres',
        'addLines',
        'clearShapes',
        'sphereCount',
        'lineCount',
        'getSphere',
        'getLine',
      ];
      const handle = map as unknown as Record<string, unknown>;
      const debug = map.debug as unknown as Record<string, unknown>;
      return {
        onHandle: names.filter((name) => typeof handle[name] === 'function'),
        onDebug: names.filter((name) => name in debug),
        spheres: map.sphereCount(),
        lines: map.lineCount(),
      };
    });
    console.log('the shape members', reading);
    expect(reading?.onHandle).toHaveLength(7);
    expect(reading?.onDebug).toEqual([]);
    expect(reading?.spheres).toBe(1);
    expect(reading?.lines).toBe(1);
  });

  test('a line connects two systems by name', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=5000&p=35&y=0');
    await addCategory(page);
    await addSystems(page, [record('Sol', [0, 0, 0]), record('Alioth', [200, 0, 0])]);
    const added = await addLines(page, [
      { points: [{ system: 'Sol' }, { system: 'alioth' }], color: [255, 0, 255] },
    ]);
    const line = await page.evaluate(() => window.galaxyMap?.getLine(0) ?? null);
    console.log('the line by name', { added, line });
    expect(added).toBe(1);
    expect(line?.points).toEqual([
      [0, 0, 0],
      [200, 0, 0],
    ]);
  });

  test('a later change to the set does not move the line', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=5000&p=35&y=0');
    await addCategory(page);
    await addSystems(page, [record('Sol', [0, 0, 0])]);
    await addLines(page, [
      {
        points: [{ system: 'Sol' }, [400, 0, 0]],
        color: [255, 0, 255],
      },
    ]);
    const first = await page.evaluate(() => window.galaxyMap?.lineCount() ?? -1);

    await page.evaluate(() => {
      window.galaxyMap?.clearSystems();
    });
    const afterClear = await page.evaluate(() => window.galaxyMap?.lineCount() ?? -1);

    await addCategory(page);
    await addSystems(page, [record('Sol', [900, 0, 0])]);
    await addLines(page, [
      {
        points: [{ system: 'Sol' }, [400, 0, 0]],
        color: [255, 0, 255],
      },
    ]);
    const second = await page.evaluate(() => window.galaxyMap?.getLine(0) ?? null);
    console.log('the line against a changed set', { first, afterClear, second });

    expect(first).toBe(1);
    // `clearSystems` clears the shapes, so the first line is gone.
    expect(afterClear).toBe(0);
    expect(second?.points[0]).toEqual([900, 0, 0]);
  });

  test('a shape is not a category', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=5000&p=35&y=0');
    const reading = await page.evaluate(() => {
      const map = window.galaxyMap;
      if (map === undefined) return null;
      map.addSpheres([{ position: [0, 0, 0], radius: 100, color: [255, 0, 0] }]);
      return { categories: map.categoryCount(), spheres: map.sphereCount() };
    });
    console.log('the shape against the category table', reading);
    expect(reading?.categories).toBe(0);
    expect(reading?.spheres).toBe(1);
  });

  test('the option starts the map with the shapes on', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=5000&p=35&y=0');
    const states = await page.evaluate(async () => {
      const factory = window.galaxyMapFactory;
      if (factory === undefined) return null;
      const readings: boolean[] = [];
      for (const options of [{}, { shapes: false }]) {
        const canvas = document.createElement('canvas');
        canvas.width = 320;
        canvas.height = 240;
        document.body.append(canvas);
        const map = factory(canvas, options);
        await map.ready.catch(() => undefined);
        readings.push(map.areShapesVisible());
        map.dispose();
        canvas.remove();
      }
      return readings;
    });
    console.log('the shapes option', states);
    expect(states).toEqual([true, false]);
  });
});

test.describe('a sphere', () => {
  test('draws its rim brighter than its middle', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=5000&p=35&y=0');
    const colour: [number, number, number] = [0, 255, 255];
    await addSpheres(page, [{ position: [0, 0, 0], radius: 500, color: colour }]);
    await setView(page, [0, 0, 0], 5000);

    const middle = await project(page, [0, 0, 0]);
    const edge = await project(page, [500, 0, 0]);
    const radius = Math.abs(edge.x - middle.x);
    const atMiddle = await colourAt(page, middle.x, middle.y);
    const atRim = await colourAt(page, middle.x + 0.97 * radius, middle.y);
    console.log('the sphere readings', { radius, atMiddle, atRim });

    expect(radius).toBeGreaterThan(20);
    expect(colourDistance(atRim, colour)).toBeLessThan(
      colourDistance(atMiddle, colour),
    );
  });

  test('draws no label', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=5000&p=35&y=0');
    await addSpheres(page, [
      { position: [0, 0, 0], radius: 500, color: [0, 255, 255], name: 'Witch Head' },
    ]);
    await setView(page, [0, 0, 0], 5000);
    const labels = await page.evaluate(() =>
      [...document.querySelectorAll('.gm-system-label, .region-label')].map(
        (node) => node.textContent ?? '',
      ),
    );
    console.log('the labels over a sphere', labels);
    expect(labels).not.toContain('Witch Head');
  });

  test('draws nothing when it is under a pixel wide', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=100000&p=35&y=0');
    await addSpheres(page, [{ position: [0, 0, 0], radius: 1, color: [0, 255, 255] }]);
    await setView(page, [0, 0, 0], 100000);
    const withShapes = await frameHash(page);
    await setShapePass(page, false);
    const without = await frameHash(page);
    await setShapePass(page, true);
    console.log('the small sphere', { withShapes, without });
    expect(withShapes).toBe(without);
  });

  test('draws nothing at or behind the near plane', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=5000&p=35&y=0');
    const camera = cameraOf([0, 0, 0], 5000);
    const forward = forwardOf();
    const along = (range: number): [number, number, number] => [
      camera[0] + forward[0] * range,
      camera[1] + forward[1] * range,
      camera[2] + forward[2] * range,
    ];
    // The near plane is held at 1,000 light years, so one centre sits exactly on it and
    // one sits between it and the camera. Each radius is far under the range, so
    // neither sphere trips the cull for a camera inside the shell.
    await page.evaluate(() => {
      window.galaxyMap?.debug.setNearPlane(1000);
    });
    await addSpheres(page, [
      { position: along(1000), radius: 10, color: [0, 255, 255] },
      { position: along(500), radius: 10, color: [0, 255, 255] },
    ]);
    await setView(page, [0, 0, 0], 5000);
    const withShapes = await frameHash(page);
    await setShapePass(page, false);
    const without = await frameHash(page);
    await setShapePass(page, true);
    await page.evaluate(() => {
      window.galaxyMap?.debug.setNearPlane(null);
    });
    console.log('the near-plane spheres', { withShapes, without });
    expect(withShapes).toBe(without);
  });

  test('draws nothing when the camera sits inside it', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=500&p=35&y=0');
    await addSpheres(page, [
      { position: [0, 0, 0], radius: 1000, color: [0, 255, 255] },
    ]);
    await setView(page, [0, 0, 0], 500);
    const withShapes = await frameHash(page);
    await setShapePass(page, false);
    const without = await frameHash(page);
    await setShapePass(page, true);
    console.log('the sphere around the camera', { withShapes, without });
    expect(withShapes).toBe(without);
  });
});

test.describe('a line', () => {
  test('draws between two systems', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=1000&p=35&y=0');
    const colour: [number, number, number] = [255, 0, 255];
    await addCategory(page);
    await addSystems(page, [
      record('Sol', [-100, 0, 0]),
      record('Alioth', [100, 0, 0]),
    ]);
    await addLines(page, [
      { points: [{ system: 'Sol' }, { system: 'Alioth' }], color: colour, width: 8 },
    ]);
    await setView(page, [0, 0, 0], 1000);

    const start = await project(page, [-100, 0, 0]);
    const end = await project(page, [100, 0, 0]);
    const reading = await colourAt(page, (start.x + end.x) / 2, (start.y + end.y) / 2);
    console.log('the line between two systems', { start, end, reading });
    expect(Math.abs(reading[0] - colour[0])).toBeLessThanOrEqual(8);
    expect(Math.abs(reading[1] - colour[1])).toBeLessThanOrEqual(8);
    expect(Math.abs(reading[2] - colour[2])).toBeLessThanOrEqual(8);
  });

  test('carries no bright dot at a corner', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=2000&p=35&y=0');
    await addLines(page, [
      {
        points: [
          [-400, 0, 0],
          [0, 0, 0],
          [0, 400, 0],
        ],
        color: [200, 40, 40],
        width: 4,
      },
    ]);
    await setView(page, [0, 0, 0], 2000);

    const corner = await project(page, [0, 0, 0]);
    const run = await project(page, [-200, 0, 0]);
    const brightest = async (at: { x: number; y: number }) =>
      page.evaluate((where) => {
        const debug = window.galaxyMap?.debug;
        if (debug === undefined) return [0, 0, 0];
        const bytes = debug.readRect(
          Math.round(where.x) - 3,
          Math.round(where.y) - 3,
          7,
          7,
        );
        let best: [number, number, number] = [0, 0, 0];
        let peak = -1;
        for (let index = 0; index < bytes.length; index += 4) {
          const red = bytes[index] as number;
          const green = bytes[index + 1] as number;
          const blue = bytes[index + 2] as number;
          const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
          if (luminance > peak) {
            peak = luminance;
            best = [red, green, blue];
          }
        }
        return best;
      }, at);
    const atCorner = (await brightest(corner)) as [number, number, number];
    const atRun = (await brightest(run)) as [number, number, number];
    console.log('the corner against the run', { atCorner, atRun });

    expect(Math.abs(atCorner[0] - atRun[0])).toBeLessThanOrEqual(4);
    expect(Math.abs(atCorner[1] - atRun[1])).toBeLessThanOrEqual(4);
    expect(Math.abs(atCorner[2] - atRun[2])).toBeLessThanOrEqual(4);
  });

  // Two lines cross under the `MAX` blend, so the crossing takes the larger of the two in
  // each channel and never the sum. A red line over a green one reads yellow, and neither
  // channel of it is brighter than the line that carries it.
  test('takes the larger channel where two lines cross', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=2000&p=35&y=0');
    await addLines(page, [
      {
        points: [
          [-400, 0, 0],
          [400, 0, 0],
        ],
        color: [255, 0, 0],
        width: 6,
      },
      {
        points: [
          [0, 0, -400],
          [0, 0, 400],
        ],
        color: [0, 255, 0],
        width: 6,
      },
    ]);
    await setView(page, [0, 0, 0], 2000);

    const at = await project(page, [0, 0, 0]);
    const onRed = await project(page, [-200, 0, 0]);
    const read = async (where: { x: number; y: number }) =>
      page.evaluate((point) => {
        const debug = window.galaxyMap?.debug;
        if (debug === undefined) return [0, 0, 0];
        const bytes = debug.readRect(Math.round(point.x), Math.round(point.y), 1, 1);
        return [bytes[0] as number, bytes[1] as number, bytes[2] as number];
      }, where);
    const crossing = (await read(at)) as [number, number, number];
    const red = (await read(onRed)) as [number, number, number];
    console.log('the crossing against the red run', { crossing, red });

    // Both channels are there, so the pass took neither line away.
    expect(crossing[0]).toBeGreaterThan(128);
    expect(crossing[1]).toBeGreaterThan(128);
    // Neither channel is brighter than the line that carries it, so nothing was added.
    expect(crossing[0]).toBeLessThanOrEqual(red[0] + 4);
    expect(crossing[1]).toBeLessThanOrEqual(red[0] + 4);
  });

  test('joins its ends when it is closed', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=2000&p=35&y=0');
    const points = [
      [-400, 0, 0],
      [400, 0, 0],
      [0, 400, 0],
    ];
    await addLines(page, [{ points, color: [255, 0, 255], width: 6, closed: false }]);
    await setView(page, [0, 0, 0], 2000);
    const open = await frameHash(page);
    // The middle of the segment the closed line adds, from the last point to the first.
    const join = await project(page, [-200, 200, 0]);
    const openAtJoin = await colourAt(page, join.x, join.y);

    await page.evaluate(() => {
      window.galaxyMap?.clearShapes();
    });
    await addLines(page, [{ points, color: [255, 0, 255], width: 6, closed: true }]);
    await drawNow(page);
    const closed = await frameHash(page);
    const closedAtJoin = await colourAt(page, join.x, join.y);
    console.log('the closed line', { open, closed, openAtJoin, closedAtJoin });

    expect(closed).not.toBe(open);
    expect(colourDistance(closedAtJoin, [255, 0, 255])).toBeLessThan(
      colourDistance(openAtJoin, [255, 0, 255]),
    );
  });

  test('draws nothing when it sits behind the camera', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=5000&p=35&y=0');
    const camera = cameraOf([0, 0, 0], 5000);
    const forward = forwardOf();
    const behind = (side: number): [number, number, number] => [
      camera[0] - forward[0] * 2000 + side,
      camera[1] - forward[1] * 2000,
      camera[2] - forward[2] * 2000,
    ];
    await addLines(page, [
      { points: [behind(-200), behind(200)], color: [255, 0, 255], width: 8 },
    ]);
    await setView(page, [0, 0, 0], 5000);
    const withShapes = await frameHash(page);
    await setShapePass(page, false);
    const without = await frameHash(page);
    await setShapePass(page, true);
    console.log('the line behind the camera', { withShapes, without });
    expect(withShapes).toBe(without);
  });
});

test.describe('the line width', () => {
  test.use({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });

  test('is a width in CSS pixels', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=1000&p=35&y=0');
    await addLines(page, [
      {
        points: [
          [-400, 0, 0],
          [400, 0, 0],
        ],
        color: [255, 0, 255],
        width: 8,
      },
    ]);
    await setView(page, [0, 0, 0], 1000);
    const reading = await coveredRows(page, 960);
    console.log('the drawn width', reading);
    expect(reading.rows).toBeGreaterThanOrEqual(7);
    expect(reading.rows).toBeLessThanOrEqual(9);
  });

  test('does not follow the range', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=1000&p=35&y=0');
    await addLines(page, [
      {
        points: [
          [-400, 0, 0],
          [400, 0, 0],
        ],
        color: [255, 0, 255],
        width: 8,
      },
    ]);
    await setView(page, [0, 0, 0], 1000);
    const near = await coveredRows(page, 960);
    await setView(page, [0, 0, 0], 40000);
    const far = await coveredRows(page, 960);
    console.log('the width at two ranges', { near, far });
    expect(Math.abs(near.rows - far.rows)).toBeLessThanOrEqual(1);
  });
});

test.describe('the shapes switch', () => {
  test('removes both parts', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=2000&p=35&y=0');
    await addSpheres(page, [
      { position: [-400, 0, 0], radius: 300, color: [0, 255, 255] },
    ]);
    await addLines(page, [
      {
        points: [
          [0, 0, 0],
          [400, 0, 0],
        ],
        color: [255, 0, 255],
        width: 8,
      },
    ]);
    await setView(page, [0, 0, 0], 2000);
    const withShapes = await frameHash(page);

    await page.evaluate(() => {
      window.galaxyMap?.setShapesVisible(false);
    });
    await drawNow(page);
    const hostOff = await frameHash(page);

    await page.evaluate(() => {
      window.galaxyMap?.setShapesVisible(true);
    });
    await setShapePass(page, false);
    const passOff = await frameHash(page);
    await setShapePass(page, true);
    console.log('the switch readings', { withShapes, hostOff, passOff });

    expect(hostOff).not.toBe(withShapes);
    expect(passOff).toBe(hostOff);
  });

  test('a shape does not take a pick', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=5000&p=35&y=0');
    await addCategory(page);
    await addSystems(page, [record('Sol', [0, 0, 0])]);
    await addSpheres(page, [
      { position: [0, 0, 0], radius: 500, color: [0, 255, 255] },
    ]);
    await addLines(page, [
      {
        points: [
          [-500, 0, 0],
          [500, 0, 0],
        ],
        color: [255, 0, 255],
        width: 8,
      },
    ]);
    await setView(page, [0, 0, 0], 5000);

    const middle = await project(page, [0, 0, 0]);
    const edge = await project(page, [500, 0, 0]);
    const radius = Math.abs(edge.x - middle.x);
    const inside = { x: middle.x + 0.6 * radius, y: middle.y };
    const read = async (): Promise<(string | null)[]> =>
      page.evaluate(
        (where) => [
          window.galaxyMap?.systemAt(where.middle.x, where.middle.y)?.name ?? null,
          window.galaxyMap?.systemAt(where.inside.x, where.inside.y)?.name ?? null,
        ],
        { middle, inside },
      );
    const withShapes = await read();
    await page.evaluate(() => {
      window.galaxyMap?.setShapesVisible(false);
    });
    await drawNow(page);
    const without = await read();
    await page.evaluate(() => {
      window.galaxyMap?.setShapesVisible(true);
    });
    console.log('the pick readings', { radius, withShapes, without });

    expect(withShapes[0]).toBe('Sol');
    expect(withShapes[1]).toBeNull();
    expect(without).toEqual(withShapes);
  });

  test('a click on a sphere selects nothing and hovers nothing', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=5000&p=35&y=0');
    await addCategory(page);
    await addSystems(page, [record('Sol', [0, 0, 0])]);
    await addSpheres(page, [
      { position: [0, 0, 0], radius: 500, color: [0, 255, 255] },
    ]);
    await setView(page, [0, 0, 0], 5000);

    const middle = await project(page, [0, 0, 0]);
    const edge = await project(page, [500, 0, 0]);
    const inside = { x: middle.x + 0.6 * Math.abs(edge.x - middle.x), y: middle.y };

    await page.mouse.move(inside.x, inside.y);
    await drawNow(page);
    const hover = await page.evaluate(() => window.galaxyMap?.getHover()?.name ?? null);
    await page.mouse.down({ button: 'left' });
    await page.waitForTimeout(100);
    await page.mouse.up({ button: 'left' });
    const selection = await page.evaluate(
      () => window.galaxyMap?.getSelection()?.name ?? null,
    );
    console.log('the click inside the sphere', { inside, hover, selection });

    expect(hover).toBeNull();
    expect(selection).toBeNull();
  });
});

test.describe('the overlay order', () => {
  test('the four overlays draw in their order', async ({ page }) => {
    await openMap(page, '#c=0,0,10000&d=20000&p=89&y=0');
    await addCategory(page);

    // A point on a region boundary that the frame shows. The reader draws the frame
    // once with the region overlay off and once with it on, and takes the first
    // candidate whose pixel the overlay changes.
    const place = await page.evaluate(() => {
      const map = window.galaxyMap;
      const debug = map?.debug;
      const canvas = document.getElementById('map');
      if (debug === undefined || !(canvas instanceof HTMLCanvasElement)) return null;
      const positions = debug.regionLinePositions();
      const margin = 120;
      const candidates: [number, number, number][] = [];
      const screens: { x: number; y: number }[] = [];
      for (let index = 0; index + 2 < positions.length; index += 3 * 37) {
        const point: [number, number, number] = [
          positions[index] as number,
          positions[index + 1] as number,
          positions[index + 2] as number,
        ];
        const at = debug.project(point);
        if (at.x < margin || at.x > canvas.clientWidth - margin) continue;
        if (at.y < margin || at.y > canvas.clientHeight - margin) continue;
        candidates.push(point);
        screens.push(at);
        if (candidates.length >= 400) break;
      }
      const readAll = (): [number, number, number][] => {
        debug.drawNow();
        return screens.map((at) => {
          const pixel = debug.readPixel(Math.round(at.x), Math.round(at.y));
          return [pixel[0], pixel[1], pixel[2]];
        });
      };
      debug.setPasses({ regions: false });
      const plain = readAll();
      debug.setPasses({ regions: true });
      const banded = readAll();
      for (let index = 0; index < candidates.length; index += 1) {
        const a = plain[index] as [number, number, number];
        const b = banded[index] as [number, number, number];
        const apart = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
        if (apart > 6) {
          return { point: candidates[index], screen: screens[index], apart };
        }
      }
      return null;
    });
    console.log('the boundary point', place);
    expect(place).not.toBeNull();
    const at = place?.screen ?? { x: 0, y: 0 };
    const world = place?.point as [number, number, number];

    const sphereColour: [number, number, number] = [0, 255, 255];
    const lineColour: [number, number, number] = [255, 0, 255];
    const onBoundary = await colourAt(page, at.x, at.y);

    // The marker draws over the boundary, and it draws before the shapes.
    await addSystems(page, [record('Sol', world)]);
    await drawNow(page);
    const onMarker = await colourAt(page, at.x, at.y);

    // The sphere takes an opacity of 1, so its shell alpha is 1 over the whole sprite.
    // Its centre is the marker, so half the chord lies behind the marker and the wash is
    // the cap of 0.5.
    await addSpheres(page, [
      { position: world, radius: 3000, color: sphereColour, opacity: 1 },
    ]);
    await drawNow(page);
    const onWash = await colourAt(page, at.x, at.y);

    await addLines(page, [
      {
        points: [
          [world[0] - 4000, world[1], world[2]],
          [world[0] + 4000, world[1], world[2]],
        ],
        color: lineColour,
        width: 12,
      },
    ]);
    await drawNow(page);
    // A pixel on the line inside the sphere and away from the marker sprite.
    const beside = await project(page, [world[0] + 1500, world[1], world[2]]);
    const onLine = await colourAt(page, beside.x, beside.y);
    console.log('the overlay order', { onBoundary, onMarker, onWash, onLine });

    // The marker covers the boundary.
    expect(colourDistance(onMarker, MARKER)).toBeLessThan(24);
    expect(colourDistance(onMarker, onBoundary)).toBeGreaterThan(24);
    // The sphere washes the marker, and the cap leaves it at least half of its colour.
    // The cap writes exactly half, and the frame holds bytes, so a reading can be one
    // count under half.
    expect(colourDistance(onWash, onMarker)).toBeGreaterThan(24);
    expect(colourDistance(onWash, sphereColour)).toBeLessThan(
      colourDistance(onMarker, sphereColour),
    );
    for (let channel = 0; channel < 3; channel += 1) {
      expect(onWash[channel] as number).toBeGreaterThanOrEqual(
        (onMarker[channel] as number) / 2 - 2,
      );
    }
    // The line covers the sphere at a pixel with no marker.
    expect(colourDistance(onLine, lineColour)).toBeLessThan(24);
    expect(colourDistance(onLine, sphereColour)).toBeGreaterThan(24);
  });

  test('a marker draws over a shape', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=5000&p=35&y=0');
    const sphereColour: [number, number, number] = [0, 255, 255];
    await addCategory(page);
    await addSystems(page, [record('Sol', [0, 0, 0])]);
    await addSpheres(page, [
      { position: [0, 0, 0], radius: 500, color: sphereColour, opacity: 1 },
    ]);
    await addLines(page, [
      {
        points: [
          [-500, 0, 0],
          [500, 0, 0],
        ],
        color: [255, 0, 255],
        width: 8,
      },
    ]);
    await setView(page, [0, 0, 0], 5000);

    const middle = await project(page, [0, 0, 0]);
    const reading = await colourAt(page, middle.x, middle.y);
    await setShapePass(page, false);
    await drawNow(page);
    const own = await colourAt(page, middle.x, middle.y);
    await setShapePass(page, true);
    await drawNow(page);
    const picked = await page.evaluate(
      (where) => window.galaxyMap?.systemAt(where.x, where.y)?.name ?? null,
      middle,
    );
    console.log('the marker over the sphere', { reading, own, picked });

    // Each step caps what it writes over a marker body at half, and neither step reads
    // what the other wrote, so a marker under both keeps a quarter. Without the cap on the
    // line step the pixel would hold the line colour whole, and the green channel of this
    // marker would read 0 against the quarter of 64 the rule asks for.
    for (let channel = 0; channel < 3; channel += 1) {
      expect(reading[channel] as number).toBeGreaterThanOrEqual(
        (own[channel] as number) / 4 - 2,
      );
    }
    // The marker is still the reading at that pixel.
    expect(picked).toBe('Sol');
  });

  test('one decoration leaves a marker half its colour', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=5000&p=35&y=0');
    await addCategory(page);
    await addSystems(page, [record('Sol', [0, 0, 0])]);
    // A sphere and no line. The marker sits at the centre of the shell, so half the chord
    // lies behind it and the wash is half whatever the shell alpha is.
    await addSpheres(page, [
      { position: [0, 0, 0], radius: 500, color: [0, 255, 255], opacity: 1 },
    ]);
    await setView(page, [0, 0, 0], 5000);

    const middle = await project(page, [0, 0, 0]);
    const on = await colourAt(page, middle.x, middle.y);
    await setShapePass(page, false);
    await drawNow(page);
    const off = await colourAt(page, middle.x, middle.y);
    await setShapePass(page, true);
    console.log('the marker under one sphere', { on, off });

    // The wash writes exactly half here, and the frame holds bytes, so a reading can be
    // one count under half.
    for (let channel = 0; channel < 3; channel += 1) {
      expect(on[channel] as number).toBeGreaterThanOrEqual(
        (off[channel] as number) / 2 - 2,
      );
    }
  });
});

test.describe('the shape pass draw calls', () => {
  test('the set size does not change the call count', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=5000&p=35&y=0');
    await addSpheres(page, [
      { position: [0, 0, 0], radius: 500, color: [0, 255, 255] },
    ]);
    await addLines(page, [
      {
        points: [
          [-500, 0, 0],
          [500, 0, 0],
        ],
        color: [255, 0, 255],
      },
    ]);
    await setView(page, [0, 0, 0], 5000);
    const one = await page.evaluate(
      () => window.galaxyMap?.debug.shapeDrawCalls() ?? -1,
    );

    const filled = await page.evaluate(() => {
      const map = window.galaxyMap;
      if (map === undefined) return null;
      map.clearShapes();
      const spheres = [];
      const lines = [];
      for (let index = 0; index < 1024; index += 1) {
        const x = -2000 + (4000 * index) / 1024;
        spheres.push({ position: [x, 0, 0], radius: 100, color: [0, 255, 255] });
      }
      for (let index = 0; index < 4096; index += 1) {
        const x = -2000 + (4000 * index) / 4096;
        lines.push({
          points: [
            [x, -500, 0],
            [x, 500, 0],
          ],
          color: [255, 0, 255],
        });
      }
      const sphereReport = map.addSpheres(spheres as never);
      const lineReport = map.addLines(lines as never);
      map.debug.drawNow();
      return {
        spheres: sphereReport.added,
        lines: lineReport.added,
        calls: map.debug.shapeDrawCalls(),
      };
    });
    console.log('the draw calls', { one, filled });

    expect(one).toBe(3);
    expect(filled?.spheres).toBe(1024);
    expect(filled?.lines).toBe(4096);
    expect(filled?.calls).toBe(3);
  });

  test('a map with no line allocates no line buffer', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=5000&p=35&y=0');
    await addSpheres(page, [
      { position: [0, 0, 0], radius: 500, color: [0, 255, 255] },
    ]);
    await setView(page, [0, 0, 0], 5000);
    const withoutLine = await page.evaluate(() =>
      window.galaxyMap === undefined
        ? 'missing'
        : window.galaxyMap.debug.shapeLineBufferSize(),
    );

    await addLines(page, [
      {
        points: [
          [-500, 0, 0],
          [500, 0, 0],
        ],
        color: [255, 0, 255],
      },
    ]);
    await drawNow(page);
    const withLine = await page.evaluate(() =>
      window.galaxyMap === undefined
        ? 'missing'
        : window.galaxyMap.debug.shapeLineBufferSize(),
    );
    console.log('the line buffer', { withoutLine, withLine });

    expect(withoutLine).toBeNull();
    expect(withLine).not.toBeNull();
  });
});

/** A point on the view axis, a distance beyond the cursor from the camera. */
function beyond(
  cursor: readonly [number, number, number],
  distance: number,
): [number, number, number] {
  const forward = forwardOf();
  return [
    cursor[0] + forward[0] * distance,
    cursor[1] + forward[1] * distance,
    cursor[2] + forward[2] * distance,
  ];
}

/** Reads the range buffer at one pixel, and null where the map holds no buffer. */
async function rangeAt(page: Page, x: number, y: number): Promise<number | null> {
  return page.evaluate(
    (where) =>
      window.galaxyMap?.debug.readRange(Math.round(where.x), Math.round(where.y)) ??
      null,
    { x, y },
  );
}

test.describe('the range buffer', () => {
  test('holds the nearer of two markers that cover one pixel', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=5000&p=35&y=0');
    await addCategory(page);
    // Two systems on the view axis, so both markers cover the middle pixel. The near one
    // is 5,000 light years from the camera and the far one 6,000.
    await addSystems(page, [
      record('Near', [0, 0, 0]),
      record('Far', beyond([0, 0, 0], 1000)),
    ]);
    // The map writes the range buffer only while a sphere draws.
    await addSpheres(page, [
      { position: beyond([0, 0, 0], 3000), radius: 500, color: [0, 255, 255] },
    ]);
    await setView(page, [0, 0, 0], 5000);

    const middle = await project(page, [0, 0, 0]);
    const held = await rangeAt(page, middle.x, middle.y);
    const empty = await rangeAt(page, 4, 4);
    const size = await page.evaluate(() => ({
      range: window.galaxyMap?.debug.rangeBufferSize() ?? null,
      drawing: window.galaxyMap?.debug.drawingBufferSize() ?? null,
    }));
    console.log('the range buffer', { held, empty, size });

    // The gate reads this: a null size is the no-float fallback, and a measurement taken
    // there measures the frame this change replaces.
    expect(size.range).not.toBeNull();
    expect(size.range).toEqual(size.drawing);
    expect(held).not.toBeNull();
    expect(held ?? 0).toBeGreaterThan(4990);
    expect(held ?? 0).toBeLessThan(5010);
    // A pixel no marker body covers holds a value above every drawable range.
    expect(empty ?? 0).toBeGreaterThan(1e6);
  });

  test('takes no range draw while the map holds no sphere', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=5000&p=35&y=0');
    await addCategory(page);
    await addSystems(page, [record('Sol', [0, 0, 0])]);
    await setView(page, [0, 0, 0], 5000);
    const withoutSphere = await page.evaluate(
      () => window.galaxyMap?.debug.markerDrawCalls() ?? -1,
    );

    await addSpheres(page, [
      { position: [0, 0, 0], radius: 500, color: [0, 255, 255] },
    ]);
    await drawNow(page);
    const withSphere = await page.evaluate(
      () => window.galaxyMap?.debug.markerDrawCalls() ?? -1,
    );

    // The sphere of a category that is off draws nothing, so the range draw goes with it.
    await page.evaluate(() => {
      window.galaxyMap?.setShapesVisible(false);
    });
    await drawNow(page);
    const shapesOff = await page.evaluate(
      () => window.galaxyMap?.debug.markerDrawCalls() ?? -1,
    );
    console.log('the marker draw calls', { withoutSphere, withSphere, shapesOff });

    expect(withoutSphere).toBe(1);
    expect(withSphere).toBe(2);
    expect(shapesOff).toBe(1);
  });
});

test.describe('the sphere depth wash', () => {
  /** The colour and the opacity every sphere of this block takes. */
  const SPHERE: [number, number, number] = [0, 255, 255];
  const OPACITY = 0.4;

  /**
   * Reads the middle pixel of the marker at the cursor with the shapes on and with them
   * off, over one sphere.
   */
  async function readings(
    page: Page,
    centre: readonly [number, number, number],
    radius: number,
  ): Promise<{ on: [number, number, number]; off: [number, number, number] }> {
    await addSpheres(page, [
      { position: centre, radius, color: SPHERE, opacity: OPACITY },
    ]);
    await setView(page, [0, 0, 0], 5000);
    const middle = await project(page, [0, 0, 0]);
    const on = await colourAt(page, middle.x, middle.y);
    await setShapePass(page, false);
    await drawNow(page);
    const off = await colourAt(page, middle.x, middle.y);
    await setShapePass(page, true);
    await drawNow(page);
    return { on, off };
  }

  /** The frame the marker takes, mixed with the sphere colour at an alpha. */
  function washed(
    off: readonly [number, number, number],
    alpha: number,
  ): [number, number, number] {
    return [
      off[0] * (1 - alpha) + SPHERE[0] * alpha,
      off[1] * (1 - alpha) + SPHERE[1] * alpha,
      off[2] * (1 - alpha) + SPHERE[2] * alpha,
    ];
  }

  /** Each channel of two colours, within a count of each other. */
  function expectNear(
    read: readonly [number, number, number],
    want: readonly [number, number, number],
    within: number,
  ): void {
    for (let channel = 0; channel < 3; channel += 1) {
      expect(
        Math.abs((read[channel] as number) - (want[channel] as number)),
      ).toBeLessThanOrEqual(within);
    }
  }

  test('leaves a marker in front of the sphere alone', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=5000&p=35&y=0');
    await addCategory(page);
    await addSystems(page, [record('Sol', [0, 0, 0])]);
    // The shell runs from 6,500 to 7,500 light years and the marker is at 5,000, so the
    // whole chord lies behind it.
    const { on, off } = await readings(page, beyond([0, 0, 0], 2000), 500);
    console.log('the marker in front', { on, off });
    expectNear(on, off, 8);
  });

  test('washes a marker at the centre with half the shell', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=5000&p=35&y=0');
    await addCategory(page);
    await addSystems(page, [record('Sol', [0, 0, 0])]);
    // The marker sits at the centre of the sphere, so half the chord lies behind it.
    const { on, off } = await readings(page, [0, 0, 0], 500);
    console.log('the marker at the centre', { on, off });
    expectNear(on, washed(off, OPACITY * 0.5), 8);
  });

  test('washes a marker behind the sphere whole', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=5000&p=35&y=0');
    await addCategory(page);
    await addSystems(page, [record('Sol', [0, 0, 0])]);
    // The shell runs from 4,400 to 4,600 light years and the marker is at 5,000, so the
    // whole chord lies in front of it.
    const { on, off } = await readings(page, beyond([0, 0, 0], -500), 100);
    console.log('the marker behind', { on, off });
    expectNear(on, washed(off, OPACITY), 8);
  });

  test('gives the halo of a marker the whole wash', async ({ page }) => {
    // At a range of 10 light years a marker holds the cap size, so a glow sprite is 40
    // CSS pixels across and its radius is 20.
    await openMap(page, '#c=0,0,0&d=10&p=35&y=0');
    await addCategory(page);
    await addSystems(page, [record('Sol', [0, 0, 0])]);
    await addSpheres(page, [
      {
        position: beyond([0, 0, 0], 2000),
        radius: 500,
        color: SPHERE,
        opacity: OPACITY,
      },
    ]);
    await setView(page, [0, 0, 0], 10);

    const middle = await project(page, [0, 0, 0]);
    // Ten CSS pixels out on the diagonal, which is off both spikes, the marker's own
    // alpha is 0.106 and the range draw writes nothing: a spike reaches 1 CSS pixel from
    // its axis, and the halo at half the sprite radius is 0.85 * 0.5 ** 3.
    const halo = { x: middle.x + 10 / Math.SQRT2, y: middle.y + 10 / Math.SQRT2 };
    // Thirty CSS pixels out the sprite is over, so this pixel carries no marker at all.
    const bare = { x: middle.x + 30 / Math.SQRT2, y: middle.y + 30 / Math.SQRT2 };
    const haloOn = await colourAt(page, halo.x, halo.y);
    const bareOn = await colourAt(page, bare.x, bare.y);
    await setShapePass(page, false);
    await drawNow(page);
    const haloOff = await colourAt(page, halo.x, halo.y);
    const bareOff = await colourAt(page, bare.x, bare.y);
    await setShapePass(page, true);
    console.log('the halo wash', { haloOn, haloOff, bareOn, bareOff });

    // The wash the halo takes is the wash a pixel with no marker takes: the halo's own
    // alpha is 0.106 there, which is under the 0.5 a marker body holds, so the range draw
    // writes nothing at that pixel and the sphere writes its whole share over it.
    //
    // The two readings are counts and not alphas, and a wash is a blend toward the sphere
    // colour: `on - off` is the wash alpha times `sphere - off`. The halo pixel starts
    // about 22 counts nearer the marker's own colour than the bare pixel does, so at a
    // wash alpha of 0.4 the two counts differ by about 9 although the alpha is the same.
    // The reading measured 9, so the bound is 10 and not the 8 the other readings take.
    for (let channel = 0; channel < 3; channel += 1) {
      const overHalo = (haloOn[channel] as number) - (haloOff[channel] as number);
      const overNothing = (bareOn[channel] as number) - (bareOff[channel] as number);
      expect(Math.abs(overHalo - overNothing)).toBeLessThanOrEqual(10);
    }
  });

  test('caps the wash it writes over a marker body', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=5000&p=35&y=0');
    await addCategory(page);
    await addSystems(page, [record('Sol', [0, 0, 0])]);
    // An opacity of 1 puts the shell alpha at 1 over the whole sprite, which is the alpha
    // the limb holds at the opacity a sphere takes by default. The centre is nearer the
    // camera than the system, so the whole chord lies in front of the marker and the
    // share is 1: this is the most a sphere can write over a marker.
    await addSpheres(page, [
      { position: beyond([0, 0, 0], -500), radius: 100, color: SPHERE, opacity: 1 },
    ]);
    await setView(page, [0, 0, 0], 5000);

    const middle = await project(page, [0, 0, 0]);
    const on = await colourAt(page, middle.x, middle.y);
    await setShapePass(page, false);
    await drawNow(page);
    const off = await colourAt(page, middle.x, middle.y);
    await setShapePass(page, true);
    console.log('the capped limb', { on, off });

    // The cap alone holds this reading: the shell alpha is 1 and the share is 1, so
    // without it the sphere would write its colour over the marker whole and every
    // channel of the marker's own colour would go. The cap writes exactly half, and the
    // frame holds bytes, so a reading can be one count under half.
    for (let channel = 0; channel < 3; channel += 1) {
      expect(on[channel] as number).toBeGreaterThanOrEqual(
        (off[channel] as number) / 2 - 2,
      );
    }
    // The marker is yellow and the sphere cyan, so a missing cap would read as the sphere.
    expect(colourDistance(on, SPHERE)).toBeGreaterThan(24);
  });

  // The scenario "The galaxy behind a sphere takes the whole wash". The set holds no
  // system, so no marker writes range and the pixel reads `RANGE_EMPTY`. The share is then
  // 1 and the sphere writes its whole shell, which is the frame the map drew before the
  // range buffer existed.
  test('washes the galaxy behind it whole', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=5000&p=35&y=0');
    await setView(page, [0, 0, 0], 5000);

    const middle = await project(page, [0, 0, 0]);
    const off = await colourAt(page, middle.x, middle.y);
    await addSpheres(page, [
      { position: [0, 0, 0], radius: 500, color: SPHERE, opacity: OPACITY },
    ]);
    await drawNow(page);
    const on = await colourAt(page, middle.x, middle.y);
    console.log('the galaxy behind the sphere', { on, off });

    expectNear(on, washed(off, OPACITY), 8);
  });
});

test.describe('the line over a marker', () => {
  test('keeps at least half of the marker', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=5000&p=35&y=0');
    await addCategory(page);
    await addSystems(page, [record('Sol', [0, 0, 0])]);
    await addLines(page, [
      {
        points: [
          [-2000, 0, 0],
          [2000, 0, 0],
        ],
        color: [255, 0, 255],
        width: 8,
      },
    ]);
    await setView(page, [0, 0, 0], 5000);

    const middle = await project(page, [0, 0, 0]);
    const away = await project(page, [1500, 0, 0]);
    const onMarker = await colourAt(page, middle.x, middle.y);
    const onLine = await colourAt(page, away.x, away.y);
    await setShapePass(page, false);
    await drawNow(page);
    const offMarker = await colourAt(page, middle.x, middle.y);
    await setShapePass(page, true);
    console.log('the line over the marker', { onMarker, offMarker, onLine });

    // The cap writes exactly half, and the frame holds bytes, so a reading can be one
    // count under half.
    for (let channel = 0; channel < 3; channel += 1) {
      expect(onMarker[channel] as number).toBeGreaterThanOrEqual(
        (offMarker[channel] as number) / 2 - 2,
      );
    }
    // The cap reaches the marker body alone: the same line away from it draws whole.
    expect(colourDistance(onLine, [255, 0, 255])).toBeLessThan(24);
  });
});

// The category rules of a shape, read at the pixel. The unit tests hold the sweep itself;
// these read the whole path from the switch through the sweep and the instance buffers to
// the frame, which is what the demo sets lean on: 983 UIA lines and 48 multifaction
// spheres carry no colour of their own.
test.describe('a shape and its categories', () => {
  /** Adds `A` in red and `B` in green, which every test of this block names. */
  async function addPair(page: Page): Promise<void> {
    await page.evaluate(() => {
      window.galaxyMap?.addCategories([
        { name: 'A', color: [255, 0, 0], maxDrawRange: 200000 },
        { name: 'B', color: [0, 255, 0], maxDrawRange: 200000 },
      ]);
    });
  }

  /** Switches one category and draws a frame. */
  async function switchCategory(page: Page, name: string, on: boolean): Promise<void> {
    await page.evaluate(
      (which) => {
        window.galaxyMap?.setCategoryVisible(which.name, which.on);
      },
      { name, on },
    );
    await drawNow(page);
  }

  // The scenario "A category that is off removes its shapes".
  test('a category that is off removes its shapes', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=4000&p=35&y=0');
    await addPair(page);
    await addSpheres(page, [
      { position: [-800, 0, 0], radius: 500, primaryCategory: 'A' },
      { position: [800, 0, 0], radius: 500, primaryCategory: 'B' },
    ]);
    await setView(page, [0, 0, 0], 4000);
    const both = await frameHash(page);

    await switchCategory(page, 'A', false);
    const withoutA = await frameHash(page);

    // The control frame: the same view with the sphere of `A` never added, and `A` on
    // again so the switch itself cannot be what the hash reads.
    await page.evaluate(() => {
      window.galaxyMap?.clearShapes();
      window.galaxyMap?.setCategoryVisible('A', true);
    });
    await addSpheres(page, [
      { position: [800, 0, 0], radius: 500, primaryCategory: 'B' },
    ]);
    await drawNow(page);
    const onlyB = await frameHash(page);
    console.log('the frames of the switch', { both, withoutA, onlyB });

    expect(withoutA).not.toBe(both);
    expect(withoutA).toBe(onlyB);
  });

  // The scenario "A shape with no colour follows the first category that is on".
  test('a shape with no colour follows the first category that is on', async ({
    page,
  }) => {
    await openMap(page, '#c=0,0,0&d=1000&p=35&y=0');
    await addPair(page);
    await addLines(page, [
      {
        points: [
          [-100, 0, 0],
          [100, 0, 0],
        ],
        width: 8,
        primaryCategory: 'A',
        secondaryCategories: ['B'],
      },
    ]);
    await setView(page, [0, 0, 0], 1000);

    const middle = await project(page, [0, 0, 0]);
    const first = await colourAt(page, middle.x, middle.y);
    await switchCategory(page, 'A', false);
    const second = await colourAt(page, middle.x, middle.y);
    console.log('the line colour of the two categories', { first, second });

    expect(colourDistance(first, [255, 0, 0])).toBeLessThanOrEqual(8);
    expect(colourDistance(second, [0, 255, 0])).toBeLessThanOrEqual(8);
  });

  // The scenario "A shape with a colour keeps it".
  test('a shape with a colour keeps it', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=1000&p=35&y=0');
    await addPair(page);
    await addLines(page, [
      {
        points: [
          [-100, 0, 0],
          [100, 0, 0],
        ],
        width: 8,
        color: [0, 0, 255],
        primaryCategory: 'A',
      },
    ]);
    await setView(page, [0, 0, 0], 1000);

    const middle = await project(page, [0, 0, 0]);
    const reading = await colourAt(page, middle.x, middle.y);
    console.log('the line that carries its own colour', reading);

    expect(colourDistance(reading, [0, 0, 255])).toBeLessThanOrEqual(8);
  });

  // The scenario "The two filters are separate". `setNameFilter` reaches the markers and
  // `setShapeNameFilter` reaches the shapes, so a filter that named the sphere by chance
  // must still leave it on the screen.
  test('the marker filter does not reach a shape', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=2000&p=35&y=0');
    await addCategory(page);
    await addSystems(page, [record('Sol', [0, 0, 0])]);
    await addSpheres(page, [
      { position: [0, 0, 0], radius: 500, color: [0, 255, 255], name: 'Sol Zone' },
    ]);
    await setView(page, [0, 0, 0], 2000);
    await page.evaluate(() => {
      window.galaxyMap?.setNameFilter('achenar');
    });
    await drawNow(page);

    const markers = await page.evaluate(
      () => window.galaxyMap?.debug.systemMarkerCount() ?? -1,
    );
    const sphere = await page.evaluate(
      () => window.galaxyMap?.getShapeInfo('sphere', 0)?.drawn ?? null,
    );
    console.log('the two filters', { markers, sphere });

    expect(markers).toBe(0);
    expect(sphere).toBe(true);
  });
});
