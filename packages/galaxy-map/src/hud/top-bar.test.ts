// The readings the top bar's dataset field makes: the `datasetArrows` option, the entry
// each step button loads, the name it reads and the counter beside it. The browser suite
// reads the buttons on the screen; this reads the rules they follow.
import { describe, expect, test } from 'vitest';
import type { DatasetInfo } from '../app/create-map';
import { counterText, readDatasetArrows, stepLabel, stepTarget } from './top-bar';

/** A catalog of three entries, in the order the arrows step through them. */
const CATALOG: readonly DatasetInfo[] = [
  { id: 'one', label: 'Guardian Ruins' },
  { id: 'two', label: 'Notable Systems' },
  { id: 'three', label: 'Thargoid Sites' },
];

describe('readDatasetArrows', () => {
  test('reads true alone as true', () => {
    expect(readDatasetArrows(true)).toBe(true);
  });

  test('reads false and an absent option as false', () => {
    expect(readDatasetArrows(false)).toBe(false);
    expect(readDatasetArrows(undefined)).toBe(false);
  });

  test('reads a value that is not a boolean as false', () => {
    expect(readDatasetArrows('yes')).toBe(false);
    expect(readDatasetArrows(1)).toBe(false);
    expect(readDatasetArrows({})).toBe(false);
  });
});

describe('stepTarget', () => {
  test('gives the entry beside the loaded one', () => {
    expect(stepTarget(CATALOG, 'two', -1)?.id).toBe('one');
    expect(stepTarget(CATALOG, 'two', 1)?.id).toBe('three');
  });

  test('gives none at either end of the catalog', () => {
    expect(stepTarget(CATALOG, 'one', -1)).toBeNull();
    expect(stepTarget(CATALOG, 'three', 1)).toBeNull();
  });

  test('gives none where the catalog does not hold the loaded entry', () => {
    expect(stepTarget(CATALOG, null, -1)).toBeNull();
    expect(stepTarget(CATALOG, null, 1)).toBeNull();
  });
});

describe('stepLabel', () => {
  test('names the entry the button loads', () => {
    expect(stepLabel(true, CATALOG[0] ?? null)).toBe(
      'Previous dataset, Guardian Ruins',
    );
    expect(stepLabel(false, CATALOG[2] ?? null)).toBe('Next dataset, Thargoid Sites');
  });

  test('names the end of the catalog where there is no entry', () => {
    expect(stepLabel(true, null)).toBe('First dataset');
    expect(stepLabel(false, null)).toBe('Last dataset');
  });
});

describe('counterText', () => {
  test('reads the place of the loaded entry and the count', () => {
    expect(counterText(CATALOG, 'one')).toBe('1 / 3');
    expect(counterText(CATALOG, 'three')).toBe('3 / 3');
  });

  test('reads a dash before the first load settles', () => {
    expect(counterText(CATALOG, null)).toBe('- / 3');
  });
});
