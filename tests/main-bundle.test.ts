// Checks that the region cell lookup stays out of every chunk but the region worker,
// and that the page chunk stays small.
//
// `astro/codex-region-lookup` is about 199 KiB of run-length region cells. The label
// sweep reads regions on the main thread, so the reader of the coarse grid lives in
// `src/scene-data/regions.ts` and imports nothing from that lookup. If it ever imports
// the trace instead, the whole table joins the page chunk and this test fails.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));

/** How large the page chunk may be, in bytes. It measured 108,194 bytes after this change. */
const MAIN_CHUNK_LIMIT = 130_000;

/**
 * Text that only the region cell lookup holds. Both are keys of the cell data object,
 * and a minifier keeps the keys of an object literal.
 */
const LOOKUP_TERMS = ['scaleNumerator', 'minPz'];

/** Every JavaScript file under a directory, with its path. */
function listScripts(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...listScripts(path));
    else if (entry.name.endsWith('.js')) found.push(path);
  }
  return found;
}

let outDir = '';
let scripts: string[] = [];

beforeAll(() => {
  outDir = mkdtempSync(join(tmpdir(), 'galaxy-map-chunks-'));
  // The build runs alone, without the type check the `build` script also runs, because
  // this test reads the emitted chunks and nothing else.
  // This repository uses pnpm. `npx` is npm tooling and would fetch from the registry
  // outside the 7-day release hold if the local binary were ever missing.
  execFileSync('pnpm', ['exec', 'vite', 'build', '--outDir', outDir, '--emptyOutDir'], {
    cwd: root,
    stdio: 'pipe',
  });
  scripts = listScripts(outDir);
}, 300000);

afterAll(() => {
  if (outDir !== '') rmSync(outDir, { recursive: true, force: true });
});

describe('the built chunks', () => {
  test('carries the region cell lookup in the region worker only', () => {
    const carriers: string[] = [];
    for (const path of scripts) {
      const text = readFileSync(path, 'utf8');
      if (LOOKUP_TERMS.every((term) => text.includes(term))) {
        carriers.push(path.split('/').pop() ?? path);
      }
    }
    console.log('the chunks that carry the region cell lookup', carriers);
    expect(carriers.length).toBe(1);
    expect(carriers[0]?.startsWith('region-lines.worker-')).toBe(true);
  });

  test('keeps the page chunk small', () => {
    const main = scripts.find((path) =>
      (path.split('/').pop() ?? '').startsWith('index-'),
    );
    expect(main).toBeDefined();
    const bytes = statSync(main as string).size;
    console.log('the page chunk holds', bytes, 'bytes');
    expect(
      bytes,
      'The page chunk grew. A main-thread import of `region-lines.ts` pulls the ' +
        '199 KiB region cell lookup into it.',
    ).toBeLessThan(MAIN_CHUNK_LIMIT);
  });
});
