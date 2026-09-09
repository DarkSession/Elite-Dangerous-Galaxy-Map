// Checks that the built bundle carries no procedural naming table of the almanac
// package. The tables come from the EDTS reference algorithm under BSD 3-Clause, which
// requires its licence text beside any copy of them. The map does not name sectors, so
// the tables must stay out of every chunk the page loads.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));

/**
 * Text that only the procedural naming tables hold. The first four are fragments of the
 * sector name tables, and the last is the function that reads them.
 */
export const NAMING_TABLE_TERMS = [
  'Hyph',
  'Lych',
  'Schr',
  'Pyth',
  'sectorNameFromGridPosition',
];

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
  outDir = mkdtempSync(join(tmpdir(), 'galaxy-map-bundle-'));
  // The build runs alone, without the type check the `build` script also runs, because
  // this test reads the emitted chunks and nothing else.
  execFileSync('npx', ['vite', 'build', '--outDir', outDir, '--emptyOutDir'], {
    cwd: root,
    stdio: 'pipe',
  });
  scripts = listScripts(outDir);
}, 300000);

afterAll(() => {
  if (outDir !== '') rmSync(outDir, { recursive: true, force: true });
});

describe('the built bundle', () => {
  test('emits the page chunk and every worker chunk', () => {
    // The licence follows the tables wherever they ship, so the search must see the
    // worker chunks as well as the page chunk.
    expect(scripts.length).toBeGreaterThanOrEqual(4);
    const names = scripts.map((path) => path.split('/').pop() ?? '');
    expect(names.some((name) => name.startsWith('index-'))).toBe(true);
    expect(names.some((name) => name.startsWith('region-lines.worker-'))).toBe(true);
  });

  test('carries no procedural naming table', () => {
    const hits: string[] = [];
    for (const path of scripts) {
      const text = readFileSync(path, 'utf8');
      for (const term of NAMING_TABLE_TERMS) {
        if (text.includes(term)) hits.push(`${path.split('/').pop() ?? path}: ${term}`);
      }
    }
    expect(
      hits,
      'The bundle carries the almanac package procedural naming tables. Add the BSD ' +
        '3-Clause text of the EDTS reference algorithm to THIRD_PARTY_NOTICES.md, or ' +
        'stop importing the module that pulls the tables in.',
    ).toEqual([]);
  });
});
