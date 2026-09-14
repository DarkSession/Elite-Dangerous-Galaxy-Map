import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openMap, waitForReady } from './helpers';

test.use({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });

/** The galactic centre in game coordinates. */
const CENTRE: [number, number, number] = [15, -35, 25895];
/** 3,000 light years above the plane at the rim, which is the darkest ground. */
const RIM_ABOVE: [number, number, number] = [40015, 3000, 25895];
/** The colour the readings check, and the ring colour the shader carries. */
const CORE: [number, number, number] = [153, 230, 255];
const RING: [number, number, number] = [5, 10, 26];

/** A record the reader accepts. */
function record(
  name: string,
  position: readonly [number, number, number],
  category: string,
): Record<string, unknown> {
  return {
    name,
    coords: { x: position[0], y: position[1], z: position[2] },
    primaryCategory: category,
  };
}

/** Adds categories through the handle and returns the report. */
async function addCategories(
  page: Page,
  categories: readonly unknown[],
): Promise<{
  added: number;
  replaced: number;
  rejected: { index: number; reason: string }[];
}> {
  return page.evaluate((list) => {
    const report = window.galaxyMap?.addCategories(list);
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
    const report = window.galaxyMap?.addSystems(list);
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
 * at the 7 pixel floor is a distance of 1.5 to 2.5 from the centre. Every such pixel
 * is opaque, because the antialiasing ramp covers the outer 1 pixel alone.
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
  await addCategories(page, [{ name: 'Empire', color: [153, 230, 255] }]);
  await addSystems(page, [record('One', where, 'Empire')]);

  for (const distance of [500, 4000, 20000, 120000]) {
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
  await addCategories(page, [{ name: 'Empire', color: [153, 230, 255] }]);
  await addSystems(page, [record('One', where, 'Empire')]);

  const countAt = async (distance: number): Promise<number> => {
    await setView(page, where, distance);
    await setPasses(page, { systems: true });
    const withMarker = await rowAt(page, where, 20);
    await setPasses(page, { systems: false });
    const withoutMarker = await rowAt(page, where, 20);
    return differingPixels(withMarker, withoutMarker);
  };

  // The floor: at 120,000 light years the perspective size is far below one pixel.
  const floor = await countAt(120000);
  // The cap: the 60 degree field of view at 720 rows puts the cap boundary at about
  // 1,040 light years of range, so 500 is well inside it.
  const cap = await countAt(500);
  console.log('the marker size', { floor, cap });

  expect(Math.abs(floor - 7)).toBeLessThanOrEqual(1);
  expect(Math.abs(cap - 12)).toBeLessThanOrEqual(1);
});

test('the marker colours reach the frame over both grounds', async ({ page }) => {
  await openMap(page, '#c=15,-35,25895&d=4000&p=35&y=0');
  await addCategories(page, [{ name: 'Empire', color: CORE }]);
  await addSystems(page, [
    record('Centre', CENTRE, 'Empire'),
    record('Rim', RIM_ABOVE, 'Empire'),
  ]);

  for (const where of [CENTRE, RIM_ABOVE]) {
    // A range of 4,000 light years puts the disc at the 7 CSS pixel floor, so the core
    // holds the middle pixel and the ring holds the pixel 2 pixels out.
    await setView(page, where, 4000);
    const middle = await pixelAt(page, where);
    const ring = await ringPixelAt(page, where, 3.5);
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
  const records: Record<string, unknown>[] = [];
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
  const records: Record<string, unknown>[] = [];
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
  await addCategories(page, [
    { name: 'Empire', color: [0, 180, 255] },
    { name: 'Alliance', color: [255, 40, 40] },
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
  await page.goto('/#c=0,0,0&d=4000&p=35&y=0');
  await page.waitForFunction(() => window.galaxyMap !== undefined, undefined, {
    timeout: 20000,
  });
  const early = await page.evaluate(() => {
    const map = window.galaxyMap;
    if (map === undefined) return { ready: true, count: -1 };
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
  const records: Record<string, unknown>[] = [];
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
  const records: Record<string, unknown>[] = [];
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
    await page.goto('/');
    await page.waitForFunction(
      () => typeof window.__galaxyMap?.error === 'string',
      undefined,
      { timeout: 20000 },
    );

    const error = await page.evaluate(() => window.__galaxyMap?.error ?? '');
    const message = await page.locator('#message').textContent();
    console.log('the refused page', { error, message });

    expect(error).toContain('WebGL2');
    expect(message).toContain('WebGL2');
  });
});
