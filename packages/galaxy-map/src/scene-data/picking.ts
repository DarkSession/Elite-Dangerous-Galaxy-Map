// Finds the marker under a pixel. The sweep runs on the processor over the whole set,
// once per call, and allocates nothing per system. The set holds at most `MAX_SYSTEMS`
// systems, so one call projects at most 50,000 positions.
//
// No identity buffer is read back from the card. A read back stalls the frame for a
// round trip to the card, and a sweep on the processor does not.
//
// This module imports no renderer, as the lint rule requires: it reads the marker size
// rule from `marker-size.ts`, which both the pick and the marker pass read.
import { cameraPosition, nearPlane, viewProjectionMatrix } from '../camera/projection';
import type { Viewport } from '../camera/projection';
import type { View } from '../camera/view';
import { markerCssSize, MAX_MARKER_CSS } from './marker-size';
import type { RealSystemSet } from './real-systems';

/**
 * How far past the edge of the disc a pixel still hits, in CSS pixels. The pick radius
 * is `markerCssSize / 2 + PICK_MARGIN_CSS`, so it runs from 7.5 to 12 CSS pixels.
 */
export const PICK_MARGIN_CSS = 4;

/**
 * How near two candidates are before the one nearer the camera wins, in CSS pixels.
 * The rule is total, so the same frame and the same pixel always give the same system.
 */
export const PICK_TIE_CSS = 1e-6;

/**
 * The pick radius of a marker at a range, in CSS pixels. It reads the **disc** diameter
 * for both marker styles, so a `glow` and a `disc` of the same range are equally easy to
 * hit. A glow's sprite is 2.5 times the disc, and a pick radius that followed the sprite
 * would make a glow a target 2.5 times as wide for no reason the user can see.
 *
 * The disc diameter reads the camera range alone, so the pick radius does too. A pixel
 * that looks like a hit is therefore a hit at every viewport height.
 */
export function pickRadiusCss(range: number): number {
  return markerCssSize(range) / 2 + PICK_MARGIN_CSS;
}

/**
 * The widest pick radius any marker takes, in CSS pixels. The disc runs from 7 to 16, so
 * the radius runs from 7.5 to 12. The sweep rejects a system that lies further than this
 * from the pixel before it divides by the clip coordinate, which is the work the range
 * of the marker would otherwise pay for.
 *
 * The number carries one tie window of slack. The reject multiplies the offset by the
 * clip coordinate instead of dividing by it, and the two forms round differently, so a
 * system at the cap exactly would otherwise be lost to the rounding. The pick radius of
 * the marker itself then runs on the few systems that pass.
 */
export const MAX_PICK_RADIUS_CSS = MAX_MARKER_CSS / 2 + PICK_MARGIN_CSS + PICK_TIE_CSS;

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
  // The draw range of the category each system draws through, which the set keeps as a
  // typed array. The sweep read the category row of every system before, which was a
  // table lookup and a property read per system.
  const ranges = set.drawRanges;
  const camera = cameraPosition(view);
  // The cursor in the same camera-relative frame as the offsets below.
  const cursorOffset: [number, number, number] = [
    view.cursor[0] - camera[0],
    view.cursor[1] - camera[1],
    camera[2] - view.cursor[2],
  ];
  // The matrix is built once for the whole sweep. Building it per system, as `project`
  // does, would be one matrix build per system for one call.
  const matrix = viewProjectionMatrix(view, viewport);
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

    // The draw gate measures from the cursor, as `systems.vert` does, so the pick keeps
    // every marker the frame drew and no other. The test is squared, so the range to
    // the eye is not taken here: the square root runs for the few systems that reach
    // the pick radius.
    const limit = ranges[index] as number;
    const cx = x - cursorOffset[0];
    const cy = y - cursorOffset[1];
    const cz = z - cursorOffset[2];
    if (cx * cx + cy * cy + cz * cz > limit * limit) continue;

    const clipW = matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15];
    // A system behind the camera, or nearer than the near plane, is never picked.
    if (clipW <= near) continue;

    const clipX = matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12];
    const clipY = matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13];
    // The pixel offset, still multiplied by the clip coordinate: `ax` is
    // `(screenX - pixel.x) * clipW` and `ay` is `(screenY - pixel.y) * clipW`. `clipW`
    // is above the near plane and so above 0, which holds the sign and the order. The
    // widest pick radius any marker takes then rejects the system with three multiplies
    // and no divide, which is the whole of the cost for a system that is not under the
    // pointer.
    const reach = MAX_PICK_RADIUS_CSS * clipW;
    const ax = clipX * halfWidth + (halfWidth - pixel.x) * clipW;
    if (ax > reach || ax < -reach) continue;
    const ay = (halfHeight - pixel.y) * clipW - clipY * halfHeight;
    if (ay > reach || ay < -reach) continue;
    if (ax * ax + ay * ay > reach * reach) continue;

    // The few systems that reach the pointer take the two divides and the square root.
    // The division is what the rest of the map reads, so the winner is the same system
    // the projection of `camera/projection.ts` names.
    const screenX = (clipX / clipW + 1) * halfWidth;
    const screenY = (1 - clipY / clipW) * halfHeight;
    const dx = screenX - pixel.x;
    const dy = screenY - pixel.y;
    const pixels = Math.sqrt(dx * dx + dy * dy);
    // The range to the eye, which drives the size and the pick radius.
    const range = Math.sqrt(x * x + y * y + z * z);
    if (pixels > pickRadiusCss(range)) continue;

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
