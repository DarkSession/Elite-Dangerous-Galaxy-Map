// Holds the Adamastor conversion rules of `scripts/build-demo-systems.mjs` against a
// committed extract of the source. The test reads the extract and not the live source,
// and it gives the converter its own name lookup, so it reaches no network.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { createSystemSet } from '../../packages/galaxy-map/src/scene-data/real-systems';
import { createShapeSet } from '../../packages/galaxy-map/src/scene-data/shapes';
import type {
  CategoryInput,
  RealSystem,
} from '../../packages/galaxy-map/src/scene-data/real-systems';
import type { LineInput } from '../../packages/galaxy-map/src/scene-data/shapes';
import {
  convertAdamastor,
  ed3dRouteNames,
  LINE_COLOUR_FALLBACK,
  parseEd3dData,
} from '../../apps/demo/scripts/build-demo-systems.mjs';

const source = readFileSync(
  fileURLToPath(new URL('./adamastor-extract.js', import.meta.url)),
  'utf8',
);

const expected = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('./adamastor-demo-set.json', import.meta.url)),
    'utf8',
  ),
) as unknown;

/**
 * The name lookup the entry part reads from EDSM, as a fixed table. `Route Intersection`
 * and `Nowhere At All` are not in it, so the test reads the drop rules.
 */
const EDSM: Record<string, [number, number, number]> = {
  'HIP 33386': [-63.5, -120.9, -137.2],
  'HIP 39748': [-149.7, -75.6, 21.9],
  Chukchan: [-141.5, -64.9, 23.3],
};

function findPosition(name: string): [number, number, number] | null {
  const key = Object.keys(EDSM).find(
    (held) => held.toLowerCase() === name.toLowerCase(),
  );
  return key === undefined ? null : (EDSM[key] as [number, number, number]);
}

/** The parsed extract. Each test reads it again, so no test writes it for another. */
function extract(): Record<string, unknown> {
  return parseEd3dData(source) as Record<string, unknown>;
}

describe('the conversion of the Adamastor source', () => {
  test('gives the committed output over the committed extract', () => {
    const { drops, ...written } = convertAdamastor(extract(), findPosition);
    expect(written).toEqual(expected);
    expect(drops).toEqual([
      { route: 1, point: 'Extention1', reason: 'unknown-system' },
      { route: 1, point: 'Extention2', reason: 'unknown-system' },
      { route: 3, point: 'Route Intersection', reason: 'unknown-system' },
      { route: 3, point: 'Nowhere At All', reason: 'unknown-system' },
      { route: 3, point: null, reason: 'too-few-points' },
    ]);
  });

  // The set carries every category of the source table that a record or a shape names,
  // in the table's order. Two of these four name a record and two name a route alone.
  test('reads 4 systems and 4 categories', () => {
    const set = convertAdamastor(extract(), findPosition);
    expect(set.systems).toHaveLength(4);
    expect(set.categories.map((category) => category.name)).toEqual([
      'Adamastor Initial Route',
      'Line Through Waypoints',
      "Hyford's Cache & D-2's LPs",
      'Project Seraph Settlements',
    ]);
    const records = new Set(
      set.systems.flatMap((system) => [
        system.primaryCategory,
        ...system.secondaryCategories,
      ]),
    );
    expect(records.has('Adamastor Initial Route')).toBe(false);
  });

  test('names only the points the source does not hold itself', () => {
    expect(ed3dRouteNames(extract())).toEqual([
      'HIP 33386',
      'HIP 39748',
      'Chukchan',
      'Extention1',
      'Extention2',
      'Route Intersection',
      'Nowhere At All',
    ]);
  });

  test('resolves the source first and the name lookup after', () => {
    const asked: string[] = [];
    const set = convertAdamastor(extract(), (name: string) => {
      asked.push(name);
      return findPosition(name);
    });
    // The five points of the last two routes name systems of the source, so the lookup
    // is never asked for one of them.
    expect(asked).not.toContain('HIP 26176');
    expect(asked).not.toContain('HIP 22460');
    expect(asked).toContain('Chukchan');
    expect(set.lines[0]?.points[0]).toEqual([-63.5, -120.9, -137.2]);
  });

  test('drops a point that resolves nowhere and reports it by name', () => {
    const { lines, drops } = convertAdamastor(extract(), findPosition);
    // Route 1 loses its two placeholders and keeps its two real points.
    expect(lines[1]?.points).toHaveLength(2);
    expect(drops.filter((drop) => drop.point === 'Extention1')).toHaveLength(1);
  });

  test('drops a route left with fewer than two points, whole', () => {
    const { lines, drops } = convertAdamastor(extract(), findPosition);
    // Route 3 loses two of its three points, so one point is left and the route goes.
    expect(lines).toHaveLength(4);
    expect(drops).toContainEqual({ route: 3, point: null, reason: 'too-few-points' });
  });

  // A line that names a category takes that category's colour on the map, so it carries
  // no colour of its own. Only a line that names none keeps a colour.
  test('gives a line its route categories and the grey fallback where it has none', () => {
    const lines = convertAdamastor(extract(), findPosition).lines;
    expect(lines[0]?.primaryCategory).toBe('Adamastor Initial Route');
    expect(lines[0]?.secondaryCategories).toBeUndefined();
    expect(lines[0]?.color).toBeUndefined();
    // The route naming category `50` is the one the table does not hold.
    expect(lines[2]?.primaryCategory).toBeUndefined();
    expect(lines[2]?.color).toEqual(LINE_COLOUR_FALLBACK);
    expect(LINE_COLOUR_FALLBACK).toEqual([160, 160, 160]);
  });

  // The Adamastor source gives a route no name of its own, and one route names one
  // category, so the name of that category names the line.
  test('names a line with the name its source gives it', () => {
    const lines = convertAdamastor(extract(), findPosition).lines;
    expect(lines.map((line) => line.name)).toEqual([
      'Adamastor Initial Route',
      'Line Through Waypoints',
      undefined,
      "Hyford's Cache & D-2's LPs",
    ]);
  });

  test('writes a point of its own record set as a system reference', () => {
    const lines = convertAdamastor(extract(), findPosition).lines;
    expect(lines[3]?.points).toEqual([
      { system: 'HIP 26176' },
      // The source names this one without its case, and the reference carries the name
      // the record set holds.
      { system: 'Wregoe DK-R b4-1' },
      { system: 'HIP 22460' },
    ]);
    // Every other point is a coordinate.
    expect(lines[0]?.points.every((point) => Array.isArray(point))).toBe(true);
  });
});

describe('the route resolver', () => {
  /**
   * The smallest source the rule needs: one route of three points whose middle one names
   * no system, and one route of two points of which one names no system.
   */
  const SMALL = [
    'var canonnEd3d_small = {',
    '  systemsData: {',
    "    categories: { 'ACT I': { '101': { name: 'First Route', color: 'FF6666' } } },",
    '    systems: [',
    "      { 'name': 'Alpha', 'coords': { x: 1, y: 2, z: 3 }, 'cat': ['101'] },",
    "      { 'name': 'Beta', 'coords': { x: 4, y: 5, z: 6 }, 'cat': ['101'] },",
    '    ],',
    "    'routes': [",
    "      { cat: ['101'], 'points': [",
    "        { 's': 'Alpha' }, { 's': 'Nowhere At All' }, { 's': 'Beta' },",
    "      ], 'circle': false },",
    "      { cat: ['101'], 'points': [",
    "        { 's': 'Alpha' }, { 's': 'Nowhere Either' },",
    "      ], 'circle': false },",
    '    ],',
    '  },',
    '};',
  ].join('\n');

  test('drops a point it cannot resolve and a route that falls under two points', () => {
    const { lines, drops } = convertAdamastor(parseEd3dData(SMALL), () => null);

    expect(lines).toHaveLength(1);
    expect(lines[0]?.points).toEqual([{ system: 'Alpha' }, { system: 'Beta' }]);
    expect(drops).toEqual([
      { route: 0, point: 'Nowhere At All', reason: 'unknown-system' },
      { route: 1, point: 'Nowhere Either', reason: 'unknown-system' },
      { route: 1, point: null, reason: 'too-few-points' },
    ]);
  });
});

describe('the readers over the converted fixture', () => {
  test('take the records and resolve every line reference', () => {
    const converted = convertAdamastor(extract(), findPosition);
    const systems = createSystemSet();
    const categories = systems.addCategories(
      converted.categories as unknown as readonly CategoryInput[],
    );
    const added = systems.addSystems(converted.systems);
    // One table holds the categories of the records and of the shapes, as the map holds
    // them, so a line that names a route category resolves it.
    const shapes = createShapeSet((identity: string) => {
      const index = systems.indexOfIdentity(identity);
      const system: RealSystem | null = index < 0 ? null : systems.system(index);
      return system?.position ?? null;
    }, systems);
    const lines = shapes.addLines(converted.lines as unknown as readonly LineInput[]);

    expect(categories.rejected).toEqual([]);
    expect(added.rejected).toEqual([]);
    expect(lines.rejected).toEqual([]);
    expect(shapes.lineCount).toBe(converted.lines.length);
  });
});
