// Draws the cloud set as large soft additive sprites with irregular outlines.
import type { CloudBuffers, ShapeTexture } from './buffers';
import { SHAPE_COLUMNS } from './cloud-shapes';
import { createProgram } from './program';
import type { Program } from './program';
import vertexSource from './shaders/clouds.vert?raw';
import fragmentSource from './shaders/clouds.frag?raw';

/** The largest sprite radius, in pixels of the half-resolution target. */
export const CLOUD_MAX_RADIUS_PIXELS = 64;

/**
 * The brightness of one cloud sprite at the reference radius, at or above the ratio
 * ceiling.
 */
export const DEFAULT_CLOUD_BRIGHTNESS = 0.6;

/**
 * The power the sprite radius carries into the brightness. At -1 the light of one
 * octave of radius equals the light of the next, so no size band dominates the sum.
 */
export const CLOUD_SIZE_POWER = -1;

/**
 * The power the held density ratio carries into the brightness. The ratio is divided
 * by the ceiling first, so a sprite at or above the ceiling holds the brightness. The
 * placement is near level over the outer disc, so this power alone carries the arms
 * against the space between them.
 */
export const CLOUD_DENSITY_POWER = 1.6;

/**
 * The smallest density ratio the brightness follows. The model truncates at 38,900
 * light years, and the reference still shows puffs past it, so the ratio is held at
 * this floor, and the floor sets the light of the rim. On the ring at 32,000 light
 * years the floor sits near the 20th percentile of the ratios, so most of the outer
 * disc there still follows the density; past 38,000 light years the ring is mostly
 * below the floor and the sprites hold one brightness.
 */
export const CLOUD_RATIO_FLOOR = 1e-4;

/**
 * The largest density ratio the brightness follows. Above it the sprites hold one
 * brightness, so the bulge does not take the light of the whole set and the bulge
 * fall-off stays the volume pass's. Most of the inner disc reaches it: 96 percent of
 * the ring at 20,000 light years lies above it, and 30 percent at 25,900.
 */
export const CLOUD_RATIO_CEILING = 1e-3;

/**
 * The power of the sprite brightness spread. The factor is `(1 + power)` times a hash
 * of the sample index raised to this power, which has mean 1 and a heavy tail: most
 * sprites go faint and a few carry the light. It applies where the held density ratio
 * is at the floor, so the puffs at the rim stand apart.
 */
export const CLOUD_SPREAD_POWER = 12;

/**
 * The share of the sprite light that stays out of the spread. The ground of the outer
 * disc comes from it, so the haze there is not made of the winners of the spread alone.
 */
export const CLOUD_SPREAD_BASE = 0.35;

/**
 * The fixed level of light at which a sprite takes the whole patch colour. Below it
 * the sprite runs toward the haze colour, so the rim reads as pink puffs on a blue
 * ground. A sprite at the floor with the base alone carries 0.35, which is 0.14 of the
 * level.
 */
export const CLOUD_SPREAD_COLOUR = 2.5;

/**
 * The power the density ratio carries into the brightness below the floor. The floor
 * holds the light of the outer disc, and this power keeps the light falling under it,
 * so a sprite where the arms end is brighter than one in empty space.
 */
export const CLOUD_FLOOR_POWER = 0.3;

/** The radius at which the size power leaves the brightness alone, in light years. */
export const CLOUD_RADIUS_REFERENCE_LY = 1000;

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
  /** The galactic centre minus the camera, in the world frame. */
  readonly centre: readonly [number, number, number];
  /** The size of the target the pass draws into, in pixels. */
  readonly targetSize: readonly [number, number];
  /** Target pixels per light year of sprite radius at one light year of range. */
  readonly spriteScale: number;
  /** The brightness of one sprite. */
  readonly brightness: number;
  /** How much of the pass draws, 0 to 1. */
  readonly fade: number;
}

/** The cloud pass. */
export interface CloudPass {
  draw(frame: CloudPassFrame): void;
  dispose(): void;
}

/** Compiles the cloud program. Call it before the cloud set arrives. */
export function createCloudProgram(gl: WebGL2RenderingContext): Program {
  return createProgram(gl, 'clouds', vertexSource, fragmentSource, [
    'uViewProjection',
    'uChunkOffset',
    'uCentre',
    'uTargetSize',
    'uSpriteScale',
    'uMaxRadius',
    'uBrightness',
    'uSizePower',
    'uDensityPower',
    'uRatioFloor',
    'uRatioCeiling',
    'uRadiusReference',
    'uFloorPower',
    'uSpreadPower',
    'uSpreadBase',
    'uSpreadColour',
    'uFade',
    'uShapeSide',
    'uShapeColumns',
    'uShapeCount',
    'uShapes',
  ]);
}

/** Gives back the pass that draws the sprites from the cloud buffers. */
export function createCloudPass(
  gl: WebGL2RenderingContext,
  program: Program,
  buffers: CloudBuffers,
  shapeTexture: ShapeTexture,
): CloudPass {
  const count = buffers.count;
  const shapes = shapeTexture.shapes;

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
      gl.uniform3f(
        program.uniforms['uCentre'] ?? null,
        frame.centre[0],
        frame.centre[1],
        frame.centre[2],
      );
      gl.uniform2f(
        program.uniforms['uTargetSize'] ?? null,
        frame.targetSize[0],
        frame.targetSize[1],
      );
      gl.uniform1f(program.uniforms['uSpriteScale'] ?? null, frame.spriteScale);
      gl.uniform1f(program.uniforms['uMaxRadius'] ?? null, CLOUD_MAX_RADIUS_PIXELS);
      gl.uniform1f(program.uniforms['uBrightness'] ?? null, frame.brightness);
      gl.uniform1f(program.uniforms['uSizePower'] ?? null, CLOUD_SIZE_POWER);
      gl.uniform1f(program.uniforms['uDensityPower'] ?? null, CLOUD_DENSITY_POWER);
      gl.uniform1f(program.uniforms['uRatioFloor'] ?? null, CLOUD_RATIO_FLOOR);
      gl.uniform1f(program.uniforms['uRatioCeiling'] ?? null, CLOUD_RATIO_CEILING);
      gl.uniform1f(
        program.uniforms['uRadiusReference'] ?? null,
        CLOUD_RADIUS_REFERENCE_LY,
      );
      gl.uniform1f(program.uniforms['uFloorPower'] ?? null, CLOUD_FLOOR_POWER);
      gl.uniform1f(program.uniforms['uSpreadPower'] ?? null, CLOUD_SPREAD_POWER);
      gl.uniform1f(program.uniforms['uSpreadBase'] ?? null, CLOUD_SPREAD_BASE);
      gl.uniform1f(program.uniforms['uSpreadColour'] ?? null, CLOUD_SPREAD_COLOUR);
      gl.uniform1f(program.uniforms['uFade'] ?? null, frame.fade);
      gl.uniform1f(program.uniforms['uShapeSide'] ?? null, shapes.side);
      gl.uniform1f(program.uniforms['uShapeColumns'] ?? null, SHAPE_COLUMNS);
      gl.uniform1f(program.uniforms['uShapeCount'] ?? null, shapes.count);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, shapeTexture.texture);
      gl.uniform1i(program.uniforms['uShapes'] ?? null, 0);

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.bindVertexArray(buffers.vertexArray);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
      gl.bindVertexArray(null);
      gl.disable(gl.BLEND);
      gl.bindTexture(gl.TEXTURE_2D, null);
    },
    dispose(): void {
      buffers.dispose();
    },
  };
}
