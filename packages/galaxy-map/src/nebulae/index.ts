// The second entry point of the package. A host that wants the nebulae imports the one
// value this module exports and passes it to `createGalaxyMap`.
//
// This directory is the seam between the scene data and the renderer, so it is the one
// directory that may import both. It holds the whole nebula import graph: the record
// set, the volume assets, the pass and the two shaders. A host that never imports this
// module reaches none of them, so its build carries no nebula code, no record file and
// no volume art.
import { loadNebulaSet } from '../scene-data/nebulae';
import type { NebulaSet } from '../scene-data/nebulae';
import {
  createNebulaVolumeTextures,
  loadNebulaVolumes,
} from '../render/nebula-volumes';
import type { NebulaVolumeSet, NebulaVolumeTextures } from '../render/nebula-volumes';
import { createNebulaPass, createNebulaProgram } from '../render/nebula-pass';
import type { Program } from '../render/program';
import type { NebulaDraw, NebulaSource } from '../render/nebula-slot';

/**
 * The nebula source. Pass it as the `nebulae` option of `createGalaxyMap` and the map
 * loads the records and the art and draws the nebulae.
 *
 * The map calls `loadSet` and `loadVolumes` once at start and `createDraw` when both
 * have arrived. The program is compiled here and not at map creation, so a map with no
 * source compiles no nebula shader.
 */
export const nebulae: NebulaSource<NebulaSet, NebulaVolumeSet> = {
  loadSet: loadNebulaSet,
  loadVolumes: loadNebulaVolumes,
  createDraw(
    gl: WebGL2RenderingContext,
    set: NebulaSet,
    volumes: NebulaVolumeSet,
  ): NebulaDraw {
    // Everything that can throw runs before the draw reaches the renderer, and all three
    // calls throw. The upload throws where the context gives no texture, the program
    // throws on a shader that does not compile or a pair that does not link, and the
    // pass throws where the context gives no buffer. All three therefore run inside the
    // `try`, which frees whatever the failed call had already made. The draw owns the
    // program and the textures from there on and frees both on `dispose`.
    //
    // The map catches this throw, logs it and keeps running, so a leak here is silent.
    let textures: NebulaVolumeTextures | null = null;
    let program: Program | null = null;
    try {
      textures = createNebulaVolumeTextures(gl, volumes);
      program = createNebulaProgram(gl);
      return createNebulaPass(gl, program, set, textures);
    } catch (reason: unknown) {
      textures?.dispose();
      if (program !== null) gl.deleteProgram(program.program);
      throw reason;
    }
  },
};
