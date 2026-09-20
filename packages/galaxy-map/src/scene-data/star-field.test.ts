import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, test } from 'vitest';
import { decodeDetailGrid } from '../galaxy-model/detail';
import parameters from '../galaxy-model/galaxy-model.json' with { type: 'json' };
import { createGalaxyModel } from '../galaxy-model/model';
import type { GalaxyModel } from '../galaxy-model/model';
import {
  baseSizeClass,
  boxelEdge,
  boxelIndexAt,
  boxelOrigin,
  boxelSeed,
  DRAWN_BOXEL_COUNT,
  listDrawnBoxels,
  MAX_SIZE_CLASS,
  starPosition,
  STARS_PER_BOXEL,
} from './boxel';
import type { BoxelIndex } from './boxel';
import { createSystemSet, SUPPRESSION_RADIUS_LY } from './real-systems';
import type { RealSystemSet } from './real-systems';
import { MASK_WORDS } from './star-suppression';
import {
  boxelLight,
  calibration,
  CALIBRATION_AT_PEAK,
  CALIBRATION_AT_SOL,
  createStarField,
  placedStarCount,
  integrateDetailedMassDensity,
  MASS_INTEGRAL,
  PEAK_MASS_DENSITY,
  SOL_MASS_DENSITY,
  starRadius,
  systemsInVolume,
} from './star-field';

const pngPath = fileURLToPath(
  new URL('../galaxy-model/galaxy-detail.png', import.meta.url),
);

let model: GalaxyModel;

beforeAll(async () => {
  const grid = await decodeDetailGrid(new Uint8Array(readFileSync(pngPath)));
  model = createGalaxyModel(parameters, grid);
}, 120000);

/** The centre of a boxel in game coordinates. */
function boxelCentre(index: BoxelIndex, sizeClass: number): [number, number, number] {
  const edge = boxelEdge(sizeClass);
  const origin = boxelOrigin(index, sizeClass);
  return [origin[0] + edge / 2, origin[1] + edge / 2, origin[2] + edge / 2];
}

/** The system count of the boxel of a size class that holds a position. */
function countAt(position: [number, number, number], sizeClass: number): number {
  const centre = boxelCentre(boxelIndexAt(position, sizeClass), sizeClass);
  const density = model.detailedMassDensity(centre[0], centre[1], centre[2]);
  return systemsInVolume(density, boxelEdge(sizeClass) ** 3);
}

describe('the calibration', () => {
  test('reproduces the neighbourhood counts at Sol', () => {
    const density = model.detailedMassDensity(0, 0, 0);
    expect(systemsInVolume(density, 1000)).toBeCloseTo(3.8, 1);
    expect(Math.abs(systemsInVolume(density, 1000) - 3.8)).toBeLessThan(0.05);

    // The 20 light year boxel that holds Sol.
    expect(Math.abs(countAt([0, 0, 0], 1) - 30)).toBeLessThan(1);

    // Within 100 light years of Sol, by a midpoint sum on a 2 light year grid.
    const step = 2;
    let total = 0;
    for (let x = -100; x < 100; x += step) {
      for (let y = -100; y < 100; y += step) {
        for (let z = -100; z < 100; z += step) {
          const px = x + step / 2;
          const py = y + step / 2;
          const pz = z + step / 2;
          if (px * px + py * py + pz * pz > 100 * 100) continue;
          total += systemsInVolume(model.detailedMassDensity(px, py, pz), step ** 3);
        }
      }
    }
    expect(Math.abs(total - 15650) / 15650).toBeLessThan(0.05);
  });

  test('falls with the density and never rises', () => {
    expect(calibration(SOL_MASS_DENSITY)).toBe(CALIBRATION_AT_SOL);
    expect(calibration(PEAK_MASS_DENSITY)).toBe(CALIBRATION_AT_PEAK);

    const low = Math.log(SOL_MASS_DENSITY);
    const high = Math.log(PEAK_MASS_DENSITY);
    let previous = calibration(SOL_MASS_DENSITY);
    for (let step = 1; step <= 40; step += 1) {
      const density = Math.exp(low + ((high - low) * step) / 41);
      const value = calibration(density);
      expect(value).toBeLessThanOrEqual(previous);
      previous = value;
    }
    expect(previous).toBeGreaterThanOrEqual(CALIBRATION_AT_PEAK);

    // The ramp holds flat outside the two anchors.
    expect(calibration(SOL_MASS_DENSITY / 1000)).toBe(CALIBRATION_AT_SOL);
    expect(calibration(PEAK_MASS_DENSITY * 1000)).toBe(CALIBRATION_AT_PEAK);
  });

  test('names the largest density the model reaches', () => {
    const bounds = model.bounds;
    const height = model.centre[1];
    let peak = 0;
    for (let x = bounds.x[0]; x <= bounds.x[1]; x += 250) {
      for (let z = bounds.z[0]; z <= bounds.z[1]; z += 250) {
        const density = model.detailedMassDensity(x, height, z);
        if (density > peak) peak = density;
      }
    }
    expect(Math.abs(peak - PEAK_MASS_DENSITY) / PEAK_MASS_DENSITY).toBeLessThan(0.01);
  });
});

describe('the placed count', () => {
  test('holds at the cap of 256', () => {
    expect(placedStarCount(0.4)).toBe(0);
    expect(placedStarCount(0.6)).toBe(1);
    expect(placedStarCount(255.4)).toBe(255);
    expect(placedStarCount(256)).toBe(STARS_PER_BOXEL);
    expect(placedStarCount(1e9)).toBe(STARS_PER_BOXEL);
  });

  test('places no star in empty space', () => {
    for (let sizeClass = 0; sizeClass <= MAX_SIZE_CLASS; sizeClass += 1) {
      const count = countAt([0, 20000, 0], sizeClass);
      expect(placedStarCount(count), `size class ${sizeClass}`).toBe(0);
    }
  });
});

describe('the mass integral', () => {
  test('reproduces the carried constant by numeric integration', () => {
    const measured = integrateDetailedMassDensity(model, {
      planeCells: 768,
      heightSteps: 192,
      radiusCells: 384,
    });
    expect(Math.abs(measured - MASS_INTEGRAL) / MASS_INTEGRAL).toBeLessThan(0.01);
  });
});

describe('a boxel light', () => {
  test('does not change when the cap bites', () => {
    const starLight = 0.4185;
    for (const place of [
      { position: [0, 0, 0] as [number, number, number], sizeClass: 1 },
      {
        position: [model.centre[0] + 2000, model.centre[1], model.centre[2]] as [
          number,
          number,
          number,
        ],
        sizeClass: 7,
      },
    ]) {
      const centre = boxelCentre(
        boxelIndexAt(place.position, place.sizeClass),
        place.sizeClass,
      );
      const density = model.detailedMassDensity(centre[0], centre[1], centre[2]);
      const volume = boxelEdge(place.sizeClass) ** 3;
      const light = boxelLight(starLight, density, volume);
      const drawn = placedStarCount(systemsInVolume(density, volume));
      expect(drawn).toBeGreaterThan(0);
      const product = (light / drawn) * drawn;
      expect(Math.abs(product - light) / light).toBeLessThan(1e-6);
    }

    // The second boxel is 100 times over the cap, the first is under it.
    expect(placedStarCount(countAt([0, 0, 0], 1))).toBeLessThan(STARS_PER_BOXEL);
    const core: [number, number, number] = [
      model.centre[0] + 2000,
      model.centre[1],
      model.centre[2],
    ];
    expect(countAt(core, 7)).toBeGreaterThan(100 * STARS_PER_BOXEL);
  });
});

describe('a star radius', () => {
  test('grows with the spacing of the stars the boxel draws', () => {
    const solDrawn = placedStarCount(countAt([0, 0, 0], 1));
    const core: [number, number, number] = [
      model.centre[0] + 2000,
      model.centre[1],
      model.centre[2],
    ];
    const coreDrawn = placedStarCount(countAt(core, 7));
    expect(coreDrawn).toBe(STARS_PER_BOXEL);
    const sol = starRadius(boxelEdge(1), solDrawn);
    const wide = starRadius(boxelEdge(7), coreDrawn);
    expect(wide / sol).toBeGreaterThanOrEqual(20);
  });

  test('is zero where the boxel draws no star', () => {
    expect(starRadius(20, 0)).toBe(0);
  });
});

describe('the boxel table', () => {
  test('holds one record per drawn boxel', () => {
    const field = createStarField(model, { starLight: 0.4185 });
    const camera: [number, number, number] = [0, 0, 0];
    const table = field.update(camera, 500);
    expect(table.count).toBe(DRAWN_BOXEL_COUNT);
    expect(table.values.length).toBe(DRAWN_BOXEL_COUNT * 9);
    expect(table.buffer.byteLength).toBe(66816);

    const boxels = listDrawnBoxels(camera, 500);
    let capped = 0;
    for (let index = 0; index < table.count; index += 1) {
      const boxel = boxels[index];
      if (boxel === undefined)
        throw new Error('the drawn set is shorter than the table');
      const record = field.record(index);
      const origin = boxelOrigin(boxel.index, boxel.sizeClass);
      expect(record.edge).toBe(boxelEdge(boxel.sizeClass));
      expect(record.origin[0]).toBeCloseTo(origin[0] - camera[0], 3);
      expect(record.origin[1]).toBeCloseTo(origin[1] - camera[1], 3);
      expect(record.origin[2]).toBeCloseTo(camera[2] - origin[2], 3);
      expect(record.seed).toBe(boxelSeed(boxel.index, boxel.sizeClass));
      expect(record.drawn).toBeLessThanOrEqual(STARS_PER_BOXEL);
      if (record.drawn === STARS_PER_BOXEL) capped += 1;
    }
    expect(table.drawnStars).toBeGreaterThan(0);
    expect(table.drawnStars).toBeLessThanOrEqual(DRAWN_BOXEL_COUNT * STARS_PER_BOXEL);
    expect(capped).toBeGreaterThan(0);
  });

  test('carries a seed that a float32 could not hold', () => {
    const field = createStarField(model, { starLight: 0.4185 });
    field.update([0, 0, 0], 500);
    let large = 0;
    for (let index = 0; index < DRAWN_BOXEL_COUNT; index += 1) {
      const seed = field.record(index).seed;
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThanOrEqual(0xffffffff);
      if (seed > 0xffffff && Math.fround(seed) !== seed) large += 1;
    }
    expect(large).toBeGreaterThan(0);
  });

  test('reads no density while the camera stays inside one base class boxel', () => {
    const field = createStarField(model, { starLight: 0.4185 });
    const first: [number, number, number] = [0, 0, 0];
    field.update(first, 500);
    const after = field.recomputeCount;
    expect(after).toBe(1);

    // The boxel of the base class that holds Sol runs from -5 to 15 on every axis.
    const inside: [number, number, number] = [4, 4, 4];
    expect(boxelIndexAt(inside, 1)).toEqual(boxelIndexAt(first, 1));
    field.update(inside, 500);
    expect(field.recomputeCount).toBe(after);
    expect(field.record(0).origin[0]).toBeCloseTo(
      boxelOrigin(listDrawnBoxels(inside, 500)[0]?.index ?? [0, 0, 0], 1)[0] - 4,
      3,
    );

    // A move to the next boxel of the base class reads the set again.
    field.update([24, 4, 4], 500);
    expect(field.recomputeCount).toBe(after + 1);
  });
});

describe('suppression in the boxel table', () => {
  /** The three stars of a boxel that no other star of it comes within the radius of. */
  function isolatedStars(
    index: BoxelIndex,
    sizeClass: number,
    placed: number,
  ): [number, number, number][] {
    const stars: [number, number, number][] = [];
    for (let star = 0; star < placed; star += 1) {
      stars.push(starPosition(index, sizeClass, star));
    }
    const chosen: [number, number, number][] = [];
    for (const star of stars) {
      const near = stars.some(
        (other) =>
          other !== star &&
          Math.hypot(other[0] - star[0], other[1] - star[1], other[2] - star[2]) <=
            SUPPRESSION_RADIUS_LY,
      );
      if (!near) chosen.push(star);
      if (chosen.length === 3) break;
    }
    return chosen;
  }

  /** The camera and the view the suppression tests read. */
  const camera: [number, number, number] = [0, 0, 0];
  const distance = 500;

  /** The table index of the boxel of the base class that holds a position. */
  function baseRecordOf(position: [number, number, number]): number {
    const sizeClass = baseSizeClass(distance);
    const target = boxelIndexAt(position, sizeClass);
    const boxels = listDrawnBoxels(camera, distance);
    return boxels.findIndex(
      (boxel) =>
        boxel.sizeClass === sizeClass &&
        boxel.index[0] === target[0] &&
        boxel.index[1] === target[1] &&
        boxel.index[2] === target[2],
    );
  }

  /** A set that holds the positions a test names. */
  function setOf(positions: readonly [number, number, number][]): RealSystemSet {
    const set = createSystemSet();
    set.addCategories([{ name: 'A', color: [1, 2, 3] }]);
    set.addSystems(
      positions.map((position, slot) => ({
        name: `s${slot}`,
        coords: { x: position[0], y: position[1], z: position[2] },
        categories: ['A'],
        id64: slot + 1,
      })),
    );
    return set;
  }

  test('writes a mask row for a boxel with a system and a zero row for one without', () => {
    const sizeClass = baseSizeClass(distance);
    const solBoxel = boxelIndexAt([0, 0, 0], sizeClass);
    const empty = createStarField(model, { starLight: 0.4185 });
    const placed = empty.update(camera, distance).values;
    const solRecord = baseRecordOf([0, 0, 0]);
    expect(solRecord).toBeGreaterThanOrEqual(0);
    const solPlaced = placed[solRecord * 9 + 4] as number;
    expect(solPlaced).toBeGreaterThan(0);

    const stars = isolatedStars(solBoxel, sizeClass, solPlaced);
    expect(stars.length).toBe(3);
    const field = createStarField(model, {
      starLight: 0.4185,
      systems: setOf(stars),
    });
    const table = field.update(camera, distance);

    let solWords = 0;
    for (let word = 0; word < MASK_WORDS; word += 1) {
      if ((table.mask[solRecord * MASK_WORDS + word] as number) !== 0) solWords += 1;
    }
    expect(solWords).toBeGreaterThan(0);

    // A boxel of the same class two boxels away holds no system at all.
    const otherRecord = baseRecordOf([0, 0, 2 * boxelEdge(sizeClass)]);
    expect(otherRecord).toBeGreaterThanOrEqual(0);
    for (let word = 0; word < MASK_WORDS; word += 1) {
      expect(table.mask[otherRecord * MASK_WORDS + word]).toBe(0);
    }
  });

  test('does not change a boxel light', () => {
    const sizeClass = baseSizeClass(distance);
    const solBoxel = boxelIndexAt([0, 0, 0], sizeClass);
    const record = baseRecordOf([0, 0, 0]);
    const empty = createStarField(model, { starLight: 0.4185 });
    empty.update(camera, distance);
    const before = empty.record(record);

    const stars = isolatedStars(solBoxel, sizeClass, before.placed);
    expect(stars.length).toBe(3);
    const field = createStarField(model, {
      starLight: 0.4185,
      systems: setOf(stars),
    });
    field.update(camera, distance);
    const after = field.record(record);

    expect(after.drawn).toBe(before.drawn - 3);
    expect(after.suppressed).toBe(3);
    const first = before.lightPerStar * before.drawn;
    const second = after.lightPerStar * after.drawn;
    expect(Math.abs(second - first) / first).toBeLessThan(1e-6);
  });

  test('does not change the star radius', () => {
    const sizeClass = baseSizeClass(distance);
    const solBoxel = boxelIndexAt([0, 0, 0], sizeClass);
    const record = baseRecordOf([0, 0, 0]);
    const empty = createStarField(model, { starLight: 0.4185 });
    empty.update(camera, distance);
    const before = empty.record(record);

    const field = createStarField(model, {
      starLight: 0.4185,
      systems: setOf(isolatedStars(solBoxel, sizeClass, before.placed)),
    });
    field.update(camera, distance);

    expect(field.record(record).radius).toBe(before.radius);
    expect(field.record(record).placed).toBe(before.placed);
  });

  test('reports the drawn count and the suppressed count', () => {
    const sizeClass = baseSizeClass(distance);
    const solBoxel = boxelIndexAt([0, 0, 0], sizeClass);
    const empty = createStarField(model, { starLight: 0.4185 });
    const before = empty.update(camera, distance);
    expect(before.suppressedStars).toBe(0);

    const record = baseRecordOf([0, 0, 0]);
    const placed = empty.record(record).placed;
    const set = setOf(isolatedStars(solBoxel, sizeClass, placed));
    const field = createStarField(model, { starLight: 0.4185, systems: set });
    const after = field.update(camera, distance);

    expect(after.suppressedStars).toBe(3);
    expect(after.drawnStars).toBe(before.drawnStars - 3);
  });

  test('sweeps nothing while the system set is empty', () => {
    const set = createSystemSet();
    const field = createStarField(model, { starLight: 0.4185, systems: set });
    const table = field.update(camera, distance);
    expect(field.sweptCount).toBe(0);
    expect(table.suppressedStars).toBe(0);
  });
});
