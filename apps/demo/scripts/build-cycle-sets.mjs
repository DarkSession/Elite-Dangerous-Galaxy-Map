// Builds one demo data set for each cycle of the Thargoid war, from the cycle files of
// the DCoH Overwatch archive. The cycles page of the demo site draws them, one cycle at
// a time.
//
// The conversion is `convertOverwatch`, which `build-demo-systems.mjs` exports and
// `tests/demo-systems.test.ts` already covers over a committed fixture. This script adds
// the archive listing, the fetch, the output pass and the two bounds.
//
// The raw cycle files are 1.09 GB in all. They go in the ignored `apps/demo/data/cycles/`
// and the repository never holds one. The converted sets, which are about 11.5 MB, are
// committed, so a build of the site and a run of the tests need no network.
//
// Run it with `pnpm build:cycle-data`.
import { readFileSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { argv } from 'node:process';
import { fileURLToPath } from 'node:url';
import { convertOverwatch } from './build-demo-systems.mjs';

/** Where the file list of the archive's cycle directory comes from. */
export const ARCHIVE_CONTENTS_URL =
  'https://api.github.com/repos/DarkSession/EDOverwatch.Archive/contents/By%20Cycle';

/**
 * Reads one exported whole-number constant from the library's source.
 *
 * The two bounds this build holds are the library's own. The script is JavaScript that
 * node runs with no build step, so it cannot import a TypeScript module, and a number
 * written again here would be a second source of truth. It reads the declaration instead,
 * and fails where the declaration is not there.
 */
function libraryConstant(file, name) {
  const path = new URL(`../../../packages/galaxy-map/src/${file}`, import.meta.url);
  const found = new RegExp(`export const ${name} = (\\d+);`).exec(
    readFileSync(path, 'utf8'),
  );
  if (found === null) {
    throw new Error(
      `packages/galaxy-map/src/${file} declares no '${name}'. The cycle build reads ` +
        `the bound from the library rather than write the number again.`,
    );
  }
  return Number(found[1]);
}

/** How many records one set holds, which the package exports as `MAX_SYSTEMS`. */
export const MAX_SYSTEMS = libraryConstant('scene-data/real-systems.ts', 'MAX_SYSTEMS');

/** How many entries the dataset catalog reads, which the library holds as `MAX_DATASETS`. */
export const MAX_DATASETS = libraryConstant('app/datasets.ts', 'MAX_DATASETS');

/**
 * The cycle number and the week of one file name of the archive, or null where the name
 * is not a cycle file. The archive names a file `12 - 2023-02-16.json`, where the number
 * is the cycle and the date is the week it starts.
 */
export function readCycleName(name) {
  const found = /^(\d+)\s*-\s*(\d{4}-\d{2}-\d{2})\.json$/.exec(name);
  if (found === null) return null;
  return { cycle: Number(found[1]), week: found[2] };
}

/**
 * The cycle files of a contents listing, in cycle order.
 *
 * It fails, naming the count and the bound, where the archive holds more cycle files than
 * the catalog reads. The page would drop the entries over the bound in silence, and a
 * week of the war would then be on no page.
 */
export function readCycleList(entries, bound = MAX_DATASETS) {
  const found = [];
  for (const entry of Array.isArray(entries) ? entries : []) {
    const name = String(entry?.['name'] ?? '');
    const read = readCycleName(name);
    if (read === null) continue;
    found.push({ ...read, name, url: String(entry?.['download_url'] ?? '') });
  }
  found.sort((first, second) => first.cycle - second.cycle);
  if (found.length > bound) {
    throw new Error(
      `the archive holds ${found.length} cycle files and the dataset catalog reads ` +
        `${bound} entries. The build writes no set the page would drop in silence.`,
    );
  }
  return found;
}

/** `1 Titan, 40 Invasion and 702 Controlled`, from the parts of that list. */
function listOf(parts) {
  if (parts.length === 0) return 'no system';
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/**
 * The manifest row of one converted cycle: the cycle number, the week it starts, the
 * label and the group the dialog lists it under, what the week held, and the record
 * count. The page reads the count from here, so it cannot state a count the file does
 * not hold.
 */
export function cycleRow(entry, set) {
  const counts = new Map();
  for (const system of set.systems) {
    const name = system.categories[0];
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const parts = set.categories.map(
    (category) => `${counts.get(category.name) ?? 0} ${category.name}`,
  );
  return {
    cycle: entry.cycle,
    week: entry.week,
    label: `Cycle ${entry.cycle}, ${entry.week}`,
    group: entry.week.slice(0, 4),
    description:
      `Cycle ${entry.cycle} of the Thargoid war, the week of ${entry.week}. ` +
      `The week holds ${listOf(parts)}.`,
    count: set.systems.length,
  };
}

/**
 * The converted set of one cycle, or null where the cycle gave no record.
 *
 * It fails, naming the cycle and the count, where the cycle holds more records than a set
 * holds. The map would reject the records over the bound, and the page would draw a part
 * of that week and say nothing.
 */
export function convertCycle(entry, dump, bound = MAX_SYSTEMS) {
  const set = convertOverwatch(dump);
  if (set.systems.length > bound) {
    throw new Error(
      `cycle ${entry.cycle} converts to ${set.systems.length} records and a set holds ` +
        `${bound}. The map would reject the records over the bound.`,
    );
  }
  return set.systems.length === 0 ? null : set;
}

/** The file name of one cycle, zero-padded so the file order is the cycle order. */
export function cycleFileName(cycle) {
  return `${String(cycle).padStart(3, '0')}.json`;
}

/**
 * The file list of the archive's cycle directory. It fails and names the address.
 *
 * `read` is the reader, which is `fetch` in the build. A test gives its own, so the
 * failure path is read with no network.
 */
export async function readArchiveList(read = fetch) {
  // A dropped connection and a bad status are one failure to the reader of the output:
  // the archive did not answer. Both name the address and both leave the sets alone.
  let answer;
  try {
    answer = await read(ARCHIVE_CONTENTS_URL, {
      headers: { accept: 'application/vnd.github+json' },
    });
  } catch (reason) {
    throw new Error(
      `the archive file list at ${ARCHIVE_CONTENTS_URL} did not download: ` +
        `${reason instanceof Error ? reason.message : String(reason)}. ` +
        'The committed sets are left as they were.',
      { cause: reason },
    );
  }
  if (!answer.ok) {
    throw new Error(
      `the archive file list at ${ARCHIVE_CONTENTS_URL} did not download: ` +
        `${answer.status}. The committed sets are left as they were.`,
    );
  }
  return answer.json();
}

/** Reads one cycle file from `data/cycles/`, and fetches it there when it is not. */
async function readCycleFile(directory, entry) {
  const path = join(directory, entry.name);
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    process.stdout.write(
      `${entry.name} is not in ${directory}. The script fetches it.\n`,
    );
    const answer = await fetch(entry.url);
    if (!answer.ok) {
      throw new Error(`${entry.name} did not download: ${answer.status}`);
    }
    const text = await answer.text();
    await mkdir(directory, { recursive: true });
    await writeFile(path, text);
    return JSON.parse(text);
  }
}

/** Fetches every cycle of the archive, converts it and writes the sets and the manifest. */
async function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const raw = join(root, 'data', 'cycles');
  const out = join(root, 'demo-data', 'cycles');

  const list = readCycleList(await readArchiveList());
  process.stdout.write(`the archive holds ${list.length} cycle files.\n`);

  // Every cycle is converted before anything is written. A failure part of the way
  // through therefore leaves the committed sets where they were.
  const written = [];
  const rows = [];
  const empty = [];
  for (const entry of list) {
    const dump = await readCycleFile(raw, entry);
    const set = convertCycle(entry, dump);
    if (set === null) {
      const held = Array.isArray(dump) ? dump.length : 0;
      empty.push({ name: entry.name, held });
      process.stdout.write(
        `${entry.name} gave no record, and the file holds ${held} raw records.\n`,
      );
      continue;
    }
    written.push({ file: cycleFileName(entry.cycle), text: JSON.stringify(set) });
    rows.push(cycleRow(entry, set));
  }

  // The directory holds nothing this build does not write, so it is cleared rather than
  // written over. A cycle that gave records last time and gives none now leaves no file.
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  let bytes = 0;
  let largest = { file: '', bytes: 0 };
  for (const { file, text } of written) {
    await writeFile(join(out, file), text);
    bytes += Buffer.byteLength(text);
    if (Buffer.byteLength(text) > largest.bytes) {
      largest = { file, bytes: Buffer.byteLength(text) };
    }
  }
  const manifest = `${JSON.stringify(rows, null, 2)}\n`;
  await writeFile(join(out, 'index.json'), manifest);
  bytes += Buffer.byteLength(manifest);

  process.stdout.write(
    `demo-data/cycles/ holds ${written.length} cycles and ${bytes} bytes. ` +
      `The largest is ${largest.file} at ${largest.bytes} bytes.\n`,
  );
  process.stdout.write(`${empty.length} cycles gave no record.\n`);
}

// The entry part runs only when node starts this file. A test that imports a pass above
// therefore reaches no network and writes no file.
if (argv[1] !== undefined && import.meta.url === `file://${argv[1]}`) {
  await main();
}
