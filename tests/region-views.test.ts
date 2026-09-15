import { beforeAll, describe, expect, test } from 'vitest';
import { project } from '../src/camera/projection';
import type { View } from '../src/camera/view';
import { buildRegionData } from '../src/scene-data/region-lines';
import type { RegionLines } from '../src/scene-data/types';
import { regionNearFade } from '../src/render/region-pass';
import {
  FADING_RUN,
  NEAR_BOTH_SETS,
  SHARP_CORNER,
  TRACED_CORNER,
  VERTICAL_CROSSING,
} from '../e2e/region-views';
import {
  findFadingRun,
  findPointNearBothSets,
  findSharpCorner,
  findTracedCorner,
  findVerticalCrossing,
} from './region-views';

let lines: RegionLines;
let traced: RegionLines;

beforeAll(() => {
  const data = buildRegionData();
  lines = data.lines;
  traced = data.traced;
}, 120000);

/** The shortest distance from a plane point to any segment of a boundary set. */
function gapToSet(set: RegionLines, point: readonly [number, number, number]): number {
  let nearest = Number.POSITIVE_INFINITY;
  for (let chain = 0; chain < set.chainCount; chain += 1) {
    const first = set.first[chain] as number;
    const last = set.last[chain] as number;
    for (let vertex = first; vertex < last; vertex += 1) {
      const ax = set.positions[vertex * 3] as number;
      const az = set.positions[vertex * 3 + 2] as number;
      const bx = set.positions[(vertex + 1) * 3] as number;
      const bz = set.positions[(vertex + 1) * 3 + 2] as number;
      const dx = bx - ax;
      const dz = bz - az;
      const span = dx * dx + dz * dz;
      let part = span === 0 ? 0 : ((point[0] - ax) * dx + (point[2] - az) * dz) / span;
      if (part < 0) part = 0;
      if (part > 1) part = 1;
      const away = Math.hypot(point[0] - (ax + part * dx), point[2] - (az + part * dz));
      if (away < nearest) nearest = away;
    }
  }
  return nearest;
}

/** How many CSS pixels the join reading takes around the bend. */
const JOIN_RADIUS_PIXELS = 8;

function planeGap(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): number {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
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
      [
        lines.positions[VERTICAL_CROSSING.from * 3] as number,
        0,
        lines.positions[VERTICAL_CROSSING.from * 3 + 2] as number,
      ],
      VERTICAL_CROSSING.viewport,
    );
    const to = project(
      view,
      [
        lines.positions[VERTICAL_CROSSING.to * 3] as number,
        0,
        lines.positions[VERTICAL_CROSSING.to * 3 + 2] as number,
      ],
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

  test('sits on the drawn line at the centre of the frame', () => {
    const centre = project(
      VERTICAL_CROSSING.view as View,
      VERTICAL_CROSSING.point,
      VERTICAL_CROSSING.viewport,
    );
    expect(centre.x).toBeCloseTo(VERTICAL_CROSSING.viewport.width / 2, 4);
    expect(centre.y).toBeCloseTo(VERTICAL_CROSSING.viewport.height / 2, 4);
  });

  test('carries no other part of the boundary near the reading', () => {
    // The reading takes a row of a few tens of pixels. The nearest other part of the
    // boundary is far outside it.
    const pixels = VERTICAL_CROSSING.clearanceLy / VERTICAL_CROSSING.lightYearsPerPixel;
    expect(pixels).toBeGreaterThan(60);
  });
});

describe('the view at a bend of a chain', () => {
  test('is what the search of the boundary set gives', () => {
    expect(findSharpCorner(lines, SHARP_CORNER.viewport)).toEqual(SHARP_CORNER);
  });

  test('turns at least 30 degrees within the reading reach', () => {
    const line = SHARP_CORNER.bendLine;
    const bend = SHARP_CORNER.bend;
    const from = line[0] as [number, number, number];
    const to = line[line.length - 1] as [number, number, number];
    const inX = bend[0] - from[0];
    const inZ = bend[2] - from[2];
    const outX = to[0] - bend[0];
    const outZ = to[2] - bend[2];
    const cosine =
      (inX * outX + inZ * outZ) / (Math.hypot(inX, inZ) * Math.hypot(outX, outZ));
    const turn = (Math.acos(cosine) * 180) / Math.PI;
    expect(turn).toBeGreaterThanOrEqual(30);
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

  test('names a run of the boundary set, in order, that holds the bend', () => {
    const vertex = SHARP_CORNER.vertex;
    expect(lines.first[SHARP_CORNER.chain] as number).toBeLessThan(vertex);
    expect(lines.last[SHARP_CORNER.chain] as number).toBeGreaterThan(vertex);
    expect(lines.positions[vertex * 3] as number).toBe(SHARP_CORNER.bend[0]);
    expect(lines.positions[vertex * 3 + 2] as number).toBe(SHARP_CORNER.bend[2]);

    // Every point of the bend line is a vertex of that one chain, and they run in the
    // order the chain runs, so the browser test reads the drawn line and not a chord.
    const at = SHARP_CORNER.bendLine.findIndex(
      (point) => point[0] === SHARP_CORNER.bend[0] && point[2] === SHARP_CORNER.bend[2],
    );
    expect(at).toBeGreaterThan(0);
    const start = vertex - at;
    for (let index = 0; index < SHARP_CORNER.bendLine.length; index += 1) {
      const point = SHARP_CORNER.bendLine[index] as [number, number, number];
      expect(lines.positions[(start + index) * 3] as number).toBe(point[0]);
      expect(lines.positions[(start + index) * 3 + 2] as number).toBe(point[2]);
    }
  });

  test('holds a straight run of the same chain inside the frame', () => {
    const perPixel = SHARP_CORNER.lightYearsPerPixel;
    const run = planeGap(SHARP_CORNER.straightFrom, SHARP_CORNER.straightTo);
    expect(run / perPixel).toBeGreaterThan(30);

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

  test('carries no other chain near the reading', () => {
    expect(SHARP_CORNER.clearanceLy / SHARP_CORNER.lightYearsPerPixel).toBeGreaterThan(
      JOIN_RADIUS_PIXELS * 4,
    );
  });
});

describe('the point on a chain of both sets', () => {
  test('is what the search of the two boundary sets gives', () => {
    expect(findPointNearBothSets(lines, traced)).toEqual(NEAR_BOTH_SETS);
  });

  test('sits within 25 light years of a chain of each set', () => {
    expect(gapToSet(lines, NEAR_BOTH_SETS.point)).toBeLessThan(25);
    expect(gapToSet(traced, NEAR_BOTH_SETS.point)).toBeLessThan(25);
  });

  test('holds a line across the frame at the closest zoom', () => {
    // The frame at a zoom of 10 light years covers about 12 light years across the
    // cursor. The point sits in the middle of a traced segment far longer than that,
    // so the line leaves the frame on both sides.
    expect(NEAR_BOTH_SETS.segmentLengthLy).toBeGreaterThan(100);
    expect(NEAR_BOTH_SETS.clearanceLy).toBeGreaterThan(200);
  });
});

describe('the view at a 90 degree corner of the traced set', () => {
  test('is what the search of the traced set gives', () => {
    expect(findTracedCorner(traced, TRACED_CORNER.viewport)).toEqual(TRACED_CORNER);
  });

  test('turns by 90 degrees at a vertex of the traced set', () => {
    const vertex = TRACED_CORNER.vertex;
    expect(traced.first[TRACED_CORNER.chain] as number).toBeLessThan(vertex);
    expect(traced.last[TRACED_CORNER.chain] as number).toBeGreaterThan(vertex);
    expect(traced.positions[vertex * 3] as number).toBe(TRACED_CORNER.bend[0]);
    expect(traced.positions[vertex * 3 + 2] as number).toBe(TRACED_CORNER.bend[2]);
    expect(TRACED_CORNER.turnDegrees).toBe(90);
  });

  test('puts each arm at more than 20 CSS pixels', () => {
    const perPixel = TRACED_CORNER.lightYearsPerPixel;
    const vertex = TRACED_CORNER.vertex;
    const armOf = (step: number): number => {
      const other = vertex + step;
      return Math.hypot(
        (traced.positions[other * 3] as number) - TRACED_CORNER.bend[0],
        (traced.positions[other * 3 + 2] as number) - TRACED_CORNER.bend[2],
      );
    };
    expect(armOf(-1) / perPixel).toBeGreaterThan(20);
    expect(armOf(1) / perPixel).toBeGreaterThan(20);
  });

  test('holds a straight run of the same chain inside the frame', () => {
    const perPixel = TRACED_CORNER.lightYearsPerPixel;
    const run = planeGap(TRACED_CORNER.straightFrom, TRACED_CORNER.straightTo);
    expect(run / perPixel).toBeGreaterThan(30);

    for (const end of [TRACED_CORNER.straightFrom, TRACED_CORNER.straightTo]) {
      expect(planeGap(TRACED_CORNER.bend, end) / perPixel).toBeGreaterThan(
        JOIN_RADIUS_PIXELS * 2,
      );
      const screen = project(TRACED_CORNER.view as View, end, TRACED_CORNER.viewport);
      expect(screen.inFront).toBe(true);
      expect(screen.x).toBeGreaterThan(20);
      expect(screen.x).toBeLessThan(TRACED_CORNER.viewport.width - 20);
      expect(screen.y).toBeGreaterThan(20);
      expect(screen.y).toBeLessThan(TRACED_CORNER.viewport.height - 20);
    }
  });

  test('carries no other chain near the reading', () => {
    expect(
      TRACED_CORNER.clearanceLy / TRACED_CORNER.lightYearsPerPixel,
    ).toBeGreaterThan(JOIN_RADIUS_PIXELS * 4);
  });
});

describe('the view where one line fades along its own length', () => {
  test('is what the search of the boundary set gives', () => {
    expect(findFadingRun(lines, FADING_RUN.viewport)).toEqual(FADING_RUN);
  });

  test('puts the cursor on the drawn line at the centre of the frame', () => {
    const vertex = FADING_RUN.cursorVertex;
    expect(lines.positions[vertex * 3] as number).toBe(FADING_RUN.cursor[0]);
    expect(lines.positions[vertex * 3 + 2] as number).toBe(FADING_RUN.cursor[2]);
    const centre = project(
      FADING_RUN.view as View,
      FADING_RUN.cursor,
      FADING_RUN.viewport,
    );
    expect(centre.x).toBeCloseTo(FADING_RUN.viewport.width / 2, 4);
    expect(centre.y).toBeCloseTo(FADING_RUN.viewport.height / 2, 4);
  });

  test('puts the lower reading on the same chain in the lower tenth', () => {
    expect(FADING_RUN.lowerFrom).toBeGreaterThanOrEqual(
      lines.first[FADING_RUN.chain] as number,
    );
    expect(FADING_RUN.lowerTo).toBeGreaterThanOrEqual(
      lines.first[FADING_RUN.chain] as number,
    );
    // The reading sits on the segment between the two vertices the choice names.
    const from: [number, number, number] = [
      lines.positions[FADING_RUN.lowerFrom * 3] as number,
      0,
      lines.positions[FADING_RUN.lowerFrom * 3 + 2] as number,
    ];
    const to: [number, number, number] = [
      lines.positions[FADING_RUN.lowerTo * 3] as number,
      0,
      lines.positions[FADING_RUN.lowerTo * 3 + 2] as number,
    ];
    const span = planeGap(from, to);
    expect(
      planeGap(from, FADING_RUN.lower) + planeGap(FADING_RUN.lower, to),
    ).toBeCloseTo(span, 3);

    const screen = project(
      FADING_RUN.view as View,
      FADING_RUN.lower,
      FADING_RUN.viewport,
    );
    expect(screen.inFront).toBe(true);
    expect(screen.y).toBeGreaterThan(0.9 * FADING_RUN.viewport.height);
    expect(screen.y).toBeLessThanOrEqual(FADING_RUN.viewport.height);
    expect(screen.x).toBeGreaterThan(0);
    expect(screen.x).toBeLessThan(FADING_RUN.viewport.width);
  });

  test('draws the line in full at the cursor and an eighth of it at the edge', () => {
    expect(FADING_RUN.cursorFade).toBe(regionNearFade(FADING_RUN.cursorRangeLy));
    expect(FADING_RUN.lowerFade).toBe(regionNearFade(FADING_RUN.lowerRangeLy));
    expect(FADING_RUN.cursorFade).toBe(1);
    expect(FADING_RUN.lowerFade).toBeGreaterThan(0);
    // The browser scenario holds the lower reading to under a third of the cursor one.
    expect(FADING_RUN.lowerFade).toBeLessThan(FADING_RUN.cursorFade / 3);
  });

  test('carries no other chain near either reading', () => {
    expect(FADING_RUN.clearancePixels).toBeGreaterThan(24);
  });
});
