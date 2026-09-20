// Chooses the version the publish workflow releases.
//
// Usage: node scripts/next-version.mjs <manifest-version> <published-versions-json>
//
// The manifest version gives the `major.minor` line. The second argument is what
// `npm view --json <name> versions` answers: an array, or a bare string where the
// registry holds one version, or `[]` where it knows the name but holds nothing. A name
// the registry does not know is no published version, which the caller passes as `[]`.
//
// The script prints the chosen version to stdout and nothing else, so a workflow step
// reads it with a command substitution. Where it cannot choose, it writes the reason to
// stderr, exits non-zero, and **prints no version**. The two outcomes never both happen.
//
// The rule lives here and not in the workflow YAML so a unit test can run it. A rule
// inside a `run:` block is read by nothing until a release day.

/**
 * The patch to publish next on one `major.minor` line.
 *
 * It is the lowest patch **above every published patch of that line**, and not the
 * lowest hole in the series. A hole cannot be filled: npm refuses a version that was
 * published and unpublished, and a lower version would move the `latest` tag backwards,
 * which the check below refuses in any case.
 *
 * @param {string} manifestVersion The version in the package manifest.
 * @param {unknown} published What the registry answered.
 * @returns {string} The version to publish.
 */
export function nextVersion(manifestVersion, published) {
  const match = /^(\d+)\.(\d+)\./.exec(manifestVersion);
  if (match === null) {
    throw new Error(
      `the manifest version is not major.minor.patch: ${manifestVersion}`,
    );
  }
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const list = Array.isArray(published) ? published : [published];
  const names = list.filter((entry) => typeof entry === 'string');

  // The patches of this line. A pre-release such as `0.6.1-rc.1` takes the patch too, so
  // the next release does not land on a number a pre-release already used.
  const line = new RegExp(`^${major}\\.${minor}\\.(\\d+)(?:$|-)`);
  const patches = names.flatMap((name) => {
    const found = line.exec(name);
    return found === null ? [] : [Number(found[1])];
  });
  const next = [major, minor, Math.max(-1, ...patches) + 1];

  // The highest release the registry holds, over every line. `latest` points at it, and
  // a publish below it would move that tag backwards.
  const stable = names.flatMap((name) => {
    const found = /^(\d+)\.(\d+)\.(\d+)$/.exec(name);
    return found === null
      ? []
      : [[Number(found[1]), Number(found[2]), Number(found[3])]];
  });
  const compare = (left, right) =>
    left[0] - right[0] || left[1] - right[1] || left[2] - right[2];
  const highest = stable.sort(compare).at(-1);
  if (highest !== undefined && compare(next, highest) <= 0) {
    throw new Error(
      `${next.join('.')} would move the latest tag behind ${highest.join('.')}`,
    );
  }
  return next.join('.');
}

/** Reads the two arguments, prints the version, and exits non-zero on a refusal. */
function main(argv) {
  const [manifestVersion, publishedJson = '[]'] = argv;
  if (manifestVersion === undefined) {
    process.stderr.write(
      'usage: node scripts/next-version.mjs <manifest-version> <published-versions-json>\n',
    );
    process.exit(2);
  }
  let published;
  try {
    published = JSON.parse(publishedJson);
  } catch {
    process.stderr.write(`the published version list is not JSON: ${publishedJson}\n`);
    process.exit(1);
    return;
  }
  try {
    process.stdout.write(`${nextVersion(manifestVersion, published)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}

// The file is a module a test imports and a script the workflow runs. `main` runs in the
// second case alone, which is the run with the two arguments.
if (process.argv[1] !== undefined && process.argv[1].endsWith('next-version.mjs')) {
  main(process.argv.slice(2));
}
