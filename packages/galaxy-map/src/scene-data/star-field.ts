// The decoration star field: how many stars a boxel holds, how much light they carry
// and how large they are. Nothing here knows about WebGL; the renderer reads the table
// this module builds.
import type { GalaxyModel } from '../galaxy-model/model';
import {
  baseSizeClass,
  boxelEdge,
  boxelOrigin,
  boxelSeed,
  buildBoxelBlocks,
  DRAWN_BOXEL_COUNT,
  listDrawnBoxels,
  STARS_PER_BOXEL,
} from './boxel';
import type { BoxelBlock, DrawnBoxel } from './boxel';
import type { RealSystemSet } from './real-systems';
import { createStarSuppression, MASK_WORDS } from './star-suppression';

/** How many stars the pass draws in one frame, at every view. */
export const STAR_VERTEX_COUNT = STARS_PER_BOXEL * DRAWN_BOXEL_COUNT;

/**
 * The detailed mass-code-0 budget of the disc at Sol, in solar masses per cubic light
 * year. `src/galaxy-model/detail.test.ts` holds the model to this value.
 */
export const SOL_MASS_DENSITY = 7.9125e-4;

/** The largest detailed mass-code-0 budget the model reaches, in the same unit. */
export const PEAK_MASS_DENSITY = 1.64182e-1;

/** Systems per solar mass of budget at the density of the disc at Sol. */
export const CALIBRATION_AT_SOL = 4.8;

/** Systems per solar mass of budget at the model's peak density. */
export const CALIBRATION_AT_PEAK = 1;

/**
 * The integral of the detailed mass-code-0 budget over the model bounds, in solar
 * masses. `integrateDetailedMassDensity` gives 4.1293e10 to 4.1323e10 over plane grids
 * of 512 to 1,536 cells, so the value carried here is that measurement to four digits.
 * A unit test reproduces it within 1 percent.
 */
export const MASS_INTEGRAL = 4.129e10;

/**
 * The radius of a star as a fraction of the mean spacing of the stars its boxel draws.
 * The fraction sets how concentrated a star's light is, never how much of it there is.
 * A complete 20 light year boxel at Sol then draws points of about one pixel at a zoom
 * distance of 500 light years, and a capped 1,280 light year boxel at the core draws
 * sprites wide enough to read as a wash.
 *
 * The value trades the grain of the field against the light the tone map shows. The
 * tone map is concave, so the same light shows brighter when it is spread over many
 * pixels and dimmer when it sits on few. A small fraction therefore gives grain and
 * loses displayed light, and a large one does the reverse. Measured at a zoom distance
 * of 500 light years at Sol, with the brightness spread in place: 0.03 gives a grain of
 * 0.050 and a mean frame lift of 0.0023, 0.04 gives 0.045 and 0.0027, 0.06 gives 0.038
 * and 0.0040, and 0.10 gives 0.030 and 0.0067. The value clears both thresholds the
 * spec sets, by 13 percent on the grain and 35 percent on the lift.
 */
export const STAR_RADIUS_FRACTION = 0.04;

/**
 * Systems per solar mass of budget at a density. The ramp is linear in the logarithm
 * of the density: it holds 4.8 at the density of the disc at Sol and below, falls to 1
 * at the model's peak density, and holds 1 above it.
 */
export function calibration(density: number): number {
  if (density <= SOL_MASS_DENSITY) return CALIBRATION_AT_SOL;
  if (density >= PEAK_MASS_DENSITY) return CALIBRATION_AT_PEAK;
  const span = Math.log(PEAK_MASS_DENSITY) - Math.log(SOL_MASS_DENSITY);
  const t = (Math.log(density) - Math.log(SOL_MASS_DENSITY)) / span;
  return CALIBRATION_AT_SOL + t * (CALIBRATION_AT_PEAK - CALIBRATION_AT_SOL);
}

/** How many systems a volume of the model holds at a density. */
export function systemsInVolume(density: number, volume: number): number {
  return density * volume * calibration(density);
}

/**
 * How many stars a boxel places. It does not depend on the real systems. A count that
 * rounds to zero places no star.
 */
export function placedStarCount(systems: number): number {
  const rounded = Math.round(systems);
  if (rounded <= 0) return 0;
  return rounded < STARS_PER_BOXEL ? rounded : STARS_PER_BOXEL;
}

/**
 * The light one boxel carries per unit of mass-code-0 budget. The point cloud places
 * its samples in proportion to the same detailed density, so this one constant makes
 * the light per unit volume of the two sources equal at every density.
 */
export function starLightConstant(
  pointBrightness: number,
  pointRadiusLy: number,
  pointCount: number,
  massIntegral: number = MASS_INTEGRAL,
): number {
  return (pointBrightness * pointRadiusLy * pointRadiusLy * pointCount) / massIntegral;
}

/** The light a boxel carries. It does not depend on the calibration. */
export function boxelLight(starLight: number, density: number, volume: number): number {
  return starLight * density * volume;
}

/**
 * The radius of a star, in light years, from the spacing of the stars its boxel
 * places. The count is the placed count, so a real system near the camera does not
 * shift the field's grain.
 */
export function starRadius(edge: number, placed: number): number {
  if (placed <= 0) return 0;
  return (STAR_RADIUS_FRACTION * edge) / Math.cbrt(placed);
}

/** How finely `integrateDetailedMassDensity` samples the model. */
export interface IntegrationOptions {
  /** Cells per axis over the plane. */
  readonly planeCells?: number;
  /** Midpoint steps over the full height of the model. */
  readonly heightSteps?: number;
  /** Radii the vertical integral is tabulated at. */
  readonly radiusCells?: number;
}

/**
 * The integral of the detailed mass-code-0 budget over the model bounds, by midpoint
 * sums. The vertical profile depends on the plane point through the galactocentric
 * radius alone, so the height sum is tabulated by radius and read back by linear
 * interpolation.
 */
export function integrateDetailedMassDensity(
  model: GalaxyModel,
  options: IntegrationOptions = {},
): number {
  const planeCells = options.planeCells ?? 1024;
  const heightSteps = options.heightSteps ?? 512;
  const radiusCells = options.radiusCells ?? 512;

  const bounds = model.bounds;
  const xLow = bounds.x[0];
  const zLow = bounds.z[0];
  const cellX = (bounds.x[1] - xLow) / planeCells;
  const cellZ = (bounds.z[1] - zLow) / planeCells;
  const cellArea = cellX * cellZ;

  // The corners of the bounds are the furthest plane points from the model centre.
  let maxRadius = 0;
  for (const x of [bounds.x[0], bounds.x[1]]) {
    for (const z of [bounds.z[0], bounds.z[1]]) {
      maxRadius = Math.max(maxRadius, model.radius(x, z));
    }
  }

  // The vertical profile is zero beyond the model's maximum height, so the height sum
  // covers that range rather than the whole of the bounds on `y`.
  const height = model.maxHeight;
  const step = (2 * height) / heightSteps;
  const columns = new Float64Array(radiusCells + 1);
  for (let cell = 0; cell <= radiusCells; cell += 1) {
    const radius = (maxRadius * cell) / radiusCells;
    let sum = 0;
    for (let index = 0; index < heightSteps; index += 1) {
      sum += model.verticalProfile(-height + (index + 0.5) * step, radius);
    }
    columns[cell] = sum * step;
  }

  const columnAt = (radius: number): number => {
    const position = (radius / maxRadius) * radiusCells;
    const low = Math.min(radiusCells - 1, Math.max(0, Math.floor(position)));
    const t = position - low;
    const first = columns[low] as number;
    const second = columns[low + 1] as number;
    return first + (second - first) * t;
  };

  const budget = model.document.calibration.mc0_budget_msun_per_ly3_per_unit;
  let total = 0;
  for (let iz = 0; iz < planeCells; iz += 1) {
    const z = zLow + (iz + 0.5) * cellZ;
    for (let ix = 0; ix < planeCells; ix += 1) {
      const x = xLow + (ix + 0.5) * cellX;
      const surface = model.detailedSurfaceDensity(x, z);
      if (surface <= 0) continue;
      total += surface * columnAt(model.radius(x, z));
    }
  }
  return total * cellArea * budget;
}

/** One record of the boxel table, as the renderer reads it back for a test. */
export interface StarBoxelRecord {
  /** The boxel's low corner less the camera position, in game coordinates. */
  readonly origin: readonly [number, number, number];
  /** The boxel's edge, in light years. */
  readonly edge: number;
  /** How many stars the boxel places. It does not depend on the real systems. */
  readonly placed: number;
  /** How many of those stars a real system suppresses. */
  readonly suppressed: number;
  /** How many stars the boxel draws, which is the placed count less the suppressed. */
  readonly drawn: number;
  /** The light one of those stars carries. */
  readonly lightPerStar: number;
  /** The radius of one of those stars, in light years. */
  readonly radius: number;
  /** The population zone at the boxel's centre, 0 to 1. */
  readonly zone: number;
  /** The hash of the boxel's grid index and its size class. */
  readonly seed: number;
}

/** How many values one record holds. */
export const RECORD_VALUES = 9;

/** The offset of the seed inside a record, in values. */
export const RECORD_SEED_OFFSET = 8;

/**
 * The table the star pass uploads. One record per boxel holds eight `float32` values
 * and one `uint32` seed, interleaved in one buffer. The seed cannot be a `float32`,
 * which holds only 24 of its 32 bits.
 */
export interface StarBoxelTable {
  /** How many records the table holds. */
  readonly count: number;
  /** The buffer the two views share. */
  readonly buffer: ArrayBuffer;
  /** The `float32` view of the records. */
  readonly values: Float32Array;
  /** The `uint32` view of the same records, for the seed. */
  readonly seeds: Uint32Array;
  /** The byte view of the same records, which the renderer uploads. */
  readonly bytes: Uint8Array;
  /** The sum of the drawn counts over the records. */
  readonly drawnStars: number;
  /** The sum of the suppressed counts over the records. */
  readonly suppressedStars: number;
  /**
   * Eight words of bit mask per record, one bit per placed star. A set bit says that
   * a real system suppresses that star. A record outside the base size class is zero.
   */
  readonly mask: Uint32Array;
  /** The byte view of the mask, which the renderer uploads. */
  readonly maskBytes: Uint8Array;
}

/** What the star field needs to build a table. */
export interface StarFieldOptions {
  /** The light one boxel carries per unit of mass-code-0 budget. */
  readonly starLight: number;
  /** The real systems whose invented twins the field drops. */
  readonly systems?: RealSystemSet | null;
}

/** The star field, which owns the boxel table and its cache. */
export interface StarField {
  /**
   * Writes the table for a camera position and a zoom distance, and gives it back.
   * The table is reused between calls, so the caller must upload it before the next
   * call.
   */
  update(camera: readonly [number, number, number], distance: number): StarBoxelTable;
  /** Reads one record back, for a test. */
  record(index: number): StarBoxelRecord;
  /** How many times the field has read the density of the drawn set. */
  readonly recomputeCount: number;
  /** How many boxels the last build swept for suppressed stars. */
  readonly sweptCount: number;
}

/** The identity of a drawn set: the base class and the low index of every block. */
function setKey(blocks: readonly BoxelBlock[]): string {
  const parts: string[] = [];
  for (const block of blocks) {
    parts.push(`${block.sizeClass}:${block.low[0]},${block.low[1]},${block.low[2]}`);
  }
  return parts.join('|');
}

/** What one boxel contributes, once its density is read. */
interface BoxelSample {
  readonly boxel: DrawnBoxel;
  readonly edge: number;
  readonly originX: number;
  readonly originY: number;
  readonly originZ: number;
  readonly placed: number;
  readonly suppressed: number;
  readonly drawn: number;
  readonly lightPerStar: number;
  readonly radius: number;
  readonly zone: number;
  readonly seed: number;
}

/**
 * Builds the star field over a model. The model must carry the detail grid, because
 * the counts and the light both read the detailed density.
 */
export function createStarField(
  model: GalaxyModel,
  options: StarFieldOptions,
): StarField {
  const starLight = options.starLight;
  const systems = options.systems ?? null;
  const suppression = createStarSuppression(systems);
  const buffer = new ArrayBuffer(DRAWN_BOXEL_COUNT * RECORD_VALUES * 4);
  const values = new Float32Array(buffer);
  const seeds = new Uint32Array(buffer);
  const bytes = new Uint8Array(buffer);
  const maskBuffer = new ArrayBuffer(DRAWN_BOXEL_COUNT * MASK_WORDS * 4);
  const mask = new Uint32Array(maskBuffer);
  const maskBytes = new Uint8Array(maskBuffer);
  let samples: BoxelSample[] = [];
  let key = '';
  let drawnStars = 0;
  let suppressedStars = 0;
  let recomputeCount = 0;
  let sweptCount = 0;

  const readSet = (
    camera: readonly [number, number, number],
    distance: number,
  ): void => {
    const blocks = buildBoxelBlocks(camera, distance);
    // The real-system set is part of the key, because a change to it changes which
    // stars the field drops.
    const nextKey = `${setKey(blocks)}#${systems === null ? 0 : systems.version}`;
    if (nextKey === key) return;
    key = nextKey;

    const base = baseSizeClass(distance);
    suppression.begin(base);
    const boxels = listDrawnBoxels(camera, distance);
    const next: BoxelSample[] = [];
    let stars = 0;
    let removed = 0;
    for (let index = 0; index < boxels.length; index += 1) {
      const boxel = boxels[index] as DrawnBoxel;
      const edge = boxelEdge(boxel.sizeClass);
      const origin = boxelOrigin(boxel.index, boxel.sizeClass);
      const originX = origin[0];
      const originY = origin[1];
      const originZ = origin[2];
      const half = edge / 2;
      const density = model.detailedMassDensity(
        originX + half,
        originY + half,
        originZ + half,
      );
      const volume = edge * edge * edge;
      const placed = placedStarCount(systemsInVolume(density, volume));
      const suppressed = suppression.write(
        boxel.index,
        boxel.sizeClass,
        placed,
        mask,
        index * MASK_WORDS,
      );
      const drawn = placed - suppressed;
      const light = boxelLight(starLight, density, volume);
      next.push({
        boxel,
        edge,
        originX,
        originY,
        originZ,
        placed,
        suppressed,
        drawn,
        // The boxel keeps its light over the stars that remain, so the galaxy holds
        // its brightness when a host loads data.
        lightPerStar: drawn > 0 ? light / drawn : 0,
        // The radius reads the placed count, so the field's grain does not shift
        // when a host loads data near the camera.
        radius: starRadius(edge, placed),
        zone: model.zone(originX + half, originZ + half),
        seed: boxelSeed(boxel.index, boxel.sizeClass),
      });
      stars += drawn;
      removed += suppressed;
    }
    samples = next;
    drawnStars = stars;
    suppressedStars = removed;
    sweptCount = suppression.sweptCount;
    recomputeCount += 1;
  };

  return {
    update(camera, distance): StarBoxelTable {
      readSet(camera, distance);
      for (let index = 0; index < samples.length; index += 1) {
        const sample = samples[index] as BoxelSample;
        const base = index * RECORD_VALUES;
        // The subtraction runs in `float64` here, so the shader only ever adds
        // offsets of a few thousand light years. The renderer's world frame negates
        // `z`, so the record carries the world offset of the boxel's game corner.
        values[base] = sample.originX - (camera[0] as number);
        values[base + 1] = sample.originY - (camera[1] as number);
        values[base + 2] = (camera[2] as number) - sample.originZ;
        values[base + 3] = sample.edge;
        // The shader reads the placed count, not the drawn count: a suppressed star
        // sits at any index below the placed count, and the mask is what drops it.
        values[base + 4] = sample.placed;
        values[base + 5] = sample.lightPerStar;
        values[base + 6] = sample.radius;
        values[base + 7] = sample.zone;
        seeds[base + RECORD_SEED_OFFSET] = sample.seed;
      }
      return {
        count: samples.length,
        buffer,
        values,
        seeds,
        bytes,
        drawnStars,
        suppressedStars,
        mask,
        maskBytes,
      };
    },
    record(index: number): StarBoxelRecord {
      const base = index * RECORD_VALUES;
      const sample = samples[index];
      return {
        origin: [
          values[base] as number,
          values[base + 1] as number,
          values[base + 2] as number,
        ],
        edge: values[base + 3] as number,
        placed: values[base + 4] as number,
        suppressed: sample?.suppressed ?? 0,
        drawn: sample?.drawn ?? 0,
        lightPerStar: values[base + 5] as number,
        radius: values[base + 6] as number,
        zone: values[base + 7] as number,
        seed: seeds[base + RECORD_SEED_OFFSET] as number,
      };
    },
    get recomputeCount(): number {
      return recomputeCount;
    },
    get sweptCount(): number {
      return sweptCount;
    },
  };
}
