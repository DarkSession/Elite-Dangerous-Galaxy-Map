// Finds the marker under a pixel. The sweep runs on the processor over the whole set,
// once per call, and allocates nothing per system. The set holds at most 10,000
// systems, so one call projects at most 10,000 positions.
//
// No identity buffer is read back from the card. A read back stalls the frame for a
// round trip to the card, and 10,000 projections do not.
//
// This module imports no renderer, as the lint rule requires: it reads the marker size
// rule from `marker-size.ts`, which both the pick and the marker pass read.
import { cameraPosition, nearPlane, viewProjectionMatrix } from '../camera/projection';
import type { Viewport } from '../camera/projection';
import { FIELD_OF_VIEW_DEGREES } from '../camera/view';
import type { View } from '../camera/view';
import { markerCssSize } from './marker-size';
import { DEFAULT_MAX_DRAW_RANGE_LY } from './real-systems';
import type { RealSystemSet } from './real-systems';

/**
 * How far past the edge of the disc a pixel still hits, in CSS pixels. The pick radius
 * is `markerCssSize / 2 + PICK_MARGIN_CSS`, so it runs from 7.5 to 10 CSS pixels.
 */
export const PICK_MARGIN_CSS = 4;

/**
 * How near two candidates are before the one nearer the camera wins, in CSS pixels.
 * The rule is total, so the same frame and the same pixel always give the same system.
 */
export const PICK_TIE_CSS = 1e-6;

/** The CSS pixels per light year at one light year of range, for a viewport. */
export function focalCssPixels(viewport: Viewport): number {
  return viewport.height / (2 * Math.tan((FIELD_OF_VIEW_DEGREES * Math.PI) / 360));
}

/**
 * The pick radius of a marker at a range, in CSS pixels. It reads the **disc** diameter
 * for both marker styles, so a `glow` and a `disc` of the same range are equally easy to
 * hit. A glow's sprite is 2.5 times the disc, and a pick radius that followed the sprite
 * would make a glow a target 2.5 times as wide for no reason the user can see.
 */
export function pickRadiusCss(focalCss: number, range: number): number {
  return markerCssSize(focalCss, range) / 2 + PICK_MARGIN_CSS;
}

/**
 * The index of the system under a pixel of the canvas, or -1. A system is a candidate
 * when its marker draws in the frame, when it lies in front of the near plane, and when
 * the pixel is inside its pick radius. The nearest to the pixel wins; a tie goes to the
 * one nearer the camera, and then to the one added to the set first.
 */
export function pickSystem(
  set: RealSystemSet,
  view: View,
  viewport: Viewport,
  pixel: { readonly x: number; readonly y: number },
): number {
  const count = set.count;
  if (count === 0) return -1;

  const positions = set.positions;
  const flags = set.markerFlags;
  const indices = set.categoryIndices;
  const camera = cameraPosition(view);
  // The matrix is built once for the whole sweep. Building it per system, as `project`
  // does, would be 10,000 matrix builds for one call.
  const matrix = viewProjectionMatrix(view, viewport);
  const focalCss = focalCssPixels(viewport);
  const near = nearPlane(view.distance);
  const halfWidth = viewport.width / 2;
  const halfHeight = viewport.height / 2;

  let bestIndex = -1;
  let bestPixels = Infinity;
  let bestRange = Infinity;

  for (let index = 0; index < count; index += 1) {
    if (flags[index] !== 1) continue;
    const base = index * 3;
    // The renderer's world frame runs its third axis the other way to the game's.
    const x = (positions[base] as number) - camera[0];
    const y = (positions[base + 1] as number) - camera[1];
    const z = camera[2] - (positions[base + 2] as number);

    const range = Math.sqrt(x * x + y * y + z * z);
    const category = set.category(indices[index] as number);
    const limit = category === null ? DEFAULT_MAX_DRAW_RANGE_LY : category.maxDrawRange;
    if (range > limit) continue;

    const clipW = matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15];
    // A system behind the camera, or nearer than the near plane, is never picked.
    if (clipW <= near) continue;

    const clipX = matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12];
    const clipY = matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13];
    const screenX = (clipX / clipW + 1) * halfWidth;
    const screenY = (1 - clipY / clipW) * halfHeight;

    const dx = screenX - pixel.x;
    const dy = screenY - pixel.y;
    const pixels = Math.sqrt(dx * dx + dy * dy);
    if (pixels > pickRadiusCss(focalCss, range)) continue;

    if (pixels < bestPixels - PICK_TIE_CSS) {
      bestIndex = index;
      bestPixels = pixels;
      bestRange = range;
      continue;
    }
    // Two candidates within the tie window: the one nearer the camera wins, and the one
    // added to the set first wins an equal range, because this loop reads it first.
    if (pixels <= bestPixels + PICK_TIE_CSS && range < bestRange) {
      bestIndex = index;
      bestPixels = Math.min(pixels, bestPixels);
      bestRange = range;
    }
  }

  return bestIndex;
}
