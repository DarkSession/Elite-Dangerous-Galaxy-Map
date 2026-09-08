import { beforeAll, describe, expect, test } from 'vitest';
import { galaxyModel } from '../galaxy-model/model';
import { decodeVolumeValue, generateVolume, VOLUME_SIZE } from './volume';
import type { DensityVolume } from './types';

let volume: DensityVolume;

beforeAll(() => {
  volume = generateVolume();
}, 120000);

describe('the density volume', () => {
  test('has the declared dimensions', () => {
    expect(volume.size).toEqual(VOLUME_SIZE);
    expect(volume.data.length).toBe(4194304);
  });

  test('holds the model density at the texel that contains Sol', () => {
    const [sizeX, sizeY] = VOLUME_SIZE;
    const stepX = volume.extent[0] / volume.size[0];
    const stepY = volume.extent[1] / volume.size[1];
    const stepZ = volume.extent[2] / volume.size[2];
    const ix = Math.floor((0 - volume.origin[0]) / stepX);
    const iy = Math.floor((0 - volume.origin[1]) / stepY);
    const iz = Math.floor((0 - volume.origin[2]) / stepZ);

    const centreX = volume.origin[0] + (ix + 0.5) * stepX;
    const centreY = volume.origin[1] + (iy + 0.5) * stepY;
    const centreZ = volume.origin[2] + (iz + 0.5) * stepZ;

    const expected = galaxyModel.volumeDensity(centreX, centreY, centreZ);
    const decoded = decodeVolumeValue(
      volume,
      volume.data[(iz * sizeY + iy) * sizeX + ix] as number,
    );
    expect(decoded).toBeGreaterThan(expected / 1.5);
    expect(decoded).toBeLessThan(expected * 1.5);
  });

  // The renderer takes the galactic centre for its fade by radius from the mid-point
  // of the volume box, so it needs no import from the galaxy model. That is only right
  // while the box is centred on the model's centre in the plane.
  test('has its plane mid-point at the model centre', () => {
    const midX = volume.origin[0] + volume.extent[0] / 2;
    const midZ = volume.origin[2] + volume.extent[2] / 2;
    expect(midX).toBeCloseTo(galaxyModel.centre[0], 6);
    expect(midZ).toBeCloseTo(galaxyModel.centre[2], 6);
  });

  test('holds nothing in the top and bottom layers', () => {
    const [sizeX, sizeY, sizeZ] = VOLUME_SIZE;
    for (const iy of [0, sizeY - 1]) {
      for (let iz = 0; iz < sizeZ; iz += 1) {
        for (let ix = 0; ix < sizeX; ix += 1) {
          expect(volume.data[(iz * sizeY + iy) * sizeX + ix]).toBe(0);
        }
      }
    }
  });
});
