// Draws the galactic codex region boundaries as lines on the galactic plane. The pass
// runs after the tone map, over the finished frame, so it is an overlay and not a
// scene pass: no look constant of the far view changes it, and it changes none of them.
import { toWorldPositions } from './buffers';
import { createProgram } from './program';
import type { Program } from './program';
import type { RegionLines } from '../scene-data/types';
import vertexSource from './shaders/regions.vert?raw';
import fragmentSource from './shaders/regions.frag?raw';

/** The colour of a boundary line. */
export const REGION_LINE_COLOUR: readonly [number, number, number] = [0.6, 0.78, 1];

/** How opaque a boundary line is where the overlay draws in full. */
export const REGION_LINE_OPACITY = 0.55;

/** The zoom distance above which the overlay draws nothing, in light years. */
export const REGION_FADE_IN_FAR = 30000;

/** The zoom distance at and below which the overlay draws in full, in light years. */
export const REGION_FADE_IN_NEAR = 20000;

/** The zoom distance below which the lines fade out, in light years. */
export const REGION_FADE_OUT_FAR = 3000;

/** The zoom distance at and below which the lines draw nothing, in light years. */
export const REGION_FADE_OUT_NEAR = 2000;

function smoothstep(low: number, high: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
}

/**
 * How much of the overlay draws at a zoom distance, 0 to 1. It fades in from 30,000
 * light years and is full at 20,000, and it fades out again from 3,000 and draws
 * nothing at 2,000, because one cell of the region grid then covers more than 15
 * pixels and a boundary reads as a staircase rather than a line.
 */
export function regionFade(distance: number): number {
  const near = 1 - smoothstep(REGION_FADE_IN_NEAR, REGION_FADE_IN_FAR, distance);
  const far = smoothstep(REGION_FADE_OUT_NEAR, REGION_FADE_OUT_FAR, distance);
  return near * far;
}

/** What one region pass draw needs. */
export interface RegionPassFrame {
  /** The combined projection and view matrix, with no translation. */
  readonly viewProjection: Float32Array;
  /** The chunk origin minus the camera position, in the world frame. */
  readonly chunkOffset: readonly [number, number, number];
  /** How much of the overlay draws, 0 to 1. */
  readonly fade: number;
}

/** The region overlay pass. */
export interface RegionPass {
  draw(frame: RegionPassFrame): void;
  /** How many runs the pass draws. */
  readonly count: number;
  dispose(): void;
}

/** Compiles the region program. */
export function createRegionProgram(gl: WebGL2RenderingContext): Program {
  return createProgram(gl, 'regions', vertexSource, fragmentSource, [
    'uViewProjection',
    'uChunkOffset',
    'uColour',
    'uOpacity',
  ]);
}

/**
 * Uploads the boundary set and gives back the pass that draws it. The renderer owns
 * the program and deletes it.
 */
export function createRegionPass(
  gl: WebGL2RenderingContext,
  program: Program,
  lines: RegionLines,
): RegionPass {
  const vertexArray = gl.createVertexArray();
  const buffer = gl.createBuffer();
  if (vertexArray === null || buffer === null) {
    throw new Error('The context gave no buffer for the region boundaries.');
  }

  gl.bindVertexArray(vertexArray);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, toWorldPositions(lines.positions), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);

  return {
    count: lines.count,
    draw(frame: RegionPassFrame): void {
      gl.useProgram(program.program);
      gl.uniformMatrix4fv(
        program.uniforms['uViewProjection'] ?? null,
        false,
        frame.viewProjection,
      );
      gl.uniform3f(
        program.uniforms['uChunkOffset'] ?? null,
        frame.chunkOffset[0],
        frame.chunkOffset[1],
        frame.chunkOffset[2],
      );
      gl.uniform3f(
        program.uniforms['uColour'] ?? null,
        REGION_LINE_COLOUR[0],
        REGION_LINE_COLOUR[1],
        REGION_LINE_COLOUR[2],
      );
      gl.uniform1f(
        program.uniforms['uOpacity'] ?? null,
        REGION_LINE_OPACITY * frame.fade,
      );

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.bindVertexArray(vertexArray);
      gl.drawArrays(gl.LINES, 0, lines.count * 2);
      gl.bindVertexArray(null);
      gl.disable(gl.BLEND);
    },
    dispose(): void {
      gl.deleteBuffer(buffer);
      gl.deleteVertexArray(vertexArray);
    },
  };
}
