// The guard that keeps the nebulae out of the main entry point's chunk graph.
//
// Eleven modules of `src/` import `buffers.ts` and nine of them import it as a value, so
// the main entry point reaches this module at load whatever the renderer does about the
// nebulae. Vite emits an asset from its transform hook, which runs before tree shaking,
// so a build that reaches a module naming `./nebula-art/*` carries all 68 files even
// where every call that would fetch them is shaken away.
//
// The test reads the source and not a build, because it is the import graph that decides
// this and not the calls. Every other test of this change passes on a tree that puts the
// volume import back here; this one does not.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const source = readFileSync(
  fileURLToPath(new URL('./buffers.ts', import.meta.url)),
  'utf8',
);

/** Every module specifier the source imports, static and dynamic. */
function importedPaths(text: string): string[] {
  const found: string[] = [];
  const pattern = /(?:\bfrom|\bimport)\s*\(?\s*["']([^"']+)["']/g;
  let match = pattern.exec(text);
  while (match !== null) {
    found.push(match[1] as string);
    match = pattern.exec(text);
  }
  return found;
}

describe('the buffer module', () => {
  test('imports something', () => {
    // The reader is a regular expression over the source, so a reading of no import at
    // all would pass the test below for the wrong reason.
    expect(importedPaths(source).length).toBeGreaterThan(0);
  });

  test('names no nebula module and no nebula asset', () => {
    for (const path of importedPaths(source)) {
      expect(path.toLowerCase(), `${path} is a nebula import`).not.toContain('nebula');
      expect(path, `${path} is the record set`).not.toContain('scene-data/nebulae');
    }
  });
});
