// Places the region name labels over the canvas. The labels are DOM elements in an
// overlay, so the browser reads them as text and the test needs no pixel measure.
import { planePoint, project, rayDirection } from '../camera/projection';
import type { Viewport } from '../camera/projection';
import type { View } from '../camera/view';
import { REGION_FADE_IN_FAR, REGION_FADE_IN_NEAR } from '../render/region-pass';
import { REGIONS } from '../scene-data/regions';
import type { Region } from '../scene-data/regions';

/** How far from the cursor a plane point of the visible area can lie, by distance. */
export const PLANE_AREA_LIMIT = 8;

/** How far from the frame edge an anchor stays, in CSS pixels. */
export const LABEL_INSET = 48;

/** How many labels the page shows at once. */
export const MAX_LABELS = 12;

/** An axis-aligned box on the galactic plane, in light years. */
export interface PlaneBox {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/** A point on the screen, in CSS pixels from the top left. */
export interface AnchorPoint {
  readonly x: number;
  readonly y: number;
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
}

function clamp(value: number, low: number, high: number): number {
  if (!Number.isFinite(value)) return (low + high) / 2;
  if (high < low) return (low + high) / 2;
  return Math.min(Math.max(value, low), high);
}

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
 * The axis-aligned box of the plane points under the four viewport corners and the
 * viewport centre, on the plane `y = 0`. Each ray's point stays within 8 times the zoom
 * distance of the cursor, so a ray near the horizon does not make the box infinite. The
 * box always holds the cursor.
 */
export function visiblePlaneArea(view: View, viewport: Viewport): PlaneBox {
  const limit = PLANE_AREA_LIMIT * view.distance;
  const cursorX = view.cursor[0];
  const cursorZ = view.cursor[2];
  let minX = cursorX;
  let maxX = cursorX;
  let minZ = cursorZ;
  let maxZ = cursorZ;

  const pixels: AnchorPoint[] = [
    { x: 0, y: 0 },
    { x: viewport.width, y: 0 },
    { x: 0, y: viewport.height },
    { x: viewport.width, y: viewport.height },
    { x: viewport.width / 2, y: viewport.height / 2 },
  ];
  for (const pixel of pixels) {
    let x: number;
    let z: number;
    const point = planePoint(view, pixel, viewport, 0);
    if (point === null) {
      // The ray runs away from the plane. Take the limit along the ray in the plane.
      const direction = rayDirection(view, pixel, viewport);
      const length = Math.hypot(direction[0], direction[2]);
      if (length < 1e-12) continue;
      x = cursorX + (direction[0] / length) * limit;
      z = cursorZ + (direction[2] / length) * limit;
    } else {
      x = point[0];
      z = point[2];
      const range = Math.hypot(x - cursorX, z - cursorZ);
      if (range > limit) {
        x = cursorX + ((x - cursorX) * limit) / range;
        z = cursorZ + ((z - cursorZ) * limit) / range;
      }
    }
    if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  return { minX, maxX, minZ, maxZ };
}

/** True when a region's bounds meet a box on the plane. */
export function boundsMeet(region: Region, area: PlaneBox): boolean {
  return (
    region.bounds.minX <= area.maxX &&
    region.bounds.maxX >= area.minX &&
    region.bounds.minZ <= area.maxZ &&
    region.bounds.maxZ >= area.minZ
  );
}

/**
 * The anchor of a region's label: the projection of its centroid at `y = 0`, held
 * inside the viewport with a 48 pixel inset, so the region the camera sits inside keeps
 * a label at the frame edge.
 *
 * A centroid behind the camera has a negative `w`. The divide by `w` then puts the
 * point on the side of the frame opposite the region, and negating the whole clip
 * position does not help, because `-x / -w` is `x / w`. This negates the two screen
 * axes after the divide, which puts the anchor on the side the region lies on.
 */
export function labelAnchor(
  view: View,
  centroid: readonly [number, number],
  viewport: Viewport,
): AnchorPoint {
  const screen = project(view, [centroid[0], 0, centroid[1]], viewport);
  const x = screen.inFront ? screen.x : viewport.width - screen.x;
  const y = screen.inFront ? screen.y : viewport.height - screen.y;
  return {
    x: clamp(x, LABEL_INSET, viewport.width - LABEL_INSET),
    y: clamp(y, LABEL_INSET, viewport.height - LABEL_INSET),
  };
}

/** The box of a label centred on its anchor, moved to lie inside the viewport. */
export function labelBox(
  anchor: AnchorPoint,
  size: LabelSize,
  viewport: Viewport,
): LabelBox {
  return {
    left: clamp(anchor.x - size.width / 2, 0, viewport.width - size.width),
    top: clamp(anchor.y - size.height / 2, 0, viewport.height - size.height),
    width: size.width,
    height: size.height,
  };
}

/** True when two boxes share an area. */
export function boxesOverlap(first: LabelBox, second: LabelBox): boolean {
  return (
    first.left < second.left + second.width &&
    second.left < first.left + first.width &&
    first.top < second.top + second.height &&
    second.top < first.top + first.height
  );
}

/**
 * The candidates of a view, in the order they take a place. The candidate whose
 * centroid is nearest the cursor comes first, because that is what names the region the
 * view is centred on; a pure largest-first order does not, since the `Galactic Centre`
 * is the smallest of the 33 candidates at a view of the galactic centre. The rest
 * follow largest footprint first.
 */
export function orderCandidates(
  view: View,
  area: PlaneBox,
  regions: readonly Region[] = REGIONS,
): Region[] {
  const candidates = regions
    .filter((region) => boundsMeet(region, area))
    .sort((first, second) => second.area - first.area);
  if (candidates.length === 0) return candidates;

  const rangeTo = (region: Region): number =>
    Math.hypot(
      region.centroid[0] - view.cursor[0],
      region.centroid[1] - view.cursor[2],
    );
  let nearest = 0;
  for (let index = 1; index < candidates.length; index += 1) {
    if (rangeTo(candidates[index] as Region) < rangeTo(candidates[nearest] as Region)) {
      nearest = index;
    }
  }
  const [first] = candidates.splice(nearest, 1);
  if (first !== undefined) candidates.unshift(first);
  return candidates;
}

/**
 * The labels the page shows for a view. A region is a candidate when its bounds meet
 * the visible plane area. The candidate nearest the cursor takes a place first and the
 * rest follow largest footprint first, a label that would overlap a placed one is
 * dropped, and at most 12 are placed.
 */
export function chooseLabels(
  view: View,
  viewport: Viewport,
  measure: (name: string) => LabelSize,
  regions: readonly Region[] = REGIONS,
): PlacedLabel[] {
  if (labelFade(view.distance) <= 0) return [];
  const candidates = orderCandidates(view, visiblePlaneArea(view, viewport), regions);

  const placed: PlacedLabel[] = [];
  for (const region of candidates) {
    if (placed.length >= MAX_LABELS) break;
    const box = labelBox(
      labelAnchor(view, region.centroid, viewport),
      measure(region.name),
      viewport,
    );
    if (placed.some((other) => boxesOverlap(box, other))) continue;
    placed.push({ id: region.id, name: region.name, ...box });
  }
  return placed;
}

/** The overlay that holds the label elements. */
export interface LabelOverlay {
  /** Places the labels of a view, or clears them when the switch is off. */
  update(view: View, viewport: Viewport, on: boolean): void;
}

/**
 * Builds the label overlay in an element. The builder measures every region name once,
 * with the element's own style, and then keeps one element per region to reuse.
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
  const measure = (name: string): LabelSize => measureById(byName.get(name) ?? 0, name);

  let shown: PlacedLabel[] = [];
  return {
    update(view: View, viewport: Viewport, on: boolean): void {
      const labels = on ? chooseLabels(view, viewport, measure, regions) : [];
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
        if (element.parentNode === null) host.append(element);
      }
      shown = labels;
    },
  };
}
