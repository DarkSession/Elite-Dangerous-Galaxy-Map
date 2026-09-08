import { expect, test } from '@playwright/test';
import {
  bandPass,
  columnLuminance,
  GALACTIC_CENTRE,
  luminanceAt,
  meanLuminanceBlock,
  meanLuminanceFrame,
  openMap,
  projectPoint,
  readRect,
  ringColour5,
  ringMedian5,
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
/** A view close enough that the sprites near the camera want more than the cap. */
const BOUNDED_SUM_VIEW = '#c=-20000,0,20000&d=12000&p=35&y=0';
/** The ring the rim scenario reads, in light years from the galactic centre. */
const RIM_RADIUS = 44000;

/** The green channel of the tone map's background, in 8-bit steps. */
const BACKGROUND_GREEN = 0.036 * 255;

/** How many of the 72 ring points each luminance quartile holds. */
const QUARTILE_POINTS = 18;

/** The median of a list of numbers. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return -1;
  const low = sorted[Math.floor((sorted.length - 1) / 2)] as number;
  const high = sorted[Math.ceil((sorted.length - 1) / 2)] as number;
  return (low + high) / 2;
}

/** The medians of one chroma measure over the dark and the bright ring quartile. */
function quartileMedians(
  colours: [number, number, number][],
  chroma: (colour: [number, number, number]) => number,
): { dark: number; bright: number } {
  const rows = colours.map((colour) => ({
    luminance: 0.2126 * colour[0] + 0.7152 * colour[1] + 0.0722 * colour[2],
    chroma: chroma(colour),
  }));
  rows.sort((a, b) => a.luminance - b.luminance);
  const dark = rows.slice(0, QUARTILE_POINTS).map((row) => row.chroma);
  const bright = rows.slice(-QUARTILE_POINTS).map((row) => row.chroma);
  return { dark: median(dark), bright: median(bright) };
}

/** Blue less red over the sum of the three channels. */
function blueLessRed(colour: [number, number, number]): number {
  return (colour[2] - colour[0]) / Math.max(colour[0] + colour[1] + colour[2], 1e-6);
}

/** Red less green over the sum of the three channels. */
function redLessGreen(colour: [number, number, number]): number {
  return (colour[0] - colour[1]) / Math.max(colour[0] + colour[1] + colour[2], 1e-6);
}

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
  expect(redMinusBlue).toBeGreaterThanOrEqual(0.03);
  expect(redMinusBlue).toBeLessThanOrEqual(0.1);
  expect(greenMinusBlue).toBeGreaterThanOrEqual(0.02);
  expect(greenMinusBlue).toBeLessThanOrEqual(0.07);
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

  // The ring at 20,000 light years holds a smaller factor: the sprites hold one
  // brightness over the inner disc, which lowers the ratio there. The frame reads
  // 1.25, so the floor of 1.2 guards against a loss of the contrast the frame has.
  const rings: [number, number][] = [
    [20000, 1.2],
    [32000, 2.5],
    [38000, 2.5],
  ];
  // Every ring is read and logged before the first assertion, so a failure at one
  // ring still leaves the readings of the others in the log.
  const readings: {
    radius: number;
    factor: number;
    tenth: number;
    ninetieth: number;
  }[] = [];
  for (const [radius, factor] of rings) {
    const spread = await ringSpread(page, radius);
    readings.push({ radius, factor, tenth: spread.tenth, ninetieth: spread.ninetieth });
  }
  for (const reading of readings) {
    console.log(`ring ${reading.radius}`, {
      tenth: reading.tenth,
      ninetieth: reading.ninetieth,
      ratio: reading.ninetieth / reading.tenth,
      factor: reading.factor,
    });
  }

  for (const reading of readings) {
    // The ratio test cannot fail if the 10th percentile is zero or below, so check
    // that the dim end of the ring carries light first.
    expect(reading.tenth).toBeGreaterThan(0);
    expect(reading.ninetieth).toBeGreaterThanOrEqual(reading.factor * reading.tenth);
  }
});

test('the inner disc holds its light', async ({ page }) => {
  await openMap(page);

  const readings: Record<number, number> = {};
  for (const radius of [14000, 20000, 32000]) {
    readings[radius] = median((await ringSpread(page, radius)).readings);
  }
  console.log('inner disc light', readings);

  expect(readings[14000] as number).toBeGreaterThanOrEqual(0.56);
  expect(readings[20000] as number).toBeGreaterThanOrEqual(0.42);
  expect(readings[32000] as number).toBeGreaterThanOrEqual(0.12);
  expect(readings[32000] as number).toBeLessThanOrEqual(0.22);
});

test('the dust lanes are red-brown', async ({ page }) => {
  await openMap(page);

  const inner = quartileMedians(await ringColour5(page, 14000), redLessGreen);
  const outer = quartileMedians(await ringColour5(page, 20000), redLessGreen);
  console.log('dust lanes', { inner, outer });

  expect(inner.dark).toBeGreaterThanOrEqual(0.08);
  expect(inner.bright).toBeLessThanOrEqual(0.045);
  expect(outer.dark).toBeGreaterThanOrEqual(0.065);
});

test('the outer haze is blue and its patches are pink', async ({ page }) => {
  await openMap(page);

  for (const radius of [38000, 44000]) {
    const quartiles = quartileMedians(await ringColour5(page, radius), blueLessRed);
    console.log(`outer haze ${radius}`, quartiles);
    expect(quartiles.dark).toBeGreaterThanOrEqual(0.1);
    // Only the ring at 38,000 holds a bright ceiling. The glow tint gives the ring at
    // 38,000 its blue floor. The same tint lifts blue less red over the whole ring at
    // 44,000, so a bright ceiling at 44,000 conflicts with the dark floor at 44,000.
    if (radius === 38000) {
      expect(quartiles.bright).toBeLessThanOrEqual(0.02);
    }
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

  expect(grain).toBeGreaterThan(0.04);
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
    expect(measure).toBeGreaterThanOrEqual(0.05);
    expect(measure).toBeLessThanOrEqual(0.13);
  }
});

test('the clouds give the haze chunks from the side', async ({ page }) => {
  await openMap(page, SIDE_CHUNK_VIEW);

  for (const block of SIDE_BLOCKS) {
    const measure = await bandPass(page, block);
    console.log('chunks from the side', { block, measure });
    expect(measure).toBeGreaterThanOrEqual(0.05);
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

test('the clouds reach the rim', async ({ page }) => {
  await openMap(page);

  const medianWith = await ringMedian5(page, RIM_RADIUS);
  const ninetiethWith = (await ringSpread(page, RIM_RADIUS)).ninetieth;
  await page.evaluate(() => {
    window.__galaxyMap?.setPasses?.({ clouds: false });
    window.__galaxyMap?.drawNow?.();
  });
  const medianWithout = await ringMedian5(page, RIM_RADIUS);
  const ninetiethWithout = (await ringSpread(page, RIM_RADIUS)).ninetieth;
  console.log('clouds at the rim', {
    medianWith,
    medianWithout,
    medianLift: medianWith - medianWithout,
    ninetiethWith,
    ninetiethWithout,
    ninetiethLift: ninetiethWith - ninetiethWithout,
  });

  // The brightness spread moves light from the median to the puffs, so the 90th
  // percentile carries the larger part of the lift.
  expect(ninetiethWith - ninetiethWithout).toBeGreaterThanOrEqual(0.02);
  expect(medianWith - medianWithout).toBeGreaterThanOrEqual(0.005);
});

test('the puffs at the rim stand apart', async ({ page }) => {
  await openMap(page);

  const spread = await ringSpread(page, RIM_RADIUS);
  console.log('rim puffs', {
    tenth: spread.tenth,
    ninetieth: spread.ninetieth,
    ratio: spread.ninetieth / spread.tenth,
  });

  // The ratio test cannot fail if the 10th percentile is zero or below, so check
  // that the dim end of the ring carries light first.
  expect(spread.tenth).toBeGreaterThan(0);
  // The frame reads 1.76. The model carries no density contrast at 44,000 light
  // years, so a larger spread puts light in empty space. The floor of 1.6 still
  // fails on the tree before `far-view-colour-and-texture`, which read 1.45.
  expect(spread.ninetieth).toBeGreaterThanOrEqual(1.6 * spread.tenth);
});

test('the sum of the sprites stays bounded', async ({ page }) => {
  await openMap(page, BOUNDED_SUM_VIEW);

  const withClouds = await meanLuminanceFrame(page);
  await page.evaluate(() => {
    window.__galaxyMap?.setPasses?.({ clouds: false });
    window.__galaxyMap?.drawNow?.();
  });
  const withoutClouds = await meanLuminanceFrame(page);
  console.log('bounded sum', { withClouds, withoutClouds });

  // The helper gives -1 if the page has no readRect, and two of those subtract to
  // zero, which passes a ceiling. Check that both readings are real first.
  expect(withClouds).toBeGreaterThanOrEqual(0);
  expect(withoutClouds).toBeGreaterThanOrEqual(0);
  expect(withClouds - withoutClouds).toBeLessThanOrEqual(0.1);
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
