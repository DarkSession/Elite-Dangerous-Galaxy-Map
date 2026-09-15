// The library's public surface. The barrel is the whole of it, so this test reads the
// names the module exports and matches them with the list `library-package` states.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import * as library from './index';

/** The types the requirement "The library build emits a package and no page" lists. */
const PUBLIC_TYPES = [
  'AddReport',
  'Category',
  'CategoryInput',
  'CategoryReject',
  'CategoryReport',
  'DatasetContent',
  'DatasetEntry',
  'DatasetInfo',
  'DatasetLoadResult',
  'GalaxyMap',
  'GalaxyMapOptions',
  'HudAction',
  'HudHandle',
  'HudOptions',
  'MapView',
  'RealSystem',
  'RegionMode',
  'Reject',
  'SystemImage',
  'SystemRecordInput',
];

const source = readFileSync(
  fileURLToPath(new URL('./index.ts', import.meta.url)),
  'utf8',
);

/** Every name inside an `export` or `export type` block of the barrel. */
function exportedNames(text: string): string[] {
  const names: string[] = [];
  const pattern = /export\s+(?:type\s+)?\{([^}]*)\}/g;
  let match = pattern.exec(text);
  while (match !== null) {
    for (const part of (match[1] as string).split(',')) {
      const name = part.trim();
      if (name.length > 0) names.push(name);
    }
    match = pattern.exec(text);
  }
  return names;
}

describe('the library entry point', () => {
  test('exports one value, which is the entry call', () => {
    expect(Object.keys(library)).toEqual(['createGalaxyMap']);
    expect(typeof library.createGalaxyMap).toBe('function');
  });

  test('exports the entry call and the listed types, and nothing else', () => {
    const names = exportedNames(source);
    expect(names.sort()).toEqual(['createGalaxyMap', ...PUBLIC_TYPES].sort());
  });

  test('does not export the debug hook type', () => {
    expect(exportedNames(source)).not.toContain('GalaxyMapDebug');
  });
});
