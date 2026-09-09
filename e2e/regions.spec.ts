import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { GALACTIC_CENTRE, openMap, projectPoint } from './helpers';

test.use({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });

/** A view inside the band where the overlay draws in full. */
const MEDIUM_DISTANCE = 10000;
/** A view below the fade out, where the overlay draws nothing. */
const CLOSE_DISTANCE = 1500;

/** Two plane points, one on a boundary and one away from every boundary. */
interface BoundarySample {
  /** The midpoint of the longest run, in game coordinates. */
  readonly onBoundary: [number, number, number];
  /** A point at least 1,000 light years from every run, in game coordinates. */
  readonly away: [number, number, number];
  /** The distance from the boundary point to the nearest run, in light years. */
  readonly onBoundaryGap: number;
  /** The distance from the away point to the nearest run, in light years. */
  readonly awayClearance: number;
}

/**
 * Reads the boundary set out of the page and picks the two plane points the readings
 * compare. The page holds the set the worker traced, so the test measures the data the
 * map draws. The away point sits near the boundary point and at nearly the same
 * galactocentric radius, so the galaxy under the two readings is as alike as the map
 * allows.
 */
async function boundarySample(page: Page): Promise<BoundarySample> {
  const sample = await page.evaluate((centre) => {
    const positions = window.__galaxyMap?.regionLinePositions?.();
    if (positions === undefined || positions.length === 0) return null;

    const gapTo = (x: number, z: number): number => {
      let shortest = Number.POSITIVE_INFINITY;
      for (let index = 0; index < positions.length; index += 6) {
        const x0 = positions[index] as number;
        const z0 = positions[index + 2] as number;
        const dx = (positions[index + 3] as number) - x0;
        const dz = (positions[index + 5] as number) - z0;
        const length = dx * dx + dz * dz;
        let t = length === 0 ? 0 : ((x - x0) * dx + (z - z0) * dz) / length;
        if (t < 0) t = 0;
        if (t > 1) t = 1;
        const gap = Math.hypot(x - (x0 + t * dx), z - (z0 + t * dz));
        if (gap < shortest) shortest = gap;
      }
      return shortest;
    };

    let best = 0;
    let bestIndex = 0;
    for (let index = 0; index < positions.length; index += 6) {
      const dx = (positions[index + 3] as number) - (positions[index] as number);
      const dz = (positions[index + 5] as number) - (positions[index + 2] as number);
      const length = Math.hypot(dx, dz);
      if (length > best) {
        best = length;
        bestIndex = index;
      }
    }
    const onBoundary: [number, number, number] = [
      ((positions[bestIndex] as number) + (positions[bestIndex + 3] as number)) / 2,
      0,
      ((positions[bestIndex + 2] as number) + (positions[bestIndex + 5] as number)) / 2,
    ];

    // The galactocentric radius is the distance from the model centre in the plane.
    const radiusOf = (x: number, z: number): number =>
      Math.hypot(x - centre[0], z - centre[2]);
    const cursorRadius = radiusOf(onBoundary[0], onBoundary[2]);
    let away: [number, number, number] = [onBoundary[0], 0, onBoundary[2]];
    let awayClearance = 0;
    for (let step = 0; step < 72; step += 1) {
      const angle = (2 * Math.PI * step) / 72;
      for (const range of [1200, 1600, 2000, 2400]) {
        const x = onBoundary[0] + range * Math.cos(angle);
        const z = onBoundary[2] + range * Math.sin(angle);
        if (Math.abs(radiusOf(x, z) - cursorRadius) > 400) continue;
        const clearance = gapTo(x, z);
        if (clearance > awayClearance) {
          awayClearance = clearance;
          away = [x, 0, z];
        }
      }
    }

    return {
      onBoundary,
      away,
      onBoundaryGap: gapTo(onBoundary[0], onBoundary[2]),
      awayClearance,
    };
  }, GALACTIC_CENTRE);

  if (sample === null) throw new Error('the page holds no region boundary set');
  return sample;
}

/** Reads the shader source of a file in the tree. */
function shaderSource(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../src/render/shaders/${name}`, import.meta.url)),
    'utf8',
  );
}

/**
 * The brightest of the 3 by 3 pixels at a CSS pixel. A line one device pixel wide can
 * fall on either side of a pixel centre, so the reading takes the pixel the line
 * lands on rather than the one the maths names.
 */
async function brightestNear(
  page: Page,
  point: { x: number; y: number },
): Promise<number> {
  return page.evaluate((where) => {
    const map = window.__galaxyMap;
    if (map?.readRect === undefined) return -1;
    const bytes = map.readRect(Math.round(where.x) - 1, Math.round(where.y) - 1, 3, 3);
    let bright = 0;
    for (let index = 0; index < bytes.length; index += 4) {
      const value =
        (0.2126 * (bytes[index] as number) +
          0.7152 * (bytes[index + 1] as number) +
          0.0722 * (bytes[index + 2] as number)) /
        255;
      if (value > bright) bright = value;
    }
    return bright;
  }, point);
}

/**
 * The frame as a PNG data URL. The reading takes the canvas alone. Do not go back to an
 * element screenshot of `#map`: that captures the page clipped to the canvas box, so it
 * also carries the label overlay above it. The labels stay at close zoom while the
 * boundary lines fade out, and these comparisons are about the lines.
 */
async function canvasImage(page: Page): Promise<string> {
  return page.evaluate(() => {
    const canvas = document.getElementById('map');
    if (!(canvas instanceof HTMLCanvasElement)) return '';
    return canvas.toDataURL('image/png');
  });
}

/** Switches passes and draws a frame. */
async function setPasses(page: Page, passes: Record<string, boolean>): Promise<void> {
  await page.evaluate((next) => {
    window.__galaxyMap?.setPasses?.(next);
    window.__galaxyMap?.drawNow?.();
  }, passes);
}

/** Moves the view to a plane point and draws a frame. */
async function look(
  page: Page,
  cursor: [number, number, number],
  distance: number,
): Promise<void> {
  await page.evaluate(
    (job) => {
      window.__galaxyMap?.setView?.({
        cursor: job.cursor as [number, number, number],
        distance: job.distance,
        yaw: 0,
        pitch: 35,
      });
      window.__galaxyMap?.drawNow?.();
    },
    { cursor, distance },
  );
}

test('the region shaders compile', async ({ page }) => {
  await openMap(page);
  const error = await page.evaluate(
    (sources) => {
      const compile = window.__galaxyMap?.compileTestProgram;
      if (compile === undefined) return 'the page has no compile hook';
      return compile(sources.vertex, sources.fragment);
    },
    { vertex: shaderSource('regions.vert'), fragment: shaderSource('regions.frag') },
  );
  expect(error).toBeNull();
});

test('a boundary is visible at medium zoom', async ({ page }) => {
  await openMap(page);
  const sample = await boundarySample(page);
  console.log('the boundary sample', sample);
  expect(sample.onBoundaryGap).toBeLessThan(25);
  expect(sample.awayClearance).toBeGreaterThan(1000);

  await look(page, sample.onBoundary, MEDIUM_DISTANCE);

  const onScreen = await projectPoint(page, sample.onBoundary);
  const awayScreen = await projectPoint(page, sample.away);
  const withOverlay = {
    boundary: await brightestNear(page, onScreen),
    away: await brightestNear(page, awayScreen),
  };
  await setPasses(page, { regions: false });
  const withoutOverlay = {
    boundary: await brightestNear(page, onScreen),
    away: await brightestNear(page, awayScreen),
  };
  console.log('the boundary reading', { withOverlay, withoutOverlay });

  const lift = withOverlay.boundary - withOverlay.away;
  expect(lift).toBeGreaterThanOrEqual(0.05);
  // The two points are more than 1,000 light years apart, so the galaxy's own light
  // differs between them. The reading with the overlay off says how much of the
  // difference the background carries, and the overlay must carry most of it.
  expect(Math.abs(withoutOverlay.boundary - withoutOverlay.away)).toBeLessThan(
    lift / 5,
  );
});

test('nothing at the far view', async ({ page }) => {
  await openMap(page);
  await page.evaluate(() => {
    window.__galaxyMap?.drawNow?.();
  });
  const withOverlay = await canvasImage(page);
  await setPasses(page, { regions: false });
  const withoutOverlay = await canvasImage(page);

  expect(withOverlay).toBe(withoutOverlay);
});

test('nothing at the closest zoom', async ({ page }) => {
  await openMap(page);
  const sample = await boundarySample(page);
  await look(page, sample.onBoundary, CLOSE_DISTANCE);
  const withOverlay = await canvasImage(page);
  await setPasses(page, { regions: false });
  const withoutOverlay = await canvasImage(page);

  expect(withOverlay).toBe(withoutOverlay);
});

test('the switch removes both parts', async ({ page }) => {
  await openMap(page, '#c=15,0,25895&d=20000&p=35&y=0');
  await page.evaluate(() => {
    window.__galaxyMap?.drawNow?.();
  });
  const withOverlay = await canvasImage(page);
  expect(await page.locator('.region-label').count()).toBeGreaterThan(0);

  await setPasses(page, { regions: false });
  const withoutOverlay = await canvasImage(page);

  expect(await page.locator('.region-label').count()).toBe(0);
  expect(withOverlay).not.toBe(withoutOverlay);
});

test('the switch is inert where nothing draws', async ({ page }) => {
  await openMap(page, '#c=15,0,25895&d=60000&p=35&y=0');
  await page.evaluate(() => {
    window.__galaxyMap?.drawNow?.();
  });
  const withOverlay = await canvasImage(page);
  await setPasses(page, { regions: false });
  const withoutOverlay = await canvasImage(page);

  expect(withOverlay).toBe(withoutOverlay);
});
