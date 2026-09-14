import { describe, expect, test } from 'vitest';
import parameters from '../galaxy-model/galaxy-model.json' with { type: 'json' };
import { createGalaxyModel } from '../galaxy-model/model';
import {
  createSystemSet,
  MAX_CATEGORIES,
  MAX_SYSTEMS,
  MODEL_BOUNDS,
} from './real-systems';
import type { RealSystemSet } from './real-systems';

/** A set with the categories a test names already in its table. */
function setWith(...names: string[]): RealSystemSet {
  const set = createSystemSet();
  set.addCategories(names.map((name) => ({ name, color: [10, 20, 30] })));
  return set;
}

/** One valid record of a category. */
function record(
  name: string,
  category: string,
  position: [number, number, number] = [0, 0, 0],
): Record<string, unknown> {
  return {
    name,
    coords: { x: position[0], y: position[1], z: position[2] },
    primaryCategory: category,
  };
}

describe('the model bounds', () => {
  test('come from the parameter document without the detail grid', () => {
    const model = createGalaxyModel(parameters);
    expect(MODEL_BOUNDS).toEqual(model.bounds);
  });
});

describe('the category table', () => {
  test('reads a category and keeps it', () => {
    const set = createSystemSet();
    const report = set.addCategories([
      { name: 'Empire', color: [0, 180, 255], description: 'The Empire' },
      { name: 'Alliance', color: [0, 255, 120] },
    ]);

    expect(report.added).toBe(2);
    expect(report.rejected).toEqual([]);
    expect(set.categoryCount).toBe(2);
    expect(set.category(0)).toEqual({
      name: 'Empire',
      color: [0, 180, 255],
      description: 'The Empire',
    });
    expect(set.category(1)).toEqual({ name: 'Alliance', color: [0, 255, 120] });
    expect(set.category(1)?.description).toBeUndefined();
  });

  test('replaces the colour when the same name comes again', () => {
    const set = createSystemSet();
    set.addCategories([{ name: 'Empire', color: [0, 180, 255] }]);
    const report = set.addCategories([{ name: 'Empire', color: [255, 40, 40] }]);

    expect(set.categoryCount).toBe(1);
    expect(report.replaced).toBe(1);
    expect(report.added).toBe(0);
    expect(set.category(0)?.color).toEqual([255, 40, 40]);
  });

  test('gives each category fault its own reason', () => {
    const set = createSystemSet();
    const report = set.addCategories([
      { name: 'Empire', color: [0, 180, 255] },
      { name: '', color: [1, 2, 3] },
      { name: 'Two', color: [1, 2] },
      { name: 'Nan', color: [1, Number.NaN, 3] },
    ]);

    expect(report.added).toBe(1);
    expect(report.rejected).toEqual([
      { index: 1, reason: 'no-name' },
      { index: 2, reason: 'bad-color' },
      { index: 3, reason: 'bad-color' },
    ]);
  });

  test('rejects the excess past the table bound', () => {
    const set = createSystemSet();
    const first = set.addCategories(
      Array.from({ length: MAX_CATEGORIES }, (_ignored, index) => ({
        name: `c${index}`,
        color: [1, 2, 3],
      })),
    );
    expect(first.added).toBe(MAX_CATEGORIES);

    const second = set.addCategories([
      { name: 'new-a', color: [1, 2, 3] },
      { name: 'c0', color: [4, 5, 6] },
      { name: 'new-b', color: [1, 2, 3] },
    ]);
    expect(second.replaced).toBe(1);
    expect(second.rejected).toEqual([
      { index: 0, reason: 'over-capacity' },
      { index: 2, reason: 'over-capacity' },
    ]);

    set.clearSystemsAndCategories();
    const third = set.addCategories(
      Array.from({ length: MAX_CATEGORIES }, (_ignored, index) => ({
        name: `d${index}`,
        color: [1, 2, 3],
      })),
    );
    expect(third.added).toBe(MAX_CATEGORIES);
    expect(third.rejected).toEqual([]);
  });

  test('keeps the index of a replaced category', () => {
    const set = setWith('A', 'B', 'C');
    set.addSystems([record('Beta', 'B')]);
    expect(set.categoryIndex('B')).toBe(1);
    expect(set.categoryIndices[0]).toBe(1);

    set.addCategories([{ name: 'B', color: [255, 40, 40] }]);
    expect(set.categoryIndex('B')).toBe(1);
    expect(set.categoryIndices[0]).toBe(1);
    expect(set.category(1)?.color).toEqual([255, 40, 40]);
  });

  test('drops a wrongly typed description', () => {
    const set = createSystemSet();
    const report = set.addCategories([
      { name: 'Empire', color: [0, 180, 255], description: 7 },
    ]);

    expect(report.added).toBe(1);
    expect(set.category(0)).toEqual({ name: 'Empire', color: [0, 180, 255] });
  });

  test('replaces the whole category, so a dropped description is gone', () => {
    const set = createSystemSet();
    set.addCategories([{ name: 'Empire', color: [1, 2, 3], description: 'first' }]);
    set.addCategories([{ name: 'Empire', color: [4, 5, 6] }]);
    expect(set.category(0)?.description).toBeUndefined();
  });
});

describe('the record reader', () => {
  test('reads an EDSM record and a Spansh record', () => {
    const set = setWith('A', 'B');
    const report = set.addSystems([
      {
        id64: 10477373803,
        name: 'Sol',
        coords: { x: 0, y: 0, z: 0 },
        primaryCategory: 'A',
        date: '2015-05-12 15:29:33',
      },
      {
        id64: 2871051900826,
        name: 'Deciat',
        coords: { x: 122.625, y: -0.8125, z: -47.28125 },
        primaryCategory: 'B',
        allegiance: 'Independent',
        government: 'Democracy',
        primaryEconomy: 'Refinery',
        security: 'High',
        population: 22452470,
        bodyCount: 15,
        date: '2015-05-12 15:29:33',
        bodies: [{ name: 'Deciat A' }],
        stations: [{ name: 'Garay Terminal' }],
      },
    ]);

    expect(report.added).toBe(2);
    expect(set.system(0)).toEqual({
      name: 'Sol',
      position: [0, 0, 0],
      primaryCategory: 'A',
      secondaryCategories: [],
      id64: '10477373803',
    });
    expect(set.system(1)).toEqual({
      name: 'Deciat',
      position: [122.625, -0.8125, -47.28125],
      primaryCategory: 'B',
      secondaryCategories: [],
      id64: '2871051900826',
      allegiance: 'Independent',
      government: 'Democracy',
      primaryEconomy: 'Refinery',
      security: 'High',
      population: 22452470,
      bodyCount: 15,
    });
  });

  test('rejects a record whose secondary category the table does not hold', () => {
    const set = setWith('A');
    const report = set.addSystems([
      { ...record('First', 'A'), secondaryCategories: ['B'] },
      { ...record('Second', 'A'), secondaryCategories: 'A' },
    ]);

    expect(report.rejected).toEqual([{ index: 0, reason: 'unknown-category' }]);
    expect(report.added).toBe(1);
    expect(set.system(0)?.name).toBe('Second');
    expect(set.system(0)?.secondaryCategories).toEqual([]);
  });

  test('keeps the secondary categories in order, without a repeat', () => {
    const set = setWith('A', 'B', 'C');
    const report = set.addSystems([
      { ...record('First', 'A'), secondaryCategories: ['C', 'B', 'C', 'A'] },
    ]);

    expect(report.added).toBe(1);
    expect(set.system(0)?.secondaryCategories).toEqual(['C', 'B']);
  });

  test('keeps every digit of a large id64', () => {
    const set = setWith('A');
    set.addSystems([
      { ...record('First', 'A'), id64: '2871051900826' },
      { ...record('Second', 'A'), id64: 18262930337633n },
    ]);

    expect(set.system(0)?.id64).toBe('2871051900826');
    expect(set.system(1)?.id64).toBe('18262930337633');
  });

  test('gives each fault its own reason', () => {
    const set = setWith('A');
    const report = set.addSystems([
      record('Good', 'A'),
      record('', 'A'),
      { name: 'No coords', primaryCategory: 'A' },
      { name: 'Nan', coords: { x: Number.NaN, y: 0, z: 0 }, primaryCategory: 'A' },
      record('Far', 'A', [0, 0, 900000]),
      { name: 'No category', coords: { x: 0, y: 0, z: 0 } },
      record('Unknown', 'Z'),
    ]);

    expect(report.added).toBe(1);
    expect(report.rejected).toEqual([
      { index: 1, reason: 'no-name' },
      { index: 2, reason: 'no-coords' },
      { index: 3, reason: 'no-coords' },
      { index: 4, reason: 'out-of-bounds' },
      { index: 5, reason: 'no-category' },
      { index: 6, reason: 'unknown-category' },
    ]);
  });

  test('replaces a record of the same identity rather than adding it', () => {
    const set = setWith('A');
    set.addSystems([{ ...record('Sol', 'A'), id64: 10477373803 }]);
    const report = set.addSystems([
      { ...record('Sol renamed', 'A', [10, 20, 30]), id64: 10477373803 },
    ]);

    expect(set.count).toBe(1);
    expect(report.replaced).toBe(1);
    expect(set.system(0)?.position).toEqual([10, 20, 30]);
    expect(Array.from(set.positions)).toEqual([10, 20, 30]);
  });

  test('takes a replacement on a full set', () => {
    const set = setWith('A');
    set.addSystems(
      Array.from({ length: MAX_SYSTEMS }, (_ignored, index) => ({
        ...record(`s${index}`, 'A'),
        id64: index + 1,
      })),
    );
    expect(set.count).toBe(MAX_SYSTEMS);

    const report = set.addSystems([
      { ...record('replacement', 'A', [5, 6, 7]), id64: 1 },
      { ...record('new one', 'A'), id64: MAX_SYSTEMS + 1 },
    ]);

    expect(report.replaced).toBe(1);
    expect(report.rejected).toEqual([{ index: 1, reason: 'over-capacity' }]);
    expect(set.count).toBe(MAX_SYSTEMS);
    expect(set.system(0)?.position).toEqual([5, 6, 7]);
  });

  test('rejects the excess past the set bound', () => {
    const set = setWith('A');
    set.addSystems(
      Array.from({ length: MAX_SYSTEMS - 2 }, (_ignored, index) => ({
        ...record(`s${index}`, 'A'),
        id64: index + 1,
      })),
    );

    const second = set.addSystems(
      Array.from({ length: 5 }, (_ignored, index) => ({
        ...record(`new${index}`, 'A'),
        id64: MAX_SYSTEMS + index,
      })),
    );
    expect(second.added).toBe(2);
    expect(second.rejected).toEqual([
      { index: 2, reason: 'over-capacity' },
      { index: 3, reason: 'over-capacity' },
      { index: 4, reason: 'over-capacity' },
    ]);

    set.clearSystems();
    const third = set.addSystems(
      Array.from({ length: MAX_SYSTEMS }, (_ignored, index) => ({
        ...record(`t${index}`, 'A'),
        id64: index + 1,
      })),
    );
    expect(third.added).toBe(MAX_SYSTEMS);
    expect(third.rejected).toEqual([]);
  });
});

describe('the paired clear', () => {
  test('empties the set and the table together', () => {
    const set = setWith('A', 'B');
    set.addSystems([record('First', 'A'), record('Second', 'B')]);
    set.clearSystemsAndCategories();

    expect(set.count).toBe(0);
    expect(set.categoryCount).toBe(0);

    const orphan = set.addSystems([record('First', 'A')]);
    expect(orphan.rejected).toEqual([{ index: 0, reason: 'unknown-category' }]);

    set.addCategories([{ name: 'A', color: [1, 2, 3] }]);
    const again = set.addSystems([record('First', 'A')]);
    expect(again.added).toBe(1);
  });
});

describe('the set', () => {
  test('holds positions as float64 game coordinates in the order added', () => {
    const set = setWith('A');
    set.addSystems([
      record('One', 'A', [1, 2, 3]),
      record('Two', 'A', [4, 5, 6]),
      record('Three', 'A', [7, 8, 9]),
    ]);

    const positions = set.positions;
    expect(positions).toBeInstanceOf(Float64Array);
    expect(positions.length).toBe(9);
    expect(Array.from(positions)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  test('holds the primary category index as a Uint16Array', () => {
    const set = setWith('A', 'B');
    set.addSystems([record('One', 'B'), record('Two', 'A')]);
    expect(set.categoryIndices).toBeInstanceOf(Uint16Array);
    expect(Array.from(set.categoryIndices)).toEqual([1, 0]);
  });

  test('raises the version on an add, a replace and a clear', () => {
    const set = setWith('A');
    const start = set.version;
    set.addSystems([{ ...record('One', 'A'), id64: 1 }]);
    const afterAdd = set.version;
    set.addSystems([{ ...record('One again', 'A', [1, 1, 1]), id64: 1 }]);
    const afterReplace = set.version;
    set.clearSystems();
    const afterClear = set.version;

    expect(afterAdd).toBeGreaterThan(start);
    expect(afterReplace).toBeGreaterThan(afterAdd);
    expect(afterClear).toBeGreaterThan(afterReplace);
  });

  test('raises the category version on an add, a replace and a paired clear', () => {
    const set = createSystemSet();
    const start = set.categoryVersion;
    set.addCategories([{ name: 'A', color: [1, 2, 3] }]);
    const afterAdd = set.categoryVersion;
    set.addCategories([{ name: 'A', color: [4, 5, 6] }]);
    const afterReplace = set.categoryVersion;
    set.clearSystemsAndCategories();
    const afterClear = set.categoryVersion;

    expect(afterAdd).toBeGreaterThan(start);
    expect(afterReplace).toBeGreaterThan(afterAdd);
    expect(afterClear).toBeGreaterThan(afterReplace);
  });

  test('adds 10,000 records and replaces them in under 50 ms each', () => {
    const set = setWith('A');
    const records = Array.from({ length: MAX_SYSTEMS }, (_ignored, index) => ({
      ...record(`s${index}`, 'A', [index * 0.001, 0, 0]),
      id64: index + 1,
    }));

    const firstStart = performance.now();
    const first = set.addSystems(records);
    const firstMs = performance.now() - firstStart;

    const secondStart = performance.now();
    const second = set.addSystems(records);
    const secondMs = performance.now() - secondStart;

    expect(first.added).toBe(MAX_SYSTEMS);
    expect(second.replaced).toBe(MAX_SYSTEMS);
    expect(set.count).toBe(MAX_SYSTEMS);
    console.log('addSystems ms', { firstMs, secondMs });
    expect(firstMs).toBeLessThan(50);
    expect(secondMs).toBeLessThan(50);
  });
});
