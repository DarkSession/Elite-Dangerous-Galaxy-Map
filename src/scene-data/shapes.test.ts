import { describe, expect, test } from 'vitest';
import {
  createShapeSet,
  DEFAULT_LINE_WIDTH_CSS,
  DEFAULT_SPHERE_OPACITY,
  MAX_LINE_POINTS,
  MAX_LINES,
  MAX_SPHERES,
} from './shapes';
import type { LineInput, ShapeSet, SphereInput, SystemLookup } from './shapes';

/**
 * Casts a hand-made array to the input type. The reader checks every field at run time,
 * so a rejection test still passes a shape the type refuses, the way a host passes a file
 * it read from disk.
 */
function asSpheres(spheres: readonly unknown[]): readonly SphereInput[] {
  return spheres as readonly SphereInput[];
}

/** The same cast for a line array the type refuses. */
function asLines(lines: readonly unknown[]): readonly LineInput[] {
  return lines as readonly LineInput[];
}

/** A lookup over a table of identities, compared without case. */
function lookupOf(
  table: Readonly<Record<string, readonly [number, number, number]>>,
): SystemLookup {
  const folded = new Map<string, readonly [number, number, number]>();
  for (const [identity, position] of Object.entries(table)) {
    folded.set(identity.toLowerCase(), position);
  }
  return (identity) => folded.get(identity.toLowerCase()) ?? null;
}

/** A set whose lookup holds no system. */
function emptySet(): ShapeSet {
  return createShapeSet(() => null);
}

/** The reasons of a report, in the order the reader gave them. */
function reasons(rejected: readonly { index: number; reason: string }[]): string[] {
  return rejected.map((entry) => `${entry.index}:${entry.reason}`);
}

describe('the shape set', () => {
  test('reads a sphere and a line and keeps them', () => {
    const set = emptySet();
    const spheres = set.addSpheres([
      { position: [100, 0, 200], radius: 50, color: [255, 0, 0] },
    ]);
    const lines = set.addLines([
      {
        points: [
          [0, 0, 0],
          [100, 0, 0],
        ],
        color: [0, 255, 0],
      },
    ]);

    expect(spheres).toEqual({ added: 1, rejected: [] });
    expect(lines).toEqual({ added: 1, rejected: [] });
    expect(set.sphereCount).toBe(1);
    expect(set.lineCount).toBe(1);
    expect(set.getSphere(0)).toEqual({
      position: [100, 0, 200],
      radius: 50,
      color: [255, 0, 0],
      opacity: DEFAULT_SPHERE_OPACITY,
    });
    expect(set.getLine(0)).toEqual({
      points: [
        [0, 0, 0],
        [100, 0, 0],
      ],
      color: [0, 255, 0],
      width: DEFAULT_LINE_WIDTH_CSS,
      closed: false,
    });
  });

  test('gives back a copy and not the entry it holds', () => {
    const set = emptySet();
    set.addSpheres([{ position: [1, 2, 3], radius: 4, color: [5, 6, 7] }]);
    const copy = set.getSphere(0);
    (copy?.position as unknown as number[])[0] = 999;

    expect(set.getSphere(0)?.position[0]).toBe(1);
    expect(set.getSphere(1)).toBeNull();
    expect(set.getLine(0)).toBeNull();
  });

  test('keeps a name and drops one that is not a string', () => {
    const set = emptySet();
    set.addSpheres(
      asSpheres([
        { position: [0, 0, 0], radius: 1, color: [1, 2, 3], name: 'Pleiades' },
        { position: [0, 0, 0], radius: 1, color: [1, 2, 3], name: 4 },
        { position: [0, 0, 0], radius: 1, color: [1, 2, 3], name: '' },
      ]),
    );

    expect(set.sphereCount).toBe(3);
    expect(set.getSphere(0)?.name).toBe('Pleiades');
    expect(set.getSphere(1)?.name).toBeUndefined();
    expect(set.getSphere(2)?.name).toBeUndefined();
  });

  test('drops every field the shape does not name', () => {
    const set = emptySet();
    set.addSpheres(
      asSpheres([
        { position: [0, 0, 0], radius: 1, color: [1, 2, 3], glow: true, id: 7 },
      ]),
    );

    expect(Object.keys(set.getSphere(0) ?? {}).sort()).toEqual([
      'color',
      'opacity',
      'position',
      'radius',
    ]);
  });

  test('gives each shape fault its own reason', () => {
    const set = emptySet();
    const spheres = set.addSpheres(
      asSpheres([
        { position: [0, 0, 0], radius: 10, color: [1, 2, 3] },
        { position: [0, 0], radius: 10, color: [1, 2, 3] },
        { position: [0, 0, 0], radius: 0, color: [1, 2, 3] },
        { position: [0, 0, 0], radius: 10, color: [1, 2, 3], opacity: 2 },
      ]),
    );
    const lines = set.addLines(
      asLines([
        {
          points: [
            [0, 0, 0],
            [1, 0, 0],
          ],
          color: [1, 2, 3],
        },
        { points: [[0, 0, 0]], color: [1, 2, 3] },
        {
          points: [
            [0, 0, 0],
            [1, 0, 0],
          ],
          color: [1, 2, 3],
          width: 40,
        },
        {
          points: [
            [0, 0, 0],
            [1, 0, 0],
          ],
          color: [1, Number.NaN, 3],
        },
      ]),
    );

    expect(spheres.added).toBe(1);
    expect(reasons(spheres.rejected)).toEqual([
      '1:bad-position',
      '2:bad-radius',
      '3:bad-opacity',
    ]);
    expect(lines.added).toBe(1);
    expect(reasons(lines.rejected)).toEqual([
      '1:bad-points',
      '2:bad-width',
      '3:bad-color',
    ]);
  });

  test('reads a bad colour, a bad point and a missing system as their own reasons', () => {
    const set = createShapeSet(lookupOf({ Sol: [0, 0, 0] }));
    const spheres = set.addSpheres(
      asSpheres([{ position: [0, 0, 0], radius: 1, color: [1, 2, 300] }]),
    );
    const lines = set.addLines(
      asLines([
        { points: [{ system: 'Sol' }, 'Alioth'], color: [1, 2, 3] },
        { points: [{ system: 'Sol' }, { system: 'Nowhere' }], color: [1, 2, 3] },
      ]),
    );

    expect(reasons(spheres.rejected)).toEqual(['0:bad-color']);
    expect(reasons(lines.rejected)).toEqual(['0:bad-point', '1:unknown-system']);
    expect(set.lineCount).toBe(0);
  });

  test('rejects the excess over each capacity', () => {
    const set = emptySet();
    const sphere: SphereInput = { position: [0, 0, 0], radius: 1, color: [1, 2, 3] };
    const first = set.addSpheres(Array.from({ length: MAX_SPHERES }, () => sphere));
    const second = set.addSpheres([sphere, sphere]);

    expect(first.added).toBe(MAX_SPHERES);
    expect(second.added).toBe(0);
    expect(reasons(second.rejected)).toEqual(['0:over-capacity', '1:over-capacity']);

    // 64 lines of 1,024 points each come to 65,536, which is the whole point capacity.
    const points = Array.from(
      { length: MAX_LINE_POINTS / 64 },
      (_, step) => [step, 0, 0] as [number, number, number],
    );
    const filled = set.addLines(
      Array.from({ length: 64 }, () => ({ points, color: [1, 2, 3] as const })),
    );
    const over = set.addLines([
      {
        points: [
          [0, 0, 0],
          [1, 0, 0],
        ],
        color: [1, 2, 3],
      },
    ]);

    expect(filled.added).toBe(64);
    expect(set.linePointCount).toBe(MAX_LINE_POINTS);
    expect(over.added).toBe(0);
    expect(reasons(over.rejected)).toEqual(['0:over-point-capacity']);
  });

  test('rejects a line over the line capacity', () => {
    const set = emptySet();
    const line: LineInput = {
      points: [
        [0, 0, 0],
        [1, 0, 0],
      ],
      color: [1, 2, 3],
    };
    set.addLines(Array.from({ length: MAX_LINES }, () => line));
    const over = set.addLines([line]);

    expect(set.lineCount).toBe(MAX_LINES);
    expect(reasons(over.rejected)).toEqual(['0:over-capacity']);
  });

  test('clears both lists and releases the set', () => {
    const set = emptySet();
    set.addSpheres([{ position: [0, 0, 0], radius: 1, color: [1, 2, 3] }]);
    set.addLines([
      {
        points: [
          [0, 0, 0],
          [1, 0, 0],
        ],
        color: [1, 2, 3],
      },
    ]);
    set.clearShapes();

    expect(set.sphereCount).toBe(0);
    expect(set.lineCount).toBe(0);
    expect(set.linePointCount).toBe(0);

    set.addSpheres([{ position: [0, 0, 0], radius: 1, color: [1, 2, 3] }]);
    set.dispose();

    expect(set.sphereCount).toBe(0);
    expect(set.lineCount).toBe(0);
    expect(set.getSphere(0)).toBeNull();
  });

  test('raises the version on every change and not on a call that changed nothing', () => {
    const set = emptySet();
    const start = set.version;
    set.addSpheres([{ position: [0, 0, 0], radius: 1, color: [1, 2, 3] }]);
    const added = set.version;
    set.addSpheres(asSpheres([{ position: [0, 0], radius: 1, color: [1, 2, 3] }]));
    const rejectedOnly = set.version;
    set.clearShapes();
    const cleared = set.version;
    set.clearShapes();

    expect(added).toBeGreaterThan(start);
    expect(rejectedOnly).toBe(added);
    expect(cleared).toBeGreaterThan(added);
    expect(set.version).toBe(cleared);
  });
});

describe('a line point', () => {
  test('takes the position of the system a name points at, without case', () => {
    const set = createShapeSet(
      lookupOf({ Sol: [0, 0, 0], Alioth: [-33.65, 72.46, -20.65] }),
    );
    const report = set.addLines([
      { points: [{ system: 'Sol' }, { system: 'alioth' }], color: [1, 2, 3] },
    ]);

    expect(report.added).toBe(1);
    expect(set.getLine(0)?.points).toEqual([
      [0, 0, 0],
      [-33.65, 72.46, -20.65],
    ]);
  });

  test('mixes the two forms in one line', () => {
    const set = createShapeSet(lookupOf({ Sol: [0, 0, 0] }));
    const report = set.addLines([
      {
        points: [{ system: 'Sol' }, [100, 0, 0], { system: 'Sol' }],
        color: [1, 2, 3],
      },
    ]);

    expect(report.added).toBe(1);
    expect(set.getLine(0)?.points).toHaveLength(3);
  });

  test('takes an id64 as an identity', () => {
    const set = createShapeSet(lookupOf({ '10477373803': [10, 20, 30] }));
    const report = set.addLines([
      { points: [{ system: '10477373803' }, [0, 0, 0]], color: [1, 2, 3] },
    ]);

    expect(report.added).toBe(1);
    expect(set.getLine(0)?.points[0]).toEqual([10, 20, 30]);
  });

  test('holds the position the system had when the line went in', () => {
    let where: [number, number, number] = [0, 0, 0];
    const set = createShapeSet(() => where);
    set.addLines([{ points: [{ system: 'Sol' }, [1, 0, 0]], color: [1, 2, 3] }]);
    where = [500, 0, 0];

    expect(set.getLine(0)?.points[0]).toEqual([0, 0, 0]);
  });

  test('keeps two points at the same position', () => {
    const set = emptySet();
    const report = set.addLines([
      {
        points: [
          [5, 0, 5],
          [5, 0, 5],
        ],
        color: [1, 2, 3],
      },
    ]);

    expect(report.added).toBe(1);
    expect(set.getLine(0)?.points).toHaveLength(2);
    expect(set.linePointCount).toBe(2);
  });

  test('takes a closed line and drops a closed value that is not a boolean', () => {
    const set = emptySet();
    set.addLines(
      asLines([
        {
          points: [
            [0, 0, 0],
            [1, 0, 0],
          ],
          color: [1, 2, 3],
          closed: true,
        },
        {
          points: [
            [0, 0, 0],
            [1, 0, 0],
          ],
          color: [1, 2, 3],
          closed: 'yes',
        },
      ]),
    );

    expect(set.getLine(0)?.closed).toBe(true);
    expect(set.getLine(1)?.closed).toBe(false);
  });
});

describe('the read budget', () => {
  test('reads a full shape set in under 40 milliseconds', () => {
    const set = emptySet();
    const spheres: SphereInput[] = Array.from({ length: MAX_SPHERES }, (_, index) => ({
      position: [index, 0, index],
      radius: 10 + index,
      color: [255, 128, 0],
      opacity: 0.2,
      name: `Sphere ${index}`,
    }));
    // 4,096 lines whose points come to 65,536 is 16 points each, every one a coordinate.
    const perLine = MAX_LINE_POINTS / MAX_LINES;
    const lines: LineInput[] = Array.from({ length: MAX_LINES }, (_, index) => ({
      points: Array.from(
        { length: perLine },
        (_unused, step) => [index, 0, step] as [number, number, number],
      ),
      color: [0, 200, 255],
      width: 3,
      name: `Line ${index}`,
    }));

    const startMs = performance.now();
    const sphereReport = set.addSpheres(spheres);
    const lineReport = set.addLines(lines);
    const readMs = performance.now() - startMs;
    console.log('the shape set read', {
      spheres: sphereReport.added,
      lines: lineReport.added,
      points: set.linePointCount,
      readMs,
    });

    expect(sphereReport.added).toBe(MAX_SPHERES);
    expect(lineReport.added).toBe(MAX_LINES);
    expect(set.linePointCount).toBe(MAX_LINE_POINTS);
    expect(readMs).toBeLessThan(40);
  });
});
