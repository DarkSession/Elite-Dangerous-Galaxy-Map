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

/** The body of one `## ` section, up to the next heading or the end. */
function section(notices: string, heading: string): string {
  const start = notices.indexOf(`## ${heading}\n`);
  expect(start, `the notices hold a ${heading} section`).toBeGreaterThan(-1);
  const rest = notices.slice(start + heading.length + 4);
  const end = rest.indexOf('\n## ');
  return end === -1 ? rest : rest.slice(0, end);
}

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

  test('name the marker leaf, the vectors and the version they come from', () => {
    const almanac = section(packageNotices, '`@elite-dangerous-almanac/core`');
    // The package redistributes another project's artwork, so the notices say which
    // published version the bytes came from. The version comes out of the manifest, so
    // the next bump moves both or fails here.
    const manifest: { dependencies?: Record<string, string> } = JSON.parse(
      read('../packages/galaxy-map/package.json'),
    ) as never;
    const version = manifest.dependencies?.['@elite-dangerous-almanac/core'];

    expect(version, 'the manifest pins the almanac').toBeDefined();
    expect(almanac).toContain('galaxy-map/markers');
    expect(almanac).toContain('assets/galaxy-map/');
    expect(almanac).toContain(version as string);
    expect(almanac).toMatch(/marker vectors/);
    // The repository moved, which is the URL the published package's own `repository`
    // field now carries.
    expect(almanac).toContain(
      'https://github.com/Elite-Dangerous-Almanac/Almanac-Core',
    );
  });

  test('name the non-commercial terms of the game data', () => {
    expect(packageNotices).toContain('non-commercial');
    expect(packageNotices).toContain('media-usage rules');
  });

  test('state the terms of the art, not only of the data', () => {
    // The requirement says the package file names Frontier's terms for the game data
    // **and the art**. `Frontier` alone is in the heading, so a test that reads the name
    // passes with the whole statement about the art deleted.
    const frontier = section(
      packageNotices,
      'Elite Dangerous game data and visuals (Frontier Developments)',
    );
    expect(frontier).toMatch(/\bart\b/);
    expect(frontier).toContain('Frontier Developments plc');

    // The art is game content under one set of terms, so no section is about one kind of
    // it, and the notice names no file and no format.
    for (const absent of ['nebula', 'Nebula', 'KTX2']) {
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
