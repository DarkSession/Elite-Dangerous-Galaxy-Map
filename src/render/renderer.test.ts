import { afterEach, describe, expect, test } from 'vitest';
import { createRangeBuffer, RANGE_EMPTY, readsFloatTargets } from './buffers';
import { createFrameAccumulator, createRenderer } from './renderer';
import { createShapeSet } from '../scene-data/shapes';
import { createSystemSet } from '../scene-data/real-systems';
import type { View } from '../camera/view';
import { buildNebulaSet } from '../scene-data/nebulae';
import type { NebulaSet } from '../scene-data/nebulae';
import { createNebulaPass, createNebulaProgram } from './nebula-pass';
import type { NebulaVolumeTextures } from './nebula-volumes';
import {
  DEFAULT_NEBULA_LIGHT_GAIN,
  DEFAULT_NEBULA_OCCLUSION,
  DEFAULT_NEBULA_STEP_RATE,
} from './nebula-slot';
import type { NebulaDraw, NebulaFrame } from './nebula-slot';
import type { CloudSet, DensityVolume, RegionLines } from '../scene-data/types';

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
  let framebuffer: unknown = null;
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
      case 'bindFramebuffer':
        framebuffer = args[1];
        return null;
      // The nebula pass reads the binding it has to put back, so the fake answers that
      // one read with the framebuffer it holds rather than with a number.
      case 'getParameter':
        if (args[0] === constants.get('FRAMEBUFFER_BINDING')) return framebuffer;
        return Float32Array.from([1, 1023]);
      case 'shaderSource':
        shaders.set(args[0], args[1] as string);
        return null;
      // The location of a uniform is its own name, so a test can read the value a pass
      // sent for one name rather than reading a list of calls to null.
      case 'getUniformLocation':
        return args[1];
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

/** A one-texel density volume, which is enough to make the cloud pass draw. */
function tinyVolume(): DensityVolume {
  return {
    size: [1, 1, 1],
    origin: [-100, -100, -100],
    extent: [200, 200, 200],
    lo: -10,
    hi: 0,
    epsilon: 1e-6,
    data: Uint8Array.from([128]),
  };
}

/** One cloud sample at the cursor. */
function oneCloud(): CloudSet {
  return {
    count: 1,
    positions: Float32Array.from([0, 0, 0]),
    tints: Uint8Array.from([128]),
    radii: Float32Array.from([1000]),
    ratios: Float32Array.from([1e-3]),
  };
}

/** One nebula at the cursor, large enough to pass the size floor at 12,000 ly. */
function oneNebula(): NebulaSet {
  return buildNebulaSet({
    records: [[0, 0, 0, 200, 0, 0, 0, 0, 'one']],
  });
}

/** One uploaded asset, which the pass binds and reads nothing of. */
function oneVolume(): NebulaVolumeTextures {
  return {
    assets: [
      {
        name: 'one',
        density: { name: 'density' } as unknown as WebGLTexture,
        colour: { name: 'colour' } as unknown as WebGLTexture,
        transfer: { name: 'transfer' } as unknown as WebGLTexture,
        densitySide: 32,
        colourSide: 8,
      },
    ],
    dispose: (): void => undefined,
  };
}

/** A draw that draws nothing and counts how many times it was freed. */
function countingDraw(): NebulaDraw & { disposals(): number } {
  let freed = 0;
  return {
    draw: (): void => undefined,
    drawnCount: 0,
    drawCalls: 0,
    aboveFloorCount: 0,
    coveredArea: 0,
    dispose(): void {
      freed += 1;
    },
    disposals(): number {
      return freed;
    },
  };
}

/**
 * The draw a nebula source builds. The renderer takes the draw and not the records and
 * the art, so the test builds it here the way `src/nebulae/index.ts` builds it.
 */
function nebulaDrawOf(gl: WebGL2RenderingContext): NebulaDraw {
  return createNebulaPass(gl, createNebulaProgram(gl), oneNebula(), oneVolume());
}

/**
 * The pass a draw belongs to, read from the shaders its program was linked from.
 *
 * The nebula test runs first and names a uniform the nebula program alone carries: the
 * nebula program also carries `uAbsorption`, because its vertex stage marches the same
 * volume, so the `volume` branch would answer for it.
 */
function scenePassOf(sources: readonly string[]): string {
  const source = sources.join('\n');
  if (source.includes('uAccumulated')) return 'nebula-composite';
  if (source.includes('uNebulaTransfer')) return 'nebulae';
  if (source.includes('uSpreadPower')) return 'clouds';
  if (source.includes('uAbsorption')) return 'volume';
  return 'other';
}

describe('the nebula pass in the frame', () => {
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  /** Draws one frame with the volume, the clouds and the nebulae all held. */
  function sceneFrame(distance: number): {
    context: FakeContext;
    renderer: ReturnType<typeof createRenderer>;
    order: string[];
  } {
    (globalThis as { window?: unknown }).window = { devicePixelRatio: 1 };
    const context = fakeContext(['EXT_color_buffer_float', 'EXT_float_blend']);
    const renderer = createRenderer(context.gl, fakeCanvas());
    renderer.setVolume(tinyVolume());
    renderer.setCloudSet(oneCloud());
    renderer.setNebulae(nebulaDrawOf(context.gl));
    renderer.render({ cursor: [0, 0, 0], distance, yaw: 0, pitch: 30 });
    const order = context
      .drawSources()
      .map(scenePassOf)
      .filter((name) => name !== 'other');
    return { context, renderer, order };
  }

  test('carries a light gain and a step rate, which the caller may change', () => {
    const { renderer } = sceneFrame(12000);
    expect(renderer.look.nebulaLightGain).toEqual([...DEFAULT_NEBULA_LIGHT_GAIN]);
    expect(renderer.look.nebulaStepRate).toBe(DEFAULT_NEBULA_STEP_RATE);
    renderer.look.nebulaLightGain = [3.5, 3.5, 3.5];
    renderer.look.nebulaStepRate = 25;
    expect(renderer.look.nebulaLightGain).toEqual([3.5, 3.5, 3.5]);
    expect(renderer.look.nebulaStepRate).toBe(25);
    renderer.dispose();
  });

  test('composites after the cloud sprites, into the same target', () => {
    const { context, renderer, order } = sceneFrame(12000);
    // The records draw into the pass's own accumulation target, and the composite then
    // applies that target to the half-resolution one.
    expect(order).toEqual(['volume', 'clouds', 'nebulae', 'nebula-composite']);

    // The framebuffer bound at the composite draw is the one bound at the cloud draw,
    // so the nebulae join the volume and the clouds in the half-resolution target and
    // the glow reads all three. The records draw into a target of their own.
    let bound: unknown = 'none';
    const targets = new Map<string, unknown>();
    let drawIndex = 0;
    const names = context.drawSources().map(scenePassOf);
    for (const call of context.calls) {
      if (call.name === 'bindFramebuffer') bound = call.args[1];
      if (
        call.name === 'drawArrays' ||
        call.name === 'drawArraysInstanced' ||
        call.name === 'drawElements'
      ) {
        const name = names[drawIndex] as string;
        if (name !== 'other' && !targets.has(name)) targets.set(name, bound);
        drawIndex += 1;
      }
    }
    expect(targets.get('nebula-composite')).toBe(targets.get('clouds'));
    expect(targets.get('nebula-composite')).toBe(targets.get('volume'));
    expect(targets.get('nebulae')).not.toBe(targets.get('clouds'));
    renderer.dispose();
  });

  // The accumulation target of the nebula pass has to hold what the half-resolution
  // target holds, so the renderer names the flag it built that target with and the pass
  // does not read the context again.
  test('gives the nebulae the number format it built its own targets with', () => {
    for (const float of [true, false]) {
      (globalThis as { window?: unknown }).window = { devicePixelRatio: 1 };
      const context = fakeContext(
        float ? ['EXT_color_buffer_float', 'EXT_float_blend'] : [],
      );
      const frames: NebulaFrame[] = [];
      const renderer = createRenderer(context.gl, fakeCanvas());
      renderer.setNebulae({
        draw(frame: NebulaFrame): void {
          frames.push(frame);
        },
        drawnCount: 0,
        drawCalls: 0,
        aboveFloorCount: 0,
        coveredArea: 0,
        dispose: (): void => undefined,
      });
      renderer.render({ cursor: [0, 0, 0], distance: 12000, yaw: 0, pitch: 30 });

      expect(frames[0]?.floatTarget).toBe(float);
      // The first image the renderer allocates is the half-resolution target, at the
      // 2 by 2 it starts from. The frame names the format of that image.
      // The first four-channel image the renderer allocates is the half-resolution
      // target, at the 2 by 2 it starts from. The range buffer is one channel and comes
      // before it, so the search names the format as well as the size.
      const half = context
        .of('texImage2D')
        .find((call) => call.args[6] === context.gl.RGBA)?.args;
      expect([half?.[3], half?.[4]]).toEqual([2, 2]);
      expect(half?.[2]).toBe(float ? context.gl.RGBA16F : context.gl.RGBA8);
      renderer.dispose();
    }
  });

  test('reports the drawn count and the one draw call', () => {
    const { renderer } = sceneFrame(12000);
    expect(renderer.nebulaDrawnCount()).toBe(1);
    expect(renderer.nebulaDrawCalls()).toBe(1);
    renderer.dispose();
  });

  test('draws nothing at the default view, where the zoom weight is 0', () => {
    const { renderer, order } = sceneFrame(60000);
    expect(order).not.toContain('nebulae');
    // The target, the clear and the composite go with the record draws.
    expect(order).not.toContain('nebula-composite');
    expect(renderer.nebulaDrawnCount()).toBe(0);
    expect(renderer.nebulaDrawCalls()).toBe(0);
    renderer.dispose();
  });

  // The set arrives from a fetch, so the first frames draw before it is there.
  test('draws nothing and reports no error before the set arrives', () => {
    (globalThis as { window?: unknown }).window = { devicePixelRatio: 1 };
    const context = fakeContext(['EXT_color_buffer_float', 'EXT_float_blend']);
    const renderer = createRenderer(context.gl, fakeCanvas());
    renderer.setVolume(tinyVolume());
    renderer.setCloudSet(oneCloud());
    expect(() =>
      renderer.render({ cursor: [0, 0, 0], distance: 12000, yaw: 0, pitch: 30 }),
    ).not.toThrow();
    const order = context.drawSources().map(scenePassOf);
    expect(order).toContain('clouds');
    expect(order).not.toContain('nebulae');
    expect(order).not.toContain('nebula-composite');
    expect(renderer.nebulaDrawnCount()).toBe(0);
    expect(renderer.nebulaDrawCalls()).toBe(0);
    renderer.dispose();
  });

  test('draws nothing while the switch is off', () => {
    (globalThis as { window?: unknown }).window = { devicePixelRatio: 1 };
    const context = fakeContext(['EXT_color_buffer_float', 'EXT_float_blend']);
    const renderer = createRenderer(context.gl, fakeCanvas());
    renderer.setVolume(tinyVolume());
    renderer.setNebulae(nebulaDrawOf(context.gl));
    renderer.setPasses({ nebulae: false });
    renderer.render({ cursor: [0, 0, 0], distance: 12000, yaw: 0, pitch: 30 });
    const order = context.drawSources().map(scenePassOf);
    // The switch skips the accumulation target, the clear and the composite with the
    // record draws, so a frame with the nebulae off pays for none of them.
    expect(order).not.toContain('nebulae');
    expect(order).not.toContain('nebula-composite');
    expect(renderer.nebulaDrawnCount()).toBe(0);
    renderer.dispose();
  });

  // The renderer owns the draw the source built and frees it. A second `setNebulae`
  // replaces the draw, so the first one must be freed there as well: the draw holds a
  // program, a texture, two buffers and a vertex array.
  test('frees the draw it holds, on a second call and on dispose', () => {
    (globalThis as { window?: unknown }).window = { devicePixelRatio: 1 };
    const context = fakeContext(['EXT_color_buffer_float', 'EXT_float_blend']);
    const renderer = createRenderer(context.gl, fakeCanvas());
    const first = countingDraw();
    const second = countingDraw();

    renderer.setNebulae(first);
    expect(first.disposals()).toBe(0);

    renderer.setNebulae(second);
    expect(first.disposals()).toBe(1);
    expect(second.disposals()).toBe(0);

    renderer.dispose();
    expect(second.disposals()).toBe(1);
    // The old draw is freed once and not again.
    expect(first.disposals()).toBe(1);
  });

  // The glow reads the half-resolution target, so it must run in a frame where the
  // nebulae drew and the volume and the clouds did not.
  test('runs the glow when the nebulae drew alone', () => {
    (globalThis as { window?: unknown }).window = { devicePixelRatio: 1 };
    const context = fakeContext(['EXT_color_buffer_float', 'EXT_float_blend']);
    const renderer = createRenderer(context.gl, fakeCanvas());
    renderer.setVolume(tinyVolume());
    renderer.setNebulae(nebulaDrawOf(context.gl));
    renderer.setPasses({ volume: false, clouds: false, nebulae: true, glow: true });
    renderer.render({ cursor: [0, 0, 0], distance: 12000, yaw: 0, pitch: 30 });
    const glowDraws = context
      .drawSources()
      .filter((sources) => sources.join('\n').includes('uClamp')).length;
    expect(glowDraws).toBeGreaterThan(0);
    renderer.dispose();
  });
});

describe('the volume texture the renderer owns', () => {
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  /** A renderer with the volume, the detail grid and one nebula in place. */
  function withVolume(): {
    context: FakeContext;
    renderer: ReturnType<typeof createRenderer>;
  } {
    (globalThis as { window?: unknown }).window = { devicePixelRatio: 1 };
    const context = fakeContext(['EXT_color_buffer_float', 'EXT_float_blend']);
    const renderer = createRenderer(context.gl, fakeCanvas());
    renderer.setVolume(tinyVolume());
    renderer.setNebulae(nebulaDrawOf(context.gl));
    return { context, renderer };
  }

  /** The value one uniform name carried in the last call that set it. */
  function uniformOf(context: FakeContext, name: string): unknown {
    const calls = context.calls.filter(
      (call) => call.name.startsWith('uniform') && call.args[0] === name,
    );
    return calls[calls.length - 1]?.args[1];
  }

  test('uploads the volume once and gives the one texture to both passes', () => {
    const { context, renderer } = withVolume();
    expect(context.of('texStorage3D')).toHaveLength(1);

    const before = context.calls.length;
    renderer.render({ cursor: [0, 0, 0], distance: 12000, yaw: 0, pitch: 30 });
    const gl = context.gl;
    const bound = context.calls
      .slice(before)
      .filter(
        (call) =>
          call.name === 'bindTexture' &&
          call.args[0] === gl.TEXTURE_3D &&
          call.args[1] !== null,
      )
      .map((call) => call.args[1]);
    // Three 3D textures reach the card: the galaxy volume, and the density and colour
    // of the one asset the nebula draws. The volume is the one both passes bind, and it
    // is one texture and not a copy for each.
    const times = new Map<unknown, number>();
    for (const texture of bound) times.set(texture, (times.get(texture) ?? 0) + 1);
    expect(times.size).toBe(3);
    expect([...times.values()].filter((count) => count === 2)).toHaveLength(1);
    renderer.dispose();
  });

  test('frees the old texture when the volume is replaced', () => {
    const { context, renderer } = withVolume();
    const before = context.of('deleteTexture').length;
    renderer.setVolume(tinyVolume());

    expect(context.of('texStorage3D')).toHaveLength(2);
    expect(context.of('deleteTexture').length).toBe(before + 1);
    renderer.dispose();
  });

  // A nebula must not be dimmed by material the frame does not draw.
  test('sends an occlusion of 0 while the volume pass is off', () => {
    const { context, renderer } = withVolume();
    renderer.setPasses({ volume: false });
    renderer.render({ cursor: [0, 0, 0], distance: 12000, yaw: 0, pitch: 30 });

    expect(uniformOf(context, 'uOcclusion')).toBe(0);
    renderer.dispose();
  });

  test('carries an occlusion of its own, at 1, which the caller may change', () => {
    const { context, renderer } = withVolume();
    expect(renderer.look.nebulaOcclusion).toBe(DEFAULT_NEBULA_OCCLUSION);
    renderer.render({ cursor: [0, 0, 0], distance: 12000, yaw: 0, pitch: 30 });
    expect(uniformOf(context, 'uOcclusion')).toBe(1);

    renderer.setNebulaOcclusion(0.25);
    renderer.render({ cursor: [0, 0, 0], distance: 12000, yaw: 0, pitch: 30 });
    expect(uniformOf(context, 'uOcclusion')).toBe(0.25);
    renderer.dispose();
  });

  // The look settings are a handle the caller may write to in place, so the rule runs
  // where the uniform is set. A rule in the setter alone is gone around by a write
  // straight onto `debug.look`.
  test('takes the default for a value outside the range, by either route', () => {
    const { context, renderer } = withVolume();
    for (const value of [-0.5, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      renderer.setNebulaOcclusion(value);
      renderer.render({ cursor: [0, 0, 0], distance: 12000, yaw: 0, pitch: 30 });
      expect(uniformOf(context, 'uOcclusion')).toBe(DEFAULT_NEBULA_OCCLUSION);

      renderer.look.nebulaOcclusion = value;
      renderer.render({ cursor: [0, 0, 0], distance: 12000, yaw: 0, pitch: 30 });
      expect(uniformOf(context, 'uOcclusion')).toBe(DEFAULT_NEBULA_OCCLUSION);
    }
    renderer.dispose();
  });

  // The nebulae may attach before the volume arrives, so the pass takes the texture per
  // frame and a frame without one sends no extinction.
  test('sends an occlusion of 0 before the volume arrives', () => {
    (globalThis as { window?: unknown }).window = { devicePixelRatio: 1 };
    const context = fakeContext(['EXT_color_buffer_float', 'EXT_float_blend']);
    const renderer = createRenderer(context.gl, fakeCanvas());
    renderer.setNebulae(nebulaDrawOf(context.gl));
    renderer.render({ cursor: [0, 0, 0], distance: 12000, yaw: 0, pitch: 30 });

    expect(renderer.nebulaDrawnCount()).toBe(1);
    expect(uniformOf(context, 'uOcclusion')).toBe(0);
    renderer.dispose();
  });
});
