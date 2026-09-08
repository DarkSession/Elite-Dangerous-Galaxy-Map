import { expect, test } from '@playwright/test';
import { luminanceAt, openMap, projectPoint } from './helpers';

test.use({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });

const GALACTIC_CENTRE: [number, number, number] = [15, -35, 25895];
const SOL: [number, number, number] = [0, 0, 0];
/** Outside the disc and inside the default view. */
const OUTSIDE: [number, number, number] = [-45000, 0, 0];
/** Between two arms, where the game's map holds 8 percent of the density at Sol. */
const GAP: [number, number, number] = [13736, 0, 2116];
/** 49,000 light years from the centre, past the painted rim. */
const HALO: [number, number, number] = [-48985, 0, 25895];

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
  console.log('luminance', {
    centreLuminance,
    solLuminance,
    outsideLuminance,
    redMinusBlue,
  });

  expect(centreLuminance).toBeGreaterThan(0.8);
  expect(centreLuminance).toBeLessThan(0.97);
  expect(redMinusBlue).toBeGreaterThan(0.08);
  expect(solLuminance).toBeGreaterThan(0.2);
  expect(outsideLuminance).toBeLessThan(0.12);
});

test('the space between the arms keeps its light', async ({ page }) => {
  await openMap(page);

  const gapLuminance = await luminanceAt(page, await projectPoint(page, GAP));
  const solLuminance = await luminanceAt(page, await projectPoint(page, SOL));
  console.log('gap luminance', { gapLuminance, solLuminance });

  expect(gapLuminance).toBeGreaterThan(0.1);
  expect(gapLuminance).toBeLessThan(solLuminance);
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

  expect(withGlow - withoutGlow).toBeGreaterThanOrEqual(0.05);
  expect(withGlow).toBeLessThan(solLuminance);
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

test('the default view matches the baseline image', async ({ page }) => {
  await openMap(page);
  await expect(page.locator('#map')).toHaveScreenshot('default-view.png', {
    maxDiffPixelRatio: 0.02,
  });
});
