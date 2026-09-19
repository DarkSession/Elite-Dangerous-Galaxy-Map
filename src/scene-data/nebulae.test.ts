import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { cameraPosition } from '../camera/projection';
import { createDefaultView, FIELD_OF_VIEW_DEGREES } from '../camera/view';
import {
  buildNebulaSet,
  drawnNebulaRadius,
  NEBULA_CAP_FRACTION,
  NEBULA_FADE_START_FRACTION,
  NEBULA_MAX_DRAWN,
  NEBULA_MAX_RADIUS_LY,
  NEBULA_MIN_PIXELS,
  NEBULA_SIZE_FADE_ZERO,
  NEBULA_TILE_COUNT,
  NEBULA_BUDGET_FADE_FULL,
  NEBULA_FLOOR_FADE_FULL,
  NEBULA_ZOOM_FAR_FULL,
  NEBULA_ZOOM_FAR_ZERO,
  NebulaError,
  nebulaBudgetFade,
  nebulaFloorFade,
  nebulaFocalPixels,
  nebulaInsideFade,
  nebulaSizeFade,
  nebulaZoomWeight,
  selectNebulae,
} from './nebulae';
import type { NebulaSet } from './nebulae';

const recordsPath = fileURLToPath(new URL('./nebulae.json', import.meta.url));
const atlasPath = fileURLToPath(new URL('../render/nebula-art.webp', import.meta.url));
const fixturePath = fileURLToPath(
  new URL('../../tests/fixtures/nebulae.json', import.meta.url),
);

interface NebulaFixture {
  records_sha256: string;
  records_bytes: number;
  record_count: number;
  tile_count: number;
  atlas_sha256: string;
  atlas_bytes: number;
}

const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as NebulaFixture;
const recordBytes = readFileSync(recordsPath);
const atlasBytes = readFileSync(atlasPath);
const parsed = JSON.parse(recordBytes.toString('utf8')) as unknown;
const set: NebulaSet = buildNebulaSet(parsed);

/** The canvas the browser tests use, in CSS pixels. */
const CANVAS_HEIGHT = 720;
const FOCAL = nebulaFocalPixels(CANVAS_HEIGHT, FIELD_OF_VIEW_DEGREES);

/** The camera of the default view, in game coordinates. */
function defaultCamera(distance: number): [number, number, number] {
  return cameraPosition({ ...createDefaultView(), distance });
}

/** A set of two records, built by hand. */
function pairSet(): NebulaSet {
  return buildNebulaSet({
    tiles: set.tileNames,
    records: [
      [0, 0, 10000, 200, 0, 'far'],
      [0, 0, 5000, 100, 1, 'near'],
    ],
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the committed nebula records', () => {
  test('hold 358 records, with a radius, a tile and a finite position each', () => {
    expect(set.count).toBe(fixture.record_count);
    expect(set.count).toBe(358);
    for (let index = 0; index < set.count; index += 1) {
      const radius = set.radii[index] as number;
      expect(radius).toBeGreaterThan(0);
      expect(radius).toBeLessThanOrEqual(NEBULA_MAX_RADIUS_LY);
      const tile = set.tiles[index] as number;
      expect(tile).toBeGreaterThanOrEqual(0);
      expect(tile).toBeLessThan(NEBULA_TILE_COUNT);
      expect(Number.isFinite(set.positions[index * 3] as number)).toBe(true);
      expect(Number.isFinite(set.positions[index * 3 + 1] as number)).toBe(true);
      expect(Number.isFinite(set.positions[index * 3 + 2] as number)).toBe(true);
    }
  });

  test('carry 190 names and leave the rest without one', () => {
    const named = set.names.filter((name) => name !== null).length;
    expect(named).toBe(190);
    for (const name of set.names) {
      // A record without a name omits the field; it never holds an empty one.
      if (name !== null) expect(name.length).toBeGreaterThan(0);
    }
  });

  test('hold no field a reader can derive', () => {
    const file = parsed as Record<string, unknown>;
    expect(Object.keys(file).sort()).toEqual(['records', 'tiles']);
    expect(file['count']).toBeUndefined();
    expect(file['fields']).toBeUndefined();
    expect(file['units']).toBeUndefined();
  });

  // The atlas holds 34 tiles, and every record names one of them. A tile no record
  // names is art the map can never draw; a record whose tile is outside the atlas is a
  // record the map cannot draw.
  test('name every one of the 34 tiles, and every record names one', () => {
    const named = new Set<number>();
    for (let index = 0; index < set.count; index += 1) {
      named.add(set.tiles[index] as number);
    }
    expect(named.size).toBe(NEBULA_TILE_COUNT);
    expect(set.tileNames).toHaveLength(NEBULA_TILE_COUNT);
    for (let tile = 0; tile < NEBULA_TILE_COUNT; tile += 1) {
      expect(named.has(tile)).toBe(true);
      expect((set.tileNames[tile] as string).length).toBeGreaterThan(0);
    }
  });

  test('do not drift', () => {
    expect(createHash('sha256').update(recordBytes).digest('hex')).toBe(
      fixture.records_sha256,
    );
    expect(recordBytes.byteLength).toBe(fixture.records_bytes);
  });
});

describe('the committed nebula atlas', () => {
  test('does not drift', () => {
    expect(createHash('sha256').update(atlasBytes).digest('hex')).toBe(
      fixture.atlas_sha256,
    );
    expect(atlasBytes.byteLength).toBe(fixture.atlas_bytes);
  });

  // The atlas is one fetch, beside the map and not in the entry chunk, so the bound is
  // what a first paint can carry rather than what a module may hold. 2 MiB covers a
  // pack of 34 tiles of 256 texels with the alpha stored losslessly.
  test('is at most 2 MiB on disk', () => {
    expect(atlasBytes.byteLength).toBeLessThanOrEqual(2 * 1024 * 1024);
  });

  // The file is a RIFF WebP. The header check is what a unit test in Node can hold:
  // Node decodes no WebP, so the browser suite reads the texels.
  test('is a WebP file', () => {
    expect(atlasBytes.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(atlasBytes.subarray(8, 12).toString('ascii')).toBe('WEBP');
  });
});

describe('building the set', () => {
  // The tile count is what tells a nebula record file from another file. The set
  // carries no version string, so this check is the one that refuses a wrong file.
  test('refuses a file that names the wrong number of tiles', () => {
    expect(() => buildNebulaSet({ tiles: [], records: [] })).toThrow(NebulaError);
    expect(() => buildNebulaSet({ records: [] })).toThrow(NebulaError);
  });

  test('refuses a tile index outside the atlas', () => {
    expect(() =>
      buildNebulaSet({
        tiles: set.tileNames,
        records: [[0, 0, 0, 1, NEBULA_TILE_COUNT]],
      }),
    ).toThrow(NebulaError);
  });

  test('refuses a radius of 0 and a radius above the largest', () => {
    for (const radius of [0, NEBULA_MAX_RADIUS_LY + 1]) {
      expect(() =>
        buildNebulaSet({
          tiles: set.tileNames,
          records: [[0, 0, 0, radius, 0]],
        }),
      ).toThrow(NebulaError);
    }
  });

  test('refuses a position that is not finite', () => {
    expect(() =>
      buildNebulaSet({
        tiles: set.tileNames,
        records: [[0, null, 0, 1, 0]],
      }),
    ).toThrow(NebulaError);
  });
});

describe('the apparent size', () => {
  test('follows the record, so two nebulae of the same ratio read the same', () => {
    const big = (FOCAL * 200) / 10000;
    const small = (FOCAL * 100) / 5000;
    expect(Math.abs(big - small) / big).toBeLessThan(1e-3);
  });

  // The cap holds the fill cost alone. It sits at the size the fade has already taken
  // to 0, so a sprite the viewer can see keeps the size the perspective gives it.
  test('caps one sprite where the size fade is already 0', () => {
    expect(NEBULA_CAP_FRACTION * CANVAS_HEIGHT).toBe(540);
    expect(drawnNebulaRadius(2000, CANVAS_HEIGHT)).toBe(540);
    expect(nebulaSizeFade(540, CANVAS_HEIGHT)).toBe(0);
    // Every sprite below the cap draws at the size the perspective gives it, which
    // includes every size the fade still lets through.
    expect(drawnNebulaRadius(20, CANVAS_HEIGHT)).toBe(20);
    expect(drawnNebulaRadius(400, CANVAS_HEIGHT)).toBe(400);
  });
});

describe('the zoom band', () => {
  test('is 1 from the closest zoom to 12,000 light years', () => {
    expect(nebulaZoomWeight(10)).toBe(1);
    expect(nebulaZoomWeight(500)).toBe(1);
    expect(nebulaZoomWeight(2000)).toBe(1);
    expect(nebulaZoomWeight(6000)).toBe(1);
    expect(nebulaZoomWeight(NEBULA_ZOOM_FAR_FULL)).toBe(1);
  });

  test('is 0 at and above 20,000 light years', () => {
    expect(nebulaZoomWeight(NEBULA_ZOOM_FAR_ZERO)).toBe(0);
    expect(nebulaZoomWeight(30000)).toBe(0);
    expect(nebulaZoomWeight(60000)).toBe(0);
  });

  test('moves smoothly across the far end', () => {
    const far = nebulaZoomWeight(16000);
    expect(far).toBeGreaterThan(0);
    expect(far).toBeLessThan(1);
  });
});

describe('the size fade', () => {
  const start = NEBULA_FADE_START_FRACTION * CANVAS_HEIGHT;

  test('is 1 up to a quarter of the canvas height and 0 at three times it', () => {
    expect(start).toBe(180);
    expect(nebulaSizeFade(20, CANVAS_HEIGHT)).toBe(1);
    expect(nebulaSizeFade(start, CANVAS_HEIGHT)).toBe(1);
    expect(nebulaSizeFade(NEBULA_SIZE_FADE_ZERO * start, CANVAS_HEIGHT)).toBe(0);
    expect(nebulaSizeFade(10000, CANVAS_HEIGHT)).toBe(0);
  });

  test('moves smoothly between the start and three times it', () => {
    const half = nebulaSizeFade(2 * start, CANVAS_HEIGHT);
    expect(half).toBeGreaterThan(0);
    expect(half).toBeLessThan(1);
  });

  test('follows the canvas, so the fade reads the same share of the frame', () => {
    expect(nebulaSizeFade(2 * start, CANVAS_HEIGHT)).toBeCloseTo(
      nebulaSizeFade(4 * start, 2 * CANVAS_HEIGHT),
      12,
    );
  });
});

describe('the camera-inside fade', () => {
  test('is 0 at the centre of the record and 1 at three radii', () => {
    expect(nebulaInsideFade(0, 200)).toBe(0);
    expect(nebulaInsideFade(200, 200)).toBe(0);
    expect(nebulaInsideFade(600, 200)).toBe(1);
    expect(nebulaInsideFade(10000, 200)).toBe(1);
  });

  test('moves smoothly between one radius and three', () => {
    const half = nebulaInsideFade(400, 200);
    expect(half).toBeGreaterThan(0);
    expect(half).toBeLessThan(1);
  });
});

describe('the floor fade', () => {
  test('gives 0 at the floor and 1 at twice the floor', () => {
    expect(nebulaFloorFade(NEBULA_MIN_PIXELS)).toBe(0);
    expect(nebulaFloorFade(NEBULA_FLOOR_FADE_FULL * NEBULA_MIN_PIXELS)).toBe(1);
    expect(nebulaFloorFade(100)).toBe(1);
  });

  test('rises smoothly across the band', () => {
    const middle = nebulaFloorFade(1.5 * NEBULA_MIN_PIXELS);
    expect(middle).toBeGreaterThan(0);
    expect(middle).toBeLessThan(1);
  });
});

describe('the budget fade', () => {
  test('gives 1 to every record when the budget dropped none', () => {
    expect(nebulaBudgetFade(2, 0)).toBe(1);
    expect(nebulaBudgetFade(200, 0)).toBe(1);
  });

  test('gives 0 at the cut and 1 a quarter above it', () => {
    expect(nebulaBudgetFade(8, 8)).toBe(0);
    expect(nebulaBudgetFade(NEBULA_BUDGET_FADE_FULL * 8, 8)).toBe(1);
  });

  test('rises smoothly between the cut and full weight', () => {
    const middle = nebulaBudgetFade(9, 8);
    expect(middle).toBeGreaterThan(0);
    expect(middle).toBeLessThan(1);
  });
});

describe('the selection', () => {
  // The far end of the band, and not the size floor, is what keeps the nebulae out of
  // the far view: the floor still admits the largest record at the default view.
  test('draws nothing at the default view, where the floor still admits a record', () => {
    const result = selectNebulae(set, {
      camera: defaultCamera(60000),
      distance: 60000,
      focalPixels: FOCAL,
      canvasHeightCss: CANVAS_HEIGHT,
    });
    expect(result.aboveFloor).toBe(1);
    expect(result.weight).toBe(0);
    expect(result.instances).toHaveLength(0);
  });

  // The near end of the band is open: a close view is where a record is large enough
  // to read as more than a dot.
  test('draws at the close view, where the zoom weight is full', () => {
    const result = selectNebulae(set, {
      camera: defaultCamera(2000),
      distance: 2000,
      focalPixels: FOCAL,
      canvasHeightCss: CANVAS_HEIGHT,
    });
    expect(result.weight).toBe(1);
    expect(result.instances.length).toBeGreaterThan(0);
  });

  test('draws in full from the closest zoom to the far edge', () => {
    for (const distance of [10, NEBULA_ZOOM_FAR_FULL]) {
      const result = selectNebulae(set, {
        camera: defaultCamera(distance),
        distance,
        focalPixels: FOCAL,
        canvasHeightCss: CANVAS_HEIGHT,
      });
      expect(result.weight).toBe(1);
      expect(result.instances.length).toBeGreaterThan(0);
    }
  });

  test('draws at most the budget, and takes the largest first', () => {
    // The committed set never reaches the budget, so this builds one that does. The
    // records stand in a line, so the nearest are the largest.
    const records: unknown[] = [];
    for (let index = 0; index < NEBULA_MAX_DRAWN + 40; index += 1) {
      records.push([0, 0, 2000 + index * 20, 60, index % NEBULA_TILE_COUNT]);
    }
    const crowd = buildNebulaSet({
      tiles: set.tileNames,
      records,
    });
    const distance = 12000;
    const result = selectNebulae(crowd, {
      camera: [0, 0, 0],
      distance,
      focalPixels: FOCAL,
      canvasHeightCss: CANVAS_HEIGHT,
    });
    expect(result.aboveFloor).toBeGreaterThan(NEBULA_MAX_DRAWN);
    expect(result.instances).toHaveLength(NEBULA_MAX_DRAWN);
    const smallestKept = Math.min(...result.instances.map((one) => one.pixels));
    expect(smallestKept).toBeGreaterThanOrEqual(NEBULA_MIN_PIXELS);
    const dropped = result.aboveFloor - result.instances.length;
    expect(dropped).toBe(40);
    // Everything the budget dropped is smaller than everything it kept. The records
    // stand in a line, so a record the budget dropped is one the result never names.
    const kept = new Set(result.instances.map((one) => one.index));
    let largestDropped = 0;
    for (let index = 0; index < crowd.count; index += 1) {
      if (kept.has(index)) continue;
      const range = 2000 + index * 20;
      largestDropped = Math.max(largestDropped, (FOCAL * 60) / range);
    }
    expect(largestDropped).toBeLessThan(smallestKept);
  });

  /**
   * The largest number of records the size floor lets through, over a sweep of camera
   * positions: one at each record, a 1,000 light year grid over the disc, and a 100
   * light year grid over the core.
   */
  function worstAboveFloor(canvasHeightCss: number): number {
    const focal = nebulaFocalPixels(canvasHeightCss, FIELD_OF_VIEW_DEGREES);
    const spots: [number, number, number][] = [];
    for (let index = 0; index < set.count; index += 1) {
      const [x, y, z] = set.record(index).position;
      spots.push([x, y, z]);
    }
    for (let x = -25000; x <= 25000; x += 1000) {
      for (const y of [-2000, -500, 0, 500, 2000]) {
        for (let z = -15000; z <= 40000; z += 1000) spots.push([x, y, z]);
      }
    }
    for (let x = -3000; x <= 3000; x += 100) {
      for (const y of [-300, 0, 300]) {
        for (let z = -3000; z <= 3000; z += 100) spots.push([x, y, z]);
      }
    }
    let worst = 0;
    for (const camera of spots) {
      const result = selectNebulae(set, {
        camera,
        distance: 6000,
        focalPixels: focal,
        canvasHeightCss,
      });
      worst = Math.max(worst, result.aboveFloor);
    }
    return worst;
  }

  // The scale the budget is set against. The floor is the bound this file meets, so the
  // budget must stay above what the floor lets through, or its cut lands on the screen
  // and a record goes out as the camera turns.
  test.each([
    [1080, 184],
    [2160, 225],
  ])(
    'on a canvas of %i CSS pixels, lets at most %i records through the floor',
    (height, most) => {
      const worst = worstAboveFloor(height);
      expect(worst).toBe(most);
      expect(worst).toBeLessThan(NEBULA_MAX_DRAWN);
    },
  );

  test('draws every record of the committed set that reaches the floor', () => {
    const distance = 12000;
    const result = selectNebulae(set, {
      camera: defaultCamera(distance),
      distance,
      focalPixels: FOCAL,
      canvasHeightCss: CANVAS_HEIGHT,
    });
    // The floor is the bound this set meets, not the budget, so no record is cut and
    // no record can go out as the camera turns.
    expect(result.aboveFloor).toBeLessThan(NEBULA_MAX_DRAWN);
    expect(result.instances).toHaveLength(result.aboveFloor);
  });

  // The shader holds the range at 1 light year. A record of 0.1 light years, with the
  // camera half a light year from its centre, reads 124 pixels where the shader draws 62
  // if the selection divides by the true range.
  test('holds the range at 1 light year, as the shader does', () => {
    const small = buildNebulaSet({
      tiles: set.tileNames,
      records: [[0, 0, 0.5, 0.1, 0, 'small']],
    });
    const result = selectNebulae(small, {
      camera: [0, 0, 0],
      distance: 500,
      focalPixels: FOCAL,
      canvasHeightCss: CANVAS_HEIGHT,
    });
    // The set holds the radius as a float32, so the two agree to five places, not more.
    expect(result.instances[0]?.pixels).toBeCloseTo(FOCAL * 0.1, 4);
  });

  test('leaves out a record below the size floor', () => {
    const tiny = buildNebulaSet({
      tiles: set.tileNames,
      records: [[0, 0, 10000, 0.1, 0]],
    });
    const result = selectNebulae(tiny, {
      camera: [0, 0, 0],
      distance: 12000,
      focalPixels: FOCAL,
      canvasHeightCss: CANVAS_HEIGHT,
    });
    expect((FOCAL * 0.1) / 10000).toBeLessThan(NEBULA_MIN_PIXELS);
    expect(result.aboveFloor).toBe(0);
    expect(result.instances).toHaveLength(0);
  });

  // Source-over depends on the order, so the pass draws from the furthest to the
  // nearest. The input order of this pair is deliberately the wrong way round.
  test('gives the selected records furthest first', () => {
    const result = selectNebulae(pairSet(), {
      camera: [0, 0, 0],
      distance: 12000,
      focalPixels: FOCAL,
      canvasHeightCss: CANVAS_HEIGHT,
    });
    expect(result.instances).toHaveLength(2);
    expect(result.instances[0]?.range).toBeGreaterThan(
      result.instances[1]?.range as number,
    );
    expect(result.instances[0]?.index).toBe(0);
  });

  test('carries both fades of each record, multiplied', () => {
    const one = buildNebulaSet({
      tiles: set.tileNames,
      records: [[0, 0, 400, 200, 0]],
    });
    const result = selectNebulae(one, {
      camera: [0, 0, 0],
      distance: 12000,
      focalPixels: FOCAL,
      canvasHeightCss: CANVAS_HEIGHT,
    });
    const pixels = (FOCAL * 200) / 400;
    expect(result.instances[0]?.fade).toBe(
      nebulaInsideFade(400, 200) * nebulaSizeFade(pixels, CANVAS_HEIGHT),
    );
    expect(result.instances[0]?.fade).toBeLessThan(1);
    expect(result.instances[0]?.fade).toBeGreaterThan(0);
  });

  // A record far enough away to be small takes neither fade.
  test('takes no fade from a record that draws under the cap', () => {
    const one = buildNebulaSet({
      tiles: set.tileNames,
      records: [[0, 0, 5000, 200, 0]],
    });
    const result = selectNebulae(one, {
      camera: [0, 0, 0],
      distance: 12000,
      focalPixels: FOCAL,
      canvasHeightCss: CANVAS_HEIGHT,
    });
    expect(result.instances[0]?.fade).toBe(1);
  });
  /**
   * Turns the camera through 360 degrees over one set and reads the fades. It gives
   * back the largest fade a record enters or leaves the frame with, and the largest
   * step one record's fade takes across one degree.
   */
  function sweepYaw(
    over: NebulaSet,
    cursor: [number, number, number],
  ): { worstEntry: number; worstStep: number } {
    const pitch = (35 * Math.PI) / 180;
    let worstEntry = 0;
    let worstStep = 0;
    let before = new Map<number, number>();
    for (let degrees = 0; degrees <= 360; degrees += 1) {
      const yaw = (degrees * Math.PI) / 180;
      const distance = 6000;
      const camera: [number, number, number] = [
        cursor[0] + Math.cos(pitch) * Math.sin(yaw) * distance,
        cursor[1] + Math.sin(pitch) * distance,
        cursor[2] - Math.cos(pitch) * Math.cos(yaw) * distance,
      ];
      const result = selectNebulae(over, {
        camera,
        distance,
        focalPixels: FOCAL,
        canvasHeightCss: CANVAS_HEIGHT,
      });
      const now = new Map(result.instances.map((one) => [one.index, one.fade]));
      if (degrees > 0) {
        for (const [index, fade] of now) {
          worstStep = Math.max(worstStep, Math.abs(fade - (before.get(index) ?? 0)));
          if (!before.has(index)) worstEntry = Math.max(worstEntry, fade);
        }
        for (const [index, fade] of before) {
          if (!now.has(index)) worstEntry = Math.max(worstEntry, fade);
        }
      }
      before = now;
    }
    return { worstEntry, worstStep };
  }

  // The two views a reader reported a nebula going out at. Both sit near the core,
  // where the most records are above the floor.
  const REPORTED: [number, number, number][] = [
    [-4000, 998, 12500],
    [-4813, 583, 10617],
  ];

  test.each(REPORTED)('lets no record leave the frame at %s', (x, y, z) => {
    const worst = sweepYaw(set, [x, y, z]);
    expect(worst.worstEntry).toBeLessThan(0.05);
    expect(worst.worstStep).toBeLessThan(0.2);
  });

  // A record of a steady apparent size still crosses the budget's cut as the camera
  // turns, because the cut moves with everything else in the frame. The committed set
  // stays under the budget, so this crowds one to reach the cut.
  test('lets no record enter or leave the frame with weight at the budget', () => {
    const records: unknown[] = [];
    for (let index = 0; index < NEBULA_MAX_DRAWN + 60; index += 1) {
      const angle = index * 2.39996;
      records.push([
        -4000 + Math.cos(angle) * (400 + index * 30),
        998 + Math.sin(angle * 1.7) * 300,
        12500 + Math.sin(angle) * (400 + index * 30),
        60,
        index % NEBULA_TILE_COUNT,
      ]);
    }
    const crowd = buildNebulaSet({
      tiles: set.tileNames,
      records,
    });
    const middle = selectNebulae(crowd, {
      camera: [-4000, 998, 6500],
      distance: 6000,
      focalPixels: FOCAL,
      canvasHeightCss: CANVAS_HEIGHT,
    });
    // The set reaches the budget, so the sweep reads the budget's cut and not the floor.
    expect(middle.aboveFloor).toBeGreaterThan(NEBULA_MAX_DRAWN);

    const worst = sweepYaw(crowd, [-4000, 998, 12500]);
    expect(worst.worstEntry).toBeLessThan(0.05);
    expect(worst.worstStep).toBeLessThan(0.2);
  });

  test('takes no budget fade from a record the budget dropped none beside', () => {
    const result = selectNebulae(pairSet(), {
      camera: [0, 0, 0],
      distance: 12000,
      focalPixels: FOCAL,
      canvasHeightCss: CANVAS_HEIGHT,
    });
    expect(result.aboveFloor).toBeLessThanOrEqual(NEBULA_MAX_DRAWN);
    for (const one of result.instances) expect(one.fade).toBe(1);
  });
});

describe('the loader', () => {
  test('builds the set once and gives the same object back', async () => {
    vi.resetModules();
    let calls = 0;
    vi.stubGlobal('fetch', () => {
      calls += 1;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(parsed),
      } as unknown as Response);
    });
    const module = await import('./nebulae');
    const first = await module.loadNebulaSet();
    const second = await module.loadNebulaSet();
    expect(calls).toBe(1);
    expect(second).toBe(first);
    expect(first.count).toBe(358);
  });

  test('throws a typed error when the fetch fails', async () => {
    vi.resetModules();
    vi.stubGlobal('fetch', () =>
      Promise.resolve({ ok: false, status: 404 } as unknown as Response),
    );
    const module = await import('./nebulae');
    await expect(module.loadNebulaSet()).rejects.toBeInstanceOf(module.NebulaError);
  });

  test('throws a typed error when the asset does not parse', async () => {
    vi.resetModules();
    vi.stubGlobal('fetch', () =>
      Promise.resolve({
        ok: true,
        json: () => Promise.reject(new SyntaxError('bad')),
      } as unknown as Response),
    );
    const module = await import('./nebulae');
    await expect(module.loadNebulaSet()).rejects.toBeInstanceOf(module.NebulaError);
  });

  test('lets a later call try again after a failure', async () => {
    vi.resetModules();
    let calls = 0;
    vi.stubGlobal('fetch', () => {
      calls += 1;
      if (calls === 1)
        return Promise.resolve({ ok: false, status: 500 } as unknown as Response);
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(parsed),
      } as unknown as Response);
    });
    const module = await import('./nebulae');
    await expect(module.loadNebulaSet()).rejects.toBeInstanceOf(module.NebulaError);
    const built = await module.loadNebulaSet();
    expect(built.count).toBe(358);
  });
});
