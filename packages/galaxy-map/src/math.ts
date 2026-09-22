// The two number helpers the passes, the overlays and the camera share.
//
// Each lived as a copy in six and two files. One copy each keeps one rule: the smooth
// step reads `high <= low` the way GLSL leaves undefined, and the clamp holds a value
// between two edges.

/**
 * The smooth step of `smoothstep(low, high, value)`, 0 at or below `low` and 1 at or
 * above `high`.
 *
 * `high <= low` divides by zero in the plain form, which gives `NaN`. The guard reads
 * the pair as a step at `high`: 1 at or above it and 0 below.
 */
export function smoothStep(low: number, high: number, value: number): number {
  if (high <= low) return value >= high ? 1 : 0;
  const part = Math.min(1, Math.max(0, (value - low) / (high - low)));
  return part * part * (3 - 2 * part);
}

/** `value` held between `low` and `high`. */
export function clamp(value: number, low: number, high: number): number {
  if (value < low) return low;
  if (value > high) return high;
  return value;
}
