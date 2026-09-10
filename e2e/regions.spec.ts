import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { GALACTIC_CENTRE, openMap, projectPoint } from './helpers';
import {
  BIARC_JOINT,
  CURVED_RUN,
  LONG_SEGMENT,
  SHARP_CORNER,
  VERTICAL_CROSSING,
} from './region-views';
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
  /** The middle of the sweep of one of the 200 longest primitives, in game coordinates. */
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
 * primitive only inside one chain. The away point sits near the boundary point and at
 * nearly the same galactocentric radius, so the galaxy under the two readings is as
 * alike as the map allows.
 */
async function boundarySample(page: Page): Promise<BoundarySample> {
  const sample = await page.evaluate((centre) => {
    const positions = window.__galaxyMap?.regionLinePositions?.();
    const curvature = window.__galaxyMap?.regionLineCurvature?.();
    const chains = window.__galaxyMap?.regionLineChains?.();
    if (positions === undefined || chains === undefined) return null;
    if (curvature === undefined) return null;
    if (positions.length === 0 || chains.first.length === 0) return null;

    /** One drawn primitive: two ends and a signed curvature. Zero is straight. */
    interface Primitive {
      x0: number;
      z0: number;
      x1: number;
      z1: number;
      k: number;
    }

    const primitives: Primitive[] = [];
    for (let chain = 0; chain < chains.first.length; chain += 1) {
      const first = chains.first[chain] as number;
      const last = chains.last[chain] as number;
      for (let vertex = first; vertex < last; vertex += 1) {
        primitives.push({
          x0: positions[vertex * 3] as number,
          z0: positions[vertex * 3 + 2] as number,
          x1: positions[(vertex + 1) * 3] as number,
          z1: positions[(vertex + 1) * 3 + 2] as number,
          k: curvature[vertex] as number,
        });
      }
    }

    /** The sweep of a primitive, in radians. It carries the sign of the curvature. */
    const sweepOf = (piece: Primitive): number => {
      const chord = Math.hypot(piece.x1 - piece.x0, piece.z1 - piece.z0);
      if (piece.k === 0 || chord === 0) return 0;
      const sine = Math.min(1, Math.max(-1, (piece.k * chord) / 2));
      return 2 * Math.asin(sine);
    };

    /** The point at a fraction of the sweep of a primitive, as `x` then `z`. */
    const pointAt = (piece: Primitive, fraction: number): [number, number] => {
      const sweep = sweepOf(piece);
      if (sweep === 0) {
        return [
          piece.x0 + fraction * (piece.x1 - piece.x0),
          piece.z0 + fraction * (piece.z1 - piece.z0),
        ];
      }
      // The chord to that point lies at the start tangent turned by half the swept
      // angle, and it is `2 sin(half) / k` long. The start tangent sits half the whole
      // sweep before the chord direction.
      const chord = Math.hypot(piece.x1 - piece.x0, piece.z1 - piece.z0);
      const ux = (piece.x1 - piece.x0) / chord;
      const uz = (piece.z1 - piece.z0) / chord;
      const turn = (sweep * (fraction - 1)) / 2;
      const cosine = Math.cos(turn);
      const sine = Math.sin(turn);
      const reach = (2 * Math.sin((sweep * fraction) / 2)) / piece.k;
      return [
        piece.x0 + reach * (ux * cosine - uz * sine),
        piece.z0 + reach * (ux * sine + uz * cosine),
      ];
    };

    /**
     * The distance from a plane point to one drawn primitive. An arc takes the reading
     * off its circle, so the whole walk stays a handful of operations per primitive.
     */
    const gapToPrimitive = (x: number, z: number, piece: Primitive): number => {
      const toEnds = Math.min(
        Math.hypot(x - piece.x0, z - piece.z0),
        Math.hypot(x - piece.x1, z - piece.z1),
      );
      const sweep = sweepOf(piece);
      if (sweep === 0) {
        const dx = piece.x1 - piece.x0;
        const dz = piece.z1 - piece.z0;
        const square = dx * dx + dz * dz;
        let t = square === 0 ? 0 : ((x - piece.x0) * dx + (z - piece.z0) * dz) / square;
        if (t < 0) t = 0;
        if (t > 1) t = 1;
        return Math.hypot(x - (piece.x0 + t * dx), z - (piece.z0 + t * dz));
      }
      const chord = Math.hypot(piece.x1 - piece.x0, piece.z1 - piece.z0);
      const ux = (piece.x1 - piece.x0) / chord;
      const uz = (piece.z1 - piece.z0) / chord;
      // The start tangent, and the centre a radius to its left. The sign of the
      // curvature carries which side left is.
      const cosine = Math.cos(-sweep / 2);
      const sine = Math.sin(-sweep / 2);
      const tx = ux * cosine - uz * sine;
      const tz = ux * sine + uz * cosine;
      const cx = piece.x0 - tz / piece.k;
      const cz = piece.z0 + tx / piece.k;
      const radius = 1 / Math.abs(piece.k);
      const away = Math.hypot(x - cx, z - cz);
      const atStart = Math.atan2(piece.z0 - cz, piece.x0 - cx);
      let turned = Math.atan2(z - cz, x - cx) - atStart;
      while (turned > Math.PI) turned -= 2 * Math.PI;
      while (turned < -Math.PI) turned += 2 * Math.PI;
      const inside =
        sweep > 0 ? turned >= 0 && turned <= sweep : turned <= 0 && turned >= sweep;
      return inside ? Math.abs(away - radius) : toEnds;
    };

    const gapTo = (x: number, z: number): number => {
      let shortest = Number.POSITIVE_INFINITY;
      for (const piece of primitives) {
        const gap = gapToPrimitive(x, z, piece);
        if (gap < shortest) shortest = gap;
      }
      return shortest;
    };

    // The search measures to the nearest **drawn primitive** and not to the nearest
    // vertex and not to a chord. The set holds 593 primitives over 716 vertices, a
    // primitive runs up to 14,970 light years, and an arc bows away from its chord by
    // up to 60.6, so neither of the other two measures answers for the drawn line.
    // `gapTo` walks all 593 primitives, which is what the whole search can afford: 200
    // candidates by 288 offsets is at most 57,600 readings.

    // The candidates are the longest primitives, because a long primitive sits where
    // the boundary is straight, and the point taken is the middle of its **sweep**, so
    // it lies on the drawn line whether it curves or not.
    const candidates: { x: number; z: number; length: number }[] = [];
    for (const piece of primitives) {
      const middle = pointAt(piece, 0.5);
      candidates.push({
        x: middle[0],
        z: middle[1],
        length: Math.hypot(piece.x1 - piece.x0, piece.z1 - piece.z0),
      });
    }
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

/** What one join reading gives back. */
interface JoinReading {
  /** The largest change the overlay makes inside the reading window. */
  readonly joinChange: number;
  /** The largest change it makes on the straight run of the same chain. */
  readonly straightChange: number;
  /** How many pixels of the reading window sit on the middle of the drawn line. */
  readonly insideCount: number;
  /** How many of those the overlay leaves unchanged. */
  readonly unchangedInside: number;
}

/**
 * Reads what the overlay changes around one join, and on a straight run of the same
 * chain in the same frame.
 *
 * The reading is the same at a break and at the joint of a biarc, so both tests take
 * it from here. The change is the frame with the overlay less the frame without it,
 * because the overlay draws at less than full opacity and an absolute reading would
 * follow the galaxy under it.
 */
async function joinReading(
  page: Page,
  centreGame: [number, number, number],
  lineGame: [number, number, number][],
  straightFromGame: [number, number, number],
  straightToGame: [number, number, number],
): Promise<JoinReading> {
  const centre = await projectPoint(page, centreGame);
  const line: { x: number; y: number }[] = [];
  for (const point of lineGame) line.push(await projectPoint(page, point));
  const straightFrom = await projectPoint(page, straightFromGame);
  const straightTo = await projectPoint(page, straightToGame);

  // One rectangle holds the join and the straight run, so both readings come from
  // one frame and the overlay switch moves once.
  const left = Math.floor(
    Math.min(centre.x, straightFrom.x, straightTo.x) - JOIN_RADIUS - 4,
  );
  const top = Math.floor(
    Math.min(centre.y, straightFrom.y, straightTo.y) - JOIN_RADIUS - 4,
  );
  const rect = {
    x: left,
    y: top,
    width:
      Math.ceil(Math.max(centre.x, straightFrom.x, straightTo.x) + JOIN_RADIUS + 4) -
      left,
    height:
      Math.ceil(Math.max(centre.y, straightFrom.y, straightTo.y) + JOIN_RADIUS + 4) -
      top,
  };
  const withOverlay = await luminanceRect(page, rect);
  await setPasses(page, { regions: false });
  const withoutOverlay = await luminanceRect(page, rect);

  /** The distance from a point to the drawn line inside the reading window. */
  const gapToLine = (point: { x: number; y: number }): number => {
    let nearest = Number.POSITIVE_INFINITY;
    for (let index = 0; index + 1 < line.length; index += 1) {
      const away = gapToSegment(
        point,
        line[index] as { x: number; y: number },
        line[index + 1] as { x: number; y: number },
      );
      if (away < nearest) nearest = away;
    }
    return nearest;
  };

  let joinChange = 0;
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
      const toCentre = Math.hypot(point.x - centre.x, point.y - centre.y);
      if (toCentre <= JOIN_RADIUS) {
        if (change > joinChange) joinChange = change;
        // A pixel on the middle of the drawn line must be drawn. A quad per primitive
        // with no fill at a join leaves a notch here.
        if (gapToLine(point) <= 0.8) {
          insideCount += 1;
          if (change <= 0.001) unchangedInside += 1;
        }
        continue;
      }
      if (
        toCentre > JOIN_RADIUS * 1.5 &&
        gapToSegment(point, straightFrom, straightTo) <= 1.2
      ) {
        if (change > straightChange) straightChange = change;
      }
    }
  }
  return { joinChange, straightChange, insideCount, unchangedInside };
}

test('a join is not brighter than the line', async ({ page }) => {
  await openMap(page);
  await lookFrom(page, SHARP_CORNER.view);
  const reading = await joinReading(
    page,
    SHARP_CORNER.bend,
    SHARP_CORNER.bendLine,
    SHARP_CORNER.straightFrom,
    SHARP_CORNER.straightTo,
  );
  console.log('the join reading', {
    turnDegrees: SHARP_CORNER.turnDegrees,
    ...reading,
  });

  expect(reading.insideCount).toBeGreaterThan(8);
  expect(reading.unchangedInside).toBe(0);
  expect(reading.straightChange).toBeGreaterThan(0.05);
  expect(reading.joinChange).toBeLessThanOrEqual(reading.straightChange);
});

test('a join between two arcs is not brighter than the line', async ({ page }) => {
  await openMap(page);
  await lookFrom(page, BIARC_JOINT.view);
  const reading = await joinReading(
    page,
    BIARC_JOINT.joint,
    BIARC_JOINT.jointLine,
    BIARC_JOINT.straightFrom,
    BIARC_JOINT.straightTo,
  );
  console.log('the biarc joint reading', {
    turnDegrees: BIARC_JOINT.turnDegrees,
    curvatures: BIARC_JOINT.curvatures,
    ...reading,
  });

  // This is the join the set now holds most of, and the straight fit never had it.
  // Two arcs that overlap slightly at a tangential joint would draw a bright spot every
  // few hundred light years along every curve.
  expect(reading.insideCount).toBeGreaterThan(8);
  expect(reading.unchangedInside).toBe(0);
  expect(reading.straightChange).toBeGreaterThan(0.05);
  expect(reading.joinChange).toBeLessThanOrEqual(reading.straightChange);
});

/** The luminance of every pixel of several rectangles, one array each. */
async function luminanceRects(
  page: Page,
  rects: { x: number; y: number; width: number; height: number }[],
): Promise<number[][]> {
  return page.evaluate((where) => {
    const map = window.__galaxyMap;
    if (map?.readRect === undefined) return [];
    return where.map((rect) => {
      const bytes = map.readRect?.(rect.x, rect.y, rect.width, rect.height);
      const values: number[] = [];
      if (bytes === undefined) return values;
      for (let index = 0; index < bytes.length; index += 4) {
        values.push(
          (0.2126 * (bytes[index] as number) +
            0.7152 * (bytes[index + 1] as number) +
            0.0722 * (bytes[index + 2] as number)) /
            255,
        );
      }
      return values;
    });
  }, rects);
}

/**
 * Where the drawn line runs through one window, in CSS pixels, or null where the
 * overlay changes too little of it to say.
 *
 * The reading is the centroid of the pixels the overlay changed, weighted by how much
 * it changed each of them, over a **disc** of the window radius. The disc matters: a
 * square would cut the band of drawn pixels off at different lengths on its two sides
 * and drag the centroid along the line with it, while a disc cuts it symmetrically, so
 * the centroid lands where the line crosses the middle of the window.
 *
 * A centroid holds the line to a fraction of a pixel across its width, where the
 * principal axis of a band 4 pixels wide and 12 long does not: that fit carries about 3
 * degrees of noise, which is the bound itself.
 */
function drawnLineCentre(
  withOverlay: number[],
  withoutOverlay: number[],
  rect: { x: number; y: number; width: number; height: number },
  centre: { x: number; y: number },
  radius: number,
): { x: number; y: number } | null {
  let weight = 0;
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  for (let index = 0; index < withOverlay.length; index += 1) {
    const column = index % rect.width;
    const row = Math.floor(index / rect.width);
    // The disc sits on the sample itself and not on a rounded pixel, so the window
    // does not step from one sample to the next.
    const dx = rect.x + column + 0.5 - centre.x;
    const dy = rect.y + row + 0.5 - centre.y;
    if (dx * dx + dy * dy > radius * radius) continue;
    const change = Math.abs(
      (withOverlay[index] as number) - (withoutOverlay[index] as number),
    );
    if (change <= 0.004) continue;
    weight += change;
    sumX += change * (rect.x + column + 0.5);
    sumY += change * (rect.y + row + 0.5);
    count += 1;
  }
  if (count < 8 || weight <= 0) return null;
  return { x: sumX / weight, y: sumY / weight };
}

/** The direction from one point to the next, in degrees. */
function directionOf(from: { x: number; y: number }, to: { x: number; y: number }) {
  return (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
}

/** The change from one direction to the next, in degrees, wrapped into -180 to 180. */
function directionChange(from: number, to: number): number {
  let change = to - from;
  while (change > 180) change -= 360;
  while (change < -180) change += 360;
  return change;
}

test('a curve shows no facet', async ({ page }) => {
  await openMap(page);
  await lookFrom(page, CURVED_RUN.view);

  // One window per sample of the drawn line, 12 CSS pixels across and one window
  // apart, so the walk reads neighbouring windows along the whole run in frame. The
  // rectangle read is two pixels wider than the window, because the window is a disc
  // about the sample itself and the rectangle can only start at a whole pixel.
  const half = CURVED_RUN.windowPixels / 2;
  const rects: { x: number; y: number; width: number; height: number }[] = [];
  const points: { x: number; y: number }[] = [];
  for (const point of CURVED_RUN.line) {
    const screen = await projectPoint(page, point);
    points.push(screen);
    rects.push({
      x: Math.round(screen.x) - half - 1,
      y: Math.round(screen.y) - half - 1,
      width: CURVED_RUN.windowPixels + 3,
      height: CURVED_RUN.windowPixels + 3,
    });
  }

  const withOverlay = await luminanceRects(page, rects);
  await setPasses(page, { regions: false });
  const withoutOverlay = await luminanceRects(page, rects);

  // Where the drawn line runs through each window, and the direction it runs in from
  // one window to the next. The reading is the drawn line's own position and not the
  // geometry the search chose, so a drawn line that left the arc moves it.
  const centres: { x: number; y: number }[] = [];
  let empty = 0;
  for (let index = 0; index < rects.length; index += 1) {
    const centre = drawnLineCentre(
      withOverlay[index] as number[],
      withoutOverlay[index] as number[],
      rects[index] as { x: number; y: number; width: number; height: number },
      points[index] as { x: number; y: number },
      half,
    );
    if (centre === null) {
      empty += 1;
      continue;
    }
    centres.push(centre);
  }
  const directions: number[] = [];
  for (let index = 1; index < centres.length; index += 1) {
    directions.push(
      directionOf(
        centres[index - 1] as { x: number; y: number },
        centres[index] as { x: number; y: number },
      ),
    );
  }

  let worst = 0;
  let swept = 0;
  for (let index = 1; index < directions.length; index += 1) {
    const change = directionChange(
      directions[index - 1] as number,
      directions[index] as number,
    );
    swept += Math.abs(change);
    if (Math.abs(change) > worst) worst = Math.abs(change);
  }
  console.log('the curve reading', {
    windows: rects.length,
    empty,
    worst,
    swept,
    turnDegrees: CURVED_RUN.turnDegrees,
    visibleTurnDegrees: CURVED_RUN.visibleTurnDegrees,
    turnPerWindowDegrees: CURVED_RUN.turnPerWindowDegrees,
  });

  // The overlay draws in every window, so the walk reads the line and not the frame.
  expect(empty).toBe(0);
  expect(directions.length).toBeGreaterThan(8);
  // The drawn line really curves through the frame, so a reading over a straight
  // stretch cannot pass this by holding still.
  expect(swept).toBeGreaterThan(20);
  // A tessellation too coarse for the zoom fails here, and so does a fit that put a
  // break where the data does not turn.
  expect(worst).toBeLessThan(3);
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
