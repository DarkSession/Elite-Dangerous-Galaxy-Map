// Places the region name labels over the canvas. The labels are DOM elements in an
// overlay, so the browser reads them as text and the test needs no pixel measure.
//
// The page asks what the frame shows and reads the regions off it. Each frame it
// samples the viewport on a grid of screen points, turns each point into a plane point
// at `y = 0`, and reads the region from the coarse grid the scene data carries. The
// counts give the candidates, the order and the anchors.
import {
  cameraPosition,
  inverseViewProjection,
  planePointFrom,
  project,
} from '../camera/projection';
import type { Viewport } from '../camera/projection';
import type { View } from '../camera/view';
import {
  REGION_RANGE_FULL,
  REGION_RANGE_NONE,
  regionFade,
} from '../render/region-pass';
import {
  coarseRegionFlowStepAt,
  coarseRegionIdAt,
  insideCoarseRegionGrid,
  NO_REGION_ID,
  REGIONS,
} from '../scene-data/regions';
import type { Region } from '../scene-data/regions';
import type { CoarseRegionGrid } from '../scene-data/types';

/** How far apart the sample points sit on the screen, in CSS pixels. */
export const SAMPLE_SPACING = 32;

/** The share of the landed samples a region holds to become a candidate. */
export const CANDIDATE_SHARE = 0.01;

/**
 * The share a region that carried a label in the frame before holds to stay a
 * candidate. It is half the threshold, so a region on the threshold does not blink.
 */
export const HELD_SHARE = CANDIDATE_SHARE / 2;

/**
 * How much the sample count of a region that carried a label in the frame before counts
 * for in the order. It is a margin against a swap on a near tie, so a region that now
 * fills the frame still overtakes a region that is leaving it.
 */
export const CARRIED_BONUS = 1.2;

/** How far from the frame edge an anchor stays, in CSS pixels. */
export const LABEL_INSET = 48;

/** How many labels the page shows at once. */
export const MAX_LABELS = 12;

/** How many region ids a `Uint8Array` of ids can hold. */
const ID_RANGE = 256;

/** A point on the screen, in CSS pixels from the top left. */
export interface AnchorPoint {
  readonly x: number;
  readonly y: number;
}

/** A point on the galactic plane at `y = 0`, in light years. */
export interface PlanePoint {
  readonly x: number;
  readonly z: number;
}

/** The size of a label, in CSS pixels. */
export interface LabelSize {
  readonly width: number;
  readonly height: number;
}

/** The box of a label on the screen, in CSS pixels from the top left. */
export interface LabelBox extends LabelSize {
  readonly left: number;
  readonly top: number;
}

/** A label the page shows. */
export interface PlacedLabel extends LabelBox {
  /** The region id, 1 to 42. */
  readonly id: number;
  /** The region name the label reads. */
  readonly name: string;
  /** The plane point the anchor projects from, so the next frame can hold it. */
  readonly plane: PlanePoint;
  /** The smoothed target the anchor moves toward, so the next frame can carry it. */
  readonly target: PlanePoint;
  /** Where that smoothed target projected, so the next frame reads how far it moved. */
  readonly targetScreen: AnchorPoint | null;
  /** True where the centre rule named the target, which the handover band reads. */
  readonly centre: boolean;
}

/**
 * The samples of one frame that land on the plane inside the model bounds. A sample
 * whose ray runs away from the plane, or whose plane point falls outside the grid, is
 * not here and does not count toward the candidate share.
 */
export interface FrameSamples {
  /** How many samples land. */
  readonly count: number;
  /** How many screen points the sweep read. */
  readonly points: number;
  /** The screen `x` of each landed sample, in CSS pixels. The length is `count`. */
  readonly x: Float64Array;
  /** The screen `y` of each landed sample, in CSS pixels. The length is `count`. */
  readonly y: Float64Array;
  /** The plane `x` of each landed sample, in light years. The length is `count`. */
  readonly planeX: Float64Array;
  /** The plane `z` of each landed sample, in light years. The length is `count`. */
  readonly planeZ: Float64Array;
  /** The region id of each landed sample. 0 means the cell holds no region. */
  readonly ids: Uint8Array;
  /** How long the sweep took, in milliseconds. */
  readonly elapsedMs: number;
  /**
   * The region id at any point of the plane, not only under a sample. The anchor rule
   * reads it at the mean of a region's sample plane positions, which lies between them.
   */
  readonly regionAtPlane: (x: number, z: number) => number;
  /**
   * A plane point projected to the screen, or null when it sits behind the camera. The
   * anchor is worked out on the plane and projected through this.
   */
  readonly toScreen: (x: number, z: number) => AnchorPoint | null;
  /**
   * A screen point read back to the galactic plane, or null when the ray under it runs
   * away from the plane. It is the inverse of `toScreen`, and the displaced target rule
   * reads it to move a label the least it can.
   */
  readonly toPlane: (x: number, y: number) => PlanePoint | null;
  /**
   * The unit step the flow field names at a plane point, or null where it names none.
   * A label whose straight step leaves its own region follows it, so the label walks
   * around a region that lies in its way rather than standing still.
   */
  readonly flowStepAtPlane: (x: number, z: number) => readonly [number, number] | null;
}

/** A region the frame shows enough of to name. */
export interface LabelCandidate {
  /** The region id, 1 to 42. */
  readonly id: number;
  /** The region name. */
  readonly name: string;
  /** How many samples of the frame the region holds. */
  readonly count: number;
  /** The plane point the anchor projects from, in light years. */
  readonly plane: PlanePoint;
  /** The smoothed target the anchor moves toward, so the next frame can carry it. */
  readonly target: PlanePoint;
  /** Where that smoothed target projected, so the next frame reads how far it moved. */
  readonly targetScreen: AnchorPoint | null;
  /** True where the centre rule named the target, which the handover band reads. */
  readonly centre: boolean;
  /** Where the label sits, in CSS pixels from the top left. */
  readonly anchor: AnchorPoint;
}

function clamp(value: number, low: number, high: number): number {
  if (!Number.isFinite(value)) return (low + high) / 2;
  if (high < low) return (low + high) / 2;
  return Math.min(Math.max(value, low), high);
}

function smoothstep(low: number, high: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
}

/**
 * How much of the label overlay draws at a zoom distance, 0 to 1. It is the boundary's
 * own zoom fade and not a second copy of it, so a name and the line under it can never
 * part company at a zoom.
 *
 * The close end of the old band is gone. The range fade below holds that end, read at
 * each label's own plane anchor, exactly as the composite pass holds it per pixel.
 */
export function labelFade(distance: number): number {
  return regionFade(distance);
}

/**
 * How much of a label draws at the range from the camera to its own plane anchor, 0 to
 * 1. It is the same smooth step the composite pass reads per pixel, and it takes the
 * same two constants, so no copy is made.
 *
 * A label is one DOM element with one opacity. It names one place, its anchor is that
 * place, and the placement already holds that place as a plane point, so the fade is
 * read there once rather than over the box the text covers.
 */
export function labelRangeFade(range: number): number {
  return smoothstep(REGION_RANGE_NONE, REGION_RANGE_FULL, range);
}

/**
 * The greatest range from the camera to a plane point the frame holds, in light years.
 *
 * The frame's **four corners** carry it, and a corner reads further than the centre of
 * its own row. At a pitch of 58.6 degrees and a camera 1,542 light years up the centre
 * reads 3,223 light years and the corners about 4,300, so a gate on the centre
 * under-reads by about a third.
 *
 * Which row is the far one follows the side of the plane the camera is on. Above the
 * plane the top row runs furthest away; below it the picture is mirrored and the bottom
 * row does. At a pitch of -45 degrees and a distance of 4,000 light years the top row
 * reads 3,918 light years and the bottom row 14,621, so a gate on the top row alone
 * would drop every region label of a frame that holds plane out to 14,621. The function
 * reads all four corners and takes the greatest, so it answers the same way at a pitch
 * and at its negative.
 *
 * A ray that misses the plane, which is a frame holding the horizon, reads as beyond
 * every range.
 */
export function farthestPlaneRange(view: View, viewport: Viewport): number {
  const inverse = inverseViewProjection(view, viewport);
  const origin = cameraPosition(view);
  const pixel = { x: 0, y: 0 };
  let farthest = 0;
  for (const row of [0, viewport.height]) {
    for (const column of [0, viewport.width]) {
      pixel.x = column;
      pixel.y = row;
      const point = planePointFrom(inverse, origin, pixel, viewport, 0);
      if (point === null) return Number.POSITIVE_INFINITY;
      const range = Math.hypot(
        point[0] - origin[0],
        point[1] - origin[1],
        point[2] - origin[2],
      );
      if (range > farthest) farthest = range;
    }
  }
  return farthest;
}

/**
 * True where the sampling sweep of a frame could place a label a user can see. The gate
 * is a conjunction of the two fades the labels take:
 *
 * - the zoom fade is above 0, which is a zoom below 30,000 light years. This is what
 *   keeps the default far view from paying 2 milliseconds a frame;
 * - the greatest range to the plane the frame holds is above `REGION_RANGE_NONE`, so
 *   some part of the frame could carry a label at an opacity above 0.
 *
 * The second half reads the pitch and the camera's height, which a zoom floor cannot. At
 * a pitch of 89 degrees and a zoom of 2,500 light years the corner rays meet the plane at
 * about 3,900 light years, which is under the floor, so the whole frame lies inside it and
 * the sweep is skipped; at a pitch of 20 degrees and the same zoom the frame holds the
 * horizon and the sweep runs.
 *
 * The example was a zoom of 4,000 light years against a floor of 8,000. The corner rays of
 * that view reach 6,243 light years, which clears the floor of 5,000, so it no longer reads
 * the gate it is there for.
 */
export function labelSweepRuns(view: View, viewport: Viewport): boolean {
  return (
    labelFade(view.distance) > 0 &&
    farthestPlaneRange(view, viewport) > REGION_RANGE_NONE
  );
}

/**
 * The typed arrays one sweep fills. The overlay holds one set and hands it back every
 * frame, so a sweep at 1920x1080 allocates none of the 67 KB of sample arrays it took
 * before. The window the overlay times carries a bound of 4 milliseconds for a single
 * frame, and a young-generation collection landing inside it is what an allocation of
 * that size every frame buys: the worst frame measured 4.5 ms with it and 1.0 to 1.8 ms
 * without it. The sweep still makes the five `subarray` views and two closures it
 * returns, which are a few small objects and not kilobytes.
 */
export interface SampleBuffers {
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly planeX: Float64Array;
  readonly planeZ: Float64Array;
  readonly ids: Uint8Array;
}

/**
 * The shape of the sample grid. The sweep and the point count both read it here, so the
 * two cannot drift apart. If they did, and the sweep asked for more points than the
 * overlay fitted, the sweep would allocate a new set inside the timed window on every
 * frame.
 */
function sampleColumns(viewport: Viewport): number {
  return Math.max(1, Math.ceil(viewport.width / SAMPLE_SPACING));
}

function sampleRows(viewport: Viewport): number {
  return Math.max(1, Math.ceil(viewport.height / SAMPLE_SPACING));
}

/** How many screen points a sweep of a viewport reads. */
export function samplePointCount(viewport: Viewport): number {
  return sampleColumns(viewport) * sampleRows(viewport);
}

/**
 * The buffers a caller already holds when they take the points, or a new set when they
 * do not. The size follows the viewport, so a resize takes one allocation and no frame
 * after it does.
 */
export function fitSampleBuffers(
  buffers: SampleBuffers | null,
  points: number,
): SampleBuffers {
  if (buffers !== null && buffers.ids.length >= points) return buffers;
  return {
    x: new Float64Array(points),
    y: new Float64Array(points),
    planeX: new Float64Array(points),
    planeZ: new Float64Array(points),
    ids: new Uint8Array(points),
  };
}

/**
 * Samples the frame on a grid of screen points about 32 CSS pixels apart, and reads the
 * region under each one from the coarse grid. That is 2,040 points at 1920x1080.
 *
 * The caller may hand in the buffers to fill. The overlay does, so the sweep allocates
 * nothing each frame; a caller that gives none gets a fresh set.
 *
 * The view-projection matrix is inverted once for the whole sweep. Inverting it per
 * point, as `rayDirection` does, would be 2,000 matrix inversions a frame.
 */
export function sampleFrame(
  view: View,
  viewport: Viewport,
  grid: CoarseRegionGrid,
  buffers: SampleBuffers | null = null,
  flow: Uint8Array | null = null,
): FrameSamples {
  const started = performance.now();
  const columns = sampleColumns(viewport);
  const rows = sampleRows(viewport);
  const stepX = viewport.width / columns;
  const stepY = viewport.height / rows;
  const points = columns * rows;

  const pool = fitSampleBuffers(buffers, points);
  const x = pool.x;
  const y = pool.y;
  const planeX = pool.planeX;
  const planeZ = pool.planeZ;
  const ids = pool.ids;
  const inverse = inverseViewProjection(view, viewport);
  const origin = cameraPosition(view);
  const pixel = { x: 0, y: 0 };

  const regionAtPlane = (readX: number, readZ: number): number =>
    coarseRegionIdAt(grid, readX, readZ);

  // A sweep with no field names no step anywhere, which is the reading a caller that
  // holds no field gets. The carried point then stands, as it did before the field.
  const flowStepAtPlane = (
    readX: number,
    readZ: number,
  ): readonly [number, number] | null =>
    flow === null ? null : coarseRegionFlowStepAt(grid, flow, readX, readZ);

  const toScreen = (readX: number, readZ: number): AnchorPoint | null => {
    const screen = project(view, [readX, 0, readZ], viewport);
    if (!screen.inFront) return null;
    return { x: screen.x, y: screen.y };
  };

  const readPixel = { x: 0, y: 0 };
  const toPlane = (readX: number, readY: number): PlanePoint | null => {
    readPixel.x = readX;
    readPixel.y = readY;
    const point = planePointFrom(inverse, origin, readPixel, viewport, 0);
    if (point === null) return null;
    return { x: point[0], z: point[2] };
  };

  let count = 0;
  for (let row = 0; row < rows; row += 1) {
    pixel.y = (row + 0.5) * stepY;
    for (let column = 0; column < columns; column += 1) {
      pixel.x = (column + 0.5) * stepX;
      const point = planePointFrom(inverse, origin, pixel, viewport, 0);
      if (point === null) continue;
      if (!insideCoarseRegionGrid(grid, point[0], point[2])) continue;
      x[count] = pixel.x;
      y[count] = pixel.y;
      planeX[count] = point[0];
      planeZ[count] = point[2];
      ids[count] = coarseRegionIdAt(grid, point[0], point[2]);
      count += 1;
    }
  }

  return {
    count,
    points,
    x: x.subarray(0, count),
    y: y.subarray(0, count),
    planeX: planeX.subarray(0, count),
    planeZ: planeZ.subarray(0, count),
    ids: ids.subarray(0, count),
    elapsedMs: performance.now() - started,
    regionAtPlane,
    toScreen,
    toPlane,
    flowStepAtPlane,
  };
}

/** The ids that carried a label in the frame before. An empty set is the first frame. */
export type PreviousLabels = ReadonlySet<number>;

/** The plane anchor each region carried in the frame before, by region id. */
export type HeldAnchors = ReadonlyMap<number, PlanePoint>;

/**
 * What the placement remembers of the frame before. The overlay owns it and hands it
 * in, so the placement itself stays a function of what it is given.
 */
export interface LabelMemory {
  /** The regions that carried a label. */
  readonly previous: PreviousLabels;
  /** The plane point each of those anchored on. */
  readonly anchors: HeldAnchors;
  /** The smoothed target each of those moved toward. */
  readonly targets: HeldAnchors;
  /** Where each of those smoothed targets projected, in CSS pixels. */
  readonly targetScreens: ReadonlyMap<number, AnchorPoint>;
  /** The regions whose target the centre rule named. */
  readonly centres: ReadonlySet<number>;
}

/** No label in the frame before, which is what a first frame reads. */
export const NO_LABEL_MEMORY: LabelMemory = {
  previous: new Set<number>(),
  anchors: new Map<number, PlanePoint>(),
  targets: new Map<number, PlanePoint>(),
  targetScreens: new Map<number, AnchorPoint>(),
  centres: new Set<number>(),
};

/** What the placement reads about the frame it runs, beside the frame's own samples. */
export interface FrameTiming {
  /**
   * The time this frame covers, in seconds. Every rate of the placement reads it, so a
   * label moves the same distance in a second at every frame rate.
   *
   * **Every call outside the frame loop passes 0.** Such a call redraws the frame the
   * loop last built, and a redraw must not advance a filter.
   */
  readonly seconds: number;
  /**
   * True where the caller wrote the view rather than moved it. A write of the view is
   * another place, not a movement to it, so the drift cap does not hold a target across
   * one: the frame's own target is taken whole.
   */
  readonly jump: boolean;
}

/** A frame that advances no filter, which every call outside the frame loop passes. */
export const STILL_FRAME: FrameTiming = { seconds: 0, jump: false };

/**
 * The memory of one frame, built from the labels it placed. The overlay hands it to the
 * next frame, so the placement itself holds no state.
 */
export function rememberLabels(
  labels: readonly Pick<
    LabelCandidate,
    'id' | 'plane' | 'target' | 'targetScreen' | 'centre'
  >[],
): LabelMemory {
  const targetScreens = new Map<number, AnchorPoint>();
  const centres = new Set<number>();
  for (const label of labels) {
    if (label.targetScreen !== null) targetScreens.set(label.id, label.targetScreen);
    if (label.centre) centres.add(label.id);
  }
  return {
    previous: new Set(labels.map((label) => label.id)),
    anchors: new Map(labels.map((label) => [label.id, label.plane])),
    targets: new Map(labels.map((label) => [label.id, label.target])),
    targetScreens,
    centres,
  };
}

/** The target of one region, and which of the two rules named it. */
export interface RegionTarget {
  /** The plane point the label belongs on. */
  readonly point: PlanePoint;
  /** True where the region's own centre named it, false where the frame's samples did. */
  readonly centre: boolean;
}

/** What the frame's own samples say about a region, for `regionTarget`. */
export interface RegionSamples {
  /** The mean plane `x` of the samples the region holds. */
  readonly meanX: number;
  /** The mean plane `z` of the samples the region holds. */
  readonly meanZ: number;
  /** The index of the region's own sample nearest that mean. */
  readonly sampleIndex: number;
}

/**
 * The plane point a region's label belongs on.
 *
 * The first rule is the region's own **centre**: the centroid of its footprint on the
 * galactic plane. That is one fixed point of the galaxy. A label on it does not move over
 * the map at all, at any camera speed, because nothing about the frame goes into it. The
 * centre is used while the region under it is that region, and while it projects inside
 * the frame with the label inset, so the whole label box has room there.
 *
 * Where the centre has no room, the label moves **the least it can** to get room. The
 * projection of the centre is held inside the frame with the same inset, and that screen
 * point is read back to the plane. A label whose region runs off one edge moves toward
 * that edge alone, and it stays as near its centre as the frame allows.
 *
 * Where the point read back sits on another region, the search goes out from the
 * projection of the centre ring by ring, and takes the first point on its own region that
 * is inside the inset. It measures on the screen and not on the plane, because at a low
 * pitch a point near on the plane can be far on the screen.
 *
 * The search stops at `TARGET_MOVE_PIXELS`. Where no point that near holds the label, the
 * centre itself is the better place: the box rule moves the box into the frame, so the
 * label stays on the middle of its region. A centre that projects outside the frame does
 * not search at all. The rule says nothing useful there, so the frame's own samples
 * answer instead.
 *
 * Reading the frame is what makes a label move while the camera moves, because the sample
 * grid is fixed on the screen and slides over the plane. The centre rule is there so that
 * a label whose region has room for it reads none of that.
 */
export function regionTarget(
  id: number,
  region: Region,
  samples: FrameSamples,
  viewport: Viewport,
  frame: RegionSamples,
  held = false,
): RegionTarget {
  const centre = { x: region.centroid[0], z: region.centroid[1] };
  const onCentre = samples.regionAtPlane(centre.x, centre.z) === id;
  const where = onCentre ? samples.toScreen(centre.x, centre.z) : null;
  // The centre rule holds while the centre projects inside the frame. Outside it the rule
  // says nothing useful: holding a projection that is far away inside the inset gives a
  // corner of the frame, and a corner carries nothing about where the region is. The
  // frame shows only a part of the region then, and its own samples answer that below.
  //
  // The rule is taken up inside the frame and held, once taken up, until the centre
  // leaves the frame grown by `ANCHOR_REACH_SHARE` on each side. The two rules can name
  // points most of a frame apart, and without the band a centre that sits on the frame
  // edge changes the rule in every other frame.
  const bandX = held ? viewport.width * ANCHOR_REACH_SHARE : 0;
  const bandY = held ? viewport.height * ANCHOR_REACH_SHARE : 0;
  const inFrame =
    where !== null &&
    where.x >= -bandX &&
    where.y >= -bandY &&
    where.x <= viewport.width + bandX &&
    where.y <= viewport.height + bandY;
  if (where !== null && inFrame) {
    const inset = {
      x: clamp(where.x, LABEL_INSET, viewport.width - LABEL_INSET),
      y: clamp(where.y, LABEL_INSET, viewport.height - LABEL_INSET),
    };
    if (inset.x === where.x && inset.y === where.y)
      return { point: centre, centre: true };

    // The centre has no room. Read the held point back to the plane, which is the least
    // move that gives the label room.
    const moved = samples.toPlane(inset.x, inset.y);
    if (moved !== null && samples.regionAtPlane(moved.x, moved.z) === id) {
      return { point: moved, centre: true };
    }

    // The held point is over another region. The search goes out from the centre on the
    // screen, and takes the first point that is on the region and has room. It measures
    // on the screen and not on the plane, because at a low pitch one light year across
    // the screen is many light years up it: a point near on the plane can be far on the
    // screen, and the label must move only a little on the screen.
    //
    // Where no point that near holds the label, the centre itself is the better place:
    // the box rule moves the box into the frame, so the label stays on the middle of its
    // region and stays readable.
    const near = nearestOnScreen(samples, id, where, viewport, TARGET_MOVE_PIXELS);
    if (near !== null) return { point: near, centre: true };
    return { point: centre, centre: true };
  }

  if (samples.regionAtPlane(frame.meanX, frame.meanZ) === id) {
    return { point: { x: frame.meanX, z: frame.meanZ }, centre: false };
  }
  return {
    point: {
      x: samples.planeX[frame.sampleIndex] as number,
      z: samples.planeZ[frame.sampleIndex] as number,
    },
    centre: false,
  };
}

/** How many times `fitInsideRegion` grows its step while it looks for room. */
const FIT_PASSES = 5;

/** How many directions it tries at each step. */
const FIT_TURNS = 12;

/**
 * The plane point a label sits on, moved so that its box does not cross the edge of its
 * own region.
 *
 * A label that crosses the edge reads as belonging to the region next to it. The box is a
 * screen thing and the target is a plane point, so the search first reads the plane step
 * of one screen pixel across and one down, and then works in those two directions. Six
 * points of the box are tested against the region: the four corners and the middle of the
 * top and the bottom edge.
 *
 * The search grows its step over five passes, and tries twelve directions at each. It
 * takes the point that leaves the fewest points of the box off the region, and it stops
 * as soon as none are. A candidate must sit on the region itself and project inside the
 * frame, so the search never moves a label off its region or off the screen.
 *
 * A label already inside its region costs the six tests alone. Where a region is narrower
 * on the screen than the label is wide, no point fits, and the search returns the point
 * that fits best.
 */
export function fitInsideRegion(
  target: PlanePoint,
  id: number,
  size: LabelSize,
  samples: FrameSamples,
  viewport: Viewport,
): PlanePoint {
  const at = samples.toScreen(target.x, target.z);
  if (at === null) return target;
  const right = samples.toPlane(at.x + 1, at.y);
  const down = samples.toPlane(at.x, at.y + 1);
  if (right === null || down === null) return target;
  const acrossX = right.x - target.x;
  const acrossZ = right.z - target.z;
  const downX = down.x - target.x;
  const downZ = down.z - target.z;

  const halfWidth = size.width / 2;
  const halfHeight = size.height / 2;
  const off = (point: PlanePoint): number => {
    let count = 0;
    for (let column = -1; column <= 1; column += 1) {
      for (let row = -1; row <= 1; row += 2) {
        const x = point.x + acrossX * halfWidth * column + downX * halfHeight * row;
        const z = point.z + acrossZ * halfWidth * column + downZ * halfHeight * row;
        if (samples.regionAtPlane(x, z) !== id) count += 1;
      }
    }
    return count;
  };

  let best = target;
  let bestOff = off(best);
  for (let pass = 0; pass < FIT_PASSES && bestOff > 0; pass += 1) {
    const step = size.height * (pass + 1) * 0.5;
    let found: PlanePoint | null = null;
    let foundOff = bestOff;
    for (let turn = 0; turn < FIT_TURNS; turn += 1) {
      const angle = (turn / FIT_TURNS) * Math.PI * 2;
      const acrossBy = Math.cos(angle) * step;
      const downBy = Math.sin(angle) * step;
      const point = {
        x: best.x + acrossX * acrossBy + downX * downBy,
        z: best.z + acrossZ * acrossBy + downZ * downBy,
      };
      if (samples.regionAtPlane(point.x, point.z) !== id) continue;
      const where = samples.toScreen(point.x, point.z);
      if (
        where === null ||
        where.x < LABEL_INSET ||
        where.y < LABEL_INSET ||
        where.x > viewport.width - LABEL_INSET ||
        where.y > viewport.height - LABEL_INSET
      ) {
        continue;
      }
      const count = off(point);
      if (count >= foundOff) continue;
      foundOff = count;
      found = point;
    }
    if (found === null) break;
    best = found;
    bestOff = foundOff;
  }
  return best;
}

/** How far out the screen search goes, and how many directions it tries on each ring. */
const NEAR_RADII = [12, 24, 48, 96];
const NEAR_TURNS = 12;

/**
 * The largest move on the screen the displaced rule makes while the centre of a region
 * is still in the frame.
 *
 * A region can reach into the inset band at the edge of the frame, and the point of it
 * that is both inside the inset and on the region can be far along that band. To move
 * the label there costs more than it gives: the label leaves the middle of its region
 * for a corner of the frame. Where the move costs more than this, the label holds its
 * centre, and the box rule moves the box itself into the frame.
 */
export const TARGET_MOVE_PIXELS = 96;

/**
 * The plane point nearest `to` on the screen that is on region `id` and inside the
 * frame inset. The search goes out ring by ring and stops at the first ring that holds
 * one, so the point it returns is the least move the label can make. It gives up past
 * `limit` pixels.
 */
function nearestOnScreen(
  samples: FrameSamples,
  id: number,
  to: AnchorPoint,
  viewport: Viewport,
  limit: number,
): PlanePoint | null {
  for (const radius of NEAR_RADII) {
    if (radius > limit) return null;
    for (let turn = 0; turn < NEAR_TURNS; turn += 1) {
      const angle = (turn / NEAR_TURNS) * Math.PI * 2;
      const x = to.x + Math.cos(angle) * radius;
      const y = to.y + Math.sin(angle) * radius;
      if (
        x < LABEL_INSET ||
        y < LABEL_INSET ||
        x > viewport.width - LABEL_INSET ||
        y > viewport.height - LABEL_INSET
      ) {
        continue;
      }
      const point = samples.toPlane(x, y);
      if (point === null) continue;
      if (samples.regionAtPlane(point.x, point.z) === id) return point;
    }
  }
  return null;
}

/**
 * The time over which the smoothed target closes half the gap to the frame's own target,
 * in milliseconds.
 *
 * The sample grid is fixed on the screen, so it slides over the plane while the camera
 * moves and samples cross region edges. That makes the target of a frame step: over a
 * drag of 30 light years a frame it moves 3.3 CSS pixels in a middle frame, and it
 * changes that step by 2.2 pixels from one frame to the next.
 *
 * The anchor cannot take that out on its own. A filter slow enough to hold the noise back
 * is also slow to carry a label where it belongs, and the two needs pull against each
 * other. Smoothing the target first separates them: the anchor then follows a line that
 * already moves smoothly, and it can follow it at speed.
 *
 * A half-life of 71 milliseconds gives a share of 0.150 over a frame of 16.667
 * milliseconds, which is the share this rule held per frame. Over a drag of 30 light
 * years a frame it cuts the change of step of the label from 0.45 CSS pixels in a middle
 * frame to 0.09, and the worst frame from 2.9 to 0.8.
 */
export const TARGET_HALF_LIFE_MS = 71;

/** The share of the gap the smoothed target takes over a frame of `seconds`. */
export function targetShare(seconds: number): number {
  return 1 - 0.5 ** ((seconds * 1000) / TARGET_HALF_LIFE_MS);
}

/**
 * How far the smoothed target may move over the map in one second, in CSS pixels.
 *
 * A label rides the map. The move the map itself makes under the label is free, and this
 * is the whole of what the label may add to it. A label can therefore never cross the
 * frame in one frame while the galaxy under it holds still, and it can never overtake the
 * galaxy by more than one 1080 row frame in 0.9 seconds.
 *
 * The cap is `ANCHOR_MAX_SPEED`, the cap the anchor stage runs under. The target then
 * never asks the anchor for more than the anchor may give, so the two stages cannot
 * fight. The cap, and not the half life, set the speed of a handover: at a gap of 300 CSS
 * pixels the share of `TARGET_HALF_LIFE_MS` asks for 45 CSS pixels in a 16.667
 * millisecond frame, and the old cap of 120 allowed 2.0.
 */
export const TARGET_DRIFT_PIXELS = 1200;

/** How many times the drift cut halves its range while it solves the share. */
const DRIFT_PASSES = 24;

/** What the smoothed target of one region reads. */
export interface TargetFilter {
  /**
   * The plane point the frame before carried, or undefined to take the target whole.
   * The caller passes it only while it still sits on the region, still projects inside
   * the frame and the frame is not a view jump.
   */
  readonly carried?: PlanePoint | undefined;
  /**
   * Where that carried point projected in the frame before, in CSS pixels. The drift cap
   * reads it to tell the map's own motion from the label's drift over the map.
   */
  readonly carriedScreen?: AnchorPoint | undefined;
  /** The target this frame's own rules name. */
  readonly target: PlanePoint;
  /** A plane point projected to the screen. */
  readonly toScreen: (x: number, z: number) => AnchorPoint | null;
  /** True where a plane point sits on the label's own region. */
  readonly onRegion: (x: number, z: number) => boolean;
  /**
   * The unit step the flow field names at a plane point, or null where it names none.
   * The smoothed point takes it where the straight step leaves the region.
   */
  readonly flowStep?:
    ((x: number, z: number) => readonly [number, number] | null) | undefined;
  /** The time this frame covers, in seconds. */
  readonly seconds: number;
}

/** How many times a step along the flow field is scaled before it takes what it has. */
const FIELD_PASSES = 8;

/**
 * A plane point one step from `from` along a unit plane direction, whose projection sits
 * `want` CSS pixels from the projection of `from`.
 *
 * The step is read on the screen and not on the plane, because a plane step of a fixed
 * size covers a different number of pixels at every zoom, and the projection is not
 * linear. `guess` is a plane length already known to move about `want` pixels, which is
 * the straight step the caller asked for, so the loop starts near its answer. Each pass
 * reads what the length really moved and corrects it, up as well as down.
 */
function stepAlongField(
  from: PlanePoint,
  fromScreen: AnchorPoint,
  direction: readonly [number, number],
  want: number,
  guess: number,
  toScreen: (x: number, z: number) => AnchorPoint | null,
): PlanePoint | null {
  if (!(want > 0) || !(guess > 0)) return null;
  let length = guess;
  let point: PlanePoint | null = null;
  for (let pass = 0; pass < FIELD_PASSES; pass += 1) {
    const at: PlanePoint = {
      x: from.x + direction[0] * length,
      z: from.z + direction[1] * length,
    };
    const screen = toScreen(at.x, at.z);
    if (screen === null) return point;
    point = at;
    const went = Math.hypot(screen.x - fromScreen.x, screen.y - fromScreen.y);
    if (went === 0) return point;
    if (Math.abs(went - want) <= STEP_TOLERANCE) return point;
    length *= want / went;
  }
  return point;
}

/**
 * A point one step along the flow field from `from` that stays on the region, or null
 * where no such step is found.
 *
 * The field names a step between two **cell centres**, and the point sits anywhere in
 * its own cell, so a diagonal step can clip the corner of a cell the region does not
 * hold. Three headings are tried in order: the field's own step, and then its part along
 * each axis alone, which are the two cells the diagonal passes between. Each heading is
 * shortened by halving where the whole of it leaves the region, because a short enough
 * step from a point on the region stays on it.
 */
function stepOnRegion(
  from: PlanePoint,
  fromScreen: AnchorPoint,
  step: readonly [number, number],
  want: number,
  guess: number,
  toScreen: (x: number, z: number) => AnchorPoint | null,
  onRegion: (x: number, z: number) => boolean,
): PlanePoint | null {
  const headings: (readonly [number, number])[] = [step];
  if (step[0] !== 0 && step[1] !== 0) {
    headings.push([Math.sign(step[0]), 0], [0, Math.sign(step[1])]);
  }
  for (const heading of headings) {
    let along = stepAlongField(from, fromScreen, heading, want, guess, toScreen);
    for (let pass = 0; pass < REGION_PASSES && along !== null; pass += 1) {
      if (onRegion(along.x, along.z)) return along;
      along = {
        x: from.x + (along.x - from.x) / 2,
        z: from.z + (along.z - from.z) / 2,
      };
    }
  }
  return null;
}

/**
 * The target the anchor moves toward: this frame's target, smoothed against the one the
 * frame before carried.
 *
 * `target` is taken whole when there is nothing carried. Otherwise the smoothed target
 * takes `targetShare` of the gap, and the **drift cap** holds what that share may do: the
 * move of the smoothed target on the screen is at most `carry + TARGET_DRIFT_PIXELS *
 * seconds` CSS pixels, where `carry` is how far the map moved the carried point between
 * the frame before and this frame. Where the share asks for more, the move is cut to that
 * bound along the line to the frame's own target.
 *
 * The cut is solved on the projection and not on the plane, because a plane step of a
 * fixed size covers a different number of pixels at every zoom and the projection is not
 * linear.
 *
 * Where the smoothed point falls on another region, the point follows the **flow field**
 * instead. A region is not a convex shape and it can show as two separated patches, so
 * the straight line on the plane from the carried point to this frame's target can run
 * over a third region. The field names a step inside the region toward the region's own
 * centre, so the point walks around whatever lies between the two.
 *
 * The step along the field covers the same screen distance the straight step asked for,
 * so the target moves at the speed it always did and only its heading changes.
 *
 * Where the field names no step, which is a cell it marks as the end of a path or a cell
 * outside the grid, the carried point is kept. Taking this frame's target instead would
 * carry the label to the other patch in one frame, which is the jump the smoothing is
 * there to stop.
 */
export function smoothTarget(filter: TargetFilter): PlanePoint {
  const { carried, target, toScreen, onRegion, seconds } = filter;
  if (carried === undefined) return target;
  const from = toScreen(carried.x, carried.z);
  const to = toScreen(target.x, target.z);
  if (from === null || to === null) return target;

  const before = filter.carriedScreen ?? from;
  const carry = Math.hypot(from.x - before.x, from.y - before.y);
  const limit = carry + TARGET_DRIFT_PIXELS * seconds;

  const pointAt = (share: number): PlanePoint => ({
    x: carried.x + (target.x - carried.x) * share,
    z: carried.z + (target.z - carried.z) * share,
  });
  const moveOf = (share: number): number => {
    const point = pointAt(share);
    const where = toScreen(point.x, point.z);
    if (where === null) return Infinity;
    return Math.hypot(where.x - before.x, where.y - before.y);
  };

  let share = targetShare(seconds);
  if (share > 0 && moveOf(share) > limit) {
    // A share of 0 moves the target to where it already is, so it always holds the
    // bound. The share that reaches the bound lies between that and the share asked for.
    let low = 0;
    let high = share;
    for (let pass = 0; pass < DRIFT_PASSES; pass += 1) {
      const middle = (low + high) / 2;
      if (moveOf(middle) > limit) high = middle;
      else low = middle;
    }
    share = low;
  }
  if (share <= 0) return carried;

  const smoothed = pointAt(share);
  if (onRegion(smoothed.x, smoothed.z)) return smoothed;

  const step = filter.flowStep?.(carried.x, carried.z) ?? null;
  if (step === null) return carried;
  const straight = toScreen(smoothed.x, smoothed.z);
  if (straight === null) return carried;
  const want = Math.hypot(straight.x - from.x, straight.y - from.y);
  const guess = Math.hypot(smoothed.x - carried.x, smoothed.z - carried.z);
  const along = stepOnRegion(carried, from, step, want, guess, toScreen, onRegion);
  return along ?? carried;
}

/**
 * The time over which the anchor closes half the gap to its target, in milliseconds.
 *
 * The rate is high, so a label that must really move goes where it belongs at once: a
 * half-life of 16.667 milliseconds closes half the gap over a frame of 60 a second, which
 * is the share of 0.5 this rule held per frame, and 97 percent of the gap in 83
 * milliseconds.
 */
export const ANCHOR_HALF_LIFE_MS = 16.667;

/** The share of the gap the anchor closes over a frame of `seconds`, at full speed. */
export function anchorShare(seconds: number): number {
  return 1 - 0.5 ** ((seconds * 1000) / ANCHOR_HALF_LIFE_MS);
}

/** How far the anchor goes on the screen in one second, in CSS pixels. */
export const ANCHOR_MAX_SPEED = 1200;

/** How far the anchor goes on the screen over a frame of `seconds`, in CSS pixels. */
export function anchorCap(seconds: number): number {
  return ANCHOR_MAX_SPEED * seconds;
}

/**
 * The least the anchor goes on the screen in one second, in CSS pixels, while it is not
 * already there.
 *
 * Speed falls with the gap, so without a floor the last few pixels take hundreds of
 * frames. The floor is small enough to stay under the noise and large enough to close a
 * 20 pixel gap in a second.
 */
export const ANCHOR_LEAST_SPEED = 24;

/** The least the anchor goes over a frame of `seconds`, in CSS pixels. */
export function anchorFloor(seconds: number): number {
  return ANCHOR_LEAST_SPEED * seconds;
}

/**
 * The screen gap, in CSS pixels, at which the anchor reaches full speed. Below it the
 * speed falls with the gap.
 *
 * The anchor is read from a grid of samples that is fixed on the screen. The grid slides
 * over the plane while the camera moves, so samples cross region edges and the target a
 * frame works out does not move smoothly: over a drag of 30 light years a frame, the
 * target steps 3.3 CSS pixels in a middle frame, and it changes that step by 2.2 pixels
 * from one frame to the next.
 *
 * A speed that does not read the gap gives all of that to the label, and the label
 * shakes. A speed that falls with the gap separates the two things the filter must do. A
 * large gap is a real move, and it still runs at the full share and reaches the cap. A
 * small gap is the noise, and the label answers it slowly: the change of step from frame
 * to frame falls from 1.0 pixels to 0.45, and the worst tenth from 3.0 to 1.3.
 *
 * The figure is 48 because a region that shows as two patches steps its target 48 pixels
 * when a patch comes into view. That step is the smallest real move the filter must
 * answer at full speed.
 */
export const ANCHOR_FULL_SPEED_PIXELS = 48;

/**
 * How far past each edge of the frame a carried point stays in reach, as a share of the
 * frame. A wheel held down changes the camera distance by 15 percent in a frame, which
 * moves the anchor of a label at the edge a little past it; that point must be kept and
 * walked back, or the label jumps. A camera that jumps to another view leaves the anchor
 * a whole frame away or more, and to walk that back at the cap reads as a crawl.
 */
export const ANCHOR_REACH_SHARE = 0.25;

/** How many times the step is scaled before it takes what it has. */
const CAP_PASSES = 8;
/** How near the wanted step the solved step must come, in CSS pixels. */
const STEP_TOLERANCE = 0.05;

/** The number of times the anchor step gets shorter to stay on its own region. */
const REGION_PASSES = 6;

/**
 * How far the anchor goes on the screen over a frame of `seconds`, in CSS pixels, for a
 * gap of `gap`.
 */
export function anchorStep(gap: number, seconds: number): number {
  const speed =
    gap * anchorShare(seconds) * Math.min(1, gap / ANCHOR_FULL_SPEED_PIXELS);
  return Math.min(
    anchorCap(seconds),
    Math.max(Math.min(gap, anchorFloor(seconds)), speed),
  );
}

/**
 * The plane point a carried anchor takes in this frame. It moves toward the target by
 * `anchorStep` of the gap between them.
 *
 * The gap and the step are both read on the projection and not on the plane, because a
 * plane step of a fixed size covers a different number of pixels at every zoom. The
 * function projects the carried point and the target, reads the step from the gap
 * between them, and takes that share of the plane gap. The projection is not linear, so
 * it then projects the end of the step and scales the step by the ratio of what it wants
 * to what it got, up to `CAP_PASSES` times. Each pass is nearer the step than the one
 * before.
 *
 * A point that does not project takes the target whole. There is nothing to measure a
 * gap on, and a label that holds a point off the screen is dropped by the caller.
 */
export function filterAnchor(
  carried: PlanePoint,
  target: PlanePoint,
  toScreen: (x: number, z: number) => AnchorPoint | null,
  seconds: number,
  onRegion: (x: number, z: number) => boolean = () => true,
  flowStep: (x: number, z: number) => readonly [number, number] | null = () => null,
): PlanePoint {
  const from = toScreen(carried.x, carried.z);
  const to = toScreen(target.x, target.z);
  if (from === null || to === null) return target;

  const gap = Math.hypot(to.x - from.x, to.y - from.y);
  if (gap === 0) return carried;
  const want = anchorStep(gap, seconds);
  // A frame that covers no time moves no label. Every call outside the frame loop passes
  // 0 seconds, so a redraw holds the picture the loop last built.
  if (want <= 0) return carried;

  // The share of the plane gap that moves the anchor `want` pixels on the screen. The
  // projection is not linear, so the first guess is only a guess, and it is wrong in both
  // directions: near the camera the same share of the plane covers far fewer pixels than
  // it does far from it. The loop reads what the share really moved and corrects it, up
  // as well as down, until the step is the one `anchorStep` asked for.
  //
  // An earlier loop corrected downward alone. It made the label crawl at a close camera,
  // where the first guess undershoots: the label took over a second to cross the frame
  // rather than the 12 frames the cap allows.
  let share = Math.min(1, want / gap);
  for (let pass = 0; pass < CAP_PASSES; pass += 1) {
    const at = toScreen(
      carried.x + (target.x - carried.x) * share,
      carried.z + (target.z - carried.z) * share,
    );
    if (at === null) break;
    const went = Math.hypot(at.x - from.x, at.y - from.y);
    if (went === 0) break;
    if (Math.abs(went - want) <= STEP_TOLERANCE) break;
    share = Math.min(1, share * (want / went));
  }

  // A region is not always a convex shape, so the straight line from the carried point
  // to the target can go over a neighbour. A shorter step keeps the anchor on its own
  // region where one does.
  const solved = share;
  for (let pass = 0; pass < REGION_PASSES; pass += 1) {
    const step = {
      x: carried.x + (target.x - carried.x) * share,
      z: carried.z + (target.z - carried.z) * share,
    };
    if (onRegion(step.x, step.z)) return step;
    share /= 2;
  }

  // Where no shorter step does, the step follows the flow field, scaled to the screen
  // distance the straight step asked for. The anchor then walks around what lies between
  // it and its target rather than pressing into the edge that stops it.
  const step = flowStep(carried.x, carried.z);
  if (step !== null) {
    const guess = Math.hypot(
      (target.x - carried.x) * solved,
      (target.z - carried.z) * solved,
    );
    const along = stepOnRegion(carried, from, step, want, guess, toScreen, onRegion);
    if (along !== null) return along;
  }

  // Where the field names no step, the straight step stands: the target is always on the
  // region, so the anchor comes back to the region as it walks.
  return {
    x: carried.x + (target.x - carried.x) * solved,
    z: carried.z + (target.z - carried.z) * solved,
  };
}

/**
 * The candidates of a frame, in the order they take a place. A region is a candidate
 * when it holds at least 1 percent of the landed samples, so a region with nothing on
 * screen is never one. A region that carried a label in the frame before stays a
 * candidate until its share falls below half of that, so a region sitting on the
 * threshold does not blink.
 *
 * The anchor is worked out on the galactic plane and then projected. It is the mean of
 * the plane positions of the region's samples, and where the region under that mean is
 * another region it is the plane position of the sample the region itself holds nearest
 * the mean: a region can show as two separated patches, and the mean of those falls
 * between them.
 *
 * The plane is what makes the anchor move. The sample grid is fixed in screen space, so
 * anything averaged or chosen in screen space changes only when a sample crosses a
 * region edge: it holds still and then steps. A plane position moves with the camera, so
 * its projection slides.
 *
 * An anchor carried from the frame before moves toward the anchor this frame works out
 * by `anchorStep` of the gap. A large gap is a real move and runs at the full share and
 * the cap, so a label pushed to the frame edge is back at its region in under a second.
 * A small gap is the noise of the sampling, and the label answers it slowly and stays
 * still on the map. A carried point is kept while it is in front of the camera, and the
 * filter alone holds it right: the target is always on the region and inside the frame, so
 * an anchor that walks toward it comes back to both. A gate that drops the carried point
 * puts the label on the target in one step, which is what a person reads as a jump.
 *
 * The candidate holding the sample nearest the centre of the frame comes first, so the
 * region the view is centred on is always named. A count order alone does not name the
 * centre: at a view of the galactic centre the `Galactic Centre` holds fewer samples
 * than a dozen regions around it. The rest follow by sample count, most first, after the
 * count of a region that carried a label in the frame before is multiplied by
 * `CARRIED_BONUS`. The bonus is a margin against a swap on a near tie, not a priority: a
 * region that now fills the frame still overtakes one that is leaving it. The order
 * decides which label the overlap rule drops, so an order that changes between frames
 * makes the label set flicker.
 */
export function labelCandidates(
  samples: FrameSamples,
  viewport: Viewport,
  regions: readonly Region[] = REGIONS,
  memory: LabelMemory = NO_LABEL_MEMORY,
  measure?: (name: string) => LabelSize,
  timing: FrameTiming = STILL_FRAME,
): LabelCandidate[] {
  if (samples.count === 0) return [];
  const byId = new Map(regions.map((region) => [region.id, region]));
  const previous = memory.previous;

  const counts = new Int32Array(ID_RANGE);
  const sumPlaneX = new Float64Array(ID_RANGE);
  const sumPlaneZ = new Float64Array(ID_RANGE);
  for (let index = 0; index < samples.count; index += 1) {
    const id = samples.ids[index] as number;
    counts[id] += 1;
    sumPlaneX[id] += samples.planeX[index] as number;
    sumPlaneZ[id] += samples.planeZ[index] as number;
  }

  const least = CANDIDATE_SHARE * samples.count;
  const kept = HELD_SHARE * samples.count;
  const wanted = new Uint8Array(ID_RANGE);
  for (let id = 1; id < ID_RANGE; id += 1) {
    if ((counts[id] as number) <= 0) continue;
    if (!byId.has(id)) continue;
    const enough = previous.has(id) ? kept : least;
    if ((counts[id] as number) < enough) continue;
    wanted[id] = 1;
  }

  // One pass finds, for every candidate, the sample of its own region whose plane
  // position is nearest the mean of them, and the sample nearest the centre of the
  // frame. The first is measured on the plane and the second on the screen, because the
  // centre of the frame is a screen position.
  const centreX = viewport.width / 2;
  const centreY = viewport.height / 2;
  const bestToMean = new Float64Array(ID_RANGE).fill(Infinity);
  const anchorIndex = new Int32Array(ID_RANGE).fill(-1);
  let nearestCentreId = NO_REGION_ID;
  let nearestCentreRange = Infinity;
  for (let index = 0; index < samples.count; index += 1) {
    const id = samples.ids[index] as number;
    if (wanted[id] !== 1) continue;

    const meanX = (sumPlaneX[id] as number) / (counts[id] as number);
    const meanZ = (sumPlaneZ[id] as number) / (counts[id] as number);
    const toMean =
      ((samples.planeX[index] as number) - meanX) ** 2 +
      ((samples.planeZ[index] as number) - meanZ) ** 2;
    if (toMean < (bestToMean[id] as number)) {
      bestToMean[id] = toMean;
      anchorIndex[id] = index;
    }

    const toCentre =
      ((samples.x[index] as number) - centreX) ** 2 +
      ((samples.y[index] as number) - centreY) ** 2;
    if (toCentre < nearestCentreRange) {
      nearestCentreRange = toCentre;
      nearestCentreId = id;
    }
  }

  // A carried target is kept while it is inside this reach, which is the frame grown by
  // `ANCHOR_REACH_SHARE` of it on each side. A zoom magnifies the view, so a point that
  // sits on the centre of its region can go off the frame while the region itself stays
  // in view. To drop such a target puts the label on a new one in one step, which reads
  // as a jump. A target further out than the reach is stale, so the rule drops that one.
  // The carried anchor below takes the same reach, for the same two reasons.
  const reachX = viewport.width * ANCHOR_REACH_SHARE;
  const reachY = viewport.height * ANCHOR_REACH_SHARE;
  const nearFrame = (point: AnchorPoint): boolean =>
    point.x >= -reachX &&
    point.y >= -reachY &&
    point.x <= viewport.width + reachX &&
    point.y <= viewport.height + reachY;

  const candidates: LabelCandidate[] = [];
  for (let id = 1; id < ID_RANGE; id += 1) {
    const index = anchorIndex[id] as number;
    if (index < 0) continue;
    const region = byId.get(id);
    if (region === undefined) continue;

    // The label belongs at the centre of its region. The centroid is a fixed point of
    // the galaxy, so a label on it does not move over the map at all: its projection
    // slides with the camera and nothing else moves it. The frame's own samples are read
    // only where the centre is not there to use.
    const found = regionTarget(
      id,
      region,
      samples,
      viewport,
      {
        meanX: (sumPlaneX[id] as number) / (counts[id] as number),
        meanZ: (sumPlaneZ[id] as number) / (counts[id] as number),
        sampleIndex: index,
      },
      memory.centres.has(id),
    );
    // The box must not cross the edge of the region, or the label reads as belonging to
    // the region beside it.
    const target =
      measure === undefined
        ? found.point
        : fitInsideRegion(found.point, id, measure(region.name), samples, viewport);

    // The target is smoothed against the one the frame before carried, so the anchor
    // follows a line that already moves smoothly. A carried target that no longer sits
    // on its region, or that goes out of reach of the frame, is dropped by the same two
    // rules the carried anchor follows below.
    //
    // A frame the caller marks as a view jump drops the carried target and takes this
    // frame's own target whole. A jump is another place and not a movement to it, so a
    // target held from the frame before would make the label walk the width of the
    // screen to catch up.
    let held = timing.jump ? undefined : memory.targets.get(id);
    if (held !== undefined) {
      const where = samples.toScreen(held.x, held.z);
      if (
        samples.regionAtPlane(held.x, held.z) !== id ||
        where === null ||
        !nearFrame(where)
      ) {
        held = undefined;
      }
    }
    const smoothed = smoothTarget({
      carried: held,
      carriedScreen: held === undefined ? undefined : memory.targetScreens.get(id),
      target,
      toScreen: samples.toScreen,
      onRegion: (x, z) => samples.regionAtPlane(x, z) === id,
      flowStep: samples.flowStepAtPlane,
      seconds: timing.seconds,
    });

    // A point is carried from the frame before while it stays in front of the camera and
    // in reach of the frame. The filter, and not a gate, holds it on its own region: the
    // target is always on the region, so an anchor that walks toward it comes back.
    //
    // The reach is `ANCHOR_REACH_SHARE` of the frame on each side. A zoom magnifies the
    // view, so the anchor of a label near the edge goes a little off the frame while the
    // region stays
    // in view; to drop it there puts the label on the target in one step, which is the
    // jump. A camera that jumps leaves the anchor many frames away, and to walk that back
    // at the cap takes about half a second, which reads as a crawl. The margin separates
    // the two.
    let plane = smoothed;
    const carried = memory.anchors.get(id);
    if (carried !== undefined) {
      const projected = samples.toScreen(carried.x, carried.z);
      if (projected !== null && nearFrame(projected)) {
        plane = filterAnchor(
          carried,
          smoothed,
          samples.toScreen,
          timing.seconds,
          (x, z) => samples.regionAtPlane(x, z) === id,
          samples.flowStepAtPlane,
        );
      }
    }

    const screen = samples.toScreen(plane.x, plane.z);
    if (screen === null) continue;
    candidates.push({
      id,
      name: region.name,
      count: counts[id] as number,
      plane,
      target: smoothed,
      targetScreen: samples.toScreen(smoothed.x, smoothed.z),
      centre: found.centre,
      // The drawn anchor is held inside the frame, and not inside the inset. The inset
      // is where the target rule puts a label that must move, and to hold the drawn
      // anchor there as well pins a label near the edge to one place on the screen while
      // the map slides under it. `labelBox` moves the box itself fully into the frame,
      // so a label at the edge stays readable and still slides with its region.
      anchor: {
        x: clamp(screen.x, 0, viewport.width),
        y: clamp(screen.y, 0, viewport.height),
      },
    });
  }

  const weightOf = (candidate: LabelCandidate): number =>
    previous.has(candidate.id) ? candidate.count * CARRIED_BONUS : candidate.count;
  // The id settles a tie, so the order is total and two frames that hold the same
  // counts give the same order.
  candidates.sort((first, second) => {
    const byWeight = weightOf(second) - weightOf(first);
    if (byWeight !== 0) return byWeight;
    return first.id - second.id;
  });
  const first = candidates.findIndex((candidate) => candidate.id === nearestCentreId);
  if (first > 0) candidates.unshift(...candidates.splice(first, 1));
  return candidates;
}

/** The box of a label centred on its anchor, moved to lie inside the viewport. */
function labelBox(anchor: AnchorPoint, size: LabelSize, viewport: Viewport): LabelBox {
  return {
    left: clamp(anchor.x - size.width / 2, 0, viewport.width - size.width),
    top: clamp(anchor.y - size.height / 2, 0, viewport.height - size.height),
    width: size.width,
    height: size.height,
  };
}

/** True when two boxes share an area. */
export function boxesOverlap(first: LabelBox, second: LabelBox): boolean {
  return (
    first.left < second.left + second.width &&
    second.left < first.left + first.width &&
    first.top < second.top + second.height &&
    second.top < first.top + first.height
  );
}

/**
 * The labels the page shows for the samples of one frame. A label that would overlap a
 * placed one is dropped, and at most 12 are placed. The caller gives what the frame
 * before held, so the placement itself holds no state.
 */
export function chooseLabels(
  samples: FrameSamples,
  viewport: Viewport,
  measure: (name: string) => LabelSize,
  regions: readonly Region[] = REGIONS,
  memory: LabelMemory = NO_LABEL_MEMORY,
  timing: FrameTiming = STILL_FRAME,
): PlacedLabel[] {
  const placed: PlacedLabel[] = [];
  for (const candidate of labelCandidates(
    samples,
    viewport,
    regions,
    memory,
    measure,
    timing,
  )) {
    if (placed.length >= MAX_LABELS) break;
    const box = labelBox(candidate.anchor, measure(candidate.name), viewport);
    if (placed.some((other) => boxesOverlap(box, other))) continue;
    placed.push({
      id: candidate.id,
      name: candidate.name,
      plane: candidate.plane,
      target: candidate.target,
      targetScreen: candidate.targetScreen,
      centre: candidate.centre,
      ...box,
    });
  }
  return placed;
}

/** What the sweep and the placement have cost since the last reset. */
export interface SamplingStats {
  /** How many frames the label work ran. */
  readonly frames: number;
  /** The mean time of the sweep and the placement of one frame, in milliseconds. */
  readonly meanMs: number;
  /** The time of the longest single frame of that work, in milliseconds. */
  readonly worstMs: number;
}

/** The overlay that holds the label elements. */
export interface LabelOverlay {
  /**
   * Takes the coarse region grid the sweep reads and the flow field over it. Nothing is
   * placed before them.
   */
  setGrid(grid: CoarseRegionGrid, flow: Uint8Array): void;
  /**
   * Places the labels of a view, or clears them when the switch is off.
   *
   * `timing.seconds` is the time the frame covers, and every rate of the filter reads
   * it. **Every call outside the frame loop passes 0**, so a redraw holds the labels
   * where the loop last put them. `timing.jump` is true where the caller wrote the view
   * rather than moved it.
   */
  update(view: View, viewport: Viewport, on: boolean, timing: FrameTiming): void;
  /** The sample counts of the last frame the sweep ran, by region id. */
  lastCounts(): {
    readonly id: number;
    readonly name: string;
    readonly count: number;
  }[];
  /** How many samples of the last frame landed on the plane. */
  lastSampleCount(): number;
  /** The mean sweep time since the last reset, for the budget test. */
  sampling(): SamplingStats;
  /** Starts the sweep time mean again. */
  resetSampling(): void;
}

/**
 * Builds the label overlay in an element. The builder measures every region name once,
 * with the element's own style, and then keeps one element per region to reuse.
 */
export function createLabelOverlay(
  host: HTMLElement,
  regions: readonly Region[] = REGIONS,
): LabelOverlay {
  const elements = new Map<number, HTMLElement>();
  const sizes = new Map<string, LabelSize>();
  for (const region of regions) {
    const element = host.ownerDocument.createElement('div');
    element.className = 'region-label';
    // Over every plane element. `src/app/plane-overlay.ts` states the rule. The host
    // styles `.region-label` and the library writes the place, so the level is written
    // here beside the place and not left to a rule the host may not carry.
    element.style.zIndex = '1';
    element.dataset['regionId'] = String(region.id);
    element.textContent = region.name;
    elements.set(region.id, element);
  }

  // A name is measured the first time a view asks for it, not at the start, so the
  // page lays out the few labels a view holds rather than all 42 before the first
  // frame. The box is rounded up, so a label held against the frame edge by the whole
  // pixel of its style still lies inside the viewport by its measured box.
  const measureById = (id: number, name: string): LabelSize => {
    const known = sizes.get(name);
    if (known !== undefined) return known;
    const element = elements.get(id);
    if (element === undefined) return { width: 0, height: 0 };
    const attached = element.parentNode !== null;
    if (!attached) {
      element.style.visibility = 'hidden';
      host.append(element);
    }
    const box = element.getBoundingClientRect();
    const size = { width: Math.ceil(box.width), height: Math.ceil(box.height) };
    if (!attached) {
      element.remove();
      element.style.visibility = '';
    }
    sizes.set(name, size);
    return size;
  };
  const byName = new Map(regions.map((region) => [region.name, region.id]));
  const measure = (name: string): LabelSize => measureById(byName.get(name) ?? 0, name);

  let grid: CoarseRegionGrid | null = null;
  let flow: Uint8Array | null = null;
  let shown: PlacedLabel[] = [];
  // What the frame before held. The overlay owns this state and the placement reads it
  // as an argument, so the rules of the placement stay testable without a page.
  let memory: LabelMemory = NO_LABEL_MEMORY;
  let last: FrameSamples | null = null;
  let pool: SampleBuffers | null = null;
  let frames = 0;
  let totalMs = 0;
  let worstMs = 0;

  return {
    setGrid(next: CoarseRegionGrid, nextFlow: Uint8Array): void {
      grid = next;
      flow = nextFlow;
    },
    update(view: View, viewport: Viewport, on: boolean, timing: FrameTiming): void {
      let labels: PlacedLabel[] = [];
      // The sweep runs only where a label could be read: the zoom fade is above 0 and
      // some plane point of the frame is beyond the range floor. A frame in which every
      // label would draw at opacity 0 has no reason to pay the 2 milliseconds.
      if (on && grid !== null && labelSweepRuns(view, viewport)) {
        // The reading covers the sweep and the placement, which is the whole cost the
        // labels put on the main thread before the elements move. `elapsedMs` covers
        // the sweep alone, so the placement would sit in no measured window.
        pool = fitSampleBuffers(pool, samplePointCount(viewport));
        const started = performance.now();
        const samples = sampleFrame(view, viewport, grid, pool, flow);
        last = samples;
        labels = chooseLabels(samples, viewport, measure, regions, memory, timing);
        const elapsed = performance.now() - started;
        frames += 1;
        totalMs += elapsed;
        if (elapsed > worstMs) worstMs = elapsed;
      }
      // A label fades exactly as the boundary at the same place fades: the frame's own
      // zoom fade times the range fade read at the label's own plane anchor. A label
      // whose product is 0 is left out of the overlay and not placed transparent, so
      // every reading of the page counts the labels a user can see.
      const zoom = labelFade(view.distance);
      const camera = cameraPosition(view);
      const opacities = new Map<number, number>();
      const drawn: PlacedLabel[] = [];
      for (const label of labels) {
        const range = Math.hypot(
          label.plane.x - camera[0],
          camera[1],
          label.plane.z - camera[2],
        );
        const opacity = zoom * labelRangeFade(range);
        if (opacity <= 0) continue;
        opacities.set(label.id, opacity);
        drawn.push(label);
      }

      const wanted = new Set(drawn.map((label) => label.id));
      for (const label of shown) {
        if (wanted.has(label.id)) continue;
        elements.get(label.id)?.remove();
      }
      // The fade goes on each region label and not on the host, because the host also
      // holds the selection pin, the hover ring and the marker name labels, and those do
      // not follow the region overlay's fade.
      for (const label of drawn) {
        const element = elements.get(label.id);
        if (element === undefined) continue;
        element.style.left = `${label.left}px`;
        element.style.top = `${label.top}px`;
        element.style.opacity = String(opacities.get(label.id) ?? 0);
        if (element.parentNode === null) host.append(element);
      }
      shown = drawn;
      // The placement carries every label it chose into the next frame, including the
      // ones the range fade left out, so a label that comes back does not start again.
      memory = rememberLabels(labels);
    },
    lastCounts(): { id: number; name: string; count: number }[] {
      const samples = last;
      if (samples === null) return [];
      const counts = new Int32Array(ID_RANGE);
      for (let index = 0; index < samples.count; index += 1) {
        counts[samples.ids[index] as number] += 1;
      }
      const rows: { id: number; name: string; count: number }[] = [];
      for (const region of regions) {
        const count = counts[region.id] as number;
        if (count > 0) rows.push({ id: region.id, name: region.name, count });
      }
      rows.sort((first, second) => second.count - first.count);
      return rows;
    },
    lastSampleCount(): number {
      return last === null ? 0 : last.count;
    },
    sampling(): SamplingStats {
      return { frames, meanMs: frames === 0 ? 0 : totalMs / frames, worstMs };
    },
    resetSampling(): void {
      frames = 0;
      totalMs = 0;
      worstMs = 0;
    },
  };
}
