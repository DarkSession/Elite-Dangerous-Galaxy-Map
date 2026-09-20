// The guard on the one nebula module the renderer imports.
//
// `renderer.ts` imports this module, and the renderer is in the main entry point's
// chunk. Whatever `nebula-slot.ts` holds after the build is therefore in the entry chunk
// of every host, including a host that never asks for the nebulae. A type costs nothing,
// because the build erases it. A number literal costs its digits, and an array of them
// costs little more. An import costs whatever it reaches, which is the pass, the
// shaders, the volume art and the record set.
//
// The test builds the module alone, the way the bundler reads it, and holds the output
// to the four look defaults and nothing else.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, test } from 'vitest';
import {
  DEFAULT_NEBULA_LIGHT_GAIN,
  DEFAULT_NEBULA_OCCLUSION,
  DEFAULT_NEBULA_STEP_RATE,
  NEBULA_CULL_FLOOR,
} from './nebula-slot';

/** The four look defaults the module holds, with the values the map draws with. */
const CONSTANTS = [
  ['DEFAULT_NEBULA_LIGHT_GAIN', `[${DEFAULT_NEBULA_LIGHT_GAIN.join(', ')}]`],
  ['DEFAULT_NEBULA_STEP_RATE', DEFAULT_NEBULA_STEP_RATE],
  ['DEFAULT_NEBULA_OCCLUSION', DEFAULT_NEBULA_OCCLUSION],
  ['NEBULA_CULL_FLOOR', NEBULA_CULL_FLOOR],
] as const;

const source = readFileSync(
  fileURLToPath(new URL('./nebula-slot.ts', import.meta.url)),
  'utf8',
);

/** The module as the build emits it: no type, no comment, no blank line. */
const built = ts
  .transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      removeComments: true,
    },
  })
  .outputText.split('\n')
  .map((line) => line.trim())
  .filter((line) => line.length > 0);

describe('the nebula slot module', () => {
  test('builds to the four look defaults and no other statement', () => {
    console.log('the nebula slot builds to', built);

    expect(built).toEqual([
      'export const DEFAULT_NEBULA_LIGHT_GAIN = [8.66, 8.44, 8.07];',
      'export const DEFAULT_NEBULA_STEP_RATE = 32;',
      'export const DEFAULT_NEBULA_OCCLUSION = 2;',
      'export const NEBULA_CULL_FLOOR = 0.02;',
    ]);
  });

  test('builds to no import', () => {
    for (const line of built) {
      expect(line, `${line} imports`).not.toContain('import');
      expect(line, `${line} requires`).not.toContain('require');
    }
  });

  test('gives the four defaults the map draws with', () => {
    // The lines above are matched as text, so this reads the values through the module
    // itself. A rename that kept the text and changed the export would pass the first
    // test and fail this one.
    for (const [name, value] of CONSTANTS) {
      expect(built.join('\n'), `${name} is missing`).toContain(
        `export const ${name} = ${value};`,
      );
    }
  });
});
