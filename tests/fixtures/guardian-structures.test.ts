// Holds the Guardian Structures conversion rules of `scripts/build-demo-systems.mjs`
// against a committed extract of the dump. The test reads the extract and not the live
// dump, so it runs on a clean checkout and reaches no network.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { createSystemSet } from '../../packages/galaxy-map/src/scene-data/real-systems';
import type { CategoryInput } from '../../packages/galaxy-map/src/scene-data/real-systems';
import {
  convertStructures,
  describeStructureSystem,
} from '../../apps/demo/scripts/build-demo-systems.mjs';

const extract = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('./guardian-structures-extract.json', import.meta.url)),
    'utf8',
  ),
) as unknown[];

const expected = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('./guardian-structures-demo-set.json', import.meta.url)),
    'utf8',
  ),
) as unknown;

describe('the conversion of the structures dump', () => {
  test('gives the committed output over the committed extract', () => {
    expect(convertStructures(extract)).toEqual(expected);
  });

  test('reads 20 sites over 16 systems and 10 site types', () => {
    expect(extract).toHaveLength(20);
    const set = convertStructures(extract);
    expect(set.systems).toHaveLength(16);
    expect(set.categories).toHaveLength(10);
  });

  test('drops a site with no name and a site with no finite position', () => {
    const broken = [
      { 'System Name': '   ', 'Site Type': 'Bear', x: '1', y: '2', z: '3' },
      { 'System Name': 'Bad Coords', 'Site Type': 'Bear', x: 'none', y: '2', z: '3' },
      { 'System Name': 'Good', 'Site Type': 'Bear', x: '1', y: '2', z: '3' },
    ];

    const set = convertStructures(broken);

    expect(set.systems.map((system) => system.name)).toEqual(['Good']);
  });

  test('drops a category that no record uses', () => {
    const one = [
      { 'System Name': 'Only Bowl', 'Site Type': 'Bowl', x: '1', y: '2', z: '3' },
    ];

    const set = convertStructures(one);

    expect(set.categories.map((category) => category.name)).toEqual(['Structure Bowl']);
  });

  test('takes the first site type as the primary category', () => {
    const sites = [
      { 'System Name': 'Two', 'Site Type': 'Turtle', x: '1', y: '2', z: '3' },
      { 'System Name': 'Two', 'Site Type': 'Squid', x: '1', y: '2', z: '3' },
      { 'System Name': 'Two', 'Site Type': 'Turtle', x: '1', y: '2', z: '3' },
    ];

    const system = convertStructures(sites).systems[0];

    expect(system?.categories).toEqual(['Structure Turtle', 'Structure Squid']);
  });

  test('gives a site type the table does not name the unknown category', () => {
    const sites = [
      { 'System Name': 'Odd', 'Site Type': 'Teapot', x: '1', y: '2', z: '3' },
    ];

    const system = convertStructures(sites).systems[0];

    expect(system?.categories).toEqual(['Structure Unknown']);
  });

  test('names no image, because the dump names no picture', () => {
    for (const system of convertStructures(extract).systems) {
      expect(system).not.toHaveProperty('images');
    }
  });

  test('emits records the reader accepts whole', () => {
    const set = createSystemSet();
    const converted = convertStructures(extract);

    const categories = set.addCategories(
      converted.categories as unknown as readonly CategoryInput[],
    );
    const systems = set.addSystems(converted.systems);

    expect(categories.rejected).toEqual([]);
    expect(systems.rejected).toEqual([]);
    expect(systems.added).toBe(converted.systems.length);
  });
});

describe('the description of a structures record', () => {
  test('names the site count and the bodies', () => {
    expect(describeStructureSystem([{ 'Body Name': 'C 2' }])).toBe(
      'The system holds 1 Guardian structure. The body is C 2.',
    );
    expect(
      describeStructureSystem([{ 'Body Name': 'A 3' }, { 'Body Name': 'B 1' }]),
    ).toBe('The system holds 2 Guardian structures. The bodies are A 3 and B 1.');
  });

  test('names no body when the dump gives none', () => {
    expect(describeStructureSystem([{}, {}])).toBe(
      'The system holds 2 Guardian structures.',
    );
  });
});
