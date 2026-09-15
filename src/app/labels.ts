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
  REGION_CLOSE_FULL,
  REGION_CLOSE_NONE,
  REGION_FADE_IN_FAR,
  REGION_FADE_IN_NEAR,
} from '../render/region-pass';
import {
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
 * How much of the label overlay draws at a zoom distance, 0 to 1. The labels take the
 * same band the boundary lines take, so a name and the boundary beside it always read at
 * the same strength. The constants come from the region pass, so no copy is made.
 */
export function labelFade(distance: number): number {
  return (
    smoothstep(REGION_CLOSE_NONE, REGION_CLOSE_FULL, distance) *
    (1 - smoothstep(REGION_FADE_IN_NEAR, REGION_FADE_IN_FAR, distance))
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
}

/** No label in the frame before, which is what a first frame reads. */
export const NO_LABEL_MEMORY: LabelMemory = {
  previous: new Set<number>(),
  anchors: new Map<number, PlanePoint>(),
  targets: new Map<number, PlanePoint>(),
};

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
): PlanePoint {
  const centre = { x: region.centroid[0], z: region.centroid[1] };
  const onCentre = samples.regionAtPlane(centre.x, centre.z) === id;
  const where = onCentre ? samples.toScreen(centre.x, centre.z) : null;
  // The centre rule holds while the centre projects inside the frame. Outside it the rule
  // says nothing useful: holding a projection that is far away inside the inset gives a
  // corner of the frame, and a corner carries nothing about where the region is. The
  // frame shows only a part of the region then, and its own samples answer that below.
  const inFrame =
    where !== null &&
    where.x >= 0 &&
    where.y >= 0 &&
    where.x <= viewport.width &&
    where.y <= viewport.height;
  if (where !== null && inFrame) {
    const held = {
      x: clamp(where.x, LABEL_INSET, viewport.width - LABEL_INSET),
      y: clamp(where.y, LABEL_INSET, viewport.height - LABEL_INSET),
    };
    if (held.x === where.x && held.y === where.y) return centre;

    // The centre has no room. Read the held point back to the plane, which is the least
    // move that gives the label room.
    const moved = samples.toPlane(held.x, held.y);
    if (moved !== null && samples.regionAtPlane(moved.x, moved.z) === id) return moved;

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
    if (near !== null) return near;
    return centre;
  }

  if (samples.regionAtPlane(frame.meanX, frame.meanZ) === id) {
    return { x: frame.meanX, z: frame.meanZ };
  }
  return {
    x: samples.planeX[frame.sampleIndex] as number,
    z: samples.planeZ[frame.sampleIndex] as number,
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
 * The share of the gap to this frame's target that the smoothed target takes.
 *
 * The target of a frame is the mean of the plane positions of the samples a region holds.
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
 * This is the share at the gap the grid gives a still region. `targetShare` grows it with
 * the gap, and the smoothed target holds about seven frames at this end of the range. Over
 * the same drag it cuts the change of step of the label from 0.45 CSS pixels in a middle
 * frame to 0.09, and the worst frame from 2.9 to 0.8.
 */
export const TARGET_SHARE = 0.15;

/**
 * The screen gap, in CSS pixels, at which the smoothing is gone and the target is taken
 * whole. Below it the share of the gap the smoothed target takes grows with the gap.
 *
 * Smoothing holds a label back where the target really moves. The figure is 120 because
 * it must separate two moves that the smoothing must answer differently. A camera that
 * jumps moves the target of a label 145 CSS pixels, and that label must go at once. The
 * step the sample grid gives a still region is a few pixels, and that one reads better
 * smoothed over seven frames.
 *
 * The share grows over the range and does not step at one figure. A step is a gate, and a
 * gate that fires puts the label somewhere else in one frame, which is the jump this
 * whole filter is there to stop.
 */
export const TARGET_RESET_PIXELS = 120;

/**
 * The share of the gap that the smoothed target takes, for a screen gap of `gap`.
 *
 * At a gap of the size the sample grid gives a still region the share is near
 * `TARGET_SHARE`, and the smoothed target holds about seven frames. At
 * `TARGET_RESET_PIXELS` the share is 1 and the target is taken whole.
 *
 * The share follows the cube of the reach, and not the reach itself. A share that follows
 * the reach gives too much of a gap of 30 or 60 pixels to the label at once: the worst
 * frame of a drag went from 5.8 CSS pixels to 10.9 in the measure. The cube holds the
 * smoothing over the whole range a drag works in, and opens it only near the figure where
 * the target has really moved.
 */
export function targetShare(gap: number): number {
  const reach = Math.min(1, gap / TARGET_RESET_PIXELS);
  return TARGET_SHARE + (1 - TARGET_SHARE) * reach ** 3;
}

/**
 * The target the anchor moves toward: this frame's target, smoothed against the one the
 * frame before carried. The caller passes `carried` only while it still sits on the
 * region and still projects inside the frame.
 *
 * `target` is taken whole when there is nothing carried, and when the two are
 * `TARGET_RESET_PIXELS` or more apart on the screen. `targetShare` sets the share
 * between: the wider the gap, the more of it the smoothed target takes.
 *
 * Where the smoothed point falls on another region, the carried point is kept. A region
 * can show as two separated patches, and the point between this frame's target and the
 * one before then falls in the gap. Taking this frame's target instead would carry the
 * label to the other patch in one frame, which is the jump the smoothing is there to
 * stop. Holding the carried point keeps the label on the patch it is on until the target
 * is near enough to move to.
 */
export function smoothTarget(
  carried: PlanePoint | undefined,
  target: PlanePoint,
  toScreen: (x: number, z: number) => AnchorPoint | null,
  onRegion: (x: number, z: number) => boolean,
): PlanePoint {
  if (carried === undefined) return target;
  const from = toScreen(carried.x, carried.z);
  const to = toScreen(target.x, target.z);
  if (from === null || to === null) return target;
  const share = targetShare(Math.hypot(to.x - from.x, to.y - from.y));
  if (share >= 1) return target;

  const smoothed = {
    x: carried.x + (target.x - carried.x) * share,
    z: carried.z + (target.z - carried.z) * share,
  };
  return onRegion(smoothed.x, smoothed.z) ? smoothed : carried;
}

/**
 * The share of the gap to the target that the anchor closes in one frame, at full speed.
 *
 * The share is high, so a label that must really move goes where it belongs at once: 0.5
 * closes half the gap in one frame and 97 percent of it in five, which is 83
 * milliseconds at 60 frames a second.
 */
export const ANCHOR_SHARE = 0.5;

/** How far the anchor goes on the screen in one frame, in CSS pixels. */
export const ANCHOR_MAX_PIXELS = 20;

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
 * The least the anchor goes on the screen in one frame, in CSS pixels, while it is not
 * already there.
 *
 * Speed falls with the gap, so without a floor the last few pixels take hundreds of
 * frames. The floor is small enough to stay under the noise and large enough to close a
 * 20 pixel gap in a second.
 */
export const ANCHOR_LEAST_PIXELS = 0.4;

/**
 * How far past each edge of the frame a carried point stays in reach, as a share of the
 * frame. A wheel notch changes the camera distance by 15 percent in one frame, which
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
 * How far the anchor goes on the screen in one frame, in CSS pixels, for a gap of `gap`.
 */
export function anchorStep(gap: number): number {
  const speed = gap * ANCHOR_SHARE * Math.min(1, gap / ANCHOR_FULL_SPEED_PIXELS);
  return Math.min(
    ANCHOR_MAX_PIXELS,
    Math.max(Math.min(gap, ANCHOR_LEAST_PIXELS), speed),
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
  onRegion: (x: number, z: number) => boolean = () => true,
): PlanePoint {
  const from = toScreen(carried.x, carried.z);
  const to = toScreen(target.x, target.z);
  if (from === null || to === null) return target;

  const gap = Math.hypot(to.x - from.x, to.y - from.y);
  if (gap === 0) return carried;
  const want = anchorStep(gap);

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
  // region where one does. Where none does, the step stands as it is: the target is
  // always on the region, so the anchor comes back to the region as it walks.
  const solved = share;
  for (let pass = 0; pass < REGION_PASSES; pass += 1) {
    const step = {
      x: carried.x + (target.x - carried.x) * share,
      z: carried.z + (target.z - carried.z) * share,
    };
    if (onRegion(step.x, step.z)) return step;
    share /= 2;
  }
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
    const found = regionTarget(id, region, samples, viewport, {
      meanX: (sumPlaneX[id] as number) / (counts[id] as number),
      meanZ: (sumPlaneZ[id] as number) / (counts[id] as number),
      sampleIndex: index,
    });
    // The box must not cross the edge of the region, or the label reads as belonging to
    // the region beside it.
    const target =
      measure === undefined
        ? found
        : fitInsideRegion(found, id, measure(region.name), samples, viewport);

    // The target is smoothed against the one the frame before carried, so the anchor
    // follows a line that already moves smoothly. A carried target that no longer sits
    // on its region, or that goes out of reach of the frame, is dropped by the same two
    // rules the carried anchor follows below.
    let held = memory.targets.get(id);
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
    const smoothed = smoothTarget(
      held,
      target,
      samples.toScreen,
      (x, z) => samples.regionAtPlane(x, z) === id,
    );

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
          (x, z) => samples.regionAtPlane(x, z) === id,
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
): PlacedLabel[] {
  const placed: PlacedLabel[] = [];
  for (const candidate of labelCandidates(
    samples,
    viewport,
    regions,
    memory,
    measure,
  )) {
    if (placed.length >= MAX_LABELS) break;
    const box = labelBox(candidate.anchor, measure(candidate.name), viewport);
    if (placed.some((other) => boxesOverlap(box, other))) continue;
    placed.push({
      id: candidate.id,
      name: candidate.name,
      plane: candidate.plane,
      target: candidate.target,
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
  /** Takes the coarse region grid the sweep reads. Nothing is placed before it. */
  setGrid(grid: CoarseRegionGrid): void;
  /** Places the labels of a view, or clears them when the switch is off. */
  update(view: View, viewport: Viewport, on: boolean): void;
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
    setGrid(next: CoarseRegionGrid): void {
      grid = next;
    },
    update(view: View, viewport: Viewport, on: boolean): void {
      let labels: PlacedLabel[] = [];
      if (on && grid !== null && labelFade(view.distance) > 0) {
        // The reading covers the sweep and the placement, which is the whole cost the
        // labels put on the main thread before the elements move. `elapsedMs` covers
        // the sweep alone, so the placement would sit in no measured window.
        pool = fitSampleBuffers(pool, samplePointCount(viewport));
        const started = performance.now();
        const samples = sampleFrame(view, viewport, grid, pool);
        last = samples;
        labels = chooseLabels(samples, viewport, measure, regions, memory);
        const elapsed = performance.now() - started;
        frames += 1;
        totalMs += elapsed;
        if (elapsed > worstMs) worstMs = elapsed;
      }
      const wanted = new Set(labels.map((label) => label.id));
      for (const label of shown) {
        if (wanted.has(label.id)) continue;
        elements.get(label.id)?.remove();
      }
      // The fade goes on each region label and not on the host, because the host also
      // holds the selection pin, the hover ring and the marker name labels, and those do
      // not follow the region overlay's fade.
      const fade = String(labelFade(view.distance));
      for (const label of labels) {
        const element = elements.get(label.id);
        if (element === undefined) continue;
        element.style.left = `${label.left}px`;
        element.style.top = `${label.top}px`;
        element.style.opacity = fade;
        if (element.parentNode === null) host.append(element);
      }
      shown = labels;
      memory = {
        previous: wanted,
        anchors: new Map(labels.map((label) => [label.id, label.plane])),
        targets: new Map(labels.map((label) => [label.id, label.target])),
      };
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
