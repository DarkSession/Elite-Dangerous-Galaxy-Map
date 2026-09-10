import { mat4 } from 'gl-matrix';
import { describe, expect, test, vi } from 'vitest';
import { planePoint } from '../camera/projection';
import type { Viewport } from '../camera/projection';
import { MAX_PITCH, MIN_PITCH } from '../camera/view';
import type { View } from '../camera/view';
import {
  createLabelOverlay,
  fitPlacementBuffers,
  LABEL_BELOW_PLANE,
  LABEL_DRAWN,
  LABEL_FLOOR_SCALE,
  LABEL_FULL_SCALE,
  LABEL_MARGIN_CSS,
  LABEL_NO_ANCHOR,
  LABEL_NO_ROOM,
  LABEL_OFF_SCREEN,
  LABEL_OTHER_REGION,
  labelClearanceAt,
  labelFade,
  labelSource,
  markCandidates,
  placeLabels,
  planeMap,
  requiredClearance,
} from './labels';
import type {
  LabelBox,
  LabelSize,
  LabelSource,
  PlaneMap,
  PlacedLabel,
  PlacementBuffers,
  PlacementWork,
} from './labels';
// The test builds the data the page gets from the region worker. The page never
// imports these modules: they would pull the 199 KiB region lookup into the main
// bundle, which `tests/main-bundle.test.ts` holds the line against.
import {
  buildClearanceField,
  CLEARANCE_DOWNSAMPLE,
  clearanceAt,
} from '../scene-data/clearance';
import { buildRegionData, fillRegionGrid } from '../scene-data/region-lines';
import type { RegionData } from '../scene-data/region-lines';
import { coarseRegionIdAt, REGIONS } from '../scene-data/regions';
import type { Region } from '../scene-data/regions';
import { REGION_FADE_IN_FAR, REGION_LINE_WIDTH_CSS } from '../render/region-pass';
import type {
  CoarseRegionGrid,
  RegionClearanceField,
  RegionLabelGeometry,
  RegionLines,
} from '../scene-data/types';

const VIEWPORT = { width: 1280, height: 720 };
const WIDE = { width: 1920, height: 1080 };

/** The view every count in the spec is measured at. */
const LABEL_VIEW: View = { cursor: [15, 0, 25895], distance: 20000, yaw: 0, pitch: 35 };

/**
 * The width of each region name at the style the page draws it with, in CSS pixels,
 * measured in Chromium at 13 px, uppercase, with 0.08 em of letter spacing and 6 px of
 * padding on each side, and rounded up as the overlay rounds it. The height is 20 for
 * every name. The counts this file reports rest on these, because the box is a fixed
 * number of pixels while the light years under a pixel are not.
 */
const LABEL_WIDTHS: Readonly<Record<string, number>> = {
  'Galactic Centre': 140,
  'Empyrean Straits': 150,
  "Ryker's Hope": 112,
  "Odin's Hold": 107,
  'Norma Arm': 102,
  'Arcadian Stream': 146,
  Izanami: 74,
  'Inner Orion-Perseus Conflux': 246,
  'Inner Scutum-Centaurus Arm': 246,
  'Norma Expanse': 132,
  'Trojan Belt': 104,
  'The Veils': 83,
  "Newton's Vault": 136,
  'The Conduit': 110,
  'Outer Orion-Perseus Conflux': 249,
  'Orion-Cygnus Arm': 159,
  Temple: 67,
  'Inner Orion Spur': 151,
  "Hawking's Gap": 126,
  "Dryman's Point": 135,
  'Sagittarius-Carina Arm': 199,
  'Mare Somnia': 114,
  Acheron: 81,
  'Formorian Frontier': 174,
  'Hieronymus Delta': 156,
  'Outer Scutum-Centaurus Arm': 248,
  'Outer Arm': 96,
  "Aquila's Halo": 120,
  'Errant Marches': 140,
  'Perseus Arm': 110,
  'Formidine Rift': 129,
  'Vulcan Gate': 109,
  'Elysian Shore': 122,
  'Sanguineous Rim': 148,
  'Outer Orion Spur': 153,
  "Achilles's Altar": 138,
  Xibalba: 72,
  "Lyra's Song": 103,
  Tenebrae: 84,
  'The Abyss': 88,
  "Kepler's Crest": 124,
  'The Void': 80,
};

/** The height of every label box at full size, in CSS pixels. */
const LABEL_HEIGHT = 20;

/** The box of a region name at a scale, as the page measures it. */
function measure(name: string, scale: number): LabelSize {
  return { width: (LABEL_WIDTHS[name] ?? 100) * scale, height: LABEL_HEIGHT * scale };
}

/** A small box, for the tests that read a rule rather than a measured count. */
function smallBox(name: string, scale: number): LabelSize {
  return { width: (12 + name.length * 9) * scale, height: 20 * scale };
}

/** The worker output, built once for the file because it costs about 400 ms. */
let built: RegionData | null = null;
function regionData(): RegionData {
  built ??= buildRegionData();
  return built;
}

let realSource: LabelSource | null = null;
function sourceOfRegions(): LabelSource {
  const data = regionData();
  realSource ??= labelSource(data.grid, data.geometry, data.lines);
  return realSource;
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

/** The cell of the trace grid, in light years, as the label rule reads it. */
function traceCell(geometry: RegionLabelGeometry): number {
  return geometry.field.cell / CLEARANCE_DOWNSAMPLE;
}

/** A coarse grid over the model bounds whose ids come from a plane function. */
function gridOf(
  idAt: (x: number, z: number) => number,
  size = 512,
  cell = 200,
): CoarseRegionGrid {
  const half = (size * cell) / 2;
  const ids = new Uint8Array(size * size);
  for (let iz = 0; iz < size; iz += 1) {
    for (let ix = 0; ix < size; ix += 1) {
      ids[iz * size + ix] = idAt(-half + (ix + 0.5) * cell, -half + (iz + 0.5) * cell);
    }
  }
  return { size, origin: [-half, -half], cell, ids };
}

/**
 * A clearance field at the cell the shipped field uses, which is eight cells of the
 * trace grid. The values come from a plane function, in light years.
 */
function fieldOf(
  valueAt: (x: number, z: number) => number,
  size = 512,
): RegionClearanceField {
  const cell = 49.3494 * CLEARANCE_DOWNSAMPLE;
  const half = (size * cell) / 2;
  const values = new Uint16Array(size * size);
  for (let iz = 0; iz < size; iz += 1) {
    for (let ix = 0; ix < size; ix += 1) {
      values[iz * size + ix] = valueAt(-half + ix * cell, -half + iz * cell);
    }
  }
  return { size, origin: [-half, -half], cell, values };
}

/** The label geometry of a set of centres and clearances. */
function geometryOf(
  centres: Readonly<Record<number, readonly [number, number]>>,
  clearances: Readonly<Record<number, number>>,
  field: RegionClearanceField,
  departureLy = 200,
): RegionLabelGeometry {
  const ids = Object.keys(centres).map(Number);
  const count = Math.max(...ids);
  const centreArray = new Float32Array(count * 2).fill(Number.NaN);
  const clearanceArray = new Uint16Array(count);
  for (const id of ids) {
    const centre = centres[id] as readonly [number, number];
    centreArray[(id - 1) * 2] = centre[0];
    centreArray[(id - 1) * 2 + 1] = centre[1];
    clearanceArray[id - 1] = clearances[id] ?? 0;
  }
  return { centres: centreArray, clearances: clearanceArray, field, departureLy };
}

/** A boundary set from chains given as plane polylines with the pair they separate. */
function linesOf(
  chains: readonly {
    readonly pair: readonly [number, number];
    readonly points: readonly (readonly [number, number])[];
  }[],
): RegionLines {
  let vertexCount = 0;
  for (const chain of chains) vertexCount += chain.points.length;
  const positions = new Float32Array(Math.max(1, vertexCount) * 3);
  const first = new Uint32Array(chains.length);
  const last = new Uint32Array(chains.length);
  const pairs = new Uint8Array(chains.length * 2);
  let vertex = 0;
  for (let index = 0; index < chains.length; index += 1) {
    const chain = chains[index] as (typeof chains)[number];
    first[index] = vertex;
    for (const point of chain.points) {
      positions[vertex * 3] = point[0];
      positions[vertex * 3 + 2] = point[1];
      vertex += 1;
    }
    last[index] = vertex - 1;
    pairs[index * 2] = chain.pair[0];
    pairs[index * 2 + 1] = chain.pair[1];
  }
  return {
    chainCount: chains.length,
    vertexCount,
    positions,
    curvature: new Float32Array(Math.max(1, vertexCount)),
    first,
    last,
    pairs,
  };
}

/** The five points of a label box, as the browser scenario reads them. */
function boxPoints(label: PlacedLabel): readonly (readonly [number, number])[] {
  return [
    [label.left, label.top],
    [label.left + label.width, label.top],
    [label.left, label.top + label.height],
    [label.left + label.width, label.top + label.height],
    [label.left + label.width / 2, label.top + label.height / 2],
  ];
}

/**
 * True when two boxes share an area. The placement has no label against label rule, so
 * this is a check the tests make and not a rule the page runs.
 */
function boxesOverlap(first: LabelBox, second: LabelBox): boolean {
  return (
    first.left < second.left + second.width &&
    second.left < first.left + first.width &&
    first.top < second.top + second.height &&
    second.top < first.top + first.height
  );
}

/**
 * The plane point under a screen point, with no check of the sign. A ray that misses
 * the plane still gives a mirrored point here, which is the point the corner guard
 * drops.
 */
function unclippedPlaneUnder(map: PlaneMap, u: number, v: number): [number, number] {
  const back = map.back;
  const s = back[6] * u + back[7] * v + back[8];
  return [
    (back[0] * u + back[1] * v + back[2]) / s,
    (back[3] * u + back[4] * v + back[5]) / s,
  ];
}

/** The plane point under a screen point, read from the map of the frame. */
function planeUnder(map: PlaneMap, u: number, v: number): [number, number] | null {
  const back = map.back;
  const s = back[6] * u + back[7] * v + back[8];
  if (s <= 0) return null;
  return [
    (back[0] * u + back[1] * v + back[2]) / s,
    (back[3] * u + back[4] * v + back[5]) / s,
  ];
}

/** The screen point of a plane point, read from the map of the frame. */
function screenOf(map: PlaneMap, x: number, z: number): [number, number, number] {
  const forward = map.forward;
  const t = forward[6] * x + forward[7] * z + forward[8];
  return [
    (forward[0] * x + forward[1] * z + forward[2]) / t,
    (forward[3] * x + forward[4] * z + forward[5]) / t,
    t,
  ];
}

/**
 * The light years one CSS pixel covers at a screen point, in the direction that covers
 * most. It is the largest singular value of the Jacobian of the plane map there, read
 * by a difference of one pixel on each screen axis.
 */
function perPixelAt(map: PlaneMap, u: number, v: number): number {
  const at = planeUnder(map, u, v) as [number, number];
  const right = planeUnder(map, u + 1, v) as [number, number];
  const down = planeUnder(map, u, v + 1) as [number, number];
  const a = right[0] - at[0];
  const c = right[1] - at[1];
  const b = down[0] - at[0];
  const d = down[1] - at[1];
  const square = a * a + b * b + c * c + d * d;
  const determinant = a * d - b * c;
  const inside = Math.max(0, square * square - 4 * determinant * determinant);
  return Math.sqrt((square + Math.sqrt(inside)) / 2);
}

/** The middle of the median value of a list. */
function median(values: readonly number[]): number {
  const sorted = [...values].sort((first, second) => first - second);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] as number;
  return (((sorted[middle - 1] as number) + (sorted[middle] as number)) as number) / 2;
}

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

describe('the plane map', () => {
  test('gives the same screen point and plane point as the camera does', () => {
    const views: View[] = [
      LABEL_VIEW,
      { cursor: [0, 0, 0], distance: 500, yaw: 137, pitch: MIN_PITCH },
      { cursor: [1000, 300, -2000], distance: 60000, yaw: 300, pitch: MAX_PITCH },
    ];
    for (const view of views) {
      const map = planeMap(view, VIEWPORT);
      for (const point of [
        [0, 0],
        [25000, 25000],
        [-40000, 12000],
      ]) {
        const screen = screenOf(map, point[0] as number, point[1] as number);
        const exact = planePoint(view, { x: screen[0], y: screen[1] }, VIEWPORT, 0);
        if (screen[2] <= 0) continue;
        expect(exact).not.toBeNull();
        expect((exact as number[])[0]).toBeCloseTo(point[0] as number, 1);
        expect((exact as number[])[2]).toBeCloseTo(point[1] as number, 1);
      }
      for (const pixel of [
        [640, 360],
        [10, 700],
        [1270, 20],
      ]) {
        const under = planeUnder(map, pixel[0] as number, pixel[1] as number);
        const exact = planePoint(
          view,
          { x: pixel[0] as number, y: pixel[1] as number },
          VIEWPORT,
          0,
        );
        if (under === null) {
          expect(exact).toBeNull();
          continue;
        }
        expect(under[0]).toBeCloseTo((exact as number[])[0] as number, 1);
        expect(under[1]).toBeCloseTo((exact as number[])[2] as number, 1);
      }
    }
  });

  test('builds the view-projection matrix once for a frame', () => {
    const multiply = vi.spyOn(mat4, 'multiply');
    const source = sourceOfRegions();
    const placement = placeLabels(LABEL_VIEW, WIDE, source, measure);
    expect(placement.labels.length).toBeGreaterThan(0);
    // `viewProjectionMatrix` is the only caller of `mat4.multiply` in the placement.
    expect(multiply).toHaveBeenCalledTimes(1);
    multiply.mockRestore();
  }, 120000);
});

describe('candidacy', () => {
  const work = (): { projections: number; vertexProjections: number } => ({
    projections: 0,
    vertexProjections: 0,
  });

  test('projects the vertex set once for the frame', () => {
    const source = sourceOfRegions();
    const buffers = fitPlacementBuffers(null, source.lines.vertexCount);
    const counts = work();
    markCandidates(planeMap(LABEL_VIEW, WIDE), WIDE, source, buffers, REGIONS, counts);
    console.log(
      'candidacy projects',
      counts.vertexProjections,
      'vertices of',
      source.lines.vertexCount,
      'and',
      counts.projections,
      'plane points in all',
    );
    expect(counts.vertexProjections).toBe(source.lines.vertexCount);
    // Each of the segments belongs to two regions, so a region that projected its own
    // segments would make about three times this many endpoint projections.
    expect(counts.projections).toBeLessThan(source.lines.vertexCount * 1.5);
  }, 120000);

  test('takes a region that fills the frame with no boundary and no centre in view', () => {
    const regions = [regionOf(1, 'All Around')];
    const source = labelSource(
      gridOf(() => 1),
      geometryOf(
        { 1: [40000, 40000] },
        { 1: 5000 },
        fieldOf(() => 5000),
      ),
      linesOf([{ pair: [1, 2], points: [[40000, 40000] as const, [41000, 41000]] }]),
    );
    const view: View = { cursor: [0, 0, 0], distance: 500, yaw: 0, pitch: MAX_PITCH };
    const map = planeMap(view, WIDE);
    // Neither the centre nor the boundary projects inside the frame.
    const centre = screenOf(map, 40000, 40000);
    expect(centre[0] > WIDE.width || centre[1] > WIDE.height || centre[2] <= 0).toBe(
      true,
    );
    const buffers = fitPlacementBuffers(null, source.lines.vertexCount);
    const candidate = markCandidates(map, WIDE, source, buffers, regions, work());
    expect(candidate[1]).toBe(1);
  });

  test('ignores a frame corner whose ray misses the plane', () => {
    const view: View = { cursor: [0, 0, 0], distance: 20000, yaw: 0, pitch: MIN_PITCH };
    const map = planeMap(view, VIEWPORT);
    // At a pitch of 5 the whole top edge of the frame looks above the horizon.
    expect(planePoint(view, { x: 0, y: 0 }, VIEWPORT, 0)).toBeNull();
    expect(planePoint(view, { x: VIEWPORT.width, y: 0 }, VIEWPORT, 0)).toBeNull();
    // The mirrored plane points of the two top corners. Region 3 covers them and
    // nothing else, so only a missed corner can reach it.
    const missed = [
      unclippedPlaneUnder(map, 0, 0),
      unclippedPlaneUnder(map, VIEWPORT.width, 0),
    ];
    console.log(
      'the top corners mirror to',
      missed
        .map((point) => point.map((value) => value.toFixed(0)).join(','))
        .join(' and '),
    );
    const idAt = (x: number, z: number): number => {
      const near = missed.some(
        (point) => Math.hypot(x - point[0], z - point[1]) < 2000,
      );
      if (near) return 3;
      return x < 0 ? 1 : 2;
    };
    const regions = [
      regionOf(1, 'Left Region'),
      regionOf(2, 'Right Region'),
      regionOf(3, 'Missed Region'),
    ];
    const source = labelSource(
      gridOf(idAt),
      geometryOf(
        { 1: [-20000, 0], 2: [20000, 0], 3: missed[0] as [number, number] },
        { 1: 5000, 2: 5000, 3: 500 },
        fieldOf(() => 5000),
      ),
      linesOf([{ pair: [1, 2], points: [[0, -60000] as const, [0, 60000]] }]),
    );
    // The grid holds region 3 where the corners mirror to, and the centre of region 3
    // sits behind the camera, so no other rule can mark it.
    for (const point of missed) {
      expect(coarseRegionIdAt(source.grid, point[0], point[1])).toBe(3);
      expect(screenOf(map, point[0], point[1])[2]).toBeLessThanOrEqual(0);
    }
    const middle = planePoint(
      view,
      { x: VIEWPORT.width / 2, y: VIEWPORT.height / 2 },
      VIEWPORT,
      0,
    );
    expect(middle).not.toBeNull();
    const under = coarseRegionIdAt(
      source.grid,
      (middle as number[])[0] as number,
      (middle as number[])[2] as number,
    );
    expect(under).not.toBe(3);
    const buffers = fitPlacementBuffers(null, source.lines.vertexCount);
    const candidate = markCandidates(map, VIEWPORT, source, buffers, regions, work());
    expect(candidate[under]).toBe(1);
    expect(candidate[3]).toBe(0);
  });

  test('does not take a region on a boundary segment behind the camera', () => {
    // The mirror of a plane point through the camera sits above the camera, so it can
    // only land inside the frame at a pitch whose top edge looks above the horizon.
    const view: View = { cursor: [0, 0, 0], distance: 500, yaw: 0, pitch: MIN_PITCH };
    const map = planeMap(view, VIEWPORT);
    let mirrored: [number, number] | null = null;
    for (let z = -600; z > -40000 && mirrored === null; z -= 50) {
      for (let x = -2000; x <= 2000; x += 50) {
        const screen = screenOf(map, x, z);
        if (screen[2] >= 0) continue;
        if (screen[0] < 0 || screen[0] > VIEWPORT.width) continue;
        if (screen[1] < 0 || screen[1] > VIEWPORT.height) continue;
        mirrored = [x, z];
        break;
      }
    }
    expect(mirrored).not.toBeNull();
    const end = mirrored as [number, number];
    const image = screenOf(map, end[0], end[1]);
    console.log(
      'the plane point',
      end.map((value) => value.toFixed(0)).join(','),
      'sits behind the camera and its unclipped projection lands at',
      image[0].toFixed(0),
      image[1].toFixed(0),
    );
    // The whole segment sits behind the camera, and no part of the region is in the
    // frame: the grid holds no region anywhere the frame reads.
    const regions = [regionOf(3, 'Behind Region')];
    const source = labelSource(
      gridOf(() => 0),
      geometryOf(
        { 3: [0, -60000] },
        { 3: 5000 },
        fieldOf(() => 5000),
      ),
      linesOf([{ pair: [3, 4], points: [end, [end[0], end[1] - 5000] as const] }]),
    );
    const buffers = fitPlacementBuffers(null, source.lines.vertexCount);
    const candidate = markCandidates(map, VIEWPORT, source, buffers, regions, work());
    expect(candidate[3]).toBe(0);
    // The same segment, moved in front of the camera, does make the region a
    // candidate, so the test reads the clip and not an empty rule.
    const front = labelSource(
      gridOf(() => 0),
      geometryOf(
        { 3: [0, -60000] },
        { 3: 5000 },
        fieldOf(() => 5000),
      ),
      linesOf([
        { pair: [3, 4], points: [[-2000, 2000] as const, [2000, 2000] as const] },
      ]),
    );
    const second = markCandidates(map, VIEWPORT, front, buffers, regions, work());
    expect(second[3]).toBe(1);
  });
});

describe('the required clearance', () => {
  const geometry = geometryOf(
    { 1: [0, 0] },
    { 1: 5000 },
    fieldOf(() => 5000),
  );

  test('measures the footprint on the plane and not by the pixel diagonal', () => {
    const source = sourceOfRegions();
    const ratios: { name: string; ratio: number }[] = [];
    for (const viewport of [VIEWPORT, WIDE]) {
      const map = planeMap(LABEL_VIEW, viewport);
      const placement = placeLabels(
        LABEL_VIEW,
        viewport,
        source,
        measure,
        REGIONS,
        null,
      );
      const rows: number[] = [];
      const footprints: number[] = [];
      for (const label of placement.labels) {
        const size = measure(label.name, label.scale);
        const anchorU = label.left + label.width / 2;
        const anchorV = label.top + label.height / 2;
        const plane = requiredClearance(
          map,
          source.geometry,
          anchorU,
          anchorV,
          label.plane.x,
          label.plane.z,
          size,
          { unprojections: 0 },
        );
        expect(plane).not.toBeNull();
        // The pixel form: half the pixel diagonal of the box, converted at the largest
        // light years per pixel over the same four corners.
        let perPixel = 0;
        for (const corner of boxPoints(label).slice(0, 4)) {
          perPixel = Math.max(perPixel, perPixelAt(map, corner[0], corner[1]));
        }
        const pixel =
          (Math.hypot(size.width, size.height) / 2) * perPixel +
          source.geometry.departureLy +
          (REGION_LINE_WIDTH_CSS / 2) * perPixel +
          2 * traceCell(source.geometry);
        const ratio = pixel / (plane as number);
        // The same comparison over the footprint term alone, without the three
        // constants both forms carry, which dilute the ratio.
        const constants =
          source.geometry.departureLy +
          (REGION_LINE_WIDTH_CSS / 2) * perPixel +
          2 * traceCell(source.geometry);
        footprints.push(
          ((Math.hypot(size.width, size.height) / 2) * perPixel) /
            ((plane as number) - constants),
        );
        rows.push(ratio);
        ratios.push({ name: label.name, ratio });
        expect(ratio).toBeGreaterThan(1);
      }
      console.log(
        'the pixel form asks a median of',
        median(rows).toFixed(4),
        'times the plane form at',
        `${viewport.width}x${viewport.height}`,
        'over',
        rows.length,
        'labels',
      );
      console.log(
        'over the footprint term alone the median is',
        median(footprints).toFixed(4),
      );
      expect(median(rows)).toBeGreaterThanOrEqual(1.5);
    }
    const smallest = ratios.reduce((low, row) => (row.ratio < low.ratio ? row : low));
    console.log(
      'the smallest ratio is',
      smallest.ratio.toFixed(2),
      'on',
      smallest.name,
    );
  }, 120000);

  test('refuses a box whose corner reaches past the horizon', () => {
    const view: View = { cursor: [0, 0, 0], distance: 20000, yaw: 0, pitch: MIN_PITCH };
    const map = planeMap(view, VIEWPORT);
    // The horizon is the row above which no ray meets the plane.
    let horizon = 0;
    for (let v = 0; v < VIEWPORT.height; v += 1) {
      if (planeUnder(map, VIEWPORT.width / 2, v) !== null) {
        horizon = v;
        break;
      }
    }
    expect(horizon).toBeGreaterThan(0);
    const anchor = planeUnder(map, VIEWPORT.width / 2, horizon + 8) as [number, number];
    const across = requiredClearance(
      map,
      geometry,
      VIEWPORT.width / 2,
      horizon + 8,
      anchor[0],
      anchor[1],
      { width: 140, height: 20 },
      { unprojections: 0 },
    );
    expect(across).toBeNull();
    // The same anchor with a box the horizon does not cross is measured, not refused.
    const under = requiredClearance(
      map,
      geometry,
      VIEWPORT.width / 2,
      horizon + 8,
      anchor[0],
      anchor[1],
      { width: 140, height: 2 },
      { unprojections: 0 },
    );
    expect(under).not.toBeNull();
  });

  test('holds the departure bound and the two trace cells', () => {
    const map = planeMap(LABEL_VIEW, VIEWPORT);
    const anchor = planeUnder(map, 640, 400) as [number, number];
    const needed = requiredClearance(
      map,
      geometry,
      640,
      400,
      anchor[0],
      anchor[1],
      { width: 140, height: 20 },
      { unprojections: 0 },
    ) as number;
    const noDeparture = needed - geometry.departureLy;
    const noCells = needed - 2 * traceCell(geometry);
    expect(noDeparture).toBeLessThan(needed);
    expect(noCells).toBeLessThan(needed);
    // A region with exactly that much room is refused by the rule and would be
    // accepted by a rule that dropped either term.
    const regions = [regionOf(1, 'Tight Region')];
    const drawnWith = (clearance: number): PlacedLabel | undefined => {
      const source = labelSource(
        gridOf(() => 1),
        geometryOf(
          { 1: [anchor[0], anchor[1]] },
          { 1: clearance },
          fieldOf(() => 0),
        ),
        linesOf([]),
      );
      const placement = placeLabels(
        LABEL_VIEW,
        VIEWPORT,
        source,
        () => ({ width: 140, height: 20 }),
        regions,
        null,
      );
      return placement.labels[0];
    };
    expect(drawnWith(Math.ceil(needed) + 1)?.scale).toBe(1);
    expect(drawnWith(Math.floor(noDeparture))?.scale ?? 0).toBeLessThan(1);
    expect(drawnWith(Math.floor(noCells))?.scale ?? 0).toBeLessThan(1);
  });
});

describe('the clearance the placement reads', () => {
  test('is exact at every region centre, where the field alone reads low', () => {
    const data = regionData();
    const geometry = data.geometry;
    const shortfalls: number[] = [];
    for (const region of REGIONS) {
      const x = geometry.centres[(region.id - 1) * 2] as number;
      const z = geometry.centres[(region.id - 1) * 2 + 1] as number;
      const exact = geometry.clearances[region.id - 1] as number;
      expect(labelClearanceAt(geometry, region.id, x, z)).toBeCloseTo(exact, 6);
      shortfalls.push(exact - ((clearanceAt(geometry.field, x, z) as number) ?? 0));
    }
    console.log(
      'the field alone reads a median of',
      median(shortfalls).toFixed(0),
      'light years low at the 42 centres',
    );
    expect(median(shortfalls)).toBeGreaterThan(0);
  }, 120000);

  test('never claims more room than the exact field holds', () => {
    const grid = fillRegionGrid();
    const exact = buildClearanceField(grid);
    const geometry = regionData().geometry;
    const allowance = 2 * traceCell(geometry);
    let points = 0;
    let worstRead = 0;
    let worstCentre = 0;
    let larger = 0;
    for (let iz = 0; iz < grid.size; iz += 5) {
      for (let ix = 0; ix < grid.size; ix += 5) {
        const id = grid.ids[iz * grid.size + ix] as number;
        if (id === 0 || id > REGIONS.length) continue;
        const x = (exact.origin[0] as number) + ix * exact.cell;
        const z = (exact.origin[1] as number) + iz * exact.cell;
        const truth = exact.values[iz * grid.size + ix] as number;
        const read = labelClearanceAt(geometry, id, x, z);
        const field = clearanceAt(geometry.field, x, z) ?? 0;
        const centreX = geometry.centres[(id - 1) * 2] as number;
        const centreZ = geometry.centres[(id - 1) * 2 + 1] as number;
        const fromCentre =
          (geometry.clearances[id - 1] as number) -
          Math.hypot(x - centreX, z - centreZ);
        points += 1;
        worstRead = Math.max(worstRead, read - truth);
        worstCentre = Math.max(worstCentre, fromCentre - truth);
        if (fromCentre > field) larger += 1;
      }
    }
    console.log(
      'over',
      points,
      'points the read exceeds the exact field by at most',
      worstRead.toFixed(2),
      'light years, against the',
      allowance.toFixed(2),
      'the rule allows, and the centre term by at most',
      worstCentre.toFixed(2),
      '; the centre term is the larger at',
      ((100 * larger) / points).toFixed(1),
      'percent of them',
    );
    expect(points).toBeGreaterThan(100000);
    expect(worstRead).toBeLessThanOrEqual(allowance);
    expect(worstCentre).toBeLessThanOrEqual(1);
  }, 300000);

  test('reads the field by interpolation, so it does not step at a cell edge', () => {
    const geometry = regionData().geometry;
    const field = geometry.field;
    // A line that crosses several cells of the field, away from any centre so the
    // field term is the one that answers.
    const id = 1;
    const steps: number[] = [];
    const nearest: number[] = [];
    const start = (field.origin[0] as number) + field.cell * 60;
    for (let step = 0; step < 400; step += 1) {
      const x = start + step * (field.cell / 20);
      const z = (field.origin[1] as number) + field.cell * 60;
      const read = clearanceAt(field, x, z) as number;
      steps.push(read);
      const ix = Math.round((x - (field.origin[0] as number)) / field.cell);
      const iz = Math.round((z - (field.origin[1] as number)) / field.cell);
      nearest.push(field.values[iz * field.size + ix] as number);
      // The placement reads the field term here, not the centre term, so the steps
      // the test measures are the steps the placement takes.
      expect(labelClearanceAt(geometry, id, x, z)).toBe(read);
    }
    let worstRead = 0;
    let worstNearest = 0;
    for (let step = 1; step < steps.length; step += 1) {
      worstRead = Math.max(
        worstRead,
        Math.abs((steps[step] as number) - (steps[step - 1] as number)),
      );
      worstNearest = Math.max(
        worstNearest,
        Math.abs((nearest[step] as number) - (nearest[step - 1] as number)),
      );
    }
    console.log(
      'the interpolated read moves at most',
      worstRead.toFixed(1),
      'light years a step against',
      worstNearest.toFixed(1),
      'for a nearest cell read',
    );
    // A nearest cell read holds still and then steps by a whole cell difference.
    expect(worstRead * 4).toBeLessThan(worstNearest);
  }, 120000);
});

describe('the field under a sliding anchor', () => {
  test('reads the field without a step as the anchor crosses cells', () => {
    // The anchor slides along `z` while the field ramps along `z`, so it crosses
    // several cells of the field over the run.
    //
    // The test reads the clearance and not the drawn scale, because the drawn scale
    // cannot carry this property. An anchor only moves when it has left the centre,
    // and the slide stops at the first point whose floor-scale box fits the viewport.
    // No larger box fits there, so a moving anchor always draws at the floor. The run
    // below asserts that floor, and the clearance read is what changes.
    const regions = [regionOf(1, 'One Region')];
    const source = labelSource(
      gridOf(() => 1),
      geometryOf(
        { 1: [0, -30000] },
        { 1: 0 },
        fieldOf((_x, z) => 900 + Math.max(-800, Math.min(800, (z + 2000) / 4))),
      ),
      linesOf([]),
    );
    const field = source.geometry.field;
    const anchors: number[] = [];
    const reads: number[] = [];
    const nearest: number[] = [];
    const scales: number[] = [];
    for (let frame = 0; frame < 40; frame += 1) {
      const view: View = {
        cursor: [0, 0, frame * 40],
        distance: 2000,
        yaw: 0,
        pitch: 35,
      };
      const placement = placeLabels(view, VIEWPORT, source, smallBox, regions, null);
      const label = placement.labels[0] as PlacedLabel;
      expect(label).toBeDefined();
      anchors.push(label.plane.z);
      scales.push(label.scale);
      reads.push(labelClearanceAt(source.geometry, 1, label.plane.x, label.plane.z));
      const ix = Math.round((label.plane.x - (field.origin[0] as number)) / field.cell);
      const iz = Math.round((label.plane.z - (field.origin[1] as number)) / field.cell);
      nearest.push(field.values[iz * field.size + ix] as number);
    }
    const crossed =
      Math.abs((anchors[anchors.length - 1] as number) - (anchors[0] as number)) /
      field.cell;
    let worstRead = 0;
    let worstNearest = 0;
    for (let frame = 1; frame < reads.length; frame += 1) {
      worstRead = Math.max(
        worstRead,
        Math.abs((reads[frame] as number) - (reads[frame - 1] as number)),
      );
      worstNearest = Math.max(
        worstNearest,
        Math.abs((nearest[frame] as number) - (nearest[frame - 1] as number)),
      );
    }
    console.log(
      'the anchor crosses',
      crossed.toFixed(1),
      'cells of the field; the read moves at most',
      worstRead.toFixed(1),
      'light years a frame against',
      worstNearest.toFixed(1),
      'for a nearest cell read, and the drawn scale runs from',
      Math.min(...scales).toFixed(3),
      'to',
      Math.max(...scales).toFixed(3),
    );
    expect(crossed).toBeGreaterThan(3);
    expect(worstRead * 2).toBeLessThan(worstNearest);
    // Every frame slides the anchor, so every frame draws at the floor.
    expect(Math.max(...scales)).toBeLessThanOrEqual(LABEL_FLOOR_SCALE);
  });
});

describe('the anchor', () => {
  const regions = [regionOf(1, 'One Region')];
  const wideOpen = fieldOf(() => 9000);

  function sourceAt(
    centre: readonly [number, number],
    clearance = 9000,
    idAt: (x: number, z: number) => number = () => 1,
  ): LabelSource {
    return labelSource(
      gridOf(idAt),
      geometryOf({ 1: centre }, { 1: clearance }, wideOpen),
      linesOf([]),
    );
  }

  test('holds the centre while the centre is usable', () => {
    const view: View = { cursor: [0, 0, 0], distance: 20000, yaw: 0, pitch: 35 };
    const source = sourceAt([0, 0]);
    const placement = placeLabels(view, VIEWPORT, source, smallBox, regions, null);
    const label = placement.labels[0];
    expect(label).toBeDefined();
    expect(label?.plane.x).toBe(0);
    expect(label?.plane.z).toBe(0);
    expect(label?.scale).toBe(1);
  });

  test('leaves the centre when the centre leaves the frame', () => {
    const view: View = { cursor: [0, 0, 0], distance: 2000, yaw: 0, pitch: 35 };
    const centre: readonly [number, number] = [0, -30000];
    const source = sourceAt(centre);
    const map = planeMap(view, VIEWPORT);
    const projected = screenOf(map, centre[0], centre[1]);
    expect(
      projected[2] <= 0 || projected[1] < 0 || projected[1] > VIEWPORT.height,
    ).toBe(true);
    const placement = placeLabels(view, VIEWPORT, source, smallBox, regions, null);
    const label = placement.labels[0] as PlacedLabel;
    expect(label).toBeDefined();
    expect(label.plane.z).not.toBe(centre[1]);
    // The anchor lies on the segment from the centre to the plane point under the
    // middle of the frame.
    const wanted = planeUnder(map, VIEWPORT.width / 2, VIEWPORT.height / 2) as [
      number,
      number,
    ];
    const along = (label.plane.z - centre[1]) / (wanted[1] - centre[1]);
    expect(along).toBeGreaterThan(0);
    expect(along).toBeLessThanOrEqual(1);
    expect(label.plane.x).toBeCloseTo(centre[0] + (wanted[0] - centre[0]) * along, 6);
    // The box lies inside the viewport and inside the region.
    expect(label.left).toBeGreaterThanOrEqual(0);
    expect(label.top).toBeGreaterThanOrEqual(0);
    expect(label.left + label.width).toBeLessThanOrEqual(VIEWPORT.width);
    expect(label.top + label.height).toBeLessThanOrEqual(VIEWPORT.height);
    for (const point of boxPoints(label)) {
      const under = planeUnder(map, point[0], point[1]) as [number, number];
      expect(coarseRegionIdAt(source.grid, under[0], under[1])).toBe(1);
    }
  });

  test('never holds a centre that sits behind the camera', () => {
    const view: View = { cursor: [0, 0, 0], distance: 500, yaw: 0, pitch: 35 };
    const map = planeMap(view, VIEWPORT);
    const centre: readonly [number, number] = [0, -4000];
    // The projection returns a mirrored position inside the frame for that point.
    const mirrored = screenOf(map, centre[0], centre[1]);
    expect(mirrored[2]).toBeLessThan(0);
    expect(mirrored[0]).toBeGreaterThan(0);
    expect(mirrored[0]).toBeLessThan(VIEWPORT.width);
    const source = sourceAt(centre);
    const placement = placeLabels(view, VIEWPORT, source, smallBox, regions, null);
    const label = placement.labels[0];
    // The rule allows a label that has left the centre, or no label at all. Each branch
    // reads the reason the placement reports, so neither branch passes on silence.
    if (label === undefined) {
      expect(placement.reasons[1]).toBe(LABEL_NO_ANCHOR);
    } else {
      expect(placement.reasons[1]).toBe(LABEL_DRAWN);
      expect(label.plane.z).not.toBe(centre[1]);
      expect(screenOf(map, label.plane.x, label.plane.z)[2]).toBeGreaterThan(0);
    }
  });

  test('places nothing when no point of the segment holds the box in the frame', () => {
    const view: View = { cursor: [0, 0, 0], distance: 20000, yaw: 0, pitch: 35 };
    const source = sourceAt([0, 0]);
    // A viewport smaller than the floor-scale box.
    const tiny: Viewport = { width: 40, height: 10 };
    const placement = placeLabels(view, tiny, source, smallBox, regions, null);
    expect(placement.labels).toEqual([]);
    expect(placement.reasons[1]).toBe(LABEL_NO_ANCHOR);
  });

  test('reads the clearance at the anchor and not along the segment', () => {
    // The field dips far below any box between the centre and the anchor, and holds
    // at the anchor. A rule that walked the segment and stopped at the first failure
    // would refuse a box that lies inside its region.
    const view: View = { cursor: [0, 0, 0], distance: 2000, yaw: 0, pitch: 35 };
    const centre: readonly [number, number] = [0, -30000];
    const source = labelSource(
      gridOf(() => 1),
      geometryOf(
        { 1: centre },
        { 1: 100 },
        fieldOf((_x, z) => (z > -20000 && z < -15000 ? 100 : 9000)),
      ),
      linesOf([]),
    );
    const placement = placeLabels(view, VIEWPORT, source, smallBox, regions, null);
    const label = placement.labels[0] as PlacedLabel;
    expect(label).toBeDefined();
    // The dip lies between the centre and the anchor.
    expect(label.plane.z).toBeGreaterThan(-15000);
    const dip = labelClearanceAt(source.geometry, 1, 0, -17500);
    // No box can hold at the dip: the departure bound and the two trace cells alone
    // ask for more than that, before any footprint.
    expect(dip).toBeLessThan(
      source.geometry.departureLy + 2 * traceCell(source.geometry),
    );
    expect(
      labelClearanceAt(source.geometry, 1, label.plane.x, label.plane.z),
    ).toBeGreaterThan(dip);
  });

  test('is centred on its anchor and never slid off it', () => {
    const source = sourceOfRegions();
    for (const viewport of [VIEWPORT, WIDE]) {
      const map = planeMap(LABEL_VIEW, viewport);
      const placement = placeLabels(
        LABEL_VIEW,
        viewport,
        source,
        measure,
        REGIONS,
        null,
      );
      expect(placement.labels.length).toBeGreaterThan(0);
      for (const label of placement.labels) {
        const screen = screenOf(map, label.plane.x, label.plane.z);
        expect(label.left + label.width / 2).toBeCloseTo(screen[0], 6);
        expect(label.top + label.height / 2).toBeCloseTo(screen[1], 6);
      }
    }
  }, 120000);

  test('refuses an anchor that lands in a neighbouring region', () => {
    // Region 1 is concave: region 2 lies as a band across the near part of the frame,
    // so the straight segment from the centre to the middle of the frame cuts through
    // the neighbour before it reaches the part of region 1 the frame shows.
    const idAt = (_x: number, z: number): number => (z > 26000 && z < 36000 ? 2 : 1);
    const view: View = { cursor: [20000, 0, 40000], distance: 8000, yaw: 0, pitch: 35 };
    const centre: readonly [number, number] = [-20000, 0];
    const source = sourceAt(centre, 60000, idAt);
    const placement = placeLabels(view, VIEWPORT, source, smallBox, regions, null);
    expect(placement.labels).toEqual([]);
    expect(placement.reasons[1]).toBe(LABEL_OTHER_REGION);
    // The same anchor holds the box: with the neighbour's cells reading as region 1
    // the clearance there accepts it, so it is the region test that refuses it.
    const open = labelSource(
      gridOf(() => 1),
      geometryOf({ 1: centre }, { 1: 60000 }, wideOpen),
      linesOf([]),
    );
    const second = placeLabels(view, VIEWPORT, open, smallBox, regions, null);
    expect(second.labels.length).toBe(1);
  });

  test('is a function of the camera alone and carries no state between frames', () => {
    const source = sourceOfRegions();
    const buffers = fitPlacementBuffers(null, source.lines.vertexCount);
    const fresh = placeLabels(LABEL_VIEW, WIDE, source, measure, REGIONS, null);
    for (let frame = 0; frame < 100; frame += 1) {
      const view: View = {
        cursor: [15, 0, 25895 - frame * 40],
        distance: 20000 - frame * 30,
        yaw: frame * 1.7,
        pitch: 35,
      };
      placeLabels(view, WIDE, source, measure, REGIONS, buffers);
    }
    const after = placeLabels(LABEL_VIEW, WIDE, source, measure, REGIONS, buffers);
    expect(after.labels).toEqual(fresh.labels);
  }, 120000);

  test('moves in every frame of a slow turn and never by 12 CSS pixels', () => {
    const source = sourceOfRegions();
    const buffers = fitPlacementBuffers(null, source.lines.vertexCount);
    const spur = REGIONS.find((region) => region.name === 'Inner Orion Spur');
    for (const distance of [2000, 500]) {
      let worst = 0;
      let still = 0;
      let frames = 0;
      let last: PlacedLabel | null = null;
      const scales: number[] = [];
      for (let frame = 0; frame < 120; frame += 1) {
        const view: View = {
          cursor: [0, 0, 0],
          distance,
          yaw: frame * 0.1,
          pitch: 35,
        };
        const placement = placeLabels(view, WIDE, source, measure, REGIONS, buffers);
        const label = placement.labels.find((one) => one.id === spur?.id);
        expect(label, `no label at frame ${frame} of ${distance}`).toBeDefined();
        scales.push((label as PlacedLabel).scale);
        if (last !== null && label !== undefined) {
          const move = Math.hypot(label.left - last.left, label.top - last.top);
          if (move < 1e-9) still += 1;
          if (move > worst) worst = move;
          frames += 1;
        }
        last = label ?? null;
      }
      console.log(
        'at',
        distance,
        'light years the label moves at worst',
        worst.toFixed(3),
        'CSS pixels over',
        frames,
        'frames and is still in',
        still,
        '; its drawn scale runs from',
        Math.min(...scales).toFixed(3),
        'to',
        Math.max(...scales).toFixed(3),
      );
      expect(still).toBe(0);
      expect(worst).toBeLessThan(12);
    }
  }, 300000);
});

describe('the label margin', () => {
  test('holds every box clear of the frame edge at the label view', () => {
    const source = sourceOfRegions();
    for (const viewport of [VIEWPORT, WIDE]) {
      const placement = placeLabels(
        LABEL_VIEW,
        viewport,
        source,
        measure,
        REGIONS,
        null,
      );
      expect(placement.labels.length).toBeGreaterThan(0);
      let nearest = Number.POSITIVE_INFINITY;
      for (const label of placement.labels) {
        const clearance = Math.min(
          label.left,
          label.top,
          viewport.width - (label.left + label.width),
          viewport.height - (label.top + label.height),
        );
        expect(
          clearance,
          `${label.name} clears the frame edge by ${clearance.toFixed(1)} CSS pixels`,
        ).toBeGreaterThanOrEqual(LABEL_MARGIN_CSS);
        if (clearance < nearest) nearest = clearance;
      }
      console.log(
        `${viewport.width}x${viewport.height}: the nearest of`,
        placement.labels.length,
        'boxes clears the frame edge by',
        nearest.toFixed(1),
        'CSS pixels',
      );
    }
  }, 120000);

  test('holds the margin for a label that never slides', () => {
    // The centre projects near the left edge, where the floor-scale box lies inside
    // the inset viewport and the full-size box does not. The slide does not start, so
    // the search of the scale is the only step that can hold the margin.
    const view: View = { cursor: [0, 0, 0], distance: 20000, yaw: 0, pitch: 35 };
    const map = planeMap(view, VIEWPORT);
    const name = 'One Region';
    const near = LABEL_MARGIN_CSS + smallBox(name, LABEL_FLOOR_SCALE).width / 2 + 1;
    const centre = planeUnder(map, near, VIEWPORT.height / 2) as [number, number];
    const source = labelSource(
      gridOf(() => 1),
      geometryOf(
        { 1: centre },
        { 1: 9000 },
        fieldOf(() => 9000),
      ),
      linesOf([]),
    );
    const placement = placeLabels(
      view,
      VIEWPORT,
      source,
      smallBox,
      [regionOf(1, name)],
      null,
    );
    const label = placement.labels[0] as PlacedLabel;
    expect(label).toBeDefined();
    // The anchor is the centre, so the box did not slide away from the edge. The
    // geometry holds the centre as a `float32`, so the reading is that value and not
    // the plane point the test worked out.
    expect(label.plane.x).toBe(source.geometry.centres[0]);
    expect(label.plane.z).toBe(source.geometry.centres[1]);
    // The full-size box breaches the margin, so the search took a smaller scale.
    expect(near - smallBox(name, LABEL_FULL_SCALE).width / 2).toBeLessThan(
      LABEL_MARGIN_CSS,
    );
    expect(label.scale).toBeLessThan(LABEL_FULL_SCALE);
    expect(label.scale).toBeGreaterThanOrEqual(LABEL_FLOOR_SCALE);
    expect(label.left).toBeGreaterThanOrEqual(LABEL_MARGIN_CSS);
  });
});

describe('the drawn size', () => {
  test('is the largest that fits, and falls to the floor before the label goes', () => {
    // The frame widens over the run, so the light years under a pixel grow and the box
    // asks for more room than the region has.
    const regions = [regionOf(1, 'Small Region')];
    const source = labelSource(
      gridOf(() => 1),
      geometryOf(
        { 1: [0, 0] },
        { 1: 2600 },
        fieldOf(() => 0),
      ),
      linesOf([]),
    );
    const scales: number[] = [];
    let full = 0;
    let scaled = 0;
    let gone = 0;
    for (let step = 0; step < 60; step += 1) {
      const view: View = {
        cursor: [0, 0, 0],
        distance: 4000 + step * 1500,
        yaw: 0,
        pitch: 35,
      };
      const placement = placeLabels(view, VIEWPORT, source, measure, regions, null);
      const label = placement.labels[0];
      if (label === undefined) {
        gone += 1;
        scales.push(0);
        continue;
      }
      scales.push(label.scale);
      if (label.scale === 1) full += 1;
      else scaled += 1;
      // The box lies inside the region in every frame it is drawn.
      const map = planeMap(view, VIEWPORT);
      for (const point of boxPoints(label)) {
        const under = planeUnder(map, point[0], point[1]) as [number, number];
        expect(coarseRegionIdAt(source.grid, under[0], under[1])).toBe(1);
      }
    }
    console.log(
      'over the run the label is at full size in',
      full,
      'frames, scaled in',
      scaled,
      'and gone in',
      gone,
    );
    expect(full).toBeGreaterThan(0);
    expect(scaled).toBeGreaterThan(0);
    expect(gone).toBeGreaterThan(0);
    // The size never grows again over a run that only widens the frame, and the last
    // frame the label is on the page is at the floor.
    const drawn = scales.filter((scale) => scale > 0);
    for (let step = 1; step < drawn.length; step += 1) {
      expect(drawn[step] as number).toBeLessThanOrEqual(
        (drawn[step - 1] as number) + 1e-9,
      );
    }
    expect(drawn[drawn.length - 1] as number).toBeLessThan(LABEL_FLOOR_SCALE + 0.01);
  });

  test('reports a box of the scale it draws at', () => {
    const source = sourceOfRegions();
    const placement = placeLabels(LABEL_VIEW, VIEWPORT, source, measure, REGIONS, null);
    const scaled = placement.labels.filter((label) => label.scale < 1);
    expect(scaled.length).toBeGreaterThan(0);
    for (const label of placement.labels) {
      const full = measure(label.name, 1);
      expect(label.width).toBeCloseTo(full.width * label.scale, 9);
      expect(label.height).toBeCloseTo(full.height * label.scale, 9);
    }
    // A label at the floor reports 0.7 of the full box.
    const floor = placeLabels(
      LABEL_VIEW,
      VIEWPORT,
      source,
      (name, scale) => measure(name, scale),
      REGIONS,
      null,
    ).labels.find((label) => label.scale < LABEL_FLOOR_SCALE + 0.01);
    if (floor !== undefined) {
      expect(floor.width / (measure(floor.name, 1).width as number)).toBeLessThan(0.72);
    }
  }, 120000);
});

describe('the four reasons a label is not drawn', () => {
  const regions = [regionOf(1, 'One Region')];
  const open = fieldOf(() => 9000);

  test('the camera below the plane takes every label off', () => {
    const source = sourceOfRegions();
    const view: View = {
      cursor: [15, -30000, 25895],
      distance: 20000,
      yaw: 0,
      pitch: 35,
    };
    expect(
      view.cursor[1] + view.distance * Math.sin((35 * Math.PI) / 180),
    ).toBeLessThan(0);
    const placement = placeLabels(view, VIEWPORT, source, measure, REGIONS, null);
    expect(placement.labels).toEqual([]);
    for (const region of REGIONS) {
      expect(placement.reasons[region.id]).toBe(LABEL_BELOW_PLANE);
    }
  }, 120000);

  test('a region with nothing on screen carries no label', () => {
    const source = labelSource(
      gridOf((x) => (x < 0 ? 1 : 2)),
      geometryOf({ 1: [-40000, 0], 2: [40000, 0] }, { 1: 9000, 2: 9000 }, open),
      linesOf([{ pair: [1, 2], points: [[0, -60000] as const, [0, 60000]] }]),
    );
    const both = [regionOf(1, 'Left Region'), regionOf(2, 'Right Region')];
    const view: View = { cursor: [40000, 0, 0], distance: 2000, yaw: 0, pitch: 35 };
    const placement = placeLabels(view, VIEWPORT, source, smallBox, both, null);
    expect(placement.labels.map((label) => label.id)).toEqual([2]);
    expect(placement.reasons[1]).toBe(LABEL_OFF_SCREEN);
  });

  test('no point of the segment holds the box in the frame', () => {
    const source = labelSource(
      gridOf(() => 1),
      geometryOf({ 1: [0, 0] }, { 1: 9000 }, open),
      linesOf([]),
    );
    const view: View = { cursor: [0, 0, 0], distance: 20000, yaw: 0, pitch: 35 };
    const placement = placeLabels(
      view,
      { width: 40, height: 10 },
      source,
      smallBox,
      regions,
      null,
    );
    expect(placement.reasons[1]).toBe(LABEL_NO_ANCHOR);
  });

  test('the anchor is refused by the region test or by the size test', () => {
    const view: View = { cursor: [0, 0, 0], distance: 20000, yaw: 0, pitch: 35 };
    // The anchor reads back as another region.
    const other = labelSource(
      gridOf(() => 2),
      geometryOf({ 1: [0, 0] }, { 1: 9000 }, open),
      linesOf([]),
    );
    const first = placeLabels(view, VIEWPORT, other, smallBox, regions, null);
    expect(first.labels).toEqual([]);
    expect(first.reasons[1]).toBe(LABEL_OTHER_REGION);
    // The clearance holds no box down to the floor scale.
    const tight = labelSource(
      gridOf(() => 1),
      geometryOf(
        { 1: [0, 0] },
        { 1: 300 },
        fieldOf(() => 0),
      ),
      linesOf([]),
    );
    const second = placeLabels(view, VIEWPORT, tight, smallBox, regions, null);
    expect(second.labels).toEqual([]);
    expect(second.reasons[1]).toBe(LABEL_NO_ROOM);
  });

  test('no fifth reason reaches the drawing step', () => {
    const source = sourceOfRegions();
    const allowed = new Set([
      LABEL_DRAWN,
      LABEL_BELOW_PLANE,
      LABEL_OFF_SCREEN,
      LABEL_NO_ANCHOR,
      LABEL_OTHER_REGION,
      LABEL_NO_ROOM,
    ]);
    const seen = new Set<number>();
    for (const view of [
      LABEL_VIEW,
      { cursor: [0, 0, 0], distance: 500, yaw: 0, pitch: 35 } as View,
      { cursor: [0, 0, 0], distance: 20000, yaw: 90, pitch: MIN_PITCH } as View,
      { cursor: [0, -40000, 0], distance: 20000, yaw: 0, pitch: 35 } as View,
    ]) {
      const placement = placeLabels(view, WIDE, source, measure, REGIONS, null);
      for (const region of REGIONS) {
        const reason = placement.reasons[region.id] as number;
        expect(allowed.has(reason)).toBe(true);
        seen.add(reason);
        // A drawn region carries no reason, and a region with a reason is not drawn.
        const drawn = placement.labels.some((label) => label.id === region.id);
        expect(drawn).toBe(reason === LABEL_DRAWN);
      }
    }
    console.log('the reasons seen over four views are', Array.from(seen).sort());
  }, 120000);
});

describe('the wanted point', () => {
  test('exists at every pitch while the camera is above the plane', () => {
    const source = sourceOfRegions();
    for (let pitch = MIN_PITCH; pitch <= MAX_PITCH; pitch += 1) {
      const view: View = { cursor: [15, 0, 25895], distance: 20000, yaw: 0, pitch };
      const middle = planePoint(
        view,
        { x: VIEWPORT.width / 2, y: VIEWPORT.height / 2 },
        VIEWPORT,
        0,
      );
      expect(middle, `no wanted point at a pitch of ${pitch}`).not.toBeNull();
      const placement = placeLabels(view, VIEWPORT, source, measure, REGIONS, null);
      for (const region of REGIONS) {
        expect(placement.reasons[region.id]).not.toBe(LABEL_BELOW_PLANE);
      }
    }
  }, 300000);
});

describe('the placement of a whole frame', () => {
  test('draws every region that has room, with no cap and no overlap', () => {
    // Twenty regions in a five by four arrangement, each with room for its box.
    const columns = 5;
    const rows = 4;
    const step = 4000;
    const regions: Region[] = [];
    const centres: Record<number, readonly [number, number]> = {};
    const clearances: Record<number, number> = {};
    for (let id = 1; id <= columns * rows; id += 1) {
      regions.push(regionOf(id, `Region ${id}`));
      const column = (id - 1) % columns;
      const row = Math.floor((id - 1) / columns);
      centres[id] = [
        (column - (columns - 1) / 2) * step,
        (row - (rows - 1) / 2) * step,
      ];
      clearances[id] = step / 2;
    }
    const idAt = (x: number, z: number): number => {
      const column = Math.round(x / step + (columns - 1) / 2);
      const row = Math.round(z / step + (rows - 1) / 2);
      if (column < 0 || column >= columns || row < 0 || row >= rows) return 0;
      return row * columns + column + 1;
    };
    const source = labelSource(
      gridOf(idAt),
      geometryOf(
        centres,
        clearances,
        fieldOf(() => 0),
        20,
      ),
      linesOf([]),
    );
    const view: View = { cursor: [0, 0, 0], distance: 12000, yaw: 0, pitch: MAX_PITCH };
    const placement = placeLabels(view, WIDE, source, smallBox, regions, null);
    console.log('the frame draws', placement.labels.length, 'labels of 20 regions');
    expect(placement.labels.length).toBe(20);
    for (let one = 0; one < placement.labels.length; one += 1) {
      for (let two = one + 1; two < placement.labels.length; two += 1) {
        expect(
          boxesOverlap(
            placement.labels[one] as PlacedLabel,
            placement.labels[two] as PlacedLabel,
          ),
        ).toBe(false);
      }
    }
  });

  test('keeps every box inside its own region at the label view', () => {
    const source = sourceOfRegions();
    for (const viewport of [VIEWPORT, WIDE]) {
      const map = planeMap(LABEL_VIEW, viewport);
      const placement = placeLabels(
        LABEL_VIEW,
        viewport,
        source,
        measure,
        REGIONS,
        null,
      );
      let candidates = 0;
      for (const region of REGIONS) {
        if (placement.reasons[region.id] !== LABEL_OFF_SCREEN) candidates += 1;
      }
      const slid = placement.labels.filter((label) => {
        const centreX = source.geometry.centres[(label.id - 1) * 2] as number;
        const centreZ = source.geometry.centres[(label.id - 1) * 2 + 1] as number;
        return label.plane.x !== centreX || label.plane.z !== centreZ;
      });
      console.log(
        `${viewport.width}x${viewport.height}:`,
        placement.labels.length,
        'labels of',
        candidates,
        'regions on screen, of which',
        slid.length,
        'have left their centre:',
        placement.labels
          .map((label) => `${label.name} ${label.scale.toFixed(3)}`)
          .join(', '),
      );
      // A label that has left its centre is drawn at the floor: the slide stops where
      // the floor-scale box first fits the viewport, so no larger box fits there.
      for (const label of slid) {
        expect(label.scale, `${label.name} has left its centre`).toBeLessThan(
          LABEL_FLOOR_SCALE + 0.01,
        );
      }
      for (const label of placement.labels) {
        for (const point of boxPoints(label)) {
          const under = planeUnder(map, point[0], point[1]);
          expect(under, `${label.name} reaches past the horizon`).not.toBeNull();
          expect(
            coarseRegionIdAt(
              source.grid,
              (under as [number, number])[0],
              (under as [number, number])[1],
            ),
            `a point of ${label.name} lies outside its region`,
          ).toBe(label.id);
        }
      }
      for (let one = 0; one < placement.labels.length; one += 1) {
        for (let two = one + 1; two < placement.labels.length; two += 1) {
          expect(
            boxesOverlap(
              placement.labels[one] as PlacedLabel,
              placement.labels[two] as PlacedLabel,
            ),
          ).toBe(false);
        }
      }
      expect(placement.labels.length).toBeGreaterThan(10);
    }
  }, 120000);

  test('draws more labels with the centre term than with the field alone', () => {
    const data = regionData();
    const source = sourceOfRegions();
    // A geometry whose recorded clearances are zero makes the centre term negative
    // everywhere, so the read falls back to the field alone.
    const fieldOnly = labelSource(
      data.grid,
      {
        ...data.geometry,
        clearances: new Uint16Array(data.geometry.clearances.length),
      },
      data.lines,
    );
    for (const viewport of [VIEWPORT, WIDE]) {
      const both = placeLabels(LABEL_VIEW, viewport, source, measure, REGIONS, null);
      const alone = placeLabels(
        LABEL_VIEW,
        viewport,
        fieldOnly,
        measure,
        REGIONS,
        null,
      );
      console.log(
        `${viewport.width}x${viewport.height}: the field term alone draws`,
        alone.labels.length,
        'labels against',
        both.labels.length,
        'with both terms',
      );
      expect(alone.labels.length).toBeLessThanOrEqual(both.labels.length);
    }
    const core = REGIONS.find((region) => region.name === 'Galactic Centre');
    const withBoth = placeLabels(LABEL_VIEW, VIEWPORT, source, measure, REGIONS, null);
    const withField = placeLabels(
      LABEL_VIEW,
      VIEWPORT,
      fieldOnly,
      measure,
      REGIONS,
      null,
    );
    expect(withBoth.labels.some((label) => label.id === core?.id)).toBe(true);
    expect(withField.labels.some((label) => label.id === core?.id)).toBe(false);
  }, 120000);

  test('names the region under the middle of the frame', () => {
    const source = sourceOfRegions();
    for (const viewport of [VIEWPORT, WIDE]) {
      const map = planeMap(LABEL_VIEW, viewport);
      const middle = planeUnder(map, viewport.width / 2, viewport.height / 2) as [
        number,
        number,
      ];
      const id = coarseRegionIdAt(source.grid, middle[0], middle[1]);
      const placement = placeLabels(
        LABEL_VIEW,
        viewport,
        source,
        measure,
        REGIONS,
        null,
      );
      const label = placement.labels.find((one) => one.id === id);
      expect(label, `the region under the middle carries no label`).toBeDefined();
      console.log(
        `${viewport.width}x${viewport.height}: the middle of the frame is`,
        label?.name,
        'at a scale of',
        label?.scale.toFixed(3),
      );
      expect(label?.scale).toBeGreaterThanOrEqual(LABEL_FLOOR_SCALE);
    }
  }, 120000);

  test('names the region the camera is inside at every zoom', () => {
    const source = sourceOfRegions();
    for (const distance of [20000, 10000, 4000, 1000, 500]) {
      const view: View = { cursor: [0, 0, 0], distance, yaw: 0, pitch: 35 };
      const placement = placeLabels(view, VIEWPORT, source, measure, REGIONS, null);
      const spur = placement.labels.find((label) => label.name === 'Inner Orion Spur');
      expect(
        spur,
        `no Inner Orion Spur label at ${distance} light years`,
      ).toBeDefined();
      expect((spur as PlacedLabel).left).toBeGreaterThanOrEqual(0);
      expect((spur as PlacedLabel).top).toBeGreaterThanOrEqual(0);
      expect(
        (spur as PlacedLabel).left + (spur as PlacedLabel).width,
      ).toBeLessThanOrEqual(VIEWPORT.width);
      expect(
        (spur as PlacedLabel).top + (spur as PlacedLabel).height,
      ).toBeLessThanOrEqual(VIEWPORT.height);
    }
  }, 120000);

  test('stays inside its work budget', () => {
    const source = sourceOfRegions();
    const buffers = fitPlacementBuffers(null, source.lines.vertexCount);
    for (const viewport of [VIEWPORT, WIDE]) {
      let worstSteps = 0;
      let worstUnprojections = 0;
      let worstProjections = 0;
      let worstMs = 0;
      let totalMs = 0;
      const frames = 300;
      for (let frame = 0; frame < frames; frame += 1) {
        const view: View = { ...LABEL_VIEW, yaw: frame * 0.1 };
        const started = performance.now();
        const placement = placeLabels(
          view,
          viewport,
          source,
          measure,
          REGIONS,
          buffers,
        );
        const elapsed = performance.now() - started;
        totalMs += elapsed;
        worstMs = Math.max(worstMs, elapsed);
        worstSteps = Math.max(worstSteps, placement.steps);
        worstUnprojections = Math.max(worstUnprojections, placement.unprojections);
        worstProjections = Math.max(worstProjections, placement.projections);
      }
      console.log(
        `${viewport.width}x${viewport.height}: over ${frames} frames the placement takes a mean of`,
        (totalMs / frames).toFixed(3),
        'ms and a worst of',
        worstMs.toFixed(3),
        'ms, with at worst',
        worstSteps,
        'search steps,',
        worstUnprojections,
        'corner unprojections and',
        worstProjections,
        'projections in a frame',
      );
      expect(totalMs / frames).toBeLessThan(0.5);
      expect(worstMs).toBeLessThan(2);
    }
  }, 300000);
});

describe('the placement buffers', () => {
  test('are fitted once and then handed back', () => {
    const first = fitPlacementBuffers(null, 562);
    expect(fitPlacementBuffers(first, 562)).toBe(first);
    expect(fitPlacementBuffers(first, 400)).toBe(first);
    const grown = fitPlacementBuffers(first, 1200);
    expect(grown).not.toBe(first);
    expect(fitPlacementBuffers(grown, 1200)).toBe(grown);
  });

  test('a second frame at the same viewport allocates none', () => {
    const source = sourceOfRegions();
    const buffers = fitPlacementBuffers(
      null,
      source.lines.vertexCount,
    ) as PlacementBuffers;
    placeLabels(LABEL_VIEW, WIDE, source, measure, REGIONS, buffers);
    const screenU = buffers.screenU;
    placeLabels(LABEL_VIEW, WIDE, source, measure, REGIONS, buffers);
    expect(buffers.screenU).toBe(screenU);
    expect(fitPlacementBuffers(buffers, source.lines.vertexCount)).toBe(buffers);
  }, 120000);
});

describe('the overlay', () => {
  /** One element of the fake host, with only what the overlay reads. */
  interface FakeElement {
    className: string;
    dataset: Record<string, string>;
    textContent: string;
    style: Record<string, string>;
    parentNode: unknown;
    remove(): void;
    getBoundingClientRect(): { width: number; height: number };
  }

  /**
   * A host that answers what the overlay asks of the page, so the rule can be checked
   * without a browser.
   */
  function fakeHost(): {
    host: HTMLElement;
    shown: () => FakeElement[];
  } {
    const inside = new Set<FakeElement>();
    let host: { append(element: FakeElement): void };
    const make = (): FakeElement => {
      const element: FakeElement = {
        className: '',
        dataset: {},
        textContent: '',
        style: {},
        parentNode: null,
        remove(): void {
          inside.delete(element);
          element.parentNode = null;
        },
        getBoundingClientRect: () => ({
          width: LABEL_WIDTHS[element.textContent] ?? 100,
          height: LABEL_HEIGHT,
        }),
      };
      return element;
    };
    host = {
      append(element: FakeElement): void {
        inside.add(element);
        element.parentNode = host;
      },
    };
    const full = {
      ...host,
      ownerDocument: { createElement: () => make() },
      style: {} as Record<string, string>,
    };
    host = full;
    return { host: full as unknown as HTMLElement, shown: () => Array.from(inside) };
  }

  test('places nothing before the grid, the geometry and the lines arrive', () => {
    const { host, shown } = fakeHost();
    const overlay = createLabelOverlay(host, REGIONS);
    expect(() => overlay.update({ ...LABEL_VIEW }, VIEWPORT, true)).not.toThrow();
    expect(shown().length).toBe(0);
    expect(overlay.placements()).toEqual([]);
    expect(overlay.placement().frames).toBe(0);
  });

  test('places labels once they arrive, and scales the element', () => {
    const { host, shown } = fakeHost();
    const overlay = createLabelOverlay(host, REGIONS);
    const data = regionData();
    overlay.setGrid(data.grid, data.geometry, data.lines);
    overlay.update({ ...LABEL_VIEW }, VIEWPORT, true);
    const placements = overlay.placements();
    expect(placements.length).toBeGreaterThan(0);
    expect(overlay.placement().frames).toBe(1);
    expect(overlay.placement().vertexProjections).toBe(data.lines.vertexCount);
    const drawn = shown().filter((element) => element.textContent !== '');
    expect(drawn.length).toBe(placements.length);
    for (const element of drawn) {
      const reading = placements.find((one) => one.name === element.textContent);
      expect(reading).toBeDefined();
      expect(element.style['transformOrigin']).toBe('top left');
      if ((reading?.scale ?? 1) < 1) {
        expect(element.style['transform']).toBe(`scale(${reading?.scale ?? 1})`);
      } else {
        expect(element.style['transform']).toBe('');
      }
    }
    // The switch takes every label off.
    overlay.update({ ...LABEL_VIEW }, VIEWPORT, false);
    expect(overlay.placements()).toEqual([]);
    // The fade takes every label off at the far view.
    overlay.update({ ...LABEL_VIEW, distance: 60000 }, VIEWPORT, true);
    expect(overlay.placements()).toEqual([]);
    overlay.resetPlacement();
    expect(overlay.placement().frames).toBe(0);
  }, 120000);

  test('reports no work for a frame that places nothing', () => {
    const { host } = fakeHost();
    const overlay = createLabelOverlay(host, REGIONS);
    const data = regionData();
    overlay.setGrid(data.grid, data.geometry, data.lines);
    const read = (): PlacementWork => {
      const stats = overlay.placement();
      return {
        projections: stats.projections,
        vertexProjections: stats.vertexProjections,
        unprojections: stats.unprojections,
        steps: stats.steps,
      };
    };
    const none: PlacementWork = {
      projections: 0,
      vertexProjections: 0,
      unprojections: 0,
      steps: 0,
    };

    overlay.update({ ...LABEL_VIEW }, VIEWPORT, true);
    const placing = read();
    console.log('a placing frame counts', JSON.stringify(placing));
    for (const count of Object.values(placing)) expect(count).toBeGreaterThan(0);
    expect(overlay.placement().frames).toBe(1);

    // The switch off. The counters must not hold the frame before.
    overlay.update({ ...LABEL_VIEW }, VIEWPORT, false);
    console.log('a frame with the switch off counts', JSON.stringify(read()));
    expect(read()).toEqual(none);
    expect(overlay.placement().frames).toBe(1);

    // A view above the fade band, where the placement does not run either.
    overlay.update({ ...LABEL_VIEW }, VIEWPORT, true);
    expect(read()).toEqual(placing);
    overlay.update({ ...LABEL_VIEW, distance: REGION_FADE_IN_FAR + 1 }, VIEWPORT, true);
    console.log('a frame above the fade band counts', JSON.stringify(read()));
    expect(read()).toEqual(none);
    expect(overlay.placement().frames).toBe(2);
  }, 120000);
});
