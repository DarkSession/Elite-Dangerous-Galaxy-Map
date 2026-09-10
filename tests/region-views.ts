// Chooses the three views the browser tests of the boundary line need.
//
// Three scenarios of `openspec/specs/galactic-regions` name a view that a unit test has
// to choose: one where a chain crosses the frame within 5 degrees of vertical, one at a
// vertex where two segments meet at at least 60 degrees, and one where a segment longer
// than 10,000 light years crosses the whole frame with both ends outside it. All three
// come from the boundary set itself, so nobody has to pick a place on the map by hand.
//
// The boundary set is now 439 straight segments over 562 vertices, with segments up to
// 14,970 light years long. Every search therefore measures to a **segment** and not to a
// vertex: two vertices can be thousands of light years apart, and the line between them
// is drawn. A vertex measure calls a point in the middle of a long segment clear.
//
// The search lives here and `region-views.test.ts` checks that the constants in
// `e2e/region-views.ts` are what it gives. The browser test reads those constants,
// because Playwright cannot import the camera module: it reaches the PNG of the
// detail grid, which only Vite can load.
import { galaxyModel } from '../src/galaxy-model/model';
import { project } from '../src/camera/projection';
import type { Viewport } from '../src/camera/projection';
import type { View } from '../src/camera/view';
import type { RegionLines } from '../src/scene-data/types';
import type {
  CornerChoice,
  CrossingChoice,
  ChosenView,
  LongSegmentChoice,
} from '../e2e/region-views';

/** The galactic centre in game coordinates, as the browser helpers hold it. */
const GALACTIC_CENTRE: readonly [number, number, number] = [15, -35, 25895];

/** The elevation every view takes. It looks nearly straight down on the plane. */
const PITCH = 89;

/** The closest zoom the camera allows, in light years. */
const CLOSEST_DISTANCE = 500;

/** How far the drawn line may sit from a straight chord and still count as straight. */
const STRAIGHT_TOLERANCE_LY = 5;

/**
 * The largest corrected surface density the frame of a reading may hold.
 *
 * Every reading compares the drawn line with the frame under it, so the disc must be
 * dim enough for the lighter core of the line to read against it. The committed width
 * reading works over a frame whose largest density is 2.23e5 in these units: it reads
 * the middle of the line as lighter than the frame and both edges as darker. The core
 * bulge reaches 8e6, which is 35 times that, and a saturated frame cannot read as
 * lighter. The ceiling sits a little over the brightest frame the searches choose,
 * 2.50e5, and far under the next candidate, 1.47e6, so no view rests on a near tie.
 *
 * The model without its detail grid gives the corrected surface density, which is what
 * the point cloud is drawn from, so it stands in for how bright the frame comes out.
 */
const DISC_DENSITY_CEILING = 3e5;

/** A plane point of the boundary set, as `x` then `z`. */
type Plane = readonly [number, number];

function planeAt(lines: RegionLines, vertex: number): Plane {
  return [
    lines.positions[vertex * 3] as number,
    lines.positions[vertex * 3 + 2] as number,
  ];
}

function game(point: Plane): [number, number, number] {
  return [point[0], 0, point[1]];
}

function gap(a: Plane, b: Plane): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

/** The point a fraction of the way from `a` to `b`. */
function along(a: Plane, b: Plane, fraction: number): Plane {
  return [a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction];
}

/** The point `reach` light years from `a` towards `b`. */
function towards(a: Plane, b: Plane, reach: number): Plane {
  const span = gap(a, b);
  return span === 0 ? a : along(a, b, reach / span);
}

/**
 * Calls `visit` for every segment of the set, as the vertex it starts at. A pair of
 * vertices is a segment only inside one chain, so the walk runs chain by chain.
 */
function forEachSegment(lines: RegionLines, visit: (segment: number) => void): void {
  for (let chain = 0; chain < lines.chainCount; chain += 1) {
    const first = lines.first[chain] as number;
    const last = lines.last[chain] as number;
    for (let segment = first; segment < last; segment += 1) visit(segment);
  }
}

/** The distance from a plane point to one segment, as the vertex it starts at. */
function segmentGap(lines: RegionLines, point: Plane, segment: number): number {
  const a = planeAt(lines, segment);
  const b = planeAt(lines, segment + 1);
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const square = dx * dx + dz * dz;
  let t = square === 0 ? 0 : ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / square;
  if (t < 0) t = 0;
  if (t > 1) t = 1;
  return Math.hypot(point[0] - (a[0] + t * dx), point[1] - (a[1] + t * dz));
}

/** The largest departure of the vertices between two ends from the chord they span. */
function chordDeparture(lines: RegionLines, from: number, to: number): number {
  const a = planeAt(lines, from);
  const b = planeAt(lines, to);
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const span = Math.hypot(dx, dz);
  if (span === 0) return Number.POSITIVE_INFINITY;
  let worst = 0;
  for (let vertex = from + 1; vertex < to; vertex += 1) {
    const point = planeAt(lines, vertex);
    const away = Math.abs((point[0] - a[0]) * dz - (point[1] - a[1]) * dx) / span;
    if (away > worst) worst = away;
  }
  return worst;
}

/**
 * The distance from a plane point to the nearest **segment** the caller does not
 * exclude, as the drawn line and not as a set of vertices. A segment is named by the
 * vertex it starts at.
 *
 * Every browser reading compares the line under test with the frame around it, so each
 * search uses this as a guard that no other part of the boundary is drawn near the
 * middle of the frame.
 */
function clearanceFrom(
  lines: RegionLines,
  point: Plane,
  keepOut: (segment: number) => boolean,
): number {
  let nearest = Number.POSITIVE_INFINITY;
  forEachSegment(lines, (segment) => {
    if (keepOut(segment)) return;
    const away = segmentGap(lines, point, segment);
    if (away < nearest) nearest = away;
  });
  return nearest;
}

/** How many light years one CSS pixel covers at the cursor. */
function lightYearsPerPixel(distance: number, viewport: Viewport): number {
  return (2 * distance * Math.tan(Math.PI / 6)) / viewport.height;
}

/** Half the diagonal of the frame, in light years at the cursor. */
function frameReach(distance: number, viewport: Viewport): number {
  return (
    (Math.hypot(viewport.width, viewport.height) / 2) *
    lightYearsPerPixel(distance, viewport)
  );
}

/**
 * The largest corrected surface density over the frame at a cursor. The reading is a
 * grid over the width and the height of the frame, which is what the camera shows.
 */
function frameDensity(cursor: Plane, distance: number, viewport: Viewport): number {
  const perPixel = lightYearsPerPixel(distance, viewport);
  const halfWidth = (viewport.width / 2) * perPixel;
  const halfHeight = (viewport.height / 2) * perPixel;
  let brightest = 0;
  for (let row = -4; row <= 4; row += 1) {
    for (let column = -4; column <= 4; column += 1) {
      const density = galaxyModel.correctedSurfaceDensity(
        cursor[0] + (column / 4) * halfWidth,
        cursor[1] + (row / 4) * halfHeight,
      );
      if (density > brightest) brightest = density;
    }
  }
  return brightest;
}

/** The angle of a projected direction from the vertical, in degrees, 0 to 90. */
function angleFromVertical(
  view: View,
  viewport: Viewport,
  from: [number, number, number],
  to: [number, number, number],
): number {
  const a = project(view, from, viewport);
  const b = project(view, to, viewport);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return 90;
  const degrees = (Math.atan2(Math.abs(dx), Math.abs(dy)) * 180) / Math.PI;
  return degrees;
}

/**
 * The yaw that puts a plane direction nearest to a wanted angle from the vertical on
 * the screen. A wanted angle of 0 stands the direction upright and one of 90 lays it
 * flat.
 */
function yawForAngle(
  cursor: [number, number, number],
  distance: number,
  viewport: Viewport,
  from: [number, number, number],
  to: [number, number, number],
  wanted: number,
): { yaw: number; angle: number } {
  let best = { yaw: 0, angle: 90 };
  let smallest = Number.POSITIVE_INFINITY;
  for (let step = 0; step < 7200; step += 1) {
    const yaw = step / 20;
    const view: View = { cursor: [...cursor], distance, yaw, pitch: PITCH };
    const angle = angleFromVertical(view, viewport, from, to);
    const away = Math.abs(angle - wanted);
    if (away < smallest) {
      smallest = away;
      best = { yaw, angle };
    }
  }
  return best;
}

/**
 * Finds a chain that crosses the whole frame within 5 degrees of vertical.
 *
 * The search takes the longest run of a chain that stays within 5 light years of the
 * chord it spans, centres the view on the middle of that run, and turns the camera
 * until the run stands upright on the screen. A run is one segment or a few segments
 * that carry on straight. The zoom is close enough that the run leaves the frame at the
 * top and at the bottom. The longest run comes first, so the crossing has the most of
 * the frame to itself.
 */
export function findVerticalCrossing(
  lines: RegionLines,
  viewport: Viewport,
): CrossingChoice {
  interface Run {
    chain: number;
    from: number;
    to: number;
    length: number;
  }
  const runs: Run[] = [];
  for (let chain = 0; chain < lines.chainCount; chain += 1) {
    const first = lines.first[chain] as number;
    const last = lines.last[chain] as number;
    let start = first;
    for (let end = first + 1; end <= last; end += 1) {
      if (chordDeparture(lines, start, end) > STRAIGHT_TOLERANCE_LY) {
        start = end - 1;
        continue;
      }
      runs.push({
        chain,
        from: start,
        to: end,
        length: gap(planeAt(lines, start), planeAt(lines, end)),
      });
    }
  }
  runs.sort((a, b) => b.length - a.length);

  for (const run of runs) {
    // The frame must sit inside the run, so the chain leaves it at both ends. The
    // frame covers 2 * distance * tan(30 degrees) light years at the cursor.
    const distance = Math.round((run.length * 0.7) / (2 * Math.tan(Math.PI / 6)));
    if (distance < 600 || distance > 20000) continue;

    // The cursor sits at the middle of the run, which is a point of the drawn line and
    // not a corner of it, so the centre of the frame lands on the line.
    const ends: [Plane, Plane] = [planeAt(lines, run.from), planeAt(lines, run.to)];
    const cursorPlane = along(ends[0], ends[1], 0.5);
    const cursor = game(cursorPlane);

    // The test reads a row of pixels 40 CSS pixels wide, so nothing else of the
    // boundary may come near the middle of the frame.
    const clearance = clearanceFrom(
      lines,
      cursorPlane,
      (segment) => segment >= run.from && segment < run.to,
    );
    const perPixel = lightYearsPerPixel(distance, viewport);
    if (clearance < 60 * perPixel) continue;

    // The disc under the line must be brighter than the outline colour, or the
    // outline cannot read as darker than the frame without the overlay, and dimmer
    // than the ceiling, or the core cannot read as lighter.
    const radius = Math.hypot(
      cursorPlane[0] - GALACTIC_CENTRE[0],
      cursorPlane[1] - GALACTIC_CENTRE[2],
    );
    if (radius > 16000) continue;
    if (frameDensity(cursorPlane, distance, viewport) > DISC_DENSITY_CEILING) continue;

    const upright = yawForAngle(
      cursor,
      distance,
      viewport,
      game(ends[0]),
      game(ends[1]),
      0,
    );
    if (upright.angle > 5) continue;

    const view: ChosenView = {
      cursor,
      distance,
      yaw: upright.yaw,
      pitch: PITCH,
    };
    const low = project(view as View, game(ends[0]), viewport);
    const high = project(view as View, game(ends[1]), viewport);
    const top = Math.min(low.y, high.y);
    const bottom = Math.max(low.y, high.y);
    if (!low.inFront || !high.inFront || top > 0 || bottom < viewport.height) continue;

    return {
      view,
      viewport: { width: viewport.width, height: viewport.height },
      chain: run.chain,
      from: run.from,
      to: run.to,
      point: cursor,
      angleFromVertical: upright.angle,
      clearanceLy: clearance,
      lightYearsPerPixel: perPixel,
    };
  }
  throw new Error('no chain crosses the frame within 5 degrees of vertical');
}

/** How far the join reading reaches from the bend, in CSS pixels. */
const JOIN_REACH_PIXELS = 8;

/** How far the two segments must meet at, in degrees. 0 is straight. */
const BEND_TURN_DEGREES = 60;

/**
 * How far the bend line runs each side of the bend, in CSS pixels. The browser test
 * measures the distance from a pixel to the drawn line inside the join reading, which
 * reaches 8 CSS pixels, so three times that reach covers the whole reading.
 */
const BEND_LINE_REACH_PIXELS = 24;

/**
 * How far the straight run sits from the bend, in CSS pixels. The near end is outside
 * the join reading with room to spare, and the far end is inside the frame.
 */
const RUN_NEAR_PIXELS = 48;
const RUN_FAR_PIXELS = 240;

/** How far every read point must stay from the edge of the frame, in CSS pixels. */
const FRAME_MARGIN_PIXELS = 24;

/**
 * Finds a vertex where the two segments of a chain meet at at least 60 degrees.
 *
 * The simplified line is straight between its vertices, so a bend is one vertex and the
 * turn is the angle between the segment that arrives and the segment that leaves. This
 * is not how the smoothed polyline was measured: that line held every vertex to 20
 * degrees, so a bend was a run of vertices and the turn had to be read over a reach.
 *
 * The view takes the closest zoom, 500 light years, where one CSS pixel covers 0.8
 * light years. The comparison needs a straight run of the same chain in the same frame,
 * and one of the two segments carries it, because both are longer than the frame.
 *
 * The sharpest corner comes first, because it is the hardest join to draw. The search
 * then asks for a corner that is alone in its frame and on a part of the disc that is
 * neither dark nor saturated, so the reading has nothing else in it.
 */
export function findSharpCorner(lines: RegionLines, viewport: Viewport): CornerChoice {
  const distance = CLOSEST_DISTANCE;
  const perPixel = lightYearsPerPixel(distance, viewport);
  const runNear = RUN_NEAR_PIXELS * perPixel;
  const runFar = RUN_FAR_PIXELS * perPixel;

  interface Bend {
    chain: number;
    vertex: number;
    turn: number;
    back: number;
    forward: number;
  }

  // Every vertex where the two segments meet at the wanted angle, sharpest first.
  const bends: Bend[] = [];
  for (let chain = 0; chain < lines.chainCount; chain += 1) {
    const first = lines.first[chain] as number;
    const last = lines.last[chain] as number;
    for (let vertex = first + 1; vertex < last; vertex += 1) {
      const from = planeAt(lines, vertex - 1);
      const here = planeAt(lines, vertex);
      const to = planeAt(lines, vertex + 1);
      const inX = here[0] - from[0];
      const inZ = here[1] - from[1];
      const outX = to[0] - here[0];
      const outZ = to[1] - here[1];
      const spanIn = Math.hypot(inX, inZ);
      const spanOut = Math.hypot(outX, outZ);
      if (spanIn === 0 || spanOut === 0) continue;
      const cosine = (inX * outX + inZ * outZ) / (spanIn * spanOut);
      const turn = (Math.acos(Math.min(1, Math.max(-1, cosine))) * 180) / Math.PI;
      if (turn < BEND_TURN_DEGREES) continue;
      // Both segments must hold the whole reading, so neither ends inside the frame.
      if (spanIn < runFar || spanOut < runFar) continue;
      bends.push({ chain, vertex, turn, back: spanIn, forward: spanOut });
    }
  }
  bends.sort((a, b) => (b.turn === a.turn ? a.vertex - b.vertex : b.turn - a.turn));

  for (const found of bends) {
    const bend = planeAt(lines, found.vertex);

    // No other part of the boundary may be drawn anywhere in the frame. The two
    // segments that meet at the bend are the line under test, so the guard leaves them
    // out. Everything else of the same chain counts, which is what stops the chain
    // folding back over its own bend.
    const clearance = clearanceFrom(
      lines,
      bend,
      (segment) => segment === found.vertex - 1 || segment === found.vertex,
    );
    if (clearance < frameReach(distance, viewport)) continue;
    if (frameDensity(bend, distance, viewport) > DISC_DENSITY_CEILING) continue;

    const view: ChosenView = { cursor: game(bend), distance, yaw: 0, pitch: PITCH };
    const holds = (point: Plane): boolean => {
      const screen = project(view as View, game(point), viewport);
      return (
        screen.inFront &&
        screen.x > FRAME_MARGIN_PIXELS &&
        screen.x < viewport.width - FRAME_MARGIN_PIXELS &&
        screen.y > FRAME_MARGIN_PIXELS &&
        screen.y < viewport.height - FRAME_MARGIN_PIXELS
      );
    };

    // The straight run the reading compares with: a part of one of the two segments,
    // outside the join reading and inside the frame. The longer segment comes first.
    const sides: Plane[] =
      found.forward >= found.back
        ? [planeAt(lines, found.vertex + 1), planeAt(lines, found.vertex - 1)]
        : [planeAt(lines, found.vertex - 1), planeAt(lines, found.vertex + 1)];
    let run: { from: Plane; to: Plane } | null = null;
    for (const side of sides) {
      const near = towards(bend, side, runNear);
      const far = towards(bend, side, runFar);
      if (!holds(near) || !holds(far)) continue;
      run = { from: near, to: far };
      break;
    }
    if (run === null) continue;

    // The drawn line inside the join reading: the two segments, cut to a reach that
    // keeps both ends on the screen.
    const reach = BEND_LINE_REACH_PIXELS * perPixel;
    const bendLine: [number, number, number][] = [
      game(towards(bend, planeAt(lines, found.vertex - 1), reach)),
      game(bend),
      game(towards(bend, planeAt(lines, found.vertex + 1), reach)),
    ];

    return {
      view,
      viewport: { width: viewport.width, height: viewport.height },
      chain: found.chain,
      vertex: found.vertex,
      turnDegrees: found.turn,
      reachPixels: JOIN_REACH_PIXELS,
      bend: game(bend),
      bendLine,
      straightFrom: game(run.from),
      straightTo: game(run.to),
      clearanceLy: clearance,
      lightYearsPerPixel: perPixel,
    };
  }
  throw new Error('no vertex meets at 60 degrees with a clear frame around it');
}

/** How long a segment must be to carry the width reading, in light years. */
const LONG_SEGMENT_LY = 10000;

/**
 * How far the ends of that segment must sit from the cursor, in light years. The frame
 * at 500 light years is 1,026 light years wide, so a margin of 4,000 light years is
 * nearly four frame widths and puts both ends far outside the frame.
 */
const SEGMENT_END_MARGIN_LY = 4000;

/**
 * Finds a segment longer than 10,000 light years that crosses the whole frame at the
 * closest zoom, with both of its ends far outside the frame.
 *
 * The reading takes the width of the drawn line at the left, the middle and the right
 * of the frame, so the search lays the segment flat on the screen: the yaw is the one
 * that brings it nearest to 90 degrees from the vertical. The cursor sits at the point
 * of the segment with the most room around it, so nothing else of the boundary is drawn
 * in the frame. The longest segment comes first.
 */
export function findLongSegment(
  lines: RegionLines,
  viewport: Viewport,
): LongSegmentChoice {
  const distance = CLOSEST_DISTANCE;
  const perPixel = lightYearsPerPixel(distance, viewport);

  interface Long {
    chain: number;
    segment: number;
    length: number;
  }
  const longs: Long[] = [];
  for (let chain = 0; chain < lines.chainCount; chain += 1) {
    const first = lines.first[chain] as number;
    const last = lines.last[chain] as number;
    for (let segment = first; segment < last; segment += 1) {
      const length = gap(planeAt(lines, segment), planeAt(lines, segment + 1));
      if (length > LONG_SEGMENT_LY) longs.push({ chain, segment, length });
    }
  }
  longs.sort((a, b) => b.length - a.length);

  for (const found of longs) {
    const ends: [Plane, Plane] = [
      planeAt(lines, found.segment),
      planeAt(lines, found.segment + 1),
    ];

    // The cursor runs along the segment, away from both ends, and takes the point with
    // the most of the boundary set away from it.
    let best: { cursor: Plane; clearance: number } | null = null;
    const steps = Math.floor(found.length / 100);
    for (let step = 0; step <= steps; step += 1) {
      const reach =
        SEGMENT_END_MARGIN_LY +
        (step / steps) * (found.length - 2 * SEGMENT_END_MARGIN_LY);
      if (reach > found.length - SEGMENT_END_MARGIN_LY) break;
      const cursorPlane = towards(ends[0], ends[1], reach);
      if (frameDensity(cursorPlane, distance, viewport) > DISC_DENSITY_CEILING)
        continue;
      const clearance = clearanceFrom(
        lines,
        cursorPlane,
        (segment) => segment === found.segment,
      );
      if (best === null || clearance > best.clearance) {
        best = { cursor: cursorPlane, clearance };
      }
    }
    // Nothing else of the boundary may be drawn anywhere in the frame.
    if (best === null || best.clearance < frameReach(distance, viewport)) continue;

    const cursor = game(best.cursor);
    const flat = yawForAngle(
      cursor,
      distance,
      viewport,
      game(ends[0]),
      game(ends[1]),
      90,
    );
    if (flat.angle < 85) continue;

    const view: ChosenView = { cursor, distance, yaw: flat.yaw, pitch: PITCH };
    const left = project(view as View, game(ends[0]), viewport);
    const right = project(view as View, game(ends[1]), viewport);
    // The segment leaves the frame at the left and at the right, so the reading meets
    // it at every column it takes.
    if (!left.inFront || !right.inFront) continue;
    const first = Math.min(left.x, right.x);
    const last = Math.max(left.x, right.x);
    if (first > 0 || last < viewport.width) continue;

    return {
      view,
      viewport: { width: viewport.width, height: viewport.height },
      chain: found.chain,
      from: found.segment,
      to: found.segment + 1,
      point: cursor,
      ends: [game(ends[0]), game(ends[1])],
      segmentLy: found.length,
      angleFromVertical: flat.angle,
      clearanceLy: best.clearance,
      lightYearsPerPixel: perPixel,
    };
  }
  throw new Error('no segment over 10,000 light years crosses the frame');
}
