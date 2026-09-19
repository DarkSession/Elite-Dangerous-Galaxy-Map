import { describe, expect, test } from 'vitest';
import {
  buildNebulaSet,
  NEBULA_CAP_FRACTION,
  NEBULA_MAX_DRAWN,
  nebulaFocalPixels,
  selectNebulae,
} from '../scene-data/nebulae';
import type { NebulaInstance, NebulaSelection, NebulaSet } from '../scene-data/nebulae';
import { createNebulaAtlasTexture, NEBULA_ATLAS_COLUMNS } from './nebula-atlas';
import type { NebulaAtlasImage } from './nebula-atlas';
import {
  createNebulaPass,
  NEBULA_INSTANCE_FLOATS,
  writeNebulaInstances,
} from './nebula-pass';
import { DEFAULT_NEBULA_BRIGHTNESS, DEFAULT_NEBULA_OCCLUSION } from './nebula-slot';
import type { NebulaFrame } from './nebula-slot';
import type { Program } from './program';
import { DEFAULT_ABSORPTION } from './volume-pass';
import { withVolumeDensity } from './volume-density';
import densitySource from './shaders/volume-density.glsl?raw';
import nebulaVertexSource from './shaders/nebulae.vert?raw';
import volumeFragmentSource from './shaders/volume.frag?raw';

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
    'uVolume',
    'uDetail',
    'uBoxMin',
    'uBoxSize',
    'uCentre',
    'uLo',
    'uSpan',
    'uEpsilon',
    'uAbsorption',
    'uDetailScale',
    'uOcclusion',
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

/** The uploaded textures the march reads. The pass binds them and reads nothing of them. */
const VOLUME_TEXTURE = { name: 'volume' } as unknown as WebGLTexture;
const DETAIL_TEXTURE = { name: 'detail' } as unknown as WebGLTexture;

/** The canvas and the camera the frames of this file are drawn with. */
const CANVAS_HEIGHT_CSS = 720;
const FIELD_OF_VIEW_DEGREES = 60;

/**
 * The selection the draw makes from the frame below. The draw chooses the records
 * itself, so a test that reads the instance count reads it here.
 */
function selectionOf(
  set: NebulaSet,
  distance: number,
  camera: readonly [number, number, number] = [0, 0, 0],
): NebulaSelection {
  return selectNebulae(set, {
    camera,
    distance,
    focalPixels: nebulaFocalPixels(CANVAS_HEIGHT_CSS, FIELD_OF_VIEW_DEGREES),
    canvasHeightCss: CANVAS_HEIGHT_CSS,
  });
}

function frameOf(
  distance: number,
  brightness = DEFAULT_NEBULA_BRIGHTNESS,
  march: Partial<NebulaFrame> = {},
): NebulaFrame {
  return {
    viewProjection: new Float32Array(16),
    chunkOffset: [0, 0, 0],
    camera: [0, 0, 0],
    distance,
    targetSize: [640, 360],
    canvasHeightCss: CANVAS_HEIGHT_CSS,
    fieldOfViewDegrees: FIELD_OF_VIEW_DEGREES,
    spriteScale: 311.7691453623979,
    brightness,
    volume: VOLUME_TEXTURE,
    detail: DETAIL_TEXTURE,
    boxMin: [-100, -100, -100],
    boxSize: [200, 200, 200],
    centre: [0, 0, 0],
    lo: -10,
    span: 10,
    epsilon: 1e-6,
    absorption: DEFAULT_ABSORPTION,
    detailScale: 1 / 127,
    occlusion: DEFAULT_NEBULA_OCCLUSION,
    ...march,
  };
}

/** The uniform names and values one draw sent, whatever their type. */
function uniformsOf(context: FakeContext): Map<unknown, unknown> {
  const sent = new Map<unknown, unknown>();
  for (const call of context.calls) {
    if (!call.name.startsWith('uniform')) continue;
    sent.set(call.args[0], JSON.stringify(call.args.slice(1)));
  }
  return sent;
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
    pass.draw(frameOf(6000));
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
    expect(selectionOf(set, 12000).instances.length).toBe(NEBULA_MAX_DRAWN);

    pass.draw(frameOf(12000));

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

    pass.draw(frameOf(60000));

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
    pass.draw(frameOf(12000));

    const cap = context.of('uniform1f').find((call) => call.args[0] === 'uMaxRadius');
    expect(cap?.args[1]).toBe(NEBULA_CAP_FRACTION * 360);
    expect(cap?.args[1]).toBe(270);
  });

  test('names the atlas layout the shader reads', () => {
    const context = fakeContext();
    const set = manySet(OVER_BUDGET);
    const pass = createNebulaPass(context.gl, fakeProgram(), set, atlasOf(context));
    pass.draw(frameOf(12000));

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
      pass.draw(frameOf(12000, brightness));
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
    pass.draw(frameOf(12000));

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

describe('the march uniforms', () => {
  // An unset `sampler3D` reads unit 0, where the atlas sits, and two samplers of
  // different types on one unit make the draw fail with `INVALID_OPERATION`.
  test('gives the three samplers three units, and sets all three with no volume', () => {
    for (const volume of [VOLUME_TEXTURE, null]) {
      const context = fakeContext();
      const set = manySet(OVER_BUDGET);
      const pass = createNebulaPass(context.gl, fakeProgram(), set, atlasOf(context));
      pass.draw(frameOf(12000, DEFAULT_NEBULA_BRIGHTNESS, { volume }));

      const units = new Map(
        context.of('uniform1i').map((call) => [call.args[0], call.args[1]]),
      );
      expect(units.get('uAtlas')).toBe(0);
      expect(units.get('uVolume')).toBe(1);
      expect(units.get('uDetail')).toBe(2);
      expect(new Set(units.values()).size).toBe(3);
    }
  });

  test('sends the box, the decoding and the absorption the volume pass reads', () => {
    const context = fakeContext();
    const set = manySet(OVER_BUDGET);
    const pass = createNebulaPass(context.gl, fakeProgram(), set, atlasOf(context));
    pass.draw(frameOf(12000));

    const floats = new Map(
      context.of('uniform1f').map((call) => [call.args[0], call.args[1]]),
    );
    expect(floats.get('uLo')).toBe(-10);
    expect(floats.get('uSpan')).toBe(10);
    expect(floats.get('uEpsilon')).toBe(1e-6);
    expect(floats.get('uAbsorption')).toBe(DEFAULT_ABSORPTION);
    expect(floats.get('uDetailScale')).toBe(1 / 127);

    const triples = new Map(
      context.of('uniform3f').map((call) => [call.args[0], call.args.slice(1)]),
    );
    expect(triples.get('uBoxMin')).toEqual([-100, -100, -100]);
    expect(triples.get('uBoxSize')).toEqual([200, 200, 200]);
    expect(triples.get('uCentre')).toEqual([0, 0, 0]);
  });

  // The multiplication happens in the shader. A stub context reads the value the pass
  // sends and nothing of the frame, so the browser readings cover the arithmetic.
  test('sends the occlusion the frame carries, and 1 by default', () => {
    expect(DEFAULT_NEBULA_OCCLUSION).toBe(1);
    const context = fakeContext();
    const set = manySet(OVER_BUDGET);
    const pass = createNebulaPass(context.gl, fakeProgram(), set, atlasOf(context));
    pass.draw(frameOf(12000, DEFAULT_NEBULA_BRIGHTNESS, { occlusion: 0.25 }));

    const sent = context.of('uniform1f').find((call) => call.args[0] === 'uOcclusion');
    expect(sent?.args[1]).toBe(0.25);
  });

  // Before the volume arrives there is nothing to march, so the sprite takes no
  // extinction and the frame is the frame the pass drew before the march existed.
  test('sends an occlusion of 0 with no volume, as it does at a constant of 0', () => {
    const set = manySet(OVER_BUDGET);
    const without = fakeContext();
    const withoutPass = createNebulaPass(
      without.gl,
      fakeProgram(),
      set,
      atlasOf(without),
    );
    withoutPass.draw(frameOf(12000, DEFAULT_NEBULA_BRIGHTNESS, { volume: null }));

    const off = fakeContext();
    const offPass = createNebulaPass(off.gl, fakeProgram(), set, atlasOf(off));
    offPass.draw(frameOf(12000, DEFAULT_NEBULA_BRIGHTNESS, { occlusion: 0 }));

    const sent = without.of('uniform1f').find((call) => call.args[0] === 'uOcclusion');
    expect(sent?.args[1]).toBe(0);
    expect(uniformsOf(without)).toEqual(uniformsOf(off));
  });
});

describe('the shared density rule', () => {
  test('reaches the volume shader and the nebula shader once', () => {
    for (const source of [volumeFragmentSource, nebulaVertexSource]) {
      const filled = withVolumeDensity(source);
      expect(filled).toContain(densitySource);
      // The rule is in place of the marker line. The chunk names that line in its own
      // header, so the test reads a whole line and not the text anywhere in the source.
      const lines = filled.split('\n').map((line) => line.trim());
      expect(lines).not.toContain('// @volume-density');
      expect(filled.split('float volumeDensity(')).toHaveLength(2);
    }
  });

  test('rejects a shader that holds no place for it', () => {
    expect(() => withVolumeDensity('void main() {}')).toThrow(
      'holds no place for the density rule',
    );
  });

  // The test above passes with a duplicate constant sitting beside the shared rule, so
  // this is the test that catches the drift.
  test('holds the constants both shaders read, and neither shader declares one', () => {
    const moved = [
      'GAMMA',
      'LOW_GAMMA',
      'KNEE',
      'DUST',
      'RIM_FULL',
      'RIM_ZERO',
      'HEIGHT_FULL',
      'HEIGHT_ZERO',
    ];
    for (const name of moved) {
      const declaration = new RegExp(`const\\s+\\w+\\s+${name}\\s*=`);
      expect(densitySource).toMatch(declaration);
      expect(volumeFragmentSource).not.toMatch(declaration);
      expect(nebulaVertexSource).not.toMatch(declaration);
    }
  });
});

describe('the march in the nebula vertex shader', () => {
  // A collapsed sprite must not pay for 64 texture fetches. A stub-context test reads
  // uniform and buffer calls and cannot watch vertex-shader control flow, so the
  // assertion is on the source. The browser suite reads the drawn count and the frame
  // cost, which is where the behaviour shows.
  test('runs after the early-out that collapses a sprite', () => {
    const collapse = nebulaVertexSource.indexOf(
      'gl_Position = vec4(0.0, 0.0, 2.0, 1.0);',
    );
    const earlyReturn = nebulaVertexSource.indexOf('return;', collapse);
    const march = nebulaVertexSource.indexOf('vTransmittance = marchTransmittance(');
    expect(collapse).toBeGreaterThan(-1);
    expect(earlyReturn).toBeGreaterThan(collapse);
    expect(march).toBeGreaterThan(earlyReturn);
  });

  test('writes a transmittance of 1 for a collapsed sprite', () => {
    const collapse = nebulaVertexSource.indexOf(
      'gl_Position = vec4(0.0, 0.0, 2.0, 1.0);',
    );
    const earlyReturn = nebulaVertexSource.indexOf('return;', collapse);
    const block = nebulaVertexSource.slice(collapse, earlyReturn);
    expect(block).toContain('vTransmittance = vec3(1.0);');
  });

  // The transmittance is a `vec3` and not a scalar, because the requirement says it
  // carries the volume's three dust weights. A grey transmittance would dim a nebula
  // without turning it warm.
  test('accumulates the optical depth per channel', () => {
    expect(nebulaVertexSource).toContain('out vec3 vTransmittance;');
    expect(nebulaVertexSource).toContain('vec3 depth = vec3(0.0);');
    expect(nebulaVertexSource).toContain('depth += DUST * (density * uAbsorption');
  });
});

/**
 * Three cameras inside the zoom band, at three distances from the records. The set below
 * puts its records on the `z` axis, so a camera further along it selects a different
 * group of them and sorts them in a different order.
 */
const BAND_VIEWS: { distance: number; camera: readonly [number, number, number] }[] = [
  { distance: 2000, camera: [0, 0, 0] },
  { distance: 6000, camera: [0, 0, 4000] },
  { distance: 12000, camera: [0, 500, 8000] },
];

/** The instance array one draw uploaded, cut to the floats the draw sent. */
function uploadedInstances(context: FakeContext, count: number): Float32Array {
  const call = context.of('bufferSubData')[0];
  const data = call?.args[2] as Float32Array;
  return data.slice(0, count * NEBULA_INSTANCE_FLOATS);
}

// The renderer chose the records before this change and handed the pass a list. The draw
// chooses them now, from the frame it is given. The two paths must give one picture, so
// this test runs the old path beside the new one and compares what reaches the card.
describe('the selection the draw makes', () => {
  test('matches the selection the caller made before, at three views in the band', () => {
    for (const view of BAND_VIEWS) {
      const context = fakeContext();
      const set = manySet(OVER_BUDGET);
      const pass = createNebulaPass(context.gl, fakeProgram(), set, atlasOf(context));

      // The old path: the caller selects, then writes the instances itself.
      const selection = selectionOf(set, view.distance, view.camera);
      const expected = new Float32Array(NEBULA_MAX_DRAWN * NEBULA_INSTANCE_FLOATS);
      const count = writeNebulaInstances(set, selection.instances, expected);

      pass.draw(
        frameOf(view.distance, DEFAULT_NEBULA_BRIGHTNESS, { camera: view.camera }),
      );

      expect(count).toBeGreaterThan(0);
      expect(pass.drawnCount, `${view.distance} ly drew a different count`).toBe(count);
      // The floats carry the order as well as the values: each slot holds the position,
      // the radius, the tile and the fade of one record, in the draw order.
      expect(
        [...uploadedInstances(context, count)],
        `${view.distance} ly sent different instances`,
      ).toEqual([...expected.slice(0, count * NEBULA_INSTANCE_FLOATS)]);
      expect(pass.drawCalls).toBe(1);
    }
  });

  // The figures the pass read before this change, at the views the tests above use.
  // A selection that moved into the draw and changed what it chose would read here.
  test('reads the drawn count and the draw call count it read before', () => {
    const context = fakeContext();
    const set = manySet(OVER_BUDGET);
    const pass = createNebulaPass(context.gl, fakeProgram(), set, atlasOf(context));

    pass.draw(frameOf(12000));
    expect(pass.drawnCount).toBe(NEBULA_MAX_DRAWN);
    expect(pass.drawCalls).toBe(1);

    pass.draw(frameOf(6000));
    expect(pass.drawnCount).toBe(NEBULA_MAX_DRAWN);
    expect(pass.drawCalls).toBe(1);

    // Above the far end of the band the weight is 0, so nothing draws.
    pass.draw(frameOf(60000));
    expect(pass.drawnCount).toBe(0);
    expect(pass.drawCalls).toBe(0);
  });
});
