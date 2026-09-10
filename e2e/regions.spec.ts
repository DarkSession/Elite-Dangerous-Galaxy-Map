import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { GALACTIC_CENTRE, openMap, projectPoint } from './helpers';
import { LONG_SEGMENT, SHARP_CORNER, VERTICAL_CROSSING } from './region-views';
import type { ChosenView } from './region-views';

test.use({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });

/** A view inside the band where the overlay draws in full. */
const MEDIUM_DISTANCE = 10000;

/** The two close views the boundary must still draw at, in light years. */
const CLOSE_DISTANCES = [1500, 500];

/** How many CSS pixels around the corner the join reading takes. */
const JOIN_RADIUS = 8;

/** How far above and below the line the long-segment reading takes, in CSS pixels. */
const COLUMN_HALF = 20;

/** Two plane points, one on a boundary and one away from every boundary. */
interface BoundarySample {
  /** The midpoint of one of the 200 longest segments, in game coordinates. */
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

    // The search measures to the nearest **segment** and not to the nearest vertex.
    // The set holds 439 segments over 562 vertices, and a segment runs up to 14,970
    // light years, so a point in the middle of one is far from every vertex and right
    // on the drawn line. `gapTo` walks all 439 segments, which is what the whole search
    // can afford: 200 candidates by 288 offsets is at most 57,600 readings.

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
    let clearest = 0;
    for (const candidate of candidates.slice(0, 200)) {
      const cursorRadius = radiusOf(candidate.x, candidate.z);
      for (let step = 0; step < 72; step += 1) {
        const angle = (2 * Math.PI * step) / 72;
        for (const range of [1200, 1600, 2000, 2400]) {
          const x = candidate.x + range * Math.cos(angle);
          const z = candidate.z + range * Math.sin(angle);
          if (Math.abs(radiusOf(x, z) - cursorRadius) > 400) continue;
          const clearance = gapTo(x, z);
          // The whole 200 candidates are read and the clearest pair wins, rather than
          // the first pair that holds. The reading needs a point at least 1,000 light
          // years from every chain, and the clearest one holds that with the most room.
          if (clearance > clearest) {
            clearest = clearance;
            onBoundary = [candidate.x, 0, candidate.z];
            away = [x, 0, z];
          }
        }
      }
    }
    if (clearest < 1200 || onBoundary === null || away === null) return null;

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

  const composite = await page.evaluate(
    (sources) => {
      const compile = window.__galaxyMap?.compileTestProgram;
      if (compile === undefined) return 'the page has no compile hook';
      return compile(sources.vertex, sources.fragment);
    },
    {
      vertex: shaderSource('fullscreen.vert'),
      fragment: shaderSource('region-composite.frag'),
    },
  );
  expect(composite).toBeNull();
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

test('the boundary still draws at the closest zoom', async ({ page }) => {
  await openMap(page);
  const sample = await boundarySample(page);

  for (const distance of CLOSE_DISTANCES) {
    await look(page, sample.onBoundary, distance);
    await setPasses(page, { regions: true });
    const withOverlay = await canvasDigest(page);
    await setPasses(page, { regions: false });
    const withoutOverlay = await canvasDigest(page);

    // Phase 2 removed the lines below 3,000 light years. A line with few vertices and
    // no invented corners does not read as a staircase, so they draw here now.
    expect(withOverlay, `at ${distance} light years`).not.toBe(withoutOverlay);
  }
});

test('the line is four CSS pixels wide and two-toned', async ({ page }) => {
  await openMap(page);
  await lookFrom(page, VERTICAL_CROSSING.view);
  const ratio = await devicePixelRatio(page);

  // The chain stands within 0.03 degrees of vertical at the centre of the frame, so
  // one row of pixels across the centre cuts it square.
  const centre = await projectPoint(page, VERTICAL_CROSSING.point);
  const row = {
    x: Math.round(centre.x) - 20,
    y: Math.round(centre.y),
    width: 40,
    height: 1,
  };
  const withOverlay = await luminanceRect(page, row);
  await setPasses(page, { regions: false });
  const withoutOverlay = await luminanceRect(page, row);

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
  console.log('the width reading', {
    ratio,
    runs,
    withOverlay: withOverlay.map((value) => Number(value.toFixed(3))),
    withoutOverlay: withoutOverlay.map((value) => Number(value.toFixed(3))),
  });

  expect(runs).toHaveLength(1);
  const run = runs[0] as { start: number; end: number };
  const widthCss = (run.end - run.start + 1) / ratio;
  expect(Math.abs(widthCss - 4)).toBeLessThanOrEqual(1);

  const middle = Math.round((run.start + run.end) / 2);
  expect(withOverlay[middle] as number).toBeGreaterThan(
    withOverlay[run.start] as number,
  );
  expect(withOverlay[middle] as number).toBeGreaterThan(withOverlay[run.end] as number);

  // The outline is the darker of the two colours, so both ends of the run are darker
  // than the frame under them.
  expect(withOverlay[run.start] as number).toBeLessThan(
    withoutOverlay[run.start] as number,
  );
  expect(withOverlay[run.end] as number).toBeLessThan(
    withoutOverlay[run.end] as number,
  );
});

test('a join is not brighter than the line', async ({ page }) => {
  await openMap(page);
  await lookFrom(page, SHARP_CORNER.view);

  const bend = await projectPoint(page, SHARP_CORNER.bend);
  const bendLine: { x: number; y: number }[] = [];
  for (const point of SHARP_CORNER.bendLine) {
    bendLine.push(await projectPoint(page, point));
  }
  const straightFrom = await projectPoint(page, SHARP_CORNER.straightFrom);
  const straightTo = await projectPoint(page, SHARP_CORNER.straightTo);

  // One rectangle holds the bend and the straight run, so both readings come from
  // one frame and the overlay switch moves once.
  const left = Math.floor(
    Math.min(bend.x, straightFrom.x, straightTo.x) - JOIN_RADIUS - 4,
  );
  const top = Math.floor(
    Math.min(bend.y, straightFrom.y, straightTo.y) - JOIN_RADIUS - 4,
  );
  const rect = {
    x: left,
    y: top,
    width:
      Math.ceil(Math.max(bend.x, straightFrom.x, straightTo.x) + JOIN_RADIUS + 4) -
      left,
    height:
      Math.ceil(Math.max(bend.y, straightFrom.y, straightTo.y) + JOIN_RADIUS + 4) - top,
  };
  const withOverlay = await luminanceRect(page, rect);
  await setPasses(page, { regions: false });
  const withoutOverlay = await luminanceRect(page, rect);

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
      // The change is the overlay's own contribution. The overlay draws at less than
      // full opacity, so an absolute reading would follow the galaxy under it.
      const change = Math.abs(
        (withOverlay[index] as number) - (withoutOverlay[index] as number),
      );
      const toBend = Math.hypot(point.x - bend.x, point.y - bend.y);
      if (toBend <= JOIN_RADIUS) {
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
        toBend > JOIN_RADIUS * 1.5 &&
        gapToSegment(point, straightFrom, straightTo) <= 1.2
      ) {
        if (change > straightChange) straightChange = change;
      }
    }
  }
  console.log('the join reading', {
    turnDegrees: SHARP_CORNER.turnDegrees,
    bendChange,
    straightChange,
    insideCount,
    unchangedInside,
  });

  expect(insideCount).toBeGreaterThan(8);
  expect(unchangedInside).toBe(0);
  expect(straightChange).toBeGreaterThan(0.05);
  expect(bendChange).toBeLessThanOrEqual(straightChange);
});

test('a long segment holds its width across the frame', async ({ page }) => {
  await openMap(page);
  await lookFrom(page, LONG_SEGMENT.view);
  const ratio = await devicePixelRatio(page);

  // The segment runs 0.0007 degrees from flat, so it crosses the frame from the left
  // edge to the right edge and a column of pixels cuts it square. Its two ends sit
  // more than 7,000 light years outside the frame, so the reading meets the middle of
  // the segment and never one of its ends.
  const ends = [
    await projectPoint(page, LONG_SEGMENT.ends[0]),
    await projectPoint(page, LONG_SEGMENT.ends[1]),
  ];
  const width = LONG_SEGMENT.viewport.width;
  const yAt = (x: number): number => {
    const first = ends[0] as { x: number; y: number };
    const second = ends[1] as { x: number; y: number };
    const part = (x - first.x) / (second.x - first.x);
    return first.y + part * (second.y - first.y);
  };

  const columns = [
    Math.round(width * 0.05),
    Math.round(width / 2),
    Math.round(width * 0.95),
  ];
  const readings: { x: number; y: number; height: number }[] = columns.map((x) => ({
    x,
    y: Math.round(yAt(x)) - COLUMN_HALF,
    height: COLUMN_HALF * 2,
  }));

  const withOverlay: number[][] = [];
  for (const reading of readings) {
    withOverlay.push(await luminanceRect(page, { ...reading, width: 1 }));
  }
  await setPasses(page, { regions: false });
  const withoutOverlay: number[][] = [];
  for (const reading of readings) {
    withoutOverlay.push(await luminanceRect(page, { ...reading, width: 1 }));
  }

  const widths: number[] = [];
  for (let index = 0; index < readings.length; index += 1) {
    const on = withOverlay[index] as number[];
    const off = withoutOverlay[index] as number[];
    const runs: { start: number; end: number }[] = [];
    for (let row = 0; row < on.length; row += 1) {
      if (Math.abs((on[row] as number) - (off[row] as number)) <= 0.001) continue;
      const last = runs[runs.length - 1];
      if (last !== undefined && last.end === row - 1) last.end = row;
      else runs.push({ start: row, end: row });
    }
    expect(runs, `the column at ${(readings[index] as { x: number }).x}`).toHaveLength(
      1,
    );
    const run = runs[0] as { start: number; end: number };
    widths.push((run.end - run.start + 1) / ratio);
  }
  console.log('the long segment reading', {
    segmentLy: LONG_SEGMENT.segmentLy,
    columns,
    widths,
  });

  for (const drawn of widths) expect(Math.abs(drawn - 4)).toBeLessThanOrEqual(1);
  expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1);
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
