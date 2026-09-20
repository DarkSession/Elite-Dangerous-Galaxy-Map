// The built-in icon catalogue and the reader of one record's `icons` field. A resolved
// icon is a URL and a colour, whichever form the record gave it in, so the overlay that
// draws a stack never asks whether an icon is built-in or the host's own.
//
// The catalogue and the artwork both come from `@elite-dangerous-almanac/core`: the
// colours from `galaxy-map/markers` and the 16 vectors from `assets/galaxy-map/`. The
// package holds no copy of a vector, so neither half can drift from the other.
// `tests/marker-icon-catalogue.test.ts` compares them.
//
// Sixteen static imports and not `import.meta.glob`: a glob takes a relative path, an
// absolute path or an alias, and not a bare package specifier, so it reaches no file in a
// dependency. `?url&no-inline` keeps each vector a file of the build, as
// `src/hud/styles.ts` does for the three faces: the library build inlines a small asset
// as a data URI otherwise, and 16 of those would put about 15 KB of base64 in the entry
// chunk of every host, including one that names no icon.
import { GALAXY_MAP_MARKERS } from '@elite-dangerous-almanac/core/galaxy-map/markers';
import bookmark from '@elite-dangerous-almanac/core/assets/galaxy-map/bookmark.svg?url&no-inline';
import communityGoal from '@elite-dangerous-almanac/core/assets/galaxy-map/community-goal.svg?url&no-inline';
import conflictZone from '@elite-dangerous-almanac/core/assets/galaxy-map/conflict-zone.svg?url&no-inline';
import destination from '@elite-dangerous-almanac/core/assets/galaxy-map/destination.svg?url&no-inline';
import engineer from '@elite-dangerous-almanac/core/assets/galaxy-map/engineer.svg?url&no-inline';
import fleetCarrier from '@elite-dangerous-almanac/core/assets/galaxy-map/fleet-carrier.svg?url&no-inline';
import frontLine from '@elite-dangerous-almanac/core/assets/galaxy-map/front-line.svg?url&no-inline';
import mission from '@elite-dangerous-almanac/core/assets/galaxy-map/mission.svg?url&no-inline';
import squadronCarrier from '@elite-dangerous-almanac/core/assets/galaxy-map/squadron-carrier.svg?url&no-inline';
import starterZone from '@elite-dangerous-almanac/core/assets/galaxy-map/starter-zone.svg?url&no-inline';
import stationAbandoned from '@elite-dangerous-almanac/core/assets/galaxy-map/station-abandoned.svg?url&no-inline';
import stationDamaged from '@elite-dangerous-almanac/core/assets/galaxy-map/station-damaged.svg?url&no-inline';
import stationRepairing from '@elite-dangerous-almanac/core/assets/galaxy-map/station-repairing.svg?url&no-inline';
import stationUnderAttack from '@elite-dangerous-almanac/core/assets/galaxy-map/station-under-attack.svg?url&no-inline';
import titan from '@elite-dangerous-almanac/core/assets/galaxy-map/titan.svg?url&no-inline';
import waypoint from '@elite-dangerous-almanac/core/assets/galaxy-map/waypoint.svg?url&no-inline';

/** The largest number of icons one record holds. */
export const MAX_ICONS = 4;

/** One icon of a record, resolved to what the overlay draws. */
export interface ResolvedIcon {
  /** Where the browser loads the vector from. The library never fetches it. */
  readonly url: string;
  /** The colour of the arrow under the lowest icon. Each part is 0 to 255. */
  readonly color: readonly [number, number, number];
}

/**
 * One entry of a record's `icons`. A string names a built-in symbol; an object names the
 * host's own vector and the colour of its arrow. The colour is required, because the
 * library draws the arrow and reads no colour out of a file it does not parse.
 */
export type SystemIconInput =
  string | { readonly url: string; readonly color: readonly [number, number, number] };

/** Why the reader refused a record's `icons`. */
export type IconRejectReason = 'bad-icon' | 'unknown-icon';

/** The vector of each catalogue symbol, as a URL beside this module. */
const VECTOR_URLS: Readonly<Record<string, string>> = {
  bookmark,
  'community-goal': communityGoal,
  'conflict-zone': conflictZone,
  destination,
  engineer,
  'fleet-carrier': fleetCarrier,
  'front-line': frontLine,
  mission,
  'squadron-carrier': squadronCarrier,
  'starter-zone': starterZone,
  'station-abandoned': stationAbandoned,
  'station-damaged': stationDamaged,
  'station-repairing': stationRepairing,
  'station-under-attack': stationUnderAttack,
  titan,
  waypoint,
};

/** The three parts of an `#RRGGBB` string the catalogue reports a colour as. */
function readHexColor(hex: string): [number, number, number] {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

/**
 * Three finite numbers from 0 to 255, or null. `src/scene-data/shapes.ts` and
 * `src/scene-data/real-systems.ts` each hold the same reader for their own colours.
 */
function readColor(value: unknown): [number, number, number] | null {
  if (!Array.isArray(value) || value.length !== 3) return null;
  const parts: number[] = [];
  for (const part of value) {
    if (typeof part !== 'number' || !Number.isFinite(part)) return null;
    if (part < 0 || part > 255) return null;
    parts.push(part);
  }
  return [parts[0] as number, parts[1] as number, parts[2] as number];
}

/**
 * The built-in icons, by symbol. The table is built from the catalogue, so the symbols
 * are the catalogue's own. A catalogue symbol this module holds no import for is left
 * out, which makes it an unknown symbol rather than an icon with no URL, and
 * `tests/marker-icon-catalogue.test.ts` fails on it.
 */
const builtIn = new Map<string, ResolvedIcon>();
for (const marker of GALAXY_MAP_MARKERS) {
  const url = VECTOR_URLS[marker.symbol];
  if (url === undefined) continue;
  builtIn.set(marker.symbol, { url, color: readHexColor(marker.color) });
}

/** The built-in icons, by symbol. */
export const BUILT_IN_ICONS: ReadonlyMap<string, ResolvedIcon> = builtIn;

/**
 * The icons of a record, resolved, or the reason the record is rejected. A bad icon
 * rejects the record where a bad image is dropped: an icon list is a short list a host
 * writes by hand, so a misspelt symbol is a mistake to report and not a value to guess
 * at.
 *
 * `safeUrl` is the same rule the record images hold. It comes in as an argument, so this
 * module imports nothing from `real-systems.ts` and the two do not make a cycle.
 */
export function readIcons(
  value: unknown,
  safeUrl: (url: string) => boolean,
): ResolvedIcon[] | IconRejectReason {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return 'bad-icon';
  if (value.length > MAX_ICONS) return 'bad-icon';

  const icons: ResolvedIcon[] = [];
  for (const entry of value) {
    if (typeof entry === 'string') {
      const icon = builtIn.get(entry.trim().toLowerCase());
      if (icon === undefined) return 'unknown-icon';
      icons.push(icon);
      continue;
    }
    if (typeof entry !== 'object' || entry === null) return 'bad-icon';
    const source = entry as Record<string, unknown>;
    const url = source['url'];
    if (typeof url !== 'string' || url.length === 0) return 'bad-icon';
    if (!safeUrl(url)) return 'bad-icon';
    const color = readColor(source['color']);
    if (color === null) return 'bad-icon';
    icons.push({ url, color });
  }
  return icons;
}
