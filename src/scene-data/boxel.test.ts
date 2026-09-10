import { describe, expect, test } from 'vitest';
import { galaxyModel } from '../galaxy-model/model';
import {
  baseSizeClass,
  blockDraws,
  boxelEdge,
  boxelIndexAt,
  boxelOrigin,
  BLOCK_BOXELS_PER_AXIS,
  buildBoxelBlocks,
  coveredRadius,
  DRAWN_BOXEL_COUNT,
  DRAWN_CLASS_COUNT,
  DROPPED_BOXELS_PER_AXIS,
  GRID_ORIGIN,
  listBlockBoxels,
  listDrawnBoxels,
  MAX_SIZE_CLASS,
  starPosition,
} from './boxel';
import type { BoxelBlock } from './boxel';
import { SeededRandom } from './random';

/** The cursors the drawn set tests visit: Sol, the centre and the far corner. */
const CURSORS: [number, number, number][] = [
  [0, 0, 0],
  [galaxyModel.centre[0], galaxyModel.centre[1], galaxyModel.centre[2]],
  [50000, 0, 75000],
];

/** A zoom distance that selects each base class the rule can reach, 1 to 4. */
const DISTANCE_OF_BASE_CLASS: Record<number, number> = {
  1: 500,
  2: 1000,
  3: 2000,
  4: 4000,
};

/** How many random camera positions the nesting and the reach tests use. */
const RANDOM_POSITIONS = 20000;

/** Draws camera positions spread over the model bounds. */
function randomCameras(count: number): [number, number, number][] {
  const random = new SeededRandom(20260909);
  const bounds = galaxyModel.bounds;
  const cameras: [number, number, number][] = [];
  for (let index = 0; index < count; index += 1) {
    cameras.push([
      bounds.x[0] + random.float() * (bounds.x[1] - bounds.x[0]),
      bounds.y[0] + random.float() * (bounds.y[1] - bounds.y[0]),
      bounds.z[0] + random.float() * (bounds.z[1] - bounds.z[0]),
    ]);
  }
  return cameras;
}

/** The shortest distance from a position to a face of a block, in light years. */
function distanceToNearestFace(
  block: BoxelBlock,
  camera: readonly [number, number, number],
): number {
  let shortest = Number.POSITIVE_INFINITY;
  const low = boxelOrigin(block.low, block.sizeClass);
  for (let axis = 0; axis < 3; axis += 1) {
    const lowFace = low[axis] as number;
    const highFace = lowFace + BLOCK_BOXELS_PER_AXIS * block.edge;
    const position = camera[axis] as number;
    shortest = Math.min(shortest, position - lowFace, highFace - position);
  }
  return shortest;
}

/** 200 distances spaced evenly in the logarithm, with both ends exact. */
function logSpaced(low: number, high: number, count: number): number[] {
  const logLow = Math.log(low);
  const step = (Math.log(high) - logLow) / (count - 1);
  const values: number[] = [];
  for (let index = 0; index < count; index += 1) {
    values.push(Math.exp(logLow + step * index));
  }
  values[0] = low;
  values[count - 1] = high;
  return values;
}

/** True when a block draws its 8 boxels per axis and no more. */
function spansEightBoxelsPerAxis(block: BoxelBlock): boolean {
  const corner = [...block.low] as [number, number, number];
  for (let axis = 0; axis < 3; axis += 1) {
    const low = corner[axis] as number;
    const inside = (value: number): boolean => {
      const index = [...corner] as [number, number, number];
      index[axis] = value;
      return blockDraws(block, index);
    };
    if (!inside(low) || !inside(low + BLOCK_BOXELS_PER_AXIS - 1)) return false;
    if (inside(low - 1) || inside(low + BLOCK_BOXELS_PER_AXIS)) return false;
  }
  return true;
}

/** True when the camera lies inside a block. */
function holdsCamera(
  block: BoxelBlock,
  camera: readonly [number, number, number],
): boolean {
  const index = boxelIndexAt(camera, block.sizeClass);
  for (let axis = 0; axis < 3; axis += 1) {
    const offset = (index[axis] as number) - (block.low[axis] as number);
    if (offset < 0 || offset >= BLOCK_BOXELS_PER_AXIS) return false;
  }
  return true;
}

describe('the boxel grid', () => {
  test('doubles the edge from 10 light years at class 0 to the sector at class 7', () => {
    expect(boxelEdge(0)).toBe(10);
    expect(boxelEdge(MAX_SIZE_CLASS)).toBe(1280);
  });

  test('puts the boxel of index 0 at the grid origin', () => {
    for (let sizeClass = 0; sizeClass <= MAX_SIZE_CLASS; sizeClass += 1) {
      expect(boxelIndexAt(GRID_ORIGIN, sizeClass)).toEqual([0, 0, 0]);
      expect(boxelOrigin([0, 0, 0], sizeClass)).toEqual([...GRID_ORIGIN]);
    }
  });

  test('holds a position inside the boxel its index names', () => {
    const random = new SeededRandom(11);
    const bounds = galaxyModel.bounds;
    for (let sizeClass = 0; sizeClass <= MAX_SIZE_CLASS; sizeClass += 1) {
      const edge = boxelEdge(sizeClass);
      for (let trial = 0; trial < 200; trial += 1) {
        const position: [number, number, number] = [
          bounds.x[0] + random.float() * (bounds.x[1] - bounds.x[0]),
          bounds.y[0] + random.float() * (bounds.y[1] - bounds.y[0]),
          bounds.z[0] + random.float() * (bounds.z[1] - bounds.z[0]),
        ];
        const origin = boxelOrigin(boxelIndexAt(position, sizeClass), sizeClass);
        for (let axis = 0; axis < 3; axis += 1) {
          expect(position[axis] as number).toBeGreaterThanOrEqual(
            origin[axis] as number,
          );
          expect(position[axis] as number).toBeLessThan(
            (origin[axis] as number) + edge,
          );
        }
      }
    }
  });
});

describe('a boxel star', () => {
  test('lies inside its boxel at every size class', () => {
    const random = new SeededRandom(29);
    for (let sizeClass = 0; sizeClass <= MAX_SIZE_CLASS; sizeClass += 1) {
      const edge = boxelEdge(sizeClass);
      for (let trial = 0; trial < 200; trial += 1) {
        const index: [number, number, number] = [
          Math.floor(random.float() * 8192) - 4096,
          Math.floor(random.float() * 8192) - 4096,
          Math.floor(random.float() * 8192) - 4096,
        ];
        const origin = boxelOrigin(index, sizeClass);
        for (const starIndex of [0, 1, 37, 128, 255]) {
          const star = starPosition(index, sizeClass, starIndex);
          for (let axis = 0; axis < 3; axis += 1) {
            expect(star[axis] as number).toBeGreaterThanOrEqual(origin[axis] as number);
            expect(star[axis] as number).toBeLessThan((origin[axis] as number) + edge);
          }
        }
      }
    }
  });

  test('gives the same position whatever route the reader took', () => {
    const first = starPosition([12, -7, 44], 3, 91);
    const second = starPosition([12, -7, 44], 3, 91);
    expect(second).toEqual(first);
    expect(starPosition([12, -7, 44], 4, 91)).not.toEqual(first);
    expect(starPosition([13, -7, 44], 3, 91)).not.toEqual(first);
    expect(starPosition([12, -7, 44], 3, 92)).not.toEqual(first);
  });
});

describe('the base size class', () => {
  test('follows the zoom distance', () => {
    expect([500, 1000, 2000, 4000, 8000].map(baseSizeClass)).toEqual([1, 2, 3, 4, 4]);
    expect(
      [500, 1000, 2000, 4000, 8000].map((d) => boxelEdge(baseSizeClass(d))),
    ).toEqual([20, 40, 80, 160, 160]);
  });

  test('stops at 0 below 320 light years and at 4 above 5,120', () => {
    expect(baseSizeClass(320)).toBe(0);
    expect(baseSizeClass(100)).toBe(0);
    expect(baseSizeClass(5120)).toBe(4);
    expect(baseSizeClass(120000)).toBe(4);
  });
});

describe('the drawn set', () => {
  test('holds 1,856 boxels that neither overlap nor leave a gap', () => {
    for (const cursor of CURSORS) {
      for (const distance of [500, 4000]) {
        const label = `${cursor.join(',')} at ${distance}`;
        const boxels = listDrawnBoxels(cursor, distance);
        expect(boxels.length, label).toBe(DRAWN_BOXEL_COUNT);

        // Every drawn boxel is counted in the cells of the base class. The coarsest
        // block is 64 base cells per axis, so a set with no gap and no overlap covers
        // each of its 262,144 cells exactly once.
        const base = baseSizeClass(distance);
        const blocks = buildBoxelBlocks(cursor, distance);
        const top = blocks[DRAWN_CLASS_COUNT - 1] as BoxelBlock;
        const side = BLOCK_BOXELS_PER_AXIS * (1 << (top.sizeClass - base));
        const cellLow = [...top.low].map(
          (value) => value * (1 << (top.sizeClass - base)),
        );
        const counts = new Uint8Array(side * side * side);
        for (const boxel of boxels) {
          const step = 1 << (boxel.sizeClass - base);
          const low = [0, 1, 2].map(
            (axis) => (boxel.index[axis] as number) * step - (cellLow[axis] as number),
          );
          for (let ix = 0; ix < step; ix += 1) {
            for (let iy = 0; iy < step; iy += 1) {
              for (let iz = 0; iz < step; iz += 1) {
                const cell =
                  ((low[0] as number) + ix) * side * side +
                  ((low[1] as number) + iy) * side +
                  ((low[2] as number) + iz);
                counts[cell] = (counts[cell] as number) + 1;
              }
            }
          }
        }
        let covered = 0;
        let overlapping = 0;
        for (const count of counts) {
          if (count === 1) covered += 1;
          if (count > 1) overlapping += 1;
        }
        expect(overlapping, label).toBe(0);
        expect(covered, label).toBe(counts.length);
      }
    }
  });

  test('draws 512 boxels at the base class and 448 above it', () => {
    const blocks = buildBoxelBlocks([0, 0, 0], 500);
    expect(blocks.length).toBe(DRAWN_CLASS_COUNT);
    expect(listBlockBoxels(blocks[0] as BoxelBlock).length).toBe(512);
    for (let index = 1; index < DRAWN_CLASS_COUNT; index += 1) {
      expect(listBlockBoxels(blocks[index] as BoxelBlock).length).toBe(448);
    }
  });
});

describe('the classes', () => {
  test('nest at every camera position', () => {
    const cameras = randomCameras(RANDOM_POSITIONS);
    const failures: string[] = [];
    for (const camera of cameras) {
      for (const baseClass of [1, 2, 3, 4]) {
        const distance = DISTANCE_OF_BASE_CLASS[baseClass] as number;
        const blocks = buildBoxelBlocks(camera, distance);
        const where = `${camera.map(Math.round).join(',')} at base class ${baseClass}`;
        if (blocks.length !== DRAWN_CLASS_COUNT) {
          failures.push(`${where}: ${blocks.length} blocks`);
          continue;
        }

        for (let level = 0; level < DRAWN_CLASS_COUNT; level += 1) {
          const block = blocks[level] as BoxelBlock;
          if (block.sizeClass !== baseClass + level) {
            failures.push(`${where}: class ${block.sizeClass} at level ${level}`);
          }
          if (!spansEightBoxelsPerAxis(block)) {
            failures.push(
              `${where}: class ${block.sizeClass} is not 8 boxels per axis`,
            );
          }
          if (!holdsCamera(block, camera)) {
            failures.push(`${where}: class ${block.sizeClass} misses the camera`);
          }
          if (level === 0) {
            if (block.droppedPerAxis !== 0) {
              failures.push(`${where}: the base class drops boxels`);
            }
            continue;
          }
          const below = blocks[level - 1] as BoxelBlock;
          if (block.droppedPerAxis !== DROPPED_BOXELS_PER_AXIS) {
            failures.push(`${where}: class ${block.sizeClass} drops the wrong count`);
          }
          for (let axis = 0; axis < 3; axis += 1) {
            if (
              (block.droppedLow[axis] as number) * 2 !==
              (below.low[axis] as number)
            ) {
              failures.push(`${where}: class ${block.sizeClass} drops the wrong block`);
            }
          }
          if (blockDraws(block, boxelIndexAt(camera, block.sizeClass))) {
            failures.push(
              `${where}: class ${block.sizeClass} keeps the camera's boxel`,
            );
          }
        }
      }
    }
    expect(failures.slice(0, 5)).toEqual([]);
  });
});

describe('the covered sphere', () => {
  test('keeps the camera three coarse boxels from the nearest face', () => {
    const cameras = randomCameras(RANDOM_POSITIONS);
    const failures: string[] = [];
    for (const camera of cameras) {
      for (const baseClass of [1, 2, 3, 4]) {
        const distance = DISTANCE_OF_BASE_CLASS[baseClass] as number;
        const blocks = buildBoxelBlocks(camera, distance);
        const top = blocks[DRAWN_CLASS_COUNT - 1] as BoxelBlock;
        const reach = distanceToNearestFace(top, camera);
        if (reach < 3 * top.edge) {
          failures.push(`${camera.map(Math.round).join(',')}: reach ${reach}`);
        }
        if (coveredRadius(distance) !== 3 * top.edge) {
          failures.push(`${distance}: covered radius ${coveredRadius(distance)}`);
        }
      }
    }
    expect(failures.slice(0, 5)).toEqual([]);
  });

  test('reaches at least three quarters of the zoom distance', () => {
    for (const distance of logSpaced(500, 5120, 200)) {
      expect(
        coveredRadius(distance) / distance,
        `at ${distance}`,
      ).toBeGreaterThanOrEqual(0.75);
    }
  });
});
