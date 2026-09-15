import { describe, expect, test } from 'vitest';
import { createSystemSet } from '../scene-data/real-systems';
import type { CategoryInput } from '../scene-data/real-systems';
import demo from '../../demo-data/guardian-ruins.json' with { type: 'json' };
import notable from '../../demo-data/notable-systems.json' with { type: 'json' };
import structures from '../../demo-data/guardian-structures.json' with { type: 'json' };

const THUMBNAIL_BASE = 'https://ruins.canonn.tech/images/maps/';

describe('the committed demo set', () => {
  // The counts describe the committed file. A later run of `pnpm build:demo-data` over a
  // larger dump writes new counts, and they move here with it.
  test('holds 3 categories and 212 systems', () => {
    expect(demo.categories.map((category) => category.name)).toEqual([
      'Ruins Alpha',
      'Ruins Beta',
      'Ruins Gamma',
    ]);
    expect(demo.systems).toHaveLength(212);
  });

  test('carries one image for each type a record holds', () => {
    let multi = 0;
    for (const system of demo.systems) {
      const categories = [system.primaryCategory, ...system.secondaryCategories];
      expect(system.images).toHaveLength(categories.length);
      if (categories.length > 1) multi += 1;
      for (const image of system.images) {
        expect(image.url.startsWith(THUMBNAIL_BASE)).toBe(true);
      }
    }
    expect(multi).toBe(166);
  });

  test('names its images in the order of its categories', () => {
    for (const system of demo.systems) {
      const categories = [system.primaryCategory, ...system.secondaryCategories];
      for (let index = 0; index < categories.length; index += 1) {
        const type = (categories[index] as string).replace('Ruins ', '');
        const image = system.images[index] as { url: string; caption: string };
        expect(image.url).toBe(`${THUMBNAIL_BASE}${type.toLowerCase()}-thumbnail.png`);
        expect(image.caption).toBe(`${type} site`);
      }
    }
  });

  test('names 1 to 3 categories for each record, with no repeat', () => {
    const names = new Set<string>();
    for (const system of demo.systems) {
      const categories = [system.primaryCategory, ...system.secondaryCategories];
      expect(categories.length).toBeGreaterThanOrEqual(1);
      expect(categories.length).toBeLessThanOrEqual(3);
      expect(new Set(categories).size).toBe(categories.length);
      expect(names.has(system.name)).toBe(false);
      names.add(system.name);
    }
    expect(names.size).toBe(demo.systems.length);
  });

  test('holds a finite position for every record', () => {
    for (const system of demo.systems) {
      expect(Number.isFinite(system.coords.x)).toBe(true);
      expect(Number.isFinite(system.coords.y)).toBe(true);
      expect(Number.isFinite(system.coords.z)).toBe(true);
    }
  });

  test('is accepted whole by the reader', () => {
    const set = createSystemSet();
    // JSON holds no tuple, so the module types a colour as `number[]`. The reading
    // casts the way the demo page does.
    const categories = set.addCategories(
      demo.categories as unknown as readonly CategoryInput[],
    );
    const systems = set.addSystems(demo.systems);

    expect(categories.added).toBe(3);
    expect(categories.rejected).toEqual([]);
    expect(systems.added).toBe(212);
    expect(systems.rejected).toEqual([]);
  });
});

describe('the committed structures set', () => {
  // The counts describe the committed file, by the same rule as the ruins set above.
  test('holds 10 categories and 163 systems', () => {
    expect(structures.categories).toHaveLength(10);
    expect(structures.systems).toHaveLength(163);
  });

  test('names every category of its records', () => {
    const names = new Set(structures.categories.map((category) => category.name));
    for (const system of structures.systems) {
      expect(names.has(system.primaryCategory)).toBe(true);
      for (const name of system.secondaryCategories) expect(names.has(name)).toBe(true);
    }
  });

  test('is accepted whole by the reader', () => {
    const set = createSystemSet();
    const categories = set.addCategories(
      structures.categories as unknown as readonly CategoryInput[],
    );
    const systems = set.addSystems(structures.systems);

    expect(categories.added).toBe(10);
    expect(categories.rejected).toEqual([]);
    expect(systems.added).toBe(163);
    expect(systems.rejected).toEqual([]);
  });
});

describe('the committed notable systems set', () => {
  // The counts describe the committed file, by the same rule as the ruins set above.
  test('holds 4 categories and 16 systems', () => {
    expect(notable.categories.map((category) => category.name)).toEqual([
      'INRA',
      'Guardian',
      'Thargoid',
      'Human',
    ]);
    expect(notable.systems).toHaveLength(16);
  });

  test('holds no markup in a description', () => {
    for (const system of notable.systems) {
      expect(system.description.includes('<')).toBe(false);
      expect(system.description.includes('>')).toBe(false);
    }
  });

  test('is accepted whole by the reader', () => {
    const set = createSystemSet();
    const categories = set.addCategories(
      notable.categories as unknown as readonly CategoryInput[],
    );
    const systems = set.addSystems(notable.systems);

    expect(categories.added).toBe(4);
    expect(categories.rejected).toEqual([]);
    expect(systems.added).toBe(16);
    expect(systems.rejected).toEqual([]);
  });
});
