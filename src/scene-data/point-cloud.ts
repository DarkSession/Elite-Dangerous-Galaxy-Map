// Draws sample points from the model's corrected volume density.
import { galaxyModel } from '../galaxy-model/model';
import type { GalaxyModel } from '../galaxy-model/model';
import { SeededRandom } from './random';
import type { PointCloud } from './types';

/** The side of the surface density table, in cells. */
export const TABLE_SIZE = 1024;

/** The number of samples the map draws by default. */
export const DEFAULT_POINT_COUNT = 2_000_000;

/** The seed the map uses by default. */
export const DEFAULT_SEED = 7;

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
}

/**
 * Builds the cumulative distribution of corrected surface density over the model
 * bounds. One cell holds the density at its centre; the cells all have the same area,
 * so the density is the cell's relative mass.
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

  let total = 0;
  for (let iz = 0; iz < size; iz += 1) {
    const z = zLow + (iz + 0.5) * cellZ;
    const row = iz * size;
    for (let ix = 0; ix < size; ix += 1) {
      const x = xLow + (ix + 0.5) * cellX;
      total += model.correctedSurfaceDensity(x, z);
      cumulative[row + ix] = total;
    }
  }

  return {
    size,
    cumulative,
    origin: [xLow, zLow],
    cell: [cellX, cellZ],
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
  const originX = table.origin[0];
  const originZ = table.origin[1];
  const cellX = table.cell[0];
  const cellZ = table.cell[1];

  const vertical = model.document.vertical;
  const innerScale = vertical.inner.scale_ly;
  const outerScale = vertical.outer.scale_ly;
  const transitionRadius = vertical.transition.radius_ly;
  const transitionWidth = vertical.transition.width_ly;
  const maxHeight = vertical.max_height_ly;
  const centreY = model.centre[1];

  const positions = new Float32Array(count * 3);
  const tints = new Uint8Array(count);

  for (let index = 0; index < count; index += 1) {
    const cell = findCell(cumulative, random.float() * total);
    const ix = cell % size;
    const iz = (cell - ix) / size;
    const x = originX + (ix + random.float()) * cellX;
    const z = originZ + (iz + random.float()) * cellZ;

    const radius = model.radius(x, z);
    const weight = 1 / (1 + Math.exp((radius - transitionRadius) / transitionWidth));

    // The vertical profile is cut at the maximum height, so a draw above it is
    // replaced. The cut holds under 0.02 percent of the column, so the loop almost
    // never repeats.
    let height: number;
    do {
      const sign = random.float() < 0.5 ? -1 : 1;
      const u = random.float();
      height =
        random.float() < weight
          ? sign * innerScale * Math.atanh(u)
          : sign * -outerScale * Math.log(1 - u);
    } while (Math.abs(height) > maxHeight);

    const base = index * 3;
    positions[base] = x;
    positions[base + 1] = centreY + height;
    positions[base + 2] = z;
    tints[index] = Math.round(model.zone(x, z) * 255);
  }

  return { count, positions, tints };
}
