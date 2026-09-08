import { describe, expect, test } from 'vitest';
import parameters from './galaxy-model.json' with { type: 'json' };
import { GalaxyModelError, loadGalaxyModel } from './load';

function clone(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(parameters)) as Record<string, unknown>;
}

describe('loadGalaxyModel', () => {
  test('accepts the committed parameter file', () => {
    expect(() => loadGalaxyModel(parameters)).not.toThrow();
  });

  test('rejects a wrong format and names it', () => {
    const document = clone();
    document['format'] = 'x';
    expect(() => loadGalaxyModel(document)).toThrow(GalaxyModelError);
    expect(() => loadGalaxyModel(document)).toThrow(/"x"/);
  });

  test('rejects a model that does not have four arms', () => {
    const document = clone();
    const surface = document['surface'] as { arms: { list: unknown[] } };
    surface.arms.list = surface.arms.list.slice(0, 3);
    expect(() => loadGalaxyModel(document)).toThrow(GalaxyModelError);
  });

  test('rejects a correction grid with 4,095 values', () => {
    const document = clone();
    const correction = document['correction'] as { size: number; values: number[] };
    correction.values = correction.values.slice(0, 4095);
    expect(() => loadGalaxyModel(document)).toThrow(GalaxyModelError);
  });

  test('rejects a correction value outside -127 to 127', () => {
    const document = clone();
    const correction = document['correction'] as { values: number[] };
    correction.values[10] = 128;
    expect(() => loadGalaxyModel(document)).toThrow(GalaxyModelError);
  });
});
