// Holds the conversion rules of `scripts/build-demo-systems.mjs` against a committed
// extract of the Guardian Ruins dump. The test reads the extract and not the live dump,
// so it runs on a clean checkout and reaches no network.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { convertRuins, describeSystem } from '../../scripts/build-demo-systems.mjs';

const extract = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('./guardian-ruins-extract.json', import.meta.url)),
    'utf8',
  ),
) as unknown[];

const expected = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('./guardian-ruins-demo-set.json', import.meta.url)),
    'utf8',
  ),
) as unknown;

describe('the conversion of the dump', () => {
  test('gives the committed output over the committed extract', () => {
    expect(convertRuins(extract)).toEqual(expected);
  });

  test('reads 24 sites over 8 systems', () => {
    expect(extract).toHaveLength(24);
    expect(convertRuins(extract).systems).toHaveLength(8);
  });

  test('drops a site with no name and a site with no finite position', () => {
    const broken = [
      { 'System Name': '   ', 'Site Type': 'Alpha', x: '1', y: '2', z: '3' },
      { 'System Name': 'Bad Coords', 'Site Type': 'Alpha', x: 'none', y: '2', z: '3' },
      { 'System Name': 'Good', 'Site Type': 'Alpha', x: '1', y: '2', z: '3' },
    ];

    const set = convertRuins(broken);

    expect(set.systems.map((system) => system.name)).toEqual(['Good']);
  });

  test('drops a category that no record uses', () => {
    const one = [
      { 'System Name': 'Only Beta', 'Site Type': 'Beta', x: '1', y: '2', z: '3' },
    ];

    const set = convertRuins(one);

    expect(set.categories.map((category) => category.name)).toEqual(['Ruins Beta']);
  });

  test('takes the distinct site types in the order of the dump', () => {
    const sites = [
      { 'System Name': 'Three', 'Site Type': 'Gamma', x: '1', y: '2', z: '3' },
      { 'System Name': 'Three', 'Site Type': 'Alpha', x: '1', y: '2', z: '3' },
      { 'System Name': 'Three', 'Site Type': 'Gamma', x: '1', y: '2', z: '3' },
      { 'System Name': 'Three', 'Site Type': 'Beta', x: '1', y: '2', z: '3' },
    ];

    const system = convertRuins(sites).systems[0];

    expect(system?.primaryCategory).toBe('Ruins Gamma');
    expect(system?.secondaryCategories).toEqual(['Ruins Alpha', 'Ruins Beta']);
    expect(system?.images.map((image) => image.caption)).toEqual([
      'Gamma site',
      'Alpha site',
      'Beta site',
    ]);
  });
});

describe('the description of a record', () => {
  test('names the site count and the bodies', () => {
    expect(describeSystem([{ 'Body Name': '1 B' }])).toBe(
      'The system holds 1 Guardian ruin. The body is 1 B.',
    );
    expect(describeSystem([{ 'Body Name': '8 C' }, { 'Body Name': '9 A' }])).toBe(
      'The system holds 2 Guardian ruins. The bodies are 8 C and 9 A.',
    );
  });

  test('names no body when the dump gives none', () => {
    expect(describeSystem([{}, {}])).toBe('The system holds 2 Guardian ruins.');
  });
});
