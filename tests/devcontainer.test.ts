// What the dev container's post-create script installs, and why the cache directory
// matters.
//
// The test reads the script as text and matches it with regular expressions, in the
// style of `tests/workflow.test.ts`. A shell parser is a dependency this project needs
// for nothing else, and what the test asserts is that a command is there.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const script = readFileSync(join(root, '.devcontainer', 'post-create.sh'), 'utf8');
const readme = readFileSync(join(root, '.devcontainer', 'README.md'), 'utf8');

/** The lines of a text that are not a comment. */
function withoutComments(text: string): string {
  return text
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n');
}

const commands = withoutComments(script);

describe('the post-create script', () => {
  test('gives node the cache directory the browser volume mounts under', () => {
    // The volume mounts at .cache/ms-playwright, so docker creates .cache as root.
    // Firefox writes .cache/mozilla and cannot create it under a root-owned parent.
    expect(commands).toMatch(/chown node:node \/home\/node\/\.cache\s*$/m);
  });

  test('says in a comment why Firefox needs that directory', () => {
    // The comment names the directory Firefox cannot create. The dialog it stops with
    // is in the README, which the test below reads.
    expect(script).toContain('.cache/mozilla');
  });

  test('installs the Playwright browsers for Chromium and Firefox', () => {
    expect(commands).toMatch(/playwright install chromium firefox/);
  });

  test('installs the system libraries of both browsers', () => {
    expect(commands).toMatch(/playwright install-deps chromium firefox/);
  });
});

describe('the dev container README', () => {
  test('records the profile failure and the sandbox warning', () => {
    expect(readme).toContain('Your Firefox profile cannot be loaded');
    expect(readme).toContain('CanCreateUserNamespace() clone() failure: EPERM');
  });

  test('names the preference that reads the true renderer string', () => {
    expect(readme).toContain('webgl.sanitize-unmasked-renderer');
  });

  test('states that Firefox needs no GPU flags', () => {
    expect(readme).toContain('Firefox needs no GPU flags');
  });
});
