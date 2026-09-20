// The views and the points the boundary line tests read.
//
// Five scenarios of the galactic regions spec need a view or a point chosen from the
// boundary set and not by hand: one where a chain crosses the reading row within 5 degrees
// of vertical, one where the drawn line turns by at least 30 degrees within a reach of 8
// CSS pixels, the sharpest corner of the set, one plane point whose reading window holds
// one chain and no other, and one view where no plane point of the frame is far enough
// away to draw a line.
//
// The crossing search runs once. It ran once for each set, because a near-vertical
// straight run of the smoothed set is not one of the traced set, and there is one set now.
//
// The three governed views sit at a zoom of 20,000 light years, where the zoom fade is
// full and the range fade's slope at the reading point is zero. The one-chain point is
// exempt from every premise, because it is the view the fade scenarios read inside.
// `tests/region-views.test.ts` builds the boundary set, runs the search in
// `tests/region-views.ts`, and fails if these constants are not what it gives.
//
// This file holds no import on purpose. Playwright cannot load the camera module or
// the scene data, because they reach the PNG of the detail grid, which only Vite
// reads.

/** A view as the page hooks take it. */
export interface ChosenView {
  readonly cursor: [number, number, number];
  readonly distance: number;
  readonly yaw: number;
  readonly pitch: number;
}

/** The size of the drawing area the choice holds for, in CSS pixels. */
export interface ChosenViewport {
  readonly width: number;
  readonly height: number;
}

/** A view where one chain crosses the whole frame nearly upright. */
export interface CrossingChoice {
  readonly view: ChosenView;
  readonly viewport: ChosenViewport;
  /** The chain the frame crosses. */
  readonly chain: number;
  /** The first and the last vertex of the straight run the frame sits inside. */
  readonly from: number;
  readonly to: number;
  /** The point at the centre of the frame, on the drawn line. */
  readonly point: [number, number, number];
  /** How far the crossing leans from the vertical, in degrees. */
  readonly angleFromVertical: number;
  /** How far the nearest other part of the boundary is, in light years. */
  readonly clearanceLy: number;
  /** How many light years one CSS pixel covers at the cursor. */
  readonly lightYearsPerPixel: number;
  /** How many runs of this set hold every premise of the search. */
  readonly heldCount: number;
}

/** A view centred on a bend of a chain. */
export interface CornerChoice {
  readonly view: ChosenView;
  readonly viewport: ChosenViewport;
  /** The chain, and the vertex the bend is measured at. */
  readonly chain: number;
  readonly vertex: number;
  /** How far the line turns over the reach, in degrees. 0 is straight. */
  readonly turnDegrees: number;
  /** How far the reach reads on each side of the vertex, in CSS pixels. */
  readonly reachPixels: number;
  /** The bend itself, at the centre of the frame. */
  readonly bend: [number, number, number];
  /**
   * The drawn line inside the reach, as the vertices it runs through, in order. The
   * browser test reads the pixels on these segments, because the corner bound holds
   * every vertex to 20 degrees and a bend is therefore a run and not one vertex.
   */
  readonly bendLine: [number, number, number][];
  /** A straight part of the same chain, past the bend, for the comparison. */
  readonly straightFrom: [number, number, number];
  readonly straightTo: [number, number, number];
  /** How far the nearest other part of the boundary is, in light years. */
  readonly clearanceLy: number;
  /** How many light years one CSS pixel covers at the cursor. */
  readonly lightYearsPerPixel: number;
  /** How many bends or nodes of this set hold every premise of the search. */
  readonly heldCount: number;
}

/** A plane point whose reading window holds one chain and no other. */
export interface OneChainChoice {
  /** The point, in game coordinates, on the plane `y = 0`. */
  readonly point: [number, number, number];
  /** The chain the point sits on. */
  readonly chain: number;
  /** How long the segment the point sits on is, in light years. */
  readonly segmentLengthLy: number;
  /** How far the nearest other chain is, in light years. */
  readonly clearanceLy: number;
  /**
   * How wide the reading window is, in light years. It is the widest of the six zooms the
   * fade scenarios open, because the band narrows as the zoom grows.
   */
  readonly windowLy: number;
  /** How many points hold every premise of the search. */
  readonly heldCount: number;
}

/** A view where no plane point of the frame is far enough away to draw a line. */
export interface NoLineChoice {
  readonly view: ChosenView;
  readonly viewport: ChosenViewport;
  /** How far the camera sits above the galactic plane, in light years. */
  readonly cameraHeightLy: number;
  /** How far the farthest plane point of the frame sits from the camera. */
  readonly farthestPlaneRangeLy: number;
  /** The range at which a line draws nothing, in light years. */
  readonly rangeFloorLy: number;
}

/**
 * The view the width reading takes. The search ran once for each boundary set and now runs
 * once, because there is one set.
 */
export const TRACED_CROSSING: CrossingChoice = {
  view: {
    cursor: [449.9320068359375, 0, -21390.630859375],
    distance: 20000,
    yaw: 89.95,
    pitch: 89,
  },
  viewport: {
    width: 3840,
    height: 2160,
  },
  chain: 2,
  from: 146,
  to: 148,
  point: [449.9320068359375, 0, -21390.630859375],
  angleFromVertical: 0.021477466577023457,
  clearanceLy: 2040.4387309777935,
  lightYearsPerPixel: 10.691671651659735,
  heldCount: 6,
};

/** The view the join reading takes. */
export const SHARP_CORNER: CornerChoice = {
  view: {
    cursor: [28628.97265625, 0, 3526.336669921875],
    distance: 20000,
    yaw: 0,
    pitch: 89,
  },
  viewport: {
    width: 3200,
    height: 1800,
  },
  chain: 21,
  vertex: 1173,
  turnDegrees: 75.24457846215614,
  reachPixels: 8,
  bend: [28628.97265625, 0, 3526.336669921875],
  bendLine: [
    [28573.19921875, 0, 3404.10986328125],
    [28604.15234375, 0, 3453.22705078125],
    [28653.3828125, 0, 3503.586669921875],
    [28628.97265625, 0, 3526.336669921875],
    [28588.81640625, 0, 3542.963623046875],
    [28554.3671875, 0, 3586.608154296875],
    [28314.216796875, 0, 3783.806884765625],
  ],
  straightFrom: [28314.216796875, 0, 3783.806884765625],
  straightTo: [28104.025390625, 0, 3968.41015625],
  clearanceLy: 4264.044447108186,
  lightYearsPerPixel: 12.830005981991684,
  heldCount: 3,
};

/**
 * The view the corner reading takes. It is the sharpest node the search holds, and its
 * turn is read over the read radius and not between two segments.
 */
export const TRACED_CORNER: CornerChoice = {
  view: {
    cursor: [-7855.072265625, 0, 27953.935546875],
    distance: 20000,
    yaw: 0,
    pitch: 89,
  },
  viewport: {
    width: 3840,
    height: 2160,
  },
  chain: 65,
  vertex: 3170,
  turnDegrees: 86.69133539740145,
  reachPixels: 20.4,
  bend: [-7855.072265625, 0, 27953.935546875],
  bendLine: [
    [-8341.3359375, 0, 27976.0625],
    [-8034.50634765625, 0, 27947.19140625],
    [-7958.68505859375, 0, 27949.22265625],
    [-7922.5087890625, 0, 27932.650390625],
    [-7878.32177734375, 0, 27930.216796875],
    [-7855.072265625, 0, 27953.935546875],
    [-7855.2353515625, 0, 28051.939453125],
    [-7844.73193359375, 0, 28088.404296875],
    [-7823.1669921875, 0, 28261.9375],
  ],
  straightFrom: [-7823.1669921875, 0, 28261.9375],
  straightTo: [-7783.45556640625, 0, 28468.974609375],
  clearanceLy: 486.7668442282749,
  lightYearsPerPixel: 10.691671651659735,
  heldCount: 1457,
};

/**
 * The plane point the close end reading takes. Its 8 CSS pixel window holds one chain and
 * no other at every one of the six zooms the fade scenarios open, so the reading follows
 * one band.
 */
export const ONE_CHAIN_POINT: OneChainChoice = {
  point: [449.9320068359375, 0, -21390.630859375],
  chain: 2,
  segmentLengthLy: 3602.201428901422,
  clearanceLy: 3633.759612205606,
  windowLy: 619.4326888105584,
  heldCount: 4688,
};

/**
 * The view the scenario "No label where no line draws" opens. Every plane point of the
 * frame sits under the range floor, so the overlay draws nothing and the label sweep is
 * skipped although the zoom fade admits it.
 */
export const NO_LINE_VIEW: NoLineChoice = {
  view: {
    cursor: [1840.85884, -15473.645227067129, 16507.94703],
    distance: 20016.72348,
    yaw: 24.66002,
    pitch: 58.57998,
  },
  viewport: {
    width: 1280,
    height: 720,
  },
  cameraHeightLy: 1608,
  farthestPlaneRangeLy: 4497.280302656094,
  rangeFloorLy: 5000,
};
