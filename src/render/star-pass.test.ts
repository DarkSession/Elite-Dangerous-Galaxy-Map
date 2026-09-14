import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, test } from 'vitest';
import { cameraPosition } from '../camera/projection';
import type { View } from '../camera/view';
import { decodeDetailGrid } from '../galaxy-model/detail';
import parameters from '../galaxy-model/galaxy-model.json' with { type: 'json' };
import { createGalaxyModel } from '../galaxy-model/model';
import type { GalaxyModel } from '../galaxy-model/model';
import {
  boxelEdge,
  boxelOrigin,
  boxelSeed,
  buildBoxelBlocks,
  coveredRadius,
  DRAWN_BOXEL_COUNT,
  DRAWN_CLASS_COUNT,
  listBlockBoxels,
  listDrawnBoxels,
  starOffsets,
  STARS_PER_BOXEL,
} from '../scene-data/boxel';
import {
  buildSurfaceTable,
  DEFAULT_POINT_COUNT,
  drawHeight,
  heightDrawOf,
} from '../scene-data/point-cloud';
import type { SurfaceTable } from '../scene-data/point-cloud';
import { SeededRandom } from '../scene-data/random';
import { MASS_INTEGRAL } from '../scene-data/star-field';
import { DEFAULT_POINT_BRIGHTNESS, POINT_RADIUS_LY } from './point-pass';
import {
  closeFade,
  handoverRadii,
  heldCloseFade,
  MAX_STAR_PIXELS,
  MIN_STAR_PIXELS,
  pointFade,
  STAR_LIGHT,
  STAR_SPREAD_MEAN,
  starBrightness,
  starFade,
  starPixelSize,
  starSpread,
  starWeight,
} from './star-pass';

const pngPath = fileURLToPath(
  new URL('../galaxy-model/galaxy-detail.png', import.meta.url),
);

let model: GalaxyModel;

beforeAll(async () => {
  const grid = await decodeDetailGrid(new Uint8Array(readFileSync(pngPath)));
  model = createGalaxyModel(parameters, grid);
}, 120000);

/** The 34 places the light budget is checked at. */
function lightPlaces(): [number, number, number][] {
  const centre = model.centre;
  const places: [number, number, number][] = [
    [0, 0, 0],
    [centre[0], centre[1], centre[2]],
  ];
  for (const radius of [2000, 20000]) {
    for (let step = 0; step < 16; step += 1) {
      const angle = (2 * Math.PI * step) / 16;
      places.push([
        centre[0] + radius * Math.cos(angle),
        centre[1],
        centre[2] + radius * Math.sin(angle),
      ]);
    }
  }
  return places;
}

describe('the light budget', () => {
  test('comes from the point cloud constants', () => {
    expect(STAR_LIGHT).toBeCloseTo(
      (DEFAULT_POINT_BRIGHTNESS * POINT_RADIUS_LY ** 2 * DEFAULT_POINT_COUNT) /
        MASS_INTEGRAL,
      12,
    );
    expect(STAR_LIGHT).toBeCloseTo(0.4185, 4);
  });

  test('gives the two sources the same light per cubic light year', () => {
    // The point cloud side comes from the path the generator really takes, not from the
    // closed form the star field is derived from. `buildSurfaceTable` gives the plane
    // cell its mass, the sample lands anywhere in that cell, and `drawHeight` draws the
    // height from the model's vertical profile, which the test below ties to it. So the
    // samples per cubic light year at a place are
    // `count * cellMass / (total * cellArea) * verticalProfile(height, radius)`, and
    // the reading holds `MASS_INTEGRAL` to the table the sampler really uses.
    //
    // Each reading is taken at the centre of the table cell that holds the place. The
    // sampler's plane density is constant over a cell and equals the model's density at
    // the cell centre, so a reading elsewhere in the cell measures the table's 97.66
    // light year resolution, which reaches 44 percent at these places, instead of the
    // two light budgets.
    const table: SurfaceTable = buildSurfaceTable(model);
    const total = table.cumulative[table.cumulative.length - 1] as number;
    const cellArea = table.cell[0] * table.cell[1];
    const places = lightPlaces();
    expect(places.length).toBe(34);

    let worst = 0;
    for (const place of places) {
      const ix = Math.floor((place[0] - table.origin[0]) / table.cell[0]);
      const iz = Math.floor((place[2] - table.origin[1]) / table.cell[1]);
      const cell = iz * table.size + ix;
      const mass =
        (table.cumulative[cell] as number) -
        (cell > 0 ? (table.cumulative[cell - 1] as number) : 0);
      const x = table.origin[0] + (ix + 0.5) * table.cell[0];
      const z = table.origin[1] + (iz + 0.5) * table.cell[1];
      const height = place[1];

      const samples =
        (DEFAULT_POINT_COUNT *
          mass *
          model.verticalProfile(height - model.centre[1], model.radius(x, z))) /
        (total * cellArea);
      const points = DEFAULT_POINT_BRIGHTNESS * POINT_RADIUS_LY ** 2 * samples;
      const field = STAR_LIGHT * model.detailedMassDensity(x, height, z);
      expect(points).toBeGreaterThan(0);
      worst = Math.max(worst, Math.abs(field - points) / points);
    }
    expect(worst).toBeLessThan(0.01);
  });

  test('draws the heights the vertical profile the light reading uses gives', () => {
    // The light reading above takes the height factor from `model.verticalProfile`.
    // This test holds that function to `drawHeight`, which is what the generator calls,
    // by counting draws inside three bands at each radius the places sit at.
    const draw = heightDrawOf(model);
    const random = new SeededRandom(11);
    const count = 200000;
    let worst = 0;
    for (const radius of [0, 2000, 20000, 25895]) {
      const heights: number[] = [];
      for (let index = 0; index < count; index += 1) {
        heights.push(drawHeight(draw, radius, random));
      }
      for (const band of [100, 400, 1200]) {
        const inside = heights.filter((height) => Math.abs(height) <= band).length;
        // The profile over the band, by a midpoint sum on a 1 light year grid.
        let expected = 0;
        for (let height = -band + 0.5; height < band; height += 1) {
          expected += model.verticalProfile(height, radius);
        }
        worst = Math.max(worst, Math.abs(inside / count - expected) / expected);
      }
    }
    expect(worst).toBeLessThan(0.02);
  });
});

describe('a star sprite', () => {
  test('deposits the same light at every radius and every range', () => {
    const focal = 935.3;
    const lightPerStar = 0.0873;
    let worst = 0;
    for (const radius of [0.1, 0.32, 1, 3.2, 10]) {
      for (const range of [10, 50, 200, 800, 2000, 8000]) {
        const size = starPixelSize(focal, range, radius);
        const brightness = starBrightness(lightPerStar, focal, range, radius, 1, 1);
        const deposited = brightness * size * size;
        const expected = (lightPerStar * focal * focal) / (range * range);
        worst = Math.max(worst, Math.abs(deposited - expected) / expected);
      }
    }
    expect(worst).toBeLessThan(1e-6);
  });

  test('carries the handover fade and the spread as separate factors', () => {
    const focal = 935.3;
    const plain = starBrightness(0.0873, focal, 500, 1, 1, 1);
    expect(starBrightness(0.0873, focal, 500, 1, 0.25, 1)).toBeCloseTo(
      plain * 0.25,
      12,
    );
    expect(starBrightness(0.0873, focal, 500, 1, 1, 2.5)).toBeCloseTo(plain * 2.5, 12);
    expect(starBrightness(0.0873, focal, 500, 1, 0.25, 2.5)).toBeCloseTo(
      plain * 0.625,
      12,
    );
  });

  test('holds its on-screen size between 1 and 16 pixels', () => {
    const focal = 935.3;
    expect(starPixelSize(focal, 8000, 0.1)).toBe(MIN_STAR_PIXELS);
    expect(starPixelSize(focal, 10, 10)).toBe(MAX_STAR_PIXELS);
    expect(starPixelSize(focal, 1000, 5)).toBeCloseTo((focal * 5) / 1000, 9);
  });
});

describe('the brightness spread', () => {
  /** The mean, the worst boxel and the ends of the spread over a set of boxels. */
  function spreadOver(seeds: number[]): {
    mean: number;
    worstBoxel: number;
    low: number;
    high: number;
  } {
    let total = 0;
    let count = 0;
    let worstBoxel = 0;
    let low = Number.POSITIVE_INFINITY;
    let high = 0;
    for (const seed of seeds) {
      let sum = 0;
      for (let star = 0; star < STARS_PER_BOXEL; star += 1) {
        const value = starSpread(seed, star);
        sum += value;
        low = Math.min(low, value);
        high = Math.max(high, value);
      }
      total += sum;
      count += STARS_PER_BOXEL;
      worstBoxel = Math.max(worstBoxel, Math.abs(sum / STARS_PER_BOXEL - 1));
    }
    return { mean: total / count, worstBoxel, low, high };
  }

  test('does not change a boxel light', () => {
    // The set is the one the field draws at Sol at 500 light years: 1,856 boxels over
    // the four size classes, with the index pattern and the seeds of a real frame.
    //
    // The mean runs over the star indices of a full boxel, for every boxel of that set.
    // One boxel draws at most 256 stars and the spread's own standard deviation is 0.89
    // times its mean, so the mean over a single boxel scatters by about 0.056 and the
    // worst of the 1,856 is 0.212 from 1. Over the whole field that scatter falls to
    // 0.0013, and the field's light rests on the field mean.
    const drawn = listDrawnBoxels([0, 0, 0], 500);
    expect(drawn.length).toBe(DRAWN_BOXEL_COUNT);
    expect(new Set(drawn.map((boxel) => boxel.sizeClass)).size).toBe(DRAWN_CLASS_COUNT);
    const field = spreadOver(
      drawn.map((boxel) => boxelSeed(boxel.index, boxel.sizeClass)),
    );

    expect(Math.abs(field.mean - 1)).toBeLessThan(0.01);
    expect(field.worstBoxel).toBeLessThan(0.3);
    // The faintest star of the field against the brightest.
    expect(field.high / field.low).toBeGreaterThanOrEqual(10);

    // One full boxel on its own spans the same factor.
    const one = spreadOver([boxelSeed([2499, 2049, 1205], 1)]);
    expect(one.high / one.low).toBeGreaterThanOrEqual(10);
  });

  test('keeps its mean over a block of neighbouring seeds of one size class', () => {
    // A harder correlation case than a drawn set: 1,856 boxels that are neighbours on
    // two axes, all of size class 1, so a hash that carried its input pattern through
    // would show here.
    const seeds: number[] = [];
    for (let boxel = 0; boxel < DRAWN_BOXEL_COUNT; boxel += 1) {
      seeds.push(boxelSeed([boxel % 60, Math.floor(boxel / 60), 7], 1));
    }
    const block = spreadOver(seeds);
    expect(Math.abs(block.mean - 1)).toBeLessThan(0.01);
    expect(block.worstBoxel).toBeLessThan(0.3);
    expect(block.high / block.low).toBeGreaterThanOrEqual(10);
  });

  test('carries the normalising constant the shader carries', () => {
    expect(STAR_SPREAD_MEAN).toBe(0.9);
    expect(STAR_SPREAD_MEAN).toBeCloseTo(0.3 + 3 / 5, 15);
  });

  test('never falls below the faint end or rises above the bright end', () => {
    const seed = boxelSeed([2499, 2049, 1205], 1);
    let low = Number.POSITIVE_INFINITY;
    let high = 0;
    for (let star = 0; star < STARS_PER_BOXEL; star += 1) {
      const value = starSpread(seed, star);
      low = Math.min(low, value);
      high = Math.max(high, value);
    }
    expect(low).toBeGreaterThanOrEqual(0.3 / STAR_SPREAD_MEAN);
    expect(high).toBeLessThanOrEqual(3.3 / STAR_SPREAD_MEAN);
    expect(high / low).toBeGreaterThan(3);
  });
});

describe('the handover', () => {
  test('gives the two fades a sum of one', () => {
    // The sum is 1 where the close fade is 1. Below 2,560 light years the close fade
    // takes light out of the frame, and the test below reads that band.
    let worst = 0;
    for (const distance of [2560, 4000, 6000, 8000]) {
      const weight = starWeight(distance);
      const radii = handoverRadii(distance);
      expect(closeFade(distance)).toBe(1);
      for (let range = 0; range <= 20000; range += 25) {
        const sum =
          starFade(weight * closeFade(distance), radii, range) +
          pointFade(weight, radii, range);
        worst = Math.max(worst, Math.abs(sum - 1));
      }
    }
    expect(worst).toBeLessThan(1e-6);
  });

  test('takes light out of the frame at the close zoom distances', () => {
    for (const distance of [500, 640, 1000, 2000]) {
      const weight = starWeight(distance);
      const radii = handoverRadii(distance);
      const close = closeFade(distance);
      for (let range = 0; range <= 20000; range += 25) {
        const handover = starFade(weight, radii, range);
        // The point pass reads the handover weight alone, so its factor is the one it
        // holds when the close fade is 1.
        expect(pointFade(weight, radii, range)).toBeCloseTo(1 - handover, 12);
        // The star pass reads the product, so the frame loses the faded light.
        expect(starFade(weight * close, radii, range)).toBeCloseTo(
          close * handover,
          12,
        );
      }
    }
  });

  test('holds at the value a test sets and returns to the zoom distance', () => {
    expect(heldCloseFade(1, 500)).toBe(1);
    expect(heldCloseFade(0.25, 4000)).toBe(0.25);
    expect(heldCloseFade(null, 500)).toBe(closeFade(500));
    expect(heldCloseFade(null, 1000)).toBe(closeFade(1000));
    expect(heldCloseFade(null, 4000)).toBe(1);
    // A value outside 0 to 1 cannot change the light.
    expect(heldCloseFade(4, 500)).toBe(1);
    expect(heldCloseFade(-1, 4000)).toBe(0);
  });

  test('follows the zoom distance', () => {
    const readings: [number, number][] = [
      [500, 0],
      [640, 0],
      [1000, 0.092],
      [1280, 0.259],
      [2560, 1],
      [4000, 1],
    ];
    for (const [distance, wanted] of readings) {
      expect(closeFade(distance)).toBeCloseTo(wanted, 3);
    }
    let last = 0;
    for (let distance = 0; distance <= 8000; distance += 10) {
      const value = closeFade(distance);
      expect(value).toBeGreaterThanOrEqual(last);
      last = value;
    }
  });

  test('puts the fade band inside the covered sphere', () => {
    for (const [baseClass, distance] of [
      [1, 500],
      [2, 1000],
      [3, 2000],
      [4, 4000],
    ] as const) {
      const radii = handoverRadii(distance);
      expect(radii[1]).toBe(3 * boxelEdge(baseClass + DRAWN_CLASS_COUNT - 1));
      expect(radii[1]).toBe(coveredRadius(distance));
      expect(radii[0]).toBe(radii[1] / 2);
    }
  });

  test('draws the field in full at 4,000 light years and not at all at 8,000', () => {
    expect(starWeight(500)).toBe(1);
    expect(starWeight(4000)).toBe(1);
    expect(starWeight(6000)).toBeCloseTo(0.5, 9);
    expect(starWeight(8000)).toBe(0);
    expect(starWeight(60000)).toBe(0);
  });

  test('leaves a point cloud sample untouched where the field draws nothing', () => {
    const radii = handoverRadii(60000);
    for (const range of [1, 100, 5000, 50000]) {
      expect(pointFade(starWeight(60000), radii, range)).toBe(1);
    }
  });
});

describe('a drawn star position', () => {
  test('stays within 0.01 light years of the float64 position', () => {
    const round = Math.fround;
    const cursors: [number, number, number][] = [
      [50000, 0, 75000],
      [model.centre[0], model.centre[1], model.centre[2]],
    ];
    let worst = 0;
    for (const cursor of cursors) {
      for (const distance of [500, 2000, 8000]) {
        const view: View = { cursor, distance, yaw: 37, pitch: 35 };
        const camera = cameraPosition(view);
        const blocks = buildBoxelBlocks(camera, distance);
        // The outermost boxels are the corners of the coarsest block, where the
        // camera-relative offset is largest.
        const coarsest = blocks[DRAWN_CLASS_COUNT - 1];
        if (coarsest === undefined) throw new Error('the field built no block');
        const edge = coarsest.edge;
        for (const boxel of listBlockBoxels(coarsest)) {
          const origin = boxelOrigin(boxel.index, boxel.sizeClass);
          const relative = [
            round(origin[0] - camera[0]),
            round(origin[1] - camera[1]),
            round(camera[2] - origin[2]),
          ];
          const seed = boxelSeed(boxel.index, boxel.sizeClass);
          for (const star of [0, 1, STARS_PER_BOXEL - 1]) {
            const offsets = starOffsets(seed, star);
            const drawn = [
              round((relative[0] as number) + round(round(offsets[0]) * round(edge))),
              round((relative[1] as number) + round(round(offsets[1]) * round(edge))),
              round((relative[2] as number) - round(round(offsets[2]) * round(edge))),
            ];
            const exact = [
              origin[0] + offsets[0] * edge - camera[0],
              origin[1] + offsets[1] * edge - camera[1],
              camera[2] - (origin[2] + offsets[2] * edge),
            ];
            for (let axis = 0; axis < 3; axis += 1) {
              worst = Math.max(
                worst,
                Math.abs((drawn[axis] as number) - (exact[axis] as number)),
              );
            }
          }
        }
      }
    }
    expect(worst).toBeLessThan(0.01);
  });
});
