import { gzipSync } from 'node:zlib';
import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * How many records a full-set test builds, which is the record bound of the set. A test
 * that passes it into `page.evaluate` passes it as an argument, because the page cannot
 * read a variable of the test file.
 *
 * The number is written here and not imported from `MAX_SYSTEMS`. The module that holds
 * that constant imports the marker vectors, and the Playwright runner reads a `.svg`
 * import as an unknown file extension and fails the whole run. `tests/browser-suite.test.ts`
 * reads this file as text and fails when the two numbers differ.
 */
export const FULL_SET = 50000;

/** The event the page sends once it has drawn the scene data for the first time. */
export const READY_EVENT = 'galaxy-map-ready';

/** The galactic centre in game coordinates. */
export const GALACTIC_CENTRE: [number, number, number] = [15, -35, 25895];

/** How many points the ring measures read. */
export const RING_POINTS = 72;

/** The side of the block the band-pass measure reads, in pixels. */
export const BAND_BLOCK = 120;

/**
 * The red, green, blue and alpha of a computed CSS colour. A computed colour reads
 * `rgb(2, 12, 20)` or `rgba(2, 12, 20, 0.9)`, and an opaque one carries no alpha, so the
 * fourth number is 1 where the string holds three.
 */
export function channels(colour: string): [number, number, number, number] {
  const parts = colour
    .replace(/[^\d,.]/g, '')
    .split(',')
    .map(Number);
  return [parts[0] ?? -1, parts[1] ?? -1, parts[2] ?? -1, parts[3] ?? 1];
}

/** Waits until the page has drawn its first frame. */
export async function waitForReady(page: Page, timeout = 30000): Promise<void> {
  await page.waitForFunction(() => window.__galaxyMap?.ready === true, undefined, {
    timeout,
  });
}

/** Removes the HUD the demo page builds. A page with no HUD does nothing. */
export async function removeHud(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.galaxyMap?.hud?.dispose();
  });
}

/**
 * Gives the page the start state every test opens with: an empty system set, an empty
 * category table and the coordinate grid off.
 *
 * The demo site loads the Guardian Ruins set at start and turns the grid on, and about
 * 188 tests of this suite read a marker count, a category count or a frame that either
 * would change. The rule is here and not in each test, so a test written later reads no
 * set and no grid it did not ask for. The grid then reads the library default, which is
 * off.
 *
 * The page reports itself ready after its start load, so the clear reaches a set that
 * is already there.
 *
 * The helper draws one frame at the end. The frame probes report the last frame the
 * renderer drew, so a test that reads one straight after the helper reads the state the
 * helper leaves and not the state before it.
 */
export async function startState(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.galaxyMap?.clearSystemsAndCategories();
    window.galaxyMap?.setGridVisible(false);
    window.galaxyMap?.debug.drawNow();
  });
}

/** What a test asks the page for beyond the view. */
export interface OpenOptions {
  /**
   * True keeps the HUD the demo page builds. The default removes it, because its
   * panels sit over the canvas: a test that screenshots the canvas reads the panels as
   * well, and a test that moves the pointer over a panel finds no system under it.
   */
  readonly hud?: boolean;
  /**
   * True keeps the start state the demo site itself opens with: the demo data set and
   * the coordinate grid. The default clears the set and turns the grid off, so every
   * test that does not ask for them opens an empty map with no grid. Only a test that
   * reads the demo site's own start state passes it.
   */
  readonly demoData?: boolean;
  /**
   * False opens the map without a wait for the nebulae. The default waits for them,
   * because they attach after the first frame: a test that draws before the upload
   * reads one picture with the nebulae and one without. Only a test that holds or
   * breaks a nebula asset passes false.
   *
   * The name states the wait and not the map option. `nebulae` is the option a host
   * gives `createGalaxyMap` to turn them on, so one word would carry two opposite
   * meanings in one suite.
   */
  readonly waitForNebulae?: boolean;
}

/** Opens the map and waits for the first frame. */
export async function openMap(
  page: Page,
  fragment = '',
  options: OpenOptions = {},
): Promise<void> {
  await page.goto(`./${fragment}`);
  await waitForReady(page);
  if (options.demoData !== true) await startState(page);
  if (options.hud !== true) await removeHud(page);
  if (options.waitForNebulae !== false) await settleNebulae(page);
}

/**
 * Waits until the nebulae are on the map, then draws one frame.
 *
 * The map starts before the nebula records and the volumes arrive, so the first frames
 * carry no nebula. Every test that reads the canvas waits here first, or the upload
 * lands in the middle of the test and moves the light it measures.
 *
 * A map that holds no nebula source attaches nothing, and that is a supported state and
 * not a failure. The helper asks the handle first and waits only where the map holds a
 * source. The demo page holds one, so every test of that page reads what it read before.
 */
export async function settleNebulae(page: Page, timeout = 10000): Promise<void> {
  const holdsNebulae = await page.evaluate(
    () => window.galaxyMap?.hasNebulae() ?? false,
  );
  if (holdsNebulae) {
    await expect
      .poll(
        () => page.evaluate(() => window.__galaxyMap?.nebulaeAttached?.() ?? false),
        { timeout },
      )
      .toBe(true);
  }
  await page.evaluate(() => window.__galaxyMap?.drawNow?.());
}

/**
 * Waits until the region labels hold one place.
 *
 * A camera that jumps leaves the label of a region away from the middle of it, and the
 * label walks back over about 20 frames. A test that compares two pictures of the same
 * scene must wait for that walk to end, or the two pictures differ by the label alone.
 *
 * The labels hold in under a second. This throws when they do not, so a test that then
 * compares two pictures reports why it failed and does not read as a picture difference.
 */
export async function settleLabels(page: Page, timeout = 5000): Promise<void> {
  const read = async (): Promise<string> =>
    page.evaluate(() =>
      [...document.querySelectorAll('.region-label')]
        .map((node) => {
          const label = node as HTMLElement;
          return `${label.textContent ?? ''}@${label.style.left},${label.style.top}`;
        })
        .join('|'),
    );
  const end = Date.now() + timeout;
  let before = await read();
  while (Date.now() < end) {
    await page.waitForTimeout(150);
    const after = await read();
    if (after === before) return;
    before = after;
  }
  throw new Error(`the region labels still move after ${timeout} ms: ${before}`);
}

/** Reads the luminance of one pixel, 0 to 1, at a CSS pixel of the canvas. */
export async function luminanceAt(
  page: Page,
  point: { x: number; y: number },
): Promise<number> {
  return page.evaluate((where) => {
    const map = window.__galaxyMap;
    if (map?.readPixel === undefined) return -1;
    const [red, green, blue] = map.readPixel(where.x, where.y);
    return (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  }, point);
}

/** Projects a game position to a CSS pixel of the canvas. */
export async function projectPoint(
  page: Page,
  point: [number, number, number],
): Promise<{ x: number; y: number }> {
  return page.evaluate(
    (where) => window.__galaxyMap?.project?.(where) ?? { x: -1, y: -1 },
    point,
  );
}

/**
 * Reads a rectangle of the frame, in CSS pixels from the top left. The result holds
 * four bytes per pixel, row by row, and the first row is the top one.
 */
export async function readRect(
  page: Page,
  x: number,
  y: number,
  width: number,
  height: number,
): Promise<number[]> {
  return page.evaluate(
    (rect) => {
      const map = window.__galaxyMap;
      if (map?.readRect === undefined) return [];
      return Array.from(map.readRect(rect.x, rect.y, rect.width, rect.height));
    },
    { x, y, width, height },
  );
}

/** The mean luminance of a square block centred on a CSS pixel. */
export async function meanLuminanceBlock(
  page: Page,
  point: { x: number; y: number },
  size = BAND_BLOCK,
): Promise<number> {
  return page.evaluate(
    (where) => {
      const map = window.__galaxyMap;
      if (map?.readRect === undefined) return -1;
      const half = where.size / 2;
      const bytes = map.readRect(
        Math.round(where.x) - half,
        Math.round(where.y) - half,
        where.size,
        where.size,
      );
      let sum = 0;
      for (let index = 0; index < bytes.length; index += 4) {
        sum +=
          0.2126 * (bytes[index] as number) +
          0.7152 * (bytes[index + 1] as number) +
          0.0722 * (bytes[index + 2] as number);
      }
      return (4 * sum) / (255 * bytes.length);
    },
    { x: point.x, y: point.y, size },
  );
}

/** The 72 points spaced evenly on a circle around the galactic centre, in the plane. */
export function ringPoints(radius: number): [number, number, number][] {
  const points: [number, number, number][] = [];
  for (let index = 0; index < RING_POINTS; index += 1) {
    const angle = (2 * Math.PI * index) / RING_POINTS;
    points.push([
      GALACTIC_CENTRE[0] + radius * Math.cos(angle),
      0,
      GALACTIC_CENTRE[2] + radius * Math.sin(angle),
    ]);
  }
  return points;
}

/** The 10th and the 90th percentile of a ring of readings. */
export interface RingSpread {
  readonly tenth: number;
  readonly ninetieth: number;
  readonly readings: number[];
}

/**
 * Reads the corner-subtracted 5 x 5 mean luminance at 72 points spaced evenly on a
 * circle around the galactic centre in the plane, and gives back its percentiles.
 */
export async function ringSpread(page: Page, radius: number): Promise<RingSpread> {
  const points = ringPoints(radius);
  const readings = await page.evaluate((ring) => {
    const map = window.__galaxyMap;
    if (map?.readRect === undefined || map.project === undefined) return [];
    const mean5 = (x: number, y: number): number => {
      const bytes = map.readRect?.(Math.round(x) - 2, Math.round(y) - 2, 5, 5);
      if (bytes === undefined) return 0;
      let sum = 0;
      for (let index = 0; index < bytes.length; index += 4) {
        sum +=
          0.2126 * (bytes[index] as number) +
          0.7152 * (bytes[index + 1] as number) +
          0.0722 * (bytes[index + 2] as number);
      }
      return (4 * sum) / (255 * bytes.length);
    };
    const canvas = document.getElementById('map');
    if (!(canvas instanceof HTMLCanvasElement)) return [];
    const right = canvas.clientWidth - 3;
    const bottom = canvas.clientHeight - 3;
    let corners = 0;
    for (const [x, y] of [
      [2, 2],
      [right, 2],
      [2, bottom],
      [right, bottom],
    ]) {
      const [red, green, blue] = map.readPixel?.(x as number, y as number) ?? [0, 0, 0];
      corners += (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
    }
    corners /= 4;
    return ring.map((point) => {
      const screen = map.project?.(point) ?? { x: 0, y: 0 };
      return mean5(screen.x, screen.y) - corners;
    });
  }, points);

  const sorted = [...readings].sort((a, b) => a - b);
  const percentile = (fraction: number): number => {
    const position = fraction * (sorted.length - 1);
    const low = Math.floor(position);
    const high = Math.min(sorted.length - 1, low + 1);
    const rest = position - low;
    return (sorted[low] as number) * (1 - rest) + (sorted[high] as number) * rest;
  };
  return { tenth: percentile(0.1), ninetieth: percentile(0.9), readings };
}

/**
 * The band-pass texture measure of the spec over the 120 x 120 block centred on the
 * projection of a game position: the standard deviation of the 5 x 5 mean less the
 * 41 x 41 mean, at every second pixel, over the block's mean above the corners.
 */
export async function bandPass(
  page: Page,
  point: [number, number, number],
): Promise<number> {
  return page.evaluate(
    (where) => {
      const map = window.__galaxyMap;
      if (map?.readRect === undefined || map.project === undefined) return -1;
      const screen = map.project(where.point);
      // The 41 x 41 window at the border of the block reaches 20 pixels beyond it.
      const margin = 20;
      const side = where.block + 2 * margin;
      const left = Math.round(screen.x) - side / 2;
      const top = Math.round(screen.y) - side / 2;
      const bytes = map.readRect(left, top, side, side);
      // The window sizes below are in CSS pixels, so this measure holds only at one
      // device pixel per CSS pixel. Fail loudly rather than read the wrong window.
      if (bytes.length !== side * side * 4) {
        throw new Error(
          `bandPass wants one device pixel per CSS pixel, got ${bytes.length / 4} ` +
            `pixels for a ${side} x ${side} rectangle`,
        );
      }

      const luminance = new Float64Array(side * side);
      for (let index = 0; index < luminance.length; index += 1) {
        const byte = index * 4;
        luminance[index] =
          (0.2126 * (bytes[byte] as number) +
            0.7152 * (bytes[byte + 1] as number) +
            0.0722 * (bytes[byte + 2] as number)) /
          255;
      }

      // A summed area table, so every window mean costs four reads.
      const stride = side + 1;
      const sums = new Float64Array(stride * stride);
      for (let y = 0; y < side; y += 1) {
        for (let x = 0; x < side; x += 1) {
          sums[(y + 1) * stride + x + 1] =
            (luminance[y * side + x] as number) +
            (sums[y * stride + x + 1] as number) +
            (sums[(y + 1) * stride + x] as number) -
            (sums[y * stride + x] as number);
        }
      }
      const windowMean = (x: number, y: number, half: number): number => {
        const x0 = x - half;
        const y0 = y - half;
        const x1 = x + half + 1;
        const y1 = y + half + 1;
        const total =
          (sums[y1 * stride + x1] as number) -
          (sums[y0 * stride + x1] as number) -
          (sums[y1 * stride + x0] as number) +
          (sums[y0 * stride + x0] as number);
        return total / ((x1 - x0) * (y1 - y0));
      };

      const residuals: number[] = [];
      let blockMean = 0;
      for (let y = margin; y < margin + where.block; y += 2) {
        for (let x = margin; x < margin + where.block; x += 2) {
          const near = windowMean(x, y, 2);
          residuals.push(near - windowMean(x, y, 20));
          blockMean += near;
        }
      }
      blockMean /= residuals.length;

      const canvas = document.getElementById('map');
      if (!(canvas instanceof HTMLCanvasElement)) return -1;
      const right = canvas.clientWidth - 3;
      const bottom = canvas.clientHeight - 3;
      let corners = 0;
      for (const [x, y] of [
        [2, 2],
        [right, 2],
        [2, bottom],
        [right, bottom],
      ]) {
        const [red, green, blue] = map.readPixel?.(x as number, y as number) ?? [
          0, 0, 0,
        ];
        corners += (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
      }
      corners /= 4;

      let variance = 0;
      for (const residual of residuals) variance += residual * residual;
      variance /= residuals.length;
      return Math.sqrt(variance) / (blockMean - corners);
    },
    { point, block: BAND_BLOCK },
  );
}

/** The luminance of every pixel row of one column, from the top row down. */
export async function columnLuminance(
  page: Page,
  x: number,
  fromY: number,
  toY: number,
): Promise<number[]> {
  const top = Math.round(Math.min(fromY, toY));
  const count = Math.max(1, Math.round(Math.abs(toY - fromY)) + 1);
  return page.evaluate(
    (where) => {
      const map = window.__galaxyMap;
      if (map?.readRect === undefined) return [];
      const bytes = map.readRect(Math.round(where.x), where.top, 1, where.count);
      // The rows are in CSS pixels, so this reader holds only at one device pixel per
      // CSS pixel. Fail loudly rather than halve the step between rows.
      if (bytes.length !== where.count * 4) {
        throw new Error(
          `columnLuminance wants one device pixel per CSS pixel, got ${bytes.length / 4} ` +
            `pixels for ${where.count} rows`,
        );
      }
      const rows: number[] = [];
      for (let index = 0; index < bytes.length; index += 4) {
        rows.push(
          (0.2126 * (bytes[index] as number) +
            0.7152 * (bytes[index + 1] as number) +
            0.0722 * (bytes[index + 2] as number)) /
            255,
        );
      }
      return rows;
    },
    { x, top, count },
  );
}

/**
 * The median of the 5 x 5 mean luminance at the 72 points spaced evenly on a circle
 * around the galactic centre in the plane.
 */
export async function ringMedian5(page: Page, radius: number): Promise<number> {
  const points = ringPoints(radius);
  const readings = await page.evaluate((ring) => {
    const map = window.__galaxyMap;
    if (map?.readRect === undefined || map.project === undefined) return [];
    const mean5 = (x: number, y: number): number => {
      const bytes = map.readRect?.(Math.round(x) - 2, Math.round(y) - 2, 5, 5);
      if (bytes === undefined) return 0;
      let sum = 0;
      for (let index = 0; index < bytes.length; index += 4) {
        sum +=
          0.2126 * (bytes[index] as number) +
          0.7152 * (bytes[index + 1] as number) +
          0.0722 * (bytes[index + 2] as number);
      }
      return (4 * sum) / (255 * bytes.length);
    };
    return ring.map((point) => {
      const screen = map.project?.(point) ?? { x: 0, y: 0 };
      return mean5(screen.x, screen.y);
    });
  }, points);

  const sorted = [...readings].sort((a, b) => a - b);
  if (sorted.length === 0) return -1;
  const low = sorted[Math.floor((sorted.length - 1) / 2)] as number;
  const high = sorted[Math.ceil((sorted.length - 1) / 2)] as number;
  return (low + high) / 2;
}

/**
 * The mean luminance of the whole frame. The sum runs inside the page, so the
 * millions of byte values do not cross the protocol.
 */
export async function meanLuminanceFrame(page: Page): Promise<number> {
  return page.evaluate(() => {
    const map = window.__galaxyMap;
    if (map?.readRect === undefined) return -1;
    const canvas = document.getElementById('map');
    if (!(canvas instanceof HTMLCanvasElement)) return -1;
    const bytes = map.readRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    let sum = 0;
    for (let index = 0; index < bytes.length; index += 4) {
      sum +=
        0.2126 * (bytes[index] as number) +
        0.7152 * (bytes[index + 1] as number) +
        0.0722 * (bytes[index + 2] as number);
    }
    return (4 * sum) / (255 * bytes.length);
  });
}

/**
 * Reads the 5 x 5 mean colour at the 72 points spaced evenly on a circle around the
 * galactic centre in the plane, and subtracts the mean colour of the four corner
 * pixels. Each triple is red, green and blue on a 0 to 1 scale.
 */
export async function ringColour5(
  page: Page,
  radius: number,
): Promise<[number, number, number][]> {
  const points = ringPoints(radius);
  return page.evaluate((ring) => {
    const map = window.__galaxyMap;
    if (map?.readRect === undefined || map.project === undefined) return [];
    const mean5 = (x: number, y: number): [number, number, number] => {
      const bytes = map.readRect?.(Math.round(x) - 2, Math.round(y) - 2, 5, 5);
      if (bytes === undefined) return [0, 0, 0];
      let red = 0;
      let green = 0;
      let blue = 0;
      for (let index = 0; index < bytes.length; index += 4) {
        red += bytes[index] as number;
        green += bytes[index + 1] as number;
        blue += bytes[index + 2] as number;
      }
      const count = bytes.length / 4;
      return [red / (255 * count), green / (255 * count), blue / (255 * count)];
    };
    const canvas = document.getElementById('map');
    if (!(canvas instanceof HTMLCanvasElement)) return [];
    const right = canvas.clientWidth - 3;
    const bottom = canvas.clientHeight - 3;
    const corners: [number, number, number] = [0, 0, 0];
    for (const [x, y] of [
      [2, 2],
      [right, 2],
      [2, bottom],
      [right, bottom],
    ]) {
      const [red, green, blue] = map.readPixel?.(x as number, y as number) ?? [0, 0, 0];
      corners[0] += red / (4 * 255);
      corners[1] += green / (4 * 255);
      corners[2] += blue / (4 * 255);
    }
    return ring.map((point): [number, number, number] => {
      const screen = map.project?.(point) ?? { x: 0, y: 0 };
      const [red, green, blue] = mean5(screen.x, screen.y);
      return [red - corners[0], green - corners[1], blue - corners[2]];
    });
  }, points);
}

/** One region label of the page, with the range from the camera to its own anchor. */
export interface RegionLabelRange {
  readonly name: string;
  /** The opacity the overlay gave the label. */
  readonly opacity: number;
  /** The range from the camera to the label's plane anchor, in light years. */
  readonly rangeLy: number;
}

/**
 * Reads every region label the page holds, with the range from the camera to the plane
 * point its own anchor sits on.
 *
 * The anchor is the plane point the label names, and the label's box is centred on its
 * projection, so `planePointAt` under the middle of the box gives the anchor back. The
 * camera position comes from the view by the same rule `src/camera/projection.ts` holds:
 * the cursor plus the camera direction times the distance.
 */
export async function readRegionLabelRanges(page: Page): Promise<RegionLabelRange[]> {
  return page.evaluate(() => {
    const map = window.galaxyMap;
    const probe = window.__galaxyMap;
    const canvas = document.querySelector('canvas');
    if (map === undefined || probe?.planePointAt === undefined || canvas === null) {
      return [];
    }
    const view = map.getView();
    const toRadians = Math.PI / 180;
    const pitch = view.pitch * toRadians;
    const yaw = view.yaw * toRadians;
    const horizontal = Math.cos(pitch);
    const camera: [number, number, number] = [
      view.cursor[0] - horizontal * Math.sin(yaw) * view.distance,
      view.cursor[1] + Math.sin(pitch) * view.distance,
      view.cursor[2] - horizontal * Math.cos(yaw) * view.distance,
    ];
    const box = canvas.getBoundingClientRect();
    const out: { name: string; opacity: number; rangeLy: number }[] = [];
    for (const element of document.querySelectorAll('.region-label')) {
      const at = element.getBoundingClientRect();
      const point = probe.planePointAt(
        at.left + at.width / 2 - box.left,
        at.top + at.height / 2 - box.top,
      );
      out.push({
        name: element.textContent ?? '',
        opacity: Number(getComputedStyle(element).opacity),
        rangeLy:
          point === null
            ? Number.POSITIVE_INFINITY
            : Math.hypot(
                point[0] - camera[0],
                point[1] - camera[1],
                point[2] - camera[2],
              ),
      });
    }
    return out;
  });
}

/** Where the `multifaction` entry reads its records. The tests serve it from a fixture. */
export const FACTIONS_DUMP_URL = 'https://downloads.spansh.co.uk/factions.json.gz';

/** One system of a faction line of a dump fixture. */
export function dumpSystem(
  name: string,
  id: number,
  controls: boolean,
): Record<string, unknown> {
  return {
    systemName: name,
    systemId64: id,
    ...(controls ? { isControllingFaction: true } : {}),
    coords: { x: id, y: id / 2, z: -id },
  };
}

/** One faction line of a dump fixture, as the file writes one. */
export function dumpFaction(
  name: string,
  systems: readonly Record<string, unknown>[],
): string {
  return `\t${JSON.stringify({ name, allegiance: 'Independent', systems })},`;
}

/**
 * Serves the factions dump from a fixture, as gzip.
 *
 * The file is gzip on the network and the page opens it with `DecompressionStream`, so
 * the route carries the gzip bytes and names no `content-encoding`: a route that named
 * one would have the browser open them first and leave the page nothing to open.
 */
export async function serveFactionsDump(page: Page, text: string): Promise<void> {
  const body = gzipSync(Buffer.from(text, 'utf8'));
  await page.route(FACTIONS_DUMP_URL, async (route) => {
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/octet-stream' },
      body,
    });
  });
}

/** Waits for the first read-back to land, so the map asks for no more of them. */
export async function waitForFirstReading(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      window.__galaxyMap?.wake?.();
      return window.galaxyMap?.debug.backgroundFrame() !== null;
    },
    undefined,
    { timeout: 30000 },
  );
}

/** Holds `W` down until the map drew `count` frames, and gives back the drawn frames. */
export async function heldKeyFrames(page: Page, count: number): Promise<number> {
  await page.mouse.move(960, 540);
  await page.evaluate(() => {
    window.__galaxyMap?.resetFrameStats?.();
    window.galaxyMap?.debug.resetReadbackStats();
  });
  await page.keyboard.down('w');
  await page.waitForFunction(
    (want) => (window.__galaxyMap?.frameStats?.().frames ?? 0) >= want,
    count,
    { timeout: 30000 },
  );
  await page.keyboard.up('w');
  return page.evaluate(() => window.__galaxyMap?.frameStats?.().frames ?? -1);
}
