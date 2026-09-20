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
  zoneAt,
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

describe('the zone grid', () => {
  test('holds the model zone at each cell centre', () => {
    const size = table.size;
    const originX = table.origin[0];
    const originZ = table.origin[1];
    let worst = 0;
    // Every 37th cell, which is coprime with the side, so the sweep crosses the table
    // rather than reading one column of it.
    for (let cell = 0; cell < size * size; cell += 37) {
      const ix = cell % size;
      const iz = (cell - ix) / size;
      const x = originX + (ix + 0.5) * table.cell[0];
      const z = originZ + (iz + 0.5) * table.cell[1];
      worst = Math.max(
        worst,
        Math.abs((table.zone[cell] as number) - galaxyModel.zone(x, z)),
      );
    }
    // The grid holds `Float32`, so a cell carries the model value to that precision.
    expect(worst).toBeLessThan(1e-6);
  });

  test('reads the cell centre back exactly', () => {
    const x = table.origin[0] + 300.5 * table.cell[0];
    const z = table.origin[1] + 512.5 * table.cell[1];
    expect(zoneAt(table, x, z)).toBeCloseTo(galaxyModel.zone(x, z), 6);
  });

  test('keeps the tint within two steps of the model over the bounds', () => {
    // The tint is the zone in 0 to 255, so the bound is stated in tint steps. The read
    // is bilinear over cells about 98 light years wide, and the zone is smooth, so the
    // approximation must not move a tint by more than two steps.
    let worst = 0;
    let changed = 0;
    let count = 0;
    const xLow = galaxyModel.bounds.x[0];
    const zLow = galaxyModel.bounds.z[0];
    const xSpan = galaxyModel.bounds.x[1] - xLow;
    const zSpan = galaxyModel.bounds.z[1] - zLow;
    for (let step = 0; step < 40000; step += 1) {
      // A fixed low-discrepancy sweep, so the sample set is the same on every run.
      const x = xLow + ((step * 0.7548776662) % 1) * xSpan;
      const z = zLow + ((step * 0.5698402909) % 1) * zSpan;
      const exact = Math.round(galaxyModel.zone(x, z) * 255);
      const near = Math.round(zoneAt(table, x, z) * 255);
      const difference = Math.abs(exact - near);
      if (difference > worst) worst = difference;
      if (difference > 0) changed += 1;
      count += 1;
    }
    expect(worst).toBeLessThanOrEqual(2);
    expect(changed / count).toBeLessThan(0.03);
  });

  test('clamps a point outside the bounds to the edge cell', () => {
    const size = table.size;
    const far = zoneAt(
      table,
      galaxyModel.bounds.x[0] - 1e6,
      galaxyModel.bounds.z[0] - 1e6,
    );
    expect(far).toBe(table.zone[0]);
    const other = zoneAt(
      table,
      galaxyModel.bounds.x[1] + 1e6,
      galaxyModel.bounds.z[1] + 1e6,
    );
    expect(other).toBe(table.zone[size * size - 1]);
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
