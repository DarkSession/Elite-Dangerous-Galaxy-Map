import { describe, expect, test } from 'vitest';
import {
  buildNebulaSet,
  nebulaFocalPixels,
  selectNebulae,
} from '../scene-data/nebulae';
import type { NebulaSelection, NebulaSet } from '../scene-data/nebulae';
import {
  createNebulaPass,
  NEBULA_BOX_CORNERS,
  NEBULA_BOX_VERTICES,
  NEBULA_WORLD_FLIP,
  nebulaRotationMatrix,
} from './nebula-pass';
import type { NebulaVolumeTexture, NebulaVolumeTextures } from './nebula-volumes';
import {
  DEFAULT_NEBULA_LIGHT_GAIN,
  DEFAULT_NEBULA_OCCLUSION,
  DEFAULT_NEBULA_STEP_RATE,
} from './nebula-slot';
import type { NebulaFrame } from './nebula-slot';
import type { Program } from './program';
import { DEFAULT_ABSORPTION } from './volume-pass';
import { withVolumeDensity } from './volume-density';
import densitySource from './shaders/volume-density.glsl?raw';
import nebulaVertexSource from './shaders/nebulae.vert?raw';
import nebulaFragmentSource from './shaders/nebulae.frag?raw';
import volumeFragmentSource from './shaders/volume.frag?raw';
import compositeVertexSource from './shaders/fullscreen.vert?raw';
import compositeFragmentSource from './shaders/nebula-composite.frag?raw';

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
        // The pass compiles its own composite program, so the two status reads answer
        // true. Every other call gives a handle for a `create` and null otherwise.
        if (key === 'getShaderParameter' || key === 'getProgramParameter') return true;
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
    'uPosition',
    'uRadius',
    'uWeight',
    'uFade',
    'uSteps',
    'uLightGain',
    'uRotation',
    'uDensity',
    'uColour',
    'uNebulaTransfer',
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

/** More records than any one frame of this file draws. */
const MANY = 264;

/** How many assets the committed set holds, which the fixtures below name. */
const ASSET_COUNT = 33;

/** A set whose records sit on the `z` axis, one per light year of asset index. */
function manySet(count: number): NebulaSet {
  const records: unknown[] = [];
  for (let index = 0; index < count; index += 1) {
    records.push([0, 0, 5000 + index * 10, 60, index % ASSET_COUNT, 0, 0, 0]);
  }
  return buildNebulaSet({ records });
}

/** The uploaded textures the march reads. The pass binds them and reads nothing of them. */
const VOLUME_TEXTURE = { name: 'volume' } as unknown as WebGLTexture;
const DETAIL_TEXTURE = { name: 'detail' } as unknown as WebGLTexture;

/** A set of uploaded assets, one per index a record can name. */
function volumesOf(count = ASSET_COUNT): NebulaVolumeTextures {
  const assets: NebulaVolumeTexture[] = [];
  for (let index = 0; index < count; index += 1) {
    assets.push({
      name: `asset-${index}`,
      density: { name: `density-${index}` } as unknown as WebGLTexture,
      colour: { name: `colour-${index}` } as unknown as WebGLTexture,
      transfer: { name: `transfer-${index}` } as unknown as WebGLTexture,
      densitySide: 32,
      colourSide: 8,
    });
  }
  let disposed = 0;
  return {
    assets,
    dispose(): void {
      disposed += 1;
      assets.length = disposed * 0 + assets.length;
    },
  };
}

/** The canvas and the camera the frames of this file are drawn with. */
const CANVAS_HEIGHT_CSS = 720;
const CANVAS_WIDTH_CSS = 1280;
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
    canvasWidthCss: CANVAS_WIDTH_CSS,
  });
}

function frameOf(distance: number, march: Partial<NebulaFrame> = {}): NebulaFrame {
  return {
    viewProjection: new Float32Array(16),
    chunkOffset: [0, 0, 0],
    camera: [0, 0, 0],
    distance,
    targetSize: [640, 360],
    floatTarget: true,
    canvasHeightCss: CANVAS_HEIGHT_CSS,
    canvasWidthCss: CANVAS_WIDTH_CSS,
    fieldOfViewDegrees: FIELD_OF_VIEW_DEGREES,
    lightGain: [...DEFAULT_NEBULA_LIGHT_GAIN],
    stepRate: DEFAULT_NEBULA_STEP_RATE,
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
    reverseOrder: false,
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

/** The draw calls of the records alone: 36 vertices each. */
function recordDraws(context: FakeContext): Call[] {
  return context
    .of('drawArrays')
    .filter((call) => call.args[2] === NEBULA_BOX_VERTICES);
}

/** The composite draw calls: one full-screen triangle each. */
function compositeDraws(context: FakeContext): Call[] {
  return context.of('drawArrays').filter((call) => call.args[2] === 3);
}

/** Every value one uniform took over a draw, in the order the draw sent them. */
function everyValueOf(context: FakeContext, name: string): unknown[] {
  return context.calls
    .filter((call) => call.name.startsWith('uniform') && call.args[0] === name)
    .map((call) => call.args.slice(1));
}

describe('the marched box', () => {
  // One draw call per record covers 12 triangles of three vertices.
  test('holds 36 vertices of three floats', () => {
    expect(NEBULA_BOX_VERTICES).toBe(36);
    expect(NEBULA_BOX_CORNERS).toHaveLength(36 * 3);
    for (const value of NEBULA_BOX_CORNERS) expect(Math.abs(value)).toBe(1);
  });

  // The pass culls the front faces so a camera inside a box still gets a fragment. That
  // only works if every face is wound the same way round.
  test('winds every face counter-clockwise seen from outside', () => {
    for (let triangle = 0; triangle < 12; triangle += 1) {
      const at = triangle * 9;
      const point = (slot: number): number[] => [
        NEBULA_BOX_CORNERS[at + slot * 3] as number,
        NEBULA_BOX_CORNERS[at + slot * 3 + 1] as number,
        NEBULA_BOX_CORNERS[at + slot * 3 + 2] as number,
      ];
      const [a, b, c] = [point(0), point(1), point(2)];
      const u = b.map((value, axis) => value - (a[axis] as number));
      const v = c.map((value, axis) => value - (a[axis] as number));
      const normal = [
        (u[1] as number) * (v[2] as number) - (u[2] as number) * (v[1] as number),
        (u[2] as number) * (v[0] as number) - (u[0] as number) * (v[2] as number),
        (u[0] as number) * (v[1] as number) - (u[1] as number) * (v[0] as number),
      ];
      // The face centre is the mean of its three corners, and it points outward from
      // the cube's own centre. A counter-clockwise winding puts the normal with it.
      const centre = a.map(
        (value, axis) => (value + (b[axis] as number) + (c[axis] as number)) / 3,
      );
      const dot = normal.reduce(
        (sum, value, axis) => sum + value * (centre[axis] as number),
        0,
      );
      expect(dot, `triangle ${triangle} faces inward`).toBeGreaterThan(0);
    }
  });

  // Every face of the cube is covered, so no ray enters through a hole.
  test('covers all six faces, twice each', () => {
    const faces = new Map<string, number>();
    for (let triangle = 0; triangle < 12; triangle += 1) {
      const at = triangle * 9;
      for (let axis = 0; axis < 3; axis += 1) {
        const values = [0, 1, 2].map(
          (slot) => NEBULA_BOX_CORNERS[at + slot * 3 + axis] as number,
        );
        if (values.every((value) => value === values[0])) {
          const key = `${axis}:${values[0] as number}`;
          faces.set(key, (faces.get(key) ?? 0) + 1);
        }
      }
    }
    expect(faces.size).toBe(6);
    // Two triangles cover one face, and no triangle is flat on two axes at once.
    for (const count of faces.values()) expect(count).toBe(2);
  });
});

describe('the rotation matrix', () => {
  /** The matrix as rows, from the column-major array the uniform takes. */
  function rowsOf(matrix: Float32Array): number[][] {
    return [0, 1, 2].map((row) =>
      [0, 1, 2].map((column) => matrix[column * 3 + row] as number),
    );
  }

  test('gives the identity with its z column negated for a record of three zeros', () => {
    const rows = rowsOf(nebulaRotationMatrix([0, 0, 0]));
    expect(rows[0]?.map((v) => Math.round(v) + 0)).toEqual([1, 0, 0]);
    expect(rows[1]?.map((v) => Math.round(v) + 0)).toEqual([0, 1, 0]);
    expect(rows[2]?.map((v) => Math.round(v) + 0)).toEqual([0, 0, -1]);
    expect(NEBULA_WORLD_FLIP).toEqual([1, 1, -1]);
  });

  // The convention is `Rx(a) * Ry(b) * Rz(c)` composed with the flip. A quarter turn
  // about x alone is what the five rotated records mostly carry.
  test('reads a quarter turn about x as Rx', () => {
    const rows = rowsOf(nebulaRotationMatrix([Math.PI / 2, 0, 0]));
    expect(rows[0]?.map((v) => Math.round(v) + 0)).toEqual([1, 0, 0]);
    expect(rows[1]?.map((v) => Math.round(v) + 0)).toEqual([0, 0, 1]);
    expect(rows[2]?.map((v) => Math.round(v) + 0)).toEqual([0, 1, 0]);
  });

  // Three angles compose in that order, and no other order gives this matrix.
  test('composes the three angles as Rx then Ry then Rz', () => {
    const [a, b, c] = [0.3, 0.7, 1.1];
    const rows = rowsOf(nebulaRotationMatrix([a, b, c]));
    expect(rows[0]?.[0]).toBeCloseTo(Math.cos(b) * Math.cos(c), 6);
    expect(rows[0]?.[2]).toBeCloseTo(-Math.sin(b), 6);
    expect(rows[2]?.[2]).toBeCloseTo(-Math.cos(a) * Math.cos(b), 6);
  });

  test('writes into the array it is given', () => {
    const out = new Float32Array(9);
    expect(nebulaRotationMatrix([0, 0, 0], out)).toBe(out);
  });
});

describe('the nebula pass', () => {
  test('draws one call per selected record, and one composite over them', () => {
    const context = fakeContext();
    const set = manySet(MANY);
    const pass = createNebulaPass(context.gl, fakeProgram(), set, volumesOf());
    const expected = selectionOf(set, 12000).instances.length;

    pass.draw(frameOf(12000));

    const draws = recordDraws(context);
    expect(draws).toHaveLength(expected);
    expect(draws[0]?.args.slice(1)).toEqual([0, NEBULA_BOX_VERTICES]);
    expect(pass.drawCalls).toBe(expected);
    expect(pass.drawnCount).toBe(expected);
    // The composite is one draw call and it is the last of the draw.
    expect(compositeDraws(context)).toHaveLength(1);
    expect(context.of('drawArrays').at(-1)?.args.slice(1)).toEqual([0, 3]);
  });

  // The records add their emissions and multiply their transmittances, so neither the
  // colour nor the alpha of the target depends on the draw order. The composite then
  // applies the target to the scene with source-over. Plain `blendFunc` on the records
  // would set all four channels and leave the alpha channel at 1.
  test('sets the record blend first and the composite blend second', () => {
    const context = fakeContext();
    const gl = context.gl;
    const pass = createNebulaPass(context.gl, fakeProgram(), manySet(4), volumesOf());

    pass.draw(frameOf(6000));

    expect(context.of('blendFuncSeparate')).toHaveLength(1);
    expect(context.of('blendFuncSeparate')[0]?.args).toEqual([
      gl.ONE,
      gl.ONE,
      gl.ZERO,
      gl.SRC_ALPHA,
    ]);
    expect(context.of('blendFunc')).toHaveLength(1);
    expect(context.of('blendFunc')[0]?.args).toEqual([gl.ONE, gl.ONE_MINUS_SRC_ALPHA]);
    // The record blend is set before the records draw and the composite blend after
    // them.
    const names = context.calls.map((call) => call.name);
    expect(names.indexOf('blendFuncSeparate')).toBeLessThan(names.indexOf('blendFunc'));
    expect(names.indexOf('blendFunc')).toBeGreaterThan(names.lastIndexOf('uniform3f'));
  });

  // The camera can be inside a box, so the front faces are the ones that go.
  test('culls the front faces, not the back ones', () => {
    const context = fakeContext();
    const gl = context.gl;
    const pass = createNebulaPass(context.gl, fakeProgram(), manySet(4), volumesOf());
    pass.draw(frameOf(12000));

    expect(context.of('enable').some((call) => call.args[0] === gl.CULL_FACE)).toBe(
      true,
    );
    expect(context.of('cullFace')[0]?.args).toEqual([gl.FRONT]);
    expect(context.of('disable').some((call) => call.args[0] === gl.CULL_FACE)).toBe(
      true,
    );
  });

  test('draws nothing and issues no draw call when the zoom weight is 0', () => {
    const context = fakeContext();
    const pass = createNebulaPass(
      context.gl,
      fakeProgram(),
      manySet(MANY),
      volumesOf(),
    );

    pass.draw(frameOf(60000));

    expect(context.of('drawArrays')).toHaveLength(0);
    expect(pass.drawnCount).toBe(0);
    expect(pass.drawCalls).toBe(0);
  });

  // The spec's scenario **The composite runs once whatever the count**. The zero case is
  // the one that matters: the default view is at 60,000 light years, where the zoom
  // weight is 0, so a composite that ran anyway would cost the commonest frame the map
  // draws.
  test('clears once and composites once, whatever the count of records', () => {
    for (const count of [1, 100]) {
      const context = fakeContext();
      const set = manySet(count);
      const pass = createNebulaPass(context.gl, fakeProgram(), set, volumesOf());

      pass.draw(frameOf(12000));

      expect(recordDraws(context).length, `${count} records drew none`).toBe(
        pass.drawCalls,
      );
      expect(pass.drawCalls, `${count} records drew no record`).toBeGreaterThan(0);
      expect(context.of('clear'), `${count} records cleared twice`).toHaveLength(1);
      expect(compositeDraws(context), `${count} records composited twice`).toHaveLength(
        1,
      );
    }

    const empty = fakeContext();
    const none = createNebulaPass(empty.gl, fakeProgram(), manySet(MANY), volumesOf());
    none.draw(frameOf(60000));

    expect(none.drawCalls).toBe(0);
    expect(empty.of('clear')).toHaveLength(0);
    expect(compositeDraws(empty)).toHaveLength(0);
    // The target is not built either, so a map that never reaches the band pays for no
    // target at all.
    expect(empty.of('createFramebuffer')).toHaveLength(0);
  });

  // The accumulation target follows the half-resolution target: one target, built at the
  // first frame that draws, resized where the size changes and freed on `dispose`.
  test('builds the accumulation target once and resizes it with the frame', () => {
    const context = fakeContext();
    const pass = createNebulaPass(context.gl, fakeProgram(), manySet(4), volumesOf());

    pass.draw(frameOf(6000));
    expect(context.of('createFramebuffer')).toHaveLength(1);
    const first = context.of('texImage2D').length;

    // The same size again builds nothing and allocates nothing.
    pass.draw(frameOf(6000));
    expect(context.of('createFramebuffer')).toHaveLength(1);
    expect(context.of('texImage2D')).toHaveLength(first);

    // A different size allocates the image again, and still builds no second target.
    pass.draw(frameOf(6000, { targetSize: [960, 540] }));
    expect(context.of('createFramebuffer')).toHaveLength(1);
    expect(context.of('texImage2D').length).toBe(first + 1);

    pass.dispose();
    expect(context.of('deleteFramebuffer')).toHaveLength(1);
  });

  // The selection can hold records the pass cannot draw, because the set names an asset
  // index the volume set does not hold. A frame of nothing but those records draws no
  // record, so it pays for no target, no clear and no composite either.
  test('builds nothing where the set holds no asset for any record', () => {
    const context = fakeContext();
    const set = buildNebulaSet({
      records: [
        [0, 0, 400, 200, 98, 0, 0, 0],
        [0, 0, 200, 200, 99, 0, 0, 0],
      ],
    });
    const pass = createNebulaPass(context.gl, fakeProgram(), set, volumesOf(4));

    pass.draw(frameOf(6000));

    expect(pass.drawCalls).toBe(0);
    expect(context.of('createFramebuffer')).toHaveLength(0);
    expect(context.of('clear')).toHaveLength(0);
    expect(compositeDraws(context)).toHaveLength(0);
  });

  // The emission sum starts at 0 and the transmittance product at 1. The alpha channel
  // holds that product, so the clear puts 1 there and not 0.
  test('clears the accumulation target to no emission and full transmittance', () => {
    const context = fakeContext();
    const pass = createNebulaPass(context.gl, fakeProgram(), manySet(4), volumesOf());

    pass.draw(frameOf(6000));

    expect(context.of('clearColor').map((call) => call.args)).toEqual([[0, 0, 0, 1]]);
  });

  // The accumulation target holds the number format the frame names, which is the format
  // the renderer built its own colour targets with. A card that gives no float target
  // therefore draws the nebulae as it draws the rest of the scene.
  test('builds the accumulation target in the number format the frame names', () => {
    const float = fakeContext();
    createNebulaPass(float.gl, fakeProgram(), manySet(4), volumesOf()).draw(
      frameOf(6000),
    );
    const floatImage = float.of('texImage2D')[0]?.args;
    expect(floatImage?.[2]).toBe(float.gl.RGBA16F);
    expect(floatImage?.[7]).toBe(float.gl.HALF_FLOAT);

    const byte = fakeContext();
    createNebulaPass(byte.gl, fakeProgram(), manySet(4), volumesOf()).draw(
      frameOf(6000, { floatTarget: false }),
    );
    const byteImage = byte.of('texImage2D')[0]?.args;
    expect(byteImage?.[2]).toBe(byte.gl.RGBA8);
    expect(byteImage?.[7]).toBe(byte.gl.UNSIGNED_BYTE);
  });

  // The record draws go into the accumulation target and the composite goes into the
  // target the renderer bound, which the draw reads and puts back.
  test('draws the records into its own target and composites into the one it found', () => {
    const context = fakeContext();
    const pass = createNebulaPass(context.gl, fakeProgram(), manySet(4), volumesOf());

    pass.draw(frameOf(6000));

    // The draw reads the binding it found rather than taking one from the frame, and it
    // reads it before it builds the target: building one leaves no framebuffer bound,
    // so a read after it would give null and the composite would go to the canvas.
    expect(context.of('getParameter')[0]?.args).toEqual([
      context.gl.FRAMEBUFFER_BINDING,
    ]);
    const order = context.calls.map((call) => call.name);
    expect(order.indexOf('getParameter')).toBeLessThan(
      order.indexOf('createFramebuffer'),
    );
    const bound = context.of('bindFramebuffer').map((call) => call.args[1]);
    // The last bind puts back what `getParameter` gave, which is null on this context.
    expect(bound.at(-1)).toBeNull();
    // The clear and every record draw run against the pass's own target, and the
    // composite runs after the binding goes back.
    const names = context.calls.map((call) => call.name);
    expect(names.lastIndexOf('bindFramebuffer')).toBeGreaterThan(
      names.indexOf('clear'),
    );
    expect(names.lastIndexOf('bindFramebuffer')).toBeLessThan(
      names.lastIndexOf('drawArrays'),
    );
  });

  // The record is in game coordinates and the pass draws in the world frame.
  test('sends the record position with its z negated', () => {
    const context = fakeContext();
    const set = buildNebulaSet({ records: [[10, 20, 30, 200, 0, 0, 0, 0, 'one']] });
    const pass = createNebulaPass(context.gl, fakeProgram(), set, volumesOf());

    pass.draw(frameOf(6000));

    expect(everyValueOf(context, 'uPosition')).toEqual([[10, 20, -30]]);
    expect(everyValueOf(context, 'uRadius')).toEqual([[200]]);
  });

  // Each record binds its own three textures, on three units of their own.
  test('binds the asset each record names', () => {
    const context = fakeContext();
    const set = buildNebulaSet({
      records: [
        [0, 0, 400, 200, 7, 0, 0, 0],
        [0, 0, 200, 200, 2, 0, 0, 0],
      ],
    });
    const volumes = volumesOf();
    const pass = createNebulaPass(context.gl, fakeProgram(), set, volumes);

    pass.draw(frameOf(6000));

    const bound = context
      .of('bindTexture')
      .map((call) => (call.args[1] as { name?: string } | null)?.name)
      .filter((name) => name?.startsWith('density') === true);
    // Largest first: the two records hold one radius, so the nearer one draws first.
    expect(bound).toEqual(['density-2', 'density-7']);
  });

  // The march reads the transfer table with `texelFetch`, so the three samplers each
  // take a unit of their own and the draw sets all three.
  test('gives the three asset samplers three units of their own', () => {
    const context = fakeContext();
    const pass = createNebulaPass(context.gl, fakeProgram(), manySet(2), volumesOf());
    pass.draw(frameOf(6000));

    const sent = uniformsOf(context);
    const units = ['uDensity', 'uColour', 'uNebulaTransfer', 'uVolume', 'uDetail'].map(
      (name) => sent.get(name),
    );
    expect(new Set(units).size).toBe(5);
    for (const unit of units) expect(unit).toBeDefined();
  });

  test('sends the light gain and the step rate the frame carries', () => {
    const context = fakeContext();
    const pass = createNebulaPass(context.gl, fakeProgram(), manySet(2), volumesOf());

    pass.draw(frameOf(6000, { lightGain: [1, 2, 3], stepRate: 25 }));

    const sent = uniformsOf(context);
    expect(sent.get('uLightGain')).toBe(JSON.stringify([1, 2, 3]));
    expect(sent.get('uSteps')).toBe(JSON.stringify([25]));
  });

  // The light gain scales the emission alone. The shader multiplies it into the colour
  // and never into the alpha, which a stub context cannot watch, so this reads the text.
  test('doubling the light gain doubles the colour and leaves the alpha alone', () => {
    expect(nebulaFragmentSource).toContain(
      'emission += colour * uLightGain * transmittance.rgb * density * step;',
    );
    // The alpha is the record's transmittance, which the pass multiplies the
    // accumulated alpha by. The match is exact: the text of the alpha the shader wrote
    // before this change is inside the new one, so a loose match would check nothing.
    const alpha = nebulaFragmentSource.slice(
      nebulaFragmentSource.indexOf('fragColour = vec4('),
    );
    expect(alpha).toBe(
      'fragColour = vec4(\n' +
        '    emission * vTransmittance * vWeight,\n' +
        '    1.0 - (1.0 - transmittance.a) * mean * vWeight);\n}\n',
    );
    expect(alpha).not.toContain('uLightGain');
  });

  // The draw writes into one array it owns, so a test that kept the reference would
  // read the last record's matrix twice. Each set below holds one record.
  test('sends each record the matrix its own rotation builds', () => {
    const matrices: number[][] = [];
    for (const rotation of [
      [Math.PI / 2, 0, 0],
      [0, 0, 0],
    ]) {
      const context = fakeContext();
      const set = buildNebulaSet({ records: [[0, 0, 400, 200, 0, ...rotation]] });
      const pass = createNebulaPass(context.gl, fakeProgram(), set, volumesOf());
      pass.draw(frameOf(6000));

      const sent = context.calls.filter((call) => call.name === 'uniformMatrix3fv');
      expect(sent).toHaveLength(1);
      matrices.push([...(sent[0]?.args[2] as Float32Array)]);
    }
    expect(matrices[0]).not.toEqual(matrices[1]);
    expect(matrices[1]).toEqual([...nebulaRotationMatrix([0, 0, 0])]);
    // The set holds the angles as float32, so the expected matrix takes the same
    // rounding the record file's own value took.
    const quarter = Math.fround(Math.PI / 2);
    expect(matrices[0]).toEqual([...nebulaRotationMatrix([quarter, 0, 0])]);
  });

  // One asset serves many records. `bright-02` is asset 3 of the committed index, and
  // the record file puts several records over it. The two records below share it and
  // differ in radius and in rotation, so the pass must bind one pair of textures twice
  // and send a radius and a matrix of each record's own.
  test("draws two records over one asset with each record's own size and turn", () => {
    const context = fakeContext();
    const BRIGHT_02 = 3;
    const set = buildNebulaSet({
      records: [
        [0, 0, 400, 60, BRIGHT_02, 0, 0, 0],
        [0, 0, 200, 30, BRIGHT_02, Math.PI / 2, 0, 0],
      ],
    });
    const pass = createNebulaPass(context.gl, fakeProgram(), set, volumesOf());

    pass.draw(frameOf(6000));

    const bound = context
      .of('bindTexture')
      .map((call) => (call.args[1] as { name?: string } | null)?.name)
      .filter((name) => name?.startsWith('density') === true);
    // The same asset, once per record. The two hold one apparent size, so the order is
    // the file's own.
    expect(bound).toEqual(['density-3', 'density-3']);
    expect(pass.drawCalls).toBe(2);

    // The radius is the record's own, so one asset draws 120 light years across and the
    // other 60.
    expect(everyValueOf(context, 'uRadius')).toEqual([[60], [30]]);

    // The draw writes the matrix into one array it owns, so a reading of both calls of
    // one draw would read the last matrix twice. Each record is drawn alone here.
    const matrices = [
      [0, 0, 0],
      [Math.PI / 2, 0, 0],
    ].map((rotation) => {
      const one = fakeContext();
      const alone = buildNebulaSet({
        records: [[0, 0, 400, 60, BRIGHT_02, ...rotation]],
      });
      createNebulaPass(one.gl, fakeProgram(), alone, volumesOf()).draw(frameOf(6000));
      const sent = one.calls.filter((call) => call.name === 'uniformMatrix3fv');
      expect(sent).toHaveLength(1);
      return [...(sent[0]?.args[2] as Float32Array)];
    });
    expect(matrices[0]).toEqual([...nebulaRotationMatrix([0, 0, 0])]);
    expect(matrices[1]).toEqual([
      ...nebulaRotationMatrix([Math.fround(Math.PI / 2), 0, 0]),
    ]);
    expect(matrices[0]).not.toEqual(matrices[1]);
  });

  // The frame does not read the draw order, so the pass draws the records in the order
  // the selection gives them, which is largest first. The three records below hold one
  // radius, so the nearest is the largest.
  test('does not order the records by range', () => {
    const context = fakeContext();
    const set = buildNebulaSet({
      records: [
        [0, 0, 200, 200, 0, 0, 0, 0],
        [0, 0, 600, 200, 1, 0, 0, 0],
        [0, 0, 400, 200, 2, 0, 0, 0],
      ],
    });
    const pass = createNebulaPass(context.gl, fakeProgram(), set, volumesOf());

    pass.draw(frameOf(6000));

    expect(everyValueOf(context, 'uPosition')).toEqual([
      [0, 0, -200],
      [0, 0, -400],
      [0, 0, -600],
    ]);
  });

  // The probe of the order independence: the same frame with `reverseOrder` draws the
  // same records in the opposite order, and issues the same count of draw calls.
  test('draws the records in the reverse order when the frame asks', () => {
    const records = [
      [0, 0, 200, 200, 0, 0, 0, 0],
      [0, 0, 600, 200, 1, 0, 0, 0],
      [0, 0, 400, 200, 2, 0, 0, 0],
    ];
    const forward = fakeContext();
    const first = createNebulaPass(
      forward.gl,
      fakeProgram(),
      buildNebulaSet({ records }),
      volumesOf(),
    );
    first.draw(frameOf(6000));

    const backward = fakeContext();
    const second = createNebulaPass(
      backward.gl,
      fakeProgram(),
      buildNebulaSet({ records }),
      volumesOf(),
    );
    second.draw(frameOf(6000, { reverseOrder: true }));

    expect(everyValueOf(backward, 'uPosition')).toEqual(
      [...everyValueOf(forward, 'uPosition')].reverse(),
    );
    expect(second.drawCalls).toBe(first.drawCalls);
    expect(compositeDraws(backward)).toHaveLength(1);
  });

  // A record naming an asset the set does not hold draws nothing rather than throwing.
  // The loader applies no upper bound, so this is where a mismatch lands at run time.
  test('skips a record whose asset the set does not hold', () => {
    const context = fakeContext();
    const set = buildNebulaSet({
      records: [
        [0, 0, 400, 200, 0, 0, 0, 0],
        [0, 0, 200, 200, 99, 0, 0, 0],
      ],
    });
    const pass = createNebulaPass(context.gl, fakeProgram(), set, volumesOf(4));

    pass.draw(frameOf(6000));

    expect(pass.drawCalls).toBe(1);
  });

  test('frees the program, the buffers and the textures on dispose', () => {
    const context = fakeContext();
    let freed = 0;
    const volumes: NebulaVolumeTextures = {
      assets: volumesOf().assets,
      dispose(): void {
        freed += 1;
      },
    };
    const pass = createNebulaPass(context.gl, fakeProgram(), manySet(2), volumes);

    pass.dispose();

    expect(freed).toBe(1);
    expect(context.of('deleteBuffer')).toHaveLength(1);
    // The box vertex array and the composite's empty one.
    expect(context.of('deleteVertexArray')).toHaveLength(2);
    // The record program and the composite program.
    expect(context.of('deleteProgram')).toHaveLength(2);
  });
});

describe('the march uniforms', () => {
  test('sends the box, the decoding and the absorption the volume pass reads', () => {
    const context = fakeContext();
    const pass = createNebulaPass(context.gl, fakeProgram(), manySet(2), volumesOf());

    pass.draw(frameOf(6000));

    const sent = uniformsOf(context);
    expect(sent.get('uBoxMin')).toBe(JSON.stringify([-100, -100, -100]));
    expect(sent.get('uBoxSize')).toBe(JSON.stringify([200, 200, 200]));
    expect(sent.get('uCentre')).toBe(JSON.stringify([0, 0, 0]));
    expect(sent.get('uLo')).toBe(JSON.stringify([-10]));
    expect(sent.get('uSpan')).toBe(JSON.stringify([10]));
    expect(sent.get('uEpsilon')).toBe(JSON.stringify([1e-6]));
    expect(sent.get('uAbsorption')).toBe(JSON.stringify([DEFAULT_ABSORPTION]));
    expect(sent.get('uDetailScale')).toBe(JSON.stringify([1 / 127]));
  });

  test('sends the occlusion the frame carries, and 1 by default', () => {
    const context = fakeContext();
    const pass = createNebulaPass(context.gl, fakeProgram(), manySet(2), volumesOf());

    pass.draw(frameOf(6000));
    expect(uniformsOf(context).get('uOcclusion')).toBe(JSON.stringify([1]));

    const half = fakeContext();
    const other = createNebulaPass(half.gl, fakeProgram(), manySet(2), volumesOf());
    other.draw(frameOf(6000, { occlusion: 0.5 }));
    expect(uniformsOf(half).get('uOcclusion')).toBe(JSON.stringify([0.5]));
  });

  test('sends an occlusion of 0 with no volume, as it does at a constant of 0', () => {
    const context = fakeContext();
    const pass = createNebulaPass(context.gl, fakeProgram(), manySet(2), volumesOf());

    pass.draw(frameOf(6000, { volume: null }));

    expect(uniformsOf(context).get('uOcclusion')).toBe(JSON.stringify([0]));
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
  // A collapsed box must not pay for 64 texture fetches. A stub-context test reads
  // uniform and buffer calls and cannot watch vertex-shader control flow, so the
  // assertion is on the source. The browser suite reads the drawn count and the frame
  // cost, which is where the behaviour shows.
  test('runs after the early-out that collapses a box', () => {
    const collapse = nebulaVertexSource.indexOf(
      'gl_Position = vec4(0.0, 0.0, 2.0, 1.0);',
    );
    const earlyReturn = nebulaVertexSource.indexOf('return;', collapse);
    const march = nebulaVertexSource.indexOf('vTransmittance = marchTransmittance(');
    expect(collapse).toBeGreaterThan(-1);
    expect(earlyReturn).toBeGreaterThan(collapse);
    expect(march).toBeGreaterThan(earlyReturn);
  });

  test('writes a transmittance of 1 for a collapsed box', () => {
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

  // The 36 vertices of one box march the same segment, so every one reaches the same
  // answer. The march reads the record's centre alone and no per-vertex value.
  test('marches the record centre, so every vertex reaches the same answer', () => {
    expect(nebulaVertexSource).toContain(
      'vTransmittance = marchTransmittance(centre);',
    );
    expect(nebulaVertexSource).not.toContain('marchTransmittance(aCorner');
  });

  // Nothing names the atlas or a tile any more. `tests/main-bundle.test.ts` reads
  // `vMarchObject` and `uNebulaTransfer` as its needles, so this holds both in place.
  test('names the volume varyings and no tile', () => {
    expect(nebulaVertexSource).toContain('out vec3 vMarchObject;');
    expect(nebulaFragmentSource).toContain('uniform sampler2D uNebulaTransfer;');
    for (const source of [nebulaVertexSource, nebulaFragmentSource]) {
      expect(source).not.toContain('vTileUv');
      expect(source).not.toContain('uAtlas');
    }
  });
});

describe('the fragment march', () => {
  // The near end clamps at 0 so a camera inside the box starts its march at the eye.
  test('clamps the near end of the slab at 0', () => {
    expect(nebulaFragmentSource).toContain(
      'float near = max(max(low.x, low.y), max(low.z, 0.0));',
    );
  });

  // Five assets carry a negative extinction channel, so the transmittance can rise
  // above 1 along a ray. The client applies no upper clamp and neither does this.
  test('applies no upper clamp to the transmittance', () => {
    expect(nebulaFragmentSource).toContain(
      'transmittance *= max(vec4(0.0), vec4(1.0) - extinction * density * step);',
    );
    expect(nebulaFragmentSource).not.toContain('min(vec4(1.0), transmittance');
  });

  test('abandons a ray below 0.01 transmittance and takes at most 256 steps', () => {
    expect(nebulaFragmentSource).toContain('const int MAX_STEPS = 256;');
    expect(nebulaFragmentSource).toContain(
      'if (all(lessThan(transmittance, vec4(0.01)))) break;',
    );
    expect(nebulaFragmentSource).toContain('count = clamp(count, 1, MAX_STEPS);');
  });

  // The stored volume runs opposite to object-space y.
  test('samples at (u, 1 - v, w)', () => {
    expect(nebulaFragmentSource).toContain('uvw.y = 1.0 - uvw.y;');
    expect(nebulaFragmentSource).toContain('sampleVolume(uDensity, uvw).r;');
    // BC1 carries no alpha and the fallback uploads 255. The march reads `.rgb`, so
    // the block path and the decoding path agree.
    expect(nebulaFragmentSource).toContain('sampleVolume(uColour, uvw).rgb;');
  });

  // The two volumes are slice arrays, because WebGL exposes no compressed format for
  // `TEXTURE_3D`. GLSL ES 3.00 gives `sampler2DArray` no default precision in the
  // fragment language, so the shader does not compile without the precision line.
  test('reads the two volumes as arrays and declares their precision', () => {
    expect(nebulaFragmentSource).toContain('precision highp sampler2DArray;');
    expect(nebulaFragmentSource).toContain('uniform sampler2DArray uDensity;');
    expect(nebulaFragmentSource).toContain('uniform sampler2DArray uColour;');
    expect(nebulaFragmentSource).not.toContain('sampler3D');
  });

  // An array filters inside a layer and not across layers, so the march reads two
  // layers and mixes them itself, with the half-texel offset and the clamp a 3D
  // texture's LINEAR filter gives. The layer count comes from the texture.
  test('filters the third axis itself', () => {
    expect(nebulaFragmentSource).toContain(
      'float layers = float(textureSize(volume, 0).z);',
    );
    expect(nebulaFragmentSource).toContain(
      'float t = clamp(uvw.z * layers - 0.5, 0.0, layers - 1.0);',
    );
    expect(nebulaFragmentSource).toContain('float low = floor(t);');
    expect(nebulaFragmentSource).toContain(
      'float high = min(low + 1.0, layers - 1.0);',
    );
    expect(nebulaFragmentSource).toContain('t - low);');
  });

  // The emission takes the transmittance after the step, as the integral asks.
  test('takes the transmittance after the step', () => {
    const body = nebulaFragmentSource.slice(
      nebulaFragmentSource.indexOf('for (int index = 0'),
    );
    expect(body.indexOf('transmittance *=')).toBeLessThan(body.indexOf('emission +='));
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

// The renderer chose the records before this change and handed the pass a list. The draw
// chooses them now, from the frame it is given. The two paths must give one picture, so
// this test runs the selection beside the draw and compares what reaches the card.
describe('the selection the draw makes', () => {
  test('matches the selection the caller makes, at three views in the band', () => {
    for (const view of BAND_VIEWS) {
      const context = fakeContext();
      const set = manySet(MANY);
      const pass = createNebulaPass(context.gl, fakeProgram(), set, volumesOf());
      const selection = selectionOf(set, view.distance, view.camera);

      pass.draw(frameOf(view.distance, { camera: view.camera }));

      expect(selection.instances.length).toBeGreaterThan(0);
      expect(pass.drawnCount, `${view.distance} ly drew a different count`).toBe(
        selection.instances.length,
      );
      // The positions carry the order as well as the values: one draw call per record,
      // in the draw order.
      expect(
        everyValueOf(context, 'uPosition'),
        `${view.distance} ly drew different records`,
      ).toEqual(
        selection.instances.map((instance) => [
          set.positions[instance.index * 3] as number,
          set.positions[instance.index * 3 + 1] as number,
          -(set.positions[instance.index * 3 + 2] as number),
        ]),
      );
    }
  });

  test('issues one draw call per drawn record, and none above the band', () => {
    const context = fakeContext();
    const set = manySet(MANY);
    const pass = createNebulaPass(context.gl, fakeProgram(), set, volumesOf());

    pass.draw(frameOf(12000));
    expect(pass.drawnCount).toBe(selectionOf(set, 12000).instances.length);
    expect(pass.drawCalls).toBe(pass.drawnCount);

    // Above the far end of the band the weight is 0, so nothing draws.
    pass.draw(frameOf(60000));
    expect(pass.drawnCount).toBe(0);
    expect(pass.drawCalls).toBe(0);
  });
});

describe('the nebula composite', () => {
  // The composite applies the accumulation target to the scene. The colour channels hold
  // the sum of the emissions and the alpha channel the product of the transmittances,
  // and the blend is `ONE, ONE_MINUS_SRC_ALPHA`, so the fragment writes one minus that
  // product and the scene reads `accumulated.rgb + accumulated.a * scene`.
  test('writes the accumulated colour and one minus the accumulated alpha', () => {
    expect(compositeFragmentSource).toContain(
      'fragColour = vec4(accumulated.rgb, 1.0 - accumulated.a);',
    );
    expect(compositeFragmentSource).toContain('uniform sampler2D uAccumulated;');
  });

  // One triangle over the screen, from the vertex index alone, so the draw needs no
  // attribute and no buffer.
  test('builds its triangle from the vertex index', () => {
    expect(compositeVertexSource).toContain('gl_VertexID');
    expect(compositeVertexSource).toContain('out vec2 vTexture;');
    expect(compositeVertexSource).not.toContain('in vec');
  });
});
