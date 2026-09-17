import { describe, expect, test } from 'vitest';
import { createShapeSet } from '../scene-data/shapes';
import type { ShapeSet } from '../scene-data/shapes';
import {
  buildSegmentInstances,
  buildSphereInstances,
  createShapePass,
  SPHERE_MIN_RADIUS_CSS,
  sphereAlpha,
} from './shape-pass';
import type { ShapePassFrame, ShapePrograms } from './shape-pass';
import type { Program } from './program';
import sphereVertexSource from './shaders/spheres.vert?raw';
import sphereFragmentSource from './shaders/spheres.frag?raw';
import lineVertexSource from './shaders/shape-lines.vert?raw';
import lineFragmentSource from './shaders/shape-lines.frag?raw';
import compositeSource from './shaders/shape-composite.frag?raw';

/** One call the pass made on the context. */
interface Call {
  readonly name: string;
  readonly args: readonly unknown[];
}

/** A context that records the calls the pass makes and gives every name a number. */
interface FakeContext {
  readonly gl: WebGL2RenderingContext;
  readonly calls: Call[];
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
    of(name: string): Call[] {
      return calls.filter((call) => call.name === name);
    },
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

function fakePrograms(): ShapePrograms {
  return {
    spheres: fakeProgram([
      'uViewProjection',
      'uChunkOffset',
      'uTargetSize',
      'uFocal',
      'uMinRadius',
    ]),
    lines: fakeProgram([
      'uViewProjection',
      'uChunkOffset',
      'uTargetSize',
      'uPixelRatio',
    ]),
    composite: fakeProgram(['uLines']),
  };
}

/** A frame over a set, with the camera at the origin. */
function frameOf(set: ShapeSet): ShapePassFrame {
  return {
    viewProjection: new Float32Array(16),
    camera: [0, 0, 0] as const,
    pixelRatio: 1,
    focal: 800,
    set,
  };
}

/** A set with no system behind its references. */
function shapeSet(): ShapeSet {
  return createShapeSet(() => null);
}

describe('the sphere alpha rule', () => {
  test('rises from the opacity at the middle to 1 at the limb', () => {
    expect(sphereAlpha(0, 0.18)).toBeCloseTo(0.18, 3);
    expect(sphereAlpha(0.5, 0.18)).toBeCloseTo(0.2078, 3);
    expect(sphereAlpha(0.9, 0.18)).toBeCloseTo(0.4129, 3);
    expect(sphereAlpha(0.9838, 0.18)).toBeCloseTo(1, 3);
  });

  test('draws nothing at the limb and beyond it', () => {
    expect(sphereAlpha(1, 0.18)).toBe(0);
    expect(sphereAlpha(1.5, 0.18)).toBe(0);
    // The sprite is square and the sphere is round, so its corners sit at 1.414.
    expect(sphereAlpha(Math.SQRT2, 0.18)).toBe(0);
  });

  test('holds at 1 and never above it', () => {
    for (const share of [0, 0.25, 0.5, 0.75, 0.9, 0.99, 0.999]) {
      expect(sphereAlpha(share, 1)).toBe(1);
      expect(sphereAlpha(share, 0.18)).toBeLessThanOrEqual(1);
    }
  });

  test('reads the same rule the fragment shader holds', () => {
    expect(sphereFragmentSource).toContain('min(1.0, vOpacity / sqrt(1.0 - r * r))');
    expect(sphereFragmentSource).toContain('if (r >= 1.0) discard;');
  });
});

describe('the sphere culls', () => {
  test('are the three the vertex shader holds', () => {
    expect(sphereVertexSource).toContain('bool tooSmall = radius < uMinRadius;');
    expect(sphereVertexSource).toContain(
      'bool behind = clip.w <= 0.0 || clip.z + clip.w <= 1e-4 * clip.w;',
    );
    expect(sphereVertexSource).toContain('bool inside = range <= aRadius;');
    expect(SPHERE_MIN_RADIUS_CSS).toBe(1);
  });
});

describe('the sphere instances', () => {
  test('carry the centre in the world frame and the colour over 255', () => {
    const set = shapeSet();
    set.addSpheres([
      { position: [100, 20, 200], radius: 50, color: [255, 128, 0], opacity: 0.5 },
    ]);
    const out = new Float32Array(8);
    const count = buildSphereInstances(set, out);

    expect(count).toBe(1);
    // The world frame's third axis runs the other way to the game's.
    expect([out[0], out[1], out[2]]).toEqual([100, 20, -200]);
    expect(out[3]).toBe(50);
    expect(out[4]).toBeCloseTo(1, 6);
    expect(out[5]).toBeCloseTo(128 / 255, 6);
    expect(out[6]).toBe(0);
    expect(out[7]).toBe(0.5);
  });
});

describe('the line segments', () => {
  test('are one fewer than the points of an open line', () => {
    const set = shapeSet();
    set.addLines([
      {
        points: [
          [0, 0, 0],
          [100, 0, 0],
          [100, 0, 100],
        ],
        color: [0, 255, 0],
        width: 6,
      },
    ]);
    const out = new Float32Array(10 * 4);
    const count = buildSegmentInstances(set, out);

    expect(count).toBe(2);
    // The half width goes to the card, because the shader expands the quad by it.
    expect(out[9]).toBe(3);
  });

  test('carry one more segment for a closed line, from the last point to the first', () => {
    const set = shapeSet();
    set.addLines([
      {
        points: [
          [0, 0, 0],
          [100, 0, 0],
          [100, 0, 100],
        ],
        color: [0, 255, 0],
        closed: true,
      },
    ]);
    const out = new Float32Array(10 * 4);
    const count = buildSegmentInstances(set, out);

    expect(count).toBe(3);
    const last = 2 * 10;
    expect([out[last], out[last + 1], out[last + 2]]).toEqual([100, 0, -100]);
    // The closing segment ends on the first point. The third part reads -0, because the
    // world frame negates the game's third axis.
    expect(out[last + 3]).toBe(0);
    expect(out[last + 4]).toBe(0);
    expect(out[last + 5]).toBeCloseTo(0, 6);
  });
});

describe('the shape pass draw', () => {
  test('issues no call for an empty set and allocates no line buffer', () => {
    const context = fakeContext(1920, 1080);
    const pass = createShapePass(
      context.gl,
      fakePrograms(),
      {} as WebGLVertexArrayObject,
    );
    const set = shapeSet();

    expect(pass.draw(frameOf(set))).toBe(0);
    expect(pass.drawCalls()).toBe(0);
    expect(pass.lineBufferSize()).toBeNull();
  });

  test('allocates no line buffer for a set of spheres alone', () => {
    const context = fakeContext(1920, 1080);
    const pass = createShapePass(
      context.gl,
      fakePrograms(),
      {} as WebGLVertexArrayObject,
    );
    const set = shapeSet();
    set.addSpheres([{ position: [0, 0, 0], radius: 100, color: [255, 0, 0] }]);

    expect(pass.draw(frameOf(set))).toBe(1);
    expect(pass.lineBufferSize()).toBeNull();
    expect(context.of('texImage2D')).toHaveLength(0);
  });

  test('takes the line buffer at the drawing buffer size on the first line', () => {
    const context = fakeContext(1920, 1080);
    const pass = createShapePass(
      context.gl,
      fakePrograms(),
      {} as WebGLVertexArrayObject,
    );
    const set = shapeSet();
    set.addLines([
      {
        points: [
          [0, 0, 0],
          [100, 0, 0],
        ],
        color: [0, 255, 0],
      },
    ]);

    // The segments and the full-screen pass that writes them over the frame.
    expect(pass.draw(frameOf(set))).toBe(2);
    expect(pass.lineBufferSize()).toEqual([1920, 1080]);
  });

  test('costs three calls with a sphere and a line, whatever the set holds', () => {
    const context = fakeContext(1920, 1080);
    const pass = createShapePass(
      context.gl,
      fakePrograms(),
      {} as WebGLVertexArrayObject,
    );
    const set = shapeSet();
    set.addSpheres([{ position: [0, 0, 0], radius: 100, color: [255, 0, 0] }]);
    set.addLines([
      {
        points: [
          [0, 0, 0],
          [100, 0, 0],
        ],
        color: [0, 255, 0],
      },
    ]);
    expect(pass.draw(frameOf(set))).toBe(3);

    const many = shapeSet();
    many.addSpheres(
      Array.from({ length: 1024 }, (_, index) => ({
        position: [index, 0, 0] as [number, number, number],
        radius: 100,
        color: [255, 0, 0] as [number, number, number],
      })),
    );
    many.addLines(
      Array.from({ length: 4096 }, (_, index) => ({
        points: [
          [index, 0, 0] as [number, number, number],
          [index, 0, 100] as [number, number, number],
        ],
        color: [0, 255, 0] as [number, number, number],
      })),
    );
    expect(pass.draw(frameOf(many))).toBe(3);
    // One instanced call covers every sphere, and one covers every segment.
    const instanced = context.of('drawArraysInstanced');
    expect(instanced).toHaveLength(4);
    expect(instanced[2]?.args[3]).toBe(1024);
    expect(instanced[3]?.args[3]).toBe(4096);
  });

  test('blends the segments with MAX and writes them over the frame with the alpha', () => {
    expect(lineFragmentSource).toContain('fragColour = vec4(vColour * alpha, alpha);');
    expect(compositeSource).toContain('texel.rgb / texel.a');
    expect(lineVertexSource).toContain('float halfWidth = aHalfWidth * uPixelRatio;');
  });

  test('builds the instances again when the set changes and not when it does not', () => {
    const context = fakeContext(1920, 1080);
    const pass = createShapePass(
      context.gl,
      fakePrograms(),
      {} as WebGLVertexArrayObject,
    );
    const set = shapeSet();
    set.addSpheres([{ position: [0, 0, 0], radius: 100, color: [255, 0, 0] }]);
    pass.draw(frameOf(set));
    const first = context.of('bufferSubData').length;
    pass.draw(frameOf(set));
    const second = context.of('bufferSubData').length;
    set.addSpheres([{ position: [1, 0, 0], radius: 100, color: [255, 0, 0] }]);
    pass.draw(frameOf(set));
    const third = context.of('bufferSubData').length;

    expect(first).toBeGreaterThan(0);
    expect(second).toBe(first);
    expect(third).toBeGreaterThan(second);
  });
});
