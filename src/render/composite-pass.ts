// Copies the half-resolution volume over the scene target and tone-maps the sum.
import { createProgram } from './program';
import type { Program } from './program';
import vertexSource from './shaders/fullscreen.vert?raw';
import blitSource from './shaders/blit.frag?raw';
import tonemapSource from './shaders/tonemap.frag?raw';

/** The exposure the tone map applies before the gamma curve. */
export const DEFAULT_EXPOSURE = 1.0;

/** The two full-screen passes. */
export interface CompositePass {
  /** Copies a texture over the whole target. */
  blit(texture: WebGLTexture): void;
  /** Maps the scene target into the display range. */
  tonemap(texture: WebGLTexture, exposure: number): void;
  dispose(): void;
}

/** Compiles the two full-screen programs. */
export function createCompositePass(
  gl: WebGL2RenderingContext,
  emptyVertexArray: WebGLVertexArrayObject,
): CompositePass {
  const blitProgram: Program = createProgram(gl, 'blit', vertexSource, blitSource, [
    'uSource',
  ]);
  const tonemapProgram: Program = createProgram(
    gl,
    'tonemap',
    vertexSource,
    tonemapSource,
    ['uScene', 'uExposure'],
  );

  const drawFullScreen = (): void => {
    gl.bindVertexArray(emptyVertexArray);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  };

  return {
    blit(texture: WebGLTexture): void {
      gl.useProgram(blitProgram.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(blitProgram.uniforms['uSource'] ?? null, 0);
      drawFullScreen();
    },
    tonemap(texture: WebGLTexture, exposure: number): void {
      gl.useProgram(tonemapProgram.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(tonemapProgram.uniforms['uScene'] ?? null, 0);
      gl.uniform1f(tonemapProgram.uniforms['uExposure'] ?? null, exposure);
      drawFullScreen();
    },
    dispose(): void {
      gl.deleteProgram(blitProgram.program);
      gl.deleteProgram(tonemapProgram.program);
    },
  };
}
