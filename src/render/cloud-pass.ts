// Draws a random subset of the point cloud as large soft additive sprites.
import type { PointBuffers } from './buffers';
import { createProgram } from './program';
import type { Program } from './program';
import vertexSource from './shaders/clouds.vert?raw';
import fragmentSource from './shaders/clouds.frag?raw';

/** How many sprites the pass draws. The samples are in random order. */
export const CLOUD_COUNT = 10000;

/** How large a cloud sprite looks, in light years, before the pixel cap. */
export const CLOUD_RADIUS_LY = 1000;

/** The largest sprite radius, in pixels of the half-resolution target. */
export const CLOUD_MAX_RADIUS_PIXELS = 64;

/**
 * The largest brightness gain the size cap gives one sprite. A sprite held at the cap
 * is brighter by the square of the ratio of the radius it wants to the radius it
 * draws, and that ratio has no bound as the sprite nears the camera: without a bound
 * a sprite within about 51 light years of the camera passes the range of the 16-bit
 * float target, and the glow spreads the result over the frame. A gain of 4 keeps the
 * light of the sprite while it wants up to twice the cap, and holds it below that.
 * At 1920x1080 the cap starts at a range of 7,300 light years and the bound at 3,650.
 */
export const CLOUD_MAX_GAIN = 4;

/** The brightness of one cloud sprite. */
export const DEFAULT_CLOUD_BRIGHTNESS = 3.24;

/** The zoom distance below which the pass draws nothing, in light years. */
export const CLOUD_FADE_NEAR = 6000;

/** The zoom distance above which the pass draws in full, in light years. */
export const CLOUD_FADE_FAR = 12000;

/** How much of the pass draws at a zoom distance, 0 to 1. */
export function cloudFade(distance: number): number {
  const t = (distance - CLOUD_FADE_NEAR) / (CLOUD_FADE_FAR - CLOUD_FADE_NEAR);
  const held = Math.min(1, Math.max(0, t));
  return held * held * (3 - 2 * held);
}

/** What one cloud pass draw needs. */
export interface CloudPassFrame {
  /** The combined projection and view matrix, with no translation. */
  readonly viewProjection: Float32Array;
  /** The chunk origin minus the camera position, in the world frame. */
  readonly chunkOffset: readonly [number, number, number];
  /** The size of the target the pass draws into, in pixels. */
  readonly targetSize: readonly [number, number];
  /** Target pixels per light year at one light year of range. */
  readonly spriteScale: number;
  /** The brightness of one sprite. */
  readonly brightness: number;
  /** How much of the pass draws, 0 to 1. */
  readonly fade: number;
}

/** The cloud pass. */
export interface CloudPass {
  draw(frame: CloudPassFrame): void;
}

/** Compiles the cloud program. Call it before the cloud arrives. */
export function createCloudProgram(gl: WebGL2RenderingContext): Program {
  return createProgram(gl, 'clouds', vertexSource, fragmentSource, [
    'uViewProjection',
    'uChunkOffset',
    'uTargetSize',
    'uSpriteScale',
    'uMaxRadius',
    'uMaxGain',
    'uBrightness',
    'uFade',
  ]);
}

/**
 * Gives back the pass that draws the sprites. It holds no buffer of its own: the
 * point buffers own the vertex array, and `setPointCloud` rebuilds both together.
 */
export function createCloudPass(
  gl: WebGL2RenderingContext,
  program: Program,
  buffers: PointBuffers,
): CloudPass {
  const count = Math.min(CLOUD_COUNT, buffers.count);

  return {
    draw(frame: CloudPassFrame): void {
      if (frame.fade <= 0 || count < 1) return;
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
      gl.uniform2f(
        program.uniforms['uTargetSize'] ?? null,
        frame.targetSize[0],
        frame.targetSize[1],
      );
      gl.uniform1f(program.uniforms['uSpriteScale'] ?? null, frame.spriteScale);
      gl.uniform1f(program.uniforms['uMaxRadius'] ?? null, CLOUD_MAX_RADIUS_PIXELS);
      gl.uniform1f(program.uniforms['uMaxGain'] ?? null, CLOUD_MAX_GAIN);
      gl.uniform1f(program.uniforms['uBrightness'] ?? null, frame.brightness);
      gl.uniform1f(program.uniforms['uFade'] ?? null, frame.fade);

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.bindVertexArray(buffers.cloudVertexArray);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
      gl.bindVertexArray(null);
      gl.disable(gl.BLEND);
    },
  };
}
