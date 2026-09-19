// The second entry point of the package. A host that wants the nebulae imports the one
// value this module exports and passes it to `createGalaxyMap`.
//
// This directory is the seam between the scene data and the renderer, so it is the one
// directory that may import both. It holds the whole nebula import graph: the record
// set, the sprite atlas, the pass and the two shaders. A host that never imports this
// module reaches none of them, so its build carries no nebula code, no record file and
// no sprite art.
import { loadNebulaSet } from '../scene-data/nebulae';
import type { NebulaSet } from '../scene-data/nebulae';
import { createNebulaAtlasTexture, loadNebulaAtlas } from '../render/nebula-atlas';
import type { NebulaAtlasImage, NebulaAtlasTexture } from '../render/nebula-atlas';
import { createNebulaPass, createNebulaProgram } from '../render/nebula-pass';
import type { Program } from '../render/program';
import type { NebulaDraw, NebulaSource } from '../render/nebula-slot';

/**
 * The nebula source. Pass it as the `nebulae` option of `createGalaxyMap` and the map
 * loads the records and the art and draws the sprites.
 *
 * The map calls `loadSet` and `loadAtlas` once at start and `createDraw` when both have
 * arrived. The program is compiled here and not at map creation, so a map with no source
 * compiles no nebula shader.
 */
export const nebulae: NebulaSource<NebulaSet, NebulaAtlasImage> = {
  loadSet: loadNebulaSet,
  loadAtlas: loadNebulaAtlas,
  createDraw(
    gl: WebGL2RenderingContext,
    set: NebulaSet,
    atlas: NebulaAtlasImage,
  ): NebulaDraw {
    // Everything that can throw runs before the draw reaches the renderer, and all three
    // calls throw. The texture throws on an atlas the tile grid cannot hold, the program
    // throws on a shader that does not compile or a pair that does not link, and the pass
    // throws where the context gives no buffer. All three therefore run inside the `try`,
    // which frees whatever the failed call had already made. The draw owns the program
    // and the texture from there on and frees both on `dispose`.
    //
    // The map catches this throw, logs it and keeps running, so a leak here is silent.
    let texture: NebulaAtlasTexture | null = null;
    let program: Program | null = null;
    try {
      texture = createNebulaAtlasTexture(gl, atlas);
      program = createNebulaProgram(gl);
      return createNebulaPass(gl, program, set, texture);
    } catch (reason: unknown) {
      texture?.dispose();
      if (program !== null) gl.deleteProgram(program.program);
      throw reason;
    }
  },
};
