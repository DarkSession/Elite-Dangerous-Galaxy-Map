// The camera a host asks for, and the one reader that reads it.
//
// Two options carry the same five fields: the `startView` of `createGalaxyMap` and the
// `view` of a dataset entry, which adds `fit`. One reader reads both, so the two can
// never take a field a different way.
import { readPoint } from '../scene-data/read-field';

/**
 * The camera a host asks the map to open at. `cursor` and `system` name the same field
 * two ways, and `cursor` wins where the host gives both.
 */
export interface StartView {
  /** The point the camera centres on, in game coordinates. */
  readonly cursor?: readonly [number, number, number];
  /**
   * The identity of a system to centre on: the `id64` where the record carries one, and
   * the name where it does not. The host adds its records after the map is built, so the
   * map holds the identity and applies it in the first frame the set holds the record.
   */
  readonly system?: string;
  /** The distance from the cursor to the camera, in light years. */
  readonly distance?: number;
  /** The camera's angle around the cursor, in degrees. */
  readonly yaw?: number;
  /** The camera's elevation above the galactic plane, in degrees. */
  readonly pitch?: number;
}

/** A start view with the `fit` a dataset entry may add. */
export interface ViewInput extends StartView {
  /** Centres on the box of the set and frames the whole of it. */
  readonly fit?: 'systems';
}

/**
 * Reads a host's view input, or null where it cannot be read. An unreadable field makes
 * the whole setting unreadable, so a map never opens at half of what the host asked for
 * and a load never does either.
 */
export function readViewInput(value: unknown): ViewInput | null {
  if (value === null || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  const view: {
    fit?: 'systems';
    cursor?: [number, number, number];
    system?: string;
    distance?: number;
    yaw?: number;
    pitch?: number;
  } = {};
  if (source['fit'] !== undefined) {
    if (source['fit'] !== 'systems') return null;
    view.fit = 'systems';
  }
  if (source['cursor'] !== undefined) {
    const cursor = readPoint(source['cursor']);
    if (cursor === null) return null;
    view.cursor = cursor;
  }
  if (source['system'] !== undefined) {
    if (typeof source['system'] !== 'string' || source['system'] === '') return null;
    view.system = source['system'];
  }
  for (const field of ['distance', 'yaw', 'pitch'] as const) {
    const held = source[field];
    if (held === undefined) continue;
    if (typeof held !== 'number' || !Number.isFinite(held)) return null;
    view[field] = held;
  }
  return view;
}
