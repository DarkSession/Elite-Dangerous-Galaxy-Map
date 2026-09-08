import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, test } from 'vitest';
import { decodeDetailGrid } from '../galaxy-model/detail';
import parameters from '../galaxy-model/galaxy-model.json' with { type: 'json' };
import { createGalaxyModel } from '../galaxy-model/model';
import type { GalaxyModel } from '../galaxy-model/model';
import {
  buildSurfaceTable,
  decodeDetailRatio,
  generatePointCloud,
} from './point-cloud';
import type { SurfaceTable } from './point-cloud';

const pngPath = fileURLToPath(
  new URL('../galaxy-model/galaxy-detail.png', import.meta.url),
);

let galaxyModel: GalaxyModel;
let table: SurfaceTable;

beforeAll(async () => {
  const grid = await decodeDetailGrid(new Uint8Array(readFileSync(pngPath)));
  galaxyModel = createGalaxyModel(parameters, grid);
  table = buildSurfaceTable(galaxyModel);
}, 120000);

describe('the point cloud', () => {
  test('gives the requested count inside the model bounds', () => {
    const cloud = generatePointCloud(galaxyModel, { count: 100000, seed: 7, table });
    expect(cloud.count).toBe(100000);
    expect(cloud.positions.length).toBe(300000);
    expect(cloud.tints.length).toBe(100000);

    const bounds = galaxyModel.bounds;
    for (let index = 0; index < cloud.count; index += 1) {
      const base = index * 3;
      expect(cloud.positions[base] as number).toBeGreaterThanOrEqual(bounds.x[0]);
      expect(cloud.positions[base] as number).toBeLessThanOrEqual(bounds.x[1]);
      expect(cloud.positions[base + 1] as number).toBeGreaterThanOrEqual(bounds.y[0]);
      expect(cloud.positions[base + 1] as number).toBeLessThanOrEqual(bounds.y[1]);
      expect(cloud.positions[base + 2] as number).toBeGreaterThanOrEqual(bounds.z[0]);
      expect(cloud.positions[base + 2] as number).toBeLessThanOrEqual(bounds.z[1]);
    }
  });

  test('gives the detail ratio at the cell that holds Sol', () => {
    const detail = table.detail;
    const ix = Math.floor((0 - detail.origin[0]) / (detail.extent[0] / detail.size));
    const iz = Math.floor((0 - detail.origin[1]) / (detail.extent[1] / detail.size));
    const x = detail.origin[0] + (ix + 0.5) * (detail.extent[0] / detail.size);
    const z = detail.origin[1] + (iz + 0.5) * (detail.extent[1] / detail.size);
    const stored = detail.data[iz * detail.size + ix] as number;
    const decoded = decodeDetailRatio(detail, stored);
    const expected =
      galaxyModel.detailedSurfaceDensity(x, z) /
      galaxyModel.correctedSurfaceDensity(x, z);
    expect(decoded / expected).toBeGreaterThan(1 / 1.03);
    expect(decoded / expected).toBeLessThan(1.03);
  });

  test('repeats byte for byte with the same seed', () => {
    const first = generatePointCloud(galaxyModel, { count: 20000, seed: 7, table });
    const second = generatePointCloud(galaxyModel, { count: 20000, seed: 7, table });
    expect(Buffer.from(first.positions.buffer)).toEqual(
      Buffer.from(second.positions.buffer),
    );
    expect(Buffer.from(first.tints.buffer)).toEqual(Buffer.from(second.tints.buffer));
  });
});
