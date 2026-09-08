import { expect, test } from '@playwright/test';
import {
  bandPass,
  columnLuminance,
  GALACTIC_CENTRE,
  luminanceAt,
  meanLuminanceBlock,
  openMap,
  projectPoint,
  readRect,
  ringPoints,
  ringSpread,
} from './helpers';

test.use({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });

const SOL: [number, number, number] = [0, 0, 0];
/** Outside the disc and inside the default view. */
const OUTSIDE: [number, number, number] = [-45000, 0, 0];
/** Between two arms, where the game's map holds 8 percent of the density at Sol. */
const GAP: [number, number, number] = [13736, 0, 2116];
/** 49,000 light years from the centre, past the painted rim. */
const HALO: [number, number, number] = [-48985, 0, 25895];
/** 5,000 and 9,000 light years from the centre, in the plane. */
const BULGE_5000: [number, number, number] = [5015, 0, 25895];
const BULGE_9000: [number, number, number] = [9015, 0, 25895];
/** Three patches of the disc the cloud sprites cover at the default view. */
const CLOUD_BLOCKS: [number, number, number][] = [
  [-20000, 0, 20000],
  [25000, 0, 40000],
  [8000, 0, -4000],
];
/** Two patches above the disc, for the side view. */
const SIDE_BLOCKS: [number, number, number][] = [
  [12015, 565, 25895],
  [-19985, 365, 25895],
];
/** 6,000 and 12,000 light years above the galactic centre. */
const SKY_6000: [number, number, number] = [15, 5965, 25895];
const SKY_12000: [number, number, number] = [15, 11965, 25895];

/** The view that looks at the galactic centre from the side. */
const SIDE_VIEW = '#c=15,0,25895&d=70000&p=5&y=0';
/** The side view the chunk measure and the soft top read. */
const SIDE_CHUNK_VIEW = '#c=15,0,25895&d=40000&p=5&y=0';
const SIDE_TOP_VIEW = '#c=15,0,25895&d=25000&p=5&y=0';
/** A close view inside the disc, where the cloud pass draws nothing. */
const CLOSE_VIEW = '#c=-20000,0,20000&d=2000&p=35&y=0';

/** The green channel of the tone map's background, in 8-bit steps. */
const BACKGROUND_GREEN = 0.036 * 255;

/** The four pixels 2 pixels inside the corners of the frame. */
const CORNERS: { x: number; y: number }[] = [
  { x: 2, y: 2 },
  { x: 1277, y: 2 },
  { x: 2, y: 717 },
  { x: 1277, y: 717 },
];

test('the default view shows the centre, Sol and the empty space around them', async ({
  page,
}) => {
  await openMap(page);

  const centre = await projectPoint(page, GALACTIC_CENTRE);
  const sol = await projectPoint(page, SOL);
  const outside = await projectPoint(page, OUTSIDE);

  const centrePixel = await page.evaluate(
    (where) => window.__galaxyMap?.readPixel?.(where.x, where.y) ?? [0, 0, 0, 0],
    centre,
  );
  const centreLuminance = await luminanceAt(page, centre);
  const solLuminance = await luminanceAt(page, sol);
  const outsideLuminance = await luminanceAt(page, outside);
  const redMinusBlue = ((centrePixel[0] as number) - (centrePixel[2] as number)) / 255;
  const greenMinusBlue =
    ((centrePixel[1] as number) - (centrePixel[2] as number)) / 255;
  console.log('luminance', {
    centreLuminance,
    solLuminance,
    outsideLuminance,
    redMinusBlue,
    greenMinusBlue,
  });

  expect(centreLuminance).toBeGreaterThan(0.8);
  expect(centreLuminance).toBeLessThan(0.97);
  expect(redMinusBlue).toBeGreaterThan(0.08);
  expect(greenMinusBlue).toBeGreaterThan(0.06);
  expect(solLuminance).toBeGreaterThan(0.2);
  expect(outsideLuminance).toBeLessThan(0.12);
});

test('the colours follow the reference', async ({ page }) => {
  await openMap(page);

  const readPixel = async (
    point: [number, number, number],
  ): Promise<[number, number, number]> => {
    const screen = await projectPoint(page, point);
    const pixel = await page.evaluate(
      (where) => window.__galaxyMap?.readPixel?.(where.x, where.y) ?? [0, 0, 0, 0],
      screen,
    );
    return [
      (pixel[0] as number) / 255,
      (pixel[1] as number) / 255,
      (pixel[2] as number) / 255,
    ];
  };

  const band = await readPixel(BULGE_9000);
  const sol = await readPixel(SOL);
  const blueMinusRed = await page.evaluate((points) => {
    const map = window.__galaxyMap;
    if (map?.readPixel === undefined || map.project === undefined) return [];
    return points.map((point) => {
      const screen = map.project?.(point) ?? { x: 0, y: 0 };
      const [red, , blue] = map.readPixel?.(screen.x, screen.y) ?? [0, 0, 0];
      return (blue - red) / 255;
    });
  }, ringPoints(38000));
  const sorted = [...blueMinusRed].sort((a, b) => a - b);
  const median =
    ((sorted[Math.floor((sorted.length - 1) / 2)] as number) +
      (sorted[Math.ceil((sorted.length - 1) / 2)] as number)) /
    2;

  console.log('colours', {
    bandRedMinusGreen: band[0] - band[1],
    solRedMinusBlue: sol[0] - sol[2],
    solRedMinusGreen: sol[0] - sol[1],
    medianBlueMinusRed: median,
  });

  expect(band[0] - band[1]).toBeGreaterThanOrEqual(0.05);
  expect(sol[0] - sol[2]).toBeGreaterThanOrEqual(0.01);
  expect(sol[0] - sol[1]).toBeGreaterThanOrEqual(0.02);
  expect(median).toBeGreaterThanOrEqual(0);
});

test('the bulge falls off from the centre', async ({ page }) => {
  await openMap(page);

  const centre = await luminanceAt(page, await projectPoint(page, GALACTIC_CENTRE));
  const near = await luminanceAt(page, await projectPoint(page, BULGE_5000));
  const far = await luminanceAt(page, await projectPoint(page, BULGE_9000));
  console.log('bulge fall-off', { centre, near, far });

  expect(centre - near).toBeGreaterThanOrEqual(0.03);
  expect(near - far).toBeGreaterThanOrEqual(0.05);
});

test('the space between the arms keeps its light', async ({ page }) => {
  await openMap(page);

  const gapLuminance = await luminanceAt(page, await projectPoint(page, GAP));
  const solLuminance = await luminanceAt(page, await projectPoint(page, SOL));
  console.log('gap luminance', { gapLuminance, solLuminance });

  expect(gapLuminance).toBeGreaterThan(0.1);
  expect(gapLuminance).toBeLessThan(solLuminance);
});

test('the patches of the outer disc keep their contrast', async ({ page }) => {
  await openMap(page);

  for (const radius of [32000, 38000]) {
    const spread = await ringSpread(page, radius);
    console.log(`ring ${radius}`, {
      tenth: spread.tenth,
      ninetieth: spread.ninetieth,
      ratio: spread.ninetieth / spread.tenth,
    });
    // The ratio test cannot fail if the 10th percentile is zero or below, so check
    // that the dim end of the ring carries light first.
    expect(spread.tenth).toBeGreaterThan(0);
    expect(spread.ninetieth).toBeGreaterThanOrEqual(2.5 * spread.tenth);
  }
});

test('the bulge has a soft top', async ({ page }) => {
  await openMap(page, SIDE_TOP_VIEW);
  await page.evaluate(() => {
    window.__galaxyMap?.setPasses?.({ points: false, clouds: false, glow: false });
    window.__galaxyMap?.drawNow?.();
  });

  const plane = await projectPoint(page, GALACTIC_CENTRE);
  const above = await projectPoint(page, [
    GALACTIC_CENTRE[0],
    GALACTIC_CENTRE[1] + 4000,
    GALACTIC_CENTRE[2],
  ]);
  const rows = await columnLuminance(page, plane.x, above.y, plane.y);
  let largest = 0;
  for (let index = 1; index < rows.length; index += 1) {
    largest = Math.max(
      largest,
      Math.abs((rows[index] as number) - (rows[index - 1] as number)),
    );
  }
  console.log('bulge top', { rows: rows.length, largest });

  expect(rows.length).toBeGreaterThan(50);
  expect(largest).toBeLessThanOrEqual(0.05);
});

test('the background is dark grey', async ({ page }) => {
  await openMap(page);

  const corners: number[] = [];
  for (const corner of CORNERS) {
    corners.push(await luminanceAt(page, corner));
  }
  console.log('corner luminance', corners);

  for (const corner of corners) {
    expect(corner).toBeGreaterThan(0.02);
    expect(corner).toBeLessThan(0.06);
  }
});

test('the disc at Sol shows grain', async ({ page }) => {
  await openMap(page);

  const sol = await projectPoint(page, SOL);
  // The block reads one pixel beyond the measured area, so every measured pixel has
  // a full 3 x 3 neighbourhood.
  const grain = await page.evaluate((where) => {
    const map = window.__galaxyMap;
    if (map?.readPixel === undefined) return -1;
    const size = 26;
    const half = size / 2;
    const block: number[][] = [];
    for (let y = 0; y < size; y += 1) {
      const row: number[] = [];
      for (let x = 0; x < size; x += 1) {
        const [red, green, blue] = map.readPixel(
          Math.round(where.x) - half + x,
          Math.round(where.y) - half + y,
        );
        row.push((0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255);
      }
      block.push(row);
    }
    const residuals: number[] = [];
    let mean = 0;
    for (let y = 1; y < size - 1; y += 1) {
      for (let x = 1; x < size - 1; x += 1) {
        let sum = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            sum += (block[y + dy] as number[])[x + dx] as number;
          }
        }
        const value = (block[y] as number[])[x] as number;
        residuals.push(value - sum / 9);
        mean += value;
      }
    }
    mean /= residuals.length;
    const variance =
      residuals.reduce((sum, value) => sum + value * value, 0) / residuals.length;
    return Math.sqrt(variance) / mean;
  }, sol);
  console.log('grain at Sol', grain);

  expect(grain).toBeGreaterThan(0.06);
});

test('the glow puts a halo past the rim', async ({ page }) => {
  await openMap(page);

  const halo = await projectPoint(page, HALO);
  const withGlow = await luminanceAt(page, halo);
  await page.evaluate(() => {
    window.__galaxyMap?.setPasses?.({ glow: false });
    window.__galaxyMap?.drawNow?.();
  });
  const withoutGlow = await luminanceAt(page, halo);
  await page.evaluate(() => {
    window.__galaxyMap?.setPasses?.({ glow: true });
    window.__galaxyMap?.drawNow?.();
  });
  const solLuminance = await luminanceAt(page, await projectPoint(page, SOL));
  console.log('halo luminance', { withGlow, withoutGlow, solLuminance });

  expect(withGlow - withoutGlow).toBeGreaterThanOrEqual(0.02);
  expect(withGlow - withoutGlow).toBeLessThanOrEqual(0.05);
  expect(withGlow).toBeLessThan(solLuminance);
});

test('the sky stays dark from the side', async ({ page }) => {
  await openMap(page, SIDE_VIEW);

  const low = await luminanceAt(page, await projectPoint(page, SKY_6000));
  const high = await luminanceAt(page, await projectPoint(page, SKY_12000));
  console.log('sky luminance', { low, high });

  expect(low).toBeLessThanOrEqual(0.2);
  expect(high).toBeLessThanOrEqual(0.08);
});

test('the clouds give the haze chunks from above', async ({ page }) => {
  await openMap(page);

  for (const block of CLOUD_BLOCKS) {
    const measure = await bandPass(page, block);
    console.log('chunks from above', { block, measure });
    expect(measure).toBeGreaterThan(0.1);
  }
});

test('the clouds give the haze chunks from the side', async ({ page }) => {
  await openMap(page, SIDE_CHUNK_VIEW);

  for (const block of SIDE_BLOCKS) {
    const measure = await bandPass(page, block);
    console.log('chunks from the side', { block, measure });
    expect(measure).toBeGreaterThan(0.1);
  }
});

test('the clouds carry light', async ({ page }) => {
  await openMap(page);

  const block = await projectPoint(page, CLOUD_BLOCKS[0] as [number, number, number]);
  const withClouds = await meanLuminanceBlock(page, block);
  await page.evaluate(() => {
    window.__galaxyMap?.setPasses?.({ clouds: false });
    window.__galaxyMap?.drawNow?.();
  });
  const withoutClouds = await meanLuminanceBlock(page, block);
  console.log('clouds carry light', { withClouds, withoutClouds });

  expect(withClouds - withoutClouds).toBeGreaterThanOrEqual(0.03);
});

test('the clouds fade at close range', async ({ page }) => {
  await openMap(page, CLOSE_VIEW);

  const centre = { x: 640, y: 360 };
  const withClouds = await meanLuminanceBlock(page, centre);
  await page.evaluate(() => {
    window.__galaxyMap?.setPasses?.({ clouds: false });
    window.__galaxyMap?.drawNow?.();
  });
  const withoutClouds = await meanLuminanceBlock(page, centre);
  console.log('clouds at close range', { withClouds, withoutClouds });

  // The helper gives -1 if the page has no readRect. Two of those subtract to zero
  // and pass the test, so check that both readings are real first.
  expect(withClouds).toBeGreaterThanOrEqual(0);
  expect(withoutClouds).toBeGreaterThanOrEqual(0);
  expect(Math.abs(withClouds - withoutClouds)).toBeLessThan(0.005);
});

test('a flat colour is dithered', async ({ page }) => {
  await openMap(page);
  await page.evaluate(() => {
    window.__galaxyMap?.setPasses?.({
      volume: false,
      clouds: false,
      points: false,
      glow: false,
    });
    window.__galaxyMap?.drawNow?.();
  });

  const bytes = await readRect(page, 2, 2, 1, 200);
  const green: number[] = [];
  for (let index = 1; index < bytes.length; index += 4) {
    green.push(bytes[index] as number);
  }
  let difference = 0;
  for (let index = 1; index < green.length; index += 1) {
    difference += Math.abs((green[index] as number) - (green[index - 1] as number));
  }
  difference /= green.length - 1;
  const levels = new Set(green);
  const mean = green.reduce((sum, value) => sum + value, 0) / green.length;
  console.log('dither', { difference, levels: [...levels].sort(), mean });

  expect(green.length).toBe(200);
  expect(difference).toBeGreaterThanOrEqual(0.25);
  expect(levels.size).toBeLessThanOrEqual(3);
  expect(Math.abs(mean - BACKGROUND_GREEN)).toBeLessThanOrEqual(1);
});

test('the dither is stable', async ({ page }) => {
  await openMap(page);

  const first = await page.locator('#map').screenshot();
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  );
  const second = await page.locator('#map').screenshot();

  expect(Buffer.compare(first, second)).toBe(0);
});

test('the default view matches the baseline image', async ({ page }) => {
  await openMap(page);
  // The per-pixel threshold is far below Playwright's default of 0.2, which lets a
  // yellow core pass as a cream one. At 0.05 one 8-bit step of dither still passes.
  await expect(page.locator('#map')).toHaveScreenshot('default-view.png', {
    maxDiffPixelRatio: 0.02,
    threshold: 0.05,
  });
});
