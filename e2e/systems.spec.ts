import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openMap, startState, waitForReady } from './helpers';
import type { CategoryInput, SystemRecordInput } from '../src/scene-data/real-systems';

test.use({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });

/** The galactic centre in game coordinates. */
const CENTRE: [number, number, number] = [15, -35, 25895];
/** 3,000 light years above the plane at the rim, which is the darkest ground. */
const RIM_ABOVE: [number, number, number] = [40015, 3000, 25895];
/** The colour the readings check, and the ring colour the shader carries. */
const CORE: [number, number, number] = [153, 230, 255];
const RING: [number, number, number] = [5, 10, 26];

/**
 * A point 20,000 light years above the plane at the rim. The frame holds no light there,
 * so a reading of a white marker is the alpha of the marker itself.
 */
const DARK_SPACE: [number, number, number] = [40015, 20000, 25895];

/** A colour that makes a luminance reading the alpha of the marker. */
const WHITE: [number, number, number] = [255, 255, 255];

/** The pitch every view in this file takes. */
const PITCH = 35;

/**
 * A point at an exact range from the camera of a view, near the middle of the screen.
 * `cameraDirection` in `src/camera/projection.ts` puts the camera at
 * `cursor + distance * (0, sin(pitch), -cos(pitch))` at a yaw of 0, so the world x axis
 * lies across the view direction: `lateral` moves the point sideways on the screen and
 * leaves the range alone.
 */
function atRange(
  cursor: readonly [number, number, number],
  distance: number,
  range: number,
  lateral = 0,
): [number, number, number] {
  const pitch = (PITCH * Math.PI) / 180;
  const along = Math.sqrt(range * range - lateral * lateral);
  return [
    cursor[0] + lateral,
    cursor[1] + Math.sin(pitch) * (distance - along),
    cursor[2] - Math.cos(pitch) * (distance - along),
  ];
}

/** A record the reader accepts. */
function record(
  name: string,
  position: readonly [number, number, number],
  category: string,
): SystemRecordInput {
  return {
    name,
    coords: { x: position[0], y: position[1], z: position[2] },
    primaryCategory: category,
  };
}

/**
 * Adds categories through the handle and returns the report. The cast is at the call,
 * because a test also passes a category the input type refuses and the reader rejects
 * at run time.
 */
async function addCategories(
  page: Page,
  categories: readonly unknown[],
): Promise<{
  added: number;
  replaced: number;
  rejected: { index: number; reason: string }[];
}> {
  return page.evaluate((list) => {
    const report = window.galaxyMap?.addCategories(list as readonly CategoryInput[]);
    return report === undefined ? { added: 0, replaced: 0, rejected: [] } : report;
  }, categories);
}

/** Adds records through the handle and returns the report. */
async function addSystems(
  page: Page,
  records: readonly unknown[],
): Promise<{
  added: number;
  replaced: number;
  rejected: { index: number; reason: string }[];
}> {
  return page.evaluate((list) => {
    const report = window.galaxyMap?.addSystems(list as readonly SystemRecordInput[]);
    return report === undefined ? { added: 0, replaced: 0, rejected: [] } : report;
  }, records);
}

/** Replaces the view and draws one frame. */
async function setView(
  page: Page,
  cursor: readonly [number, number, number],
  distance: number,
): Promise<void> {
  await page.evaluate(
    (next) => {
      window.galaxyMap?.setView({
        cursor: next.cursor as [number, number, number],
        distance: next.distance,
        yaw: 0,
        pitch: 35,
      });
      window.galaxyMap?.debug.drawNow();
    },
    { cursor, distance },
  );
}

/** Draws one frame. */
async function drawFrame(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.galaxyMap?.debug.drawNow();
  });
}

/** Switches passes and draws one frame. */
async function setPasses(page: Page, passes: Record<string, boolean>): Promise<void> {
  await page.evaluate((next) => {
    window.galaxyMap?.debug.setPasses(next);
  }, passes);
}

/** The pixel at the projection of a game position. */
async function pixelAt(
  page: Page,
  point: readonly [number, number, number],
): Promise<[number, number, number, number]> {
  return page.evaluate((where) => {
    const map = window.galaxyMap;
    if (map === undefined) return [0, 0, 0, 0] as [number, number, number, number];
    const screen = map.debug.project(where as [number, number, number]);
    return map.debug.readPixel(screen.x, screen.y);
  }, point);
}

/** The row of pixels through the projection of a game position. */
async function rowAt(
  page: Page,
  point: readonly [number, number, number],
  half: number,
): Promise<number[]> {
  return page.evaluate(
    (where) => {
      const map = window.galaxyMap;
      if (map === undefined) return [];
      const screen = map.debug.project(where.point as [number, number, number]);
      const x = Math.round(screen.x) - where.half;
      const y = Math.round(screen.y);
      return Array.from(map.debug.readRect(x, y, where.half * 2 + 1, 1));
    },
    { point, half },
  );
}

/**
 * The colour of a ring pixel on the row through a marker's centre. It takes the pixel
 * whose own centre lies between 1 and 2 CSS pixels inside the edge of the disc, which
 * at a disc radius of 4.49 is a distance of 2.49 to 3.49 from the centre. Every such
 * pixel is opaque, because the antialiasing ramp covers the outer 1 pixel alone.
 */
async function ringPixelAt(
  page: Page,
  point: readonly [number, number, number],
  radius: number,
): Promise<[number, number, number]> {
  return page.evaluate(
    (where) => {
      const map = window.galaxyMap;
      if (map === undefined) return [-1, -1, -1] as [number, number, number];
      const screen = map.debug.project(where.point as [number, number, number]);
      const row = Math.round(screen.y);
      const left = Math.round(screen.x) - 6;
      const bytes = map.debug.readRect(left, row, 13, 1);
      const inner = where.radius - 2;
      let best = -1;
      let bestGap = Number.POSITIVE_INFINITY;
      for (let index = 0; index < 13; index += 1) {
        const dx = left + index + 0.5 - screen.x;
        const dy = row + 0.5 - screen.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < inner || dist > where.radius - 1) continue;
        const gap = Math.abs(dist - (where.radius - 1.5));
        if (gap < bestGap) {
          bestGap = gap;
          best = index;
        }
      }
      if (best < 0) return [-1, -1, -1] as [number, number, number];
      return [
        bytes[best * 4] as number,
        bytes[best * 4 + 1] as number,
        bytes[best * 4 + 2] as number,
      ] as [number, number, number];
    },
    { point, radius },
  );
}

/** The pixel index of the centre of the sprite of a marker. */
async function centrePixel(
  page: Page,
  point: readonly [number, number, number],
): Promise<{ x: number; y: number }> {
  return page.evaluate((where) => {
    const map = window.galaxyMap;
    if (map === undefined) return { x: -1, y: -1 };
    const screen = map.debug.project(where as [number, number, number]);
    return { x: Math.floor(screen.x), y: Math.floor(screen.y) };
  }, point);
}

/** One pixel of the frame, by its pixel index. */
async function pixelOf(
  page: Page,
  x: number,
  y: number,
): Promise<[number, number, number, number]> {
  return page.evaluate(
    (where) => {
      const map = window.galaxyMap;
      if (map === undefined) return [0, 0, 0, 0] as [number, number, number, number];
      return map.debug.readPixel(where.x, where.y);
    },
    { x, y },
  );
}

/** The luminance of one pixel of the frame, by its pixel index. */
async function luminanceOf(page: Page, x: number, y: number): Promise<number> {
  return page.evaluate(
    (where) => {
      const map = window.galaxyMap;
      if (map === undefined) return -1;
      const [red, green, blue] = map.debug.readPixel(where.x, where.y);
      return (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
    },
    { x, y },
  );
}

/**
 * The luminance the marker pass adds at each of a list of pixels. The frame the composite
 * writes over empty space still carries about 9 of 255, so a reading of the frame itself
 * is the alpha of the glow over that floor. The difference of the two frames is the light
 * the pass put there, which is the alpha times the colour of the category.
 */
async function addedLuminance(
  page: Page,
  pixels: readonly { x: number; y: number }[],
): Promise<number[]> {
  await setPasses(page, { systems: true });
  const on: number[] = [];
  for (const pixel of pixels) on.push(await luminanceOf(page, pixel.x, pixel.y));
  await setPasses(page, { systems: false });
  const off: number[] = [];
  for (const pixel of pixels) off.push(await luminanceOf(page, pixel.x, pixel.y));
  return on.map((value, index) => value - (off[index] as number));
}

/** The row of pixels through the centre of the sprite of a marker, by pixel index. */
async function rowThrough(
  page: Page,
  point: readonly [number, number, number],
  half: number,
): Promise<number[]> {
  const centre = await centrePixel(page, point);
  return page.evaluate(
    (where) => {
      const map = window.galaxyMap;
      if (map === undefined) return [];
      return Array.from(
        map.debug.readRect(where.x - where.half, where.y, where.half * 2 + 1, 1),
      );
    },
    { x: centre.x, y: centre.y, half },
  );
}

/** The whole frame as a PNG data URL, without the label overlay. */
async function frameOf(page: Page): Promise<string> {
  return page.evaluate(() => {
    const canvas = document.getElementById('map');
    if (!(canvas instanceof HTMLCanvasElement)) return '';
    return canvas.toDataURL('image/png');
  });
}

/** How many pixels of a row differ between two readings. */
function differingPixels(first: number[], second: number[]): number {
  let count = 0;
  for (let index = 0; index < first.length; index += 4) {
    for (let channel = 0; channel < 3; channel += 1) {
      if (first[index + channel] !== second[index + channel]) {
        count += 1;
        break;
      }
    }
  }
  return count;
}

/** Reads a shader source file from the tree. */
function shaderSource(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../src/render/shaders/${name}`, import.meta.url)),
    'utf8',
  );
}

test('the marker shaders compile', async ({ page }) => {
  await openMap(page);
  const error = await page.evaluate(
    (sources) => {
      const map = window.galaxyMap;
      if (map === undefined) return 'the page has no handle';
      return map.debug.compileTestProgram(sources.vertex, sources.fragment);
    },
    { vertex: shaderSource('systems.vert'), fragment: shaderSource('systems.frag') },
  );
  expect(error).toBeNull();
});

test('a marker shows at every zoom distance', async ({ page }) => {
  const where: [number, number, number] = [0, 0, 6000];
  await openMap(page, '#c=0,0,6000&d=500&p=35&y=0');
  // The range is above the default so that the 120,000 light year view reads the zoom
  // limit and not the range cut: at that zoom the camera stands 146,600 light years from
  // the cursor, which is past the default range of 120,000.
  await addCategories(page, [
    { name: 'Empire', color: [153, 230, 255], maxDrawRange: 200000 },
  ]);
  await addSystems(page, [record('One', where, 'Empire')]);

  for (const distance of [10, 500, 4000, 20000, 120000]) {
    await setView(page, where, distance);
    await setPasses(page, { systems: true });
    const withMarker = await pixelAt(page, where);
    await setPasses(page, { systems: false });
    const withoutMarker = await pixelAt(page, where);
    console.log('a marker at', distance, withMarker, withoutMarker);
    expect(withMarker).not.toEqual(withoutMarker);
  }
});

test('the size falls to the floor and rises to the cap', async ({ page }) => {
  const where: [number, number, number] = [0, 0, 0];
  await openMap(page, '#c=0,0,0&d=500&p=35&y=0');
  // The disc style, because the reading is the width of the disc itself. The range is
  // above the default because the system sits at the cursor, so at a zoom of 120,000
  // light years its camera range is 120,000 exactly, on the boundary of the default cut.
  await addCategories(page, [
    {
      name: 'Empire',
      color: [153, 230, 255],
      markerStyle: 'disc',
      maxDrawRange: 200000,
    },
  ]);
  await addSystems(page, [record('One', where, 'Empire')]);

  const countAt = async (distance: number): Promise<number> => {
    await setView(page, where, distance);
    await setPasses(page, { systems: true });
    const withMarker = await rowAt(page, where, 20);
    await setPasses(page, { systems: false });
    const withoutMarker = await rowAt(page, where, 20);
    return differingPixels(withMarker, withoutMarker);
  };

  // The floor of 7: the curve holds it from 10,000 light years of range out.
  const floor = await countAt(120000);
  // The plateau of 12: the curve holds it from 50 to 1,000 light years of range.
  const plateau = await countAt(500);
  // The cap of 16: the curve reaches it at 10 light years of range, which is the
  // closest zoom, so the camera goes onto the system.
  const cap = await countAt(10);
  console.log('the marker size', { floor, plateau, cap });

  expect(Math.abs(floor - 7)).toBeLessThanOrEqual(1);
  expect(Math.abs(plateau - 12)).toBeLessThanOrEqual(1);
  expect(Math.abs(cap - 16)).toBeLessThanOrEqual(1);
});

// The old rule read `focalCss`, which follows the viewport height, so one system at one
// range drew 9.35 CSS pixels in a 1,080 row canvas and 7 in a 400 row one. The curve
// reads the range alone, so the two counts now agree.
test('the size does not follow the viewport height', async ({ page }) => {
  const where: [number, number, number] = [0, 0, 0];
  await page.setViewportSize({ width: 1280, height: 1080 });
  await openMap(page, '#c=0,0,0&d=4000&p=35&y=0');
  await addCategories(page, [
    {
      name: 'Empire',
      color: [153, 230, 255],
      markerStyle: 'disc',
      maxDrawRange: 200000,
    },
  ]);
  await addSystems(page, [record('One', where, 'Empire')]);

  const countAt = async (): Promise<number> => {
    await setView(page, where, 4000);
    await setPasses(page, { systems: true });
    const withMarker = await rowAt(page, where, 20);
    await setPasses(page, { systems: false });
    const withoutMarker = await rowAt(page, where, 20);
    return differingPixels(withMarker, withoutMarker);
  };

  const tall = await countAt();
  await page.setViewportSize({ width: 1280, height: 400 });
  await drawFrame(page);
  const short = await countAt();
  console.log('the size at two viewports', { tall, short });

  expect(Math.abs(tall - short)).toBeLessThanOrEqual(1);
  expect(Math.abs(tall - 9)).toBeLessThanOrEqual(1);
  expect(Math.abs(short - 9)).toBeLessThanOrEqual(1);
});

test('the marker colours reach the frame over both grounds', async ({ page }) => {
  await openMap(page, '#c=15,-35,25895&d=4000&p=35&y=0');
  // The disc style, because the reading is the ring, and a glow has no ring.
  await addCategories(page, [{ name: 'Empire', color: CORE, markerStyle: 'disc' }]);
  await addSystems(page, [
    record('Centre', CENTRE, 'Empire'),
    record('Rim', RIM_ABOVE, 'Empire'),
  ]);

  for (const where of [CENTRE, RIM_ABOVE]) {
    // A range of 4,000 light years puts the disc at 8.99 CSS pixels, so its radius is
    // 4.49: the core holds the middle pixel and the ring holds the pixel 3 pixels out.
    await setView(page, where, 4000);
    const middle = await pixelAt(page, where);
    const ring = await ringPixelAt(page, where, 4.4948);
    console.log('the marker colours', where, middle, ring);

    for (let channel = 0; channel < 3; channel += 1) {
      expect(
        Math.abs((middle[channel] as number) - (CORE[channel] as number)),
      ).toBeLessThanOrEqual(2);
      expect(
        Math.abs((ring[channel] as number) - (RING[channel] as number)),
      ).toBeLessThanOrEqual(2);
    }
  }
});

test('the colour follows the category and not the position', async ({ page }) => {
  await openMap(page, '#c=0,0,0&d=4000&p=35&y=0');
  await addCategories(page, [{ name: 'Empire', color: CORE }]);
  await addSystems(page, [
    record('Sol', [0, 0, 0], 'Empire'),
    record('Centre', CENTRE, 'Empire'),
  ]);

  await setView(page, [0, 0, 0], 4000);
  const sol = await pixelAt(page, [0, 0, 0]);
  await setView(page, CENTRE, 4000);
  const centre = await pixelAt(page, CENTRE);
  console.log('one category', { sol, centre });
  expect(sol.slice(0, 3)).toEqual(centre.slice(0, 3));

  await addCategories(page, [{ name: 'Alliance', color: [255, 40, 40] }]);
  await addSystems(page, [record('Sol', [0, 0, 0], 'Alliance')]);
  await setView(page, [0, 0, 0], 4000);
  const solAgain = await pixelAt(page, [0, 0, 0]);
  await setView(page, CENTRE, 4000);
  const centreAgain = await pixelAt(page, CENTRE);
  console.log('two categories', { solAgain, centreAgain });

  for (let channel = 0; channel < 3; channel += 1) {
    const wanted = [255, 40, 40][channel] as number;
    expect(Math.abs((solAgain[channel] as number) - wanted)).toBeLessThanOrEqual(2);
    expect(
      Math.abs((centreAgain[channel] as number) - (CORE[channel] as number)),
    ).toBeLessThanOrEqual(2);
  }
});

test('a recoloured category recolours its markers', async ({ page }) => {
  await openMap(page, '#c=0,0,0&d=4000&p=35&y=0');
  await addCategories(page, [{ name: 'Empire', color: CORE }]);
  await addSystems(page, [record('Sol', [0, 0, 0], 'Empire')]);
  await setView(page, [0, 0, 0], 4000);
  const first = await pixelAt(page, [0, 0, 0]);

  const report = await addCategories(page, [{ name: 'Empire', color: [255, 40, 40] }]);
  expect(report.replaced).toBe(1);
  await drawFrame(page);
  const second = await pixelAt(page, [0, 0, 0]);
  const count = await page.evaluate(() => window.galaxyMap?.systemCount() ?? -1);
  console.log('the recolour', { first, second, count });

  expect(count).toBe(1);
  for (let channel = 0; channel < 3; channel += 1) {
    expect(
      Math.abs((first[channel] as number) - (CORE[channel] as number)),
    ).toBeLessThanOrEqual(2);
    const wanted = [255, 40, 40][channel] as number;
    expect(Math.abs((second[channel] as number) - wanted)).toBeLessThanOrEqual(2);
  }
});

test('the page reports the marker count', async ({ page }) => {
  await openMap(page, '#c=0,0,0&d=4000&p=35&y=0');
  const readCount = async (): Promise<number> =>
    page.evaluate(() => window.galaxyMap?.debug.systemMarkerCount() ?? -1);

  await drawFrame(page);
  const empty = await readCount();

  await addCategories(page, [{ name: 'Empire', color: CORE }]);
  const records: SystemRecordInput[] = [];
  for (let index = 0; index < 100; index += 1) {
    records.push(record(`S${index}`, [index * 4 - 200, 0, 0], 'Empire'));
  }
  await addSystems(page, records);
  await drawFrame(page);
  const loaded = await readCount();

  await setPasses(page, { systems: false });
  const off = await readCount();
  console.log('the marker count', { empty, loaded, off });

  expect(empty).toBe(0);
  expect(loaded).toBe(100);
  expect(off).toBe(0);
});

test('the switch removes the markers', async ({ page }) => {
  await openMap(page, '#c=0,0,0&d=4000&p=35&y=0');
  await drawFrame(page);
  const emptySet = await frameOf(page);

  await addCategories(page, [{ name: 'Empire', color: CORE }]);
  const records: SystemRecordInput[] = [];
  for (let index = 0; index < 100; index += 1) {
    records.push(record(`S${index}`, [index * 4 - 200, 0, 0], 'Empire'));
  }
  await addSystems(page, records);
  await drawFrame(page);
  const withMarkers = await frameOf(page);

  await setPasses(page, { systems: false });
  const withoutMarkers = await frameOf(page);

  expect(withMarkers).not.toBe(emptySet);
  expect(withoutMarkers).toBe(emptySet);
});

// The marker pass alone, with no system in the set. `e2e/look.spec.ts` switches the
// stars, the regions and the markers off together, so it cannot show which of the three
// left the far view alone. The baseline half of the scenario is the reading
// "the default view matches the baseline image", which draws this same frame.
test('the far view does not change', async ({ page }) => {
  await openMap(page);
  await drawFrame(page);
  const withMarkers = await frameOf(page);

  await setPasses(page, { systems: false });
  const withoutMarkers = await frameOf(page);

  const count = await page.evaluate(
    () => window.__galaxyMap?.systemMarkerCount?.() ?? -1,
  );
  expect(count).toBe(0);
  expect(withMarkers.length).toBeGreaterThan(0);
  expect(withMarkers).toBe(withoutMarkers);
});

test('two markers overlap in the order the set holds them', async ({ page }) => {
  await openMap(page, '#c=0,0,0&d=500&p=35&y=0');
  // Both categories take the disc style, because the reading is a pixel 1.25 CSS pixels
  // from a marker centre. A disc is opaque that far inside its edge; a glow is not, so
  // under the default style the pixel would hold a blend of the two colours.
  await addCategories(page, [
    { name: 'Empire', color: [0, 180, 255], markerStyle: 'disc' },
    { name: 'Alliance', color: [255, 40, 40], markerStyle: 'disc' },
  ]);
  const first = record('One', [0, 0, 0], 'Empire');
  const second = record('Two', [1, 0, 0], 'Alliance');

  // The two discs are 12 CSS pixels wide and their centres are 1.25 pixels apart, so
  // each centre lies under both discs. The pixel at the second position therefore holds
  // the colour of whichever record the set holds last.
  await addSystems(page, [first, second]);
  await drawFrame(page);
  const oneFirst = await frameOf(page);
  const alliance = await pixelAt(page, [1, 0, 0]);

  await page.evaluate(() => {
    window.galaxyMap?.clearSystems();
  });
  await addSystems(page, [second, first]);
  await drawFrame(page);
  const twoFirst = await frameOf(page);
  const empire = await pixelAt(page, [1, 0, 0]);
  console.log('the overlap', { alliance, empire });

  expect(oneFirst.length).toBeGreaterThan(0);
  expect(oneFirst).not.toBe(twoFirst);
  // The record the set holds last draws last and stands on top.
  for (let channel = 0; channel < 3; channel += 1) {
    const red = [255, 40, 40][channel] as number;
    const blue = [0, 180, 255][channel] as number;
    expect(Math.abs((alliance[channel] as number) - red)).toBeLessThanOrEqual(2);
    expect(Math.abs((empire[channel] as number) - blue)).toBeLessThanOrEqual(2);
  }
});

test('a region boundary does not cover a marker', async ({ page }) => {
  await openMap(page);
  // A vertex of the boundary set is a point on a boundary. The overlay draws in full
  // at 20,000 light years, so the ribbon runs through the marker's own pixel.
  const point = await page.evaluate(() => {
    const positions = window.galaxyMap?.debug.regionLinePositions();
    if (positions === undefined || positions.length < 3) return null;
    return [positions[0] as number, 0, positions[2] as number] as [
      number,
      number,
      number,
    ];
  });
  expect(point).not.toBeNull();
  const where = point as [number, number, number];

  await addCategories(page, [{ name: 'Empire', color: CORE }]);
  await addSystems(page, [record('Boundary', where, 'Empire')]);
  await setView(page, where, 20000);
  const pixel = await pixelAt(page, where);
  console.log('the marker over a boundary', pixel);

  for (let channel = 0; channel < 3; channel += 1) {
    expect(
      Math.abs((pixel[channel] as number) - (CORE[channel] as number)),
    ).toBeLessThanOrEqual(2);
  }
});

test('the handle works before the first frame', async ({ page }) => {
  await page.goto('./#c=0,0,0&d=4000&p=35&y=0');
  await page.waitForFunction(() => window.galaxyMap !== undefined, undefined, {
    timeout: 20000,
  });
  // This test navigates by itself, so it takes the start state the helper gives.
  await startState(page);
  const early = await page.evaluate(() => {
    const map = window.galaxyMap;
    if (map === undefined) return { ready: true, count: -1 };
    // The page loads the demo set in the background, and it can land between the clear
    // above and this call. The reading below is of one record, so the clear runs again
    // in the same turn as the two calls it belongs to.
    map.clearSystemsAndCategories();
    map.addCategories([{ name: 'Empire', color: [153, 230, 255] }]);
    map.addSystems([
      { name: 'Sol', coords: { x: 0, y: 0, z: 0 }, primaryCategory: 'Empire' },
    ]);
    return { ready: window.__galaxyMap?.ready === true, count: map.systemCount() };
  });
  expect(early.ready).toBe(false);
  expect(early.count).toBe(1);

  await waitForReady(page);
  const pixel = await pixelAt(page, [0, 0, 0]);
  console.log('the first frame', pixel);
  for (let channel = 0; channel < 3; channel += 1) {
    expect(
      Math.abs((pixel[channel] as number) - (CORE[channel] as number)),
    ).toBeLessThanOrEqual(2);
  }
});

test('the handle empties the set', async ({ page }) => {
  await openMap(page);
  await addCategories(page, [{ name: 'Empire', color: CORE }]);
  const records: SystemRecordInput[] = [];
  for (let index = 0; index < 100; index += 1) {
    records.push(record(`S${index}`, [index * 4 - 200, 0, 0], 'Empire'));
  }
  await addSystems(page, records);
  const loaded = await page.evaluate(() => window.galaxyMap?.systemCount() ?? -1);
  const cleared = await page.evaluate(() => {
    window.galaxyMap?.clearSystems();
    return window.galaxyMap?.systemCount() ?? -1;
  });

  expect(loaded).toBe(100);
  expect(cleared).toBe(0);
});

test('the handle empties the set and the table together', async ({ page }) => {
  await openMap(page);
  await addCategories(page, [
    { name: 'Empire', color: [0, 180, 255] },
    { name: 'Alliance', color: [0, 255, 120] },
  ]);
  const records: SystemRecordInput[] = [];
  for (let index = 0; index < 100; index += 1) {
    records.push(record(`S${index}`, [index * 4 - 200, 0, 0], 'Empire'));
  }
  await addSystems(page, records);

  const count = await page.evaluate(() => {
    window.galaxyMap?.clearSystemsAndCategories();
    return window.galaxyMap?.systemCount() ?? -1;
  });
  expect(count).toBe(0);

  const tooEarly = await addSystems(page, [record('Sol', [0, 0, 0], 'Empire')]);
  expect(tooEarly.added).toBe(0);
  expect(tooEarly.rejected[0]?.reason).toBe('unknown-category');

  await addCategories(page, [{ name: 'Empire', color: [0, 180, 255] }]);
  const again = await addSystems(page, [record('Sol', [0, 0, 0], 'Empire')]);
  expect(again.added).toBe(1);
});

test('the page writes the fragment from the handle', async ({ page }) => {
  await openMap(page);
  await page.evaluate(() => {
    window.galaxyMap?.setView({ cursor: [1000, 0, 2000], distance: 30000 });
  });
  await page.waitForFunction(
    () => window.location.hash.includes('c=1000,0,2000'),
    undefined,
    {
      timeout: 5000,
    },
  );
  const hash = await page.evaluate(() => window.location.hash);
  console.log('the fragment', hash);
  expect(hash).toContain('c=1000,0,2000');
  expect(hash).toContain('d=30000');
});

test('the library makes its own label host', async ({ page }) => {
  await openMap(page);
  const result = await page.evaluate(async () => {
    // The page's own map goes first, so the two do not share the canvas or the loop.
    window.galaxyMap?.dispose();
    const host = document.createElement('div');
    host.style.position = 'absolute';
    host.style.inset = '0';
    document.body.appendChild(host);
    const canvas = document.createElement('canvas');
    canvas.style.display = 'block';
    canvas.style.width = '640px';
    canvas.style.height = '480px';
    host.appendChild(canvas);

    const factory = window.galaxyMapFactory;
    if (factory === undefined) return { children: -1, labels: -1 };
    const map = factory(canvas);
    await map.ready;
    // The region labels fade out above 20,000 light years, so the reading needs a view
    // inside that band.
    map.setView({ distance: 15000 });
    map.debug.drawNow();
    const labels = host.querySelectorAll('.region-label');
    return { children: host.children.length, labels: labels.length };
  });
  console.log('the library label host', result);

  // The canvas and the host the library made.
  expect(result.children).toBe(2);
  expect(result.labels).toBeGreaterThan(0);
});

test.describe('the loading picture', () => {
  /**
   * Builds a map over a canvas of its own and reads the canvas's parent before and
   * after `ready` settles. `options` reaches the entry point as it is.
   */
  async function readLoadingImage(
    page: Page,
    options: Record<string, unknown>,
    breakContext = false,
  ): Promise<{
    before: number;
    after: number;
    source: string;
    failed: string;
    canvas: { x: number; y: number };
    picture: { x: number; y: number };
    size: { width: number; height: number };
  }> {
    return page.evaluate(
      async (build) => {
        // The page's own map goes first, so the two do not share the loop.
        window.galaxyMap?.dispose();
        const wrap = document.createElement('div');
        wrap.style.cssText = 'position: absolute; inset: 0;';
        const canvas = document.createElement('canvas');
        canvas.style.cssText = 'display: block; width: 1280px; height: 720px;';
        wrap.appendChild(canvas);
        document.body.appendChild(wrap);
        // A canvas that already holds a 2D context gives no WebGL2 context, so the
        // start fails as it does on a card that refuses the map.
        if (build.breakContext) canvas.getContext('2d');

        const factory = window.galaxyMapFactory;
        if (factory === undefined) throw new Error('The page has no map factory.');
        const map = factory(canvas, build.options as never);
        const image = wrap.querySelector('img');
        const before = wrap.querySelectorAll('img').length;
        const source = image?.src ?? '';
        // The picture gets its size from its own file, so the file must arrive before
        // the box is measured.
        if (image !== null && !image.complete) {
          await new Promise<void>((resolve) => {
            image.addEventListener('load', () => resolve(), { once: true });
            image.addEventListener('error', () => resolve(), { once: true });
          });
        }
        // One frame, so the browser has laid the picture out before it is measured.
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        const canvasBox = canvas.getBoundingClientRect();
        const pictureBox = image?.getBoundingClientRect() ?? canvasBox;

        let failed = '';
        try {
          await map.ready;
        } catch (error) {
          failed = error instanceof Error ? error.message : String(error);
        }
        const after = wrap.querySelectorAll('img').length;
        map.dispose();
        wrap.remove();
        return {
          before,
          after,
          source,
          failed,
          canvas: {
            x: canvasBox.left + canvasBox.width / 2,
            y: canvasBox.top + canvasBox.height / 2,
          },
          picture: {
            x: pictureBox.left + pictureBox.width / 2,
            y: pictureBox.top + pictureBox.height / 2,
          },
          size: { width: pictureBox.width, height: pictureBox.height },
        };
      },
      { options, breakContext },
    );
  }

  test('the picture shows and then goes', async ({ page }) => {
    await openMap(page);
    const reading = await readLoadingImage(page, { loadingImage: './EDLoader1.svg' });
    console.log('the loading picture', reading);

    expect(reading.before).toBe(1);
    expect(reading.source.endsWith('/EDLoader1.svg')).toBe(true);
    expect(reading.after).toBe(0);
    expect(reading.failed).toBe('');
  });

  test('the picture sits in the centre of the canvas', async ({ page }) => {
    await openMap(page);
    const reading = await readLoadingImage(page, { loadingImage: './EDLoader1.svg' });
    console.log('the two centres', {
      canvas: reading.canvas,
      picture: reading.picture,
    });

    expect(Math.abs(reading.picture.x - reading.canvas.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(reading.picture.y - reading.canvas.y)).toBeLessThanOrEqual(1);
  });

  test('the picture keeps the size its file names', async ({ page }) => {
    await openMap(page);
    const wide = await readLoadingImage(page, { loadingImage: './EDLoader1.svg' });
    await page.setViewportSize({ width: 700, height: 500 });
    const narrow = await readLoadingImage(page, { loadingImage: './EDLoader1.svg' });
    console.log('the picture size', { wide: wide.size, narrow: narrow.size });

    // `EDLoader1.svg` names 170 by 170. The library sets no size, so the picture
    // measures that in both windows and does not follow the window.
    expect(wide.size.width).toBe(170);
    expect(wide.size.height).toBe(170);
    expect(narrow.size.width).toBe(170);
    expect(narrow.size.height).toBe(170);
  });

  test('a failed start still removes the picture', async ({ page }) => {
    await openMap(page);
    const reading = await readLoadingImage(
      page,
      { loadingImage: './EDLoader1.svg' },
      true,
    );
    console.log('the picture after a failed start', reading);

    expect(reading.before).toBe(1);
    expect(reading.after).toBe(0);
    expect(reading.failed.length).toBeGreaterThan(0);
  });

  test('an unsafe URL adds no element', async ({ page }) => {
    await openMap(page);
    const reading = await readLoadingImage(page, {
      loadingImage: 'javascript:alert(1)',
    });
    console.log('the picture of an unsafe URL', reading);

    expect(reading.before).toBe(0);
    expect(reading.after).toBe(0);
  });

  test('no option adds no element', async ({ page }) => {
    await openMap(page);
    const reading = await readLoadingImage(page, {});
    console.log('the picture with no option', reading);

    expect(reading.before).toBe(0);
    expect(reading.after).toBe(0);
  });
});

test('dispose stops the map and repeats safely', async ({ page }) => {
  await openMap(page);
  const result = await page.evaluate(async () => {
    const map = window.galaxyMap;
    if (map === undefined) return { before: -1, after: -2, threw: true };
    const before = map.debug.frameStats().frames;
    map.dispose();
    for (let index = 0; index < 10; index += 1) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
    const after = map.debug.frameStats().frames;
    let threw = false;
    try {
      map.dispose();
    } catch {
      threw = true;
    }
    return { before, after, threw };
  });
  console.log('dispose', result);

  expect(result.before).toBeGreaterThan(0);
  expect(result.after).toBe(result.before);
  expect(result.threw).toBe(false);
});

test.describe('the category table through the handle', () => {
  test('reads and keeps a category, and replaces one under the same name', async ({
    page,
  }) => {
    await openMap(page);
    const first = await addCategories(page, [
      { name: 'Empire', color: [0, 180, 255], description: 'The Empire' },
      { name: 'Alliance', color: [0, 255, 120] },
    ]);
    expect(first.added).toBe(2);
    expect(first.rejected).toHaveLength(0);

    const second = await addCategories(page, [
      { name: 'Empire', color: [255, 40, 40] },
    ]);
    expect(second.added).toBe(0);
    expect(second.replaced).toBe(1);
  });

  test('gives each category fault its own reason', async ({ page }) => {
    await openMap(page);
    const report = await addCategories(page, [
      { name: 'Empire', color: [0, 180, 255] },
      { name: '', color: [0, 180, 255] },
      { name: 'Two', color: [0, 180] },
      { name: 'Three', color: [0, Number.NaN, 255] },
    ]);
    expect(report.added).toBe(1);
    expect(report.rejected).toEqual([
      { index: 1, reason: 'no-name' },
      { index: 2, reason: 'bad-color' },
      { index: 3, reason: 'bad-color' },
    ]);
  });

  test('rejects the excess over the table bound', async ({ page }) => {
    await openMap(page);
    const full: Record<string, unknown>[] = [];
    for (let index = 0; index < 256; index += 1) {
      full.push({ name: `C${index}`, color: [1, 2, 3] });
    }
    const first = await addCategories(page, full);
    expect(first.added).toBe(256);

    const second = await addCategories(page, [
      { name: 'New1', color: [1, 2, 3] },
      { name: 'New2', color: [1, 2, 3] },
      { name: 'C7', color: [9, 9, 9] },
    ]);
    expect(second.replaced).toBe(1);
    expect(second.rejected).toEqual([
      { index: 0, reason: 'over-capacity' },
      { index: 1, reason: 'over-capacity' },
    ]);

    await page.evaluate(() => {
      window.galaxyMap?.clearSystemsAndCategories();
    });
    const third = await addCategories(page, full);
    expect(third.added).toBe(256);
    expect(third.rejected).toHaveLength(0);
  });

  test('keeps the index of a replaced category and drops a wrongly typed description', async ({
    page,
  }) => {
    await openMap(page, '#c=0,0,0&d=4000&p=35&y=0');
    await addCategories(page, [
      { name: 'A', color: [10, 10, 10] },
      { name: 'B', color: [153, 230, 255] },
      { name: 'C', color: [20, 20, 20] },
    ]);
    await addSystems(page, [record('Sol', [0, 0, 0], 'B')]);
    await setView(page, [0, 0, 0], 4000);
    const before = await pixelAt(page, [0, 0, 0]);

    await addCategories(page, [{ name: 'B', color: [255, 40, 40], description: 7 }]);
    await drawFrame(page);
    const after = await pixelAt(page, [0, 0, 0]);
    console.log('the replaced category', { before, after });

    for (let channel = 0; channel < 3; channel += 1) {
      expect(
        Math.abs((before[channel] as number) - (CORE[channel] as number)),
      ).toBeLessThanOrEqual(2);
      const wanted = [255, 40, 40][channel] as number;
      expect(Math.abs((after[channel] as number) - wanted)).toBeLessThanOrEqual(2);
    }
  });
});

test.describe('a page the card refuses', () => {
  test.use({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });

  test('shows the failure', async ({ page }) => {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function patched(
        this: HTMLCanvasElement,
        id: string,
        ...rest: unknown[]
      ) {
        if (id === 'webgl2') return null;
        return (original as (...args: unknown[]) => unknown).call(this, id, ...rest);
      } as typeof HTMLCanvasElement.prototype.getContext;
    });
    await page.goto('./');
    await page.waitForFunction(
      () => typeof window.__galaxyMap?.error === 'string',
      undefined,
      { timeout: 20000 },
    );
    // This test navigates by itself, so it takes the start state the helper gives. The
    // card refused the map, so the set is empty either way.
    await startState(page);

    const error = await page.evaluate(() => window.__galaxyMap?.error ?? '');
    const message = await page.locator('#message').textContent();
    console.log('the refused page', { error, message });

    expect(error).toContain('WebGL2');
    expect(message).toContain('WebGL2');
  });
});

// The glow readings sample the sprite by pixel index, so the sprite centre has to sit on
// a pixel centre. A viewport of an odd width and an odd height puts the middle of the
// screen at 640.5 by 360.5, which is the centre of one pixel. At an even size the middle
// falls on a pixel corner and every sample lies half a pixel off the spike it reads.
test.describe('the glow', () => {
  test.use({ viewport: { width: 1281, height: 721 }, deviceScaleFactor: 1 });

  /**
   * The view that puts one marker at the cap size over dark space. The cap is a range of
   * 10 light years or less, so the camera goes onto the system at the closest zoom.
   */
  const openGlow = async (
    page: Page,
    categories: readonly unknown[],
    records: readonly unknown[],
  ): Promise<void> => {
    await openMap(page, '#c=40015,20000,25895&d=10&p=35&y=0');
    // The marker pass alone. The frame 20,000 light years above the plane still carries
    // about 11 of 255 from the volume and the glow pass, and every reading here is the
    // alpha of the glow itself, so the other passes go.
    await setPasses(page, {
      volume: false,
      clouds: false,
      points: false,
      stars: false,
      glow: false,
      regions: false,
      systems: true,
    });
    await addCategories(page, categories);
    await addSystems(page, records);
    await setView(page, DARK_SPACE, 10);
  };

  test('holds the category colour at its centre', async ({ page }) => {
    await openGlow(
      page,
      [{ name: 'Empire', color: CORE }],
      [record('One', DARK_SPACE, 'Empire')],
    );
    const centre = await centrePixel(page, DARK_SPACE);
    const middle = await pixelOf(page, centre.x, centre.y);
    console.log('the glow centre', middle);
    for (let channel = 0; channel < 3; channel += 1) {
      expect(
        Math.abs((middle[channel] as number) - (CORE[channel] as number)),
      ).toBeLessThanOrEqual(2);
    }
  });

  test('has spikes', async ({ page }) => {
    await openGlow(
      page,
      [{ name: 'Empire', color: WHITE }],
      [record('One', DARK_SPACE, 'Empire')],
    );
    // The sprite is 40 CSS pixels across at the cap, so its radius is 20. The sample is
    // the pixel 8 from the centre on each axis.
    const centre = await centrePixel(page, DARK_SPACE);
    // Six pixels out on each axis is 8.49 from the centre, which is the same radius on
    // the 45 degree diagonal. The fourth reading is 50 pixels out, well past the sprite.
    const [horizontal, vertical, diagonal, ground] = await addedLuminance(page, [
      { x: centre.x + 8, y: centre.y },
      { x: centre.x, y: centre.y + 8 },
      { x: centre.x + 6, y: centre.y + 6 },
      { x: centre.x + 50, y: centre.y },
    ]);
    console.log('the spikes', { horizontal, vertical, diagonal, ground });

    expect(ground).toBe(0);
    expect((horizontal as number) - (diagonal as number)).toBeGreaterThan(0.1);
    expect((vertical as number) - (diagonal as number)).toBeGreaterThan(0.1);
  });

  test('has no ring', async ({ page }) => {
    await openGlow(
      page,
      [{ name: 'Empire', color: WHITE }],
      [record('One', DARK_SPACE, 'Empire')],
    );
    const centre = await centrePixel(page, DARK_SPACE);
    // Fourteen pixels out on each axis is 19.8 from the centre, which is the last sample
    // inside a sprite of the radius 20.
    const pixels: { x: number; y: number }[] = [];
    for (let step = 0; step <= 14; step += 1) {
      pixels.push({ x: centre.x + step, y: centre.y + step });
    }
    const readings = await addedLuminance(page, pixels);
    console.log('the diagonal', readings.map((value) => value.toFixed(4)).join(' '));

    expect(readings[0]).toBeGreaterThan(0.9);
    for (let step = 1; step < readings.length; step += 1) {
      expect(readings[step]).toBeLessThanOrEqual(readings[step - 1] as number);
    }
    expect(readings[readings.length - 1]).toBeLessThan(0.02);
  });

  test('is 2.5 times the disc', async ({ page }) => {
    // Both systems sit 10 light years from the camera, which is the cap. At that range
    // one light year covers about 62 CSS pixels, so 1.5 light years each side of the
    // view axis puts the two sprites well apart.
    const glowAt = atRange(DARK_SPACE, 10, 10, -1.5);
    const discAt = atRange(DARK_SPACE, 10, 10, 1.5);
    await openGlow(
      page,
      [
        { name: 'Glow', color: WHITE },
        { name: 'Disc', color: WHITE, markerStyle: 'disc' },
      ],
      [record('G', glowAt, 'Glow'), record('D', discAt, 'Disc')],
    );

    await setPasses(page, { systems: true });
    const glowOn = await rowThrough(page, glowAt, 30);
    const discOn = await rowThrough(page, discAt, 30);
    await setPasses(page, { systems: false });
    const glowOff = await rowThrough(page, glowAt, 30);
    const discOff = await rowThrough(page, discAt, 30);

    const glow = differingPixels(glowOn, glowOff);
    const disc = differingPixels(discOn, discOff);
    console.log('the row widths', { glow, disc, ratio: glow / disc });

    expect(disc).toBeGreaterThan(0);
    expect(glow / disc).toBeGreaterThanOrEqual(2);
    expect(glow / disc).toBeLessThanOrEqual(2.7);
  });

  test('replaces the disc when a category is restyled', async ({ page }) => {
    await openGlow(
      page,
      [{ name: 'Empire', color: WHITE, markerStyle: 'disc' }],
      [record('One', DARK_SPACE, 'Empire')],
    );

    const centre = await centrePixel(page, DARK_SPACE);
    await setPasses(page, { systems: true });
    const discOn = await rowThrough(page, DARK_SPACE, 30);
    const discMiddle = await pixelOf(page, centre.x, centre.y);
    await setPasses(page, { systems: false });
    const off = await rowThrough(page, DARK_SPACE, 30);
    const disc = differingPixels(discOn, off);

    const report = await addCategories(page, [{ name: 'Empire', color: WHITE }]);
    expect(report.replaced).toBe(1);
    await setPasses(page, { systems: true });
    const glowOn = await rowThrough(page, DARK_SPACE, 30);
    const glowMiddle = await pixelOf(page, centre.x, centre.y);
    const glow = differingPixels(glowOn, off);
    const count = await page.evaluate(() => window.galaxyMap?.systemCount() ?? -1);
    console.log('the restyle', { disc, glow, ratio: glow / disc, count });

    expect(count).toBe(1);
    expect(discMiddle.slice(0, 3)).toEqual(WHITE);
    expect(glowMiddle.slice(0, 3)).toEqual(WHITE);
    expect(glow / disc).toBeGreaterThanOrEqual(2);
    expect(glow / disc).toBeLessThanOrEqual(2.7);
  });
});

test('a marker outside its range does not draw', async ({ page }) => {
  const where: [number, number, number] = [0, 0, 0];
  await openMap(page, '#c=0,0,0&d=1500&p=35&y=0');
  await addCategories(page, [{ name: 'Empire', color: CORE, maxDrawRange: 2000 }]);
  await addSystems(page, [record('Sol', where, 'Empire')]);

  const readings: Record<string, [number, number, number, number][]> = {};
  for (const distance of [1500, 2500]) {
    await setView(page, where, distance);
    await setPasses(page, { systems: true });
    const on = await pixelAt(page, where);
    await setPasses(page, { systems: false });
    const off = await pixelAt(page, where);
    readings[String(distance)] = [on, off];
  }
  console.log('the range cut', readings);

  expect(readings['1500']?.[0]).not.toEqual(readings['1500']?.[1]);
  expect(readings['2500']?.[0]).toEqual(readings['2500']?.[1]);
});

test('the range follows each system and not the zoom', async ({ page }) => {
  const cursor: [number, number, number] = [0, 0, 0];
  const near = atRange(cursor, 1000, 1000);
  const far = atRange(cursor, 1000, 5000, 800);
  await openMap(page, '#c=0,0,0&d=1000&p=35&y=0');
  await addCategories(page, [{ name: 'Empire', color: CORE, maxDrawRange: 3000 }]);
  await addSystems(page, [
    record('Near', near, 'Empire'),
    record('Far', far, 'Empire'),
  ]);
  await setView(page, cursor, 1000);

  await setPasses(page, { systems: true });
  const nearOn = await pixelAt(page, near);
  const farOn = await pixelAt(page, far);
  const count = await page.evaluate(
    () => window.galaxyMap?.debug.systemMarkerCount() ?? -1,
  );
  await setPasses(page, { systems: false });
  const nearOff = await pixelAt(page, near);
  const farOff = await pixelAt(page, far);
  console.log('one frame, two ranges', { nearOn, nearOff, farOn, farOff, count });

  expect(nearOn).not.toEqual(nearOff);
  expect(farOn).toEqual(farOff);
  expect(count).toBe(1);
});

test('the cut does not fade', async ({ page }) => {
  const where: [number, number, number] = [0, 0, 0];
  await openMap(page, '#c=0,0,0&d=1000&p=35&y=0');
  await addCategories(page, [{ name: 'Empire', color: CORE, maxDrawRange: 5000 }]);
  await addSystems(page, [record('Sol', where, 'Empire')]);

  // The system sits at the cursor, so the zoom distance is the camera range and the
  // marker stays at the middle of the screen at every one of the three readings.
  const readings: [number, number, number, number][] = [];
  for (const range of [1000, 3000, 4900]) {
    await setView(page, where, range);
    readings.push(await pixelAt(page, where));
  }
  console.log('the readings up to the cut', readings);

  for (const reading of readings) {
    for (let channel = 0; channel < 3; channel += 1) {
      expect(
        Math.abs((reading[channel] as number) - (CORE[channel] as number)),
      ).toBeLessThanOrEqual(2);
    }
  }
});

test('a changed range changes what draws', async ({ page }) => {
  const cursor: [number, number, number] = [0, 0, 0];
  await openMap(page, '#c=0,0,0&d=1000&p=35&y=0');
  await addCategories(page, [{ name: 'Empire', color: CORE, maxDrawRange: 1000 }]);
  const records: SystemRecordInput[] = [];
  for (let index = 0; index < 100; index += 1) {
    const range = 500 + (index * 4500) / 99;
    records.push(record(`S${index}`, atRange(cursor, 1000, range), 'Empire'));
  }
  expect((await addSystems(page, records)).added).toBe(100);

  await setView(page, cursor, 1000);
  const cut = await page.evaluate(
    () => window.galaxyMap?.debug.systemMarkerCount() ?? -1,
  );

  await addCategories(page, [{ name: 'Empire', color: CORE, maxDrawRange: 120000 }]);
  await drawFrame(page);
  const all = await page.evaluate(
    () => window.galaxyMap?.debug.systemMarkerCount() ?? -1,
  );
  console.log('the changed range', { cut, all });

  expect(cut).toBeGreaterThan(0);
  expect(cut).toBeLessThan(100);
  expect(all).toBe(100);
});

test('two categories cut at their own ranges in one frame', async ({ page }) => {
  const cursor: [number, number, number] = [0, 0, 0];
  const nearRange = atRange(cursor, 1000, 2000, -400);
  const farRange = atRange(cursor, 1000, 2000, 400);
  await openMap(page, '#c=0,0,0&d=1000&p=35&y=0');
  await addCategories(page, [
    { name: 'Short', color: CORE, maxDrawRange: 1000 },
    { name: 'Long', color: CORE, maxDrawRange: 120000 },
  ]);
  await addSystems(page, [
    record('Short', nearRange, 'Short'),
    record('Long', farRange, 'Long'),
  ]);
  await setView(page, cursor, 1000);

  await setPasses(page, { systems: true });
  const shortOn = await pixelAt(page, nearRange);
  const longOn = await pixelAt(page, farRange);
  await setPasses(page, { systems: false });
  const shortOff = await pixelAt(page, nearRange);
  const longOff = await pixelAt(page, farRange);
  console.log('two ranges', { shortOn, shortOff, longOn, longOff });

  expect(shortOn).toEqual(shortOff);
  expect(longOn).not.toEqual(longOff);
});

test.describe('the category switch and the name filter', () => {
  test('a category that is off draws no marker', async ({ page }) => {
    const cursor: [number, number, number] = [0, 0, 0];
    const first = atRange(cursor, 1000, 2000, -400);
    const second = atRange(cursor, 1000, 2000, 400);
    await openMap(page, '#c=0,0,0&d=1000&p=35&y=0');
    await addCategories(page, [
      { name: 'Alpha', color: CORE, maxDrawRange: 120000 },
      { name: 'Beta', color: CORE, maxDrawRange: 120000 },
    ]);
    await addSystems(page, [
      record('First', first, 'Alpha'),
      record('Second', second, 'Beta'),
    ]);
    await setView(page, cursor, 1000);
    const both = await page.evaluate(
      () => window.galaxyMap?.debug.systemMarkerCount() ?? -1,
    );

    await page.evaluate(() => {
      window.galaxyMap?.setCategoryVisible('Alpha', false);
    });
    await drawFrame(page);
    const one = await page.evaluate(
      () => window.galaxyMap?.debug.systemMarkerCount() ?? -1,
    );

    // The first marker's pixel must read as the frame with the whole pass off, and the
    // second must not, so the switch took one marker away and left the other.
    const firstOn = await pixelAt(page, first);
    const secondOn = await pixelAt(page, second);
    await setPasses(page, { systems: false });
    const firstOff = await pixelAt(page, first);
    const secondOff = await pixelAt(page, second);
    console.log('the category switch', { both, one, firstOn, firstOff });

    expect(both).toBe(2);
    expect(one).toBe(1);
    expect(firstOn).toEqual(firstOff);
    expect(secondOn).not.toEqual(secondOff);
  });

  test('a secondary category keeps a marker on the screen', async ({ page }) => {
    const cursor: [number, number, number] = [0, 0, 0];
    const where = atRange(cursor, 1000, 2000);
    await openMap(page, '#c=0,0,0&d=1000&p=35&y=0');
    await addCategories(page, [
      { name: 'Alpha', color: CORE, maxDrawRange: 120000 },
      { name: 'Beta', color: CORE, maxDrawRange: 120000 },
    ]);
    await addSystems(page, [
      { ...record('Both', where, 'Alpha'), secondaryCategories: ['Beta'] },
    ]);
    await setView(page, cursor, 1000);

    /** The marker count and what `systemAt` reads at the marker's pixel. */
    const reading = async (): Promise<{ count: number; name: string | null }> => {
      await drawFrame(page);
      return page.evaluate((point) => {
        const map = window.galaxyMap;
        if (map === undefined) return { count: -1, name: null };
        const screen = map.debug.project(point as [number, number, number]);
        return {
          count: map.debug.systemMarkerCount(),
          name: map.systemAt(screen.x, screen.y)?.name ?? null,
        };
      }, where);
    };

    await page.evaluate(() => {
      window.galaxyMap?.setCategoryVisible('Alpha', false);
    });
    const onBeta = await reading();

    await page.evaluate(() => {
      window.galaxyMap?.setCategoryVisible('Beta', false);
    });
    const offBoth = await reading();
    console.log('the secondary category', { onBeta, offBoth });

    expect(onBeta).toEqual({ count: 1, name: 'Both' });
    expect(offBoth).toEqual({ count: 0, name: null });
  });

  // The marker pass alone over dark space, so the reading is the marker's own colour.
  test('the colour still follows the primary category', async ({ page }) => {
    const red: [number, number, number] = [255, 60, 60];
    const blue: [number, number, number] = [60, 120, 255];
    await openMap(page, '#c=40015,20000,25895&d=10&p=35&y=0');
    await setPasses(page, {
      volume: false,
      clouds: false,
      points: false,
      stars: false,
      glow: false,
      regions: false,
      systems: true,
    });
    await addCategories(page, [
      { name: 'Alpha', color: red, maxDrawRange: 120000 },
      { name: 'Beta', color: blue, maxDrawRange: 120000 },
    ]);
    await addSystems(page, [
      { ...record('Both', DARK_SPACE, 'Beta'), secondaryCategories: ['Alpha'] },
    ]);
    await setView(page, DARK_SPACE, 10);

    // `Beta` is off, so the marker draws through `Alpha` alone. It still takes the
    // colour of its primary category, which is `Beta`.
    await page.evaluate(() => {
      window.galaxyMap?.setCategoryVisible('Beta', false);
    });
    await drawFrame(page);
    const pixel = await pixelAt(page, DARK_SPACE);
    console.log('the marker colour through a secondary category', pixel);

    for (let channel = 0; channel < 3; channel += 1) {
      expect(
        Math.abs((pixel[channel] as number) - (blue[channel] as number)),
      ).toBeLessThanOrEqual(2);
    }
  });

  test('the sweep holds its budget', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=1000&p=35&y=0');
    const names = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    await addCategories(
      page,
      names.map((name) => ({ name, color: CORE, maxDrawRange: 120000 })),
    );
    const added = await page.evaluate((value) => {
      const records = [];
      for (let index = 0; index < 10000; index += 1) {
        records.push({
          name: `S${index}`,
          coords: { x: index * 0.001, y: 0, z: 0 },
          primaryCategory: value[index % 8] as string,
          secondaryCategories: [
            value[(index + 1) % 8] as string,
            value[(index + 2) % 8] as string,
            value[(index + 3) % 8] as string,
          ],
        });
      }
      return window.galaxyMap?.addSystems(records).added ?? -1;
    }, names);
    expect(added).toBe(10000);

    // Every category goes off in turn, and each sweep is read after the frame that
    // asked for it.
    const readings: number[] = [];
    for (const name of names) {
      await page.evaluate((value) => {
        window.galaxyMap?.setCategoryVisible(value, false);
      }, name);
      await drawFrame(page);
      readings.push(
        await page.evaluate(() => window.galaxyMap?.debug.categorySweepMs() ?? -1),
      );
    }
    const count = await page.evaluate(
      () => window.galaxyMap?.debug.systemMarkerCount() ?? -1,
    );
    console.log('the category sweep readings in ms', readings);

    expect(count).toBe(0);
    for (const reading of readings) {
      // The lower bound is 0 and not more than 0. Chromium gives `performance.now()` in
      // steps of 0.1 milliseconds, and a sweep of 10,000 systems runs in about 0.1, so a
      // reading of exactly 0 is a fast sweep and not a missing one. The budget the
      // requirement states is the upper bound.
      expect(reading).toBeGreaterThanOrEqual(0);
      expect(reading).toBeLessThan(2);
    }
  });

  test('the filter cuts the markers and the count', async ({ page }) => {
    const cursor: [number, number, number] = [0, 0, 0];
    await openMap(page, '#c=0,0,0&d=1000&p=35&y=0');
    await addCategories(page, [{ name: 'Alpha', color: CORE, maxDrawRange: 120000 }]);
    await addSystems(page, [
      record('Sol', atRange(cursor, 1000, 2000, -400), 'Alpha'),
      record('Solati', atRange(cursor, 1000, 2000, 0), 'Alpha'),
      record('Achenar', atRange(cursor, 1000, 2000, 400), 'Alpha'),
    ]);
    await setView(page, cursor, 1000);

    const readCount = async (): Promise<number> =>
      page.evaluate(() => window.galaxyMap?.debug.systemMarkerCount() ?? -1);
    const setFilter = async (text: string): Promise<void> => {
      await page.evaluate((value) => {
        window.galaxyMap?.setNameFilter(value);
      }, text);
      await drawFrame(page);
    };

    const all = await readCount();
    await setFilter('sol');
    const some = await readCount();
    const filter = await page.evaluate(() => window.galaxyMap?.getNameFilter() ?? '?');
    await setFilter('');
    const back = await readCount();
    console.log('the name filter', { all, some, back, filter });

    expect(all).toBe(3);
    expect(some).toBe(2);
    expect(back).toBe(3);
    expect(filter).toBe('sol');
  });

  test('the filtered marker leaves the frame it drew in', async ({ page }) => {
    const cursor: [number, number, number] = [0, 0, 0];
    const where = atRange(cursor, 1000, 2000, 0);
    await openMap(page, '#c=0,0,0&d=1000&p=35&y=0');
    await addCategories(page, [{ name: 'Alpha', color: CORE, maxDrawRange: 120000 }]);
    await addSystems(page, [record('Sol', where, 'Alpha')]);
    await setView(page, cursor, 1000);
    const drawn = await pixelAt(page, where);

    await page.evaluate(() => {
      window.galaxyMap?.setNameFilter('zzz');
    });
    await drawFrame(page);
    const hidden = await pixelAt(page, where);
    await setPasses(page, { systems: false });
    const passOff = await pixelAt(page, where);
    console.log('the filtered marker', { drawn, hidden, passOff });

    expect(drawn).not.toEqual(passOff);
    expect(hidden).toEqual(passOff);
  });
});
