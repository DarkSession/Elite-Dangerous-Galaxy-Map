// The vertical part of the galaxy model. See `docs/galaxy-density-model.md`.
import { logistic } from './surface';
import type { GalaxyModelDocument } from './types';

/** The constants the vertical formulas read, derived once from the document. */
export interface PreparedVertical {
  readonly innerScale: number;
  readonly outerScale: number;
  readonly transitionRadius: number;
  readonly transitionWidth: number;
  readonly maxHeight: number;
}

/** Derives the constants the vertical formulas read. */
export function prepareVertical(document: GalaxyModelDocument): PreparedVertical {
  const vertical = document.vertical;
  return {
    innerScale: vertical.inner.scale_ly,
    outerScale: vertical.outer.scale_ly,
    transitionRadius: vertical.transition.radius_ly,
    transitionWidth: vertical.transition.width_ly,
    maxHeight: vertical.max_height_ly,
  };
}

/**
 * The weight of the thick inner component at a galactocentric radius. It is 1 in the
 * bulge and falls to 0 in the disc.
 */
export function blendWeight(prepared: PreparedVertical, radius: number): number {
  return logistic(-(radius - prepared.transitionRadius) / prepared.transitionWidth);
}

/** The square of the hyperbolic secant. */
function sech2(t: number): number {
  const cosh = Math.cosh(t);
  return 1 / (cosh * cosh);
}

/**
 * The fraction of a column's mass per light year at a height above the mid-plane.
 * The value is 0 beyond the model's maximum height.
 */
export function verticalProfile(
  prepared: PreparedVertical,
  height: number,
  radius: number,
): number {
  const distance = Math.abs(height);
  if (distance > prepared.maxHeight) return 0;
  const weight = blendWeight(prepared, radius);
  const inner = sech2(height / prepared.innerScale) / (2 * prepared.innerScale);
  const outer = Math.exp(-distance / prepared.outerScale) / (2 * prepared.outerScale);
  return weight * inner + (1 - weight) * outer;
}

/**
 * The fraction of one side's mass above a height. The half-mass height is where this
 * function equals 0.5.
 */
export function verticalSurvival(
  prepared: PreparedVertical,
  height: number,
  radius: number,
): number {
  const weight = blendWeight(prepared, radius);
  return (
    weight * (1 - Math.tanh(height / prepared.innerScale)) +
    (1 - weight) * Math.exp(-height / prepared.outerScale)
  );
}

/**
 * The height that holds half of one side's mass, found by bisection on the survival
 * function.
 */
export function halfMassHeight(prepared: PreparedVertical, radius: number): number {
  let low = 0;
  let high = prepared.maxHeight;
  for (let step = 0; step < 100; step += 1) {
    const middle = 0.5 * (low + high);
    if (verticalSurvival(prepared, middle, radius) > 0.5) {
      low = middle;
    } else {
      high = middle;
    }
  }
  return 0.5 * (low + high);
}
