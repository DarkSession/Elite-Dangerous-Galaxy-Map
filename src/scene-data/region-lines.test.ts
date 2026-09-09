import { beforeAll, describe, expect, test } from 'vitest';
import { galaxyModel } from '../galaxy-model/model';
import { regionLinesTransferables } from './messages';
import {
  buildRegionLines,
  fillRegionGrid,
  REGION_CELL_LY,
  REGION_GRID_SIZE,
  traceRegionLines,
} from './region-lines';
import type { RegionGrid } from './region-lines';
import type { RegionLines } from './types';

let lines: RegionLines;

beforeAll(() => {
  lines = buildRegionLines();
}, 120000);

/** A small grid with the ids written out, for the rules that need no real data. */
function gridOf(ids: number[][]): RegionGrid {
  const size = ids.length;
  const values = new Uint8Array(size * size);
  for (let iz = 0; iz < size; iz += 1) {
    for (let ix = 0; ix < size; ix += 1) {
      values[iz * size + ix] = (ids[iz] as number[])[ix] as number;
    }
  }
  return { size, origin: [0, 0], cell: 10, ids: values };
}

describe('the region grid', () => {
  test('covers the model bounds at the cell size the game uses', () => {
    expect(REGION_CELL_LY).toBeCloseTo(4096 / 83, 12);
    const span = galaxyModel.bounds.x[1] - galaxyModel.bounds.x[0];
    expect(REGION_GRID_SIZE).toBe(Math.ceil(span / REGION_CELL_LY));
    expect(REGION_GRID_SIZE * REGION_CELL_LY).toBeGreaterThanOrEqual(span);
  });

  test('gives a cell outside the map an id of its own', () => {
    // Two regions side by side, with unmapped space around them. Dropping the edge
    // between a region and no region would lose the outline of the codex map.
    const grid = gridOf([
      [0, 0, 0],
      [0, 7, 9],
      [0, 0, 0],
    ]);
    const traced = traceRegionLines(grid);
    expect(traced.count).toBeGreaterThan(0);

    const withoutRim = gridOf([
      [7, 7, 7],
      [7, 7, 9],
      [7, 7, 7],
    ]);
    expect(traceRegionLines(withoutRim).count).toBeLessThan(traced.count);
  });

  test('merges collinear neighbouring lines into one run', () => {
    // One straight boundary of three cells becomes one run, not three.
    const grid = gridOf([
      [7, 9, 9],
      [7, 9, 9],
      [7, 9, 9],
    ]);
    const traced = traceRegionLines(grid);
    expect(traced.count).toBe(1);
    expect(Array.from(traced.positions)).toEqual([10, 0, 0, 10, 0, 30]);
  });
});

describe('the boundary set', () => {
  test('is the boundary of the region grid', () => {
    expect(lines.count).toBeGreaterThanOrEqual(20000);
    expect(lines.count).toBeLessThanOrEqual(26000);
    expect(lines.positions.length).toBe(lines.count * 6);

    const cell = REGION_CELL_LY;
    const xLow = galaxyModel.bounds.x[0];
    const zLow = galaxyModel.bounds.z[0];
    let worstX = 0;
    let worstZ = 0;
    let worstY = 0;
    for (let index = 0; index < lines.positions.length; index += 3) {
      const x = lines.positions[index] as number;
      const y = lines.positions[index + 1] as number;
      const z = lines.positions[index + 2] as number;
      const stepX = (x - xLow) / cell;
      const stepZ = (z - zLow) / cell;
      worstX = Math.max(worstX, Math.abs(stepX - Math.round(stepX)) * cell);
      worstZ = Math.max(worstZ, Math.abs(stepZ - Math.round(stepZ)) * cell);
      worstY = Math.max(worstY, Math.abs(y));
      // The stored endpoint is the `float32` of a grid line, exactly.
      expect(x).toBe(Math.fround(xLow + Math.round(stepX) * cell));
      expect(z).toBe(Math.fround(zLow + Math.round(stepZ) * cell));
    }
    expect(worstY).toBe(0);
    // The set is `float32`. The spacing at the 76,000 light year corner of the bounds
    // is 7.8e-3, so half a spacing is the whole of the deviation from a grid line.
    expect(worstX).toBeLessThan(1e-2);
    expect(worstZ).toBeLessThan(1e-2);
  });

  test('draws every run along one axis', () => {
    for (let run = 0; run < lines.count; run += 1) {
      const base = run * 6;
      const sameX = lines.positions[base] === lines.positions[base + 3];
      const sameZ = lines.positions[base + 2] === lines.positions[base + 5];
      expect(sameX || sameZ).toBe(true);
    }
  });

  test('is deterministic', () => {
    const again = buildRegionLines();
    expect(again.count).toBe(lines.count);
    expect(new Uint8Array(again.positions.buffer)).toEqual(
      new Uint8Array(lines.positions.buffer),
    );
  }, 120000);

  test('is transferable', async () => {
    const grid = fillRegionGrid(galaxyModel.bounds, 64);
    const set = traceRegionLines(grid);
    const first = set.positions[0] as number;
    const channel = new MessageChannel();
    const received = await new Promise<RegionLines>((resolve) => {
      channel.port2.onmessage = (event: MessageEvent<RegionLines>) =>
        resolve(event.data);
      channel.port2.start();
      channel.port1.postMessage(set, regionLinesTransferables(set));
    });

    expect(received.count).toBe(set.count);
    expect(received.positions[0]).toBe(first);
    expect(set.positions.buffer.byteLength).toBe(0);

    channel.port1.close();
    channel.port2.close();
  });
});
