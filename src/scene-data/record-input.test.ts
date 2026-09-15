// The type test of the record input. The TypeScript check runs it, not the test runner:
// every `@ts-expect-error` below must report an error, and a directive that reports none
// fails the check. `pnpm build` runs `tsc --noEmit`, so a type that stopped rejecting a
// malformed record fails the build.
import { describe, expect, test } from 'vitest';
import type { CategoryInput, SystemRecordInput } from './real-systems';

/** A record with an `id64` string and two fields the reader drops. */
const wellFormed: SystemRecordInput = {
  name: 'Sol',
  coords: { x: 0, y: 0, z: 0 },
  primaryCategory: 'Core',
  id64: '10477373803',
  date: '3307-01-01',
  bodies: [{ name: 'Earth' }],
};

// @ts-expect-error a record with no primary category is not an input record
const noPrimaryCategory: SystemRecordInput = {
  name: 'Sol',
  coords: { x: 0, y: 0, z: 0 },
};

const stringCoords: SystemRecordInput = {
  name: 'Sol',
  // @ts-expect-error the coordinates are numbers, not strings
  coords: { x: '0', y: '0', z: '0' },
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
  });

  test('a malformed record still carries its values at run time', () => {
    // The type refuses each of these. The reader is what rejects them, so the values
    // are still here and the reader's own tests read the reasons.
    expect(noPrimaryCategory.primaryCategory).toBeUndefined();
    expect(stringCoords.coords.x).toBe('0');
    expect(noColor.color).toBeUndefined();
  });
});
