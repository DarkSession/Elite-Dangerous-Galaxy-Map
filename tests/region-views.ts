// Chooses the five views the browser tests of the boundary line need.
//
// Five scenarios of `openspec/specs/galactic-regions` name a view that a unit test has
// to choose: one where a chain crosses the frame within 5 degrees of vertical, one at a
// break where two primitives meet at at least 60 degrees, one where a straight
// primitive longer than 10,000 light years crosses the whole frame with both ends
// outside it, one at the joint of a biarc, and one on a run that curves through more
// than 60 degrees. All five come from the boundary set itself, so nobody has to pick a
// place on the map by hand.
//
// The boundary set is 593 primitives over 716 vertices, and a primitive is an **arc**:
// two ends and a signed curvature, where a curvature of zero is a straight line. Every
// search therefore measures to the **drawn arc** and not to a chord and not to a
// vertex. A chord measure calls a point on the middle of a curve clear by up to the
// sagitta, which reaches 60.6 light years over this set, and a vertex measure calls a
// point in the middle of a 14,970 light year primitive clear.
//
// The search lives here and `region-views.test.ts` checks that the constants in
// `e2e/region-views.ts` are what it gives. The browser test reads those constants,
// because Playwright cannot import the camera module: it reaches the PNG of the
// detail grid, which only Vite can load.
import { galaxyModel } from '../src/galaxy-model/model';
import { project } from '../src/camera/projection';
import type { Viewport } from '../src/camera/projection';
import type { View } from '../src/camera/view';
import { arcPointAt, arcTangents, arcThrough } from '../src/scene-data/arc';
import type { Arc } from '../src/scene-data/arc';
import type { RegionLines } from '../src/scene-data/types';
import type {
  CornerChoice,
  CrossingChoice,
  CurvedRunChoice,
  ChosenView,
  JointChoice,
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

/** How many points a search reads along one primitive when it walks the drawn line. */
const ARC_SAMPLES = 24;

/**
 * The drawn turn above which a vertex is a **break**, in degrees.
 *
 * The fit is tangent-continuous inside a run, so a vertex inside one turns by at most
 * 0.0003 degrees over the built set, while the gentlest break turns by 18.7. The
 * threshold sits between the two with room on both sides.
 */
const BREAK_TURN_DEGREES = 0.5;

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
 * The arc of one primitive, as the vertex it starts at. A primitive is a primitive
 * only inside one chain, so the caller walks the chains.
 */
function primitiveArc(lines: RegionLines, primitive: number): Arc {
  const start = planeAt(lines, primitive);
  const end = planeAt(lines, primitive + 1);
  return arcThrough(
    start[0],
    start[1],
    end[0],
    end[1],
    lines.curvature[primitive] as number,
  );
}

/**
 * Calls `visit` for every primitive of the set, as the vertex it starts at. A pair of
 * vertices is a primitive only inside one chain, so the walk runs chain by chain.
 */
function forEachPrimitive(
  lines: RegionLines,
  visit: (primitive: number) => void,
): void {
  for (let chain = 0; chain < lines.chainCount; chain += 1) {
    const first = lines.first[chain] as number;
    const last = lines.last[chain] as number;
    for (let primitive = first; primitive < last; primitive += 1) visit(primitive);
  }
}

/** The distance from a plane point to a straight piece between two ends. */
function chordGap(point: Plane, a: Plane, b: Plane): number {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const square = dx * dx + dz * dz;
  let t = square === 0 ? 0 : ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / square;
  if (t < 0) t = 0;
  if (t > 1) t = 1;
  return Math.hypot(point[0] - (a[0] + t * dx), point[1] - (a[1] + t * dz));
}

/** The centre of the circle an arc lies on. A straight arc has none. */
function arcCentre(arc: Arc): Plane {
  const tangents = arcTangents(arc);
  // The centre sits a radius to the left of the start tangent, and the sign of the
  // curvature carries which side left is.
  return [
    arc.startX - tangents.startZ / arc.curvature,
    arc.startZ + tangents.startX / arc.curvature,
  ];
}

/** Wraps an angle into `-pi` to `pi`. */
function wrapAngle(angle: number): number {
  let wrapped = angle;
  while (wrapped > Math.PI) wrapped -= 2 * Math.PI;
  while (wrapped < -Math.PI) wrapped += 2 * Math.PI;
  return wrapped;
}

/**
 * The distance from a plane point to one drawn primitive, in light years.
 *
 * A straight primitive takes the distance to its chord. An arc takes the exact reading
 * off its circle: where the point lies inside the swept angle the distance is the
 * difference of the radii, and where it does not the nearer end answers. A sampled
 * reading would need dozens of points per primitive to hold the same accuracy, and the
 * searches call this many thousands of times.
 */
function primitiveGap(lines: RegionLines, point: Plane, primitive: number): number {
  const arc = primitiveArc(lines, primitive);
  const start: Plane = [arc.startX, arc.startZ];
  const end: Plane = [arc.endX, arc.endZ];
  if (arc.sweep === 0) return chordGap(point, start, end);
  const centre = arcCentre(arc);
  const away = Math.hypot(point[0] - centre[0], point[1] - centre[1]);
  const atStart = Math.atan2(start[1] - centre[1], start[0] - centre[0]);
  const atPoint = Math.atan2(point[1] - centre[1], point[0] - centre[0]);
  const turned = wrapAngle(atPoint - atStart);
  const inside =
    arc.sweep > 0
      ? turned >= 0 && turned <= arc.sweep
      : turned <= 0 && turned >= arc.sweep;
  if (inside) return Math.abs(away - arc.radius);
  return Math.min(gap(point, start), gap(point, end));
}

/** The point at a fraction of the sweep of one primitive. */
function drawnPoint(lines: RegionLines, primitive: number, fraction: number): Plane {
  const at = arcPointAt(primitiveArc(lines, primitive), fraction);
  return [at[0], at[1]];
}

/** The direction the drawn line runs in at each end of one primitive. */
function primitiveTangents(
  lines: RegionLines,
  primitive: number,
): { inX: number; inZ: number; outX: number; outZ: number } {
  const tangents = arcTangents(primitiveArc(lines, primitive));
  return {
    inX: tangents.startX,
    inZ: tangents.startZ,
    outX: tangents.endX,
    outZ: tangents.endZ,
  };
}

/**
 * The turn of the drawn line at a vertex, in degrees, between the tangent of the
 * primitive that arrives and the tangent of the primitive that leaves.
 */
function drawnTurnAt(lines: RegionLines, vertex: number): number {
  const arriving = primitiveTangents(lines, vertex - 1);
  const leaving = primitiveTangents(lines, vertex);
  const cosine = arriving.outX * leaving.inX + arriving.outZ * leaving.inZ;
  return (Math.acos(Math.min(1, Math.max(-1, cosine))) * 180) / Math.PI;
}

/** The length of the drawn line from one vertex of a chain to a later one. */
function drawnLength(lines: RegionLines, from: number, to: number): number {
  let total = 0;
  for (let primitive = from; primitive < to; primitive += 1) {
    total += primitiveArc(lines, primitive).length;
  }
  return total;
}

/** The point a length along the drawn line from one vertex of a chain. */
function drawnPointAlong(
  lines: RegionLines,
  from: number,
  to: number,
  reach: number,
): Plane {
  let left = reach;
  for (let primitive = from; primitive < to; primitive += 1) {
    const arc = primitiveArc(lines, primitive);
    if (left <= arc.length || primitive === to - 1) {
      return drawnPoint(lines, primitive, Math.min(1, left / arc.length));
    }
    left -= arc.length;
  }
  return planeAt(lines, from);
}

/**
 * The largest distance from the drawn line between two vertices of a chain to the
 * chord they span. It samples every arc along its sweep, so a curve that bows away
 * from its chord is read where it bows and not only at its ends.
 */
function drawnDeparture(lines: RegionLines, from: number, to: number): number {
  const a = planeAt(lines, from);
  const b = planeAt(lines, to);
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const span = Math.hypot(dx, dz);
  if (span === 0) return Number.POSITIVE_INFINITY;
  let worst = 0;
  for (let primitive = from; primitive < to; primitive += 1) {
    for (let step = 0; step <= ARC_SAMPLES; step += 1) {
      const point = drawnPoint(lines, primitive, step / ARC_SAMPLES);
      const away = Math.abs((point[0] - a[0]) * dz - (point[1] - a[1]) * dx) / span;
      if (away > worst) worst = away;
    }
  }
  return worst;
}

/**
 * The distance from a plane point to the nearest **primitive** the caller does not
 * exclude, as the drawn line and not as a set of vertices or chords.
 *
 * Every browser reading compares the line under test with the frame around it, so each
 * search uses this as a guard that no other part of the boundary is drawn near the
 * middle of the frame.
 */
function clearanceFrom(
  lines: RegionLines,
  point: Plane,
  keepOut: (primitive: number) => boolean,
): number {
  let nearest = Number.POSITIVE_INFINITY;
  forEachPrimitive(lines, (primitive) => {
    if (keepOut(primitive)) return;
    const away = primitiveGap(lines, point, primitive);
    if (away < nearest) nearest = away;
  });
  return nearest;
}

/** A stretch of one chain between two breaks, as its first and last vertex. */
export interface Run {
  readonly chain: number;
  readonly from: number;
  readonly to: number;
}

/**
 * The runs of every chain. A break is a chain end or a vertex where the drawn line
 * turns, and the line is tangent-continuous everywhere else, so the drawn turn tells
 * the two apart on its own.
 */
export function runsOf(lines: RegionLines): Run[] {
  const runs: Run[] = [];
  for (let chain = 0; chain < lines.chainCount; chain += 1) {
    const first = lines.first[chain] as number;
    const last = lines.last[chain] as number;
    let start = first;
    for (let vertex = first + 1; vertex <= last; vertex += 1) {
      if (vertex < last && drawnTurnAt(lines, vertex) <= BREAK_TURN_DEGREES) continue;
      runs.push({ chain, from: start, to: vertex });
      start = vertex;
    }
  }
  return runs;
}

/**
 * The biarc joints of a run, as vertex indices.
 *
 * A run of one span is one straight primitive and holds no joint. A run of `n` spans
 * holds `2n` primitives and `2n + 1` vertices, and the fit lays them out as a kept
 * vertex, a joint, a kept vertex, and so on, so the joints sit at the odd offsets. The
 * test `reads the joints the fit recorded` in `region-views.test.ts` checks that
 * against the fit's own record of which vertices it kept.
 */
export function jointsOfRun(run: Run): number[] {
  const vertices = run.to - run.from + 1;
  if (vertices < 3) return [];
  const joints: number[] = [];
  for (let offset = 1; offset < vertices - 1; offset += 2) {
    joints.push(run.from + offset);
  }
  return joints;
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
 * The search takes the longest run of a chain whose **drawn line** stays within 5 light
 * years of the chord it spans, centres the view on the middle of that drawn line, and
 * turns the camera until the run stands upright on the screen. A run is one primitive
 * or a few primitives that carry on straight. The zoom is close enough that the run
 * leaves the frame at the top and at the bottom. The longest run comes first, so the
 * crossing has the most of the frame to itself.
 */
export function findVerticalCrossing(
  lines: RegionLines,
  viewport: Viewport,
): CrossingChoice {
  interface Straight {
    chain: number;
    from: number;
    to: number;
    length: number;
  }
  const runs: Straight[] = [];
  for (let chain = 0; chain < lines.chainCount; chain += 1) {
    const first = lines.first[chain] as number;
    const last = lines.last[chain] as number;
    let start = first;
    for (let end = first + 1; end <= last; end += 1) {
      if (drawnDeparture(lines, start, end) > STRAIGHT_TOLERANCE_LY) {
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

    // The cursor sits at the middle of the drawn line of the run, so the centre of the
    // frame lands on the line itself and not merely on the chord across it.
    const ends: [Plane, Plane] = [planeAt(lines, run.from), planeAt(lines, run.to)];
    const cursorPlane = drawnPointAlong(
      lines,
      run.from,
      run.to,
      drawnLength(lines, run.from, run.to) / 2,
    );
    const cursor = game(cursorPlane);

    // The test reads a row of pixels 40 CSS pixels wide, so nothing else of the
    // boundary may come near the middle of the frame.
    const clearance = clearanceFrom(
      lines,
      cursorPlane,
      (primitive) => primitive >= run.from && primitive < run.to,
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

/** How far the join reading reaches from the break or the joint, in CSS pixels. */
const JOIN_REACH_PIXELS = 8;

/** How far the two primitives must meet at, in degrees. 0 is straight. */
const BEND_TURN_DEGREES = 60;

/**
 * How far the bend line runs each side of the bend, in CSS pixels. The browser test
 * measures the distance from a pixel to the drawn line inside the join reading, which
 * reaches 8 CSS pixels, so three times that reach covers the whole reading.
 */
const BEND_LINE_REACH_PIXELS = 24;

/**
 * How far the straight run sits from the bend, in CSS pixels. The near end is outside
 * the join reading with room to spare, and the far end is inside the frame. The search
 * takes the first pair whose drawn line is straight enough to read, longest first.
 */
const RUN_REACHES_PIXELS: readonly (readonly [number, number])[] = [
  [48, 240],
  [48, 160],
  [48, 120],
  [32, 80],
];

/**
 * How far the drawn line of the comparison run may sit from the chord across it, in
 * CSS pixels. The browser test takes the pixels within 1.2 CSS pixels of that chord as
 * the run, so a bow of a third of a pixel leaves the reading on the drawn line.
 */
const RUN_BOW_PIXELS = 0.3;

/** How far every read point must stay from the edge of the frame, in CSS pixels. */
const FRAME_MARGIN_PIXELS = 24;

/**
 * A straight part of one primitive, past the join reading and inside the frame.
 *
 * The two ends are points of the drawn line, and the drawn line between them bows away
 * from the chord across them by less than `RUN_BOW_PIXELS`, so the browser reads the
 * drawn line and not a chord across a curve.
 */
function straightRunOf(
  lines: RegionLines,
  primitive: number,
  fromStart: boolean,
  perPixel: number,
  holds: (point: Plane) => boolean,
): { from: Plane; to: Plane } | null {
  const arc = primitiveArc(lines, primitive);
  for (const [near, far] of RUN_REACHES_PIXELS) {
    const nearLy = near * perPixel;
    const farLy = far * perPixel;
    if (farLy > arc.length) continue;
    const fraction = (reach: number): number =>
      fromStart ? reach / arc.length : 1 - reach / arc.length;
    const from = arcPointAt(arc, fraction(nearLy));
    const to = arcPointAt(arc, fraction(farLy));
    // The sagitta of the piece between the two reaches, which is how far the drawn
    // line bows away from the chord across them.
    const sweptFraction = (farLy - nearLy) / arc.length;
    const bow =
      arc.sweep === 0
        ? 0
        : arc.radius * (1 - Math.cos((Math.abs(arc.sweep) * sweptFraction) / 2));
    if (bow / perPixel > RUN_BOW_PIXELS) continue;
    const ends: [Plane, Plane] = [
      [from[0], from[1]],
      [to[0], to[1]],
    ];
    if (!holds(ends[0]) || !holds(ends[1])) continue;
    return { from: ends[0], to: ends[1] };
  }
  return null;
}

/** Whether a plane point projects well inside the frame. */
function insideFrame(view: ChosenView, viewport: Viewport, point: Plane): boolean {
  const screen = project(view as View, game(point), viewport);
  return (
    screen.inFront &&
    screen.x > FRAME_MARGIN_PIXELS &&
    screen.x < viewport.width - FRAME_MARGIN_PIXELS &&
    screen.y > FRAME_MARGIN_PIXELS &&
    screen.y < viewport.height - FRAME_MARGIN_PIXELS
  );
}

/**
 * Finds a break where the two primitives of a chain meet at at least 60 degrees.
 *
 * The drawn line turns at a break alone, and the turn is the angle between the tangent
 * of the primitive that arrives and the tangent of the primitive that leaves. Inside a
 * run the line is tangent-continuous, so a run holds no bend at all.
 *
 * The view takes the closest zoom, 500 light years, where one CSS pixel covers 0.8
 * light years. The comparison needs a straight run of the same chain in the same frame,
 * and one of the two primitives carries it.
 *
 * The sharpest corner comes first, because it is the hardest join to draw. The search
 * then asks for a corner that is alone in its frame and on a part of the disc that is
 * neither dark nor saturated, so the reading has nothing else in it.
 */
export function findSharpCorner(lines: RegionLines, viewport: Viewport): CornerChoice {
  const distance = CLOSEST_DISTANCE;
  const perPixel = lightYearsPerPixel(distance, viewport);
  const frameLy = frameReach(distance, viewport);

  interface Bend {
    chain: number;
    vertex: number;
    turn: number;
    back: number;
    forward: number;
  }

  // Every vertex where the two primitives meet at the wanted angle, sharpest first.
  const bends: Bend[] = [];
  for (let chain = 0; chain < lines.chainCount; chain += 1) {
    const first = lines.first[chain] as number;
    const last = lines.last[chain] as number;
    for (let vertex = first + 1; vertex < last; vertex += 1) {
      const turn = drawnTurnAt(lines, vertex);
      if (turn < BEND_TURN_DEGREES) continue;
      const back = primitiveArc(lines, vertex - 1).length;
      const forward = primitiveArc(lines, vertex).length;
      // Neither primitive may end inside the frame, so the reading holds the two that
      // meet at the bend and nothing else of the chain.
      if (back < frameLy || forward < frameLy) continue;
      bends.push({ chain, vertex, turn, back, forward });
    }
  }
  bends.sort((a, b) => (b.turn === a.turn ? a.vertex - b.vertex : b.turn - a.turn));

  for (const found of bends) {
    const bend = planeAt(lines, found.vertex);

    // No other part of the boundary may be drawn anywhere in the frame. The two
    // primitives that meet at the bend are the line under test, so the guard leaves
    // them out. Everything else of the same chain counts, which is what stops the
    // chain folding back over its own bend.
    const clearance = clearanceFrom(
      lines,
      bend,
      (primitive) => primitive === found.vertex - 1 || primitive === found.vertex,
    );
    if (clearance < frameLy) continue;
    if (frameDensity(bend, distance, viewport) > DISC_DENSITY_CEILING) continue;

    const view: ChosenView = { cursor: game(bend), distance, yaw: 0, pitch: PITCH };
    const holds = (point: Plane): boolean => insideFrame(view, viewport, point);

    // The straight run the reading compares with: a part of one of the two primitives,
    // outside the join reading and inside the frame. The longer one comes first.
    const sides: [number, boolean][] =
      found.forward >= found.back
        ? [
            [found.vertex, true],
            [found.vertex - 1, false],
          ]
        : [
            [found.vertex - 1, false],
            [found.vertex, true],
          ];
    let run: { from: Plane; to: Plane } | null = null;
    for (const [primitive, fromStart] of sides) {
      run = straightRunOf(lines, primitive, fromStart, perPixel, holds);
      if (run !== null) break;
    }
    if (run === null) continue;

    // The drawn line inside the join reading: the two primitives, cut to a reach that
    // keeps both ends on the screen. The reach is 24 CSS pixels, over which an arc of
    // this set bows away from its chord by under a tenth of a pixel.
    const reach = BEND_LINE_REACH_PIXELS * perPixel;
    const arriving = primitiveArc(lines, found.vertex - 1);
    const leaving = primitiveArc(lines, found.vertex);
    const back = arcPointAt(arriving, 1 - reach / arriving.length);
    const forward = arcPointAt(leaving, reach / leaving.length);
    const bendLine: [number, number, number][] = [
      game([back[0], back[1]]),
      game(bend),
      game([forward[0], forward[1]]),
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
  throw new Error('no break meets at 60 degrees with a clear frame around it');
}

/**
 * Finds the joint of a biarc, where two arcs meet tangentially.
 *
 * This is the join the set holds most of, one every few hundred light years along every
 * curve, and the straight fit never had it. The tightest pair comes first, because that
 * is where two quads that overlap at the joint would put the brightest bead.
 *
 * The reading is the same as the one at a break: the luminance the overlay changes
 * within 8 CSS pixels of the joint, against the largest change on a straight run of the
 * same chain in the same frame.
 */
export function findBiarcJoint(lines: RegionLines, viewport: Viewport): JointChoice {
  const distance = CLOSEST_DISTANCE;
  const perPixel = lightYearsPerPixel(distance, viewport);
  const frameLy = frameReach(distance, viewport);

  interface Joint {
    chain: number;
    vertex: number;
    turn: number;
    tightest: number;
  }
  const joints: Joint[] = [];
  for (const run of runsOf(lines)) {
    for (const vertex of jointsOfRun(run)) {
      const arriving = primitiveArc(lines, vertex - 1);
      const leaving = primitiveArc(lines, vertex);
      // Both primitives are arcs at a joint of a biarc, and neither may end inside the
      // frame, so the reading holds the two that meet at the joint and nothing else.
      if (arriving.curvature === 0 || leaving.curvature === 0) continue;
      if (arriving.length < frameLy || leaving.length < frameLy) continue;
      joints.push({
        chain: run.chain,
        vertex,
        turn: drawnTurnAt(lines, vertex),
        tightest: Math.max(Math.abs(arriving.curvature), Math.abs(leaving.curvature)),
      });
    }
  }
  joints.sort((a, b) =>
    b.tightest === a.tightest ? a.vertex - b.vertex : b.tightest - a.tightest,
  );

  for (const found of joints) {
    const joint = planeAt(lines, found.vertex);
    const clearance = clearanceFrom(
      lines,
      joint,
      (primitive) => primitive === found.vertex - 1 || primitive === found.vertex,
    );
    if (clearance < frameLy) continue;
    if (frameDensity(joint, distance, viewport) > DISC_DENSITY_CEILING) continue;

    const view: ChosenView = { cursor: game(joint), distance, yaw: 0, pitch: PITCH };
    const holds = (point: Plane): boolean => insideFrame(view, viewport, point);

    const arriving = primitiveArc(lines, found.vertex - 1);
    const leaving = primitiveArc(lines, found.vertex);
    const sides: [number, boolean][] =
      leaving.length >= arriving.length
        ? [
            [found.vertex, true],
            [found.vertex - 1, false],
          ]
        : [
            [found.vertex - 1, false],
            [found.vertex, true],
          ];
    let run: { from: Plane; to: Plane } | null = null;
    for (const [primitive, fromStart] of sides) {
      run = straightRunOf(lines, primitive, fromStart, perPixel, holds);
      if (run !== null) break;
    }
    if (run === null) continue;

    // The drawn line inside the joint reading: a point back along the arc that arrives,
    // the joint, and a point forward along the arc that leaves. The reach is 24 CSS
    // pixels, and an arc of 5,913 light years bows away from its chord over that reach
    // by 0.01 of a pixel, so three points hold the whole reading.
    const lineReach = BEND_LINE_REACH_PIXELS * perPixel;
    const back = arcPointAt(arriving, 1 - lineReach / arriving.length);
    const forward = arcPointAt(leaving, lineReach / leaving.length);
    const jointLine: [number, number, number][] = [
      game([back[0], back[1]]),
      game(joint),
      game([forward[0], forward[1]]),
    ];

    return {
      view,
      viewport: { width: viewport.width, height: viewport.height },
      chain: found.chain,
      vertex: found.vertex,
      turnDegrees: found.turn,
      reachPixels: JOIN_REACH_PIXELS,
      joint: game(joint),
      jointLine,
      straightFrom: game(run.from),
      straightTo: game(run.to),
      curvatures: [arriving.curvature, leaving.curvature],
      clearanceLy: clearance,
      lightYearsPerPixel: perPixel,
    };
  }
  throw new Error('no biarc joint has a clear frame around it');
}

/** The zoom the no-facet reading takes, in light years. */
const CURVED_RUN_DISTANCE = 8000;

/** How far the drawn direction is fitted over, in CSS pixels. */
const CURVE_WINDOW_PIXELS = 12;

/** How far the drawn direction may turn between two neighbouring windows, in degrees. */
const CURVE_TURN_DEGREES = 3;

/** How much of a run must turn for it to carry the no-facet reading, in degrees. */
const CURVED_RUN_DEGREES = 60;

/**
 * How far the nearest other part of the boundary must stay from the drawn line the
 * reading walks, in CSS pixels. The fit reads a window of 12 CSS pixels each side of a
 * sample, so 30 leaves the window to the run alone.
 */
const CURVE_CLEARANCE_PIXELS = 30;

/**
 * How far the walk stops short of each end of the run, in CSS pixels.
 *
 * A run ends at a break, where the drawn line turns, and the chain carries on past it,
 * so the primitive on the other side of the break touches the run's end. The trim is
 * twice the clearance the walk asks for, so that primitive sits outside the clearance
 * rather than exactly on it.
 */
const CURVE_TRIM_PIXELS = 2 * CURVE_CLEARANCE_PIXELS;

/**
 * How far the drawn line the frame holds must curve for the reading to be worth taking,
 * in degrees. A run may be far longer than the frame, and a reading over the straight
 * end of a curving run would pass while saying nothing.
 */
const CURVED_VIEW_DEGREES = 20;

/**
 * Finds a run that curves through more than 60 degrees, and the drawn line of it.
 *
 * The run with the **widest** tightest arc comes first. The reading fits the drawn
 * direction over a window of 12 CSS pixels and holds the change between two
 * neighbouring windows under 3 degrees, and a circle of radius `R` turns
 * `window / R` over one window, so the search takes only runs whose tightest arc holds
 * every window under that bound. A fit that drew each primitive as its chord fails it
 * whatever the radius: the drawn direction would then hold still inside a primitive and
 * jump the whole sweep at every joint, which is 10 degrees and more over this set.
 *
 * This reading takes no ceiling on the brightness of the disc, and the other four do.
 * It reads the pixels the overlay **changes** and not how bright they are, and the
 * overlay blends at 0.55 opacity, so it moves every channel wherever it draws however
 * bright the frame under it is. That matters here: six of the seven runs that curve
 * through 60 degrees bound the `Galactic Centre`, which is the region this change
 * exists to draw as a circle and the brightest part of the map.
 *
 * **The widest run is taken because the measure needs it, and that is measured rather
 * than assumed.** The next run, 345 to 353 of chain 60 at a radius of 4,015 light
 * years, reads 8.0 degrees where its geometry gives 2.2. That reading is the measure
 * and not the line: it does not move when the sub-chord sagitta is cut from 0.5 to
 * 0.125 of a pixel, and it falls by a factor of 1.6 when the baseline is doubled, which
 * is what a fixed error in where a centroid lands does and what a kink in the line does
 * not. It is worst where that run flattens out and runs along a row of pixels, where a
 * baseline of 12 pixels holds almost no rise. So a bound of 3 degrees on that run would
 * measure the reading rather than the drawn line.
 */
export function findCurvedRun(lines: RegionLines, viewport: Viewport): CurvedRunChoice {
  const distance = CURVED_RUN_DISTANCE;
  const perPixel = lightYearsPerPixel(distance, viewport);
  const windowLy = CURVE_WINDOW_PIXELS * perPixel;

  interface Curved {
    run: Run;
    turn: number;
    widest: number;
    length: number;
  }
  const curved: Curved[] = [];
  for (const run of runsOf(lines)) {
    let turn = 0;
    let length = 0;
    let widest = Number.POSITIVE_INFINITY;
    for (let primitive = run.from; primitive < run.to; primitive += 1) {
      const arc = primitiveArc(lines, primitive);
      turn += Math.abs(arc.sweep);
      length += arc.length;
      if (arc.curvature !== 0) widest = Math.min(widest, arc.radius);
    }
    const degrees = (turn * 180) / Math.PI;
    if (degrees <= CURVED_RUN_DEGREES) continue;
    curved.push({ run, turn: degrees, widest, length });
  }
  curved.sort((a, b) => b.widest - a.widest);

  for (const found of curved) {
    // A circle of radius R turns `window / R` over one window, so the tightest arc of
    // the run sets the worst reading the walk can take.
    const worstWindow = ((windowLy / found.widest) * 180) / Math.PI;
    if (worstWindow >= CURVE_TURN_DEGREES) continue;

    const cursorPlane = drawnPointAlong(
      lines,
      found.run.from,
      found.run.to,
      found.length / 2,
    );

    const view: ChosenView = {
      cursor: game(cursorPlane),
      distance,
      yaw: 0,
      pitch: PITCH,
    };

    // The drawn line of the run, one sample every window. The reading walks these, so
    // the samples must sit inside the frame with room for the window around them.
    //
    // The walk stops short of each end of the run. A run ends at a break, and the drawn
    // line turns there, so a window that reached past the end would fit its direction
    // over two runs at once. The trim is 770 light years of the 12,631 the run runs
    // for.
    const trim = CURVE_TRIM_PIXELS * perPixel;
    const samples: Plane[] = [];
    for (let reach = trim; reach <= found.length - trim; reach += windowLy) {
      samples.push(drawnPointAlong(lines, found.run.from, found.run.to, reach));
    }
    const margin = CURVE_WINDOW_PIXELS + FRAME_MARGIN_PIXELS;
    const onScreen = (point: Plane): boolean => {
      const screen = project(view as View, game(point), viewport);
      return (
        screen.inFront &&
        screen.x > margin &&
        screen.x < viewport.width - margin &&
        screen.y > margin &&
        screen.y < viewport.height - margin
      );
    };

    // The longest stretch of samples the frame holds, so the walk reads neighbouring
    // windows and never jumps a gap.
    let best: { from: number; to: number } | null = null;
    let start = -1;
    for (let index = 0; index <= samples.length; index += 1) {
      const holds = index < samples.length && onScreen(samples[index] as Plane);
      if (holds) {
        if (start < 0) start = index;
        continue;
      }
      if (start >= 0) {
        if (best === null || index - start > best.to - best.from) {
          best = { from: start, to: index };
        }
        start = -1;
      }
    }
    if (best === null || best.to - best.from < 8) continue;
    const line = samples.slice(best.from, best.to);

    // Nothing else of the boundary may come inside a window of the drawn line.
    let clearance = Number.POSITIVE_INFINITY;
    for (const point of line) {
      const away = clearanceFrom(
        lines,
        point,
        (primitive) => primitive >= found.run.from && primitive < found.run.to,
      );
      if (away < clearance) clearance = away;
    }
    if (clearance < CURVE_CLEARANCE_PIXELS * perPixel) continue;

    // The turn of the drawn line between two neighbouring windows, which is what the
    // browser reads back off the frame, and the turn over the whole of the drawn line
    // the frame holds.
    let worstTurn = 0;
    let visibleTurn = 0;
    for (let index = 1; index + 1 < line.length; index += 1) {
      const before = line[index - 1] as Plane;
      const here = line[index] as Plane;
      const after = line[index + 1] as Plane;
      const inX = here[0] - before[0];
      const inZ = here[1] - before[1];
      const outX = after[0] - here[0];
      const outZ = after[1] - here[1];
      const cosine =
        (inX * outX + inZ * outZ) / (Math.hypot(inX, inZ) * Math.hypot(outX, outZ));
      const turn = (Math.acos(Math.min(1, Math.max(-1, cosine))) * 180) / Math.PI;
      visibleTurn += turn;
      if (turn > worstTurn) worstTurn = turn;
    }
    if (worstTurn >= CURVE_TURN_DEGREES) continue;
    if (visibleTurn < CURVED_VIEW_DEGREES) continue;

    return {
      view,
      viewport: { width: viewport.width, height: viewport.height },
      chain: found.run.chain,
      from: found.run.from,
      to: found.run.to,
      turnDegrees: found.turn,
      visibleTurnDegrees: visibleTurn,
      widestRadiusLy: found.widest,
      windowPixels: CURVE_WINDOW_PIXELS,
      line: line.map((point) => game(point)),
      turnPerWindowDegrees: worstTurn,
      clearanceLy: clearance,
      lightYearsPerPixel: perPixel,
    };
  }
  throw new Error('no run curves through 60 degrees with a clear frame around it');
}

/** How long a primitive must be to carry the width reading, in light years. */
const LONG_SEGMENT_LY = 10000;

/**
 * How far the ends of that primitive must sit from the cursor, in light years. The
 * frame at 500 light years is 1,026 light years wide, so a margin of 4,000 light years
 * is nearly four frame widths and puts both ends far outside the frame.
 */
const SEGMENT_END_MARGIN_LY = 4000;

/**
 * Finds a straight primitive longer than 10,000 light years that crosses the whole
 * frame at the closest zoom, with both of its ends far outside the frame.
 *
 * The reading takes the width of the drawn line at the left, the middle and the right
 * of the frame, so the search lays the primitive flat on the screen: the yaw is the one
 * that brings it nearest to 90 degrees from the vertical. A curved primitive could not
 * lie flat across the whole frame, so the search takes the straight ones, which is what
 * the set holds at this length: the longest is 14,970 light years and every primitive
 * over 10,000 is straight. The cursor sits at the point of the primitive with the most
 * room around it, so nothing else of the boundary is drawn in the frame. The longest
 * comes first.
 */
export function findLongSegment(
  lines: RegionLines,
  viewport: Viewport,
): LongSegmentChoice {
  const distance = CLOSEST_DISTANCE;
  const perPixel = lightYearsPerPixel(distance, viewport);

  interface Long {
    chain: number;
    primitive: number;
    length: number;
  }
  const longs: Long[] = [];
  for (let chain = 0; chain < lines.chainCount; chain += 1) {
    const first = lines.first[chain] as number;
    const last = lines.last[chain] as number;
    for (let primitive = first; primitive < last; primitive += 1) {
      if (lines.curvature[primitive] !== 0) continue;
      const length = gap(planeAt(lines, primitive), planeAt(lines, primitive + 1));
      if (length > LONG_SEGMENT_LY) longs.push({ chain, primitive, length });
    }
  }
  longs.sort((a, b) => b.length - a.length);

  for (const found of longs) {
    const ends: [Plane, Plane] = [
      planeAt(lines, found.primitive),
      planeAt(lines, found.primitive + 1),
    ];

    // The cursor runs along the primitive, away from both ends, and takes the point
    // with the most of the boundary set away from it.
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
        (primitive) => primitive === found.primitive,
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
    // The primitive leaves the frame at the left and at the right, so the reading meets
    // it at every column it takes.
    if (!left.inFront || !right.inFront) continue;
    const first = Math.min(left.x, right.x);
    const last = Math.max(left.x, right.x);
    if (first > 0 || last < viewport.width) continue;

    return {
      view,
      viewport: { width: viewport.width, height: viewport.height },
      chain: found.chain,
      from: found.primitive,
      to: found.primitive + 1,
      point: cursor,
      ends: [game(ends[0]), game(ends[1])],
      segmentLy: found.length,
      angleFromVertical: flat.angle,
      clearanceLy: best.clearance,
      lightYearsPerPixel: perPixel,
    };
  }
  throw new Error('no straight primitive over 10,000 light years crosses the frame');
}
