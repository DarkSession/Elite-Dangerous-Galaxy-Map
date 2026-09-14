// The size of a real system's marker on the screen. The rule lives here, and not in the
// marker pass, because three readers need it and two of them must not import the
// renderer: the pick sweep of `src/scene-data/picking.ts` and the overlay marks of
// `src/app/markers.ts`. The marker pass reads it from here, so one rule still sets the
// marker size, the pick radius, the hover ring and the label offset.

/** The size of a marker in light years, before the floor and the cap. */
export const MARKER_SIZE_LY = 20;

/** The smallest diameter of a marker, in CSS pixels. */
export const MIN_MARKER_CSS = 7;

/** The largest diameter of a marker, in CSS pixels. */
export const MAX_MARKER_CSS = 12;

/**
 * The diameter of a marker in CSS pixels at a range, after the floor and the cap.
 * `focalCss` is the CSS pixels per light year at one light year of range.
 */
export function markerCssSize(focalCss: number, range: number): number {
  const wanted = (focalCss * MARKER_SIZE_LY) / Math.max(range, 1);
  return Math.min(MAX_MARKER_CSS, Math.max(MIN_MARKER_CSS, wanted));
}
