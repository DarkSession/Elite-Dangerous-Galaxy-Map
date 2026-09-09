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
  starOffsets,
} from '../scene-data/boxel';
import { DEFAULT_POINT_COUNT } from '../scene-data/point-cloud';
import { MASS_INTEGRAL, STARS_PER_BOXEL } from '../scene-data/star-field';
import { DEFAULT_POINT_BRIGHTNESS, POINT_RADIUS_LY } from './point-pass';
import {
  handoverRadii,
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
    // The point cloud places its samples in proportion to the detailed volume density,
    // so the expected sample count per cubic light year at a place is the count times
    // that density over its integral.
    const budget = model.document.calibration.mc0_budget_msun_per_ly3_per_unit;
    const volumeIntegral = MASS_INTEGRAL / budget;
    const places = lightPlaces();
    expect(places.length).toBe(34);

    let worst = 0;
    for (const place of places) {
      const field = STAR_LIGHT * model.detailedMassDensity(...place);
      const samples =
        (DEFAULT_POINT_COUNT * model.detailedVolumeDensity(...place)) / volumeIntegral;
      const points = DEFAULT_POINT_BRIGHTNESS * POINT_RADIUS_LY ** 2 * samples;
      expect(points).toBeGreaterThan(0);
      worst = Math.max(worst, Math.abs(field - points) / points);
    }
    expect(worst).toBeLessThan(0.01);
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
        const brightness = starBrightness(lightPerStar, focal, range, radius);
        const deposited = brightness * size * size;
        const expected = (lightPerStar * focal * focal) / (range * range);
        worst = Math.max(worst, Math.abs(deposited - expected) / expected);
      }
    }
    expect(worst).toBeLessThan(1e-6);
  });

  test('holds its on-screen size between 1 and 16 pixels', () => {
    const focal = 935.3;
    expect(starPixelSize(focal, 8000, 0.1)).toBe(MIN_STAR_PIXELS);
    expect(starPixelSize(focal, 10, 10)).toBe(MAX_STAR_PIXELS);
    expect(starPixelSize(focal, 1000, 5)).toBeCloseTo((focal * 5) / 1000, 9);
  });
});

describe('the brightness spread', () => {
  test('has a mean of one over the field', () => {
    // One boxel draws at most 256 stars, and the spread's own standard deviation is
    // 0.89 times its mean, so the mean over one boxel scatters by about 0.056. Over
    // the 1,856 boxels of a frame the scatter falls to 0.0013, which is what the
    // field's light rests on.
    let total = 0;
    let count = 0;
    let worstBoxel = 0;
    for (let boxel = 0; boxel < DRAWN_BOXEL_COUNT; boxel += 1) {
      const seed = boxelSeed([boxel % 60, Math.floor(boxel / 60), 7], 1);
      let sum = 0;
      for (let star = 0; star < STARS_PER_BOXEL; star += 1) {
        sum += starSpread(seed, star);
      }
      total += sum;
      count += STARS_PER_BOXEL;
      worstBoxel = Math.max(worstBoxel, Math.abs(sum / STARS_PER_BOXEL - 1));
    }
    expect(Math.abs(total / count - 1)).toBeLessThan(0.01);
    expect(worstBoxel).toBeLessThan(0.3);
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
    let worst = 0;
    for (const distance of [500, 2000, 4000, 6000, 8000]) {
      const weight = starWeight(distance);
      const radii = handoverRadii(distance);
      for (let range = 0; range <= 20000; range += 25) {
        const sum = starFade(weight, radii, range) + pointFade(weight, radii, range);
        worst = Math.max(worst, Math.abs(sum - 1));
      }
    }
    expect(worst).toBeLessThan(1e-6);
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
