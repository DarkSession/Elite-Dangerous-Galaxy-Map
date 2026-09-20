// Holds the multifaction sphere rules of `scripts/build-demo-systems.mjs` against a
// committed extract of the source. The test reads the extract and not the live source, so
// it runs on a clean checkout and reaches no network. The records of that set come from
// the Spansh dump at run time, and `src/app/multifaction.test.ts` holds their rules.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { createSystemSet } from '../../packages/galaxy-map/src/scene-data/real-systems';
import { createShapeSet } from '../../packages/galaxy-map/src/scene-data/shapes';
import type { CategoryInput } from '../../packages/galaxy-map/src/scene-data/real-systems';
import type { SphereInput } from '../../packages/galaxy-map/src/scene-data/shapes';
import {
  convertMultifactionSpheres,
  parseEd3dData,
  MULTIFACTION_SPHERE_LISTS,
} from '../../apps/demo/scripts/build-demo-systems.mjs';

const source = readFileSync(
  fileURLToPath(new URL('./multifaction-extract.js', import.meta.url)),
  'utf8',
);

/** The `permitSpheres` literal of the extract. Each test reads it again. */
function extract(): Record<string, unknown> {
  return parseEd3dData(source, 'permitSpheres') as Record<string, unknown>;
}

describe('the parser over a literal of its own name', () => {
  test('reads the permit spheres and not the empty systemsData', () => {
    const data = extract();
    expect(Object.keys(data)).toEqual(['pls', 'puls']);
    expect((data['pls'] as unknown[]).length).toBe(5);
    // The default literal is still `systemsData`, which this source leaves empty.
    const systems = parseEd3dData(source) as Record<string, unknown>;
    expect(Object.keys(systems)).toEqual(['categories', 'systems', 'routes']);
  });

  test('names the literal it cannot find', () => {
    expect(() => parseEd3dData('var x = 1;', 'permitSpheres')).toThrow(
      'no permitSpheres',
    );
  });
});

describe('the conversion of the multifaction spheres', () => {
  test('gives each sphere its category and no colour of its own', () => {
    const set = convertMultifactionSpheres(extract());
    expect(MULTIFACTION_SPHERE_LISTS.map((list) => list.key)).toEqual(['pls', 'puls']);
    expect(set.categories).toEqual([
      { name: 'Permit Locked Sector', color: [51, 179, 255] },
      { name: 'Permit Unlocked Sector', color: [255, 191, 26] },
    ]);
    expect(set.spheres.map((sphere) => sphere.categories?.[0])).toEqual([
      'Permit Locked Sector',
      'Permit Locked Sector',
      'Permit Locked Sector',
      'Permit Unlocked Sector',
      'Permit Unlocked Sector',
    ]);
    // The sphere takes the colour of its category, so it carries none.
    for (const sphere of set.spheres) {
      expect((sphere as { color?: unknown }).color).toBeUndefined();
    }
  });

  test('carries the radius, the position and the name of a sphere', () => {
    const set = convertMultifactionSpheres(extract());
    expect(set.spheres[0]).toEqual({
      position: [508.68359, -372.59375, -1090.87891],
      radius: 514,
      name: 'Col 70 Sector',
      categories: ['Permit Locked Sector'],
    });
  });

  // The extract holds one entry with a radius of 0 and one with two coordinates.
  test('drops an entry that carries no radius or no position', () => {
    const set = convertMultifactionSpheres(extract());
    const names = set.spheres.map((sphere) => sphere.name);
    expect(names).not.toContain('No Radius');
    expect(names).not.toContain('No Third Coordinate');
    expect(set.spheres).toHaveLength(5);
  });
});

describe('the readers over the converted fixture', () => {
  test('take every sphere, with the category it names', () => {
    const converted = convertMultifactionSpheres(extract());
    const systems = createSystemSet();
    const categories = systems.addCategories(
      converted.categories as unknown as readonly CategoryInput[],
    );
    // The set holds no record, so the shapes carry the whole of the reading.
    const shapes = createShapeSet(() => null, systems);
    const spheres = shapes.addSpheres(
      converted.spheres as unknown as readonly SphereInput[],
    );

    expect(categories.rejected).toEqual([]);
    expect(spheres.rejected).toEqual([]);
    expect(shapes.sphereCount).toBe(converted.spheres.length);
  });
});
