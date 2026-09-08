// Draws the point cloud as additive point sprites.
import { createPointBuffers } from './buffers';
import type { PointBuffers } from './buffers';
import { createProgram } from './program';
import type { Program } from './program';
import type { PointCloud } from '../scene-data/types';
import vertexSource from './shaders/points.vert?raw';
import fragmentSource from './shaders/points.frag?raw';

/** How large a sample looks, in light years, before the pixel clamp. */
export const POINT_RADIUS_LY = 12;

/** What one point pass draw needs. */
export interface PointPassFrame {
  /** The combined projection and view matrix, with no translation. */
  readonly viewProjection: Float32Array;
  /** The chunk origin minus the camera position, in the world frame. */
  readonly chunkOffset: readonly [number, number, number];
  /** Pixels per light year at one light year of range. */
  readonly pointScale: number;
  /** The brightness of one sample. */
  readonly brightness: number;
}

/** The point pass. */
export interface PointPass {
  draw(frame: PointPassFrame): void;
  /** The buffers the cloud pass draws the same samples from. */
  readonly buffers: PointBuffers;
  dispose(): void;
}

/** Compiles the point program. Call it before the cloud arrives. */
export function createPointProgram(gl: WebGL2RenderingContext): Program {
  return createProgram(gl, 'points', vertexSource, fragmentSource, [
    'uViewProjection',
    'uChunkOffset',
    'uPointScale',
    'uBrightness',
  ]);
}

/** Uploads the cloud and gives back the pass that draws it. The renderer owns the
 * program and deletes it. */
export function createPointPass(
  gl: WebGL2RenderingContext,
  program: Program,
  cloud: PointCloud,
): PointPass {
  const buffers: PointBuffers = createPointBuffers(gl, cloud);

  return {
    buffers,
    draw(frame: PointPassFrame): void {
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
      gl.uniform1f(program.uniforms['uPointScale'] ?? null, frame.pointScale);
      gl.uniform1f(program.uniforms['uBrightness'] ?? null, frame.brightness);

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.bindVertexArray(buffers.vertexArray);
      gl.drawArrays(gl.POINTS, 0, buffers.count);
      gl.bindVertexArray(null);
      gl.disable(gl.BLEND);
    },
    dispose(): void {
      buffers.dispose();
    },
  };
}
