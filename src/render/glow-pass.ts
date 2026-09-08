// Blurs the volume pass into a halo around the disc, at one eighth of the frame.
import { createRenderTarget } from './buffers';
import type { RenderTarget } from './buffers';
import { createProgram } from './program';
import type { Program } from './program';
import vertexSource from './shaders/fullscreen.vert?raw';
import blurSource from './shaders/blur.frag?raw';

/** How much of the frame height one standard deviation of one blur round covers. */
export const GLOW_SIGMA_FRACTION = 0.045;

/** How many taps one standard deviation of the blur holds. */
const TAPS_PER_SIGMA = 2;

/** The side of the glow targets, as a fraction of the frame. */
export const GLOW_DIVISOR = 8;

/** The brightness of the halo, relative to the volume pass. */
export const DEFAULT_GLOW_WEIGHT = 1.5;

/** How far the halo moves toward the haze colour, 0 to 1. */
export const DEFAULT_GLOW_TINT = 0.35;

/** The glow pass. */
export interface GlowPass {
  /** Matches the glow targets to the frame size in device pixels. */
  resize(width: number, height: number): void;
  /** Blurs a source texture. The result stays in `texture`. */
  render(source: WebGLTexture, weight: number, tint: number): void;
  /** The blurred result of the last `render` call. */
  readonly texture: WebGLTexture;
  dispose(): void;
}

/** Compiles the blur program and creates the two glow targets. */
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

  const first: RenderTarget = createRenderTarget(gl, 1, 1, float);
  const second: RenderTarget = createRenderTarget(gl, 1, 1, float);
  let spacing = 1;

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
    gl.bindVertexArray(emptyVertexArray);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  };

  const pass: GlowPass = {
    resize(width: number, height: number): void {
      const small = Math.max(1, width / GLOW_DIVISOR);
      const tall = Math.max(1, height / GLOW_DIVISOR);
      first.resize(Math.round(small), Math.round(tall));
      second.resize(Math.round(small), Math.round(tall));
      // The blur keeps the same width in the frame at every viewport size.
      const sigma = (GLOW_SIGMA_FRACTION * height) / GLOW_DIVISOR;
      spacing = Math.max(0.5, sigma / TAPS_PER_SIGMA);
    },
    render(source: WebGLTexture, weight: number, tint: number): void {
      const stepX = spacing / first.width;
      const stepY = spacing / first.height;
      // The first round also downsamples, because the target is smaller.
      blur(source, first, stepX, 0, 1, 0);
      blur(first.texture, second, 0, stepY, 1, 0);
      blur(second.texture, first, stepX, 0, 1, 0);
      blur(first.texture, second, 0, stepY, weight, tint);
    },
    get texture(): WebGLTexture {
      return second.texture;
    },
    dispose(): void {
      gl.deleteProgram(program.program);
      first.dispose();
      second.dispose();
    },
  };
  return pass;
}
