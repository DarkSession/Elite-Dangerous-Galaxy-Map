// The five views the boundary line tests read.
//
// Five scenarios of the galactic regions spec need a view chosen from the boundary set
// and not by hand: one where a chain crosses the frame within 5 degrees of vertical,
// one at a break where two primitives meet at at least 60 degrees, one where a straight
// primitive longer than 10,000 light years crosses the whole frame, one at the joint of
// a biarc, and one on a run that curves through more than 60 degrees.
// `tests/region-views.test.ts` builds the boundary set, runs the search in
// `tests/region-views.ts`, and fails if these constants are not what it gives.
//
// A primitive of the set is an arc: two ends and a signed curvature, where a curvature
// of zero is a straight line. Every point below is a point of the **drawn** line.
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
  /** The chain, and the vertex the two primitives meet at. */
  readonly chain: number;
  readonly vertex: number;
  /** How far the two primitives meet at, in degrees. 0 is straight. */
  readonly turnDegrees: number;
  /** How far the reach reads on each side of the vertex, in CSS pixels. */
  readonly reachPixels: number;
  /** The bend itself, at the centre of the frame. */
  readonly bend: [number, number, number];
  /**
   * The drawn line inside the join reading, in order: a point back along the primitive
   * that arrives, the bend, and a point forward along the primitive that leaves. The
   * reach is 24 CSS pixels, over which an arc of this set bows away from its chord by
   * under a tenth of a pixel, so three points hold the whole reading.
   */
  readonly bendLine: [number, number, number][];
  /** A straight part of one of the two primitives, past the join reading. */
  readonly straightFrom: [number, number, number];
  readonly straightTo: [number, number, number];
  /** How far the nearest other part of the boundary is, in light years. */
  readonly clearanceLy: number;
  /** How many light years one CSS pixel covers at the cursor. */
  readonly lightYearsPerPixel: number;
}

/** A view centred on the joint of a biarc, where two arcs meet tangentially. */
export interface JointChoice {
  readonly view: ChosenView;
  readonly viewport: ChosenViewport;
  /** The chain, and the vertex the two arcs meet at. */
  readonly chain: number;
  readonly vertex: number;
  /** How far the two arcs meet at, in degrees. A joint is tangential, so it is near 0. */
  readonly turnDegrees: number;
  /** How far the reach reads on each side of the joint, in CSS pixels. */
  readonly reachPixels: number;
  /** The joint itself, at the centre of the frame. */
  readonly joint: [number, number, number];
  /**
   * The drawn line inside the joint reading, sampled along both arcs, in order. A
   * straight piece between two of these samples is about 3 CSS pixels long.
   */
  readonly jointLine: [number, number, number][];
  /** A straight part of one of the two arcs, past the joint reading. */
  readonly straightFrom: [number, number, number];
  readonly straightTo: [number, number, number];
  /** The signed curvature of the arriving arc and of the leaving one. */
  readonly curvatures: [number, number];
  /** How far the nearest other part of the boundary is, in light years. */
  readonly clearanceLy: number;
  /** How many light years one CSS pixel covers at the cursor. */
  readonly lightYearsPerPixel: number;
}

/** A view on a run of one chain that curves through more than 60 degrees. */
export interface CurvedRunChoice {
  readonly view: ChosenView;
  readonly viewport: ChosenViewport;
  /** The chain, and the first and the last vertex of the run. */
  readonly chain: number;
  readonly from: number;
  readonly to: number;
  /** How far the whole run curves, in degrees. */
  readonly turnDegrees: number;
  /** How far the drawn line the frame holds curves, in degrees. */
  readonly visibleTurnDegrees: number;
  /** The widest of the tightest radii of the run, in light years. */
  readonly widestRadiusLy: number;
  /** How far the drawn direction is fitted over, in CSS pixels. */
  readonly windowPixels: number;
  /**
   * The drawn line of the run inside the frame, one sample every window. The browser
   * fits the drawn direction around each of these and compares neighbours.
   */
  readonly line: [number, number, number][];
  /** How far the drawn line turns between two neighbouring windows, in degrees. */
  readonly turnPerWindowDegrees: number;
  /** How far the nearest other part of the boundary is from the line, in light years. */
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
  viewport: {
    width: 1280,
    height: 720,
  },
  chain: 38,
  from: 208,
  to: 209,
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
  viewport: {
    width: 1280,
    height: 720,
  },
  chain: 97,
  vertex: 562,
  turnDegrees: 98.28936687284326,
  reachPixels: 8,
  bend: [-7643.216796875, 0, 41529.69921875],
  bendLine: [
    [-7634.610162675041, 0, 41512.485961704384],
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
  viewport: {
    width: 1280,
    height: 720,
  },
  chain: 109,
  from: 616,
  to: 617,
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

/** The view the biarc joint reading takes. */
export const BIARC_JOINT: JointChoice = {
  view: {
    cursor: [7504.17724609375, 0, 15638.44921875],
    distance: 500,
    yaw: 0,
    pitch: 89,
  },
  viewport: {
    width: 1280,
    height: 720,
  },
  chain: 48,
  vertex: 275,
  turnDegrees: 0.00004712799593379647,
  reachPixels: 8,
  joint: [7504.17724609375, 0, 15638.44921875],
  jointLine: [
    [7486.968270994765, 0, 15629.834028072812],
    [7504.17724609375, 0, 15638.44921875],
    [7521.376830365747, 0, 15647.083125415676],
  ],
  straightFrom: [7469.768611447793, 0, 15621.200254516014],
  straightTo: [7332.509100627089, 0, 15551.46229568317],
  curvatures: [-0.00005612513632513583, 0.0001691146899247542],
  clearanceLy: 1170.317916343898,
  lightYearsPerPixel: 0.8018753738744802,
};

/** The view the no-facet reading takes. */
export const CURVED_RUN: CurvedRunChoice = {
  view: {
    cursor: [11240.559810479084, 0, 19099.684978896003],
    distance: 8000,
    yaw: 0,
    pitch: 89,
  },
  viewport: {
    width: 1280,
    height: 720,
  },
  chain: 48,
  from: 274,
  to: 282,
  turnDegrees: 61.160642163352996,
  visibleTurnDegrees: 52.528168014942466,
  widestRadiusLy: 5913.146873550367,
  windowPixels: 12,
  line: [
    [7143.2529020541915, 0, 15452.838384073513],
    [7279.667276889761, 0, 15524.215373020454],
    [7416.693321932323, 0, 15594.410951178232],
    [7554.162091110174, 0, 15663.735672816369],
    [7690.284001947541, 0, 15735.66056434486],
    [7824.487285133064, 0, 15811.104871046082],
    [7956.680966626431, 0, 15890.017450554244],
    [8086.775434660899, 0, 15972.344809422546],
    [8214.68250048953, 0, 16058.031139385452],
    [8340.31545816679, 0, 16147.018355190114],
    [8463.589143324973, 0, 16239.24613397136],
    [8584.913557113883, 0, 16334.029322107122],
    [8705.451287199121, 0, 16429.81158896241],
    [8825.24929654722, 0, 16526.517452146974],
    [8944.300508456967, 0, 16624.141199057547],
    [9062.59789034192, 0, 16722.677062869687],
    [9180.134454145844, 0, 16822.11922287843],
    [9296.903256755508, 0, 16922.461804842143],
    [9412.897400410822, 0, 17023.698881329514],
    [9528.110033112309, 0, 17125.824472069697],
    [9642.534349025864, 0, 17228.832544305584],
    [9755.890618326537, 0, 17333.01301376374],
    [9867.462918385076, 0, 17439.101347875665],
    [9977.18368982268, 0, 17547.103501049267],
    [10085.020109321324, 0, 17656.98716409664],
    [10190.939917272868, 0, 17768.719464970225],
    [10294.911427429615, 0, 17882.26697859656],
    [10396.903536383352, 0, 17997.595736875515],
    [10496.88573287004, 0, 18114.671238841955],
    [10594.828106897352, 0, 18233.45846098681],
    [10690.701358692342, 0, 18353.92186773447],
    [10784.770122976877, 0, 18475.801182462314],
    [10877.744523737761, 0, 18598.51758731167],
    [10969.651469505263, 0, 18722.035474824723],
    [11060.48405148547, 0, 18846.345559961876],
    [11150.235441646128, 0, 18971.438498132764],
    [11238.898893229925, 0, 19097.3048858987],
    [11326.467741261658, 0, 19223.93526167952],
    [11412.935403049238, 0, 19351.32010646486],
    [11498.295378678533, 0, 19479.449844529696],
    [11582.541251501973, 0, 19608.314844154163],
    [11665.666688620895, 0, 19737.9054183476],
    [11747.665441361609, 0, 19868.21182557673],
    [11828.53134574511, 0, 19999.224270497947],
    [11908.138181831204, 0, 20131.005284498562],
    [11986.350681883036, 0, 20263.61858996719],
    [12063.1601177417, 0, 20397.049450395905],
    [12138.557944446067, 0, 20531.28302175543],
    [12212.53577407491, 0, 20666.304370715807],
    [12285.085376680023, 0, 20802.09847630774],
    [12356.198681201822, 0, 20938.650231593652],
    [12425.867776367222, 0, 21075.94444534831],
    [12494.08491156976, 0, 21213.965843748818],
    [12560.84249773185, 0, 21352.699072073847],
    [12626.13310814905, 0, 21492.128696411804],
    [12689.949479316272, 0, 21632.23920537784],
    [12752.242565225913, 0, 21773.03331894541],
    [12811.925150993608, 0, 21914.951443892995],
    [12868.500417211677, 0, 22058.136654319598],
    [12921.941485552024, 0, 22202.520924401895],
    [12972.22296671179, 0, 22348.03565865563],
    [13019.320972475534, 0, 22494.611724524635],
    [13063.213127064299, 0, 22642.17948522497],
    [13103.878577766098, 0, 22790.66883282868],
    [13141.298004842836, 0, 22940.009221571323],
    [13175.453630708911, 0, 23090.12970136756],
    [13206.329228377164, 0, 23240.958951518794],
  ],
  turnPerWindowDegrees: 1.491805043134197,
  clearanceLy: 769.3791622923571,
  lightYearsPerPixel: 12.830005981991683,
};
