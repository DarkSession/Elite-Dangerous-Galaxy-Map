// Chooses the two views the browser tests of the boundary line need.
//
// Two scenarios of `openspec/specs/galactic-regions` name a view that a unit test has
// to choose: one where a chain crosses the frame within 5 degrees of vertical, and one
// where the drawn line turns by at least 30 degrees within a reach of 8 CSS pixels. The
// second is measured over a reach and not between two neighbouring segments, because
// the spec holds every vertex of the drawn line to 20 degrees. Both come from the
// boundary set itself, so nobody has to pick a place on the map by hand.
//
// The search lives here and `region-views.test.ts` checks that the constants in
// `e2e/region-views.ts` are what it gives. The browser test reads those constants,
// because Playwright cannot import the camera module: it reaches the PNG of the
// detail grid, which only Vite can load.
import { project } from '../src/camera/projection';
import type { Viewport } from '../src/camera/projection';
import type { View } from '../src/camera/view';
import type { RegionLines } from '../src/scene-data/types';
import type { CornerChoice, CrossingChoice, ChosenView } from '../e2e/region-views';

/** The galactic centre in game coordinates, as the browser helpers hold it. */
const GALACTIC_CENTRE: readonly [number, number, number] = [15, -35, 25895];

/** The elevation both views take. It looks nearly straight down on the plane. */
const PITCH = 89;

/** How far the drawn line may sit from a straight chord and still count as straight. */
const STRAIGHT_TOLERANCE_LY = 5;

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

/**
 * The distance from a plane point to the nearest vertex the caller does not exclude.
 * The browser tests read a few tens of pixels around their point, so they need to
 * know that no other part of the boundary is inside that window.
 */
function clearanceFrom(
  lines: RegionLines,
  point: Plane,
  keepOut: (vertex: number) => boolean,
): number {
  let nearest = Number.POSITIVE_INFINITY;
  for (let vertex = 0; vertex < lines.vertexCount; vertex += 1) {
    if (keepOut(vertex)) continue;
    const away = gap(point, planeAt(lines, vertex));
    if (away < nearest) nearest = away;
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

/**
 * Finds a chain that crosses the whole frame within 5 degrees of vertical.
 *
 * The search takes the longest run of a chain that stays within 5 light years of the
 * chord it spans, centres the view on the middle of that run, and turns the camera
 * until the run stands upright on the screen. The zoom is close enough that the run
 * leaves the frame at the top and at the bottom.
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
    const perPixel = (2 * distance * Math.tan(Math.PI / 6)) / viewport.height;
    if (clearance < 60 * perPixel) continue;

    // The disc under the line must be brighter than the outline colour, or the
    // outline cannot read as darker than the frame without the overlay.
    const radius = Math.hypot(
      cursorPlane[0] - GALACTIC_CENTRE[0],
      cursorPlane[1] - GALACTIC_CENTRE[2],
    );
    if (radius > 16000) continue;

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

/** How far the line must turn over that reach to count as a bend, in degrees. */
const BEND_TURN_DEGREES = 30;

/**
 * How much of a chain, as arc length in light years, counts as the neighbourhood of a
 * bend. A vertex inside it is the line itself and not a fold of it.
 */
const NEIGHBOUR_ARC_LY = 60;

/**
 * Finds a place where the drawn line turns by at least 30 degrees within a reach of 8
 * CSS pixels.
 *
 * The bend is measured over a reach and not between two neighbouring segments. The
 * spec holds every vertex of the drawn line to 20 degrees, so no two neighbouring
 * segments can meet under 160 degrees and a bend is a run of vertices rather than one
 * corner. The reading window is the same 8 CSS pixels either way.
 *
 * The view takes the closest zoom, 500 light years, where one CSS pixel covers 0.8
 * light years. The comparison needs a straight run of the same chain in the same frame,
 * so the search also asks for one between 40 and 200 light years from the bend.
 */
export function findSharpCorner(lines: RegionLines, viewport: Viewport): CornerChoice {
  const distance = 500;
  const perPixel = (2 * distance * Math.tan(Math.PI / 6)) / viewport.height;
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
    if (clearance < 150) continue;
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
        if (arc < NEIGHBOUR_ARC_LY) continue;
        if (gap(bend, planeAt(lines, other)) < 30) folds = true;
      }
    }
    if (folds) continue;

    // The straight run the reading compares with: the longest run of this chain that
    // stays within 2 light years of its chord, between 40 and 200 light years from the
    // bend, so it sits outside the reading window and inside the frame.
    let run: { from: number; to: number; length: number } | null = null;
    for (let start = first; start < last; start += 1) {
      const away = gap(bend, planeAt(lines, start));
      if (away < 40 || away > 200) continue;
      for (let end = start + 1; end <= last; end += 1) {
        const away2 = gap(bend, planeAt(lines, end));
        if (away2 < 40 || away2 > 200) break;
        if (chordDeparture(lines, start, end) > 2) break;
        const length = gap(planeAt(lines, start), planeAt(lines, end));
        if (run === null || length > run.length) run = { from: start, to: end, length };
      }
    }
    if (run === null || run.length < 30) continue;

    const bendLine: [number, number, number][] = [];
    for (let vertex = found.back; vertex <= found.forward; vertex += 1) {
      bendLine.push(game(planeAt(lines, vertex)));
    }

    return {
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
    };
  }
  throw new Error('no place turns 30 degrees within the reading reach');
}
