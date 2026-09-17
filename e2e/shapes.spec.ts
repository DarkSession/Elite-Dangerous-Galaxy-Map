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

    // The sphere takes an opacity of 1, so its middle covers the band whole.
    await addSpheres(page, [
      { position: world, radius: 3000, color: sphereColour, opacity: 1 },
    ]);
    await drawNow(page);
    const onSphere = await colourAt(page, at.x, at.y);

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
    const onLine = await colourAt(page, at.x, at.y);

    await addSystems(page, [record('Sol', world)]);
    await drawNow(page);
    const onMarker = await colourAt(page, at.x, at.y);
    console.log('the overlay order', { onBoundary, onSphere, onLine, onMarker });

    // The sphere covers the boundary.
    expect(colourDistance(onSphere, sphereColour)).toBeLessThan(24);
    expect(colourDistance(onSphere, onBoundary)).toBeGreaterThan(24);
    // The line covers the sphere.
    expect(colourDistance(onLine, lineColour)).toBeLessThan(24);
    expect(colourDistance(onLine, sphereColour)).toBeGreaterThan(24);
    // The marker covers the line.
    expect(colourDistance(onMarker, MARKER)).toBeLessThan(
      colourDistance(onMarker, lineColour),
    );
  });

  test('a marker draws over a shape', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=5000&p=35&y=0');
    const sphereColour: [number, number, number] = [0, 255, 255];
    await addCategory(page);
    await addSystems(page, [record('Sol', [0, 0, 0])]);
    await addSpheres(page, [
      { position: [0, 0, 0], radius: 500, color: sphereColour, opacity: 1 },
    ]);
    await setView(page, [0, 0, 0], 5000);

    const middle = await project(page, [0, 0, 0]);
    const reading = await colourAt(page, middle.x, middle.y);
    console.log('the marker over the sphere', reading);
    expect(colourDistance(reading, MARKER)).toBeLessThan(
      colourDistance(reading, sphereColour),
    );
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
