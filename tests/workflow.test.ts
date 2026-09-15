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

/** The lines of a text that are not a comment. */
function withoutComments(text: string): string {
  return text
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n');
}

/** The block of one job, from its own line to the line of the next job. */
function jobText(name: string): string {
  const start = workflow.indexOf(`\n  ${name}:\n`);
  expect(start, `the workflow holds no job ${name}`).toBeGreaterThan(-1);
  const rest = workflow.slice(start + 1);
  const next = rest.search(/\n {2}[a-z][\w-]*:\n/);
  return next === -1 ? rest : rest.slice(0, next);
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
  test('is the one workflow of the repository', () => {
    expect(names).toHaveLength(1);
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

  test('runs the five checks in order', () => {
    expect(commands.slice(1)).toEqual([
      'pnpm lint',
      'pnpm exec tsc --noEmit',
      'pnpm test',
      'pnpm build',
      'pnpm build:demo-site',
    ]);
  });

  test('names the library build and the demo site build', () => {
    const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(manifest.scripts.build).toContain('vite.config.lib.ts');
    expect(manifest.scripts['build:demo-site']).toBe('vite build');
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

    const config = readFileSync(join(root, 'vite.config.ts'), 'utf8');
    const outDir = /outDir: '([^']+)'/.exec(config);
    expect(outDir, 'the demo site build names no outDir').not.toBeNull();
    expect(uploaded).toBe((outDir as RegExpExecArray)[1]);
  });

  test('does not upload the library build', () => {
    expect(publish).not.toMatch(/path: dist\s*$/m);
    expect(publish).not.toMatch(/path: dist\//);
  });

  test('deploys the uploaded artifact', () => {
    expect(publish).toContain('uses: actions/deploy-pages@');
  });
});
