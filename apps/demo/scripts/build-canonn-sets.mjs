// Builds one demo data set for each map of the Canonn ED3D map project. The Canonn page
// of the demo site draws them, one map at a time.
//
// The 49 `MapData-*.js` files of the Canonn source tree each draw one map.
// Each map fetches its own data when a browser opens it, so this build reads what each
// map reads: the object literal in the map file, the JSON dumps and the codex CSV files
// of the `canonn-downloads` bucket, the data files of the Canonn source tree and the
// query endpoints of the Canonn cloud functions.
//
// `api.canonn.tech` does not answer: the name resolves and the TCP connection to 443 does
// not complete. 14 maps read it. 11 of them read the same sites through the codex dumps of
// the bucket, which the codex index at `query/codex/ref?hierarchy=1` names, so the map
// table below reads those addresses instead.
//
// The build never runs a Canonn source file. `parseEd3dData` of `build-demo-systems.mjs`
// is a parser and not an evaluator, and the map table below carries what the parser
// cannot give: the addresses, the key rule of each source and the name and the colour
// each map gives each key.
//
// The 74 distinct sources hold about 63 MB. The cache on disk holds 273 MB, because the
// Spansh faction dump is stored once for each of the two selections that read it. They
// go in the ignored `apps/demo/data/canonn/` and
// the repository never holds one. The converted sets go in
// `apps/demo/demo-data/canonn/`, minified, and they are committed, so a build of the site
// and a run of the tests need no network.
//
// Run it with `pnpm build:canonn-data`.
import { gunzipSync } from 'node:zlib';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { argv } from 'node:process';
import { fileURLToPath } from 'node:url';
import { MAX_DATASETS, MAX_SYSTEMS } from './build-cycle-sets.mjs';
import {
  ed3dCategories,
  ed3dRecords,
  escapeMarkdown,
  parseCsv,
  parseEd3dData,
  plainTextFromHtml,
  UIA_NAMES,
} from './build-demo-systems.mjs';

export { MAX_DATASETS, MAX_SYSTEMS };

/** Where the Canonn downloads bucket serves the dumps and the codex files. */
export const BUCKET = 'https://storage.googleapis.com/canonn-downloads/';

/** Where the Canonn source tree serves its own files, which the maps read by path. */
export const RAW =
  'https://raw.githubusercontent.com/canonn-science/CanonnED3D-Map/master/Source/';

/** Where the Canonn cloud functions answer a query. */
export const QUERY = 'https://us-central1-canonn-api-236217.cloudfunctions.net/';

/** Where the file list of the Canonn source tree comes from. */
export const CONTENTS_URL =
  'https://api.github.com/repos/canonn-science/CanonnED3D-Map/contents/Source/data';

/** Where the records come from, which every set names. */
export const SOURCE_URL = 'https://github.com/canonn-science/CanonnED3D-Map';

/** The licence line a set of the Canonn source tree carries. */
export const LICENCE = 'MIT. The records come from the Canonn Research Group.';

/** The licence line a set of another project carries. */
export const LICENCE_OF = {
  'edastro.com':
    'The records come from the Galactic Exploration Catalog of edastro.com.',
  'downloads.spansh.co.uk': 'The records come from the Spansh faction dump.',
};

/** How many bytes one set holds, and how many the whole committed tree holds. */
export const MAX_SET_BYTES = 16_000_000;
export const MAX_TREE_BYTES = 50_000_000;

/**
 * The colour table of `MapData-Cloud.js`, in the order that file writes it. The Clouds
 * map gives the first key it reads the **second** entry, because it takes the index after
 * it adds the key, so `cloudNames` below reads the table the same way.
 */
export const CLOUD_PALETTE = [
  '3090C7',
  '7E587E',
  'E78A61',
  'FAEBD7',
  '46C7C7',
  'F0FFFF',
  '7F5A58',
  '81D8D0',
  '387C44',
  '4863A0',
  'D462FF',
  'D16587',
  'B1FB17',
  'E67451',
  '6CBB3C',
  '85BB65',
  '6D7B8D',
  '4AA02C',
  '646D7E',
  'C88141',
  'F9966B',
  'E42217',
  'FFF8DC',
  '8EEBEC',
  'C2DFFF',
  '954535',
  'B041FF',
  '000080',
  'E3319D',
  '437C17',
  '8D38C9',
  '6CC417',
  'B5EAAA',
  '8467D7',
  '50EBEC',
  'EAC117',
  'FFFF00',
  '1569C7',
  'E238EC',
  '0041C2',
  'CC6600',
  '7D0541',
  '98AFC7',
  'EDC9AF',
  '79BAEC',
  'E0FFFF',
  'EE9A4D',
  '357EC7',
  'C24641',
  '786D5F',
  '6AFB92',
  '98FF98',
  '5FFB17',
  'E38AAE',
  '7BCCB5',
  'E3E4FA',
  'FCDFFF',
  '3B9C9C',
  'B5A642',
  'CA226B',
  'FAAFBA',
  '7E3517',
  '3BB9FF',
  'B7CEEC',
  '728FCE',
  'C48189',
  'F62217',
  'FFE87C',
  '95B9C7',
  'C38EC7',
  '438D80',
  '59E817',
  'EBDDE2',
  '4B0082',
  'AF9B60',
  '616D7E',
  'C12267',
  '8AFB17',
  'B38481',
  'CCFB5D',
  'F88158',
  '00FF00',
  '2B547E',
  '0000A0',
  'D4A017',
  '151B54',
  'E8ADAA',
  'C6DEFF',
  '48CCCD',
  'CFECEC',
  '7D1B7E',
  'E56717',
  '6495ED',
  'FDD7E4',
  '7F525D',
  '7FE817',
  'C85A17',
  '667C26',
  '9E7BFF',
  'FBB917',
  'E77471',
  '254117',
  'EDDA74',
  'F433FF',
  'E9AB17',
  'ECC5C0',
  '2B60DE',
  'C48793',
  'F9A7B0',
  'FF2400',
  '737CA1',
  '57FEFF',
  'C35817',
  '38ACEC',
  '43C6DB',
  'BCC6CC',
  'C04000',
  'EBF4FA',
  '4E9258',
  'E41B17',
  'DEB887',
  'FFE5B4',
  'BDEDFF',
  '347C17',
  '461B7E',
  '566D7E',
  'FBF6D9',
  '78866B',
  'F535AA',
  'C2B280',
  '8A4117',
  'E55B3C',
  'C6AEC7',
  '347235',
  'FFFFCC',
  'ADA96E',
  'F2BB66',
  '4E387E',
  'B2C248',
  'E45E9D',
  'F88017',
  '5EFB6E',
  'FBB117',
  'C7A317',
  '89C35C',
  '827B60',
  'FBBBB9',
  'F0F8FF',
  '87F717',
  '7F38EC',
  'FF00FF',
  'C68E17',
  '3EA055',
  '6698FF',
  'C11B17',
  'D2B9D3',
  'E66C2C',
  'E799A3',
  'A0CFEC',
  'FDEEF4',
  '5CB3FF',
  'B4CFEC',
  '2B3856',
  'F6358A',
  'FFA62F',
  'F62817',
  '4E8975',
  '9AFEFF',
  '157DEC',
  '6F4E37',
  '9CB071',
  '52D017',
  '87AFC7',
  'C3FDB8',
  '7A5DC7',
  'E7A1B0',
  '57E964',
  '008080',
  'BCE954',
  '368BC1',
  '5E7D7E',
  '659EC7',
  '306754',
  'FFEBCD',
  'F660AB',
  '347C2C',
  'E4287C',
  '990012',
  'B87333',
  '348781',
  '614051',
  'FFFFC2',
  '307D7E',
  '64E986',
  '15317E',
  '0020C2',
  'FFF8C6',
  '306EFF',
  'C25A7C',
  '8E35EF',
  '82CAFF',
  '657383',
  'C5908E',
  'CD7F32',
  'FFDB58',
  '00FFFF',
  '827839',
  'E6A9EC',
  'AFDCEC',
  'B93B8F',
  '77BFC7',
  '6AA121',
  'E0B0FF',
  '92C7C7',
  '9F000F',
  'F9B7FF',
  'FFF5EE',
  'DC381F',
  'F7E7CE',
  '842DCE',
  'C12283',
  '348017',
  '56A5EC',
  '151B8D',
  '736AFF',
  '99C68E',
  '1F45FC',
  '4C787E',
  'C19A6B',
  '2554C7',
  'FAAFBE',
  'A1C935',
  'C45AEC',
  'C34A2C',
  'ADDFFF',
  'F778A1',
  '9DC209',
  '6A287E',
  'C58917',
  '7E354D',
  '893BFF',
  '8C001A',
  '54C571',
  'C8B560',
  '7FFFD4',
  '810541',
  '7F4E52',
  '3EA99F',
  'CCFFFF',
  '4EE2EC',
  '571B7E',
  '493D26',
  'E55451',
  'E9CFEC',
  '82CAFA',
  'F70D1A',
  '617C58',
  '6C2DC7',
  'FFD801',
  '7F5217',
  'FF8040',
  '483C32',
  'FF0000',
  'E18B6B',
  '583759',
  '342D7E',
  'AF7817',
  '7D0552',
  'FFF380',
  'F87431',
  '806517',
  '43BFC7',
  '848b79',
  'F75D59',
  'B048B5',
  '78C7C7',
  '488AC7',
  'FF7F50',
  '6960EC',
  '5E5A80',
  'F52887',
  '966F33',
  '800517',
  'E2A76F',
  'C9BE62',
  'FC6C85',
  'EDE275',
  'E8A317',
  'F3E5AB',
  'FDD017',
  '728C00',
  'FFDFDD',
  'C25283',
  '8BB381',
  '93FFE8',
  '7DFDFE',
  'A74AC7',
  '7E3817',
  'F87217',
  '9172EC',
  'F5F5DC',
  '41A317',
  'C47451',
  'C12869',
  '4CC552',
  'C8A2C8',
  '4CC417',
  'FFCBA4',
  '7F462C',
  'C36241',
  'E56E94',
  '1589FF',
  '835C3B',
  'A23BEC',
  '2B65EC',
  'ECE5B6',
];

/** The colour table of `MapData-GEC.js`, in the order that file writes it. */
export const GEC_PALETTE = [
  'f5a142',
  '42b0f5',
  '7E587E',
  'E78A61',
  'B1FB17',
  'E67451',
  '6CBB3C',
  '85BB65',
  '4AA02C',
  'EAC117',
  'FFFF00',
  'E238EC',
  'CC6600',
  '7D0541',
  '98AFC7',
  'EDC9AF',
  'E0FFFF',
  'EE9A4D',
  '357EC7',
  'C24641',
  '786D5F',
  '6AFB92',
  '98FF98',
  '5FFB17',
  'E38AAE',
  '7BCCB5',
  'E3E4FA',
  'FCDFFF',
  '3B9C9C',
  'B5A642',
  'CA226B',
  'FAAFBA',
  '7E3517',
  '3BB9FF',
  'B7CEEC',
  '728FCE',
  'C48189',
  'F62217',
  'FFE87C',
  '95B9C7',
  'C38EC7',
  '438D80',
  '59E817',
  'EBDDE2',
  '4B0082',
  'AF9B60',
  '616D7E',
  'C12267',
  '8AFB17',
  'B38481',
  'CCFB5D',
  'F88158',
  '00FF00',
  '2B547E',
  '0000A0',
  'D4A017',
  '151B54',
  'E8ADAA',
  'C6DEFF',
  '48CCCD',
  'CFECEC',
  '7D1B7E',
  'E56717',
  '6495ED',
  'FDD7E4',
  '7F525D',
  '7FE817',
  'C85A17',
  '667C26',
  '9E7BFF',
  'FBB917',
  'E77471',
  '254117',
  'EDDA74',
  'F433FF',
  'E9AB17',
  'ECC5C0',
  '2B60DE',
  'C48793',
  'F9A7B0',
  'FF2400',
  '737CA1',
  '57FEFF',
  'C35817',
  '38ACEC',
  '43C6DB',
  'BCC6CC',
  'C04000',
  'EBF4FA',
  '4E9258',
  'E41B17',
  'DEB887',
  'FFE5B4',
  'BDEDFF',
  '347C17',
  '461B7E',
  '566D7E',
  'FBF6D9',
  '78866B',
  'F535AA',
  'C2B280',
  '8A4117',
  'E55B3C',
  'C6AEC7',
  '347235',
  'FFFFCC',
  'ADA96E',
  'F2BB66',
  '4E387E',
  'B2C248',
  'E45E9D',
  'F88017',
  '5EFB6E',
  'FBB117',
  'C7A317',
  '89C35C',
  '827B60',
  'FBBBB9',
  'F0F8FF',
  '87F717',
  '7F38EC',
  'FF00FF',
  'C68E17',
  '3EA055',
  '6698FF',
  'C11B17',
  'D2B9D3',
  'E66C2C',
  'E799A3',
  'A0CFEC',
  'FDEEF4',
  '5CB3FF',
  'B4CFEC',
  '2B3856',
  'F6358A',
  'FFA62F',
  'F62817',
  '4E8975',
  '9AFEFF',
  '157DEC',
  '6F4E37',
  '9CB071',
  '52D017',
  '87AFC7',
  'C3FDB8',
  '7A5DC7',
  'E7A1B0',
  '57E964',
  '008080',
  'BCE954',
  '368BC1',
  '5E7D7E',
  '659EC7',
  '306754',
  'FFEBCD',
  'F660AB',
  '347C2C',
  'E4287C',
  '990012',
  'B87333',
  '348781',
  '614051',
  'FFFFC2',
  '307D7E',
  '64E986',
  '15317E',
  '0020C2',
  'FFF8C6',
  '306EFF',
  'C25A7C',
  '8E35EF',
  '82CAFF',
  '657383',
  'C5908E',
  'CD7F32',
  'FFDB58',
  '00FFFF',
  '827839',
  'E6A9EC',
  'AFDCEC',
  'B93B8F',
  '77BFC7',
  '6AA121',
  'E0B0FF',
  '92C7C7',
  '9F000F',
  'F9B7FF',
  'FFF5EE',
  'DC381F',
  'F7E7CE',
  '842DCE',
  'C12283',
  '348017',
  '56A5EC',
  '151B8D',
  '736AFF',
  '99C68E',
  '1F45FC',
  '4C787E',
  'C19A6B',
  '2554C7',
  'FAAFBE',
  'A1C935',
  'C45AEC',
  'C34A2C',
  'ADDFFF',
  'F778A1',
  '9DC209',
  '6A287E',
  'C58917',
  '7E354D',
  '893BFF',
  '8C001A',
  '54C571',
  'C8B560',
  '7FFFD4',
  '810541',
  '7F4E52',
  '3EA99F',
  'CCFFFF',
  '4EE2EC',
  '571B7E',
  '493D26',
  'E55451',
  'E9CFEC',
  '82CAFA',
  'F70D1A',
  '617C58',
  '6C2DC7',
  'FFD801',
  '7F5217',
  'FF8040',
  '483C32',
  'FF0000',
  'E18B6B',
  '583759',
  '342D7E',
  'AF7817',
  '7D0552',
  'FFF380',
  'F87431',
  '806517',
  '43BFC7',
  '848b79',
  'F75D59',
  'B048B5',
  '78C7C7',
  '488AC7',
  'FF7F50',
  '6960EC',
  '5E5A80',
  'F52887',
  '966F33',
  '800517',
  'E2A76F',
  'C9BE62',
  'FC6C85',
  'EDE275',
  'E8A317',
  'F3E5AB',
  'FDD017',
  '728C00',
  'FFDFDD',
  'C25283',
  '8BB381',
  '93FFE8',
  '7DFDFE',
  'A74AC7',
  '7E3817',
  'F87217',
  '9172EC',
  'F5F5DC',
  '41A317',
  'C47451',
  'C12869',
  '4CC552',
  'C8A2C8',
  '4CC417',
  'FFCBA4',
  '7F462C',
  'C36241',
  'E56E94',
  '1589FF',
  '835C3B',
  'A23BEC',
  '2B65EC',
  'ECE5B6',
];

/** The five reference systems of `MapData-Hyperdiction.js` and the colour of each. */
export const HYPERDICTION_REFERENCES = [
  {
    key: 'Merope',
    name: 'Merope',
    colour: 'F65314',
    x: -78.59375,
    y: -149.625,
    z: -340.53125,
  },
  { key: 'Sol', name: 'Sol', colour: '7CBB00', x: 0, y: 0, z: 0 },
  {
    key: 'Witchhead',
    name: 'Witchhead',
    colour: '00A1F1',
    x: 355.3125,
    y: -425.96875,
    z: -723.03125,
  },
  {
    key: 'Coalsack',
    name: 'Coalsack',
    colour: 'FFBB00',
    x: 432.625,
    y: 2.53125,
    z: 288.6875,
  },
  {
    key: 'California Sector',
    name: 'California Sector',
    colour: '00FFFF',
    x: -319.8125,
    y: -216.75,
    z: -913.46875,
  },
];

/** The number a source holds as a string, or `null` when it is not a number. */
function numberOf(value) {
  const text = String(value ?? '')
    .replace(/,/g, '')
    .trim();
  if (text.length === 0) return null;
  const number = Number.parseFloat(text);
  return Number.isFinite(number) ? number : null;
}

/** The position of one row, read from the three fields the source names. */
function coordsOf(row, fields = ['x', 'y', 'z']) {
  const x = numberOf(row?.[fields[0]]);
  const y = numberOf(row?.[fields[1]]);
  const z = numberOf(row?.[fields[2]]);
  if (x === null || y === null || z === null) return null;
  return { x, y, z };
}

/** The red, green and blue of a `RRGGBB` colour of a Canonn source. */
export function rgbOf(hex) {
  const text = String(hex ?? '').replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(text)) return [160, 160, 160];
  return [
    Number.parseInt(text.slice(0, 2), 16),
    Number.parseInt(text.slice(2, 4), 16),
    Number.parseInt(text.slice(4, 6), 16),
  ];
}

/**
 * A stable colour for one key of a map that gives its table no fixed colour.
 *
 * 17 of the 49 map files build their colour table with `randomColor()`, which is a
 * different value on each page load, so there is no colour of the map's to read. The
 * reading below is the map id and the key alone, so a second run of the build writes the
 * same colour and a key keeps its colour when another key is added beside it.
 */
export function stableColour(seed) {
  let hash = 2166136261;
  for (const character of String(seed)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  // A full turn of hue at one saturation and one lightness, so every colour of the build
  // reads as one family and none of them is dark enough to lose against the background.
  const hue = (hash % 360) / 60;
  const chroma = 0.55 * 0.85;
  const second = chroma * (1 - Math.abs((hue % 2) - 1));
  const parts =
    hue < 1
      ? [chroma, second, 0]
      : hue < 2
        ? [second, chroma, 0]
        : hue < 3
          ? [0, chroma, second]
          : hue < 4
            ? [0, second, chroma]
            : hue < 5
              ? [second, 0, chroma]
              : [chroma, 0, second];
  const base = 0.85 - chroma;
  return parts.map((part) => Math.round((part + base) * 255));
}

/** One row reading: the system, its position, the keys of its map's reader and the text. */
function reading(name, coords, keys, description = '') {
  const text = String(name ?? '').trim();
  if (text.length === 0 || coords === null) return null;
  return { name: text, coords, keys: keys.filter((key) => key !== null), description };
}

/** The key of one value against a list of the keys a map names, or the fallback. */
function keyIn(value, keys, fallback) {
  const key = String(value ?? '').trim();
  return keys.includes(key) ? key : fallback;
}

/** The plain text of one HTML field of a source. */
function textOf(html) {
  return escapeMarkdown(plainTextFromHtml(html));
}

/** The rows of a codex CSV file, which holds no header and no quoted field. */
export function codexRows(text) {
  const rows = [];
  for (const line of String(text ?? '').split('\n')) {
    if (line.trim().length === 0) continue;
    rows.push(line.split(','));
  }
  return rows;
}

/**
 * The reader of each source shape, by the name the map table gives it.
 *
 * A reader belongs to the **source** and not to the map, which is what holds the rule
 * that a shared source is keyed once: two maps that name one source name one reader, and
 * `readMapTable` fails where they do not. What differs between two maps is the name and
 * the colour each one gives a key, which the map table carries and the manifest holds.
 *
 * `parse` says how the file is read. `rows` gives the rows of the parsed file, and `row`
 * gives the reading of one row: the system, its position, its keys and the text the
 * source states. Text a map composes is not a reading.
 */
export const READERS = {
  /**
   * The object literal of one `MapData-*.js` file, which five maps hold their records in.
   * `parseEd3dData` reads the literal and runs no statement of the file, and the file names
   * its own categories, so a literal source needs no key table of the build's.
   */
  literal: {
    parse: 'literal',
    records: (text) => {
      const data = parseEd3dData(text);
      const table = ed3dCategories(data);
      const { systems } = ed3dRecords(data, table);
      const names = new Map();
      for (const category of table.values()) names.set(category.name, category.color);
      return {
        records: systems.map((record) => ({
          name: record.name,
          coords: record.coords,
          keys: record.categories,
          ...(record.description === undefined
            ? {}
            : { description: record.description }),
        })),
        categories: Object.fromEntries(
          [...names].map(([name, color]) => [name, { name, color }]),
        ),
      };
    },
  },
  /**
   * One waypoint table of the UIA map. The file is a list of rows and the first row is the
   * header, so the reader reads the row by its column number. One file is one UIA, so a
   * record carries no key and the manifest names the file after the UIA.
   */
  uiaWaypoints: {
    parse: 'json',
    rows: (table) => (Array.isArray(table) ? table.slice(1) : []),
    row: (row) => reading(row[1], coordsOf({ x: row[2], y: row[3], z: row[4] }), []),
  },
  /**
   * The hyperdiction table of the UIA map. The file writes a number with a comma for the
   * decimal point, so the reader reads the number itself. One row names two systems, and
   * the map draws both.
   */
  uiaHyperdictions: {
    parse: 'csv',
    rows: (rows) => {
      const found = [];
      for (const row of rows) {
        // The column holds Y, N or nothing, and only a Y is a hostile hyperdiction.
        const key =
          String(row['Hostile'] ?? '')
            .trim()
            .toUpperCase() === 'Y'
            ? 'Hostile'
            : 'Hyperdiction';
        found.push({
          name: row['System'],
          x: row['Sx'],
          y: row['Sy'],
          z: row['Sz'],
          key,
        });
        found.push({
          name: row['Destination'],
          x: row['Dx'],
          y: row['Dy'],
          z: row['Dz'],
          key,
        });
      }
      return found;
    },
    row: (row) => {
      const point = (value) => numberOf(String(value ?? '').replace(',', '.'));
      const x = point(row.x);
      const y = point(row.y);
      const z = point(row.z);
      if (x === null || y === null || z === null) return null;
      return reading(row.name, { x, y, z }, [row.key]);
    },
  },
  /** The Guardian Ruins dump, keyed on the site type as `MapData-GR.js` keys it. */
  ruins: {
    parse: 'json',
    row: (row) =>
      reading(row['System Name'], coordsOf(row), [
        keyIn(row['Site Type'], ['Alpha', 'Beta', 'Gamma'], 'Unknown'),
      ]),
  },
  /** The Guardian Structures dump, keyed on the site type as `MapData-GS.js` keys it. */
  structures: {
    parse: 'json',
    row: (row) =>
      reading(row['System Name'], coordsOf(row), [
        keyIn(
          row['Site Type'],
          [
            'Lacrosse',
            'Crossroads',
            'Fistbump',
            'Hammerbot',
            'Bear',
            'Bowl',
            'Turtle',
            'Robolobster',
            'Squid',
            'Stickyhand',
          ],
          'Unknown',
        ),
      ]),
  },
  /** The Guardian Beacons dump. Every row of it is one beacon. */
  beacons: {
    parse: 'json',
    row: (row) => reading(row['System Name'], coordsOf(row), ['Beacon']),
  },
  /**
   * The Lagrange cloud dump, keyed as `MapData-Cloud.js` keys it: the `description`
   * column is the key of a `Lagrange Cloud` row, which the map renames from
   * `Storm Cloud`, and of an `FSS Signals` row; every other row takes the `category`
   * value as its key. 24 values of one column become 35 keys.
   */
  clouds: {
    parse: 'json',
    row: (row) => {
      const category =
        String(row['category'] ?? '').trim() === 'Storm Cloud'
          ? 'Lagrange Cloud'
          : String(row['category'] ?? '').trim();
      const description = String(row['description'] ?? '').trim();
      const key =
        category === 'Lagrange Cloud' || category === 'FSS Signals'
          ? description
          : category;
      return reading(row['system'], coordsOf(row), [key], description);
    },
  },
  /**
   * The landscape signal dump, keyed as `MapData-landscape.js` keys it: the survey state
   * first, and the boxel the system name starts with after it.
   */
  landscape: {
    parse: 'json',
    row: (row) => {
      const name = String(row['System'] ?? '').trim();
      const visited = String(row['Visited'] ?? '')
        .trim()
        .toLowerCase();
      const commanders = String(row['CMDRS'] ?? '').trim();
      const keys = [
        commanders.length > 0
          ? 'Surveyed'
          : visited === 'visited'
            ? 'Visited'
            : 'Unvisited',
      ];
      for (const boxel of ['Stuemeae UY-S', 'Stuemeae KM-W', 'Stuemeae FG-Y']) {
        if (name.startsWith(boxel)) keys.push(boxel);
      }
      return reading(name, coordsOf(row, ['X', 'Y', 'Z']), keys);
    },
  },
  /** The megaship dump. The map names each point after the ship and its system. */
  megaships: {
    parse: 'json',
    row: (row) =>
      reading(
        `${String(row['POI Name'] ?? '').trim()} (${String(row['System'] ?? '').trim()})`,
        coordsOf(row, ['X', 'Y', 'Z']),
        ['Megaship'],
      ),
  },
  /** The generation ship dump, which the map reads as the megaship dump. */
  generationShips: {
    parse: 'json',
    row: (row) =>
      reading(
        `${String(row['POI Name'] ?? '').trim()} (${String(row['System'] ?? '').trim()})`,
        coordsOf(row, ['X', 'Y', 'Z']),
        ['Generation Ship'],
      ),
  },
  /** The Galnet relay dump, keyed on the station name as `MapData-Galnet.js` keys it. */
  galnet: {
    parse: 'json',
    row: (row) => {
      const station = String(row['Station'] ?? '').trim();
      const system = String(row['System'] ?? '').trim();
      return reading(`${station} (${system})`, coordsOf(row, ['X', 'Y', 'Z']), [
        station === 'Galnet News Digest' ? 'Galnet News Digest' : 'All Names',
      ]);
    },
  },
  /** The Operation Ida repair dump. The map names each point after the station. */
  idaRepairs: {
    parse: 'json',
    row: (row) =>
      reading(
        `${String(row['Station'] ?? '').trim()} (${String(row['System'] ?? '').trim()})`,
        coordsOf(row),
        ['Repairs'],
        String(row['Area'] ?? '').trim(),
      ),
  },
  /** The Operation Ida colonisation dump. */
  idaColonisation: {
    parse: 'json',
    row: (row) =>
      reading(
        row['System'],
        coordsOf(row),
        ['Colonisation'],
        String(row['Station Type'] ?? '').trim(),
      ),
  },
  /**
   * The hyperdiction dump, keyed as `MapData-Hyperdiction.js` keys it: the reference
   * system the record is nearest to, and the year, joined by a space. The map keeps the
   * latest year of each system and drops the rest, and this reader does the same.
   */
  hyperdictions: {
    parse: 'json',
    rows: (dump) => {
      const latest = new Map();
      for (const row of Array.isArray(dump) ? dump : []) {
        const name = String(row['system'] ?? '').trim();
        if (name.length === 0) continue;
        const held = latest.get(name);
        if (held === undefined || Number(row['year']) > Number(held['year'])) {
          latest.set(name, row);
        }
      }
      return [...latest.values()];
    },
    row: (row) => {
      const coords = coordsOf(row);
      if (coords === null) return null;
      let nearest = HYPERDICTION_REFERENCES[0];
      let best = Number.POSITIVE_INFINITY;
      for (const reference of HYPERDICTION_REFERENCES) {
        const distance =
          (coords.x - reference.x) ** 2 +
          (coords.y - reference.y) ** 2 +
          (coords.z - reference.z) ** 2;
        if (distance < best) {
          best = distance;
          nearest = reference;
        }
      }
      return reading(row['system'], coords, [`${nearest.key} ${row['year']}`]);
    },
  },
  /**
   * One codex CSV file of the bucket. The file is one codex entry, so a record carries
   * **no key and no description**: the manifest names the entry, and a key or a text on
   * every line would repeat one string about 260,000 times and take the codex sets from
   * 22.9 MB to about 45 MB. The map's own reader keeps the first row of a system.
   */
  codex: {
    parse: 'text',
    rows: (text) => codexRows(text),
    row: (row) => reading(row[0], coordsOf({ x: row[1], y: row[2], z: row[3] }), []),
  },
  /**
   * The Thargoid surface site file of the Canonn source tree, keyed on the leading digit
   * of the `New Type/Sub` column as `MapData-TS.js` and `MapData-Thargoids.js` key it.
   */
  surfaceSites: {
    parse: 'json',
    row: (row) => {
      const found = /^\s*(\d)/.exec(String(row['New Type/Sub'] ?? ''));
      const digit = found === null ? null : Number(found[1]);
      const key =
        digit !== null && digit >= 0 && digit <= 6 ? String(digit) : 'Unknown';
      const parts = [];
      if (String(row['Planet'] ?? '').trim().length > 0)
        parts.push(String(row['Planet']).trim());
      if (String(row['Active'] ?? '').trim().length > 0)
        parts.push(String(row['Active']).trim());
      return reading(row['System'], coordsOf(row), [key], parts.join(', '));
    },
  },
  /** The Non-Human Signal Source query, keyed on each threat level the system holds. */
  nhss: {
    parse: 'json',
    row: (row) => {
      const keys = [];
      for (let threat = 0; threat <= 9; threat += 1) {
        if (Number(row[`threat_${threat}`]) > 0) keys.push(String(threat));
      }
      const bubble = String(row['bubble'] ?? '').trim();
      if (bubble.length > 0) keys.push(bubble);
      return reading(row['systemName'], coordsOf(row), keys);
    },
  },
  /** The Galactic Exploration Catalog of edastro.com, keyed on the entry type. */
  gec: {
    parse: 'json',
    row: (row) => {
      const coords = Array.isArray(row['coordinates']) ? row['coordinates'] : [];
      return reading(
        `${String(row['name'] ?? '').trim()} (${String(row['galMapSearch'] ?? '').trim()})`,
        coordsOf({ x: coords[0], y: coords[1], z: coords[2] }),
        [String(row['type'] ?? '').trim() || 'Other'],
        String(row['summary'] ?? '').trim(),
      );
    },
  },
  /** The prison ship file of the Canonn source tree. One row is a prison and a jump. */
  prisons: {
    parse: 'json',
    rows: (dump) => {
      const rows = [];
      for (const entry of Array.isArray(dump) ? dump : []) {
        rows.push({ ...entry['jump'], key: 'Stations' });
        rows.push({ ...entry['prison'], key: 'Prisons' });
      }
      return rows;
    },
    row: (row) => reading(row['name'], coordsOf(row['coords'] ?? {}), [row['key']]),
  },
  /** The Gnosis route file of the Canonn source tree, keyed on the system name. */
  gnosis: {
    parse: 'json',
    row: (row) => {
      const name = String(row['System'] ?? '').trim();
      const named = [
        'Varati',
        'HIP 17862',
        'Pleiades Sector PN-T b3-0',
        'Synuefe PR-L b40-1',
        'HIP 18120',
        'IC 2391 Sector CQ-Y c16',
        'Kappa-1 Volantis',
      ];
      return reading(
        name,
        coordsOf(row),
        [named.includes(name) ? name : 'Other System'],
        String(row['Dates Visited'] ?? '').trim(),
      );
    },
  },
  /** The Canonn Challenge file, keyed on the start system as `MapData-Challenge.js` does. */
  expedition: {
    parse: 'csv',
    row: (row) => {
      const name = String(row['name'] ?? '').trim();
      return reading(
        name,
        coordsOf(row, ['pos_x', 'pos_y', 'pos_z']),
        [name === 'Varati' ? 'Varati' : 'Waypoint'],
        textOf(row['infos']),
      );
    },
  },
  /**
   * The listening post file. One row names a hint system, up to two linked systems and
   * the system the hint points to, and `MapData-LP.js` draws each of them.
   */
  listeningPosts: {
    parse: 'csv',
    rows: (rows) => {
      const found = [];
      for (const row of rows) {
        const discovery = String(row['Related discovery'] ?? '').trim();
        for (const [column, prefix] of [
          ['System', 'link0'],
          ['Linked system 1', 'link1'],
          ['Linked system 2', 'link2'],
        ]) {
          found.push({ ...row, name: row[column], prefix, key: 'Hint', discovery });
        }
        found.push({
          ...row,
          name: row['Points to system'],
          prefix: 'target',
          key: 'Discovery',
          discovery,
        });
      }
      return found;
    },
    row: (row) =>
      reading(
        row['name'],
        coordsOf(row, [
          `${row['prefix']}_X`,
          `${row['prefix']}_Y`,
          `${row['prefix']}_Z`,
        ]),
        [row['key']],
        row['discovery'],
      ),
  },
  /** The Voyager probe file. The map draws Sol and one point per probe. */
  voyager: {
    parse: 'csv',
    row: (row) => {
      const name = String(row['systemName'] ?? '').trim();
      return reading(
        name,
        coordsOf(row),
        [name === 'Sol' ? 'Sol' : 'Voyager System'],
        String(row['information'] ?? '').trim(),
      );
    },
  },
  /**
   * The permit locked region file, keyed on the region the system name states, as
   * `MapData-Permit.js` and `MapData-Cartographics.js` both key it.
   */
  permitRegions: {
    parse: 'csv',
    row: (row) => {
      const name = String(row['name'] ?? '').trim();
      const parts = name.split(' ');
      let key = null;
      if (parts[0] === 'Col') key = String(1000 + Number.parseInt(parts[1], 10));
      if (parts[0] === 'Cone') key = '2000';
      if (parts[0] === 'Horsehead') key = '3000';
      if (parts[0] === 'M41') key = '4000';
      if (parts[0] === 'NGC') key = String(5000 + Number.parseInt(parts[1], 10));
      if (key === null) return null;
      return reading(name, coordsOf(row, ['pos_x', 'pos_y', 'pos_z']), [key]);
    },
  },
  /** The Adamastor route file. Every row of it is one listening post. */
  adamastor: {
    parse: 'csv',
    row: (row) =>
      reading(
        row['name'],
        coordsOf(row, ['pos_x', 'pos_y', 'pos_z']),
        ['Adamastor'],
        textOf(row['infos']),
      ),
  },
  /** The Hesperus route file, which the Adamastor map draws beside its own. */
  hesperus: {
    parse: 'csv',
    row: (row) =>
      reading(
        row['name'],
        coordsOf(row, ['pos_x', 'pos_y', 'pos_z']),
        ['Hesperus'],
        textOf(row['infos']),
      ),
  },
  /** The Thargoid structure export, keyed on the state column of the survey. */
  thargoidSurvey: {
    parse: 'csv',
    row: (row) =>
      reading(
        row['system'],
        coordsOf(row, ['galacticX', 'galacticY', 'galacticZ']),
        [String(row['status'] ?? '').trim() === '✔' ? 'Active' : 'Inactive'],
        String(row['planet'] ?? '').trim(),
      ),
  },
  /**
   * The Spansh faction dump, keyed on the faction and on whether it controls the system.
   * The dump holds every faction of the galaxy, so the map table names the factions its
   * map draws and the build writes those records alone.
   */
  factions: {
    parse: 'json',
    rows: (dump, select) => {
      const wanted = new Set(select.map((name) => name.toLowerCase()));
      const rows = [];
      for (const faction of Array.isArray(dump) ? dump : []) {
        const name = String(faction?.['name'] ?? '');
        if (!wanted.has(name.toLowerCase())) continue;
        for (const system of faction['systems'] ?? []) {
          rows.push({ ...system, faction: name });
        }
      }
      return rows;
    },
    row: (row) =>
      reading(row['systemName'], coordsOf(row['coords'] ?? {}), [
        `${row['faction']} ${row['isControllingFaction'] === true ? 'Controlled' : 'Present'}`,
      ]),
  },
};

/** One source of the bucket, of the Canonn source tree or of another project. */
function source(path, reader, names = {}, select) {
  return { path, reader, names, ...(select === undefined ? {} : { select }) };
}

/**
 * One codex file of the bucket under the name one map gives it. A codex record carries no
 * key, so the whole file is one category and the key of its table is the empty string.
 */
function codexSource(file, name, colour = null) {
  return source(`${BUCKET}${file}`, 'codex', { '': { name, colour } });
}

/**
 * An address that does not answer, with the reason it does not. The build reads nothing
 * from it, and the drop it prints names the map, the reason and the address.
 */
function dead(path, why, basis) {
  return {
    path,
    reader: null,
    names: {},
    why,
    ...(basis === undefined ? {} : { basis }),
  };
}

/** A key table from a list of names, where the key and the name are the same word. */
function sameNames(names, colours = null) {
  const table = {};
  for (const [index, name] of names.entries()) {
    table[name] = { name, colour: colours === null ? null : colours[index] };
  }
  return table;
}

/** The ten Guardian structure types, which three maps name the same way. */
const STRUCTURE_TYPES = [
  'Lacrosse',
  'Crossroads',
  'Fistbump',
  'Hammerbot',
  'Bear',
  'Bowl',
  'Turtle',
  'Robolobster',
  'Squid',
  'Stickyhand',
];

/** The eight brain tree files of the bucket, under the name each map gives them. */
function brainTrees(names) {
  const ids = [
    '2100201',
    '2100202',
    '2100203',
    '2100204',
    '2100205',
    '2100206',
    '2100207',
    '2100208',
  ];
  return ids.map((id, index) => codexSource(`dumpr/Biology/${id}.csv`, names[index]));
}

/** The five barnacle files of the bucket, under the name each map gives them. */
function barnacles(names) {
  const ids = ['2100101', '2100102', '2100103', '2100104', '2100105'];
  return ids.map((id, index) => codexSource(`dumpr/Thargoid/${id}.csv`, names[index]));
}

/** The seven Thargoid structure states, which `MapData-Thargoids.js` names and colours. */
const THARGOID_STRUCTURE_STATES = {
  0: { name: '0 Inactive', colour: 'A63333' },
  1: { name: '1 Inactive', colour: 'E63333' },
  2: { name: '2 Inactive', colour: 'FF6B6B' },
  3: { name: '3 Active', colour: 'FFA500' },
  4: { name: '4 Active', colour: 'FFFF00' },
  5: { name: '5 Active', colour: '90EE90' },
  6: { name: '6 Active', colour: '00FF00' },
  Unknown: { name: 'Unknown', colour: '800000' },
};

/** The ten threat levels of a Non-Human Signal Source, as `MapData-NHSS.js` colours them. */
const NHSS_THREATS = {
  0: { name: 'Threat 0', colour: 'FF0000' },
  1: { name: 'Threat 1', colour: '3090C7' },
  2: { name: 'Threat 2', colour: '7E587E' },
  3: { name: 'Threat 3', colour: 'E78A61' },
  4: { name: 'Threat 4', colour: 'FAEBD7' },
  5: { name: 'Threat 5', colour: '46C7C7' },
  6: { name: 'Threat 6', colour: 'F0FFFF' },
  7: { name: 'Threat 7', colour: '7F5A58' },
  8: { name: 'Threat 8', colour: '81D8D0' },
  9: { name: 'Threat 9', colour: '387C44' },
};

/** The nine threat levels `MapData-Thargoids.js` draws, with the colours that map gives. */
const THARGOIDS_THREATS = {
  1: { name: 'Threat 1', colour: '90EE90' },
  2: { name: 'Threat 2', colour: 'ADFF2F' },
  3: { name: 'Threat 3', colour: 'FFFF00' },
  4: { name: 'Threat 4', colour: 'FFD700' },
  5: { name: 'Threat 5', colour: 'FFA500' },
  6: { name: 'Threat 6', colour: 'FF6347' },
  7: { name: 'Threat 7', colour: 'FF4500' },
  8: { name: 'Threat 8', colour: 'FF0000' },
  9: { name: 'Threat 9', colour: '8B0000' },
};

/** The ten permit locked regions of `MapData-Permit.js`, which two maps name the same. */
const PERMIT_REGIONS = {
  1070: { name: 'Col 70 Sector', colour: '442299' },
  1097: { name: 'Col 97 Sector', colour: '4444dd' },
  1121: { name: 'Col 121 Sector', colour: '11aabb' },
  2000: { name: 'Cone Sector', colour: '22ccaa' },
  3000: { name: 'Horsehead Dark Sector', colour: 'a6cc33' },
  4000: { name: 'M41', colour: '69d025' },
  6647: { name: 'NGC 1647', colour: 'aacc22' },
  7264: { name: 'NGC 2264', colour: 'd0c310' },
  7286: { name: 'NGC 2286', colour: 'ccbb33' },
  8603: { name: 'NGC 3603', colour: 'ff9933' },
};

/**
 * A key table that reads a palette in the order the keys first appear, which is what a map
 * does that builds its table while it reads its rows. The Clouds map takes the index after
 * it adds the key, so its first key takes the second colour of the table.
 */
function paletteNames(palette, first = 0) {
  return (keys) => {
    const table = {};
    for (const [index, key] of keys.entries()) {
      table[key] = { name: key, colour: palette[(index + first) % palette.length] };
    }
    return table;
  };
}

/**
 * The 49 maps of the Canonn source tree, one row per `MapData-*.js` file.
 *
 * `id` is the name of the file after `MapData-`, so the table and the tree check each
 * other. `label` is what the catalog of the page shows, and `group` is the subject group
 * it shows the map under. `demo` marks the five maps the demo page already converts, which
 * this page converts again from the map's own reader.
 *
 * `sources` names every address the map reads. A source names the reader that makes its
 * keys, which belongs to the file and not to the map, and the name and the colour **this**
 * map gives each key. A `null` colour is a key whose map builds its colour with
 * `randomColor()` or `getColour()`, which is a different colour on each page load, so the
 * build gives the key a colour of its own that does not move between runs.
 *
 * A source with a `null` reader is an address that does not answer. 14 maps read
 * `api.canonn.tech`, which no longer resolves, and 5 more read a cloud function that
 * answers 404 or 410. **The build does not ask such an address.** `sourcesOf` skips a
 * source with a `null` reader, so the nine drops the build prints come from the `why` of
 * these rows and not from a reading of the day. The reasons were measured by hand on
 * 2026-09-21.
 *
 * The cost of that is one thing to know: an address that recovers stays out until a
 * person reads it again and gives the row a reader. The build cannot tell a dead address
 * from a live one it was told to skip.
 */
export const MAPS = [
  // Guardians
  {
    id: 'GR',
    label: 'Guardian Ruins',
    group: 'Guardians',
    demo: true,
    sources: [
      source(
        `${BUCKET}guardian_ruins.json`,
        'ruins',
        sameNames(['Alpha', 'Beta', 'Gamma', 'Unknown']),
      ),
    ],
  },
  {
    id: 'GS',
    label: 'Guardian Structures',
    group: 'Guardians',
    demo: true,
    sources: [
      source(
        `${BUCKET}guardian_structures.json`,
        'structures',
        sameNames([...STRUCTURE_TYPES, 'Unknown']),
      ),
    ],
  },
  {
    id: 'GB',
    label: 'Guardian Beacons',
    group: 'Guardians',
    sources: [
      source(`${BUCKET}guardian_beacons.json`, 'beacons', sameNames(['Beacon'])),
    ],
  },
  {
    id: 'Guardians',
    label: 'Guardian Sites',
    group: 'Guardians',
    sources: [
      source(`${BUCKET}guardian_ruins.json`, 'ruins', {
        Alpha: { name: 'Alpha', colour: null },
        Beta: { name: 'Beta', colour: null },
        Gamma: { name: 'Gamma', colour: null },
        Unknown: { name: 'Unknown GR', colour: '800000' },
      }),
      source(
        `${BUCKET}guardian_structures.json`,
        'structures',
        sameNames([...STRUCTURE_TYPES, 'Unknown']),
      ),
      source(`${BUCKET}guardian_beacons.json`, 'beacons', sameNames(['Beacon'])),
      ...brainTrees([
        'Roseum',
        'Gypseeum',
        'Ostrinum',
        'Viride',
        'Lividum',
        'Aureum',
        'Puniceum',
        'Lindigoticum',
      ]),
    ],
  },
  // Codex biology
  {
    id: 'AP',
    label: 'Amphora Plants',
    group: 'Codex biology',
    sources: [codexSource('dumpr/Biology/2101400.csv', 'Amphora Plant', null)],
  },
  {
    id: 'BM',
    label: 'Bark Mounds',
    group: 'Codex biology',
    sources: [codexSource('dumpr/Biology/2100301.csv', 'Bark Mound', null)],
  },
  {
    id: 'BT',
    label: 'Brain Trees',
    group: 'Codex biology',
    sources: brainTrees([
      'Roseum Brain Tree',
      'Gypseeum Brain Tree',
      'Ostrinum Brain Tree',
      'Viride Brain Tree',
      'Lividum Brain Tree',
      'Aureum Brain Tree',
      'Puniceum Brain Tree',
      'Lindigoticum Brain Tree',
    ]),
  },
  {
    id: 'CS',
    label: 'Crystalline Shards',
    group: 'Codex biology',
    sources: [codexSource('dumpr/Biology/2101500.csv', 'Crystalline Shards', null)],
  },
  {
    id: 'FG',
    label: 'Fungal Gourds',
    group: 'Codex biology',
    sources: [
      codexSource('dumpr/Biology/2100401.csv', 'Luteolum Anemone', null),
      codexSource('dumpr/Biology/2100402.csv', 'Croceum Anemone', null),
      codexSource('dumpr/Biology/2100403.csv', 'Puniceum Anemone', null),
      codexSource('dumpr/Biology/2100404.csv', 'Roseum Anemone', null),
      codexSource('dumpr/Biology/2100405.csv', 'Blatteum Bioluminescent Anemone', null),
      codexSource('dumpr/Biology/2100406.csv', 'Rubeum Bioluminescent Anemone', null),
      codexSource('dumpr/Biology/2100407.csv', 'Prasinum Bioluminescent Anemone', null),
      codexSource('dumpr/Biology/2100408.csv', 'Roseum Bioluminescent Anemone', null),
    ],
  },
  {
    id: 'TW',
    label: 'Tube Worms',
    group: 'Codex biology',
    sources: [codexSource('dumpr/Biology/2100501.csv', 'Roseum Sinuous Tubers', null)],
  },
  {
    id: 'Biology',
    label: 'Biology Surface Scans',
    group: 'Codex biology',
    sources: [dead(`${QUERY}unknown_biosignals`, '404 gone')],
  },
  // Codex geology
  {
    id: 'FM',
    label: 'Fumaroles',
    group: 'Codex geology',
    sources: [
      codexSource('dumpr/Geology/1400102.csv', 'Sulphur Dioxide Fumarole', 'FF0000'),
      codexSource('dumpr/Geology/1400108.csv', 'Water Fumarole', 'B22222'),
      codexSource('dumpr/Geology/1400114.csv', 'Silicate Vapour Fumarole', 'FF7F50'),
      codexSource(
        'dumpr/Geology/1400152.csv',
        'Sulphur Dioxide Ice Fumarole',
        'FFFF00',
      ),
      codexSource('dumpr/Geology/1400158.csv', 'Water Ice Fumarole', '00FF00'),
      codexSource('dumpr/Geology/1400159.csv', 'Carbon Dioxide Ice Fumarole', '0000FF'),
      codexSource('dumpr/Geology/1400160.csv', 'Ammonia Ice Fumarole', 'EE82EE'),
      codexSource('dumpr/Geology/1400161.csv', 'Methane Ice Fumarole', 'FF00FF'),
      codexSource('dumpr/Geology/1400162.csv', 'Nitrogen Ice Fumarole', '800080'),
      codexSource(
        'dumpr/Geology/1400164.csv',
        'Silicate Vapour Ice Fumarole',
        'A52A2A',
      ),
    ],
  },
  {
    id: 'GV',
    label: 'Gas Vents',
    group: 'Codex geology',
    sources: [
      codexSource('dumpr/Geology/1400402.csv', 'Sulphur Dioxide Gas Vent', null),
      codexSource('dumpr/Geology/1400408.csv', 'Water Gas Vent', null),
      codexSource('dumpr/Geology/1400409.csv', 'Carbon Dioxide Gas Vent', null),
      codexSource('dumpr/Geology/1400414.csv', 'Silicate Vapour Gas Vent', null),
    ],
  },
  {
    id: 'GY',
    label: 'Geysers',
    group: 'Codex geology',
    sources: [
      codexSource('dumpr/Geology/1400208.csv', 'Water Geyser', null),
      codexSource('dumpr/Geology/1400258.csv', 'Water Ice Geyser', null),
      codexSource('dumpr/Geology/1400259.csv', 'Carbon Dioxide Ice Geyser', null),
      codexSource('dumpr/Geology/1400260.csv', 'Ammonia Ice Geyser', null),
      codexSource('dumpr/Geology/1400261.csv', 'Methane Ice Geyser', null),
      codexSource('dumpr/Geology/1400262.csv', 'Nitrogen Ice Geyser', null),
    ],
  },
  {
    id: 'LS',
    label: 'Lava Spouts',
    group: 'Codex geology',
    sources: [
      codexSource('dumpr/Geology/1400306.csv', 'Silicate Magma Lava Spout', null),
      codexSource('dumpr/Geology/1400307.csv', 'Iron Magma Lava Spout', null),
    ],
  },
  {
    id: 'Geology',
    label: 'Geology Sites',
    group: 'Codex geology',
    sources: [
      codexSource('dumpr/Biology/2101500.csv', 'Crystalline Shards', null),
      codexSource('dumpr/Geology/1400102.csv', 'Sulphur Dioxide Fumarole', null),
      codexSource('dumpr/Geology/1400108.csv', 'Water Fumarole', null),
      codexSource('dumpr/Geology/1400114.csv', 'Silicate Vapour Fumarole', null),
      codexSource('dumpr/Geology/1400152.csv', 'Sulphur Dioxide Ice Fumarole', null),
      codexSource('dumpr/Geology/1400158.csv', 'Water Ice Fumarole', null),
      codexSource('dumpr/Geology/1400159.csv', 'Carbon Dioxide Ice Fumarole', null),
      codexSource('dumpr/Geology/1400160.csv', 'Ammonia Ice Fumarole', null),
      codexSource('dumpr/Geology/1400161.csv', 'Methane Ice Fumarole', null),
      codexSource('dumpr/Geology/1400162.csv', 'Nitrogen Ice Fumarole', null),
      codexSource('dumpr/Geology/1400164.csv', 'Silicate Vapour Ice Fumarole', null),
      codexSource('dumpr/Geology/1400402.csv', 'Sulphur Dioxide Gas Vent', null),
      codexSource('dumpr/Geology/1400408.csv', 'Water Gas Vent', null),
      codexSource('dumpr/Geology/1400409.csv', 'Carbon Dioxide Gas Vent', null),
      codexSource('dumpr/Geology/1400414.csv', 'Silicate Vapour Gas Vent', null),
      codexSource('dumpr/Geology/1400208.csv', 'Water Geyser', null),
      codexSource('dumpr/Geology/1400258.csv', 'Water Ice Geyser', null),
      codexSource('dumpr/Geology/1400259.csv', 'Carbon Dioxide Ice Geyser', null),
      codexSource('dumpr/Geology/1400260.csv', 'Ammonia Ice Geyser', null),
      codexSource('dumpr/Geology/1400261.csv', 'Methane Ice Geyser', null),
      codexSource('dumpr/Geology/1400262.csv', 'Nitrogen Ice Geyser', null),
      codexSource('dumpr/Geology/1400306.csv', 'Silicate Magma Lava Spout', null),
      codexSource('dumpr/Geology/1400307.csv', 'Iron Magma Lava Spout', null),
    ],
  },
  // Thargoids
  {
    id: 'TB',
    label: 'Thargoid Barnacles',
    group: 'Thargoids',
    sources: barnacles([
      'Common Thargoid Barnacle',
      'Large Thargoid Barnacle',
      'Thargoid Barnacle Barbs',
      'Thargoid Barnacle Matrix',
      'Thargoid Mega Barnacles',
    ]),
  },
  {
    id: 'TS',
    label: 'Thargoid Structures',
    group: 'Thargoids',
    sources: [
      source(
        `${RAW}data/surface_sites.json`,
        'surfaceSites',
        THARGOID_STRUCTURE_STATES,
      ),
    ],
  },
  {
    id: 'TSmsg_3305survey',
    label: 'Thargoid Structure Messages',
    group: 'Thargoids',
    sources: [
      source(
        `${RAW}data/csvCache/202011052200_Canonn Universal Science DB - TS Export - Export CSV Data.csv`,
        'thargoidSurvey',
        {
          Active: { name: 'Active T-Structure', colour: '00FF00' },
          Inactive: { name: 'Inactive T-Structure', colour: 'FF0000' },
        },
      ),
    ],
  },
  {
    id: 'Thargoids',
    label: 'Thargoid Sites',
    group: 'Thargoids',
    sources: [
      ...barnacles([
        'Common Thargoid Barnacle',
        'Large Thargoid Barnacle',
        'Barnacle Barbs',
        'Barnacle Matrix',
        'Mega Barnacles',
      ]),
      source(
        `${RAW}data/surface_sites.json`,
        'surfaceSites',
        THARGOID_STRUCTURE_STATES,
      ),
      source(`${QUERY}query/thargoid/nhss/systems`, 'nhss', THARGOIDS_THREATS),
    ],
  },
  {
    id: 'NHSS',
    label: 'Non-Human Signal Sources',
    group: 'Thargoids',
    sources: [source(`${QUERY}query/thargoid/nhss/systems`, 'nhss', NHSS_THREATS)],
  },
  {
    id: 'Aliens',
    label: 'Alien Sites',
    group: 'Thargoids',
    sources: [
      source(`${BUCKET}guardian_ruins.json`, 'ruins', {
        Alpha: { name: 'Guardian Ruins', colour: '4488FF' },
        Beta: { name: 'Guardian Ruins', colour: '4488FF' },
        Gamma: { name: 'Guardian Ruins', colour: '4488FF' },
        Unknown: { name: 'Guardian Ruins', colour: '4488FF' },
      }),
      source(
        `${BUCKET}guardian_structures.json`,
        'structures',
        Object.fromEntries(
          [...STRUCTURE_TYPES, 'Unknown'].map((type) => [
            type,
            { name: 'Guardian Structures', colour: '0055CC' },
          ]),
        ),
      ),
      source(`${BUCKET}guardian_beacons.json`, 'beacons', {
        Beacon: { name: 'Guardian Beacons', colour: '88BBFF' },
      }),
      ...brainTrees(new Array(8).fill('Brain Trees')),
      ...barnacles(new Array(5).fill('Thargoid Barnacles')),
      source(
        `${RAW}data/surface_sites.json`,
        'surfaceSites',
        Object.fromEntries(
          Object.keys(THARGOID_STRUCTURE_STATES).map((key) => [
            key,
            { name: 'Thargoid Structures', colour: '008800' },
          ]),
        ),
      ),
      source(
        `${QUERY}query/thargoid/nhss/systems`,
        'nhss',
        Object.fromEntries(
          Object.keys(NHSS_THREATS).map((key) => [
            key,
            { name: 'Non-Human Signal Sources', colour: '44FF88' },
          ]),
        ),
      ),
    ],
  },
  {
    id: 'Hyperdiction',
    label: 'Hyperdictions',
    group: 'Thargoids',
    sources: [
      source(`${BUCKET}dumpr/hyperdictions.json`, 'hyperdictions', (keys) => {
        const table = {};
        for (const key of keys) {
          const reference = HYPERDICTION_REFERENCES.find((entry) =>
            key.startsWith(`${entry.key} `),
          );
          table[key] = { name: key, colour: reference?.colour ?? null };
        }
        return table;
      }),
    ],
  },
  // Factions
  {
    id: 'Faction',
    label: 'Faction Systems',
    group: 'Factions',
    sources: [
      dead(
        'https://elitebgs.app/api/ebgs/v5/factions?systemDetails=true',
        '500 server error',
      ),
      dead(`${QUERY}query/get_compres`, 'no coordinates of its own'),
    ],
  },
  {
    id: 'FactionRes',
    label: 'Faction Reserves',
    group: 'Factions',
    sources: [
      dead(
        'https://elitebgs.app/api/ebgs/v5/factions?systemDetails=true',
        '500 server error',
      ),
      dead(`${QUERY}query/get_compres`, 'no coordinates of its own'),
    ],
  },
  {
    id: 'multifaction',
    label: 'Canonn Factions',
    group: 'Factions',
    demo: true,
    sources: [
      source(
        'https://downloads.spansh.co.uk/factions.json.gz',
        'factions',
        {
          'Canonn Controlled': { name: 'Canonn Controlled', colour: '4AA02C' },
          'Canonn Present': { name: 'Canonn Present', colour: 'A8EB6A' },
          'Canonn Deep Space Research Controlled': {
            name: 'Canonn Deep Space Research Controlled',
            colour: '2554C7',
          },
          'Canonn Deep Space Research Present': {
            name: 'Canonn Deep Space Research Present',
            colour: '79BAEC',
          },
        },
        ['Canonn', 'Canonn Deep Space Research'],
      ),
    ],
  },
  {
    id: 'IDA',
    label: 'Operation Ida',
    group: 'Factions',
    sources: [
      source(`${BUCKET}ida_repairs.json`, 'idaRepairs', {
        Repairs: { name: 'Repairs', colour: 'FF6B35' },
      }),
      source(`${BUCKET}ida_colonisation.json`, 'idaColonisation', {
        Colonisation: { name: 'Colonisation', colour: '00CED1' },
      }),
      source(
        'https://downloads.spansh.co.uk/factions.json.gz',
        'factions',
        {
          'Operation Ida Controlled': { name: 'Controlled', colour: '4AA02C' },
          'Operation Ida Present': { name: 'Present', colour: 'A8EB6A' },
        },
        ['Operation Ida'],
      ),
    ],
  },
  {
    id: 'Colonisation',
    label: 'Colonisation',
    group: 'Factions',
    sources: [
      dead(
        'https://elitebgs.app/api/ebgs/v5/factions?systemDetails=true',
        '500 server error',
      ),
      dead(`${QUERY}query/get_compres`, 'no coordinates of its own'),
    ],
  },
  {
    id: 'DCOH',
    label: 'Thargoid War',
    group: 'Factions',
    sources: [dead('https://dcoh.watch/api/v1/overwatch/systems', '410 gone')],
  },
  // Expeditions
  {
    id: 'Adamastor',
    label: 'Adamastor',
    group: 'Expeditions',
    demo: true,
    sources: [
      source(`${RAW}data/MapData-Adamastor.js`, 'literal'),
      source(`${RAW}data/csvCache/adamastor.csv`, 'adamastor', {
        Adamastor: { name: 'Adamastor', colour: 'f5a142' },
      }),
      source(`${RAW}data/csvCache/hesperus.csv`, 'hesperus', {
        Hesperus: { name: 'Hesperus', colour: '42b0f5' },
      }),
    ],
  },
  {
    id: 'Challenge',
    label: 'Canonn Challenge',
    group: 'Expeditions',
    sources: [
      source(`${RAW}data/csvCache/expedition.csv`, 'expedition', {
        Varati: { name: 'Varati', colour: 'f5a142' },
        Waypoint: { name: 'Waypoint', colour: '42f557' },
      }),
    ],
  },
  {
    id: 'Gnosis',
    label: 'The Gnosis',
    group: 'Expeditions',
    sources: [
      source(
        `${RAW}data/csvCache/gnosis.json`,
        'gnosis',
        sameNames([
          'Varati',
          'HIP 17862',
          'Pleiades Sector PN-T b3-0',
          'Synuefe PR-L b40-1',
          'HIP 18120',
          'IC 2391 Sector CQ-Y c16',
          'Kappa-1 Volantis',
          'Other System',
        ]),
      ),
    ],
  },
  {
    id: 'LP',
    label: 'Listening Posts',
    group: 'Expeditions',
    sources: [
      source(`${RAW}data/csvCache/Listening_Posts.csv`, 'listeningPosts', {
        Hint: { name: 'Hint', colour: 'f5a142' },
        Discovery: { name: 'Discovery', colour: '42f557' },
      }),
    ],
  },
  {
    id: 'UIA',
    label: 'Unknown Instrument Array',
    group: 'Expeditions',
    demo: true,
    sources: [
      source(`${RAW}data/MapData-UIA.js`, 'literal'),
      ...UIA_NAMES.map((name, index) =>
        source(`${RAW}data/csvCache/uia_waypoints_${index + 1}.json`, 'uiaWaypoints', {
          '': { name: `UIA ${index + 1}, ${name}`, colour: '999900' },
        }),
      ),
      source(`${RAW}data/csvCache/route_UIA_Hyperdictions.csv`, 'uiaHyperdictions', {
        Hyperdiction: { name: 'All Hyperdictions', colour: 'FF0000' },
        Hostile: { name: 'Hostile Hyperdictions', colour: '8B0000' },
      }),
    ],
  },
  {
    id: 'Voyager',
    label: 'Voyager Probes',
    group: 'Expeditions',
    sources: [
      source(`${RAW}data/csvCache/voyager.csv`, 'voyager', {
        Sol: { name: 'Sol', colour: 'FFD700' },
        'Voyager System': { name: 'Voyager System', colour: 'FFFFFF' },
      }),
    ],
  },
  // Regions and routes
  {
    id: 'Cartographics',
    label: 'Cartographics',
    group: 'Regions and routes',
    sources: [
      source(`${BUCKET}generationships.json`, 'generationShips', {
        'Generation Ship': { name: 'Generation Ship', colour: null },
      }),
      source(`${RAW}data/csvCache/col70.csv`, 'permitRegions', PERMIT_REGIONS),
    ],
  },
  {
    id: 'Permit',
    label: 'Permit Locked Regions',
    group: 'Regions and routes',
    sources: [
      source(`${RAW}data/MapData-Permit.js`, 'literal'),
      source(`${RAW}data/csvCache/col70.csv`, 'permitRegions', PERMIT_REGIONS),
    ],
  },
  {
    id: 'Route',
    label: 'Codex Routes',
    group: 'Regions and routes',
    sources: [dead(`${QUERY}get_codex_route`, '404 gone')],
  },
  {
    id: 'Prisons',
    label: 'Prison Ships',
    group: 'Regions and routes',
    sources: [
      source(
        `${RAW}data/station_stats.json`,
        'prisons',
        sameNames(['Prisons', 'Stations']),
      ),
    ],
  },
  {
    id: 'Carriers',
    label: 'Fleet Carriers',
    group: 'Regions and routes',
    sources: [dead(`${QUERY}query/fleetCarriers`, '500 server error')],
  },
  // Points of interest
  {
    id: 'Cloud',
    label: 'Lagrange Clouds',
    group: 'Points of interest',
    sources: [source(`${BUCKET}clouds.json`, 'clouds', paletteNames(CLOUD_PALETTE, 1))],
  },
  {
    id: 'All',
    label: 'All Sites',
    group: 'Points of interest',
    sources: [
      codexSource('dumpr/Biology/2101400.csv', '(AP) Amphora Plants'),
      // `MapData-All.js:88` points its `bmsites` slot at `dumpr/Thargoid/2100101.csv`,
      // which the codex index names a Common Thargoid Barnacle entry, so the map draws 140
      // barnacle systems under a bark mound name. This build reads the bark mound dump the
      // BM map reads instead, which is 3,440 systems under the name the row carries. The
      // deviation is deliberate and THIRD_PARTY_NOTICES.md says so as well.
      codexSource('dumpr/Biology/2100301.csv', '(BM) Bark Mounds'),
      codexSource('dumpr/Thargoid/2100101.csv', '(TB) Thargoid Barnacles'),
      codexSource('dumpr/Biology/2100201.csv', '(BT) Brain Trees'),
      codexSource('dumpr/Biology/2100202.csv', '(BT) Brain Trees'),
      codexSource('dumpr/Biology/2100203.csv', '(BT) Brain Trees'),
      codexSource('dumpr/Biology/2100204.csv', '(BT) Brain Trees'),
      codexSource('dumpr/Biology/2100205.csv', '(BT) Brain Trees'),
      codexSource('dumpr/Biology/2100206.csv', '(BT) Brain Trees'),
      codexSource('dumpr/Biology/2100207.csv', '(BT) Brain Trees'),
      codexSource('dumpr/Biology/2100208.csv', '(BT) Brain Trees'),
      codexSource('dumpr/Biology/2101500.csv', '(CS) Crystalline Shards'),
      codexSource('dumpr/Biology/2100401.csv', '(FG) Fungal Gourds'),
      codexSource('dumpr/Biology/2100402.csv', '(FG) Fungal Gourds'),
      codexSource('dumpr/Biology/2100403.csv', '(FG) Fungal Gourds'),
      codexSource('dumpr/Biology/2100404.csv', '(FG) Fungal Gourds'),
      codexSource('dumpr/Biology/2100405.csv', '(FG) Fungal Gourds'),
      codexSource('dumpr/Biology/2100406.csv', '(FG) Fungal Gourds'),
      codexSource('dumpr/Biology/2100407.csv', '(FG) Fungal Gourds'),
      codexSource('dumpr/Biology/2100408.csv', '(FG) Fungal Gourds'),
      codexSource('dumpr/Geology/1400102.csv', '(FM) Fumaroles'),
      codexSource('dumpr/Geology/1400108.csv', '(FM) Fumaroles'),
      codexSource('dumpr/Geology/1400114.csv', '(FM) Fumaroles'),
      codexSource('dumpr/Geology/1400152.csv', '(FM) Fumaroles'),
      codexSource('dumpr/Geology/1400158.csv', '(FM) Fumaroles'),
      codexSource('dumpr/Geology/1400159.csv', '(FM) Fumaroles'),
      codexSource('dumpr/Geology/1400160.csv', '(FM) Fumaroles'),
      codexSource('dumpr/Geology/1400161.csv', '(FM) Fumaroles'),
      codexSource('dumpr/Geology/1400162.csv', '(FM) Fumaroles'),
      codexSource('dumpr/Geology/1400164.csv', '(FM) Fumaroles'),
      codexSource('dumpr/Geology/1400109.csv', '(FM) Fumaroles'),
      codexSource('dumpr/Guardian/3200800.csv', '(GB) Guardian Beacons'),
      codexSource('dumpr/Guardian/3200200.csv', '(G) Guardian Sites'),
      codexSource('dumpr/Guardian/3200300.csv', '(G) Guardian Sites'),
      codexSource('dumpr/Guardian/3200400.csv', '(G) Guardian Sites'),
      codexSource('dumpr/Guardian/3200500.csv', '(G) Guardian Sites'),
      codexSource('dumpr/Guardian/3200600.csv', '(G) Guardian Sites'),
      codexSource('dumpr/Geology/1400402.csv', '(GV) Gas Vents'),
      codexSource('dumpr/Geology/1400408.csv', '(GV) Gas Vents'),
      codexSource('dumpr/Geology/1400409.csv', '(GV) Gas Vents'),
      codexSource('dumpr/Geology/1400414.csv', '(GV) Gas Vents'),
      codexSource('dumpr/Geology/1400208.csv', '(GY) Geysers'),
      codexSource('dumpr/Geology/1400258.csv', '(GY) Geysers'),
      codexSource('dumpr/Geology/1400259.csv', '(GY) Geysers'),
      codexSource('dumpr/Geology/1400260.csv', '(GY) Geysers'),
      codexSource('dumpr/Geology/1400261.csv', '(GY) Geysers'),
      codexSource('dumpr/Geology/1400262.csv', '(GY) Geysers'),
      codexSource('dumpr/Geology/1400306.csv', '(LS) Lava Spouts'),
      codexSource('dumpr/Geology/1400307.csv', '(LS) Lava Spouts'),
      codexSource('dumpr/Thargoid/2100102.csv', '(TB) Thargoid Barnacles'),
      codexSource('dumpr/Thargoid/3101000.csv', '(TS) Thargoid Structure'),
      codexSource('dumpr/Thargoid/3101100.csv', '(TS) Thargoid Structure'),
      codexSource('dumpr/Thargoid/3101200.csv', '(TS) Thargoid Structure'),
      codexSource('dumpr/Biology/2100501.csv', '(TW) Tube Worms'),
      codexSource('dumpr/Biology/2100503.csv', '(TW) Tube Worms'),
      codexSource('dumpr/Biology/2100502.csv', '(TW) Tube Worms'),
      codexSource('dumpr/Biology/2100505.csv', '(TW) Tube Worms'),
      codexSource('dumpr/Biology/2100508.csv', '(TW) Tube Worms'),
      codexSource('dumpr/Biology/2100507.csv', '(TW) Tube Worms'),
      codexSource('dumpr/Biology/2100506.csv', '(TW) Tube Worms'),
      codexSource('dumpr/Biology/2100504.csv', '(TW) Tube Worms'),
    ],
  },
  {
    id: 'Codex',
    label: 'Codex Query',
    group: 'Points of interest',
    sources: [
      dead(
        `${QUERY}query/codex/ref?hierarchy=1`,
        'live but larger than the ceiling',
        'the index names 1,072 dump files, about 426 MB, against a 50,000,000 byte ceiling',
      ),
    ],
  },
  {
    id: 'Cmdr',
    label: 'Commander Codex',
    group: 'Points of interest',
    sources: [
      // The same whole codex as the Codex map, by the systems endpoint. It answers past
      // offset 3,000,000, its filter parameters do nothing, and the map reads the commander
      // the page address names, so it holds no default of its own either.
      dead(
        `${QUERY}query/codex/systems`,
        'live but larger than the ceiling',
        'the same 1,072 dump files as the Codex map, about 426 MB, against a 50,000,000 byte ceiling',
      ),
    ],
  },
  {
    id: 'GEC',
    label: 'Galactic Exploration Catalog',
    group: 'Points of interest',
    sources: [
      source('https://edastro.com/gec/json/all', 'gec', paletteNames(GEC_PALETTE)),
    ],
  },
  {
    id: 'Galnet',
    label: 'Galnet Relays',
    group: 'Points of interest',
    sources: [
      source(`${BUCKET}galnet.json`, 'galnet', {
        'Galnet News Digest': { name: 'Galnet News Digest', colour: 'f5a142' },
        'All Names': { name: 'All Names', colour: '42b0f5' },
      }),
    ],
  },
  {
    id: 'Megaships',
    label: 'Megaships',
    group: 'Points of interest',
    sources: [
      source(`${BUCKET}megaships.json`, 'megaships', {
        Megaship: { name: 'Megaship', colour: '00BFFF' },
      }),
    ],
  },
  {
    id: 'GEN',
    label: 'Generation Ships',
    group: 'Points of interest',
    sources: [
      source(`${BUCKET}generationships.json`, 'generationShips', {
        'Generation Ship': { name: 'Generation Ship', colour: 'FF6600' },
      }),
    ],
  },
  {
    id: 'landscape',
    label: 'Landscape Signals',
    group: 'Points of interest',
    sources: [
      source(`${BUCKET}landscape.json`, 'landscape', {
        Surveyed: { name: 'Surveyed', colour: '00C000' },
        Visited: { name: 'Visited', colour: 'FFA500' },
        Unvisited: { name: 'Unvisited', colour: 'FF0000' },
        'Stuemeae UY-S': { name: 'Stuemeae UY-S', colour: 'FF44BB' },
        'Stuemeae KM-W': { name: 'Stuemeae KM-W', colour: 'FFEE00' },
        'Stuemeae FG-Y': { name: 'Stuemeae FG-Y', colour: '44AAFF' },
      }),
    ],
  },
];

/** The directory the build caches the raw sources in, which the repository never holds. */
export const CACHE_DIR = fileURLToPath(new URL('../data/canonn/', import.meta.url));

/** The directory the build writes the committed sets to. */
export const OUT_DIR = fileURLToPath(new URL('../demo-data/canonn/', import.meta.url));

/**
 * The file name the build gives one source. The name comes from the address, so two maps
 * that name one source name one file, and the build writes no source to two paths. A
 * source the build reads under a filter carries the filter in its name, because the filter
 * makes different records.
 */
export function fileNameOf({ path, select }) {
  const bases = [
    [BUCKET, ''],
    [RAW, ''],
    [QUERY, 'query-'],
  ];
  let address = String(path);
  for (const [base, prefix] of bases) {
    if (address.startsWith(base)) {
      address = prefix + address.slice(base.length);
      break;
    }
  }
  const parts = [address.replace(/^https?:\/\//, ''), ...(select ?? [])].join('-');
  const name = parts
    .toLowerCase()
    .replace(/\.(json|csv|js)(\.gz)?$/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${name}.json`;
}

/** Every source of the table, one entry per file the build writes. */
export function sourcesOf(maps = MAPS) {
  const table = new Map();
  for (const map of maps) {
    for (const entry of map.sources) {
      if (entry.reader === null) continue;
      const file = fileNameOf(entry);
      const held = table.get(file);
      if (held === undefined) {
        table.set(file, { ...entry, file, maps: [map.id] });
        continue;
      }
      if (held.reader !== entry.reader) {
        throw new Error(
          `The maps ${held.maps[0]} and ${map.id} key the source ${entry.path} differently: ` +
            `${held.maps[0]} reads it with ${held.reader} and ${map.id} reads it with ` +
            `${entry.reader}. One source carries one key rule.`,
        );
      }
      held.maps.push(map.id);
    }
  }
  return table;
}

/**
 * Checks the map table against the file list of the Canonn source tree. The table must
 * name every `MapData-*.js` file of the tree, and the tree must hold every file the table
 * names, so a map the Canonn project adds does not pass the build unread.
 */
export function readMapList(entries, maps = MAPS) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error(
      `The listing of ${CONTENTS_URL} holds no file. The build cannot check the map table.`,
    );
  }
  const found = new Set();
  for (const entry of entries) {
    const name = String(entry?.['name'] ?? '');
    const id = /^MapData-(.+)\.js$/.exec(name)?.[1];
    if (id === undefined) continue;
    found.add(id);
  }
  const named = new Set(maps.map((map) => map.id));
  for (const id of found) {
    if (!named.has(id)) {
      throw new Error(
        `The Canonn source tree holds MapData-${id}.js, which the map table does not name. ` +
          `Add a row for it to MAPS in build-canonn-sets.mjs.`,
      );
    }
  }
  for (const id of named) {
    if (!found.has(id)) {
      throw new Error(
        `The map table names MapData-${id}.js, which the Canonn source tree no longer holds. ` +
          `Remove the row from MAPS in build-canonn-sets.mjs.`,
      );
    }
  }
  return [...found].sort();
}

/** The file list of the `Source/data` directory of the Canonn source tree. */
export async function listSourceTree(read = fetch) {
  const answer = await read(CONTENTS_URL, {
    headers: { accept: 'application/vnd.github+json' },
  });
  if (!answer.ok) {
    throw new Error(
      `The listing of ${CONTENTS_URL} answered ${answer.status}. The build cannot check the ` +
        `map table against the Canonn source tree.`,
    );
  }
  return await answer.json();
}

/**
 * The records of one source with no description that repeats one of that record's own keys.
 *
 * A map that keys on a description column, which `MapData-Cloud.js` does, would otherwise
 * write the same string twice into one record. The guard sits at the one exit every reader
 * routes through, so a reader added later cannot repeat the fault.
 */
export function withoutEchoes(read) {
  return {
    ...read,
    records: read.records.map((record) => {
      if (record.description === undefined) return record;
      if (!(record.keys ?? []).includes(record.description)) return record;
      const rest = { ...record };
      delete rest.description;
      return rest;
    }),
  };
}

/**
 * The records of one source. The reader of the source makes the keys, and the records of
 * one system join: a system reaches a dump once per site, and the map draws one point per
 * system under every key its sites carry.
 */
export function convertSource(entry, body) {
  const reader = READERS[entry.reader];
  if (reader === undefined) {
    throw new Error(
      `The source ${entry.path} names the reader ${entry.reader}, which is not one.`,
    );
  }
  if (reader.records !== undefined) return withoutEchoes(reader.records(body));
  let parsed = body;
  if (reader.parse === 'json') parsed = JSON.parse(body);
  if (reader.parse === 'csv') parsed = parseCsv(body);
  const rows =
    reader.rows === undefined ? parsed : reader.rows(parsed, entry.select ?? []);
  if (!Array.isArray(rows)) {
    throw new Error(`The source ${entry.path} does not read as a list of rows.`);
  }
  const held = new Map();
  for (const row of rows) {
    const record = reader.row(row);
    if (record === null) continue;
    const first = held.get(record.name.toLowerCase());
    if (first === undefined) {
      held.set(record.name.toLowerCase(), record);
      continue;
    }
    for (const key of record.keys) {
      if (!first.keys.includes(key)) first.keys.push(key);
    }
    if (first.description.length === 0) first.description = record.description;
  }
  if (held.size === 0 && rows.length > 0) {
    throw new Error(
      `The source ${entry.path} answers with ${rows.length} rows and the ${entry.reader} ` +
        `reader makes no record of them. The columns of the source do not match the reader.`,
    );
  }
  return withoutEchoes({
    records: [...held.values()].map((record) => ({
      name: record.name,
      coords: record.coords,
      ...(record.keys.length > 0 ? { keys: record.keys } : {}),
      ...(record.description.length > 0 ? { description: record.description } : {}),
    })),
    categories: null,
  });
}

/** The keys one list of records holds, in the order they first appear. */
export function keysOf(records) {
  const keys = [];
  for (const record of records) {
    for (const key of record.keys ?? ['']) {
      if (!keys.includes(key)) keys.push(key);
    }
  }
  if (keys.length === 0) keys.push('');
  return keys;
}

/** The name and the colour one map gives each key of one of its sources. */
export function categoriesOf(entry, keys, mapId, own = null) {
  if (own !== null && Object.keys(entry.names).length === 0) {
    return Object.fromEntries(
      keys.filter((key) => own[key] !== undefined).map((key) => [key, own[key]]),
    );
  }
  const table = typeof entry.names === 'function' ? entry.names(keys) : entry.names;
  const categories = {};
  for (const key of keys) {
    const named = table[key];
    if (named === undefined) continue;
    categories[key] = {
      name: named.name,
      color:
        named.colour === null ? stableColour(`${mapId}:${key}`) : rgbOf(named.colour),
    };
  }
  return categories;
}

/** The bytes one set takes as the build writes it. */
export function setBytes(records) {
  return Buffer.byteLength(JSON.stringify(setOf(records)), 'utf8');
}

/** The host one address names, or the address itself where it names none. */
export function hostOf(path) {
  return /^https?:\/\/([^/]+)/.exec(path)?.[1] ?? path;
}

/**
 * One committed set: the records of one file, with no name and no colour.
 *
 * `source` names the **work** and not the store the build fetched it from, because the
 * `licence` line beside it states the licence of that work. A dump of the Canonn
 * downloads bucket, a file of the Canonn source tree and an answer of the Canonn cloud
 * functions are all the CanonnED3D-Map project under its MIT licence, so all three name
 * the project. A source of another project names its own address, because its terms are
 * its own. `THIRD_PARTY_NOTICES.md` names each store in a section of its own, and
 * `tests/canonn-page.test.ts` holds every `source` value to an address the notices name.
 */
export function setOf(records, path = SOURCE_URL) {
  const host = hostOf(path);
  return {
    source:
      path.startsWith(BUCKET) || path.startsWith(RAW) || path.startsWith(QUERY)
        ? SOURCE_URL
        : path,
    licence: LICENCE_OF[host] ?? LICENCE,
    records,
  };
}

/** A short name for one key, for the file name and the entry id a split writes. */
export function slugOf(text) {
  const slug = String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.length === 0 ? 'other' : slug;
}

/** True where one list of records is inside both bounds. */
function inside(records) {
  return records.length <= MAX_SYSTEMS && setBytes(records) <= MAX_SET_BYTES;
}

/** True where every slice of one cut is inside both bounds. */
function everySliceInside(records, size) {
  for (let start = 0; start < records.length; start += size) {
    if (!inside(records.slice(start, start + size))) return false;
  }
  return true;
}

/**
 * One list of records cut into numbered parts that are inside both bounds.
 *
 * The cut measures **every** slice and not the first one alone, because records of one
 * count are not records of one weight: a later slice of heavier records would otherwise
 * pass the byte ceiling unmeasured.
 */
function numberedParts(records, name) {
  const parts = [];
  let size = Math.min(records.length, MAX_SYSTEMS);
  while (size > 1 && !everySliceInside(records, size)) {
    size = Math.floor(size / 2);
  }
  for (let start = 0; start < records.length; start += size) {
    const part = records.slice(start, start + size);
    parts.push({ name: `${name}-${parts.length + 1}`, records: part });
  }
  return parts;
}

/**
 * One source cut into the files the build writes. A source inside both bounds is one file.
 * A source over one of them splits by its first key, and a key still over a bound splits
 * into numbered parts. The cut reads the keys and not the map, so every map that reads the
 * source reads the same files.
 */
export function splitSource(records, name) {
  if (inside(records)) return [{ name, records }];
  const groups = new Map();
  for (const record of records) {
    const key = (record.keys ?? [])[0] ?? '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }
  const files = [];
  for (const [key, group] of groups) {
    const named = `${name}-${slugOf(key)}`;
    if (inside(group)) {
      files.push({ name: named, records: group });
      continue;
    }
    files.push(...numberedParts(group, named));
  }
  return files;
}

/**
 * The catalog entries of one map. An entry inside both bounds names every file its map
 * reads. An entry over one of them splits by its categories, and a category still over a
 * bound splits into numbered parts. The id of a part is the map id, the category and the
 * part number, joined by hyphens.
 */
export function splitEntry(map, rows) {
  const count = rows.reduce((total, row) => total + row.count, 0);
  const bytes = rows.reduce((total, row) => total + row.bytes, 0);
  if (count <= MAX_SYSTEMS && bytes <= MAX_SET_BYTES) {
    return [{ id: map.id, label: map.label, group: map.group, rows, count }];
  }
  const groups = new Map();
  for (const row of rows) {
    const [first] = Object.values(row.categories);
    if (first === undefined) {
      throw new Error(
        `The file ${row.path} of the map ${map.id} names no category, so the split of the ` +
          `entry has no key. A reader gave a record a key the map does not name.`,
      );
    }
    const name = first.name;
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(row);
  }
  const entries = [];
  for (const [name, group] of groups) {
    const size = group.reduce((total, row) => total + row.count, 0);
    const weight = group.reduce((total, row) => total + row.bytes, 0);
    if (size <= MAX_SYSTEMS && weight <= MAX_SET_BYTES) {
      entries.push({
        id: `${map.id}-${slugOf(name)}`,
        label: `${map.label}, ${name}`,
        group: map.group,
        rows: group,
        count: size,
      });
      continue;
    }
    let part = [];
    let held = 0;
    let takes = 0;
    const flush = () => {
      if (part.length === 0) return;
      takes += 1;
      entries.push({
        id: `${map.id}-${slugOf(name)}-${takes}`,
        label: `${map.label}, ${name}, part ${takes}`,
        group: map.group,
        rows: part,
        count: part.reduce((total, row) => total + row.count, 0),
      });
      part = [];
      held = 0;
    };
    for (const row of group) {
      const next = part.reduce((total, one) => total + one.count, 0) + row.count;
      if (part.length > 0 && (next > MAX_SYSTEMS || held + row.bytes > MAX_SET_BYTES))
        flush();
      part.push(row);
      held += row.bytes;
    }
    flush();
  }
  return entries;
}

/**
 * What one entry records, and where its records come from, which the manifest carries and
 * the dataset dialog shows. The label of a split part names the part, so the line says
 * which part it is.
 */
export function describeEntry(entry, addressOf) {
  const hosts = [...new Set(entry.rows.map((row) => hostOf(addressOf(row.path))))];
  const names = new Set(
    entry.rows.flatMap((row) => Object.values(row.categories).map((one) => one.name)),
  );
  const held = names.size === 1 ? '1 category' : `${names.size} categories`;
  const from =
    hosts.length === 1
      ? hosts[0]
      : `${hosts.slice(0, -1).join(', ')} and ${hosts[hosts.length - 1]}`;
  return (
    `${entry.label}, a map of the Canonn ED3D map project. ` +
    `The entry holds ${entry.count} records in ${held}, from ${from}.`
  );
}

/** How many records one page of the Non-Human Signal Source query gives. */
export const QUERY_PAGE = 2000;

/** The cache file of one source, which keeps the raw answer out of the repository. */
function cacheNameOf(entry) {
  return fileNameOf(entry).replace(/\.json$/, '.raw');
}

/** Reads one source, from the cache where the cache holds it and from the network where not. */
export async function fetchSource(entry, read = fetch, cacheDir = CACHE_DIR) {
  const cache = join(cacheDir, cacheNameOf(entry));
  try {
    return await readFile(cache, 'utf8');
  } catch {
    // The cache does not hold it yet, so read it from the network below.
  }
  const body = await readNetwork(entry, read);
  await mkdir(dirname(cache), { recursive: true });
  await writeFile(cache, body);
  return body;
}

/** Reads one source from the network. */
async function readNetwork(entry, read) {
  if (entry.path.includes('/nhss/systems')) {
    const records = [];
    for (let offset = 0; ; offset += QUERY_PAGE) {
      const answer = await read(`${entry.path}?limit=${QUERY_PAGE}&offset=${offset}`);
      if (!answer.ok) throw new Error(`${entry.path} answered ${answer.status}`);
      const page = await answer.json();
      if (!Array.isArray(page))
        throw new Error(`${entry.path} does not answer with a list`);
      records.push(...page);
      if (page.length < QUERY_PAGE) break;
    }
    return JSON.stringify(records);
  }
  const answer = await read(entry.path);
  if (!answer.ok) throw new Error(`${entry.path} answered ${answer.status}`);
  if (entry.path.endsWith('.gz')) {
    return gunzipSync(Buffer.from(await answer.arrayBuffer())).toString('utf8');
  }
  return await answer.text();
}

/**
 * Checks one map against the tree the repository already holds. A map that gives no record
 * or 10 percent fewer records than the committed tree holds is a source that changed under
 * the build, and the build fails rather than commit the loss.
 */
export function checkAgainstHeld(map, count, held) {
  const before = held.get(map.id);
  if (before === undefined) return;
  if (count === 0) {
    throw new Error(
      `The map ${map.id} (${map.sources.map((entry) => entry.path).join(', ')}) gives no record. ` +
        `The committed tree holds ${before}. The build does not write the loss.`,
    );
  }
  if (count < before * 0.9) {
    throw new Error(
      `The map ${map.id} (${map.sources.map((entry) => entry.path).join(', ')}) gives ${count} ` +
        `records and the committed tree holds ${before}, which is a loss of more than 10 percent. ` +
        `The build does not write the loss.`,
    );
  }
}

/** The record count of each map the committed tree holds, from its manifest. */
export async function heldCounts(dir = OUT_DIR) {
  const counts = new Map();
  let rows;
  try {
    rows = JSON.parse(await readFile(join(dir, 'index.json'), 'utf8'));
  } catch {
    return counts;
  }
  for (const row of rows) {
    const id = String(row['id']).split('-')[0];
    counts.set(id, (counts.get(id) ?? 0) + Number(row['systemCount']));
  }
  return counts;
}

/**
 * Checks the entry count against the catalog. The dataset catalog of the library reads
 * `MAX_DATASETS` entries, so splits that make more than that are a build that fails and
 * not a page that drops the rest.
 */
export function checkCatalog(count) {
  if (count > MAX_DATASETS) {
    throw new Error(
      `The splits make ${count} entries and the catalog reads ${MAX_DATASETS}. Group the maps ` +
        `that split, or raise MAX_DATASETS in a change of its own.`,
    );
  }
}

/** Writes the sets and the manifest, and prints what the build read, split and dropped. */
export async function main(
  read = fetch,
  { cacheDir = CACHE_DIR, outDir = OUT_DIR } = {},
) {
  readMapList(await listSourceTree(read));
  const sources = sourcesOf();

  const held = await heldCounts(outDir);
  const converted = new Map();
  const dropped = [];
  for (const entry of sources.values()) {
    try {
      converted.set(
        entry.file,
        convertSource(entry, await fetchSource(entry, read, cacheDir)),
      );
    } catch (error) {
      dropped.push({
        path: entry.path,
        maps: entry.maps,
        why: String(error.message ?? error),
      });
    }
  }

  // One source becomes one file, or several where it passes a bound.
  const files = new Map();
  const filesOf = new Map();
  for (const [name, { records }] of converted) {
    const stem = name.replace(/\.json$/, '');
    const parts = splitSource(records, stem);
    filesOf.set(
      name,
      parts.map((part) => part.name),
    );
    for (const part of parts) {
      files.set(part.name, { records: part.records, path: sources.get(name).path });
    }
  }

  const entries = [];
  const droppedMaps = [];
  for (const map of MAPS) {
    const rows = [];
    for (const entry of map.sources) {
      if (entry.reader === null) continue;
      const file = fileNameOf(entry);
      const read = converted.get(file);
      if (read === undefined) continue;
      const keys = keysOf(read.records);
      const categories = categoriesOf(entry, keys, map.id, read.categories);
      for (const part of filesOf.get(file) ?? []) {
        const inPart = files.get(part).records;
        const partKeys = keysOf(inPart).filter((key) => categories[key] !== undefined);
        if (partKeys.length === 0 && keys.length > 0) continue;
        rows.push({
          path: `${part}.json`,
          categories: Object.fromEntries(partKeys.map((key) => [key, categories[key]])),
          count: inPart.length,
          bytes: setBytes(inPart),
        });
      }
    }
    const count = rows.reduce((total, row) => total + row.count, 0);
    // The guard runs before the map is left out, and not after: a cold cache on a day the
    // sources answer with an error gives every map no record, and the build would
    // otherwise drop all of them and replace the committed tree with a short one.
    checkAgainstHeld(map, count, held);
    if (rows.length === 0 || count === 0) {
      // The reason the map does not ship: the one its dead addresses carry, or the
      // reading itself where every address answered.
      const said = map.sources.find((entry) => entry.why !== undefined);
      droppedMaps.push({
        id: map.id,
        why: said?.why ?? 'converts to no record',
        basis: said?.basis,
        addresses: map.sources.map((entry) => entry.path),
      });
      continue;
    }
    entries.push(...splitEntry(map, rows));
  }

  checkCatalog(entries.length);

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  let total = 0;
  let largest = { path: '', bytes: 0 };
  const written = new Set();
  for (const entry of entries) {
    for (const row of entry.rows) {
      if (written.has(row.path)) continue;
      written.add(row.path);
      const file = files.get(row.path.replace(/\.json$/, ''));
      const text = JSON.stringify(setOf(file.records, file.path));
      const bytes = Buffer.byteLength(text, 'utf8');
      await writeFile(join(outDir, row.path), text);
      total += bytes;
      if (bytes > largest.bytes) largest = { path: row.path, bytes };
    }
  }

  const manifest = entries.map((entry) => ({
    id: entry.id,
    label: entry.label,
    group: entry.group,
    description: describeEntry(entry, (path) =>
      String(files.get(path.replace(/\.json$/, ''))?.path ?? SOURCE_URL),
    ),
    systemCount: entry.count,
    files: entry.rows.map((row) => ({ path: row.path, categories: row.categories })),
  }));
  const index = `${JSON.stringify(manifest, null, 2)}\n`;
  await writeFile(join(outDir, 'index.json'), index);
  total += Buffer.byteLength(index, 'utf8');

  for (const drop of dropped) {
    console.log(`dropped source ${drop.path} (${drop.maps.join(', ')}): ${drop.why}`);
  }
  for (const drop of droppedMaps) {
    const basis = drop.basis === undefined ? '' : `, ${drop.basis}`;
    console.log(
      `dropped map ${drop.id}: ${drop.why}${basis} — ${drop.addresses.join(', ')}`,
    );
  }
  for (const entry of entries) {
    if (entry.id === entry.id.split('-')[0]) continue;
    console.log(
      `split ${entry.id}: ${entry.rows.length} files, ${entry.count} records`,
    );
  }
  console.log(`${entries.length} entries, ${written.size} files`);
  console.log(`total ${total} bytes of ${MAX_TREE_BYTES}`);
  console.log(
    `largest set ${largest.path}, ${largest.bytes} bytes of ${MAX_SET_BYTES}`,
  );
  if (total > MAX_TREE_BYTES) {
    throw new Error(
      `The tree holds ${total} bytes and the ceiling is ${MAX_TREE_BYTES}.`,
    );
  }
}

if (argv[1] !== undefined && import.meta.url === `file://${argv[1]}`) await main();
