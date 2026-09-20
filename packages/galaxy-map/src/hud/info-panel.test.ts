// The field placement of the information panel and the reader of the `infoFields`
// option. Both are pure, so they are read here with no DOM. The browser suite reads the
// boxes the grid draws.
import { describe, expect, test } from 'vitest';
import { fieldsOf, readInfoFields } from './info-panel';
import type { InfoFieldSwitches } from './info-panel';
import type { SystemDetailValue } from './details';
import type { RealSystem } from '../app/create-map';

/** Every worked-out field on, which is what a host that names none gets. */
const ALL_ON: InfoFieldSwitches = { distanceFromSol: true, range: true, region: true };

/** A record with the fields the test names and nothing else. */
function system(extra: Partial<RealSystem> = {}): RealSystem {
  return {
    name: 'Sol',
    position: [0, 0, 0],
    categories: ['A'],
    ...extra,
  } as RealSystem;
}

/** The label and the width of each field, in order. */
function placement(
  switches: InfoFieldSwitches,
  extra: Partial<RealSystem> = {},
  values: readonly SystemDetailValue[] = [],
): [string, boolean][] {
  return fieldsOf(system(extra), 0, switches, values).map((field) => [
    field.label,
    field.wide === true,
  ]);
}

describe('readInfoFields', () => {
  test('leaves every field on by default', () => {
    expect(readInfoFields(undefined)).toEqual(ALL_ON);
    expect(readInfoFields({})).toEqual(ALL_ON);
  });

  test('takes the default for a value that is not a boolean', () => {
    expect(readInfoFields({ range: 'no' as never })).toEqual(ALL_ON);
  });

  test('turns off the field the host names false', () => {
    expect(readInfoFields({ distanceFromSol: false, region: false })).toEqual({
      distanceFromSol: false,
      range: true,
      region: false,
    });
  });
});

describe('the field placement', () => {
  test('gives the position both columns and the two distances one row', () => {
    expect(placement(ALL_ON)).toEqual([
      ['POSITION', true],
      ['DISTANCE FROM SOL', false],
      ['RANGE', false],
      ['REGION', true],
    ]);
  });

  test('leaves the last of an odd count of later fields alone on its row', () => {
    const odd = placement(ALL_ON, { primaryStar: 'G2 V' });
    expect(odd[odd.length - 1]).toEqual(['PRIMARY STAR', true]);
    const even = placement(ALL_ON, { primaryStar: 'G2 V', allegiance: 'Federation' });
    expect(even.slice(4)).toEqual([
      ['PRIMARY STAR', false],
      ['ALLEGIANCE', false],
    ]);
  });

  test('leaves no empty cell with the distance off', () => {
    expect(placement({ ...ALL_ON, distanceFromSol: false })).toEqual([
      ['POSITION', true],
      ['RANGE', true],
      ['REGION', true],
    ]);
  });

  test('leaves no empty cell with the range off', () => {
    expect(placement({ ...ALL_ON, range: false })).toEqual([
      ['POSITION', true],
      ['DISTANCE FROM SOL', true],
      ['REGION', true],
    ]);
  });

  test('leaves no empty cell with the region off', () => {
    expect(placement({ ...ALL_ON, region: false })).toEqual([
      ['POSITION', true],
      ['DISTANCE FROM SOL', false],
      ['RANGE', false],
    ]);
    expect(placement({ ...ALL_ON, region: false }, { primaryStar: 'G2 V' })).toEqual([
      ['POSITION', true],
      ['DISTANCE FROM SOL', false],
      ['RANGE', false],
      ['PRIMARY STAR', true],
    ]);
  });

  test('holds the position alone with the three fields off', () => {
    const off = { distanceFromSol: false, range: false, region: false };
    expect(placement(off)).toEqual([['POSITION', true]]);
    expect(placement(off, { allegiance: 'Federation', population: 100 })).toEqual([
      ['POSITION', true],
      ['ALLEGIANCE', false],
      ['POPULATION', false],
    ]);
  });

  test('adds the host values after the fields of the record', () => {
    const fields = fieldsOf(system({ primaryStar: 'G2 V' }), 0, ALL_ON, [
      { label: 'FACTION', value: 'Pilots Federation' },
      { label: 'SYSTEM ADDRESS', value: '2871051900826', copy: '2871051900826' },
    ]);
    expect(fields.map((field) => field.label).slice(4)).toEqual([
      'PRIMARY STAR',
      'FACTION',
      'SYSTEM ADDRESS',
    ]);
    // The host's button carries the entry's label as its key, so its tick does not
    // collide with the position button's.
    expect(fields[6]?.copy).toEqual({
      text: '2871051900826',
      name: 'Copy SYSTEM ADDRESS',
      key: 'SYSTEM ADDRESS',
    });
    expect(fields[5]?.copy).toBeUndefined();
  });
});
