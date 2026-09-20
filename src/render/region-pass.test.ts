import { describe, expect, test } from 'vitest';
import type { RegionLines } from '../scene-data/types';
import {
  createRegionPass,
  createRegionPrograms,
  REGION_BAND_HALF_WIDTH_FLOOR_CSS,
  REGION_BAND_HALF_WIDTH_MAX_CSS,
  REGION_BAND_HALF_WIDTH_MIN_CSS,
  REGION_BAND_HALF_WIDTH_SHARE,
  REGION_CORE_EDGE_SHARE,
  REGION_CORE_SHARE,
  REGION_EDGE_SHARE,
  REGION_FADE_IN_FAR,
  REGION_FADE_IN_NEAR,
  REGION_LINE_OPACITY,
  REGION_RANGE_FULL,
  REGION_RANGE_NONE,
  REGION_TONE,
  REGION_TONE_CORE,
  REGION_WIDTH_RANGE,
  regionBandHalfWidthAtRange,
  regionBandHalfWidthCss,
  regionFade,
} from './region-pass';
import type { RegionPassFrame, RegionPrograms } from './region-pass';
import type { Program } from './program';
import ribbonVertexSource from './shaders/regions.vert?raw';
import ribbonFragmentSource from './shaders/regions.frag?raw';
import compositeSource from './shaders/region-composite.frag?raw';

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
  };
}

/**
 * One program whose uniform locations are their own names. The pass gives a location to
 * the context, so a test reads a call by the name it belongs to.
 */
function fakeProgram(names: readonly string[]): Program {
  const uniforms: Record<string, WebGLUniformLocation> = {};
  for (const name of names) {
    uniforms[name] = name as unknown as WebGLUniformLocation;
  }
  return { program: {} as WebGLProgram, uniforms };
}

function fakePrograms(): RegionPrograms {
  return {
    ribbon: fakeProgram([
      'uViewProjection',
      'uChunkOffset',
      'uTargetSize',
      'uBaseHalfWidth',
      'uFloorHalfWidth',
      'uReferenceRange',
    ]),
    composite: fakeProgram([
      'uCoverage',
      'uTone',
      'uToneCore',
      'uOpacity',
      'uEdgeShare',
      'uCoreEdge',
      'uInverseViewProjection',
      'uPlaneY',
      'uRangeNone',
      'uRangeFull',
    ]),
  };
}

/** The values one uniform of a name took over the calls of a draw. */
function uniformValues(context: FakeContext, call: string, name: string): unknown[] {
  return context
    .of(call)
    .filter((made) => made.args[0] === name)
    .map((made) => made.args[1]);
}

const FRAME: RegionPassFrame = {
  viewProjection: new Float32Array(16),
  inverseViewProjection: new Float32Array(16),
  planeY: 0,
  chunkOffset: [0, 0, 0] as const,
  fade: 1,
  pixelRatio: 1,
};

describe('the region overlay zoom fade', () => {
  test('draws nothing at and above 30,000 light years', () => {
    expect(regionFade(REGION_FADE_IN_FAR)).toBe(0);
    expect(regionFade(60000)).toBe(0);
  });

  test('draws in full at 20,000 light years and below', () => {
    expect(regionFade(REGION_FADE_IN_NEAR)).toBe(1);
    expect(regionFade(10000)).toBe(1);
    expect(regionFade(15000)).toBe(1);
  });

  test('holds no close zoom band', () => {
    // The range fade in the composite shader holds the close end, per pixel, so a
    // close zoom keeps the lines near the horizon and the zoom rule takes none away.
    expect(regionFade(5000)).toBe(1);
    expect(regionFade(4000)).toBe(1);
    expect(regionFade(500)).toBe(1);
    expect(regionFade(7500)).toBe(1);
  });

  test('falls across the far end of the band', () => {
    const middle = regionFade((REGION_FADE_IN_FAR + REGION_FADE_IN_NEAR) / 2);
    expect(middle).toBeCloseTo(0.5, 12);
    expect(regionFade(22000)).toBeCloseTo(0.896, 3);
    expect(regionFade(28000)).toBeCloseTo(0.104, 3);
    expect(regionFade(22000)).toBeGreaterThan(regionFade(28000));
  });
});

describe('the region overlay range fade', () => {
  test('takes away a line at 5,000 light years and draws it in full at 8,000', () => {
    // The fade moves in again, so the lines reach 3,000 light years nearer the camera
    // than they did and reach full 4,000 nearer. The band's width keeps its own
    // reference range of 12,000, so the two rules are two figures.
    expect(REGION_RANGE_NONE).toBe(5000);
    expect(REGION_RANGE_FULL).toBe(8000);
    expect(REGION_WIDTH_RANGE).toBe(12000);
    expect(REGION_WIDTH_RANGE).not.toBe(REGION_RANGE_FULL);
  });

  test('the zoom fade keeps its two figures', () => {
    // The range fade moved and the zoom fade did not.
    expect(REGION_FADE_IN_NEAR).toBe(20000);
    expect(REGION_FADE_IN_FAR).toBe(30000);
    expect(regionFade(20000)).toBe(1);
    expect(regionFade(30000)).toBe(0);
  });

  test('the composite shader reads the range of the plane point', () => {
    expect(compositeSource).toContain('uInverseViewProjection');
    expect(compositeSource).toContain('uPlaneY');
    expect(compositeSource).toContain('smoothstep(uRangeNone, uRangeFull, range)');
  });

  test('the composite program declares the four new uniforms', () => {
    const names: string[] = [];
    const gl = {
      createShader: () => ({}),
      shaderSource: () => undefined,
      compileShader: () => undefined,
      createProgram: () => ({}),
      attachShader: () => undefined,
      linkProgram: () => undefined,
      getProgramParameter: () => true,
      getShaderParameter: () => true,
      deleteShader: () => undefined,
      getUniformLocation: (_program: unknown, name: string) => {
        names.push(name);
        return {};
      },
    } as unknown as WebGL2RenderingContext;
    createRegionPrograms(gl);
    for (const name of [
      'uInverseViewProjection',
      'uPlaneY',
      'uRangeNone',
      'uRangeFull',
    ]) {
      expect(names).toContain(name);
    }
  });

  test('the draw gives the shader the two ranges and the plane', () => {
    const context = fakeContext(1280, 720);
    const pass = createRegionPass(
      context.gl,
      fakePrograms(),
      twoChains(),
      {} as WebGLVertexArrayObject,
    );
    pass.draw({ ...FRAME, planeY: -250 });
    expect(uniformValues(context, 'uniform1f', 'uRangeNone')).toContain(
      REGION_RANGE_NONE,
    );
    expect(uniformValues(context, 'uniform1f', 'uRangeFull')).toContain(
      REGION_RANGE_FULL,
    );
    expect(uniformValues(context, 'uniform1f', 'uPlaneY')).toContain(-250);
  });
});

/** The luminance of a tone, on the same scale the browser readings take. */
function luminance(colour: readonly [number, number, number]): number {
  return 0.2126 * colour[0] + 0.7152 * colour[1] + 0.0722 * colour[2];
}

describe('the near fade is gone', () => {
  test('no shader of the overlay names it', () => {
    // The zoom band takes the overlay away below 5,000 light years, which is above
    // every camera distance the per-pixel fade acted at, so it has nothing left to do.
    for (const source of [ribbonVertexSource, ribbonFragmentSource, compositeSource]) {
      expect(source).not.toContain('uNearFade');
      expect(source).not.toContain('nearFade');
    }
  });

  test('the ribbon program declares no such uniform', () => {
    const names: string[] = [];
    const gl = {
      createShader: () => ({}),
      shaderSource: () => undefined,
      compileShader: () => undefined,
      createProgram: () => ({}),
      attachShader: () => undefined,
      linkProgram: () => undefined,
      getProgramParameter: () => true,
      getShaderParameter: () => true,
      deleteShader: () => undefined,
      getUniformLocation: (_program: unknown, name: string) => {
        names.push(name);
        return {};
      },
    } as unknown as WebGL2RenderingContext;
    createRegionPrograms(gl);
    expect(names).not.toContain('uNearFade');
    expect(names).toContain('uBaseHalfWidth');
  });
});

describe('the boundary band', () => {
  test('carries a deeper outer tone and a lighter core', () => {
    expect(REGION_TONE).toEqual([0.74, 0.55, 0.43]);
    expect(REGION_TONE_CORE).toEqual([0.9, 0.79, 0.52]);
    // The delta states 0.581 and 0.794, which are these two readings cut to three
    // decimals.
    expect(luminance(REGION_TONE)).toBeCloseTo(0.5817, 4);
    expect(luminance(REGION_TONE_CORE)).toBeCloseTo(0.7939, 4);
    expect(REGION_LINE_OPACITY).toBe(0.62);
  });

  test('stands the core 0.132 of luminance above the outer part in the frame', () => {
    // Both tones lie over one background at one opacity, so the difference does not
    // follow the picture under the band.
    const apart = luminance(REGION_TONE_CORE) - luminance(REGION_TONE);
    expect(apart).toBeCloseTo(0.2122, 4);
    expect(apart * REGION_LINE_OPACITY).toBeCloseTo(0.132, 3);
  });

  test('holds the edge and the core as shares of the half width', () => {
    // The half width now follows the range, so a fixed CSS pixel edge would be a
    // different share of the band at every range and the band would change profile as it
    // narrows. Both are shares, so one profile holds at every width.
    expect(REGION_EDGE_SHARE).toBe(0.25);
    expect(REGION_CORE_SHARE).toBe(0.25);
    expect(REGION_CORE_EDGE_SHARE).toBe(0.087);
  });

  test('the composite program declares the core tone and the two shares', () => {
    const names: string[] = [];
    const gl = {
      createShader: () => ({}),
      shaderSource: () => undefined,
      compileShader: () => undefined,
      createProgram: () => ({}),
      attachShader: () => undefined,
      linkProgram: () => undefined,
      getProgramParameter: () => true,
      getShaderParameter: () => true,
      deleteShader: () => undefined,
      getUniformLocation: (_program: unknown, name: string) => {
        names.push(name);
        return {};
      },
    } as unknown as WebGL2RenderingContext;
    createRegionPrograms(gl);
    for (const name of ['uToneCore', 'uEdgeShare', 'uCoreEdge']) {
      expect(names).toContain(name);
    }
  });

  test('sends the core tone and the two shares to the composite', () => {
    const context = fakeContext(1920, 1080);
    const pass = createRegionPass(
      context.gl,
      fakePrograms(),
      twoChains(),
      {} as WebGLVertexArrayObject,
    );
    pass.draw(FRAME);
    const core = context
      .of('uniform3f')
      .find((call) => call.args[0] === 'uToneCore')?.args;
    expect(core?.slice(1)).toEqual([0.9, 0.79, 0.52]);
    // Both are constants, so the composite reads the same two at every viewport height.
    expect(uniformValues(context, 'uniform1f', 'uEdgeShare')[0]).toBeCloseTo(0.25, 12);
    expect(uniformValues(context, 'uniform1f', 'uCoreEdge')[0]).toBeCloseTo(0.087, 12);
  });

  test('gives the ribbon quad the same half width the ramp divides by', () => {
    // The quad reaches that end's own half width on each side of the segment, and the
    // ramp divides the gap by the same two numbers mixed by the same parameter, so the
    // quad covers the whole ramp and cuts none of it.
    expect(ribbonVertexSource).toContain('sideways * aCorner.y * halfHere');
    expect(ribbonVertexSource).toContain('mix(halfStart, halfEnd, aCorner.x)');
    expect(ribbonFragmentSource).toContain('mix(vHalfStart, vHalfEnd, part)');
    expect(ribbonFragmentSource).toContain('1.0 - gap / halfWidth');

    const context = fakeContext(1280, 720);
    const pass = createRegionPass(
      context.gl,
      fakePrograms(),
      twoChains(),
      {} as WebGLVertexArrayObject,
    );
    pass.draw({ ...FRAME, pixelRatio: 1 });
    pass.draw({ ...FRAME, pixelRatio: 2 });
    // The base half width follows the viewport in CSS pixels and the uniform is in
    // device pixels. At a ratio of 1 the buffer is 720 CSS rows, which gives 11.52. At a
    // ratio of 2 it is 360 CSS rows, where the floor of 8 acts, and 8 CSS pixels are 16
    // device pixels.
    expect(uniformValues(context, 'uniform1f', 'uBaseHalfWidth')).toEqual([11.52, 16]);
    // The floor is 2 CSS pixels, so it is 2 and then 4 device pixels.
    expect(uniformValues(context, 'uniform1f', 'uFloorHalfWidth')).toEqual([2, 4]);
  });

  test('writes the reference range from one constant and not a second literal', () => {
    // The shader takes the range through a uniform, so `REGION_WIDTH_RANGE` is the only
    // place the figure is written.
    expect(ribbonVertexSource).not.toContain('12000');
    const context = fakeContext(1280, 720);
    const pass = createRegionPass(
      context.gl,
      fakePrograms(),
      twoChains(),
      {} as WebGLVertexArrayObject,
    );
    pass.draw(FRAME);
    expect(uniformValues(context, 'uniform1f', 'uReferenceRange')).toEqual([
      REGION_WIDTH_RANGE,
    ]);
  });
});

describe('the band half width', () => {
  test('is 1.6 per cent of the viewport height, held between 8 and 24', () => {
    expect(REGION_BAND_HALF_WIDTH_SHARE).toBe(0.016);
    expect(REGION_BAND_HALF_WIDTH_MIN_CSS).toBe(8);
    expect(REGION_BAND_HALF_WIDTH_MAX_CSS).toBe(24);
    expect(regionBandHalfWidthCss(1080)).toBeCloseTo(17.28, 12);
    expect(regionBandHalfWidthCss(720)).toBeCloseTo(11.52, 12);
    // The floor acts at 500 CSS rows and below, and the ceiling at 1,500 and above.
    expect(regionBandHalfWidthCss(360)).toBe(8);
    expect(regionBandHalfWidthCss(500)).toBe(8);
    expect(regionBandHalfWidthCss(2160)).toBe(24);
    expect(regionBandHalfWidthCss(1500)).toBe(24);
  });

  test('gives the whole band the stated widths', () => {
    // The whole band is twice the half width: 34.56 CSS pixels at 1,080 rows, 23.04 at
    // 720 and 16 at 360.
    expect(2 * regionBandHalfWidthCss(1080)).toBeCloseTo(34.56, 12);
    expect(2 * regionBandHalfWidthCss(720)).toBeCloseTo(23.04, 12);
    expect(2 * regionBandHalfWidthCss(360)).toBe(16);
  });

  test('takes the floor at a viewport of no height', () => {
    expect(regionBandHalfWidthCss(0)).toBe(8);
    expect(regionBandHalfWidthCss(Number.NaN)).toBe(8);
  });

  test('never falls as the viewport grows', () => {
    let before = 0;
    for (let rows = 100; rows <= 3000; rows += 50) {
      const reading = regionBandHalfWidthCss(rows);
      expect(reading).toBeGreaterThanOrEqual(before);
      before = reading;
    }
  });
});

describe('the band width at a range', () => {
  test('keeps its own reference range', () => {
    // The fade now ends at 8,000 light years and the width still turns at 12,000. The
    // band is therefore at its widest over the whole of the fade band and past it, and
    // every reading below is what it was before the fade moved.
    const widthAt = (range: number): number =>
      2 * regionBandHalfWidthAtRange(1080, range);
    expect(widthAt(5000)).toBeCloseTo(34.6, 1);
    expect(widthAt(8000)).toBeCloseTo(34.6, 1);
    expect(widthAt(12000)).toBeCloseTo(34.6, 1);
    expect(widthAt(20000)).toBeCloseTo(20.7, 1);
    expect(widthAt(40000)).toBeCloseTo(10.4, 1);
    // No line changes width over the fade band.
    expect(widthAt(REGION_RANGE_NONE)).toBe(widthAt(REGION_RANGE_FULL));
  });

  test('holds the base width in and narrows as one over the range beyond it', () => {
    // The whole band at 1,080 CSS rows, where the base half width is 17.28. The band
    // keeps its base width at the reference range and nearer, and falls as 1 / range
    // beyond it. The tolerance is 0.05, which is tight enough that a wrong figure in the
    // spec fails this test.
    const widthAt = (range: number): number =>
      2 * regionBandHalfWidthAtRange(1080, range);
    expect(widthAt(8000)).toBeCloseTo(34.6, 1);
    expect(widthAt(12000)).toBeCloseTo(34.6, 1);
    expect(widthAt(20000)).toBeCloseTo(20.7, 1);
    expect(widthAt(30000)).toBeCloseTo(13.8, 1);
    expect(widthAt(40000)).toBeCloseTo(10.4, 1);
    expect(widthAt(60000)).toBeCloseTo(6.9, 1);
    for (const [range, stated] of [
      [8000, 34.6],
      [12000, 34.6],
      [20000, 20.7],
      [30000, 13.8],
      [40000, 10.4],
      [60000, 6.9],
    ] as const) {
      expect(Math.abs(widthAt(range) - stated)).toBeLessThanOrEqual(0.05);
    }
  });

  test('never grows above the base width, however near the point is', () => {
    for (const range of [1, 100, 1000, 4000, 8000, 12000]) {
      expect(regionBandHalfWidthAtRange(1080, range)).toBeCloseTo(17.28, 12);
    }
  });

  test('takes the floor of 2 CSS pixels at 103,680 light years', () => {
    expect(REGION_BAND_HALF_WIDTH_FLOOR_CSS).toBe(2);
    // 17.28 * 12000 / range is 2 at 103,680 light years, which is more than twice the
    // width of the mapped galaxy, so the floor holds a line drawn rather than sets it.
    expect(regionBandHalfWidthAtRange(1080, 103680)).toBeCloseTo(2, 9);
    expect(regionBandHalfWidthAtRange(1080, 200000)).toBe(2);
    expect(regionBandHalfWidthAtRange(1080, 1e9)).toBe(2);
  });

  test('follows the viewport height at every range', () => {
    // The floor of the base width acts at 360 CSS rows, so the base is 8 and the band
    // narrows from there.
    expect(regionBandHalfWidthAtRange(360, 12000)).toBeCloseTo(8, 12);
    expect(regionBandHalfWidthAtRange(360, 24000)).toBeCloseTo(4, 12);
    expect(regionBandHalfWidthAtRange(2160, 12000)).toBeCloseTo(24, 12);
    expect(regionBandHalfWidthAtRange(2160, 24000)).toBeCloseTo(12, 12);
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

    // The pass holds one full-resolution target, where it held three.
    pass.draw(FRAME);
    expect(pass.coverageSize()).toEqual([1280, 720]);
    expect(context.of('texImage2D')).toHaveLength(1);

    pass.draw(FRAME);
    const first = context.of('texImage2D');
    expect(first).toHaveLength(1);
    for (const call of first) {
      expect([call.args[3], call.args[4]]).toEqual([1280, 720]);
      // One channel: the coverage alone, now that the near fade is gone.
      expect(call.args[2]).toBe(context.gl.R8);
      expect(call.args[6]).toBe(context.gl.RED);
    }
    const filters = context
      .of('texParameteri')
      .filter(
        (call) =>
          call.args[1] === context.gl.TEXTURE_MIN_FILTER ||
          call.args[1] === context.gl.TEXTURE_MAG_FILTER,
      );
    expect(filters).toHaveLength(2);
    for (const call of filters) expect(call.args[2]).toBe(context.gl.LINEAR);

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

  test('holds one target over repeated draws', () => {
    const context = fakeContext(1280, 720);
    const pass = createRegionPass(
      context.gl,
      fakePrograms(),
      twoChains(),
      {} as WebGLVertexArrayObject,
    );
    pass.draw(FRAME);
    pass.draw(FRAME);
    expect(context.of('texImage2D')).toHaveLength(1);
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
    // The first call takes the largest coverage of the overlapping quads at a join. The
    // second call puts the equation back for the passes that follow.
    expect((equations[0] as Call).args[0]).toBe(context.gl.MAX);
    expect((equations[1] as Call).args[0]).toBe(context.gl.FUNC_ADD);
  });
});

describe('the pass no longer blurs', () => {
  test('no source of the overlay names a blur or a normalisation', () => {
    for (const source of [ribbonVertexSource, ribbonFragmentSource, compositeSource]) {
      expect(source).not.toContain('uPeak');
      expect(source).not.toContain('blur');
    }
  });

  test('the composite program declares no peak uniform', () => {
    const names: string[] = [];
    const gl = {
      createShader: () => ({}),
      shaderSource: () => undefined,
      compileShader: () => undefined,
      createProgram: () => ({}),
      attachShader: () => undefined,
      linkProgram: () => undefined,
      getProgramParameter: () => true,
      getShaderParameter: () => true,
      deleteShader: () => undefined,
      getUniformLocation: (_program: unknown, name: string) => {
        names.push(name);
        return {};
      },
    } as unknown as WebGL2RenderingContext;
    createRegionPrograms(gl);
    expect(names).not.toContain('uPeak');
    expect(names).not.toContain('uWeights');
    expect(names).not.toContain('uTaps');
  });

  test('draws the full-screen quad once, which is the composite alone', () => {
    const context = fakeContext(1280, 720);
    const pass = createRegionPass(
      context.gl,
      fakePrograms(),
      twoChains(),
      {} as WebGLVertexArrayObject,
    );
    pass.draw(FRAME);
    // A blurring pass drew the full-screen triangle three times: one on each axis and
    // the composite. It now draws it once.
    expect(context.of('drawArrays')).toHaveLength(1);
  });
});

describe('the flat top of the band', () => {
  test('reads the alpha and the two tones from the one coverage channel', () => {
    expect(compositeSource).toContain('texture(uCoverage, vTexture).r;');
    expect(compositeSource).toContain('smoothstep(0.0, uEdgeShare, coverage)');
    expect(compositeSource).toContain(
      'smoothstep(0.75 - uCoreEdge, 0.75 + uCoreEdge, coverage)',
    );
    expect(compositeSource).toContain('mix(uTone, uToneCore, core)');
  });
});

describe('the two shares of the coverage channel', () => {
  test('sends the same two shares at every viewport height', () => {
    // The composite reads one coverage channel and knows no half width, so a share is
    // the only form the profile can take. The pass therefore sends two constants.
    for (const rows of [360, 720, 1080, 2160]) {
      const context = fakeContext((rows * 16) / 9, rows);
      const pass = createRegionPass(
        context.gl,
        fakePrograms(),
        twoChains(),
        {} as WebGLVertexArrayObject,
      );
      pass.draw(FRAME);
      expect(uniformValues(context, 'uniform1f', 'uEdgeShare')).toEqual([0.25]);
      expect(uniformValues(context, 'uniform1f', 'uCoreEdge')).toEqual([0.087]);
    }
  });

  test('leaves the outer part a flat top at every half width', () => {
    // The edge takes a quarter of the half width, and the mix reaches the outer tone at
    // 0.75 minus the core edge of coverage, which is a gap of 0.337 of the half width.
    // The flat top between them is therefore 0.413 of the half width at every width.
    const coreEnds = 1 - (0.75 - REGION_CORE_EDGE_SHARE);
    expect(coreEnds).toBeCloseTo(0.337, 3);
    expect(1 - REGION_EDGE_SHARE - coreEnds).toBeCloseTo(0.413, 3);
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
