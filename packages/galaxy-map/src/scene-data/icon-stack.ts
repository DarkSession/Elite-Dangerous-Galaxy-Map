// The geometry of one icon stack: the size of an icon, the gap between two of them, the
// arrow under the lowest one, and where each part sits over a marker centre.
//
// The renderer draws the stacks and the overlay draws the pin beside them, so both read
// this file and neither holds a copy of the numbers. `src/scene-data/marker-size.ts`
// holds the marker size for the same reason.
//
// The module holds the two pin numbers as well, because the stack is placed against
// them: the arrow starts at the pin's own tip offset, and a selected stack rises by the
// pin's own height. A second copy of either number would let the pin and the stack
// disagree about where they meet.

/** The side of one icon of a stack, in CSS pixels. */
export const ICON_CSS_SIZE = 28;

/** The gap between two icons of one stack, in CSS pixels. */
export const ICON_GAP_CSS = 2;

/** The width of the arrow under the lowest icon, in CSS pixels. */
export const ARROW_WIDTH_CSS = 8;

/** The height of the arrow under the lowest icon, in CSS pixels. */
export const ARROW_HEIGHT_CSS = 5;

/** How many icon stacks one frame draws. */
export const MAX_ICON_STACKS = 32;

/** How far above the centre of a marker the tip of the pin sits, in CSS pixels. */
export const PIN_TIP_GAP_CSS = 2;

/** The height of the selection pin, in CSS pixels. */
export const PIN_HEIGHT_CSS = 28;

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
