import { beforeAll, describe, expect, test } from 'vitest';
import { project } from '../src/camera/projection';
import type { View } from '../src/camera/view';
import { arcThrough, arcTangents } from '../src/scene-data/arc';
import {
  buildRegionLines,
  chainPointsLy,
  fillRegionGrid,
  fitChainArcs,
  keptVerticesLy,
  packRegionLines,
  traceRegionChains,
} from '../src/scene-data/region-lines';
import type { RegionLines } from '../src/scene-data/types';
import {
  BIARC_JOINT,
  CURVED_RUN,
  LONG_SEGMENT,
  SHARP_CORNER,
  VERTICAL_CROSSING,
} from '../e2e/region-views';
import {
  findBiarcJoint,
  findCurvedRun,
  findLongSegment,
  findSharpCorner,
  findVerticalCrossing,
  jointsOfRun,
  runsOf,
} from './region-views';

let lines: RegionLines;

beforeAll(() => {
  lines = buildRegionLines();
}, 120000);

/** How many CSS pixels the join reading takes around the bend. */
const JOIN_RADIUS_PIXELS = 8;

/** The shortest segment the width reading may take, in light years. */
const LONG_SEGMENT_LY = 10000;

type Point = readonly [number, number, number];

function planeGap(a: Point, b: Point): number {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}

function vertexAt(vertex: number): [number, number, number] {
  return [
    lines.positions[vertex * 3] as number,
    0,
    lines.positions[vertex * 3 + 2] as number,
  ];
}

/** The arc of one primitive, as the vertex it starts at. */
function arcOf(primitive: number) {
  const a = vertexAt(primitive);
  const b = vertexAt(primitive + 1);
  return arcThrough(a[0], a[2], b[0], b[2], lines.curvature[primitive] as number);
}

/**
 * The distance from a plane point to one drawn primitive, in light years.
 *
 * A primitive is an arc, and a chord measure would call a point on the middle of a
 * curve up to 60.6 light years away. A straight primitive takes its chord; an arc takes
 * the reading off its circle, where a point inside the swept angle is as far away as
 * the two radii differ.
 */
function gapToPrimitive(point: Point, primitive: number): number {
  const arc = arcOf(primitive);
  const start: [number, number] = [arc.startX, arc.startZ];
  const end: [number, number] = [arc.endX, arc.endZ];
  const toEnds = Math.min(
    Math.hypot(point[0] - start[0], point[2] - start[1]),
    Math.hypot(point[0] - end[0], point[2] - end[1]),
  );
  if (arc.sweep === 0) {
    const dx = end[0] - start[0];
    const dz = end[1] - start[1];
    const square = dx * dx + dz * dz;
    let t =
      square === 0
        ? 0
        : ((point[0] - start[0]) * dx + (point[2] - start[1]) * dz) / square;
    if (t < 0) t = 0;
    if (t > 1) t = 1;
    return Math.hypot(point[0] - (start[0] + t * dx), point[2] - (start[1] + t * dz));
  }
  const tangents = arcTangents(arc);
  const centre: [number, number] = [
    arc.startX - tangents.startZ / arc.curvature,
    arc.startZ + tangents.startX / arc.curvature,
  ];
  const away = Math.hypot(point[0] - centre[0], point[2] - centre[1]);
  const atStart = Math.atan2(start[1] - centre[1], start[0] - centre[0]);
  const atPoint = Math.atan2(point[2] - centre[1], point[0] - centre[0]);
  let turned = atPoint - atStart;
  while (turned > Math.PI) turned -= 2 * Math.PI;
  while (turned < -Math.PI) turned += 2 * Math.PI;
  const inside =
    arc.sweep > 0
      ? turned >= 0 && turned <= arc.sweep
      : turned <= 0 && turned >= arc.sweep;
  return inside ? Math.abs(away - arc.radius) : toEnds;
}

/** The turn of the drawn line at a vertex, in degrees. */
function drawnTurnAt(vertex: number): number {
  const arriving = arcTangents(arcOf(vertex - 1));
  const leaving = arcTangents(arcOf(vertex));
  const cosine = arriving.endX * leaving.startX + arriving.endZ * leaving.startZ;
  return (Math.acos(Math.min(1, Math.max(-1, cosine))) * 180) / Math.PI;
}

/** Half the diagonal of a frame, in light years at the cursor. */
function frameReachLy(width: number, height: number, perPixel: number): number {
  return (Math.hypot(width, height) / 2) * perPixel;
}

describe('the view where a chain crosses the frame', () => {
  test('is what the search of the boundary set gives', () => {
    expect(findVerticalCrossing(lines, VERTICAL_CROSSING.viewport)).toEqual(
      VERTICAL_CROSSING,
    );
  });

  test('crosses within 5 degrees of vertical', () => {
    const view = VERTICAL_CROSSING.view as View;
    const from = project(
      view,
      vertexAt(VERTICAL_CROSSING.from),
      VERTICAL_CROSSING.viewport,
    );
    const to = project(
      view,
      vertexAt(VERTICAL_CROSSING.to),
      VERTICAL_CROSSING.viewport,
    );
    const lean =
      (Math.atan2(Math.abs(to.x - from.x), Math.abs(to.y - from.y)) * 180) / Math.PI;
    expect(lean).toBeLessThan(5);
    expect(VERTICAL_CROSSING.angleFromVertical).toBeCloseTo(lean, 6);

    // The run leaves the frame at the top and at the bottom, so the chain crosses the
    // whole frame and the reading row meets it.
    expect(Math.min(from.y, to.y)).toBeLessThanOrEqual(0);
    expect(Math.max(from.y, to.y)).toBeGreaterThanOrEqual(
      VERTICAL_CROSSING.viewport.height,
    );
  });

  test('names a run of one chain of the boundary set', () => {
    expect(lines.first[VERTICAL_CROSSING.chain] as number).toBeLessThanOrEqual(
      VERTICAL_CROSSING.from,
    );
    expect(lines.last[VERTICAL_CROSSING.chain] as number).toBeGreaterThanOrEqual(
      VERTICAL_CROSSING.to,
    );
    expect(VERTICAL_CROSSING.to).toBeGreaterThan(VERTICAL_CROSSING.from);
  });

  test('sits on the drawn line at the centre of the frame', () => {
    const centre = project(
      VERTICAL_CROSSING.view as View,
      VERTICAL_CROSSING.point,
      VERTICAL_CROSSING.viewport,
    );
    expect(centre.x).toBeCloseTo(VERTICAL_CROSSING.viewport.width / 2, 4);
    expect(centre.y).toBeCloseTo(VERTICAL_CROSSING.viewport.height / 2, 4);

    // The centre of the frame is a point of the drawn line and not merely of the run's
    // chord. A primitive is an arc, so the reading measures to the arc.
    expect(
      gapToPrimitive(VERTICAL_CROSSING.point, VERTICAL_CROSSING.to - 1),
    ).toBeLessThan(1e-6);
  });

  test('carries no other part of the boundary near the reading', () => {
    // The reading takes a row 40 CSS pixels wide. The nearest other primitive is far
    // outside it.
    const pixels = VERTICAL_CROSSING.clearanceLy / VERTICAL_CROSSING.lightYearsPerPixel;
    expect(pixels).toBeGreaterThan(60);
  });
});

describe('the view at a bend of a chain', () => {
  test('is what the search of the boundary set gives', () => {
    expect(findSharpCorner(lines, SHARP_CORNER.viewport)).toEqual(SHARP_CORNER);
  });

  test('meets at at least 60 degrees', () => {
    const line = SHARP_CORNER.bendLine;
    const bend = SHARP_CORNER.bend;
    const from = line[0] as Point;
    const to = line[line.length - 1] as Point;
    const inX = bend[0] - from[0];
    const inZ = bend[2] - from[2];
    const outX = to[0] - bend[0];
    const outZ = to[2] - bend[2];
    const cosine =
      (inX * outX + inZ * outZ) / (Math.hypot(inX, inZ) * Math.hypot(outX, outZ));
    const turn = (Math.acos(cosine) * 180) / Math.PI;
    expect(turn).toBeGreaterThanOrEqual(60);
    expect(SHARP_CORNER.turnDegrees).toBeCloseTo(turn, 6);

    // The reach is read on each side of the bend, so the window the browser test
    // reads holds the whole turn.
    const perPixel = SHARP_CORNER.lightYearsPerPixel;
    expect(planeGap(bend, from) / perPixel).toBeGreaterThanOrEqual(
      SHARP_CORNER.reachPixels,
    );
    expect(planeGap(bend, to) / perPixel).toBeGreaterThanOrEqual(
      SHARP_CORNER.reachPixels,
    );
    expect(SHARP_CORNER.reachPixels).toBe(JOIN_RADIUS_PIXELS);
  });

  test('names the two primitives of the boundary set that meet at the bend', () => {
    const vertex = SHARP_CORNER.vertex;
    expect(lines.first[SHARP_CORNER.chain] as number).toBeLessThan(vertex);
    expect(lines.last[SHARP_CORNER.chain] as number).toBeGreaterThan(vertex);
    expect(lines.positions[vertex * 3] as number).toBe(SHARP_CORNER.bend[0]);
    expect(lines.positions[vertex * 3 + 2] as number).toBe(SHARP_CORNER.bend[2]);

    // The bend line is the drawn line and not a chord of it: the middle point is the
    // vertex itself, and the two ends lie on the two primitives that meet there, one on
    // each. The reach is 24 CSS pixels, over which an arc of this set bows away from
    // its chord by under a tenth of a pixel, so three points hold the whole reading.
    expect(SHARP_CORNER.bendLine).toHaveLength(3);
    const back = SHARP_CORNER.bendLine[0] as Point;
    const middle = SHARP_CORNER.bendLine[1] as Point;
    const forward = SHARP_CORNER.bendLine[2] as Point;
    expect(middle).toEqual(SHARP_CORNER.bend);
    expect(gapToPrimitive(back, vertex - 1)).toBeLessThan(1e-6);
    expect(gapToPrimitive(forward, vertex)).toBeLessThan(1e-6);

    // Both primitives run past the reading, so neither ends inside the frame.
    const perPixel = SHARP_CORNER.lightYearsPerPixel;
    const frame = frameReachLy(
      SHARP_CORNER.viewport.width,
      SHARP_CORNER.viewport.height,
      perPixel,
    );
    expect(arcOf(vertex - 1).length).toBeGreaterThan(frame);
    expect(arcOf(vertex).length).toBeGreaterThan(frame);
  });

  test('holds a straight run of the same chain inside the frame', () => {
    const perPixel = SHARP_CORNER.lightYearsPerPixel;
    const run = planeGap(SHARP_CORNER.straightFrom, SHARP_CORNER.straightTo);
    expect(run / perPixel).toBeGreaterThan(30);

    // The run is a part of one of the two primitives, so the browser reads the drawn
    // line and not a chord across a turn.
    const vertex = SHARP_CORNER.vertex;
    for (const end of [SHARP_CORNER.straightFrom, SHARP_CORNER.straightTo]) {
      const onBack = gapToPrimitive(end, vertex - 1);
      const onForward = gapToPrimitive(end, vertex);
      expect(Math.min(onBack, onForward)).toBeLessThan(1e-6);
    }

    // The run sits outside the reading window and inside the frame.
    for (const end of [SHARP_CORNER.straightFrom, SHARP_CORNER.straightTo]) {
      expect(planeGap(SHARP_CORNER.bend, end) / perPixel).toBeGreaterThan(
        JOIN_RADIUS_PIXELS * 2,
      );
      const screen = project(SHARP_CORNER.view as View, end, SHARP_CORNER.viewport);
      expect(screen.inFront).toBe(true);
      expect(screen.x).toBeGreaterThan(20);
      expect(screen.x).toBeLessThan(SHARP_CORNER.viewport.width - 20);
      expect(screen.y).toBeGreaterThan(20);
      expect(screen.y).toBeLessThan(SHARP_CORNER.viewport.height - 20);
    }
  });

  test('carries no other part of the boundary anywhere in the frame', () => {
    const frame = frameReachLy(
      SHARP_CORNER.viewport.width,
      SHARP_CORNER.viewport.height,
      SHARP_CORNER.lightYearsPerPixel,
    );
    expect(SHARP_CORNER.clearanceLy).toBeGreaterThan(frame);
  });
});

describe('the view where a long segment crosses the frame', () => {
  test('is what the search of the boundary set gives', () => {
    expect(findLongSegment(lines, LONG_SEGMENT.viewport)).toEqual(LONG_SEGMENT);
  });

  test('takes one straight primitive longer than 10,000 light years', () => {
    expect(lines.first[LONG_SEGMENT.chain] as number).toBeLessThanOrEqual(
      LONG_SEGMENT.from,
    );
    expect(lines.last[LONG_SEGMENT.chain] as number).toBeGreaterThanOrEqual(
      LONG_SEGMENT.to,
    );
    expect(LONG_SEGMENT.to).toBe(LONG_SEGMENT.from + 1);
    expect(vertexAt(LONG_SEGMENT.from)).toEqual(LONG_SEGMENT.ends[0]);
    expect(vertexAt(LONG_SEGMENT.to)).toEqual(LONG_SEGMENT.ends[1]);

    const length = planeGap(LONG_SEGMENT.ends[0], LONG_SEGMENT.ends[1]);
    expect(length).toBeGreaterThan(LONG_SEGMENT_LY);
    expect(LONG_SEGMENT.segmentLy).toBeCloseTo(length, 6);

    // The primitive is straight, so it lies flat across the whole frame. A curve of
    // this length could not.
    expect(lines.curvature[LONG_SEGMENT.from] as number).toBe(0);
  });

  test('reads at the closest zoom, with the cursor on the line', () => {
    expect(LONG_SEGMENT.view.distance).toBe(500);
    const centre = project(
      LONG_SEGMENT.view as View,
      LONG_SEGMENT.point,
      LONG_SEGMENT.viewport,
    );
    expect(centre.x).toBeCloseTo(LONG_SEGMENT.viewport.width / 2, 4);
    expect(centre.y).toBeCloseTo(LONG_SEGMENT.viewport.height / 2, 4);
    expect(gapToPrimitive(LONG_SEGMENT.point, LONG_SEGMENT.from)).toBeLessThan(1e-6);
  });

  test('crosses the whole frame with both ends outside it', () => {
    const view = LONG_SEGMENT.view as View;
    const first = project(view, LONG_SEGMENT.ends[0], LONG_SEGMENT.viewport);
    const last = project(view, LONG_SEGMENT.ends[1], LONG_SEGMENT.viewport);
    expect(first.inFront).toBe(true);
    expect(last.inFront).toBe(true);

    // The drawn line leaves the frame at the left and at the right, so a reading at
    // the left, the middle and the right of the frame all meet it.
    const left = Math.min(first.x, last.x);
    const right = Math.max(first.x, last.x);
    expect(left).toBeLessThanOrEqual(0);
    expect(right).toBeGreaterThanOrEqual(LONG_SEGMENT.viewport.width);

    // The projection takes a straight line to a straight line, so the drawn line runs
    // between the two projected ends. It stays inside the frame from side to side.
    for (const column of [
      0,
      LONG_SEGMENT.viewport.width / 2,
      LONG_SEGMENT.viewport.width,
    ]) {
      const t = (column - first.x) / (last.x - first.x);
      const row = first.y + t * (last.y - first.y);
      expect(row).toBeGreaterThan(0);
      expect(row).toBeLessThan(LONG_SEGMENT.viewport.height);
    }

    // Both ends sit far outside the frame, which is what the drawn width has to hold
    // over: each is more than four frame widths from the cursor.
    const frameWidth = LONG_SEGMENT.viewport.width * LONG_SEGMENT.lightYearsPerPixel;
    for (const end of LONG_SEGMENT.ends) {
      expect(planeGap(LONG_SEGMENT.point, end)).toBeGreaterThan(4 * frameWidth);
    }
  });

  test('lies within 5 degrees of flat on the screen', () => {
    const view = LONG_SEGMENT.view as View;
    const first = project(view, LONG_SEGMENT.ends[0], LONG_SEGMENT.viewport);
    const last = project(view, LONG_SEGMENT.ends[1], LONG_SEGMENT.viewport);
    const lean =
      (Math.atan2(Math.abs(last.x - first.x), Math.abs(last.y - first.y)) * 180) /
      Math.PI;
    expect(lean).toBeGreaterThan(85);
    expect(LONG_SEGMENT.angleFromVertical).toBeCloseTo(lean, 6);
  });

  test('carries no other part of the boundary anywhere in the frame', () => {
    const frame = frameReachLy(
      LONG_SEGMENT.viewport.width,
      LONG_SEGMENT.viewport.height,
      LONG_SEGMENT.lightYearsPerPixel,
    );
    expect(LONG_SEGMENT.clearanceLy).toBeGreaterThan(frame);
  });
});

describe('the joints of the boundary set', () => {
  test('reads the joints the fit recorded', () => {
    // The packed set carries no record of which vertex is a kept vertex and which is a
    // joint, so the search derives it: a break is a vertex where the drawn line turns,
    // and inside a run the fit lays out a kept vertex, a joint, a kept vertex, and so
    // on. This checks that derivation against what the fit itself recorded.
    const grid = fillRegionGrid();
    const trace = traceRegionChains(grid);
    const built = packRegionLines(grid, trace);
    const fits = trace.chains.map((chain) =>
      fitChainArcs(chainPointsLy(grid, chain), keptVerticesLy(grid, chain)),
    );

    const derived = new Set<number>();
    for (const run of runsOf(built)) {
      // A run holds one straight primitive or an odd number of vertices, because each
      // span of it takes two arcs that meet at a joint.
      const vertices = run.to - run.from + 1;
      expect(vertices === 2 || vertices % 2 === 1).toBe(true);
      for (const vertex of jointsOfRun(run)) derived.add(vertex);
    }

    const recorded = new Set<number>();
    for (let chain = 0; chain < built.chainCount; chain += 1) {
      const first = built.first[chain] as number;
      const fit = fits[chain] as { kept: Uint8Array };
      for (let offset = 0; offset < fit.kept.length; offset += 1) {
        if (fit.kept[offset] === 0) recorded.add(first + offset);
      }
    }

    expect(recorded.size).toBeGreaterThan(0);
    expect([...derived].sort((a, b) => a - b)).toEqual(
      [...recorded].sort((a, b) => a - b),
    );
  }, 120000);
});

describe('the view at the joint of a biarc', () => {
  test('is what the search of the boundary set gives', () => {
    expect(findBiarcJoint(lines, BIARC_JOINT.viewport)).toEqual(BIARC_JOINT);
  });

  test('joins two arcs tangentially', () => {
    const vertex = BIARC_JOINT.vertex;
    // Both primitives are arcs, and the drawn line runs through the joint without a
    // turn. This is the join the set holds most of and the straight fit never had.
    expect(lines.curvature[vertex - 1] as number).not.toBe(0);
    expect(lines.curvature[vertex] as number).not.toBe(0);
    expect(BIARC_JOINT.curvatures[0]).toBeCloseTo(
      lines.curvature[vertex - 1] as number,
      12,
    );
    expect(BIARC_JOINT.curvatures[1]).toBeCloseTo(
      lines.curvature[vertex] as number,
      12,
    );
    expect(drawnTurnAt(vertex)).toBeLessThan(0.5);
    expect(BIARC_JOINT.turnDegrees).toBeCloseTo(drawnTurnAt(vertex), 6);

    // The two arcs really differ, so the joint is a joint and not a straight carry on.
    expect(BIARC_JOINT.curvatures[0]).not.toBeCloseTo(BIARC_JOINT.curvatures[1], 9);
  });

  test('names a vertex of the boundary set with the joint on it', () => {
    const vertex = BIARC_JOINT.vertex;
    expect(lines.first[BIARC_JOINT.chain] as number).toBeLessThan(vertex);
    expect(lines.last[BIARC_JOINT.chain] as number).toBeGreaterThan(vertex);
    expect(lines.positions[vertex * 3] as number).toBe(BIARC_JOINT.joint[0]);
    expect(lines.positions[vertex * 3 + 2] as number).toBe(BIARC_JOINT.joint[2]);

    // The joint line is the drawn line: the middle point is the joint itself and the
    // two ends lie on the two arcs, one on each.
    expect(BIARC_JOINT.jointLine).toHaveLength(3);
    const back = BIARC_JOINT.jointLine[0] as Point;
    const middle = BIARC_JOINT.jointLine[1] as Point;
    const forward = BIARC_JOINT.jointLine[2] as Point;
    expect(middle).toEqual(BIARC_JOINT.joint);
    expect(gapToPrimitive(back, vertex - 1)).toBeLessThan(1e-6);
    expect(gapToPrimitive(forward, vertex)).toBeLessThan(1e-6);

    // The reading reaches 8 CSS pixels on each side, and both ends of the line sit
    // outside that reach.
    const perPixel = BIARC_JOINT.lightYearsPerPixel;
    expect(planeGap(BIARC_JOINT.joint, back) / perPixel).toBeGreaterThanOrEqual(
      BIARC_JOINT.reachPixels,
    );
    expect(planeGap(BIARC_JOINT.joint, forward) / perPixel).toBeGreaterThanOrEqual(
      BIARC_JOINT.reachPixels,
    );
    expect(BIARC_JOINT.reachPixels).toBe(JOIN_RADIUS_PIXELS);

    // Neither arc ends inside the frame, so the reading holds the two of them alone.
    const frame = frameReachLy(
      BIARC_JOINT.viewport.width,
      BIARC_JOINT.viewport.height,
      perPixel,
    );
    expect(arcOf(vertex - 1).length).toBeGreaterThan(frame);
    expect(arcOf(vertex).length).toBeGreaterThan(frame);
  });

  test('holds a straight run of the same chain inside the frame', () => {
    const perPixel = BIARC_JOINT.lightYearsPerPixel;
    const run = planeGap(BIARC_JOINT.straightFrom, BIARC_JOINT.straightTo);
    expect(run / perPixel).toBeGreaterThan(30);

    const vertex = BIARC_JOINT.vertex;
    for (const end of [BIARC_JOINT.straightFrom, BIARC_JOINT.straightTo]) {
      const onBack = gapToPrimitive(end, vertex - 1);
      const onForward = gapToPrimitive(end, vertex);
      expect(Math.min(onBack, onForward)).toBeLessThan(1e-6);

      // The run sits outside the reading window and inside the frame.
      expect(planeGap(BIARC_JOINT.joint, end) / perPixel).toBeGreaterThan(
        JOIN_RADIUS_PIXELS * 2,
      );
      const screen = project(BIARC_JOINT.view as View, end, BIARC_JOINT.viewport);
      expect(screen.inFront).toBe(true);
      expect(screen.x).toBeGreaterThan(20);
      expect(screen.x).toBeLessThan(BIARC_JOINT.viewport.width - 20);
      expect(screen.y).toBeGreaterThan(20);
      expect(screen.y).toBeLessThan(BIARC_JOINT.viewport.height - 20);
    }
  });

  test('carries no other part of the boundary anywhere in the frame', () => {
    const frame = frameReachLy(
      BIARC_JOINT.viewport.width,
      BIARC_JOINT.viewport.height,
      BIARC_JOINT.lightYearsPerPixel,
    );
    expect(BIARC_JOINT.clearanceLy).toBeGreaterThan(frame);
  });
});

describe('the view on a run that curves', () => {
  test('is what the search of the boundary set gives', () => {
    expect(findCurvedRun(lines, CURVED_RUN.viewport)).toEqual(CURVED_RUN);
  });

  test('takes one run of one chain that curves through more than 60 degrees', () => {
    expect(lines.first[CURVED_RUN.chain] as number).toBeLessThanOrEqual(
      CURVED_RUN.from,
    );
    expect(lines.last[CURVED_RUN.chain] as number).toBeGreaterThanOrEqual(
      CURVED_RUN.to,
    );

    let turn = 0;
    for (let primitive = CURVED_RUN.from; primitive < CURVED_RUN.to; primitive += 1) {
      turn += Math.abs(arcOf(primitive).sweep);
    }
    expect((turn * 180) / Math.PI).toBeGreaterThan(60);
    expect(CURVED_RUN.turnDegrees).toBeCloseTo((turn * 180) / Math.PI, 6);

    // The run holds no break, so the drawn line runs through it with no turn of its
    // own anywhere inside it.
    for (let vertex = CURVED_RUN.from + 1; vertex < CURVED_RUN.to; vertex += 1) {
      expect(drawnTurnAt(vertex)).toBeLessThan(0.5);
    }
  });

  test('reads at 8,000 light years with the drawn line across the frame', () => {
    expect(CURVED_RUN.view.distance).toBe(8000);
    expect(CURVED_RUN.windowPixels).toBe(12);

    // The walk reads neighbouring windows, so the samples are one window apart and
    // every one of them is inside the frame with room for its window.
    const perPixel = CURVED_RUN.lightYearsPerPixel;
    expect(CURVED_RUN.line.length).toBeGreaterThan(8);
    for (let index = 1; index < CURVED_RUN.line.length; index += 1) {
      const step = planeGap(
        CURVED_RUN.line[index - 1] as Point,
        CURVED_RUN.line[index] as Point,
      );
      expect(step / perPixel).toBeLessThanOrEqual(CURVED_RUN.windowPixels + 1);
    }
    for (const point of CURVED_RUN.line) {
      const screen = project(CURVED_RUN.view as View, point, CURVED_RUN.viewport);
      expect(screen.inFront).toBe(true);
      expect(screen.x).toBeGreaterThan(CURVED_RUN.windowPixels);
      expect(screen.x).toBeLessThan(
        CURVED_RUN.viewport.width - CURVED_RUN.windowPixels,
      );
      expect(screen.y).toBeGreaterThan(CURVED_RUN.windowPixels);
      expect(screen.y).toBeLessThan(
        CURVED_RUN.viewport.height - CURVED_RUN.windowPixels,
      );
    }
  });

  test('walks a drawn line that curves and never turns 3 degrees in a window', () => {
    // The drawn line the frame holds curves through most of the run, so the reading
    // walks a curve and not the straight end of one.
    expect(CURVED_RUN.visibleTurnDegrees).toBeGreaterThan(20);
    // Every window turns well under the bound the browser holds it to, and the widest
    // radius of the run is what makes that true: a circle of radius R turns
    // `window / R` over one window.
    expect(CURVED_RUN.turnPerWindowDegrees).toBeLessThan(3);
    const perWindow =
      ((CURVED_RUN.windowPixels * CURVED_RUN.lightYearsPerPixel) /
        CURVED_RUN.widestRadiusLy) *
      (180 / Math.PI);
    expect(perWindow).toBeLessThan(3);

    // Every point of the line lies on the drawn line of the run.
    for (const point of CURVED_RUN.line) {
      let nearest = Number.POSITIVE_INFINITY;
      for (let primitive = CURVED_RUN.from; primitive < CURVED_RUN.to; primitive += 1) {
        nearest = Math.min(nearest, gapToPrimitive(point, primitive));
      }
      expect(nearest).toBeLessThan(1e-6);
    }
  });

  test('carries no other part of the boundary inside a window of the line', () => {
    const pixels = CURVED_RUN.clearanceLy / CURVED_RUN.lightYearsPerPixel;
    expect(pixels).toBeGreaterThan(2 * CURVED_RUN.windowPixels);
  });
});
