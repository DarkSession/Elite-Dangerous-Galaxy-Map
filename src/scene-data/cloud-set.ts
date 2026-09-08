// Draws cloud samples from a flattened form of the model's surface density.
import { galaxyModel } from '../galaxy-model/model';
import type { GalaxyModel } from '../galaxy-model/model';
import { buildSurfaceTable, drawHeight, findCell, heightDrawOf } from './point-cloud';
import type { SurfaceTable } from './point-cloud';
import { DEFAULT_SEED } from './point-cloud';
import { SeededRandom } from './random';
import type { CloudSet } from './types';

/** The number of cloud samples the map draws by default. */
export const DEFAULT_CLOUD_COUNT = 40_000;

/**
 * The power the placement raises the surface density to. Below 1 the outer disc and
 * the rim get more samples than the density alone gives them, so the haze is made of
 * puffs out to the rim.
 */
export const CLOUD_PLACEMENT_POWER = 0.5;

/**
 * The smallest share of the largest cell mass a cell keeps for the placement. The
 * model truncates at 38,900 light years and holds almost nothing past it, while the
 * reference still shows puffs there, so the placement holds this floor inside the rim
 * radius. The floor is above the density of the outer disc, so the sprite count is
 * near level from the outer arms to the rim and the brightness carries the arms.
 */
export const CLOUD_PLACEMENT_FLOOR = 5e-3;

/** The radius at which the placement floor reaches zero, in light years. */
export const CLOUD_RIM_RADIUS_LY = 50000;

/** The width over which the placement floor fades to zero, in light years. */
export const CLOUD_RIM_WIDTH_LY = 12000;

/** The smallest cloud radius, in light years. */
export const CLOUD_RADIUS_MIN_LY = 500;

/** The largest cloud radius, in light years. */
export const CLOUD_RADIUS_MAX_LY = 4000;

/** Options for one cloud set build. */
export interface CloudSetOptions {
  /** The number of samples. */
  readonly count?: number;
  /** The generator seed. */
  readonly seed?: number;
  /** A table built earlier, to save the build cost. */
  readonly table?: SurfaceTable;
}

/**
 * The mass of each cell of the surface table, from the differences of its cumulative.
 * A difference of two large sums can come out below zero at a rim cell, so the value
 * is held at 0.
 */
export function cellMasses(table: SurfaceTable): Float64Array {
  const cumulative = table.cumulative;
  const masses = new Float64Array(cumulative.length);
  let previous = 0;
  for (let index = 0; index < cumulative.length; index += 1) {
    const value = cumulative[index] as number;
    const mass = value - previous;
    masses[index] = mass > 0 ? mass : 0;
    previous = value;
  }
  return masses;
}

/**
 * The largest smooth surface density over the centres of the table's cells. The
 * sprite brightness reads the smooth density, without the correction and the detail
 * grids, because the two grids hold structure inside the size range of the sprites
 * and a sprite that carries it reads as noise rather than as a puff.
 */
export function peakCellDensity(model: GalaxyModel, table: SurfaceTable): number {
  let best = 0;
  for (let iz = 0; iz < table.size; iz += 1) {
    const z = table.origin[1] + (iz + 0.5) * table.cell[1];
    for (let ix = 0; ix < table.size; ix += 1) {
      const value = model.surfaceDensity(
        table.origin[0] + (ix + 0.5) * table.cell[0],
        z,
      );
      if (value > best) best = value;
    }
  }
  return best;
}

/**
 * The placement mass of each cell: the cell mass, held at the floor inside the rim
 * radius. The floor fades to zero over the rim width, so the placement has no edge.
 */
export function placementMasses(model: GalaxyModel, table: SurfaceTable): Float64Array {
  const masses = cellMasses(table);
  let peakMass = 0;
  for (let index = 0; index < masses.length; index += 1) {
    const mass = masses[index] as number;
    if (mass > peakMass) peakMass = mass;
  }
  const floorMass = peakMass * CLOUD_PLACEMENT_FLOOR;
  const size = table.size;
  const rimInner = CLOUD_RIM_RADIUS_LY - CLOUD_RIM_WIDTH_LY;
  const centreX = model.centre[0];
  const centreZ = model.centre[2];

  for (let index = 0; index < masses.length; index += 1) {
    const ix = index % size;
    const iz = (index - ix) / size;
    const dx = table.origin[0] + (ix + 0.5) * table.cell[0] - centreX;
    const dz = table.origin[1] + (iz + 0.5) * table.cell[1] - centreZ;
    const along = (Math.hypot(dx, dz) - rimInner) / CLOUD_RIM_WIDTH_LY;
    const held = along < 0 ? 0 : along > 1 ? 1 : along;
    const floored = floorMass * (1 - held * held * (3 - 2 * held));
    if ((masses[index] as number) < floored) masses[index] = floored;
  }
  return masses;
}

/**
 * Draws the cloud samples. The plane position comes from a cumulative over the
 * placement mass raised to the placement power, by inverse transform and a uniform
 * jitter inside the cell. The height comes from the same draw as the point cloud's.
 * The radius is log-uniform between the two range constants. The density ratio is the
 * cell's, because a cell is under one pixel at every far view.
 */
export function generateCloudSet(
  model: GalaxyModel = galaxyModel,
  options: CloudSetOptions = {},
): CloudSet {
  const count = options.count ?? DEFAULT_CLOUD_COUNT;
  const seed = options.seed ?? DEFAULT_SEED;
  const table = options.table ?? buildSurfaceTable(model);
  const random = new SeededRandom(seed);

  const size = table.size;
  const originX = table.origin[0];
  const originZ = table.origin[1];
  const cellX = table.cell[0];
  const cellZ = table.cell[1];

  const masses = placementMasses(model, table);
  const placement = new Float64Array(masses.length);
  let sum = 0;
  for (let index = 0; index < masses.length; index += 1) {
    sum += Math.pow(masses[index] as number, CLOUD_PLACEMENT_POWER);
    placement[index] = sum;
  }
  const total = sum;
  const peak = peakCellDensity(model, table);
  const radiusRatio = CLOUD_RADIUS_MAX_LY / CLOUD_RADIUS_MIN_LY;

  const height = heightDrawOf(model);
  const centreY = model.centre[1];

  const positions = new Float32Array(count * 3);
  const tints = new Uint8Array(count);
  const radii = new Float32Array(count);
  const ratios = new Float32Array(count);

  for (let index = 0; index < count; index += 1) {
    const cell = findCell(placement, random.float() * total);
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
    radii[index] = CLOUD_RADIUS_MIN_LY * Math.pow(radiusRatio, random.float());
    ratios[index] =
      model.surfaceDensity(originX + (ix + 0.5) * cellX, originZ + (iz + 0.5) * cellZ) /
      peak;
  }

  return { count, positions, tints, radii, ratios };
}
