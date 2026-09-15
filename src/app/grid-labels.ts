// Places the coordinate labels of the grid over the canvas. A label is DOM text in the
// same overlay the region labels and the marker names use, so it stays a crisp vector at
// every device pixel ratio and needs no font in a shader.
//
// The module works out no level of its own. `src/app/create-map.ts` reads the level from
// the renderer as `renderer.gridSpacingLy()` and passes it in each frame as the
// `spacingLy` field of the frame, so a label and its lines never disagree about the
// level.
//
// The module imports two pure functions from the grid pass, `gridLevelAlpha` and
// `gridVisibility`, so one module owns the alpha rule and no copy of 0.18, 8 or 40 sits
// here. No lint rule forbids that import: `no-restricted-imports` holds
// `src/galaxy-model/`, `src/scene-data/` and `src/hud/` away from the renderer and says
// nothing about `src/app/`, where `create-map.ts` already imports it. What this module
// must not read is renderer state: it takes the level, the bounds and the camera
// distance from the frame it is given.
import { cameraPosition, nearPlane, viewProjectionMatrix } from '../camera/projection';
import type { Viewport } from '../camera/projection';
import type { View } from '../camera/view';
import type { Range } from '../galaxy-model/types';
import {
  gridBackgroundTint,
  gridBackgroundWeight,
  GRID_LABEL_MERGE_FLOOR,
  GRID_LABEL_TINT_MAX,
  gridLevelAlpha,
  gridVisibility,
} from '../render/grid-pass';
import { boxesOverlap } from './labels';
import type { LabelBox } from './labels';

/** How many spacings of the label level each side of the cursor carry a candidate. */
export const GRID_LABEL_SPAN = 8;

/** How many crossings one frame looks at. */
export const GRID_CANDIDATE_COUNT = (2 * GRID_LABEL_SPAN + 1) ** 2;

/** How many crossing labels the overlay places. */
export const MAX_GRID_LABELS = 32;

/**
 * The drawn alpha a level must hold at a crossing for that crossing to carry a label.
 * It is what a level gives at 24 CSS pixels with the camera distance band open, which
 * is the middle of the level's fade band from 8 to 40 CSS pixels. A label below it
 * would stand over a line the user cannot see.
 */
export const GRID_LABEL_MIN_ALPHA = 0.09;

/**
 * How far along a game axis the sweep steps to read the projection's Jacobian, as a
 * fraction of the level's spacing. It is small, because the reading must be the local
 * rate the shader takes as a derivative and not a secant over a whole spacing.
 */
const JACOBIAN_STEP = 1e-3;

/** The colour of a label over a dark background, red, green and blue from 0 to 255. */
export const GRID_LABEL_COLOR: readonly [number, number, number] = [255, 196, 140];

/**
 * The opacity of a label over a dark background. It is below the 0.86 the label carried
 * before the merge, because the label no longer stands over a hard outline.
 */
export const GRID_LABEL_OPACITY = 0.8;

/**
 * The shadow of a label: a soft dark glow and not a hard black outline. A pure black
 * shadow draws a second outline that no part of the picture carries.
 */
export const GRID_LABEL_SHADOW =
  '0 0 10px rgba(12, 6, 2, 0.75), 0 1px 2px rgba(12, 6, 2, 0.55)';

/**
 * Writes one style property only when it differs. The overlay writes every property of
 * every label in each frame, and a write of the value an element already holds is a DOM
 * change the browser records. `src/hud/dom.ts` holds the same three lines for the HUD
 * panels. The two are not shared, because the HUD is an opt-in module in its own chunk
 * and the library must not pull it into the core one.
 */
function setStyle(element: HTMLElement, name: string, value: string): void {
  if (element.style.getPropertyValue(name) === value) return;
  element.style.setProperty(name, value);
}

/** How far above the lower edge of the canvas the plane label sits, in CSS pixels. */
export const PLANE_LABEL_BOTTOM_CSS = 22;

/** The width of one character of a label, in CSS pixels. */
const LABEL_CHARACTER_CSS = 7;

/** The padding of a label, left and right together, in CSS pixels. */
const LABEL_PADDING_CSS = 8;

/** The height of a label, in CSS pixels. */
const LABEL_HEIGHT_CSS = 14;

/** The text of a crossing label: the `x` and the `z`, in whole light years. */
export function crossingLabelText(x: number, z: number): string {
  return `${Math.round(x)}, ${Math.round(z)}`;
}

/** The text of the plane label: the `y` of the plane, in whole light years. */
export function planeLabelText(y: number): string {
  return `y = ${Math.round(y)}`;
}

/** The box of a label of a text, centred on a point. */
export function labelBoxAt(text: string, x: number, y: number): LabelBox {
  const width = text.length * LABEL_CHARACTER_CSS + LABEL_PADDING_CSS;
  return {
    left: x - width / 2,
    top: y - LABEL_HEIGHT_CSS / 2,
    width,
    height: LABEL_HEIGHT_CSS,
  };
}

/** The box of the plane label in a viewport. */
export function planeLabelBox(text: string, viewport: Viewport): LabelBox {
  const width = text.length * LABEL_CHARACTER_CSS + LABEL_PADDING_CSS;
  return {
    left: viewport.width / 2 - width / 2,
    top: viewport.height - PLANE_LABEL_BOTTOM_CSS - LABEL_HEIGHT_CSS,
    width,
    height: LABEL_HEIGHT_CSS,
  };
}

/**
 * The background reading of an earlier frame, as the renderer read it back. A label's
 * opacity is therefore one frame behind the picture, which a person does not see.
 */
export interface GridLabelReading {
  readonly width: number;
  readonly height: number;
  /** Four bytes for each texel, row by row, with the top row first. */
  readonly pixels: Uint8Array;
}

/** What one grid label update reads. */
export interface GridLabelFrame {
  readonly view: View;
  readonly viewport: Viewport;
  /** The spacing of the label level, in light years. 0 draws no label. */
  readonly spacingLy: number;
  /** The galaxy model bounds, which the grid lines stop at. */
  readonly bounds: Range;
  /** The background reading, or null while the map has none. */
  readonly background: GridLabelReading | null;
}

/** The background under one point of the canvas, each channel from 0 to 255. */
export interface GridLabelBackground {
  readonly luminance: number;
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/**
 * The background under a point of the canvas, in CSS pixels. A point outside the reading
 * reads a luminance of 0, whose weight is 1, so a label the reading does not cover keeps
 * all of itself and takes none of the background's hue.
 */
export function gridLabelBackground(
  reading: GridLabelReading | null,
  x: number,
  y: number,
  viewport: Viewport,
): GridLabelBackground {
  const outside = { luminance: 0, r: 0, g: 0, b: 0 };
  if (reading === null || reading.width <= 0 || reading.height <= 0) return outside;
  if (x < 0 || y < 0 || x >= viewport.width || y >= viewport.height) return outside;
  const column = Math.min(
    reading.width - 1,
    Math.floor((x / viewport.width) * reading.width),
  );
  const row = Math.min(
    reading.height - 1,
    Math.floor((y / viewport.height) * reading.height),
  );
  const at = (row * reading.width + column) * 4;
  const r = reading.pixels[at];
  const g = reading.pixels[at + 1];
  const b = reading.pixels[at + 2];
  if (r === undefined || g === undefined || b === undefined) return outside;
  return {
    luminance: (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255,
    r,
    g,
    b,
  };
}

/**
 * The opacity of a label over a background of this luminance. The floor of the label's
 * weight is above the line's, because text needs more contrast than a line.
 */
export function gridLabelOpacity(luminance: number): number {
  return GRID_LABEL_OPACITY * gridBackgroundWeight(luminance, GRID_LABEL_MERGE_FLOOR);
}

/** The colour of a label over a background, as a CSS `rgb` value. */
export function gridLabelColour(background: GridLabelBackground): string {
  const tint = gridBackgroundTint(background.luminance, GRID_LABEL_TINT_MAX);
  const mix = (own: number, under: number): number =>
    Math.round(own + (under - own) * tint);
  const colour: [number, number, number] = [
    mix(GRID_LABEL_COLOR[0], background.r),
    mix(GRID_LABEL_COLOR[1], background.g),
    mix(GRID_LABEL_COLOR[2], background.b),
  ];
  return `rgb(${colour[0]}, ${colour[1]}, ${colour[2]})`;
}

/** One crossing label the frame places. */
export interface GridLabelPlacement {
  readonly text: string;
  readonly box: LabelBox;
  /** Where the crossing projects to, in CSS pixels. */
  readonly x: number;
  readonly y: number;
  /** The drawn alpha of the label level at the crossing, which the gate read. */
  readonly alpha: number;
}

/**
 * The drawn alpha of a level at a point of the plane. `perPixelX` and `perPixelZ` are the
 * light years of the game `x` and `z` axes that one CSS pixel covers there, which is what
 * `grid.frag` reads as a derivative of the plane point. The greater of the two axis
 * readings decides, because the alpha at a point is the larger of the two, and the camera
 * distance band multiplies the result.
 */
export function gridLabelAlpha(
  perPixelX: number,
  perPixelZ: number,
  spacingLy: number,
  band: number,
): number {
  const alongX = gridLevelAlpha(spacingLy / Math.max(perPixelX, 1e-9));
  const alongZ = gridLevelAlpha(spacingLy / Math.max(perPixelZ, 1e-9));
  return Math.max(alongX, alongZ) * band;
}

/**
 * The crossing labels of one frame. The sweep reads the 289 crossings within 8 spacings
 * of the cursor, drops the ones the frame cannot show, drops the ones whose own lines do
 * not draw, keeps the 32 nearest the centre of the canvas, and skips a box that overlaps
 * one already placed.
 *
 * Two readings say that a crossing's lines draw. The crossing lies inside the model
 * bounds on both game axes, where `grid.frag` stops the lines. And the level's drawn
 * alpha at the crossing holds `GRID_LABEL_MIN_ALPHA`, which `gridLabelAlpha` reads from
 * the two axis scales the crossing sits at and the camera distance band.
 *
 * The two scales come from the projection's own Jacobian at the crossing: the sweep
 * projects the crossing and two points a small step along the game `x` and `z` axes, and
 * inverts the 2 by 2 matrix those two steps make. The reading is then the light years of
 * each game axis that one CSS pixel covers, which is the quantity `grid.frag` takes as a
 * derivative of the plane point. It therefore carries the foreshortening that closes the
 * lines up toward the horizon on **both** screen axes.
 *
 * The step is small and not one level spacing. A gap measured over a whole spacing is a
 * secant of a map that bends hard toward the horizon: at a pitch of 5 degrees and a zoom
 * of 3,000 light years a crossing 65,000 light years out makes a gap of about 144 CSS
 * pixels, while the shader reads 1.4 CSS pixels there and draws nothing at all. A label
 * placed on that gap would stand over an empty frame, which is the fault this gate is
 * for.
 */
export function gridLabelPlacements(frame: GridLabelFrame): GridLabelPlacement[] {
  const { view, viewport, spacingLy, bounds } = frame;
  if (spacingLy <= 0) return [];

  const matrix = viewProjectionMatrix(view, viewport);
  const near = nearPlane(view.distance);
  const halfWidth = viewport.width / 2;
  const halfHeight = viewport.height / 2;
  // The sweep holds the subtraction in `float64`, so a crossing 45,000 light years out
  // keeps its resolution.
  const camera = cameraPosition(view);
  const planeY = view.cursor[1] - camera[1];
  const baseX = Math.round(view.cursor[0] / spacingLy) * spacingLy;
  const baseZ = Math.round(view.cursor[2] / spacingLy) * spacingLy;
  // The band is the camera's distance to the cursor, one reading for the whole frame,
  // which is what the pass sends the shader.
  const band = gridVisibility(view.distance);

  /** A point of the plane in CSS pixels of the canvas, or null behind the near plane. */
  const project = (gameX: number, gameZ: number): { x: number; y: number } | null => {
    // The renderer's world frame runs its third axis the other way to the game's.
    const offsetX = gameX - camera[0];
    const offsetZ = camera[2] - gameZ;
    const clipW =
      matrix[3] * offsetX + matrix[7] * planeY + matrix[11] * offsetZ + matrix[15];
    if (clipW <= near) return null;
    const clipX =
      matrix[0] * offsetX + matrix[4] * planeY + matrix[8] * offsetZ + matrix[12];
    const clipY =
      matrix[1] * offsetX + matrix[5] * planeY + matrix[9] * offsetZ + matrix[13];
    return {
      x: (clipX / clipW + 1) * halfWidth,
      y: (1 - clipY / clipW) * halfHeight,
    };
  };

  const candidates: GridLabelPlacement[] = [];
  const centres: number[] = [];
  for (let stepX = -GRID_LABEL_SPAN; stepX <= GRID_LABEL_SPAN; stepX += 1) {
    for (let stepZ = -GRID_LABEL_SPAN; stepZ <= GRID_LABEL_SPAN; stepZ += 1) {
      const gameX = baseX + stepX * spacingLy;
      const gameZ = baseZ + stepZ * spacingLy;
      // The lines stop at the model bounds, so a crossing beyond them carries none.
      if (gameX < bounds.x[0] || gameX > bounds.x[1]) continue;
      if (gameZ < bounds.z[0] || gameZ > bounds.z[1]) continue;
      const at = project(gameX, gameZ);
      if (at === null) continue;
      const { x, y } = at;
      if (x < 0 || y < 0 || x > viewport.width || y > viewport.height) continue;
      // The two steps that make the Jacobian of the projection at this crossing.
      const step = spacingLy * JACOBIAN_STEP;
      const alongX = project(gameX + step, gameZ);
      const alongZ = project(gameX, gameZ + step);
      if (alongX === null || alongZ === null) continue;
      // The columns of the Jacobian: CSS pixels of the screen for one light year of the
      // game axis.
      const xOverX = (alongX.x - x) / step;
      const yOverX = (alongX.y - y) / step;
      const xOverZ = (alongZ.x - x) / step;
      const yOverZ = (alongZ.y - y) / step;
      const determinant = xOverX * yOverZ - xOverZ * yOverX;
      if (determinant === 0) continue;
      // The rows of the inverse: light years of each game axis for one CSS pixel.
      const perPixelX = Math.hypot(yOverZ / determinant, xOverZ / determinant);
      const perPixelZ = Math.hypot(yOverX / determinant, xOverX / determinant);
      const alpha = gridLabelAlpha(perPixelX, perPixelZ, spacingLy, band);
      if (alpha < GRID_LABEL_MIN_ALPHA) continue;
      const text = crossingLabelText(gameX, gameZ);
      candidates.push({ text, box: labelBoxAt(text, x, y), x, y, alpha });
      const fromX = x - halfWidth;
      const fromY = y - halfHeight;
      centres.push(fromX * fromX + fromY * fromY);
    }
  }

  const order = candidates.map((_place, index) => index);
  order.sort(
    (first, second) => (centres[first] as number) - (centres[second] as number),
  );

  const placed: GridLabelPlacement[] = [];
  for (const index of order) {
    if (placed.length === MAX_GRID_LABELS) break;
    const candidate = candidates[index] as GridLabelPlacement;
    if (placed.some((other) => boxesOverlap(candidate.box, other.box))) continue;
    placed.push(candidate);
  }
  return placed;
}

/** The overlay that holds the grid labels. */
export interface GridLabelOverlay {
  /** Places the labels of one frame. */
  update(frame: GridLabelFrame): void;
  /** How many crossing labels the last frame placed. */
  labelCount(): number;
  /** Takes every label out of the overlay. */
  clear(): void;
}

/** Builds one label element. */
function makeLabel(document: Document, className: string): HTMLElement {
  const element = document.createElement('div');
  element.className = className;
  setStyle(element, 'position', 'absolute');
  setStyle(element, 'pointer-events', 'none');
  setStyle(element, 'white-space', 'nowrap');
  setStyle(element, 'box-sizing', 'border-box');
  setStyle(element, 'height', `${LABEL_HEIGHT_CSS}px`);
  setStyle(element, 'padding', '1px 4px');
  setStyle(
    element,
    'font',
    `10px/${LABEL_HEIGHT_CSS - 2}px 'IBM Plex Mono', ui-monospace, monospace`,
  );
  setStyle(element, 'letter-spacing', '1px');
  setStyle(element, 'text-shadow', GRID_LABEL_SHADOW);
  return element;
}

/** Writes the place and the merge of one label, and writes nothing that does not move. */
function placeLabel(
  element: HTMLElement,
  box: LabelBox,
  background: GridLabelBackground,
): void {
  setStyle(element, 'left', `${box.left}px`);
  setStyle(element, 'top', `${box.top}px`);
  setStyle(element, 'opacity', `${gridLabelOpacity(background.luminance)}`);
  setStyle(element, 'color', gridLabelColour(background));
}

/**
 * Builds the grid label overlay in an element. It keeps a pool of label elements, so a
 * frame adds no element the frame before did not need.
 */
export function createGridLabelOverlay(host: HTMLElement): GridLabelOverlay {
  const document = host.ownerDocument;
  const labels: HTMLElement[] = [];
  const plane = makeLabel(document, 'gm-grid-plane-label');
  let shown = 0;

  const labelAt = (index: number): HTMLElement => {
    let element = labels[index];
    if (element === undefined) {
      element = makeLabel(document, 'gm-grid-label');
      labels[index] = element;
    }
    return element;
  };

  const clear = (): void => {
    for (const element of labels) element.remove();
    plane.remove();
    shown = 0;
  };

  return {
    update(frame: GridLabelFrame): void {
      if (frame.spacingLy <= 0) {
        clear();
        return;
      }

      const placements = gridLabelPlacements(frame);
      for (let index = 0; index < placements.length; index += 1) {
        const placement = placements[index] as GridLabelPlacement;
        const element = labelAt(index);
        if (element.textContent !== placement.text)
          element.textContent = placement.text;
        // A label follows the background under the centre of its own box, by the same
        // rule the lines follow, so a number and the line it sits on never disagree.
        const centreX = placement.box.left + placement.box.width / 2;
        const centreY = placement.box.top + placement.box.height / 2;
        const background = gridLabelBackground(
          frame.background,
          centreX,
          centreY,
          frame.viewport,
        );
        placeLabel(element, placement.box, background);
        if (element.parentNode === null) host.append(element);
      }
      for (let index = placements.length; index < shown; index += 1) {
        labels[index]?.remove();
      }
      shown = placements.length;

      const text = planeLabelText(frame.view.cursor[1]);
      const box = planeLabelBox(text, frame.viewport);
      if (plane.textContent !== text) plane.textContent = text;
      const planeBackground = gridLabelBackground(
        frame.background,
        box.left + box.width / 2,
        box.top + box.height / 2,
        frame.viewport,
      );
      placeLabel(plane, box, planeBackground);
      if (plane.parentNode === null) host.append(plane);
    },
    labelCount(): number {
      return shown;
    },
    clear,
  };
}
