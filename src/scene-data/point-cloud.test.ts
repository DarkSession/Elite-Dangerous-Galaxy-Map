import { beforeAll, describe, expect, test } from 'vitest';
import { galaxyModel } from '../galaxy-model/model';
import { buildSurfaceTable, generatePointCloud } from './point-cloud';
import type { SurfaceTable } from './point-cloud';

let table: SurfaceTable;

beforeAll(() => {
  table = buildSurfaceTable();
});

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

  test('repeats byte for byte with the same seed', () => {
    const first = generatePointCloud(galaxyModel, { count: 20000, seed: 7, table });
    const second = generatePointCloud(galaxyModel, { count: 20000, seed: 7, table });
    expect(Buffer.from(first.positions.buffer)).toEqual(
      Buffer.from(second.positions.buffer),
    );
    expect(Buffer.from(first.tints.buffer)).toEqual(Buffer.from(second.tints.buffer));
  });
});
