// What `scripts/build-wiki.mjs` writes, and what the repository's GitHub wiki therefore
// holds.
//
// The suite builds the tree **twice** and no more: once into a temporary directory that
// every case below reads, and once more for the determinism case. TypeDoc is the slow
// pass, so a build per case would make the run minutes rather than seconds.
//
// The page set is read from the source of the two entry points, not from a list written
// by hand. A list here would be the drift the wiki exists to stop.
import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, test } from 'vitest';
import { arrange, buildWiki, copyProse, rewriteLinks } from '../scripts/build-wiki.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const packageSource = join(root, 'packages', 'galaxy-map', 'src');
const wikiDocs = join(root, 'docs', 'wiki');

/** The temporary directories the suite writes. `afterAll` removes each one. */
const scratch: string[] = [];

/** A new empty directory under the system temp directory. */
function scratchDirectory(): string {
  const made = mkdtempSync(join(tmpdir(), 'wiki-pages-'));
  scratch.push(made);
  return made;
}

afterAll(() => {
  for (const path of scratch) rmSync(path, { recursive: true, force: true });
});

// The one shared build. Every case but the determinism one reads this tree.
const tree = join(scratchDirectory(), 'tree');
buildWiki({ outDirectory: tree });

/** Every file under a directory, as a path relative to it, sorted. */
function listFiles(directory: string, prefix = directory): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...listFiles(path, prefix));
    else found.push(relative(prefix, path));
  }
  return found.sort();
}

const files = listFiles(tree);
/** Every page of the tree, by its wiki name. A sidebar is not a page. */
const pageNames = files
  .filter((path) => path.endsWith('.md') && basename(path) !== '_Sidebar.md')
  .map((path) => basename(path, '.md'))
  .sort();
/** Every sidebar of the tree, by its path. */
const sidebarPaths = files.filter((path) => basename(path) === '_Sidebar.md');

/**
 * Every name a module exports, read from its source. The two forms the entry points use
 * are a re-export list, with or without `type`, and a declaration that carries `export`.
 */
function exportsOf(path: string): string[] {
  const text = readFileSync(path, 'utf8');
  const found = new Set<string>();
  for (const match of text.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/g)) {
    for (const part of (match[1] as string).split(',')) {
      const name = part
        .trim()
        .split(/\s+as\s+/)
        .pop();
      if (name !== undefined && name.length > 0) found.add(name);
    }
  }
  const declaration =
    /^export\s+(?:const|let|function|class|interface|type|enum)\s+(\w+)/gm;
  for (const match of text.matchAll(declaration)) found.add(match[1] as string);
  return [...found].sort();
}

const mainExports = exportsOf(join(packageSource, 'index.ts'));
const nebulaExports = exportsOf(join(packageSource, 'nebulae', 'index.ts'));
const testingExports = exportsOf(join(packageSource, 'testing.ts'));
const supported = [...mainExports, ...nebulaExports].sort();

/** The link targets of a markdown text that are not an address on the web. */
function localTargets(text: string): string[] {
  return [...text.matchAll(/\]\(([^)\s]+)\)/g)]
    .map((match) => match[1] as string)
    .filter((target) => !target.includes(':') && !target.startsWith('#'));
}

describe('the page set', () => {
  // The reading that makes the wiki impossible to drift from the source: the pages of
  // the five sections and the exports of the two entry points are one list.
  test('is the export list of the two entry points', () => {
    const sections = [
      'Classes',
      'Interfaces',
      'Type-Aliases',
      'Variables',
      'Functions',
    ];
    const inSections = files
      .filter((path) => sections.includes(path.split('/')[0] as string))
      .filter((path) => basename(path) !== '_Sidebar.md')
      .map((path) => basename(path, '.md'))
      .sort();
    expect(inSections).toEqual(supported);
  });

  test('reads 5 values and 44 types from the main entry point', () => {
    // A guard on the reader above. An `exportsOf` that read nothing would make the case
    // above pass on two empty lists.
    expect(mainExports.length).toBe(49);
    expect(nebulaExports).toEqual(['nebulae']);
  });

  // The two entry points share one set of sections, so the page is the one place that
  // says which specifier a member comes from. Without it a reader who reaches `nebulae`
  // from the sidebar writes the bare package name and imports nothing.
  test('names the specifier each member is imported from', () => {
    const sections = [
      'Classes',
      'Interfaces',
      'Type-Aliases',
      'Variables',
      'Functions',
    ];
    const generated = files
      .filter((path) => sections.includes(path.split('/')[0] as string))
      .filter((path) => basename(path) !== '_Sidebar.md');
    expect(generated.length).toBeGreaterThan(0);
    for (const path of generated) {
      expect(
        readFileSync(join(tree, path), 'utf8'),
        `${path} names no import specifier`,
      ).toMatch(
        /^Imported from `@elite-dangerous-almanac\/galaxy-map(\/nebulae)?`\.$/m,
      );
    }
    // The one member of the second entry point, and one of the first.
    expect(readFileSync(join(tree, 'Variables', 'nebulae.md'), 'utf8')).toContain(
      'Imported from `@elite-dangerous-almanac/galaxy-map/nebulae`.',
    );
    expect(
      readFileSync(join(tree, 'Functions', 'createGalaxyMap.md'), 'utf8'),
    ).toContain('Imported from `@elite-dangerous-almanac/galaxy-map`.');
  });

  test('holds no page name twice', () => {
    expect(pageNames.length).toBe(new Set(pageNames).size);
  });

  test('leaves out a section with no member', () => {
    // The library exports no class, so the tree holds no Classes directory and no
    // Classes block.
    expect(files.some((path) => path.startsWith('Classes/'))).toBe(false);
    for (const path of sidebarPaths) {
      expect(readFileSync(join(tree, path), 'utf8')).not.toContain('Classes');
    }
  });

  test('keeps the renderer probe and the testing subpath out of the sections', () => {
    expect(pageNames).not.toContain('GalaxyMapDebug');
    // The wide sense. The narrow one above reads the page names alone, and the probe
    // reached the wiki as a member of the `GalaxyMap` page, which linked to no page
    // because the type is exported from no entry point. The member carries `@internal`
    // and `typedoc.json` sets `excludeInternal`, so the name is in no file of the tree.
    for (const path of files) {
      expect(
        readFileSync(join(tree, path), 'utf8'),
        `${path} names the renderer probe`,
      ).not.toContain('GalaxyMapDebug');
    }
    for (const name of testingExports) expect(supported).not.toContain(name);
    const page = readFileSync(join(tree, 'Testing-subpath.md'), 'utf8');
    expect(page).toContain('no compatibility promise');
    for (const name of testingExports) expect(page).toContain(name);
  });

  // The stated scale. The wiki is text: it carries no galaxy data, no image of the map
  // and no record set, and the build runs no renderer.
  test('stays under 100 pages and 2 MB', () => {
    expect(pageNames.length).toBeLessThan(100);
    const bytes = files.reduce(
      (total, path) => total + statSync(join(tree, path)).size,
      0,
    );
    expect(bytes).toBeLessThan(2_000_000);
  });

  test('carries no commit identifier', () => {
    // Two builds in one run sit on one commit, so the determinism case below cannot
    // catch a commit SHA written into a page. This is the fault that would add a wiki
    // commit to every push to `main`.
    for (const path of files) {
      const text = readFileSync(join(tree, path), 'utf8');
      expect(text, `${path} holds a commit identifier`).not.toMatch(/[0-9a-f]{40}/);
    }
  });
});

describe('the sidebars', () => {
  const texts = new Map(
    sidebarPaths.map((path) => [path, readFileSync(join(tree, path), 'utf8')]),
  );

  test('name every page of the wiki, from every folder', () => {
    expect(sidebarPaths.length).toBeGreaterThan(1);
    for (const [path, text] of texts) {
      expect(
        [...localTargets(text)].sort(),
        `${path} names a different page set`,
      ).toEqual(pageNames);
    }
  });

  test('differ in the open block alone', () => {
    const stripped = [...texts.values()].map((text) =>
      text.replaceAll('<details open>', '<details>'),
    );
    for (const text of stripped) expect(text).toBe(stripped[0]);
  });

  test('open the section of the folder they are in, and nothing at the root', () => {
    for (const [path, text] of texts) {
      const open = [
        ...text.matchAll(/<details open>\s*\n\s*<summary><b>([^<]+)<\/b>/g),
      ];
      if (path === '_Sidebar.md') {
        expect(open.length, 'the root sidebar opens a block').toBe(0);
        continue;
      }
      expect(open.length, `${path} does not open exactly one block`).toBe(1);
      // `Type-Aliases/` holds the block titled `Type Aliases`.
      const folder = path.split('/')[0] as string;
      expect((open[0] as RegExpMatchArray)[1]).toBe(folder.replaceAll('-', ' '));
    }
  });
});

describe('the prose pages', () => {
  test('are the three single pages and the examples', () => {
    expect(files).toContain('Home.md');
    expect(files).toContain('Getting-started.md');
    expect(files).toContain('Testing-subpath.md');
    const examples = readdirSync(join(wikiDocs, 'Examples')).sort();
    expect(examples.length).toBeGreaterThan(0);
    for (const name of examples) expect(files).toContain(join('Examples', name));
  });

  // The check that catches the failure that matters most: an example that names a call
  // the package no longer exports.
  test('import exported members alone', () => {
    const pattern =
      /import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+'@elite-dangerous-almanac\/galaxy-map(\/[\w-]+)?'/g;
    let read = 0;
    for (const name of readdirSync(join(wikiDocs, 'Examples')).sort()) {
      const text = readFileSync(join(wikiDocs, 'Examples', name), 'utf8');
      for (const match of text.matchAll(pattern)) {
        const subpath = match[2] ?? '';
        const exported = subpath === '/nebulae' ? nebulaExports : mainExports;
        for (const part of (match[1] as string).split(',')) {
          const imported = part.trim();
          if (imported.length === 0) continue;
          read += 1;
          expect(
            exported,
            `${name} imports '${imported}', which is not exported`,
          ).toContain(imported);
        }
      }
    }
    expect(
      read,
      'no example imports anything, so the case reads nothing',
    ).toBeGreaterThan(0);
  });
});

describe('every link of the tree', () => {
  test('resolves to a page of the tree', () => {
    for (const path of files) {
      for (const target of localTargets(readFileSync(join(tree, path), 'utf8'))) {
        expect(pageNames, `${path} links to '${target}', which is no page`).toContain(
          target,
        );
      }
    }
  });
});

describe('the build', () => {
  test('writes the same bytes twice', () => {
    const second = join(scratchDirectory(), 'tree');
    buildWiki({ outDirectory: second });
    expect(listFiles(second)).toEqual(files);
    for (const path of files) {
      expect(
        readFileSync(join(second, path)).equals(readFileSync(join(tree, path))),
        `${path} differs between two builds`,
      ).toBe(true);
    }
  });

  test('adds nothing git would commit', () => {
    const ignore = readFileSync(join(root, '.gitignore'), 'utf8');
    expect(ignore).toContain('wiki-build/');
    const checked = execFileSync('git', ['check-ignore', 'wiki-build/Home.md'], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(checked.trim()).toBe('wiki-build/Home.md');
    // The status itself is not asserted to be empty: a developer's tree holds their own
    // work. What matters is that the build adds nothing to it.
    const status = execFileSync('git', ['status', '--porcelain'], {
      cwd: root,
      encoding: 'utf8',
    });
    for (const line of status.split('\n')) {
      expect(line, `git status names ${line}`).not.toContain('wiki-build');
    }
  });
});

// The passes on their own, over fixture trees. None of these runs TypeDoc.
describe('the arrange pass', () => {
  /** Writes a tree of the shape TypeDoc gives for two entry points. */
  function fixture(paths: string[]): string {
    const made = scratchDirectory();
    for (const path of paths) {
      mkdirSync(join(made, path, '..'), { recursive: true });
      writeFileSync(join(made, path), `# ${basename(path, '.md')}\n`);
    }
    return made;
  }

  test('merges the two modules into one set of sections', () => {
    const generated = fixture([
      'README.md',
      'index/README.md',
      'index/functions/beta.md',
      'index/interfaces/Alpha.md',
      'nebulae/interfaces/Zeta.md',
      'nebulae/variables/nebulae.md',
    ]);
    const out = scratchDirectory();
    const sections = arrange(generated, out, new Map());
    expect([...sections.keys()].sort()).toEqual([
      'Functions',
      'Interfaces',
      'Variables',
    ]);
    expect(sections.get('Interfaces')).toEqual(['Alpha', 'Zeta']);
    expect(listFiles(out)).toEqual([
      'Functions/beta.md',
      'Interfaces/Alpha.md',
      'Interfaces/Zeta.md',
      'Variables/nebulae.md',
    ]);
  });

  test('fails on a group directory it does not know', () => {
    const generated = fixture(['index/enums/Colour.md']);
    expect(() => arrange(generated, scratchDirectory(), new Map())).toThrow(
      /does not know the group directory 'enums'/,
    );
  });

  test('fails on a page name it has already written, and names both sources', () => {
    const generated = fixture([
      'index/interfaces/Twin.md',
      'nebulae/interfaces/Twin.md',
    ]);
    let message = '';
    try {
      arrange(generated, scratchDirectory(), new Map());
    } catch (reason) {
      message = (reason as Error).message;
    }
    expect(message).toContain("the page 'Twin' twice");
    expect(message).toContain('index/interfaces/Twin.md');
    expect(message).toContain('nebulae/interfaces/Twin.md');
  });
});

describe('the link rewrite', () => {
  test('drops the folder and the extension, and leaves an address alone', () => {
    const rewritten = rewriteLinks(
      'See [GalaxyMap](../interfaces/GalaxyMap.md) and ' +
        '[GalaxyMapOptions](./GalaxyMapOptions.md) and ' +
        '[the survey](https://example.test/survey).',
    );
    expect(rewritten).toBe(
      'See [GalaxyMap](GalaxyMap) and [GalaxyMapOptions](GalaxyMapOptions) and ' +
        '[the survey](https://example.test/survey).',
    );
  });
});

describe('a missing prose page', () => {
  /** A `docs/wiki/` with one of the three single pages taken out. */
  function docsWithout(missing: string): string {
    const made = scratchDirectory();
    mkdirSync(join(made, 'Examples'), { recursive: true });
    for (const name of ['Home', 'Getting-started', 'Testing-subpath']) {
      if (name === missing) continue;
      writeFileSync(join(made, `${name}.md`), `# ${name}\n`);
    }
    return made;
  }

  test('fails the copy, and names the file', () => {
    expect(() => copyProse(docsWithout('Home'), scratchDirectory(), new Map())).toThrow(
      /names the page 'Home'.*Home\.md' is missing/s,
    );
  });

  // The whole build writes nothing on a failure: it builds in a temporary directory and
  // moves it into place at the end, and the prose copy runs before TypeDoc.
  test('leaves the last tree where it was', () => {
    const out = join(scratchDirectory(), 'tree');
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, 'Kept.md'), 'the last build\n');
    expect(() =>
      buildWiki({ docsDirectory: docsWithout('Getting-started'), outDirectory: out }),
    ).toThrow(/Getting-started/);
    expect(listFiles(out)).toEqual(['Kept.md']);
    expect(readFileSync(join(out, 'Kept.md'), 'utf8')).toBe('the last build\n');
  });
});
