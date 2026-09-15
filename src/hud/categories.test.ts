import { describe, expect, it } from 'vitest';
import { matchingCategories, rowShare } from './categories';
import type { CategorySystems } from './categories';

const GROUPS: CategorySystems[] = [
  { name: 'A', systems: ['Alpha', 'Beta'] },
  { name: 'B', systems: ['Alpha Two'] },
  { name: 'C', systems: ['Gamma'] },
];

describe('the matching categories', () => {
  it('holds every category with a match', () => {
    expect([...matchingCategories('alpha', GROUPS)]).toEqual(['A', 'B']);
  });

  it('reads the text without case', () => {
    expect([...matchingCategories('ALPHA', GROUPS)]).toEqual(['A', 'B']);
    expect([...matchingCategories('gAmMa', GROUPS)]).toEqual(['C']);
  });

  it('does not trim the text', () => {
    // The map compares the filter text as the host gave it. A trim here would open a
    // row whose marker the map does not draw.
    expect([...matchingCategories(' alpha', GROUPS)]).toEqual([]);
  });

  it('holds a category whose match is not the first system', () => {
    expect([...matchingCategories('beta', GROUPS)]).toEqual(['A']);
  });

  it('holds no category where nothing matches', () => {
    expect([...matchingCategories('delta', GROUPS)]).toEqual([]);
  });

  it('holds every category for an empty text', () => {
    expect([...matchingCategories('', GROUPS)]).toEqual(['A', 'B', 'C']);
  });

  it('holds no category where there is no category', () => {
    expect([...matchingCategories('alpha', [])]).toEqual([]);
  });

  it('holds no category that carries no system', () => {
    const groups: CategorySystems[] = [{ name: 'D', systems: [] }];
    expect([...matchingCategories('', groups)]).toEqual([]);
    expect([...matchingCategories('a', groups)]).toEqual([]);
  });
});

describe('the shared row budget', () => {
  it('gives one open list every row', () => {
    expect(rowShare(1, 0)).toBe(200);
  });

  it('gives no row where no list is open', () => {
    expect(rowShare(0, 0)).toBe(0);
  });

  it('shares the rows over four open lists', () => {
    expect(rowShare(4, 0)).toBe(50);
    expect(rowShare(4, 3)).toBe(50);
  });

  it('gives one row each to the first 200 of 256 open lists', () => {
    expect(rowShare(256, 0)).toBe(1);
    expect(rowShare(256, 199)).toBe(1);
    expect(rowShare(256, 200)).toBe(0);
    expect(rowShare(256, 255)).toBe(0);
    let total = 0;
    for (let index = 0; index < 256; index += 1) total += rowShare(256, index);
    expect(total).toBe(200);
  });
});
