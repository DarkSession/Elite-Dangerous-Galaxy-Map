import { describe, expect, test } from 'vitest';
import {
  createRenderContext,
  isSoftwareRenderer,
  NO_WEBGL2_MESSAGE,
  readRendererString,
} from './context';
import type { CanvasLike } from './context';

function makeScope(): Window {
  return {} as unknown as Window;
}

function stubContext(renderer: string): Record<string, unknown> {
  return {
    RENDERER: 7937,
    getExtension: (name: string) =>
      name === 'WEBGL_debug_renderer_info' ? { UNMASKED_RENDERER_WEBGL: 37446 } : null,
    getParameter: (parameter: number) => (parameter === 37446 ? renderer : 'other'),
  };
}

describe('the render context', () => {
  test('names the software renderers', () => {
    expect(isSoftwareRenderer('ANGLE (Google, SwiftShader driver)')).toBe(true);
    expect(isSoftwareRenderer('Mesa/X.org, llvmpipe (LLVM 15)')).toBe(true);
    expect(isSoftwareRenderer('Google Software Renderer')).toBe(true);
    expect(isSoftwareRenderer('ANGLE (NVIDIA GeForce RTX 4080)')).toBe(false);
  });

  test('reads the unmasked renderer string', () => {
    expect(readRendererString(stubContext('NVIDIA GeForce RTX 4080') as never)).toBe(
      'NVIDIA GeForce RTX 4080',
    );
  });

  test('refuses a software renderer and names it', () => {
    const scope = makeScope();
    const canvas: CanvasLike = {
      getContext: () => stubContext('ANGLE (Google, Vulkan, SwiftShader driver)'),
    };
    const result = createRenderContext(canvas, scope);
    expect(result.gl).toBeNull();
    expect(result.error).toContain('SwiftShader');
    expect(scope.__galaxyMap?.renderer).toContain('SwiftShader');
    expect(scope.__galaxyMap?.error).toContain('SwiftShader');
  });

  test('reports the WebGL2 message for a null context and does not throw', () => {
    const scope = makeScope();
    const canvas: CanvasLike = { getContext: () => null };
    expect(() => createRenderContext(canvas, scope)).not.toThrow();
    const result = createRenderContext(canvas, scope);
    expect(result.gl).toBeNull();
    expect(result.error).toBe(NO_WEBGL2_MESSAGE);
    expect(scope.__galaxyMap?.renderer).toBe('');
  });

  test('accepts a hardware renderer', () => {
    const scope = makeScope();
    const canvas: CanvasLike = {
      getContext: () => stubContext('ANGLE (NVIDIA, Vulkan, NVIDIA GeForce RTX 4080)'),
    };
    const result = createRenderContext(canvas, scope);
    expect(result.gl).not.toBeNull();
    expect(result.error).toBeNull();
  });
});
