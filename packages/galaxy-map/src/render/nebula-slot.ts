// The slot the nebulae draw into: what one draw needs per frame, what the renderer
// calls, and what a host hands the map to fill the slot.
//
// This module imports nothing, and it holds seven number literals, one array literal and
// no other statement.
// The renderer imports it, so the entry chunk carries what it holds: a type is erased by
// the build, and a number literal pulls in no pass, no shader text, no atlas and no
// record file. A third import here would put the nebulae back in the chunk this change
// takes them out of, so a unit test reads the built output and holds the module to it.
//
// The eight constants are look defaults the renderer keeps whether or not a host asks
// for the nebulae, because the light gain, the step rate, the cull floor, the two block
// ranges, the two block gains and `look.nebulaOcclusion` are members of the look
// settings on every map. Every other look default sits beside its pass; these eight sit
// here, because the renderer must not import the nebula pass.

/**
 * The light gain the march scales its emission by, one value per colour channel. Every
 * record shares it, and it changes neither the alpha nor the shape.
 *
 * The three values are fitted against the pass they replace, so a frame of the marched
 * volumes reads at the brightness that pass read at.
 */
export const DEFAULT_NEBULA_LIGHT_GAIN = [8.66, 8.44, 8.07] as const;

/**
 * How many march steps one object-space unit takes. The box spans two of them, so the
 * default is 64 steps across a box and a ray takes at most 256.
 *
 * The largest asset is 64 texels a side, so 32 steps over one unit is one step per
 * texel across the box. A browser test reads the error against a finer rate and holds it
 * under 5 percent.
 */
export const DEFAULT_NEBULA_STEP_RATE = 32;

/**
 * How much of the galaxy volume's own extinction a nebula takes. 0 is the look before
 * the march, and 1 is the extinction the volume pass would have carried to the record's
 * centre. The value takes any finite number of 0 or above.
 *
 * The default is 2: the frame is tone mapped, so a nebula behind a very bright mass
 * still reads as a source at the volume's own extinction, and twice that depth is the
 * first whole multiple that answers it.
 */
export const DEFAULT_NEBULA_OCCLUSION = 2;

/**
 * The mean transmittance a record draws no fragment below. Under it the record adds
 * less than 2 per cent of its own light and of its own alpha, which the tone map cannot
 * show against the mass in front of it, so the cull takes the fragment cost and no
 * visible record.
 *
 * The cull sits after the selection, so it changes none of the four selection readings.
 */
export const NEBULA_CULL_FLOOR = 0.02;

/**
 * The range at and below which a record blocks at the near gain, in light years. A
 * record the camera sits beside is inside it.
 */
export const DEFAULT_NEBULA_BLOCK_NEAR = 500;

/**
 * The range at and above which a record blocks at the far gain, in light years. A record
 * on the other side of the local arm is beyond it. The zoom band ends at 20,000 light
 * years, so the two ranges bracket the ranges a record is read at.
 */
export const DEFAULT_NEBULA_BLOCK_FAR = 6000;

/**
 * The gain the record's own transmittance takes at the near range. Below 1 the record
 * blocks less than the march wrote, which is the softening a record close to the camera
 * asks for.
 */
export const DEFAULT_NEBULA_BLOCK_GAIN_NEAR = 0.7;

/**
 * The gain the record's own transmittance takes at the far range. Above 1 the record
 * blocks more than the march wrote, so a far nebula hides what is behind it, which is
 * what the eye expects.
 */
export const DEFAULT_NEBULA_BLOCK_GAIN_FAR = 2;

/**
 * What the renderer knows and one nebula draw needs. The draw selects the records from
 * this frame, so the renderer holds no selection code.
 */
export interface NebulaFrame {
  /** The combined projection and view matrix, with no translation. */
  readonly viewProjection: Float32Array;
  /** The chunk origin minus the camera position, in the world frame. */
  readonly chunkOffset: readonly [number, number, number];
  /** The camera position in game coordinates, which the selection reads. */
  readonly camera: readonly [number, number, number];
  /** The zoom distance in light years, which the zoom band reads. */
  readonly distance: number;
  /** The size of the target the draw draws into, in pixels. */
  readonly targetSize: readonly [number, number];
  /**
   * Whether the renderer's own colour targets hold a floating point number format. The
   * pass builds its accumulation target with the same flag, so a card that gives no
   * floating point target draws the nebulae as it draws the rest of the scene.
   */
  readonly floatTarget: boolean;
  /** The height of the canvas in CSS pixels. The size rules are stated in those. */
  readonly canvasHeightCss: number;
  /**
   * The width of the canvas in CSS pixels. One screen area is the product of the two,
   * which is what the covered-area budget accumulates against.
   */
  readonly canvasWidthCss: number;
  /**
   * The vertical field of view in degrees. The draw turns it and the canvas height into
   * the focal length the selection reads. The renderer sends the angle rather than the
   * focal length, so one rule states it and the draw holds no copy of the camera.
   */
  readonly fieldOfViewDegrees: number;
  /** The light gain the march scales its emission by, one value per colour channel. */
  readonly lightGain: readonly [number, number, number];
  /** How many march steps one object-space unit takes. The box spans two of them. */
  readonly stepRate: number;
  /**
   * The density volume the march reads, or null before it arrives and where the volume
   * pass does not draw. The frame carries it per draw, because the nebulae may attach
   * before the volume does and the volume may be replaced.
   */
  readonly volume: WebGLTexture | null;
  /** The surface detail texture, or null when the grid has not arrived. */
  readonly detail: WebGLTexture | null;
  /** The low corner of the volume box minus the camera, in the world frame. */
  readonly boxMin: readonly [number, number, number];
  /** The size of the volume box in the world frame. */
  readonly boxSize: readonly [number, number, number];
  /** The galactic centre minus the camera, in the world frame. */
  readonly centre: readonly [number, number, number];
  /** The low bound of the stored density logarithm. */
  readonly lo: number;
  /** The span of the stored density logarithm. */
  readonly span: number;
  /** The offset the stored density logarithm carries. */
  readonly epsilon: number;
  /** The absorption per unit of compressed density per light year. */
  readonly absorption: number;
  /** The scale one stored detail step stands for. It is 0 without a grid. */
  readonly detailScale: number;
  /** How much of the galaxy volume's extinction a nebula takes, 0 or above. */
  readonly occlusion: number;
  /** The range at and below which a record blocks at the near gain, in light years. */
  readonly blockNear: number;
  /** The range at and above which a record blocks at the far gain, in light years. */
  readonly blockFar: number;
  /** The gain the record's own transmittance takes at the near range. */
  readonly blockGainNear: number;
  /** The gain the record's own transmittance takes at the far range. */
  readonly blockGainFar: number;
  /**
   * True draws the selected records in the reverse order. It is a probe and not a look
   * setting: the map draws with it false, and the browser test that reads the order
   * independence of the frame is the one caller that sets it.
   *
   * The pass composites without an order, so the two frames are one frame. The member
   * is what lets a test state that rather than argue it.
   */
  readonly reverseOrder: boolean;
}

/** What the renderer calls to draw the nebulae of one frame. */
export interface NebulaDraw {
  draw(frame: NebulaFrame): void;
  /** How many instances the last draw issued. */
  readonly drawnCount: number;
  /** How many draw calls the last draw issued: one per record drawn. */
  readonly drawCalls: number;
  /**
   * How many records passed the size floor in the last draw, before the budget. The
   * difference against `drawnCount` is what the budget dropped, which a browser test
   * reads to hold that the committed record file does not reach the budget.
   */
  readonly aboveFloorCount: number;
  /** How much of the screen the last draw's records cover, in screen areas. */
  readonly coveredArea: number;
  /**
   * The accumulated transmittance of the last draw, or null for a draw that drew no
   * record. The sprite passes multiply their colour by it, so a star behind a nebula
   * dims. The draw nulls it at the top of every frame, so the frame before it cannot
   * leak into a frame that draws nothing.
   */
  readonly transmittance: WebGLTexture | null;
  /**
   * The least `range - radius` over the records the last draw drew, never below 0, in
   * light years. A sprite at or nearer than it takes none of the attenuation.
   */
  readonly frontRange: number;
  /**
   * The centre range of the record the front range came from, in light years. A sprite
   * at or beyond it takes all of the attenuation.
   */
  readonly centreRange: number;
  dispose(): void;
}

/**
 * What a host hands the map to turn the nebulae on. The value is the single export of
 * the package's `./nebulae` subpath.
 *
 * The members are not part of the supported surface: a host passes the value it
 * imported and writes no source of its own. The map reads the value at run time and
 * turns the nebulae off on a value it cannot read.
 *
 * The record set and the decoded volumes are type parameters and not named types,
 * because this module imports nothing: it is the one nebula module the renderer reaches,
 * and an import here would put the rest of the nebulae back in the entry chunk. The map
 * holds the two as `unknown` and hands back what it was given, so neither type reaches
 * the supported surface.
 */
export interface NebulaSource<Set = unknown, Volumes = unknown> {
  loadSet(): Promise<Set>;
  loadVolumes(): Promise<Volumes>;
  createDraw(gl: WebGL2RenderingContext, set: Set, volumes: Volumes): NebulaDraw;
}
