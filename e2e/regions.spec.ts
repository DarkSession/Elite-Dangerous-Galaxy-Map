import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  GALACTIC_CENTRE,
  openMap,
  projectPoint,
  readRegionLabelRanges,
  settleLabels,
} from './helpers';
import type { RegionLabelRange } from './helpers';
import {
  ONE_CHAIN_POINT,
  SHARP_CORNER,
  TRACED_CORNER,
  TRACED_CROSSING,
} from './region-views';
import type { ChosenView, CornerChoice, CrossingChoice } from './region-views';

test.use({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });

/** A view inside the band where the overlay draws in full. */
const MEDIUM_DISTANCE = 15000;

/**
 * The close end of the range band, in light years. The band is the range band and not
 * the zoom band: the centre of the frame sits at the cursor, so its range is the zoom. A
 * line draws in full at 12,000 and draws nothing at 4,000.
 *
 * At 4,000 light years the reading is a window around the centre and not the whole
 * frame. A line near the horizon is over 8,000 light years off and does draw there,
 * which is what the range fade is for.
 */
const CLOSE_END_FULL = 12000;
const CLOSE_END_NONE = 4000;

/**
 * The range floor, in light years. A line at this range or nearer draws nothing, and no
 * label names a region whose anchor is inside it. `src/render/region-pass.ts` owns it.
 */
const RANGE_FLOOR = 8000;

/**
 * The three zooms the close end reading takes, in light years. The range fade is 1 at
 * 12,000, 0.5 at 10,000 and 0 at 7,000, which is below the 8,000 it reaches 0 at.
 */
const FADE_DISTANCES = [12000, 10000, 7000];

/**
 * The three zooms the far end reading takes, in light years. The zoom fade is 1 at
 * 20,000, 0.5 at 25,000 and 0 at 31,000, which is above the 30,000 it reaches 0 at.
 */
const FAR_FADE_DISTANCES = [20000, 25000, 31000];

/** The view the host switch is read at. The overlay draws in full there. */
const SWITCH_VIEW = '#c=15,0,25895&d=20000&p=35&y=0';

/** How many CSS pixels around a point the close end reading takes. */
const READ_RADIUS = 8;

/** Two plane points, one on a boundary and one away from every boundary. */
interface BoundarySample {
  /** The midpoint of the longest segment, in game coordinates. */
  readonly onBoundary: [number, number, number];
  /** A point at least 1,000 light years from every chain, in game coordinates. */
  readonly away: [number, number, number];
  /** The distance from the boundary point to the nearest chain, in light years. */
  readonly onBoundaryGap: number;
  /** The distance from the away point to the nearest chain, in light years. */
  readonly awayClearance: number;
}

/**
 * Reads the boundary set out of the page and picks the two plane points the readings
 * compare. The page holds the set the worker traced, so the test measures the data the
 * map draws. The set stores the vertices of a chain once, so the reader walks the
 * chains through the first and the last index of each one: a pair of vertices is a
 * segment only inside one chain. The away point sits near the boundary point and at
 * nearly the same galactocentric radius, so the galaxy under the two readings is as
 * alike as the map allows.
 */
async function boundarySample(page: Page): Promise<BoundarySample> {
  const sample = await page.evaluate((centre) => {
    const positions = window.__galaxyMap?.regionLinePositions?.();
    const chains = window.__galaxyMap?.regionLineChains?.();
    if (positions === undefined || chains === undefined) return null;
    if (positions.length === 0 || chains.first.length === 0) return null;

    const forEachSegment = (
      visit: (x0: number, z0: number, x1: number, z1: number) => void,
    ): void => {
      for (let chain = 0; chain < chains.first.length; chain += 1) {
        const first = chains.first[chain] as number;
        const last = chains.last[chain] as number;
        for (let vertex = first; vertex < last; vertex += 1) {
          visit(
            positions[vertex * 3] as number,
            positions[vertex * 3 + 2] as number,
            positions[(vertex + 1) * 3] as number,
            positions[(vertex + 1) * 3 + 2] as number,
          );
        }
      }
    };

    const gapTo = (x: number, z: number): number => {
      let shortest = Number.POSITIVE_INFINITY;
      forEachSegment((x0, z0, x1, z1) => {
        const dx = x1 - x0;
        const dz = z1 - z0;
        const length = dx * dx + dz * dz;
        let t = length === 0 ? 0 : ((x - x0) * dx + (z - z0) * dz) / length;
        if (t < 0) t = 0;
        if (t > 1) t = 1;
        const gap = Math.hypot(x - (x0 + t * dx), z - (z0 + t * dz));
        if (gap < shortest) shortest = gap;
      });
      return shortest;
    };

    // A grid of the vertices, so the search for a point away from every chain costs a
    // few cells and not all 68,000 vertices. The chains carry a vertex about every 5
    // light years, so the distance to the nearest vertex stands in for the distance to
    // the nearest chain while the search runs. The two points it chooses then get the
    // exact reading.
    const CELL = 300;
    const buckets = new Map<number, number[]>();
    const keyOf = (x: number, z: number): number =>
      Math.floor(x / CELL) * 100000 + Math.floor(z / CELL);
    for (let vertex = 0; vertex * 3 < positions.length; vertex += 1) {
      const key = keyOf(
        positions[vertex * 3] as number,
        positions[vertex * 3 + 2] as number,
      );
      const held = buckets.get(key);
      if (held === undefined) buckets.set(key, [vertex]);
      else held.push(vertex);
    }
    const nearestVertex = (x: number, z: number): number => {
      const cellX = Math.floor(x / CELL);
      const cellZ = Math.floor(z / CELL);
      let shortest = Number.POSITIVE_INFINITY;
      for (let ring = 0; ring <= 12; ring += 1) {
        for (let stepZ = -ring; stepZ <= ring; stepZ += 1) {
          for (let stepX = -ring; stepX <= ring; stepX += 1) {
            if (Math.max(Math.abs(stepX), Math.abs(stepZ)) !== ring) continue;
            const held = buckets.get((cellX + stepX) * 100000 + cellZ + stepZ);
            if (held === undefined) continue;
            for (const vertex of held) {
              const away = Math.hypot(
                x - (positions[vertex * 3] as number),
                z - (positions[vertex * 3 + 2] as number),
              );
              if (away < shortest) shortest = away;
            }
          }
        }
        if (shortest <= ring * CELL) break;
      }
      return shortest;
    };

    // The candidates are the longest segments, because a long segment sits where the
    // boundary is straight and the reading lands on the middle of the line.
    const candidates: { x: number; z: number; length: number }[] = [];
    forEachSegment((x0, z0, x1, z1) => {
      candidates.push({
        x: (x0 + x1) / 2,
        z: (z0 + z1) / 2,
        length: Math.hypot(x1 - x0, z1 - z0),
      });
    });
    candidates.sort((a, b) => b.length - a.length);

    // The galactocentric radius is the distance from the model centre in the plane.
    const radiusOf = (x: number, z: number): number =>
      Math.hypot(x - centre[0], z - centre[2]);
    let onBoundary: [number, number, number] | null = null;
    let away: [number, number, number] | null = null;
    for (const candidate of candidates.slice(0, 200)) {
      const cursorRadius = radiusOf(candidate.x, candidate.z);
      let clearest = 0;
      let best: [number, number, number] | null = null;
      for (let step = 0; step < 72; step += 1) {
        const angle = (2 * Math.PI * step) / 72;
        for (const range of [1200, 1600, 2000, 2400]) {
          const x = candidate.x + range * Math.cos(angle);
          const z = candidate.z + range * Math.sin(angle);
          if (Math.abs(radiusOf(x, z) - cursorRadius) > 400) continue;
          const clearance = nearestVertex(x, z);
          if (clearance > clearest) {
            clearest = clearance;
            best = [x, 0, z];
          }
        }
      }
      // The reading needs a point at least 1,000 light years from every chain. The
      // margin covers the step from the nearest vertex to the nearest segment.
      if (clearest >= 1200 && best !== null) {
        onBoundary = [candidate.x, 0, candidate.z];
        away = best;
        break;
      }
    }
    if (onBoundary === null || away === null) return null;

    return {
      onBoundary,
      away,
      onBoundaryGap: gapTo(onBoundary[0], onBoundary[2]),
      awayClearance: gapTo(away[0], away[2]),
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
 * The brightest of the 3 by 3 pixels at a CSS pixel. The core of the line is 2 CSS
 * pixels wide and can fall on either side of a pixel centre, so the reading takes the
 * pixel the line lands on rather than the one the maths names.
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

/** The luminance of every pixel of a rectangle, row by row, the top row first. */
async function luminanceRect(
  page: Page,
  rect: { x: number; y: number; width: number; height: number },
): Promise<number[]> {
  return page.evaluate((where) => {
    const map = window.__galaxyMap;
    if (map?.readRect === undefined) return [];
    const bytes = map.readRect(where.x, where.y, where.width, where.height);
    const values: number[] = [];
    for (let index = 0; index < bytes.length; index += 4) {
      values.push(
        (0.2126 * (bytes[index] as number) +
          0.7152 * (bytes[index + 1] as number) +
          0.0722 * (bytes[index + 2] as number)) /
          255,
      );
    }
    return values;
  }, rect);
}

/** How many device pixels the drawing buffer holds per CSS pixel. */
async function devicePixelRatio(page: Page): Promise<number> {
  return page.evaluate(() => {
    const size = window.__galaxyMap?.drawingBufferSize?.();
    const canvas = document.getElementById('map');
    if (size === undefined || !(canvas instanceof HTMLCanvasElement)) return 1;
    return size[0] / Math.max(1, canvas.clientWidth);
  });
}

/**
 * A digest of the frame. The reading takes the canvas alone. Do not go back to an
 * element screenshot of `#map`: that captures the page clipped to the canvas box, so it
 * also carries the label overlay above it, and these comparisons are about the lines.
 * The comparison is of the digest and not of the image, so a failure prints a line and
 * not a megabyte of base64.
 */
async function canvasDigest(page: Page): Promise<string> {
  const image = await page.evaluate(() => {
    const canvas = document.getElementById('map');
    if (!(canvas instanceof HTMLCanvasElement)) return '';
    return canvas.toDataURL('image/png');
  });
  return createHash('sha256').update(image).digest('hex');
}

/** Switches passes and draws a frame. */
async function setPasses(page: Page, passes: Record<string, boolean>): Promise<void> {
  await page.evaluate((next) => {
    window.__galaxyMap?.setPasses?.(next);
    window.__galaxyMap?.drawNow?.();
  }, passes);
}

/** Reads the region overlay switch off the handle. */
async function regionsVisible(page: Page): Promise<boolean | null> {
  return page.evaluate(() => window.galaxyMap?.areRegionsVisible() ?? null);
}

/** Turns the region overlay on or off through the handle, and draws a frame. */
async function setRegionsVisible(page: Page, on: unknown): Promise<void> {
  await page.evaluate((next) => {
    window.galaxyMap?.setRegionsVisible(next as boolean);
    window.__galaxyMap?.drawNow?.();
  }, on);
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

/** Takes a whole view a unit test chose, and draws a frame. */
async function lookFrom(page: Page, view: ChosenView): Promise<void> {
  await page.evaluate((next) => {
    window.__galaxyMap?.setView?.({
      cursor: next.cursor as [number, number, number],
      distance: next.distance,
      yaw: next.yaw,
      pitch: next.pitch,
    });
    window.__galaxyMap?.drawNow?.();
  }, view);
}

/** The shortest distance from a point to a line piece, in pixels. */
function gapToSegment(
  point: { x: number; y: number },
  from: { x: number; y: number },
  to: { x: number; y: number },
): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const span = dx * dx + dy * dy;
  let part =
    span === 0 ? 0 : ((point.x - from.x) * dx + (point.y - from.y) * dy) / span;
  if (part < 0) part = 0;
  if (part > 1) part = 1;
  return Math.hypot(point.x - (from.x + part * dx), point.y - (from.y + part * dy));
}

test('the region shaders compile', async ({ page }) => {
  await openMap(page);
  const ribbon = await page.evaluate(
    (sources) => {
      const compile = window.__galaxyMap?.compileTestProgram;
      if (compile === undefined) return 'the page has no compile hook';
      return compile(sources.vertex, sources.fragment);
    },
    { vertex: shaderSource('regions.vert'), fragment: shaderSource('regions.frag') },
  );
  expect(ribbon).toBeNull();

  for (const fragment of ['region-composite.frag']) {
    const built = await page.evaluate(
      (sources) => {
        const compile = window.__galaxyMap?.compileTestProgram;
        if (compile === undefined) return 'the page has no compile hook';
        return compile(sources.vertex, sources.fragment);
      },
      {
        vertex: shaderSource('fullscreen.vert'),
        fragment: shaderSource(fragment),
      },
    );
    expect(built, fragment).toBeNull();
  }
});

test('the coverage buffer holds the whole drawing buffer', async ({ page }) => {
  await openMap(page);

  // The overlay draws nothing at 30,000 light years and above, so the target takes no
  // storage before the first draw of the band.
  await look(page, ONE_CHAIN_POINT.point, 40000);
  await setPasses(page, { regions: true });
  const far = await page.evaluate(
    () => window.galaxyMap?.debug.regionCoverageSize() ?? null,
  );
  expect(far).toBeNull();

  await look(page, ONE_CHAIN_POINT.point, MEDIUM_DISTANCE);
  await setPasses(page, { regions: true });
  const reading = await page.evaluate(() => ({
    coverage: window.galaxyMap?.debug.regionCoverageSize() ?? null,
    buffer: window.galaxyMap?.debug.drawingBufferSize() ?? null,
  }));
  console.log('the coverage buffer', reading);

  // The coverage is a point-sampled ridge and not a band limited field, so a smaller
  // target would move the peak of a straight run with the line's own phase.
  expect(reading.coverage).toEqual(reading.buffer);
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
  const withOverlay = await canvasDigest(page);
  await setPasses(page, { regions: false });
  const withoutOverlay = await canvasDigest(page);

  expect(withOverlay).toBe(withoutOverlay);
});

test('the boundary draws in full at the close end of the band', async ({ page }) => {
  await openMap(page);

  // The centre is the plane point a unit test found whose 8 CSS pixel window holds one
  // chain and no other at every zoom this file reads it at.
  //
  // 12,000 light years is the closest range at which the line draws in full: the range
  // fade reaches 1 there and the zoom fade leaves 12,000 at 1.
  await look(page, ONE_CHAIN_POINT.point, CLOSE_END_FULL);
  await setPasses(page, { regions: true });
  const drawn = await canvasDigest(page);
  await setPasses(page, { regions: false });
  const bare = await canvasDigest(page);
  expect(drawn, `at ${CLOSE_END_FULL} light years`).not.toBe(bare);

  // At 4,000 light years the centre sits at the cursor, where the range fade is 0, so
  // the window around it is the frame it was without the overlay. The rest of the frame
  // is not read: a line near the horizon is over 8,000 light years off.
  await look(page, ONE_CHAIN_POINT.point, CLOSE_END_NONE);
  const closeChange = await contributionNear(page, ONE_CHAIN_POINT.point);
  expect(closeChange, `at ${CLOSE_END_NONE} light years`).toBe(0);
  // The clause is about the anchor's range and not about the zoom. The frame still
  // holds plane points tens of thousands of light years up it, so regions far up the
  // frame do carry names; what has gone is every name near the cursor.
  const labels = await readRegionLabelRanges(page);
  console.log('the labels at the close end', labels);
  for (const label of labels) {
    expect(label.rangeLy, label.name).toBeGreaterThan(RANGE_FLOOR);
  }
});

/**
 * The overlay's own contribution at a plane point: the largest change it makes to any
 * pixel within a reach of the point's projection. The overlay draws at less than full
 * opacity, so an absolute reading would follow the galaxy under it.
 */
async function contributionNear(
  page: Page,
  point: [number, number, number],
  reach = READ_RADIUS,
): Promise<number> {
  const screen = await projectPoint(page, point);
  const rect = {
    x: Math.round(screen.x) - reach,
    y: Math.round(screen.y) - reach,
    width: reach * 2 + 1,
    height: reach * 2 + 1,
  };
  await setPasses(page, { regions: true });
  const withOverlay = await luminanceRect(page, rect);
  await setPasses(page, { regions: false });
  const withoutOverlay = await luminanceRect(page, rect);
  await setPasses(page, { regions: true });

  let largest = 0;
  for (let index = 0; index < withOverlay.length; index += 1) {
    const change = Math.abs(
      (withOverlay[index] as number) - (withoutOverlay[index] as number),
    );
    if (change > largest) largest = change;
  }
  return largest;
}

test('the overlay fades out across the close end of the band', async ({ page }) => {
  await openMap(page);

  const readings: number[] = [];
  for (const distance of FADE_DISTANCES) {
    await look(page, ONE_CHAIN_POINT.point, distance);
    readings.push(await contributionNear(page, ONE_CHAIN_POINT.point));
  }
  console.log('the close end reading', { FADE_DISTANCES, readings });

  const [full, half, none] = readings as [number, number, number];
  // The centre sits at the cursor, so its range is the zoom. The range fade is 1 at
  // 12,000 light years, 0.5 at 10,000 and 0 at 7,000. The bounds are wide because the
  // reading is a pixel of the frame and not the fade itself. The half width is `base` at
  // both 12,000 and 10,000, so the width rule does not enter the ratio.
  expect(full, 'at 12,000 light years').toBeGreaterThan(0.05);
  expect(half, 'at 10,000 light years').toBeGreaterThan(full / 5);
  expect(half, 'at 10,000 light years').toBeLessThan((full * 4) / 5);
  expect(none, 'at 7,000 light years').toBe(0);
});

test('the overlay fades out across the far end of the zoom band', async ({ page }) => {
  await openMap(page);

  const readings: number[] = [];
  for (const distance of FAR_FADE_DISTANCES) {
    await look(page, ONE_CHAIN_POINT.point, distance);
    readings.push(await contributionNear(page, ONE_CHAIN_POINT.point));
  }
  console.log('the far end reading', { FAR_FADE_DISTANCES, readings });

  const [full, half, none] = readings as [number, number, number];
  // The range fade is 1 at all three, because the centre's range is the zoom and every
  // zoom here is 12,000 light years or more. The zoom fade is 1 at 20,000, 0.5 at 25,000
  // and 0 at 31,000. The band narrows over the three zooms, and the reading is the
  // largest difference in the window, which sits at the middle of the line and follows
  // the opacity and not the width.
  expect(full, 'at 20,000 light years').toBeGreaterThan(0.05);
  expect(half, 'at 25,000 light years').toBeGreaterThan(full / 5);
  expect(half, 'at 25,000 light years').toBeLessThan((full * 4) / 5);
  expect(none, 'at 31,000 light years').toBe(0);
});

/**
 * How many pixels of a band of rows the overlay changed. The band is stated as two
 * shares of the frame height, from the top.
 */
async function changedInRows(
  page: Page,
  fromShare: number,
  toShare: number,
): Promise<number> {
  const ratio = await devicePixelRatio(page);
  const size = await page.evaluate(
    () => window.__galaxyMap?.drawingBufferSize?.() ?? [0, 0],
  );
  const height = size[1] as number;
  const rect = {
    x: 0,
    y: Math.round(height * fromShare),
    width: size[0] as number,
    height: Math.max(1, Math.round(height * (toShare - fromShare))),
  };
  expect(ratio, 'the reading takes one device pixel per CSS pixel').toBe(1);
  await setPasses(page, { regions: true });
  const withOverlay = await luminanceRect(page, rect);
  await setPasses(page, { regions: false });
  const withoutOverlay = await luminanceRect(page, rect);
  await setPasses(page, { regions: true });

  let changed = 0;
  for (let index = 0; index < withOverlay.length; index += 1) {
    const change = Math.abs(
      (withOverlay[index] as number) - (withoutOverlay[index] as number),
    );
    if (change > 0.001) changed += 1;
  }
  return changed;
}

test('a far line still draws while the near line is gone', async ({ page }) => {
  await openMap(page);
  // A pitch of 30 degrees puts the horizon at the top edge, because the vertical field
  // of view is 60 degrees, so every row of the frame reads the plane. At a zoom of
  // 4,000 light years the camera sits 2,000 above the plane. The rows whose plane point
  // is beyond 12,000 light years are the top 17.8 per cent, and the rows whose plane
  // point is under 8,000 are everything below 25.9 per cent.
  await page.evaluate(() => {
    window.__galaxyMap?.setView?.({
      cursor: [0, 0, 0],
      distance: 4000,
      yaw: 0,
      pitch: 30,
    });
    window.__galaxyMap?.drawNow?.();
  });

  const top = await changedInRows(page, 0, 0.1);
  const lower = await changedInRows(page, 0.35, 1);
  console.log('the changed pixels by band', { top, lower });

  expect(top, 'the top 10 per cent of the rows').toBeGreaterThan(0);
  expect(lower, 'the rows below 35 per cent').toBe(0);
});

/**
 * The luminance of the band's outer tone, which the composite writes over the frame
 * outside the core. `src/render/region-pass.ts` holds the tone itself.
 */
const TONE_LUMINANCE = 0.2126 * 0.74 + 0.7152 * 0.55 + 0.0722 * 0.43;

/** The luminance of the core tone, which the middle quarter of the band carries. */
const CORE_TONE_LUMINANCE = 0.2126 * 0.9 + 0.7152 * 0.79 + 0.0722 * 0.52;

/** The opacity the band draws at, for both tones. */
const BAND_OPACITY = 0.62;

/** One step of an 8-bit channel, which is the frame's own quantisation. */
const EIGHT_BIT_STEP = 1 / 255;

/** What one row of pixels across the band gives. */
interface BandReading {
  /** How wide the run of changed pixels is, in CSS pixels. */
  readonly runCss: number;
  /** How wide the change is at half the outer plateau, in CSS pixels. */
  readonly widthCss: number;
  /** The alpha of the outer plateau, which is the reference the width is read against. */
  readonly plateauAlpha: number;
  /** The largest alpha the overlay drew in the row, which is the core's own reading. */
  readonly peakAlpha: number;
  /** The luminance at the middle of the run, with the overlay on. */
  readonly middleLuminance: number;
  /** The luminance of the outer plateau, with the overlay on. */
  readonly plateauLuminance: number;
  /** The luminance of every pixel of the row, with the overlay and without it. */
  readonly withOverlay: number[];
  readonly withoutOverlay: number[];
  /** Where the middle of the run sits in those two arrays. */
  readonly middleIndex: number;
  /** How many device pixels one CSS pixel holds in those two arrays. */
  readonly ratio: number;
}

/**
 * The width of the band's edge at a half width, in CSS pixels. It is a quarter of the
 * half width, which `src/render/region-pass.ts` owns as a share and no longer as a count
 * of CSS pixels: the half width follows the range, so a fixed count would take a growing
 * share of a narrowing band.
 */
function bandEdgeCssAt(halfWidthCss: number): number {
  return 0.25 * halfWidthCss;
}

/**
 * Reads one row of pixels across the chain at the centre of the frame, with the overlay
 * on and off.
 *
 * The row gives the band's own alpha and not its luminance. The composite blends one
 * tone over the frame, so a pixel reads `alpha * tone + (1 - alpha) * frame` on every
 * channel and therefore on the luminance as well. The alpha is what the width and the
 * plateau are properties of, and the frame under the band is not the same at two views.
 *
 * The profile is read through the **outer** tone. The largest reading of a row sits at
 * the middle of the line, where the tone is the core one, so half of it is not half of
 * the profile the outer tone draws. The reference is therefore the reading at a gap of
 * `halfWidth - edge - 1` CSS pixels from the middle of the run, which is inside the flat
 * top and one CSS pixel clear of the edge, where the profile alpha is 1 and the tone is
 * the outer one.
 */
async function readBandRow(
  page: Page,
  choice: CrossingChoice,
  reachCss = 20,
  halfWidthCss = 17.28,
): Promise<BandReading> {
  await lookFrom(page, choice.view);
  const ratio = await devicePixelRatio(page);
  const centre = await projectPoint(page, choice.point);
  // The row reaches past the whole band on both sides, so the run of changed pixels
  // ends inside the window at every viewport the band's share gives.
  const reach = Math.round(reachCss * ratio);
  const row = {
    x: Math.round(centre.x * ratio) - reach,
    y: Math.round(centre.y * ratio),
    width: reach * 2,
    height: 1,
  };
  await setPasses(page, { regions: true });
  const withOverlay = await luminanceRect(page, row);
  await setPasses(page, { regions: false });
  const withoutOverlay = await luminanceRect(page, row);
  await setPasses(page, { regions: true });

  const changed = withOverlay.map(
    (value, index) => Math.abs(value - (withoutOverlay[index] as number)) > 0.001,
  );
  const runs: { start: number; end: number }[] = [];
  for (let index = 0; index < changed.length; index += 1) {
    if (changed[index] !== true) continue;
    const last = runs[runs.length - 1];
    if (last !== undefined && last.end === index - 1) last.end = index;
    else runs.push({ start: index, end: index });
  }
  expect(runs, 'one run of changed pixels').toHaveLength(1);
  const run = runs[0] as { start: number; end: number };

  // The alpha of each pixel, from the two readings and the band's **outer** tone.
  const alpha = withOverlay.map((value, index) => {
    const under = withoutOverlay[index] as number;
    const room = TONE_LUMINANCE - under;
    return Math.abs(room) < 0.05 ? 0 : (value - under) / room;
  });
  const peakAlpha = Math.max(...alpha);
  const middleIndex = Math.round((run.start + run.end) / 2);
  // The outer plateau, one CSS pixel inside the edge, read on both sides of the middle.
  const plateauGap = Math.round(
    (halfWidthCss - bandEdgeCssAt(halfWidthCss) - 1) * ratio,
  );
  const plateauAt = (step: number): number => middleIndex + step * plateauGap;
  // The window holds the whole band with room to spare, so both plateau points lie in
  // it. The reading fails here rather than later where a view puts the band on the edge
  // of the row: an index past the end gives `undefined`, and every comparison that reads
  // it then fails for a reason the message does not name.
  for (const step of [-1, 1]) {
    expect(
      plateauAt(step),
      'the plateau point lies inside the row',
    ).toBeGreaterThanOrEqual(0);
    expect(plateauAt(step), 'the plateau point lies inside the row').toBeLessThan(
      alpha.length,
    );
  }
  const plateauAlpha =
    ((alpha[plateauAt(-1)] as number) + (alpha[plateauAt(1)] as number)) / 2;
  const plateauLuminance =
    ((withOverlay[plateauAt(-1)] as number) + (withOverlay[plateauAt(1)] as number)) /
    2;

  // The half-maximum point on each side, walking out from the middle of the run and not
  // from the peak: the peak carries the core tone and the profile carries the outer one.
  const edge = (step: number): number => {
    let inside = middleIndex;
    while (
      inside + step >= 0 &&
      inside + step < alpha.length &&
      (alpha[inside + step] as number) >= plateauAlpha / 2
    ) {
      inside += step;
    }
    const outside = inside + step;
    const one = alpha[inside] as number;
    const two = (alpha[outside] as number) ?? 0;
    return inside + (step * (one - plateauAlpha / 2)) / (one - two);
  };

  return {
    runCss: (run.end - run.start + 1) / ratio,
    widthCss: (edge(1) - edge(-1)) / ratio,
    plateauAlpha,
    peakAlpha,
    middleLuminance: withOverlay[middleIndex] as number,
    plateauLuminance,
    withOverlay,
    withoutOverlay,
    middleIndex,
    ratio,
  };
}

/**
 * The base half width of the band at a viewport height, in CSS pixels. It is 1.6 per cent
 * of the height, clamped to 8 and 24, which `src/render/region-pass.ts` owns. The browser
 * test holds its own copy, because Playwright cannot import the renderer module: it
 * reaches the PNG of the detail grid, which only Vite can load.
 */
function baseHalfWidthCssAt(height: number): number {
  return Math.min(24, Math.max(8, 0.016 * height));
}

/**
 * The half width of the band at a viewport height and a range, in CSS pixels. The band
 * holds the base width in to the reference range of 12,000 light years and narrows as one
 * over the range beyond it, down to a floor of 2 CSS pixels.
 */
function halfWidthCssAt(height: number, rangeLy: number): number {
  const base = baseHalfWidthCssAt(height);
  return Math.min(base, Math.max(2, (base * 12000) / Math.max(rangeLy, 1)));
}

/**
 * The scenario "The band is the stated share of the viewport", at one viewport.
 *
 * The reading is the width at half the outer plateau. The alpha is
 * `smoothstep(0, 0.25, coverage)` and the coverage is `1 - gap / halfWidth`, so the alpha
 * falls to half at a gap of `0.875 * halfWidth` and the width at half maximum is
 * `1.75 * halfWidth`.
 *
 * The cursor sits on the reading point, so its range is the crossing view's own zoom of
 * 20,000 light years and the half width is `base * 12000 / 20000`.
 */
function bandShareTests(
  height: number,
  wholeBandCss: number,
  halfMaxCss: number,
): void {
  const wanted = halfWidthCssAt(height, TRACED_CROSSING.view.distance);
  test('reads the stated share of the viewport height', async ({ page }) => {
    await openMap(page);

    const reading = await readBandRow(page, TRACED_CROSSING, wholeBandCss, wanted);
    console.log('the band reading', {
      height,
      wanted,
      runCss: reading.runCss,
      widthCss: reading.widthCss,
      plateauAlpha: reading.plateauAlpha,
      peakAlpha: reading.peakAlpha,
    });

    // The core tone is lighter than the outer one, so the middle of the run stands
    // above the outer plateau.
    expect(reading.middleLuminance, 'middle').toBeGreaterThan(reading.plateauLuminance);
    // The reading is the composite alpha, that is the profile alpha times the opacity.
    // The plateau sits on the flat top, where the profile alpha is 1, so it reads the
    // band's own opacity.
    expect(reading.plateauAlpha, 'plateau alpha').toBeGreaterThan(BAND_OPACITY - 0.02);
    expect(reading.plateauAlpha, 'plateau alpha').toBeLessThan(BAND_OPACITY + 0.02);
    // The half-maximum width is `1.75 * halfWidth`, and the whole band, where the
    // contribution reaches 0, is twice the half width.
    expect(reading.widthCss, 'half-maximum width').toBeGreaterThan(halfMaxCss - 1);
    expect(reading.widthCss, 'half-maximum width').toBeLessThan(halfMaxCss + 1);
    expect(reading.runCss, 'whole band').toBeGreaterThan(wholeBandCss - 3);
    expect(reading.runCss, 'whole band').toBeLessThan(wholeBandCss + 3);
  });
}

test.describe('the band across a chain at 1920x1080', () => {
  test.use({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  // 1.6 per cent of 1,080 rows is 17.28, inside the clamp, and the range of 20,000 light
  // years takes it to 10.37, so the whole band is 20.7 and the half maximum is 18.1.
  bandShareTests(1080, 20.7, 18.1);
});

test.describe('the band across a chain at 1280x720', () => {
  test.use({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  // 1.6 per cent of 720 rows is 11.52, and the range takes it to 6.91, so the whole band
  // is 13.8 and the half maximum is 12.1.
  bandShareTests(720, 13.8, 12.1);
});

test.describe('the band across a chain at 640x360', () => {
  test.use({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
  // The clamp acts here: 1.6 per cent of 360 rows is 5.76, below the floor of 8, so the
  // base is 8. The range takes it to 4.80, so the whole band is 9.6 and the half maximum
  // is 8.4.
  bandShareTests(360, 9.6, 8.4);

  test('takes its base half width from the floor and not from the share', () => {
    expect(0.016 * 360).toBeCloseTo(5.76, 6);
    expect(baseHalfWidthCssAt(360)).toBe(8);
  });
});

test.describe('the two tones of the band at 3840x2160', () => {
  test.use({ viewport: { width: 3840, height: 2160 }, deviceScaleFactor: 1 });

  /** The mean of the two readings that sit the same gap each side of the middle. */
  function atGap(reading: BandReading, gapCss: number, overlay = true): number {
    const values = overlay ? reading.withOverlay : reading.withoutOverlay;
    const step = Math.round(gapCss * reading.ratio);
    const low = values[reading.middleIndex - step] as number;
    const high = values[reading.middleIndex + step] as number;
    return (low + high) / 2;
  }

  test('carries a lighter core inside a deeper outer part', async ({ page }) => {
    await openMap(page);

    // `base` is 24 at 2,160 rows and the crossing view's zoom of 20,000 light years takes
    // the half width to 14.4. The core's transition ends at `0.337 * halfWidth`, that is
    // 4.9; the flat top of the outer part runs to `0.75 * halfWidth`, that is 10.8; and
    // the band ends at 14.4. So 6 and 9 both sit on the outer plateau and 18 is outside.
    const halfWidth = halfWidthCssAt(2160, TRACED_CROSSING.view.distance);
    expect(halfWidth).toBeCloseTo(14.4, 6);
    const reading = await readBandRow(page, TRACED_CROSSING, 30, halfWidth);

    const middle = reading.withOverlay[reading.middleIndex] as number;
    const inner = atGap(reading, 6);
    const outer = atGap(reading, 9);
    const beyond = atGap(reading, 18);
    const off = atGap(reading, 18, false);
    console.log('the two tones', { middle, inner, outer, beyond, off });

    // The two tones lie over one background at one opacity, so the step between them is
    // `0.62 * (0.794 - 0.581)`, that is 0.132 of luminance.
    const step = BAND_OPACITY * (CORE_TONE_LUMINANCE - TONE_LUMINANCE);
    expect(middle - inner, 'core over outer').toBeGreaterThan(step - 0.02);
    expect(middle - inner, 'core over outer').toBeLessThan(step + 0.02);
    // The outer part is a plateau, so 6 and 9 CSS pixels read the same.
    expect(Math.abs(inner - outer), 'plateau').toBeLessThanOrEqual(EIGHT_BIT_STEP);
    // 18 CSS pixels is outside the 14.4 CSS pixel half width.
    expect(Math.abs(beyond - off), 'outside the band').toBeLessThanOrEqual(
      EIGHT_BIT_STEP,
    );
  });
});

/** What the join reading gives for one chosen corner. */
interface JoinReading {
  /** The largest alpha the overlay writes within the reach of the bend. */
  readonly bendAlpha: number;
  /** The largest alpha it writes on the straight run of the same chain. */
  readonly straightAlpha: number;
  /** How many pixels the reading found on the drawn line inside the bend. */
  readonly insideCount: number;
  /** How many of those the overlay left unchanged. */
  readonly unchangedInside: number;
}

/**
 * Reads the overlay's own contribution around a corner and on a straight run of the same
 * chain, both from one frame.
 *
 * The reading is the band's **alpha** and not the change in luminance. The band adds
 * `alpha * (tone - background)` to a pixel, so a change in luminance follows the galaxy
 * under the pixel as well as the band over it. The bend and the comparison run sit tens of
 * CSS pixels apart, where the picture under them is not the same, and a reading of the
 * change there compares two backgrounds as much as two parts of the band.
 *
 * The reading also draws the band over an empty frame: every other pass goes off, so the
 * background under the bend and under the run is the same black and the alpha of a pixel
 * is its luminance over the band's own tone. The frame carries 8 bits a channel, and over
 * the galaxy one bit of luminance is about 2 per cent of the alpha, which is larger than
 * the difference this reading has to resolve.
 */
async function readJoin(page: Page, choice: CornerChoice): Promise<JoinReading> {
  await lookFrom(page, choice.view);
  /** Every pass of the picture under the band. */
  const scene = {
    volume: false,
    clouds: false,
    points: false,
    stars: false,
    glow: false,
    grid: false,
    systems: false,
  };
  // The reading radius belongs to the view. The join reads 8 CSS pixels past the edge of
  // the band and the sharpest corner of the traced set reads 6 past it, each the radius
  // its own search states.
  const reach = choice.reachPixels;

  const bend = await projectPoint(page, choice.bend);
  const bendLine: { x: number; y: number }[] = [];
  for (const point of choice.bendLine) {
    bendLine.push(await projectPoint(page, point));
  }
  const straightFrom = await projectPoint(page, choice.straightFrom);
  const straightTo = await projectPoint(page, choice.straightTo);

  // One rectangle holds the bend and the straight run, so both readings come from
  // one frame and the overlay switch moves once.
  const left = Math.floor(Math.min(bend.x, straightFrom.x, straightTo.x) - reach - 4);
  const top = Math.floor(Math.min(bend.y, straightFrom.y, straightTo.y) - reach - 4);
  const rect = {
    x: left,
    y: top,
    width: Math.ceil(Math.max(bend.x, straightFrom.x, straightTo.x) + reach + 4) - left,
    height: Math.ceil(Math.max(bend.y, straightFrom.y, straightTo.y) + reach + 4) - top,
  };
  await setPasses(page, { ...scene, regions: true });
  const withOverlay = await luminanceRect(page, rect);
  await setPasses(page, { ...scene, regions: false });
  const withoutOverlay = await luminanceRect(page, rect);
  const restore = Object.fromEntries(
    Object.keys(scene).map((name) => [name, true]),
  ) as Record<string, boolean>;
  await setPasses(page, { ...restore, regions: true });

  /** The distance from a point to the drawn line inside the reading window. */
  const gapToBendLine = (point: { x: number; y: number }): number => {
    let nearest = Number.POSITIVE_INFINITY;
    for (let index = 0; index + 1 < bendLine.length; index += 1) {
      const away = gapToSegment(
        point,
        bendLine[index] as { x: number; y: number },
        bendLine[index + 1] as { x: number; y: number },
      );
      if (away < nearest) nearest = away;
    }
    return nearest;
  };

  let bendAlpha = 0;
  let straightAlpha = 0;
  let unchangedInside = 0;
  let insideCount = 0;
  for (let row = 0; row < rect.height; row += 1) {
    for (let column = 0; column < rect.width; column += 1) {
      const index = row * rect.width + column;
      const point = { x: rect.x + column + 0.5, y: rect.y + row + 0.5 };
      // The alpha of this pixel, from the two readings and the band's own tone.
      const under = withoutOverlay[index] as number;
      const room = TONE_LUMINANCE - under;
      const alpha =
        Math.abs(room) < 0.05 ? 0 : ((withOverlay[index] as number) - under) / room;
      const toBend = Math.hypot(point.x - bend.x, point.y - bend.y);
      if (toBend <= reach) {
        if (alpha > bendAlpha) bendAlpha = alpha;
        // A pixel on the middle of the drawn line must be drawn. A quad per segment
        // with no fill at a join leaves a notch here.
        if (gapToBendLine(point) <= 0.8) {
          insideCount += 1;
          if (alpha <= 0.001) unchangedInside += 1;
        }
        continue;
      }
      if (
        toBend > reach * 1.5 &&
        gapToSegment(point, straightFrom, straightTo) <= 1.2
      ) {
        if (alpha > straightAlpha) straightAlpha = alpha;
      }
    }
  }
  return { bendAlpha, straightAlpha, insideCount, unchangedInside };
}

/**
 * The radius of the outer edge of the band around a corner, in CSS pixels.
 *
 * The coverage is an exact distance from the **segment** and the blend is `MAX`, so the
 * outside of a corner is an arc of the band's own half width centred on the node. The
 * reading marches out from the node along rays into the outer quadrant and takes the
 * last pixel the band still reaches.
 *
 * The sweep spans `180 - T` for a turn `T` while the band's own arc spans `T`, so the two
 * agree only at `T = 90`. The search holds the turn above 80 degrees, where the fit runs
 * 10 degrees onto the straight part at each end and the radius error is 0.222 CSS pixels
 * at a half width of 14.4, under a ninth of the bound of 2.0.
 */
async function readCornerRadius(
  page: Page,
  choice: CornerChoice,
): Promise<{
  median: number;
  mean: number;
  least: number;
  most: number;
  rays: number;
}> {
  await lookFrom(page, choice.view);
  const node = await projectPoint(page, choice.bend);
  const first = await projectPoint(
    page,
    choice.bendLine[0] as [number, number, number],
  );
  const last = await projectPoint(
    page,
    choice.bendLine[choice.bendLine.length - 1] as [number, number, number],
  );

  // The two arms leave the node toward the ends of the reading polyline. The outer
  // quadrant is the one the two arms do not span, so it lies between the two opposite
  // directions.
  const away = (point: { x: number; y: number }): number =>
    Math.atan2(point.y - node.y, point.x - node.x);
  const outerOne = away(first) + Math.PI;
  const outerTwo = away(last) + Math.PI;
  let span = outerTwo - outerOne;
  while (span > Math.PI) span -= 2 * Math.PI;
  while (span < -Math.PI) span += 2 * Math.PI;

  // The window holds the whole arc and a margin of 12 CSS pixels beyond it.
  const reach = Math.ceil(
    halfWidthCssAt(choice.viewport.height, choice.view.distance) + 12,
  );
  const rect = {
    x: Math.floor(node.x) - reach,
    y: Math.floor(node.y) - reach,
    width: reach * 2,
    height: reach * 2,
  };
  await setPasses(page, { regions: true });
  const withOverlay = await luminanceRect(page, rect);
  await setPasses(page, { regions: false });
  const withoutOverlay = await luminanceRect(page, rect);
  await setPasses(page, { regions: true });

  const alphaPixel = (column: number, row: number): number => {
    if (column < 0 || row < 0 || column >= rect.width || row >= rect.height) return 0;
    const index = row * rect.width + column;
    const under = withoutOverlay[index] as number;
    const room = TONE_LUMINANCE - under;
    if (Math.abs(room) < 0.05) return 0;
    return ((withOverlay[index] as number) - under) / room;
  };

  // The profile is read between pixel centres, not at the nearest one. A ray that steps
  // by a quarter of a pixel reads the same pixel four times over otherwise, so the radius
  // comes back as a whole number and the fit carries a half pixel of stair.
  const alphaAt = (x: number, y: number): number => {
    const column = x - rect.x - 0.5;
    const row = y - rect.y - 0.5;
    const left = Math.floor(column);
    const top = Math.floor(row);
    const fx = column - left;
    const fy = row - top;
    return (
      alphaPixel(left, top) * (1 - fx) * (1 - fy) +
      alphaPixel(left + 1, top) * fx * (1 - fy) +
      alphaPixel(left, top + 1) * (1 - fx) * fy +
      alphaPixel(left + 1, top + 1) * fx * fy
    );
  };

  // The alpha is `smoothstep(0, 0.25, 1 - gap / halfWidth)`. The ray is read where it
  // falls to **half the outer plateau** on that same ray, and not where it reaches a
  // floor near 0.
  //
  // **The reference is the outer plateau and not the peak.** The band carries two tones.
  // The peak at the middle of the line is the core tone, while the edge the sweep reads
  // carries the outer one, so a ratio of the two would mix the tones with the alpha. The
  // reference is therefore the reading on the same ray at a gap of
  // `0.75 * halfWidth - 1` CSS pixels, which is 9.8 at a half width of 14.4: it is inside
  // the outer plateau and one CSS pixel clear of the edge, where the profile alpha is 1
  // and the tone is the outer one. Both readings then carry one tone, and the range fade,
  // the zoom fade and the tone divide out as they did.
  //
  // Half the plateau sits at `gap = 0.875 * halfWidth`, that is `0.125 * halfWidth`
  // inside the band's own edge and 1.8 CSS pixels at a half width of 14.4, so the sweep
  // **adds `0.125 * halfWidth`** rather than doubling its reading. That point sits in the
  // middle of the edge, where the ramp is steepest, so a small error in alpha is a small
  // error in radius. A floor near 0 sits on the flattest part of the ramp, where the
  // frame's own 8 bits are a large share of the figure being read, and it under-reads
  // this corner.
  const halfWidth = halfWidthCssAt(choice.viewport.height, choice.view.distance);
  const plateauRadius = halfWidth - bandEdgeCssAt(halfWidth) - 1;
  const halfAlphaGain = 0.125 * halfWidth;
  const radii: number[] = [];
  const rays = 25;
  for (let step = 0; step <= rays; step += 1) {
    // The two ends of the quadrant sit on the arms themselves, so the sweep keeps a
    // tenth of the quadrant away from each.
    const part = 0.1 + (0.8 * step) / rays;
    const angle = outerOne + span * part;
    const along = (radius: number): number =>
      alphaAt(node.x + Math.cos(angle) * radius, node.y + Math.sin(angle) * radius);

    const plateau = along(plateauRadius);
    if (plateau <= 0) continue;

    // The first crossing of half the plateau, walking out from the plateau point. The two
    // samples that bracket it are interpolated, so the reading is not quantised to the
    // step.
    let edge = 0;
    let last = plateau;
    for (let radius = plateauRadius + 0.25; radius <= reach; radius += 0.25) {
      const alpha = along(radius);
      if (alpha < plateau / 2) {
        const gap = last - alpha;
        const part2 = gap > 0 ? (last - plateau / 2) / gap : 0;
        edge = radius - 0.25 + 0.25 * part2;
        break;
      }
      last = alpha;
    }
    if (edge > 0) radii.push(edge + halfAlphaGain);
  }
  if (radii.length === 0) throw new Error('the corner sweep read no ray');
  // The **median** and not the mean. `alphaAt` returns 0 where the background is already
  // as bright as the band's own tone, because there is no room left to read a contribution
  // in. A ray that crosses such a patch falls under half the plateau early and reads
  // short, and one ray of the sweep does. That is a hole in the reading and not a narrow
  // corner, so the sweep takes the middle reading, which one dropout cannot move.
  const sorted = [...radii].sort((one, two) => one - two);
  const middle = sorted.length >> 1;
  const median =
    sorted.length % 2 === 1
      ? (sorted[middle] as number)
      : ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
  return {
    median,
    mean: radii.reduce((sum, value) => sum + value, 0) / radii.length,
    least: Math.min(...radii),
    most: Math.max(...radii),
    rays: radii.length,
  };
}

test.describe('the corner readings', () => {
  // The two corner views read at their own viewports, which `e2e/region-views.ts` holds:
  // 3,200 by 1,800 for the join and 3,840 by 2,160 for the traced corner, each at a zoom
  // of 20,000 light years. Each pairs its rows with its zoom so that one CSS pixel covers
  // the light years the reading was calibrated at, and each reading point sits beyond the
  // range fade, where the line draws in full. Each test therefore sets the size of its own
  // view rather than sharing one.
  test.use({ deviceScaleFactor: 1 });

  test('a join is not brighter than the line', async ({ page }) => {
    await page.setViewportSize(SHARP_CORNER.viewport);
    await openMap(page);
    const reading = await readJoin(page, SHARP_CORNER);
    console.log('the join reading', {
      turnDegrees: SHARP_CORNER.turnDegrees,
      ...reading,
    });

    expect(reading.insideCount).toBeGreaterThan(8);
    expect(reading.unchangedInside).toBe(0);
    expect(reading.straightAlpha).toBeGreaterThan(0.05);

    // The bound is one 8-bit step. The top of the band is flat and the core's flat part is
    // `0.326 * halfWidth` CSS pixels wide, that is 4.7 at a half width of 14.4, so a pixel
    // within half a pixel of the middle of the line still reads the plateau. Two peaks
    // therefore read one value, and only the frame's own 8-bit quantisation is left.
    expect(reading.bendAlpha).toBeLessThanOrEqual(
      reading.straightAlpha + EIGHT_BIT_STEP,
    );
  });

  test('the corner of the traced set is round to the band half width', async ({
    page,
  }) => {
    await page.setViewportSize(TRACED_CORNER.viewport);
    await openMap(page);
    const reading = await readCornerRadius(page, TRACED_CORNER);
    const wanted = halfWidthCssAt(
      TRACED_CORNER.viewport.height,
      TRACED_CORNER.view.distance,
    );
    console.log('the radius of the corner', {
      ...reading,
      wanted,
      turnDegrees: TRACED_CORNER.turnDegrees,
    });

    // `base` is the clamp of 24 and not 1.6 per cent of 2,160 rows, which is 34.56. The
    // corner's range is the zoom of 20,000 light years, so the half width is 14.4.
    expect(wanted).toBeCloseTo(14.4, 6);
    // The sweep runs `90 - T` onto the straight part at each end, where the tangent leaves
    // the circle by `14.4 * (1 / cos(90 - T) - 1)`. That error is 0.222 CSS pixels at a
    // turn of 80 degrees and reaches the whole bound of 2.0 at 61.4, so the reading fails
    // below 80 rather than reporting a radius the fit cannot hold.
    expect(TRACED_CORNER.turnDegrees).toBeGreaterThan(80);
    expect(reading.rays).toBeGreaterThan(8);
    expect(reading.median).toBeGreaterThan(wanted - 2);
    expect(reading.median).toBeLessThan(wanted + 2);
  });

  test('the sharpest corner of the traced set is not brighter than its line', async ({
    page,
  }) => {
    await page.setViewportSize(TRACED_CORNER.viewport);
    await openMap(page);
    const reading = await readJoin(page, TRACED_CORNER);
    console.log('the traced corner reading', {
      turnDegrees: TRACED_CORNER.turnDegrees,
      ...reading,
    });

    // The corner is the sharpest node the search holds, and its turn is read over the
    // read radius and not between two segments. The floor is the one the radius reading
    // needs.
    expect(TRACED_CORNER.turnDegrees).toBeGreaterThan(80);
    expect(reading.insideCount).toBeGreaterThan(8);
    expect(reading.unchangedInside).toBe(0);
    expect(reading.straightAlpha).toBeGreaterThan(0.05);
    // The corner is no longer a lattice node, so neither arm runs along a screen axis. The
    // bound is one 8-bit step, the same the join reading takes: the flat top holds the
    // plateau under every offset of the pixel grid, and the `MAX` blend holds the corner
    // at the coverage of one arm.
    expect(reading.bendAlpha).toBeLessThanOrEqual(
      reading.straightAlpha + EIGHT_BIT_STEP,
    );
  });
});

test('the switch removes both parts', async ({ page }) => {
  await openMap(page, '#c=15,0,25895&d=20000&p=35&y=0');
  await page.evaluate(() => {
    window.__galaxyMap?.drawNow?.();
  });
  const withOverlay = await canvasDigest(page);
  expect(await page.locator('.region-label').count()).toBeGreaterThan(0);

  await setPasses(page, { regions: false });
  const withoutOverlay = await canvasDigest(page);

  expect(await page.locator('.region-label').count()).toBe(0);
  expect(withOverlay).not.toBe(withoutOverlay);
});

test('the switch is inert where nothing draws', async ({ page }) => {
  await openMap(page, '#c=15,0,25895&d=60000&p=35&y=0');
  await page.evaluate(() => {
    window.__galaxyMap?.drawNow?.();
  });
  const withOverlay = await canvasDigest(page);
  await setPasses(page, { regions: false });
  const withoutOverlay = await canvasDigest(page);

  expect(withOverlay).toBe(withoutOverlay);
});

test.describe('the region overlay switch', () => {
  test('is on the handle and on neither probe', async ({ page }) => {
    await openMap(page);
    const found = await page.evaluate(() => {
      const map = window.galaxyMap;
      const debug = (map?.debug ?? {}) as unknown as Record<string, unknown>;
      const global = (window.__galaxyMap ?? {}) as unknown as Record<string, unknown>;
      const names = [
        'areRegionsVisible',
        'setRegionsVisible',
        'areShapesVisible',
        'setShapesVisible',
      ];
      const gone = ['getRegionMode', 'setRegionMode', 'regionMode'];
      const has = (holder: Record<string, unknown>, list: string[]): string[] =>
        list.filter((name) => name in holder);
      return {
        handle:
          typeof map?.areRegionsVisible === 'function' &&
          typeof map?.setRegionsVisible === 'function' &&
          typeof map?.areShapesVisible === 'function' &&
          typeof map?.setShapesVisible === 'function',
        goneOnHandle: has(map as unknown as Record<string, unknown>, gone),
        debug: has(debug, [...names, ...gone]),
        global: has(global, [...names, ...gone]),
      };
    });
    console.log('the switch reading', found);
    expect(found.handle).toBe(true);
    expect(found.goneOnHandle).toEqual([]);
    expect(found.debug).toEqual([]);
    expect(found.global).toEqual([]);

    // The pass switch is a renderer probe and the host switch is a host setting. One does
    // not move the other.
    await setPasses(page, { regions: false });
    expect(await regionsVisible(page)).toBe(true);
    await setPasses(page, { regions: true });
  });

  test('starts on', async ({ page }) => {
    await openMap(page);
    expect(await regionsVisible(page)).toBe(true);
  });

  test('takes the value the options name', async ({ page }) => {
    await openMap(page);
    const states = await page.evaluate(async () => {
      const factory = window.galaxyMapFactory;
      if (factory === undefined) return null;

      /** Builds a map of its own on a canvas of its own and reads its switch. */
      const stateOf = async (options?: Record<string, unknown>): Promise<boolean> => {
        const canvas = document.createElement('canvas');
        canvas.style.width = '320px';
        canvas.style.height = '240px';
        document.body.appendChild(canvas);
        const map = factory(canvas, options as never);
        await map.ready;
        const on = map.areRegionsVisible();
        map.dispose();
        canvas.remove();
        return on;
      };

      return {
        off: await stateOf({ regions: false }),
        on: await stateOf({ regions: true }),
        bad: await stateOf({ regions: 'on' }),
        empty: await stateOf({}),
        none: await stateOf(),
      };
    });
    console.log('the option reading', states);

    expect(states).not.toBeNull();
    expect(states?.off).toBe(false);
    expect(states?.on).toBe(true);
    // A value that is not a boolean takes the default, as a bad value does on the setter.
    expect(states?.bad).toBe(true);
    expect(states?.empty).toBe(true);
    expect(states?.none).toBe(true);
  });

  test('removes both parts and draws the pass switch frame', async ({ page }) => {
    await openMap(page, SWITCH_VIEW);
    await setRegionsVisible(page, false);
    const offSwitch = await canvasDigest(page);
    expect(await page.locator('.region-label').count()).toBe(0);

    await setRegionsVisible(page, true);
    await setPasses(page, { regions: false });
    const offPass = await canvasDigest(page);

    expect(offSwitch).toBe(offPass);
  });

  test('keeps its value when it is given a bad one', async ({ page }) => {
    await openMap(page);
    await setRegionsVisible(page, false);
    expect(await regionsVisible(page)).toBe(false);
    await setRegionsVisible(page, 'on');
    expect(await regionsVisible(page)).toBe(false);
    await setRegionsVisible(page, undefined);
    expect(await regionsVisible(page)).toBe(false);
  });

  test('changes without a second scene data load', async ({ page }) => {
    // Every scene data load starts its workers. A rebuild would start them again.
    let workers = 0;
    page.on('worker', () => {
      workers += 1;
    });
    await openMap(page, SWITCH_VIEW);
    const started = workers;
    expect(started).toBeGreaterThan(0);

    const on = await canvasDigest(page);
    const offMs = await page.evaluate(() => {
      const at = performance.now();
      window.galaxyMap?.setRegionsVisible(false);
      return performance.now() - at;
    });
    const off = await canvasDigest(page);
    const onMs = await page.evaluate(() => {
      const at = performance.now();
      window.galaxyMap?.setRegionsVisible(true);
      return performance.now() - at;
    });
    const again = await canvasDigest(page);
    console.log('the switch change reading', { offMs, onMs, workers });

    expect(off).not.toBe(on);
    expect(again).toBe(on);
    expect(workers).toBe(started);
    // A rebuild of the region data takes seconds. Both changes draw one frame.
    expect(offMs).toBeLessThan(500);
    expect(onMs).toBeLessThan(500);
  });
});

test.describe('the region name at a point', () => {
  test('names the region at a point', async ({ page }) => {
    await openMap(page);
    const names = await page.evaluate(() => {
      const map = window.galaxyMap;
      if (map === undefined) return null;
      return {
        sol: map.regionNameAt([0, 0, 0]),
        centre: map.regionNameAt([15, -35, 25895]),
        outside: map.regionNameAt([400000, 0, 0]),
      };
    });
    console.log('the region name at a point', names);

    expect(names).toEqual({
      sol: 'Inner Orion Spur',
      centre: 'Galactic Centre',
      outside: null,
    });
  });

  test('the exact call names the region at a point', async ({ page }) => {
    await openMap(page);
    const names = await page.evaluate(async () => {
      const map = window.galaxyMap;
      if (map === undefined) return null;
      return {
        sol: await map.regionNameAtExact([0, 0, 0]),
        centre: await map.regionNameAtExact([15, -35, 25895]),
        outside: await map.regionNameAtExact([400000, 0, 0]),
      };
    });
    console.log('the exact region name at a point', names);

    expect(names).toEqual({
      sol: 'Inner Orion Spur',
      centre: 'Galactic Centre',
      outside: null,
    });
  });

  // The browser part of the scenario "The exact table stays out of the main bundle". The
  // unit part is in `tests/main-bundle.test.ts`.
  test('the exact table arrives with the calls and arrives once', async ({ page }) => {
    const scripts: string[] = [];
    page.on('request', (request) => {
      if (request.resourceType() === 'script') scripts.push(request.url());
    });
    // The region worker bundles its own copy of the table, so its chunk carries the table
    // under another name. This reading counts the chunks the page asks for by this name,
    // which the build gives the table alone.
    const tableScripts = (): string[] =>
      scripts.filter((url) => url.includes('codex-region-lookup'));

    await openMap(page);
    expect(tableScripts(), 'the page fetched the table before a call').toEqual([]);

    // Two calls at once. The second must wait on the load the first started.
    const names = await page.evaluate(async () => {
      const map = window.galaxyMap;
      if (map === undefined) return null;
      return Promise.all([
        map.regionNameAtExact([0, 0, 0]),
        map.regionNameAtExact([15, -35, 25895]),
      ]);
    });
    // A second load would start in the same tick, so a short wait holds both requests.
    await page.waitForTimeout(500);
    console.log('the chunks that carry the table', tableScripts());

    expect(names).toEqual(['Inner Orion Spur', 'Galactic Centre']);
    expect(tableScripts()).toHaveLength(1);
  });

  test('the exact call is right where the coarse one is not', async ({ page }) => {
    // The unit scenario of `src/scene-data/region-lines.test.ts` found this point. It is
    // the point nearest Sol whose own 49.3494 light year cell and whose 197.3976 light
    // year coarse cell name different regions.
    await openMap(page);
    const names = await page.evaluate(async () => {
      const map = window.galaxyMap;
      if (map === undefined) return null;
      const point: [number, number, number] = [-857.675, 0, -1379.602];
      return {
        coarse: map.regionNameAt(point),
        exact: await map.regionNameAtExact(point),
      };
    });
    console.log('the two readings at the point the grids disagree on', names);

    expect(names).toEqual({
      coarse: 'Inner Orion Spur',
      exact: 'Sanguineous Rim',
    });
  });

  test('gives the same answer at any height', async ({ page }) => {
    await openMap(page);
    const names = await page.evaluate(async () => {
      const map = window.galaxyMap;
      if (map === undefined) return null;
      return {
        plane: map.regionNameAt([0, 0, 0]),
        above: map.regionNameAt([0, 20000, 0]),
        exactPlane: await map.regionNameAtExact([0, 0, 0]),
        exactAbove: await map.regionNameAtExact([0, 20000, 0]),
      };
    });
    console.log('the region name at a height', names);

    const reading = names as {
      plane: string;
      above: string;
      exactPlane: string;
      exactAbove: string;
    };
    expect(reading.plane).toBe(reading.above);
    expect(reading.exactPlane).toBe(reading.exactAbove);
  });

  test('answers before the scene data loads', async ({ page }) => {
    await openMap(page);
    const reading = await page.evaluate(async () => {
      const factory = window.galaxyMapFactory;
      if (factory === undefined) return null;
      const canvas = document.createElement('canvas');
      canvas.style.width = '320px';
      canvas.style.height = '240px';
      document.body.appendChild(canvas);
      const map = factory(canvas);
      const before = map.regionNameAt([0, 0, 0]);
      await map.ready;
      const after = map.regionNameAt([0, 0, 0]);
      map.dispose();
      canvas.remove();
      return { before, after };
    });
    console.log('the region name before the data', reading);

    expect(reading).toEqual({ before: null, after: 'Inner Orion Spur' });
  });
});

/**
 * The strongest band alpha over the pixels whose own plane point lies within a window of
 * a range, and where that pixel sits.
 */
interface StrengthReading {
  readonly peakAlpha: number;
  readonly x: number;
  readonly y: number;
  /** How many pixels of the frame lie inside the range window. */
  readonly pixels: number;
  /** How many of those the reading kept, that is those over a dark enough background. */
  readonly darkPixels: number;
}

/**
 * Reads the strongest band alpha over the pixels at a range from the camera.
 *
 * The pixels at a range make a thin ribbon across the frame, and the ribbon crosses
 * several boundary bands. The reading takes the greatest alpha of the ribbon, which is
 * the pixel nearest the centre of the band it crosses. The top of the band is flat and
 * the core's own flat part is `0.5 * halfWidth - 3` CSS pixels wide, that is 5.6 at 1,080
 * CSS rows, so that pixel carries the full core tone and the profile alpha there is 1.
 *
 * The alpha comes from two frames, one with the region pass and one without it. A pixel
 * reads `alpha * tone + (1 - alpha) * frame`, so the two frames and the band's own tone
 * give the alpha back. The tone the caller gives is the **core** one, because the
 * greatest reading sits at the middle of a line.
 *
 * The reading keeps only the pixels whose background reads under `backgroundBound` of
 * luminance. Over a background brighter than both tones the two rooms are negative, and a
 * pixel of the outer part then reads above a pixel of the core, so the greatest reading
 * would carry the wrong tone.
 */
async function readStrengthAtRange(
  page: Page,
  rangeLy: number,
  windowLy: number,
  tone: number,
  backgroundBound: number,
): Promise<StrengthReading> {
  return page.evaluate(
    (job) => {
      const probe = window.__galaxyMap;
      const canvas = document.getElementById('map');
      if (
        probe?.readRect === undefined ||
        probe.planePointAt === undefined ||
        !(canvas instanceof HTMLCanvasElement)
      ) {
        return { peakAlpha: -1, x: -1, y: -1, pixels: 0, darkPixels: 0 };
      }
      const wideCss = canvas.clientWidth;
      const tallCss = canvas.clientHeight;
      probe.setPasses?.({ regions: true });
      probe.drawNow?.();
      const withPass = probe.readRect(0, 0, wideCss, tallCss);
      probe.setPasses?.({ regions: false });
      probe.drawNow?.();
      const withoutPass = probe.readRect(0, 0, wideCss, tallCss);
      probe.setPasses?.({ regions: true });
      probe.drawNow?.();
      const size = probe.drawingBufferSize?.() ?? [wideCss, tallCss];
      const ratio = size[0] / wideCss;
      const wide = Math.round(wideCss * ratio);
      const tall = Math.round(tallCss * ratio);

      const view = window.galaxyMap?.getView();
      const planePointAt = probe.planePointAt;
      if (view === undefined || planePointAt === undefined) {
        return { peakAlpha: -1, x: -1, y: -1, pixels: 0, darkPixels: 0 };
      }
      const toRadians = Math.PI / 180;
      const pitch = view.pitch * toRadians;
      const yaw = view.yaw * toRadians;
      const horizontal = Math.cos(pitch);
      const camera: [number, number, number] = [
        view.cursor[0] - horizontal * Math.sin(yaw) * view.distance,
        view.cursor[1] + Math.sin(pitch) * view.distance,
        view.cursor[2] - horizontal * Math.cos(yaw) * view.distance,
      ];
      // The range to the plane point under a device pixel. A ray that misses the plane
      // reads as beyond every range, so the search below treats the sky as far.
      const rangeAt = (x: number, y: number): number => {
        const point = planePointAt((x + 0.5) / ratio, (y + 0.5) / ratio);
        if (point === null) return Number.POSITIVE_INFINITY;
        return Math.hypot(
          point[0] - camera[0],
          point[1] - camera[1],
          point[2] - camera[2],
        );
      };
      // The range falls as the row goes down the frame, so a binary search finds the
      // first row at or under a bound.
      const firstRowUnder = (x: number, bound: number): number => {
        let low = 0;
        let high = tall;
        while (low < high) {
          const middle = (low + high) >> 1;
          if (rangeAt(x, middle) <= bound) high = middle;
          else low = middle + 1;
        }
        return low;
      };

      const luminance = (bytes: Uint8Array, index: number): number =>
        (0.2126 * (bytes[index] as number) +
          0.7152 * (bytes[index + 1] as number) +
          0.0722 * (bytes[index + 2] as number)) /
        255;

      let peakAlpha = 0;
      let peakX = -1;
      let peakY = -1;
      let pixels = 0;
      let darkPixels = 0;
      for (let x = 0; x < wide; x += 1) {
        const top = firstRowUnder(x, job.rangeLy + job.windowLy);
        const under = firstRowUnder(x, job.rangeLy - job.windowLy);
        for (let y = top; y < under && y < tall; y += 1) {
          const index = (y * wide + x) * 4;
          const background = luminance(withoutPass, index);
          const room = job.tone - background;
          pixels += 1;
          if (background >= job.backgroundBound) continue;
          darkPixels += 1;
          if (Math.abs(room) < 0.05) continue;
          const alpha =
            (luminance(withPass, index) - luminance(withoutPass, index)) / room;
          if (alpha > peakAlpha) {
            peakAlpha = alpha;
            peakX = x;
            peakY = y;
          }
        }
      }
      return { peakAlpha, x: peakX, y: peakY, pixels, darkPixels };
    },
    { rangeLy, windowLy, tone, backgroundBound },
  );
}

test.describe('the label and the line at the same range', () => {
  test.use({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });

  test('read at the same strength', async ({ page }) => {
    await openMap(page);
    await look(page, [0, 0, 0], 18000);
    await settleLabels(page);

    // The label in the middle of the fade carries the reading. A label at an opacity of
    // 1 would agree with any band the window holds, so it reads nothing.
    const labels = await readRegionLabelRanges(page);
    const inFade = labels
      .filter((label) => label.opacity > 0.05 && Number.isFinite(label.rangeLy))
      .sort((first, second) => first.opacity - second.opacity);
    console.log(
      'the labels at 18,000 light years',
      labels.map(
        (label) =>
          `${label.name} ${label.opacity.toFixed(3)} at ${label.rangeLy.toFixed(0)} ly`,
      ),
    );
    expect(inFade.length, 'a label inside the fade').toBeGreaterThan(0);
    const chosen = inFade[0] as RegionLabelRange;

    // The greatest reading sits at the middle of a line, where the tone is the core one,
    // so the reading turns a pixel into an alpha through the core tone. The two tone
    // luminances are 0.581 and 0.794, so a background bound of 0.5 keeps every pixel that
    // is read below both tones.
    // The window is 40 light years. The range fade now runs over 4,000 light years and
    // not 10,000, so its steepest slope is 2.5 times what it was. A window of 100 would
    // cost 0.0375 of the 0.05 bound on its own; 40 costs 0.015.
    const reading = await readStrengthAtRange(
      page,
      chosen.rangeLy,
      40,
      CORE_TONE_LUMINANCE,
      0.5,
    );
    const bandStrength = reading.peakAlpha / BAND_OPACITY;
    console.log('the label and the band', {
      name: chosen.name,
      opacity: chosen.opacity,
      rangeLy: chosen.rangeLy,
      peakAlpha: reading.peakAlpha,
      bandStrength,
      at: [reading.x, reading.y],
      pixels: reading.pixels,
      darkPixels: reading.darkPixels,
    });

    expect(reading.pixels, 'pixels inside the range window').toBeGreaterThan(0);
    expect(reading.darkPixels, 'pixels over a dark enough background').toBeGreaterThan(
      0,
    );
    // The band alpha divided by the band's own opacity is the fade the line takes, and
    // the label's opacity is the fade the name takes. The two agree within 0.05, which
    // the scenario's table accounts for.
    expect(Math.abs(chosen.opacity - bandStrength)).toBeLessThan(0.05);
  });
});
