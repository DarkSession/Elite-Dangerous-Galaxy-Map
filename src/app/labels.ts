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
import { REGION_FADE_IN_FAR, REGION_FADE_IN_NEAR } from '../render/region-pass';
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
 * How much of the label overlay draws at a zoom distance, 0 to 1. The labels follow the
 * fade in of the boundary lines, and they do not fade out at close zoom.
 */
export function labelFade(distance: number): number {
  return 1 - smoothstep(REGION_FADE_IN_NEAR, REGION_FADE_IN_FAR, distance);
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
}

/** No label in the frame before, which is what a first frame reads. */
export const NO_LABEL_MEMORY: LabelMemory = {
  previous: new Set<number>(),
  anchors: new Map<number, PlanePoint>(),
};

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
 * An anchor held from the frame before keeps its plane point while that point still
 * resolves to the region and still projects inside the frame, so the anchor does not hop
 * between two samples that are almost equally near the mean. Its projection still moves.
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

  /** True when a projected point lies inside the viewport. */
  const insideFrame = (point: AnchorPoint): boolean =>
    point.x >= 0 &&
    point.y >= 0 &&
    point.x <= viewport.width &&
    point.y <= viewport.height;

  const candidates: LabelCandidate[] = [];
  for (let id = 1; id < ID_RANGE; id += 1) {
    const index = anchorIndex[id] as number;
    if (index < 0) continue;
    const region = byId.get(id);
    if (region === undefined) continue;

    const meanX = (sumPlaneX[id] as number) / (counts[id] as number);
    const meanZ = (sumPlaneZ[id] as number) / (counts[id] as number);
    const onRegion = samples.regionAtPlane(meanX, meanZ) === id;
    let plane: PlanePoint = onRegion
      ? { x: meanX, z: meanZ }
      : {
          x: samples.planeX[index] as number,
          z: samples.planeZ[index] as number,
        };

    // The anchor of the frame before is kept while its plane point still resolves to
    // this region and still projects inside the frame.
    const carried = memory.anchors.get(id);
    if (carried !== undefined && samples.regionAtPlane(carried.x, carried.z) === id) {
      const projected = samples.toScreen(carried.x, carried.z);
      if (projected !== null && insideFrame(projected)) plane = carried;
    }

    const screen = samples.toScreen(plane.x, plane.z);
    if (screen === null) continue;
    candidates.push({
      id,
      name: region.name,
      count: counts[id] as number,
      plane,
      anchor: {
        x: clamp(screen.x, LABEL_INSET, viewport.width - LABEL_INSET),
        y: clamp(screen.y, LABEL_INSET, viewport.height - LABEL_INSET),
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
  for (const candidate of labelCandidates(samples, viewport, regions, memory)) {
    if (placed.length >= MAX_LABELS) break;
    const box = labelBox(candidate.anchor, measure(candidate.name), viewport);
    if (placed.some((other) => boxesOverlap(box, other))) continue;
    placed.push({
      id: candidate.id,
      name: candidate.name,
      plane: candidate.plane,
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
      host.style.opacity = String(labelFade(view.distance));
      for (const label of labels) {
        const element = elements.get(label.id);
        if (element === undefined) continue;
        element.style.left = `${label.left}px`;
        element.style.top = `${label.top}px`;
        if (element.parentNode === null) host.append(element);
      }
      shown = labels;
      memory = {
        previous: wanted,
        anchors: new Map(labels.map((label) => [label.id, label.plane])),
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
