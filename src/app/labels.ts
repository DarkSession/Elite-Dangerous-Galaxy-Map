// Places the region name labels over the canvas. The labels are DOM elements in an
// overlay, so the browser reads them as text and the test needs no pixel measure.
//
// A label sits on the centre of its region, which is the plane point furthest from any
// of the region's boundaries. When that centre cannot hold the box inside the frame,
// the anchor slides along the straight plane segment from the centre toward the plane
// point under the middle of the frame, and stops at the first point whose floor-scale
// box lies inside the frame. The anchor is a function of the camera alone, so the
// placement carries no state between frames.
import { cameraPosition, viewProjectionMatrix } from '../camera/projection';
import type { Viewport } from '../camera/projection';
import type { View } from '../camera/view';
import {
  REGION_FADE_IN_FAR,
  REGION_FADE_IN_NEAR,
  REGION_LINE_WIDTH_CSS,
} from '../render/region-pass';
import { clearanceAt, CLEARANCE_DOWNSAMPLE } from '../scene-data/clearance';
import { coarseRegionIdAt, REGIONS } from '../scene-data/regions';
import type { Region } from '../scene-data/regions';
import type {
  CoarseRegionGrid,
  RegionLabelGeometry,
  RegionLines,
} from '../scene-data/types';

/** How many region ids a `Uint8Array` of ids can hold. */
const ID_RANGE = 256;

/** The smallest scale a label draws at. Below it the label is not drawn. */
export const LABEL_FLOOR_SCALE = 0.7;

/** The largest scale a label draws at. */
export const LABEL_FULL_SCALE = 1;

/**
 * How near the search of the scale runs, in CSS pixels of box width. One pixel of a
 * full-size box is about 0.008 of scale, which the drawn text cannot show.
 */
const SCALE_SEARCH_PIXEL = 1;

/**
 * How near the slide runs, in CSS pixels of screen distance.
 *
 * The slide runs tighter than the scale search, and the two are not one number. The
 * slide stops at the first feasible point of a subdivision, so whatever it leaves as
 * slack the box then grows into: the box of a slid label touches the edge of the
 * viewport, and one CSS pixel of slack on a 20 pixel box is 0.1 of scale. Measured
 * over a pan of 40 light years a frame at a zoom of 2,000, one CSS pixel draws a slid
 * label at 0.700 to 0.747, which pulses between frames, while 0.05 draws it at 0.700
 * in every frame. The rule asks the search to run until the interval is shorter than
 * one CSS pixel, which this meets with margin, and it costs four or five more steps
 * for each region that slides.
 */
const SLIDE_SEARCH_PIXEL = 0.05;

/** A point on the galactic plane at `y = 0`, in light years. */
export interface PlanePoint {
  readonly x: number;
  readonly z: number;
}

/** The size of a label, in CSS pixels. */
export interface LabelSize {
  readonly width: number;
  readonly height: number;
}

/** The box of a label on the screen, in CSS pixels from the top left. */
export interface LabelBox extends LabelSize {
  readonly left: number;
  readonly top: number;
}

/** A label the page shows. */
export interface PlacedLabel extends LabelBox {
  /** The region id, 1 to 42. */
  readonly id: number;
  /** The region name the label reads. */
  readonly name: string;
  /** The scale the label draws at, from the floor to 1. */
  readonly scale: number;
  /** The plane point the box centres on, in light years. */
  readonly plane: PlanePoint;
}

/** Measures the box of a name at a scale, in CSS pixels. */
export type MeasureLabel = (name: string, scale: number) => LabelSize;

/** Why a region carries no label. `0` means the region carries one. */
export const LABEL_DRAWN = 0;
/** The camera sits at or below the galactic plane, so no label is drawn at all. */
export const LABEL_BELOW_PLANE = 1;
/** No part of the region projects inside the viewport. */
export const LABEL_OFF_SCREEN = 2;
/** No point of the segment holds the floor-scale box inside the viewport. */
export const LABEL_NO_ANCHOR = 3;
/** The anchor reads back as another region. */
export const LABEL_OTHER_REGION = 4;
/** The clearance at the anchor holds no box down to the floor scale. */
export const LABEL_NO_ROOM = 5;

function smoothstep(low: number, high: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
}

/**
 * How much of the label overlay draws at a zoom distance, 0 to 1. The labels follow the
 * fade in of the boundary lines, and they do not fade out at close zoom.
 */
export function labelFade(distance: number): number {
  return 1 - smoothstep(REGION_FADE_IN_NEAR, REGION_FADE_IN_FAR, distance);
}

/**
 * The map between the galactic plane and the screen for one frame.
 *
 * The camera reads the plane through a perspective, so plane and screen are one
 * homography apart. Building it once for the frame makes a projection nine
 * multiplications, and it makes the reverse read and the light years under a pixel
 * exact rather than a difference of two samples. `project` builds the view-projection
 * matrix on every call, which a frame that projects 562 vertices cannot pay for.
 */
export interface PlaneMap {
  /** Screen from plane, row by row: `(u t, v t, t) = forward (x, z, 1)`. */
  readonly forward: Float64Array;
  /** Plane from screen, row by row: `(x s, z s, s) = back (u, v, 1)`. */
  readonly back: Float64Array;
  /** True when the map could be built, which needs the camera off the plane. */
  readonly usable: boolean;
}

/** The inverse of a 3 by 3 matrix, row by row. False when it has none. */
function invert3(m: Float64Array, out: Float64Array): boolean {
  const cofactor0 = m[4] * m[8] - m[5] * m[7];
  const cofactor3 = m[5] * m[6] - m[3] * m[8];
  const cofactor6 = m[3] * m[7] - m[4] * m[6];
  const determinant = m[0] * cofactor0 + m[1] * cofactor3 + m[2] * cofactor6;
  if (determinant === 0 || !Number.isFinite(determinant)) return false;
  const scale = 1 / determinant;
  out[0] = cofactor0 * scale;
  out[1] = (m[2] * m[7] - m[1] * m[8]) * scale;
  out[2] = (m[1] * m[5] - m[2] * m[4]) * scale;
  out[3] = cofactor3 * scale;
  out[4] = (m[0] * m[8] - m[2] * m[6]) * scale;
  out[5] = (m[2] * m[3] - m[0] * m[5]) * scale;
  out[6] = cofactor6 * scale;
  out[7] = (m[1] * m[6] - m[0] * m[7]) * scale;
  out[8] = (m[0] * m[4] - m[1] * m[3]) * scale;
  return true;
}

/**
 * Builds the plane map of a view. The view-projection matrix is built once here and
 * every projection of the frame reads this map instead.
 */
export function planeMap(view: View, viewport: Viewport): PlaneMap {
  const matrix = viewProjectionMatrix(view, viewport);
  const camera = cameraPosition(view);
  const cameraX = camera[0];
  const cameraY = camera[1];
  const cameraZ = camera[2];

  // A plane point `(x, 0, z)` sits at `(x - cameraX, -cameraY, -(z - cameraZ))` in the
  // renderer's world frame, so each clip coordinate is affine in `x` and `z`.
  const clipXx = matrix[0];
  const clipXz = -matrix[8];
  const clipX1 =
    -matrix[0] * cameraX - matrix[4] * cameraY + matrix[8] * cameraZ + matrix[12];
  const clipYx = matrix[1];
  const clipYz = -matrix[9];
  const clipY1 =
    -matrix[1] * cameraX - matrix[5] * cameraY + matrix[9] * cameraZ + matrix[13];
  const clipWx = matrix[3];
  const clipWz = -matrix[11];
  const clipW1 =
    -matrix[3] * cameraX - matrix[7] * cameraY + matrix[11] * cameraZ + matrix[15];

  // `u = (clipX / clipW * 0.5 + 0.5) * width` and `v = (0.5 - clipY / clipW * 0.5) *
  // height`, which is the homography below with `t = clipW`. A point is in front of
  // the camera when `t` is positive.
  const halfWidth = viewport.width / 2;
  const halfHeight = viewport.height / 2;
  const forward = new Float64Array(9);
  forward[0] = halfWidth * (clipXx + clipWx);
  forward[1] = halfWidth * (clipXz + clipWz);
  forward[2] = halfWidth * (clipX1 + clipW1);
  forward[3] = halfHeight * (clipWx - clipYx);
  forward[4] = halfHeight * (clipWz - clipYz);
  forward[5] = halfHeight * (clipW1 - clipY1);
  forward[6] = clipWx;
  forward[7] = clipWz;
  forward[8] = clipW1;

  const back = new Float64Array(9);
  const usable = invert3(forward, back);
  return { forward, back, usable };
}

/**
 * Projects a plane point. `out` takes the screen position in CSS pixels. The result is
 * the `t` of the map, which is positive when the point is in front of the camera.
 */
function toScreen(map: PlaneMap, x: number, z: number, out: Float64Array): number {
  const forward = map.forward;
  const t = forward[6] * x + forward[7] * z + forward[8];
  out[0] = (forward[0] * x + forward[1] * z + forward[2]) / t;
  out[1] = (forward[3] * x + forward[4] * z + forward[5]) / t;
  return t;
}

/**
 * The plane point under a screen point. `out` takes the plane position in light years.
 * The result is positive when the plane point is in front of the camera, and zero or
 * less when the ray runs away from the plane or meets it behind the camera.
 */
function toPlane(map: PlaneMap, u: number, v: number, out: Float64Array): number {
  const back = map.back;
  const s = back[6] * u + back[7] * v + back[8];
  out[0] = (back[0] * u + back[1] * v + back[2]) / s;
  out[1] = (back[3] * u + back[4] * v + back[5]) / s;
  return s;
}

/**
 * The light years one CSS pixel covers on the plane at a screen point, in the
 * direction that covers most.
 *
 * It is the largest singular value of the Jacobian of the plane map at that point, so
 * it is exact rather than a difference of two samples. `x` and `z` are the plane point
 * the caller has already read there.
 */
function lightYearsPerPixel(
  map: PlaneMap,
  u: number,
  v: number,
  x: number,
  z: number,
): number {
  const back = map.back;
  const s = back[6] * u + back[7] * v + back[8];
  const a = (back[0] - x * back[6]) / s;
  const b = (back[1] - x * back[7]) / s;
  const c = (back[3] - z * back[6]) / s;
  const d = (back[4] - z * back[7]) / s;
  const square = a * a + b * b + c * c + d * d;
  const determinant = a * d - b * c;
  const inside = Math.max(0, square * square - 4 * determinant * determinant);
  return Math.sqrt((square + Math.sqrt(inside)) / 2);
}

/** True when a segment on the screen meets the viewport rectangle. */
function segmentMeetsViewport(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  viewport: Viewport,
): boolean {
  const dx = x1 - x0;
  const dy = y1 - y0;
  let low = 0;
  let high = 1;
  // Liang and Barsky: each edge of the rectangle cuts the parameter range, and the
  // segment meets the rectangle when a range is left.
  const cut = (p: number, q: number): boolean => {
    if (p === 0) return q >= 0;
    const at = q / p;
    if (p < 0) {
      if (at > high) return false;
      if (at > low) low = at;
    } else {
      if (at < low) return false;
      if (at < high) high = at;
    }
    return true;
  };
  return (
    cut(-dx, x0) &&
    cut(dx, viewport.width - x0) &&
    cut(-dy, y0) &&
    cut(dy, viewport.height - y0)
  );
}

/** True when a box centred on a screen point lies wholly inside the viewport. */
function boxInsideViewport(
  u: number,
  v: number,
  size: LabelSize,
  viewport: Viewport,
): boolean {
  const halfWidth = size.width / 2;
  const halfHeight = size.height / 2;
  return (
    u - halfWidth >= 0 &&
    v - halfHeight >= 0 &&
    u + halfWidth <= viewport.width &&
    v + halfHeight <= viewport.height
  );
}

/**
 * What the placement reads and the frame does not change: the coarse region grid, the
 * label geometry and the boundary set, with the chains of each region taken once.
 */
export interface LabelSource {
  readonly grid: CoarseRegionGrid;
  readonly geometry: RegionLabelGeometry;
  readonly lines: RegionLines;
  /** The chains that separate each region, indexed by region id. */
  readonly chains: readonly Uint32Array[];
}

/**
 * Takes the chains of each region from the pair the boundary set carries, so candidacy
 * walks a region's own boundary and not the whole set.
 */
export function labelSource(
  grid: CoarseRegionGrid,
  geometry: RegionLabelGeometry,
  lines: RegionLines,
): LabelSource {
  const counts = new Int32Array(ID_RANGE);
  for (let chain = 0; chain < lines.chainCount; chain += 1) {
    counts[lines.pairs[chain * 2]] += 1;
    counts[lines.pairs[chain * 2 + 1]] += 1;
  }
  const chains: Uint32Array[] = [];
  for (let id = 0; id < ID_RANGE; id += 1) chains.push(new Uint32Array(counts[id]));
  const written = new Int32Array(ID_RANGE);
  for (let chain = 0; chain < lines.chainCount; chain += 1) {
    for (let side = 0; side < 2; side += 1) {
      const id = lines.pairs[chain * 2 + side];
      const list = chains[id] as Uint32Array;
      list[written[id]] = chain;
      written[id] += 1;
    }
  }
  return { grid, geometry, lines, chains };
}

/**
 * The typed arrays one frame fills. The overlay holds one set and fits it outside the
 * window it times, so a resize cannot allocate inside a measurement.
 */
export interface PlacementBuffers {
  /** The screen `u` of every vertex of the boundary set, in CSS pixels. */
  readonly screenU: Float64Array;
  /** The screen `v` of every vertex of the boundary set, in CSS pixels. */
  readonly screenV: Float64Array;
  /** The `t` of every vertex, which is positive in front of the camera. */
  readonly screenT: Float64Array;
  /** 1 for a region any part of which projects inside the viewport. */
  readonly candidate: Uint8Array;
  /** Why each region carries no label, by region id. */
  readonly reasons: Uint8Array;
}

/**
 * The buffers a caller already holds when they are large enough, or a new set when
 * they are not. The size follows the vertex count, so one boundary set takes one
 * allocation and no frame after it does.
 */
export function fitPlacementBuffers(
  buffers: PlacementBuffers | null,
  vertexCount: number,
): PlacementBuffers {
  if (buffers !== null && buffers.screenU.length >= vertexCount) return buffers;
  return {
    screenU: new Float64Array(vertexCount),
    screenV: new Float64Array(vertexCount),
    screenT: new Float64Array(vertexCount),
    candidate: new Uint8Array(ID_RANGE),
    reasons: new Uint8Array(ID_RANGE),
  };
}

/** What one frame of placement cost. */
export interface PlacementWork {
  /** How many plane points the frame projected. */
  readonly projections: number;
  /** How many vertices of the boundary set the frame projected. */
  readonly vertexProjections: number;
  /** How many box corners the frame unprojected. */
  readonly unprojections: number;
  /** The most steps any one search of the frame took. */
  readonly steps: number;
}

/** The work of a frame that places nothing. */
const NO_WORK: PlacementWork = {
  projections: 0,
  vertexProjections: 0,
  unprojections: 0,
  steps: 0,
};

/** The labels of one frame, with why each other region carries none. */
export interface Placement extends PlacementWork {
  readonly labels: PlacedLabel[];
  /** Why each region carries no label, by region id. A view on the buffers. */
  readonly reasons: Uint8Array;
}

/** The scratch of one frame. One set is reused, so a frame allocates nothing here. */
const framePoint = new Float64Array(2);
const frameCorner = new Float64Array(2);
const frameAnchor = new Float64Array(2);

/**
 * Marks every region any part of which projects inside the viewport.
 *
 * The test covers the region's own boundary segments, its centre, and the regions that
 * hold the plane points under the middle and the four corners of the frame. The last
 * of those is not decoration: a camera looking almost straight down inside a large
 * region sees about 577 light years with no boundary and no centre in the frame.
 *
 * The vertices are projected **once for the frame** into the buffers and every region
 * indexes into them. Each of the 439 segments belongs to two regions, so a region that
 * projected its own segments would make about 1,756 endpoint projections instead of
 * 562.
 *
 * A segment with an end behind the camera is clipped against the camera plane before
 * it is tested. The projection returns a mirrored position for such a point, so an
 * unclipped segment gives a mirrored line and the test comes out wrong.
 *
 * A frame corner whose ray runs away from the plane contributes nothing. The top edge
 * of the frame looks 30 degrees above the view axis, which is half the vertical field
 * of view, so the whole top edge misses the plane at any pitch below 30.
 */
export function markCandidates(
  map: PlaneMap,
  viewport: Viewport,
  source: LabelSource,
  buffers: PlacementBuffers,
  regions: readonly Region[],
  work: { projections: number; vertexProjections: number },
): Uint8Array {
  const candidate = buffers.candidate;
  candidate.fill(0);
  if (!map.usable) return candidate;

  const lines = source.lines;
  const positions = lines.positions;
  const screenU = buffers.screenU;
  const screenV = buffers.screenV;
  const screenT = buffers.screenT;
  for (let vertex = 0; vertex < lines.vertexCount; vertex += 1) {
    const t = toScreen(
      map,
      positions[vertex * 3],
      positions[vertex * 3 + 2],
      framePoint,
    );
    screenU[vertex] = framePoint[0];
    screenV[vertex] = framePoint[1];
    screenT[vertex] = t;
  }
  work.vertexProjections += lines.vertexCount;
  work.projections += lines.vertexCount;

  // The middle and the four corners of the frame. A region can fill the frame with no
  // boundary and no centre in view, and only these points find it.
  const framePoints: readonly [number, number][] = [
    [viewport.width / 2, viewport.height / 2],
    [0, 0],
    [viewport.width, 0],
    [0, viewport.height],
    [viewport.width, viewport.height],
  ];
  for (const point of framePoints) {
    if (toPlane(map, point[0], point[1], framePoint) <= 0) continue;
    candidate[coarseRegionIdAt(source.grid, framePoint[0], framePoint[1])] = 1;
  }

  for (const region of regions) {
    const centreX = source.geometry.centres[(region.id - 1) * 2];
    const centreZ = source.geometry.centres[(region.id - 1) * 2 + 1];
    if (!Number.isFinite(centreX)) continue;
    work.projections += 1;
    if (toScreen(map, centreX, centreZ, framePoint) <= 0) continue;
    if (
      framePoint[0] >= 0 &&
      framePoint[1] >= 0 &&
      framePoint[0] <= viewport.width &&
      framePoint[1] <= viewport.height
    ) {
      candidate[region.id] = 1;
    }
  }

  for (const region of regions) {
    if (candidate[region.id] === 1) continue;
    const chains = source.chains[region.id];
    if (chains === undefined) continue;
    for (const chain of chains) {
      const first = lines.first[chain];
      const last = lines.last[chain];
      for (let vertex = first; vertex < last; vertex += 1) {
        const t0 = screenT[vertex];
        const t1 = screenT[vertex + 1];
        if (t0 <= 0 && t1 <= 0) continue;
        let u0 = screenU[vertex];
        let v0 = screenV[vertex];
        let u1 = screenU[vertex + 1];
        let v1 = screenV[vertex + 1];
        if (t0 <= 0 || t1 <= 0) {
          // The end behind the camera moves to the camera plane, where the map keeps
          // the direction of the line and takes the point out to the far distance.
          const inside = t0 > 0 ? vertex : vertex + 1;
          const outside = t0 > 0 ? vertex + 1 : vertex;
          const drop = screenT[inside] - screenT[outside];
          // The crossing itself has no screen position, so the clipped end stops just
          // short of it, where the map takes the line out to the far distance.
          const at = drop === 0 ? 0 : (screenT[inside] / drop) * (1 - 1e-6);
          const x =
            positions[inside * 3] +
            (positions[outside * 3] - positions[inside * 3]) * at;
          const z =
            positions[inside * 3 + 2] +
            (positions[outside * 3 + 2] - positions[inside * 3 + 2]) * at;
          work.projections += 1;
          toScreen(map, x, z, framePoint);
          if (t0 > 0) {
            u1 = framePoint[0];
            v1 = framePoint[1];
          } else {
            u0 = framePoint[0];
            v0 = framePoint[1];
          }
        }
        if (!segmentMeetsViewport(u0, v0, u1, v1, viewport)) continue;
        candidate[region.id] = 1;
        break;
      }
      if (candidate[region.id] === 1) break;
    }
  }
  return candidate;
}

/**
 * The clearance at a plane point, as the placement reads it.
 *
 * It is the larger of two lower bounds: the interpolated read of the downsampled
 * field, and the region's recorded clearance less the distance from the region's
 * centre. The field is a distance, so it is 1-Lipschitz and the second term is sound;
 * it is also exact at the centre, which is where most labels sit. The page holds the
 * field downsampled by 8 and each cell of it carries the smallest exact value in its
 * block, so a read at a centre — a local maximum of the field — comes back a median of
 * 368 light years low.
 *
 * The read is bilinear rather than nearest cell, so the drawn size of a label does not
 * step as the anchor crosses a cell edge.
 */
export function labelClearanceAt(
  geometry: RegionLabelGeometry,
  id: number,
  x: number,
  z: number,
): number {
  const read = clearanceAt(geometry.field, x, z);
  const centreX = geometry.centres[(id - 1) * 2];
  const centreZ = geometry.centres[(id - 1) * 2 + 1];
  const away = Math.hypot(x - centreX, z - centreZ);
  const fromCentre = geometry.clearances[id - 1] - away;
  const both = Math.max(read ?? Number.NEGATIVE_INFINITY, fromCentre);
  return Number.isFinite(both) ? Math.max(0, both) : 0;
}

/**
 * The clearance a label box needs at its anchor, in light years, or null when a corner
 * of the box reaches past the horizon.
 *
 * The four corners of the box, at the scale under test and centred on the projection
 * of the anchor, are unprojected to the plane. The requirement is the largest distance
 * from the anchor to those four plane points, plus the boundary departure bound, plus
 * half the drawn line width converted at the largest light years per pixel over the
 * same corners, plus two cells of the trace grid.
 *
 * The footprint is not the pixel diagonal of the box. Under obliquity the along-plane
 * scale is about 1.9 times the across-plane scale at a pitch of 35, and a box is about
 * 7 times wider than it is tall, so a pixel form asks about twice the true footprint.
 */
export function requiredClearance(
  map: PlaneMap,
  geometry: RegionLabelGeometry,
  anchorU: number,
  anchorV: number,
  anchorX: number,
  anchorZ: number,
  size: LabelSize,
  work: { unprojections: number },
): number | null {
  const halfWidth = size.width / 2;
  const halfHeight = size.height / 2;
  let footprint = 0;
  let perPixel = 0;
  for (let corner = 0; corner < 4; corner += 1) {
    const u = anchorU + (corner % 2 === 0 ? -halfWidth : halfWidth);
    const v = anchorV + (corner < 2 ? -halfHeight : halfHeight);
    work.unprojections += 1;
    if (toPlane(map, u, v, frameCorner) <= 0) return null;
    const away = Math.hypot(frameCorner[0] - anchorX, frameCorner[1] - anchorZ);
    if (away > footprint) footprint = away;
    const scale = lightYearsPerPixel(map, u, v, frameCorner[0], frameCorner[1]);
    if (scale > perPixel) perPixel = scale;
  }
  // The clearance is a distance to the traced boundary while the rule is about the
  // drawn line, which may sit up to the departure bound inside the region and is four
  // CSS pixels wide. The two trace cells cover the overshoot of a read between block
  // minima of the downsampled field.
  const traceCell = geometry.field.cell / CLEARANCE_DOWNSAMPLE;
  return (
    footprint +
    geometry.departureLy +
    (REGION_LINE_WIDTH_CSS / 2) * perPixel +
    2 * traceCell
  );
}

/**
 * The labels of one frame.
 *
 * The anchor is a function of the camera alone. It is the point of the plane segment
 * from the region's centre to the plane point under the middle of the frame nearest
 * the centre whose floor-scale box lies inside the viewport, it must read back as its
 * own region on the coarse grid, and the clearance there must hold the box at some
 * scale down to the floor. There is no cap on the count and no order between labels:
 * regions do not overlap on the plane and the plane projects one to one, so two boxes
 * that each lie inside their own region cannot overlap each other.
 */
export function placeLabels(
  view: View,
  viewport: Viewport,
  source: LabelSource,
  measure: MeasureLabel,
  regions: readonly Region[] = REGIONS,
  buffers: PlacementBuffers | null = null,
): Placement {
  const pool = fitPlacementBuffers(buffers, source.lines.vertexCount);
  const work = {
    projections: 0,
    vertexProjections: 0,
    unprojections: 0,
    steps: 0,
  };
  const reasons = pool.reasons;
  reasons.fill(LABEL_DRAWN);
  const labels: PlacedLabel[] = [];
  const done = (): Placement => ({ labels, reasons, ...work });

  // Step 1. The wanted point exists whenever the camera sits above the plane. The
  // cursor carries a height of its own and the controls move it, so this is not
  // always true; when it is not, no label is drawn at all.
  const radians = (view.pitch * Math.PI) / 180;
  const above = view.cursor[1] + view.distance * Math.sin(radians) > 0;
  const map = planeMap(view, viewport);
  if (!above || !map.usable) {
    for (const region of regions) reasons[region.id] = LABEL_BELOW_PLANE;
    return done();
  }
  if (toPlane(map, viewport.width / 2, viewport.height / 2, framePoint) <= 0) {
    for (const region of regions) reasons[region.id] = LABEL_BELOW_PLANE;
    return done();
  }
  const wantedX = framePoint[0];
  const wantedZ = framePoint[1];

  const candidate = markCandidates(map, viewport, source, pool, regions, work);
  const geometry = source.geometry;

  for (const region of regions) {
    if (candidate[region.id] !== 1) {
      reasons[region.id] = LABEL_OFF_SCREEN;
      continue;
    }
    const centreX = geometry.centres[(region.id - 1) * 2];
    const centreZ = geometry.centres[(region.id - 1) * 2 + 1];
    if (!Number.isFinite(centreX)) {
      reasons[region.id] = LABEL_OFF_SCREEN;
      continue;
    }
    const floorSize = measure(region.name, LABEL_FLOOR_SCALE);

    // Step 2. The slide. `fits` is "the projected point lies inside a fixed inset
    // rectangle", which is convex, and the part of the segment in front of the camera
    // is a suffix over which the projection traces a straight screen path in one
    // direction. So the feasible set is one interval ending at the wanted point, and
    // the anchor is its near end.
    const fits = (at: number): boolean => {
      const x = centreX + (wantedX - centreX) * at;
      const z = centreZ + (wantedZ - centreZ) * at;
      work.projections += 1;
      if (toScreen(map, x, z, framePoint) <= 0) return false;
      return boxInsideViewport(framePoint[0], framePoint[1], floorSize, viewport);
    };
    let at = 0;
    if (!fits(0)) {
      if (!fits(1)) {
        reasons[region.id] = LABEL_NO_ANCHOR;
        continue;
      }
      let low = 0;
      let high = 1;
      let steps = 0;
      for (;;) {
        // The search runs until the interval is shorter than one CSS pixel on screen,
        // not for a fixed count. A low end behind the camera has no screen position,
        // and the search moves it in front within a step or two, because a point near
        // the camera plane projects far outside the viewport and cannot be feasible.
        const lowX = centreX + (wantedX - centreX) * low;
        const lowZ = centreZ + (wantedZ - centreZ) * low;
        work.projections += 1;
        const lowT = toScreen(map, lowX, lowZ, framePoint);
        if (lowT > 0) {
          const lowU = framePoint[0];
          const lowV = framePoint[1];
          const highX = centreX + (wantedX - centreX) * high;
          const highZ = centreZ + (wantedZ - centreZ) * high;
          work.projections += 1;
          toScreen(map, highX, highZ, framePoint);
          if (
            Math.hypot(framePoint[0] - lowU, framePoint[1] - lowV) <= SLIDE_SEARCH_PIXEL
          ) {
            break;
          }
        }
        const middle = (low + high) / 2;
        if (middle <= low || middle >= high) break;
        steps += 1;
        if (fits(middle)) high = middle;
        else low = middle;
      }
      if (steps > work.steps) work.steps = steps;
      at = high;
    }
    const anchorX = centreX + (wantedX - centreX) * at;
    const anchorZ = centreZ + (wantedZ - centreZ) * at;

    // Step 3. The anchor must read back as its own region. The clearance field carries
    // a distance and no identity, so without this a box could sit inside a neighbour.
    if (coarseRegionIdAt(source.grid, anchorX, anchorZ) !== region.id) {
      reasons[region.id] = LABEL_OTHER_REGION;
      continue;
    }

    work.projections += 1;
    toScreen(map, anchorX, anchorZ, frameAnchor);
    const anchorU = frameAnchor[0];
    const anchorV = frameAnchor[1];
    const clearance = labelClearanceAt(geometry, region.id, anchorX, anchorZ);

    // Step 4. The size. The box holds the clearance at the anchor and lies inside the
    // viewport, and both are monotone in the scale, so the search is a bisection.
    const holds = (scale: number): boolean => {
      const size = measure(region.name, scale);
      if (!boxInsideViewport(anchorU, anchorV, size, viewport)) return false;
      const needed = requiredClearance(
        map,
        geometry,
        anchorU,
        anchorV,
        anchorX,
        anchorZ,
        size,
        work,
      );
      return needed !== null && clearance >= needed;
    };
    let scale = LABEL_FULL_SCALE;
    if (!holds(LABEL_FULL_SCALE)) {
      if (!holds(LABEL_FLOOR_SCALE)) {
        reasons[region.id] = LABEL_NO_ROOM;
        continue;
      }
      let low = LABEL_FLOOR_SCALE;
      let high = LABEL_FULL_SCALE;
      const fullWidth = measure(region.name, LABEL_FULL_SCALE).width;
      let steps = 0;
      // The search runs until the interval of scales left is narrower than one CSS
      // pixel of box width, as the slide runs to one CSS pixel of screen distance.
      while ((high - low) * fullWidth > SCALE_SEARCH_PIXEL) {
        const middle = (low + high) / 2;
        if (middle <= low || middle >= high) break;
        steps += 1;
        if (holds(middle)) low = middle;
        else high = middle;
      }
      if (steps > work.steps) work.steps = steps;
      scale = low;
    }

    const size = measure(region.name, scale);
    labels.push({
      id: region.id,
      name: region.name,
      scale,
      plane: { x: anchorX, z: anchorZ },
      left: anchorU - size.width / 2,
      top: anchorV - size.height / 2,
      width: size.width,
      height: size.height,
    });
  }
  return done();
}

/**
 * What the placement has cost: the frames and the times since the last reset, and the
 * work of the last frame. A frame that places nothing reports no work.
 */
export interface PlacementStats extends PlacementWork {
  /** How many frames the placement ran. */
  readonly frames: number;
  /** The mean time of the placement of one frame, in milliseconds. */
  readonly meanMs: number;
  /** The time of the longest single frame of that work, in milliseconds. */
  readonly worstMs: number;
}

/** One label the page shows, as a test reads it. */
export interface LabelReading {
  readonly id: number;
  readonly name: string;
  readonly scale: number;
}

/** The overlay that holds the label elements. */
export interface LabelOverlay {
  /**
   * Takes the coarse region grid, the label geometry and the boundary set the
   * placement reads. Nothing is placed before all three arrive.
   */
  setGrid(
    grid: CoarseRegionGrid,
    geometry: RegionLabelGeometry,
    lines: RegionLines,
  ): void;
  /** Places the labels of a view, or clears them when the switch is off. */
  update(view: View, viewport: Viewport, on: boolean): void;
  /** The labels of the last frame, with the scale each one draws at. */
  placements(): LabelReading[];
  /** The mean and the worst placement time since the last reset. */
  placement(): PlacementStats;
  /** Starts the placement time mean again. */
  resetPlacement(): void;
}

/**
 * Builds the label overlay in an element. The builder keeps one element per region and
 * measures each name once, at full size; a scale multiplies that box, which is what
 * the `scale` transform of the element gives.
 */
export function createLabelOverlay(
  host: HTMLElement,
  regions: readonly Region[] = REGIONS,
): LabelOverlay {
  const elements = new Map<number, HTMLElement>();
  const sizes = new Map<string, LabelSize>();
  for (const region of regions) {
    const element = host.ownerDocument.createElement('div');
    element.className = 'region-label';
    element.dataset['regionId'] = String(region.id);
    element.textContent = region.name;
    // The box is scaled from its top left corner, so the position the placement gives
    // is the position the browser draws at, at every scale.
    element.style.transformOrigin = 'top left';
    elements.set(region.id, element);
  }

  // A name is measured the first time a view asks for it, not at the start, so the
  // page lays out the few labels a view holds rather than all 42 before the first
  // frame. The box is rounded up, so a label held against the frame edge by the whole
  // pixel of its style still lies inside the viewport by its measured box.
  const measureById = (id: number, name: string): LabelSize => {
    const known = sizes.get(name);
    if (known !== undefined) return known;
    const element = elements.get(id);
    if (element === undefined) return { width: 0, height: 0 };
    const attached = element.parentNode !== null;
    if (!attached) {
      element.style.visibility = 'hidden';
      host.append(element);
    }
    const box = element.getBoundingClientRect();
    const size = { width: Math.ceil(box.width), height: Math.ceil(box.height) };
    if (!attached) {
      element.remove();
      element.style.visibility = '';
    }
    sizes.set(name, size);
    return size;
  };
  const byName = new Map(regions.map((region) => [region.name, region.id]));
  const measure: MeasureLabel = (name: string, scale: number): LabelSize => {
    const full = measureById(byName.get(name) ?? 0, name);
    return { width: full.width * scale, height: full.height * scale };
  };

  let source: LabelSource | null = null;
  let shown: PlacedLabel[] = [];
  let buffers: PlacementBuffers | null = null;
  let frames = 0;
  let totalMs = 0;
  let worstMs = 0;
  let work: PlacementWork = NO_WORK;

  return {
    setGrid(
      grid: CoarseRegionGrid,
      geometry: RegionLabelGeometry,
      lines: RegionLines,
    ): void {
      source = labelSource(grid, geometry, lines);
      buffers = fitPlacementBuffers(buffers, lines.vertexCount);
    },
    update(view: View, viewport: Viewport, on: boolean): void {
      let labels: PlacedLabel[] = [];
      // The counters describe the frame the page asks about. A frame that places
      // nothing reports no work, and does not keep the count of the frame before.
      work = NO_WORK;
      if (on && source !== null && labelFade(view.distance) > 0) {
        // The buffers are fitted outside the window the page times, so a resize or a
        // new boundary set cannot allocate inside a measurement.
        buffers = fitPlacementBuffers(buffers, source.lines.vertexCount);
        const started = performance.now();
        const placement = placeLabels(
          view,
          viewport,
          source,
          measure,
          regions,
          buffers,
        );
        const elapsed = performance.now() - started;
        labels = placement.labels;
        work = {
          projections: placement.projections,
          vertexProjections: placement.vertexProjections,
          unprojections: placement.unprojections,
          steps: placement.steps,
        };
        frames += 1;
        totalMs += elapsed;
        if (elapsed > worstMs) worstMs = elapsed;
      }
      const wanted = new Set(labels.map((label) => label.id));
      for (const label of shown) {
        if (wanted.has(label.id)) continue;
        elements.get(label.id)?.remove();
      }
      host.style.opacity = String(labelFade(view.distance));
      for (const label of labels) {
        const element = elements.get(label.id);
        if (element === undefined) continue;
        element.style.left = `${label.left}px`;
        element.style.top = `${label.top}px`;
        element.style.transform = label.scale === 1 ? '' : `scale(${label.scale})`;
        if (element.parentNode === null) host.append(element);
      }
      shown = labels;
    },
    placements(): LabelReading[] {
      return shown.map((label) => ({
        id: label.id,
        name: label.name,
        scale: label.scale,
      }));
    },
    placement(): PlacementStats {
      return {
        frames,
        meanMs: frames === 0 ? 0 : totalMs / frames,
        worstMs,
        ...work,
      };
    },
    resetPlacement(): void {
      frames = 0;
      totalMs = 0;
      worstMs = 0;
      work = NO_WORK;
    },
  };
}
