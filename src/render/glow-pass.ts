// Blurs the volume and cloud passes into a halo around the disc, at one eighth of
// the frame.
import { createRenderTarget } from './buffers';
import type { RenderTarget } from './buffers';
import { createProgram } from './program';
import type { Program } from './program';
import vertexSource from './shaders/fullscreen.vert?raw';
import blitSource from './shaders/blit.frag?raw';
import blurSource from './shaders/blur.frag?raw';
import glowSource from './shaders/glow-source.frag?raw';

/** How much of the frame height one standard deviation of one blur round covers. */
export const GLOW_SIGMA_FRACTION = 0.1;

/** How many taps one standard deviation of the blur holds. */
const TAPS_PER_SIGMA = 2;

/** The side of the glow targets, as a fraction of the frame. */
export const GLOW_DIVISOR = 8;

/** The brightness of the halo, relative to the volume pass. */
export const DEFAULT_GLOW_WEIGHT = 6.0;

/** How far the halo moves toward the haze colour, 0 to 1. */
export const DEFAULT_GLOW_TINT = 0.8;

/**
 * The scene luminance at which the glow source stops rising. The blur spreads a peak
 * over its whole width, so without this hold the edge-on bulge fills the sky above
 * the disc before the faint rim gives a halo.
 */
export const DEFAULT_GLOW_CLAMP = 0.01;

/** The glow pass. */
export interface GlowPass {
  /** Matches the glow targets to the frame size in device pixels. */
  resize(width: number, height: number): void;
  /** Blurs a source texture. The result stays in `texture`. */
  render(source: WebGLTexture, weight: number, tint: number, clamp: number): void;
  /** The blurred result of the last `render` call. */
  readonly texture: WebGLTexture;
  dispose(): void;
}

/** Compiles the blur program and creates the glow targets. */
export function createGlowPass(
  gl: WebGL2RenderingContext,
  emptyVertexArray: WebGLVertexArrayObject,
  float: boolean,
): GlowPass {
  const program: Program = createProgram(gl, 'blur', vertexSource, blurSource, [
    'uSource',
    'uStep',
    'uWeight',
    'uTint',
  ]);
  const blitProgram: Program = createProgram(
    gl,
    'glow-blit',
    vertexSource,
    blitSource,
    ['uSource'],
  );
  const sourceProgram: Program = createProgram(
    gl,
    'glow-source',
    vertexSource,
    glowSource,
    ['uSource', 'uClamp'],
  );

  const quarter: RenderTarget = createRenderTarget(gl, 1, 1, float);
  const eighth: RenderTarget = createRenderTarget(gl, 1, 1, float);
  const first: RenderTarget = createRenderTarget(gl, 1, 1, float);
  const second: RenderTarget = createRenderTarget(gl, 1, 1, float);
  let spacing = 1;

  const drawFullScreen = (): void => {
    gl.bindVertexArray(emptyVertexArray);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  };

  // A linear blit into a target of half the side reads the corner between four
  // texels, so it averages a 2 x 2 block. Two of them make a 4 x 4 box and no source
  // pixel is skipped.
  const halve = (
    source: WebGLTexture,
    target: RenderTarget,
    clamp: number | null,
  ): void => {
    const used: Program = clamp === null ? blitProgram : sourceProgram;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    gl.viewport(0, 0, target.width, target.height);
    gl.useProgram(used.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, source);
    gl.uniform1i(used.uniforms['uSource'] ?? null, 0);
    if (clamp !== null) gl.uniform1f(used.uniforms['uClamp'] ?? null, clamp);
    drawFullScreen();
  };

  const blur = (
    source: WebGLTexture,
    target: RenderTarget,
    stepX: number,
    stepY: number,
    weight: number,
    tint: number,
  ): void => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    gl.viewport(0, 0, target.width, target.height);
    gl.useProgram(program.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, source);
    gl.uniform1i(program.uniforms['uSource'] ?? null, 0);
    gl.uniform2f(program.uniforms['uStep'] ?? null, stepX, stepY);
    gl.uniform1f(program.uniforms['uWeight'] ?? null, weight);
    gl.uniform1f(program.uniforms['uTint'] ?? null, tint);
    drawFullScreen();
  };

  const pass: GlowPass = {
    resize(width: number, height: number): void {
      // The source is the half-resolution target, so each step halves its side and
      // the last one lands on one eighth of the frame.
      const halfWidth = Math.max(1, width >> 1);
      const halfHeight = Math.max(1, height >> 1);
      const quarterWidth = Math.max(1, halfWidth >> 1);
      const quarterHeight = Math.max(1, halfHeight >> 1);
      const eighthWidth = Math.max(1, quarterWidth >> 1);
      const eighthHeight = Math.max(1, quarterHeight >> 1);
      quarter.resize(quarterWidth, quarterHeight);
      eighth.resize(eighthWidth, eighthHeight);
      first.resize(eighthWidth, eighthHeight);
      second.resize(eighthWidth, eighthHeight);
      // The blur keeps the same width in the frame at every viewport size.
      const sigma = (GLOW_SIGMA_FRACTION * height) / GLOW_DIVISOR;
      spacing = Math.max(0.5, sigma / TAPS_PER_SIGMA);
    },
    render(source: WebGLTexture, weight: number, tint: number, clamp: number): void {
      const stepX = spacing / first.width;
      const stepY = spacing / first.height;
      halve(source, quarter, clamp);
      halve(quarter.texture, eighth, null);
      blur(eighth.texture, first, stepX, 0, 1, 0);
      blur(first.texture, second, 0, stepY, 1, 0);
      blur(second.texture, first, stepX, 0, 1, 0);
      blur(first.texture, second, 0, stepY, weight, tint);
    },
    get texture(): WebGLTexture {
      return second.texture;
    },
    dispose(): void {
      gl.deleteProgram(program.program);
      gl.deleteProgram(blitProgram.program);
      gl.deleteProgram(sourceProgram.program);
      quarter.dispose();
      eighth.dispose();
      first.dispose();
      second.dispose();
    },
  };
  return pass;
}
