// Places the hover ring, the selection pin and the marker name labels over the canvas.
// The marks are DOM elements in the same overlay the region labels use, so each one
// stays a crisp vector at every device pixel ratio and needs no shader.
//
// The module reads the marker size rule from `src/scene-data/marker-size.ts`, which the
// marker pass reads as well, so a mark and its marker never disagree about the size.
import { cameraPosition, nearPlane, viewProjectionMatrix } from '../camera/projection';
import type { Viewport } from '../camera/projection';
import type { View } from '../camera/view';
import { markerCssSize } from '../scene-data/marker-size';
import { focalCssPixels } from '../scene-data/picking';
import { DEFAULT_MAX_DRAW_RANGE_LY } from '../scene-data/real-systems';
import type { RealSystemSet } from '../scene-data/real-systems';
import { boxesOverlap } from './labels';
import type { LabelBox } from './labels';

/** How many marker name labels the overlay places, beside the hover and the selection. */
export const MAX_NAME_LABELS = 64;

/** How far below the centre of a marker a name label sits, in CSS pixels. */
export const NAME_LABEL_GAP_CSS = 6;

/** The diameter of the hover ring, as a multiple of the marker diameter. */
export const RING_FACTOR = 3.2;

/** The smallest diameter of the hover ring, in CSS pixels. */
export const MIN_RING_CSS = 24;

/** The stroke of the hover ring. */
export const RING_STROKE = 'rgba(255, 255, 255, 0.5)';

/** The height of the selection pin, in CSS pixels. */
export const PIN_HEIGHT_CSS = 28;

/** The width of the selection pin, in CSS pixels. */
export const PIN_WIDTH_CSS = 16.5;

/** How far above the centre of a marker the tip of the pin sits, in CSS pixels. */
export const PIN_TIP_GAP_CSS = 2;

/** The fill of the selection pin. */
export const PIN_FILL = '#00CDF7';

/** The outline of the selection pin, which holds it over the cream core as well. */
export const PIN_OUTLINE = 'rgba(2, 10, 26, 0.9)';

/** The width of the box the pin's points are given in. */
export const PIN_BOX_WIDTH = 476.25;

/** The height of the box the pin's points are given in. */
export const PIN_BOX_HEIGHT = 806.06;

/**
 * The pin: a four-point outline with its tip at the bottom, and a diamond cut from it
 * near its head. The even-odd fill rule cuts the second contour out of the first.
 */
export const PIN_PATH =
  'M 238.13 0 L 0 211.44 L 238.12 806.06 L 476.25 211.44 Z ' +
  'M 238 353.89 L 73 206.89 L 238 59.89 L 403.17 206.89 Z';

/** The diameter of the hover ring at a marker diameter, in CSS pixels. */
export function ringCssSize(markerCss: number): number {
  return Math.max(MIN_RING_CSS, markerCss * RING_FACTOR);
}

/** The top of a name label under a marker centre, in CSS pixels. */
export function labelTopCss(centreY: number, markerCss: number): number {
  return centreY + markerCss / 2 + NAME_LABEL_GAP_CSS;
}

/** The top of the pin over a marker centre, in CSS pixels. */
export function pinTopCss(centreY: number, markerCss: number): number {
  return centreY - markerCss / 2 - PIN_TIP_GAP_CSS - PIN_HEIGHT_CSS;
}

/**
 * The smallest ranges of a sweep, kept in ascending order. The candidate list can hold
 * 10,000 entries and the overlay keeps 64 of them every frame, so a sort of the whole
 * list is what this replaces: a candidate no nearer than the worst kept one is refused
 * in one comparison, and one that is nearer moves at most 64 entries.
 */
export interface NearestKeep {
  /** The kept indices, nearest the camera first. */
  readonly indices: Int32Array;
  /** The range of each kept index, ascending. */
  readonly ranges: Float64Array;
  /** How many the keeper holds at most. */
  readonly limit: number;
  /** How many it holds now. */
  count: number;
}

/** Makes a keeper of a size. */
export function createNearestKeep(limit: number): NearestKeep {
  return {
    indices: new Int32Array(limit),
    ranges: new Float64Array(limit),
    limit,
    count: 0,
  };
}

/** Empties a keeper. It keeps its arrays, so a frame allocates nothing. */
export function resetNearest(keep: NearestKeep): void {
  keep.count = 0;
}

/** Offers one candidate to a keeper. */
export function offerNearest(keep: NearestKeep, index: number, range: number): void {
  const { indices, ranges, limit } = keep;
  if (keep.count === limit && range >= (ranges[limit - 1] as number)) return;
  let at = Math.min(keep.count, limit - 1);
  while (at > 0 && (ranges[at - 1] as number) > range) {
    indices[at] = indices[at - 1] as number;
    ranges[at] = ranges[at - 1] as number;
    at -= 1;
  }
  indices[at] = index;
  ranges[at] = range;
  if (keep.count < limit) keep.count += 1;
}

/** Where one marker draws on the screen. */
interface MarkerPlace {
  readonly x: number;
  readonly y: number;
  readonly markerCss: number;
}

/** What one overlay update reads. */
export interface MarkerFrame {
  readonly view: View;
  readonly viewport: Viewport;
  readonly set: RealSystemSet;
  /** The hovered system, or -1. */
  readonly hoverIndex: number;
  /** The selected system, or -1. */
  readonly selectedIndex: number;
  /** True while the name label switch is on. */
  readonly namesOn: boolean;
}

/** The overlay that holds the marks. */
export interface MarkerOverlay {
  /** Places the marks of one frame. */
  update(frame: MarkerFrame): void;
  /** How many name labels the last frame placed. */
  labelCount(): number;
  /** Takes every mark out of the overlay. */
  clear(): void;
}

/**
 * The width of a name label, in CSS pixels, without a measurement of the element. The
 * face is a monospaced one at a fixed size, so the advance of a character is fixed and
 * the overlap test needs no layout: a measurement of 64 boxes each frame would flush the
 * layout 64 times inside the frame budget.
 */
const LABEL_CHARACTER_CSS = 7;

/** The padding of a name label, left and right together, in CSS pixels. */
const LABEL_PADDING_CSS = 8;

/** The height of a name label, in CSS pixels. */
const LABEL_HEIGHT_CSS = 14;

/** The box of a name label of a name, centred on a marker. */
function labelBoxOf(name: string, place: MarkerPlace): LabelBox {
  const width = name.length * LABEL_CHARACTER_CSS + LABEL_PADDING_CSS;
  return {
    left: place.x - width / 2,
    top: labelTopCss(place.y, place.markerCss),
    width,
    height: LABEL_HEIGHT_CSS,
  };
}

/** Builds one name label element. */
function makeLabel(document: Document): HTMLElement {
  const element = document.createElement('div');
  element.className = 'gm-system-label';
  const style = element.style;
  style.position = 'absolute';
  style.pointerEvents = 'none';
  style.whiteSpace = 'nowrap';
  style.boxSizing = 'border-box';
  style.height = `${LABEL_HEIGHT_CSS}px`;
  style.padding = '1px 4px';
  style.font = `10px/${LABEL_HEIGHT_CSS - 2}px 'IBM Plex Mono', ui-monospace, monospace`;
  style.letterSpacing = '1px';
  style.color = 'rgba(244, 230, 216, 0.82)';
  style.textShadow = '0 0 8px #000, 0 1px 3px #000';
  style.background = 'rgba(8, 6, 10, 0.45)';
  return element;
}

/** Builds the hover ring element. */
function makeRing(document: Document): HTMLElement {
  const element = document.createElement('div');
  element.className = 'gm-system-ring';
  const style = element.style;
  style.position = 'absolute';
  style.pointerEvents = 'none';
  style.boxSizing = 'border-box';
  style.borderRadius = '50%';
  style.border = `1px solid ${RING_STROKE}`;
  return element;
}

/** Builds the selection pin element. */
function makePin(document: Document): SVGSVGElement {
  const namespace = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(namespace, 'svg');
  svg.setAttribute('class', 'gm-system-pin');
  svg.setAttribute('viewBox', `0 0 ${PIN_BOX_WIDTH} ${PIN_BOX_HEIGHT}`);
  // The pin is 28 CSS pixels high and 16.5 wide, which is not the ratio of the box the
  // points are given in, so the two axes take their own scale.
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('width', String(PIN_WIDTH_CSS));
  svg.setAttribute('height', String(PIN_HEIGHT_CSS));
  svg.style.position = 'absolute';
  svg.style.pointerEvents = 'none';
  svg.style.overflow = 'visible';

  const path = document.createElementNS(namespace, 'path');
  path.setAttribute('d', PIN_PATH);
  path.setAttribute('fill', PIN_FILL);
  path.setAttribute('fill-rule', 'evenodd');
  path.setAttribute('stroke', PIN_OUTLINE);
  // The stroke keeps its width in CSS pixels whatever the scale of the box is.
  path.setAttribute('vector-effect', 'non-scaling-stroke');
  path.setAttribute('stroke-width', '1');
  svg.append(path);
  return svg;
}

/**
 * Builds the marker overlay in an element. It keeps one ring, one pin and a pool of name
 * label elements, so a frame adds no element the frame before did not need.
 */
export function createMarkerOverlay(host: HTMLElement): MarkerOverlay {
  const document = host.ownerDocument;
  const ring = makeRing(document);
  const pin = makePin(document);
  const labels: HTMLElement[] = [];
  const keep = createNearestKeep(MAX_NAME_LABELS);
  const boxes: LabelBox[] = [];
  let shownLabels = 0;

  /** One label element of the pool, made on the frame that first needs it. */
  const labelAt = (index: number): HTMLElement => {
    let element = labels[index];
    if (element === undefined) {
      element = makeLabel(document);
      labels[index] = element;
    }
    return element;
  };

  const clear = (): void => {
    ring.remove();
    pin.remove();
    for (const element of labels) element.remove();
    shownLabels = 0;
    boxes.length = 0;
  };

  return {
    update(frame: MarkerFrame): void {
      const { view, viewport, set, hoverIndex, selectedIndex, namesOn } = frame;
      const count = set.count;
      const positions = set.positions;
      const flags = set.markerFlags;
      const categoryIndices = set.categoryIndices;
      const camera = cameraPosition(view);
      const matrix = viewProjectionMatrix(view, viewport);
      const focalCss = focalCssPixels(viewport);
      const near = nearPlane(view.distance);
      const halfWidth = viewport.width / 2;
      const halfHeight = viewport.height / 2;

      /** The range of one system from the camera, or -1 when its marker does not draw. */
      const rangeOf = (index: number): number => {
        if (index < 0 || index >= count) return -1;
        if (flags[index] !== 1) return -1;
        const base = index * 3;
        const x = (positions[base] as number) - camera[0];
        const y = (positions[base + 1] as number) - camera[1];
        // The renderer's world frame runs its third axis the other way to the game's.
        const z = camera[2] - (positions[base + 2] as number);
        const range = Math.sqrt(x * x + y * y + z * z);
        const category = set.category(categoryIndices[index] as number);
        const limit =
          category === null ? DEFAULT_MAX_DRAW_RANGE_LY : category.maxDrawRange;
        return range > limit ? -1 : range;
      };

      /** Where one system's marker draws, or null when it does not draw. */
      const placeOf = (index: number): MarkerPlace | null => {
        const range = rangeOf(index);
        if (range < 0) return null;
        const base = index * 3;
        const x = (positions[base] as number) - camera[0];
        const y = (positions[base + 1] as number) - camera[1];
        const z = camera[2] - (positions[base + 2] as number);
        const clipW = matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15];
        if (clipW <= near) return null;
        const clipX = matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12];
        const clipY = matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13];
        return {
          x: (clipX / clipW + 1) * halfWidth,
          y: (1 - clipY / clipW) * halfHeight,
          markerCss: markerCssSize(focalCss, range),
        };
      };

      const hoverPlace = placeOf(hoverIndex);
      const selectedPlace = placeOf(selectedIndex);

      // The hover label and the selection label go first, because they draw whatever the
      // switch below says and the overlap rule drops what comes after them.
      boxes.length = 0;
      let placed = 0;
      const place = (index: number, spot: MarkerPlace, skipOverlap: boolean): void => {
        const system = set.system(index);
        if (system === null) return;
        const box = labelBoxOf(system.name, spot);
        if (!skipOverlap && boxes.some((other) => boxesOverlap(box, other))) return;
        const element = labelAt(placed);
        if (element.textContent !== system.name) element.textContent = system.name;
        element.style.left = `${box.left}px`;
        element.style.top = `${box.top}px`;
        if (element.parentNode === null) host.append(element);
        boxes.push(box);
        placed += 1;
      };

      if (hoverPlace !== null) place(hoverIndex, hoverPlace, true);
      if (selectedPlace !== null && selectedIndex !== hoverIndex) {
        place(selectedIndex, selectedPlace, true);
      }

      if (namesOn && count > 0) {
        // A candidate outside the viewport is dropped before any other work, so the
        // nearest-64 rule reads only what the frame can show.
        resetNearest(keep);
        for (let index = 0; index < count; index += 1) {
          if (index === hoverIndex || index === selectedIndex) continue;
          const spot = placeOf(index);
          if (spot === null) continue;
          if (spot.x < 0 || spot.y < 0) continue;
          if (spot.x > viewport.width || spot.y > viewport.height) continue;
          offerNearest(keep, index, rangeOf(index));
        }
        for (let slot = 0; slot < keep.count; slot += 1) {
          const index = keep.indices[slot] as number;
          const spot = placeOf(index);
          if (spot === null) continue;
          place(index, spot, false);
        }
      }

      for (let index = placed; index < shownLabels; index += 1) {
        labels[index]?.remove();
      }
      shownLabels = placed;

      if (hoverPlace === null) {
        ring.remove();
      } else {
        const size = ringCssSize(hoverPlace.markerCss);
        ring.style.width = `${size}px`;
        ring.style.height = `${size}px`;
        ring.style.left = `${hoverPlace.x - size / 2}px`;
        ring.style.top = `${hoverPlace.y - size / 2}px`;
        if (ring.parentNode === null) host.append(ring);
      }

      if (selectedPlace === null) {
        pin.remove();
      } else {
        pin.style.left = `${selectedPlace.x - PIN_WIDTH_CSS / 2}px`;
        pin.style.top = `${pinTopCss(selectedPlace.y, selectedPlace.markerCss)}px`;
        if (pin.parentNode === null) host.append(pin);
      }
    },
    labelCount(): number {
      return shownLabels;
    },
    clear,
  };
}
