import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, test } from 'vitest';
import { decodeDetailGrid } from '../galaxy-model/detail';
import parameters from '../galaxy-model/galaxy-model.json' with { type: 'json' };
import { createGalaxyModel } from '../galaxy-model/model';
import type { GalaxyModel } from '../galaxy-model/model';
import {
  CLOUD_PLACEMENT_POWER,
  CLOUD_RADIUS_MAX_LY,
  CLOUD_RADIUS_MIN_LY,
  generateCloudSet,
  placementMasses,
} from './cloud-set';
import { buildSurfaceTable, generatePointCloud } from './point-cloud';
import type { SurfaceTable } from './point-cloud';
import type { CloudSet } from './types';

const pngPath = fileURLToPath(
  new URL('../galaxy-model/galaxy-detail.png', import.meta.url),
);

let galaxyModel: GalaxyModel;
let table: SurfaceTable;
let set: CloudSet;

beforeAll(async () => {
  const grid = await decodeDetailGrid(new Uint8Array(readFileSync(pngPath)));
  galaxyModel = createGalaxyModel(parameters, grid);
  table = buildSurfaceTable(galaxyModel);
  set = generateCloudSet(galaxyModel, { count: 40000, seed: 7, table });
}, 120000);

/** The plane distance of a sample from the galactic centre, in light years. */
function planeRadius(positions: Float32Array, index: number): number {
  return Math.hypot(
    (positions[index * 3] as number) - galaxyModel.centre[0],
    (positions[index * 3 + 2] as number) - galaxyModel.centre[2],
  );
}

describe('the cloud set', () => {
  test('gives the requested count inside the model bounds', () => {
    const small = generateCloudSet(galaxyModel, { count: 10000, seed: 7, table });
    expect(small.count).toBe(10000);
    expect(small.positions.length).toBe(30000);
    expect(small.tints.length).toBe(10000);
    expect(small.radii.length).toBe(10000);
    expect(small.ratios.length).toBe(10000);

    const bounds = galaxyModel.bounds;
    for (let index = 0; index < small.count; index += 1) {
      const base = index * 3;
      expect(small.positions[base] as number).toBeGreaterThanOrEqual(bounds.x[0]);
      expect(small.positions[base] as number).toBeLessThanOrEqual(bounds.x[1]);
      expect(small.positions[base + 1] as number).toBeGreaterThanOrEqual(bounds.y[0]);
      expect(small.positions[base + 1] as number).toBeLessThanOrEqual(bounds.y[1]);
      expect(small.positions[base + 2] as number).toBeGreaterThanOrEqual(bounds.z[0]);
      expect(small.positions[base + 2] as number).toBeLessThanOrEqual(bounds.z[1]);
    }
  });

  test('reaches the outer disc, where the point cloud does not', () => {
    let clouds = 0;
    for (let index = 0; index < set.count; index += 1) {
      if (planeRadius(set.positions, index) > 30000) clouds += 1;
    }

    const points = generatePointCloud(galaxyModel, { count: 40000, seed: 7, table });
    let far = 0;
    for (let index = 0; index < points.count; index += 1) {
      if (planeRadius(points.positions, index) > 30000) far += 1;
    }

    expect(clouds / set.count).toBeGreaterThanOrEqual(0.25);
    expect(far / points.count).toBeLessThan(0.02);
  });

  test('follows the flattened density', () => {
    let inside = 0;
    for (let index = 0; index < set.count; index += 1) {
      if (planeRadius(set.positions, index) < 10000) inside += 1;
    }

    const masses = placementMasses(galaxyModel, table);
    let insideMass = 0;
    let totalMass = 0;
    for (let iz = 0; iz < table.size; iz += 1) {
      const z = table.origin[1] + (iz + 0.5) * table.cell[1];
      for (let ix = 0; ix < table.size; ix += 1) {
        const x = table.origin[0] + (ix + 0.5) * table.cell[0];
        const weight = Math.pow(
          masses[iz * table.size + ix] as number,
          CLOUD_PLACEMENT_POWER,
        );
        totalMass += weight;
        const radius = Math.hypot(x - galaxyModel.centre[0], z - galaxyModel.centre[2]);
        if (radius < 10000) insideMass += weight;
      }
    }

    expect(Math.abs(inside / set.count - insideMass / totalMass)).toBeLessThanOrEqual(
      0.03,
    );
  });

  test('stores the density ratio of the cell that holds the sample', () => {
    // The peak comes from a scan over every cell centre, not from the differenced
    // masses the generator searches, so the check is independent of it.
    let peak = 0;
    for (let iz = 0; iz < table.size; iz += 1) {
      const z = table.origin[1] + (iz + 0.5) * table.cell[1];
      for (let ix = 0; ix < table.size; ix += 1) {
        const x = table.origin[0] + (ix + 0.5) * table.cell[0];
        const density = galaxyModel.surfaceDensity(x, z);
        if (density > peak) peak = density;
      }
    }

    for (let index = 0; index < 100; index += 1) {
      const x = set.positions[index * 3] as number;
      const z = set.positions[index * 3 + 2] as number;
      const ix = Math.floor((x - table.origin[0]) / table.cell[0]);
      const iz = Math.floor((z - table.origin[1]) / table.cell[1]);
      const expected =
        galaxyModel.surfaceDensity(
          table.origin[0] + (ix + 0.5) * table.cell[0],
          table.origin[1] + (iz + 0.5) * table.cell[1],
        ) / peak;
      const stored = set.ratios[index] as number;
      expect(Math.abs(stored - expected) / expected).toBeLessThanOrEqual(1e-5);
    }
  });

  test('draws the radii log-uniformly between the two limits', () => {
    const counts = [0, 0, 0];
    for (let index = 0; index < set.count; index += 1) {
      const radius = set.radii[index] as number;
      expect(radius).toBeGreaterThanOrEqual(CLOUD_RADIUS_MIN_LY);
      expect(radius).toBeLessThanOrEqual(CLOUD_RADIUS_MAX_LY);
      if (radius < 1000) counts[0] = (counts[0] as number) + 1;
      else if (radius < 2000) counts[1] = (counts[1] as number) + 1;
      else counts[2] = (counts[2] as number) + 1;
    }
    for (const part of counts) {
      expect(Math.abs((part as number) / set.count - 1 / 3)).toBeLessThanOrEqual(0.02);
    }
  });

  test('repeats byte for byte with the same seed', () => {
    const first = generateCloudSet(galaxyModel, { count: 5000, seed: 7, table });
    const second = generateCloudSet(galaxyModel, { count: 5000, seed: 7, table });
    expect(Buffer.from(first.positions.buffer)).toEqual(
      Buffer.from(second.positions.buffer),
    );
    expect(Buffer.from(first.tints.buffer)).toEqual(Buffer.from(second.tints.buffer));
    expect(Buffer.from(first.radii.buffer)).toEqual(Buffer.from(second.radii.buffer));
    expect(Buffer.from(first.ratios.buffer)).toEqual(Buffer.from(second.ratios.buffer));
  });

  test('moves through a MessageChannel without a copy', async () => {
    const sent = generateCloudSet(galaxyModel, { count: 100, seed: 7, table });
    const first = sent.positions[0] as number;
    const channel = new MessageChannel();
    const received = await new Promise<CloudSet>((resolve) => {
      channel.port2.onmessage = (event: MessageEvent<CloudSet>) => resolve(event.data);
      channel.port2.start();
      channel.port1.postMessage(sent, [
        sent.positions.buffer as ArrayBuffer,
        sent.tints.buffer as ArrayBuffer,
        sent.radii.buffer as ArrayBuffer,
        sent.ratios.buffer as ArrayBuffer,
      ]);
    });

    expect(received.count).toBe(100);
    expect(received.positions[0]).toBe(first);
    expect(sent.positions.buffer.byteLength).toBe(0);
    expect(sent.tints.buffer.byteLength).toBe(0);
    expect(sent.radii.buffer.byteLength).toBe(0);
    expect(sent.ratios.buffer.byteLength).toBe(0);

    channel.port1.close();
    channel.port2.close();
  });
});
