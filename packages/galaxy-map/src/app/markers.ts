// Places the hover ring, the selection pin and the marker name labels over the canvas.
// The marks are DOM elements in the same overlay the region labels use, so each one
// stays a crisp vector at every device pixel ratio and needs no shader.
//
// The module reads the marker size rule from `src/scene-data/marker-size.ts`, which the
// marker pass reads as well, so a mark and its marker never disagree about the size.
import { cameraPosition, nearPlane, viewProjectionMatrix } from '../camera/projection';
import type { Viewport } from '../camera/projection';
import type { View } from '../camera/view';
import { PIN_HEIGHT_CSS, PIN_TIP_GAP_CSS } from '../scene-data/icon-stack';
import {
  createNearestKeep,
  offerNearest,
  resetNearest,
} from '../scene-data/nearest-keep';
import type { NearestKeep } from '../scene-data/nearest-keep';
import { markerCssSize } from '../scene-data/marker-size';
import { DEFAULT_MAX_DRAW_RANGE_LY } from '../scene-data/real-systems';
import type { RealSystemSet } from '../scene-data/real-systems';
import { boxesOverlap } from './labels';
import type { LabelBox } from './labels';

/** How many marker name labels the overlay places, beside the hover and the selection. */
export const MAX_NAME_LABELS = 64;

/**
 * How many of the nearest markers the keeper holds. It is two more than the label cap,
 * because the label pass skips the hovered and the selected index as it walks the
 * keeper, so a frame that carries both still reaches 64 labels.
 *
 * The keeper holds every drawn marker and not the subset the labels want: the label
 * occlusion test reads the same list to find the marker that hides a label.
 */
export const MARKER_KEEP = MAX_NAME_LABELS + 2;

/** How far below the centre of a marker a name label sits, in CSS pixels. */
export const NAME_LABEL_GAP_CSS = 6;

/** The diameter of the hover ring, as a multiple of the marker diameter. */
export const RING_FACTOR = 3.2;

/** The smallest diameter of the hover ring, in CSS pixels. */
export const MIN_RING_CSS = 24;

/** The stroke of the hover ring. */
export const RING_STROKE = 'rgba(255, 255, 255, 0.5)';

/** The width of the selection pin, in CSS pixels. */
export const PIN_WIDTH_CSS = 16.5;

// The height of the pin and its tip offset live in `src/scene-data/icon-stack.ts`,
// because the renderer places the icon stack against both of them. The overlay
// re-exports the two names, so a reader of the pin still finds them here.
export { PIN_HEIGHT_CSS, PIN_TIP_GAP_CSS };

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

// The nearest keeper moved to `src/scene-data/nearest-keep.ts`, because the icon pass
// keeps a nearest list of its own and the renderer must not import the overlay. The
// overlay re-exports the four names, so a reader of the overlay still finds them here.
export { createNearestKeep, offerNearest, resetNearest };
export type { NearestKeep };

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
  /** How many name labels the last frame placed. A hidden label counts. */
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
  // Over every plane element. `src/app/plane-overlay.ts` states the rule.
  style.zIndex = '1';
  style.pointerEvents = 'none';
  style.whiteSpace = 'nowrap';
  style.boxSizing = 'border-box';
  style.height = `${LABEL_HEIGHT_CSS}px`;
  style.padding = '1px 4px';
  style.font = `10px/${LABEL_HEIGHT_CSS - 2}px 'IBM Plex Mono', ui-monospace, monospace`;
  style.letterSpacing = '1px';
  style.color = 'rgba(244, 230, 216, 0.82)';
  // A drawn stroke and not a blurred glow. Firefox rasterises a blurred text shadow on
  // the CPU, and the overlay's two blurred shadows cost 4.2 ms of a frame that cost
  // 12.1 ms while the camera moves. `browser-suite` holds the reading. The stroke is
  // 2 pixels, against the coordinate label's 2.5, because this label draws smaller.
  style.paintOrder = 'stroke fill';
  style.webkitTextStroke = '2px rgba(0, 0, 0, 0.9)';
  style.background = 'rgba(8, 6, 10, 0.45)';
  return element;
}

/** Builds the hover ring element. */
function makeRing(document: Document): HTMLElement {
  const element = document.createElement('div');
  element.className = 'gm-system-ring';
  const style = element.style;
  style.position = 'absolute';
  // Over every plane element. `src/app/plane-overlay.ts` states the rule.
  style.zIndex = '1';
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
  // Over every plane element. `src/app/plane-overlay.ts` states the rule.
  svg.style.zIndex = '1';

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
  const keep = createNearestKeep(MARKER_KEEP);
  const boxes: LabelBox[] = [];
  // The screen place of each keeper entry, worked out once a frame. The occlusion test
  // reads it for every placed label, so one projection per candidate serves the whole
  // frame rather than one per candidate per label.
  const candidateX = new Float64Array(MARKER_KEEP);
  const candidateY = new Float64Array(MARKER_KEEP);
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
      const near = nearPlane(view.distance);
      const halfWidth = viewport.width / 2;
      const halfHeight = viewport.height / 2;

      // The cursor in the same camera-relative frame as the offsets below.
      const cursorOffset: [number, number, number] = [
        view.cursor[0] - camera[0],
        view.cursor[1] - camera[1],
        camera[2] - view.cursor[2],
      ];

      /**
       * The range of one system from the **camera**, or -1 when its marker does not draw.
       *
       * The gate and the reading are two different ranges. The gate measures from the
       * cursor, as `systems.vert` does, so this overlay keeps every marker the frame drew
       * and no other. The reading is the camera range, because `markerCssSize` and
       * `offerNearest` both need the distance to the eye.
       */
      const rangeOf = (index: number): number => {
        if (index < 0 || index >= count) return -1;
        if (flags[index] !== 1) return -1;
        const base = index * 3;
        const x = (positions[base] as number) - camera[0];
        const y = (positions[base + 1] as number) - camera[1];
        // The renderer's world frame runs its third axis the other way to the game's.
        const z = camera[2] - (positions[base + 2] as number);
        const category = set.category(categoryIndices[index] as number);
        const limit =
          category === null ? DEFAULT_MAX_DRAW_RANGE_LY : category.maxDrawRange;
        const cx = x - cursorOffset[0];
        const cy = y - cursorOffset[1];
        const cz = z - cursorOffset[2];
        if (cx * cx + cy * cy + cz * cz > limit * limit) return -1;
        return Math.sqrt(x * x + y * y + z * z);
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
          markerCss: markerCssSize(range),
        };
      };

      const hoverPlace = placeOf(hoverIndex);
      const selectedPlace = placeOf(selectedIndex);

      // The sweep runs before the first label, because the occlusion rule below reads
      // the keeper and the hover label is placed first.
      resetNearest(keep);
      if (namesOn && count > 0) {
        // A candidate outside the viewport is dropped before any other work, so the
        // nearest-66 rule reads only what the frame can show.
        for (let index = 0; index < count; index += 1) {
          const spot = placeOf(index);
          if (spot === null) continue;
          if (spot.x < 0 || spot.y < 0) continue;
          if (spot.x > viewport.width || spot.y > viewport.height) continue;
          // Every drawn marker is offered, the hovered one and the selected one as well:
          // the label pass skips those two indices as it walks the keeper, and the
          // occlusion test needs every marker that can hide a label.
          offerNearest(keep, index, rangeOf(index));
        }
      }

      // The candidate places of the keeper, worked out once for the occlusion test. The
      // keeper is held in ascending range, so the walk of it breaks on range. A frame
      // with the name switch off keeps nothing, so it projects nothing here.
      for (let slot = 0; slot < keep.count; slot += 1) {
        const spot = placeOf(keep.indices[slot] as number);
        candidateX[slot] = spot === null ? Number.NaN : spot.x;
        candidateY[slot] = spot === null ? Number.NaN : spot.y;
      }

      /**
       * True where the marker of a system nearer the camera than `owner` projects inside
       * the box. A DOM element draws over every pixel the canvas drew at its place, so a
       * label of a far system would otherwise cover a near star.
       */
      const covered = (
        owner: number,
        ownerRange: number,
        left: number,
        top: number,
        width: number,
        height: number,
      ): boolean => {
        for (let slot = 0; slot < keep.count; slot += 1) {
          if ((keep.ranges[slot] as number) >= ownerRange) return false;
          const index = keep.indices[slot] as number;
          if (index === owner) continue;
          const x = candidateX[slot] as number;
          const y = candidateY[slot] as number;
          if (Number.isNaN(x)) continue;
          if (x < left || x > left + width) continue;
          if (y < top || y > top + height) continue;
          return true;
        }
        return false;
      };

      // The hover label and the selection label go first, because they draw whatever the
      // switch below says and the overlap rule drops what comes after them.
      boxes.length = 0;
      let placed = 0;
      /**
       * Places one label. A pinned label is the hovered or the selected one: it takes no
       * overlap test and it never hides, because the user asked for that name.
       */
      const place = (index: number, spot: MarkerPlace, pinned: boolean): void => {
        const system = set.system(index);
        if (system === null) return;
        const box = labelBoxOf(system.name, spot);
        if (!pinned && boxes.some((other) => boxesOverlap(box, other))) return;
        const element = labelAt(placed);
        if (element.textContent !== system.name) element.textContent = system.name;
        element.style.left = `${box.left}px`;
        element.style.top = `${box.top}px`;
        // A hidden label keeps its place, its pool slot and its count, so the frame that
        // shows it again costs one style write and allocates nothing. The whole box is
        // the test, because a name half covered is a name the reader cannot trust.
        const hide =
          !pinned &&
          covered(index, rangeOf(index), box.left, box.top, box.width, box.height)
            ? 'hidden'
            : '';
        if (element.style.visibility !== hide) element.style.visibility = hide;
        if (element.parentNode === null) host.append(element);
        boxes.push(box);
        placed += 1;
      };

      if (hoverPlace !== null) place(hoverIndex, hoverPlace, true);
      if (selectedPlace !== null && selectedIndex !== hoverIndex) {
        place(selectedIndex, selectedPlace, true);
      }

      if (namesOn) {
        // The hover and the selection place their own label first, so the pass skips
        // them here. The counter counts placements and not walked entries: a label the
        // overlap rule drops must not spend one of the 64.
        let named = 0;
        for (let slot = 0; slot < keep.count && named < MAX_NAME_LABELS; slot += 1) {
          const index = keep.indices[slot] as number;
          if (index === hoverIndex || index === selectedIndex) continue;
          const spot = placeOf(index);
          if (spot === null) continue;
          const before = placed;
          place(index, spot, false);
          if (placed > before) named += 1;
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
