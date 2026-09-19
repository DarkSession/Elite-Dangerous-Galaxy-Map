// The reader of the `lockedOptions` setting. It is pure, so it is read here with no DOM.
// The browser suite reads the switches the panel builds.
import { describe, expect, test } from 'vitest';
import { readLockedOptions } from './options-panel';

describe('readLockedOptions', () => {
  test('keeps the names the panel holds', () => {
    const locked = readLockedOptions(['grid', 'shapes', 'nebulae']);
    expect([...locked].sort()).toEqual(['grid', 'nebulae', 'shapes']);
  });

  test('ignores a name the panel does not hold', () => {
    const locked = readLockedOptions(['datasets', 7, null, 'grid']);
    expect([...locked]).toEqual(['grid']);
  });

  test('ignores a list that is not an array', () => {
    expect(readLockedOptions('grid').size).toBe(0);
    expect(readLockedOptions(undefined).size).toBe(0);
    expect(readLockedOptions({ grid: true }).size).toBe(0);
  });
});
