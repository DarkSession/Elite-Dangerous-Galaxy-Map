import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { cameraPosition } from '../camera/projection';
import { createDefaultView, FIELD_OF_VIEW_DEGREES } from '../camera/view';
import {
  buildNebulaSet,
  NEBULA_MAX_RADIUS_LY,
  NEBULA_COVERED_AREA_BUDGET,
  nebulaCoveredArea,
  NEBULA_MIN_PIXELS,
  NEBULA_BUDGET_FADE_START,
  NEBULA_FLOOR_FADE_FULL,
  NEBULA_ZOOM_FAR_FULL,
  NEBULA_ZOOM_FAR_ZERO,
  NebulaError,
  nebulaBudgetFade,
  nebulaFloorFade,
  nebulaFocalPixels,
  nebulaZoomWeight,
  selectNebulae,
} from './nebulae';
import type { NebulaSet } from './nebulae';

const recordsPath = fileURLToPath(new URL('./nebulae.json', import.meta.url));
const volumeDir = fileURLToPath(new URL('../render/nebula-art/', import.meta.url));
const fixturePath = fileURLToPath(
  new URL('../../tests/fixtures/nebulae.json', import.meta.url),
);

interface NebulaFixture {
  records_sha256: string;
  records_bytes: number;
  record_count: number;
  volume_index_sha256: string;
  transfer_sha256: string;
  volume_files_sha256: Record<string, string>;
}

/** One entry of the volume index, which holds only what the map reads. */
interface VolumeEntry {
  name: string;
  density: { size: number };
  colour: { size: number };
  error: { per_axis: { x: number; y: number; z: number } };
}

interface VolumeIndex {
  assets: VolumeEntry[];
}

const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as NebulaFixture;
const recordBytes = readFileSync(recordsPath);
const volumeIndexBytes = readFileSync(`${volumeDir}nebula-volumes.json`);
const volumeIndex = JSON.parse(volumeIndexBytes.toString('utf8')) as VolumeIndex;
const parsed = JSON.parse(recordBytes.toString('utf8')) as unknown;
const set: NebulaSet = buildNebulaSet(parsed);

/** The canvas the browser tests use, in CSS pixels. */
const CANVAS_HEIGHT = 720;
const CANVAS_WIDTH = 1280;
const FOCAL = nebulaFocalPixels(CANVAS_HEIGHT, FIELD_OF_VIEW_DEGREES);

/** The camera of the default view, in game coordinates. */
function defaultCamera(distance: number): [number, number, number] {
  return cameraPosition({ ...createDefaultView(), distance });
}

/** A set of two records, built by hand. */
function pairSet(): NebulaSet {
  return buildNebulaSet({
    records: [
      [0, 0, 10000, 200, 0, 0, 0, 0, 'far'],
      [0, 0, 5000, 100, 1, 0, 0, 0, 'near'],
    ],
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the committed nebula records', () => {
  test('hold 358 records, with a radius, an asset and a finite position each', () => {
    expect(set.count).toBe(fixture.record_count);
    expect(set.count).toBe(358);
    for (let index = 0; index < set.count; index += 1) {
      const radius = set.radii[index] as number;
      expect(radius).toBeGreaterThan(0);
      expect(radius).toBeLessThanOrEqual(NEBULA_MAX_RADIUS_LY);
      const asset = set.assets[index] as number;
      expect(Number.isInteger(asset)).toBe(true);
      expect(asset).toBeGreaterThanOrEqual(0);
      for (let axis = 0; axis < 3; axis += 1) {
        expect(Number.isFinite(set.positions[index * 3 + axis] as number)).toBe(true);
        expect(Number.isFinite(set.rotations[index * 3 + axis] as number)).toBe(true);
      }
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
    expect(Object.keys(file)).toEqual(['records']);
    expect(file['count']).toBeUndefined();
    expect(file['fields']).toBeUndefined();
    expect(file['units']).toBeUndefined();
  });

  // The loader holds no asset count on purpose, so this is what pairs the two files.
  // A record naming an asset the set does not hold, or an asset no record draws, is a
  // set that does not match its records, and it is caught here rather than at runtime.
  test('every record names an asset the set holds, and every asset is named', () => {
    const named = new Set<number>();
    for (let index = 0; index < set.count; index += 1) {
      named.add(set.assets[index] as number);
    }
    expect(named.size).toBe(volumeIndex.assets.length);
    for (let asset = 0; asset < volumeIndex.assets.length; asset += 1) {
      expect(named.has(asset)).toBe(true);
    }
  });

  // The renderer builds the matrix. The file ships the three angles the art template
  // carries, so a correction to the convention needs no data regeneration.
  test('hold the raw angles of the five records that carry a rotation', () => {
    const rows = (parsed as { records: unknown[][] }).records;
    const rotated = rows.filter((row) => row.slice(5, 8).some((angle) => angle !== 0));
    expect(rotated).toHaveLength(5);
    for (const row of rows) {
      // Three angles, not a matrix: no row holds a nested array or a longer run.
      expect(row.length).toBeLessThanOrEqual(9);
      for (const field of row) expect(Array.isArray(field)).toBe(false);
      for (const angle of row.slice(5, 8)) {
        expect(typeof angle).toBe('number');
        expect(Number.isFinite(angle)).toBe(true);
        expect(Math.abs(angle as number)).toBeLessThan(2 * Math.PI + 1);
      }
    }
  });

  test('do not drift', () => {
    expect(createHash('sha256').update(recordBytes).digest('hex')).toBe(
      fixture.records_sha256,
    );
    expect(recordBytes.byteLength).toBe(fixture.records_bytes);
  });
});

describe('the committed nebula volumes', () => {
  // Every digest sits in the fixture and none of them sits in the index. The index is
  // downloaded by every host that asks for the nebulae and no runtime code reads a
  // digest, so 67 of them there would be 5,778 bytes on the wire for a check that runs
  // here. The fixture ships in no build.
  test('do not drift', () => {
    expect(createHash('sha256').update(volumeIndexBytes).digest('hex')).toBe(
      fixture.volume_index_sha256,
    );
    const wanted = fixture.volume_files_sha256;
    expect(Object.keys(wanted)).toHaveLength(volumeIndex.assets.length * 2);
    for (const asset of volumeIndex.assets) {
      for (const kind of ['density', 'colour'] as const) {
        const file = `${asset.name}-${kind}.ktx2`;
        const bytes = readFileSync(`${volumeDir}${file}`);
        expect(createHash('sha256').update(bytes).digest('hex'), file).toBe(
          wanted[file],
        );
      }
    }
    const transferBytes = readFileSync(`${volumeDir}transfer.bin`);
    expect(createHash('sha256').update(transferBytes).digest('hex')).toBe(
      fixture.transfer_sha256,
    );
    expect(transferBytes.byteLength).toBe(volumeIndex.assets.length * 256 * 4 * 4);
  });

  // The index holds what the map reads and nothing else. No path, no name from another
  // source and no spare total reaches the tree.
  test('the index carries no field the map does not read', () => {
    expect(Object.keys(volumeIndex)).toEqual(['assets']);
    for (const asset of volumeIndex.assets) {
      expect(Object.keys(asset).sort()).toEqual(['colour', 'density', 'error', 'name']);
      expect(Object.keys(asset.density)).toEqual(['size']);
      expect(Object.keys(asset.colour)).toEqual(['size']);
      expect(Object.keys(asset.error)).toEqual(['per_axis']);
      expect(Object.keys(asset.error.per_axis).sort()).toEqual(['x', 'y', 'z']);
    }
  });

  test("every asset name is the library's own", () => {
    const names = volumeIndex.assets.map((asset) => asset.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) {
      expect(name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(name).not.toMatch(/^[A-Za-z]+_[A-Za-z]+_\d\d/);
    }
  });

  // Two scenarios argue from these two assets by name. A wrong name would ship in
  // silence, so read the extremes from the data instead.
  test('names the two assets the step-rate and march scenarios argue from', () => {
    const bytes = readFileSync(`${volumeDir}transfer.bin`);
    const transfer = new Float32Array(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength / 4,
    );
    const extremes = volumeIndex.assets.map((asset, index) => {
      const table = transfer.subarray(index * 1024, (index + 1) * 1024);
      return { name: asset.name, low: Math.min(...table), high: Math.max(...table) };
    });
    const largest = extremes.reduce((a, b) => (b.high > a.high ? b : a));
    expect(largest.name).toBe('dark-02');
    expect(largest.high).toBeCloseTo(3066, 0);
    const smallest = extremes.reduce((a, b) => (b.low < a.low ? b : a));
    expect(smallest.name).toBe('cats-eye');
    expect(smallest.low).toBeCloseTo(-193.5, 1);
  });

  // Each asset is packed to a budget of 0.03 emission RMSE over peak on the worst of
  // three axes. This reads every axis of every asset, not the worst alone.
  test('the compaction error holds on every axis', () => {
    for (const asset of volumeIndex.assets) {
      for (const axis of ['x', 'y', 'z'] as const) {
        expect(asset.error.per_axis[axis]).toBeLessThanOrEqual(0.03);
      }
    }
  });
});

describe('building the set', () => {
  // The record shape is what tells a nebula record file from another file. The set
  // carries no name list and no version string, so this check is the whole refusal.
  test('refuses a file that is not a record set', () => {
    expect(() => buildNebulaSet(null)).toThrow(NebulaError);
    expect(() => buildNebulaSet({ tiles: [] })).toThrow(NebulaError);
    expect(() => buildNebulaSet({ records: [[0, 0, 0, 1, 0]] })).toThrow(NebulaError);
  });

  // The loader holds no asset count, so the only bound it can apply is the one that
  // needs no second source of truth. A unit test pairs the two committed files.
  test('refuses an asset index that is not a non-negative whole number', () => {
    for (const asset of [-1, 1.5, '0']) {
      expect(() => buildNebulaSet({ records: [[0, 0, 0, 1, asset, 0, 0, 0]] })).toThrow(
        NebulaError,
      );
    }
    expect(() =>
      buildNebulaSet({ records: [[0, 0, 0, 1, 9999, 0, 0, 0]] }),
    ).not.toThrow();
  });

  test('refuses a rotation that is not finite', () => {
    expect(() => buildNebulaSet({ records: [[0, 0, 0, 1, 0, 0, null, 0]] })).toThrow(
      NebulaError,
    );
  });

  test('refuses a radius of 0 and a radius above the largest', () => {
    for (const radius of [0, NEBULA_MAX_RADIUS_LY + 1]) {
      expect(() =>
        buildNebulaSet({
          records: [[0, 0, 0, radius, 0, 0, 0, 0]],
        }),
      ).toThrow(NebulaError);
    }
  });

  test('refuses a position that is not finite', () => {
    expect(() =>
      buildNebulaSet({
        records: [[0, null, 0, 1, 0, 0, 0, 0]],
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

  // A box can be entered, so nothing holds it back from the size the perspective gives
  // it. The fill cost is held by the covered-area budget instead of by a size cap.
  test('keeps growing as the camera comes toward a record', () => {
    const one = buildNebulaSet({ records: [[0, 0, 0, 200, 0, 0, 0, 0]] });
    let last = 0;
    for (const range of [10000, 5000, 1000, 400, 100, 10, 1]) {
      const result = selectNebulae(one, {
        camera: [0, 0, range],
        distance: 12000,
        focalPixels: FOCAL,
        canvasHeightCss: CANVAS_HEIGHT,
        canvasWidthCss: CANVAS_WIDTH,
      });
      const pixels = result.instances[0]?.pixels as number;
      expect(pixels).toBeGreaterThan(last);
      last = pixels;
    }
    // Far past either cap the sprite pass applied, at 400 and at 2,000 CSS pixels.
    expect(last).toBeGreaterThan(2000);
  });

  // The size rule itself does not change: a record of radius 200 draws 400 light years
  // across, so its apparent radius is the world radius over the range at every distance.
  test('holds the world size at every distance in the band', () => {
    for (const range of [400, 2000, 10000]) {
      const one = buildNebulaSet({ records: [[0, 0, range, 200, 0, 0, 0, 0]] });
      const result = selectNebulae(one, {
        camera: [0, 0, 0],
        distance: 12000,
        focalPixels: FOCAL,
        canvasHeightCss: CANVAS_HEIGHT,
        canvasWidthCss: CANVAS_WIDTH,
      });
      expect(result.instances[0]?.pixels).toBeCloseTo((FOCAL * 200) / range, 3);
    }
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
  const start = NEBULA_BUDGET_FADE_START * NEBULA_COVERED_AREA_BUDGET;

  test('gives 1 to every record while the budget is far from full', () => {
    expect(nebulaBudgetFade(0)).toBe(1);
    expect(nebulaBudgetFade(start)).toBe(1);
  });

  // The fade reaches 0 exactly where the budget stops keeping records, so the record
  // the scan stops on is one that would have drawn nothing.
  test('gives 0 at the budget itself', () => {
    expect(nebulaBudgetFade(NEBULA_COVERED_AREA_BUDGET)).toBe(0);
    expect(nebulaBudgetFade(2 * NEBULA_COVERED_AREA_BUDGET)).toBe(0);
  });

  test('falls smoothly over the last share of the budget', () => {
    const middle = nebulaBudgetFade((start + NEBULA_COVERED_AREA_BUDGET) / 2);
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
      canvasWidthCss: CANVAS_WIDTH,
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
      canvasWidthCss: CANVAS_WIDTH,
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
        canvasWidthCss: CANVAS_WIDTH,
      });
      expect(result.weight).toBe(1);
      expect(result.instances.length).toBeGreaterThan(0);
    }
  });

  /**
   * A set the covered-area budget cuts. The records stand in a line, so the nearest are
   * the largest, and all 400 together cover 9.33 screens against a budget of 4.
   */
  function crowdSet(): NebulaSet {
    const records: unknown[] = [];
    for (let index = 0; index < 400; index += 1) {
      records.push([0, 0, 100 + index * 5, 60, index % 33, 0, 0, 0]);
    }
    return buildNebulaSet({ records });
  }

  test('draws at most the covered-area budget, and takes the largest first', () => {
    const crowd = crowdSet();
    const result = selectNebulae(crowd, {
      camera: [0, 0, 0],
      distance: 12000,
      focalPixels: FOCAL,
      canvasHeightCss: CANVAS_HEIGHT,
      canvasWidthCss: CANVAS_WIDTH,
    });

    expect(result.coveredArea).toBeLessThanOrEqual(NEBULA_COVERED_AREA_BUDGET);
    expect(result.instances.length).toBeLessThan(result.aboveFloor);
    const smallestKept = Math.min(...result.instances.map((one) => one.pixels));
    expect(smallestKept).toBeGreaterThanOrEqual(NEBULA_MIN_PIXELS);
    // Everything the budget dropped is smaller than everything it kept. The records
    // stand in a line, so a record the budget dropped is one the result never names.
    const kept = new Set(result.instances.map((one) => one.index));
    let largestDropped = 0;
    for (let index = 0; index < crowd.count; index += 1) {
      if (kept.has(index)) continue;
      largestDropped = Math.max(largestDropped, (FOCAL * 60) / (100 + index * 5));
    }
    expect(largestDropped).toBeLessThan(smallestKept);
  });

  // The cap is the point. Without it one record the camera sits inside would cover
  // about 53,000 screens and drop every other record in the frame.
  test('counts a record the camera is inside as one screen, not as its disc', () => {
    expect(
      nebulaCoveredArea(187000, {
        canvasHeightCss: 1080,
        canvasWidthCss: 1920,
      }),
    ).toBe(1);
    // A small record counts as the disc its apparent radius gives.
    const screen = CANVAS_WIDTH * CANVAS_HEIGHT;
    expect(
      nebulaCoveredArea(100, {
        canvasHeightCss: CANVAS_HEIGHT,
        canvasWidthCss: CANVAS_WIDTH,
      }),
    ).toBeCloseTo((Math.PI * 100 * 100) / screen, 9);
  });

  // A camera at a record's centre holds the whole budget on its own, and the records
  // behind it are what the fade then takes out smoothly.
  test('a near view holds the budget, and drops nothing of the committed set', () => {
    const result = selectNebulae(set, {
      camera: [
        set.positions[0] as number,
        set.positions[1] as number,
        set.positions[2] as number,
      ],
      distance: 100,
      focalPixels: FOCAL,
      canvasHeightCss: CANVAS_HEIGHT,
      canvasWidthCss: CANVAS_WIDTH,
    });
    expect(result.coveredArea).toBeLessThanOrEqual(NEBULA_COVERED_AREA_BUDGET);
    expect(result.aboveFloor - result.instances.length).toBe(0);
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
        canvasWidthCss: (canvasHeightCss * 16) / 9,
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
    },
  );

  test('draws every record of the committed set that reaches the floor', () => {
    const distance = 12000;
    const result = selectNebulae(set, {
      camera: defaultCamera(distance),
      distance,
      focalPixels: FOCAL,
      canvasHeightCss: CANVAS_HEIGHT,
      canvasWidthCss: CANVAS_WIDTH,
    });
    // The floor is the bound this set meets, not the budget, so no record is cut and
    // no record can go out as the camera turns.
    expect(result.coveredArea).toBeLessThan(NEBULA_COVERED_AREA_BUDGET);
    expect(result.instances).toHaveLength(result.aboveFloor);
  });

  // The shader holds the range at 1 light year. A record of 0.1 light years, with the
  // camera half a light year from its centre, reads 124 pixels where the shader draws 62
  // if the selection divides by the true range.
  test('holds the range at 1 light year, as the shader does', () => {
    const small = buildNebulaSet({
      records: [[0, 0, 0.5, 0.1, 0, 0, 0, 0, 'small']],
    });
    const result = selectNebulae(small, {
      camera: [0, 0, 0],
      distance: 500,
      focalPixels: FOCAL,
      canvasHeightCss: CANVAS_HEIGHT,
      canvasWidthCss: CANVAS_WIDTH,
    });
    // The set holds the radius as a float32, so the two agree to five places, not more.
    expect(result.instances[0]?.pixels).toBeCloseTo(FOCAL * 0.1, 4);
  });

  test('leaves out a record below the size floor', () => {
    const tiny = buildNebulaSet({
      records: [[0, 0, 10000, 0.1, 0, 0, 0, 0]],
    });
    const result = selectNebulae(tiny, {
      camera: [0, 0, 0],
      distance: 12000,
      focalPixels: FOCAL,
      canvasHeightCss: CANVAS_HEIGHT,
      canvasWidthCss: CANVAS_WIDTH,
    });
    expect((FOCAL * 0.1) / 10000).toBeLessThan(NEBULA_MIN_PIXELS);
    expect(result.aboveFloor).toBe(0);
    expect(result.instances).toHaveLength(0);
  });

  // The spec's scenario **The selection does not order by range**. The pass adds the
  // emissions and multiplies the transmittances, so the frame does not read the draw
  // order and the selection does not sort by range.
  //
  // The two records of `pairSet` hold the same apparent size at different ranges: 200
  // light years of radius at 10,000 and 100 at 5,000. The pair below exchanges the two
  // ranges, and each record keeps its apparent size, so the size sort reads the same
  // two values and the order is the file's own either way.
  test('does not order the selected records by range', () => {
    const view = {
      camera: [0, 0, 0] as [number, number, number],
      distance: 12000,
      focalPixels: FOCAL,
      canvasHeightCss: CANVAS_HEIGHT,
      canvasWidthCss: CANVAS_WIDTH,
    };
    const exchanged = buildNebulaSet({
      records: [
        [0, 0, 5000, 100, 0, 0, 0, 0, 'far'],
        [0, 0, 10000, 200, 1, 0, 0, 0, 'near'],
      ],
    });
    const first = selectNebulae(pairSet(), view);
    const second = selectNebulae(exchanged, view);

    expect(first.instances).toHaveLength(2);
    expect(second.instances).toHaveLength(2);
    // The two records hold one apparent size, which is what makes the reading one of
    // the range alone.
    expect(first.instances[0]?.pixels).toBeCloseTo(
      first.instances[1]?.pixels as number,
      12,
    );
    // The ranges did change, so this reads two selections and not one twice.
    expect(first.instances[0]?.range).not.toBe(second.instances[0]?.range);
    // The order is the file's own, whichever record is the further one.
    expect(first.instances.map((one) => one.index)).toEqual([0, 1]);
    expect(second.instances.map((one) => one.index)).toEqual([0, 1]);
  });

  // The two fades a record can still take are the floor fade and the budget fade. The
  // camera-inside fade and the size fade are gone: a camera that flies into a nebula
  // sees the volume fill the view.
  test('carries the floor fade and the budget fade alone', () => {
    const one = buildNebulaSet({
      records: [[0, 0, 400, 200, 0, 0, 0, 0]],
    });
    const result = selectNebulae(one, {
      camera: [0, 0, 0],
      distance: 12000,
      focalPixels: FOCAL,
      canvasHeightCss: CANVAS_HEIGHT,
      canvasWidthCss: CANVAS_WIDTH,
    });
    const pixels = (FOCAL * 200) / 400;
    // A record well above the floor, with nothing dropped beside it, takes no fade at
    // all. The old size fade would have taken this one to 0.
    expect(pixels).toBeGreaterThan(NEBULA_MIN_PIXELS);
    expect(result.instances[0]?.fade).toBe(nebulaFloorFade(pixels));
    expect(result.instances[0]?.fade).toBe(1);
  });

  test('takes no fade from a record well above the floor', () => {
    const one = buildNebulaSet({
      records: [[0, 0, 5000, 200, 0, 0, 0, 0]],
    });
    const result = selectNebulae(one, {
      camera: [0, 0, 0],
      distance: 12000,
      focalPixels: FOCAL,
      canvasHeightCss: CANVAS_HEIGHT,
      canvasWidthCss: CANVAS_WIDTH,
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
    orbit = 6000,
  ): { worstEntry: number; worstStep: number } {
    const pitch = (35 * Math.PI) / 180;
    let worstEntry = 0;
    let worstStep = 0;
    let before = new Map<number, number>();
    for (let degrees = 0; degrees <= 360; degrees += 1) {
      const yaw = (degrees * Math.PI) / 180;
      const distance = orbit;
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
        canvasWidthCss: CANVAS_WIDTH,
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
    for (let index = 0; index < 400; index += 1) {
      const angle = index * 2.39996;
      records.push([
        -4000 + Math.cos(angle) * (400 + index * 30),
        998 + Math.sin(angle * 1.7) * 300,
        12500 + Math.sin(angle) * (400 + index * 30),
        200,
        index % 33,
        0,
        0,
        0,
      ]);
    }
    const crowd = buildNebulaSet({
      records,
    });
    // The sweep orbits at 800 light years, close enough that the records near the
    // cursor are large and the covered area reaches the budget.
    const middle = selectNebulae(crowd, {
      camera: [-4000, 998, 11700],
      distance: 800,
      focalPixels: FOCAL,
      canvasHeightCss: CANVAS_HEIGHT,
      canvasWidthCss: CANVAS_WIDTH,
    });
    // The set reaches the budget, so the sweep reads the budget's cut and not the floor.
    expect(middle.instances.length).toBeLessThan(middle.aboveFloor);

    const worst = sweepYaw(crowd, [-4000, 998, 12500], 800);
    expect(worst.worstEntry).toBeLessThan(0.05);
    expect(worst.worstStep).toBeLessThan(0.2);
  });

  test('takes no budget fade from a record the budget dropped none beside', () => {
    const result = selectNebulae(pairSet(), {
      camera: [0, 0, 0],
      distance: 12000,
      focalPixels: FOCAL,
      canvasHeightCss: CANVAS_HEIGHT,
      canvasWidthCss: CANVAS_WIDTH,
    });
    expect(result.coveredArea).toBeLessThan(NEBULA_COVERED_AREA_BUDGET);
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
