// Places the hover ring, the selection pin, the marker name labels and the icon stacks
// over the canvas.
// The marks are DOM elements in the same overlay the region labels use, so each one
// stays a crisp vector at every device pixel ratio and needs no shader.
//
// The module reads the marker size rule from `src/scene-data/marker-size.ts`, which the
// marker pass reads as well, so a mark and its marker never disagree about the size.
import { cameraPosition, nearPlane, viewProjectionMatrix } from '../camera/projection';
import type { Viewport } from '../camera/projection';
import type { View } from '../camera/view';
import type { ResolvedIcon } from '../scene-data/marker-icons';
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
 * The keeper holds every drawn marker and not the subset the labels want: the icon
 * occlusion test reads the same list to find the marker that hides an element.
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

/** The side of one icon of a stack, in CSS pixels. */
export const ICON_CSS_SIZE = 28;

/** The gap between two icons of one stack, in CSS pixels. */
export const ICON_GAP_CSS = 2;

/** The width of the arrow under the lowest icon, in CSS pixels. */
export const ARROW_WIDTH_CSS = 8;

/** The height of the arrow under the lowest icon, in CSS pixels. */
export const ARROW_HEIGHT_CSS = 5;

/** How many icon stacks the overlay places. */
export const MAX_ICON_STACKS = 32;

/**
 * The stacking level of the stack at a slot of the keeper. The keeper holds the kept
 * systems nearest first, so slot 0 is the one closest to the camera and takes the highest
 * level. Two stacks that cross on the screen then read in their depth order.
 *
 * The levels run 1 to 32 inside the stack layer, which `STACK_LAYER_Z` puts over the
 * other overlay elements. The layer is a stacking context of its own, so no level here
 * reaches the page and none of them can draw over the HUD.
 */
export function iconZIndex(slot: number): number {
  return MAX_ICON_STACKS - Math.min(slot, MAX_ICON_STACKS - 1);
}

/**
 * The stacking level of the layer that holds every stack. The plane elements sit at 0 and
 * the ring, the pin and the name labels at 1, which `src/app/plane-overlay.ts` states, so
 * 2 puts a stack over all of them. The HUD root sits at 10 in the same parent as the
 * overlay host, so the layer stays under the HUD.
 */
export const STACK_LAYER_Z = 2;

/** The diameter of the hover ring at a marker diameter, in CSS pixels. */
export function ringCssSize(markerCss: number): number {
  return Math.max(MIN_RING_CSS, markerCss * RING_FACTOR);
}

/**
 * How far the stack of a selected system rises, in CSS pixels. It is the height of the
 * pin, so the pin keeps its own place and the two do not draw over each other.
 */
function stackLiftCss(selected: boolean): number {
  return selected ? PIN_HEIGHT_CSS : 0;
}

/**
 * The apex of the arrow over a marker centre, in CSS pixels. The apex points down and
 * sits at the tip offset the pin takes, so the stack and the pin start from one rule.
 */
export function arrowApexCss(
  centreY: number,
  markerCss: number,
  selected: boolean,
): number {
  return centreY - markerCss / 2 - PIN_TIP_GAP_CSS - stackLiftCss(selected);
}

/**
 * The bottom of the icon at an index of a stack, in CSS pixels. Index 0 is the record's
 * first icon, which is the lowest one, and it sits on the top of the arrow.
 */
export function iconBottomCss(
  centreY: number,
  markerCss: number,
  index: number,
  selected: boolean,
): number {
  return (
    arrowApexCss(centreY, markerCss, selected) -
    ARROW_HEIGHT_CSS -
    index * (ICON_CSS_SIZE + ICON_GAP_CSS)
  );
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
  /** True while the icon stack switch is on. */
  readonly iconsOn: boolean;
}

/** The overlay that holds the marks. */
export interface MarkerOverlay {
  /** Places the marks of one frame. */
  update(frame: MarkerFrame): void;
  /** How many name labels the last frame placed. */
  labelCount(): number;
  /** How many icons the last frame placed. */
  iconCount(): number;
  /** How many arrows the last frame placed. */
  arrowCount(): number;
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
  // The frame writes the level of the stack this arrow belongs to, so the arrow and its
  // icons read in one depth order. The value here is what an arrow carries before its
  // first placement.
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
 * Builds one icon element. It is an `img` and not inline SVG: a built-in vector carries
 * its own colour and needs no recolouring, and a host icon is a URL the library never
 * fetches and parses. `alt` is empty, so a URL that fails to load draws nothing rather
 * than a broken-image glyph.
 */
function makeIcon(document: Document): HTMLImageElement {
  const element = document.createElement('img');
  element.className = 'gm-system-icon';
  element.alt = '';
  const style = element.style;
  style.position = 'absolute';
  style.pointerEvents = 'none';
  style.width = `${ICON_CSS_SIZE}px`;
  style.height = `${ICON_CSS_SIZE}px`;
  // A black plate under the glyph. A vector of the catalogue draws a thin light line on
  // nothing, and the galaxy behind it is neither dark nor one colour, so the line reads
  // against the plate and not against whatever the camera puts there.
  style.backgroundColor = '#000';
  // A host icon's URL can 404. `alt` is empty, so the browser draws no broken-image
  // glyph, but the plate would stay as an opaque black square. The element marks itself
  // instead, and the frame clears the mark when it writes a new URL. The frame writes
  // `visibility` for the occlusion rule as well, so the mark and not the style is what
  // carries the fault from one frame to the next.
  element.onerror = (): void => {
    style.visibility = 'hidden';
    (element as BrokenIcon).gmBroken = true;
  };
  return element;
}

/** An icon element whose URL failed to load. The frame keeps it hidden. */
interface BrokenIcon extends HTMLImageElement {
  gmBroken?: boolean;
}

/**
 * Builds one arrow element. The triangle is a CSS border and not an SVG: the left and
 * the right borders are transparent, the top border carries the colour, and the box
 * itself has no width and no height. That gives the 8 by 5 shape with its apex down.
 * The frame writes `borderTopColor` alone.
 */
function makeArrow(document: Document): HTMLElement {
  const element = document.createElement('div');
  element.className = 'gm-system-arrow';
  const style = element.style;
  style.position = 'absolute';
  // Over every plane element. `src/app/plane-overlay.ts` states the rule.
  style.zIndex = '1';
  style.pointerEvents = 'none';
  style.width = '0';
  style.height = '0';
  style.borderStyle = 'solid';
  style.borderTopWidth = `${ARROW_HEIGHT_CSS}px`;
  style.borderRightWidth = `${ARROW_WIDTH_CSS / 2}px`;
  style.borderBottomWidth = '0';
  style.borderLeftWidth = `${ARROW_WIDTH_CSS / 2}px`;
  style.borderRightColor = 'transparent';
  style.borderBottomColor = 'transparent';
  style.borderLeftColor = 'transparent';
  return element;
}

/**
 * Builds the marker overlay in an element. It keeps one ring, one pin and a pool of name
 * label elements, so a frame adds no element the frame before did not need.
 */
export function createMarkerOverlay(host: HTMLElement): MarkerOverlay {
  const document = host.ownerDocument;

  /**
   * The layer of the stacks. Every icon and every arrow goes in here and not straight
   * into the host, because a stack takes a level of its own for the depth order and a
   * level escapes into the page where its parent is not a stacking context. The host is
   * often one a caller gave, and the library cannot rely on its style. A layer with a
   * level of its own is a stacking context, so it holds the 32 levels inside it.
   */
  const stackLayer = document.createElement('div');
  stackLayer.className = 'gm-system-stacks';
  stackLayer.style.position = 'absolute';
  stackLayer.style.top = '0';
  stackLayer.style.left = '0';
  stackLayer.style.width = '100%';
  stackLayer.style.height = '100%';
  stackLayer.style.pointerEvents = 'none';
  stackLayer.style.zIndex = `${STACK_LAYER_Z}`;
  const ring = makeRing(document);
  const pin = makePin(document);
  const labels: HTMLElement[] = [];
  const iconElements: HTMLImageElement[] = [];
  const arrowElements: HTMLElement[] = [];
  const keep = createNearestKeep(MARKER_KEEP);
  const iconKeep = createNearestKeep(MAX_ICON_STACKS);
  const boxes: LabelBox[] = [];
  // The screen place of each keeper entry, worked out once a frame. The occlusion test
  // reads it for every element of every stack, so one projection per candidate serves
  // the whole frame rather than one per candidate per element.
  const candidateX = new Float64Array(MARKER_KEEP);
  const candidateY = new Float64Array(MARKER_KEEP);
  let shownLabels = 0;
  let shownIcons = 0;
  let shownArrows = 0;

  /** One label element of the pool, made on the frame that first needs it. */
  const labelAt = (index: number): HTMLElement => {
    let element = labels[index];
    if (element === undefined) {
      element = makeLabel(document);
      labels[index] = element;
    }
    return element;
  };

  /** One icon element of the pool, made on the frame that first needs it. */
  const iconAt = (index: number): HTMLImageElement => {
    let element = iconElements[index];
    if (element === undefined) {
      element = makeIcon(document);
      iconElements[index] = element;
    }
    return element;
  };

  /** One arrow element of the pool, made on the frame that first needs it. */
  const arrowAt = (index: number): HTMLElement => {
    let element = arrowElements[index];
    if (element === undefined) {
      element = makeArrow(document);
      arrowElements[index] = element;
    }
    return element;
  };

  const clear = (): void => {
    ring.remove();
    pin.remove();
    for (const element of labels) element.remove();
    for (const element of iconElements) element.remove();
    for (const element of arrowElements) element.remove();
    // `clear` empties the overlay, so the layer goes with its elements. A frame that
    // places no stack leaves the empty layer where it is: it takes no pointer event and
    // paints nothing, and one node costs less than the attach and detach of each frame.
    stackLayer.remove();
    shownLabels = 0;
    shownIcons = 0;
    shownArrows = 0;
    boxes.length = 0;
  };

  return {
    update(frame: MarkerFrame): void {
      const { view, viewport, set, hoverIndex, selectedIndex, namesOn, iconsOn } =
        frame;
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

      /** The icons of one system, or null where the record names none. */
      const iconsOf = (index: number): readonly ResolvedIcon[] | null => {
        const list = set.system(index)?.icons;
        return list === undefined || list.length === 0 ? null : list;
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

      // The stacks draw where a record names an icon, and a set that names none pays
      // nothing for the switch: the count on the set answers that in one comparison.
      // The count may over-report, which costs this fast path alone.
      const stacksOn = iconsOn && set.iconSystemCount > 0;

      // One sweep for both keepers. The name switch is off by default and the icon
      // switch is on, so a sweep held inside the name branch would place no icon on a
      // map that never touched the name switch.
      resetNearest(keep);
      resetNearest(iconKeep);
      if ((namesOn || stacksOn) && count > 0) {
        // A candidate outside the viewport is dropped before any other work, so the
        // nearest-66 rule and the nearest-32 rule read only what the frame can show.
        for (let index = 0; index < count; index += 1) {
          const spot = placeOf(index);
          if (spot === null) continue;
          if (spot.x < 0 || spot.y < 0) continue;
          if (spot.x > viewport.width || spot.y > viewport.height) continue;
          const range = rangeOf(index);
          // Every drawn marker is offered, because the keeper has two readers: the label
          // pass, which skips the hovered and the selected index itself, and the icon
          // occlusion test, which needs every marker that can cover an element.
          offerNearest(keep, index, range);
          if (stacksOn && iconsOf(index) !== null) offerNearest(iconKeep, index, range);
        }
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

      // The candidate places of the keeper, for the occlusion test below. The keeper is
      // held in ascending range, so the walk of it breaks on range. A frame that draws
      // no stack tests nothing, so it projects nothing here.
      for (let slot = 0; iconKeep.count > 0 && slot < keep.count; slot += 1) {
        const spot = placeOf(keep.indices[slot] as number);
        candidateX[slot] = spot === null ? Number.NaN : spot.x;
        candidateY[slot] = spot === null ? Number.NaN : spot.y;
      }

      /**
       * True where the marker of a system nearer the camera than `owner` projects inside
       * the box. A DOM element draws over every pixel the canvas drew at its place, so an
       * icon of a far system would otherwise cover a near star.
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

      // The stacks. There is no overlap test between two of them: an icon reads under a
      // partial cover, and dropping one stack of a cluster would make it blink as the
      // camera moves.
      //
      // An icon and an arrow go to whole CSS pixels. The pin and the ring are vectors the
      // browser draws again at each place, but an icon is a bitmap of a vector: at a
      // fraction of a pixel the browser samples it at a new phase every frame, and the
      // glyph shakes while the camera moves. The stack keeps the marker's own place to
      // within half a pixel, which is under the 1 pixel the offset scenarios allow.
      let icons = 0;
      let arrows = 0;
      for (let slot = 0; slot < iconKeep.count; slot += 1) {
        const index = iconKeep.indices[slot] as number;
        const list = iconsOf(index);
        if (list === null) continue;
        const spot = placeOf(index);
        if (spot === null) continue;
        const selected = index === selectedIndex;
        const ownRange = iconKeep.ranges[slot] as number;
        // The nearer stack draws over the further one. The pool hands out an element by
        // its place in the frame, not by depth, so the order cannot come from the tree.
        const level = `${iconZIndex(slot)}`;

        const lowest = list[0];
        if (lowest !== undefined) {
          const arrow = arrowAt(arrows);
          const fill = `rgb(${lowest.color[0]}, ${lowest.color[1]}, ${lowest.color[2]})`;
          if (arrow.style.borderTopColor !== fill) arrow.style.borderTopColor = fill;
          arrow.style.zIndex = level;
          const arrowLeft = Math.round(spot.x - ARROW_WIDTH_CSS / 2);
          const arrowTop = Math.round(
            arrowApexCss(spot.y, spot.markerCss, selected) - ARROW_HEIGHT_CSS,
          );
          arrow.style.left = `${arrowLeft}px`;
          arrow.style.top = `${arrowTop}px`;
          // A hidden element keeps its place and its pool slot, so the frame that shows
          // it again costs one style write and allocates nothing.
          const hide = covered(
            index,
            ownRange,
            arrowLeft,
            arrowTop,
            ARROW_WIDTH_CSS,
            ARROW_HEIGHT_CSS,
          )
            ? 'hidden'
            : '';
          if (arrow.style.visibility !== hide) arrow.style.visibility = hide;
          if (stackLayer.parentNode === null) host.append(stackLayer);
          if (arrow.parentNode === null) stackLayer.append(arrow);
          arrows += 1;
        }

        for (let at = 0; at < list.length; at += 1) {
          const icon = list[at];
          if (icon === undefined) continue;
          const element = iconAt(icons);
          if (element.getAttribute('src') !== icon.url) {
            (element as BrokenIcon).gmBroken = false;
            element.setAttribute('src', icon.url);
          }
          element.style.zIndex = level;
          const iconLeft = Math.round(spot.x - ICON_CSS_SIZE / 2);
          const bottom = iconBottomCss(spot.y, spot.markerCss, at, selected);
          const iconTop = Math.round(bottom - ICON_CSS_SIZE);
          element.style.left = `${iconLeft}px`;
          element.style.top = `${iconTop}px`;
          const hidden =
            (element as BrokenIcon).gmBroken === true ||
            covered(index, ownRange, iconLeft, iconTop, ICON_CSS_SIZE, ICON_CSS_SIZE)
              ? 'hidden'
              : '';
          if (element.style.visibility !== hidden) element.style.visibility = hidden;
          if (stackLayer.parentNode === null) host.append(stackLayer);
          if (element.parentNode === null) stackLayer.append(element);
          icons += 1;
        }
      }

      for (let index = icons; index < shownIcons; index += 1) {
        iconElements[index]?.remove();
      }
      for (let index = arrows; index < shownArrows; index += 1) {
        arrowElements[index]?.remove();
      }
      shownIcons = icons;
      shownArrows = arrows;

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
    iconCount(): number {
      return shownIcons;
    },
    arrowCount(): number {
      return shownArrows;
    },
    clear,
  };
}
