// The views and the points the boundary line tests read.
//
// Five scenarios of the galactic regions spec need a view or a point chosen from the
// boundary sets and not by hand: one where a chain of the smoothed set crosses the
// reading row within 5 degrees of vertical, one where a chain of the traced set does the
// same, one where the drawn line turns by at least 30 degrees within a reach of 8 CSS
// pixels, one lattice node where the traced line turns by 90 degrees, and one plane point
// that sits on a chain of both sets.
//
// The crossing search runs once for each set, because a near-vertical straight run of the
// smoothed set is not one of the traced staircase, and the width scenario reads each mode
// over its own view.
//
// The three governed views sit at a zoom of 20,000 light years, where the zoom fade is
// full and the range fade's slope at the reading point is zero. The both-sets point is
// exempt from both premises, because it is the view the fade scenarios read inside.
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

/** A plane point that sits on a chain of both boundary sets. */
export interface BothSetsChoice {
  /** The point, in game coordinates, on the plane `y = 0`. */
  readonly point: [number, number, number];
  /** The chain of each set the point sits on. The two sets share a chain order. */
  readonly chain: number;
  /** How long the traced segment the point sits on is, in light years. */
  readonly segmentLengthLy: number;
  /** How far the point sits from the smoothed set, in light years. */
  readonly smoothedGapLy: number;
  /** How far the point sits from the traced set, in light years. It sits on it. */
  readonly tracedGapLy: number;
  /** How far the nearest other chain is, in light years. */
  readonly clearanceLy: number;
  /** How many points hold every premise of the search. */
  readonly heldCount: number;
}

/** The view the width reading of the smoothed set takes. */
export const SMOOTHED_CROSSING: CrossingChoice = {
  view: {
    cursor: [425.40960693359375, 0, -21390.783203125],
    distance: 20000,
    yaw: 90,
    pitch: 89,
  },
  viewport: { width: 3840, height: 2160 },
  chain: 2,
  from: 1503,
  to: 1505,
  point: [425.40960693359375, 0, -21390.783203125],
  angleFromVertical: 0.0001811384906898909,
  clearanceLy: 1860.6261597048726,
  lightYearsPerPixel: 10.691671651659735,
  heldCount: 23,
};

/** The view the width reading of the traced set takes. */
export const TRACED_CROSSING: CrossingChoice = {
  view: {
    cursor: [400.7349548339844, 0, 10266.85546875],
    distance: 20000,
    yaw: 0,
    pitch: 89,
  },
  viewport: { width: 3840, height: 2160 },
  chain: 38,
  from: 8227,
  to: 8228,
  point: [400.7349548339844, 0, 10266.85546875],
  angleFromVertical: 0,
  clearanceLy: 1653.205078125,
  lightYearsPerPixel: 10.691671651659735,
  heldCount: 2,
};

/** The view the join reading takes. */
export const SHARP_CORNER: CornerChoice = {
  view: {
    cursor: [-4746.80419921875, 0, 20442.744140625],
    distance: 20000,
    yaw: 0,
    pitch: 89,
  },
  viewport: {
    width: 3200,
    height: 1800,
  },
  chain: 61,
  vertex: 34588,
  turnDegrees: 71.35250688855459,
  reachPixels: 8,
  bend: [-4746.80419921875, 0, 20442.744140625],
  bendLine: [
    [-4684.6650390625, 0, 20357.171875],
    [-4687.24169921875, 0, 20359.8515625],
    [-4689.8046875, 0, 20362.615234375],
    [-4692.353515625, 0, 20365.4609375],
    [-4694.88916015625, 0, 20368.388671875],
    [-4697.41015625, 0, 20371.400390625],
    [-4699.91796875, 0, 20374.49609375],
    [-4702.41162109375, 0, 20377.671875],
    [-4704.8916015625, 0, 20380.93359375],
    [-4707.298828125, 0, 20384.046875],
    [-4709.6337890625, 0, 20387.015625],
    [-4711.8955078125, 0, 20389.8359375],
    [-4714.08447265625, 0, 20392.509765625],
    [-4716.201171875, 0, 20395.0390625],
    [-4718.24462890625, 0, 20397.421875],
    [-4720.2158203125, 0, 20399.65625],
    [-4722.1142578125, 0, 20401.74609375],
    [-4723.9697265625, 0, 20403.728515625],
    [-4725.78271484375, 0, 20405.603515625],
    [-4727.55224609375, 0, 20407.37109375],
    [-4729.27978515625, 0, 20409.03125],
    [-4730.9638671875, 0, 20410.5859375],
    [-4732.60546875, 0, 20412.03125],
    [-4734.2041015625, 0, 20413.37109375],
    [-4735.76025390625, 0, 20414.603515625],
    [-4737.21826171875, 0, 20415.990234375],
    [-4738.57861328125, 0, 20417.53125],
    [-4739.84130859375, 0, 20419.2265625],
    [-4741.00634765625, 0, 20421.076171875],
    [-4742.07373046875, 0, 20423.080078125],
    [-4743.04296875, 0, 20425.23828125],
    [-4743.9150390625, 0, 20427.55078125],
    [-4744.68896484375, 0, 20430.017578125],
    [-4745.36474609375, 0, 20432.76953125],
    [-4745.9423828125, 0, 20435.80859375],
    [-4746.42236328125, 0, 20439.1328125],
    [-4746.80419921875, 0, 20442.744140625],
    [-4747.087890625, 0, 20446.638671875],
    [-4747.2734375, 0, 20450.822265625],
    [-4747.361328125, 0, 20455.2890625],
    [-4747.3505859375, 0, 20460.04296875],
    [-4747.19873046875, 0, 20464.615234375],
    [-4746.9052734375, 0, 20469.0078125],
    [-4746.47021484375, 0, 20473.220703125],
    [-4745.89404296875, 0, 20477.251953125],
    [-4745.17578125, 0, 20481.103515625],
    [-4744.31640625, 0, 20484.7734375],
    [-4743.3154296875, 0, 20488.263671875],
    [-4742.1728515625, 0, 20491.57421875],
    [-4740.60400390625, 0, 20495.19921875],
    [-4738.60888671875, 0, 20499.140625],
    [-4736.18701171875, 0, 20503.3984375],
    [-4733.3388671875, 0, 20507.970703125],
    [-4728.92578125, 0, 20514.318359375],
    [-4722.94775390625, 0, 20522.439453125],
    [-4710.8515625, 0, 20538.173828125],
    [-4359.13818359375, 0, 20988.912109375],
  ],
  straightFrom: [-4109.046875, 0, 19930.4765625],
  straightTo: [-4297.5390625, 0, 20058.41015625],
  clearanceLy: 1633.3472705476113,
  lightYearsPerPixel: 12.830005981991684,
  heldCount: 81,
};

/** The view the 90 degree corner reading of the traced set takes. */
export const TRACED_CORNER: CornerChoice = {
  view: {
    cursor: [400.7349548339844, 0, -9744.3251953125],
    distance: 20000,
    yaw: 0,
    pitch: 89,
  },
  viewport: {
    width: 3840,
    height: 2160,
  },
  chain: 11,
  vertex: 3536,
  turnDegrees: 90,
  reachPixels: 30,
  bend: [400.7349548339844, 0, -9744.3251953125],
  bendLine: [
    [400.7349548339844, 0, -9423.575045762707],
    [400.7349548339844, 0, -9744.3251953125],
    [721.4851043837764, 0, -9744.3251953125],
  ],
  straightFrom: [785.6351342937348, 0, -9744.3251953125],
  straightTo: [1085.0019405402074, 0, -9744.3251953125],
  clearanceLy: 1677.87939453125,
  lightYearsPerPixel: 10.691671651659735,
  heldCount: 6,
};

/**
 * The plane point the close end reading takes. It sits on a chain of the smoothed set and
 * on the chain of the same index of the traced set, so both modes draw a line through the
 * centre of the frame over the whole close end of the zoom band.
 */
export const NEAR_BOTH_SETS: BothSetsChoice = {
  point: [425.40960693359375, 0, -21390.783203125],
  chain: 2,
  segmentLengthLy: 4392.0963134765625,
  smoothedGapLy: 0,
  tracedGapLy: 0,
  clearanceLy: 3578.171421264255,
  heldCount: 4098,
};
