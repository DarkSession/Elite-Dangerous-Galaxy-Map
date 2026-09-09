// Draws the decoration star field as additive point sprites, one instance per boxel.
import {
  baseSizeClass,
  boxelEdge,
  DRAWN_BOXEL_COUNT,
  DRAWN_CLASS_COUNT,
  starSpreadValue,
} from '../scene-data/boxel';
import { DEFAULT_POINT_COUNT } from '../scene-data/point-cloud';
import {
  RECORD_VALUES,
  starLightConstant,
  STAR_VERTEX_COUNT,
  STARS_PER_BOXEL,
} from '../scene-data/star-field';
import type { StarBoxelTable } from '../scene-data/star-field';
import { DEFAULT_POINT_BRIGHTNESS, POINT_RADIUS_LY } from './point-pass';
import { createProgram } from './program';
import type { Program } from './program';
import vertexSource from './shaders/stars.vert?raw';
import fragmentSource from './shaders/stars.frag?raw';

/**
 * The light one boxel carries per unit of mass-code-0 budget. It comes from the point
 * cloud's own constants, so the two sources carry the same light per unit volume at
 * every density and the handover cannot show a step.
 */
export const STAR_LIGHT = starLightConstant(
  DEFAULT_POINT_BRIGHTNESS,
  POINT_RADIUS_LY,
  DEFAULT_POINT_COUNT,
);

/** The smallest on-screen size of a star, in pixels. */
export const MIN_STAR_PIXELS = 1;

/** The largest on-screen size of a star, in pixels. */
export const MAX_STAR_PIXELS = 16;

/** The zoom distance at and below which the field draws in full, in light years. */
export const STAR_FADE_NEAR = 4000;

/** The zoom distance at and above which the field draws nothing, in light years. */
export const STAR_FADE_FAR = 8000;

/** The multiple of a boxel edge the field is proved to cover. */
const COVERED_BOXELS = 3;

function smoothstep(low: number, high: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
}

/**
 * How much of the field draws at a zoom distance, 0 to 1. It is 1 at 4,000 light years
 * and below and 0 at 8,000 and above, so the far view draws as it did before the field
 * existed.
 */
export function starWeight(distance: number): number {
  return 1 - smoothstep(STAR_FADE_NEAR, STAR_FADE_FAR, distance);
}

/**
 * The inner and the outer radius of the handover fade, in light years. The outer
 * radius is the sphere the field is proved to cover, and the inner one is half of it,
 * so the whole band lies inside that sphere.
 */
export function handoverRadii(distance: number): [number, number] {
  const top = baseSizeClass(distance) + DRAWN_CLASS_COUNT - 1;
  return [COVERED_BOXELS * boxelEdge(top - 1), COVERED_BOXELS * boxelEdge(top)];
}

/** The share of the light a star carries at a range. */
export function starFade(
  weight: number,
  radii: readonly [number, number],
  range: number,
): number {
  return weight * (1 - smoothstep(radii[0], radii[1], range));
}

/** The share of the light a point cloud sample carries at a range. */
export function pointFade(
  weight: number,
  radii: readonly [number, number],
  range: number,
): number {
  return 1 - starFade(weight, radii, range);
}

/** The on-screen size of a star, in pixels, after the clamp. */
export function starPixelSize(focal: number, range: number, radius: number): number {
  const wanted = (focal * radius) / range;
  return Math.min(MAX_STAR_PIXELS, Math.max(MIN_STAR_PIXELS, wanted));
}

/**
 * The brightness of a star. The sprite then deposits `lightPerStar / range^2` times
 * `focal^2`, whatever the star's radius is and whatever the size clamp does.
 */
export function starBrightness(
  lightPerStar: number,
  focal: number,
  range: number,
  radius: number,
): number {
  const size = starPixelSize(focal, range, radius);
  return (lightPerStar * focal * focal) / (range * size * range * size);
}

/**
 * The mean of `0.3 + 3 * u^4` over `u` in 0 to 1, which is `0.3 + 3 / 5`. The shader
 * carries the same literal, so the spread has a mean of 1 on both sides. It is written
 * out rather than computed, because `0.3 + 3 / 5` in `float64` is one bit below 0.9.
 */
export const STAR_SPREAD_MEAN = 0.9;

/**
 * The brightness spread of one star, with a mean of 1 over the stars of a boxel. A
 * real population of stars covers many magnitudes, and the spread is what gives the
 * field its grain. It is a separate factor from the brightness rule, so it moves no
 * light between stars of different radii, and its mean of 1 leaves the boxel's light
 * unchanged. The point cloud gives its samples a wider spread; `stars.vert` says why
 * this one is milder.
 */
export function starSpread(seed: number, starIndex: number): number {
  return (0.3 + 3 * starSpreadValue(seed, starIndex) ** 4) / STAR_SPREAD_MEAN;
}

/** What one star pass draw needs. */
export interface StarPassFrame {
  /** The combined projection and view matrix, with no translation. */
  readonly viewProjection: Float32Array;
  /** Pixels per light year at one light year of range. */
  readonly focal: number;
  /** How much of the field draws, 0 to 1. */
  readonly weight: number;
  /** The inner and the outer radius of the handover fade, in light years. */
  readonly handover: readonly [number, number];
  /** The boxel table for this frame. */
  readonly table: StarBoxelTable;
}

/** The star pass. */
export interface StarPass {
  draw(frame: StarPassFrame): void;
  /** How many vertices one draw issues. It is the bound the field holds to. */
  readonly vertexCount: number;
  dispose(): void;
}

/** Compiles the star program. */
export function createStarProgram(gl: WebGL2RenderingContext): Program {
  return createProgram(gl, 'stars', vertexSource, fragmentSource, [
    'uViewProjection',
    'uFocal',
    'uWeight',
    'uHandover',
  ]);
}

/**
 * Creates the star pass and its buffer. The renderer owns the program and deletes it.
 */
export function createStarPass(gl: WebGL2RenderingContext, program: Program): StarPass {
  const vertexArray = gl.createVertexArray();
  const buffer = gl.createBuffer();
  if (vertexArray === null || buffer === null) {
    throw new Error('The context gave no buffer for the star field.');
  }

  const stride = RECORD_VALUES * 4;
  gl.bindVertexArray(vertexArray);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, DRAWN_BOXEL_COUNT * stride, gl.DYNAMIC_DRAW);

  // Every attribute steps once per boxel. The seed is an unsigned integer, because a
  // `float32` holds only 24 of its 32 bits.
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
  gl.vertexAttribDivisor(0, 1);

  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 4, gl.FLOAT, false, stride, 12);
  gl.vertexAttribDivisor(1, 1);

  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 28);
  gl.vertexAttribDivisor(2, 1);

  gl.enableVertexAttribArray(3);
  gl.vertexAttribIPointer(3, 1, gl.UNSIGNED_INT, stride, 32);
  gl.vertexAttribDivisor(3, 1);

  gl.bindVertexArray(null);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);

  return {
    vertexCount: STAR_VERTEX_COUNT,
    draw(frame: StarPassFrame): void {
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, frame.table.bytes);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);

      gl.useProgram(program.program);
      gl.uniformMatrix4fv(
        program.uniforms['uViewProjection'] ?? null,
        false,
        frame.viewProjection,
      );
      gl.uniform1f(program.uniforms['uFocal'] ?? null, frame.focal);
      gl.uniform1f(program.uniforms['uWeight'] ?? null, frame.weight);
      gl.uniform2f(
        program.uniforms['uHandover'] ?? null,
        frame.handover[0],
        frame.handover[1],
      );

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.bindVertexArray(vertexArray);
      gl.drawArraysInstanced(
        gl.POINTS,
        0,
        STARS_PER_BOXEL,
        Math.min(DRAWN_BOXEL_COUNT, frame.table.count),
      );
      gl.bindVertexArray(null);
      gl.disable(gl.BLEND);
    },
    dispose(): void {
      gl.deleteBuffer(buffer);
      gl.deleteVertexArray(vertexArray);
    },
  };
}
