import { describe, expect, test } from 'vitest';
import type { RegionLines } from '../scene-data/types';
import {
  createRegionPass,
  REGION_CORE_COLOUR,
  REGION_CORE_WIDTH_CSS,
  REGION_FADE_IN_FAR,
  REGION_FADE_IN_NEAR,
  REGION_LINE_WIDTH_CSS,
  regionCoreLevel,
  regionFade,
} from './region-pass';
import type { RegionPrograms } from './region-pass';
import { REGION_OUTLINE_COLOUR } from './region-pass';

/** One call the pass made on the context. */
interface Call {
  readonly name: string;
  readonly args: readonly unknown[];
}

/** A context that records the calls the pass makes and gives every name a number. */
interface FakeContext {
  readonly gl: WebGL2RenderingContext;
  readonly calls: Call[];
  /** Sets the drawing buffer size the pass reads. */
  setDrawingBuffer(width: number, height: number): void;
  /** The calls of one name. */
  of(name: string): Call[];
}

function fakeContext(width: number, height: number): FakeContext {
  const calls: Call[] = [];
  const constants = new Map<string, number>();
  const state: Record<string, unknown> = {
    drawingBufferWidth: width,
    drawingBufferHeight: height,
  };

  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_state, key): unknown {
      if (typeof key !== 'string') return undefined;
      if (key in state) return state[key];
      // A name in capitals is one of the context's constants. Every name gets its own
      // number, so the pass cannot confuse two of them.
      if (/^[A-Z][A-Z0-9_]*$/.test(key)) {
        const held = constants.get(key);
        if (held !== undefined) return held;
        const next = constants.size + 1;
        constants.set(key, next);
        return next;
      }
      return (...args: unknown[]): unknown => {
        calls.push({ name: key, args });
        return key.startsWith('create') ? { name: key } : null;
      };
    },
  };

  return {
    gl: new Proxy(state, handler) as unknown as WebGL2RenderingContext,
    calls,
    setDrawingBuffer(nextWidth: number, nextHeight: number): void {
      state['drawingBufferWidth'] = nextWidth;
      state['drawingBufferHeight'] = nextHeight;
    },
    of(name: string): Call[] {
      return calls.filter((call) => call.name === name);
    },
  };
}

/** Two chains, one of three vertices and one of two. */
function twoChains(): RegionLines {
  const positions = new Float32Array([
    0, 0, 0, 100, 0, 0, 100, 0, 100, 500, 0, 500, 600, 0, 500,
  ]);
  return {
    chainCount: 2,
    vertexCount: 5,
    positions,
    first: Uint32Array.from([0, 3]),
    last: Uint32Array.from([2, 4]),
    pairs: Uint8Array.from([1, 2, 2, 3]),
  };
}

function fakePrograms(): RegionPrograms {
  const empty = { program: {} as WebGLProgram, uniforms: {} };
  return { ribbon: empty, composite: empty };
}

const FRAME = {
  viewProjection: new Float32Array(16),
  chunkOffset: [0, 0, 0] as const,
  fade: 1,
  pixelRatio: 1,
};

describe('the region overlay fade', () => {
  test('draws nothing at and above 30,000 light years', () => {
    expect(regionFade(REGION_FADE_IN_FAR)).toBe(0);
    expect(regionFade(60000)).toBe(0);
  });

  test('draws in full at and below 20,000 light years', () => {
    expect(regionFade(REGION_FADE_IN_NEAR)).toBe(1);
    expect(regionFade(10000)).toBe(1);
  });

  test('does not fade out at close zoom', () => {
    // Phase 2 removed the lines below 3,000 light years. The smoothed boundary does
    // not read as a staircase, so the lines now stay to the closest zoom.
    expect(regionFade(3000)).toBe(1);
    expect(regionFade(1500)).toBe(1);
    expect(regionFade(500)).toBe(1);
  });

  test('rises between the two distances', () => {
    const middle = regionFade((REGION_FADE_IN_FAR + REGION_FADE_IN_NEAR) / 2);
    expect(middle).toBeGreaterThan(0);
    expect(middle).toBeLessThan(1);
    expect(regionFade(22000)).toBeGreaterThan(regionFade(28000));
  });
});

describe('the two-tone line', () => {
  test('is four CSS pixels wide with a two pixel core', () => {
    expect(REGION_LINE_WIDTH_CSS).toBe(4);
    expect(REGION_CORE_WIDTH_CSS).toBe(2);
    // The coverage is 1 at the middle of the line and 0 at its edge, so the core edge
    // sits at half of it.
    expect(regionCoreLevel()).toBeCloseTo(0.5, 12);
  });

  test('has a core lighter than its outline', () => {
    const luminance = (colour: readonly [number, number, number]): number =>
      0.2126 * colour[0] + 0.7152 * colour[1] + 0.0722 * colour[2];
    expect(luminance(REGION_CORE_COLOUR)).toBeGreaterThan(
      luminance(REGION_OUTLINE_COLOUR) + 0.5,
    );
  });
});

describe('the coverage buffer', () => {
  test('follows the drawing buffer size', () => {
    const context = fakeContext(1280, 720);
    const pass = createRegionPass(
      context.gl,
      fakePrograms(),
      twoChains(),
      {} as WebGLVertexArrayObject,
    );

    // The overlay draws nothing at 30,000 light years and above, so the target takes
    // no storage before the first draw.
    expect(pass.coverageSize()).toBeNull();
    expect(context.of('texImage2D')).toHaveLength(0);

    pass.draw(FRAME);
    expect(pass.coverageSize()).toEqual([1280, 720]);
    const first = context.of('texImage2D');
    expect(first).toHaveLength(1);
    expect([(first[0] as Call).args[3], (first[0] as Call).args[4]]).toEqual([
      1280, 720,
    ]);

    context.setDrawingBuffer(1920, 1080);
    pass.draw(FRAME);
    expect(pass.coverageSize()).toEqual([1920, 1080]);
    const second = context.of('texImage2D');
    expect(second).toHaveLength(2);
    expect([(second[1] as Call).args[3], (second[1] as Call).args[4]]).toEqual([
      1920, 1080,
    ]);

    // A draw at an unchanged size takes no new storage.
    pass.draw(FRAME);
    expect(context.of('texImage2D')).toHaveLength(2);
  });

  test('clears before every draw and blends with the MAX equation', () => {
    const context = fakeContext(800, 600);
    const pass = createRegionPass(
      context.gl,
      fakePrograms(),
      twoChains(),
      {} as WebGLVertexArrayObject,
    );
    pass.draw(FRAME);

    expect(context.of('clear')).toHaveLength(1);
    const equations = context.of('blendEquation');
    expect(equations).toHaveLength(2);
    // The first call takes the largest coverage of the overlapping quads at a join.
    // The second puts the equation back for the passes that follow.
    expect((equations[0] as Call).args[0]).toBe(context.gl.MAX);
    expect((equations[1] as Call).args[0]).toBe(context.gl.FUNC_ADD);
  });
});

describe('the ribbon draw', () => {
  test('issues one instanced call per chain, with one instance per segment', () => {
    const context = fakeContext(800, 600);
    const lines = twoChains();
    const pass = createRegionPass(
      context.gl,
      fakePrograms(),
      lines,
      {} as WebGLVertexArrayObject,
    );
    pass.draw(FRAME);

    const draws = context.of('drawArraysInstanced');
    expect(draws).toHaveLength(lines.chainCount);
    expect(draws.map((call) => call.args[3])).toEqual([2, 1]);
    expect(draws.map((call) => call.args[1])).toEqual([0, 0]);
    expect(draws.map((call) => call.args[2])).toEqual([4, 4]);
  });

  test('reads the two endpoints of a segment one vertex apart', () => {
    const context = fakeContext(800, 600);
    const pass = createRegionPass(
      context.gl,
      fakePrograms(),
      twoChains(),
      {} as WebGLVertexArrayObject,
    );
    pass.draw(FRAME);

    // The set stores a shared vertex once, so the second endpoint is the same buffer
    // read 12 bytes further on.
    const pointers = context
      .of('vertexAttribPointer')
      .filter((call) => call.args[0] === 0 || call.args[0] === 1);
    const offsets = pointers.map((call) => [call.args[0], call.args[5]]);
    expect(offsets).toEqual([
      [0, 0],
      [1, 12],
      [0, 36],
      [1, 48],
    ]);
  });
});
