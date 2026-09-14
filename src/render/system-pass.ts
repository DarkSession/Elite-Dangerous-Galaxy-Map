// Draws one marker per real system, as a point sprite over the finished frame.
import { MAX_SYSTEMS } from '../scene-data/real-systems';
import type { RealSystemSet } from '../scene-data/real-systems';
import { createProgram } from './program';
import type { Program } from './program';
import vertexSource from './shaders/systems.vert?raw';
import fragmentSource from './shaders/systems.frag?raw';

/**
 * The colour of the ring around a marker. It is fixed and dark, so the disc holds a
 * readable edge over the cream core of the galaxy and over dark space alike. The
 * fragment shader carries the same three numbers.
 */
export const RING_COLOR: readonly [number, number, number] = [0.02, 0.04, 0.1];

/** The width of the ring, in CSS pixels. */
export const RING_CSS_PIXELS = 2;

/** The size of a marker in light years, before the floor and the cap. */
export const MARKER_SIZE_LY = 20;

/** The smallest diameter of a marker, in CSS pixels. */
export const MIN_MARKER_CSS = 7;

/** The largest diameter of a marker, in CSS pixels. */
export const MAX_MARKER_CSS = 12;

/** The colour a marker draws in when its category index names no category. */
const FALLBACK_COLOR: readonly [number, number, number] = [1, 1, 1];

/**
 * The diameter of a marker in CSS pixels at a range, after the floor and the cap.
 * `focalCss` is the CSS pixels per light year at one light year of range.
 */
export function markerCssSize(focalCss: number, range: number): number {
  const wanted = (focalCss * MARKER_SIZE_LY) / Math.max(range, 1);
  return Math.min(MAX_MARKER_CSS, Math.max(MIN_MARKER_CSS, wanted));
}

/**
 * Subtracts the camera position from every system position in `float64` and writes the
 * offset as a `float32`. The third axis runs the other way, because the world frame the
 * shaders draw in has its third axis opposite to the game's.
 */
export function rebasePositions(
  positions: Float64Array,
  count: number,
  camera: readonly [number, number, number],
  out: Float32Array,
): void {
  for (let index = 0; index < count; index += 1) {
    const base = index * 3;
    out[base] = (positions[base] as number) - camera[0];
    out[base + 1] = (positions[base + 1] as number) - camera[1];
    out[base + 2] = camera[2] - (positions[base + 2] as number);
  }
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
    const colour = category === null ? FALLBACK_COLOR : category.color;
    const base = index * 3;
    out[base] = (colour[0] as number) / 255;
    out[base + 1] = (colour[1] as number) / 255;
    out[base + 2] = (colour[2] as number) / 255;
  }
}

/** What one marker pass draw needs. */
export interface SystemPassFrame {
  /** The combined projection and view matrix, with no translation. */
  readonly viewProjection: Float32Array;
  /** The camera position in game coordinates. */
  readonly camera: readonly [number, number, number];
  /** Device pixels per light year at one light year of range. */
  readonly focal: number;
  /** Device pixels per CSS pixel. */
  readonly pixelRatio: number;
  /** The set to draw. */
  readonly set: RealSystemSet;
}

/** The marker pass. */
export interface SystemPass {
  /** Draws the whole set in one call and returns how many markers it drew. */
  draw(frame: SystemPassFrame): number;
  dispose(): void;
}

/** Compiles the marker program. */
export function createSystemProgram(gl: WebGL2RenderingContext): Program {
  return createProgram(gl, 'systems', vertexSource, fragmentSource, [
    'uViewProjection',
    'uScale',
    'uLimits',
    'uPixelRatio',
    'uRingCss',
  ]);
}

/**
 * Creates the marker pass and its two buffers. The renderer owns the program and
 * deletes it.
 */
export function createSystemPass(
  gl: WebGL2RenderingContext,
  program: Program,
): SystemPass {
  const vertexArray = gl.createVertexArray();
  const positionBuffer = gl.createBuffer();
  const colorBuffer = gl.createBuffer();
  if (vertexArray === null || positionBuffer === null || colorBuffer === null) {
    throw new Error('The context gave no buffer for the markers.');
  }

  const offsets = new Float32Array(MAX_SYSTEMS * 3);
  const colors = new Float32Array(MAX_SYSTEMS * 3);
  // -1 is no version, so the first frame with a system in the set builds the colours.
  let colorVersion = -1;
  let categoryVersion = -1;

  gl.bindVertexArray(vertexArray);
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, offsets.byteLength, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, colors.byteLength, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);

  gl.bindVertexArray(null);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);

  return {
    draw(frame: SystemPassFrame): number {
      const count = frame.set.count;
      if (count === 0) return 0;

      rebasePositions(frame.set.positions, count, frame.camera, offsets);
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, offsets, 0, count * 3);

      // The colours follow the set and the category table alone, so a frame that
      // changes neither writes no colour.
      if (
        colorVersion !== frame.set.version ||
        categoryVersion !== frame.set.categoryVersion
      ) {
        buildMarkerColors(frame.set, colors);
        gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, colors, 0, count * 3);
        colorVersion = frame.set.version;
        categoryVersion = frame.set.categoryVersion;
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, null);

      const focalCss = frame.focal / frame.pixelRatio;
      gl.useProgram(program.program);
      gl.uniformMatrix4fv(
        program.uniforms['uViewProjection'] ?? null,
        false,
        frame.viewProjection,
      );
      gl.uniform1f(program.uniforms['uScale'] ?? null, focalCss * MARKER_SIZE_LY);
      gl.uniform2f(program.uniforms['uLimits'] ?? null, MIN_MARKER_CSS, MAX_MARKER_CSS);
      gl.uniform1f(program.uniforms['uPixelRatio'] ?? null, frame.pixelRatio);
      gl.uniform1f(program.uniforms['uRingCss'] ?? null, RING_CSS_PIXELS);

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
      return count;
    },
    dispose(): void {
      gl.deleteBuffer(positionBuffer);
      gl.deleteBuffer(colorBuffer);
      gl.deleteVertexArray(vertexArray);
    },
  };
}
