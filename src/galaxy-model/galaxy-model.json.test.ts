import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const parameterPath = fileURLToPath(new URL('./galaxy-model.json', import.meta.url));
const bytes = readFileSync(parameterPath);
const document = JSON.parse(bytes.toString('utf8')) as Record<string, unknown>;

describe('the committed parameter file', () => {
  test('holds exactly the keys the map reads', () => {
    expect(Object.keys(document).sort()).toEqual(
      [
        'bounds',
        'calibration',
        'centre',
        'correction',
        'epsilon',
        'format',
        'reference_radius_ly',
        'surface',
        'units',
        'vertical',
        'zone',
      ].sort(),
    );
  });

  test('declares the version one format', () => {
    expect(document['format']).toBe('galaxy-density-model-v1');
  });

  test('holds only the zone lookup in the zone key', () => {
    expect(Object.keys(document['zone'] as object).sort()).toEqual([
      'log_density',
      'zone',
    ]);
  });

  test('holds only the mass budget in the calibration key', () => {
    expect(Object.keys(document['calibration'] as object)).toEqual([
      'mc0_budget_msun_per_ly3_per_unit',
    ]);
  });

  test('holds no description, no fit report and no calibration samples', () => {
    for (const key of ['description', 'fit', 'samples']) {
      expect(Object.hasOwn(document, key)).toBe(false);
    }
  });

  test('stays under the size limit', () => {
    expect(statSync(parameterPath).size).toBeLessThan(16384);
  });
});
