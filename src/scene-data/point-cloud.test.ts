import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, test } from 'vitest';
import { decodeDetailGrid } from '../galaxy-model/detail';
import parameters from '../galaxy-model/galaxy-model.json' with { type: 'json' };
import { createGalaxyModel } from '../galaxy-model/model';
import type { GalaxyModel } from '../galaxy-model/model';
import {
  buildSurfaceTable,
  createCellFinder,
  decodeDetailRatio,
  findCell,
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

describe('the cell finder', () => {
  test('gives the cell the binary search gives', () => {
    const find = createCellFinder(table.cumulative);
    const total = table.cumulative[table.cumulative.length - 1] as number;
    // The guide table is read at both ends and over a fine sweep between them, so a
    // bucket that starts one cell too high shows up here and not in a picture.
    const targets: number[] = [0, total, total / 2];
    for (let step = 0; step < 20000; step += 1) targets.push((step / 20000) * total);
    let wrong: string | null = null;
    for (const target of targets) {
      const wanted = findCell(table.cumulative, target);
      if (find(target) !== wanted) {
        wrong = `target ${target} gave ${find(target)} and not ${wanted}`;
        break;
      }
    }
    expect(wrong).toBeNull();
  });

  test('takes a target outside the range', () => {
    const find = createCellFinder(table.cumulative);
    const total = table.cumulative[table.cumulative.length - 1] as number;
    expect(find(-1)).toBe(findCell(table.cumulative, -1));
    expect(find(2 * total)).toBe(findCell(table.cumulative, 2 * total));
  });
});

describe('the point cloud', () => {
  test('gives the requested count inside the model bounds', () => {
    const cloud = generatePointCloud(galaxyModel, { count: 100000, seed: 7, table });
    expect(cloud.count).toBe(100000);
    expect(cloud.positions.length).toBe(300000);
    expect(cloud.tints.length).toBe(100000);

    // The scan reports the first point outside the bounds and asserts once. An
    // `expect` for each axis of each point is 600,000 calls, which took 2.9 seconds
    // on an idle machine and went over the 5 second timeout under a loaded one.
    const bounds = galaxyModel.bounds;
    const axes = [bounds.x, bounds.y, bounds.z] as const;
    let outside: string | null = null;
    for (let index = 0; index < cloud.count && outside === null; index += 1) {
      const base = index * 3;
      for (let axis = 0; axis < 3; axis += 1) {
        const value = cloud.positions[base + axis] as number;
        const [low, high] = axes[axis] as readonly [number, number];
        if (value < low || value > high) {
          outside = `point ${index} axis ${axis} is ${value}, outside ${low} to ${high}`;
          break;
        }
      }
    }
    expect(outside).toBeNull();
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
