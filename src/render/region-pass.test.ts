import { describe, expect, test } from 'vitest';
import type { RegionLines } from '../scene-data/types';
import {
  createRegionPass,
  createRegionPrograms,
  REGION_BLUR_MAX_RADIUS_CSS,
  REGION_BLUR_MIN_RADIUS_CSS,
  REGION_CELL_LY,
  REGION_CLOSE_FULL,
  REGION_CLOSE_NONE,
  REGION_FADE_IN_FAR,
  REGION_FADE_IN_NEAR,
  REGION_LINE_OPACITY,
  REGION_LINE_WIDTH_CSS,
  REGION_TONE,
  regionBlurKernel,
  regionBlurPeak,
  regionBlurRadiusCss,
  regionBlurRuns,
  regionBlurTaps,
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
      'uHalfWidth',
    ]),
    blur: fakeProgram(['uCoverage', 'uStep', 'uTaps', 'uWeights']),
    composite: fakeProgram(['uCoverage', 'uTone', 'uOpacity', 'uPeak']),
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
  chunkOffset: [0, 0, 0] as const,
  fade: 1,
  pixelRatio: 1,
  focalCss: 935.3074361,
  distance: 12000,
  traced: false,
};

/** The same two chains as a traced set: the same chain count, other positions. */
function twoTracedChains(): RegionLines {
  const positions = new Float32Array([
    0, 0, 0, 100, 0, 0, 100, 0, 100, 500, 0, 500, 600, 0, 500,
  ]);
  for (let index = 0; index < positions.length; index += 1) {
    positions[index] = (positions[index] as number) + 7;
  }
  return {
    chainCount: 2,
    vertexCount: 5,
    positions,
    first: Uint32Array.from([0, 3]),
    last: Uint32Array.from([2, 4]),
  };
}

describe('the region overlay fade', () => {
  test('draws nothing at and above 30,000 light years', () => {
    expect(regionFade(REGION_FADE_IN_FAR)).toBe(0);
    expect(regionFade(60000)).toBe(0);
  });

  test('draws in full from 10,000 to 20,000 light years', () => {
    expect(regionFade(REGION_FADE_IN_NEAR)).toBe(1);
    expect(regionFade(REGION_CLOSE_FULL)).toBe(1);
    expect(regionFade(15000)).toBe(1);
  });

  test('fades out below 10,000 light years and is gone at 5,000', () => {
    // The traced staircase steps about 9 CSS pixels at 5,000 light years and grows
    // from there, so the overlay leaves the frame below the band.
    expect(regionFade(REGION_CLOSE_NONE)).toBe(0);
    expect(regionFade(4000)).toBe(0);
    expect(regionFade(500)).toBe(0);
    expect(regionFade(7500)).toBeCloseTo(0.5, 12);
    expect(regionFade(6000)).toBeCloseTo(0.104, 3);
    expect(regionFade(8000)).toBeCloseTo(0.648, 3);
    expect(regionFade(25000)).toBeGreaterThan(0);
    expect(regionFade(25000)).toBeLessThan(1);
    expect(regionFade(30000)).toBe(0);
  });

  test('rises between the two distances', () => {
    const middle = regionFade((REGION_FADE_IN_FAR + REGION_FADE_IN_NEAR) / 2);
    expect(middle).toBeGreaterThan(0);
    expect(middle).toBeLessThan(1);
    expect(regionFade(22000)).toBeGreaterThan(regionFade(28000));
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
    expect(names).toContain('uHalfWidth');
  });
});

describe('the boundary band', () => {
  test('is one warm tone above every part of the frame but the core', () => {
    // The band lightens what it crosses, so it needs no darker edge to be seen.
    expect(luminance(REGION_TONE)).toBeCloseTo(0.755, 3);
    expect(REGION_TONE).toEqual([0.86, 0.74, 0.6]);
    expect(REGION_LINE_OPACITY).toBe(0.55);
  });

  test('gives the ribbon quad the same half width the ramp divides by', () => {
    // The quad reaches the half width on each side of the segment and the ramp divides
    // the gap by the same uniform, so the quad covers the whole ramp and cuts none of it.
    expect(REGION_LINE_WIDTH_CSS).toBe(6);
    expect(ribbonVertexSource).toContain('sideways * aCorner.y * uHalfWidth');
    expect(ribbonFragmentSource).toContain('1.0 - gap / uHalfWidth');

    const context = fakeContext(1280, 720);
    const pass = createRegionPass(
      context.gl,
      fakePrograms(),
      twoChains(),
      {} as WebGLVertexArrayObject,
    );
    pass.draw({ ...FRAME, pixelRatio: 1 });
    pass.draw({ ...FRAME, pixelRatio: 2 });
    // The uniform is in device pixels, so it follows the display.
    expect(uniformValues(context, 'uniform1f', 'uHalfWidth')).toEqual([
      REGION_LINE_WIDTH_CSS / 2,
      (REGION_LINE_WIDTH_CSS / 2) * 2,
    ]);
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

    // `simplified` never blurs, so one target takes storage and the ping-pong pair the
    // blur reads and writes takes none.
    pass.draw(FRAME);
    expect(pass.coverageSize()).toEqual([1280, 720]);
    expect(context.of('texImage2D')).toHaveLength(1);

    // The traced set at this zoom blurs, so the pair takes its storage here.
    pass.draw({ ...FRAME, traced: true });
    const first = context.of('texImage2D');
    expect(first).toHaveLength(3);
    for (const call of first) {
      expect([call.args[3], call.args[4]]).toEqual([1280, 720]);
      // One channel: the coverage alone, now that the near fade is gone.
      expect(call.args[2]).toBe(context.gl.R8);
      expect(call.args[6]).toBe(context.gl.RED);
    }
    // The blur steps one CSS pixel, which is not a whole texel above a ratio of 1, so
    // every target filters linearly.
    const filters = context
      .of('texParameteri')
      .filter(
        (call) =>
          call.args[1] === context.gl.TEXTURE_MIN_FILTER ||
          call.args[1] === context.gl.TEXTURE_MAG_FILTER,
      );
    expect(filters).toHaveLength(6);
    for (const call of filters) expect(call.args[2]).toBe(context.gl.LINEAR);

    context.setDrawingBuffer(1920, 1080);
    pass.draw({ ...FRAME, traced: true });
    expect(pass.coverageSize()).toEqual([1920, 1080]);
    const second = context.of('texImage2D');
    expect(second).toHaveLength(6);
    for (const call of second.slice(3)) {
      expect([call.args[3], call.args[4]]).toEqual([1920, 1080]);
    }

    // A draw at an unchanged size takes no new storage.
    pass.draw({ ...FRAME, traced: true });
    expect(context.of('texImage2D')).toHaveLength(6);
  });

  test('gives the blur pair no storage in the mode that never blurs', () => {
    const context = fakeContext(1280, 720);
    const pass = createRegionPass(
      context.gl,
      fakePrograms(),
      twoChains(),
      {} as WebGLVertexArrayObject,
    );

    // `simplified` is the mode the map starts in, and it blurs at no zoom. A run of
    // draws in it therefore holds one full-resolution target and not three.
    for (const distance of [20000, 12000, 8000, 6000]) {
      pass.draw({ ...FRAME, distance });
    }
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

/** The focal length of a frame, in CSS pixels, at a height in CSS rows. */
function focalOf(rows: number): number {
  return rows / 2 / Math.tan(Math.PI / 6);
}

/** A frame at a height and a zoom distance. */
function frameAt(rows: number, distance: number, traced = true): RegionPassFrame {
  return { ...FRAME, focalCss: focalOf(rows), distance, traced };
}

/** The blur radius the pass reads from a frame. */
function radiusOf(frame: RegionPassFrame): number {
  return regionBlurRadiusCss(frame.focalCss, frame.distance, frame.traced);
}

/** The zoom distance at which the radius falls to the least the pass blurs at. */
function thresholdAt(rows: number): number {
  return (focalOf(rows) * REGION_CELL_LY) / REGION_BLUR_MIN_RADIUS_CSS;
}

describe('the blur radius', () => {
  test('is the region grid cell on the screen, capped at 8 CSS pixels', () => {
    expect(focalOf(1080)).toBeCloseTo(935.31, 2);
    expect(radiusOf(frameAt(1080, 5000))).toBe(REGION_BLUR_MAX_RADIUS_CSS);
    expect(radiusOf(frameAt(1080, 5770))).toBeCloseTo(8, 2);
    expect(radiusOf(frameAt(1080, 8000))).toBeCloseTo(5.77, 2);
    expect(radiusOf(frameAt(1080, 10000))).toBeCloseTo(4.62, 2);
    expect(radiusOf(frameAt(1080, 12000))).toBeCloseTo(3.85, 2);
  });

  test('takes the blur below about 15,390 light years at 1,080 rows and no higher', () => {
    expect(regionBlurRuns(radiusOf(frameAt(1080, 15000)))).toBe(true);
    expect(regionBlurRuns(radiusOf(frameAt(1080, 15390)))).toBe(false);
    expect(regionBlurRuns(radiusOf(frameAt(1080, 20000)))).toBe(false);
    expect(thresholdAt(1080)).toBeGreaterThan(15380);
    expect(thresholdAt(1080)).toBeLessThan(15390);
  });

  test('is smaller at 720 rows, where the buffer is shorter', () => {
    expect(focalOf(720)).toBeCloseTo(623.54, 2);
    expect(radiusOf(frameAt(720, 6000))).toBeCloseTo(5.13, 2);
    expect(radiusOf(frameAt(720, 8000))).toBeCloseTo(3.85, 2);
    expect(radiusOf(frameAt(720, 10000))).toBeCloseTo(3.08, 2);
    expect(thresholdAt(720)).toBeGreaterThan(10250);
    expect(thresholdAt(720)).toBeLessThan(10270);

    // The cap is reached at about 3,846 light years here, which is below the band, so
    // it never acts at this height.
    const capped = (focalOf(720) * REGION_CELL_LY) / REGION_BLUR_MAX_RADIUS_CSS;
    expect(capped).toBeGreaterThan(3800);
    expect(capped).toBeLessThan(REGION_CLOSE_NONE);
  });

  test('blurs over the whole close part of the band at both heights', () => {
    // The fade first leaves 0.1 of the opacity at about 5,980 light years, and the
    // threshold of each height is past the 10,000 the fade reaches full opacity at.
    expect(regionFade(5980)).toBeGreaterThan(0.1);
    for (const rows of [1080, 720]) {
      expect(thresholdAt(rows)).toBeGreaterThan(REGION_CLOSE_FULL);
      for (const distance of [5980, 7500, REGION_CLOSE_FULL]) {
        expect(regionBlurRuns(radiusOf(frameAt(rows, distance)))).toBe(true);
      }
    }
  });

  test('never blurs in the simplified mode', () => {
    for (const distance of [5000, 8000, 10000, 20000]) {
      expect(radiusOf(frameAt(1080, distance, false))).toBe(0);
      expect(regionBlurRuns(radiusOf(frameAt(1080, distance, false)))).toBe(false);
    }
  });
});

describe('the blur kernel', () => {
  /** A frame whose region grid cell on the screen is one radius. */
  function frameOfRadius(radiusCss: number, pixelRatio: number): RegionPassFrame {
    return {
      ...FRAME,
      traced: true,
      pixelRatio,
      distance: 1000,
      focalCss: (radiusCss * 1000) / REGION_CELL_LY,
    };
  }

  function drewWith(frame: RegionPassFrame): FakeContext {
    const context = fakeContext(1280, 720);
    const pass = createRegionPass(
      context.gl,
      fakePrograms(),
      twoChains(),
      {} as WebGLVertexArrayObject,
    );
    pass.draw(frame);
    return context;
  }

  test('holds two taps per CSS pixel of the radius and one in the middle', () => {
    const counts: readonly (readonly [number, number])[] = [
      [3, 7],
      [3.85, 9],
      [4.62, 11],
      [5.77, 13],
      [8, 17],
    ];
    for (const [radiusCss, taps] of counts) {
      expect(regionBlurTaps(radiusCss)).toBe(taps);
      // The step is one CSS pixel, so the display does not change the count.
      for (const pixelRatio of [1, 2]) {
        const context = drewWith(frameOfRadius(radiusCss, pixelRatio));
        const kernels = uniformValues(context, 'uniform1fv', 'uWeights') as number[][];
        // One pass on each axis, so the pass gives the kernel twice.
        expect(kernels).toHaveLength(2);
        for (const kernel of kernels) expect(kernel).toHaveLength(taps);
        expect(uniformValues(context, 'uniform1i', 'uTaps')).toEqual([taps, taps]);
      }
    }
    expect(regionBlurTaps(REGION_BLUR_MAX_RADIUS_CSS)).toBe(17);
  });

  test('sums to 1', () => {
    for (const radiusCss of [3, 3.85, 4.62, 5.77, 8]) {
      const total = regionBlurKernel(radiusCss).reduce(
        (sum, weight) => sum + weight,
        0,
      );
      expect(Math.abs(total - 1)).toBeLessThan(1e-6);
    }
  });

  test('steps one CSS pixel on one axis at a time', () => {
    for (const pixelRatio of [1, 2]) {
      const context = drewWith(frameOfRadius(8, pixelRatio));
      const steps = context.of('uniform2f').filter((call) => call.args[0] === 'uStep');
      expect(steps).toHaveLength(2);
      expect((steps[0] as Call).args.slice(1)).toEqual([pixelRatio / 1280, 0]);
      expect((steps[1] as Call).args.slice(1)).toEqual([0, pixelRatio / 720]);
    }
  });
});

describe('the blur normalisation', () => {
  /** Half the width of the whole band, which is the ramp's own denominator. */
  const HALF_WIDTH_CSS = REGION_LINE_WIDTH_CSS / 2;

  test('is the kernel own response at the ridge', () => {
    const readings: readonly (readonly [number, number])[] = [
      [3.0, 0.758],
      [3.85, 0.679],
      [4.62, 0.613],
      [5.77, 0.53],
      [8.0, 0.411],
    ];
    for (const [radiusCss, wanted] of readings) {
      const peak = regionBlurPeak(radiusCss, HALF_WIDTH_CSS);
      expect(Math.abs(peak - wanted)).toBeLessThan(0.005);
    }
  });

  test('is 1 where the blur does not run', () => {
    expect(regionBlurPeak(0, HALF_WIDTH_CSS)).toBe(1);
    expect(regionBlurPeak(2.9, HALF_WIDTH_CSS)).toBe(1);
  });

  test('reaches the composite as uPeak', () => {
    const context = fakeContext(1280, 720);
    const pass = createRegionPass(
      context.gl,
      fakePrograms(),
      twoChains(),
      {} as WebGLVertexArrayObject,
    );
    pass.draw(frameAt(1080, 10000));
    pass.draw(frameAt(1080, 20000));
    const given = uniformValues(context, 'uniform1f', 'uPeak') as number[];
    expect(given).toHaveLength(2);
    expect(given[0] as number).toBeCloseTo(
      regionBlurPeak(radiusOf(frameAt(1080, 10000)), HALF_WIDTH_CSS),
      12,
    );
    expect(given[1]).toBe(1);
  });
});

// The readings of the blurred band, on a sampled coverage field.
//
// The field is the pass's own ramp, point-sampled on a grid of device pixels at a ratio
// of 1, and the blur is the pass's own kernel run on each axis. The tests below read the
// same field the shaders read, so the table they hold to is a reading of the rule and not
// of a second copy of it.

/** Half the side of the sampled field, in device pixels. */
const FIELD_REACH = 34;

/** How many samples one side of the field holds. */
const FIELD_SIDE = FIELD_REACH * 2 + 1;

/** How far each arm of a sampled line runs from the origin, in CSS pixels. */
const ARM_CSS = 28;

/** One straight part of a sampled line, as its two ends. */
type Segment = readonly [number, number, number, number];

/** A straight line through the origin. */
const STRAIGHT_LINE: readonly Segment[] = [[0, -ARM_CSS, 0, ARM_CSS]];

/** A line that turns by 90 degrees at the origin. */
const CORNER_LINE: readonly Segment[] = [
  [0, -ARM_CSS, 0, 0],
  [0, 0, ARM_CSS, 0],
];

/** How far a point sits from a segment, in CSS pixels. */
function gapToSegment(x: number, y: number, segment: Segment): number {
  const alongX = segment[2] - segment[0];
  const alongY = segment[3] - segment[1];
  const span = alongX * alongX + alongY * alongY;
  let part =
    span === 0 ? 0 : ((x - segment[0]) * alongX + (y - segment[1]) * alongY) / span;
  part = Math.min(1, Math.max(0, part));
  return Math.hypot(x - (segment[0] + part * alongX), y - (segment[1] + part * alongY));
}

/** The coverage the ribbon step writes at one point. */
function coverageAt(x: number, y: number, line: readonly Segment[]): number {
  let nearest = Number.POSITIVE_INFINITY;
  for (const segment of line) nearest = Math.min(nearest, gapToSegment(x, y, segment));
  return Math.max(0, 1 - nearest / (REGION_LINE_WIDTH_CSS / 2));
}

/**
 * The coverage of a line, point-sampled on the device pixel grid. The phase moves the
 * line between two samples, from 0, where a sample sits on the line, up to 1.
 */
function coverageField(line: readonly Segment[], phase: number): Float64Array {
  const field = new Float64Array(FIELD_SIDE * FIELD_SIDE);
  for (let row = 0; row < FIELD_SIDE; row += 1) {
    for (let column = 0; column < FIELD_SIDE; column += 1) {
      field[row * FIELD_SIDE + column] = coverageAt(
        column - FIELD_REACH + phase,
        row - FIELD_REACH + phase,
        line,
      );
    }
  }
  return field;
}

/** Blurs a field along each axis, with the pass's own kernel. */
function blurField(field: Float64Array, radiusCss: number): Float64Array {
  if (!regionBlurRuns(radiusCss)) return field.slice();
  const weights = regionBlurKernel(radiusCss);
  const middle = (weights.length - 1) / 2;
  const held = (at: number): number => Math.min(FIELD_SIDE - 1, Math.max(0, at));
  const first = new Float64Array(field.length);
  for (let row = 0; row < FIELD_SIDE; row += 1) {
    for (let column = 0; column < FIELD_SIDE; column += 1) {
      let sum = 0;
      for (let tap = 0; tap < weights.length; tap += 1) {
        sum +=
          (weights[tap] as number) *
          (field[row * FIELD_SIDE + held(column + tap - middle)] as number);
      }
      first[row * FIELD_SIDE + column] = sum;
    }
  }
  const second = new Float64Array(field.length);
  for (let row = 0; row < FIELD_SIDE; row += 1) {
    for (let column = 0; column < FIELD_SIDE; column += 1) {
      let sum = 0;
      for (let tap = 0; tap < weights.length; tap += 1) {
        sum +=
          (weights[tap] as number) *
          (first[held(row + tap - middle) * FIELD_SIDE + column] as number);
      }
      second[row * FIELD_SIDE + column] = sum;
    }
  }
  return second;
}

/** Reads a field at a point of the screen, the way a linear filter reads it. */
function readField(field: Float64Array, phase: number, x: number, y: number): number {
  const atX = x + FIELD_REACH - phase;
  const atY = y + FIELD_REACH - phase;
  const column = Math.floor(atX);
  const row = Math.floor(atY);
  const partX = atX - column;
  const partY = atY - row;
  const value = (oneColumn: number, oneRow: number): number => {
    const heldColumn = Math.min(FIELD_SIDE - 1, Math.max(0, oneColumn));
    const heldRow = Math.min(FIELD_SIDE - 1, Math.max(0, oneRow));
    return field[heldRow * FIELD_SIDE + heldColumn] as number;
  };
  return (
    value(column, row) * (1 - partX) * (1 - partY) +
    value(column + 1, row) * partX * (1 - partY) +
    value(column, row + 1) * (1 - partX) * partY +
    value(column + 1, row + 1) * partX * partY
  );
}

/**
 * How far along a ray the field falls to a level, in CSS pixels. This is one point of the
 * contour of that level.
 */
function contourAlong(
  field: Float64Array,
  phase: number,
  from: readonly [number, number],
  toward: readonly [number, number],
  level: number,
): number {
  const step = 0.02;
  let before = readField(field, phase, from[0], from[1]);
  for (let at = step; at <= 16; at += step) {
    const value = readField(
      field,
      phase,
      from[0] + toward[0] * at,
      from[1] + toward[1] * at,
    );
    if (before >= level && value < level) {
      return at - step + (step * (before - level)) / (before - value);
    }
    before = value;
  }
  return Number.NaN;
}

/** The peak and the half maximum width of the row of samples across a straight run. */
function rowReading(field: Float64Array): { peak: number; widthCss: number } {
  const row: number[] = [];
  for (let column = 0; column < FIELD_SIDE; column += 1) {
    row.push(field[FIELD_REACH * FIELD_SIDE + column] as number);
  }
  const peak = Math.max(...row);
  const at = row.indexOf(peak);
  const edge = (step: number): number => {
    let inside = at;
    while ((row[inside + step] as number) >= peak / 2) inside += step;
    const outside = inside + step;
    return (
      inside +
      (step * ((row[inside] as number) - peak / 2)) /
        ((row[inside] as number) - (row[outside] as number))
    );
  };
  return { peak, widthCss: edge(1) - edge(-1) };
}

/** What one radius gives over the phases, as the least and the largest of each reading. */
interface BlurReadings {
  readonly peak: readonly [number, number];
  readonly widthCss: readonly [number, number];
  readonly normalisedPeak: readonly [number, number];
  readonly cornerDeparture: readonly [number, number];
  readonly straightDeparture: readonly [number, number];
}

/** How many phases of the line the readings run over. */
const PHASE_COUNT = 12;

function readBlur(radiusCss: number): BlurReadings {
  const peaks: number[] = [];
  const widths: number[] = [];
  const normalised: number[] = [];
  const corners: number[] = [];
  const straights: number[] = [];
  const normalisation = regionBlurPeak(radiusCss, REGION_LINE_WIDTH_CSS / 2);
  const slant = 1 / Math.SQRT2;
  for (let phase = 0; phase < PHASE_COUNT; phase += 1) {
    const at = phase / PHASE_COUNT;
    const straight = blurField(coverageField(STRAIGHT_LINE, at), radiusCss);
    const reading = rowReading(straight);
    peaks.push(reading.peak);
    widths.push(reading.widthCss);
    normalised.push(reading.peak / normalisation);
    if (!regionBlurRuns(radiusCss)) continue;

    // The contour of half the straight run's own peak. Where the line does not turn, it
    // sits at a fixed distance from the line, which is the half maximum half width.
    const level = reading.peak / 2;
    const halfWidth = contourAlong(straight, at, [0, 0], [1, 0], level);
    const corner = blurField(coverageField(CORNER_LINE, at), radiusCss);
    // A sharp corner holds the same contour on both sides of the turn: the outside at
    // the half width from the bend and the inside at the half width from each arm, which
    // meet at the root of two times it. The blur moves both.
    const inside = contourAlong(corner, at, [0, 0], [slant, -slant], level);
    const outside = contourAlong(corner, at, [0, 0], [-slant, slant], level);
    corners.push(
      Math.max(
        Math.abs(inside - Math.SQRT2 * halfWidth),
        Math.abs(halfWidth - outside),
      ),
    );
    // The same reading along each arm, away from the turn, where the blur must leave the
    // contour where a straight run puts it.
    let moved = 0;
    for (const along of [8, 11, 14, 17]) {
      for (const side of [1, -1]) {
        moved = Math.max(
          moved,
          Math.abs(contourAlong(corner, at, [0, -along], [side, 0], level) - halfWidth),
          Math.abs(contourAlong(corner, at, [along, 0], [0, side], level) - halfWidth),
        );
      }
    }
    straights.push(moved);
  }
  const range = (values: number[]): [number, number] => [
    Math.min(...values),
    Math.max(...values),
  ];
  return {
    peak: range(peaks),
    widthCss: range(widths),
    normalisedPeak: range(normalised),
    cornerDeparture: regionBlurRuns(radiusCss) ? range(corners) : [0, 0],
    straightDeparture: regionBlurRuns(radiusCss) ? range(straights) : [0, 0],
  };
}

describe('the blur keeps a straight run and rounds a corner', () => {
  /** The table the requirement states, one row for each radius it names. */
  const TABLE: readonly {
    radiusCss: number;
    normalisation: number;
    peak: readonly [number, number];
    widthCss: readonly [number, number];
  }[] = [
    { radiusCss: 0, normalisation: 1, peak: [0.83, 1.0], widthCss: [3.0, 3.5] },
    { radiusCss: 3.0, normalisation: 0.758, peak: [0.69, 0.76], widthCss: [3.8, 4.13] },
    {
      radiusCss: 3.85,
      normalisation: 0.679,
      peak: [0.63, 0.68],
      widthCss: [4.24, 4.49],
    },
    {
      radiusCss: 4.62,
      normalisation: 0.613,
      peak: [0.58, 0.61],
      widthCss: [4.68, 4.88],
    },
    { radiusCss: 5.77, normalisation: 0.53, peak: [0.51, 0.53], widthCss: [5.37, 5.6] },
    { radiusCss: 8.0, normalisation: 0.411, peak: [0.4, 0.41], widthCss: [6.9, 7.05] },
  ];

  /** How far a reading of the peak column may sit outside its range. */
  const PEAK_TOLERANCE = 0.01;

  /** How far a reading of the width column may sit outside its range, in CSS pixels. */
  const WIDTH_TOLERANCE = 0.05;

  const readings = new Map(
    TABLE.map((row) => [row.radiusCss, readBlur(row.radiusCss)]),
  );

  test('reads the peak and the width the table states, over twelve phases', () => {
    for (const row of TABLE) {
      const reading = readings.get(row.radiusCss) as BlurReadings;
      expect(regionBlurPeak(row.radiusCss, REGION_LINE_WIDTH_CSS / 2)).toBeCloseTo(
        row.normalisation,
        2,
      );
      expect(reading.peak[0]).toBeGreaterThan(row.peak[0] - PEAK_TOLERANCE);
      expect(reading.peak[1]).toBeLessThan(row.peak[1] + PEAK_TOLERANCE);
      expect(reading.widthCss[0]).toBeGreaterThan(row.widthCss[0] - WIDTH_TOLERANCE);
      expect(reading.widthCss[1]).toBeLessThan(row.widthCss[1] + WIDTH_TOLERANCE);
    }
  });

  test('holds the normalised peak between 0.91 and 1 at every radius and phase', () => {
    for (const row of TABLE) {
      if (row.radiusCss === 0) continue;
      const reading = readings.get(row.radiusCss) as BlurReadings;
      expect(reading.normalisedPeak[0]).toBeGreaterThanOrEqual(0.91);
      // A sample sits on the line at the first phase, and the reading is then the
      // normalisation itself. The two sums leave a float remainder of about 1e-16.
      expect(reading.normalisedPeak[1]).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  test('widens the band as the radius grows', () => {
    let before = (readings.get(0) as BlurReadings).widthCss[0];
    for (const row of TABLE.slice(1)) {
      const widest = (readings.get(row.radiusCss) as BlurReadings).widthCss[0];
      expect(widest).toBeGreaterThan(before);
      before = widest;
    }
  });

  test('moves the contour at the corner and leaves the straight run alone', () => {
    for (const row of TABLE) {
      if (row.radiusCss === 0) continue;
      const reading = readings.get(row.radiusCss) as BlurReadings;
      expect(reading.cornerDeparture[0]).toBeGreaterThanOrEqual(0.2 * row.radiusCss);
      expect(reading.cornerDeparture[1]).toBeLessThanOrEqual(1 * row.radiusCss);
      expect(reading.straightDeparture[1]).toBeLessThan(0.1 * row.radiusCss);
    }
  });
});

describe('the flat top of the band', () => {
  test('clamps the smoothstep at 1, which a corner reaches past', () => {
    expect(compositeSource).toContain('texture(uCoverage, vTexture).r / uPeak');
    expect(compositeSource).toContain('smoothstep(0.0, 1.0, coverage)');
  });

  test('lifts a 90 degree corner above a straight run, by the radius', () => {
    // The reading is about one CSS pixel inside the turn and not at the apex, which
    // sits a little under a straight run. The line sits on the sample grid here, which
    // is the phase the table's own readings take.
    const ratios: readonly (readonly [number, number])[] = [
      [3.0, 1.04],
      [3.85, 1.07],
      [4.62, 1.1],
      [5.77, 1.13],
      [8.0, 1.15],
    ];
    for (const [radiusCss, wanted] of ratios) {
      const straight = blurField(coverageField(STRAIGHT_LINE, 0), radiusCss);
      const corner = blurField(coverageField(CORNER_LINE, 0), radiusCss);
      const run = rowReading(straight).peak;
      let largest = 0;
      for (let row = 0; row < FIELD_SIDE; row += 1) {
        for (let column = 0; column < FIELD_SIDE; column += 1) {
          const x = column - FIELD_REACH;
          const y = row - FIELD_REACH;
          if (Math.hypot(x, y) > 8) continue;
          largest = Math.max(largest, corner[row * FIELD_SIDE + column] as number);
        }
      }
      expect(Math.abs(largest / run - wanted)).toBeLessThan(0.01);
    }
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

describe('the two boundary sets', () => {
  test('a mode change binds another vertex array and uploads nothing', () => {
    const context = fakeContext(800, 600);
    const pass = createRegionPass(
      context.gl,
      fakePrograms(),
      twoChains(),
      {} as WebGLVertexArrayObject,
      twoTracedChains(),
    );

    // Both sets upload at creation: the corner buffer once and one position buffer each.
    const uploads = context.of('bufferData').length;
    expect(uploads).toBe(3);

    const boundBy = (traced: boolean): unknown => {
      const before = context.of('bindVertexArray').length;
      pass.draw({ ...FRAME, traced });
      const binds = context.of('bindVertexArray').slice(before);
      return binds.find((call) => call.args[0] !== null)?.args[0];
    };

    const smoothed = boundBy(false);
    const traced = boundBy(true);
    const again = boundBy(false);
    expect(smoothed).toBeDefined();
    expect(traced).toBeDefined();
    expect(traced).not.toBe(smoothed);
    expect(again).toBe(smoothed);

    // A mode change is a bind and not an upload.
    expect(context.of('bufferData')).toHaveLength(uploads);
    expect(context.of('bufferSubData')).toHaveLength(0);
  });

  test('draws the chains of the set the frame names', () => {
    const context = fakeContext(800, 600);
    const pass = createRegionPass(
      context.gl,
      fakePrograms(),
      twoChains(),
      {} as WebGLVertexArrayObject,
      twoTracedChains(),
    );
    pass.draw({ ...FRAME, traced: true });

    const draws = context.of('drawArraysInstanced');
    expect(draws).toHaveLength(2);
    expect(draws.map((call) => call.args[3])).toEqual([2, 1]);
  });
});
