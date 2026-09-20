// The type test of the record input. The TypeScript check runs it, not the test runner:
// every `@ts-expect-error` below must report an error, and a directive that reports none
// fails the check. `pnpm build` runs `tsc --noEmit`, so a type that stopped rejecting a
// malformed record fails the build.
import { describe, expect, test } from 'vitest';
import type { CategoryInput, SystemRecordInput } from './real-systems';
import type { LineInput, SphereInput } from './shapes';

/** A record with an `id64` string and two fields the reader drops. */
const wellFormed: SystemRecordInput = {
  name: 'Sol',
  coords: { x: 0, y: 0, z: 0 },
  categories: ['Core'],
  id64: '10477373803',
  date: '3307-01-01',
  bodies: [{ name: 'Earth' }],
};

// A record that names no category is an input record: an uncategorised set holds it.
const noCategory: SystemRecordInput = {
  name: 'Sol',
  coords: { x: 0, y: 0, z: 0 },
};

const oldNames: SystemRecordInput = {
  name: 'Sol',
  coords: { x: 0, y: 0, z: 0 },
  categories: ['Core'],
  // @ts-expect-error the old field names are banned beside `categories`
  primaryCategory: 'Core',
};

const stringCategories: SystemRecordInput = {
  name: 'Sol',
  coords: { x: 0, y: 0, z: 0 },
  // @ts-expect-error a `categories` that is not an array is not an input record
  categories: 'A',
};

const stringCoords: SystemRecordInput = {
  name: 'Sol',
  // @ts-expect-error the coordinates are numbers, not strings
  coords: { x: '0', y: '0', z: '0' },
  categories: ['Core'],
};

/** A record whose icons take both entry forms. */
const withIcons: SystemRecordInput = {
  name: 'Sol',
  coords: { x: 0, y: 0, z: 0 },
  categories: ['Core'],
  icons: ['titan', { url: '/a.svg', color: [1, 2, 3] }],
};

const iconWithNoColor: SystemRecordInput = {
  name: 'Sol',
  coords: { x: 0, y: 0, z: 0 },
  categories: ['Core'],
  // @ts-expect-error an object icon entry carries a required colour
  icons: [{ url: '/a.svg' }],
};

/** A sphere with one category list, which is the shape input the library states. */
const sphere: SphereInput = {
  position: [100, 0, 200],
  radius: 50,
  categories: ['Core'],
};

const oldSphereNames: SphereInput = {
  position: [100, 0, 200],
  radius: 50,
  // @ts-expect-error the old field names are banned on a shape input as well
  secondaryCategories: ['Core'],
};

const oldLineNames: LineInput = {
  points: [
    [0, 0, 0],
    [100, 0, 0],
  ],
  // @ts-expect-error the old field names are banned on a shape input as well
  primaryCategory: 'Core',
};

/** A category with a description and a field the reader drops. */
const category: CategoryInput = {
  name: 'Core',
  color: [153, 230, 255],
  description: 'The core systems.',
  source: 'EDSM',
};

// @ts-expect-error a category with no colour is not an input category
const noColor: CategoryInput = { name: 'Core' };

describe('the record input type', () => {
  test('keeps the values of a well-formed record', () => {
    expect(wellFormed.name).toBe('Sol');
    expect(wellFormed.id64).toBe('10477373803');
    expect(category.color).toEqual([153, 230, 255]);
    expect(withIcons.icons).toHaveLength(2);
  });

  test('a malformed record still carries its values at run time', () => {
    // The type refuses each of these. The reader is what rejects them, so the values
    // are still here and the reader's own tests read the reasons.
    expect(noCategory.categories).toBeUndefined();
    expect(stringCategories.categories).toBe('A');
    expect(oldNames.categories).toEqual(['Core']);
    expect(stringCoords.coords.x).toBe('0');
    expect(noColor.color).toBeUndefined();
    expect(iconWithNoColor.icons?.[0]).toEqual({ url: '/a.svg' });
    expect(sphere.categories).toEqual(['Core']);
    expect(oldSphereNames.secondaryCategories).toEqual(['Core']);
    expect(oldLineNames.primaryCategory).toBe('Core');
  });
});
