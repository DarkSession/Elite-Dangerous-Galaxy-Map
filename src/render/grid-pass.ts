// Draws a coordinate grid on the galactic plane, at `y = 0` in game coordinates. The
// line count is fixed, so the vertex count is the same at every zoom and the pass needs
// no buffer that survives a camera move.
import type { Range } from '../galaxy-model/types';
import { createProgram } from './program';
import type { Program } from './program';
import vertexSource from './shaders/grid.vert?raw';
import fragmentSource from './shaders/grid.frag?raw';

/** How many lines the grid draws on each axis. */
export const GRID_LINES_PER_AXIS = 129;

/** How many lines sit on each side of the middle one. */
export const GRID_HALF_LINES = (GRID_LINES_PER_AXIS - 1) / 2;

/** The largest number of vertices one draw of the grid issues. */
export const GRID_MAX_VERTICES = GRID_LINES_PER_AXIS * 2 * 2;

/** The smallest spacing the grid draws on the screen, in CSS pixels. */
export const GRID_MIN_CSS = 40;

/** The steps of the 1-2-5 sequence the spacing follows. */
const GRID_STEPS = [1, 2, 5];

/** The smallest spacing of the sequence, in light years. */
export const GRID_MIN_SPACING_LY = 1;

/** The largest spacing of the sequence, in light years. */
export const GRID_MAX_SPACING_LY = 100000;

/** How many spacings from the cursor a line reaches an alpha of 0. */
export const GRID_FADE_SPACINGS = 64;

/** The colour of a grid line, red, green and blue from 0 to 255. */
export const GRID_COLOR: readonly [number, number, number] = [255, 154, 60];

/** The alpha of an ordinary line. */
export const GRID_MINOR_ALPHA = 0.1;

/** The alpha of every fifth line from the middle, so the user can count. */
export const GRID_MAJOR_ALPHA = 0.2;

/** How often a line takes the brighter alpha. */
export const GRID_MAJOR_EVERY = 5;

/**
 * The spacing of the grid at a zoom distance, in light years. It is the smallest value
 * of the sequence 1, 2, 5, 10, 20, 50 and so on, from 1 to 100,000, whose spacing on the
 * screen at the cursor is at least 40 CSS pixels.
 *
 * The sequence steps by 2 or by 2.5, so the chosen spacing on the screen lies in 40 to
 * 100 CSS pixels at every zoom distance the map draws. The grid therefore never reads as
 * a wash of lines and never shows one line alone.
 *
 * The sequence starts at 1 light year and not at 10. At the closest zoom of 10 light
 * years and 1,080 CSS rows a spacing of 10 would put its lines 935 CSS pixels apart,
 * which is one line on the screen.
 */
export function gridSpacing(focalCss: number, distance: number): number {
  const wanted = (GRID_MIN_CSS * distance) / Math.max(focalCss, 1e-6);
  for (let power = 0; ; power += 1) {
    for (const step of GRID_STEPS) {
      const value = step * 10 ** power;
      if (value >= GRID_MAX_SPACING_LY) return GRID_MAX_SPACING_LY;
      if (value >= wanted) return value;
    }
  }
}

/** The spacing of the grid on the screen at the cursor, in CSS pixels. */
export function gridScreenSpacing(
  focalCss: number,
  distance: number,
  spacing: number,
): number {
  return (focalCss * spacing) / distance;
}

/** The middle line of an axis: the multiple of the spacing nearest a coordinate. */
export function gridCentreLine(coordinate: number, spacing: number): number {
  return Math.round(coordinate / spacing) * spacing;
}

/** What one grid build writes. */
export interface GridVertices {
  /** The camera-relative offset of every vertex, three floats each. */
  readonly offsets: Float32Array;
  /** The plane offset in spacings and the fifth-line flag, three floats each. */
  readonly planes: Float32Array;
  /** How many vertices the build wrote. */
  readonly count: number;
}

/**
 * Writes the line ends of the grid into the two buffers the caller holds. The lines run
 * along the `x` and the `z` axes of the game frame at `y = 0`, 129 on each axis, centred
 * on the cursor. A line that lies outside the galaxy model bounds on its own axis is
 * left out, and every line stops at the bounds on the axis it runs along.
 *
 * The subtraction of the camera runs in `float64`, by the camera-relative rule, and the
 * result is written as a `float32`. 516 vertices is small enough to rebuild every frame.
 */
export function buildGridVertices(
  cursor: readonly [number, number, number],
  camera: readonly [number, number, number],
  spacing: number,
  bounds: Range,
  offsets: Float32Array,
  planes: Float32Array,
): number {
  const centreX = gridCentreLine(cursor[0], spacing);
  const centreZ = gridCentreLine(cursor[2], spacing);
  const reach = GRID_HALF_LINES * spacing;
  const lowX = Math.max(bounds.x[0], centreX - reach);
  const highX = Math.min(bounds.x[1], centreX + reach);
  const lowZ = Math.max(bounds.z[0], centreZ - reach);
  const highZ = Math.min(bounds.z[1], centreZ + reach);

  let vertices = 0;
  const write = (x: number, z: number, major: boolean): void => {
    const base = vertices * 3;
    offsets[base] = x - camera[0];
    offsets[base + 1] = -camera[1];
    // The renderer's world frame runs its third axis the other way to the game's.
    offsets[base + 2] = camera[2] - z;
    planes[base] = (x - cursor[0]) / spacing;
    planes[base + 1] = (z - cursor[2]) / spacing;
    planes[base + 2] = major ? 1 : 0;
    vertices += 1;
  };

  if (highX >= lowX && highZ >= lowZ) {
    for (let step = -GRID_HALF_LINES; step <= GRID_HALF_LINES; step += 1) {
      const major = step % GRID_MAJOR_EVERY === 0;
      const x = centreX + step * spacing;
      if (x >= bounds.x[0] && x <= bounds.x[1]) {
        write(x, lowZ, major);
        write(x, highZ, major);
      }
      const z = centreZ + step * spacing;
      if (z >= bounds.z[0] && z <= bounds.z[1]) {
        write(lowX, z, major);
        write(highX, z, major);
      }
    }
  }
  return vertices;
}

/** What one grid pass draw needs. */
export interface GridPassFrame {
  /** The combined projection and view matrix, with no translation. */
  readonly viewProjection: Float32Array;
  /** The point the camera looks at, in game coordinates. */
  readonly cursor: readonly [number, number, number];
  /** The camera position in game coordinates. */
  readonly camera: readonly [number, number, number];
  /** The spacing of the grid in light years. */
  readonly spacing: number;
  /** The galaxy model bounds, which the grid stops at. */
  readonly bounds: Range;
}

/** The coordinate grid pass. */
export interface GridPass {
  /** Draws the grid in one call and returns how many vertices it issued. */
  draw(frame: GridPassFrame): number;
  /**
   * The plane offsets of the vertices the last draw issued, three floats each: the
   * offset from the cursor in spacings on `x` and on `z`, and 1 on every fifth line. The
   * browser tests read the drawn lines from it.
   */
  lastPlanes(): Float32Array;
  /**
   * Clears the reading for a frame the grid does not draw in. The renderer calls it
   * when the switch is off, so `lastPlanes` and the vertex count agree.
   */
  skip(): void;
  dispose(): void;
}

/** Compiles the grid program. */
export function createGridProgram(gl: WebGL2RenderingContext): Program {
  return createProgram(gl, 'grid', vertexSource, fragmentSource, [
    'uViewProjection',
    'uColor',
    'uAlphas',
    'uFadeSpacings',
  ]);
}

/** Creates the grid pass and its two buffers. The renderer owns the program. */
export function createGridPass(gl: WebGL2RenderingContext, program: Program): GridPass {
  const vertexArray = gl.createVertexArray();
  const offsetBuffer = gl.createBuffer();
  const planeBuffer = gl.createBuffer();
  if (vertexArray === null || offsetBuffer === null || planeBuffer === null) {
    throw new Error('The context gave no buffer for the grid.');
  }

  const offsets = new Float32Array(GRID_MAX_VERTICES * 3);
  const planes = new Float32Array(GRID_MAX_VERTICES * 3);

  gl.bindVertexArray(vertexArray);
  gl.bindBuffer(gl.ARRAY_BUFFER, offsetBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, offsets.byteLength, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, planeBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, planes.byteLength, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);

  gl.bindVertexArray(null);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);

  let drawn = 0;

  return {
    draw(frame: GridPassFrame): number {
      const count = buildGridVertices(
        frame.cursor,
        frame.camera,
        frame.spacing,
        frame.bounds,
        offsets,
        planes,
      );
      drawn = count;
      if (count === 0) return 0;

      gl.bindBuffer(gl.ARRAY_BUFFER, offsetBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, offsets, 0, count * 3);
      gl.bindBuffer(gl.ARRAY_BUFFER, planeBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, planes, 0, count * 3);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);

      gl.useProgram(program.program);
      gl.uniformMatrix4fv(
        program.uniforms['uViewProjection'] ?? null,
        false,
        frame.viewProjection,
      );
      gl.uniform3f(
        program.uniforms['uColor'] ?? null,
        GRID_COLOR[0] / 255,
        GRID_COLOR[1] / 255,
        GRID_COLOR[2] / 255,
      );
      gl.uniform2f(
        program.uniforms['uAlphas'] ?? null,
        GRID_MINOR_ALPHA,
        GRID_MAJOR_ALPHA,
      );
      gl.uniform1f(program.uniforms['uFadeSpacings'] ?? null, GRID_FADE_SPACINGS);

      // The grid draws over the finished frame, so it blends with alpha and reads no
      // depth. A line is one device pixel wide, which is the width a card draws a line
      // in. The region boundaries and the markers draw after it, so both cover it.
      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.lineWidth(1);
      gl.bindVertexArray(vertexArray);
      gl.drawArrays(gl.LINES, 0, count);
      gl.bindVertexArray(null);
      gl.disable(gl.BLEND);
      drawn = count;
      return count;
    },
    lastPlanes(): Float32Array {
      return planes.subarray(0, drawn * 3);
    },
    skip(): void {
      drawn = 0;
    },
    dispose(): void {
      gl.deleteBuffer(offsetBuffer);
      gl.deleteBuffer(planeBuffer);
      gl.deleteVertexArray(vertexArray);
    },
  };
}
