// Creates the WebGL2 context and checks that the card, not the CPU, draws.
import { galaxyMapGlobal } from './global';

/** The words that name a software renderer. */
export const SOFTWARE_RENDERER_NAMES = ['SwiftShader', 'llvmpipe', 'Software'];

/** The message the page shows when the browser gives no WebGL2 context. */
export const NO_WEBGL2_MESSAGE =
  'This map needs WebGL2. This browser does not give a WebGL2 context.';

/** The smallest part of a canvas this module reads, so a test can stub it. */
export interface CanvasLike {
  getContext(id: string, attributes?: unknown): unknown;
}

/** The smallest part of a context this module reads, so a test can stub it. */
export interface ContextLike {
  getExtension(name: string): unknown;
  getParameter(name: number): unknown;
  RENDERER: number;
}

/** What `createRenderContext` gives back. */
export interface RenderContextResult {
  /** The context, or null when the browser gives none or the card is software. */
  readonly gl: WebGL2RenderingContext | null;
  /** The unmasked renderer string, or an empty string. */
  readonly renderer: string;
  /** The message to show, or null when the context is good. */
  readonly error: string | null;
}

/** True when a renderer string names a software renderer. */
export function isSoftwareRenderer(renderer: string): boolean {
  return SOFTWARE_RENDERER_NAMES.some((name) => renderer.includes(name));
}

/**
 * Reads the unmasked renderer string, or the plain `RENDERER` string when
 * `WEBGL_debug_renderer_info` is absent.
 */
export function readRendererString(gl: ContextLike): string {
  const info = gl.getExtension('WEBGL_debug_renderer_info') as {
    UNMASKED_RENDERER_WEBGL: number;
  } | null;
  const value =
    info !== null && info !== undefined
      ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER);
  return typeof value === 'string' ? value : '';
}

/**
 * Creates the context, reads the renderer string, puts it on `window.__galaxyMap` and
 * refuses a software renderer. It never throws.
 */
export function createRenderContext(
  canvas: CanvasLike,
  scope: Window = window,
): RenderContextResult {
  const global = galaxyMapGlobal(scope);
  let gl: WebGL2RenderingContext | null;
  try {
    gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    }) as WebGL2RenderingContext | null;
  } catch {
    gl = null;
  }

  if (gl === null || gl === undefined) {
    global.renderer = '';
    global.error = NO_WEBGL2_MESSAGE;
    return { gl: null, renderer: '', error: NO_WEBGL2_MESSAGE };
  }

  const renderer = readRendererString(gl as unknown as ContextLike);
  global.renderer = renderer;

  if (isSoftwareRenderer(renderer)) {
    const error =
      `This map needs hardware rendering. The browser reports "${renderer}", ` +
      'which draws on the processor. See .devcontainer/README.md.';
    global.error = error;
    return { gl: null, renderer, error };
  }

  global.error = null;
  return { gl, renderer, error: null };
}
