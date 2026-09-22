// The readings the dataset library makes: the colour of a collection, the chip row, the
// entries the search box and a chip keep, the line in the header and a card's title. The
// browser suite reads the chips and the cards on the screen.
import { describe, expect, test } from 'vitest';
import type { DatasetInfo } from '../app/create-map';
import {
  cardTitle,
  collectionColour,
  COLLECTION_COLOURS,
  collectionsOf,
  countLine,
  keptEntriesOf,
} from './dataset-dialog';

/** A catalog of five entries over two collections. */
const CATALOG: readonly DatasetInfo[] = [
  { id: 'a', label: 'Guardian Ruins', collection: 'Canonn Research Group' },
  { id: 'b', label: 'Guardian Structures', collection: 'Canonn Research Group' },
  { id: 'c', label: 'Notable Systems', collection: 'Canonn Research Group' },
  { id: 'd', label: 'Cycle 1', collection: 'Thargoid War' },
  { id: 'e', label: 'Cycle 2', collection: 'Thargoid War' },
];

describe('collectionColour', () => {
  test('gives one name the same colour every time', () => {
    expect(collectionColour('Canonn Research Group')).toBe(
      collectionColour('Canonn Research Group'),
    );
    expect(COLLECTION_COLOURS).toContain(collectionColour('Canonn Research Group'));
  });

  test('gives a different colour to at least one other name', () => {
    expect(collectionColour('Canonn Research Group')).not.toBe(
      collectionColour('Thargoid War'),
    );
  });

  test('reaches all eight colours', () => {
    const found = new Set<string>();
    for (let index = 0; index < 400; index += 1) {
      found.add(collectionColour(`Collection ${String(index)}`));
    }
    expect(found.size).toBe(COLLECTION_COLOURS.length);
  });

  test('gives a colour of the list to an empty name', () => {
    expect(COLLECTION_COLOURS).toContain(collectionColour(''));
  });
});

describe('collectionsOf', () => {
  test('counts the entries of each collection', () => {
    expect(collectionsOf(CATALOG)).toEqual([
      { name: 'Canonn Research Group', count: 3 },
      { name: 'Thargoid War', count: 2 },
    ]);
  });

  test('sorts the collections by name and not by the order of the catalog', () => {
    const catalog: DatasetInfo[] = [
      { id: 'a', label: 'One', collection: 'Zeta' },
      { id: 'b', label: 'Two', collection: 'Alpha' },
      { id: 'c', label: 'Three', collection: 'Mu' },
    ];

    expect(collectionsOf(catalog).map((one) => one.name)).toEqual([
      'Alpha',
      'Mu',
      'Zeta',
    ]);
  });

  test('puts an entry with no collection under OTHER', () => {
    const catalog: DatasetInfo[] = [
      { id: 'a', label: 'One' },
      { id: 'b', label: 'Two', collection: '' },
      { id: 'c', label: 'Three', collection: 'Alpha' },
    ];

    expect(collectionsOf(catalog)).toEqual([
      { name: 'Alpha', count: 1 },
      { name: 'OTHER', count: 2 },
    ]);
  });

  test('gives one collection for a catalog that names none', () => {
    const catalog: DatasetInfo[] = [
      { id: 'a', label: 'One' },
      { id: 'b', label: 'Two' },
    ];

    expect(collectionsOf(catalog)).toEqual([{ name: 'OTHER', count: 2 }]);
  });
});

describe('keptEntriesOf', () => {
  test('keeps the entries whose label holds the text, without case', () => {
    expect(keptEntriesOf(CATALOG, 'GUARDIAN', null).map((one) => one.id)).toEqual([
      'a',
      'b',
    ]);
  });

  test('reads the label alone and not the collection', () => {
    expect(keptEntriesOf(CATALOG, 'canonn', null)).toEqual([]);
  });

  test('keeps the entries of the picked collection', () => {
    expect(keptEntriesOf(CATALOG, '', 'Thargoid War').map((one) => one.id)).toEqual([
      'd',
      'e',
    ]);
  });

  test('reads the text and the chip together', () => {
    expect(
      keptEntriesOf(CATALOG, 'cycle 2', 'Thargoid War').map((one) => one.id),
    ).toEqual(['e']);
  });

  test('keeps every entry with no text and no chip', () => {
    expect(keptEntriesOf(CATALOG, '   ', null)).toHaveLength(5);
  });
});

describe('countLine', () => {
  test('reads the count of the catalog while nothing narrows the list', () => {
    expect(countLine(130, 130, false)).toBe('130 DATASETS');
  });

  test('reads the two counts while the list is narrowed', () => {
    expect(countLine(1, 3, true)).toBe('1 OF 3');
    expect(countLine(0, 1300, true)).toBe('0 OF 1,300');
  });
});

describe('cardTitle', () => {
  test('holds the region, the description and the count', () => {
    const title = cardTitle({
      id: 'a',
      label: 'Guardian Ruins',
      region: 'Inner Orion Spur',
      description: 'Every known Guardian ruin.',
      systemCount: 1116,
    });

    expect(title).toBe('Inner Orion Spur · Every known Guardian ruin. · 1,116 SYSTEMS');
  });

  test('says the count comes on the load where the entry carries none', () => {
    expect(cardTitle({ id: 'a', label: 'Canonn Factions' })).toBe('FETCHED ON LOAD');
  });

  test('leaves no empty separator for a field the entry does not carry', () => {
    expect(
      cardTitle({ id: 'a', label: 'One', region: 'Colonia', systemCount: 2 }),
    ).toBe('Colonia · 2 SYSTEMS');
  });
});
