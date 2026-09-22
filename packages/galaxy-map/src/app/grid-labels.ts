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
import type { ResolvedBounds, View } from '../camera/view';
import type { Range } from '../galaxy-model/types';
import {
  gridBackgroundColour,
  gridBackgroundWeight,
  GRID_LABEL_COLOR,
  GRID_LABEL_COLOR_DEEP,
  GRID_LABEL_MERGE_FLOOR,
  GRID_MAX_ALPHA,
  gridLevelAlpha,
  gridVisibility,
} from '../render/grid-pass';
import { boxesOverlap } from './labels';
import type { LabelBox } from './labels';
import { planePlacement, setStyle, writeOnPlane } from './plane-overlay';
import type { PlanePlaced } from './plane-overlay';

/**
 * How many spacings of the label level each side of the cursor carry a candidate. The
 * reach below takes every crossing past 2 spacings, and a crossing three steps out is at
 * least 2 spacings away, so a wider ring would only project points that carry no label.
 */
export const GRID_LABEL_SPAN = 2;

/** How many crossings one frame looks at. The work of one frame is therefore fixed. */
export const GRID_CANDIDATE_COUNT = (2 * GRID_LABEL_SPAN + 1) ** 2;

/** How many crossing labels the overlay places. The nearest to the cursor are kept. */
export const MAX_GRID_LABELS = 8;

/**
 * How many spacings from the cursor a crossing still carries a label. The opacity falls
 * linearly to 0 there.
 *
 * The reach is 2 spacings, so every corner of the cell the cursor sits in carries a
 * number. The furthest corner of that cell is 1.41 spacings away, at the moment the
 * cursor sits on the opposite corner. The reach was 1.2 spacings, which took that corner
 * and left the cell named on one side only: a user beside a crossing read numbers behind
 * them and none ahead. Two spacings names all four corners wherever the cursor sits in
 * the cell, at an opacity of at least 0.29.
 *
 * The reach is 2 and not more because 2 is what the candidate ring holds.
 */
export const GRID_LABEL_REACH = 2;

/**
 * How far a number sits off its crossing, as a share of a level spacing, on each of the
 * game `x` and `z` axes. The crossing becomes the label's bottom right corner, so the
 * number lies in the cell above and left of it and neither line runs under a digit.
 *
 * A label was centred on its crossing, so both lines crossed the text through its
 * middle. A line through the middle of a row of digits is the one place a reader cannot
 * tell one digit from another.
 *
 * The gap is about one and a half cap heights: inside the model bounds the cap height is
 * about a thirty-eighth of the spacing. At the 1,000 light year level the gap is 40 light
 * years.
 */
export const GRID_LABEL_GAP_SHARE = 0.04;

/** The largest share of a level's spacing a label's cap height takes. */
export const GRID_LABEL_CAP_SHARE = 0.1;

/**
 * The largest share of a level's spacing a label's whole width takes.
 *
 * This is the bound that sets the size, not `GRID_LABEL_CAP_SHARE`: the worst-case text
 * of the model bounds, `-49,985 : -40,985 : -24,105`, runs to about 23 cap heights, so a
 * share of 0.6 gives a cap height of about a thirty-eighth of the spacing, well under the
 * one tenth the other constant allows. The share was 1, which let a label run the whole
 * width of its own cell and read as too large.
 *
 * The width the share holds is the worst case of the browsable space and not each label's
 * own, so every label of a level takes one size. A narrower space carries shorter numbers,
 * which gives larger text.
 */
export const GRID_LABEL_WIDTH_SHARE = 0.6;

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

/**
 * The opacity of a label over a dark background. It is below the 0.86 the label carried
 * before the merge, because the label no longer stands over a hard outline.
 */
export const GRID_LABEL_OPACITY = 0.8;

/**
 * The dark edge of a label: a drawn stroke and not a blurred glow. Firefox rasterises a
 * blurred text shadow on the CPU, and the overlay's two blurred shadows cost 4.2 ms of a
 * frame that cost 12.1 ms while the camera moves. `browser-suite` holds the reading.
 *
 * The colour is the same cool dark the glow used, so the edge sits under a cyan label
 * rather than beside it, and it is not pure black: a pure black edge draws a second
 * outline that no part of the picture carries.
 */
export const GRID_LABEL_STROKE_COLOUR = 'rgba(2, 12, 20, 0.9)';

/** The width of that stroke, in CSS pixels. */
export const GRID_LABEL_STROKE_CSS = 2.5;

/** The stroke as the `-webkit-text-stroke` shorthand takes it. */
export const GRID_LABEL_STROKE = `${GRID_LABEL_STROKE_CSS}px ${GRID_LABEL_STROKE_COLOUR}`;

/**
 * Draws the stroke under the glyph, so the edge widens outward rather than eating the
 * letter. Without it the stroke is centred on the outline and takes half the glyph.
 */
export const GRID_LABEL_PAINT_ORDER = 'stroke fill';

/** The font family every coordinate label draws in. */
export const GRID_LABEL_FONT_FAMILY = "'IBM Plex Mono', ui-monospace, monospace";

/** The font size the placement measures a text at, in CSS pixels. */
export const GRID_LABEL_MEASURE_CSS = 100;

/** The smallest font size an element is built at, in CSS pixels. */
export const GRID_LABEL_FONT_MIN_CSS = 8;

/** The largest font size an element is built at, in CSS pixels. */
export const GRID_LABEL_FONT_MAX_CSS = 512;

/**
 * A whole number with a thousands separator, for example `-12,345`. A number of three
 * digits or fewer carries no separator.
 *
 * The locale is named, so the separator is the comma at every locale the browser runs
 * in. The `|| 0` turns negative zero into zero, which is the one value where
 * `toLocaleString` reads `-0`.
 */
export function labelNumber(value: number): string {
  return (Math.round(value) || 0).toLocaleString('en-US');
}

/**
 * The text of a crossing label: all three game coordinates, as `x : y : z`, in whole
 * light years. The `x` and the `z` are the crossing's own and the `y` is the `y` of the
 * plane the grid draws on, which is the cursor's.
 */
export function crossingLabelText(x: number, y: number, z: number): string {
  return `${labelNumber(x)} : ${labelNumber(y)} : ${labelNumber(z)}`;
}

/**
 * The widest text a crossing label of the browsable space can carry.
 *
 * Every label of a level takes one cap height, and this is the text that height comes
 * from. For each of the game `x`, `y` and `z` it takes the bound endpoint whose written
 * form is the longer, and composes the three as `x : y : z`. Inside the model bounds that
 * is `-49,985 : -40,985 : -24,105`, which is 27 characters.
 *
 * A sphere has no endpoint on an axis, so it gives the endpoints of its own axis-aligned
 * box, which is the centre plus and minus the radius.
 *
 * The `y` term comes from the bounds and not from the cursor, although the `y` a label
 * carries is the cursor's. Taking the cursor's written length would resize every label of
 * the frame as the user moved up and down.
 */
export function worstCaseLabelText(bounds: ResolvedBounds): string {
  const low =
    bounds.kind === 'sphere'
      ? ([
          bounds.centre[0] - bounds.radiusLy,
          bounds.centre[1] - bounds.radiusLy,
          bounds.centre[2] - bounds.radiusLy,
        ] as const)
      : bounds.min;
  const high =
    bounds.kind === 'sphere'
      ? ([
          bounds.centre[0] + bounds.radiusLy,
          bounds.centre[1] + bounds.radiusLy,
          bounds.centre[2] + bounds.radiusLy,
        ] as const)
      : bounds.max;
  const longer = (axis: number): string => {
    const first = labelNumber(low[axis] as number);
    const second = labelNumber(high[axis] as number);
    return second.length > first.length ? second : first;
  };
  return `${longer(0)} : ${longer(1)} : ${longer(2)}`;
}

/**
 * The worst-case text of each bounds the page has seen.
 *
 * `resolveBounds` gives a new object when the browsable space or the system set changes,
 * and the same object on every other frame, so identity is the right key. A `WeakMap`
 * lets a bounds the map no longer holds go. The font side of the measurement is already
 * cached: `createGridLabelMeasure` holds each text it reads, against the one font it
 * measures with.
 */
const worstCaseTexts = new WeakMap<object, string>();

/** `worstCaseLabelText`, with the string held against the bounds it came from. */
function heldWorstCaseLabelText(bounds: ResolvedBounds): string {
  const known = worstCaseTexts.get(bounds);
  if (known !== undefined) return known;
  const text = worstCaseLabelText(bounds);
  worstCaseTexts.set(bounds, text);
  return text;
}

/**
 * The font size an element is built at for a wanted cap height on the screen, in CSS
 * pixels.
 *
 * Chromium rasterises a transformed element at the composited scale, and text scaled up
 * by a `matrix3d` goes soft. The size is therefore the next power of two at or above the
 * wanted one, so the transform always scales the element **down**, by a factor between
 * 0.5 and 1. Powers of two and not the wanted size itself, so the element keeps one
 * raster over a range of zooms instead of rebuilding its text every frame.
 */
export function gridLabelFontSize(wantedCss: number): number {
  if (!(wantedCss > 0)) return GRID_LABEL_FONT_MIN_CSS;
  const power = 2 ** Math.ceil(Math.log2(wantedCss));
  return Math.min(GRID_LABEL_FONT_MAX_CSS, Math.max(GRID_LABEL_FONT_MIN_CSS, power));
}

/**
 * How much of its own opacity a label keeps at a distance from the cursor. A crossing at
 * or past 2 spacings carries no label at all.
 *
 * A user moving the cursor sees the crossing ahead of them come up as the one behind them
 * goes down, so the numbers follow the cursor rather than filling the frame.
 */
export function gridLabelReach(distanceLy: number, spacingLy: number): number {
  if (!(spacingLy > 0)) return 0;
  return Math.max(0, 1 - distanceLy / (GRID_LABEL_REACH * spacingLy));
}

/** What one measurement of a label's text reports, as shares of the font size. */
export interface GridLabelMeasure {
  /** The width of the whole text, as a share of the font size. */
  readonly widthPerEm: number;
  /** The cap height of a digit, as a share of the font size. */
  readonly capPerEm: number;
}

/**
 * The cap height of a label on the plane, in light years.
 *
 * The measurement is of the **worst-case text** of the browsable bounds, which
 * `worstCaseLabelText` builds, and not of the label's own text. Every label of a level
 * therefore takes one cap height, and the grid reads as one scale rather than as numbers
 * at mixed sizes. Each label's own box still follows its own text.
 *
 * The height is the lesser of one tenth of the level's spacing and the height that holds
 * that worst-case width to `GRID_LABEL_WIDTH_SHARE` of a spacing. `-49,985 : -40,985 :
 * -24,105` runs to 27 characters, so its width is about 23 cap heights: at one tenth of
 * the spacing the label would be about 2.3 spacings wide, every label would cross its
 * neighbours, and the overlap rule would drop all but one. The width bound is therefore
 * the binding one.
 */
export function gridLabelCapHeightLy(
  spacingLy: number,
  worst: GridLabelMeasure,
): number {
  const byWidth =
    (spacingLy * GRID_LABEL_WIDTH_SHARE * worst.capPerEm) / worst.widthPerEm;
  return Math.min(spacingLy * GRID_LABEL_CAP_SHARE, byWidth);
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
  /**
   * The browsable space, which the worst-case label text comes from. A narrower space
   * carries shorter numbers and therefore larger ones on the screen.
   */
  readonly browse: ResolvedBounds;
  /** The background reading, or null while the map has none. */
  readonly background: GridLabelReading | null;
  /**
   * The view epoch, which rises on every write of the view and on a resize. The overlay
   * keeps the placements of the last epoch and sweeps again only where the number moved.
   * A caller that gives none sweeps on every frame.
   */
  readonly epoch?: number;
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
 * How much of its own opacity a label keeps, for a level that draws at `alpha` at the
 * label's crossing.
 *
 * A label must not draw stronger than the line it names. The label level's spacing on the
 * screen is at least 400 CSS pixels at the cursor, so the level is fully bold there and
 * the factor is 1: a label at the cursor keeps the whole of its own opacity. The factor
 * falls away from the cursor, where the projection closes the lines up toward the horizon
 * and the level's alpha falls with them.
 *
 * `GRID_LABEL_MIN_ALPHA` is the gate the placement already holds, so the factor never
 * goes below 0.2 in a placed label.
 */
export function gridLabelLineFactor(alpha: number): number {
  return alpha / GRID_MAX_ALPHA;
}

/**
 * The opacity of a label over a background of this luminance, for a level that draws at
 * `alpha` at the label's crossing and a reach fade of `reach`. The floor of the label's
 * background weight is above the line's, because text needs more contrast than a line.
 */
export function gridLabelOpacity(
  luminance: number,
  alpha = GRID_MAX_ALPHA,
  reach = 1,
): number {
  return (
    GRID_LABEL_OPACITY *
    gridLabelLineFactor(alpha) *
    reach *
    gridBackgroundWeight(luminance, GRID_LABEL_MERGE_FLOOR)
  );
}

/**
 * The colour of a label over a background, as a CSS `rgb` value. The label darkens
 * toward a deep blue of its own hue and takes nothing of the background's own colour,
 * by the same rule the lines follow.
 */
export function gridLabelColour(background: GridLabelBackground): string {
  const colour = gridBackgroundColour(
    background.luminance,
    GRID_LABEL_COLOR,
    GRID_LABEL_COLOR_DEEP,
  );
  const round = (value: number): number => Math.round(value);
  return `rgb(${round(colour[0])}, ${round(colour[1])}, ${round(colour[2])})`;
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

/** One crossing label the frame places. */
export interface GridLabelPlacement {
  readonly text: string;
  /**
   * Where the crossing projects to, in CSS pixels. It is the label's reported anchor,
   * and the label's own box sits above and left of it.
   */
  readonly x: number;
  readonly y: number;
  /** The drawn alpha of the label level at the crossing, which the gate read. */
  readonly alpha: number;
  /** How much of its own opacity the label keeps for its distance from the cursor. */
  readonly reach: number;
  /** The font size the element is built at, in CSS pixels. */
  readonly fontCss: number;
  /** The element's own box, in CSS pixels. */
  readonly widthCss: number;
  readonly heightCss: number;
  /** The cap height inside the element's own box, in CSS pixels. */
  readonly capHeightCss: number;
  /** The cap height on the screen at the crossing, in CSS pixels. */
  readonly capHeightScreenCss: number;
  /** The level's spacing on the screen at the crossing, along the game `x` axis. */
  readonly spacingCss: number;
  /** Where the label lands on the plane and on the screen. */
  readonly placed: PlanePlaced;
}

/**
 * The crossing labels of one frame. The sweep reads the 25 crossings within 2 spacings
 * of the cursor, drops the ones past the reach, drops the ones the frame cannot show,
 * drops the ones whose own lines do not draw, keeps the 8 nearest the cursor, and skips a
 * label whose screen box overlaps one already placed.
 *
 * Three readings say that a crossing carries a label. Its distance from the cursor is
 * inside the reach. It lies inside the model bounds on both game axes, where `grid.frag`
 * stops the lines. And the level's drawn alpha at the crossing holds
 * `GRID_LABEL_MIN_ALPHA`, which `gridLabelAlpha` reads from the two axis scales the
 * crossing sits at and the camera distance band.
 *
 * A candidate is dropped for the viewport **only when no part of its own label is on the
 * screen**, which `planePlacement` reads from the label's own quad. The gate does not
 * read the crossing's own projected point: the crossing is the label's bottom right
 * corner, so a gate there took the whole label away as the crossing passed the right or
 * the bottom edge while every digit of it was still in front of the user. The reported
 * anchor stays the crossing, so the page may report an anchor outside the viewport for a
 * label the user can see.
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
 *
 * `measure` reports a text's width and cap height as shares of the font size. The overlay
 * measures each text once and keeps the reading, as the region labels measure each name
 * once, so the size follows the font the page loaded and not a character count.
 */
export function gridLabelPlacements(
  frame: GridLabelFrame,
  measure: (text: string) => GridLabelMeasure,
): GridLabelPlacement[] {
  const { view, viewport, spacingLy, bounds } = frame;
  if (spacingLy <= 0) return [];

  // One measurement for the whole frame, of the widest text the bounds allow. The measure
  // holds each text it reads, so this is one map lookup a frame after the first one.
  const worst = measure(heldWorstCaseLabelText(frame.browse));
  if (!(worst.widthPerEm > 0) || !(worst.capPerEm > 0)) return [];
  const capHeightLy = gridLabelCapHeightLy(spacingLy, worst);

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
  const distances: number[] = [];
  for (let stepX = -GRID_LABEL_SPAN; stepX <= GRID_LABEL_SPAN; stepX += 1) {
    for (let stepZ = -GRID_LABEL_SPAN; stepZ <= GRID_LABEL_SPAN; stepZ += 1) {
      const gameX = baseX + stepX * spacingLy;
      const gameZ = baseZ + stepZ * spacingLy;
      // The lines stop at the model bounds, so a crossing beyond them carries none.
      if (gameX < bounds.x[0] || gameX > bounds.x[1]) continue;
      if (gameZ < bounds.z[0] || gameZ > bounds.z[1]) continue;
      const away = Math.hypot(gameX - view.cursor[0], gameZ - view.cursor[2]);
      const reach = gridLabelReach(away, spacingLy);
      if (reach <= 0) continue;
      const at = project(gameX, gameZ);
      if (at === null) continue;
      const { x, y } = at;
      // The crossing's own projected point is not a gate. A label lies in the cell above
      // and left of its crossing, so the crossing is the label's bottom right corner and
      // not a point of the text. `planePlacement` below drops a label whose whole quad
      // lies outside the viewport, which is the reading the spec asks for.
      //
      // The near-plane check above stays, because the Jacobian and the alpha gate read
      // the projected crossing and a point behind the camera has no useful one.
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

      const text = crossingLabelText(gameX, view.cursor[1], gameZ);
      // The label's own reading places its own box. The cap height is the frame's one.
      const reading = measure(text);
      if (!(reading.widthPerEm > 0) || !(reading.capPerEm > 0)) continue;
      // The cap height the label draws at on the screen, which chooses the font size the
      // element is built at. The cap height runs along the game `z` axis.
      const capHeightScreenCss = capHeightLy / Math.max(perPixelZ, 1e-9);
      const fontCss = gridLabelFontSize(capHeightScreenCss / reading.capPerEm);
      const widthCss = reading.widthPerEm * fontCss;
      const heightCss = fontCss;
      const capHeightCss = reading.capPerEm * fontCss;
      // The light years of the plane one CSS pixel of the element's own box covers.
      const perBoxCss = capHeightLy / capHeightCss;
      const widthLy = widthCss * perBoxCss;
      const heightLy = heightCss * perBoxCss;
      // The crossing is the label's bottom right corner, less the gap on each axis.
      // `planePlacement` takes an anchor at the middle of the element, so the sweep
      // gives it the crossing less half the size and the gap.
      //
      // The two signs are not the same. `planeCorners` in `src/app/plane-overlay.ts`
      // runs the element's local `y` downward along the game `-z` axis, so the
      // rectangle's bottom right corner sits at
      // `(anchor.x + widthLy / 2, anchor.z - heightLy / 2)`. Putting that corner at the
      // crossing less the gap therefore gives minus on `x` and plus on `z`.
      const gapLy = GRID_LABEL_GAP_SHARE * spacingLy;
      const placedOn = planePlacement({
        view,
        viewport,
        planeY: view.cursor[1],
        anchor: [gameX - widthLy / 2 - gapLy, gameZ + heightLy / 2 + gapLy],
        widthLy,
        heightLy,
        widthCss,
        heightCss,
      });
      if (placedOn === null) continue;

      candidates.push({
        text,
        x,
        y,
        alpha,
        reach,
        fontCss,
        widthCss,
        heightCss,
        capHeightCss,
        capHeightScreenCss,
        spacingCss: spacingLy / Math.max(perPixelX, 1e-9),
        placed: placedOn,
      });
      distances.push(away);
    }
  }

  const order = candidates.map((_place, index) => index);
  order.sort(
    (first, second) => (distances[first] as number) - (distances[second] as number),
  );

  const placed: GridLabelPlacement[] = [];
  const boxes: LabelBox[] = [];
  for (const index of order) {
    if (placed.length === MAX_GRID_LABELS) break;
    const candidate = candidates[index] as GridLabelPlacement;
    // A label on the plane is not an upright rectangle on the screen, so the overlap
    // test reads the bounding box of its transformed quad.
    const box = candidate.placed.box;
    if (boxes.some((other) => boxesOverlap(box, other))) continue;
    placed.push(candidate);
    boxes.push(box);
  }
  return placed;
}

/**
 * What one crossing label of the last frame reads. The line factor and the reach are
 * ratios, and neither reaches a pixel of the frame on its own, so a test cannot read them
 * from the picture alone.
 */
export interface GridLabelPlaced {
  /** The text the label carries. */
  readonly text: string;
  /** The label's anchor, in CSS pixels from the left of the canvas. */
  readonly x: number;
  /** The label's anchor, in CSS pixels from the top of the canvas. */
  readonly y: number;
  /** The drawn alpha of the label level at the label's crossing. */
  readonly alpha: number;
  /** How much of its own opacity the label keeps for its distance from the cursor. */
  readonly reach: number;
  /** The opacity the label was given. */
  readonly opacity: number;
  /** The cap height on the screen at the label's crossing, in CSS pixels. */
  readonly capHeightCss: number;
  /** The level's spacing on the screen at the crossing, along the game `x` axis. */
  readonly spacingCss: number;
  /** The four screen corners of the label's quad, in CSS pixels. */
  readonly corners: readonly { readonly x: number; readonly y: number }[];
}

/** The overlay that holds the grid labels. */
export interface GridLabelOverlay {
  /** Places the labels of one frame. */
  update(frame: GridLabelFrame): void;
  /** How many crossing labels the last frame placed. */
  labelCount(): number;
  /** The crossing labels of the last frame, as the overlay placed them. */
  readings(): GridLabelPlaced[];
  /** Takes every label out of the overlay. */
  clear(): void;
}

/** Builds one label element. */
function makeLabel(document: Document): HTMLElement {
  const element = document.createElement('div');
  element.className = 'gm-grid-label';
  // The four styles a placement never moves. `writeOnPlane` writes the size, the
  // transform and the level, and each of its writes is a CSSOM read first.
  setStyle(element, 'position', 'absolute');
  setStyle(element, 'left', '0px');
  setStyle(element, 'top', '0px');
  setStyle(element, 'transform-origin', '0 0');
  setStyle(element, 'pointer-events', 'none');
  setStyle(element, 'white-space', 'nowrap');
  setStyle(element, 'box-sizing', 'border-box');
  // The canvas measures the text without letter spacing, so the element carries none.
  setStyle(element, 'letter-spacing', '0');
  setStyle(element, 'text-align', 'center');
  setStyle(element, 'paint-order', GRID_LABEL_PAINT_ORDER);
  setStyle(element, '-webkit-text-stroke', GRID_LABEL_STROKE);
  // Chromium rasterises a transformed element at the composited scale. The placement
  // sizes the element so the transform shrinks it, and this promotes the element so the
  // raster is taken again when the scale changes.
  setStyle(element, 'will-change', 'transform');
  return element;
}

/**
 * Measures a label's text, as shares of the font size, and keeps each reading.
 *
 * The reading comes from a canvas 2D context in the same font family the elements draw
 * in, so the size follows the font the page loaded and not a character count. A context
 * the page cannot give falls back to the ratios of a monospace font.
 */
export function createGridLabelMeasure(
  document: Document,
): (text: string) => GridLabelMeasure {
  const held = new Map<string, GridLabelMeasure>();
  let context: CanvasRenderingContext2D | null | undefined;
  return (text: string): GridLabelMeasure => {
    const known = held.get(text);
    if (known !== undefined) return known;
    if (context === undefined) {
      // A host that gives the library a document with no canvas reads the fallback
      // below, which the unit tests take as well.
      const canvas = document.createElement('canvas') as HTMLCanvasElement;
      context =
        typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
      if (context !== null) {
        context.font = `${GRID_LABEL_MEASURE_CSS}px ${GRID_LABEL_FONT_FAMILY}`;
      }
    }
    // A monospace fallback: about 0.6 em for each character, and a cap height of 0.7 em.
    let reading: GridLabelMeasure = {
      widthPerEm: text.length * 0.6,
      capPerEm: 0.7,
    };
    if (context !== null && context !== undefined) {
      const width = context.measureText(text).width;
      // A digit stands to the cap height in every font the labels use.
      const cap = context.measureText('0').actualBoundingBoxAscent;
      if (width > 0 && cap > 0) {
        reading = {
          widthPerEm: width / GRID_LABEL_MEASURE_CSS,
          capPerEm: cap / GRID_LABEL_MEASURE_CSS,
        };
      }
    }
    held.set(text, reading);
    return reading;
  };
}

/**
 * Builds the grid label overlay in an element. It keeps a pool of label elements, so a
 * frame adds no element the frame before did not need.
 */
export function createGridLabelOverlay(host: HTMLElement): GridLabelOverlay {
  const document = host.ownerDocument;
  const labels: HTMLElement[] = [];
  const measure = createGridLabelMeasure(document);
  let shown = 0;
  let placed: GridLabelPlaced[] = [];
  // The placements of the last sweep, and what they were swept for. The sweep reads the
  // view, the level spacing and the browsable space alone, so a frame that holds all
  // three keeps them.
  let placements: GridLabelPlacement[] = [];
  let sweptEpoch: number | null = null;
  let sweptSpacing = 0;
  let sweptBrowse: ResolvedBounds | null = null;

  const labelAt = (index: number): HTMLElement => {
    let element = labels[index];
    if (element === undefined) {
      element = makeLabel(document);
      labels[index] = element;
    }
    return element;
  };

  const clear = (): void => {
    for (const element of labels) element.remove();
    shown = 0;
    placed = [];
    placements = [];
    sweptEpoch = null;
  };

  return {
    update(frame: GridLabelFrame): void {
      if (frame.spacingLy <= 0) {
        clear();
        return;
      }

      // The projection sweep runs once per view. The background read below runs on
      // every frame, because the reading of a view lands one or two frames after the
      // view and a gate over the whole update would hold every label's tint on the
      // reading of the view before.
      const epoch = frame.epoch ?? null;
      if (
        epoch === null ||
        epoch !== sweptEpoch ||
        frame.spacingLy !== sweptSpacing ||
        frame.browse !== sweptBrowse
      ) {
        placements = gridLabelPlacements(frame, measure);
        sweptEpoch = epoch;
        sweptSpacing = frame.spacingLy;
        sweptBrowse = frame.browse;
      }
      const readings: GridLabelPlaced[] = [];
      for (let index = 0; index < placements.length; index += 1) {
        const placement = placements[index] as GridLabelPlacement;
        const element = labelAt(index);
        if (element.textContent !== placement.text) {
          element.textContent = placement.text;
        }
        setStyle(
          element,
          'font',
          `${placement.fontCss}px/${placement.heightCss}px ${GRID_LABEL_FONT_FAMILY}`,
        );
        // A label follows the background under its own box, by the same rule the lines
        // follow, so a number and the line it sits on never disagree. The reading is
        // taken at the centre of the placement's screen bounding box and not at the
        // crossing, because the box is the picture the text draws over.
        //
        // The point is held inside the frame. A label at the edge can carry the centre
        // of its own box outside the viewport while part of the text is inside it. The
        // reading has no pixel there, and a label that fell back to no reading would
        // step in colour and in opacity as its centre crossed the edge.
        const box = placement.placed.box;
        const background = gridLabelBackground(
          frame.background,
          Math.min(Math.max(box.left + box.width / 2, 0), frame.viewport.width - 1),
          Math.min(Math.max(box.top + box.height / 2, 0), frame.viewport.height - 1),
          frame.viewport,
        );
        const opacity = gridLabelOpacity(
          background.luminance,
          placement.alpha,
          placement.reach,
        );
        // The sweep solved the homography already, so the overlay writes it and does
        // not solve it a second time.
        writeOnPlane(
          element,
          placement.widthCss,
          placement.heightCss,
          placement.placed,
        );
        setStyle(element, 'opacity', `${opacity}`);
        setStyle(element, 'color', gridLabelColour(background));
        readings.push({
          text: placement.text,
          x: placement.x,
          y: placement.y,
          alpha: placement.alpha,
          reach: placement.reach,
          opacity,
          capHeightCss: placement.capHeightScreenCss,
          spacingCss: placement.spacingCss,
          corners: placement.placed.corners.map((point) => ({
            x: point.x,
            y: point.y,
          })),
        });
        if (element.parentNode === null) host.append(element);
      }
      placed = readings;
      for (let index = placements.length; index < shown; index += 1) {
        labels[index]?.remove();
      }
      shown = placements.length;
    },
    readings(): GridLabelPlaced[] {
      return placed;
    },
    labelCount(): number {
      return shown;
    },
    clear,
  };
}
