import { mat4 } from 'gl-matrix';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { View } from '../camera/view';
import {
  boxesOverlap,
  CANDIDATE_SHARE,
  CARRIED_BONUS,
  chooseLabels,
  fitSampleBuffers,
  HELD_SHARE,
  LABEL_INSET,
  labelCandidates,
  labelFade,
  MAX_LABELS,
  SAMPLE_SPACING,
  samplePointCount,
  sampleFrame,
} from './labels';
import type { AnchorPoint, FrameSamples, LabelMemory } from './labels';
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

describe('the held anchor', () => {
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

  test('keeps the anchor of the frame before while both rules hold', () => {
    const samples = framed(() => 1, identity);
    const anchor = labelCandidates(
      samples,
      VIEWPORT,
      regions,
      memoryOf([1], [[1, { x: 500, z: 400 }]]),
    ).find((candidate) => candidate.id === 1)?.anchor;
    expect(anchor).toEqual({ x: 500, y: 400 });
  });

  test('drops the held anchor when the region under it is another region', () => {
    // The plane point 500, 400 now reads as region 2, so the mean takes over.
    const samples = framed((x, z) => (x === 500 && z === 400 ? 2 : 1), identity);
    const anchor = labelCandidates(
      samples,
      VIEWPORT,
      regions,
      memoryOf([1], [[1, { x: 500, z: 400 }]]),
    ).find((candidate) => candidate.id === 1)?.anchor;
    expect(anchor).toEqual({ x: 200, y: 100 });
  });

  test('drops the held anchor when it no longer projects inside the frame', () => {
    // The held point projects past the right edge of the 1280 by 720 frame.
    const samples = framed(
      () => 1,
      (x, z) => (x === 500 && z === 400 ? { x: 1400, y: 400 } : { x, y: z }),
    );
    const anchor = labelCandidates(
      samples,
      VIEWPORT,
      regions,
      memoryOf([1], [[1, { x: 500, z: 400 }]]),
    ).find((candidate) => candidate.id === 1)?.anchor;
    expect(anchor).toEqual({ x: 200, y: 100 });
  });

  test('holding the plane point does not hold the label still', () => {
    // The same held plane point under two projections, which is what a camera that
    // moves gives. The anchor follows the projection.
    const memory = memoryOf([1], [[1, { x: 500, z: 400 }]]);
    const before = labelCandidates(
      framed(() => 1, identity),
      VIEWPORT,
      regions,
      memory,
    ).find((candidate) => candidate.id === 1)?.anchor;
    const after = labelCandidates(
      framed(
        () => 1,
        (x, z) => ({ x: x + 3, y: z + 2 }),
      ),
      VIEWPORT,
      regions,
      memory,
    ).find((candidate) => candidate.id === 1)?.anchor;
    expect(before).toEqual({ x: 500, y: 400 });
    expect(after).toEqual({ x: 503, y: 402 });
  });
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
