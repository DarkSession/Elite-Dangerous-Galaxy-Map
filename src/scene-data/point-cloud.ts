// Draws sample points from the model's detailed volume density.
import { galaxyModel } from '../galaxy-model/model';
import type { GalaxyModel } from '../galaxy-model/model';
import { SeededRandom } from './random';
import type { PointCloud, SurfaceDetail } from './types';

/** The side of the surface density table, in cells. */
export const TABLE_SIZE = 1024;

/** The number of samples the map draws by default. */
export const DEFAULT_POINT_COUNT = 2_000_000;

/** The seed the map uses by default. */
export const DEFAULT_SEED = 7;

/** The logarithm of the ratio that the surface detail grid runs to. */
export const DETAIL_RATIO_SCALE = 3;

/** The stored value that stands for a ratio of 1. */
export const DETAIL_RATIO_OFFSET = 128;

/** Turns a stored surface detail value back into a ratio. */
export function decodeDetailRatio(detail: SurfaceDetail, value: number): number {
  return Math.exp(((value - DETAIL_RATIO_OFFSET) * detail.scale) / 127);
}

/** A cumulative distribution over the cells of the surface density table. */
export interface SurfaceTable {
  /** The side of the table, in cells. */
  readonly size: number;
  /** The cumulative mass after each cell. The last entry is the total. */
  readonly cumulative: Float64Array;
  /** The low corner of the covered plane box, in game coordinates. */
  readonly origin: readonly [number, number];
  /** The size of one cell in light years, on `x` and on `z`. */
  readonly cell: readonly [number, number];
  /** The ratio of the detailed to the corrected surface density, over the same cells. */
  readonly detail: SurfaceDetail;
  /**
   * The largest smooth surface density over the centres of the cells. The build reads
   * that density for every cell already, so the peak costs nothing here and the cloud
   * set does not sweep the model a second time. `peakCellDensity` states the same rule,
   * and a unit test holds the two to the same number.
   */
  readonly peak: number;
}

/**
 * Builds the cumulative distribution of detailed surface density over the model
 * bounds. One cell holds the density at its centre; the cells all have the same area,
 * so the density is the cell's relative mass. The same loop writes the surface detail
 * grid, the ratio of the detailed to the corrected density at each cell centre.
 */
export function buildSurfaceTable(
  model: GalaxyModel = galaxyModel,
  size: number = TABLE_SIZE,
): SurfaceTable {
  const xLow = model.bounds.x[0];
  const zLow = model.bounds.z[0];
  const cellX = (model.bounds.x[1] - xLow) / size;
  const cellZ = (model.bounds.z[1] - zLow) / size;
  const cumulative = new Float64Array(size * size);
  const ratios = new Uint8Array(size * size);
  const limit = DETAIL_RATIO_SCALE;

  let total = 0;
  let peak = 0;
  for (let iz = 0; iz < size; iz += 1) {
    const z = zLow + (iz + 0.5) * cellZ;
    const row = iz * size;
    for (let ix = 0; ix < size; ix += 1) {
      const x = xLow + (ix + 0.5) * cellX;
      // The three densities come from one sweep of the model. The corrected density is
      // the smooth one with the correction grid, and the detailed one is the corrected
      // one with the detail grid, so each grid is applied to the value below it rather
      // than computed again from the plane point.
      const smooth = model.surfaceDensity(x, z);
      if (smooth > peak) peak = smooth;
      const corrected = model.correctedFromSurface(smooth, x, z);
      const detailed = model.detailedFromCorrected(corrected, x, z);
      total += detailed;
      cumulative[row + ix] = total;

      // Where both densities are 0 the ratio has no value, so the cell takes 1.
      let logRatio = corrected > 0 && detailed > 0 ? Math.log(detailed / corrected) : 0;
      if (corrected === 0 && detailed > 0) logRatio = limit;
      if (detailed === 0 && corrected > 0) logRatio = -limit;
      if (logRatio > limit) logRatio = limit;
      if (logRatio < -limit) logRatio = -limit;
      ratios[row + ix] = Math.round((127 * logRatio) / limit) + DETAIL_RATIO_OFFSET;
    }
  }

  return {
    size,
    cumulative,
    origin: [xLow, zLow],
    cell: [cellX, cellZ],
    detail: {
      size,
      origin: [xLow, zLow],
      extent: [cellX * size, cellZ * size],
      scale: limit,
      data: ratios,
    },
    peak,
  };
}

/** Finds the first cell whose cumulative mass is above a target, by binary search. */
export function findCell(cumulative: Float64Array, target: number): number {
  let low = 0;
  let high = cumulative.length - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((cumulative[middle] as number) < target) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}

/**
 * How many buckets a cell finder's guide table holds. The guide is a `uint32` per
 * bucket, so this many buckets cost 1 MB. The surface table holds a million cells,
 * which is four cells to a bucket.
 */
export const GUIDE_BUCKETS = 1 << 18;

/**
 * Builds a cell finder over a cumulative distribution.
 *
 * It gives the same cell as `findCell` for every target, and it reads a guide table
 * rather than search. The guide holds, for each of its buckets, the cell `findCell`
 * gives for the low end of that bucket. A lookup starts at that cell and steps forward,
 * because the answer for a target inside the bucket is never below the answer for the
 * low end of it.
 *
 * A lookup steps once on average: a target lands in each bucket as often as any other,
 * and the steps over all the buckets come to the number of cells. A bucket that spans a
 * long run of cells of near zero mass costs more than that, and one that sits inside a
 * single heavy cell costs nothing.
 *
 * The point cloud draws two million samples from a table of a million cells. A binary
 * search costs 20 steps over 8 MB, and nearly every step misses the cache. The build of
 * the guide walks the cumulative once and costs about 2 milliseconds.
 */
export function createCellFinder(
  cumulative: Float64Array,
  buckets: number = GUIDE_BUCKETS,
): (target: number) => number {
  const last = cumulative.length - 1;
  const total = cumulative[last] as number;
  const guide = new Uint32Array(buckets + 1);
  let cell = 0;
  for (let bucket = 0; bucket <= buckets; bucket += 1) {
    const target = (bucket / buckets) * total;
    while (cell < last && (cumulative[cell] as number) < target) cell += 1;
    guide[bucket] = cell;
  }
  const scale = buckets / total;
  return (target: number): number => {
    let bucket = (target * scale) | 0;
    if (bucket < 0) bucket = 0;
    if (bucket > buckets) bucket = buckets;
    let found = guide[bucket] as number;
    while (found < last && (cumulative[found] as number) < target) found += 1;
    return found;
  };
}

/** What one height draw needs from the model's vertical profile. */
export interface HeightDraw {
  /** The scale height of the inner component, in light years. */
  readonly innerScale: number;
  /** The scale height of the outer component, in light years. */
  readonly outerScale: number;
  /** The radius at which the blend weight is one half, in light years. */
  readonly transitionRadius: number;
  /** The width of the blend, in light years. */
  readonly transitionWidth: number;
  /** The largest height the profile holds, in light years. */
  readonly maxHeight: number;
}

/** Reads the vertical profile the height draw uses. */
export function heightDrawOf(model: GalaxyModel): HeightDraw {
  const vertical = model.document.vertical;
  return {
    innerScale: vertical.inner.scale_ly,
    outerScale: vertical.outer.scale_ly,
    transitionRadius: vertical.transition.radius_ly,
    transitionWidth: vertical.transition.width_ly,
    maxHeight: vertical.max_height_ly,
  };
}

/**
 * Draws one height above the mid-plane by inverse transform of whichever component
 * the blend weight selects. The point cloud and the cloud set both call it, so the
 * two sets share one vertical distribution.
 */
export function drawHeight(
  draw: HeightDraw,
  radius: number,
  random: SeededRandom,
): number {
  const weight =
    1 / (1 + Math.exp((radius - draw.transitionRadius) / draw.transitionWidth));

  // The vertical profile is cut at the maximum height, so a draw above it is
  // replaced. The cut holds under 0.02 percent of the column, so the loop almost
  // never repeats.
  let height: number;
  do {
    const sign = random.float() < 0.5 ? -1 : 1;
    const u = random.float();
    height =
      random.float() < weight
        ? sign * draw.innerScale * Math.atanh(u)
        : sign * -draw.outerScale * Math.log(1 - u);
  } while (Math.abs(height) > draw.maxHeight);
  return height;
}

/** Options for one point cloud build. */
export interface PointCloudOptions {
  /** The number of samples. */
  readonly count?: number;
  /** The generator seed. */
  readonly seed?: number;
  /** A table built earlier, to save the build cost. */
  readonly table?: SurfaceTable;
}

/**
 * Draws samples from the model. The plane position comes from the surface density
 * table by inverse transform and a uniform jitter inside the cell. The height comes
 * from the vertical profile by inverse transform of whichever component the blend
 * weight selects.
 */
export function generatePointCloud(
  model: GalaxyModel = galaxyModel,
  options: PointCloudOptions = {},
): PointCloud {
  const count = options.count ?? DEFAULT_POINT_COUNT;
  const seed = options.seed ?? DEFAULT_SEED;
  const table = options.table ?? buildSurfaceTable(model);
  const random = new SeededRandom(seed);

  const size = table.size;
  const cumulative = table.cumulative;
  const total = cumulative[cumulative.length - 1] as number;
  const cellAt = createCellFinder(cumulative);
  const originX = table.origin[0];
  const originZ = table.origin[1];
  const cellX = table.cell[0];
  const cellZ = table.cell[1];

  const height = heightDrawOf(model);
  const centreY = model.centre[1];

  const positions = new Float32Array(count * 3);
  const tints = new Uint8Array(count);

  for (let index = 0; index < count; index += 1) {
    const cell = cellAt(random.float() * total);
    const ix = cell % size;
    const iz = (cell - ix) / size;
    const x = originX + (ix + random.float()) * cellX;
    const z = originZ + (iz + random.float()) * cellZ;

    const above = drawHeight(height, model.radius(x, z), random);

    const base = index * 3;
    positions[base] = x;
    positions[base + 1] = centreY + above;
    positions[base + 2] = z;
    tints[index] = Math.round(model.zone(x, z) * 255);
  }

  return { count, positions, tints };
}
