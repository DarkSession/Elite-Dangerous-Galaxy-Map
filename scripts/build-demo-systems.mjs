// Builds the three demo data sets of the page from the dumps of the Canonn Research
// Group. Each conversion is an exported function below, so a unit test can run it over
// a fixture with no network and no file write. The entry part at the end fetches the
// dumps and writes the files, and it runs only when node starts this script.
//
// Run it with `pnpm build:demo-data`.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { argv } from 'node:process';
import { fileURLToPath } from 'node:url';

/** Where the Guardian Ruins dump comes from. */
export const DUMP_URL =
  'https://storage.googleapis.com/canonn-downloads/guardian_ruins.json';

/** Where the Guardian Structures dump comes from. */
export const STRUCTURES_DUMP_URL =
  'https://storage.googleapis.com/canonn-downloads/guardian_structures.json';

/**
 * Where the Notable Systems dump comes from. The `canonn-downloads` bucket refuses this
 * file with a 403, so the script reads it from the map project's own source tree.
 */
export const NOTABLE_DUMP_URL =
  'https://raw.githubusercontent.com/canonn-science/CanonnED3D-Map/master/Source/data/csvCache/notable_systems.json';

/** Where a thumbnail of a site type comes from. */
export const THUMBNAIL_BASE = 'https://ruins.canonn.tech/images/maps/';

/** Where the records come from. */
export const SOURCE_URL = 'https://github.com/canonn-science/CanonnED3D-Map';

/** The licence line the set carries. */
export const LICENCE = 'MIT. The site records come from the Canonn Research Group.';

/**
 * The category of each site type the Guardian Ruins dump names. A type the table does
 * not name takes the `Unknown` row. The conversion drops a row that no record uses, so
 * the category browser of the HUD shows no empty category.
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

/**
 * The category of each site type the Guardian Structures dump names. The names are the
 * shapes the Canonn survey gave each layout. A type the table does not name takes the
 * `Unknown` row, and the conversion drops a row that no record uses.
 */
export const CATEGORY_OF_STRUCTURE = {
  Bear: {
    name: 'Structure Bear',
    color: [232, 120, 72],
    description: 'A Guardian structure of the Bear layout.',
  },
  Bowl: {
    name: 'Structure Bowl',
    color: [255, 190, 80],
    description: 'A Guardian structure of the Bowl layout.',
  },
  Crossroads: {
    name: 'Structure Crossroads',
    color: [120, 200, 255],
    description: 'A Guardian structure of the Crossroads layout.',
  },
  Fistbump: {
    name: 'Structure Fistbump',
    color: [255, 128, 160],
    description: 'A Guardian structure of the Fistbump layout.',
  },
  Hammerbot: {
    name: 'Structure Hammerbot',
    color: [160, 140, 255],
    description: 'A Guardian structure of the Hammerbot layout.',
  },
  Lacrosse: {
    name: 'Structure Lacrosse',
    color: [120, 230, 180],
    description: 'A Guardian structure of the Lacrosse layout.',
  },
  Robolobster: {
    name: 'Structure Robolobster',
    color: [255, 96, 96],
    description: 'A Guardian structure of the Robolobster layout.',
  },
  Squid: {
    name: 'Structure Squid',
    color: [190, 130, 255],
    description: 'A Guardian structure of the Squid layout.',
  },
  Stickyhand: {
    name: 'Structure Stickyhand',
    color: [96, 220, 220],
    description: 'A Guardian structure of the Stickyhand layout.',
  },
  Turtle: {
    name: 'Structure Turtle',
    color: [180, 220, 96],
    description: 'A Guardian structure of the Turtle layout.',
  },
  Unknown: {
    name: 'Structure Unknown',
    color: [160, 120, 96],
    description: 'A Guardian structure whose layout is not recorded.',
  },
};

/**
 * The category of each subject the Notable Systems dump names. A subject the table does
 * not name takes the `Other` row, and the conversion drops a row that no record uses.
 */
export const CATEGORY_OF_SUBJECT = {
  INRA: {
    name: 'INRA',
    color: [255, 176, 64],
    description: 'A system with a site of the INRA.',
  },
  Guardian: {
    name: 'Guardian',
    color: [120, 230, 180],
    description: 'A system with a Guardian record.',
  },
  Thargoid: {
    name: 'Thargoid',
    color: [190, 130, 255],
    description: 'A system with a Thargoid record.',
  },
  Human: {
    name: 'Human',
    color: [120, 200, 255],
    description: 'A system of human history.',
  },
  Other: {
    name: 'Other',
    color: [160, 120, 96],
    description: 'A system whose subject the dump does not name.',
  },
};

/** The number the dump holds as a string, or `null` when it is not a number. */
function numberOf(value) {
  const text = String(value ?? '').replace(/,/g, '');
  const number = Number.parseFloat(text);
  return Number.isFinite(number) ? number : null;
}

/** The position of one record of a dump, or `null` when a coordinate is not a number. */
function coordsOf(record) {
  const x = numberOf(record['x']);
  const y = numberOf(record['y']);
  const z = numberOf(record['z']);
  if (x === null || y === null || z === null) return null;
  return { x, y, z };
}

/** The key of one site of a dump against a table, and the fallback for an unnamed one. */
function keyOf(value, table, fallback) {
  const key = String(value ?? '').trim();
  return key in table && key !== fallback ? key : fallback;
}

/** The site type of one site of the Guardian Ruins dump. An unnamed type is `Unknown`. */
function typeOf(site) {
  return keyOf(site['Site Type'], CATEGORY_OF_TYPE, 'Unknown');
}

/**
 * Groups the records of a dump by system. The reading holds each system's name, its
 * position, the distinct keys its records name in the order of the dump, and the
 * records themselves. A record with no name, and one with no finite position, is
 * dropped.
 */
function groupBySystem(dump, nameOf, keyOfRecord) {
  const bySystem = new Map();
  for (const record of Array.isArray(dump) ? dump : []) {
    const name = String(nameOf(record) ?? '').trim();
    if (name.length === 0) continue;
    const coords = coordsOf(record);
    if (coords === null) continue;

    let held = bySystem.get(name);
    if (held === undefined) {
      held = { name, coords, keys: [], records: [] };
      bySystem.set(name, held);
    }
    const key = keyOfRecord(record);
    if (!held.keys.includes(key)) held.keys.push(key);
    held.records.push(record);
  }
  return bySystem;
}

/** The rows of a category table that the systems use, in the order of the table. */
function usedCategories(table, systems) {
  const used = new Set();
  for (const held of systems) for (const key of held.keys) used.add(key);
  return Object.entries(table)
    .filter(([key]) => used.has(key))
    .map(([, category]) => category);
}

/** The count and the bodies of the sites of one system, as one sentence pair. */
function describeSites(sites, one, many) {
  const count = sites.length;
  const first =
    count === 1 ? `The system holds 1 ${one}.` : `The system holds ${count} ${many}.`;
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

/** The description of one Guardian Ruins system: the site count and the bodies. */
export function describeSystem(sites) {
  return describeSites(sites, 'Guardian ruin', 'Guardian ruins');
}

/** The description of one Guardian Structures system: the site count and the bodies. */
export function describeStructureSystem(sites) {
  return describeSites(sites, 'Guardian structure', 'Guardian structures');
}

/**
 * Turns the parsed Guardian Ruins dump into the record set the page adds to the map.
 * One record is one system and not one site. A system's categories are its distinct
 * site types in the order the dump lists them, and its images follow the same order.
 */
export function convertRuins(dump) {
  const bySystem = groupBySystem(dump, (site) => site['System Name'], typeOf);

  const systems = [];
  for (const held of bySystem.values()) {
    const categories = held.keys.map((type) => CATEGORY_OF_TYPE[type].name);
    systems.push({
      name: held.name,
      coords: held.coords,
      primaryCategory: categories[0],
      secondaryCategories: categories.slice(1),
      description: describeSystem(held.records),
      images: held.keys.map((type) => ({
        url: `${THUMBNAIL_BASE}${type.toLowerCase()}-thumbnail.png`,
        caption: `${type} site`,
      })),
    });
  }

  const categories = usedCategories(CATEGORY_OF_TYPE, bySystem.values());
  return { source: SOURCE_URL, licence: LICENCE, categories, systems };
}

/**
 * Turns the parsed Guardian Structures dump into the record set the page adds to the
 * map. One record is one system and not one site, by the same rule as the ruins. The
 * records carry no image: the dump names no picture for a structure type.
 */
export function convertStructures(dump) {
  const bySystem = groupBySystem(
    dump,
    (site) => site['System Name'],
    (site) => keyOf(site['Site Type'], CATEGORY_OF_STRUCTURE, 'Unknown'),
  );

  const systems = [];
  for (const held of bySystem.values()) {
    const categories = held.keys.map((type) => CATEGORY_OF_STRUCTURE[type].name);
    systems.push({
      name: held.name,
      coords: held.coords,
      primaryCategory: categories[0],
      secondaryCategories: categories.slice(1),
      description: describeStructureSystem(held.records),
    });
  }

  const categories = usedCategories(CATEGORY_OF_STRUCTURE, bySystem.values());
  return { source: SOURCE_URL, licence: LICENCE, categories, systems };
}

/** The named character references the dump's `html` field uses. */
const NAMED_REFERENCES = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
};

/** Decodes the character references of a text, named and numeric. */
function decodeReferences(text) {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body) => {
    if (body.startsWith('#')) {
      const digits = body.slice(1);
      const code =
        digits.startsWith('x') || digits.startsWith('X')
          ? Number.parseInt(digits.slice(1), 16)
          : Number.parseInt(digits, 10);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : '';
    }
    const named = NAMED_REFERENCES[body.toLowerCase()];
    return named === undefined ? whole : named;
  });
}

/**
 * Turns one `html` field of the Notable Systems dump into plain text: the tags go, the
 * character references decode, and the paragraphs join with a blank line. A `<` or a `>`
 * that a reference decodes to goes as well, because the description carries no markup.
 */
export function plainTextFromHtml(html) {
  const paragraphs = String(html ?? '')
    // A line break and the end of a block are both paragraph breaks.
    .replace(/<br\s*\/?>/gi, '\n\n')
    .replace(/<\/(p|div|li|blockquote|h[1-6]|tr)\s*>/gi, '\n\n')
    // Every other tag goes, and the text inside it stays.
    .replace(/<[^>]*>/g, '')
    .split(/\n{2,}/);

  const kept = [];
  for (const paragraph of paragraphs) {
    const text = decodeReferences(paragraph)
      .replace(/[<>]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (text.length > 0) kept.push(text);
  }
  return kept.join('\n\n');
}

/**
 * Turns the parsed Notable Systems dump into the record set the page adds to the map.
 * One record is one system. A system that holds several subjects carries the first as
 * its primary category and the rest as secondary ones, by the same rule as the ruins.
 * The description is the `html` field of the first record, as plain text.
 */
export function convertNotable(dump) {
  const bySystem = groupBySystem(
    dump,
    (entry) => entry['system'],
    (entry) => keyOf(entry['category'], CATEGORY_OF_SUBJECT, 'Other'),
  );

  const systems = [];
  for (const held of bySystem.values()) {
    const categories = held.keys.map((subject) => CATEGORY_OF_SUBJECT[subject].name);
    const description = held.records
      .map((entry) => plainTextFromHtml(entry['html']))
      .filter((text) => text.length > 0)
      .join('\n\n');
    systems.push({
      name: held.name,
      coords: held.coords,
      primaryCategory: categories[0],
      secondaryCategories: categories.slice(1),
      ...(description.length > 0 ? { description } : {}),
    });
  }

  const categories = usedCategories(CATEGORY_OF_SUBJECT, bySystem.values());
  return { source: SOURCE_URL, licence: LICENCE, categories, systems };
}

/** The three sets the entry part writes, in the order it writes them. */
const SETS = [
  {
    dump: 'guardian_ruins.json',
    url: DUMP_URL,
    file: 'guardian-ruins.json',
    convert: convertRuins,
  },
  {
    dump: 'guardian_structures.json',
    url: STRUCTURES_DUMP_URL,
    file: 'guardian-structures.json',
    convert: convertStructures,
  },
  {
    dump: 'notable_systems.json',
    url: NOTABLE_DUMP_URL,
    file: 'notable-systems.json',
    convert: convertNotable,
  },
];

/** Reads one dump from `data/`, and fetches it into `data/` when it is not there. */
async function readDump(directory, name, url) {
  const path = join(directory, name);
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    process.stdout.write(`${name} is not in ${directory}. The script fetches it.\n`);
    const answer = await fetch(url);
    if (!answer.ok) throw new Error(`${name} did not download: ${answer.status}`);
    const text = await answer.text();
    await mkdir(directory, { recursive: true });
    await writeFile(path, text);
    return JSON.parse(text);
  }
}

/** Fetches each dump, converts it and writes the demo set. */
async function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  await mkdir(join(root, 'demo-data'), { recursive: true });
  for (const entry of SETS) {
    const dump = await readDump(join(root, 'data'), entry.dump, entry.url);
    const set = entry.convert(dump);
    const text = `${JSON.stringify(set, null, 2)}\n`;
    await writeFile(join(root, 'demo-data', entry.file), text);
    const digest = createHash('sha256').update(text).digest('hex').slice(0, 12);
    process.stdout.write(
      `${entry.file} holds ${set.categories.length} categories and ` +
        `${set.systems.length} systems, digest ${digest}.\n`,
    );
  }
}

// The entry part runs only when node starts this file. A test that imports a conversion
// above therefore reaches no network and writes no file.
if (argv[1] !== undefined && import.meta.url === `file://${argv[1]}`) {
  await main();
}
