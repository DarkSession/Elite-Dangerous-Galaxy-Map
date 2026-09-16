// Draws a coordinate grid on the plane the cursor sits on. Every decade level draws in
// the same frame, and each level's look follows its spacing on the screen at the point
// that draws it. The pass draws one full-screen triangle: the plane, the levels and the
// lines are all worked out for each fragment, so no line is a vertex and no buffer holds
// a line.
import type { Range } from '../galaxy-model/types';
import { createProgram } from './program';
import type { Program } from './program';
import vertexSource from './shaders/grid.vert?raw';
import fragmentSource from './shaders/grid.frag?raw';

/** The levels the grid draws, in light years, in rising order. */
export const GRID_LEVELS: readonly number[] = [1, 10, 100, 1000, 10000, 100000];

/** How many vertices one grid draw issues. Three are one triangle over the frame. */
export const GRID_VERTEX_COUNT = 3;

/** The screen spacing at which a level's alpha reaches 0, in CSS pixels. */
export const GRID_FADE_LOW_CSS = 8;

/** The screen spacing at which a level's alpha reaches its base, in CSS pixels. */
export const GRID_FADE_HIGH_CSS = 40;

/** The screen spacing at which a level starts to grow bold, in CSS pixels. */
export const GRID_BOLD_LOW_CSS = 40;

/** The screen spacing at which a level is fully bold, in CSS pixels. */
export const GRID_BOLD_HIGH_CSS = 400;

/** The width of a level at its finest, in CSS pixels. */
export const GRID_MIN_WIDTH_CSS = 1;

/** The width of a level when it is fully bold, in CSS pixels. */
export const GRID_MAX_WIDTH_CSS = 2.6;

/** The alpha of a level at its finest. */
export const GRID_MIN_ALPHA = 0.18;

/** The alpha of a level when it is fully bold. */
export const GRID_MAX_ALPHA = 0.45;

/** How many of its own lines a level reaches each side of the cursor. */
export const GRID_FADE_LINES = 100;

/**
 * The share of the camera's distance to the cursor a level that carries no number
 * reaches. A disc of radius `0.4 * d` light years about the cursor projects to
 * `0.4 * focalCss` CSS pixels at the cursor's own range, which is 0.346 of the viewport
 * height: 374 CSS pixels on 1,080 rows. The dense lattice therefore marks the same part
 * of the frame at every zoom instead of running to the frame edge.
 */
export const GRID_REACH_ZOOM = 0.4;

/** The camera distance at which the grid draws at full strength, in light years. */
export const GRID_NEAR_FULL_LY = 4000;

/** The camera distance at which the grid draws nothing, in light years. */
export const GRID_FAR_NONE_LY = 12000;

/** The smallest screen spacing a label level takes, in CSS pixels. */
export const GRID_LABEL_CSS = 400;

/**
 * The colour of a grid line over a dark background, red, green and blue from 0 to 255.
 * It is a cyan, which no other part of the frame carries: the star field, the nebulae
 * and the region boundary band are all warm.
 */
export const GRID_COLOR: readonly [number, number, number] = [96, 214, 224];

/**
 * The colour of a grid line over the brightest background. It is the same hue, deep
 * enough to stand below the tone-mapped core.
 *
 * By the Rec.709 weights the map uses everywhere, the light colour has a luminance of
 * 0.744 and this one has 0.254. The core reads about 0.93 after the tone map and the
 * dark space between the arms about 0.05, so the light end stands above a dark
 * background by 0.69 and the deep end stands below a bright one by 0.68. One line reads
 * at both ends of the picture.
 */
export const GRID_COLOR_DEEP: readonly [number, number, number] = [16, 74, 120];

/** The background luminance below which the grid keeps all of itself. */
export const GRID_BG_LOW = 0.08;

/** The background luminance at which the merge is complete. */
export const GRID_BG_HIGH = 0.55;

/**
 * How much of a line's alpha is left over the brightest background. The floor is not
 * zero and it is well above it: a grid the user cannot find over the core is not a
 * coordinate grid. 0.55 of the bold level's 0.45 alpha is 0.248, on a line that carries
 * a luminance contrast of 0.68 as well.
 */
export const GRID_LINE_MERGE_FLOOR = 0.55;

/**
 * The colour of a coordinate label over a dark background, red, green and blue from 0 to
 * 255. It is lighter than the line's, because text needs more contrast than a line.
 */
export const GRID_LABEL_COLOR: readonly [number, number, number] = [140, 235, 240];

/** The colour of a coordinate label over the brightest background. */
export const GRID_LABEL_COLOR_DEEP: readonly [number, number, number] = [20, 88, 140];

/**
 * How much of a label's opacity is left over the brightest background. It is above the
 * line's floor because text needs more contrast than a line to stay readable. A label
 * and the line it sits on therefore recede together, and the label keeps more of itself.
 */
export const GRID_LABEL_MERGE_FLOOR = 0.75;

/** The smooth step of `smoothstep(low, high, value)`. */
export function smoothStep(low: number, high: number, value: number): number {
  if (high <= low) return value >= high ? 1 : 0;
  const part = Math.min(1, Math.max(0, (value - low) / (high - low)));
  return part * part * (3 - 2 * part);
}

/**
 * How much of its own strength the grid keeps over a background of this luminance. A
 * fixed alpha makes one line read the same over the dark space between the arms and
 * over the cream core, so the grid sits on the picture rather than in it. The weight is
 * 1 at a luminance of 0.08 and below, and falls to `floor` at 0.55 and above.
 *
 * One rule, one owner: `grid.frag` takes the two edges and the floor as uniforms, and
 * `src/app/grid-labels.ts` calls this function, so a number and the line it sits on
 * cannot disagree.
 */
export function gridBackgroundWeight(luminance: number, floor: number): number {
  return 1 - (1 - floor) * smoothStep(GRID_BG_LOW, GRID_BG_HIGH, luminance);
}

/**
 * The colour the grid draws with over a background of this luminance, between a light
 * colour and a deep one of the same hue. The mix runs over the same band as the weight
 * above, so one background reading moves both.
 *
 * The colour SHALL NOT move toward the background's own colour. The rule this replaces
 * mixed the line 60 per cent toward it, so over the cream core an orange line became a
 * warm dim stripe that carried neither hue contrast nor luminance contrast. The grid was
 * then least readable where a user needs it most.
 */
export function gridBackgroundColour(
  luminance: number,
  light: readonly [number, number, number],
  deep: readonly [number, number, number],
): [number, number, number] {
  const merge = smoothStep(GRID_BG_LOW, GRID_BG_HIGH, luminance);
  const mix = (from: number, to: number): number => from + (to - from) * merge;
  return [
    mix(light[0] as number, deep[0] as number),
    mix(light[1] as number, deep[1] as number),
    mix(light[2] as number, deep[2] as number),
  ];
}

/**
 * The spacing of a level on the screen at a point, in CSS pixels. `focalCss` is the CSS
 * pixels per light year at one light year of range, and `range` is the distance from the
 * camera to the point in light years.
 */
export function gridScreenSpacing(
  focalCss: number,
  range: number,
  spacing: number,
): number {
  return (focalCss * spacing) / Math.max(range, 1e-6);
}

/**
 * How bold a level is at a screen spacing, from 0 to 1. The reading follows the spacing
 * on the screen and not the level's rank, so nothing steps as the zoom crosses a decade.
 */
export function gridLevelBoldness(screenSpacing: number): number {
  return smoothStep(GRID_BOLD_LOW_CSS, GRID_BOLD_HIGH_CSS, screenSpacing);
}

/** The width of a level at a screen spacing, in CSS pixels. */
export function gridLevelWidth(screenSpacing: number): number {
  const bold = gridLevelBoldness(screenSpacing);
  return GRID_MIN_WIDTH_CSS + (GRID_MAX_WIDTH_CSS - GRID_MIN_WIDTH_CSS) * bold;
}

/**
 * The alpha of a level at a screen spacing. A level closer than 8 CSS pixels draws
 * nothing, so a level that would read as a wash of lines is gone.
 */
export function gridLevelAlpha(screenSpacing: number): number {
  const bold = gridLevelBoldness(screenSpacing);
  const base = GRID_MIN_ALPHA + (GRID_MAX_ALPHA - GRID_MIN_ALPHA) * bold;
  return base * smoothStep(GRID_FADE_LOW_CSS, GRID_FADE_HIGH_CSS, screenSpacing);
}

/**
 * How much of the grid draws at a camera distance to the cursor, from 0 to 1. The grid
 * is a tool for reading a neighbourhood, so it fades in as the camera comes near: 0 at
 * 12,000 light years and further, 1 at 4,000 and nearer, and 0.5 at 8,000.
 *
 * The reading is the camera's distance to the cursor, one value for the whole frame. A
 * band by fragment range would open the grid under the camera at every zoom.
 */
export function gridVisibility(distance: number): number {
  return 1 - smoothStep(GRID_NEAR_FULL_LY, GRID_FAR_NONE_LY, distance);
}

/**
 * How much of a level's alpha is left at a distance from the cursor on the plane, under
 * the level's **own** reach of 100 of its own lines each side of the cursor.
 *
 * This is one of the two reaches a level takes, and the level that carries the coordinate
 * numbers is the only one that takes it alone. Every other level stops at the lesser of
 * this reach and the zoom bound, which `gridReachPerLevel` works out and the shader
 * applies as one ramp. The rule and its reading do not move; the second bound sits beside
 * it.
 */
export function gridDistanceFade(distance: number, spacing: number): number {
  const reach = GRID_FADE_LINES * spacing;
  return Math.min(1, Math.max(0, 1 - distance / reach));
}

/**
 * How far a level that carries no number reaches from the cursor, in light years, at a
 * camera distance to the cursor. The reach follows the zoom, so the lattice marks the
 * same part of the frame however near or far the camera is.
 */
export function gridZoomReach(cameraDistance: number): number {
  return GRID_REACH_ZOOM * cameraDistance;
}

/**
 * The two levels a coordinate label sits on, in light years, in rising order. The six
 * decade levels draw lines and only these two carry numbers: a coordinate label is a tool
 * for reading a neighbourhood, and above 1,000 light years a whole multiple carries no
 * reading a user acts on.
 */
export const GRID_LABEL_LEVELS: readonly number[] = [100, 1000];

/**
 * The level the coordinate labels sit on: 100 light years while the 100 light year
 * level's spacing on the screen at the cursor is at least 400 CSS pixels, and 1,000 light
 * years otherwise. At 1,080 CSS rows and a 60 degree vertical field of view that gives
 * 100 light years at a zoom of 233.8 light years and nearer, and 1,000 above it.
 *
 * No other level ever carries a number. From a zoom of about 300 to about 900 light years
 * the level is 1,000 light years, whose crossings sit further apart than the frame is
 * wide, so a cursor away from a crossing sees no coordinate label. The reach rule of
 * `src/app/grid-labels.ts` would take those labels anyway.
 */
export function gridLabelLevel(focalCss: number, distance: number): number {
  const fine = GRID_LABEL_LEVELS[0] as number;
  const coarse = GRID_LABEL_LEVELS[1] as number;
  return gridScreenSpacing(focalCss, distance, fine) >= GRID_LABEL_CSS ? fine : coarse;
}

/**
 * How far each level reaches from the cursor on the plane, in light years, in the order
 * of `GRID_LEVELS`. A level that carries no number takes the lesser of its own
 * `GRID_FADE_LINES * spacing` and `gridZoomReach`, which is the rule `gridDistanceFade`
 * states with a zoom bound over it.
 *
 * The lesser of the two reaches and not the product of the two fades: both are the ramp
 * `1 - r / reach`, so the lesser fade is exactly the fade of the lesser reach, and a
 * product would take a line to nothing well before either reach ended.
 *
 * The level `gridLabelLevel` names is exempt and keeps its own reach. A coordinate label
 * has to sit on a lit line, and the numbered level's crossings are the furthest apart of
 * any that carry a number: at a camera distance of 1,000 light years a cursor at the
 * middle of a cell sits 707 light years from its nearest crossing, against a zoom reach
 * of 400. Cutting that level would leave the frame with lines and no numbers from 234 to
 * 1,768 light years, and again below 177.
 *
 * The work is one reach for each level for each frame, so the shader holds one ramp for
 * each level and the exemption never has to be written in GLSL.
 *
 * `out` is filled and returned when it is given, so the draw path allocates nothing for a
 * frame. A caller that wants a fresh array leaves it out.
 */
export function gridReachPerLevel(
  focalCss: number,
  distance: number,
  out: number[] = new Array<number>(GRID_LEVELS.length),
): number[] {
  const numbered = gridLabelLevel(focalCss, distance);
  const zoom = gridZoomReach(distance);
  for (let level = 0; level < GRID_LEVELS.length; level += 1) {
    const spacing = GRID_LEVELS[level] as number;
    const own = GRID_FADE_LINES * spacing;
    out[level] = spacing === numbered ? own : Math.min(own, zoom);
  }
  return out;
}

/**
 * The camera's own coordinate inside one cell of a level, in `[0, spacing)`. The shader
 * adds the camera-relative plane offset to this phase, so it never forms an absolute
 * coordinate: the galaxy spans 100,000 light years and the finest level is 1 light year
 * apart, which `float32` cannot hold well enough to place a line.
 */
export function gridPhase(coordinate: number, spacing: number): number {
  const rest = coordinate % spacing;
  return rest < 0 ? rest + spacing : rest;
}

/** What one level of the last frame drew, as the browser tests read it. */
export interface GridLevelReading {
  /** The level's spacing in light years. */
  readonly spacingLy: number;
  /** The level's spacing on the screen at the cursor, in CSS pixels. */
  readonly screenCss: number;
  /** The level's width, in CSS pixels. */
  readonly widthCss: number;
  /** The level's alpha at the cursor. */
  readonly alpha: number;
}

/**
 * The reading of every level at a viewport and a zoom distance, in rising spacing. The
 * alpha is the alpha the level draws at, the camera distance band included, so a test
 * that reads an alpha and a pixel compares two readings of one thing.
 */
export function gridLevelReadings(
  focalCss: number,
  distance: number,
): GridLevelReading[] {
  const band = gridVisibility(distance);
  return GRID_LEVELS.map((level) => {
    const screenCss = gridScreenSpacing(focalCss, distance, level);
    return {
      spacingLy: level,
      screenCss,
      widthCss: gridLevelWidth(screenCss),
      alpha: gridLevelAlpha(screenCss) * band,
    };
  });
}

/** What one grid pass draw needs. */
export interface GridPassFrame {
  /** The inverse of the projection and view matrix, with no translation. */
  readonly inverseViewProjection: Float32Array;
  /** The point the camera looks at, in game coordinates. */
  readonly cursor: readonly [number, number, number];
  /** The camera position in game coordinates. */
  readonly camera: readonly [number, number, number];
  /** Device pixels per CSS pixel. */
  readonly pixelRatio: number;
  /** The galaxy model bounds, which the grid stops at. */
  readonly bounds: Range;
  /**
   * The camera distance band, from 0 to 1, which multiplies every level's alpha. The
   * renderer reads it from `gridVisibility` and does not draw at all when it is 0.
   */
  readonly band: number;
  /**
   * How far each level reaches from the cursor on the plane, in light years, in the
   * order of `GRID_LEVELS`. The renderer reads them from `gridReachPerLevel`, so the
   * rule that cuts a level to the zoom lives beside the other two fades and a unit test
   * reads it without a frame.
   */
  readonly reach: readonly number[];
  /**
   * The background reading, a sixteenth of the frame on each axis. The shader samples it
   * with linear filtering, so the merge changes smoothly across the frame.
   */
  readonly background: WebGLTexture;
}

/** The coordinate grid pass. */
export interface GridPass {
  /** Draws the grid in one call and returns how many vertices it issued. */
  draw(frame: GridPassFrame): number;
  dispose(): void;
}

/** Compiles the grid program. */
export function createGridProgram(gl: WebGL2RenderingContext): Program {
  return createProgram(gl, 'grid', vertexSource, fragmentSource, [
    'uInverseViewProjection',
    'uPlaneY',
    'uCursorOffset',
    'uBoundsX',
    'uBoundsZ',
    'uPixelRatio',
    'uColorLight',
    'uColorDeep',
    'uWidthRange',
    'uAlphaRange',
    'uBoldRange',
    'uFadeRange',
    'uBand',
    'uBackground',
    'uMergeRange',
    'uMergeFloor',
    'uSpacing[0]',
    'uPhase[0]',
    'uReach[0]',
  ]);
}

/** Creates the grid pass. The renderer owns the program and its vertex array. */
export function createGridPass(
  gl: WebGL2RenderingContext,
  program: Program,
  vertexArray: WebGLVertexArrayObject,
): GridPass {
  const spacings = new Float32Array(GRID_LEVELS);
  const phases = new Float32Array(GRID_LEVELS.length * 2);
  const reaches = new Float32Array(GRID_LEVELS.length);

  return {
    draw(frame: GridPassFrame): number {
      // The phase of each level is worked out here in `float64`, so the shader adds a
      // small camera-relative offset to a small phase and never a large coordinate.
      for (let level = 0; level < GRID_LEVELS.length; level += 1) {
        const spacing = GRID_LEVELS[level] as number;
        phases[level * 2] = gridPhase(frame.camera[0], spacing);
        phases[level * 2 + 1] = gridPhase(frame.camera[2], spacing);
        reaches[level] = frame.reach[level] as number;
      }

      gl.useProgram(program.program);
      gl.uniformMatrix4fv(
        program.uniforms['uInverseViewProjection'] ?? null,
        false,
        frame.inverseViewProjection,
      );
      // The renderer's world frame has the camera at its origin, so the plane sits at
      // the cursor's height less the camera's.
      gl.uniform1f(
        program.uniforms['uPlaneY'] ?? null,
        frame.cursor[1] - frame.camera[1],
      );
      gl.uniform2f(
        program.uniforms['uCursorOffset'] ?? null,
        frame.cursor[0] - frame.camera[0],
        frame.cursor[2] - frame.camera[2],
      );
      gl.uniform2f(
        program.uniforms['uBoundsX'] ?? null,
        frame.bounds.x[0] - frame.camera[0],
        frame.bounds.x[1] - frame.camera[0],
      );
      gl.uniform2f(
        program.uniforms['uBoundsZ'] ?? null,
        frame.bounds.z[0] - frame.camera[2],
        frame.bounds.z[1] - frame.camera[2],
      );
      gl.uniform1f(program.uniforms['uPixelRatio'] ?? null, frame.pixelRatio);
      gl.uniform3f(
        program.uniforms['uColorLight'] ?? null,
        GRID_COLOR[0] / 255,
        GRID_COLOR[1] / 255,
        GRID_COLOR[2] / 255,
      );
      gl.uniform2f(
        program.uniforms['uWidthRange'] ?? null,
        GRID_MIN_WIDTH_CSS,
        GRID_MAX_WIDTH_CSS,
      );
      gl.uniform2f(
        program.uniforms['uAlphaRange'] ?? null,
        GRID_MIN_ALPHA,
        GRID_MAX_ALPHA,
      );
      gl.uniform2f(
        program.uniforms['uBoldRange'] ?? null,
        GRID_BOLD_LOW_CSS,
        GRID_BOLD_HIGH_CSS,
      );
      gl.uniform2f(
        program.uniforms['uFadeRange'] ?? null,
        GRID_FADE_LOW_CSS,
        GRID_FADE_HIGH_CSS,
      );
      gl.uniform1f(program.uniforms['uBand'] ?? null, frame.band);
      // The merge with the background. The constants live here and the shader is given
      // them, so no second copy of the rule exists.
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, frame.background);
      gl.uniform1i(program.uniforms['uBackground'] ?? null, 0);
      gl.uniform2f(program.uniforms['uMergeRange'] ?? null, GRID_BG_LOW, GRID_BG_HIGH);
      gl.uniform3f(
        program.uniforms['uColorDeep'] ?? null,
        GRID_COLOR_DEEP[0] / 255,
        GRID_COLOR_DEEP[1] / 255,
        GRID_COLOR_DEEP[2] / 255,
      );
      gl.uniform1f(program.uniforms['uMergeFloor'] ?? null, GRID_LINE_MERGE_FLOOR);
      gl.uniform1fv(program.uniforms['uSpacing[0]'] ?? null, spacings);
      gl.uniform2fv(program.uniforms['uPhase[0]'] ?? null, phases);
      // One reach for each level, worked out on the processor. The shader then holds
      // one ramp for each level and neither the zoom bound nor the exemption of the
      // numbered level is written twice.
      gl.uniform1fv(program.uniforms['uReach[0]'] ?? null, reaches);

      // The grid draws over the finished frame, so it blends with alpha and reads no
      // depth. The region boundaries and the markers draw after it, so both cover it.
      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.bindVertexArray(vertexArray);
      gl.drawArrays(gl.TRIANGLES, 0, GRID_VERTEX_COUNT);
      gl.bindVertexArray(null);
      gl.disable(gl.BLEND);
      return GRID_VERTEX_COUNT;
    },
    dispose(): void {
      // The pass holds no buffer of its own: the renderer owns the vertex array the
      // full-screen passes share.
    },
  };
}
