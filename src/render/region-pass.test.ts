import { describe, expect, test } from 'vitest';
import { arcSagitta, arcThrough } from '../scene-data/arc';
import { buildRegionLines } from '../scene-data/region-lines';
import type { RegionLines } from '../scene-data/types';
import {
  createRegionPass,
  REGION_CORE_COLOUR,
  REGION_CORE_WIDTH_CSS,
  REGION_FADE_IN_FAR,
  REGION_FADE_IN_NEAR,
  REGION_LINE_WIDTH_CSS,
  REGION_MAX_SUB_SEGMENTS,
  REGION_SUB_SEGMENT_SAGITTA_CSS,
  regionChainArcs,
  regionCoreLevel,
  regionFade,
  regionSubSegments,
  smallestLightYearsPerPixel,
} from './region-pass';
import type { RegionArc, RegionPrograms } from './region-pass';
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
    curvature: new Float32Array(5),
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
  lightYearsPerPixel: 1,
};

/** One chain of two vertices, joined by an arc of the given curvature. */
function oneArc(curvature: number): RegionLines {
  return {
    chainCount: 1,
    vertexCount: 2,
    positions: new Float32Array([0, 0, 0, 1000, 0, 0]),
    curvature: Float32Array.from([curvature, 0]),
    first: Uint32Array.from([0]),
    last: Uint32Array.from([1]),
    pairs: Uint8Array.from([1, 2]),
  };
}

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
  test('issues one instanced call per chain, with one instance per sub-chord', () => {
    const context = fakeContext(800, 600);
    const lines = twoChains();
    const pass = createRegionPass(
      context.gl,
      fakePrograms(),
      lines,
      {} as WebGLVertexArrayObject,
    );
    pass.draw(FRAME);

    // Every primitive of this set is straight, so each takes one sub-chord and the
    // instance count is the primitive count.
    const draws = context.of('drawArraysInstanced');
    expect(draws).toHaveLength(lines.chainCount);
    expect(draws.map((call) => call.args[3])).toEqual([2, 1]);
    expect(draws.map((call) => call.args[1])).toEqual([0, 0]);
    expect(draws.map((call) => call.args[2])).toEqual([4, 4]);
  });

  test('draws one instance per sub-chord of a curved chain', () => {
    const context = fakeContext(800, 600);
    const lines = oneArc(1 / 2000);
    const pass = createRegionPass(
      context.gl,
      fakePrograms(),
      lines,
      {} as WebGLVertexArrayObject,
    );
    pass.draw(FRAME);

    const sub = regionSubSegments(
      regionChainArcs(lines)[0] as RegionArc[],
      FRAME.lightYearsPerPixel,
    );
    expect(sub).toBeGreaterThan(1);
    const draws = context.of('drawArraysInstanced');
    expect(draws).toHaveLength(1);
    expect((draws[0] as Call).args[3]).toBe(sub);
  });

  test('reads the two endpoints and the curvature at the chain offset', () => {
    const context = fakeContext(800, 600);
    const pass = createRegionPass(
      context.gl,
      fakePrograms(),
      twoChains(),
      {} as WebGLVertexArrayObject,
    );
    pass.draw(FRAME);

    // The set stores a shared vertex once, so the second endpoint is the same buffer
    // read 12 bytes further on. The curvature is one value per vertex, so it binds at
    // the same vertex index as the positions, 4 bytes to the value.
    const pointers = context
      .of('vertexAttribPointer')
      .filter((call) => call.args[0] !== 2);
    const offsets = pointers.map((call) => [call.args[0], call.args[5]]);
    expect(offsets).toEqual([
      [0, 0],
      [1, 12],
      [3, 0],
      [0, 36],
      [1, 48],
      [3, 12],
    ]);
  });

  test('holds a primitive over its sub-chords with the divisor', () => {
    const context = fakeContext(800, 600);
    const lines = oneArc(1 / 2000);
    const pass = createRegionPass(
      context.gl,
      fakePrograms(),
      lines,
      {} as WebGLVertexArrayObject,
    );
    pass.draw(FRAME);

    const sub = regionSubSegments(
      regionChainArcs(lines)[0] as RegionArc[],
      FRAME.lightYearsPerPixel,
    );
    // The two endpoints and the curvature advance once every `sub` instances. The quad
    // corner stays at a divisor of 0, or the strip draws nothing.
    const divisors = context
      .of('vertexAttribDivisor')
      .map((call) => [call.args[0], call.args[1]]);
    expect(divisors).toEqual([
      [0, sub],
      [1, sub],
      [3, sub],
    ]);
    const corner = context
      .of('vertexAttribPointer')
      .filter((call) => call.args[0] === 2);
    expect(corner).toHaveLength(1);
  });
});

describe('the sub-chord count', () => {
  test('takes one sub-chord for a straight primitive at every zoom', () => {
    for (const perPixel of [0.01, 1, 100]) {
      expect(regionSubSegments([], perPixel)).toBe(1);
    }
  });

  test('grows with the radius at a fixed sub-angle', () => {
    // The sagitta is R (1 - cos(sub / 2)), so a wide gentle arc facets before a tight
    // one does. Two arcs of the same sweep therefore ask for different counts.
    const tight: RegionArc = { sweep: 0.5, radius: 2000 };
    const wide: RegionArc = { sweep: 0.5, radius: 20000 };
    expect(regionSubSegments([wide], 1)).toBeGreaterThan(regionSubSegments([tight], 1));
  });

  test('takes the worst arc of the chain and never exceeds the cap', () => {
    const tight: RegionArc = { sweep: 0.5, radius: 2000 };
    const wide: RegionArc = { sweep: 0.5, radius: 20000 };
    expect(regionSubSegments([tight, wide], 1)).toBe(regionSubSegments([wide], 1));
    expect(regionSubSegments([wide], 1e-9)).toBe(REGION_MAX_SUB_SEGMENTS);
  });

  test('holds every arc of every chain under a quarter of a CSS pixel over the zoom band', () => {
    const lines = buildRegionLines();
    const chains = regionChainArcs(lines);
    let worstCount = 0;
    let worstInstances = 0;
    let worstSagitta = 0;

    // The band the overlay draws in runs from the closest zoom to the distance the
    // fade reaches nothing at. The camera's height above the plane is what sets the
    // scale, and the lowest pitch the camera allows gives the smallest height.
    for (const [width, height] of [
      [1920, 1080],
      [1280, 720],
    ]) {
      for (const distance of [500, 1000, 2000, 5000, 10000, 20000, 30000]) {
        for (const pitch of [5, 10, 20, 35, 60, 89]) {
          const cameraHeight = distance * Math.sin((pitch * Math.PI) / 180);
          const perPixel = smallestLightYearsPerPixel(
            cameraHeight,
            width as number,
            height as number,
          );
          let instances = 0;
          for (let chain = 0; chain < lines.chainCount; chain += 1) {
            const sub = regionSubSegments(chains[chain] as RegionArc[], perPixel);
            if (sub > worstCount) worstCount = sub;
            instances +=
              ((lines.last[chain] as number) - (lines.first[chain] as number)) * sub;
            const first = lines.first[chain] as number;
            const last = lines.last[chain] as number;
            for (let vertex = first; vertex < last; vertex += 1) {
              const curvature = lines.curvature[vertex] as number;
              if (curvature === 0) continue;
              const arc = arcThrough(
                lines.positions[vertex * 3] as number,
                lines.positions[vertex * 3 + 2] as number,
                lines.positions[(vertex + 1) * 3] as number,
                lines.positions[(vertex + 1) * 3 + 2] as number,
                curvature,
              );
              const pixels = arcSagitta(arc, 1 / sub) / perPixel;
              if (pixels > worstSagitta) worstSagitta = pixels;
              expect(pixels).toBeLessThanOrEqual(REGION_SUB_SEGMENT_SAGITTA_CSS);
            }
          }
          if (instances > worstInstances) worstInstances = instances;
        }
      }
    }
    console.log('the sub-chord count over the band', {
      worstCount,
      worstInstances,
      worstSagitta,
    });
    // The cap is never reached inside the band, so the bound above holds everywhere.
    expect(worstCount).toBeLessThan(REGION_MAX_SUB_SEGMENTS);
  }, 120000);
});
