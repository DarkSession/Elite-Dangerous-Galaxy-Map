// The two views the boundary line tests read.
//
// Two scenarios of the galactic regions spec need a view chosen from the boundary set
// and not by hand: one where a chain crosses the frame within 5 degrees of vertical,
// and one where the drawn line turns by at least 30 degrees within a reach of 8 CSS
// pixels.
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
    cursor: [-10515.3193359375, 0, 72346.9609375],
    distance: 500,
    yaw: 0,
    pitch: 89,
  },
  viewport: { width: 1280, height: 720 },
  chain: 122,
  vertex: 67639,
  turnDegrees: 37.078664944628265,
  reachPixels: 8,
  bend: [-10515.3193359375, 0, 72346.9609375],
  bendLine: [
    [-10516.7578125, 0, 72337.421875],
    [-10516.619140625, 0, 72341.28125],
    [-10516.1396484375, 0, 72344.4609375],
    [-10515.3193359375, 0, 72346.9609375],
    [-10514.1591796875, 0, 72348.7890625],
    [-10512.755859375, 0, 72350.390625],
    [-10511.1103515625, 0, 72351.765625],
    [-10509.220703125, 0, 72352.921875],
  ],
  straightFrom: [-10473.70703125, 0, 72357.578125],
  straightTo: [-10349.3173828125, 0, 72390.765625],
  clearanceLy: 6412.076952539205,
  lightYearsPerPixel: 0.8018753738744802,
};
