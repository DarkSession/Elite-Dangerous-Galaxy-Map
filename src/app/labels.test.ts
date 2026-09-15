import { mat4 } from 'gl-matrix';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { View } from '../camera/view';
import { ZOOM_PER_NOTCH } from '../camera/controls';
import {
  boxesOverlap,
  CANDIDATE_SHARE,
  CARRIED_BONUS,
  chooseLabels,
  fitSampleBuffers,
  filterAnchor,
  anchorStep,
  smoothTarget,
  TARGET_RESET_PIXELS,
  TARGET_SHARE,
  targetShare,
  ANCHOR_FULL_SPEED_PIXELS,
  ANCHOR_LEAST_PIXELS,
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
function regionOf(
  id: number,
  name: string,
  centroid: readonly [number, number] = [0, 0],
): Region {
  return {
    id,
    name,
    area: 1000,
    bounds: { minX: -1000, maxX: 1000, minZ: -1000, maxZ: 1000 },
    centroid,
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
    toPlane(x: number, y: number) {
      return { x, z: y };
    },
  };
}

/** The memory of one frame, as the overlay builds it for the next. */
function memoryOf(
  previous: readonly number[],
  anchors: readonly (readonly [number, { x: number; z: number }])[] = [],
  targets: readonly (readonly [number, { x: number; z: number }])[] = anchors,
): LabelMemory {
  return {
    previous: new Set(previous),
    anchors: new Map(anchors),
    targets: new Map(targets),
  };
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
  // The centre of region 1 falls between its two patches, on region 2, so the label
  // reads the frame instead. This is the case the fallback exists for.
  const regions = [regionOf(1, 'Two Patches', [650, 360]), regionOf(2, 'Between Them')];

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

  test('holds the anchor inside the frame and the box fully in it', () => {
    const edge = samplesOf([
      { x: 16, y: 8, id: 1 },
      { x: 20, y: 12, id: 1 },
      { x: 1270, y: 715, id: 2 },
      { x: 1265, y: 710, id: 2 },
    ]);
    // The anchor is held inside the frame, and not inside the inset: a label near the
    // edge must slide with its region rather than sit at one place on the screen.
    for (const candidate of labelCandidates(edge, VIEWPORT, regions)) {
      expect(candidate.anchor.x).toBeGreaterThanOrEqual(0);
      expect(candidate.anchor.y).toBeGreaterThanOrEqual(0);
      expect(candidate.anchor.x).toBeLessThanOrEqual(VIEWPORT.width);
      expect(candidate.anchor.y).toBeLessThanOrEqual(VIEWPORT.height);
    }
    // The box itself stays fully in the frame, so the label is readable at the edge.
    for (const placed of chooseLabels(edge, VIEWPORT, measure, regions)) {
      expect(placed.left).toBeGreaterThanOrEqual(0);
      expect(placed.top).toBeGreaterThanOrEqual(0);
      expect(placed.left + placed.width).toBeLessThanOrEqual(VIEWPORT.width);
      expect(placed.top + placed.height).toBeLessThanOrEqual(VIEWPORT.height);
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
    const regions = [
      regionOf(1, 'First Region', [640, 360]),
      regionOf(2, 'Second Region', [640, 360]),
    ];
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
  test('takes the same band of zoom distance the boundary lines take', () => {
    expect(labelFade(30000)).toBe(0);
    expect(labelFade(60000)).toBe(0);
    expect(labelFade(20000)).toBe(1);
    expect(labelFade(10000)).toBe(1);
    expect(labelFade(7500)).toBeCloseTo(0.5, 12);
    expect(labelFade(5000)).toBe(0);
    expect(labelFade(4000)).toBe(0);
    expect(labelFade(500)).toBe(0);
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

describe('the label target', () => {
  const grid = buildCoarseRegionGrid(fillRegionGrid());

  /** The room the label box needs, as `fitInsideRegion` reads it. */
  function offRegion(
    point: PlanePoint,
    id: number,
    size: { width: number; height: number },
    samples: FrameSamples,
  ): number {
    const at = samples.toScreen(point.x, point.z);
    if (at === null) return 6;
    let off = 0;
    for (const column of [-1, 0, 1]) {
      for (const row of [-1, 1]) {
        const corner = samples.toPlane(
          at.x + (size.width / 2) * column,
          at.y + (size.height / 2) * row,
        );
        if (corner === null || samples.regionAtPlane(corner.x, corner.z) !== id)
          off += 1;
      }
    }
    return off;
  }

  /** True when the centre of a region has the room the label box needs. */
  function centreHasRoom(region: Region, samples: FrameSamples): boolean {
    const centre = { x: region.centroid[0], z: region.centroid[1] };
    const where = samples.toScreen(centre.x, centre.z);
    return (
      samples.regionAtPlane(centre.x, centre.z) === region.id &&
      where !== null &&
      where.x >= LABEL_INSET &&
      where.y >= LABEL_INSET &&
      where.x <= VIEWPORT.width - LABEL_INSET &&
      where.y <= VIEWPORT.height - LABEL_INSET
    );
  }

  test('is the centre of the region where the box fits there', () => {
    const view: View = { cursor: [0, 0, 0], distance: 30000, yaw: 0, pitch: 35 };
    const samples = sampleFrame(view, VIEWPORT, grid);
    const shown = labelCandidates(samples, VIEWPORT, REGIONS, memoryOf([]), measure);

    let onCentre = 0;
    for (const one of shown) {
      const region = REGIONS.find((candidate) => candidate.id === one.id) as Region;
      const centre = { x: region.centroid[0], z: region.centroid[1] };
      if (!centreHasRoom(region, samples)) continue;
      if (offRegion(centre, one.id, measure(one.name), samples) > 0) continue;
      onCentre += 1;
      // The target is the centroid itself, to the last digit. Nothing of the frame goes
      // into it, so the label cannot move over the map.
      expect(one.target.x).toBe(centre.x);
      expect(one.target.z).toBe(centre.z);
    }
    console.log(
      'the labels on the centre of their region',
      onCentre,
      'of',
      shown.length,
    );
    expect(onCentre).toBeGreaterThan(shown.length / 2);
  }, 120000);

  test('is the visible part of the region where the centre has no room', () => {
    // A close view, where a region reaches well past the frame.
    const view: View = { cursor: [0, 0, 25895], distance: 800, yaw: 0, pitch: 35 };
    const samples = sampleFrame(view, VIEWPORT, grid);
    const shown = labelCandidates(samples, VIEWPORT, REGIONS, memoryOf([]), measure);

    let checked = 0;
    for (const one of shown) {
      const region = REGIONS.find((candidate) => candidate.id === one.id) as Region;
      if (centreHasRoom(region, samples)) continue;
      checked += 1;
      // The target is not the centre. It sits on the region, and inside the frame.
      expect(one.target.x).not.toBe(region.centroid[0]);
      expect(samples.regionAtPlane(one.target.x, one.target.z)).toBe(one.id);
      const anchor = samples.toScreen(one.target.x, one.target.z) as AnchorPoint;
      expect(anchor.x).toBeGreaterThanOrEqual(0);
      expect(anchor.x).toBeLessThanOrEqual(VIEWPORT.width);
      expect(anchor.y).toBeGreaterThanOrEqual(0);
      expect(anchor.y).toBeLessThanOrEqual(VIEWPORT.height);
    }
    console.log('the labels whose centre has no room', checked, 'of', shown.length);
    expect(checked).toBeGreaterThan(0);
  }, 120000);

  test('moves a displaced label only a little', () => {
    // The camera looks at a corner of the galaxy, so the regions behind it reach past
    // the frame and their centres have no room.
    const view: View = { cursor: [20000, 0, 20000], distance: 9000, yaw: 0, pitch: 35 };
    const samples = sampleFrame(view, VIEWPORT, grid);
    const shown = labelCandidates(samples, VIEWPORT, REGIONS, memoryOf([]), measure);

    let checked = 0;
    let worst = 0;
    for (const one of shown) {
      const region = REGIONS.find((candidate) => candidate.id === one.id) as Region;
      if (centreHasRoom(region, samples)) continue;
      const centre = samples.toScreen(region.centroid[0], region.centroid[1]);
      if (centre === null) continue;
      // A centre still in the frame bounds the move. A centre outside it does not: the
      // label has to come back into the frame, however far that is.
      const inFrame =
        centre.x >= 0 &&
        centre.y >= 0 &&
        centre.x <= VIEWPORT.width &&
        centre.y <= VIEWPORT.height;
      if (!inFrame) continue;
      const at = samples.toScreen(one.target.x, one.target.z) as AnchorPoint;
      const move = Math.hypot(at.x - centre.x, at.y - centre.y);
      worst = Math.max(worst, move);
      checked += 1;
    }
    console.log('the displaced labels read', checked, 'and the worst move is', worst);
    expect(checked).toBeGreaterThan(0);
    // The box fit adds its own small move on top of the target rule. The measure reads
    // 4.7 CSS pixels, which is the figure the spec states.
    expect(worst).toBeLessThan(6);
  }, 120000);

  test('keeps the label box inside its own region', () => {
    const views: { name: string; view: View }[] = [
      {
        name: 'whole galaxy',
        view: { cursor: [0, 0, 0], distance: 30000, yaw: 0, pitch: 35 },
      },
      { name: 'wide', view: { cursor: [0, 0, 0], distance: 20000, yaw: 0, pitch: 35 } },
      {
        name: 'the centre',
        view: { cursor: [0, 0, 25895], distance: 2000, yaw: 0, pitch: 35 },
      },
      {
        name: 'close',
        view: { cursor: [0, 0, 25895], distance: 800, yaw: 0, pitch: 35 },
      },
    ];
    for (const one of views) {
      const samples = sampleFrame(one.view, VIEWPORT, grid);
      const placed = chooseLabels(samples, VIEWPORT, measure, REGIONS);
      const crossing = placed.filter(
        (label) => offRegion(label.plane, label.id, measure(label.name), samples) > 0,
      );
      console.log(
        'over',
        one.name,
        crossing.length,
        'of',
        placed.length,
        'label boxes cross their region edge',
        crossing.map((label) => label.name),
      );
      // A region narrower on the screen than the label is wide has no point that fits,
      // so no move of the target holds its box. Those are the only ones left. To hold
      // them as well needs the label to get smaller, which this change does not do.
      expect(crossing.length).toBeLessThanOrEqual(2);
    }
  }, 200000);

  test('does not move over the map while the camera drags', () => {
    // The owner states the requirement: a label belongs at the centre of its region, and
    // it should not move around in place. Where the box fits at the centre, the target is
    // the centroid itself, and the anchor settles on it and then reads the same number
    // every frame. This test counts those readings.
    let memory: LabelMemory = memoryOf([]);
    const held = new Map<number, PlanePoint>();
    let still = 0;
    let moved = 0;
    for (let frame = 0; frame < 90; frame += 1) {
      const view: View = {
        cursor: [frame * 200, 0, 0],
        distance: 20000,
        yaw: 0,
        pitch: 35,
      };
      const samples = sampleFrame(view, VIEWPORT, grid);
      const shown = labelCandidates(samples, VIEWPORT, REGIONS, memory, measure).slice(
        0,
        MAX_LABELS,
      );
      for (const one of shown) {
        const region = REGIONS.find((candidate) => candidate.id === one.id) as Region;
        const onCentre =
          one.target.x === region.centroid[0] && one.target.z === region.centroid[1];
        const before = held.get(one.id);
        held.set(one.id, one.plane);
        if (before === undefined || !onCentre) continue;
        if (before.x === one.plane.x && before.z === one.plane.z) still += 1;
        else moved += 1;
      }
      memory = {
        previous: new Set(shown.map((one) => one.id)),
        anchors: new Map(shown.map((one) => [one.id, one.plane])),
        targets: new Map(shown.map((one) => [one.id, one.target])),
      };
    }
    console.log('label readings on the centre that did not move at all', still);
    console.log('label readings on the centre that moved', moved);
    // Every reading is the same number twice over: the label is pinned to the galaxy
    // itself, and the centroid of a region is a fixed point of it.
    expect(still).toBeGreaterThan(0);
    expect(moved).toBe(0);
  }, 120000);
});

describe('the target smoothing', () => {
  const identity = (x: number, z: number): AnchorPoint => ({ x, y: z });
  const anywhere = (): boolean => true;

  test('takes the target whole when the frame before carried none', () => {
    const smoothed = smoothTarget(undefined, { x: 200, z: 100 }, identity, anywhere);
    expect(smoothed).toEqual({ x: 200, z: 100 });
  });

  test('moves the carried target its share of the way to this one', () => {
    const smoothed = smoothTarget(
      { x: 100, z: 100 },
      { x: 200, z: 100 },
      identity,
      anywhere,
    );
    expect(smoothed.x).toBeCloseTo(100 + 100 * targetShare(100), 9);
    expect(smoothed.z).toBeCloseTo(100, 9);
  });

  test('gives a small gap the share the noise of the grid asks for', () => {
    // The sample grid steps the target of a still region a few pixels. That share stays
    // near `TARGET_SHARE`, so the label does not take the noise.
    expect(targetShare(4)).toBeCloseTo(TARGET_SHARE, 3);
    expect(targetShare(30)).toBeLessThan(0.17);
    // A real move takes far more of the gap, and the whole of it at the figure.
    expect(targetShare(90)).toBeGreaterThan(0.4);
    expect(targetShare(TARGET_RESET_PIXELS)).toBe(1);
  });

  test('takes the target whole when it relocates', () => {
    // A region that shows as two patches moves its target a long way at once. To walk
    // that gap would take the label over the ground between the two patches.
    const far = TARGET_RESET_PIXELS + 10;
    const smoothed = smoothTarget(
      { x: 100, z: 100 },
      { x: 100 + far, z: 100 },
      identity,
      anywhere,
    );
    expect(smoothed).toEqual({ x: 100 + far, z: 100 });
  });

  test('holds the carried target when the smoothed point is off the region', () => {
    const smoothed = smoothTarget(
      { x: 100, z: 100 },
      { x: 200, z: 100 },
      identity,
      () => false,
    );
    expect(smoothed).toEqual({ x: 100, z: 100 });
  });
});

describe('the anchor step', () => {
  test('runs at its share of the gap once the gap is wide', () => {
    const knee = ANCHOR_FULL_SPEED_PIXELS;
    expect(anchorStep(knee)).toBeCloseTo(
      Math.min(ANCHOR_MAX_PIXELS, knee * ANCHOR_SHARE),
      9,
    );
  });

  test('runs slower as the gap closes', () => {
    expect(anchorStep(10)).toBeLessThan(anchorStep(20));
    expect(anchorStep(4)).toBeLessThan(1);
  });

  test('never goes over the cap', () => {
    for (const gap of [1, 10, 100, 1000, 10000]) {
      expect(anchorStep(gap)).toBeLessThanOrEqual(ANCHOR_MAX_PIXELS);
    }
  });

  test('always takes a step, so a pushed label arrives', () => {
    // Below the floor the step is the whole gap, so the label lands on the target.
    expect(anchorStep(0.2)).toBeCloseTo(0.2, 9);
    expect(anchorStep(30)).toBeGreaterThanOrEqual(ANCHOR_LEAST_PIXELS);
  });
});

describe('the anchor filter', () => {
  const identity = (x: number, z: number): AnchorPoint => ({ x, y: z });

  /** A projection that shows 10 CSS pixels for every light year of the plane. */
  const zoomed = (x: number, z: number): AnchorPoint => ({ x: x * 10, y: z * 10 });

  test('moves the carried point its share of the gap to the target', () => {
    const gap = Math.hypot(10, 10);
    const share = anchorStep(gap) / gap;
    const filtered = filterAnchor({ x: 210, z: 110 }, { x: 200, z: 100 }, identity);
    expect(filtered.x).toBeCloseTo(210 - 10 * share, 9);
    expect(filtered.z).toBeCloseTo(110 - 10 * share, 9);
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
    const gap = Math.hypot(10, 10);
    expect(planeStep(wide)).toBeCloseTo(anchorStep(gap), 9);
    // At the zoom the gap on the screen is 10 times as wide, and the plane step is the
    // step that gap earns, read back through the same zoom.
    expect(planeStep(close)).toBeCloseTo(anchorStep(gap * 10) / 10, 6);
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

  test('holds the solved step where no shorter one stays on the region', () => {
    // The projection is not linear, so the share that gives the wanted screen move is not
    // the share of the plane gap. Where no shorter step stays on the region the step
    // stands at the share the solver found, and not at the first guess. The first guess
    // moved the anchor 89 CSS pixels here, which is over four times the cap.
    const curved = (x: number, z: number): AnchorPoint => ({
      x: 400 * Math.sqrt(x / 100),
      y: z,
    });
    const carried = { x: 0, z: 0 };
    const target = { x: 100, z: 0 };
    const stepped = filterAnchor(carried, target, curved, () => false);
    const from = curved(carried.x, carried.z);
    const at = curved(stepped.x, stepped.z);
    const went = Math.hypot(at.x - from.x, at.y - from.y);
    const gap = Math.hypot(
      curved(target.x, target.z).x - from.x,
      curved(target.x, target.z).y - from.y,
    );
    console.log('the step off the region went', went, 'of a gap of', gap);
    expect(went).toBeCloseTo(anchorStep(gap), 0);
    expect(went).toBeLessThanOrEqual(ANCHOR_MAX_PIXELS + 1);
  });

  test('makes the step shorter to keep the point on its own region', () => {
    // The region holds every point but the half of the line nearest the carried point,
    // which is what a region that is not a convex shape gives.
    const carried: PlanePoint = { x: 500, z: 400 };
    const filtered = filterAnchor(
      carried,
      { x: 200, z: 100 },
      identity,
      (x) => x < 490,
    );
    expect(filtered.x).toBeLessThan(490);
    // The shorter step is still a step toward the target.
    expect(filtered.x).toBeLessThan(carried.x);
  });
});

describe('the carried anchor', () => {
  const regions = [regionOf(1, 'Held Region', [200, 100]), regionOf(2, 'Other Region')];

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

  test('walks a carried point off its region back onto it', () => {
    // The plane point 500, 400 now reads as region 2. The filter does not drop it: it
    // walks it toward the target, which is always on the region. To drop it instead puts
    // the label on the target in one step, which a person sees as a jump.
    const samples = framed((x, z) => (x === 500 && z === 400 ? 2 : 1), identity);
    const anchor = anchorOf(samples, memoryOf([1], [[1, { x: 500, z: 400 }]]));
    expect(anchor).not.toEqual({ x: 200, y: 100 });
    expect(
      Math.hypot((anchor?.x as number) - 500, (anchor?.y as number) - 400),
    ).toBeLessThanOrEqual(ANCHOR_MAX_PIXELS + 1e-6);
  });

  test('walks a carried point outside the frame back into it', () => {
    // The carried point projects past the right edge of the 1280 by 720 frame. A zoom
    // magnifies the view, so a point on the centre of its region goes off the frame while
    // the region stays in view. The filter walks it back rather than dropping it.
    const samples = framed(
      () => 1,
      (x, z) => (x === 500 && z === 400 ? { x: 1400, y: 400 } : { x, y: z }),
    );
    const anchor = anchorOf(samples, memoryOf([1], [[1, { x: 500, z: 400 }]]));
    expect(anchor).not.toEqual({ x: 200, y: 100 });
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
      toPlane: (x: number, y: number) => ({ x: x - offset.x, z: y - offset.y }),
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
      targets: new Map(
        candidates.map((candidate) => [candidate.id, candidate.target] as const),
      ),
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
    let near = -1;
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
      if (near < 0 && next <= 8) near = frame;
      if (arrived < 0 && next <= 2) arrived = frame;
      range = next;
      anchor = step.anchor;
      memory = step.memory;
    }
    console.log(
      'the pushed anchor starts',
      started,
      'CSS pixels from the middle, is within 8 of it at frame',
      near,
      'and within 2 at frame',
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
    // It reads as there in 15 frames, which is 250 milliseconds at 60 frames a second.
    // The label does not crawl back.
    expect(near).toBeGreaterThanOrEqual(0);
    expect(near).toBeLessThanOrEqual(15);
    // Speed falls with the gap, so the last few pixels take longer than the first
    // hundred. The eye does not read those pixels as a move.
    expect(arrived).toBeGreaterThanOrEqual(0);
    expect(arrived).toBeLessThanOrEqual(26);

    expect(range).toBeLessThan(2);
    expect(worstMove).toBeLessThanOrEqual(ANCHOR_MAX_PIXELS + 1e-6);
  });

  test('the target does not hop between samples', () => {
    // A slow pan over the galactic centre. `Izanami` shows as two patches there, and two
    // of its samples sit at the same distance from the mean of them. A target read from
    // the frame's samples hops a whole sample spacing as that tie turns over. The centre
    // rule reads no sample while the centre of the region has room, so the target holds
    // still and the filter has no hop to absorb.
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
        targets: new Map(placed.map((label) => [label.id, label.target])),
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
    // The frame holds the near tie the scenario names. The target reads none of it.
    expect(closestTie).toBeLessThan(1);
    expect(worstBareMove).toBeLessThan(1);
    // The filter holds every frame to the cap.
    expect(worstMove).toBeLessThanOrEqual(ANCHOR_MAX_PIXELS + 1e-6);
    expect(worstPlaneShare).toBeLessThan(1);
  }, 120000);

  test('the label walks smoothly while the camera drags', () => {
    // What a person reads as a label that shakes is not how far the label goes, but how
    // much its step changes from one frame to the next: a label that keeps its step
    // slides with the map, and one that changes it jumps. The measure below is the length
    // of that change, over two drags of different speed and zoom.
    const grid = buildCoarseRegionGrid(fillRegionGrid());
    const drags: { name: string; view: (frame: number) => View }[] = [
      {
        name: '30 light years a frame at the galactic centre',
        view: (frame) => ({
          cursor: [frame * 30, 0, 25895],
          distance: 2000,
          yaw: 0,
          pitch: 35,
        }),
      },
      {
        name: '200 light years a frame at a distance of 20000',
        view: (frame) => ({
          cursor: [frame * 200, 0, 0],
          distance: 20000,
          yaw: 0,
          pitch: 35,
        }),
      },
    ];
    for (const drag of drags) {
      let memory: LabelMemory = memoryOf([]);
      const before = new Map<number, PlanePoint>();
      const steps = new Map<number, { x: number; y: number }>();
      const rough: number[] = [];
      for (let frame = 0; frame < 90; frame += 1) {
        const samples = sampleFrame(drag.view(frame), VIEWPORT, grid);
        const shown = labelCandidates(
          samples,
          VIEWPORT,
          REGIONS,
          memory,
          measure,
        ).slice(0, MAX_LABELS);
        for (const one of shown) {
          const carried = before.get(one.id);
          before.set(one.id, one.plane);
          if (carried === undefined) continue;
          // Both points go through this frame's projection, so the measure holds the walk
          // of the label over the map and not the pan of the map itself.
          const was = samples.toScreen(carried.x, carried.z);
          const now = samples.toScreen(one.plane.x, one.plane.z);
          if (was === null || now === null) continue;
          // A label that leaves its region or the frame reads nothing about the walk,
          // so it leaves the measure and takes the step before it with it.
          const kept =
            samples.regionAtPlane(carried.x, carried.z) === one.id &&
            was.x >= 0 &&
            was.y >= 0 &&
            was.x <= VIEWPORT.width &&
            was.y <= VIEWPORT.height;
          if (!kept) {
            steps.delete(one.id);
            continue;
          }
          const step = { x: now.x - was.x, y: now.y - was.y };
          const last = steps.get(one.id);
          steps.set(one.id, step);
          if (last === undefined) continue;
          rough.push(Math.hypot(step.x - last.x, step.y - last.y));
        }
        memory = {
          previous: new Set(shown.map((one) => one.id)),
          anchors: new Map(shown.map((one) => [one.id, one.plane])),
          targets: new Map(shown.map((one) => [one.id, one.target])),
        };
      }
      rough.sort((first, second) => first - second);
      const at = (share: number): number =>
        rough[Math.min(rough.length - 1, Math.floor(rough.length * share))] as number;
      console.log(
        'over a drag of',
        drag.name,
        'the step of the label changes by',
        at(0.5),
        'CSS pixels in a middle frame,',
        at(0.9),
        'in the worst tenth and',
        at(1),
        'at worst, over',
        rough.length,
        'readings',
      );
      expect(rough.length).toBeGreaterThan(200);
      // Taking each frame's target whole gives 1.0 in a middle frame and 3.0 in the worst
      // tenth. Smoothing the target and reading the gap for the speed hold both down.
      expect(at(0.5)).toBeLessThan(0.2);
      expect(at(0.9)).toBeLessThan(0.7);
      // The worst reading of the faster drag is a target that really relocates: a region
      // that shows as two patches moves its target above the reset figure. The label goes
      // there, and the cap bounds what one frame of that costs.
      expect(at(1)).toBeLessThanOrEqual(ANCHOR_MAX_PIXELS);
    }
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
        targets: new Map(placed.map((label) => [label.id, label.target])),
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

describe('the label walk under a zoom', () => {
  const grid = buildCoarseRegionGrid(fillRegionGrid());

  /**
   * How much each label moves over the map from one frame to the next. The measure is
   * the offset of the label from the projection of its own region centre, because a
   * label that holds that offset slides with the map and reads as still. A change of
   * the offset is the label moving by itself, which is what a person sees as a jump.
   */
  function drift(views: View[]): { worst: number; median: number; mean: number } {
    let memory: LabelMemory = memoryOf([]);
    const before = new Map<number, { offset: AnchorPoint; frame: number }>();
    const readings: number[] = [];
    let frame = -1;
    for (const view of views) {
      frame += 1;
      const samples = sampleFrame(view, VIEWPORT, grid);
      const shown = labelCandidates(samples, VIEWPORT, REGIONS, memory, measure).slice(
        0,
        MAX_LABELS,
      );
      for (const one of shown) {
        const region = REGIONS.find((candidate) => candidate.id === one.id) as Region;
        const centre = samples.toScreen(region.centroid[0], region.centroid[1]);
        // A centre outside the frame is no reference: a plane point near the horizon
        // projects to a very large number, and the offset then reads that number and
        // not the label. Those readings belong to the displaced rule, not this measure.
        if (
          centre === null ||
          centre.x < 0 ||
          centre.y < 0 ||
          centre.x > VIEWPORT.width ||
          centre.y > VIEWPORT.height
        ) {
          before.delete(one.id);
          continue;
        }
        const offset = { x: one.anchor.x - centre.x, y: one.anchor.y - centre.y };
        const was = before.get(one.id);
        before.set(one.id, { offset, frame });
        if (was === undefined || was.frame !== frame - 1) continue;
        readings.push(Math.hypot(offset.x - was.offset.x, offset.y - was.offset.y));
      }
      memory = {
        previous: new Set(shown.map((one) => one.id)),
        anchors: new Map(shown.map((one) => [one.id, one.plane])),
        targets: new Map(shown.map((one) => [one.id, one.target])),
      };
    }
    readings.sort((a, b) => a - b);
    return {
      worst: Math.max(...readings),
      median: readings[Math.floor(readings.length / 2)] as number,
      mean: readings.reduce((sum, one) => sum + one, 0) / readings.length,
    };
  }

  /** A wheel notch, and then the still frames while the person reads the map. */
  function notches(count: number, still: number, from = 30000): View[] {
    const views: View[] = [];
    let distance = from;
    for (let notch = 0; notch < count; notch += 1) {
      distance /= ZOOM_PER_NOTCH;
      for (let frame = 0; frame <= still; frame += 1) {
        views.push({ cursor: [0, 0, 20000], distance, yaw: 0, pitch: 35 });
      }
    }
    return views;
  }

  test('moves the label over the map no more than a drag does', () => {
    // A drag of 60 light years a frame, which is a fast pointer drag at this distance.
    const drag: View[] = [];
    for (let frame = 0; frame < 160; frame += 1) {
      drag.push({ cursor: [frame * 60, 0, 20000], distance: 6000, yaw: 0, pitch: 35 });
    }
    const dragged = drift(drag);
    // Wheel notches, each a change of distance of 15 percent in one frame.
    const zoomed = drift(notches(28, 6));
    // A wheel that a person holds down, with no still frame between the notches.
    const held = drift(notches(28, 0));
    console.log('the label drift under a drag', dragged);
    console.log('the label drift under wheel notches', zoomed);
    console.log('the label drift under a held wheel', held);
    // A zoom reads like a drag. Both leave the label on its region, and neither moves
    // it over the map by more than a few pixels in a frame.
    expect(dragged.worst).toBeLessThan(8);
    expect(zoomed.worst).toBeLessThan(12);
    expect(zoomed.mean).toBeLessThan(1);
    // A held wheel gives the filter no still frame to settle in, so it is the hardest
    // case. It still holds a label to a step a person reads as a slide.
    expect(held.worst).toBeLessThan(20);
    expect(held.mean).toBeLessThan(2);
  }, 200000);
});

describe('the label settles while the camera is still', () => {
  const grid = buildCoarseRegionGrid(fillRegionGrid());

  test('holds one place after a view that does not change', () => {
    // The browser test screenshots this view twice and asks for the same bytes, so a
    // label that still moves shows as a difference.
    const view: View = { cursor: [0, 0, 0], distance: 10, yaw: 0, pitch: 35 };
    let memory: LabelMemory = memoryOf([]);
    const seen: { frame: number; id: number; x: number; y: number }[] = [];
    for (let frame = 0; frame < 240; frame += 1) {
      const samples = sampleFrame(view, VIEWPORT, grid);
      const placed = chooseLabels(samples, VIEWPORT, measure, REGIONS, memory);
      for (const one of placed)
        seen.push({ frame, id: one.id, x: one.left, y: one.top });
      memory = {
        previous: new Set(placed.map((one) => one.id)),
        anchors: new Map(placed.map((one) => [one.id, one.plane])),
        targets: new Map(placed.map((one) => [one.id, one.target])),
      };
    }
    const late = seen.filter((one) => one.frame >= 200);
    const byId = new Map<number, Set<string>>();
    for (const one of late) {
      const key = `${one.x},${one.y}`;
      const set = byId.get(one.id) ?? new Set<string>();
      set.add(key);
      byId.set(one.id, set);
    }
    for (const [id, places] of byId) {
      console.log('region', id, 'shows', places.size, 'places over the last 40 frames');
    }
    for (const [, places] of byId) expect(places.size).toBe(1);
  }, 120000);

  test('puts the label of the region under the camera near the middle', () => {
    // At this distance the region fills the frame and its centre projects far outside it.
    // The centre rule says nothing there: holding a projection that far away inside the
    // inset gives a corner. The frame's own samples answer, and their mean is mid-frame.
    const view: View = { cursor: [0, 0, 0], distance: 10, yaw: 0, pitch: 35 };
    const samples = sampleFrame(view, VIEWPORT, grid);
    const placed = chooseLabels(samples, VIEWPORT, measure, REGIONS);
    const one = placed.find((label) => label.name === 'Inner Orion Spur');
    expect(one).toBeDefined();
    if (one === undefined) return;
    const middle = { x: VIEWPORT.width / 2, y: VIEWPORT.height / 2 };
    const at = { x: one.left + one.width / 2, y: one.top + one.height / 2 };
    console.log('the label of the region under the camera sits at', at);
    // Well inside the frame, and not against an edge of it.
    expect(Math.abs(at.x - middle.x)).toBeLessThan(VIEWPORT.width / 4);
    expect(Math.abs(at.y - middle.y)).toBeLessThan(VIEWPORT.height / 4);
  }, 120000);
});

describe('the label after a view jump', () => {
  const grid = buildCoarseRegionGrid(fillRegionGrid());

  test('reaches its place at the cap and does not crawl', () => {
    // The page jumps from one view to another, which is what a link with a fragment does.
    // The label of the region the camera sits in must go to its new place at the speed the
    // cap allows. The projection near the camera is strongly not linear, so a step worked
    // out on the plane alone covers far fewer pixels than it should, and the label crawls.
    const spur = REGIONS.find((region) => region.name === 'Inner Orion Spur') as Region;
    let memory: LabelMemory = memoryOf([]);
    let arrived = -1;
    const run = (view: View, frames: number, read: boolean): void => {
      for (let frame = 0; frame < frames; frame += 1) {
        const samples = sampleFrame(view, VIEWPORT, grid);
        const shown = labelCandidates(samples, VIEWPORT, REGIONS, memory, measure);
        const one = shown.find((candidate) => candidate.id === spur.id);
        if (read && one !== undefined && arrived < 0) {
          const target = samples.toScreen(one.target.x, one.target.z);
          if (
            target !== null &&
            Math.hypot(one.anchor.x - target.x, one.anchor.y - target.y) <= 8
          ) {
            arrived = frame;
          }
        }
        const placed = chooseLabels(samples, VIEWPORT, measure, REGIONS, memory);
        memory = {
          previous: new Set(placed.map((each) => each.id)),
          anchors: new Map(placed.map((each) => [each.id, each.plane])),
          targets: new Map(placed.map((each) => [each.id, each.target])),
        };
      }
    };
    run({ cursor: [0, 0, 0], distance: 640, yaw: 0, pitch: 35 }, 120, false);
    run({ cursor: [0, 0, 0], distance: 10, yaw: 0, pitch: 35 }, 90, true);
    console.log('the label reaches its place at frame', arrived);
    expect(arrived).toBeGreaterThanOrEqual(0);
    // The same 8 pixel mark the pushed label reads. A step that corrects downward alone
    // never got there: the anchor crawled at a third of the cap and took over a second.
    expect(arrived).toBeLessThanOrEqual(30);
  }, 120000);
});
