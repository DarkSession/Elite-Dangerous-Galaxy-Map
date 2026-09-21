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

/**
 * The brightness of one point cloud sample. The points carry a large share of the
 * light in the disc, which is what gives the disc its grain.
 */
export const DEFAULT_POINT_BRIGHTNESS = 60;

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
  /** The weight of the star field's handover, 0 to 1. */
  readonly handoverWeight: number;
  /** The inner and the outer radius of the handover fade, in light years. */
  readonly handover: readonly [number, number];
  /**
   * The accumulated nebula transmittance of this frame, or null for a frame that drew
   * no record. A sprite behind a nebula is multiplied by it.
   */
  readonly nebulaTransmittance: WebGLTexture | null;
  /**
   * The front range and the centre range of the record the camera is nearest to, in
   * light years. The two are never equal, because `smoothstep` is undefined for
   * `edge0 >= edge1`.
   */
  readonly nebulaRange: readonly [number, number];
  /** The size of the target the sprites draw into, in pixels. */
  readonly targetSize: readonly [number, number];
}

/**
 * The texture unit the nebula transmittance reads. The point pass binds no other
 * texture, so unit 0 is free.
 */
const NEBULA_UNIT = 0;

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
    'uHandoverWeight',
    'uHandover',
    'uNebulaTransmittance',
    'uNebulaRange',
    'uInverseTarget',
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
      gl.uniform1f(program.uniforms['uHandoverWeight'] ?? null, frame.handoverWeight);
      gl.uniform2f(
        program.uniforms['uHandover'] ?? null,
        frame.handover[0],
        frame.handover[1],
      );

      // The nebula gate. A frame that drew no record sends a range pair far beyond the
      // volume box, so the share is exactly 0 and the shader makes no fetch.
      gl.activeTexture(gl.TEXTURE0 + NEBULA_UNIT);
      gl.bindTexture(gl.TEXTURE_2D, frame.nebulaTransmittance);
      gl.uniform1i(program.uniforms['uNebulaTransmittance'] ?? null, NEBULA_UNIT);
      gl.uniform2f(
        program.uniforms['uNebulaRange'] ?? null,
        frame.nebulaRange[0],
        frame.nebulaRange[1],
      );
      gl.uniform2f(
        program.uniforms['uInverseTarget'] ?? null,
        1 / Math.max(1, frame.targetSize[0]),
        1 / Math.max(1, frame.targetSize[1]),
      );

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.bindVertexArray(buffers.vertexArray);
      gl.drawArrays(gl.POINTS, 0, buffers.count);
      gl.bindVertexArray(null);
      gl.disable(gl.BLEND);
      gl.activeTexture(gl.TEXTURE0 + NEBULA_UNIT);
      gl.bindTexture(gl.TEXTURE_2D, null);
    },
    dispose(): void {
      buffers.dispose();
    },
  };
}
