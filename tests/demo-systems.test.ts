import { describe, expect, test } from 'vitest';
import { createSystemSet } from '../src/scene-data/real-systems';
import type { CategoryInput } from '../src/scene-data/real-systems';
import demo from '../demo-data/guardian-ruins.json' with { type: 'json' };
import notable from '../demo-data/notable-systems.json' with { type: 'json' };
import structures from '../demo-data/guardian-structures.json' with { type: 'json' };
import uia from '../demo-data/uia.json' with { type: 'json' };
import adamastor from '../demo-data/adamastor.json' with { type: 'json' };
import { createShapeSet } from '../src/scene-data/shapes';
import type { LineInput, SphereInput } from '../src/scene-data/shapes';
import type { RealSystem } from '../src/scene-data/real-systems';

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

describe('the committed UIA set', () => {
  // The counts describe the committed file, by the same rule as the ruins set above. The
  // set carries the whole map: the 16 systems of the source, the markers of its three
  // sphere lists, the waypoints of the eight tables and the ends of every hyperdiction
  // report the tables own.
  test('holds 19 categories, 1,116 systems, 54 spheres and 983 lines', () => {
    expect(uia.categories.map((category) => category.name)).toEqual([
      'Populated Systems',
      'Thargoid Systems',
      'Permit Locked Centers',
      'Permit Unlocked Centers',
      'Estimated Direction',
      'Recorded Route',
      'Estimated Route',
      'Lost Section',
      'All Hyperdictions',
      'Hostile',
      'UIA#1 Taranis',
      'UIA#2 Leigong',
      'UIA#3 Indra',
      'UIA#4 Oya',
      'UIA#5 Cocijo',
      'UIA#6 Thor',
      'UIA#7 Raijin',
      'UIA#8 Hadad',
      'Gamma Velorum Zone',
    ]);
    expect(uia.systems).toHaveLength(1116);
    expect(uia.spheres).toHaveLength(54);
    expect(uia.lines).toHaveLength(983);
    const points = uia.lines.reduce((sum, line) => sum + line.points.length, 0);
    expect(points).toBe(2214);
  });

  // The source draws each sphere with a material of its own, and these are those four
  // colours: the two shell tints of the shader, `0x336600` and `0x000099`.
  test('gives every sphere the colour of its own material', () => {
    const colours = ['51,179,255', '255,191,26', '51,102,0', '0,0,153'];
    const counted = new Map<string, number>();
    for (const sphere of uia.spheres) {
      const key = sphere.color.join(',');
      expect(colours).toContain(key);
      counted.set(key, (counted.get(key) ?? 0) + 1);
    }
    expect([...counted]).toEqual([
      ['51,179,255', 28],
      ['255,191,26', 20],
      ['51,102,0', 5],
      ['0,0,153', 1],
    ]);
  });

  // A sphere carries the category of its own list. The Gamma Velorum list has no marker,
  // so the converter adds the category `Gamma Velorum Zone` for its one sphere and that
  // category holds no record. A line carries the categories of its route and no colour,
  // because the category gives it one, and a name that names the line itself.
  test('gives its shapes the categories of the source', () => {
    const named = uia.spheres.filter(
      (sphere) =>
        (sphere as { primaryCategory?: string }).primaryCategory !== undefined,
    );
    expect(named).toHaveLength(54);
    const unnamed = uia.spheres.filter(
      (sphere) =>
        (sphere as { primaryCategory?: string }).primaryCategory === undefined,
    );
    expect(unnamed.map((sphere) => sphere.name)).toEqual([]);
    const categories = new Set(uia.categories.map((category) => category.name));
    for (const line of uia.lines) {
      const held = line as { primaryCategory?: string; color?: unknown; name?: string };
      expect(held.primaryCategory).toBeDefined();
      expect(categories.has(held.primaryCategory ?? '')).toBe(true);
      expect(held.color).toBeUndefined();
      expect(held.name).not.toBe(held.primaryCategory);
    }
  });

  // Each end of every UIA line is a record of the same set, so the map resolves every
  // point by name and the file holds no coordinate in a line.
  test('names a system at every line point', () => {
    const names = new Set(uia.systems.map((system) => system.name));
    for (const line of uia.lines) {
      for (const point of line.points) {
        expect(Array.isArray(point)).toBe(false);
        expect(names.has((point as { system: string }).system)).toBe(true);
      }
    }
  });

  // A hyperdiction record names the commander who filed the report and its date.
  test('names the commander of a hyperdiction report', () => {
    const reported = uia.systems.filter((system) =>
      (system.description ?? '').startsWith('CMDR '),
    );
    expect(reported.length).toBeGreaterThan(800);
    for (const system of reported.slice(0, 20)) {
      expect(system.description).toMatch(
        /^CMDR .+ reported a hyperdiction from .+ to .+ on \d{4}-\d{2}-\d{2}\.$/,
      );
    }
  });

  test('is accepted whole by the readers', () => {
    const set = createSystemSet();
    const categories = set.addCategories(
      uia.categories as unknown as readonly CategoryInput[],
    );
    const systems = set.addSystems(uia.systems);
    // The demo site adds the systems before the shapes, which `dataset-catalog` states.
    // One table holds the categories of the records and of the shapes, as the map holds
    // them, so a shape that names a category of the set resolves it.
    const shapes = createShapeSet((identity: string) => {
      const index = set.indexOfIdentity(identity);
      const system: RealSystem | null = index < 0 ? null : set.system(index);
      return system?.position ?? null;
    }, set);
    const spheres = shapes.addSpheres(uia.spheres as unknown as readonly SphereInput[]);
    const lines = shapes.addLines(uia.lines as unknown as readonly LineInput[]);

    expect(categories.rejected).toEqual([]);
    expect(systems.added).toBe(1116);
    expect(systems.rejected).toEqual([]);
    expect(spheres.added).toBe(54);
    expect(spheres.rejected).toEqual([]);
    expect(lines.added).toBe(983);
    expect(lines.rejected).toEqual([]);
  });
});

describe('the committed Adamastor set', () => {
  // The counts describe the committed file, by the same rule as the ruins set above. The
  // set carries every category of the source table that a record or a shape names: 4 hold
  // records and 6 more name a route alone, so the SYSTEMS tab lists 4 and the SHAPES tab
  // lists the 7 the routes name.
  test('holds 10 categories, 8 systems and 8 lines of 38 points', () => {
    expect(adamastor.categories).toHaveLength(10);
    expect(adamastor.systems).toHaveLength(8);
    expect(adamastor.spheres).toHaveLength(0);
    expect(adamastor.lines).toHaveLength(8);
    const points = adamastor.lines.reduce((sum, line) => sum + line.points.length, 0);
    expect(points).toBe(38);
  });

  // The 7 categories the routes name are in the set, so no line is rejected. The one
  // route naming the category `50`, which the source table does not hold, keeps the grey
  // fallback and names none.
  test('holds the categories its routes name', () => {
    const categories = new Set(adamastor.categories.map((category) => category.name));
    const named = adamastor.lines.filter(
      (line) => (line as { primaryCategory?: string }).primaryCategory !== undefined,
    );
    expect(named).toHaveLength(7);
    for (const line of named) {
      const held = line as { primaryCategory?: string; color?: unknown };
      expect(categories.has(held.primaryCategory ?? '')).toBe(true);
      expect(held.color).toBeUndefined();
    }
    const fallback = adamastor.lines.filter(
      (line) => (line as { color?: number[] }).color !== undefined,
    );
    expect(fallback).toHaveLength(1);
    expect((fallback[0] as { color?: number[] }).color).toEqual([160, 160, 160]);
  });

  test('holds both point forms', () => {
    let references = 0;
    let coordinates = 0;
    for (const line of adamastor.lines) {
      for (const point of line.points) {
        if (Array.isArray(point)) coordinates += 1;
        else references += 1;
      }
    }
    expect(references).toBe(5);
    expect(coordinates).toBe(33);
  });

  test('is accepted whole by the readers, with every reference resolved', () => {
    const set = createSystemSet();
    const categories = set.addCategories(
      adamastor.categories as unknown as readonly CategoryInput[],
    );
    const systems = set.addSystems(adamastor.systems);
    // The demo site adds the systems before the lines, which `dataset-catalog` states.
    // The set's table holds the route categories as well as the record ones, so every
    // line resolves the category it names.
    const shapes = createShapeSet((identity: string) => {
      const index = set.indexOfIdentity(identity);
      const system: RealSystem | null = index < 0 ? null : set.system(index);
      return system?.position ?? null;
    }, set);
    const lines = shapes.addLines(adamastor.lines as unknown as readonly LineInput[]);

    expect(categories.rejected).toEqual([]);
    expect(systems.added).toBe(8);
    expect(systems.rejected).toEqual([]);
    expect(lines.added).toBe(8);
    expect(lines.rejected).toEqual([]);
  });
});
