// The size of a real system's marker on the screen. The rule lives here, and not in the
// marker pass, because three readers need it and two of them must not import the
// renderer: the pick sweep of `src/scene-data/picking.ts` and the overlay marks of
// `src/app/markers.ts`. The marker pass reads it from here, so one rule still sets the
// marker size, the pick radius, the hover ring and the label offset.

/**
 * The ranges of the stop table, in light years, in rising order. The size holds its end
 * value outside the ends of the table.
 */
export const MARKER_SIZE_RANGES: readonly [number, number, number, number] = [
  10, 50, 1000, 10000,
];

/** The diameter of the marker at each range of the stop table, in CSS pixels. */
export const MARKER_SIZE_VALUES: readonly [number, number, number, number] = [
  16, 12, 12, 7,
];

/** The smallest diameter of a marker, in CSS pixels. */
export const MIN_MARKER_CSS = MARKER_SIZE_VALUES[3];

/** The largest diameter of a marker, in CSS pixels. */
export const MAX_MARKER_CSS = MARKER_SIZE_VALUES[0];

/**
 * The diameter of a marker in CSS pixels at a range in light years. The rule reads the
 * range alone: it does not read the viewport, so one range gives one size at every
 * viewport height.
 *
 * The curve walks the stop table. Between two stops the size is even in the logarithm of
 * the range, and outside the ends it holds the end value. The plateau from 50 to 1,000
 * light years is the band the user reads a neighbourhood in, and the rise from 50 to 10
 * is the last two wheel notches, where the camera is inside one mass-code `a` boxel.
 */
export function markerCssSize(range: number): number {
  const logRange = Math.log(Math.max(range, 1e-6));
  if (logRange <= Math.log(MARKER_SIZE_RANGES[0])) return MARKER_SIZE_VALUES[0];
  for (let stop = 1; stop < MARKER_SIZE_RANGES.length; stop += 1) {
    const high = Math.log(MARKER_SIZE_RANGES[stop] as number);
    if (logRange > high) continue;
    const low = Math.log(MARKER_SIZE_RANGES[stop - 1] as number);
    const part = (logRange - low) / (high - low);
    const from = MARKER_SIZE_VALUES[stop - 1] as number;
    const to = MARKER_SIZE_VALUES[stop] as number;
    return from + part * (to - from);
  }
  return MIN_MARKER_CSS;
}
