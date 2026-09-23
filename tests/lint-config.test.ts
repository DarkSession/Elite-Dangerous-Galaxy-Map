// The lint configuration, read as configuration rather than by linting one file.
//
// The rule held one exception, `src/app/main.ts`, because one `src/` tree carried the
// library and the demo page. The page is a module of `apps/demo/` now, so the rule has
// no hole in it. A `lintText` of a path the block no longer matches would pass and
// assert nothing, which is why this reading is of the configuration and of every file.
import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ESLint } from 'eslint';
import { describe, expect, test } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const packageSrc = join(root, 'packages', 'galaxy-map', 'src');

/** Every `.ts` file under a directory, as a repository-relative path. */
function sourceFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...sourceFiles(path));
    else if (entry.name.endsWith('.ts')) found.push(relative(root, path));
  }
  return found;
}

interface Block {
  readonly files?: readonly string[];
  readonly ignores?: readonly string[];
  readonly rules?: Readonly<Record<string, unknown>>;
}

describe('the window.location rule', () => {
  test('holds no exception inside the library package', async () => {
    // The specifier is a variable, so TypeScript does not try to resolve a declaration
    // for a JavaScript configuration file the repository does not declare.
    const url = pathToFileURL(join(root, 'eslint.config.js')).href;
    const config = (await import(url)) as { default: Block[] };
    const blocks = config.default.filter(
      (block) => block.rules?.['no-restricted-properties'] !== undefined,
    );
    console.log(
      'the blocks that carry the rule',
      blocks.map((block) => ({ files: block.files, ignores: block.ignores })),
    );

    // One block carries it, and that block ignores nothing.
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.ignores).toBeUndefined();
  });

  test('its pattern covers every source file of the library package', async () => {
    const eslint = new ESLint();
    const files = sourceFiles(packageSrc);
    // The control: the walk found the package, not an empty directory.
    expect(files.length).toBeGreaterThan(50);

    const uncovered: string[] = [];
    for (const file of files) {
      const config = (await eslint.calculateConfigForFile(join(root, file))) as {
        rules?: Record<string, unknown>;
      };
      if (config.rules?.['no-restricted-properties'] === undefined) {
        uncovered.push(file);
      }
    }
    console.log('the files the rule does not reach', uncovered);

    expect(uncovered).toEqual([]);
  });
});

describe('the lint ignores', () => {
  // `tests/main-bundle.test.ts` builds into `packages/galaxy-map/.library-build-*/`.
  // The old entry was `.library-build-*/**`, which carries an internal slash and is
  // anchored to the repository root, so the new path would lint.
  test('cover the temporary build directory inside the library package', async () => {
    const eslint = new ESLint();
    const path = join(
      root,
      'packages',
      'galaxy-map',
      '.library-build-probe',
      'index.js',
    );
    expect(await eslint.isPathIgnored(path)).toBe(true);
    // The control: a file beside it, outside the temporary directory, is not ignored.
    expect(
      await eslint.isPathIgnored(join(root, 'packages', 'galaxy-map', 'probe.js')),
    ).toBe(false);
  });

  // The demo data build computes its root as its own parent directory, so after the
  // restructure it fetches into `apps/demo/data/`. Two of those sources are another
  // project's JavaScript, which this project does not own and must not lint.
  test('cover the directory the demo data build fetches into', async () => {
    const eslint = new ESLint();
    expect(
      await eslint.isPathIgnored(join(root, 'apps', 'demo', 'data', 'source.js')),
    ).toBe(true);
  });
});

describe('the demo import rule', () => {
  // `no-restricted-imports` reads static imports alone, so a dynamic reach out of the
  // demo package passed it. The `no-restricted-syntax` pair below is what fails one.
  const file = 'apps/demo/src/probe.ts';

  test('passes the data loads the demo already makes', async () => {
    const eslint = new ESLint();
    const source =
      'export const load = async (): Promise<unknown> =>\n' +
      "  (await import('../demo-data/guardian-ruins.json')).default;\n";

    const result = await eslint.lintText(source, { filePath: file });
    expect(result[0]?.messages).toEqual([]);
  });

  test('fails a dynamic reach out of the demo package', async () => {
    const eslint = new ESLint();
    const source =
      'export const load = async (): Promise<unknown> =>\n' +
      "  await import('../../../packages/galaxy-map/src/index.ts');\n";

    const result = await eslint.lintText(source, { filePath: file });
    expect(result[0]?.errorCount).toBe(2);
    expect(result[0]?.messages.map((message) => message.ruleId)).toEqual([
      'no-restricted-syntax',
      'no-restricted-syntax',
    ]);
  });

  test('fails a static reach out of the demo package', async () => {
    const eslint = new ESLint();
    const source =
      "export { createGalaxyMap } from '../../../packages/galaxy-map/src';\n";

    const result = await eslint.lintText(source, { filePath: file });
    expect(result[0]?.errorCount).toBe(1);
    expect(result[0]?.messages[0]?.ruleId).toBe('no-restricted-imports');
  });

  // The samples, the cycles page and the Canonn page are pages of the demo package as
  // much as `apps/demo/src/` is, and a reader copies a sample's imports into their own
  // project. The rule therefore covers all four directories, and this case is what
  // proves the three other ones are covered.
  test('covers the sample directories, the cycles page and the Canonn page', async () => {
    const eslint = new ESLint();
    const pages = [
      'apps/demo/examples/probe/main.ts',
      'apps/demo/cycles/main.ts',
      'apps/demo/canonn/main.ts',
    ];
    const source =
      "export { createGalaxyMap } from '../../../../packages/galaxy-map/src';\n";

    for (const page of pages) {
      const result = await eslint.lintText(source, { filePath: page });
      expect(result[0]?.errorCount, `${page} passes a reach out of the package`).toBe(
        1,
      );
      expect(result[0]?.messages[0]?.ruleId).toBe('no-restricted-imports');
    }
  });

  test('fails a dynamic reach out of a sample', async () => {
    const eslint = new ESLint();
    const source =
      'export const load = async (): Promise<unknown> =>\n' +
      "  await import('../../../../packages/galaxy-map/src/index.ts');\n";

    const result = await eslint.lintText(source, {
      filePath: 'apps/demo/examples/probe/main.ts',
    });
    expect(result[0]?.messages.map((message) => message.ruleId)).toEqual([
      'no-restricted-syntax',
      'no-restricted-syntax',
    ]);
  });

  test('passes the URL helper the cycles page and the Canonn page share', async () => {
    const eslint = new ESLint();
    const source = "export { keepInUrl } from '../src/page-url';\n";

    for (const page of ['apps/demo/cycles/main.ts', 'apps/demo/canonn/main.ts']) {
      const result = await eslint.lintText(source, { filePath: page });
      expect(result[0]?.messages, page).toEqual([]);
    }
  });

  test('passes the manifest load the Canonn page makes', async () => {
    const eslint = new ESLint();
    const source =
      'export const load = async (): Promise<unknown> =>\n' +
      "  (await import('../demo-data/canonn/index.json')).default;\n";

    const result = await eslint.lintText(source, {
      filePath: 'apps/demo/canonn/main.ts',
    });
    expect(result[0]?.messages).toEqual([]);
  });

  test('passes the cycle load the cycles page makes', async () => {
    const eslint = new ESLint();
    const source =
      'export const load = async (id: string): Promise<unknown> =>\n' +
      '  (await import(`../demo-data/cycles/${id}.json`)).default;\n';

    const result = await eslint.lintText(source, {
      filePath: 'apps/demo/cycles/main.ts',
    });
    expect(result[0]?.messages).toEqual([]);
  });
});
