// Checks that the two notices files name every source, and that neither holds the
// other's sections.
//
// There are two files, not one. `packages/galaxy-map/THIRD_PARTY_NOTICES.md` ships in
// the tarball and covers what the package carries. `THIRD_PARTY_NOTICES.md` at the root
// covers the demo site, the test fixtures and the design mockup, which no host installs.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const read = (path: string): string =>
  readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');

const packageNotices = read('../packages/galaxy-map/THIRD_PARTY_NOTICES.md');
const rootNotices = read('../THIRD_PARTY_NOTICES.md');

/** The `## ` headings of one file. */
function headings(notices: string): string[] {
  return [...notices.matchAll(/^## (.+)$/gm)].map((match) => match[1] as string);
}

describe('the package notices', () => {
  test('name every source of the region data', () => {
    for (const source of [
      '@elite-dangerous-almanac/core',
      'EliteDangerousRegionMap',
      'MIT',
      'Frontier',
    ]) {
      expect(packageNotices, `the notices name ${source}`).toContain(source);
    }
  });

  test('name the non-commercial terms of the game data', () => {
    expect(packageNotices).toContain('non-commercial');
    expect(packageNotices).toContain('media-usage rules');
  });

  test('name the art the tarball carries, and not the files it is in', () => {
    // The requirement says the package file names Frontier's terms for the game data
    // **and the art**. `Frontier` alone is in the heading, so a test that reads the name
    // passes with the whole statement about the art deleted.
    for (const source of ['volume art', 'KTX2']) {
      expect(packageNotices, `the notices name the ${source}`).toContain(source);
    }
    // The art is game content under one set of terms, so no section is about one kind of
    // it, and no file of it is named.
    for (const absent of ['nebula', 'Nebula']) {
      expect(packageNotices, `the notices name ${absent}`).not.toContain(absent);
    }
  });

  test('name no data set the tarball does not carry', () => {
    // The tarball carries the build output and three text files. A demo record set in
    // this file tells a host it installed something it did not.
    for (const absent of [
      'Guardian Ruins',
      'Guardian Structures',
      'Notable Systems',
      'UIA',
      'Adamastor',
      'Spansh',
      'EDLoader1.svg',
      'apps/demo/',
      '.design/',
    ]) {
      expect(packageNotices, `the notices name ${absent}`).not.toContain(absent);
    }
  });
});

describe('the root notices', () => {
  test('name every data set and every picture the demo site carries', () => {
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
      expect(rootNotices, `the notices name ${source}`).toContain(source);
    }
  });

  test('carry the MIT text the Canonn sets need, and the Frontier terms', () => {
    expect(rootNotices).toContain('Copyright (c) 2017 Canonn - Science');
    expect(rootNotices).toContain('media-usage rules');
    expect(rootNotices).toContain('non-commercial');
  });

  test('point at the package file for the library sources', () => {
    expect(rootNotices).toContain('packages/galaxy-map/THIRD_PARTY_NOTICES.md');
    // The library's own sections stay in the package file.
    for (const absent of ['@fontsource/chakra-petch', 'EliteDangerousRegionMap']) {
      expect(rootNotices, `the root notices name ${absent}`).not.toContain(absent);
    }
  });
});

describe('the two notices files', () => {
  test('share no section', () => {
    const shared = headings(packageNotices).filter((heading) =>
      headings(rootNotices).includes(heading),
    );
    console.log('the headings of the package file', headings(packageNotices));
    console.log('the headings of the root file', headings(rootNotices));

    // The Frontier section is in both, because the package ships game art and the demo
    // site draws game data. The two say different things, and the headings differ by
    // nothing else.
    expect(shared).toEqual([
      'Elite Dangerous game data and visuals (Frontier Developments)',
    ]);
  });
});
