import type { Page } from '@playwright/test';

/** The event the page sends once it has drawn the scene data for the first time. */
export const READY_EVENT = 'galaxy-map-ready';

/** The galactic centre in game coordinates. */
export const GALACTIC_CENTRE: [number, number, number] = [15, -35, 25895];

/** How many points the ring measures read. */
export const RING_POINTS = 72;

/** The side of the block the band-pass measure reads, in pixels. */
export const BAND_BLOCK = 120;

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

/** What a test asks the page for beyond the view. */
export interface OpenOptions {
  /**
   * True keeps the HUD the demo page builds. The default removes it, because its
   * panels sit over the canvas: a test that screenshots the canvas reads the panels as
   * well, and a test that moves the pointer over a panel finds no system under it.
   */
  readonly hud?: boolean;
}

/** Opens the map and waits for the first frame. */
export async function openMap(
  page: Page,
  fragment = '',
  options: OpenOptions = {},
): Promise<void> {
  await page.goto(`/${fragment}`);
  await waitForReady(page);
  if (options.hud !== true) await removeHud(page);
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
