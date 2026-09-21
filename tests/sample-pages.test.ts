// The nine sample pages of `apps/demo/examples/`, read as source.
//
// A sample is two things at once: the page a reader opens on the Pages site, and the
// block the wiki shows. The second is what these readings hold. A block a reader copies
// must reach the package by its published name, must stay short enough to read, and must
// not use a surface the package does not publish. The type check reads the calls and the
// browser suite reads the pixels; this file reads the shape of the file itself.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const examples = join(root, 'apps', 'demo', 'examples');
const wikiExamples = join(root, 'docs', 'wiki', 'Examples');

/** How many lines a sample may hold, which `sample-pages` states. */
const MAX_LINES = 60;

/** The two entry points a sample may import. */
const PACKAGE_NAME = '@elite-dangerous-almanac/galaxy-map';
const NEBULA_SUBPATH = `${PACKAGE_NAME}/nebulae`;

/** The sample directories, sorted. `example.css` is a file and not a sample. */
const sampleIds = readdirSync(examples)
  .filter((name) => statSync(join(examples, name)).isDirectory())
  .sort();

/** The source of each sample, by identifier. */
const sources = new Map(
  sampleIds.map((id) => [id, readFileSync(join(examples, id, 'main.ts'), 'utf8')]),
);

/** Each marker of the example pages, as the page name and the sample it names. */
const markers: { page: string; id: string }[] = [];
for (const name of readdirSync(wikiExamples).sort()) {
  if (!name.endsWith('.md')) continue;
  const text = readFileSync(join(wikiExamples, name), 'utf8');
  for (const match of text.matchAll(/<!--\s*sample:\s*([\w-]+)\s*-->/g)) {
    markers.push({ page: basename(name, '.md'), id: match[1] as string });
  }
}

/** Every module specifier a source imports, static or dynamic. */
function specifiersOf(source: string): string[] {
  const found: string[] = [];
  for (const match of source.matchAll(/from\s+'([^']+)'/g)) {
    found.push(match[1] as string);
  }
  for (const match of source.matchAll(/import\s*\(\s*['"`]([^'"`]+)/g)) {
    found.push(match[1] as string);
  }
  return found;
}

describe('the sample set', () => {
  test('is the nine the markers of the wiki name', () => {
    expect(sampleIds).toEqual(markers.map((marker) => marker.id).sort());
    expect(sampleIds.length).toBe(9);
  });

  test('names one sample per marker', () => {
    const named = markers.map((marker) => marker.id);
    expect(named.length).toBe(new Set(named).size);
  });

  test('gives the camera page two markers', () => {
    const camera = markers.filter((marker) => marker.page === 'The-camera');
    expect(camera.map((marker) => marker.id)).toEqual([
      'the-camera',
      'the-view-in-a-url',
    ]);
  });

  test('holds a page and a stylesheet link for each sample', () => {
    for (const id of sampleIds) {
      const page = readFileSync(join(examples, id, 'index.html'), 'utf8');
      expect(page, `${id} does not name its module`).toContain('./main.ts');
      expect(page, `${id} does not name the shared stylesheet`).toContain(
        '../example.css',
      );
    }
  });
});

describe('the Samples section of the README', () => {
  /** The `## Samples` section of the repository README, up to the next heading. */
  const section = ((): string => {
    const text = readFileSync(join(root, 'README.md'), 'utf8');
    const start = text.indexOf('\n## Samples\n');
    expect(start, 'the README holds a Samples section').toBeGreaterThan(-1);
    const rest = text.slice(start + 1);
    const end = rest.indexOf('\n## ');
    return end === -1 ? rest : rest.slice(0, end);
  })();

  // The sample source is the one copy of the example code. A block written into the
  // README is a second copy, and the blocks the README held before this rule had already
  // drifted from the samples they named.
  test('holds no code block', () => {
    expect(section, 'the README holds a code block of its own').not.toContain('```');
  });

  test('names every sample of the examples directory', () => {
    for (const id of sampleIds) {
      expect(section, `the README does not name ${id}`).toContain(id);
    }
  });
});

describe('each sample', () => {
  test('holds 60 lines or fewer', () => {
    for (const [id, source] of sources) {
      const lines = source.split('\n').length;
      expect(lines, `${id} holds ${lines} lines`).toBeLessThanOrEqual(MAX_LINES);
    }
  });

  test('imports the package name or the nebula subpath alone', () => {
    let read = 0;
    for (const [id, source] of sources) {
      const specifiers = specifiersOf(source);
      expect(specifiers.length, `${id} imports nothing`).toBeGreaterThan(0);
      for (const specifier of specifiers) {
        read += 1;
        expect(
          [PACKAGE_NAME, NEBULA_SUBPATH],
          `${id} imports '${specifier}'`,
        ).toContain(specifier);
      }
    }
    expect(read, 'the reader found no import').toBeGreaterThan(0);
  });

  test('holds at most one closed marked region', () => {
    for (const [id, source] of sources) {
      const starts = [...source.matchAll(/^\s*\/\/\s*wiki:start\s*$/gm)];
      const ends = [...source.matchAll(/^\s*\/\/\s*wiki:end\s*$/gm)];
      expect(
        starts.length,
        `${id} holds ${starts.length} wiki:start lines`,
      ).toBeLessThanOrEqual(1);
      expect(ends.length, `${id} holds ${ends.length} wiki:end lines`).toBe(
        starts.length,
      );
      if (starts.length === 1) {
        expect(
          (ends[0] as RegExpMatchArray).index,
          `${id} closes its region before it opens it`,
        ).toBeGreaterThan((starts[0] as RegExpMatchArray).index as number);
      }
    }
  });

  test('reaches no surface the package does not publish', () => {
    for (const [id, source] of sources) {
      expect(source, `${id} reads a data set of the demo page`).not.toContain(
        'demo-data/',
      );
      expect(source, `${id} imports the testing subpath`).not.toContain(
        `${PACKAGE_NAME}/testing`,
      );
      expect(source, `${id} reads the debug member of the handle`).not.toMatch(
        /\.debug\b/,
      );
    }
  });

  test('writes no test hook on window', () => {
    for (const [id, source] of sources) {
      expect(source, `${id} writes a test hook on window`).not.toMatch(
        /window\s*(\.\w+|\[[^\]]+\])\s*=[^=]/,
      );
    }
  });
});
