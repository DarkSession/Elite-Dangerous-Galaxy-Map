// Raymarches the density volume into a half-resolution target.
import { createVolumeTexture } from './buffers';
import type { VolumeTexture } from './buffers';
import { createProgram } from './program';
import type { Program } from './program';
import type { DensityVolume } from '../scene-data/types';
import vertexSource from './shaders/volume.vert?raw';
import fragmentSource from './shaders/volume.frag?raw';

/** The emission per unit of compressed density per light year. */
export const DEFAULT_EMISSION = 3.0e-4;

/** The absorption per unit of compressed density per light year. */
export const DEFAULT_ABSORPTION = 2.0e-4;

/** What one volume pass draw needs. */
export interface VolumePassFrame {
  /** The inverse of the camera-relative projection and view matrix. */
  readonly inverseViewProjection: Float32Array;
  /** The low corner of the volume box minus the camera, in the world frame. */
  readonly boxMin: readonly [number, number, number];
  /** The size of the volume box in the world frame. */
  readonly boxSize: readonly [number, number, number];
  /** The galactic centre minus the camera, in the world frame. */
  readonly centre: readonly [number, number, number];
  readonly emission: number;
  readonly absorption: number;
  /** The surface detail texture, or null when the grid has not arrived. */
  readonly detail: WebGLTexture | null;
  /** The scale one stored detail step stands for. It is 0 without a grid. */
  readonly detailScale: number;
}

/** The volume pass. */
export interface VolumePass {
  draw(frame: VolumePassFrame): void;
  dispose(): void;
}

/** Compiles the volume program. Call it before the volume arrives. */
export function createVolumeProgram(gl: WebGL2RenderingContext): Program {
  return createProgram(gl, 'volume', vertexSource, fragmentSource, [
    'uInverseViewProjection',
    'uVolume',
    'uDetail',
    'uBoxMin',
    'uBoxSize',
    'uCentre',
    'uLo',
    'uSpan',
    'uEpsilon',
    'uEmission',
    'uAbsorption',
    'uDetailScale',
  ]);
}

/** Uploads the volume and gives back the pass that draws it. The renderer owns the
 * program and deletes it. */
export function createVolumePass(
  gl: WebGL2RenderingContext,
  program: Program,
  volume: DensityVolume,
  emptyVertexArray: WebGLVertexArrayObject,
): VolumePass {
  const texture: VolumeTexture = createVolumeTexture(gl, volume);

  return {
    draw(frame: VolumePassFrame): void {
      gl.useProgram(program.program);
      gl.uniformMatrix4fv(
        program.uniforms['uInverseViewProjection'] ?? null,
        false,
        frame.inverseViewProjection,
      );
      gl.uniform3f(
        program.uniforms['uBoxMin'] ?? null,
        frame.boxMin[0],
        frame.boxMin[1],
        frame.boxMin[2],
      );
      gl.uniform3f(
        program.uniforms['uBoxSize'] ?? null,
        frame.boxSize[0],
        frame.boxSize[1],
        frame.boxSize[2],
      );
      gl.uniform3f(
        program.uniforms['uCentre'] ?? null,
        frame.centre[0],
        frame.centre[1],
        frame.centre[2],
      );
      gl.uniform1f(program.uniforms['uLo'] ?? null, volume.lo);
      gl.uniform1f(program.uniforms['uSpan'] ?? null, volume.hi - volume.lo);
      gl.uniform1f(program.uniforms['uEpsilon'] ?? null, volume.epsilon);
      gl.uniform1f(program.uniforms['uEmission'] ?? null, frame.emission);
      gl.uniform1f(program.uniforms['uAbsorption'] ?? null, frame.absorption);
      gl.uniform1f(program.uniforms['uDetailScale'] ?? null, frame.detailScale);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_3D, texture.texture);
      gl.uniform1i(program.uniforms['uVolume'] ?? null, 0);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, frame.detail);
      gl.uniform1i(program.uniforms['uDetail'] ?? null, 1);
      gl.activeTexture(gl.TEXTURE0);

      gl.bindVertexArray(emptyVertexArray);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindVertexArray(null);
    },
    dispose(): void {
      texture.dispose();
    },
  };
}
