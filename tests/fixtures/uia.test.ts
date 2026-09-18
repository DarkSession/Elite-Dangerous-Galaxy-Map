// Holds the UIA conversion rules of `scripts/build-demo-systems.mjs` against a committed
// extract of the source. The test reads the extract and not the live source, so it runs
// on a clean checkout and reaches no network.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { createSystemSet } from '../../src/scene-data/real-systems';
import { createShapeSet } from '../../src/scene-data/shapes';
import type { CategoryInput } from '../../src/scene-data/real-systems';
import type { LineInput, SphereInput } from '../../src/scene-data/shapes';
import {
  convertUia,
  parseCsv,
  parseEd3dData,
  uiaHyperdictionSet,
  uiaWaypointRows,
  uiaWaypointSet,
  MODEL_BOUNDS,
  UIA_SPHERE_LISTS,
} from '../../scripts/build-demo-systems.mjs';

const source = readFileSync(
  fileURLToPath(new URL('./uia-extract.js', import.meta.url)),
  'utf8',
);

/** The waypoint table fixture. Its `Estimate` column reads `N N Y Y F N`. */
const waypointTable = JSON.parse(
  readFileSync(fileURLToPath(new URL('./uia-waypoints.json', import.meta.url)), 'utf8'),
) as unknown[][];

/** A waypoint table with no data, as UIA#9 of the source is. */
const placeholderTable = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('./uia-waypoints-placeholder.json', import.meta.url)),
    'utf8',
  ),
) as unknown[][];

/** The hyperdiction report fixture, in the shape of the source's own report file. */
const reportFile = readFileSync(
  fileURLToPath(new URL('./uia-hyperdictions.csv', import.meta.url)),
  'utf8',
);

/** The two files the source fetches at run time, as `convertUia` reads them. */
function extras(): {
  waypointTables: unknown[][][];
  hyperdictions: Record<string, string>[];
} {
  return {
    waypointTables: [waypointTable, placeholderTable],
    hyperdictions: parseCsv(reportFile) as Record<string, string>[],
  };
}

const expected = JSON.parse(
  readFileSync(fileURLToPath(new URL('./uia-demo-set.json', import.meta.url)), 'utf8'),
) as unknown;

/** The parsed extract. Each test reads it again, so no test writes it for another. */
function extract(): Record<string, unknown> {
  return parseEd3dData(source) as Record<string, unknown>;
}

describe('the parser of an ED3D source', () => {
  test('reads the literal past its comments, quotes and trailing commas', () => {
    const data = extract();
    expect(Object.keys(data)).toEqual([
      'categories',
      'systems',
      'routes',
      'puls',
      'pls',
      'hd_soi',
      'g_soi',
    ]);
    // The commented-out category group and the commented-out system are not in the
    // reading, and the live ones are.
    expect(Object.keys(data['categories'] as object)).toEqual([
      'Points of Interest',
      'Unidentified Interstellar Anomaly',
      'Hyperdictions',
    ]);
    expect(data['systems']).toHaveLength(5);
    expect(data['routes']).toHaveLength(0);
  });

  test('reads a number, a string and a nested object', () => {
    const first = (extract()['pls'] as Record<string, unknown>[])[0] as Record<
      string,
      unknown
    >;
    expect(first['radius']).toBe(514);
    expect(first['name']).toBe('Col 70 Sector');
    expect(first['coords']).toEqual([508.68359, -372.59375, -1090.87891]);
  });

  test('reads no statement of the file', () => {
    // The reader is a parser and not an evaluator: a source that gains a call cannot run
    // it, because nothing outside the `systemsData` literal reaches the reading.
    expect(() => parseEd3dData('var x = 1;')).toThrow('no systemsData');
  });
});

describe('the conversion of the UIA source', () => {
  test('gives the committed output over the committed extract', () => {
    const { drops, ...written } = convertUia(extract(), extras());
    // The one drop is the report pair that is 3,000 light years from every waypoint.
    expect(drops).toEqual([
      {
        route: 'Fixture Report Away:::Fixture Report Away Two',
        point: null,
        reason: 'no-uia',
      },
    ]);
    expect(written).toEqual(expected);
  });

  test('reads 23 systems and 11 categories', () => {
    const set = convertUia(extract(), extras());
    expect(set.systems).toHaveLength(23);
    expect(set.categories.map((category) => category.name)).toEqual([
      'Populated Systems',
      'Thargoid Systems',
      'Permit Locked Centers',
      'Permit Unlocked Centers',
      'Estimated Direction',
      'Recorded Route',
      'Estimated Route',
      'Lost Section',
      'All Hyperdictions',
      'Hostile',
      'UIA#1 Taranis',
    ]);
    // `init()` of the source adds `UIA#1` to `UIA#8`, so the source's own table holds
    // none of them. Only the one the fixture's reports name reaches the set, as the
    // Guardian Ruins conversion leaves an unused row out.
    expect(set.categories.map((category) => category.name)).not.toContain(
      'UIA#2 Leigong',
    );
  });

  test('reads the four sphere lists and gives each one its colour', () => {
    const set = convertUia(extract(), extras());
    expect(UIA_SPHERE_LISTS.map((list) => list.key)).toEqual([
      'pls',
      'puls',
      'hd_soi',
      'g_soi',
    ]);
    expect(set.spheres).toHaveLength(10);
    const byColour = new Map<string, number>();
    for (const sphere of set.spheres) {
      // Every sphere of this set carries its own colour, which the next assertion reads.
      const key = sphere.color?.join(',') ?? 'none';
      byColour.set(key, (byColour.get(key) ?? 0) + 1);
    }
    // The colours are the four materials of the source's own `finishMap`.
    expect([...byColour]).toEqual([
      ['51,179,255', 4],
      ['255,191,26', 3],
      ['51,102,0', 2],
      ['0,0,153', 1],
    ]);
  });

  test('carries the radius, the position and the name of a sphere', () => {
    const sphere = convertUia(extract(), extras()).spheres[0];
    expect(sphere).toEqual({
      position: [508.68359, -372.59375, -1090.87891],
      radius: 514,
      color: [51, 179, 255],
      name: 'Col 70 Sector',
      primaryCategory: 'Permit Locked Centers',
    });
  });

  // `formatHDs` gives the marker at the centre of a sphere the category of its list, and
  // the sphere takes that same category. The `g_soi` list gets no marker and no category.
  test('gives each sphere the marker category of its own list', () => {
    const set = convertUia(extract(), extras());
    const byCategory = new Map<string, number>();
    for (const sphere of set.spheres) {
      const key = sphere.primaryCategory ?? 'none';
      byCategory.set(key, (byCategory.get(key) ?? 0) + 1);
    }
    expect([...byCategory]).toEqual([
      ['Permit Locked Centers', 4],
      ['Permit Unlocked Centers', 3],
      ['Thargoid Systems', 2],
      ['none', 1],
    ]);
    // The sphere keeps its own colour and the category keeps the other. The two differ
    // on purpose: the source draws the shell with a material of its own and colours the
    // marker at its centre from the category table. A reader who makes the sphere take
    // its category's colour makes every permit-locked shell red.
    const blue = set.spheres.filter(
      (sphere) => sphere.primaryCategory === 'Permit Locked Centers',
    );
    expect(blue.every((sphere) => sphere.color?.join(',') === '51,179,255')).toBe(true);
    expect(
      set.categories.find((category) => category.name === 'Permit Locked Centers')
        ?.color,
    ).toEqual([255, 51, 51]);
  });

  // `formatHDs` pushes a marker at the centre of every `pls`, `puls` and `hd_soi` sphere
  // and none at the centre of a `g_soi` one.
  test('gives a marker to every sphere but the Gamma Velorum one', () => {
    const set = convertUia(extract(), extras());
    const names = new Set(set.systems.map((system) => system.name));
    expect(names.has('Col 70 Sector')).toBe(true);
    expect(names.has("Barnard's Loop Sector")).toBe(true);
    expect(names.has('Gamma Velorum')).toBe(false);
  });

  test('reads the empty routes list and builds the lines from the two files', () => {
    const set = convertUia(extract(), extras());
    expect(set.lines).toHaveLength(7);
    for (const line of set.lines) {
      for (const point of line.points) {
        expect(Array.isArray(point)).toBe(false);
      }
    }
  });

  // The shape list of the HUD shows the name of a line, and 983 lines all reading
  // `All Hyperdictions` would name nothing.
  test('names a line for itself and not for its category', () => {
    const set = convertUia(extract(), extras());
    const hyperdiction = set.lines.find(
      (line) => line.primaryCategory === 'UIA#1 Taranis',
    );
    expect(hyperdiction?.name).toBe('Fixture Waypoint B to Fixture Report Near');
    expect(hyperdiction?.secondaryCategories).toEqual(['All Hyperdictions']);
    const waypoint = set.lines.find(
      (line) => line.primaryCategory === 'Recorded Route',
    );
    expect(waypoint?.name).toBe('UIA#1 Recorded Route');
    // A line takes the colour of the category it names, so it carries none of its own.
    for (const line of set.lines) {
      expect(line.primaryCategory).not.toBeUndefined();
      expect(line.color).toBeUndefined();
    }
  });

  test('names the first category of a record as its primary one', () => {
    const system = convertUia(extract(), extras()).systems.find(
      (entry) => entry.name === 'HIP 22460',
    );
    expect(system?.primaryCategory).toBe('Thargoid Systems');
    expect(system?.secondaryCategories).toEqual(['Populated Systems']);
  });

  // One name is a waypoint and an end of a report, so the set holds one record of it and
  // that record carries the categories of both.
  test('holds one record of a name that two sources name', () => {
    const set = convertUia(extract(), extras());
    const held = set.systems.filter((entry) => entry.name === 'Fixture Waypoint A');
    expect(held).toHaveLength(1);
    expect(held[0].primaryCategory).toBe('Recorded Route');
    expect(held[0].secondaryCategories).toEqual([
      'UIA#1 Taranis',
      'All Hyperdictions',
      'Hostile',
    ]);
  });

  test('holds no markup in a description', () => {
    for (const system of convertUia(extract(), extras()).systems) {
      const description = system.description ?? '';
      expect(description.includes('<')).toBe(false);
      expect(description.includes('>')).toBe(false);
    }
  });
});

describe('the waypoint tables of the UIA source', () => {
  test('skips a table that names a placeholder', () => {
    expect(uiaWaypointRows(placeholderTable)).toEqual([]);
    expect(uiaWaypointRows(waypointTable)).toHaveLength(6);
  });

  // The fixture reads `N N Y Y F N`. A run of one letter is one line, and the join rules
  // of the source decide which row starts the next one.
  test('cuts the lines where the letter changes', () => {
    const built = uiaWaypointSet(uiaWaypointRows(waypointTable), 0);
    const routes = built.routes.map((route) => ({
      cat: route.cat[0],
      points: route.points.map((point) => point.s),
    }));
    expect(routes).toEqual([
      { cat: '101', points: ['Fixture Waypoint A', 'Fixture Waypoint B'] },
      {
        cat: '103',
        points: ['Fixture Waypoint D', 'Fixture Waypoint E', 'Fixture Waypoint F'],
      },
      {
        cat: '102',
        points: ['Fixture Waypoint B', 'Fixture Waypoint C', 'Fixture Waypoint D'],
      },
      {
        cat: '100',
        points: ['Fixture Waypoint A', 'extended mean direction of UIA#1'],
      },
    ]);
    // The last `N` row opens a line of its own, which holds one point and is dropped.
    expect(routes.filter((route) => route.points.length < 2)).toEqual([]);
  });

  test('gives each row the category of its letter', () => {
    const built = uiaWaypointSet(uiaWaypointRows(waypointTable), 0);
    expect(built.systems.map((system) => [system.name, system.cat[0]])).toEqual([
      ['Fixture Waypoint A', '101'],
      ['Fixture Waypoint B', '101'],
      ['Fixture Waypoint C', '102'],
      ['Fixture Waypoint D', '102'],
      ['Fixture Waypoint E', '103'],
      ['Fixture Waypoint F', '101'],
      ['extended mean direction of UIA#1', '100'],
    ]);
  });

  // The fixture runs along +x, so the mean step is +x and the direction line runs the
  // other way. It stops at the model bounds, because a record outside them is rejected.
  test('runs the direction line to the model bounds', () => {
    const built = uiaWaypointSet(uiaWaypointRows(waypointTable), 0);
    const extension = built.systems.at(-1);
    expect(extension?.name).toBe('extended mean direction of UIA#1');
    expect(extension?.coords.x).toBe(MODEL_BOUNDS.x[0]);
    expect(extension?.coords.y).toBe(0);
    expect(extension?.coords.z).toBe(-200);
  });

  // The source sums the step over two rows and adds nothing for the first two, so the sum
  // comes to `(c_n + c_n-1) - (c_1 + c_2)` and not to `c_n - c_1`. The table here bends at
  // the last row, where the two differ: the lagged sum is (70, 0, 40) and the direct one is
  // (40, 0, 40). The reader keeps the lag, because it draws the source's own line.
  test('keeps the one-row lag of the source in the mean step', () => {
    const bent = [
      waypointTable[0],
      ...[
        [0, 0, 0],
        [10, 0, 0],
        [20, 0, 0],
        [30, 0, 0],
        [40, 0, 0],
        [40, 0, 40],
      ].map((point, row) => {
        const line = new Array(15).fill('');
        line[0] = String(row);
        line[1] = `Bent Waypoint ${row}`;
        line[2] = String(point[0]);
        line[3] = String(point[1]);
        line[4] = String(point[2]);
        line[10] = 'N';
        return line;
      }),
    ];
    const built = uiaWaypointSet(uiaWaypointRows(bent), 0);
    const extension = built.systems.at(-1);
    expect(extension?.name).toBe('extended mean direction of UIA#1');
    // The line runs from (0, 0, 0) against the sum, so both parts are negative and their
    // ratio is that of the sum. 70 over 40 is the lagged sum; 40 over 40 is the direct one.
    const ratio = (extension?.coords.x ?? 0) / (extension?.coords.z ?? 1);
    expect(ratio).toBeCloseTo(70 / 40, 3);
    expect(extension?.coords.y).toBe(0);
  });
});

describe('the hyperdiction reports of the UIA source', () => {
  test('reads a quoted field with a comma decimal separator', () => {
    const rows = parseCsv(reportFile) as Record<string, string>[];
    expect(rows).toHaveLength(6);
    expect(rows[0]['System']).toBe('Fixture Waypoint B');
    expect(rows[0]['Sx']).toBe('140,0');
    const built = uiaHyperdictionSet(rows, [uiaWaypointRows(waypointTable)]);
    expect(built.systems[0]?.coords.x).toBe(140);
    expect(built.systems[0]?.coords.z).toBe(-200);
  });

  // One pair names a waypoint, one lies 10 light years from a waypoint, and one lies
  // 3,000 light years from every waypoint.
  test('drops a pair that is far from every waypoint', () => {
    const built = uiaHyperdictionSet(parseCsv(reportFile) as Record<string, string>[], [
      uiaWaypointRows(waypointTable),
    ]);
    const pairs = built.routes.map((route) => route.points.map((point) => point.s));
    expect(pairs).toEqual([
      ['Fixture Waypoint B', 'Fixture Report Near'],
      ['Fixture Report Close', 'Fixture Report Far Side'],
      ['Fixture Waypoint A', 'Fixture Report Repeat'],
    ]);
    expect(built.drops).toEqual([
      {
        route: 'Fixture Report Away:::Fixture Report Away Two',
        point: null,
        reason: 'no-uia',
      },
    ]);
  });

  // The fixture holds the same pair three times, and the last row of it reads `Y`.
  test('reads a repeated pair once and keeps its hostile flag', () => {
    const built = uiaHyperdictionSet(parseCsv(reportFile) as Record<string, string>[], [
      uiaWaypointRows(waypointTable),
    ]);
    const repeated = built.routes.filter(
      (route) => route.points[1]?.s === 'Fixture Report Repeat',
    );
    expect(repeated).toHaveLength(1);
    expect(repeated[0]?.cat).toEqual(['301', '299', '300']);
    const ends = built.systems.filter(
      (system) =>
        system.name === 'Fixture Waypoint A' || system.name === 'Fixture Report Repeat',
    );
    expect(ends).toHaveLength(2);
    for (const end of ends) expect(end.cat).toContain('300');
  });

  // The first row of a pair gives the description, so the commander of that row and the
  // date of it reach the record.
  test('names the commander and the date of a report', () => {
    const built = uiaHyperdictionSet(parseCsv(reportFile) as Record<string, string>[], [
      uiaWaypointRows(waypointTable),
    ]);
    expect(built.systems[0]?.infos).toBe(
      'CMDR Fixture One reported a hyperdiction from Fixture Waypoint B to ' +
        'Fixture Report Near on 2022-10-06.',
    );
  });
});

describe('the readers over the converted fixture', () => {
  test('take the records and the shapes whole', () => {
    const converted = convertUia(extract(), extras());
    const systems = createSystemSet();
    const categories = systems.addCategories(
      converted.categories as unknown as readonly CategoryInput[],
    );
    const added = systems.addSystems(converted.systems);
    // One table holds the categories of the records and of the shapes, as the map holds
    // them, so a shape that names a category of the set resolves it.
    const shapes = createShapeSet((identity: string) => {
      const index = systems.indexOfIdentity(identity);
      return index < 0 ? null : (systems.system(index)?.position ?? null);
    }, systems);
    const spheres = shapes.addSpheres(
      converted.spheres as unknown as readonly SphereInput[],
    );
    const lines = shapes.addLines(converted.lines as unknown as readonly LineInput[]);

    expect(categories.rejected).toEqual([]);
    expect(added.rejected).toEqual([]);
    expect(spheres.rejected).toEqual([]);
    expect(lines.rejected).toEqual([]);
    expect(shapes.sphereCount).toBe(converted.spheres.length);
  });
});
