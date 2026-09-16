// Runs the browser suite in two passes.
//
// The first pass takes every spec but the timed ones, on several workers. The second
// takes the timed ones on one worker, because a frame interval measured beside five
// other browsers is not the interval the budget states.
//
// Both passes always run. A failure in the first one must not hide the state of the
// second, so the script keeps the worse exit code and reports it at the end.

import { spawnSync } from 'node:child_process';

/** Runs one Playwright pass and gives its exit code back. */
function pass(name, argv, extraEnvironment) {
  console.log(`\n=== e2e: ${name} ===\n`);
  const result = spawnSync('pnpm', ['exec', 'playwright', 'test', ...argv], {
    stdio: 'inherit',
    env: { ...process.env, ...extraEnvironment },
  });
  if (result.error !== undefined) throw result.error;
  return result.status ?? 1;
}

const parallel = pass('the parallel pass', [
  '--project=chromium-gpu',
  '--project=chromium-touch',
]);

// The first pass built the same tree a moment before, so the second one serves that
// build rather than making it again.
const timed = pass(
  'the timed pass, on one worker',
  ['--project=chromium-timed', '--workers=1'],
  { GALAXY_MAP_E2E_BUILT: '1' },
);

console.log(
  `\n=== e2e: parallel pass ${parallel === 0 ? 'passed' : 'failed'}, ` +
    `timed pass ${timed === 0 ? 'passed' : 'failed'} ===\n`,
);

process.exit(parallel === 0 ? timed : parallel);
