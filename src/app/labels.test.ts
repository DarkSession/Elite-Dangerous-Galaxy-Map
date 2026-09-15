import { mat4 } from 'gl-matrix';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { View } from '../camera/view';
import {
  boxesOverlap,
  CANDIDATE_SHARE,
  CARRIED_BONUS,
  chooseLabels,
  fitSampleBuffers,
  filterAnchor,
  ANCHOR_MAX_PIXELS,
  ANCHOR_SHARE,
  HELD_SHARE,
  LABEL_INSET,
  labelCandidates,
  labelFade,
  MAX_LABELS,
  SAMPLE_SPACING,
  samplePointCount,
  sampleFrame,
} from './labels';
import type { AnchorPoint, FrameSamples, LabelMemory, PlanePoint } from './labels';
// The test builds the coarse grid the page gets from the region worker. The page
// never imports this module: it would pull the 199 KiB region lookup into the main
// bundle, which `tests/main-bundle.test.ts` holds the line against.
import { buildCoarseRegionGrid, fillRegionGrid } from '../scene-data/region-lines';
import { REGIONS } from '../scene-data/regions';
import type { Region } from '../scene-data/regions';
import type { CoarseRegionGrid } from '../scene-data/types';

const WIDE = { width: 1920, height: 1080 };
const VIEWPORT = { width: 1280, height: 720 };

function viewAt(distance: number, pitch = 35, yaw = 0): View {
  return { cursor: [0, 0, 0], distance, yaw, pitch };
}

/** A label size that grows with the name, so the tests need no browser layout. */
function measure(name: string): { width: number; height: number } {
  return { width: 12 + name.length * 9, height: 20 };
}

/** A region with the metadata the label rules never read, so the tests stay short. */
function regionOf(id: number, name: string): Region {
  return {
    id,
    name,
    area: 1000,
    bounds: { minX: -1000, maxX: 1000, minZ: -1000, maxZ: 1000 },
    centroid: [0, 0],
  };
}

/** A coarse grid over the model bounds that holds one id everywhere. */
function gridOf(id: number, size = 512, cell = 200): CoarseRegionGrid {
  const half = (size * cell) / 2;
  return {
    size,
    origin: [-half, -half],
    cell,
    ids: new Uint8Array(size * size).fill(id),
  };
}

/**
 * Samples built by hand, so a rule is read without a camera. The region under a point
 * between the samples reads as the region of the nearest sample, which is what the
 * coarse grid gives for a frame the sweep covers.
 */
function samplesOf(
  points: readonly { x: number; y: number; id: number }[],
): FrameSamples {
  return {
    count: points.length,
    points: points.length,
    x: Float64Array.from(points, (point) => point.x),
    y: Float64Array.from(points, (point) => point.y),
    planeX: Float64Array.from(points, (point) => point.x),
    planeZ: Float64Array.from(points, (point) => point.y),
    ids: Uint8Array.from(points, (point) => point.id),
    elapsedMs: 0,
    regionAtPlane(x: number, z: number): number {
      let best = 0;
      let range = Number.POSITIVE_INFINITY;
      for (const point of points) {
        const away = (point.x - x) ** 2 + (point.y - z) ** 2;
        if (away >= range) continue;
        range = away;
        best = point.id;
      }
      return best;
    },
    toScreen(x: number, z: number) {
      return { x, y: z };
    },
  };
}

/** The memory of one frame, as the overlay builds it for the next. */
function memoryOf(
  previous: readonly number[],
  anchors: readonly (readonly [number, { x: number; z: number }])[] = [],
): LabelMemory {
  return { previous: new Set(previous), anchors: new Map(anchors) };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the frame sweep', () => {
  test('reads about 2,000 screen points at 1920x1080', () => {
    const samples = sampleFrame(viewAt(500, 80), WIDE, gridOf(7));
    const columns = Math.ceil(WIDE.width / SAMPLE_SPACING);
    const rows = Math.ceil(WIDE.height / SAMPLE_SPACING);
    expect(samples.points).toBe(columns * rows);
    expect(samples.points).toBe(2040);
    expect(samples.points).toBeGreaterThan(1800);
    expect(samples.points).toBeLessThan(2200);
  });

  test('spaces the points about 32 CSS pixels apart', () => {
    const samples = sampleFrame(viewAt(500, 80), WIDE, gridOf(7));
    // The camera looks down at 80 degrees over a grid that covers the whole frame, so
    // every point lands and every column shows in the sample positions.
    expect(samples.count).toBe(samples.points);
    const columns = Array.from(new Set(Array.from(samples.x))).sort((a, b) => a - b);
    const rows = Array.from(new Set(Array.from(samples.y))).sort((a, b) => a - b);
    for (let index = 1; index < columns.length; index += 1) {
      expect((columns[index] as number) - (columns[index - 1] as number)).toBeCloseTo(
        SAMPLE_SPACING,
        6,
      );
    }
    for (let index = 1; index < rows.length; index += 1) {
      const step = (rows[index] as number) - (rows[index - 1] as number);
      expect(Math.abs(step - SAMPLE_SPACING)).toBeLessThan(1);
    }
  });

  test('inverts the view-projection matrix once for the whole sweep', () => {
    const invert = vi.spyOn(mat4, 'invert');
    const samples = sampleFrame(viewAt(500, 80), WIDE, gridOf(7));
    expect(samples.count).toBeGreaterThan(1000);
    expect(invert).toHaveBeenCalledTimes(1);
  });

  test('drops a point whose ray runs away from the plane', () => {
    // At a pitch of 5 degrees the top of the frame is above the horizon.
    const samples = sampleFrame(viewAt(500, 5), WIDE, gridOf(7));
    expect(samples.count).toBeGreaterThan(0);
    expect(samples.count).toBeLessThan(samples.points);
    expect(samples.x.length).toBe(samples.count);
    expect(samples.ids.length).toBe(samples.count);
  });

  test('fills the buffers it is given, so a frame allocates none', () => {
    const grid = gridOf(7);
    const pool = fitSampleBuffers(null, samplePointCount(WIDE));
    expect(samplePointCount(WIDE)).toBe(2040);
    const first = sampleFrame(viewAt(500, 80), WIDE, grid, pool);
    const second = sampleFrame(viewAt(500, 80), WIDE, grid, pool);
    // The readings are views on the buffers the caller holds, not on new arrays.
    expect(first.x.buffer).toBe(pool.x.buffer);
    expect(second.ids.buffer).toBe(pool.ids.buffer);
    expect(second.count).toBe(first.count);
    // A pool that already holds the points is handed back, so no frame allocates.
    expect(fitSampleBuffers(pool, samplePointCount(WIDE))).toBe(pool);
    // A larger viewport takes one allocation, and no frame after it.
    const wider = { width: 2560, height: 1440 };
    const grown = fitSampleBuffers(pool, samplePointCount(wider));
    expect(grown).not.toBe(pool);
    expect(fitSampleBuffers(grown, samplePointCount(wider))).toBe(grown);
  });

  test('allocates its own buffers when it is given none', () => {
    const samples = sampleFrame(viewAt(500, 80), WIDE, gridOf(7));
    expect(samples.count).toBeGreaterThan(1000);
    expect(samples.x.length).toBe(samples.count);
  });

  test('drops a point that lands outside the coarse grid', () => {
    // The grid covers 200 light years, and the frame at 5,000 light years is wider.
    const small = gridOf(7, 2, 100);
    const samples = sampleFrame(viewAt(5000, 80), WIDE, small);
    expect(samples.count).toBeGreaterThan(0);
    expect(samples.count).toBeLessThan(samples.points);
    for (const id of samples.ids) expect(id).toBe(7);
  });
});

describe('the candidate rule', () => {
  const regions = [
    regionOf(1, 'Region One'),
    regionOf(2, 'Region Two'),
    regionOf(3, 'Region Three'),
    regionOf(4, 'Region Four'),
  ];

  /** 200 samples: 196 of region 1, 3 of region 4, 1 of region 3. */
  function mixed(): FrameSamples {
    const points: { x: number; y: number; id: number }[] = [];
    for (let index = 0; index < 200; index += 1) {
      const id = index < 196 ? 1 : index < 199 ? 4 : 3;
      points.push({
        x: 100 + (index % 20) * 50,
        y: 100 + Math.floor(index / 20) * 25,
        id,
      });
    }
    return samplesOf(points);
  }

  test('takes a region that holds 1 percent of the landed samples', () => {
    const names = labelCandidates(mixed(), VIEWPORT, regions).map(
      (candidate) => candidate.name,
    );
    expect(CANDIDATE_SHARE).toBe(0.01);
    // Region 4 holds 3 of 200, which is 1.5 percent.
    expect(names).toContain('Region Four');
    // Region 3 holds 1 of 200, which is 0.5 percent.
    expect(names).not.toContain('Region Three');
  });

  test('never takes a region that holds no sample', () => {
    const names = labelCandidates(mixed(), VIEWPORT, regions).map(
      (candidate) => candidate.name,
    );
    expect(names).not.toContain('Region Two');
  });

  test('counts a sample on no region in the share but never names it', () => {
    // Half the samples fall on cells that hold no region, so region 1 holds 50
    // percent of the landed samples and no label reads the id 0.
    const points: { x: number; y: number; id: number }[] = [];
    for (let index = 0; index < 100; index += 1) {
      points.push({ x: 100 + index * 5, y: 200, id: index % 2 === 0 ? 1 : 0 });
    }
    const candidates = labelCandidates(samplesOf(points), VIEWPORT, regions);
    expect(candidates.map((candidate) => candidate.id)).toEqual([1]);
    expect(candidates[0]?.count).toBe(50);
  });

  test('places no label when nothing lands on the plane', () => {
    const empty = samplesOf([]);
    expect(labelCandidates(empty, VIEWPORT, regions)).toEqual([]);
    expect(chooseLabels(empty, VIEWPORT, measure, regions)).toEqual([]);
  });
});

describe('the label anchor', () => {
  const regions = [regionOf(1, 'Two Patches'), regionOf(2, 'Between Them')];

  /**
   * Region 1 shows as two separated patches on one row, and region 2 fills the gap
   * between them. This is the frame the mean alone gets wrong.
   */
  const patches = samplesOf([
    { x: 100, y: 360, id: 1 },
    { x: 150, y: 360, id: 1 },
    { x: 200, y: 360, id: 1 },
    { x: 600, y: 360, id: 2 },
    { x: 650, y: 360, id: 2 },
    { x: 700, y: 360, id: 2 },
    { x: 1100, y: 360, id: 1 },
    { x: 1150, y: 360, id: 1 },
    { x: 1200, y: 360, id: 1 },
  ]);

  test('puts the anchor on the region that shows as two separated patches', () => {
    const meanX = (100 + 150 + 200 + 1100 + 1150 + 1200) / 6;
    expect(meanX).toBe(650);
    // The mean of the region's samples falls on the other region, 400 pixels from the
    // nearest sample of its own region.
    const onMean = patches.ids[Array.from(patches.x).indexOf(meanX)];
    expect(onMean).toBe(2);

    const anchor = labelCandidates(patches, VIEWPORT, regions).find(
      (candidate) => candidate.id === 1,
    )?.anchor;
    expect(anchor).toBeDefined();
    // The anchor is a sample of region 1, so it lies on the region.
    const at = Array.from(patches.x).findIndex(
      (x, index) => x === anchor?.x && patches.y[index] === anchor.y,
    );
    expect(at).toBeGreaterThanOrEqual(0);
    expect(patches.ids[at]).toBe(1);
    expect(patches.regionAtPlane(anchor?.x as number, anchor?.y as number)).toBe(1);
    // It is not the mean, which lies on region 2.
    expect(anchor?.x).not.toBe(meanX);
    // It is the sample of region 1 nearest the mean, which is the inner end of a
    // patch. The sample of any region nearest the mean belongs to region 2.
    expect([200, 1100]).toContain(anchor?.x);
  });

  test('puts the anchor on the mean where the mean lies on the region', () => {
    // Region 2 shows as one patch, so the mean of its samples lies on it.
    const anchor = labelCandidates(patches, VIEWPORT, regions).find(
      (candidate) => candidate.id === 2,
    )?.anchor;
    expect(anchor?.x).toBeCloseTo(650, 9);
    expect(anchor?.y).toBeCloseTo(360, 9);
    // The mean is not a sample grid position of its own; it is what the samples give.
    expect(patches.regionAtPlane(650, 360)).toBe(2);
  });

  test('holds the anchor 48 pixels inside the frame', () => {
    const edge = samplesOf([
      { x: 16, y: 8, id: 1 },
      { x: 20, y: 12, id: 1 },
      { x: 1270, y: 715, id: 2 },
      { x: 1265, y: 710, id: 2 },
    ]);
    for (const candidate of labelCandidates(edge, VIEWPORT, regions)) {
      expect(candidate.anchor.x).toBeGreaterThanOrEqual(LABEL_INSET);
      expect(candidate.anchor.y).toBeGreaterThanOrEqual(LABEL_INSET);
      expect(candidate.anchor.x).toBeLessThanOrEqual(VIEWPORT.width - LABEL_INSET);
      expect(candidate.anchor.y).toBeLessThanOrEqual(VIEWPORT.height - LABEL_INSET);
    }
  });
});

describe('the placement order', () => {
  const regions = [
    regionOf(1, 'Wide Region'),
    regionOf(2, 'Middle Region'),
    regionOf(3, 'Third Region'),
  ];

  test('places the region holding the sample nearest the frame centre first', () => {
    // Region 1 holds 6 samples and region 2 holds 3, but region 2 holds the sample
    // nearest the centre of the frame, which is 640, 360.
    const samples = samplesOf([
      { x: 100, y: 360, id: 1 },
      { x: 150, y: 360, id: 1 },
      { x: 200, y: 360, id: 1 },
      { x: 600, y: 360, id: 2 },
      { x: 650, y: 360, id: 2 },
      { x: 700, y: 360, id: 2 },
      { x: 1100, y: 360, id: 1 },
      { x: 1150, y: 360, id: 1 },
      { x: 1200, y: 360, id: 1 },
    ]);
    const order = labelCandidates(samples, VIEWPORT, regions);
    expect(order.map((candidate) => candidate.name)).toEqual([
      'Middle Region',
      'Wide Region',
    ]);
    expect(order[0]?.count).toBeLessThan(order[1]?.count as number);
  });

  test('places the rest by sample count, most first', () => {
    const points: { x: number; y: number; id: number }[] = [{ x: 640, y: 360, id: 3 }];
    for (let index = 0; index < 40; index += 1) {
      points.push({ x: 100 + index * 4, y: 100, id: 1 });
    }
    for (let index = 0; index < 20; index += 1) {
      points.push({ x: 100 + index * 4, y: 600, id: 2 });
    }
    const order = labelCandidates(samplesOf(points), VIEWPORT, regions);
    expect(order.map((candidate) => candidate.name)).toEqual([
      'Third Region',
      'Wide Region',
      'Middle Region',
    ]);
  });
});

describe('the placement', () => {
  test('drops a region whose label overlaps one already placed', () => {
    const regions = [regionOf(1, 'First Region'), regionOf(2, 'Second Region')];
    // Both regions hold their nearest sample to their own mean at the same point.
    const samples = samplesOf([
      { x: 640, y: 360, id: 1 },
      { x: 641, y: 360, id: 2 },
      { x: 639, y: 360, id: 1 },
    ]);
    const placed = chooseLabels(samples, VIEWPORT, measure, regions);
    expect(placed.map((label) => label.name)).toEqual(['First Region']);
  });

  test('places at most 12 labels, none overlapping, all inside the viewport', () => {
    const regions: Region[] = [];
    const points: { x: number; y: number; id: number }[] = [];
    for (let id = 1; id <= 20; id += 1) {
      regions.push(regionOf(id, `Region ${id}`));
      for (let repeat = 0; repeat < 5; repeat += 1) {
        points.push({ x: 60 + id * 55, y: 60 + repeat * 120, id });
      }
    }
    const placed = chooseLabels(samplesOf(points), VIEWPORT, measure, regions);
    expect(placed.length).toBeGreaterThan(0);
    expect(placed.length).toBeLessThanOrEqual(MAX_LABELS);
    for (let first = 0; first < placed.length; first += 1) {
      const one = placed[first] as (typeof placed)[number];
      expect(one.left).toBeGreaterThanOrEqual(0);
      expect(one.top).toBeGreaterThanOrEqual(0);
      expect(one.left + one.width).toBeLessThanOrEqual(VIEWPORT.width);
      expect(one.top + one.height).toBeLessThanOrEqual(VIEWPORT.height);
      for (let second = first + 1; second < placed.length; second += 1) {
        expect(boxesOverlap(one, placed[second] as (typeof placed)[number])).toBe(
          false,
        );
      }
    }
  });
});

describe('the label fade', () => {
  test('follows the fade in of the lines and does not fade out', () => {
    expect(labelFade(30000)).toBe(0);
    expect(labelFade(60000)).toBe(0);
    expect(labelFade(20000)).toBe(1);
    expect(labelFade(500)).toBe(1);
    expect(labelFade(25000)).toBeGreaterThan(0);
    expect(labelFade(25000)).toBeLessThan(1);
  });
});

describe('the hysteresis', () => {
  const regions = [
    regionOf(1, 'Wide Region'),
    regionOf(2, 'Middle Region'),
    regionOf(3, 'Centre Region'),
  ];

  /**
   * 1,000 samples. Region 3 holds 20 of them around the centre of the frame, so it
   * takes the first place whatever the rest do. Region 2 holds `held`, region 1 the
   * rest. One percent of the frame is 10 samples.
   */
  function withShare(held: number): FrameSamples {
    const points: { x: number; y: number; id: number }[] = [];
    for (let index = 0; index < 20; index += 1) {
      points.push({ x: 620 + index * 2, y: 360, id: 3 });
    }
    for (let index = 0; index < held; index += 1) {
      points.push({ x: 100 + (index % 100) * 3, y: 600, id: 2 });
    }
    while (points.length < 1000) {
      points.push({ x: 100 + (points.length % 100) * 3, y: 100, id: 1 });
    }
    return samplesOf(points);
  }

  test('a region on the threshold does not blink', () => {
    expect(HELD_SHARE).toBe(CANDIDATE_SHARE / 2);
    const holds = (samples: FrameSamples, previous: readonly number[]): number[] =>
      labelCandidates(samples, VIEWPORT, regions, memoryOf(previous)).map(
        (one) => one.id,
      );

    // 12 of 1,000 is 1.2 percent, over the threshold.
    const first = holds(withShare(12), []);
    expect(first).toContain(2);
    // 7 of 1,000 is 0.7 percent: under the threshold and over half of it.
    const second = holds(withShare(7), first);
    expect(second).toContain(2);
    // 4 of 1,000 is 0.4 percent, under half the threshold.
    const third = holds(withShare(4), second);
    expect(third).not.toContain(2);
  });

  test('drops a region on 0.7 percent that carried no label', () => {
    const fresh = labelCandidates(withShare(7), VIEWPORT, regions).map((one) => one.id);
    expect(fresh).not.toContain(2);
  });

  test('a region entering the frame overtakes one that is leaving', () => {
    // Region 2 carries a label and holds 60 percent of the samples region 1 holds.
    const points: { x: number; y: number; id: number }[] = [];
    for (let index = 0; index < 20; index += 1) {
      points.push({ x: 620 + index * 2, y: 360, id: 3 });
    }
    for (let index = 0; index < 100; index += 1) {
      points.push({ x: 100 + index * 3, y: 100, id: 1 });
    }
    for (let index = 0; index < 60; index += 1) {
      points.push({ x: 100 + index * 3, y: 600, id: 2 });
    }
    const order = labelCandidates(
      samplesOf(points),
      VIEWPORT,
      regions,
      memoryOf([2]),
    ).map((one) => one.id);
    expect(order).toEqual([3, 1, 2]);
  });

  test('keeps the place of a region that carried a label on a near tie', () => {
    // Region 2 holds 95 against 100, which is inside the 1.2 bonus.
    const points: { x: number; y: number; id: number }[] = [];
    for (let index = 0; index < 20; index += 1) {
      points.push({ x: 620 + index * 2, y: 360, id: 3 });
    }
    for (let index = 0; index < 100; index += 1) {
      points.push({ x: 100 + index * 3, y: 100, id: 1 });
    }
    for (let index = 0; index < 95; index += 1) {
      points.push({ x: 100 + index * 3, y: 600, id: 2 });
    }
    expect(CARRIED_BONUS).toBe(1.2);
    const order = labelCandidates(
      samplesOf(points),
      VIEWPORT,
      regions,
      memoryOf([2]),
    ).map((one) => one.id);
    expect(order).toEqual([3, 2, 1]);
  });
});

describe('the anchor filter', () => {
  const identity = (x: number, z: number): AnchorPoint => ({ x, y: z });

  /** A projection that shows 10 CSS pixels for every light year of the plane. */
  const zoomed = (x: number, z: number): AnchorPoint => ({ x: x * 10, y: z * 10 });

  test('moves the carried point its share of the gap to the target', () => {
    const filtered = filterAnchor({ x: 210, z: 110 }, { x: 200, z: 100 }, identity);
    expect(filtered.x).toBeCloseTo(210 - 10 * ANCHOR_SHARE, 9);
    expect(filtered.z).toBeCloseTo(110 - 10 * ANCHOR_SHARE, 9);
    // The step is under the cap, so the cap does not touch it.
    expect(Math.hypot(filtered.x - 210, filtered.z - 110)).toBeLessThan(
      ANCHOR_MAX_PIXELS,
    );
  });

  test('scales a longer step down to the cap', () => {
    const carried: PlanePoint = { x: 500, z: 400 };
    const filtered = filterAnchor(carried, { x: 200, z: 100 }, identity);
    const from = identity(carried.x, carried.z);
    const to = identity(filtered.x, filtered.z);
    expect(Math.hypot(to.x - from.x, to.y - from.y)).toBeCloseTo(ANCHOR_MAX_PIXELS, 6);
    // The cap scales the step and does not turn it: the point still moves toward the
    // target on the straight line between the two.
    expect(filtered.x - carried.x).toBeCloseTo(filtered.z - carried.z, 9);
    expect(filtered.x).toBeLessThan(carried.x);
  });

  test('reads the cap on the projection and not on the plane', () => {
    const carried: PlanePoint = { x: 210, z: 110 };
    const target: PlanePoint = { x: 200, z: 100 };
    // The same plane step, at a zoom that shows 10 pixels for a light year, moves the
    // anchor 10 times as far, so the cap takes it back.
    const wide = filterAnchor(carried, target, identity);
    const close = filterAnchor(carried, target, zoomed);
    const planeStep = (point: PlanePoint): number =>
      Math.hypot(point.x - carried.x, point.z - carried.z);
    const step = 10 * ANCHOR_SHARE;
    expect(planeStep(wide)).toBeCloseTo(Math.hypot(step, step), 9);
    expect(planeStep(close)).toBeCloseTo(
      Math.hypot(step, step) * (ANCHOR_MAX_PIXELS / Math.hypot(step * 10, step * 10)),
      6,
    );
    const from = zoomed(carried.x, carried.z);
    const to = zoomed(close.x, close.z);
    expect(Math.hypot(to.x - from.x, to.y - from.y)).toBeCloseTo(ANCHOR_MAX_PIXELS, 6);
  });

  test('takes no step when the carried point is the target', () => {
    const filtered = filterAnchor({ x: 200, z: 100 }, { x: 200, z: 100 }, identity);
    expect(filtered).toEqual({ x: 200, z: 100 });
  });

  test('never steps past the target', () => {
    let point: PlanePoint = { x: 0, z: 0 };
    const target: PlanePoint = { x: 10, z: 0 };
    for (let frame = 0; frame < 200; frame += 1) {
      point = filterAnchor(point, target, identity);
      expect(point.x).toBeLessThanOrEqual(target.x);
    }
    expect(point.x).toBeCloseTo(target.x, 3);
  });
});

describe('the carried anchor', () => {
  const regions = [regionOf(1, 'Held Region'), regionOf(2, 'Other Region')];

  /** Three samples of region 1 on one row, so the mean of them is 200, 100. */
  const row = [
    { x: 100, y: 100, id: 1 },
    { x: 200, y: 100, id: 1 },
    { x: 300, y: 100, id: 1 },
  ];

  /** The samples of `row` with the plane reader and the projection written out. */
  function framed(
    regionAtPlane: (x: number, z: number) => number,
    toScreen: (x: number, z: number) => AnchorPoint | null,
  ): FrameSamples {
    return { ...samplesOf(row), regionAtPlane, toScreen };
  }

  const identity = (x: number, z: number): AnchorPoint => ({ x, y: z });

  function anchorOf(
    samples: FrameSamples,
    memory: LabelMemory,
  ): AnchorPoint | undefined {
    return labelCandidates(samples, VIEWPORT, regions, memory).find(
      (candidate) => candidate.id === 1,
    )?.anchor;
  }

  test('filters the anchor of the frame before toward this frame anchor', () => {
    const samples = framed(() => 1, identity);
    const anchor = anchorOf(samples, memoryOf([1], [[1, { x: 500, z: 400 }]]));
    const step = filterAnchor({ x: 500, z: 400 }, { x: 200, z: 100 }, identity);
    expect(anchor?.x).toBeCloseTo(step.x, 9);
    expect(anchor?.y).toBeCloseTo(step.z, 9);
    // The gap is long, so the frame moves the anchor by the cap and no further.
    expect(
      Math.hypot(500 - (anchor?.x as number), 400 - (anchor?.y as number)),
    ).toBeCloseTo(ANCHOR_MAX_PIXELS, 6);
  });

  test('drops a carried point whose region is another region and takes the target whole', () => {
    // The plane point 500, 400 now reads as region 2, so the mean takes over at once.
    const samples = framed((x, z) => (x === 500 && z === 400 ? 2 : 1), identity);
    const anchor = anchorOf(samples, memoryOf([1], [[1, { x: 500, z: 400 }]]));
    expect(anchor).toEqual({ x: 200, y: 100 });
  });

  test('drops a carried point outside the frame and takes the target whole', () => {
    // The carried point projects past the right edge of the 1280 by 720 frame.
    const samples = framed(
      () => 1,
      (x, z) => (x === 500 && z === 400 ? { x: 1400, y: 400 } : { x, y: z }),
    );
    const anchor = anchorOf(samples, memoryOf([1], [[1, { x: 500, z: 400 }]]));
    expect(anchor).toEqual({ x: 200, y: 100 });
  });

  test('a region that carried no label starts at the target', () => {
    const anchor = anchorOf(
      framed(() => 1, identity),
      memoryOf([]),
    );
    expect(anchor).toEqual({ x: 200, y: 100 });
  });

  test('carrying the plane point does not hold the label still', () => {
    // The same carried plane point under two projections, which is what a camera that
    // moves gives. The anchor follows the projection as well as the filter.
    const memory = memoryOf([1], [[1, { x: 500, z: 400 }]]);
    const before = anchorOf(
      framed(() => 1, identity),
      memory,
    );
    const after = anchorOf(
      framed(
        () => 1,
        (x, z) => ({ x: x + 3, y: z + 2 }),
      ),
      memory,
    );
    expect((after?.x as number) - (before?.x as number)).toBeCloseTo(3, 9);
    expect((after?.y as number) - (before?.y as number)).toBeCloseTo(2, 9);
  });
});

describe('the anchor over a pan', () => {
  const regions = [regionOf(1, 'Panned Region'), regionOf(2, 'Around It')];

  /**
   * One frame of samples over a region that sits still on the plane. The projection is
   * a shift, which is what a pan of a camera looking straight down gives, so the plane
   * point under each screen sample moves and the sample grid does not.
   */
  function pannedSamples(
    offset: AnchorPoint,
    regionAt: (x: number, z: number) => number,
  ): FrameSamples {
    const points: {
      x: number;
      y: number;
      planeX: number;
      planeZ: number;
      id: number;
    }[] = [];
    const columns = Math.ceil(VIEWPORT.width / SAMPLE_SPACING);
    const rows = Math.ceil(VIEWPORT.height / SAMPLE_SPACING);
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const screenX = (column + 0.5) * (VIEWPORT.width / columns);
        const screenY = (row + 0.5) * (VIEWPORT.height / rows);
        const planeX = screenX - offset.x;
        const planeZ = screenY - offset.y;
        points.push({
          x: screenX,
          y: screenY,
          planeX,
          planeZ,
          id: regionAt(planeX, planeZ),
        });
      }
    }
    return {
      count: points.length,
      points: points.length,
      x: Float64Array.from(points, (point) => point.x),
      y: Float64Array.from(points, (point) => point.y),
      planeX: Float64Array.from(points, (point) => point.planeX),
      planeZ: Float64Array.from(points, (point) => point.planeZ),
      ids: Uint8Array.from(points, (point) => point.id),
      elapsedMs: 0,
      regionAtPlane: regionAt,
      toScreen: (x: number, z: number) => ({ x: x + offset.x, y: z + offset.y }),
    };
  }

  /** The mean of the plane positions of the samples one region holds. */
  function meanOf(samples: FrameSamples, id: number): PlanePoint {
    let sumX = 0;
    let sumZ = 0;
    let count = 0;
    for (let index = 0; index < samples.count; index += 1) {
      if (samples.ids[index] !== id) continue;
      sumX += samples.planeX[index] as number;
      sumZ += samples.planeZ[index] as number;
      count += 1;
    }
    return { x: sumX / count, z: sumZ / count };
  }

  /**
   * How far apart two samples sit on the plane where the anchor is. The spacing is
   * fixed on the screen and not on the plane, so it is read where the anchor sits.
   */
  function localSpacing(samples: FrameSamples, point: PlanePoint): number {
    let nearest = -1;
    let range = Infinity;
    for (let index = 0; index < samples.count; index += 1) {
      const away = Math.hypot(
        (samples.planeX[index] as number) - point.x,
        (samples.planeZ[index] as number) - point.z,
      );
      if (away >= range) continue;
      range = away;
      nearest = index;
    }
    let spacing = Infinity;
    for (let index = 0; index < samples.count; index += 1) {
      if (index === nearest) continue;
      const away = Math.hypot(
        (samples.planeX[index] as number) - (samples.planeX[nearest] as number),
        (samples.planeZ[index] as number) - (samples.planeZ[nearest] as number),
      );
      if (away < spacing) spacing = away;
    }
    return spacing;
  }

  /**
   * How much nearer the mean the nearest sample of a region is than the next one, in
   * light years. 0 is a tie, where the anchor of a frame that carries nothing hops.
   */
  function tieToMean(samples: FrameSamples, id: number): number {
    let sumX = 0;
    let sumZ = 0;
    let count = 0;
    for (let index = 0; index < samples.count; index += 1) {
      if (samples.ids[index] !== id) continue;
      sumX += samples.planeX[index] as number;
      sumZ += samples.planeZ[index] as number;
      count += 1;
    }
    if (count === 0) return Infinity;
    const meanX = sumX / count;
    const meanZ = sumZ / count;
    let first = Infinity;
    let second = Infinity;
    for (let index = 0; index < samples.count; index += 1) {
      if (samples.ids[index] !== id) continue;
      const away = Math.hypot(
        (samples.planeX[index] as number) - meanX,
        (samples.planeZ[index] as number) - meanZ,
      );
      if (away < first) {
        second = first;
        first = away;
      } else if (away < second) {
        second = away;
      }
    }
    return second - first;
  }

  /** Runs one frame and gives the candidate of region 1 and the memory for the next. */
  function stepFrame(
    samples: FrameSamples,
    memory: LabelMemory,
  ): { anchor: AnchorPoint; plane: PlanePoint; memory: LabelMemory } | null {
    const candidates = labelCandidates(samples, VIEWPORT, regions, memory);
    const next: LabelMemory = {
      previous: new Set(candidates.map((candidate) => candidate.id)),
      anchors: new Map(
        candidates.map((candidate) => [candidate.id, candidate.plane] as const),
      ),
    };
    const one = candidates.find((candidate) => candidate.id === 1);
    if (one === undefined) return null;
    return { anchor: one.anchor, plane: one.plane, memory: next };
  }

  test('a pushed anchor comes back to the centre', () => {
    // A square region of 400 by 400 light years. The pan carries it from the right edge
    // of the frame, where two columns of samples show and the inset holds the anchor, to
    // the middle of the frame. The camera jumps there in one frame, which is the worst
    // the filter meets: the anchor is still out at the right when the camera stops.
    const square = (x: number, z: number): number =>
      Math.abs(x) <= 200 && Math.abs(z) <= 200 ? 1 : 2;
    const panFrames = 1;
    const stillFrames = 60;
    const start = { x: 1416, y: VIEWPORT.height / 2 };
    const end = { x: VIEWPORT.width / 2, y: VIEWPORT.height / 2 };

    let memory: LabelMemory = memoryOf([]);
    let insetFrames = 0;
    for (let frame = 0; frame <= panFrames; frame += 1) {
      const share = frame / panFrames;
      const offset = {
        x: start.x + (end.x - start.x) * share,
        y: start.y + (end.y - start.y) * share,
      };
      const step = stepFrame(pannedSamples(offset, square), memory);
      expect(step).not.toBeNull();
      if (step === null) return;
      if (step.anchor.x >= VIEWPORT.width - LABEL_INSET - 1e-9) insetFrames += 1;
      memory = step.memory;
    }
    // The pan starts with the region against the frame edge, where the inset holds the
    // anchor.
    expect(insetFrames).toBeGreaterThan(0);

    const samples = pannedSamples(end, square);
    const mean = meanOf(samples, 1);
    const middle = samples.toScreen(mean.x, mean.z) as AnchorPoint;
    let range = Infinity;
    let started = 0;
    let worstMove: number = 0;
    let away = 0;
    let arrived = -1;
    let anchor: AnchorPoint | null = null;
    for (let frame = 0; frame < stillFrames; frame += 1) {
      const step = stepFrame(samples, memory);
      expect(step).not.toBeNull();
      if (step === null) return;
      if (anchor !== null) {
        const move = Math.hypot(step.anchor.x - anchor.x, step.anchor.y - anchor.y);
        if (move > worstMove) worstMove = move;
      }
      const next = Math.hypot(step.anchor.x - middle.x, step.anchor.y - middle.y);
      if (frame === 0) started = next;
      if (next > range + 1e-9) away += 1;
      if (arrived < 0 && next <= 2) arrived = frame;
      range = next;
      anchor = step.anchor;
      memory = step.memory;
    }
    console.log(
      'the pushed anchor starts',
      started,
      'CSS pixels from the middle, arrives within 2 of it at frame',
      arrived,
      'and ends',
      range,
      'away, worst move',
      worstMove,
    );
    // The jump leaves the anchor well out of the middle.
    expect(started).toBeGreaterThan(40);
    // No still frame carries the anchor away from the mean.
    expect(away).toBe(0);
    // It is there in 10 frames, which is 167 milliseconds at 60 frames a second. The
    // label does not crawl back.
    expect(arrived).toBeGreaterThanOrEqual(0);
    expect(arrived).toBeLessThanOrEqual(10);

    expect(range).toBeLessThan(2);
    expect(worstMove).toBeLessThanOrEqual(ANCHOR_MAX_PIXELS + 1e-6);
  });

  test('the filter does not hop between samples', () => {
    // A slow pan over the galactic centre. `Izanami` shows as two patches there, so its
    // anchor is the sample of its own region nearest the mean, and two of its samples
    // sit at the same distance from that mean. Which one is nearest changes as the
    // sample grid moves over the plane, and the anchor of a frame that carries nothing
    // hops a sample spacing.
    const grid = buildCoarseRegionGrid(fillRegionGrid());
    const izanami = REGIONS.find((region) => region.name === 'Izanami');
    expect(izanami).toBeDefined();
    const id = izanami?.id as number;

    let memory: LabelMemory = memoryOf([]);
    let anchor: AnchorPoint | null = null;
    let plane: PlanePoint | null = null;
    let bareAnchor: AnchorPoint | null = null;
    let worstMove = 0;
    let worstBareMove = 0;
    let worstPlaneShare = 0;
    let closestTie = Infinity;
    for (let frame = 0; frame < 120; frame += 1) {
      const view: View = {
        cursor: [frame * 2, 0, 25895 + frame * 2],
        distance: 2000,
        yaw: 0,
        pitch: 35,
      };
      const samples = sampleFrame(view, VIEWPORT, grid);
      const one = labelCandidates(samples, VIEWPORT, REGIONS, memory).find(
        (candidate) => candidate.id === id,
      );
      expect(one).toBeDefined();
      if (one === undefined) return;

      if (anchor !== null && plane !== null) {
        worstMove = Math.max(
          worstMove,
          Math.hypot(one.anchor.x - anchor.x, one.anchor.y - anchor.y),
        );
        const step = Math.hypot(one.plane.x - plane.x, one.plane.z - plane.z);
        worstPlaneShare = Math.max(
          worstPlaneShare,
          step / localSpacing(samples, one.plane),
        );
      }
      anchor = one.anchor;
      plane = one.plane;

      // The same frame with no anchor carried, which is the target the filter follows.
      const bare = labelCandidates(samples, VIEWPORT, REGIONS, memoryOf([id])).find(
        (candidate) => candidate.id === id,
      );
      if (bare !== undefined) {
        if (bareAnchor !== null) {
          worstBareMove = Math.max(
            worstBareMove,
            Math.hypot(bare.anchor.x - bareAnchor.x, bare.anchor.y - bareAnchor.y),
          );
        }
        bareAnchor = bare.anchor;
      }
      closestTie = Math.min(closestTie, tieToMean(samples, id));

      const placed = chooseLabels(samples, VIEWPORT, measure, REGIONS, memory);
      memory = {
        previous: new Set(placed.map((label) => label.id)),
        anchors: new Map(placed.map((label) => [label.id, label.plane])),
      };
    }
    console.log(
      'the filtered anchor moves at worst',
      worstMove,
      'CSS pixels a frame, and the target',
      worstBareMove,
    );
    console.log(
      'the two samples nearest the mean come within',
      closestTie,
      'light years of each other',
    );
    // The frame holds the near tie the scenario names, and the target hops when it
    // turns over.
    expect(closestTie).toBeLessThan(1);
    expect(worstBareMove).toBeGreaterThan(8);
    // The filter holds the same turn over to the cap, so the label slides over a few
    // frames where the target jumps a whole sample spacing.
    expect(worstMove).toBeLessThanOrEqual(ANCHOR_MAX_PIXELS + 1e-6);
    expect(worstPlaneShare).toBeLessThan(1);
  }, 120000);
});

describe('the anchor as the camera turns', () => {
  const WIDE_VIEWPORT = { width: 1920, height: 1080 };

  /** The 120 frames the spec scenario names, as the anchor of one region. */
  function turnFrames(
    id: number,
    step: number,
  ): { anchors: AnchorPoint[]; sets: string[] } {
    const grid = buildCoarseRegionGrid(fillRegionGrid());
    const anchors: AnchorPoint[] = [];
    const sets: string[] = [];
    let memory: LabelMemory = memoryOf([]);
    for (let frame = 0; frame < 120; frame += 1) {
      const view: View = {
        cursor: [0, 0, 0],
        distance: 2000,
        yaw: frame * step,
        pitch: 35,
      };
      const samples = sampleFrame(view, WIDE_VIEWPORT, grid);
      const anchor = labelCandidates(samples, WIDE_VIEWPORT, REGIONS, memory).find(
        (candidate) => candidate.id === id,
      )?.anchor;
      if (anchor !== undefined) anchors.push(anchor);
      const placed = chooseLabels(samples, WIDE_VIEWPORT, measure, REGIONS, memory);
      memory = {
        previous: new Set(placed.map((label) => label.id)),
        anchors: new Map(placed.map((label) => [label.id, label.plane])),
      };
      sets.push(
        placed
          .map((label) => label.id)
          .sort((first, second) => first - second)
          .join(','),
      );
    }
    return { anchors, sets };
  }

  test('a turn of 0.1 degrees a frame never moves the anchor 8 CSS pixels', () => {
    const spur = REGIONS.find((region) => region.name === 'Inner Orion Spur');
    expect(spur).toBeDefined();
    const { anchors } = turnFrames(spur?.id as number, 0.1);
    expect(anchors.length).toBe(120);
    let worst = 0;
    let still = 0;
    for (let frame = 1; frame < anchors.length; frame += 1) {
      const before = anchors[frame - 1] as AnchorPoint;
      const after = anchors[frame] as AnchorPoint;
      const move = Math.hypot(after.x - before.x, after.y - before.y);
      if (move < 1e-9) still += 1;
      if (move > worst) worst = move;
    }
    console.log('the worst anchor move over the turn is', worst, 'CSS pixels');
    console.log('the anchor is still in', still, 'of', anchors.length - 1, 'frames');
    // The lower bound catches an anchor worked out on the screen, which holds still
    // and then steps. The upper bound catches an anchor that snaps to a sample.
    expect(still).toBe(0);
    expect(worst).toBeLessThan(8);
  }, 120000);

  test('the label set does not change over a turn of 0.2 degrees a frame', () => {
    const spur = REGIONS.find((region) => region.name === 'Inner Orion Spur');
    const { sets } = turnFrames(spur?.id as number, 0.2);
    const seen = new Set(sets);
    console.log('the turn shows', seen.size, 'label sets:', Array.from(seen));
    expect(seen.size).toBe(1);
  }, 120000);
});
