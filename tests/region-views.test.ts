import { beforeAll, describe, expect, test } from 'vitest';
import { project } from '../src/camera/projection';
import type { View } from '../src/camera/view';
import { buildRegionLines } from '../src/scene-data/region-lines';
import type { RegionLines } from '../src/scene-data/types';
import { LONG_SEGMENT, SHARP_CORNER, VERTICAL_CROSSING } from '../e2e/region-views';
import { findLongSegment, findSharpCorner, findVerticalCrossing } from './region-views';

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

/** The distance from a plane point to the segment between two vertices. */
function gapToSegment(point: Point, from: number, to: number): number {
  const a = vertexAt(from);
  const b = vertexAt(to);
  const dx = b[0] - a[0];
  const dz = b[2] - a[2];
  const square = dx * dx + dz * dz;
  let t = square === 0 ? 0 : ((point[0] - a[0]) * dx + (point[2] - a[2]) * dz) / square;
  if (t < 0) t = 0;
  if (t > 1) t = 1;
  return Math.hypot(point[0] - (a[0] + t * dx), point[2] - (a[2] + t * dz));
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
    // chord, which a set of long straight segments makes worth reading back.
    expect(
      gapToSegment(
        VERTICAL_CROSSING.point,
        VERTICAL_CROSSING.to - 1,
        VERTICAL_CROSSING.to,
      ),
    ).toBeLessThan(1e-6);
  });

  test('carries no other part of the boundary near the reading', () => {
    // The reading takes a row 40 CSS pixels wide. The nearest other segment is far
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

  test('names the two segments of the boundary set that meet at the bend', () => {
    const vertex = SHARP_CORNER.vertex;
    expect(lines.first[SHARP_CORNER.chain] as number).toBeLessThan(vertex);
    expect(lines.last[SHARP_CORNER.chain] as number).toBeGreaterThan(vertex);
    expect(lines.positions[vertex * 3] as number).toBe(SHARP_CORNER.bend[0]);
    expect(lines.positions[vertex * 3 + 2] as number).toBe(SHARP_CORNER.bend[2]);

    // The bend line is the drawn line and not a chord of it: the middle point is the
    // vertex itself, and the two ends lie on the two segments that meet there, one on
    // each. The line is straight between its vertices, so three points hold the whole
    // reading and a walk of neighbouring vertices is no longer the measure.
    expect(SHARP_CORNER.bendLine).toHaveLength(3);
    const back = SHARP_CORNER.bendLine[0] as Point;
    const middle = SHARP_CORNER.bendLine[1] as Point;
    const forward = SHARP_CORNER.bendLine[2] as Point;
    expect(middle).toEqual(SHARP_CORNER.bend);
    expect(gapToSegment(back, vertex - 1, vertex)).toBeLessThan(1e-6);
    expect(gapToSegment(forward, vertex, vertex + 1)).toBeLessThan(1e-6);

    // Both segments run past the reading, so neither ends inside the frame.
    const perPixel = SHARP_CORNER.lightYearsPerPixel;
    const frame = frameReachLy(
      SHARP_CORNER.viewport.width,
      SHARP_CORNER.viewport.height,
      perPixel,
    );
    expect(planeGap(SHARP_CORNER.bend, vertexAt(vertex - 1))).toBeGreaterThan(frame);
    expect(planeGap(SHARP_CORNER.bend, vertexAt(vertex + 1))).toBeGreaterThan(frame);
  });

  test('holds a straight run of the same chain inside the frame', () => {
    const perPixel = SHARP_CORNER.lightYearsPerPixel;
    const run = planeGap(SHARP_CORNER.straightFrom, SHARP_CORNER.straightTo);
    expect(run / perPixel).toBeGreaterThan(30);

    // The run is a part of one of the two segments, so the browser reads the drawn
    // line and not a chord across a turn.
    const vertex = SHARP_CORNER.vertex;
    for (const end of [SHARP_CORNER.straightFrom, SHARP_CORNER.straightTo]) {
      const onBack = gapToSegment(end, vertex - 1, vertex);
      const onForward = gapToSegment(end, vertex, vertex + 1);
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

  test('takes one segment of the set that is longer than 10,000 light years', () => {
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
    expect(
      gapToSegment(LONG_SEGMENT.point, LONG_SEGMENT.from, LONG_SEGMENT.to),
    ).toBeLessThan(1e-6);
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
