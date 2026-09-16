import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { RegionMode } from '../src/app/create-map';
import {
  GALACTIC_CENTRE,
  openMap,
  projectPoint,
  readRegionLabelRanges,
  settleLabels,
} from './helpers';
import type { RegionLabelRange } from './helpers';
import {
  NEAR_BOTH_SETS,
  SHARP_CORNER,
  SMOOTHED_CROSSING,
  TRACED_CORNER,
  TRACED_CROSSING,
} from './region-views';
import type { ChosenView, CornerChoice, CrossingChoice } from './region-views';

test.use({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });

/** A view inside the band where the overlay draws in full. */
const MEDIUM_DISTANCE = 15000;

/**
 * The close end of the range band, in light years. The band is now the range band and
 * not the zoom band: the centre of the frame sits at the cursor, so its range is the
 * zoom. A line draws in full at 20,000 and draws nothing at 4,000.
 *
 * At 4,000 light years the reading is a window around the centre and not the whole
 * frame. A line near the horizon is over 10,000 light years off and does draw there,
 * which is what the range fade is for.
 */
const CLOSE_END_FULL = 20000;
const CLOSE_END_NONE = 4000;

/**
 * The three zooms the close end reading takes, in light years. The range fade is 1 at
 * 20,000, 0.5 at 15,000 and 0 at 9,000, which is below the 10,000 it reaches 0 at.
 */
const FADE_DISTANCES = [20000, 15000, 9000];

/**
 * The three zooms the far end reading takes, in light years. The zoom fade is 1 at
 * 20,000, 0.5 at 25,000 and 0 at 31,000, which is above the 30,000 it reaches 0 at.
 */
const FAR_FADE_DISTANCES = [20000, 25000, 31000];

/** The two modes that draw a line. */
const DRAWING_MODES: RegionMode[] = ['simplified', 'accurate'];

/**
 * The view the three modes are compared at. It looks at the sharpest corner the traced
 * set holds, from far enough back that the whole corner is in the frame. The two sets
 * carry the same line along a straight run of the boundary, so a view chosen there
 * cannot tell `simplified` from `accurate`. The zoom sits inside the band the overlay
 * draws in: below 5,000 light years the overlay draws nothing and all three digests
 * would match.
 */
const MODE_COMPARISON_VIEW: ChosenView = {
  cursor: TRACED_CORNER.bend,
  distance: 12000,
  yaw: 0,
  pitch: 35,
};

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

/** Reads the region mode off the handle. */
async function regionMode(page: Page): Promise<RegionMode | null> {
  return page.evaluate(() => window.galaxyMap?.getRegionMode() ?? null);
}

/** Sets the region mode on the handle and draws a frame. */
async function setRegionMode(page: Page, mode: string): Promise<void> {
  await page.evaluate((next) => {
    window.galaxyMap?.setRegionMode(next as RegionMode);
    window.__galaxyMap?.drawNow?.();
  }, mode);
}

/** The text of every region label on the page, in the order the page holds them. */
async function labelTexts(page: Page): Promise<string[]> {
  return page.locator('.region-label').allTextContents();
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
  await look(page, NEAR_BOTH_SETS.point, 40000);
  await setPasses(page, { regions: true });
  const far = await page.evaluate(
    () => window.galaxyMap?.debug.regionCoverageSize() ?? null,
  );
  expect(far).toBeNull();

  await look(page, NEAR_BOTH_SETS.point, MEDIUM_DISTANCE);
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

  // The centre is a plane point a unit test found on a chain of both sets. The smoothed
  // line may sit 49.3 light years from the traced one, so a point chosen against one set
  // alone can leave the other set's line off the middle of the frame.
  for (const mode of DRAWING_MODES) {
    await setRegionMode(page, mode);

    // 20,000 light years is the closest range at which the line draws in full: the
    // range fade reaches 1 there and the zoom fade leaves 20,000 at 1.
    await look(page, NEAR_BOTH_SETS.point, CLOSE_END_FULL);
    await setPasses(page, { regions: true });
    const drawn = await canvasDigest(page);
    await setPasses(page, { regions: false });
    const bare = await canvasDigest(page);
    expect(drawn, `${mode} at ${CLOSE_END_FULL} light years`).not.toBe(bare);

    // At 4,000 light years the centre sits at the cursor, where the range fade is 0,
    // so the window around it is the frame it was without the overlay. The rest of the
    // frame is not read: a line near the horizon is over 10,000 light years off.
    await look(page, NEAR_BOTH_SETS.point, CLOSE_END_NONE);
    const closeChange = await contributionNear(page, NEAR_BOTH_SETS.point);
    expect(closeChange, `${mode} at ${CLOSE_END_NONE} light years`).toBe(0);
    // The clause is about the anchor's range and not about the zoom. The frame still
    // holds plane points tens of thousands of light years up it, so regions far up the
    // frame do carry names; what has gone is every name near the cursor.
    const labels = await readRegionLabelRanges(page);
    console.log('the labels at the close end', labels);
    for (const label of labels) {
      expect(label.rangeLy, label.name).toBeGreaterThan(10000);
    }
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

  for (const mode of DRAWING_MODES) {
    await setRegionMode(page, mode);
    const readings: number[] = [];
    for (const distance of FADE_DISTANCES) {
      await look(page, NEAR_BOTH_SETS.point, distance);
      readings.push(await contributionNear(page, NEAR_BOTH_SETS.point));
    }
    console.log('the close end reading', { mode, FADE_DISTANCES, readings });

    const [full, half, none] = readings as [number, number, number];
    // The centre sits at the cursor, so its range is the zoom. The range fade is 1 at
    // 20,000 light years, 0.5 at 15,000 and 0 at 9,000. The bounds are wide because
    // the reading is a pixel of the frame and not the fade itself.
    expect(full, `${mode} at 20,000 light years`).toBeGreaterThan(0.05);
    expect(half, `${mode} at 15,000 light years`).toBeGreaterThan(full / 5);
    expect(half, `${mode} at 15,000 light years`).toBeLessThan((full * 4) / 5);
    expect(none, `${mode} at 9,000 light years`).toBe(0);
  }
});

test('the overlay fades out across the far end of the zoom band', async ({ page }) => {
  await openMap(page);

  for (const mode of DRAWING_MODES) {
    await setRegionMode(page, mode);
    const readings: number[] = [];
    for (const distance of FAR_FADE_DISTANCES) {
      await look(page, NEAR_BOTH_SETS.point, distance);
      readings.push(await contributionNear(page, NEAR_BOTH_SETS.point));
    }
    console.log('the far end reading', { mode, FAR_FADE_DISTANCES, readings });

    const [full, half, none] = readings as [number, number, number];
    // The range fade is 1 at all three, because the centre's range is the zoom and
    // every zoom here is 20,000 light years or more. The zoom fade is 1 at 20,000,
    // 0.5 at 25,000 and 0 at 31,000.
    expect(full, `${mode} at 20,000 light years`).toBeGreaterThan(0.05);
    expect(half, `${mode} at 25,000 light years`).toBeGreaterThan(full / 5);
    expect(half, `${mode} at 25,000 light years`).toBeLessThan((full * 4) / 5);
    expect(none, `${mode} at 31,000 light years`).toBe(0);
  }
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
  await setRegionMode(page, 'accurate');
  // A pitch of 30 degrees puts the horizon at the top edge, because the vertical field
  // of view is 60 degrees, so every row of the frame reads the plane. At a zoom of
  // 4,000 light years the camera sits 2,000 above the plane. The rows whose plane point
  // is beyond 20,000 light years are the top 11.0 per cent, and the rows whose plane
  // point is under 10,000 are everything below 21.1 per cent.
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
  const lower = await changedInRows(page, 0.3, 1);
  console.log('the changed pixels by band', { top, lower });

  expect(top, 'the top 10 per cent of the rows').toBeGreaterThan(0);
  expect(lower, 'the rows below 30 per cent').toBe(0);
});

/** The luminance of the band's own tone, which the composite writes over the frame. */
const TONE_LUMINANCE = 0.2126 * 0.86 + 0.7152 * 0.74 + 0.0722 * 0.6;

/** The opacity the band draws at, which `src/render/region-pass.ts` holds. */
const BAND_OPACITY = 0.55;

/** What one row of pixels across the band gives. */
interface BandReading {
  /** How wide the run of changed pixels is, in CSS pixels. */
  readonly runCss: number;
  /** How wide the change is at half its own peak, in CSS pixels. */
  readonly widthCss: number;
  /** The largest alpha the overlay drew in the row. */
  readonly peakAlpha: number;
  /** True where the middle of the run is lighter than both of its ends. */
  readonly middleIsLighter: boolean;
  /** How many pixels of the run the overlay made darker. */
  readonly darkened: number;
  /** The luminance of every pixel of the row, with the overlay and without it. */
  readonly withOverlay: number[];
  readonly withoutOverlay: number[];
}

/**
 * Reads one row of pixels across the chain at the centre of the frame, with the overlay
 * on and off.
 *
 * The row gives the band's own alpha and not its luminance. The composite blends one
 * tone over the frame, so a pixel reads `alpha * tone + (1 - alpha) * frame` on every
 * channel and therefore on the luminance as well. The alpha is what the width and the
 * peak are properties of, and the frame under the band is not the same at two views.
 */
async function readBandRow(
  page: Page,
  choice: CrossingChoice,
  reachCss = 20,
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

  // The alpha of each pixel, from the two readings and the band's own tone.
  const alpha = withOverlay.map((value, index) => {
    const under = withoutOverlay[index] as number;
    const room = TONE_LUMINANCE - under;
    return Math.abs(room) < 0.05 ? 0 : (value - under) / room;
  });
  const peakAlpha = Math.max(...alpha);
  const at = alpha.indexOf(peakAlpha);
  const edge = (step: number): number => {
    let inside = at;
    while ((alpha[inside + step] as number) >= peakAlpha / 2) inside += step;
    const outside = inside + step;
    return (
      inside +
      (step * ((alpha[inside] as number) - peakAlpha / 2)) /
        ((alpha[inside] as number) - (alpha[outside] as number))
    );
  };

  let darkened = 0;
  for (let index = run.start; index <= run.end; index += 1) {
    if ((withOverlay[index] as number) < (withoutOverlay[index] as number) - 0.001) {
      darkened += 1;
    }
  }
  const middle = Math.round((run.start + run.end) / 2);
  return {
    runCss: (run.end - run.start + 1) / ratio,
    widthCss: (edge(1) - edge(-1)) / ratio,
    peakAlpha,
    middleIsLighter:
      (withOverlay[middle] as number) > (withOverlay[run.start] as number) &&
      (withOverlay[middle] as number) > (withOverlay[run.end] as number),
    darkened,
    withOverlay,
    withoutOverlay,
  };
}

/**
 * The half width of the band at a viewport height, in CSS pixels. It is 1.6 per cent of
 * the height, clamped to 8 and 24, which `src/render/region-pass.ts` owns. The browser
 * test holds its own copy, because Playwright cannot import the renderer module: it
 * reaches the PNG of the detail grid, which only Vite can load.
 */
function halfWidthCssAt(height: number): number {
  return Math.min(24, Math.max(8, 0.016 * height));
}

/**
 * The scenario "The band is the stated share of the viewport", at one viewport.
 *
 * The reading is the width at half the peak, which is the half width itself: the alpha is
 * `smoothstep(0, 1, 1 - gap / halfWidth)`, which reads 0.5 at a coverage of 0.5, that is
 * at a gap of `halfWidth / 2`, so the width at half maximum is `2 * halfWidth / 2`.
 */
function bandShareTests(height: number, wholeBandCss: number): void {
  const wanted = halfWidthCssAt(height);
  test('reads the stated share of the viewport height', async ({ page }) => {
    await openMap(page);

    await setRegionMode(page, 'simplified');
    const simplified = await readBandRow(page, SMOOTHED_CROSSING, wholeBandCss);
    await setRegionMode(page, 'accurate');
    const accurate = await readBandRow(page, TRACED_CROSSING, wholeBandCss);

    for (const [mode, reading] of [
      ['simplified', simplified],
      ['accurate', accurate],
    ] as const) {
      console.log('the band reading', {
        height,
        mode,
        runCss: reading.runCss,
        widthCss: reading.widthCss,
        peakAlpha: reading.peakAlpha,
        darkened: reading.darkened,
      });
      // The band is one tone of luminance 0.755, so it lightens every pixel it crosses.
      expect(reading.darkened, `${mode} darkened pixels`).toBe(0);
      expect(reading.middleIsLighter, `${mode} middle`).toBe(true);
      // The half-maximum width is the half width, and the whole band, where the
      // contribution reaches 0, is twice it.
      expect(reading.widthCss, `${mode} half-maximum width`).toBeGreaterThan(
        wanted - 1,
      );
      expect(reading.widthCss, `${mode} half-maximum width`).toBeLessThan(wanted + 1);
      expect(reading.runCss, `${mode} whole band`).toBeGreaterThan(wholeBandCss - 3);
      expect(reading.runCss, `${mode} whole band`).toBeLessThan(wholeBandCss + 3);
    }

    // Both sets draw through the same pass at the same half width, so the two modes give
    // the same band.
    expect(Math.abs(accurate.widthCss - simplified.widthCss)).toBeLessThan(1);
  });
}

test.describe('the band across a chain at 1920x1080', () => {
  test.use({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  // 1.6 per cent of 1,080 rows is 17.28, inside the clamp, so the whole band is 34.6.
  bandShareTests(1080, 34.6);
});

test.describe('the band across a chain at 1280x720', () => {
  test.use({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  // 1.6 per cent of 720 rows is 11.52, inside the clamp, so the whole band is 23.0.
  bandShareTests(720, 23.0);
});

test.describe('the band across a chain at 640x360', () => {
  test.use({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
  // The clamp acts here: 1.6 per cent of 360 rows is 5.76, below the floor of 8, so the
  // half width is 8 and the whole band is 16.0.
  bandShareTests(360, 16.0);

  test('takes its half width from the floor and not from the share', () => {
    expect(0.016 * 360).toBeCloseTo(5.76, 6);
    expect(halfWidthCssAt(360)).toBe(8);
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
 * 10 degrees onto the straight part at each end and the radius error is 0.370 CSS pixels,
 * under a fifth of the bound of 2.0.
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
  const reach = Math.ceil(halfWidthCssAt(choice.viewport.height) + 12);
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

  // The alpha is `peak * smoothstep(0, 1, 1 - gap / halfWidth)`. The ray is read where it
  // falls to **half the peak**, not where it reaches a floor near 0.
  //
  // `smoothstep` is 0.5 exactly at `gap = halfWidth / 2`, so the half-alpha radius is half
  // the radius wanted and the reading doubles it. That point is where the ramp is
  // steepest, so a small error in alpha is a small error in radius. The old reading took
  // a floor of 0.005 instead, on the flattest part of the ramp, where the frame's own 8
  // bits are a third of the figure being read: the floor sits under one 8-bit step of the
  // band over a bright background, so the radius it returned followed how bright the
  // galaxy was under the corner and not how wide the band is. It under-read this corner
  // by 2.4 CSS pixels, against an offset curve that is 24.00 at every ray of the sweep.
  //
  // The peak is read along the ray itself and not assumed, so the range fade, the zoom
  // fade and the tone all divide out.
  const radii: number[] = [];
  const rays = 25;
  for (let step = 0; step <= rays; step += 1) {
    // The two ends of the quadrant sit on the arms themselves, so the sweep keeps a
    // tenth of the quadrant away from each.
    const part = 0.1 + (0.8 * step) / rays;
    const angle = outerOne + span * part;
    const along = (radius: number): number =>
      alphaAt(node.x + Math.cos(angle) * radius, node.y + Math.sin(angle) * radius);

    let peak = 0;
    for (let radius = 0; radius <= reach; radius += 0.25) {
      peak = Math.max(peak, along(radius));
    }
    if (peak <= 0) continue;

    // The first crossing of half the peak, walking out. The two samples that bracket it
    // are interpolated, so the reading is not quantised to the step.
    let edge = 0;
    let last = peak;
    for (let radius = 0.25; radius <= reach; radius += 0.25) {
      const alpha = along(radius);
      if (alpha < peak / 2) {
        const gap = last - alpha;
        const part2 = gap > 0 ? (last - peak / 2) / gap : 0;
        edge = radius - 0.25 + 0.25 * part2;
        break;
      }
      last = alpha;
    }
    if (edge > 0) radii.push(edge * 2);
  }
  if (radii.length === 0) throw new Error('the corner sweep read no ray');
  // The **median** and not the mean. `alphaAt` returns 0 where the background is already
  // as bright as the band's own tone, because there is no room left to read a contribution
  // in. A ray that crosses such a patch falls under half the peak early and reads short,
  // and one ray of the sweep does. That is a hole in the reading and not a narrow corner,
  // so the sweep takes the middle reading, which one dropout cannot move.
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

    // The bound carries the half pixel sampling loss, which is a term of the reading and
    // not of the pass. The band has a flat top, so the largest reading of a run is the
    // reading of the pixel nearest the middle of the line, and how near that is follows
    // where the pixel grid falls across the line. This chain of the smoothed set runs at
    // an angle, so its best pixel centre sits up to half a pixel off the middle. The loss
    // there is `opacity * (3u^2 - 2u^3)` at `u = 0.5 / halfWidth`, which is 0.00071 at a
    // half width of 24. The bound follows the viewport, because the half width does.
    const offset = 0.5 / halfWidthCssAt(SHARP_CORNER.viewport.height);
    const samplingLoss =
      BAND_OPACITY * (3 * offset * offset - 2 * offset * offset * offset);
    console.log('the half pixel sampling loss', samplingLoss);
    expect(reading.bendAlpha).toBeLessThanOrEqual(reading.straightAlpha + samplingLoss);
  });

  test('the corner of the traced set is round to the band half width', async ({
    page,
  }) => {
    await page.setViewportSize(TRACED_CORNER.viewport);
    await openMap(page);
    await setRegionMode(page, 'accurate');
    const reading = await readCornerRadius(page, TRACED_CORNER);
    const wanted = halfWidthCssAt(TRACED_CORNER.viewport.height);
    console.log('the radius of the corner', {
      ...reading,
      wanted,
      turnDegrees: TRACED_CORNER.turnDegrees,
    });

    // 24 is the clamp and not 1.6 per cent of 2,160 rows, which is 34.56.
    expect(wanted).toBe(24);
    // The sweep runs `90 - T` onto the straight part at each end, where the tangent leaves
    // the circle by `24 * (1 / cos(90 - T) - 1)`. That error is 0.370 CSS pixels at a turn
    // of 80 degrees and reaches the whole bound of 2.0 at 67.4, so the reading fails below
    // 80 rather than reporting a radius the fit cannot hold.
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
    await setRegionMode(page, 'accurate');
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
    // The corner is no longer a lattice node, so neither arm runs along a screen axis and
    // the reading carries the same half pixel sampling allowance the join reading carries.
    // The band has a flat top, so the largest reading of a run is the reading of the pixel
    // nearest the middle of the line, and how near that is follows where the pixel grid
    // falls across the line. The `MAX` blend holds the corner at the coverage of one arm.
    const offset = 0.5 / halfWidthCssAt(TRACED_CORNER.viewport.height);
    const samplingLoss =
      BAND_OPACITY * (3 * offset * offset - 2 * offset * offset * offset);
    console.log('the half pixel sampling loss', samplingLoss);
    expect(reading.bendAlpha).toBeLessThanOrEqual(reading.straightAlpha + samplingLoss);
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

test.describe('the region mode', () => {
  test('is on the handle and on neither probe', async ({ page }) => {
    await openMap(page);
    const found = await page.evaluate(() => {
      const map = window.galaxyMap;
      const debug = (map?.debug ?? {}) as unknown as Record<string, unknown>;
      const global = (window.__galaxyMap ?? {}) as unknown as Record<string, unknown>;
      const names = ['getRegionMode', 'setRegionMode', 'regionMode'];
      return {
        handle:
          typeof map?.getRegionMode === 'function' &&
          typeof map?.setRegionMode === 'function',
        debug: names.filter((name) => name in debug),
        global: names.filter((name) => name in global),
      };
    });
    expect(found.handle).toBe(true);
    expect(found.debug).toEqual([]);
    expect(found.global).toEqual([]);

    // The pass switch is a renderer probe and the mode is a host setting. One does not
    // move the other.
    await setPasses(page, { regions: false });
    expect(await regionMode(page)).toBe('accurate');
    await setPasses(page, { regions: true });
  });

  test('is accurate by default', async ({ page }) => {
    await openMap(page);
    expect(await regionMode(page)).toBe('accurate');
  });

  test('takes the value the options name', async ({ page }) => {
    await openMap(page);
    const modes = await page.evaluate(async () => {
      const factory = window.galaxyMapFactory;
      if (factory === undefined) return null;

      /** Builds a map of its own on a canvas of its own and reads its mode. */
      const modeOf = async (options?: Record<string, unknown>): Promise<string> => {
        const canvas = document.createElement('canvas');
        canvas.style.width = '320px';
        canvas.style.height = '240px';
        document.body.appendChild(canvas);
        const map = factory(canvas, options as never);
        await map.ready;
        const mode = map.getRegionMode();
        map.dispose();
        canvas.remove();
        return mode;
      };

      return {
        none: await modeOf(),
        empty: await modeOf({}),
        accurate: await modeOf({ regionMode: 'accurate' }),
        off: await modeOf({ regionMode: 'off' }),
        bad: await modeOf({ regionMode: 'precise' }),
      };
    });
    console.log('the option reading', modes);

    expect(modes).not.toBeNull();
    expect(modes?.none).toBe('accurate');
    expect(modes?.empty).toBe('accurate');
    expect(modes?.accurate).toBe('accurate');
    expect(modes?.off).toBe('off');
    // A value the map does not know leaves the default, as a bad value does on the
    // setter.
    expect(modes?.bad).toBe('accurate');
  });

  test('draws a different frame in each of the three modes', async ({ page }) => {
    await openMap(page);
    await lookFrom(page, MODE_COMPARISON_VIEW);

    const digests: Record<string, string> = {};
    for (const mode of ['off', 'simplified', 'accurate']) {
      await setRegionMode(page, mode);
      digests[mode] = await canvasDigest(page);
    }
    console.log('the mode digests', digests);

    expect(digests['off']).not.toBe(digests['simplified']);
    expect(digests['off']).not.toBe(digests['accurate']);
    expect(digests['simplified']).not.toBe(digests['accurate']);
  });

  test('removes both parts when it is off', async ({ page }) => {
    await openMap(page, '#c=15,0,25895&d=20000&p=35&y=0');
    await setRegionMode(page, 'off');
    const offMode = await canvasDigest(page);
    expect(await page.locator('.region-label').count()).toBe(0);

    await setRegionMode(page, 'simplified');
    await setPasses(page, { regions: false });
    const offSwitch = await canvasDigest(page);

    expect(offMode).toBe(offSwitch);
  });

  test('keeps its value when it is given a bad one', async ({ page }) => {
    await openMap(page);
    await setRegionMode(page, 'accurate');
    await setRegionMode(page, 'precise');
    expect(await regionMode(page)).toBe('accurate');
    await page.evaluate(() => {
      const map = window.galaxyMap;
      map?.setRegionMode(undefined as unknown as RegionMode);
    });
    expect(await regionMode(page)).toBe('accurate');
  });

  test('does not change the labels', async ({ page }) => {
    await openMap(page, '#c=15,0,25895&d=20000&p=35&y=0');
    await setRegionMode(page, 'simplified');
    const simplified = await labelTexts(page);
    await setRegionMode(page, 'accurate');
    const accurate = await labelTexts(page);
    console.log('the label reading', { simplified, accurate });

    expect(simplified.length).toBeGreaterThan(0);
    expect(accurate).toEqual(simplified);
  });

  test('changes without a second scene data load', async ({ page }) => {
    // Every scene data load starts its workers. A rebuild would start them again.
    let workers = 0;
    page.on('worker', () => {
      workers += 1;
    });
    await openMap(page);
    await lookFrom(page, MODE_COMPARISON_VIEW);
    const started = workers;
    expect(started).toBeGreaterThan(0);

    // The default mode is `accurate`, so the reading starts from `simplified` and the
    // first change is the one that moves the frame.
    await page.evaluate(() => {
      window.galaxyMap?.setRegionMode('simplified');
    });
    const first = await canvasDigest(page);
    const accurateMs = await page.evaluate(() => {
      const at = performance.now();
      window.galaxyMap?.setRegionMode('accurate');
      return performance.now() - at;
    });
    const second = await canvasDigest(page);
    const simplifiedMs = await page.evaluate(() => {
      const at = performance.now();
      window.galaxyMap?.setRegionMode('simplified');
      return performance.now() - at;
    });
    const third = await canvasDigest(page);
    console.log('the mode change reading', { accurateMs, simplifiedMs, workers });

    expect(second).not.toBe(first);
    expect(third).toBe(first);
    expect(workers).toBe(started);
    // A rebuild of the region data takes seconds. Both changes draw one frame.
    expect(accurateMs).toBeLessThan(500);
    expect(simplifiedMs).toBeLessThan(500);
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
}

/**
 * Reads the strongest band alpha over the pixels at a range from the camera.
 *
 * The pixels at a range make a thin ribbon across the frame, and the ribbon crosses
 * several boundary bands. The reading takes the greatest alpha of the ribbon, which is
 * the pixel nearest the centre of the band it crosses. The scenario states why the
 * greatest alpha of a cross-section is the right reading and what it costs: at 1,080 CSS
 * rows the half width is 17.28 device pixels, so the nearest pixel departs from the
 * exact centre by at most 0.0025.
 *
 * The alpha comes from two frames, one with the region pass and one without it. A pixel
 * reads `alpha * tone + (1 - alpha) * frame`, so the two frames and the band's own tone
 * give the alpha back.
 */
async function readStrengthAtRange(
  page: Page,
  rangeLy: number,
  windowLy: number,
  tone: number,
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
        return { peakAlpha: -1, x: -1, y: -1, pixels: 0 };
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
        return { peakAlpha: -1, x: -1, y: -1, pixels: 0 };
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
      for (let x = 0; x < wide; x += 1) {
        const top = firstRowUnder(x, job.rangeLy + job.windowLy);
        const under = firstRowUnder(x, job.rangeLy - job.windowLy);
        for (let y = top; y < under && y < tall; y += 1) {
          const index = (y * wide + x) * 4;
          const room = job.tone - luminance(withoutPass, index);
          pixels += 1;
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
      return { peakAlpha, x: peakX, y: peakY, pixels };
    },
    { rangeLy, windowLy, tone },
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

    const reading = await readStrengthAtRange(
      page,
      chosen.rangeLy,
      100,
      TONE_LUMINANCE,
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
    });

    expect(reading.pixels, 'pixels inside the range window').toBeGreaterThan(0);
    // The band alpha divided by the band's own opacity is the fade the line takes, and
    // the label's opacity is the fade the name takes. The two agree within 0.05, which
    // the scenario's table accounts for.
    expect(Math.abs(chosen.opacity - bandStrength)).toBeLessThan(0.05);
  });
});
