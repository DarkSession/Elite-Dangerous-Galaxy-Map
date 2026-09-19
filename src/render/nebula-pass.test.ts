import { describe, expect, test } from 'vitest';
import {
  buildNebulaSet,
  NEBULA_CAP_FRACTION,
  NEBULA_MAX_DRAWN,
  selectNebulae,
} from '../scene-data/nebulae';
import type { NebulaInstance, NebulaSet } from '../scene-data/nebulae';
import { createNebulaAtlasTexture, NEBULA_ATLAS_COLUMNS } from './buffers';
import type { NebulaAtlasImage } from './buffers';
import {
  createNebulaPass,
  DEFAULT_NEBULA_BRIGHTNESS,
  NEBULA_INSTANCE_FLOATS,
  writeNebulaInstances,
} from './nebula-pass';
import type { NebulaPassFrame } from './nebula-pass';
import type { Program } from './program';

/** One call the pass made on the context. */
interface Call {
  readonly name: string;
  readonly args: readonly unknown[];
}

interface FakeContext {
  readonly gl: WebGL2RenderingContext;
  readonly calls: Call[];
  of(name: string): Call[];
}

/** A context that records the calls the pass makes and gives every name a number. */
function fakeContext(): FakeContext {
  const calls: Call[] = [];
  const constants = new Map<string, number>();
  const state: Record<string, unknown> = {};

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

/** One program whose uniform locations are their own names. */
function fakeProgram(): Program {
  const names = [
    'uViewProjection',
    'uChunkOffset',
    'uTargetSize',
    'uSpriteScale',
    'uMaxRadius',
    'uWeight',
    'uTileSide',
    'uAtlasColumns',
    'uAtlasSide',
    'uBrightness',
    'uAtlas',
  ];
  const uniforms: Record<string, WebGLUniformLocation> = {};
  for (const name of names) uniforms[name] = name as unknown as WebGLUniformLocation;
  return { program: {} as WebGLProgram, uniforms };
}

const tileNames = Array.from({ length: 34 }, (_unused, index) => `tile-${index}`);

/** A set whose records sit on the `z` axis, one per light year of tile index. */
/** More records than the budget draws, so a test can reach the cut. */
const OVER_BUDGET = NEBULA_MAX_DRAWN + 8;

function manySet(count: number): NebulaSet {
  const records: unknown[] = [];
  for (let index = 0; index < count; index += 1) {
    records.push([0, 0, 5000 + index * 10, 60, index % 34]);
  }
  return buildNebulaSet({ tiles: tileNames, records });
}

function frameOf(
  set: NebulaSet,
  distance: number,
  brightness = DEFAULT_NEBULA_BRIGHTNESS,
): NebulaPassFrame {
  const selection = selectNebulae(set, {
    camera: [0, 0, 0],
    distance,
    focalPixels: 623.5382907247958,
    canvasHeightCss: 720,
  });
  return {
    viewProjection: new Float32Array(16),
    chunkOffset: [0, 0, 0],
    targetSize: [640, 360],
    spriteScale: 311.7691453623979,
    brightness,
    weight: selection.weight,
    instances: selection.instances,
  };
}

/** A test double, at a tile side the committed atlas does not use. */
const ATLAS_SIDE = 384;
const TILE_SIDE = ATLAS_SIDE / NEBULA_ATLAS_COLUMNS;

/** A decoded atlas file of a side, which is all the upload reads of it. */
function atlasImage(side: number): NebulaAtlasImage {
  return { width: side, height: side } as unknown as NebulaAtlasImage;
}

function atlasOf(
  context: FakeContext,
  side = ATLAS_SIDE,
): ReturnType<typeof createNebulaAtlasTexture> {
  return createNebulaAtlasTexture(context.gl, atlasImage(side));
}

describe('the nebula atlas texture', () => {
  test('uploads as sRGB with a linear filter and clamped wrapping', () => {
    const context = fakeContext();
    const gl = context.gl;
    atlasOf(context);

    const storage = context.of('texStorage2D')[0];
    expect(storage?.args[2]).toBe(gl.SRGB8_ALPHA8);
    expect(storage?.args[3]).toBe(ATLAS_SIDE);
    expect(storage?.args[4]).toBe(ATLAS_SIDE);

    const parameters = context.of('texParameteri').map((call) => call.args.slice(1));
    expect(parameters).toContainEqual([gl.TEXTURE_MIN_FILTER, gl.LINEAR]);
    expect(parameters).toContainEqual([gl.TEXTURE_MAG_FILTER, gl.LINEAR]);
    expect(parameters).toContainEqual([gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE]);
    expect(parameters).toContainEqual([gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]);
  });

  // A pack at a larger tile size is a drop-in: the file states its own texel sizes and
  // nothing in the renderer holds them.
  test('reads the tile side from the file, whatever the file is', () => {
    const small = atlasOf(fakeContext(), 384);
    expect(small.side).toBe(384);
    expect(small.tileSide).toBe(64);

    const large = atlasOf(fakeContext(), 1536);
    expect(large.side).toBe(1536);
    expect(large.tileSide).toBe(256);

    const context = fakeContext();
    const atlas = atlasOf(context, 1536);
    const pass = createNebulaPass(context.gl, fakeProgram(), manySet(4), atlas);
    pass.draw(frameOf(manySet(4), 6000));
    const floats = new Map(
      context.of('uniform1f').map((call) => [call.args[0], call.args[1]]),
    );
    expect(floats.get('uTileSide')).toBe(256);
    expect(floats.get('uAtlasSide')).toBe(1536);
  });

  test('refuses a file the grid does not fit', () => {
    expect(() => atlasOf(fakeContext(), 500)).toThrow(/6 tiles a row do not divide/);
    expect(() =>
      createNebulaAtlasTexture(fakeContext().gl, {
        width: 384,
        height: 192,
      } as unknown as NebulaAtlasImage),
    ).toThrow(/must be square/);
  });

  // The art holds the emission and the absorption together, so the colour channels are
  // radiance and not a colour the browser may multiply by the alpha.
  test('does not let the upload premultiply the alpha', () => {
    const context = fakeContext();
    const gl = context.gl;
    atlasOf(context);
    const stores = context.of('pixelStorei').map((call) => call.args);
    expect(stores).toContainEqual([gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false]);
  });
});

describe('the nebula instance buffer', () => {
  test('copies the record into the world frame, which negates z', () => {
    const set = buildNebulaSet({
      tiles: tileNames,
      records: [[10, 20, 30, 7.5, 5, 'one']],
    });
    const out = new Float32Array(NEBULA_MAX_DRAWN * NEBULA_INSTANCE_FLOATS);
    const instances: NebulaInstance[] = [
      { index: 0, range: 100, pixels: 9, fade: 0.5 },
    ];
    expect(writeNebulaInstances(set, instances, out)).toBe(1);
    expect(Array.from(out.subarray(0, NEBULA_INSTANCE_FLOATS))).toEqual([
      10, 20, -30, 7.5, 5, 0.5,
    ]);
  });

  test('writes at most the budget, whatever the selection holds', () => {
    const set = manySet(OVER_BUDGET);
    const out = new Float32Array(NEBULA_MAX_DRAWN * NEBULA_INSTANCE_FLOATS);
    const instances: NebulaInstance[] = Array.from(
      { length: OVER_BUDGET },
      (_u, index) => ({
        index,
        range: 5000 + index,
        pixels: 10,
        fade: 1,
      }),
    );
    expect(writeNebulaInstances(set, instances, out)).toBe(NEBULA_MAX_DRAWN);
  });
});

describe('the nebula pass', () => {
  test('draws every selected instance in one call, with source-over blending', () => {
    const context = fakeContext();
    const gl = context.gl;
    const set = manySet(OVER_BUDGET);
    const pass = createNebulaPass(gl, fakeProgram(), set, atlasOf(context));
    const frame = frameOf(set, 12000);
    expect(frame.instances.length).toBe(NEBULA_MAX_DRAWN);

    pass.draw(frame);

    const draws = context.of('drawArraysInstanced');
    expect(draws).toHaveLength(1);
    expect(draws[0]?.args[3]).toBe(NEBULA_MAX_DRAWN);
    expect(pass.drawCalls).toBe(1);
    expect(pass.drawnCount).toBe(NEBULA_MAX_DRAWN);

    const blend = context.of('blendFunc')[0];
    expect(blend?.args).toEqual([gl.ONE, gl.ONE_MINUS_SRC_ALPHA]);
  });

  test('draws nothing and issues no draw call when the zoom weight is 0', () => {
    const context = fakeContext();
    const set = manySet(OVER_BUDGET);
    const pass = createNebulaPass(context.gl, fakeProgram(), set, atlasOf(context));
    const before = context.calls.length;

    pass.draw(frameOf(set, 60000));

    expect(pass.drawCalls).toBe(0);
    expect(pass.drawnCount).toBe(0);
    expect(context.of('drawArraysInstanced')).toHaveLength(0);
    // The pass makes no call at all past the guard, so a frame outside the band costs
    // nothing beyond the selection.
    expect(context.calls.length).toBe(before);
  });

  // The cap holds the fill cost. It reads a share of the target height, which is the
  // same share of the canvas height, so the sprite size does not follow the target.
  test('caps the drawn radius at a share of the target height', () => {
    const context = fakeContext();
    const set = manySet(OVER_BUDGET);
    const pass = createNebulaPass(context.gl, fakeProgram(), set, atlasOf(context));
    pass.draw(frameOf(set, 12000));

    const cap = context.of('uniform1f').find((call) => call.args[0] === 'uMaxRadius');
    expect(cap?.args[1]).toBe(NEBULA_CAP_FRACTION * 360);
    expect(cap?.args[1]).toBe(270);
  });

  test('names the atlas layout the shader reads', () => {
    const context = fakeContext();
    const set = manySet(OVER_BUDGET);
    const pass = createNebulaPass(context.gl, fakeProgram(), set, atlasOf(context));
    pass.draw(frameOf(set, 12000));

    const floats = new Map(
      context.of('uniform1f').map((call) => [call.args[0], call.args[1]]),
    );
    expect(floats.get('uTileSide')).toBe(TILE_SIDE);
    expect(floats.get('uAtlasColumns')).toBe(NEBULA_ATLAS_COLUMNS);
    expect(floats.get('uAtlasSide')).toBe(ATLAS_SIDE);
  });

  // The brightness is a look setting. It scales the colour channels alone: scaling the
  // alpha with it would turn a look setting into a change in how much a dark nebula
  // hides of what is behind it.
  test('doubling the brightness doubles the colour and leaves the alpha alone', () => {
    const set = manySet(OVER_BUDGET);
    const readings: { brightness: number; fades: number[] }[] = [];
    for (const brightness of [1, 2]) {
      const context = fakeContext();
      const pass = createNebulaPass(context.gl, fakeProgram(), set, atlasOf(context));
      pass.draw(frameOf(set, 12000, brightness));
      const sent = context
        .of('uniform1f')
        .find((call) => call.args[0] === 'uBrightness');
      const data = context.of('bufferSubData')[0]?.args[2] as Float32Array;
      const fades: number[] = [];
      for (let slot = 0; slot < pass.drawnCount; slot += 1) {
        fades.push(data[slot * NEBULA_INSTANCE_FLOATS + 5] as number);
      }
      readings.push({ brightness: sent?.args[1] as number, fades });
    }
    expect(readings[1]?.brightness).toBe(2 * (readings[0]?.brightness as number));
    // The alpha the pass sends per sprite is the weight times the fade, and neither
    // moved.
    expect(readings[1]?.fades).toEqual(readings[0]?.fades);
  });

  test('sends the instances furthest first', () => {
    const context = fakeContext();
    const set = manySet(OVER_BUDGET);
    const pass = createNebulaPass(context.gl, fakeProgram(), set, atlasOf(context));
    const frame = frameOf(set, 12000);
    pass.draw(frame);

    const data = context.of('bufferSubData')[0]?.args[2] as Float32Array;
    let previous = Infinity;
    for (let slot = 0; slot < pass.drawnCount; slot += 1) {
      // The records sit on the `z` axis, which the world frame negates, and the camera
      // is at the origin.
      const range = Math.abs(data[slot * NEBULA_INSTANCE_FLOATS + 2] as number);
      expect(range).toBeLessThanOrEqual(previous);
      previous = range;
    }
  });
});
