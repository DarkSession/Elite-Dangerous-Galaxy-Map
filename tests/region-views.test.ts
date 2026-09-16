import { beforeAll, describe, expect, test } from 'vitest';
import { project } from '../src/camera/projection';
import type { Viewport } from '../src/camera/projection';
import { regionBandHalfWidthCss } from '../src/render/region-pass';
import type { View } from '../src/camera/view';
import { buildRegionData } from '../src/scene-data/region-lines';
import type { RegionLines } from '../src/scene-data/types';
import {
  NEAR_BOTH_SETS,
  SHARP_CORNER,
  SMOOTHED_CROSSING,
  TRACED_CORNER,
  TRACED_CROSSING,
} from '../e2e/region-views';
import type { CrossingChoice } from '../e2e/region-views';
import {
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

/** The galactic centre in game coordinates, as the browser helpers hold it. */
const GALACTIC_CENTRE: readonly [number, number, number] = [15, -35, 25895];

/** How far a reading must sit from the galactic centre, in light years. */
const CENTRE_FLOOR_LY = 5000;

/** The viewport of the both-sets point, which is exempt from the two premises. */
const BOTH_SETS_VIEWPORT: Viewport = { width: 1280, height: 720 };

/** The zoom of the both-sets point, in light years. */
const BOTH_SETS_ZOOM = 12000;

/** The zooms the fade scenarios open the both-sets point at, in light years. */
const BOTH_SETS_ZOOMS = [9000, 15000, 20000, 25000, 31000] as const;

/** How many light years one CSS pixel covers at the cursor. */
function lightYearsPerPixel(distance: number, viewport: Viewport): number {
  return (2 * distance * Math.tan(Math.PI / 6)) / viewport.height;
}

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

function planeGap(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): number {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}

/** How far a plane point sits from the galactic centre, in light years. */
function radiusOf(point: readonly [number, number, number]): number {
  return Math.hypot(point[0] - GALACTIC_CENTRE[0], point[2] - GALACTIC_CENTRE[2]);
}

/**
 * The premises of one crossing view. The search runs once for each set, because a
 * near-vertical straight run of the smoothed set is not one of the traced staircase.
 */
function crossingTests(
  name: string,
  setOf: () => RegionLines,
  choice: CrossingChoice,
): void {
  describe(`the view where a chain of ${name} crosses the reading row`, () => {
    test('is what the search of the boundary set gives', () => {
      expect(
        findVerticalCrossing(setOf(), choice.viewport, choice.view.distance),
      ).toEqual(choice);
    });

    test('crosses within 5 degrees of vertical', () => {
      const set = setOf();
      const view = choice.view as View;
      const from = project(
        view,
        [
          set.positions[choice.from * 3] as number,
          0,
          set.positions[choice.from * 3 + 2] as number,
        ],
        choice.viewport,
      );
      const to = project(
        view,
        [
          set.positions[choice.to * 3] as number,
          0,
          set.positions[choice.to * 3 + 2] as number,
        ],
        choice.viewport,
      );
      const lean =
        (Math.atan2(Math.abs(to.x - from.x), Math.abs(to.y - from.y)) * 180) / Math.PI;
      expect(lean).toBeLessThan(5);
      expect(choice.angleFromVertical).toBeCloseTo(lean, 6);

      // The run reaches 100 CSS pixels above and below the reading row, which is the
      // middle of the frame, so the row cuts the drawn line square.
      const row = choice.viewport.height / 2;
      expect(Math.min(from.y, to.y)).toBeLessThanOrEqual(row - 100);
      expect(Math.max(from.y, to.y)).toBeGreaterThanOrEqual(row + 100);
    });

    test('sits on the drawn line at the centre of the frame', () => {
      const centre = project(choice.view as View, choice.point, choice.viewport);
      expect(centre.x).toBeCloseTo(choice.viewport.width / 2, 4);
      expect(centre.y).toBeCloseTo(choice.viewport.height / 2, 4);
    });

    test('carries no other part of the boundary near the reading', () => {
      // The reading takes a row of a few tens of pixels. The nearest other part of the
      // boundary is far outside it. The clearance is measured from the edge of the band,
      // so it holds the half width and 60 CSS pixels more.
      const pixels = choice.clearanceLy / choice.lightYearsPerPixel;
      const halfWidth = regionBandHalfWidthCss(choice.viewport.height);
      expect(pixels).toBeGreaterThan(halfWidth + 60);
    });

    test('sits away from the galactic core', () => {
      // The band lightens what it crosses, which it cannot do over the core itself.
      expect(radiusOf(choice.point)).toBeGreaterThan(CENTRE_FLOOR_LY);
    });

    test('reads at 20,000 light years, where one CSS pixel covers 10.69', () => {
      // Premise one puts the reading point at a range of at least 20,000 light years,
      // and the search puts the cursor on it. Premise two holds the zoom at 20,000,
      // where the zoom fade is full. The rows follow the zoom, so one CSS pixel covers
      // the light years it covered at 1,080 rows and 10,000.
      expect(choice.view.distance).toBe(20000);
      expect(choice.viewport).toEqual({ width: 3840, height: 2160 });
      expect(choice.lightYearsPerPixel).toBeCloseTo(10.69, 2);
      expect(lightYearsPerPixel(choice.view.distance, choice.viewport)).toBeCloseTo(
        choice.lightYearsPerPixel,
        10,
      );
    });

    test('reads at a band half width of 24 CSS pixels', () => {
      // 1.6 per cent of 2,160 rows is 34.56, above the clamp of 24. The pass no longer
      // blurs, so the half width is the whole of the band's own rule.
      expect(regionBandHalfWidthCss(choice.viewport.height)).toBeCloseTo(24, 6);
    });
  });
}

crossingTests('the smoothed set', () => lines, SMOOTHED_CROSSING);
crossingTests('the traced set', () => traced, TRACED_CROSSING);

describe('the view at a bend of a chain', () => {
  test('is what the search of the boundary set gives', () => {
    expect(
      findSharpCorner(lines, SHARP_CORNER.viewport, SHARP_CORNER.view.distance),
    ).toEqual(SHARP_CORNER);
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
    expect(SHARP_CORNER.reachPixels).toBe(8);
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
    const halfWidth = regionBandHalfWidthCss(SHARP_CORNER.viewport.height);
    const run = planeGap(SHARP_CORNER.straightFrom, SHARP_CORNER.straightTo);
    // The run starts 16 CSS pixels past the edge of the band and spans 24 more, so it
    // measures 8 to 24 CSS pixels.
    expect(run / perPixel).toBeGreaterThanOrEqual(8);

    // The run sits outside the reading window and inside the frame. The reading window
    // reaches the half width and 12 CSS pixels more.
    for (const end of [SHARP_CORNER.straightFrom, SHARP_CORNER.straightTo]) {
      expect(planeGap(SHARP_CORNER.bend, end) / perPixel).toBeGreaterThanOrEqual(
        halfWidth + 16,
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
    // The clearance is measured from the edge of the band.
    const halfWidth = regionBandHalfWidthCss(SHARP_CORNER.viewport.height);
    expect(SHARP_CORNER.clearanceLy / SHARP_CORNER.lightYearsPerPixel).toBeGreaterThan(
      halfWidth + 20,
    );
  });

  test('reads at 20,000 light years, where one CSS pixel covers 12.83', () => {
    expect(SHARP_CORNER.view.distance).toBe(20000);
    expect(SHARP_CORNER.viewport).toEqual({ width: 3200, height: 1800 });
    expect(SHARP_CORNER.lightYearsPerPixel).toBeCloseTo(12.83, 2);
    expect(
      lightYearsPerPixel(SHARP_CORNER.view.distance, SHARP_CORNER.viewport),
    ).toBeCloseTo(SHARP_CORNER.lightYearsPerPixel, 10);
  });

  test('reads at a band half width of 24 CSS pixels', () => {
    // 1.6 per cent of 1,800 rows is 28.8, above the clamp of 24.
    expect(regionBandHalfWidthCss(SHARP_CORNER.viewport.height)).toBeCloseTo(24, 6);
  });
});

describe('the point on a chain of both sets', () => {
  test('is what the search of the two boundary sets gives', () => {
    expect(
      findPointNearBothSets(lines, traced, BOTH_SETS_VIEWPORT, BOTH_SETS_ZOOM),
    ).toEqual(NEAR_BOTH_SETS);
  });

  test('sits within 25 light years of a chain of each set', () => {
    expect(gapToSet(lines, NEAR_BOTH_SETS.point)).toBeLessThan(25);
    expect(gapToSet(traced, NEAR_BOTH_SETS.point)).toBeLessThan(25);
  });

  test('holds a line across the frame over the close end of the band', () => {
    // The point sits in the middle of a traced segment far longer than the frame, so the
    // line leaves it on both sides.
    expect(NEAR_BOTH_SETS.segmentLengthLy).toBeGreaterThan(100);
    // One CSS pixel covers 19.2 light years at 1280x720 and 12,000, and the clearance is
    // measured from the edge of the band, whose half width is 11.52 CSS pixels at 720
    // rows, so 20 CSS pixels of clear frame ask for 606 light years.
    expect(NEAR_BOTH_SETS.clearanceLy).toBeGreaterThan(
      (regionBandHalfWidthCss(BOTH_SETS_VIEWPORT.height) + 20) *
        lightYearsPerPixel(BOTH_SETS_ZOOM, BOTH_SETS_VIEWPORT),
    );
  });

  test('holds one chain and no other in the reading window at every fade zoom', () => {
    // The fade scenarios read an 8 CSS pixel window around the point at each of the five
    // zooms. One CSS pixel covers the most light years at the widest of them, so the
    // rule binds there and holds at the other four.
    for (const zoom of BOTH_SETS_ZOOMS) {
      const halfWidth = regionBandHalfWidthCss(BOTH_SETS_VIEWPORT.height);
      const window = (8 + halfWidth) * lightYearsPerPixel(zoom, BOTH_SETS_VIEWPORT);
      expect(NEAR_BOTH_SETS.clearanceLy).toBeGreaterThan(window);
    }
  });

  test('sits away from the galactic core', () => {
    expect(radiusOf(NEAR_BOTH_SETS.point)).toBeGreaterThan(CENTRE_FLOOR_LY);
  });
});

describe('the view at a 90 degree corner of the traced set', () => {
  test('is what the search of the traced set gives', () => {
    expect(
      findTracedCorner(traced, TRACED_CORNER.viewport, TRACED_CORNER.view.distance),
    ).toEqual(TRACED_CORNER);
  });

  test('turns by 90 degrees at a vertex of the traced set', () => {
    const vertex = TRACED_CORNER.vertex;
    expect(traced.first[TRACED_CORNER.chain] as number).toBeLessThan(vertex);
    expect(traced.last[TRACED_CORNER.chain] as number).toBeGreaterThan(vertex);
    expect(traced.positions[vertex * 3] as number).toBe(TRACED_CORNER.bend[0]);
    expect(traced.positions[vertex * 3 + 2] as number).toBe(TRACED_CORNER.bend[2]);
    expect(TRACED_CORNER.turnDegrees).toBe(90);
    // The reading window reaches the half width and 6 CSS pixels more.
    expect(TRACED_CORNER.reachPixels).toBe(
      regionBandHalfWidthCss(TRACED_CORNER.viewport.height) + 6,
    );
  });

  test('puts each arm at more than 72 CSS pixels', () => {
    // The comparison run reaches the half width and 40 CSS pixels more from the node,
    // which is 64 here, so a shorter arm would put its far end past the next node and off
    // the straight line. The arm holds 8 CSS pixels more than the run.
    const perPixel = TRACED_CORNER.lightYearsPerPixel;
    const vertex = TRACED_CORNER.vertex;
    const armOf = (step: number): number => {
      const other = vertex + step;
      return Math.hypot(
        (traced.positions[other * 3] as number) - TRACED_CORNER.bend[0],
        (traced.positions[other * 3 + 2] as number) - TRACED_CORNER.bend[2],
      );
    };
    expect(armOf(-1) / perPixel).toBeGreaterThan(72);
    expect(armOf(1) / perPixel).toBeGreaterThan(72);
  });

  test('holds a straight run of the same chain inside the frame', () => {
    const perPixel = TRACED_CORNER.lightYearsPerPixel;
    const halfWidth = regionBandHalfWidthCss(TRACED_CORNER.viewport.height);
    const run = planeGap(TRACED_CORNER.straightFrom, TRACED_CORNER.straightTo);
    // The run starts 12 CSS pixels past the edge of the band and spans 28 more, less a
    // float remainder of about 4e-15, because the two ends are built from the same
    // reading of a pixel.
    expect(run / perPixel).toBeGreaterThanOrEqual(28 - 1e-9);

    // The run sits outside the window the reading reads, which reaches the half width and
    // 6 CSS pixels more.
    for (const end of [TRACED_CORNER.straightFrom, TRACED_CORNER.straightTo]) {
      expect(planeGap(TRACED_CORNER.bend, end) / perPixel).toBeGreaterThanOrEqual(
        halfWidth + 12,
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
    // The clearance is measured from the edge of the band.
    const halfWidth = regionBandHalfWidthCss(TRACED_CORNER.viewport.height);
    expect(
      TRACED_CORNER.clearanceLy / TRACED_CORNER.lightYearsPerPixel,
    ).toBeGreaterThan(halfWidth + 20);
  });

  test('sits away from the galactic core', () => {
    expect(radiusOf(TRACED_CORNER.bend)).toBeGreaterThan(CENTRE_FLOOR_LY);
  });

  test('reads at 20,000 light years, where one CSS pixel covers 10.69', () => {
    expect(TRACED_CORNER.view.distance).toBe(20000);
    expect(TRACED_CORNER.viewport).toEqual({ width: 3840, height: 2160 });
    expect(TRACED_CORNER.lightYearsPerPixel).toBeCloseTo(10.69, 2);
    expect(
      lightYearsPerPixel(TRACED_CORNER.view.distance, TRACED_CORNER.viewport),
    ).toBeCloseTo(TRACED_CORNER.lightYearsPerPixel, 10);
  });

  test('reads at a band half width of 24 CSS pixels', () => {
    expect(regionBandHalfWidthCss(TRACED_CORNER.viewport.height)).toBeCloseTo(24, 6);
  });
});

describe('the counts the four searches hold', () => {
  // Each count is a reading of the search under the view the spec states. The search
  // itself reports it, so a count that moves fails the equality test above as well.
  test('the width search holds 23 runs of the smoothed set and 2 of the traced', () => {
    expect(SMOOTHED_CROSSING.heldCount).toBe(23);
    expect(TRACED_CROSSING.heldCount).toBe(2);
  });

  test('the join search holds 81 bends', () => {
    expect(SHARP_CORNER.heldCount).toBe(81);
  });

  test('the traced corner search holds 6 nodes', () => {
    expect(TRACED_CORNER.heldCount).toBe(6);
  });

  test('the both-sets search holds 4,098 points', () => {
    expect(NEAR_BOTH_SETS.heldCount).toBe(4098);
  });
});
