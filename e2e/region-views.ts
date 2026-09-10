// The three views the boundary line tests read.
//
// Three scenarios of the galactic regions spec need a view chosen from the boundary set
// and not by hand: one where a chain crosses the frame within 5 degrees of vertical,
// one at a vertex where two segments meet at at least 60 degrees, and one where a
// segment longer than 10,000 light years crosses the whole frame.
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

/** A view where one long segment crosses the whole frame from side to side. */
export interface LongSegmentChoice {
  readonly view: ChosenView;
  readonly viewport: ChosenViewport;
  /** The chain, and the two vertices of the segment. */
  readonly chain: number;
  readonly from: number;
  readonly to: number;
  /** The point at the centre of the frame, on the drawn line. */
  readonly point: [number, number, number];
  /** The two ends of the segment, both far outside the frame. */
  readonly ends: [[number, number, number], [number, number, number]];
  /** How long the segment is, in light years. */
  readonly segmentLy: number;
  /** How far the segment leans from the vertical, in degrees. 90 is flat. */
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
  /** The chain, and the vertex the two segments meet at. */
  readonly chain: number;
  readonly vertex: number;
  /** How far the two segments meet at, in degrees. 0 is straight. */
  readonly turnDegrees: number;
  /** How far the reach reads on each side of the vertex, in CSS pixels. */
  readonly reachPixels: number;
  /** The bend itself, at the centre of the frame. */
  readonly bend: [number, number, number];
  /**
   * The drawn line inside the join reading, in order: a point back along the segment
   * that arrives, the bend, and a point forward along the segment that leaves. The
   * line is straight between its vertices, so three points hold the whole reading.
   */
  readonly bendLine: [number, number, number][];
  /** A straight part of one of the two segments, past the join reading. */
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
    cursor: [400.7349548339844, 0, 10266.85546875],
    distance: 2004,
    yaw: 0,
    pitch: 89,
  },
  viewport: { width: 1280, height: 720 },
  chain: 38,
  from: 169,
  to: 170,
  point: [400.7349548339844, 0, 10266.85546875],
  angleFromVertical: 0,
  clearanceLy: 1650.3522385983451,
  lightYearsPerPixel: 3.2139164984889166,
};

/** The view the join reading takes. */
export const SHARP_CORNER: CornerChoice = {
  view: {
    cursor: [-7643.216796875, 0, 41529.69921875],
    distance: 500,
    yaw: 0,
    pitch: 89,
  },
  viewport: { width: 1280, height: 720 },
  chain: 97,
  vertex: 438,
  turnDegrees: 98.28936687284326,
  reachPixels: 8,
  bend: [-7643.216796875, 0, 41529.69921875],
  bendLine: [
    [-7634.6101626750415, 0, 41512.485961704384],
    [-7643.216796875, 0, 41529.69921875],
    [-7659.0093790071805, 0, 41518.700822504696],
  ],
  straightFrom: [-7674.80196113936, 0, 41507.70242625939],
  straightTo: [-7801.142618196803, 0, 41419.715256296964],
  clearanceLy: 1655.2277021089476,
  lightYearsPerPixel: 0.8018753738744802,
};

/** The view the long segment reading takes. */
export const LONG_SEGMENT: LongSegmentChoice = {
  view: {
    cursor: [29080.98645127834, 0, 56071.116455574745],
    distance: 500,
    yaw: 134.6,
    pitch: 89,
  },
  viewport: { width: 1280, height: 720 },
  chain: 109,
  from: 484,
  to: 485,
  point: [29080.98645127834, 0, 56071.116455574745],
  ends: [
    [23841.69921875, 0, 50758.03515625],
    [34353.12109375, 0, 61417.5078125],
  ],
  segmentLy: 14970.449129654393,
  angleFromVertical: 89.99933059604366,
  clearanceLy: 7461.83379593574,
  lightYearsPerPixel: 0.8018753738744802,
};
