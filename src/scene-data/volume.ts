// Bakes the model's corrected volume density into a grid the renderer raymarches.
import { galaxyModel } from '../galaxy-model/model';
import type { GalaxyModel } from '../galaxy-model/model';
import type { DensityVolume } from './types';

/** Texel counts on `x`, `y` and `z`. */
export const VOLUME_SIZE: readonly [number, number, number] = [256, 64, 256];

/**
 * The half height of the covered box, in light years. It is above the model's maximum
 * height of 2,867 light years, so the outermost layers hold nothing.
 */
export const VOLUME_HALF_HEIGHT = 3000;

/**
 * The density that byte value 0 stands for, in map units per light year. It is below
 * the model's epsilon of 300 so that the outer disc, at about 30 map units per light
 * year near Sol, gets byte values of its own. With the model's epsilon the disc shares
 * the lowest eight.
 */
export const ENCODING_EPSILON = 1;

/** Turns a byte back into a density in map units per light year. */
export function decodeVolumeValue(volume: DensityVolume, value: number): number {
  const logarithm = volume.lo + (value / 255) * (volume.hi - volume.lo);
  const density = Math.exp(logarithm) - volume.epsilon;
  return density > 0 ? density : 0;
}

/** Bakes the volume from the model. */
export function generateVolume(model: GalaxyModel = galaxyModel): DensityVolume {
  const [sizeX, sizeY, sizeZ] = VOLUME_SIZE;
  const xLow = model.bounds.x[0];
  const zLow = model.bounds.z[0];
  const extentX = model.bounds.x[1] - xLow;
  const extentZ = model.bounds.z[1] - zLow;
  const extentY = 2 * VOLUME_HALF_HEIGHT;
  const yLow = model.centre[1] - VOLUME_HALF_HEIGHT;

  const stepX = extentX / sizeX;
  const stepY = extentY / sizeY;
  const stepZ = extentZ / sizeZ;

  const samples = new Float64Array(sizeX * sizeY * sizeZ);
  let peak = 0;

  for (let iz = 0; iz < sizeZ; iz += 1) {
    const z = zLow + (iz + 0.5) * stepZ;
    for (let ix = 0; ix < sizeX; ix += 1) {
      const x = xLow + (ix + 0.5) * stepX;
      const surface = model.correctedSurfaceDensity(x, z);
      const radius = model.radius(x, z);
      for (let iy = 0; iy < sizeY; iy += 1) {
        const height = yLow + (iy + 0.5) * stepY - model.centre[1];
        const density = surface * model.verticalProfile(height, radius);
        if (density > peak) peak = density;
        samples[(iz * sizeY + iy) * sizeX + ix] = density;
      }
    }
  }

  const epsilon = ENCODING_EPSILON;
  const lo = Math.log(epsilon);
  const hi = Math.log(peak + epsilon);
  const span = hi - lo;
  const data = new Uint8Array(samples.length);

  for (let index = 0; index < samples.length; index += 1) {
    let normalised = (Math.log((samples[index] as number) + epsilon) - lo) / span;
    if (normalised < 0) normalised = 0;
    if (normalised > 1) normalised = 1;
    data[index] = Math.round(255 * normalised);
  }

  return {
    size: VOLUME_SIZE,
    origin: [xLow, yLow, zLow],
    extent: [extentX, extentY, extentZ],
    lo,
    hi,
    epsilon,
    data,
  };
}
