// The views and the points the boundary line tests read.
//
// Five scenarios of the galactic regions spec need a view or a point chosen from the
// boundary sets and not by hand: one where a chain crosses the frame within 5 degrees of
// vertical, one where the drawn line turns by at least 30 degrees within a reach of 8 CSS
// pixels, one plane point that sits on a chain of both sets, one lattice node where the
// traced line turns by 90 degrees, and one where a chain runs from the lower edge of the
// frame to the cursor.
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
}

/**
 * A view where one chain runs from the lower edge of the frame up to the cursor, at a
 * pitch of 5 degrees. The camera is far from the cursor and near the lower edge, so the
 * near fade takes the same line out along its own length.
 */
export interface FadingRunChoice {
  readonly view: ChosenView;
  readonly viewport: ChosenViewport;
  /** The chain the reading follows. */
  readonly chain: number;
  /** The vertex the cursor sits on. */
  readonly cursorVertex: number;
  /** The two vertices of the segment the lower reading sits on. */
  readonly lowerFrom: number;
  readonly lowerTo: number;
  /** The cursor, at the centre of the frame and on the drawn line. */
  readonly cursor: [number, number, number];
  /** Where the chain crosses the lower tenth of the frame, in game coordinates. */
  readonly lower: [number, number, number];
  /** The camera's distance to each reading point, in light years. */
  readonly cursorRangeLy: number;
  readonly lowerRangeLy: number;
  /** How much of the line the near fade draws at each reading point, 0 to 1. */
  readonly cursorFade: number;
  readonly lowerFade: number;
  /** How far the nearest other chain is from either reading, in CSS pixels. */
  readonly clearancePixels: number;
  /** How many light years one CSS pixel covers at the cursor. */
  readonly lightYearsPerPixel: number;
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
}

/** The view the width reading takes. */
export const VERTICAL_CROSSING: CrossingChoice = {
  view: {
    cursor: [400.7349548339844, 0, 10118.80712890625],
    distance: 1875,
    yaw: 179.9,
    pitch: 89,
  },
  viewport: { width: 1280, height: 720 },
  chain: 38,
  from: 22256,
  to: 22288,
  point: [400.7349548339844, 0, 10118.80712890625],
  angleFromVertical: 0.013647897608527493,
  clearanceLy: 1505.149929083743,
  lightYearsPerPixel: 3.007032652029301,
};

/** The view the join reading takes. */
export const SHARP_CORNER: CornerChoice = {
  view: {
    cursor: [-10512.755859375, 0, 72350.390625],
    distance: 1600,
    yaw: 0,
    pitch: 89,
  },
  viewport: { width: 1280, height: 720 },
  chain: 122,
  vertex: 67641,
  turnDegrees: 70.49047061761893,
  reachPixels: 8,
  bend: [-10512.755859375, 0, 72350.390625],
  bendLine: [
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
  ],
  straightFrom: [-10470.40234375, 0, 72358.1796875],
  straightTo: [-10349.3173828125, 0, 72390.765625],
  clearanceLy: 6416.077178934423,
  lightYearsPerPixel: 2.5660011963983367,
};

/**
 * The plane point the closest zoom reading takes. It sits on a chain of the smoothed set
 * and on the chain of the same index of the traced set, so both modes draw a line through
 * the centre of the frame down to a zoom of 10 light years.
 */
export const NEAR_BOTH_SETS: BothSetsChoice = {
  point: [400.7349548339844, 0, 10266.85546875],
  chain: 38,
  segmentLengthLy: 3306.41015625,
  smoothedGapLy: 0,
  tracedGapLy: 0,
  clearanceLy: 1653.197566902373,
};

/** The view the 90 degree corner reading of the traced set takes. */
export const TRACED_CORNER: CornerChoice = {
  view: {
    cursor: [400.7349548339844, 0, 11920.060546875],
    distance: 1600,
    yaw: 0,
    pitch: 89,
  },
  viewport: { width: 1280, height: 720 },
  chain: 38,
  vertex: 8228,
  turnDegrees: 90,
  reachPixels: 8,
  bend: [400.7349548339844, 0, 11920.060546875],
  bendLine: [
    [400.7349548339844, 0, 11908.060546875],
    [400.7349548339844, 0, 11920.060546875],
    [388.7349548339844, 0, 11920.060546875],
  ],
  straightFrom: [340.7349548339844, 0, 11920.060546875],
  straightTo: [260.7349548339844, 0, 11920.060546875],
  clearanceLy: 1898.5086612424732,
  lightYearsPerPixel: 2.5660011963983367,
};

/**
 * The view the fading run reading takes. One chain of the smoothed set runs from the
 * cursor at the centre of the frame down to the lower tenth of it. The camera is 3,000
 * light years from the cursor and 487 from the lower reading, so the near fade draws the
 * line in full at the one and at an eighth of that at the other.
 */
export const FADING_RUN: FadingRunChoice = {
  view: {
    cursor: [396.1371765136719, 0, 11707.0009765625],
    distance: 3000,
    yaw: 359.9148389128297,
    pitch: 5,
  },
  viewport: { width: 1280, height: 720 },
  chain: 38,
  cursorVertex: 22288,
  lowerFrom: 22272,
  lowerTo: 22271,
  cursor: [396.1371765136719, 0, 11707.0009765625],
  lower: [400.7349548339844, 0, 9129.521523455454],
  cursorRangeLy: 3000,
  lowerRangeLy: 487.2057547014851,
  cursorFade: 1,
  lowerFade: 0.12486040136955275,
  clearancePixels: 7375.902703326462,
  lightYearsPerPixel: 4.811252243246881,
};
