// Chooses the views the browser tests of the boundary line need.
//
// Four scenarios of `openspec/specs/galactic-regions` name a view that a unit test has to
// choose: one where a chain crosses the reading row within 5 degrees of vertical, one
// where the drawn line turns by at least 30 degrees within a reach of 8 CSS pixels, one
// lattice node where the traced line turns by 90 degrees, and one plane point that sits
// on a chain of both sets. The second is measured over a reach and not between two
// neighbouring segments, because the spec holds every vertex of the drawn line to 20
// degrees. Every view comes from the boundary set itself, so nobody picks a place on the
// map by hand.
//
// The crossing search runs once for each set, and the constants file holds one view for
// each: a near-vertical straight run of the smoothed set is not one of the traced
// staircase.
//
// Each search takes its zoom as a parameter and states its premises in CSS pixels, so a
// premise holds at the viewport and the zoom its own scenario names. The overlay draws in
// a band of zoom distance from 5,000 to 30,000 light years, so every view sits at 10,000
// light years or more.
//
// The search lives here and `region-views.test.ts` checks that the constants in
// `e2e/region-views.ts` are what it gives. The browser test reads those constants,
// because Playwright cannot import the camera module: it reaches the PNG of the
// detail grid, which only Vite can load.
import { project } from '../src/camera/projection';
import type { Viewport } from '../src/camera/projection';
import type { View } from '../src/camera/view';
import type { RegionLines } from '../src/scene-data/types';
import type {
  BothSetsChoice,
  CornerChoice,
  CrossingChoice,
  ChosenView,
} from '../e2e/region-views';

/** The galactic centre in game coordinates, as the browser helpers hold it. */
const GALACTIC_CENTRE: readonly [number, number, number] = [15, -35, 25895];

/** The elevation both views take. It looks nearly straight down on the plane. */
const PITCH = 89;

/** How far the drawn line may sit from a straight chord and still count as straight. */
const STRAIGHT_TOLERANCE_LY = 5;

/**
 * How far a reading must sit from the galactic centre, in light years. Over the core the
 * band's own luminance of 0.755 sits under the picture, and the band would darken the
 * frame in place of lightening it.
 */
const CENTRE_FLOOR_LY = 5000;

/** How many light years one CSS pixel covers at the cursor. */
function lightYearsPerPixel(distance: number, viewport: Viewport): number {
  return (2 * distance * Math.tan(Math.PI / 6)) / viewport.height;
}

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

/** The side of one cell of the vertex hash, in light years. */
const VERTEX_CELL_LY = 500;

/** The key of one cell of the vertex hash. */
function cellKey(cellX: number, cellZ: number): number {
  return cellX * 100000 + cellZ;
}

/** A cell hash of the vertices of a boundary set, and the extent it covers. */
interface VertexIndex {
  readonly buckets: Map<number, number[]>;
  readonly rings: number;
}

/** One hash per boundary set. Each search reads the same set many times over. */
const vertexIndexes = new WeakMap<RegionLines, VertexIndex>();

function indexVertices(lines: RegionLines): VertexIndex {
  const held = vertexIndexes.get(lines);
  if (held !== undefined) return held;
  const buckets = new Map<number, number[]>();
  let lowX = Number.POSITIVE_INFINITY;
  let highX = Number.NEGATIVE_INFINITY;
  let lowZ = Number.POSITIVE_INFINITY;
  let highZ = Number.NEGATIVE_INFINITY;
  for (let vertex = 0; vertex < lines.vertexCount; vertex += 1) {
    const point = planeAt(lines, vertex);
    const cellX = Math.floor(point[0] / VERTEX_CELL_LY);
    const cellZ = Math.floor(point[1] / VERTEX_CELL_LY);
    if (cellX < lowX) lowX = cellX;
    if (cellX > highX) highX = cellX;
    if (cellZ < lowZ) lowZ = cellZ;
    if (cellZ > highZ) highZ = cellZ;
    const key = cellKey(cellX, cellZ);
    const bucket = buckets.get(key);
    if (bucket === undefined) buckets.set(key, [vertex]);
    else bucket.push(vertex);
  }
  // The widest ring a search can need is the whole extent of the set.
  const rings = Math.max(highX - lowX, highZ - lowZ) + 1;
  const index: VertexIndex = { buckets, rings };
  vertexIndexes.set(lines, index);
  return index;
}

/**
 * The distance from a plane point to the nearest vertex the caller does not exclude.
 * The browser tests read a few tens of pixels around their point, so they need to
 * know that no other part of the boundary is inside that window.
 *
 * The reading walks the cells of a hash outward from the point and stops as soon as the
 * nearest vertex it holds is nearer than the ring it is about to read. The answer is the
 * one a walk over every vertex gives, and the searches read it once per candidate.
 */
function clearanceFrom(
  lines: RegionLines,
  point: Plane,
  keepOut: (vertex: number) => boolean,
): number {
  const index = indexVertices(lines);
  const cellX = Math.floor(point[0] / VERTEX_CELL_LY);
  const cellZ = Math.floor(point[1] / VERTEX_CELL_LY);
  let nearest = Number.POSITIVE_INFINITY;
  for (let ring = 0; ring <= index.rings; ring += 1) {
    for (let stepZ = -ring; stepZ <= ring; stepZ += 1) {
      for (let stepX = -ring; stepX <= ring; stepX += 1) {
        if (Math.max(Math.abs(stepX), Math.abs(stepZ)) !== ring) continue;
        const bucket = index.buckets.get(cellKey(cellX + stepX, cellZ + stepZ));
        if (bucket === undefined) continue;
        for (const vertex of bucket) {
          if (keepOut(vertex)) continue;
          const away = gap(point, planeAt(lines, vertex));
          if (away < nearest) nearest = away;
        }
      }
    }
    // A vertex outside this ring cannot be nearer than the ring's own reach.
    if (nearest <= ring * VERTEX_CELL_LY) break;
  }
  return nearest;
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

/** The yaw that puts a plane direction nearest to vertical on the screen. */
function yawForVertical(
  cursor: [number, number, number],
  distance: number,
  viewport: Viewport,
  from: [number, number, number],
  to: [number, number, number],
): { yaw: number; angle: number } {
  let best = { yaw: 0, angle: 90 };
  for (let step = 0; step < 7200; step += 1) {
    const yaw = step / 20;
    const view: View = { cursor: [...cursor], distance, yaw, pitch: PITCH };
    const angle = angleFromVertical(view, viewport, from, to);
    if (angle < best.angle) best = { yaw, angle };
  }
  return best;
}

/** How far the run must reach above and below the reading row, in CSS pixels. */
const CROSSING_ROW_PIXELS = 100;

/** How far the nearest other part of the boundary must stay, in CSS pixels. */
const CROSSING_CLEARANCE_PIXELS = 60;

/**
 * Finds a chain that crosses the reading row within 5 degrees of vertical.
 *
 * The search takes the longest run of a chain that stays within 5 light years of the
 * chord it spans, centres the view on the middle of that run, and turns the camera until
 * the run stands upright on the screen. The run must reach 100 CSS pixels above and below
 * the reading row, which is the middle of the frame, so the row cuts the drawn line
 * square and the reading holds over a wide band.
 *
 * The zoom is a parameter. The overlay draws no lower than 5,000 light years, and the
 * frame is then 11,547 light years tall at 10,000, which is longer than the longest
 * straight run of either set, so a run can no longer cross the whole frame.
 */
export function findVerticalCrossing(
  lines: RegionLines,
  viewport: Viewport,
  distance: number,
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

  const perPixel = lightYearsPerPixel(distance, viewport);
  // The search reports how many runs hold every premise, so the spec states a count that
  // this run measured. The runs are in order of length, so the first holder is the best.
  let held = 0;
  let first: CrossingChoice | null = null;
  for (const run of runs) {
    // The cursor sits at the middle of the segment nearest the middle of the run, so
    // the centre of the frame lands on the drawn line and not at a corner of it.
    const middle = (run.from + run.to) / 2;
    const segment = Math.min(run.to - 1, Math.max(run.from, Math.round(middle) - 1));
    const a = planeAt(lines, segment);
    const b = planeAt(lines, segment + 1);
    const cursorPlane: Plane = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const cursor = game(cursorPlane);

    // The test reads a row of pixels a few tens of pixels wide, so nothing else of the
    // boundary may come near the middle of the frame.
    const clearance = clearanceFrom(
      lines,
      cursorPlane,
      (vertex) => vertex >= run.from && vertex <= run.to,
    );
    if (clearance < CROSSING_CLEARANCE_PIXELS * perPixel) continue;

    // The band lightens what it crosses, which it cannot do over the core itself.
    const radius = Math.hypot(
      cursorPlane[0] - GALACTIC_CENTRE[0],
      cursorPlane[1] - GALACTIC_CENTRE[2],
    );
    if (radius < CENTRE_FLOOR_LY) continue;

    const ends: [Plane, Plane] = [planeAt(lines, run.from), planeAt(lines, run.to)];
    const upright = yawForVertical(
      cursor,
      distance,
      viewport,
      game(ends[0]),
      game(ends[1]),
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
    const row = viewport.height / 2;
    if (!low.inFront || !high.inFront) continue;
    if (top > row - CROSSING_ROW_PIXELS || bottom < row + CROSSING_ROW_PIXELS) continue;

    held += 1;
    if (first !== null) continue;
    first = {
      view,
      viewport: { width: viewport.width, height: viewport.height },
      chain: run.chain,
      from: run.from,
      to: run.to,
      point: cursor,
      angleFromVertical: upright.angle,
      clearanceLy: clearance,
      lightYearsPerPixel: perPixel,
      heldCount: 0,
    };
  }
  if (first === null) {
    throw new Error('no chain crosses the reading row within 5 degrees of vertical');
  }
  return { ...first, heldCount: held };
}

/** How far the join reading reaches from the bend, in CSS pixels. */
const JOIN_REACH_PIXELS = 8;

/** How far the line must turn over that reach to count as a bend, in degrees. */
const BEND_TURN_DEGREES = 30;

/**
 * How much of a chain, as arc length in CSS pixels, counts as the neighbourhood of a
 * bend. A vertex inside it is the line itself and not a fold of it.
 */
const NEIGHBOUR_ARC_PIXELS = 16;

/** How near the chain may come back to the bend from outside that arc, in CSS pixels. */
const FOLD_REACH_PIXELS = 12;

/** How far the nearest other chain must stay from a corner reading, in CSS pixels. */
const CORNER_CLEARANCE_PIXELS = 20;

/** The window the comparison run of the join sits in, in CSS pixels from the bend. */
const JOIN_RUN_FROM_PIXELS = 16;
const JOIN_RUN_TO_PIXELS = 40;

/** How long the comparison run must be, in CSS pixels. */
const JOIN_RUN_LEAST_PIXELS = 8;

/**
 * Finds a place where the drawn line turns by at least 30 degrees within a reach of 8
 * CSS pixels.
 *
 * The bend is measured over a reach and not between two neighbouring segments. The
 * spec holds every vertex of the drawn line to 20 degrees, so no two neighbouring
 * segments can meet under 160 degrees and a bend is a run of vertices rather than one
 * corner. The reading window is the same 8 CSS pixels either way.
 *
 * The zoom is a parameter, and every window the search holds is in CSS pixels at that
 * zoom. The comparison needs a straight run of the same chain in the same frame, outside
 * the window the reading excludes, so the search asks for one 16 to 40 CSS pixels from
 * the bend.
 */
export function findSharpCorner(
  lines: RegionLines,
  viewport: Viewport,
  distance: number,
): CornerChoice {
  const perPixel = lightYearsPerPixel(distance, viewport);
  const reach = JOIN_REACH_PIXELS * perPixel;

  interface Bend {
    chain: number;
    vertex: number;
    back: number;
    forward: number;
    turn: number;
  }

  // Every vertex where the line turns far enough over the reach, most turn first.
  const bends: Bend[] = [];
  for (let chain = 0; chain < lines.chainCount; chain += 1) {
    const first = lines.first[chain] as number;
    const last = lines.last[chain] as number;
    for (let vertex = first + 1; vertex < last; vertex += 1) {
      const here = planeAt(lines, vertex);
      let back = vertex;
      while (back > first && gap(planeAt(lines, back), here) < reach) back -= 1;
      let forward = vertex;
      while (forward < last && gap(planeAt(lines, forward), here) < reach) forward += 1;
      const from = planeAt(lines, back);
      const to = planeAt(lines, forward);
      // Near an end of a chain the window is short, and a short window reads a larger
      // turn than the reading really covers.
      if (gap(from, here) < reach || gap(to, here) < reach) continue;

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
      bends.push({ chain, vertex, back, forward, turn });
    }
  }
  bends.sort((a, b) => (b.turn === a.turn ? a.vertex - b.vertex : b.turn - a.turn));

  let held = 0;
  let kept: CornerChoice | null = null;
  for (const found of bends) {
    const first = lines.first[found.chain] as number;
    const last = lines.last[found.chain] as number;
    const bend = planeAt(lines, found.vertex);

    // No other chain may come near, and this chain may not fold back over the bend.
    const clearance = clearanceFrom(
      lines,
      bend,
      (other) => other >= first && other <= last,
    );
    if (clearance < CORNER_CLEARANCE_PIXELS * perPixel) continue;
    // A fold is the chain coming back near the bend from far along its own length.
    // The neighbourhood is measured as arc length and not as a count of vertices,
    // because the drawn line carries a vertex about every 5 light years.
    let folds = false;
    for (const step of [-1, 1]) {
      let arc = 0;
      let other = found.vertex;
      for (;;) {
        const next = other + step;
        if (next < first || next > last) break;
        arc += gap(planeAt(lines, other), planeAt(lines, next));
        other = next;
        if (arc < NEIGHBOUR_ARC_PIXELS * perPixel) continue;
        if (gap(bend, planeAt(lines, other)) < FOLD_REACH_PIXELS * perPixel) {
          folds = true;
        }
      }
    }
    if (folds) continue;

    // The straight run the reading compares with: the longest run of this chain that
    // stays within 2 light years of its chord, 16 to 40 CSS pixels from the bend, so it
    // sits outside the 12 CSS pixels the reading excludes and inside the frame.
    const runFrom = JOIN_RUN_FROM_PIXELS * perPixel;
    const runTo = JOIN_RUN_TO_PIXELS * perPixel;
    let run: { from: number; to: number; length: number } | null = null;
    for (let start = first; start < last; start += 1) {
      const away = gap(bend, planeAt(lines, start));
      if (away < runFrom || away > runTo) continue;
      for (let end = start + 1; end <= last; end += 1) {
        const away2 = gap(bend, planeAt(lines, end));
        if (away2 < runFrom || away2 > runTo) break;
        if (chordDeparture(lines, start, end) > 2) break;
        const length = gap(planeAt(lines, start), planeAt(lines, end));
        if (run === null || length > run.length) run = { from: start, to: end, length };
      }
    }
    if (run === null || run.length < JOIN_RUN_LEAST_PIXELS * perPixel) continue;

    const bendLine: [number, number, number][] = [];
    for (let vertex = found.back; vertex <= found.forward; vertex += 1) {
      bendLine.push(game(planeAt(lines, vertex)));
    }

    held += 1;
    if (kept !== null) continue;
    kept = {
      view: { cursor: game(bend), distance, yaw: 0, pitch: PITCH },
      viewport: { width: viewport.width, height: viewport.height },
      chain: found.chain,
      vertex: found.vertex,
      turnDegrees: found.turn,
      reachPixels: JOIN_REACH_PIXELS,
      bend: game(bend),
      bendLine,
      straightFrom: game(planeAt(lines, run.from)),
      straightTo: game(planeAt(lines, run.to)),
      clearanceLy: clearance,
      lightYearsPerPixel: perPixel,
      heldCount: 0,
    };
  }
  if (kept === null) {
    throw new Error('no place turns 30 degrees within the reading reach');
  }
  return { ...kept, heldCount: held };
}

/** A cell hash of the segments of a boundary set, for a nearest-segment reading. */
interface SegmentIndex {
  /** The shortest distance from a plane point to any segment of the set. */
  gapTo(point: Plane): number;
}

/** The side of one cell of the segment hash, in light years. */
const INDEX_CELL_LY = 200;

function indexSegments(lines: RegionLines): SegmentIndex {
  const buckets = new Map<number, number[]>();
  const add = (key: number, vertex: number): void => {
    const held = buckets.get(key);
    if (held === undefined) buckets.set(key, [vertex]);
    else held.push(vertex);
  };
  for (let chain = 0; chain < lines.chainCount; chain += 1) {
    const first = lines.first[chain] as number;
    const last = lines.last[chain] as number;
    for (let vertex = first; vertex < last; vertex += 1) {
      const a = planeAt(lines, vertex);
      const b = planeAt(lines, vertex + 1);
      // A segment can cross several cells, so it goes into every cell of its box.
      const lowX = Math.floor(Math.min(a[0], b[0]) / INDEX_CELL_LY);
      const highX = Math.floor(Math.max(a[0], b[0]) / INDEX_CELL_LY);
      const lowZ = Math.floor(Math.min(a[1], b[1]) / INDEX_CELL_LY);
      const highZ = Math.floor(Math.max(a[1], b[1]) / INDEX_CELL_LY);
      for (let cellX = lowX; cellX <= highX; cellX += 1) {
        for (let cellZ = lowZ; cellZ <= highZ; cellZ += 1) {
          add(cellX * 100000 + cellZ, vertex);
        }
      }
    }
  }

  const gapToSegment = (point: Plane, vertex: number): number => {
    const a = planeAt(lines, vertex);
    const b = planeAt(lines, vertex + 1);
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const span = dx * dx + dz * dz;
    let part =
      span === 0 ? 0 : ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / span;
    if (part < 0) part = 0;
    if (part > 1) part = 1;
    return Math.hypot(point[0] - (a[0] + part * dx), point[1] - (a[1] + part * dz));
  };

  return {
    gapTo(point: Plane): number {
      const cellX = Math.floor(point[0] / INDEX_CELL_LY);
      const cellZ = Math.floor(point[1] / INDEX_CELL_LY);
      let nearest = Number.POSITIVE_INFINITY;
      for (let ring = 0; ring <= 20; ring += 1) {
        for (let stepZ = -ring; stepZ <= ring; stepZ += 1) {
          for (let stepX = -ring; stepX <= ring; stepX += 1) {
            if (Math.max(Math.abs(stepX), Math.abs(stepZ)) !== ring) continue;
            const held = buckets.get((cellX + stepX) * 100000 + cellZ + stepZ);
            if (held === undefined) continue;
            for (const vertex of held) {
              const away = gapToSegment(point, vertex);
              if (away < nearest) nearest = away;
            }
          }
        }
        // A segment outside this ring cannot be nearer than the ring's own reach.
        if (nearest <= ring * INDEX_CELL_LY) break;
      }
      return nearest;
    },
  };
}

/** How near the chosen point must sit to a chain of each set, in light years. */
const BOTH_SETS_GAP_LY = 0.5;

/** How far the nearest other chain must stay from the chosen point, in CSS pixels. */
const BOTH_SETS_CLEARANCE_PIXELS = 20;

/** The zooms the fade scenarios open the chosen point at, in light years. */
const BOTH_SETS_ZOOMS: readonly number[] = [9000, 15000, 20000, 25000, 31000];

/** How wide the window the fade scenarios read around the point is, in CSS pixels. */
const BOTH_SETS_WINDOW_PIXELS = 8;

/**
 * Finds a plane point that sits on a chain of both boundary sets.
 *
 * The scenario "The boundary draws in full at the close end of the band" reads the same
 * point in both modes, and the scenario "The overlay fades out across the close end of
 * the band" reads it at 12,000, 7,500 and 5,000 light years. The smoothed line may sit
 * 49.3 light years from the traced one, so a point chosen against one set alone can leave
 * the other set's line off the middle of the frame.
 *
 * The search takes the midpoint of a long traced segment, because the two lines coincide
 * along a straight run of the boundary, and keeps the longest such segment whose
 * midpoint is within half a light year of the smoothed set as well.
 *
 * The clearance is 20 CSS pixels at the viewport and the zoom the fade scenario reads at.
 * A neighbouring band is 6 CSS pixels wide, so its near edge then sits 17 CSS pixels from
 * the centre and outside the 8 CSS pixel window the scenario reads.
 *
 * The fade scenarios open the point at five zooms, from 9,000 to 31,000 light years, and
 * one CSS pixel covers the most light years at the widest of them. Every other chain
 * therefore stays clear of the 8 CSS pixel window at each of the five, which the search
 * reads as one distance in light years.
 */
export function findPointNearBothSets(
  lines: RegionLines,
  traced: RegionLines,
  viewport: Viewport,
  distance: number,
): BothSetsChoice {
  const perPixel = lightYearsPerPixel(distance, viewport);
  // The window holds at every zoom the fade scenarios open, so the widest of them, where
  // one CSS pixel covers the most light years, is the one that binds.
  const windowLy = Math.max(
    ...BOTH_SETS_ZOOMS.map(
      (zoom) => BOTH_SETS_WINDOW_PIXELS * lightYearsPerPixel(zoom, viewport),
    ),
  );
  const leastClearance = Math.max(BOTH_SETS_CLEARANCE_PIXELS * perPixel, windowLy);
  const smoothedIndex = indexSegments(lines);
  /** The longest traced segment the search has accepted so far. */
  let best: BothSetsChoice | null = null;
  let bestLength = 0;
  /** How many points hold every premise of the search. */
  let held = 0;

  for (let chain = 0; chain < traced.chainCount; chain += 1) {
    const first = traced.first[chain] as number;
    const last = traced.last[chain] as number;
    for (let vertex = first; vertex < last; vertex += 1) {
      const a = planeAt(traced, vertex);
      const b = planeAt(traced, vertex + 1);
      const length = gap(a, b);
      const point: Plane = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

      // The band lightens what it crosses, which it cannot do over the core itself.
      const radius = Math.hypot(
        point[0] - GALACTIC_CENTRE[0],
        point[1] - GALACTIC_CENTRE[2],
      );
      if (radius < CENTRE_FLOOR_LY) continue;

      const smoothedGap = smoothedIndex.gapTo(point);
      if (smoothedGap > BOTH_SETS_GAP_LY) continue;

      // No other chain may come near, in either set, so the reading at the closest
      // zoom holds one boundary and not two.
      const clearance = Math.min(
        clearanceFrom(traced, point, (other) => other >= first && other <= last),
        clearanceFrom(lines, point, (other) => {
          const first2 = lines.first[chain] as number;
          const last2 = lines.last[chain] as number;
          return other >= first2 && other <= last2;
        }),
      );
      if (clearance < leastClearance) continue;

      // The premises are read first and the length second, so the count below is the
      // count of points that hold every premise and not of the ones that improve on the
      // best so far.
      held += 1;
      if (length <= bestLength) continue;
      bestLength = length;
      best = {
        point: game(point),
        chain,
        segmentLengthLy: length,
        smoothedGapLy: smoothedGap,
        tracedGapLy: 0,
        clearanceLy: clearance,
        heldCount: 0,
      };
    }
  }
  if (best === null) throw new Error('no point sits on a chain of both sets');
  return { ...best, heldCount: held };
}

/** How far the traced corner reading reaches from the node, in CSS pixels. */
const TRACED_REACH_PIXELS = 6;

/** How long each arm of a traced corner must be, in CSS pixels. */
const TRACED_ARM_PIXELS = 48;

/** Where the straight run of the comparison starts and ends along an arm, in CSS pixels. */
const TRACED_RUN_FROM_PIXELS = 12;
const TRACED_RUN_TO_PIXELS = 40;

/**
 * The neighbourhood arc and the fold reach of this search, in CSS pixels. They are its
 * own copies, because the join search reads at another zoom.
 */
const TRACED_NEIGHBOUR_ARC_PIXELS = 16;
const TRACED_FOLD_REACH_PIXELS = 12;

/**
 * Finds a lattice node where the traced line turns by 90 degrees.
 *
 * Every vertex of the traced set is such a node: the set keeps a node only where the
 * direction of the unit edges changes, and the edges run along the axes of the grid. The
 * search therefore asks for the reading conditions and not for the turn: both arms longer
 * than 48 CSS pixels, a straight run of the same chain for the comparison, and no other
 * chain near.
 *
 * The arm is 48 CSS pixels and not 20 because the comparison run reaches 40 CSS pixels
 * from the node. A shorter arm would put the far end of that run past the next node and
 * off the straight line the reading compares with.
 *
 * The zoom is a parameter, and every window the search holds is in CSS pixels at it. The
 * bend line reaches 6 CSS pixels along each arm, which is the reading radius of this
 * corner, so the reader classifies a pixel against the drawn line and not against a
 * shorter stub of it.
 */
export function findTracedCorner(
  traced: RegionLines,
  viewport: Viewport,
  distance: number,
): CornerChoice {
  const perPixel = lightYearsPerPixel(distance, viewport);
  let held = 0;
  let kept: CornerChoice | null = null;

  for (let chain = 0; chain < traced.chainCount; chain += 1) {
    const first = traced.first[chain] as number;
    const last = traced.last[chain] as number;
    for (let vertex = first + 1; vertex < last; vertex += 1) {
      const bend = planeAt(traced, vertex);
      const back = planeAt(traced, vertex - 1);
      const forward = planeAt(traced, vertex + 1);
      const armBack = gap(bend, back);
      const armForward = gap(bend, forward);
      const arm = TRACED_ARM_PIXELS * perPixel;
      if (armBack < arm || armForward < arm) continue;

      const inX = bend[0] - back[0];
      const inZ = bend[1] - back[1];
      const outX = forward[0] - bend[0];
      const outZ = forward[1] - bend[1];
      const cosine = (inX * outX + inZ * outZ) / (armBack * armForward);
      const turn = (Math.acos(Math.min(1, Math.max(-1, cosine))) * 180) / Math.PI;
      if (Math.abs(turn - 90) > 1e-6) continue;

      // The band lightens what it crosses, which it cannot do over the core itself.
      const radius = Math.hypot(
        bend[0] - GALACTIC_CENTRE[0],
        bend[1] - GALACTIC_CENTRE[2],
      );
      if (radius < CENTRE_FLOOR_LY) continue;

      // No other chain may come near the reading window, and this chain may not fold
      // back over the corner.
      const clearance = clearanceFrom(
        traced,
        bend,
        (other) => other >= first && other <= last,
      );
      if (clearance < CORNER_CLEARANCE_PIXELS * perPixel) continue;
      let folds = false;
      for (const step of [-1, 1]) {
        let arc = 0;
        let other = vertex;
        for (;;) {
          const next = other + step;
          if (next < first || next > last) break;
          arc += gap(planeAt(traced, other), planeAt(traced, next));
          other = next;
          if (arc < TRACED_NEIGHBOUR_ARC_PIXELS * perPixel) continue;
          if (gap(bend, planeAt(traced, other)) < TRACED_FOLD_REACH_PIXELS * perPixel) {
            folds = true;
          }
        }
      }
      if (folds) continue;

      /** A point along an arm, at a distance from the corner in light years. */
      const along = (to: Plane, away: number): Plane => {
        const span = gap(bend, to);
        return [
          bend[0] + ((to[0] - bend[0]) * away) / span,
          bend[1] + ((to[1] - bend[1]) * away) / span,
        ];
      };

      const view: ChosenView = { cursor: game(bend), distance, yaw: 0, pitch: PITCH };
      const straightFrom = along(forward, TRACED_RUN_FROM_PIXELS * perPixel);
      const straightTo = along(forward, TRACED_RUN_TO_PIXELS * perPixel);
      const inFrame = (point: Plane): boolean => {
        const screen = project(view as View, game(point), viewport);
        return (
          screen.inFront &&
          screen.x > 20 &&
          screen.x < viewport.width - 20 &&
          screen.y > 20 &&
          screen.y < viewport.height - 20
        );
      };
      if (!inFrame(straightFrom) || !inFrame(straightTo)) continue;

      held += 1;
      if (kept !== null) continue;
      kept = {
        view,
        viewport: { width: viewport.width, height: viewport.height },
        chain,
        vertex,
        turnDegrees: turn,
        reachPixels: TRACED_REACH_PIXELS,
        bend: game(bend),
        bendLine: [
          game(along(back, TRACED_REACH_PIXELS * perPixel)),
          game(bend),
          game(along(forward, TRACED_REACH_PIXELS * perPixel)),
        ],
        straightFrom: game(straightFrom),
        straightTo: game(straightTo),
        clearanceLy: clearance,
        lightYearsPerPixel: perPixel,
        heldCount: 0,
      };
    }
  }
  if (kept === null) throw new Error('no traced corner meets the reading conditions');
  return { ...kept, heldCount: held };
}
