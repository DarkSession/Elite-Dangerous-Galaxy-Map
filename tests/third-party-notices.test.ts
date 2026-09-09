// Checks that the repository's notices file names every source the map takes data from.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const noticesPath = fileURLToPath(
  new URL('../THIRD_PARTY_NOTICES.md', import.meta.url),
);
const notices = readFileSync(noticesPath, 'utf8');

describe('the third-party notices', () => {
  test('names every source of the region data', () => {
    for (const source of [
      '@elite-dangerous-almanac/core',
      'EliteDangerousRegionMap',
      'MIT',
      'Frontier',
    ]) {
      expect(notices, `the notices name ${source}`).toContain(source);
    }
  });

  test('names the non-commercial terms of the game data', () => {
    expect(notices).toContain('non-commercial');
    expect(notices).toContain('media-usage rules');
  });
});
