// Builds the cloud sprite shapes. The cloud pass reads them as one R8 atlas texture,
// so a sprite does not read as a disc.
import { SeededRandom } from '../scene-data/random';

/** How many shapes the set holds. */
export const SHAPE_COUNT = 16;

/** The side of one shape, in texels. */
export const SHAPE_SIDE = 64;

/** How many shapes one row of the atlas holds. */
export const SHAPE_COLUMNS = 4;

/** The seed the shape set uses. */
export const SHAPE_SEED = 20260908;

/** How many cycles across the shape each noise octave holds. */
export const SHAPE_OCTAVE_CYCLES: readonly number[] = [4, 8, 16];

/** The weight of each noise octave. */
export const SHAPE_OCTAVE_AMPLITUDES: readonly number[] = [1, 1, 0.7];

/**
 * The power of the fall-off from the centre of the shape. Below 2 the shape holds
 * more light near its edge, so the noise, not the fall-off, sets the outline.
 */
export const SHAPE_FALLOFF_POWER = 1.2;

/**
 * The noise value below which the shape is empty. It cuts the outline where the noise
 * is low, so the outline is ragged.
 */
export const SHAPE_THRESHOLD = 0.36;

/** A set of cloud shapes in one square atlas. */
export interface CloudShapes {
  /** The side of one shape, in texels. */
  readonly side: number;
  /** The number of shapes. */
  readonly count: number;
  /** One `uint8` per texel of the atlas, `x` fastest, shape 0 at the low corner. */
  readonly data: Uint8Array;
}

/** The side of the whole atlas, in texels. */
export function shapeAtlasSide(shapes: CloudShapes): number {
  return shapes.side * SHAPE_COLUMNS;
}

/** The smooth step the value noise interpolates with. */
function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * One octave of value noise on a periodic lattice of `cycles` by `cycles` values. The
 * lattice wraps, so a lookup never leaves it.
 */
function octave(lattice: Float64Array, cycles: number, u: number, v: number): number {
  const x = u * cycles;
  const y = v * cycles;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = smooth(x - ix);
  const fy = smooth(y - iy);
  const x0 = ((ix % cycles) + cycles) % cycles;
  const y0 = ((iy % cycles) + cycles) % cycles;
  const x1 = (x0 + 1) % cycles;
  const y1 = (y0 + 1) % cycles;
  const a = lattice[y0 * cycles + x0] as number;
  const b = lattice[y0 * cycles + x1] as number;
  const c = lattice[y1 * cycles + x0] as number;
  const d = lattice[y1 * cycles + x1] as number;
  const top = a + (b - a) * fx;
  const bottom = c + (d - c) * fx;
  return top + (bottom - top) * fy;
}

/**
 * Builds the shape set from a seed. Each texel is the soft fall-off from the centre
 * times the noise above the threshold, zero outside the inscribed disc, and each
 * shape is scaled so its peak is 255. The same seed gives the same array.
 */
export function generateCloudShapes(seed: number = SHAPE_SEED): CloudShapes {
  const side = SHAPE_SIDE;
  const count = SHAPE_COUNT;
  const atlas = side * SHAPE_COLUMNS;
  const data = new Uint8Array(atlas * atlas);
  const random = new SeededRandom(seed);
  const values = new Float64Array(side * side);

  for (let shape = 0; shape < count; shape += 1) {
    const lattices = SHAPE_OCTAVE_CYCLES.map((cycles) => {
      const lattice = new Float64Array(cycles * cycles);
      for (let index = 0; index < lattice.length; index += 1) {
        lattice[index] = random.float();
      }
      return lattice;
    });
    let amplitudeSum = 0;
    for (const amplitude of SHAPE_OCTAVE_AMPLITUDES) amplitudeSum += amplitude;

    let peak = 0;
    for (let y = 0; y < side; y += 1) {
      const v = (y + 0.5) / side;
      const dy = 2 * v - 1;
      for (let x = 0; x < side; x += 1) {
        const u = (x + 0.5) / side;
        const dx = 2 * u - 1;
        const square = dx * dx + dy * dy;
        if (square > 1) {
          values[y * side + x] = 0;
          continue;
        }
        let noise = 0;
        for (let index = 0; index < lattices.length; index += 1) {
          noise +=
            (SHAPE_OCTAVE_AMPLITUDES[index] as number) *
            octave(
              lattices[index] as Float64Array,
              SHAPE_OCTAVE_CYCLES[index] as number,
              u,
              v,
            );
        }
        noise /= amplitudeSum;
        const above = (noise - SHAPE_THRESHOLD) / (1 - SHAPE_THRESHOLD);
        const falloff = Math.pow(1 - square, SHAPE_FALLOFF_POWER);
        const value = above > 0 ? falloff * above : 0;
        values[y * side + x] = value;
        if (value > peak) peak = value;
      }
    }

    const scale = peak > 0 ? 255 / peak : 0;
    const column = shape % SHAPE_COLUMNS;
    const row = (shape - column) / SHAPE_COLUMNS;
    for (let y = 0; y < side; y += 1) {
      const target = (row * side + y) * atlas + column * side;
      for (let x = 0; x < side; x += 1) {
        data[target + x] = Math.round((values[y * side + x] as number) * scale);
      }
    }
  }

  return { side, count, data };
}
