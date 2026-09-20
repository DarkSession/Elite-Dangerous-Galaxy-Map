// What the GitHub Actions workflow runs, and what it publishes.
//
// The test reads the workflow as text and matches it with regular expressions. A YAML
// parser is a dependency this project needs for nothing else, and what the test asserts
// is that a command is there, that the commands are in order, that no Playwright command
// is in the file, and that every action carries a commit SHA.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const workflowDirectory = join(root, '.github', 'workflows');

/** Every workflow file of the repository, by name. */
function workflowNames(): string[] {
  return readdirSync(workflowDirectory)
    .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
    .sort();
}

const names = workflowNames();
const workflow = readFileSync(join(workflowDirectory, names[0] as string), 'utf8');
/** The publish workflow, which a person dispatches by hand. */
const publishWorkflow = readFileSync(
  join(workflowDirectory, 'publish-npm.yml'),
  'utf8',
);

/** The lines of a text that are not a comment. */
function withoutComments(text: string): string {
  return text
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n');
}

/** The scripts of one package manifest. */
function scriptsOf(path: string): Record<string, string> {
  const manifest = JSON.parse(readFileSync(path, 'utf8')) as {
    scripts: Record<string, string>;
  };
  return manifest.scripts;
}

/** The block of one job of one workflow, from its own line to the line of the next. */
function jobOf(text: string, name: string): string {
  const start = text.indexOf(`\n  ${name}:\n`);
  expect(start, `the workflow holds no job ${name}`).toBeGreaterThan(-1);
  const rest = text.slice(start + 1);
  const next = rest.search(/\n {2}[a-z][\w-]*:\n/);
  return next === -1 ? rest : rest.slice(0, next);
}

/** The block of one job of the check workflow. */
function jobText(name: string): string {
  return jobOf(workflow, name);
}

/** The name of every step of a block, in the order the block holds them. */
function stepNames(text: string): string[] {
  const found: string[] = [];
  const pattern = /^\s*- name: (.+)$/gm;
  let match = pattern.exec(text);
  while (match !== null) {
    found.push((match[1] as string).trim());
    match = pattern.exec(text);
  }
  return found;
}

/** Every command a `run:` step of a block names, in the order the block holds them. */
function runCommands(text: string): string[] {
  const found: string[] = [];
  const pattern = /^\s*run: (.+)$/gm;
  let match = pattern.exec(text);
  while (match !== null) {
    found.push((match[1] as string).trim());
    match = pattern.exec(text);
  }
  return found;
}

/** Every `uses:` line of a text, with the reference and the comment beside it. */
function usesLines(text: string): { line: string; action: string; comment: string }[] {
  const found: { line: string; action: string; comment: string }[] = [];
  const pattern = /^\s*uses: (\S+)(.*)$/gm;
  let match = pattern.exec(text);
  while (match !== null) {
    found.push({
      line: match[0].trim(),
      action: match[1] as string,
      comment: (match[2] as string).trim(),
    });
    match = pattern.exec(text);
  }
  return found;
}

describe('the workflow file', () => {
  // The repository held one workflow until this change. It now holds two, and a third
  // still has to be argued for. `names` is sorted, and every reading below that names
  // no file reads `names[0]`, so the order is asserted and not left to luck.
  test('is one of the two workflows of the repository', () => {
    expect(names).toEqual(['ci.yml', 'publish-npm.yml']);
  });

  test('runs on a push to main and on a pull request that targets main', () => {
    const body = withoutComments(workflow);
    expect(body).toMatch(/\non:\n\s+push:\n\s+branches: \[main\]/);
    expect(body).toMatch(/\n\s+pull_request:\n\s+branches: \[main\]/);
  });
});

describe('the check job', () => {
  const check = jobText('check');
  const commands = runCommands(check);

  test('installs with a frozen lockfile', () => {
    expect(commands[0]).toBe('pnpm install --frozen-lockfile');
  });

  test('takes the pnpm version from packageManager', () => {
    // The pnpm action reads `packageManager` when the step names no version, so the
    // step carries no `version:` input and package.json stays the one source.
    const manifest = JSON.parse(
      readFileSync(join(root, 'package.json'), 'utf8'),
    ) as Record<string, unknown>;
    expect(manifest.packageManager).toMatch(/^pnpm@\d+\.\d+\.\d+$/);
    expect(check).not.toMatch(/pnpm\/action-setup@\S+[^\n]*\n\s+with:/);
  });

  test('runs on Node 22', () => {
    expect(check).toMatch(/node-version: '22'/);
  });

  test('runs the six checks in order', () => {
    expect(commands.slice(1)).toEqual([
      'pnpm lint',
      'pnpm exec tsc --noEmit',
      'pnpm test',
      'pnpm build',
      'pnpm build:demo-site',
      'pnpm test:package',
    ]);
  });

  // The workflow runs the root scripts, and each root script delegates to a package. The
  // reading is of both halves: the root script names the package it delegates to, and
  // the package script names the build it runs. A root script that ran a build itself
  // would build the wrong tree from the wrong directory.
  test('the root scripts delegate to the two packages', () => {
    expect(scriptsOf(join(root, 'package.json')).build).toBe(
      'pnpm --filter @elite-dangerous-almanac/galaxy-map build',
    );
    expect(scriptsOf(join(root, 'package.json'))['build:demo-site']).toBe(
      'pnpm --filter @elite-dangerous-almanac/galaxy-map-demo build:demo-site',
    );
  });

  test('the library build names its own Vite configuration', () => {
    const build = scriptsOf(join(root, 'packages', 'galaxy-map', 'package.json'))
      .build as string;
    expect(build).toContain('vite build --config vite.config.ts');
    expect(
      scriptsOf(join(root, 'apps', 'demo', 'package.json'))['build:demo-site'],
    ).toBe('vite build');
  });
});

describe('the Playwright suite', () => {
  test('is in no command of the workflow', () => {
    const body = withoutComments(workflow).toLowerCase();
    expect(body).not.toContain('playwright');
    expect(body).not.toContain('test:e2e');
  });

  test('has a comment that says why', () => {
    expect(workflow).toContain('WEBGL_debug_renderer_info');
    expect(workflow).toContain('local gate');
  });

  test('is named a local gate in the README', () => {
    const readme = readFileSync(join(root, 'README.md'), 'utf8');
    expect(readme).toContain('local gate');
  });
});

describe('every action', () => {
  const lines = usesLines(workflow);

  test('is pinned to a 40 character commit SHA', () => {
    expect(lines.length).toBeGreaterThan(0);
    for (const { line, action } of lines) {
      const reference = action.split('@')[1];
      expect(reference, `${line} names no reference`).toBeDefined();
      expect(reference, `${line} is not pinned to a commit SHA`).toMatch(
        /^[0-9a-f]{40}$/,
      );
    }
  });

  test('carries its version in a comment', () => {
    for (const { line, comment } of lines) {
      expect(comment, `${line} carries no version comment`).toMatch(
        /^# v\d+\.\d+\.\d+$/,
      );
    }
  });

  test('reads the same SHA wherever the workflow names it', () => {
    const byName = new Map<string, string>();
    for (const { action, comment } of lines) {
      const [name, reference] = action.split('@') as [string, string];
      const held = byName.get(name);
      if (held === undefined) byName.set(name, `${reference} ${comment}`);
      else expect(`${reference} ${comment}`, `${name} is pinned twice`).toBe(held);
    }
  });
});

describe('the publish job', () => {
  const publish = jobText('publish');

  test('runs on a push to main alone and needs the check job', () => {
    expect(publish).toContain('needs: check');
    expect(publish).toContain(
      "if: github.event_name == 'push' && github.ref == 'refs/heads/main'",
    );
  });

  test('holds the two write permissions the publish needs and no other', () => {
    const block = /\n\s+permissions:\n((?:\s+\S+: \S+\n)+)/.exec(publish);
    expect(block, 'the publish job names no permissions').not.toBeNull();
    const held = (block as RegExpExecArray)[1] as string;
    const pairs = held
      .trim()
      .split('\n')
      .map((line) => line.trim());
    expect(pairs.sort()).toEqual(['contents: read', 'id-token: write', 'pages: write']);
  });

  test('holds one concurrency group', () => {
    expect(publish).toMatch(/\n\s+concurrency:\n\s+group: \S+/);
  });

  test('uploads the directory the demo site build writes', () => {
    const upload =
      /uses: actions\/upload-pages-artifact@[^\n]*\n\s+with:\n\s+path: (\S+)/.exec(
        publish,
      );
    expect(upload, 'the publish job uploads no artifact').not.toBeNull();
    const uploaded = (upload as RegExpExecArray)[1] as string;

    // The demo's Vite configuration names its `outDir` inside its own package, and the
    // workflow runs at the workspace root, so the upload path carries the package
    // directory in front of it.
    const config = readFileSync(join(root, 'apps', 'demo', 'vite.config.ts'), 'utf8');
    const outDir = /outDir: '([^']+)'/.exec(config);
    expect(outDir, 'the demo site build names no outDir').not.toBeNull();
    expect(uploaded).toBe(`apps/demo/${(outDir as RegExpExecArray)[1] as string}`);
  });

  // The old guard read `path: dist` at the end of a line. After the move the library
  // build writes `packages/galaxy-map/dist`, so that pattern passed whatever the
  // workflow said. The reading is now of every path the publish job uploads: each one
  // must name the demo package.
  test('does not upload the library build', () => {
    const paths = [...publish.matchAll(/^\s*path: (\S+)$/gm)].map(
      (match) => match[1] as string,
    );
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) {
      expect(path, `${path} is not a path of the demo package`).toMatch(
        /^apps\/demo\//,
      );
    }
  });

  test('deploys the uploaded artifact', () => {
    expect(publish).toContain('uses: actions/deploy-pages@');
  });
});

// The publish workflow. It is the one that cannot be undone: an npm version is
// permanent, so every reading below is of a guard that stands in front of a publish.
describe('the publish workflow', () => {
  const prepare = jobOf(publishWorkflow, 'prepare');
  const publish = jobOf(publishWorkflow, 'publish');
  const release = jobOf(publishWorkflow, 'release');

  test('runs when a person asks and at no other time', () => {
    const body = withoutComments(publishWorkflow);
    expect(body).toMatch(/\non:\n\s+workflow_dispatch:/);
    expect(body).not.toMatch(/\n\s+push:/);
    expect(body).not.toMatch(/\n\s+schedule:/);
    expect(body).not.toMatch(/\n\s+tags:/);
  });

  test('runs from the default branch alone', () => {
    expect(prepare).toContain(
      'DEFAULT_BRANCH: ${{ github.event.repository.default_branch }}',
    );
    expect(prepare).toContain('RELEASE_REF: ${{ github.ref }}');
    expect(prepare).toContain(
      'if [ "$RELEASE_REF" != "refs/heads/$DEFAULT_BRANCH" ]; then',
    );
    expect(prepare).toMatch(
      /::error::a release runs from the default branch[^\n]*\n\s+exit 1/,
    );
  });

  test('holds one concurrency group and cancels no run', () => {
    const block = /\nconcurrency:\n\s+group: (\S+)\n\s+cancel-in-progress: (\S+)/.exec(
      publishWorkflow,
    );
    expect(block, 'the publish workflow names no concurrency').not.toBeNull();
    expect((block as RegExpExecArray)[2]).toBe('false');
  });

  test('chooses the version rather than taking one', () => {
    // The rule is in the script, so `tests/next-version.test.ts` can read it. A rule
    // written into this block would be read by nothing until a release day.
    expect(prepare).toContain('scripts/next-version.mjs');
    expect(prepare).toMatch(/version=\$\(node \.\.\/\.\.\/scripts\/next-version\.mjs/);
    // The later steps read the step's output and not a second computation.
    expect(prepare).toContain('echo "version=$version"');
    expect(prepare).toContain('${{ steps.package.outputs.version }}');
    expect(publishWorkflow).toContain('version: ${{ steps.package.outputs.version }}');
  });

  test('the version script is in the repository', () => {
    const script = readFileSync(join(root, 'scripts', 'next-version.mjs'), 'utf8');
    expect(script).toContain('export function nextVersion');
  });

  test('checks the registry and the tag before it builds', () => {
    const steps = stepNames(prepare);
    const registry = steps.indexOf('Check the version is still unpublished');
    const tag = steps.indexOf('Check the release tag is unused');
    const build = steps.indexOf('Build the library');
    expect(registry).toBeGreaterThan(-1);
    expect(tag).toBeGreaterThan(-1);
    expect(registry).toBeLessThan(build);
    expect(tag).toBeLessThan(build);
  });

  test('runs every check before the pack', () => {
    const steps = stepNames(prepare);
    const order = [
      'Lint',
      'Check the types',
      'Run the unit tests',
      'Audit the dependencies',
      'Build the library',
      'Check the packed tarball',
      'Pack for publishing',
    ];
    const found = steps.filter((name) => order.includes(name));
    expect(found).toEqual(order);
    expect(prepare).toContain('run: pnpm lint');
    expect(prepare).toContain('run: pnpm exec tsc --noEmit');
    expect(prepare).toContain('run: pnpm test\n');
    expect(prepare).toContain('run: pnpm run audit');
    expect(prepare).toContain('run: pnpm build');
    expect(prepare).toContain('run: pnpm test:package');
  });

  test('reads the version back out of the tarball', () => {
    expect(prepare).toContain('tar -xOf "$tarball" package/package.json');
    expect(prepare).toMatch(/if \[ "\$packed_version" != "\$EXPECTED_VERSION" \]/);
  });

  test('the publish job carries no token', () => {
    // The comments of this job name every flag the step passes, so the reading is of
    // the commands alone. A `toContain` over the whole job would pass on the prose.
    const commands = withoutComments(publish);
    expect(publish).toContain('id-token: write');
    expect(publish).toMatch(/\n\s+environment:\n\s+name: \S+/);
    expect(commands).toContain('--provenance');
    expect(commands).toContain('--access public');
    expect(commands).toContain('--tag latest');
    expect(commands).toContain('npm publish "./$TARBALL"');
    // No step reads an npm token. `NODE_AUTH_TOKEN` is how `setup-node` passes one.
    expect(publish).not.toContain('NODE_AUTH_TOKEN');
    expect(publish).not.toMatch(/secrets\.(NPM|NODE)/);
    expect(publishWorkflow).not.toContain('NPM_TOKEN');
  });

  test('checks the tarball digest before it publishes', () => {
    const steps = stepNames(publish);
    const digest = steps.indexOf('Verify the package digest');
    const publishStep = steps.indexOf('Publish');
    expect(digest).toBeGreaterThan(-1);
    expect(digest).toBeLessThan(publishStep);
    expect(publish).toContain('sha256sum --check --strict');
    expect(publish).toContain(
      'TARBALL_SHA256: ${{ needs.prepare.outputs.tarball-sha256 }}',
    );
    expect(prepare).toContain(
      'tarball-sha256=$(sha256sum "$tarball" | cut -d \' \' -f 1)',
    );
  });

  test('tags after the publish and not before', () => {
    expect(publish).toContain('needs: prepare');
    expect(release).toContain('needs: [prepare, publish]');
    expect(release).toContain('refs/tags/v$VERSION');
    expect(release).toContain('gh release create');
  });

  test('runs no Playwright command either', () => {
    // The `describe('the Playwright suite')` block above reads `ci.yml` alone, and the
    // promise this workflow makes about the browser suite is in a comment, which
    // `withoutComments` strips. Without this, nothing reads it.
    const body = withoutComments(publishWorkflow).toLowerCase();
    expect(body).not.toContain('playwright');
    expect(body).not.toContain('test:e2e');
    expect(publishWorkflow).toContain('WEBGL_debug_renderer_info');
  });

  describe('every action', () => {
    const lines = usesLines(publishWorkflow);

    test('is pinned to a 40 character commit SHA', () => {
      expect(lines.length).toBeGreaterThan(0);
      for (const { line, action } of lines) {
        const reference = action.split('@')[1];
        expect(reference, `${line} names no reference`).toBeDefined();
        expect(reference, `${line} is not pinned to a commit SHA`).toMatch(
          /^[0-9a-f]{40}$/,
        );
      }
    });

    test('carries its version in a comment', () => {
      for (const { line, comment } of lines) {
        expect(comment, `${line} carries no version comment`).toMatch(
          /^# v\d+\.\d+\.\d+$/,
        );
      }
    });

    test('names the same SHA as the check workflow does', () => {
      const held = new Map(
        usesLines(workflow).map(({ action, comment }) => {
          const [name, reference] = action.split('@') as [string, string];
          return [name, `${reference} ${comment}`];
        }),
      );
      for (const { action, comment } of lines) {
        const [name, reference] = action.split('@') as [string, string];
        const other = held.get(name);
        if (other !== undefined) {
          expect(`${reference} ${comment}`, `${name} is pinned twice`).toBe(other);
        }
      }
    });
  });

  test('pins the two npm clients and says why', () => {
    // The pack client writes the tarball and the publish client mints the provenance
    // attestation, so both are pinned as every action is.
    expect(prepare).toMatch(/npm install --global npm@\d+\.\d+\.\d+ --ignore-scripts/);
    expect(prepare).toMatch(/test "\$\(npm --version\)" = \d+\.\d+\.\d+/);
    expect(publish).toMatch(/node-version: \d+\.\d+\.\d+/);
    expect(publish).toMatch(/test "\$\(npm --version\)" = \d+\.\d+\.\d+/);
  });
});
