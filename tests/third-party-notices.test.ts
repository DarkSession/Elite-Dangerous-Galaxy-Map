// Checks that the repository's notices file names every source the map takes data from.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const noticesPath = fileURLToPath(
  new URL('../packages/galaxy-map/THIRD_PARTY_NOTICES.md', import.meta.url),
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

  test('names every data set and every picture the demo site carries', () => {
    for (const source of [
      'Guardian Ruins',
      'Guardian Structures',
      'Notable Systems',
      'UIA',
      'Adamastor',
      'Canonn Factions',
      'Spansh',
      'factions.json.gz',
      'EDSM',
      'EDLoader1.svg',
    ]) {
      expect(notices, `the notices name ${source}`).toContain(source);
    }
  });

  test('names the nebula records and the volume art', () => {
    for (const source of [
      'nebulae.json',
      'src/render/nebula-art/',
      'nebula-volumes.json',
      'transfer.bin',
    ]) {
      expect(notices, `the notices name ${source}`).toContain(source);
    }
  });

  test('names the non-commercial terms of the game data', () => {
    expect(notices).toContain('non-commercial');
    expect(notices).toContain('media-usage rules');
  });
});
