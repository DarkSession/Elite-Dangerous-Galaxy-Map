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
    cursor: [-10509.220703125, 0, 72352.921875],
    distance: 20000,
    yaw: 0,
    pitch: 89,
  },
  viewport: { width: 3200, height: 1800 },
  chain: 122,
  vertex: 67643,
  turnDegrees: 86.936662546233,
  reachPixels: 8,
  bend: [-10509.220703125, 0, 72352.921875],
  bendLine: [
    [-10447.4931640625, 0, 72007.9609375],
    [-10509.9990234375, 0, 72297.15625],
    [-10513.9580078125, 0, 72316.375],
    [-10515.623046875, 0, 72325.8828125],
    [-10516.556640625, 0, 72332.8984375],
    [-10516.7578125, 0, 72337.421875],
    [-10516.619140625, 0, 72341.28125],
    [-10516.1396484375, 0, 72344.4609375],
    [-10515.3193359375, 0, 72346.9609375],
    [-10514.1591796875, 0, 72348.7890625],
    [-10512.755859375, 0, 72350.390625],
    [-10511.1103515625, 0, 72351.765625],
    [-10509.220703125, 0, 72352.921875],
    [-10507.08984375, 0, 72353.8515625],
    [-10504.71484375, 0, 72354.5546875],
    [-10502.09765625, 0, 72355.0390625],
    [-10499.2373046875, 0, 72355.296875],
    [-10496.134765625, 0, 72355.328125],
    [-10493.0068359375, 0, 72355.4296875],
    [-10489.853515625, 0, 72355.609375],
    [-10486.6748046875, 0, 72355.859375],
    [-10483.470703125, 0, 72356.1796875],
    [-10480.2412109375, 0, 72356.5703125],
    [-10476.9873046875, 0, 72357.0390625],
    [-10473.70703125, 0, 72357.578125],
    [-10470.40234375, 0, 72358.1796875],
    [-10466.9208984375, 0, 72358.9140625],
    [-10463.263671875, 0, 72359.765625],
    [-10459.4296875, 0, 72360.7421875],
    [-10455.419921875, 0, 72361.84375],
    [-10451.234375, 0, 72363.0625],
    [-10446.8720703125, 0, 72364.40625],
    [-10442.333984375, 0, 72365.875],
    [-10437.619140625, 0, 72367.4609375],
    [-10433.048828125, 0, 72368.9765625],
    [-10428.6240234375, 0, 72370.421875],
    [-10424.3427734375, 0, 72371.7890625],
    [-10420.2060546875, 0, 72373.0859375],
    [-10416.212890625, 0, 72374.3046875],
    [-10412.365234375, 0, 72375.4453125],
    [-10408.662109375, 0, 72376.5234375],
  ],
  straightFrom: [-10420.7060546875, 0, 71892.6015625],
  straightTo: [-10447.4931640625, 0, 72007.9609375],
  clearanceLy: 6420.418048697758,
  lightYearsPerPixel: 12.830005981991684,
  heldCount: 6713,
};

/** The view the 90 degree corner reading of the traced set takes. */
export const TRACED_CORNER: CornerChoice = {
  view: {
    cursor: [400.7349548339844, 0, -4760.0361328125],
    distance: 20000,
    yaw: 0,
    pitch: 89,
  },
  viewport: { width: 3840, height: 2160 },
  chain: 9,
  vertex: 3514,
  turnDegrees: 90,
  reachPixels: 6,
  bend: [400.7349548339844, 0, -4760.0361328125],
  bendLine: [
    [400.7349548339844, 0, -4824.186162722458],
    [400.7349548339844, 0, -4760.0361328125],
    [336.5849249240259, 0, -4760.0361328125],
  ],
  straightFrom: [272.43489501406754, 0, -4760.0361328125],
  straightTo: [-26.931911232405014, 0, -4760.0361328125],
  clearanceLy: 3306.40966796875,
  lightYearsPerPixel: 10.691671651659735,
  heldCount: 10,
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
  heldCount: 4605,
};
