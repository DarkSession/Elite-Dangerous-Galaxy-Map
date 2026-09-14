// Builds the demo data set of the page from the Guardian Ruins dump of the Canonn
// Research Group. The conversion is the exported function below, so a unit test can run
// it over a fixture with no network and no file write. The entry part at the end fetches
// the dump and writes the file, and it runs only when node starts this script.
//
// Run it with `pnpm build:demo`.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { argv } from 'node:process';
import { fileURLToPath } from 'node:url';

/** Where the dump comes from. */
export const DUMP_URL =
  'https://storage.googleapis.com/canonn-downloads/guardian_ruins.json';

/** Where a thumbnail of a site type comes from. */
export const THUMBNAIL_BASE = 'https://ruins.canonn.tech/images/maps/';

/** Where the records come from. */
export const SOURCE_URL = 'https://github.com/canonn-science/CanonnED3D-Map';

/** The licence line the set carries. */
export const LICENCE = 'MIT. The site records come from the Canonn Research Group.';

/**
 * The category of each site type the dump names. A type the table does not name takes
 * the `Unknown` row. The conversion drops a row that no record uses, so the category
 * browser of the HUD shows no empty category.
 */
export const CATEGORY_OF_TYPE = {
  Alpha: {
    name: 'Ruins Alpha',
    color: [255, 176, 64],
    description: 'A Guardian ruin of the Alpha layout.',
  },
  Beta: {
    name: 'Ruins Beta',
    color: [255, 122, 64],
    description: 'A Guardian ruin of the Beta layout.',
  },
  Gamma: {
    name: 'Ruins Gamma',
    color: [255, 88, 120],
    description: 'A Guardian ruin of the Gamma layout.',
  },
  Unknown: {
    name: 'Ruins Unknown',
    color: [160, 120, 96],
    description: 'A Guardian ruin whose layout is not recorded.',
  },
};

/** The number the dump holds as a string, or `null` when it is not a number. */
function numberOf(value) {
  const text = String(value ?? '').replace(/,/g, '');
  const number = Number.parseFloat(text);
  return Number.isFinite(number) ? number : null;
}

/** The site type of one site of the dump. An unnamed type is `Unknown`. */
function typeOf(site) {
  const type = String(site['Site Type'] ?? '').trim();
  return type in CATEGORY_OF_TYPE && type !== 'Unknown' ? type : 'Unknown';
}

/** The description of one system: the site count and the bodies the sites are on. */
export function describeSystem(sites) {
  const count = sites.length;
  const first =
    count === 1
      ? 'The system holds 1 Guardian ruin.'
      : `The system holds ${count} Guardian ruins.`;
  const bodies = [];
  for (const site of sites) {
    const body = String(site['Body Name'] ?? '').trim();
    if (body.length > 0 && !bodies.includes(body)) bodies.push(body);
  }
  if (bodies.length === 0) return first;
  if (bodies.length === 1) return `${first} The body is ${bodies[0]}.`;
  const last = bodies[bodies.length - 1];
  const rest = bodies.slice(0, -1).join(', ');
  return `${first} The bodies are ${rest} and ${last}.`;
}

/**
 * Turns the parsed dump into the record set the page adds to the map. One record is one
 * system and not one site. A system's categories are its distinct site types in the
 * order the dump lists them, and its images follow the same order.
 */
export function convertRuins(dump) {
  const bySystem = new Map();

  for (const site of Array.isArray(dump) ? dump : []) {
    const name = String(site['System Name'] ?? '').trim();
    if (name.length === 0) continue;
    const x = numberOf(site['x']);
    const y = numberOf(site['y']);
    const z = numberOf(site['z']);
    if (x === null || y === null || z === null) continue;

    let held = bySystem.get(name);
    if (held === undefined) {
      held = { name, coords: { x, y, z }, types: [], sites: [] };
      bySystem.set(name, held);
    }
    const type = typeOf(site);
    if (!held.types.includes(type)) held.types.push(type);
    held.sites.push(site);
  }

  const usedTypes = new Set();
  const systems = [];
  for (const held of bySystem.values()) {
    for (const type of held.types) usedTypes.add(type);
    const categories = held.types.map((type) => CATEGORY_OF_TYPE[type].name);
    systems.push({
      name: held.name,
      coords: held.coords,
      primaryCategory: categories[0],
      secondaryCategories: categories.slice(1),
      description: describeSystem(held.sites),
      images: held.types.map((type) => ({
        url: `${THUMBNAIL_BASE}${type.toLowerCase()}-thumbnail.png`,
        caption: `${type} site`,
      })),
    });
  }

  const categories = Object.entries(CATEGORY_OF_TYPE)
    .filter(([type]) => usedTypes.has(type))
    .map(([, category]) => category);

  return { source: SOURCE_URL, licence: LICENCE, categories, systems };
}

/** Reads the dump from `data/`, and fetches it into `data/` when it is not there. */
async function readDump(directory) {
  const path = join(directory, 'guardian_ruins.json');
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    process.stdout.write(`The dump is not in ${directory}. The script fetches it.\n`);
    const answer = await fetch(DUMP_URL);
    if (!answer.ok) throw new Error(`The dump did not download: ${answer.status}`);
    const text = await answer.text();
    await mkdir(directory, { recursive: true });
    await writeFile(path, text);
    return JSON.parse(text);
  }
}

/** Fetches the dump, converts it and writes the demo set. */
async function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const dump = await readDump(join(root, 'data'));
  const set = convertRuins(dump);
  const path = join(root, 'src', 'app', 'demo-systems.json');
  const text = `${JSON.stringify(set, null, 2)}\n`;
  await writeFile(path, text);
  const digest = createHash('sha256').update(text).digest('hex').slice(0, 12);
  process.stdout.write(
    `The demo set holds ${set.categories.length} categories and ${set.systems.length} systems.\n`,
  );
  process.stdout.write(`It is in src/app/demo-systems.json, digest ${digest}.\n`);
}

// The entry part runs only when node starts this file. A test that imports the
// conversion above therefore reaches no network and writes no file.
if (argv[1] !== undefined && import.meta.url === `file://${argv[1]}`) {
  await main();
}
