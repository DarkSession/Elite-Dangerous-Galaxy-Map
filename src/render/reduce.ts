// The halving both the glow and the background reading build their chains from. A
// linear blit into a target of half the side reads the corner between four texels, so
// it averages a 2 x 2 block. Two of them make a 4 x 4 box and no source pixel is
// skipped.
//
// The two chains keep two size rules. The glow rounds a side down, which is the rule
// its committed baseline image was drawn with, and the background reading rounds up, so
// its last row covers the bottom of the frame. One rule for both would move the glow's
// targets at an odd drawing buffer.
import type { RenderTarget } from './buffers';
import { createProgram } from './program';
import type { Program } from './program';
import vertexSource from './shaders/fullscreen.vert?raw';
import blitSource from './shaders/blit.frag?raw';
import glowSource from './shaders/glow-source.frag?raw';

/** Half of a side, rounded down and never under 1. The glow's rule. */
export function halvedDown(side: number): number {
  return Math.max(1, side >> 1);
}

/** Half of a side, rounded up and never under 1. The background reading's rule. */
export function halvedUp(side: number): number {
  return Math.max(1, Math.ceil(side / 2));
}

/** The halving step the reduction chains share. */
export interface ReducePass {
  /**
   * Averages `source` into `target`. A clamp of null copies the source; a number holds
   * the source at that luminance first, which is what the glow reads.
   */
  halve(source: WebGLTexture, target: RenderTarget, clamp: number | null): void;
  dispose(): void;
}

/** Compiles the blit program and the clamped glow source program. */
export function createReducePass(
  gl: WebGL2RenderingContext,
  emptyVertexArray: WebGLVertexArrayObject,
): ReducePass {
  const blitProgram: Program = createProgram(
    gl,
    'reduce-blit',
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

  return {
    halve(source: WebGLTexture, target: RenderTarget, clamp: number | null): void {
      const used: Program = clamp === null ? blitProgram : sourceProgram;
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.viewport(0, 0, target.width, target.height);
      gl.useProgram(used.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, source);
      gl.uniform1i(used.uniforms['uSource'] ?? null, 0);
      if (clamp !== null) gl.uniform1f(used.uniforms['uClamp'] ?? null, clamp);
      gl.bindVertexArray(emptyVertexArray);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindVertexArray(null);
    },
    dispose(): void {
      gl.deleteProgram(blitProgram.program);
      gl.deleteProgram(sourceProgram.program);
    },
  };
}
