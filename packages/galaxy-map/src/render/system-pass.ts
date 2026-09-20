// Draws one marker per real system, as a point sprite over the finished frame.
import {
  MARKER_SIZE_RANGES,
  MARKER_SIZE_VALUES,
  markerCssSize,
  MAX_MARKER_CSS,
  MIN_MARKER_CSS,
} from '../scene-data/marker-size';
import {
  DEFAULT_MARKER_COLOR,
  DEFAULT_MARKER_STYLE,
  DEFAULT_MAX_DRAW_RANGE_LY,
  MAX_SYSTEMS,
} from '../scene-data/real-systems';
import type { MarkerStyle, RealSystemSet } from '../scene-data/real-systems';
import { createProgram } from './program';
import type { Program } from './program';
import { putMarkerAlpha } from './shader-include';
import vertexSource from './shaders/systems.vert?raw';
import fragmentSource from './shaders/systems.frag?raw';
import rangeFragmentSource from './shaders/marker-range.frag?raw';
import markerAlphaSource from './shaders/marker-alpha.glsl?raw';

/**
 * The colour of the ring around a marker. It is fixed and dark, so the disc holds a
 * readable edge over the cream core of the galaxy and over dark space alike. The
 * fragment shader carries the same three numbers.
 */
export const RING_COLOR: readonly [number, number, number] = [0.02, 0.04, 0.1];

/** The width of the ring, in CSS pixels. */
export const RING_CSS_PIXELS = 2;

/**
 * The sprite of a glow, as a multiple of the disc diameter. The two styles grow together
 * and stop together, so one set of constants sets both.
 */
export const GLOW_SIZE_FACTOR = 2.5;

// The marker size rule moved to `src/scene-data/marker-size.ts`, because the pick and
// the overlay marks need it and neither may import the renderer. The pass re-exports the
// names, so a reader of the pass still finds them here.
export {
  MARKER_SIZE_RANGES,
  MARKER_SIZE_VALUES,
  markerCssSize,
  MAX_MARKER_CSS,
  MIN_MARKER_CSS,
};

/** The number the `disc` style carries in the attribute buffer. */
export const STYLE_DISC = 0;

/** The number the `glow` style carries in the attribute buffer. */
export const STYLE_GLOW = 1;

/** The half-width of a spike, in CSS pixels. */
const SPIKE_HALF_WIDTH_CSS = 1;

/** The height of a spike at the centre of the sprite. */
const SPIKE_PEAK = 0.55;

/** The height of the halo at the centre of the sprite. */
const HALO_PEAK = 0.85;

/** The radius the core holds at 1, in CSS pixels, and the radius it reaches 0 at. */
const CORE_PLATEAU_CSS = 1;
const CORE_EDGE_CSS = 2.5;

/**
 * The diameter of the sprite of a marker in CSS pixels. A disc is the marker itself; a
 * glow is 2.5 times as wide, because its halo carries light past the disc the same rule
 * gives it.
 */
export function markerSpriteCssSize(range: number, style: MarkerStyle): number {
  const disc = markerCssSize(range);
  return style === 'glow' ? disc * GLOW_SIZE_FACTOR : disc;
}

/**
 * The sprite size the pass asks the card for, in device pixels. The cap is the card's own
 * maximum point size from `ALIASED_POINT_SIZE_RANGE`: a 40 CSS pixel glow at a device
 * pixel ratio of 3 asks for 120 device pixels, so a card that reports less must cap here
 * rather than let the driver decide. The vertex shader holds the same rule.
 */
export function markerPointSize(
  spriteCss: number,
  pixelRatio: number,
  maxPointSize: number,
): number {
  return Math.min(spriteCss * pixelRatio, maxPointSize);
}

/**
 * The alpha of a glow at an offset from the sprite centre, in CSS pixels, for a sprite of
 * the radius `radiusCss`. The fragment shader carries the same rule, as `starBrightness`
 * carries the rule of `stars.vert`, so a unit test reads it at its own resolution and not
 * at the resolution of a screenshot.
 *
 * The alpha is `min(1, spikes + max(core, halo))`. The core is the larger of two terms and
 * not a separate opaque disc: an opaque disc joined to the halo would drop 0.35 at the cap
 * size in one device pixel, which draws a hard-edged disc inside the glow.
 */
export function glowAlpha(x: number, y: number, radiusCss: number): number {
  const radius = Math.max(radiusCss, 1e-6);
  const r = Math.hypot(x, y);
  const fall = Math.max(0, 1 - r / radius);
  const halo = HALO_PEAK * fall * fall * fall;
  const core = Math.min(
    1,
    Math.max(0, (CORE_EDGE_CSS - r) / (CORE_EDGE_CSS - CORE_PLATEAU_CSS)),
  );
  const spike = (along: number, across: number): number => {
    const width = Math.max(0, 1 - Math.abs(across) / SPIKE_HALF_WIDTH_CSS);
    const reach = Math.max(0, 1 - Math.abs(along) / radius);
    return SPIKE_PEAK * width * reach * reach;
  };
  const spikes = spike(x, y) + spike(y, x);
  return Math.min(1, spikes + Math.max(core, halo));
}

/**
 * The alpha of a disc at a distance from the middle of its sprite, in device pixels, for
 * a sprite of the radius `radius`. A disc is opaque but for the outer device pixel, whose
 * ramp gives it a smooth edge. `marker-alpha.glsl` carries the same rule.
 */
export function discAlpha(distance: number, radius: number): number {
  return Math.min(1, Math.max(0, radius - distance));
}

/**
 * The alpha of a marker of either style at an offset from the middle of its sprite. The
 * offset and the radius are in device pixels, as they are in the shader, and the glow
 * rule reads CSS pixels, so this divides by the pixel ratio for a glow. It is the
 * `markerAlpha` of `marker-alpha.glsl`, which both marker shaders read.
 */
export function markerAlpha(
  offsetX: number,
  offsetY: number,
  radius: number,
  style: MarkerStyle,
  pixelRatio: number,
): number {
  if (style === 'glow') {
    return glowAlpha(offsetX / pixelRatio, offsetY / pixelRatio, radius / pixelRatio);
  }
  return discAlpha(Math.hypot(offsetX, offsetY), radius);
}

/**
 * The alpha a marker fragment must hold to write its range. The part of the sprite at or
 * above it is the marker **body**, which is the part the user reads as the marker and the
 * part a sphere and a line do not take off the screen. `marker-range.frag` holds the same
 * number as `BODY_ALPHA`.
 */
export const MARKER_BODY_ALPHA = 0.5;

/**
 * Puts the shared alpha rule into a marker fragment shader. The colour shader and the
 * range shader must give the same answer, so both read one file and neither holds a copy.
 * `shader-include.ts` holds the rule itself, so a caller that reads the shader files
 * itself composes what this pass compiles.
 */
export function withMarkerAlpha(source: string): string {
  return putMarkerAlpha(source, markerAlphaSource);
}

/**
 * Subtracts the camera position from every system position in `float64` and writes the
 * offset as a `float32`. The third axis runs the other way, because the world frame the
 * shaders draw in has its third axis opposite to the game's.
 *
 * With `styleRanges` it also counts the markers the frame draws, against the cursor
 * offset in that same world frame. The count is the page's reading of the shader's cut,
 * so the two measure from the same point.
 */
export function rebasePositions(
  positions: Float64Array,
  count: number,
  camera: readonly [number, number, number],
  cursorOffset: readonly [number, number, number],
  out: Float32Array,
  styleRanges?: Float32Array,
): number {
  let drawn = 0;
  for (let index = 0; index < count; index += 1) {
    const base = index * 3;
    const x = (positions[base] as number) - camera[0];
    const y = (positions[base + 1] as number) - camera[1];
    const z = camera[2] - (positions[base + 2] as number);
    out[base] = x;
    out[base + 1] = y;
    out[base + 2] = z;
    if (styleRanges === undefined) {
      drawn += 1;
      continue;
    }
    // The count the page reports is the drawn count, and the shader cannot report it.
    // This loop already walks every position, so it compares the squared range against
    // the squared limit here: one multiply and one compare per marker, and no square
    // root. It reads the offset back out of `out`, because the shader reads the same
    // `float32` values and not the `float64` difference. The two can still disagree for
    // a system whose range sits within one `float32` step of its limit, which is 0.0078
    // light years at 120,000, because the shader rounds the sum and the square root as
    // well. No marker is near enough its limit for that to show.
    // A range of 0 is the marker the category switch or the name filter took off. The
    // guard is what keeps a system that sits exactly at the camera out of the count,
    // which a squared compare against 0 would let in.
    const limit = styleRanges[index * 2 + 1] as number;
    if (limit <= 0) continue;
    // The cut measures from the cursor, as the shader does. The size still measures from
    // the camera, and that reading is the offset itself.
    const fx = (out[base] as number) - cursorOffset[0];
    const fy = (out[base + 1] as number) - cursorOffset[1];
    const fz = (out[base + 2] as number) - cursorOffset[2];
    if (fx * fx + fy * fy + fz * fz <= limit * limit) drawn += 1;
  }
  return drawn;
}

/**
 * Writes the core colour of every marker, as the category colour over 255. A marker
 * takes the colour of its category as the category stands when the frame draws, so the
 * set never copies a colour into a record.
 */
export function buildMarkerColors(set: RealSystemSet, out: Float32Array): void {
  const indices = set.categoryIndices;
  for (let index = 0; index < set.count; index += 1) {
    const category = set.category(indices[index] as number);
    // A set with no category answers with its internal row, so the fallback here is
    // reached only by an index the set never writes.
    const colour = category === null ? DEFAULT_MARKER_COLOR : category.color;
    const base = index * 3;
    out[base] = (colour[0] as number) / 255;
    out[base + 1] = (colour[1] as number) / 255;
    out[base + 2] = (colour[2] as number) / 255;
  }
}

/**
 * Writes the style and the draw range of every marker, as the number the shaders read and
 * the range in light years. Both come from the category table, which changes exactly when
 * `categoryVersion` changes, so they ride the same cache as the colours.
 *
 * A marker whose category is off, or whose name the filter drops, takes a range of 0.
 * The shader's own range cut then removes it, so the switch and the filter need no
 * second attribute and no rewrite of the position buffer.
 */
export function buildMarkerStyleRanges(set: RealSystemSet, out: Float32Array): void {
  const indices = set.categoryIndices;
  const flags = set.markerFlags;
  for (let index = 0; index < set.count; index += 1) {
    const category = set.category(indices[index] as number);
    const style = category === null ? DEFAULT_MARKER_STYLE : category.markerStyle;
    const range = category === null ? DEFAULT_MAX_DRAW_RANGE_LY : category.maxDrawRange;
    const base = index * 2;
    out[base] = style === 'disc' ? STYLE_DISC : STYLE_GLOW;
    out[base + 1] = flags[index] === 1 ? range : 0;
  }
}

/** What one marker pass draw needs. */
export interface SystemPassFrame {
  /** The combined projection and view matrix, with no translation. */
  readonly viewProjection: Float32Array;
  /** The camera position in game coordinates. */
  readonly camera: readonly [number, number, number];
  /**
   * The cursor in the camera-relative world frame the offsets use, in light years. The
   * draw-range cut measures from it. `grid-pass.ts` works out an offset of its own from
   * the cursor and the camera, but that is a different pass and a different frame: this
   * one runs its third axis the other way, as `rebasePositions` does.
   */
  readonly cursorOffset: readonly [number, number, number];
  /** Device pixels per CSS pixel. */
  readonly pixelRatio: number;
  /** The set to draw. */
  readonly set: RealSystemSet;
  /**
   * The range buffer to write the marker bodies into, or null where the map holds none.
   * The renderer clears it before the pass draws, and it makes the draw only while a
   * sphere draws, so a map with no sphere costs what it costs without the buffer.
   */
  readonly range: WebGLFramebuffer | null;
}

/** The marker pass. */
export interface SystemPass {
  /** Draws the whole set in one call and returns how many markers it drew. */
  draw(frame: SystemPassFrame): number;
  /**
   * How many draw calls the last draw made: one for the colours, and one more for the
   * range buffer in a frame that writes it.
   */
  drawCalls(): number;
  dispose(): void;
}

/** The uniforms both marker programs take. The vertex shader is one file for both. */
const MARKER_UNIFORMS = [
  'uViewProjection',
  'uCursorOffset',
  'uSizeRanges',
  'uSizeValues',
  'uPixelRatio',
  'uRingCss',
  'uGlowFactor',
  'uMaxPointSize',
] as const;

/** Compiles the marker colour program. */
export function createSystemProgram(gl: WebGL2RenderingContext): Program {
  return createProgram(
    gl,
    'systems',
    vertexSource,
    withMarkerAlpha(fragmentSource),
    MARKER_UNIFORMS,
  );
}

/**
 * Compiles the marker range program. It shares the vertex shader with the colour program,
 * so the two draws size and cut the sprites by one rule.
 */
export function createMarkerRangeProgram(gl: WebGL2RenderingContext): Program {
  return createProgram(
    gl,
    'marker-range',
    vertexSource,
    withMarkerAlpha(rangeFragmentSource),
    MARKER_UNIFORMS,
  );
}

/**
 * Creates the marker pass and its two buffers. The renderer owns the program and
 * deletes it.
 */
export function createSystemPass(
  gl: WebGL2RenderingContext,
  program: Program,
  rangeProgram: Program | null,
): SystemPass {
  const vertexArray = gl.createVertexArray();
  const positionBuffer = gl.createBuffer();
  const colorBuffer = gl.createBuffer();
  const styleRangeBuffer = gl.createBuffer();
  if (
    vertexArray === null ||
    positionBuffer === null ||
    colorBuffer === null ||
    styleRangeBuffer === null
  ) {
    throw new Error('The context gave no buffer for the markers.');
  }

  const offsets = new Float32Array(MAX_SYSTEMS * 3);
  const colors = new Float32Array(MAX_SYSTEMS * 3);
  const styleRanges = new Float32Array(MAX_SYSTEMS * 2);
  // -1 is no version, so the first frame with a system in the set builds the colours.
  let colorVersion = -1;
  let categoryVersion = -1;

  // The largest sprite the card draws. A 40 CSS pixel glow at a device pixel ratio of 3
  // asks for 120 device pixels, so a card that reports less caps the sprite here.
  const sizeRange = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE) as
    Float32Array | null | undefined;
  const maxPointSize =
    sizeRange === null || sizeRange === undefined
      ? Number.POSITIVE_INFINITY
      : (sizeRange[1] as number);

  gl.bindVertexArray(vertexArray);
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, offsets.byteLength, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, colors.byteLength, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, styleRangeBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, styleRanges.byteLength, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 0, 0);

  gl.bindVertexArray(null);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);

  let calls = 0;

  /**
   * Writes the uniforms one of the two programs takes. Both draws read the same buffer
   * through the same vertex shader, so both take the same values.
   */
  const writeUniforms = (target: Program, frame: SystemPassFrame): void => {
    gl.useProgram(target.program);
    gl.uniformMatrix4fv(
      target.uniforms['uViewProjection'] ?? null,
      false,
      frame.viewProjection,
    );
    // The stop table goes to the shader as two vectors, so one edit of the table in
    // `marker-size.ts` changes the shader as well and there is no second copy of the
    // numbers.
    gl.uniform4f(
      target.uniforms['uSizeRanges'] ?? null,
      MARKER_SIZE_RANGES[0],
      MARKER_SIZE_RANGES[1],
      MARKER_SIZE_RANGES[2],
      MARKER_SIZE_RANGES[3],
    );
    gl.uniform4f(
      target.uniforms['uSizeValues'] ?? null,
      MARKER_SIZE_VALUES[0],
      MARKER_SIZE_VALUES[1],
      MARKER_SIZE_VALUES[2],
      MARKER_SIZE_VALUES[3],
    );
    gl.uniform3f(
      target.uniforms['uCursorOffset'] ?? null,
      frame.cursorOffset[0],
      frame.cursorOffset[1],
      frame.cursorOffset[2],
    );
    gl.uniform1f(target.uniforms['uPixelRatio'] ?? null, frame.pixelRatio);
    gl.uniform1f(target.uniforms['uRingCss'] ?? null, RING_CSS_PIXELS);
    gl.uniform1f(target.uniforms['uGlowFactor'] ?? null, GLOW_SIZE_FACTOR);
    gl.uniform1f(target.uniforms['uMaxPointSize'] ?? null, maxPointSize);
  };

  return {
    drawCalls(): number {
      return calls;
    },
    draw(frame: SystemPassFrame): number {
      calls = 0;
      const count = frame.set.count;
      if (count === 0) return 0;

      // The colours, the styles and the ranges follow the set and the category table
      // alone, so a frame that changes neither writes none of them. The styles and the
      // ranges are built before the rebase, because the rebase reads the ranges to count
      // the markers that draw.
      if (
        colorVersion !== frame.set.version ||
        categoryVersion !== frame.set.categoryVersion
      ) {
        buildMarkerColors(frame.set, colors);
        gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, colors, 0, count * 3);
        buildMarkerStyleRanges(frame.set, styleRanges);
        gl.bindBuffer(gl.ARRAY_BUFFER, styleRangeBuffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, styleRanges, 0, count * 2);
        colorVersion = frame.set.version;
        categoryVersion = frame.set.categoryVersion;
      }

      const drawn = rebasePositions(
        frame.set.positions,
        count,
        frame.camera,
        frame.cursorOffset,
        offsets,
        styleRanges,
      );
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, offsets, 0, count * 3);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);

      writeUniforms(program, frame);

      // The pass draws over the finished frame, so it blends with alpha and reads no
      // depth. The order of the draw is the order the set holds, so two markers that
      // overlap blend in a fixed order.
      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.bindVertexArray(vertexArray);
      gl.drawArrays(gl.POINTS, 0, count);
      gl.bindVertexArray(null);
      gl.disable(gl.BLEND);
      calls += 1;

      // The second draw writes the range of every marker body into the range buffer, so
      // the shape pass can read what lies in front of it. It is the same geometry through
      // the same vertex shader, with a fragment shader that writes one float and no
      // colour. The MIN equation leaves the nearest marker in each pixel, whatever order
      // the set holds.
      if (frame.range !== null && rangeProgram !== null) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, frame.range);
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        writeUniforms(rangeProgram, frame);
        gl.enable(gl.BLEND);
        gl.blendEquation(gl.MIN);
        gl.bindVertexArray(vertexArray);
        gl.drawArrays(gl.POINTS, 0, count);
        gl.bindVertexArray(null);
        gl.blendEquation(gl.FUNC_ADD);
        gl.disable(gl.BLEND);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        calls += 1;
      }

      // The colour draw covers the whole set in one call, because the range cut runs in
      // the vertex shader. The count the page reads is the number the cut kept.
      return drawn;
    },
    dispose(): void {
      gl.deleteBuffer(positionBuffer);
      gl.deleteBuffer(colorBuffer);
      gl.deleteBuffer(styleRangeBuffer);
      gl.deleteVertexArray(vertexArray);
    },
  };
}
