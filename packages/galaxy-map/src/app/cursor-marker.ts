// Draws a marker at the cursor, flat on the plane of constant `y` the cursor sits on.
//
// The cursor is the point the camera orbits, the point the zoom moves toward and the
// plane the grid draws on, and it may sit anywhere in the model bounds, which reach
// 40,985 light years in `y`. Without a mark, a user who takes the cursor far off the
// galactic disc sees an empty frame and cannot tell where to go back to.
//
// The marker is an element of the label overlay and not a pass on the canvas, so it stays
// a crisp vector at every device pixel ratio and needs no shader. It lies on the plane
// through `src/app/plane-overlay.ts`, so a circle on the plane reads as an ellipse on the
// screen and the arrows lean with the pitch. A mark that faced the screen would say where
// the cursor projects and not where it is.
import { smoothStep } from '../math';
import type { Viewport } from '../camera/projection';
import type { View } from '../camera/view';
import { placeOnPlane, planeSpanForScreenX } from './plane-overlay';
import type { PlanePlaced } from './plane-overlay';

/** The side of the marker's view box, in its own units. */
export const CURSOR_MARKER_BOX = 160;

/** The outer radius of the ring, in view box units. */
export const CURSOR_MARKER_RING_OUTER = 48;

/** The stroke of the ring, in view box units, so its inner radius is 44. */
export const CURSOR_MARKER_RING_STROKE = 4;

/** The fill of the ring and of the arrows. It is the cyan family the grid draws in. */
export const CURSOR_MARKER_COLOR = '#3EF8FB';

/**
 * The side of the marker's box on the screen at the near end of the size band, in CSS
 * pixels. The ring is therefore about 58 CSS pixels across there and the arrow tips
 * about 90 apart.
 *
 * The size is read on the screen and not in light years because the marker is a control
 * and not a place: a size fixed in light years would fill the frame at a close zoom and
 * vanish at a wide one. The figure was 160 and read as too large at every zoom.
 */
export const CURSOR_MARKER_SIZE_CSS = 96;

/**
 * The side of the marker's box at the far end of the size band, in CSS pixels. It holds
 * the ring at 24 CSS pixels across, which is still a mark a user can find and tap.
 */
export const CURSOR_MARKER_SIZE_MIN_CSS = 40;

/**
 * The camera distance to the cursor at and below which the marker holds its full size,
 * in light years. It is the distance at which the coordinate grid goes out, so the
 * marker holds its full size through every view the grid draws in.
 */
export const CURSOR_MARKER_NEAR_LY = 12000;

/**
 * The camera distance at and above which the marker holds its floor, in light years. It
 * is the start view, where the galaxy disc measures about 1,000 CSS pixels across a
 * 1,080 row frame: a marker of 96 CSS pixels covered about a tenth of it and read as a
 * thing of the map rather than as the cursor.
 */
export const CURSOR_MARKER_FAR_LY = 60000;

/**
 * The side of the marker's box on the screen, in CSS pixels, at a camera distance to the
 * cursor. It is 96 at 12,000 light years and nearer, and falls on a smooth step to 40 at
 * 60,000 and further.
 *
 * Both the plane rectangle and the element's own box read the size here, so the two
 * cannot disagree.
 */
export function cursorMarkerSizeCss(distance: number): number {
  const fall = CURSOR_MARKER_SIZE_CSS - CURSOR_MARKER_SIZE_MIN_CSS;
  return (
    CURSOR_MARKER_SIZE_CSS -
    fall * smoothStep(CURSOR_MARKER_NEAR_LY, CURSOR_MARKER_FAR_LY, distance)
  );
}

/**
 * The outline of one arrow, in view box units, closed back to the tip. The tip sits 75
 * units from the centre and the base 56, which clears the ring's outer radius by 8.
 */
export const CURSOR_MARKER_ARROW: readonly (readonly [number, number])[] = [
  [80, 5],
  [93, 16],
  [90, 16],
  [90, 24],
  [70, 24],
  [70, 16],
  [67, 16],
];

/** The turns of the four arrows about the centre of the box, in degrees. */
export const CURSOR_MARKER_ARROW_TURNS: readonly number[] = [0, 90, 180, 270];

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

/** The `d` of one arrow, closed back to its tip. */
export function cursorMarkerArrowPath(): string {
  const steps = CURSOR_MARKER_ARROW.map((point, index) => {
    const command = index === 0 ? 'M' : 'L';
    return `${command} ${String(point[0])} ${String(point[1])}`;
  });
  return `${steps.join(' ')} Z`;
}

/**
 * The `d` of the ring, as one path of two circles. The even-odd fill rule makes the inner
 * circle a hole, so the ring carries the same `fill` as the arrows and no stroke of its
 * own. A stroked circle would need `fill: none`, and the look states one fill for both.
 */
export function cursorMarkerRingPath(): string {
  const middle = CURSOR_MARKER_BOX / 2;
  const outer = CURSOR_MARKER_RING_OUTER;
  const inner = outer - CURSOR_MARKER_RING_STROKE;
  const circle = (radius: number): string =>
    `M ${String(middle)} ${String(middle - radius)} ` +
    `A ${String(radius)} ${String(radius)} 0 1 0 ${String(middle)} ${String(middle + radius)} ` +
    `A ${String(radius)} ${String(radius)} 0 1 0 ${String(middle)} ${String(middle - radius)} Z`;
  return `${circle(outer)} ${circle(inner)}`;
}

/**
 * Builds the marker as one SVG element with a 160 by 160 view box: one ring and four
 * arrows. It is one element and not five, so the overlay writes one transform a frame.
 */
export function createCursorMarker(document: Document): SVGSVGElement {
  const svg = document.createElementNS(SVG_NAMESPACE, 'svg');
  svg.setAttribute('class', 'gm-cursor-marker');
  svg.setAttribute(
    'viewBox',
    `0 0 ${String(CURSOR_MARKER_BOX)} ${String(CURSOR_MARKER_BOX)}`,
  );
  // The four styles a placement never moves, written once here. `placeOnPlane` writes
  // the size, the transform and the level alone.
  svg.style.position = 'absolute';
  svg.style.left = '0px';
  svg.style.top = '0px';
  svg.style.transformOrigin = '0 0';
  svg.style.pointerEvents = 'none';
  svg.style.overflow = 'visible';

  const ring = document.createElementNS(SVG_NAMESPACE, 'path');
  ring.setAttribute('class', 'gm-cursor-marker-ring');
  ring.setAttribute('d', cursorMarkerRingPath());
  ring.setAttribute('fill', CURSOR_MARKER_COLOR);
  ring.setAttribute('fill-rule', 'evenodd');
  svg.append(ring);

  const outline = cursorMarkerArrowPath();
  const middle = CURSOR_MARKER_BOX / 2;
  for (const turn of CURSOR_MARKER_ARROW_TURNS) {
    const arrow = document.createElementNS(SVG_NAMESPACE, 'path');
    arrow.setAttribute('class', 'gm-cursor-marker-arrow');
    arrow.setAttribute('d', outline);
    arrow.setAttribute('fill', CURSOR_MARKER_COLOR);
    arrow.dataset['turn'] = String(turn);
    if (turn !== 0) {
      arrow.setAttribute(
        'transform',
        `rotate(${String(turn)} ${String(middle)} ${String(middle)})`,
      );
    }
    svg.append(arrow);
  }
  return svg;
}

/** What one frame of the marker reads. */
export interface CursorMarkerFrame {
  readonly view: View;
  readonly viewport: Viewport;
  /** False takes the marker out of the overlay for the frame. */
  readonly on: boolean;
}

/** The marker overlay one map owns. */
export interface CursorMarkerOverlay {
  /** Places the marker for one frame, or gives null where the frame drops it. */
  update(frame: CursorMarkerFrame): PlanePlaced | null;
  /** Takes the marker out of the overlay. */
  clear(): void;
}

/**
 * The side of the marker's box on the plane, in light years, or null where the cursor
 * does not project.
 *
 * The box is square on the plane and its side is the light years that the box size on
 * the screen covers along the screen's horizontal at the cursor. That size follows the
 * camera's distance to the cursor, which `cursorMarkerSizeCss` states.
 */
export function cursorMarkerSideLy(view: View, viewport: Viewport): number | null {
  return planeSpanForScreenX(
    view,
    viewport,
    view.cursor[1],
    [view.cursor[0], view.cursor[2]],
    cursorMarkerSizeCss(view.distance),
  );
}

/**
 * Builds the marker overlay in an element. The element joins the overlay on the first
 * frame that draws it and leaves it on the first frame that does not, so a map with the
 * marker off carries no element of it.
 */
export function createCursorMarkerOverlay(host: HTMLElement): CursorMarkerOverlay {
  const element = createCursorMarker(host.ownerDocument);
  let shown = false;

  const take = (): void => {
    if (!shown) return;
    element.remove();
    shown = false;
  };

  return {
    update(frame: CursorMarkerFrame): PlanePlaced | null {
      if (!frame.on) {
        take();
        return null;
      }
      const side = cursorMarkerSideLy(frame.view, frame.viewport);
      if (side === null) {
        take();
        return null;
      }
      // One size for the plane rectangle and the element's own box, read in one place.
      const sizeCss = cursorMarkerSizeCss(frame.view.distance);
      const placed = placeOnPlane(element, {
        view: frame.view,
        viewport: frame.viewport,
        planeY: frame.view.cursor[1],
        anchor: [frame.view.cursor[0], frame.view.cursor[2]],
        widthLy: side,
        heightLy: side,
        widthCss: sizeCss,
        heightCss: sizeCss,
      });
      if (placed === null) {
        take();
        return null;
      }
      if (!shown) {
        host.append(element);
        shown = true;
      }
      return placed;
    },
    clear(): void {
      take();
    },
  };
}
