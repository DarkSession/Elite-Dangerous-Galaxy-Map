import { afterEach, describe, expect, test } from 'vitest';
import { createRangeBuffer, RANGE_EMPTY, readsFloatTargets } from './buffers';
import { createFrameAccumulator, createRenderer } from './renderer';
import { createShapeSet } from '../scene-data/shapes';
import { createSystemSet } from '../scene-data/real-systems';
import type { View } from '../camera/view';
import type { RegionLines } from '../scene-data/types';

describe('the frame time accumulator', () => {
  test('reads the count, the mean and the worst over 10 frames', () => {
    const frames = createFrameAccumulator();
    expect(frames.read()).toEqual({ frames: 0, meanMs: 0, worstMs: 0 });

    const times = [4, 6, 5, 21, 3, 7, 8, 2, 9, 5];
    for (const ms of times) frames.add(ms);
    const stats = frames.read();
    expect(stats.frames).toBe(10);
    expect(stats.meanMs).toBeCloseTo(7, 9);
    expect(stats.worstMs).toBe(21);
  });

  test('starts the count again on a reset', () => {
    const frames = createFrameAccumulator();
    frames.add(30);
    frames.reset();
    expect(frames.read()).toEqual({ frames: 0, meanMs: 0, worstMs: 0 });
    frames.add(4);
    frames.add(6);
    expect(frames.read()).toEqual({ frames: 2, meanMs: 5, worstMs: 6 });
  });
});

/** One call a pass made on the context. */
interface Call {
  readonly name: string;
  readonly args: readonly unknown[];
}

/** A context that records every call and gives every constant its own number. */
interface FakeContext {
  readonly gl: WebGL2RenderingContext;
  readonly calls: Call[];
  /** The calls of one name. */
  of(name: string): Call[];
  /** The two shader sources of the program of each draw call, in the order of the draws. */
  drawSources(): string[][];
}

/**
 * A context the renderer can build on. It records the calls, it links every program, and
 * it holds which sources went into each program, so a test can name the pass of a draw.
 *
 * `extensions` names the extensions the context gives, so a test can take the range
 * buffer path or the fallback.
 */
function fakeContext(extensions: readonly string[]): FakeContext {
  const calls: Call[] = [];
  const constants = new Map<string, number>();
  const shaders = new Map<unknown, string>();
  const programs = new Map<unknown, string[]>();
  const draws: string[][] = [];
  let bound: unknown = null;
  const state: Record<string, unknown> = {
    drawingBufferWidth: 800,
    drawingBufferHeight: 600,
  };

  const record = (name: string, args: unknown[]): unknown => {
    calls.push({ name, args });
    switch (name) {
      case 'getExtension':
        return extensions.includes(args[0] as string) ? { name: args[0] } : null;
      case 'getShaderParameter':
      case 'getProgramParameter':
        return true;
      case 'getParameter':
        return Float32Array.from([1, 1023]);
      case 'shaderSource':
        shaders.set(args[0], args[1] as string);
        return null;
      case 'attachShader': {
        const held = programs.get(args[0]) ?? [];
        held.push(shaders.get(args[1]) ?? '');
        programs.set(args[0], held);
        return null;
      }
      case 'useProgram':
        bound = args[0];
        return null;
      case 'drawArrays':
      case 'drawArraysInstanced':
      case 'drawElements':
        draws.push(programs.get(bound) ?? []);
        return null;
      default:
        return name.startsWith('create') ? { name } : null;
    }
  };

  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_state, key): unknown {
      if (typeof key !== 'string') return undefined;
      if (key in state) return state[key];
      // A name in capitals is one of the context's constants. Every name gets its own
      // number, so a pass cannot confuse two of them.
      if (/^[A-Z][A-Z0-9_]*$/.test(key)) {
        const held = constants.get(key);
        if (held !== undefined) return held;
        const next = constants.size + 1;
        constants.set(key, next);
        return next;
      }
      return (...args: unknown[]): unknown => record(key, args);
    },
  };

  return {
    gl: new Proxy(state, handler) as unknown as WebGL2RenderingContext,
    calls,
    of(name: string): Call[] {
      return calls.filter((call) => call.name === name);
    },
    drawSources(): string[][] {
      return draws;
    },
  };
}

describe('the float target flag', () => {
  test('reads both extensions, because the blend needs the second one', () => {
    expect(readsFloatTargets(fakeContext(['EXT_color_buffer_float']).gl)).toBe(false);
    expect(readsFloatTargets(fakeContext(['EXT_float_blend']).gl)).toBe(false);
    expect(readsFloatTargets(fakeContext([]).gl)).toBe(false);
    expect(
      readsFloatTargets(fakeContext(['EXT_color_buffer_float', 'EXT_float_blend']).gl),
    ).toBe(true);
  });
});

describe('the range buffer', () => {
  test('holds one 32-bit float per pixel of the drawing buffer', () => {
    const context = fakeContext([]);
    const gl = context.gl;
    const buffer = createRangeBuffer(gl, 1920, 1080);

    const images = context.of('texImage2D');
    expect(images).toHaveLength(1);
    expect(images[0]?.args.slice(0, 8)).toEqual([
      gl.TEXTURE_2D,
      0,
      gl.R32F,
      1920,
      1080,
      0,
      gl.RED,
      gl.FLOAT,
    ]);
    expect(buffer.width).toBe(1920);
    expect(buffer.height).toBe(1080);
    // The value a pixel holds with no marker body is above every drawable range and far
    // below the largest `float32`.
    expect(RANGE_EMPTY).toBeGreaterThan(1e6);
    expect(Math.fround(RANGE_EMPTY)).toBeLessThan(3.4e38);
  });

  test('takes the drawing buffer size again, and only on a change', () => {
    const context = fakeContext([]);
    const buffer = createRangeBuffer(context.gl, 2, 2);
    buffer.resize(1280, 720);
    buffer.resize(1280, 720);

    const images = context.of('texImage2D');
    expect(images).toHaveLength(2);
    expect(images[1]?.args.slice(3, 5)).toEqual([1280, 720]);
    expect(buffer.width).toBe(1280);
  });

  test('frees the texture and the framebuffer on dispose', () => {
    const context = fakeContext([]);
    const buffer = createRangeBuffer(context.gl, 2, 2);
    buffer.dispose();

    expect(context.of('deleteTexture')).toHaveLength(1);
    expect(context.of('deleteFramebuffer')).toHaveLength(1);
    expect(context.of('deleteTexture')[0]?.args[0]).toBe(buffer.texture);
    expect(context.of('deleteFramebuffer')[0]?.args[0]).toBe(buffer.framebuffer);
  });
});

/** A canvas the renderer can measure, with no document behind it. */
function fakeCanvas(): HTMLCanvasElement {
  return {
    clientWidth: 800,
    clientHeight: 600,
    width: 0,
    height: 0,
  } as HTMLCanvasElement;
}

/** One straight region boundary, which is enough to make the overlay draw. */
function regionLines(): RegionLines {
  return {
    chainCount: 1,
    vertexCount: 2,
    positions: Float32Array.from([0, 0, 0, 100, 0, 0]),
    first: Uint32Array.from([0]),
    last: Uint32Array.from([1]),
  };
}

/** A view near enough the cursor for the grid and the region boundaries to draw. */
function closeView(): View {
  return { cursor: [0, 0, 0], distance: 2000, yaw: 0, pitch: 30 };
}

/**
 * The name of the pass a draw belongs to, read from the shaders its program was linked
 * from. Each token below is in one pair of shaders alone.
 */
function passOf(sources: readonly string[]): string {
  const source = sources.join('\n');
  if (source.includes('fragRange = vRange;')) return 'marker-range';
  if (source.includes('const vec3 RING')) return 'markers';
  if (source.includes('uMinRadius')) return 'spheres';
  if (source.includes('aHalfWidth')) return 'lines';
  if (source.includes('uLines')) return 'lines';
  if (source.includes('uBaseHalfWidth')) return 'regions';
  if (source.includes('uCoreEdge')) return 'regions';
  if (source.includes('uMergeFloor')) return 'grid';
  return 'other';
}

describe('the overlay order', () => {
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  /** Draws one frame that holds every overlay and reads the order of the overlay draws. */
  function overlayOrder(
    extensions: readonly string[],
    shapesHeld: 'both' | 'lines' = 'both',
  ): {
    order: string[];
    context: FakeContext;
  } {
    // `resize` reads the device pixel ratio from the window, which this environment has
    // no document behind. The renderer reads nothing else from it.
    (globalThis as { window?: unknown }).window = { devicePixelRatio: 1 };
    const context = fakeContext(extensions);
    const renderer = createRenderer(context.gl, fakeCanvas());

    const systems = createSystemSet();
    systems.addCategories([{ name: 'Alpha', color: [255, 0, 0] }]);
    systems.addSystems([
      { name: 'Sol', coords: { x: 0, y: 0, z: 20 }, primaryCategory: 'Alpha' },
    ]);
    const shapes = createShapeSet(() => null);
    if (shapesHeld === 'both') {
      shapes.addSpheres([{ position: [0, 0, 400], radius: 200, color: [0, 255, 255] }]);
    }
    shapes.addLines([
      {
        points: [
          [0, 0, 0],
          [100, 0, 0],
        ],
        color: [0, 255, 0],
      },
    ]);
    renderer.setSystems(systems);
    renderer.setShapes(shapes);
    renderer.setRegionLines(regionLines());
    renderer.setGridDraw(true);

    renderer.render(closeView());

    const order: string[] = [];
    for (const sources of context.drawSources()) {
      const name = passOf(sources);
      if (name === 'other') continue;
      if (order[order.length - 1] === name) continue;
      order.push(name);
    }
    renderer.dispose();
    return { order, context };
  }

  test('draws the grid, the regions, the markers, the spheres and the lines', () => {
    const { order } = overlayOrder(['EXT_color_buffer_float', 'EXT_float_blend']);
    expect(order.filter((name) => name !== 'marker-range')).toEqual([
      'grid',
      'regions',
      'markers',
      'spheres',
      'lines',
    ]);
  });

  test('writes the range between the marker colours and the spheres', () => {
    const { order } = overlayOrder(['EXT_color_buffer_float', 'EXT_float_blend']);
    expect(order).toContain('marker-range');
    expect(order.indexOf('marker-range')).toBeGreaterThan(order.indexOf('markers'));
    expect(order.indexOf('marker-range')).toBeLessThan(order.indexOf('spheres'));
  });

  test('keeps the order and writes no range with one extension missing', () => {
    const { order, context } = overlayOrder(['EXT_color_buffer_float']);
    const gl = context.gl;
    expect(order).toEqual(['grid', 'regions', 'markers', 'spheres', 'lines']);
    // No range buffer means no clear of one and no second marker draw.
    expect(context.of('clearBufferfv')).toHaveLength(0);
    const formats = context.of('texImage2D').map((call) => call.args[2]);
    expect(formats).not.toContain(gl.R32F);
    // The scene targets are `RGBA16F`, which blends with this one extension, so the two
    // flags stay apart and the frame keeps its half-float targets.
    expect(formats).toContain(gl.RGBA16F);
  });

  test('takes the half-float targets and the range buffer with both', () => {
    const { context } = overlayOrder(['EXT_color_buffer_float', 'EXT_float_blend']);
    const gl = context.gl;
    const formats = context.of('texImage2D').map((call) => call.args[2]);
    expect(formats).toContain(gl.RGBA16F);
    expect(formats).toContain(gl.R32F);
    // The renderer clears the buffer itself, so a frame with a sphere and no marker reads
    // no marker of an older frame.
    expect(context.of('clearBufferfv')).toHaveLength(1);
  });

  // The line step caps its own wash over a marker body, and it reads the range buffer to
  // find one. A set of lines and no sphere is an ordinary set: the Adamastor demo set is
  // one. A range draw that followed the spheres alone would leave every line of such a set
  // free to take a marker off the screen.
  test('writes the range for a set of lines and no sphere', () => {
    const { order, context } = overlayOrder(
      ['EXT_color_buffer_float', 'EXT_float_blend'],
      'lines',
    );
    expect(order).toContain('marker-range');
    expect(order).not.toContain('spheres');
    expect(context.of('clearBufferfv')).toHaveLength(1);
  });

  // A shader the frame can never use is a compile and a link the page pays for at start.
  // The range draw is gated on the buffer, so a context with no buffer needs no program.
  test('compiles no range shader with one extension missing', () => {
    const { context } = overlayOrder(['EXT_color_buffer_float']);
    const sources = context.of('shaderSource').map((call) => String(call.args[1]));
    expect(sources.some((source) => source.includes('fragRange = vRange;'))).toBe(
      false,
    );
  });

  test('compiles the range shader with both extensions', () => {
    const { context } = overlayOrder(['EXT_color_buffer_float', 'EXT_float_blend']);
    const sources = context.of('shaderSource').map((call) => String(call.args[1]));
    expect(sources.some((source) => source.includes('fragRange = vRange;'))).toBe(true);
  });

  // The buffer takes the drawing buffer size on the first frame that draws a shape, so a
  // map with no shape holds the 2 x 2 it started at. A read of the canvas coordinate would
  // fall outside that, so the hook answers `null` instead.
  test('reads no range before the first frame that draws a shape', () => {
    (globalThis as { window?: unknown }).window = { devicePixelRatio: 1 };
    const context = fakeContext(['EXT_color_buffer_float', 'EXT_float_blend']);
    const renderer = createRenderer(context.gl, fakeCanvas());
    const systems = createSystemSet();
    systems.addCategories([{ name: 'Alpha', color: [255, 0, 0] }]);
    systems.addSystems([
      { name: 'Sol', coords: { x: 0, y: 0, z: 20 }, primaryCategory: 'Alpha' },
    ]);
    renderer.setSystems(systems);
    renderer.render(closeView());

    expect(renderer.rangeBufferSize()).toEqual([2, 2]);
    expect(renderer.readRange(0, 0)).toBeNull();
    renderer.dispose();
  });

  test('takes neither with no float extension at all', () => {
    const { context } = overlayOrder([]);
    const gl = context.gl;
    const formats = context.of('texImage2D').map((call) => call.args[2]);
    expect(formats).not.toContain(gl.RGBA16F);
    expect(formats).not.toContain(gl.R32F);
  });
});
