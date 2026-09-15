import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { RegionMode } from '../src/app/create-map';
import { GALACTIC_CENTRE, openMap, projectPoint } from './helpers';
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
 * The close end of the zoom band, in light years. The overlay draws in full at 10,000
 * and draws nothing at 4,000, which is below the band.
 */
const CLOSE_END_FULL = 10000;
const CLOSE_END_NONE = 4000;

/**
 * The three zooms the close end reading takes, in light years. The fade is 1 at 12,000,
 * 0.5 at 7,500 and 0 at 5,000.
 */
const FADE_DISTANCES = [12000, 7500, 5000];

/** The two modes that draw a line. */
const DRAWING_MODES: RegionMode[] = ['simplified', 'accurate'];

/**
 * The view the three modes are compared at. It looks at the 90 degree corner the traced
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

  for (const fragment of ['region-blur.frag', 'region-composite.frag']) {
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

    // 10,000 light years is the closest zoom at which the line draws in full.
    await look(page, NEAR_BOTH_SETS.point, CLOSE_END_FULL);
    await setPasses(page, { regions: true });
    const drawn = await canvasDigest(page);
    await setPasses(page, { regions: false });
    const bare = await canvasDigest(page);
    expect(drawn, `${mode} at ${CLOSE_END_FULL} light years`).not.toBe(bare);

    // 4,000 light years is below the band, so the overlay adds nothing and no name
    // reaches the page.
    await look(page, NEAR_BOTH_SETS.point, CLOSE_END_NONE);
    await setPasses(page, { regions: true });
    const closeDrawn = await canvasDigest(page);
    await setPasses(page, { regions: false });
    const closeBare = await canvasDigest(page);
    expect(closeDrawn, `${mode} at ${CLOSE_END_NONE} light years`).toBe(closeBare);
    expect(await page.locator('.region-label').count()).toBe(0);
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
    // The fade is 1 at 12,000 light years, 0.5 at 7,500 and 0 at 5,000. The bounds are
    // wide because the reading is a pixel of the frame and not the fade itself.
    expect(full, `${mode} at 12,000 light years`).toBeGreaterThan(0.05);
    expect(half, `${mode} at 7,500 light years`).toBeGreaterThan(full / 5);
    expect(half, `${mode} at 7,500 light years`).toBeLessThan((full * 4) / 5);
    expect(none, `${mode} at 5,000 light years`).toBe(0);
  }
});

/** The luminance of the band's own tone, which the composite writes over the frame. */
const TONE_LUMINANCE = 0.2126 * 0.86 + 0.7152 * 0.74 + 0.0722 * 0.6;

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
async function readBandRow(page: Page, choice: CrossingChoice): Promise<BandReading> {
  await lookFrom(page, choice.view);
  const ratio = await devicePixelRatio(page);
  const centre = await projectPoint(page, choice.point);
  const row = {
    x: Math.round(centre.x * ratio) - 20,
    y: Math.round(centre.y * ratio),
    width: 40,
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

test.describe('the band across a chain', () => {
  // The crossing views sit at 1,920 by 1,080, where the region grid cell is 4.62 CSS
  // pixels at a zoom of 10,000 light years and the blur runs. The module reads 1280x720
  // otherwise.
  test.use({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });

  test('is one tone, lightens what it crosses, and widens with the blur', async ({
    page,
  }) => {
    await openMap(page);

    // Each mode reads its own crossing view, because a near-vertical straight run of the
    // smoothed set is not one of the traced staircase. The two rows serve both readings:
    // the run of changed pixels and the width at half the peak.
    await setRegionMode(page, 'simplified');
    const simplified = await readBandRow(page, SMOOTHED_CROSSING);
    await setRegionMode(page, 'accurate');
    const accurate = await readBandRow(page, TRACED_CROSSING);

    for (const [mode, reading] of [
      ['simplified', simplified],
      ['accurate', accurate],
    ] as const) {
      console.log('the band reading', {
        mode,
        runCss: reading.runCss,
        widthCss: reading.widthCss,
        peakAlpha: reading.peakAlpha,
        darkened: reading.darkened,
        withOverlay: reading.withOverlay.map((value) => Number(value.toFixed(3))),
        withoutOverlay: reading.withoutOverlay.map((value) => Number(value.toFixed(3))),
      });
      // The band is one tone of luminance 0.755, so it lightens every pixel it crosses.
      expect(reading.darkened, `${mode} darkened pixels`).toBe(0);
      expect(reading.middleIsLighter, `${mode} middle`).toBe(true);
      expect(reading.runCss, `${mode} run`).toBeGreaterThanOrEqual(5);
      expect(reading.runCss, `${mode} run`).toBeLessThanOrEqual(16);
    }

    // `simplified` never blurs, so it gives the unblurred band at every zoom.
    // `accurate` blurs at a radius of 4.62 CSS pixels here, which is the region grid
    // cell at this zoom and this height.
    expect(simplified.widthCss, 'the simplified width').toBeGreaterThanOrEqual(3);
    expect(simplified.widthCss, 'the simplified width').toBeLessThanOrEqual(3.5);
    expect(accurate.widthCss, 'the accurate width').toBeGreaterThanOrEqual(4.6);
    expect(accurate.widthCss, 'the accurate width').toBeLessThanOrEqual(4.9);

    // The normalisation is what holds the two peaks together. Without it the blurred
    // band would draw at about three fifths of the unblurred band's alpha.
    const ratio = accurate.peakAlpha / simplified.peakAlpha;
    expect(Math.abs(ratio - 1), 'the peak alpha of the two modes').toBeLessThan(0.15);
  });
});

/** What the join reading gives for one chosen corner. */
interface JoinReading {
  /** The largest change the overlay makes within the reach of the bend. */
  readonly bendChange: number;
  /** The largest change it makes on the straight run of the same chain. */
  readonly straightChange: number;
  /** How many pixels the reading found on the drawn line inside the bend. */
  readonly insideCount: number;
  /** How many of those the overlay left unchanged. */
  readonly unchangedInside: number;
}

/**
 * Reads the overlay's own contribution around a corner and on a straight run of the same
 * chain, both from one frame. The overlay draws at less than full opacity, so an absolute
 * reading would follow the galaxy under it.
 */
async function readJoin(page: Page, choice: CornerChoice): Promise<JoinReading> {
  await lookFrom(page, choice.view);
  // The reading radius belongs to the view. The join reads 8 CSS pixels and the 90
  // degree corner of the traced set reads 6, which is the radius its scenario states.
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
  await setPasses(page, { regions: true });
  const withOverlay = await luminanceRect(page, rect);
  await setPasses(page, { regions: false });
  const withoutOverlay = await luminanceRect(page, rect);
  await setPasses(page, { regions: true });

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

  let bendChange = 0;
  let straightChange = 0;
  let unchangedInside = 0;
  let insideCount = 0;
  for (let row = 0; row < rect.height; row += 1) {
    for (let column = 0; column < rect.width; column += 1) {
      const index = row * rect.width + column;
      const point = { x: rect.x + column + 0.5, y: rect.y + row + 0.5 };
      const change = Math.abs(
        (withOverlay[index] as number) - (withoutOverlay[index] as number),
      );
      const toBend = Math.hypot(point.x - bend.x, point.y - bend.y);
      if (toBend <= reach) {
        if (change > bendChange) bendChange = change;
        // A pixel on the middle of the drawn line must be drawn. A quad per segment
        // with no fill at a join leaves a notch here.
        if (gapToBendLine(point) <= 0.8) {
          insideCount += 1;
          if (change <= 0.001) unchangedInside += 1;
        }
        continue;
      }
      if (
        toBend > reach * 1.5 &&
        gapToSegment(point, straightFrom, straightTo) <= 1.2
      ) {
        if (change > straightChange) straightChange = change;
      }
    }
  }
  return { bendChange, straightChange, insideCount, unchangedInside };
}

test.describe('the corner readings', () => {
  // Both corner views sit at 1,920 by 1,080. The join reads at a zoom of 12,000 light
  // years and the traced corner at 10,000, where the blur runs at a radius of 4.62 CSS
  // pixels. At 1280x720 the blur would not run and the reading would check nothing this
  // change added.
  test.use({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });

  test('a join is not brighter than the line', async ({ page }) => {
    await openMap(page);
    const reading = await readJoin(page, SHARP_CORNER);
    console.log('the join reading', {
      turnDegrees: SHARP_CORNER.turnDegrees,
      ...reading,
    });

    expect(reading.insideCount).toBeGreaterThan(8);
    expect(reading.unchangedInside).toBe(0);
    expect(reading.straightChange).toBeGreaterThan(0.05);
    expect(reading.bendChange).toBeLessThanOrEqual(reading.straightChange);
  });

  test('a 90 degree corner of the traced set is not brighter than its line', async ({
    page,
  }) => {
    await openMap(page);
    await setRegionMode(page, 'accurate');
    const reading = await readJoin(page, TRACED_CORNER);
    console.log('the traced corner reading', {
      turnDegrees: TRACED_CORNER.turnDegrees,
      ...reading,
    });

    expect(TRACED_CORNER.turnDegrees).toBe(90);
    expect(reading.insideCount).toBeGreaterThan(8);
    expect(reading.unchangedInside).toBe(0);
    expect(reading.straightChange).toBeGreaterThan(0.05);
    expect(reading.bendChange).toBeLessThanOrEqual(reading.straightChange);
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
    expect(await regionMode(page)).toBe('simplified');
    await setPasses(page, { regions: true });
  });

  test('is simplified by default', async ({ page }) => {
    await openMap(page);
    expect(await regionMode(page)).toBe('simplified');
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
    expect(modes?.none).toBe('simplified');
    expect(modes?.empty).toBe('simplified');
    expect(modes?.accurate).toBe('accurate');
    expect(modes?.off).toBe('off');
    // A value the map does not know leaves the default, as a bad value does on the
    // setter.
    expect(modes?.bad).toBe('simplified');
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

  test('gives the same answer at any height', async ({ page }) => {
    await openMap(page);
    const names = await page.evaluate(() => {
      const map = window.galaxyMap;
      if (map === undefined) return null;
      return {
        plane: map.regionNameAt([0, 0, 0]),
        above: map.regionNameAt([0, 20000, 0]),
      };
    });
    console.log('the region name at a height', names);

    expect((names as { plane: string; above: string }).plane).toBe(
      (names as { plane: string; above: string }).above,
    );
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
