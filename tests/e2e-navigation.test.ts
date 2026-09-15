// How the browser suite reaches the demo site.
//
// The suite serves the built demo site under the base path its GitHub Pages address
// carries, so two rules hold over `e2e/`:
//
// 1. Every navigation is relative. A path that starts with `/` resolves against the
//    origin and misses the base path.
// 2. Every file that navigates by itself takes the same start state the helper gives.
//    The demo site loads the Guardian Ruins set at start, so a test that reaches no
//    helper would read a set it did not ask for.
//
// The third rule is the demo set's own: no browser test selects a record of it, because
// every record of that set names a thumbnail on another host and the information panel
// would fetch it.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const e2e = join(root, 'e2e');

/** The helper that carries the start state. Its own navigation is the one exception. */
const HELPER = 'helpers.ts';

/** Every TypeScript file of the browser suite, by name. */
function suiteFiles(): string[] {
  return readdirSync(e2e, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .map((entry) => entry.name)
    .sort();
}

/** The first characters of the target of every `page.goto` call in a file. */
function gotoTargets(text: string): string[] {
  const found: string[] = [];
  const pattern = /page\.goto\(\s*([`'"])([^`'"$]*)/g;
  let match = pattern.exec(text);
  while (match !== null) {
    found.push(match[2] as string);
    match = pattern.exec(text);
  }
  return found;
}

/** How many times a file calls a function by name. */
function callCount(text: string, name: string): number {
  return text.split(`${name}(`).length - 1;
}

describe('the navigations of the browser suite', () => {
  test('no call starts with a slash', () => {
    for (const name of suiteFiles()) {
      const targets = gotoTargets(readFileSync(join(e2e, name), 'utf8'));
      for (const target of targets) {
        expect(target.startsWith('/'), `${name} navigates to ${target}`).toBe(false);
        expect(target.startsWith('./'), `${name} navigates to ${target}`).toBe(true);
      }
    }
  });

  test('a file that navigates by itself takes the start state', () => {
    for (const name of suiteFiles()) {
      if (name === HELPER) continue;
      const text = readFileSync(join(e2e, name), 'utf8');
      const navigations = gotoTargets(text).length;
      if (navigations === 0) continue;
      expect(text, `${name} does not import the start state`).toContain('startState');
      expect(
        callCount(text, 'await startState'),
        `${name} navigates ${navigations} times and takes the start state fewer times`,
      ).toBeGreaterThanOrEqual(navigations);
    }
  });
});

describe('the demo set in the browser suite', () => {
  test('no test reaches the thumbnail host', () => {
    for (const name of suiteFiles()) {
      const text = readFileSync(join(e2e, name), 'utf8');
      expect(text, `${name} names the thumbnail host`).not.toContain(
        'ruins.canonn.tech',
      );
    }
  });

  test('no test selects a record of the demo set', () => {
    const demo = JSON.parse(
      readFileSync(join(root, 'demo-data', 'guardian-ruins.json'), 'utf8'),
    ) as { systems: { name: string }[] };
    const names = demo.systems.map((system) => system.name);
    expect(names.length).toBeGreaterThan(0);

    for (const file of suiteFiles()) {
      const text = readFileSync(join(e2e, file), 'utf8');
      for (const name of names) {
        expect(text.includes(name), `${file} names the demo record ${name}`).toBe(
          false,
        );
      }
    }
  });
});
