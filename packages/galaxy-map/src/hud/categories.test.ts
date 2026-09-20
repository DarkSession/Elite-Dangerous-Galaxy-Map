import { describe, expect, it } from 'vitest';
import { listCap, matchingCategories, rowShare, shapeLabel } from './categories';
import type { CategoryNames } from './categories';

const GROUPS: CategoryNames[] = [
  { name: 'A', names: ['Alpha', 'Beta'] },
  { name: 'B', names: ['Alpha Two'] },
  { name: 'C', names: ['Gamma'] },
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

  it('holds a category whose match is not the first name', () => {
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

  it('holds no category that carries no name', () => {
    const groups: CategoryNames[] = [{ name: 'D', names: [] }];
    expect([...matchingCategories('', groups)]).toEqual([]);
    expect([...matchingCategories('a', groups)]).toEqual([]);
  });

  it('reads the shape names as it reads the system names', () => {
    const groups: CategoryNames[] = [
      { name: 'Ruins', names: ['Sol Zone', 'Solati Zone'] },
      { name: 'Permits', names: ['SPHERE 3'] },
    ];
    expect([...matchingCategories('sol', groups)]).toEqual(['Ruins']);
    expect([...matchingCategories('sphere', groups)]).toEqual(['Permits']);
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

describe('the height cap of an open list', () => {
  // The three cases the rule holds: the rows leave more than half the area, the rows
  // leave less than half of it, and several lists share what is left.
  it('gives one open list the height the rows leave', () => {
    expect(listCap(800, 100, 1)).toBe(700);
  });

  it('keeps half the area where the rows leave less', () => {
    expect(listCap(800, 700, 1)).toBe(400);
  });

  it('shares the height evenly over the open lists', () => {
    expect(listCap(800, 200, 3)).toBe(200);
    expect(listCap(800, 700, 4)).toBe(100);
  });

  it('gives a share under one row to 256 open lists', () => {
    // The share is then about 3 pixels against a row of about 18, and the panel is
    // telling the user to narrow the filter.
    expect(listCap(800, 700, 256)).toBeCloseTo(1.5625, 4);
  });

  it('caps nothing where no list is open or the panel is not laid out', () => {
    expect(listCap(800, 100, 0)).toBe(0);
    expect(listCap(0, 0, 1)).toBe(0);
  });

  it('keeps half the area where the rows fill it', () => {
    expect(listCap(800, 1200, 1)).toBe(400);
  });
});

describe('the label of a shape row', () => {
  it('reads the name the shape carries', () => {
    expect(shapeLabel('sphere', 12, 'Col 70 Sector')).toBe('Col 70 Sector');
  });

  it('reads the kind and the place where the shape carries none', () => {
    expect(shapeLabel('sphere', 12)).toBe('SPHERE 12');
    expect(shapeLabel('line', 7)).toBe('LINE 7');
  });

  it('reads the kind and the place for an empty name', () => {
    expect(shapeLabel('line', 0, '')).toBe('LINE 0');
  });
});
