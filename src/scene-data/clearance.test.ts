import { describe, expect, test } from 'vitest';
import {
  buildClearanceField,
  buildRegionLabelGeometry,
  clearanceAt,
  CLEARANCE_DOWNSAMPLE,
  downsampleClearance,
  markClearanceSeeds,
} from './clearance';
import type { ExactClearanceField } from './clearance';
import { REGION_CELL_LY, REGION_DEPARTURE_LY } from './region-lines';
import type { RegionGrid } from './region-lines';

/** A grid with the ids written out, one row per line of the picture. */
function gridOf(rows: string[], cell = REGION_CELL_LY): RegionGrid {
  const size = rows.length;
  const ids = new Uint8Array(size * size);
  for (let iz = 0; iz < size; iz += 1) {
    const row = rows[iz] as string;
    for (let ix = 0; ix < size; ix += 1) {
      ids[iz * size + ix] = Number.parseInt(row[ix] as string, 10);
    }
  }
  return { size, origin: [0, 0], cell, ids };
}

/** The distance from a cell to the nearest seeded cell, in light years. */
function searchClearance(
  grid: RegionGrid,
  seeds: Uint8Array,
  ix: number,
  iz: number,
): number {
  let best = Number.POSITIVE_INFINITY;
  for (let sz = 0; sz < grid.size; sz += 1) {
    for (let sx = 0; sx < grid.size; sx += 1) {
      if (seeds[sz * grid.size + sx] === 0) continue;
      const gap = Math.hypot(sx - ix, sz - iz);
      if (gap < best) best = gap;
    }
  }
  return best * grid.cell;
}

/** A grid of three regions with a rim of cells that hold no region. */
const THREE_REGIONS = [
  '00000000000000000000',
  '00000000000000000000',
  '00111111111122222000',
  '00111111111122222000',
  '00111111111122222000',
  '00111111111122222000',
  '00111111111122222000',
  '00111111111122222000',
  '00111111111122222000',
  '00111111111122222000',
  '00111111111122222000',
  '00333333333322222000',
  '00333333333322222000',
  '00333333333322222000',
  '00333333333322222000',
  '00333333333322222000',
  '00333333333322222000',
  '00000000000000000000',
  '00000000000000000000',
  '00000000000000000000',
];

describe('the clearance seeds', () => {
  test('marks the cells on both sides of the boundary and no others', () => {
    const grid = gridOf(['111', '122', '122']);
    const seeds = markClearanceSeeds(grid);
    // The two corner cells touch their own id only. Every other cell of this grid
    // has a 4-neighbour of the other id.
    expect(Array.from(seeds)).toEqual([0, 1, 1, 1, 1, 1, 1, 1, 0]);
  });

  test('leaves a cell that touches its own id only', () => {
    const grid = gridOf(['11111', '11111', '11211', '11111', '11111']);
    const seeds = markClearanceSeeds(grid);
    expect(seeds[0]).toBe(0);
    // The four neighbours of the odd cell, and the odd cell itself, are seeds.
    expect(seeds[2 * 5 + 2]).toBe(1);
    expect(seeds[1 * 5 + 2]).toBe(1);
    expect(seeds[2 * 5 + 1]).toBe(1);
  });

  test('counts no region as an id of its own', () => {
    const grid = gridOf(['111', '111', '110']);
    const seeds = markClearanceSeeds(grid);
    expect(seeds[2 * 3 + 1]).toBe(1);
    expect(seeds[1 * 3 + 2]).toBe(1);
    expect(seeds[0]).toBe(0);
  });
});

describe('the clearance field', () => {
  test('is exact over a hand-built grid', () => {
    const grid = gridOf(THREE_REGIONS);
    const seeds = markClearanceSeeds(grid);
    const field = buildClearanceField(grid);
    let worstAbove = 0;
    let worstBelow = 0;
    for (let iz = 0; iz < grid.size; iz += 1) {
      for (let ix = 0; ix < grid.size; ix += 1) {
        const value = field.values[iz * grid.size + ix] as number;
        const searched = searchClearance(grid, seeds, ix, iz);
        worstAbove = Math.max(worstAbove, value - searched);
        worstBelow = Math.max(worstBelow, searched - value);
      }
    }
    expect(worstAbove).toBeLessThanOrEqual(0);
    expect(worstBelow).toBeLessThan(1);
  });

  test('holds a cell that touches another id at zero', () => {
    const grid = gridOf(THREE_REGIONS);
    const field = buildClearanceField(grid);
    // The last cell inside region 1 before region 2 starts, and the first cell of
    // region 2. The distance runs to the last cell inside, so both read zero.
    expect(field.values[5 * grid.size + 11]).toBe(0);
    expect(field.values[5 * grid.size + 12]).toBe(0);
  });

  test('anchors the value of a cell at the centre of the cell', () => {
    const grid = gridOf(THREE_REGIONS);
    const field = buildClearanceField(grid);
    expect(field.origin[0]).toBeCloseTo(grid.cell / 2, 9);
    expect(field.cell).toBe(grid.cell);
    expect(field.size).toBe(grid.size);
  });

  test('rounds down, so it is a lower bound', () => {
    // The nearest seed sits one cell away on one axis and two on the other, so the
    // true distance is not a whole number of light years and the stored value sits
    // below it.
    const grid = gridOf(['11111', '11111', '11111', '11111', '11112']);
    const field = buildClearanceField(grid);
    const exact = Math.hypot(1, 2) * grid.cell;
    expect(field.values[2 * 5 + 2]).toBe(Math.floor(exact));
    expect(field.values[2 * 5 + 2]).toBeLessThan(exact);
  });
});

describe('the downsampled field', () => {
  test('carries the smallest exact value of the cells it covers', () => {
    const grid = gridOf(THREE_REGIONS);
    const field = buildClearanceField(grid);
    const coarse = downsampleClearance(field);
    expect(coarse.size).toBe(Math.ceil(grid.size / CLEARANCE_DOWNSAMPLE));
    for (let bz = 0; bz < coarse.size; bz += 1) {
      for (let bx = 0; bx < coarse.size; bx += 1) {
        let least = Number.POSITIVE_INFINITY;
        for (let iz = bz * 8; iz < Math.min(grid.size, bz * 8 + 8); iz += 1) {
          for (let ix = bx * 8; ix < Math.min(grid.size, bx * 8 + 8); ix += 1) {
            least = Math.min(least, field.values[iz * grid.size + ix] as number);
          }
        }
        expect(coarse.values[bz * coarse.size + bx]).toBe(least);
      }
    }
  });

  test('anchors a block value at the centre of the block', () => {
    const grid = gridOf(THREE_REGIONS);
    const coarse = downsampleClearance(buildClearanceField(grid));
    expect(coarse.cell).toBe(grid.cell * CLEARANCE_DOWNSAMPLE);
    // The block covers the cells 0 to 7, whose centres run from half a cell to seven
    // and a half cells. The middle of that is four cells.
    expect(coarse.origin[0]).toBeCloseTo(4 * grid.cell, 9);
    expect(coarse.origin[1]).toBeCloseTo(4 * grid.cell, 9);
  });

  test('reads nothing outside the field', () => {
    const grid = gridOf(THREE_REGIONS);
    const coarse = downsampleClearance(buildClearanceField(grid));
    const last = (coarse.origin[0] as number) + (coarse.size - 1) * coarse.cell;
    expect(clearanceAt(coarse, (coarse.origin[0] as number) - 1, 0)).toBeNull();
    expect(clearanceAt(coarse, 0, (coarse.origin[1] as number) - 1)).toBeNull();
    expect(clearanceAt(coarse, last + 1, last)).toBeNull();
    expect(clearanceAt(coarse, last, last + 1)).toBeNull();
    expect(clearanceAt(coarse, last, last)).not.toBeNull();
  });

  test('reads a cell value exactly at the anchor of that cell', () => {
    const grid = gridOf(THREE_REGIONS);
    const coarse = downsampleClearance(buildClearanceField(grid));
    const x = (coarse.origin[0] as number) + coarse.cell;
    const z = (coarse.origin[1] as number) + coarse.cell;
    expect(clearanceAt(coarse, x, z)).toBeCloseTo(
      coarse.values[1 * coarse.size + 1] as number,
      9,
    );
  });
});

describe('the region label geometry', () => {
  /** A C-shaped region, whose centroid falls outside it. */
  const CONCAVE = [
    '2222222222222',
    '2111111111112',
    '2111111111112',
    '2111111111112',
    '2111222222222',
    '2111222222222',
    '2111222222222',
    '2111222222222',
    '2111222222222',
    '2111111111112',
    '2111111111112',
    '2111111111112',
    '2222222222222',
  ];

  test('puts the centre inside a concave region, where the centroid is not', () => {
    const grid = gridOf(CONCAVE);
    const field = buildClearanceField(grid);
    const geometry = buildRegionLabelGeometry(grid, field, REGION_DEPARTURE_LY);

    let sumX = 0;
    let sumZ = 0;
    let cells = 0;
    for (let iz = 0; iz < grid.size; iz += 1) {
      for (let ix = 0; ix < grid.size; ix += 1) {
        if (grid.ids[iz * grid.size + ix] !== 1) continue;
        sumX += ix;
        sumZ += iz;
        cells += 1;
      }
    }
    const centroidX = Math.round(sumX / cells);
    const centroidZ = Math.round(sumZ / cells);
    expect(grid.ids[centroidZ * grid.size + centroidX]).not.toBe(1);

    const centreX = Math.round(
      ((geometry.centres[0] as number) - (field.origin[0] as number)) / field.cell,
    );
    const centreZ = Math.round(
      ((geometry.centres[1] as number) - (field.origin[1] as number)) / field.cell,
    );
    expect(grid.ids[centreZ * grid.size + centreX]).toBe(1);
  });

  test('records the exact clearance at the centre it chose', () => {
    const grid = gridOf(CONCAVE);
    const field = buildClearanceField(grid);
    const geometry = buildRegionLabelGeometry(grid, field, REGION_DEPARTURE_LY);
    for (let id = 1; id <= 2; id += 1) {
      const x = geometry.centres[(id - 1) * 2] as number;
      const z = geometry.centres[(id - 1) * 2 + 1] as number;
      const ix = Math.round((x - (field.origin[0] as number)) / field.cell);
      const iz = Math.round((z - (field.origin[1] as number)) / field.cell);
      expect(field.values[iz * grid.size + ix]).toBe(geometry.clearances[id - 1]);
      // No cell of the same region holds more clearance.
      for (let cz = 0; cz < grid.size; cz += 1) {
        for (let cx = 0; cx < grid.size; cx += 1) {
          if (grid.ids[cz * grid.size + cx] !== id) continue;
          expect(field.values[cz * grid.size + cx]).toBeLessThanOrEqual(
            geometry.clearances[id - 1] as number,
          );
        }
      }
    }
  });

  test('carries the departure bound the worker was given', () => {
    const grid = gridOf(CONCAVE);
    const geometry = buildRegionLabelGeometry(
      grid,
      buildClearanceField(grid),
      REGION_DEPARTURE_LY,
    );
    expect(geometry.departureLy).toBe(REGION_DEPARTURE_LY);
    expect(geometry.centres.length).toBe(84);
    expect(geometry.clearances.length).toBe(42);
  });

  test('leaves a region with no cell in the grid without a centre', () => {
    const grid = gridOf(CONCAVE);
    const geometry = buildRegionLabelGeometry(
      grid,
      buildClearanceField(grid),
      REGION_DEPARTURE_LY,
    );
    expect(Number.isNaN(geometry.centres[2 * 2] as number)).toBe(true);
  });
});

describe('the field over a random grid', () => {
  /** A grid of random ids, which makes an irregular field to check against. */
  function randomGrid(size: number, seed: number): RegionGrid {
    let state = seed;
    const next = (): number => {
      state = (state * 1103515245 + 12345) % 2147483648;
      return state / 2147483648;
    };
    const ids = new Uint8Array(size * size);
    // Large blocks, so the field runs far and the transform has work to do.
    const block = 9;
    const blocks = Math.ceil(size / block);
    const choice = new Uint8Array(blocks * blocks);
    for (let index = 0; index < choice.length; index += 1) {
      choice[index] = Math.floor(next() * 4);
    }
    for (let iz = 0; iz < size; iz += 1) {
      for (let ix = 0; ix < size; ix += 1) {
        const at = Math.floor(iz / block) * blocks + Math.floor(ix / block);
        ids[iz * size + ix] = choice[at] as number;
      }
    }
    return { size, origin: [0, 0], cell: REGION_CELL_LY, ids };
  }

  test('is exact and 1-Lipschitz, and its downsample never claims more room', () => {
    const grid = randomGrid(48, 7);
    const seeds = markClearanceSeeds(grid);
    const field = buildClearanceField(grid);
    let worstBelow = 0;
    for (let iz = 0; iz < grid.size; iz += 1) {
      for (let ix = 0; ix < grid.size; ix += 1) {
        const value = field.values[iz * grid.size + ix] as number;
        const searched = searchClearance(grid, seeds, ix, iz);
        expect(value).toBeLessThanOrEqual(searched);
        worstBelow = Math.max(worstBelow, searched - value);
      }
    }
    expect(worstBelow).toBeLessThan(1);

    const coarse = downsampleClearance(field);
    let worstOvershoot = 0;
    for (let iz = 0; iz < grid.size; iz += 1) {
      for (let ix = 0; ix < grid.size; ix += 1) {
        const x = (field.origin[0] as number) + ix * field.cell;
        const z = (field.origin[1] as number) + iz * field.cell;
        const read = clearanceAt(coarse, x, z);
        if (read === null) continue;
        const exact = field.values[iz * grid.size + ix] as number;
        worstOvershoot = Math.max(worstOvershoot, read - exact);
      }
    }
    expect(worstOvershoot).toBeLessThanOrEqual(REGION_CELL_LY);
  });
});

/** The largest gap between two cells of a field, over every pair, in light years. */
function worstLipschitzGap(field: ExactClearanceField): number {
  let worst = 0;
  for (let az = 0; az < field.size; az += 1) {
    for (let ax = 0; ax < field.size; ax += 1) {
      const first = field.values[az * field.size + ax] as number;
      for (let bz = 0; bz < field.size; bz += 1) {
        for (let bx = 0; bx < field.size; bx += 1) {
          const second = field.values[bz * field.size + bx] as number;
          const apart = Math.hypot(ax - bx, az - bz) * field.cell;
          worst = Math.max(worst, Math.abs(first - second) - apart);
        }
      }
    }
  }
  return worst;
}

/** The largest gap between two cells that touch, in light years. */
function worstTouchingGap(field: ExactClearanceField): number {
  let worst = 0;
  for (let iz = 0; iz < field.size; iz += 1) {
    for (let ix = 0; ix < field.size; ix += 1) {
      const value = field.values[iz * field.size + ix] as number;
      if (ix + 1 < field.size) {
        worst = Math.max(
          worst,
          Math.abs(value - (field.values[iz * field.size + ix + 1] as number)),
        );
      }
      if (iz + 1 < field.size) {
        worst = Math.max(
          worst,
          Math.abs(value - (field.values[(iz + 1) * field.size + ix] as number)),
        );
      }
    }
  }
  return worst;
}

/**
 * A city-block distance transform of the same seeds, as a control. It is the cheap
 * approximation the exact transform replaces: two sweeps over the grid, each cell
 * taking one more than its smallest 4-neighbour.
 */
function cityBlockField(grid: RegionGrid): ExactClearanceField {
  const size = grid.size;
  const seeds = markClearanceSeeds(grid);
  const steps = new Float64Array(size * size);
  for (let index = 0; index < steps.length; index += 1) {
    steps[index] = seeds[index] === 1 ? 0 : size * 2;
  }
  for (let iz = 0; iz < size; iz += 1) {
    for (let ix = 0; ix < size; ix += 1) {
      const at = iz * size + ix;
      if (ix > 0)
        steps[at] = Math.min(steps[at] as number, (steps[at - 1] as number) + 1);
      if (iz > 0) {
        steps[at] = Math.min(steps[at] as number, (steps[at - size] as number) + 1);
      }
    }
  }
  for (let iz = size - 1; iz >= 0; iz -= 1) {
    for (let ix = size - 1; ix >= 0; ix -= 1) {
      const at = iz * size + ix;
      if (ix + 1 < size) {
        steps[at] = Math.min(steps[at] as number, (steps[at + 1] as number) + 1);
      }
      if (iz + 1 < size) {
        steps[at] = Math.min(steps[at] as number, (steps[at + size] as number) + 1);
      }
    }
  }
  const values = new Uint16Array(size * size);
  for (let index = 0; index < values.length; index += 1) {
    values[index] = Math.floor((steps[index] as number) * grid.cell);
  }
  return {
    size,
    origin: [
      (grid.origin[0] as number) + grid.cell / 2,
      (grid.origin[1] as number) + grid.cell / 2,
    ],
    cell: grid.cell,
    values,
  };
}

describe('the Lipschitz bound over a small field', () => {
  test('no pair differs by more than the distance between the two cells', () => {
    const grid = gridOf(THREE_REGIONS);
    const field = buildClearanceField(grid);
    // The rounding to whole light years lets one pair differ by up to one more.
    expect(worstLipschitzGap(field)).toBeLessThanOrEqual(1);
    expect(worstTouchingGap(field)).toBeLessThanOrEqual(REGION_CELL_LY + 1);
  });

  test('a city-block transform passes a touching-pair check and fails this one', () => {
    // The control shows the check can fail. A chained path between two distant cells
    // is longer than the straight line between them, so an approximate transform
    // holds between neighbours and still breaks the reader that subtracts a
    // straight-line distance.
    const grid = gridOf(THREE_REGIONS);
    const control = cityBlockField(grid);
    expect(worstTouchingGap(control)).toBeLessThanOrEqual(REGION_CELL_LY + 1);
    expect(worstLipschitzGap(control)).toBeGreaterThan(1);
  });
});
