import { beforeAll, describe, expect, test } from 'vitest';
import { project } from '../packages/galaxy-map/src/camera/projection';
import type { Viewport } from '../packages/galaxy-map/src/camera/projection';
import {
  REGION_RANGE_NONE,
  regionBandHalfWidthAtRange,
} from '../packages/galaxy-map/src/render/region-pass';
import {
  farthestPlaneRange,
  labelFade,
  labelSweepRuns,
} from '../packages/galaxy-map/src/app/labels';
import type { View } from '../packages/galaxy-map/src/camera/view';
import {
  buildRegionData,
  chainPoints,
  collapseChain,
  fillRegionGrid,
  packChains,
  traceRegionChains,
} from '../packages/galaxy-map/src/scene-data/region-lines';
import type { RegionLines } from '../packages/galaxy-map/src/scene-data/types';
import {
  NO_LINE_VIEW,
  ONE_CHAIN_POINT,
  SHARP_CORNER,
  TRACED_CORNER,
  TRACED_CROSSING,
} from '../e2e/region-views';
import type { CrossingChoice } from '../e2e/region-views';
import {
  findNoLineView,
  findOneChainPoint,
  findSharpCorner,
  findTracedCorner,
  findVerticalCrossing,
} from './region-views';

let traced: RegionLines;
let lattice: RegionLines;

beforeAll(() => {
  traced = buildRegionData().lines;
  // The lattice polyline, which the packer no longer builds. The corner search reads it
  // to show that it is not tuned to the set this change draws.
  const grid = fillRegionGrid();
  const trace = traceRegionChains(grid);
  lattice = packChains(
    grid,
    trace.chains.map((chain) => collapseChain(chainPoints(chain))),
  );
}, 120000);

/** The galactic centre in game coordinates, as the browser helpers hold it. */
const GALACTIC_CENTRE: readonly [number, number, number] = [15, -35, 25895];

/** How far a reading must sit from the galactic centre, in light years. */
const CENTRE_FLOOR_LY = 5000;

/** The viewport of the one-chain point, which is exempt from every premise. */
const ONE_CHAIN_VIEWPORT: Viewport = { width: 1280, height: 720 };

/** The zoom of the one-chain point, in light years. */
const ONE_CHAIN_ZOOM = 12000;

/** The zooms the fade scenarios open the one-chain point at, in light years. */
const ONE_CHAIN_ZOOMS = [4000, 6500, 8000, 20000, 25000, 31000] as const;

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
 * The premises of the crossing view. The search ran once for each set, because a
 * near-vertical straight run of the smoothed set is not one of the traced set. There is
 * one set now, so it runs once.
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
      const halfWidth = regionBandHalfWidthAtRange(
        choice.viewport.height,
        choice.view.distance,
      );
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

    test('reads at a band half width of 14.4 CSS pixels', () => {
      // 1.6 per cent of 2,160 rows is 34.56, above the clamp of 24, so the base half width
      // is 24. Premise three reads the half width at the reading range: 20,000 light years
      // is 0.6 of the reference range, so the band is 0.6 of its base width there.
      expect(
        regionBandHalfWidthAtRange(choice.viewport.height, choice.view.distance),
      ).toBeCloseTo(14.4, 6);
    });
  });
}

crossingTests('the boundary set', () => traced, TRACED_CROSSING);

describe('the view at a bend of a chain', () => {
  test('is what the search of the boundary set gives', () => {
    expect(
      findSharpCorner(traced, SHARP_CORNER.viewport, SHARP_CORNER.view.distance),
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
    expect(traced.first[SHARP_CORNER.chain] as number).toBeLessThan(vertex);
    expect(traced.last[SHARP_CORNER.chain] as number).toBeGreaterThan(vertex);
    expect(traced.positions[vertex * 3] as number).toBe(SHARP_CORNER.bend[0]);
    expect(traced.positions[vertex * 3 + 2] as number).toBe(SHARP_CORNER.bend[2]);

    // Every point of the bend line is a vertex of that one chain, and they run in the
    // order the chain runs, so the browser test reads the drawn line and not a chord.
    const at = SHARP_CORNER.bendLine.findIndex(
      (point) => point[0] === SHARP_CORNER.bend[0] && point[2] === SHARP_CORNER.bend[2],
    );
    expect(at).toBeGreaterThan(0);
    const start = vertex - at;
    for (let index = 0; index < SHARP_CORNER.bendLine.length; index += 1) {
      const point = SHARP_CORNER.bendLine[index] as [number, number, number];
      expect(traced.positions[(start + index) * 3] as number).toBe(point[0]);
      expect(traced.positions[(start + index) * 3 + 2] as number).toBe(point[2]);
    }
  });

  test('holds a straight run of the same chain inside the frame', () => {
    const perPixel = SHARP_CORNER.lightYearsPerPixel;
    const halfWidth = regionBandHalfWidthAtRange(
      SHARP_CORNER.viewport.height,
      SHARP_CORNER.view.distance,
    );
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
    // The clearance is measured from the edge of the band at the reading range.
    const halfWidth = regionBandHalfWidthAtRange(
      SHARP_CORNER.viewport.height,
      SHARP_CORNER.view.distance,
    );
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

  test('reads at a band half width of 14.4 CSS pixels', () => {
    // 1.6 per cent of 1,800 rows is 28.8, above the clamp of 24, so the base is 24. At the
    // reading range of 20,000 light years the band is 0.6 of that.
    expect(
      regionBandHalfWidthAtRange(
        SHARP_CORNER.viewport.height,
        SHARP_CORNER.view.distance,
      ),
    ).toBeCloseTo(14.4, 6);
  });
});

describe('the point whose window holds one chain', () => {
  test('is what the search of the boundary set gives', () => {
    expect(findOneChainPoint(traced, ONE_CHAIN_VIEWPORT, ONE_CHAIN_ZOOM)).toEqual(
      ONE_CHAIN_POINT,
    );
  });

  test('sits within 25 light years of a chain of the set', () => {
    expect(gapToSet(traced, ONE_CHAIN_POINT.point)).toBeLessThan(25);
  });

  test('holds a line across the frame over the close end of the band', () => {
    // The point sits in the middle of a segment far longer than the frame, so the line
    // leaves it on both sides.
    expect(ONE_CHAIN_POINT.segmentLengthLy).toBeGreaterThan(100);
    // One CSS pixel covers 19.2 light years at 1280x720 and 12,000, and the clearance is
    // measured from the edge of the band, whose half width is 11.52 CSS pixels there,
    // so 20 CSS pixels of clear frame ask for 606 light years. The band keeps that half
    // width, because the width reference range stays at 12,000 light years.
    expect(ONE_CHAIN_POINT.clearanceLy).toBeGreaterThan(
      (regionBandHalfWidthAtRange(ONE_CHAIN_VIEWPORT.height, ONE_CHAIN_ZOOM) + 20) *
        lightYearsPerPixel(ONE_CHAIN_ZOOM, ONE_CHAIN_VIEWPORT),
    );
  });

  test('holds one chain and no other in the reading window at every fade zoom', () => {
    // The fade scenarios read an 8 CSS pixel window around the point at each of the six
    // zooms. One CSS pixel covers the most light years at the widest of them and the band
    // is narrowest there, so the search reads every zoom and keeps the widest window.
    let widest = 0;
    for (const zoom of ONE_CHAIN_ZOOMS) {
      const halfWidth = regionBandHalfWidthAtRange(ONE_CHAIN_VIEWPORT.height, zoom);
      const window = (8 + halfWidth) * lightYearsPerPixel(zoom, ONE_CHAIN_VIEWPORT);
      expect(ONE_CHAIN_POINT.clearanceLy).toBeGreaterThan(window);
      widest = Math.max(widest, window);
    }
    expect(ONE_CHAIN_POINT.windowLy).toBeCloseTo(widest, 9);
  });

  test('sits away from the galactic core', () => {
    expect(radiusOf(ONE_CHAIN_POINT.point)).toBeGreaterThan(CENTRE_FLOOR_LY);
  });
});

describe('the view where no line draws', () => {
  test('is what the search gives', () => {
    expect(findNoLineView(NO_LINE_VIEW.viewport)).toEqual(NO_LINE_VIEW);
  });

  test('holds every plane point of the frame under the range floor', () => {
    expect(NO_LINE_VIEW.rangeFloorLy).toBe(REGION_RANGE_NONE);
    expect(NO_LINE_VIEW.rangeFloorLy).toBe(5000);
    const farthest = farthestPlaneRange(
      NO_LINE_VIEW.view as View,
      NO_LINE_VIEW.viewport,
    );
    expect(farthest).toBeCloseTo(NO_LINE_VIEW.farthestPlaneRangeLy, 6);
    expect(farthest).toBeLessThan(REGION_RANGE_NONE);
    // A tenth of the floor is left clear, so a browser that projects a corner a few light
    // years differently still draws nothing.
    expect(farthest).toBeLessThanOrEqual(REGION_RANGE_NONE * 0.9);
  });

  test('is stopped by the plane range and not by the zoom', () => {
    // The zoom fade admits the label sweep, so the plane-range gate is the only thing
    // that stops it. A view that failed both gates would not read what the scenario reads.
    expect(labelFade(NO_LINE_VIEW.view.distance)).toBeGreaterThan(0);
    expect(labelSweepRuns(NO_LINE_VIEW.view as View, NO_LINE_VIEW.viewport)).toBe(
      false,
    );
  });
});

describe('the view at the sharpest corner of the traced set', () => {
  test('is what the search of the traced set gives', () => {
    expect(
      findTracedCorner(traced, TRACED_CORNER.viewport, TRACED_CORNER.view.distance),
    ).toEqual(TRACED_CORNER);
  });

  test('turns over the read radius by more than the 80 degree floor', () => {
    const vertex = TRACED_CORNER.vertex;
    expect(traced.first[TRACED_CORNER.chain] as number).toBeLessThan(vertex);
    expect(traced.last[TRACED_CORNER.chain] as number).toBeGreaterThan(vertex);
    expect(traced.positions[vertex * 3] as number).toBe(TRACED_CORNER.bend[0]);
    expect(traced.positions[vertex * 3 + 2] as number).toBe(TRACED_CORNER.bend[2]);

    // The reading window reaches the half width and 6 CSS pixels more, and the turn is
    // read over it, by the chord back to that radius and the chord forward to it.
    expect(TRACED_CORNER.reachPixels).toBe(
      regionBandHalfWidthAtRange(
        TRACED_CORNER.viewport.height,
        TRACED_CORNER.view.distance,
      ) + 6,
    );
    const line = TRACED_CORNER.bendLine;
    const bend = TRACED_CORNER.bend;
    const from = line[0] as [number, number, number];
    const to = line[line.length - 1] as [number, number, number];
    const inX = bend[0] - from[0];
    const inZ = bend[2] - from[2];
    const outX = to[0] - bend[0];
    const outZ = to[2] - bend[2];
    const cosine =
      (inX * outX + inZ * outZ) / (Math.hypot(inX, inZ) * Math.hypot(outX, outZ));
    const turn = (Math.acos(cosine) * 180) / Math.PI;
    expect(TRACED_CORNER.turnDegrees).toBeCloseTo(turn, 6);

    // The floor is the one the radius scenario needs: the radius fit sweeps `180 - T`
    // while the band's arc spans `T`, and the error reaches the whole 2.0 CSS pixel bound
    // at a turn of 67.4 degrees.
    expect(TRACED_CORNER.turnDegrees).toBeGreaterThan(80);

    // Both ends of the window sit at least the read radius from the node.
    const perPixel = TRACED_CORNER.lightYearsPerPixel;
    expect(planeGap(bend, from) / perPixel).toBeGreaterThanOrEqual(
      TRACED_CORNER.reachPixels,
    );
    expect(planeGap(bend, to) / perPixel).toBeGreaterThanOrEqual(
      TRACED_CORNER.reachPixels,
    );
  });

  test('names a run of the traced set, in order, that holds the corner', () => {
    // Every point of the reading polyline is a vertex of that one chain, in the order the
    // chain runs, so the browser test reads the drawn line and not a chord of it.
    const at = TRACED_CORNER.bendLine.findIndex(
      (point) =>
        point[0] === TRACED_CORNER.bend[0] && point[2] === TRACED_CORNER.bend[2],
    );
    expect(at).toBeGreaterThan(0);
    const start = TRACED_CORNER.vertex - at;
    for (let index = 0; index < TRACED_CORNER.bendLine.length; index += 1) {
      const point = TRACED_CORNER.bendLine[index] as [number, number, number];
      expect(traced.positions[(start + index) * 3] as number).toBe(point[0]);
      expect(traced.positions[(start + index) * 3 + 2] as number).toBe(point[2]);
    }
  });

  test('holds a straight run of the same chain inside the frame', () => {
    const perPixel = TRACED_CORNER.lightYearsPerPixel;
    const halfWidth = regionBandHalfWidthAtRange(
      TRACED_CORNER.viewport.height,
      TRACED_CORNER.view.distance,
    );
    const run = planeGap(TRACED_CORNER.straightFrom, TRACED_CORNER.straightTo);
    // The run is the longest chord-straight run of the chain inside a window that reaches
    // from the half width and 12 CSS pixels out to 28 CSS pixels further, so it measures 8
    // to 28 CSS pixels. The sharpest node is where a chain is least likely to stay
    // straight over the whole window, so the bound is the 8 the join search asks for.
    expect(run / perPixel).toBeGreaterThanOrEqual(8);

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

  test('carries nothing else inside the clearance disc', () => {
    // The disc is derived: it is the larger of the two reading windows plus the band's
    // half width at the reading range. The radius reading reaches the half width and 12
    // CSS pixels and marches each ray out to it, so a line 40.8 CSS pixels away can still
    // light a pixel it reads.
    const halfWidth = regionBandHalfWidthAtRange(
      TRACED_CORNER.viewport.height,
      TRACED_CORNER.view.distance,
    );
    expect(
      TRACED_CORNER.clearanceLy / TRACED_CORNER.lightYearsPerPixel,
    ).toBeGreaterThanOrEqual(2 * halfWidth + 12);
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

  test('reads at a band half width of 14.4 CSS pixels', () => {
    expect(
      regionBandHalfWidthAtRange(
        TRACED_CORNER.viewport.height,
        TRACED_CORNER.view.distance,
      ),
    ).toBeCloseTo(14.4, 6);
  });

  test('finds a corner of the lattice polyline as well', () => {
    // The search is not tuned to the set this change draws. The lattice polyline is the
    // set it replaces, and the same premises find a corner there too. A turn over a reach
    // is not a turn at a vertex, so a lattice staircase reads past 90 over 320.8 light
    // years.
    const found = findTracedCorner(
      lattice,
      TRACED_CORNER.viewport,
      TRACED_CORNER.view.distance,
    );
    console.log('the corner search over the lattice polyline', {
      turnDegrees: found.turnDegrees,
      heldCount: found.heldCount,
      bend: found.bend,
    });
    expect(found.turnDegrees).toBeGreaterThan(80);
    expect(found.heldCount).toBeGreaterThan(0);
  }, 120000);

  test('reads the nearest point of a segment and excludes the run by geometry', () => {
    // One chain turns a right angle at the origin, and one foreign chain runs past it as
    // a single long segment whose two vertices are 2,000 light years away. A reading of
    // the nearest vertex would call the foreign chain 2,050 light years off; the nearest
    // point of its segment is 450. The clearance disc is 40.8 CSS pixels, which is 436.2
    // light years at this view, so the foreign line sits just outside it.
    const perPixel = lightYearsPerPixel(20000, TRACED_CORNER.viewport);
    const corner: [number, number][] = [
      [-900, 0],
      [-420, 0],
      [-250, 0],
      [-100, 0],
      [0, 0],
      [0, 100],
      [0, 200],
      [0, 390],
      [0, 500],
      [0, 600],
      [0, 680],
      [0, 800],
    ];
    const foreign: [number, number][] = [
      [-2000, -450],
      [2000, -450],
    ];
    const setOf = (first: readonly [number, number][]): RegionLines => {
      const points = [...first, ...foreign];
      const positions = new Float32Array(points.length * 3);
      for (let index = 0; index < points.length; index += 1) {
        const point = points[index] as [number, number];
        positions[index * 3] = point[0];
        positions[index * 3 + 2] = point[1];
      }
      return {
        chainCount: 2,
        vertexCount: points.length,
        positions,
        first: Uint32Array.from([0, first.length]),
        last: Uint32Array.from([first.length - 1, points.length - 1]),
      };
    };

    const found = findTracedCorner(
      setOf(corner),
      TRACED_CORNER.viewport,
      TRACED_CORNER.view.distance,
    );
    expect(found.vertex).toBe(4);
    expect(found.turnDegrees).toBeCloseTo(90, 6);
    expect(found.clearanceLy).toBeCloseTo(450, 6);
    expect(found.clearanceLy / perPixel).toBeGreaterThanOrEqual(40.8);

    // The second vertex sits on the line the first three points draw, and it moves along
    // that line from inside the clearance disc to outside it. The drawn line does not
    // move, so the search reads the same corner, the same run and the same clearance. A
    // rule that excluded a range of vertex indices, or that measured to a vertex, would
    // answer differently.
    const moved = corner.map((point, index) =>
      index === 1 ? ([-460, 0] as [number, number]) : point,
    );
    expect(
      findTracedCorner(
        setOf(moved),
        TRACED_CORNER.viewport,
        TRACED_CORNER.view.distance,
      ),
    ).toEqual(found);
  });
});

describe('the counts the four searches hold', () => {
  // Each count is a reading of the search under the view the spec states. The search
  // itself reports it, so a count that moves fails the equality test above as well.
  test('the width search holds 6 runs', () => {
    expect(TRACED_CROSSING.heldCount).toBe(6);
  });

  test('the join search holds 3 bends', () => {
    expect(SHARP_CORNER.heldCount).toBe(3);
  });

  test('the corner search holds 1,457 nodes', () => {
    expect(TRACED_CORNER.heldCount).toBe(1457);
  });

  test('the one-chain search holds 4,688 points', () => {
    expect(ONE_CHAIN_POINT.heldCount).toBe(4688);
  });
});
