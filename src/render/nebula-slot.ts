// The slot the nebula sprites draw into: what one draw needs per frame, what the
// renderer calls, and what a host hands the map to fill the slot.
//
// This module imports nothing, and it holds two number literals and no other statement.
// The renderer imports it, so the entry chunk carries what it holds: a type is erased by
// the build, and a number literal pulls in no pass, no shader text, no atlas and no
// record file. A third import here would put the nebulae back in the chunk this change
// takes them out of, so a unit test reads the built output and holds the module to it.
//
// The two constants are look defaults the renderer keeps whether or not a host asks for
// the nebulae, because `look.nebulaBrightness` and `look.nebulaOcclusion` are members of
// the look settings on every map. Every other look default sits beside its pass; these
// two sit here, because the renderer must not import the nebula pass.

/**
 * How bright one nebula sprite draws. It scales the colour channels alone. The value is
 * set by eye: at 2 a bright nebula reads as almost nothing, and at 16 the edge of the
 * sprite quad shows against the background. A browser test pins it.
 */
export const DEFAULT_NEBULA_BRIGHTNESS = 8;

/**
 * How much of the volume's own extinction a sprite takes. 0 is the look before the
 * march, and 1 is the extinction the volume pass would have carried to the record's
 * centre. The default is 1: the frame already dims its own light by the dust it marches
 * through, so a nebula that did not would contradict it.
 */
export const DEFAULT_NEBULA_OCCLUSION = 1;

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
  /** The height of the canvas in CSS pixels. The size rules are stated in those. */
  readonly canvasHeightCss: number;
  /**
   * The vertical field of view in degrees. The draw turns it and the canvas height into
   * the focal length the selection reads. The renderer sends the angle rather than the
   * focal length, so one rule states it and the draw holds no copy of the camera.
   */
  readonly fieldOfViewDegrees: number;
  /** Target pixels per light year of sprite radius at one light year of range. */
  readonly spriteScale: number;
  /** The brightness of one sprite. It scales the colour channels alone. */
  readonly brightness: number;
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
  /** How much of the volume's extinction a sprite takes, 0 to 1. */
  readonly occlusion: number;
}

/** What the renderer calls to draw the nebulae of one frame. */
export interface NebulaDraw {
  draw(frame: NebulaFrame): void;
  /** How many instances the last draw issued. */
  readonly drawnCount: number;
  /** How many draw calls the last draw issued: one, or none where nothing drew. */
  readonly drawCalls: number;
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
 * The record set and the decoded atlas are type parameters and not named types, because
 * this module imports nothing: it is the one nebula module the renderer reaches, and an
 * import here would put the rest of the nebulae back in the entry chunk. The map holds
 * the two as `unknown` and hands back what it was given, so neither type reaches the
 * supported surface.
 */
export interface NebulaSource<Set = unknown, Atlas = unknown> {
  loadSet(): Promise<Set>;
  loadAtlas(): Promise<Atlas>;
  createDraw(gl: WebGL2RenderingContext, set: Set, atlas: Atlas): NebulaDraw;
}
