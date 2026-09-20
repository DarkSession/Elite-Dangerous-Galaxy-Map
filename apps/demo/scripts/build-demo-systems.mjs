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
// The one reach of the demo into the library by a relative path. The script places a
// generated system against the model, and it is a build tool of the demo rather than a
// module of `apps/demo/src/`, which the lint rule holds to package-name imports.
import galaxyModel from '../../../packages/galaxy-map/src/galaxy-model/galaxy-model.json' with { type: 'json' };

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
 * Escapes the four characters the HUD reads as Markdown marks: `*`, `[`, a backtick and a
 * backslash. A record description draws as Markdown, so a dump that carries one of them as
 * literal text needs the backslash in front of it. `_` is not a mark, because system names
 * carry one.
 *
 * The backslash goes first. An escape added after it would itself be escaped.
 */
export function escapeMarkdown(text) {
  return String(text ?? '').replace(/[\\*[`]/g, (mark) => `\\${mark}`);
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
    // This set writes its records itself and reaches `ed3dRecords` at no point, so the
    // escape of the dump text belongs here.
    const description = held.records
      .map((entry) => escapeMarkdown(plainTextFromHtml(entry['html'])))
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

/**
 * The ED3D map sources of the Canonn Research Group. Each one is a JavaScript file that
 * holds one `systemsData` object literal, so the converter parses that literal rather
 * than running the file.
 */
export const UIA_SOURCE_URL =
  'https://raw.githubusercontent.com/canonn-science/CanonnED3D-Map/master/Source/data/MapData-UIA.js';
export const ADAMASTOR_SOURCE_URL =
  'https://raw.githubusercontent.com/canonn-science/CanonnED3D-Map/master/Source/data/MapData-Adamastor.js';
export const MULTIFACTION_SOURCE_URL =
  'https://raw.githubusercontent.com/canonn-science/CanonnED3D-Map/master/Source/data/MapData-multifaction.js';

/** Where the converter asks for the position of a route point it cannot resolve itself. */
export const EDSM_SYSTEM_URL = 'https://www.edsm.net/api-v1/system';

/**
 * Reads one object literal of an ED3D map source, `systemsData` by default.
 *
 * The source is JavaScript and not JSON: it holds comments, single-quoted strings,
 * unquoted keys and trailing commas. The reader below is a parser and not an evaluator,
 * so a source that gains a statement cannot run it. It reads objects, arrays, strings,
 * numbers, `true`, `false` and `null`, which is everything the three sources hold.
 *
 * `key` names the literal. The multifaction source holds its permit spheres in a
 * `permitSpheres` literal of its own, beside an empty `systemsData`.
 */
export function parseEd3dData(text, key = 'systemsData') {
  const source = String(text ?? '');
  // The reader looks for the key as a property and not as a word, so a comment that names
  // the key does not send it to the wrong literal.
  const head = new RegExp(`(^|[^A-Za-z0-9_$])${key}\\s*:`).exec(source);
  if (head === null) throw new Error(`the source holds no ${key}`);
  let at = source.indexOf('{', head.index + head[0].length - 1);
  if (at < 0) throw new Error(`the ${key} literal has no opening brace`);

  /** Steps over whitespace and over a line or a block comment. */
  const skip = () => {
    for (;;) {
      while (at < source.length && /\s/.test(source[at])) at += 1;
      if (source.startsWith('//', at)) {
        const end = source.indexOf('\n', at);
        at = end < 0 ? source.length : end + 1;
        continue;
      }
      if (source.startsWith('/*', at)) {
        const end = source.indexOf('*/', at + 2);
        at = end < 0 ? source.length : end + 2;
        continue;
      }
      return;
    }
  };

  /** Reads one quoted string, with the escapes the sources use. */
  const readString = () => {
    const quote = source[at];
    at += 1;
    let out = '';
    while (at < source.length) {
      const character = source[at];
      if (character === '\\') {
        const next = source[at + 1];
        const named = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' };
        if (next === 'u') {
          out += String.fromCharCode(Number.parseInt(source.slice(at + 2, at + 6), 16));
          at += 6;
          continue;
        }
        out += named[next] ?? next;
        at += 2;
        continue;
      }
      if (character === quote) {
        at += 1;
        return out;
      }
      out += character;
      at += 1;
    }
    throw new Error('the source ends inside a string');
  };

  const readValue = () => {
    skip();
    const character = source[at];
    if (character === '{') {
      at += 1;
      const object = {};
      for (;;) {
        skip();
        if (source[at] === '}') {
          at += 1;
          return object;
        }
        if (source[at] === ',') {
          at += 1;
          continue;
        }
        const key =
          source[at] === '"' || source[at] === "'"
            ? readString()
            : (() => {
                const from = at;
                while (at < source.length && /[\w$]/.test(source[at])) at += 1;
                if (at === from) throw new Error(`no key at ${from}`);
                return source.slice(from, at);
              })();
        skip();
        if (source[at] !== ':') throw new Error(`no colon after ${key}`);
        at += 1;
        object[key] = readValue();
      }
    }
    if (character === '[') {
      at += 1;
      const array = [];
      for (;;) {
        skip();
        if (source[at] === ']') {
          at += 1;
          return array;
        }
        if (source[at] === ',') {
          at += 1;
          continue;
        }
        array.push(readValue());
      }
    }
    if (character === '"' || character === "'") return readString();
    const from = at;
    while (at < source.length && /[^\s,}\]]/.test(source[at])) at += 1;
    const word = source.slice(from, at);
    if (word === 'true') return true;
    if (word === 'false') return false;
    if (word === 'null') return null;
    const number = Number.parseFloat(word);
    if (Number.isFinite(number)) return number;
    throw new Error(`the source holds ${word} at ${from}`);
  };

  return readValue();
}

/** The red, green and blue of a `RRGGBB` colour of an ED3D source. */
function rgbOf(hex) {
  const text = String(hex ?? '').replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(text)) return null;
  return [
    Number.parseInt(text.slice(0, 2), 16),
    Number.parseInt(text.slice(2, 4), 16),
    Number.parseInt(text.slice(4, 6), 16),
  ];
}

/**
 * The category of each id an ED3D source names, from its own grouped category table.
 * The reading is a map from the id, as a string, to the name and the colour.
 */
export function ed3dCategories(data) {
  const table = new Map();
  const groups = data?.['categories'] ?? {};
  for (const group of Object.values(groups)) {
    if (group === null || typeof group !== 'object') continue;
    for (const [id, entry] of Object.entries(group)) {
      const name = String(entry?.['name'] ?? '').trim();
      const color = rgbOf(entry?.['color']);
      if (name.length === 0 || color === null) continue;
      table.set(String(id), { name, color });
    }
  }
  return table;
}

/**
 * The records of an ED3D source. One entry of the `systems` list is
 * one record. It carries the first category its `cat` names as its primary category and
 * the rest as secondary ones, which is the rule the Guardian Ruins converter holds. The
 * `infos` field is HTML, so it becomes the plain-text description.
 *
 * One name reaches the list more than once: a waypoint of the UIA map is also an end of a
 * hyperdiction, and two hyperdictions share an end. The map holds one record per name, so
 * the reader keeps the **first** entry of a name and adds the categories of a later entry
 * to that record. A later entry gives its description only where the first one carries
 * none, so the commander text of a hyperdiction reaches a waypoint that has no text of its
 * own. The position of the first entry stands.
 */
export function ed3dRecords(data, table) {
  const systems = [];
  const held = new Map();
  for (const entry of data?.['systems'] ?? []) {
    const name = String(entry?.['name'] ?? '').trim();
    const coords = entry?.['coords'];
    if (name.length === 0 || coords === null || typeof coords !== 'object') continue;
    const x = numberOf(coords['x']);
    const y = numberOf(coords['y']);
    const z = numberOf(coords['z']);
    if (x === null || y === null || z === null) continue;

    const names = [];
    for (const id of Array.isArray(entry['cat']) ? entry['cat'] : []) {
      const category = table.get(String(id));
      if (category === undefined || names.includes(category.name)) continue;
      names.push(category.name);
    }
    if (names.length === 0) continue;

    const description = escapeMarkdown(plainTextFromHtml(entry['infos']));
    const first = held.get(name.toLowerCase());
    if (first !== undefined) {
      for (const category of names) {
        if (first.primaryCategory === category) continue;
        if (!first.secondaryCategories.includes(category)) {
          first.secondaryCategories.push(category);
        }
      }
      if (first.description === undefined && description.length > 0) {
        first.description = description;
      }
      continue;
    }
    const record = {
      name,
      coords: { x, y, z },
      primaryCategory: names[0],
      secondaryCategories: names.slice(1),
      ...(description.length > 0 ? { description } : {}),
    };
    held.set(name.toLowerCase(), record);
    systems.push(record);
  }

  return { systems };
}

/**
 * The categories a set carries: every category of the source table that a record or a
 * shape names, in the table's order. Each reader gives its entries, and an entry names a
 * category in `primaryCategory` and in `secondaryCategories`.
 *
 * `map-shapes` rejects a shape that names a category the set does not hold, so a list of
 * the record categories alone would lose every line that names a route category. A
 * category nothing names is left out, as the Guardian Ruins conversion leaves an unused
 * row out.
 */
export function ed3dSetCategories(table, ...readers) {
  const named = new Set();
  for (const entries of readers) {
    for (const entry of entries) {
      if (entry.primaryCategory !== undefined) named.add(entry.primaryCategory);
      for (const name of entry.secondaryCategories ?? []) named.add(name);
    }
  }
  const categories = [];
  for (const category of table.values()) {
    if (!named.has(category.name)) continue;
    if (categories.some((held) => held.name === category.name)) continue;
    categories.push({ name: category.name, color: category.color });
  }
  return categories;
}

/**
 * The category the converter adds for the `g_soi` sphere list, and which the source table
 * does not hold. The source pushes no marker for that list, so the list has no marker
 * category to take, and a sphere that names no category always draws and has no row in
 * the category browser.
 *
 * The id is the list's own key. The source writes its own ids as numbers in strings, so
 * `g_soi` collides with none of them. The name is the label the source gives the list,
 * and the sphere keeps the name `Gamma Velorum`, which is the star at the centre. The
 * colour is the shell's own material colour, which is the only colour the source offers
 * for this category and the one the user sees on the screen.
 */
export const UIA_GAMMA_VELORUM_ID = 'g_soi';
export const UIA_GAMMA_VELORUM_NAME = 'Gamma Velorum Zone';
export const UIA_GAMMA_VELORUM_COLOUR = [0, 0, 153];

/**
 * The sphere lists of the UIA source, with the colour, the category and the marker each
 * one takes. The source draws a sphere with a material of its own in `finishMap`, and the
 * colour below is that material's colour: `vec3(0.2, 0.7, 1.0)` for the permit-locked
 * shells, `vec3(1.0, 0.75, 0.1)` for the permit-unlocked ones, `0x336600` for the
 * hyperdiction shells and `0x000099` for the Gamma Velorum shell.
 *
 * The two fields say two things, because two readers read this list. `category` is the id
 * of the category the spheres of the list name, which `ed3dSpheres` resolves against the
 * table. `record` says whether the list gets a marker at the centre of each sphere, which
 * `ed3dSphereRecords` writes. The first three take the marker category `formatHDs` gives
 * the record it pushes. The source pushes no record for `g_soi`, so that list carries
 * `record: false` and names the category `convertUia` adds for it.
 */
export const UIA_SPHERE_LISTS = [
  { key: 'pls', color: [51, 179, 255], category: '1007', record: true },
  { key: 'puls', color: [255, 191, 26], category: '1008', record: true },
  { key: 'hd_soi', color: [51, 102, 0], category: '1002', record: true },
  {
    key: 'g_soi',
    color: UIA_GAMMA_VELORUM_COLOUR,
    category: UIA_GAMMA_VELORUM_ID,
    record: false,
  },
];

/** The colour a route takes when its category is not in the source's own table. */
export const LINE_COLOUR_FALLBACK = [160, 160, 160];

/**
 * Turns the four sphere lists of an ED3D source into the shapes the map draws.
 *
 * A sphere takes the category of its own list, and `table` gives that category its name.
 * For the first three lists that is the marker category `formatHDs` gives the record it
 * pushes at the centre of the sphere. The `g_soi` list names the category `convertUia`
 * adds for it, because the source pushes no record for that list. A sphere keeps its own
 * colour, which is its material's colour, so the shell keeps the reading the source gives
 * it and the category gives the row's dot its own colour.
 */
export function ed3dSpheres(data, lists, table = new Map()) {
  const spheres = [];
  for (const { key, color, category } of lists) {
    const primaryCategory = category === null ? undefined : table.get(category)?.name;
    for (const entry of data?.[key] ?? []) {
      const radius = numberOf(entry?.['radius']);
      const coords = Array.isArray(entry?.['coords']) ? entry['coords'] : [];
      if (radius === null || radius <= 0 || coords.length !== 3) continue;
      const position = coords.map((part) => numberOf(part));
      if (position.some((part) => part === null)) continue;
      const name = String(entry?.['name'] ?? '').trim();
      spheres.push({
        position,
        radius,
        color,
        ...(name.length > 0 ? { name } : {}),
        ...(primaryCategory === undefined ? {} : { primaryCategory }),
      });
    }
  }
  return spheres;
}

/**
 * Turns the parsed UIA source and the two files it fetches into the demo set.
 *
 * `extras.waypointTables` holds the nine waypoint files in their own order and
 * `extras.hyperdictions` the rows of the report file. The converter builds what
 * `formatHDs` builds at run time: the markers of the three sphere lists, the waypoint
 * markers and their lines, the mean direction line of each table, and the hyperdiction
 * markers and lines. It then reads the whole set with the same two readers the Adamastor
 * set uses, so one rule makes every record and one rule makes every line.
 *
 * The `routes` list of the source is empty, because every entry in it is commented out,
 * and the converter reads it all the same, so a restored route reaches the map with no
 * change here.
 */
export function convertUia(data, extras = {}) {
  const table = ed3dCategories(data);
  // `init()` of the source adds these eight, so the source's own table does not hold them.
  for (const [index, name] of UIA_NAMES.entries()) {
    table.set(`30${index + 1}`, {
      name: `UIA#${index + 1} ${name}`,
      color: UIA_CATEGORY_COLOUR,
    });
  }
  // The `g_soi` sphere takes a category the source holds for no list, because the source
  // pushes no marker for that list and its category table colours the markers. The name
  // is the label the source gives the list and the colour is the shell's own. It goes in
  // last, so it is the last category of the set. The category holds one shape and no
  // record, so it has a row in the shapes tab of the panel and none in the systems tab.
  table.set(UIA_GAMMA_VELORUM_ID, {
    name: UIA_GAMMA_VELORUM_NAME,
    color: UIA_GAMMA_VELORUM_COLOUR,
  });

  const tables = (extras.waypointTables ?? [])
    .map((one) => uiaWaypointRows(one))
    .filter((rows) => rows.length > 0);
  const added = { systems: [], routes: [] };
  for (const [index, rows] of tables.entries()) {
    const built = uiaWaypointSet(rows, index, table);
    added.systems.push(...built.systems);
    added.routes.push(...built.routes);
  }
  const hyperdictions = uiaHyperdictionSet(extras.hyperdictions ?? [], tables);

  const whole = {
    ...data,
    systems: [
      ...(data?.['systems'] ?? []),
      ...ed3dSphereRecords(data, UIA_SPHERE_LISTS),
      ...added.systems,
      ...hyperdictions.systems,
    ],
    routes: [...(data?.['routes'] ?? []), ...added.routes, ...hyperdictions.routes],
  };

  const { systems } = ed3dRecords(whole, table);
  const spheres = ed3dSpheres(data, UIA_SPHERE_LISTS, table);
  const { lines, drops } = ed3dLines(whole, table, systems, () => null);
  return {
    source: SOURCE_URL,
    licence: LICENCE,
    categories: ed3dSetCategories(table, systems, spheres, lines),
    systems,
    spheres,
    lines,
    drops: [...hyperdictions.drops, ...drops],
  };
}

/**
 * Turns the `routes` of an ED3D source into the lines the map draws.
 *
 * Each point names a system. The reader resolves the name against the source's own
 * `systems` list first and against `findPosition` after, comparing without case. A point
 * that resolves nowhere is dropped, and a route left with fewer than two points is
 * dropped whole: a route that has lost a waypoint is wrong, not shorter. Every drop is
 * reported, so a build is never silently short.
 *
 * A point whose system is in the set's own records is written as a system reference and
 * every other point as a coordinate, so a line that connects two markers says so in the
 * data.
 *
 * A line takes the categories of its route: the first category the table holds is its
 * primary one and the rest are its secondary ones. It then carries no colour of its own,
 * because `map-shapes` gives it the colour of the first category it names that is on. A
 * route naming no category the table holds keeps the grey fallback.
 *
 * The `name` of a line names the line and not its category. A route that carries a name
 * of its own gives it, which the UIA waypoint lines and the hyperdiction lines do, and
 * every other line takes the name of its primary category, which is the name the
 * Adamastor source gives its routes.
 */
export function ed3dLines(data, table, records, findPosition) {
  const ownPosition = new Map();
  for (const entry of data?.['systems'] ?? []) {
    const name = String(entry?.['name'] ?? '').trim();
    const coords = entry?.['coords'];
    if (name.length === 0 || coords === null || typeof coords !== 'object') continue;
    const x = numberOf(coords['x']);
    const y = numberOf(coords['y']);
    const z = numberOf(coords['z']);
    if (x === null || y === null || z === null) continue;
    ownPosition.set(name.toLowerCase(), [x, y, z]);
  }
  const inRecords = new Map();
  for (const record of records) inRecords.set(record.name.toLowerCase(), record.name);

  const lines = [];
  const drops = [];
  for (const [index, route] of (data?.['routes'] ?? []).entries()) {
    const ids = Array.isArray(route?.['cat']) ? route['cat'] : [];
    const names = [];
    for (const id of ids) {
      const category = table.get(String(id));
      if (category === undefined || names.includes(category.name)) continue;
      names.push(category.name);
    }
    const own = String(route?.['name'] ?? '').trim();
    const name = own.length > 0 ? own : names[0];
    const points = [];
    for (const point of Array.isArray(route?.['points']) ? route['points'] : []) {
      const name = String(point?.['s'] ?? '').trim();
      const folded = name.toLowerCase();
      const held = inRecords.get(folded);
      if (held !== undefined) {
        points.push({ system: held });
        continue;
      }
      const position = ownPosition.get(folded) ?? findPosition(name);
      if (position === null || position === undefined) {
        drops.push({ route: index, point: name, reason: 'unknown-system' });
        continue;
      }
      points.push(position);
    }
    if (points.length < 2) {
      drops.push({ route: index, point: null, reason: 'too-few-points' });
      continue;
    }
    lines.push({
      points,
      ...(names.length === 0 ? { color: LINE_COLOUR_FALLBACK } : {}),
      width: 2,
      ...(name === undefined ? {} : { name }),
      ...(names.length === 0 ? {} : { primaryCategory: names[0] }),
      ...(names.length > 1 ? { secondaryCategories: names.slice(1) } : {}),
    });
  }
  return { lines, drops };
}

/**
 * The names the `routes` of an ED3D source name and its own `systems` list does not
 * hold. The entry part reads each one from the EDSM name lookup once, before it converts.
 */
export function ed3dRouteNames(data) {
  const own = new Set();
  for (const entry of data?.['systems'] ?? []) {
    const name = String(entry?.['name'] ?? '').trim();
    if (name.length > 0) own.add(name.toLowerCase());
  }
  const names = [];
  for (const route of data?.['routes'] ?? []) {
    for (const point of Array.isArray(route?.['points']) ? route['points'] : []) {
      const name = String(point?.['s'] ?? '').trim();
      if (name.length === 0 || own.has(name.toLowerCase())) continue;
      if (!names.some((held) => held.toLowerCase() === name.toLowerCase())) {
        names.push(name);
      }
    }
  }
  return names;
}

/**
 * Turns the parsed Adamastor source into the demo set. `findPosition` resolves a route
 * point the source's own `systems` list does not hold; the entry part below reads it from
 * the EDSM name lookup at build time, so the map makes no network call for a shape.
 */
export function convertAdamastor(data, findPosition) {
  const table = ed3dCategories(data);
  const { systems } = ed3dRecords(data, table);
  const { lines, drops } = ed3dLines(data, table, systems, findPosition);
  return {
    source: SOURCE_URL,
    licence: LICENCE,
    categories: ed3dSetCategories(table, systems, lines),
    systems,
    spheres: [],
    lines,
    drops,
  };
}

/**
 * The two sphere lists of the multifaction source, with the category each one names and
 * the colour of that category. The source draws the shells with the same two material
 * tints the UIA source draws its permit shells with: `vec3(0.2, 0.7, 1.0)` for the
 * permit-locked list and `vec3(1.0, 0.75, 0.1)` for the permit-unlocked one. Here the
 * colour belongs to the category, and the sphere carries none of its own.
 */
export const MULTIFACTION_SPHERE_LISTS = [
  { key: 'pls', category: 'Permit Locked Sector', color: [51, 179, 255] },
  { key: 'puls', category: 'Permit Unlocked Sector', color: [255, 191, 26] },
];

/**
 * Turns the `permitSpheres` literal of the multifaction source into the sphere file the
 * demo entry imports.
 *
 * The records of that entry come from the Spansh dump at run time, and these spheres are a
 * static list in the source, so the build writes them and the page fetches only the
 * records. Each sphere names its category and carries no colour of its own, so it takes
 * the colour of that category.
 */
export function convertMultifactionSpheres(data) {
  const spheres = [];
  const used = [];
  for (const { key, category } of MULTIFACTION_SPHERE_LISTS) {
    for (const entry of data?.[key] ?? []) {
      const radius = numberOf(entry?.['radius']);
      const coords = Array.isArray(entry?.['coords']) ? entry['coords'] : [];
      if (radius === null || radius <= 0 || coords.length !== 3) continue;
      const position = coords.map((part) => numberOf(part));
      if (position.some((part) => part === null)) continue;
      const name = String(entry?.['name'] ?? '').trim();
      spheres.push({
        position,
        radius,
        ...(name.length > 0 ? { name } : {}),
        primaryCategory: category,
      });
      if (!used.includes(category)) used.push(category);
    }
  }
  const categories = MULTIFACTION_SPHERE_LISTS.filter((list) =>
    used.includes(list.category),
  ).map((list) => ({ name: list.category, color: list.color }));
  return { source: SOURCE_URL, licence: LICENCE, categories, spheres };
}

/**
 * The two files the UIA map builds itself from. `MapData-UIA.js` holds 16 systems and no
 * route: `formatHDs` fetches one waypoint table per UIA and one report file, and builds
 * every other marker and every line from them at run time.
 */
export const UIA_CSV_BASE =
  'https://raw.githubusercontent.com/canonn-science/CanonnED3D-Map/master/Source/data/csvCache/';

/** Where the waypoint table of one UIA comes from. */
export function uiaWaypointUrl(index) {
  return `${UIA_CSV_BASE}uia_waypoints_${index}.json`;
}

/** Where the hyperdiction reports come from. */
export const UIA_HYPERDICTION_URL = `${UIA_CSV_BASE}route_UIA_Hyperdictions.csv`;

/** How many waypoint tables the source asks for. `numberOfUIAs` of the source is 9. */
export const UIA_COUNT = 9;

/** The name of each UIA, in the order `finishMap` names them. */
export const UIA_NAMES = [
  'Taranis',
  'Leigong',
  'Indra',
  'Oya',
  'Cocijo',
  'Thor',
  'Raijin',
  'Hadad',
];

/** The colour `init()` gives every `UIA#N` category. */
export const UIA_CATEGORY_COLOUR = [153, 153, 0];

/** The category each `Estimate` letter of a waypoint table names. */
export const UIA_LETTER_CATEGORY = { N: '101', Y: '102', F: '103' };

/** The category of the mean direction line and of the point it reaches. */
export const UIA_DIRECTION_CATEGORY = '100';

/** How far the mean direction line runs from the first waypoint, in light years. */
export const UIA_DIRECTION_LENGTH_LY = 65000;

/**
 * The bounds of the galaxy model, read from the model file so the two cannot drift.
 * `real-systems` rejects a record outside them, so the direction line stops at them.
 */
export const MODEL_BOUNDS = galaxyModel.bounds;

/**
 * How far a ray runs from `start` along `direction` before it leaves the model bounds,
 * and never farther than `limit`.
 *
 * The source runs the mean direction line 65,000 light years out, which is past the edge
 * of the model on every axis. A record out there is one the map rejects, so the converter
 * stops the line where the model stops. The answer is the smallest of the three slab
 * crossings, which is the standard slab test of a box.
 */
export function rayInsideBounds(start, direction, limit, bounds = MODEL_BOUNDS) {
  let reach = limit;
  for (const [axis, key] of [
    [0, 'x'],
    [1, 'y'],
    [2, 'z'],
  ]) {
    const step = direction[axis];
    if (Math.abs(step) < 1e-12) continue;
    const near = (bounds[key][0] - start[axis]) / step;
    const far = (bounds[key][1] - start[axis]) / step;
    const exit = Math.max(near, far);
    if (exit < reach) reach = exit;
  }
  return Math.max(0, reach);
}

/** The category of every hyperdiction end, and of a hostile one. */
export const UIA_HYPERDICTION_CATEGORY = '299';
export const UIA_HOSTILE_CATEGORY = '300';

/** How near a waypoint a hyperdiction end must be to count as one of the UIAs. */
export const UIA_RANGE_LY = 24;

/**
 * Reads one waypoint table into rows keyed by the header line.
 *
 * The file is an array of arrays whose first line holds the headers. A table whose second
 * line names no system or names `Placeholder` is a table with no data, and the source
 * skips it; UIA#9 is such a table. The reader answers an empty list for it.
 */
export function uiaWaypointRows(table) {
  if (!Array.isArray(table) || table.length < 2) return [];
  const marker = String(table[1]?.[1] ?? '');
  if (marker.length < 1 || marker === 'Placeholder') return [];
  const headers = (table[0] ?? []).map((header) => String(header));
  const rows = [];
  for (let line = 1; line < table.length; line += 1) {
    const row = {};
    for (let column = 0; column < headers.length; column += 1) {
      row[headers[column]] = table[line]?.[column];
    }
    rows.push(row);
  }
  return rows;
}

/** One coordinate of an invented point, cut to the 1/32 step the game holds. */
function round(value) {
  return Math.round(value * 32) / 32;
}

/** The rows of a waypoint table that name a system, as the source tests for one. */
function uiaNamedRows(rows) {
  return rows.filter(
    (row) => String(row?.['System'] ?? '').replace(' ', '').length > 1,
  );
}

/**
 * The records and the routes of one waypoint table, in the ED3D shape the converter reads.
 *
 * The `Estimate` letter of a row gives the row its category and says which line it belongs
 * to. A run of one letter is one line, and a change of letter ends that line and starts
 * another. The joins are the source's own: a run of `F` takes the row before it as its
 * first point, a run of `Y` takes the row before it unless that row is `F`, and a run of
 * `N` does not take the row before it but is added to the open `F` or `Y` line as its last
 * point. A line of fewer than two points is dropped.
 *
 * The table also gives one line of the mean direction. It runs from the first waypoint
 * **against** the mean step of the table, which is back the way the anomaly came, and it
 * reaches 65,000 light years or the model bounds, whichever comes first. That far point is
 * a record of its own.
 *
 * The source also places one marker at the point the anomaly has reached, worked out from
 * the clock at the moment the page opens. A committed file cannot hold a value that follows
 * the clock, so this reader leaves that marker out.
 *
 * Each line takes a name of its own, which is the name of its category and the number of
 * its table, for example `UIA#3 Recorded Route`. `table` gives the category its name. The
 * eight tables give four line categories between them, so the category alone names no one
 * line.
 */
export function uiaWaypointSet(rows, index, table = new Map()) {
  const named = uiaNamedRows(rows);
  const systems = [];
  const routes = [];
  let route = { cat: ['101'], circle: false, points: [] };
  let fake = { cat: ['103'], circle: false, points: [] };
  let estimate = { cat: ['102'], circle: false, points: [] };
  let lastLetter = 'X';
  let lastRow = null;
  let category = UIA_LETTER_CATEGORY.N;
  let sum = [0, 0, 0];
  let lastCoords = null;
  let arrivalCoords = null;
  let first = null;

  for (const row of named) {
    const name = String(row['System']);
    const letter = String(row['Estimate'] ?? '');
    if (letter === 'N') {
      category = UIA_LETTER_CATEGORY.N;
      if (lastLetter !== 'N' && lastRow !== null) {
        if (route.points.length > 1) routes.push(route);
        route = { cat: ['101'], circle: false, points: [] };
        if (lastLetter === 'F') fake.points.push({ s: name });
        if (lastLetter === 'Y') estimate.points.push({ s: name });
      }
      route.points.push({ s: name });
    } else if (letter === 'F') {
      category = UIA_LETTER_CATEGORY.F;
      if (lastLetter !== 'F' && lastRow !== null) {
        if (fake.points.length > 1) routes.push(fake);
        fake = { cat: ['103'], circle: false, points: [] };
        fake.points.push({ s: String(lastRow['System']) });
      }
      fake.points.push({ s: name });
    } else if (letter === 'Y') {
      category = UIA_LETTER_CATEGORY.Y;
      if (lastLetter !== 'Y' && lastRow !== null) {
        if (estimate.points.length > 1) routes.push(estimate);
        estimate = { cat: ['102'], circle: false, points: [] };
        if (lastLetter === 'F') fake.points.push({ s: name });
        else estimate.points.push({ s: String(lastRow['System']) });
      }
      estimate.points.push({ s: name });
    }
    lastLetter = letter;
    lastRow = row;

    const coords = {
      x: numberOf(row['X']),
      y: numberOf(row['Y']),
      z: numberOf(row['Z']),
    };
    if (coords.x === null || coords.y === null || coords.z === null) continue;
    if (lastCoords !== null) {
      sum = [
        sum[0] + coords.x - lastCoords.x,
        sum[1] + coords.y - lastCoords.y,
        sum[2] + coords.z - lastCoords.z,
      ];
    }
    const record = { name, coords, cat: [category] };
    systems.push(record);
    if (first === null) first = record;
    lastCoords = arrivalCoords;
    arrivalCoords = coords;
  }

  if (fake.points.length > 1) routes.push(fake);
  if (route.points.length > 1) routes.push(route);
  if (estimate.points.length > 1) routes.push(estimate);

  // The source works the mean out as the sum over the row count and then makes it a unit
  // vector, so the row count changes nothing. `lastCoords` is null for a table of fewer
  // than three rows.
  //
  // The sum lags by one row, and the lag is the source's own: it writes
  // `lastcoords = arrivalcoords` before `arrivalcoords = <this row>`, so each step it adds
  // reaches over two rows and the first two rows add nothing. The sum comes to
  // `(c_n + c_n-1) - (c_1 + c_2)` and not to `c_n - c_1`. The two directions differ by 0.011
  // to 0.245 degrees over the eight tables of the source. This reader draws the source's
  // line, so it keeps the lag.
  //
  // The source also asks for two parseable times, because the line sits in the same block as
  // the clock marker this reader leaves out. Every table of the source meets both tests, so
  // the two give the same lines today.
  const length = Math.hypot(sum[0], sum[1], sum[2]);
  if (first !== null && lastCoords !== null && length > 0) {
    const direction = [-sum[0] / length, -sum[1] / length, -sum[2] / length];
    const start = [first.coords.x, first.coords.y, first.coords.z];
    const reach = rayInsideBounds(start, direction, UIA_DIRECTION_LENGTH_LY);
    const extension = {
      name: `extended mean direction of UIA#${index + 1}`,
      infos: `Galaxy-edge extension of UIA#${index + 1} mean direction`,
      coords: {
        x: round(start[0] + direction[0] * reach),
        y: round(start[1] + direction[1] * reach),
        z: round(start[2] + direction[2] * reach),
      },
      cat: [UIA_DIRECTION_CATEGORY],
    };
    systems.push(extension);
    routes.push({
      cat: [UIA_DIRECTION_CATEGORY],
      circle: false,
      points: [{ s: first.name }, { s: extension.name }],
    });
  }

  for (const built of routes) {
    const category = table.get(String(built.cat[0]));
    if (category === undefined) continue;
    built.name = `UIA#${index + 1} ${category.name}`;
  }

  return { systems, routes };
}

/**
 * Reads a CSV file into rows keyed by its header line.
 *
 * A field may be quoted, and a quoted field may hold a comma and a doubled quote. The
 * report file needs that: it writes every coordinate as a quoted number with a **comma**
 * as its decimal separator, so `"-1238,53125"` is one field and not two.
 */
export function parseCsv(text) {
  const lines = [];
  let row = [];
  let field = '';
  let quoted = false;
  const source = String(text ?? '').replace(/\r\n/g, '\n');
  for (let at = 0; at < source.length; at += 1) {
    const character = source[at];
    if (quoted) {
      if (character === '"') {
        if (source[at + 1] === '"') {
          field += '"';
          at += 1;
          continue;
        }
        quoted = false;
        continue;
      }
      field += character;
      continue;
    }
    if (character === '"') {
      quoted = true;
      continue;
    }
    if (character === ',') {
      row.push(field);
      field = '';
      continue;
    }
    if (character === '\n') {
      row.push(field);
      lines.push(row);
      row = [];
      field = '';
      continue;
    }
    field += character;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    lines.push(row);
  }
  if (lines.length < 2) return [];
  const headers = lines[0].map((header) => header.trim());
  const rows = [];
  for (const line of lines.slice(1)) {
    if (line.every((part) => part.trim().length === 0)) continue;
    const entry = {};
    for (let column = 0; column < headers.length; column += 1) {
      entry[headers[column]] = line[column] ?? '';
    }
    rows.push(entry);
  }
  return rows;
}

/**
 * Reads a coordinate of the report file, which writes 1.5 as `1,5`.
 *
 * The source reads the same field with `parseFloat`, which stops at the comma and drops the
 * whole fraction. A marker here therefore sits up to 0.96875 light years from the live one
 * on one axis and up to 1.607 light years from it in space, both measured over the report
 * file. The marker here is the one the report put there.
 */
function commaNumber(value) {
  return numberOf(
    String(value ?? '')
      .trim()
      .replace(',', '.'),
  );
}

/** The square of the distance between two points. */
function squaredDistance(one, other) {
  const dx = one[0] - other[0];
  const dy = one[1] - other[1];
  const dz = one[2] - other[2];
  return dx * dx + dy * dy + dz * dz;
}

/**
 * The records and the routes of the hyperdiction reports, in the ED3D shape.
 *
 * One row is one report. The reader keeps one row for each system and destination pair,
 * the first one it reads, and marks the pair hostile where any row of the pair reads
 * `Hostile` of `Y`.
 *
 * The source reads the flag of a repeated row only. It holds the first row of a pair and
 * then tests `hostile`, which no row carries; the column is `Hostile`. A pair that was
 * reported once and was hostile therefore never reaches the `Hostile` category on the live
 * map. This reader tests every row of the pair, its first one as well.
 *
 * A pair reaches the map only where one of its two ends is a waypoint of some table, or
 * lies within 24 light years of a waypoint whose `Estimate` is not `F`. The report file
 * covers the whole galaxy and the map is about the anomalies. The table the end matches
 * gives the pair its `UIA#N` category. Every other pair is dropped, and the drop is
 * reported.
 */
export function uiaHyperdictionSet(rows, tables) {
  const held = new Map();
  for (const row of rows ?? []) {
    const system = String(row?.['System'] ?? '').trim();
    const destination = String(row?.['Destination'] ?? '').trim();
    if (system.length === 0 || destination.length === 0) continue;
    const key = `${system}:::${destination}`;
    const first = held.get(key);
    if (first !== undefined) {
      if (String(row['Hostile'] ?? '').trim() === 'Y') first.hostile = true;
      continue;
    }
    held.set(key, { row, hostile: String(row['Hostile'] ?? '').trim() === 'Y' });
  }

  const names = tables.map(
    (rowsOfTable) =>
      new Set(rowsOfTable.map((row) => String(row?.['System'] ?? '').trim())),
  );
  const near = tables.map((rowsOfTable) =>
    rowsOfTable
      .filter((row) => String(row?.['Estimate'] ?? '') !== 'F')
      .map((row) => [numberOf(row['X']), numberOf(row['Y']), numberOf(row['Z'])])
      .filter((point) => point.every((part) => part !== null)),
  );
  const range = UIA_RANGE_LY * UIA_RANGE_LY;

  const systems = [];
  const routes = [];
  const drops = [];
  for (const [key, entry] of held) {
    const row = entry.row;
    const system = String(row['System']).trim();
    const destination = String(row['Destination']).trim();
    const start = [
      commaNumber(row['Sx']),
      commaNumber(row['Sy']),
      commaNumber(row['Sz']),
    ];
    const end = [
      commaNumber(row['Dx']),
      commaNumber(row['Dy']),
      commaNumber(row['Dz']),
    ];
    if (start.some((part) => part === null) || end.some((part) => part === null)) {
      drops.push({ route: key, point: null, reason: 'no-coordinates' });
      continue;
    }

    let index = -1;
    for (let table = 0; table < names.length && index < 0; table += 1) {
      if (names[table].has(system) || names[table].has(destination)) index = table;
    }
    for (let table = 0; table < near.length && index < 0; table += 1) {
      for (const point of near[table]) {
        if (
          squaredDistance(point, start) < range ||
          squaredDistance(point, end) < range
        ) {
          index = table;
          break;
        }
      }
    }
    if (index < 0) {
      drops.push({ route: key, point: null, reason: 'no-uia' });
      continue;
    }

    const cat = [`30${index + 1}`, UIA_HYPERDICTION_CATEGORY];
    if (entry.hostile) cat.push(UIA_HOSTILE_CATEGORY);
    const date = String(row['Timestamp'] ?? '')
      .trim()
      .slice(0, 10);
    const commander = String(row['Commander'] ?? '').trim();
    // `ed3dRecords` escapes every `infos` field it reads, and this record reaches it, so
    // the text goes in as it stands. A second escape here would draw a backslash.
    const infos =
      commander.length === 0
        ? ''
        : `CMDR ${commander} reported a hyperdiction from ${system} to ${destination}` +
          (date.length === 0 ? '.' : ` on ${date}.`);
    systems.push({
      name: system,
      coords: { x: start[0], y: start[1], z: start[2] },
      infos,
      cat: [...cat],
    });
    systems.push({
      name: destination,
      coords: { x: end[0], y: end[1], z: end[2] },
      infos,
      cat: [...cat],
    });
    routes.push({
      cat: [...cat],
      circle: false,
      // The line names the pair it draws. Its category names the UIA it was matched
      // against, which 983 lines share, so the category names no one line.
      name: `${system} to ${destination}`,
      points: [{ s: system }, { s: destination }],
    });
  }
  return { systems, routes, drops };
}

/**
 * The records the sphere lists carry at their centres. `formatHDs` pushes one marker for
 * each entry of `pls`, `puls` and `hd_soi`, in the category the list names. `g_soi` gets
 * none, because the source pushes none: its list carries `record: false`. The skip reads
 * that field and not `category`, which the `g_soi` list now carries for its spheres.
 */
export function ed3dSphereRecords(data, lists) {
  const systems = [];
  for (const { key, category, record } of lists) {
    if (category === null || record === false) continue;
    for (const entry of data?.[key] ?? []) {
      const name = String(entry?.['name'] ?? '').trim();
      const coords = Array.isArray(entry?.['coords']) ? entry['coords'] : [];
      if (name.length === 0 || coords.length !== 3) continue;
      const position = coords.map((part) => numberOf(part));
      if (position.some((part) => part === null)) continue;
      systems.push({
        name,
        coords: { x: position[0], y: position[1], z: position[2] },
        cat: [category],
      });
    }
  }
  return systems;
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

/**
 * The two ED3D sets the entry part writes after the three above. `extras` reads the files
 * the source fetches at run time; a set that fetches none answers an empty object.
 */
const ED3D_SETS = [
  {
    dump: 'MapData-UIA.js',
    url: UIA_SOURCE_URL,
    file: 'uia.json',
    extras: readUiaExtras,
    convert: (data, findPosition, extras) => convertUia(data, extras),
  },
  {
    dump: 'MapData-Adamastor.js',
    url: ADAMASTOR_SOURCE_URL,
    file: 'adamastor.json',
    extras: async () => ({}),
    convert: (data, findPosition) => convertAdamastor(data, findPosition),
  },
];

/**
 * The nine waypoint tables and the report file, read from `data/csvCache/` and fetched
 * into it when they are not there. The report file is 432 kB and the tables are 15 kB
 * each, so they stay out of the repository like every other dump.
 */
async function readUiaExtras(directory) {
  const cache = join(directory, 'csvCache');
  const waypointTables = [];
  for (let index = 1; index <= UIA_COUNT; index += 1) {
    const name = `uia_waypoints_${index}.json`;
    waypointTables.push(
      JSON.parse(await readSource(cache, name, uiaWaypointUrl(index))),
    );
  }
  const hyperdictions = parseCsv(
    await readSource(cache, 'route_UIA_Hyperdictions.csv', UIA_HYPERDICTION_URL),
  );
  return { waypointTables, hyperdictions };
}

/** Reads one text file from `data/`, and fetches it into `data/` when it is not there. */
async function readSource(directory, name, url) {
  const path = join(directory, name);
  try {
    return await readFile(path, 'utf8');
  } catch {
    process.stdout.write(`${name} is not in ${directory}. The script fetches it.\n`);
    const answer = await fetch(url);
    if (!answer.ok) throw new Error(`${name} did not download: ${answer.status}`);
    const text = await answer.text();
    await mkdir(directory, { recursive: true });
    await writeFile(path, text);
    return text;
  }
}

/**
 * The position of each name, read from the EDSM name lookup one name at a time. The
 * answers are held in `data/edsm-positions.json`, so a second run of the script asks for
 * a name it has already read. A name EDSM does not hold is kept as `null`, which is an
 * answer and not a miss.
 */
async function readEdsmPositions(directory, names) {
  const path = join(directory, 'edsm-positions.json');
  let held;
  try {
    held = JSON.parse(await readFile(path, 'utf8'));
  } catch {
    held = {};
  }
  let asked = 0;
  for (const name of names) {
    if (name in held) continue;
    const url = `${EDSM_SYSTEM_URL}?systemName=${encodeURIComponent(name)}&showCoordinates=1`;
    const answer = await fetch(url);
    if (!answer.ok) throw new Error(`EDSM refused ${name}: ${answer.status}`);
    const body = await answer.text();
    const parsed = body.trim().length === 0 ? null : JSON.parse(body);
    const coords = parsed?.['coords'] ?? null;
    held[name] = coords === null ? null : [coords['x'], coords['y'], coords['z']];
    asked += 1;
    // One call a second. The lookup is a courtesy of EDSM and the build asks for a few
    // dozen names.
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (asked > 0) {
    await mkdir(directory, { recursive: true });
    await writeFile(path, `${JSON.stringify(held, null, 2)}\n`);
    process.stdout.write(`the EDSM lookup answered ${asked} new names.\n`);
  }
  return held;
}

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

  for (const entry of ED3D_SETS) {
    const data = parseEd3dData(
      await readSource(join(root, 'data'), entry.dump, entry.url),
    );
    const names = ed3dRouteNames(data);
    const positions = await readEdsmPositions(join(root, 'data'), names);
    const findPosition = (name) => {
      const held = Object.entries(positions).find(
        ([key]) => key.toLowerCase() === name.toLowerCase(),
      );
      return held?.[1] ?? null;
    };
    const set = entry.convert(
      data,
      findPosition,
      await entry.extras(join(root, 'data')),
    );
    // The report file covers the whole galaxy, so one reason counts in the thousands. The
    // report names the count of each reason and the first three of it.
    const byReason = new Map();
    for (const drop of set.drops) {
      const held = byReason.get(drop.reason) ?? [];
      held.push(
        drop.point === null
          ? `route ${drop.route}`
          : `${drop.point} of route ${drop.route}`,
      );
      byReason.set(drop.reason, held);
    }
    for (const [reason, held] of byReason) {
      process.stdout.write(
        `${entry.file} dropped ${held.length} for ${reason}: ${held.slice(0, 3).join(', ')}` +
          (held.length > 3 ? ', ...\n' : '.\n'),
      );
    }
    // The drop report is for the person running the script, so it stays out of the file.
    const written = { ...set };
    delete written.drops;
    const text = `${JSON.stringify(written, null, 2)}\n`;
    await writeFile(join(root, 'demo-data', entry.file), text);
    const digest = createHash('sha256').update(text).digest('hex').slice(0, 12);
    const points = written.lines.reduce((sum, line) => sum + line.points.length, 0);
    process.stdout.write(
      `${entry.file} holds ${written.categories.length} categories, ` +
        `${written.systems.length} systems, ${written.spheres.length} spheres and ` +
        `${written.lines.length} lines of ${points} points, digest ${digest}.\n`,
    );
  }

  // The sixth set fetches its records in the page, and its spheres are a static list in
  // the source, so the build writes the spheres alone.
  const multifaction = convertMultifactionSpheres(
    parseEd3dData(
      await readSource(
        join(root, 'data'),
        'MapData-multifaction.js',
        MULTIFACTION_SOURCE_URL,
      ),
      'permitSpheres',
    ),
  );
  const sphereText = `${JSON.stringify(multifaction, null, 2)}\n`;
  await writeFile(join(root, 'demo-data', 'multifaction-spheres.json'), sphereText);
  const sphereDigest = createHash('sha256')
    .update(sphereText)
    .digest('hex')
    .slice(0, 12);
  process.stdout.write(
    `multifaction-spheres.json holds ${multifaction.categories.length} categories and ` +
      `${multifaction.spheres.length} spheres, digest ${sphereDigest}.\n`,
  );
}

// The entry part runs only when node starts this file. A test that imports a conversion
// above therefore reaches no network and writes no file.
if (argv[1] !== undefined && import.meta.url === `file://${argv[1]}`) {
  await main();
}
