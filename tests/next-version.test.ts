// What `scripts/next-version.mjs` chooses, and when it refuses.
//
// The test runs the script as the workflow runs it, so it reads what the step reads:
// the version on stdout, the reason on stderr and the exit status. A refusal must print
// no version, because the step takes stdout as the version to publish.
import { execFileSync, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const script = join(root, 'scripts', 'next-version.mjs');

/** Runs the script and gives back what it printed. */
function run(manifestVersion: string, published: unknown): string {
  return execFileSync('node', [script, manifestVersion, JSON.stringify(published)], {
    encoding: 'utf8',
  }).trim();
}

describe('the next version', () => {
  test('is the first patch where the registry holds nothing', () => {
    expect(run('0.6.0', [])).toBe('0.6.0');
  });

  test('passes a gap rather than filling it', () => {
    // The lowest free patch of the line is 0.6.1, and the script does not take it. A
    // version that was published and unpublished cannot be published again, and 0.6.1
    // would move the `latest` tag behind 0.6.2.
    expect(run('0.6.0', ['0.6.0', '0.6.2'])).toBe('0.6.3');
  });

  test('climbs over a published patch above the local one', () => {
    expect(run('0.6.0', ['0.6.0', '0.6.1', '0.6.2'])).toBe('0.6.3');
  });

  test('starts a line the registry has no release on', () => {
    expect(run('0.7.0', ['0.6.0', '0.6.1'])).toBe('0.7.0');
  });

  test('refuses to move the latest tag backwards', () => {
    // The regression case: the manifest is on 0.4 and the registry holds 0.5.3.
    const result = spawnSync('node', [script, '0.4.0', JSON.stringify(['0.5.3'])], {
      encoding: 'utf8',
    });
    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('would move the latest tag behind 0.5.3');
  });

  test('reads the one-version answer of the registry', () => {
    // `npm view --json <name> versions` answers a bare string where the registry holds
    // one version, and an array where it holds more.
    expect(run('0.6.0', '0.6.0')).toBe('0.6.1');
  });

  test('takes the patch a pre-release used', () => {
    expect(run('0.6.0', ['0.6.0', '0.6.1-rc.1'])).toBe('0.6.2');
  });

  test('fails on a manifest version it cannot read', () => {
    const result = spawnSync('node', [script, 'latest', '[]'], { encoding: 'utf8' });
    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('not major.minor.patch');
  });
});
