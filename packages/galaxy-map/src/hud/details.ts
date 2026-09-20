// What a host's `details` loader gives the information panel, and the reader that takes
// it. The answer may come from a network call the compiler does not see, so the reader
// drops what it cannot read and keeps the rest.
import type { RealSystem } from '../app/create-map';

/** One button the host adds to the information panel footer. */
export interface HudAction {
  /** The text on the button. */
  readonly label: string;
  /** What the host runs on a click. The library ignores what it returns. */
  onSelect(system: RealSystem): void;
}

/** One extra value a host gives the panel. */
export interface SystemDetailValue {
  /** The name of the value. It is required and it is not empty. */
  readonly label: string;
  /** Short text. The entry joins the field grid. */
  readonly value?: string;
  /** A body in the Markdown subset. The entry draws as its own section. */
  readonly markdown?: string;
  /** What a copy button beside `value` writes. A section carries none. */
  readonly copy?: string;
}

/** What a host's `details` loader returns. */
export interface SystemDetails {
  /** The description, in the Markdown subset. It replaces the record's own. */
  readonly description?: string;
  /** The extra values, in the order the panel shows them. */
  readonly values?: readonly SystemDetailValue[];
  /** The footer buttons, in the order the panel shows them. */
  readonly actions?: readonly HudAction[];
}

/**
 * How many entries the panel keeps. Twelve is the count the panel can show without the
 * grid running past the height of the panel at the smallest supported viewport.
 */
export const MAX_DETAIL_VALUES = 12;

/**
 * How many footer buttons the panel keeps. Six is the count the footer holds in one row
 * at the smallest supported viewport, beside the centre view button.
 */
export const MAX_DETAIL_ACTIONS = 6;

/** The value of one field of an object, or undefined for anything else. */
function fieldOf(value: object, name: string): unknown {
  return (value as Record<string, unknown>)[name];
}

/** The string a field holds, or undefined where the field is not a string. */
function stringOf(value: object, name: string): string | undefined {
  const held = fieldOf(value, name);
  return typeof held === 'string' ? held : undefined;
}

/**
 * Reads one entry, or null where the reader drops it. An entry that carries both a
 * `value` and a `markdown` draws as a section, because `markdown` is the longer form,
 * and a section carries no copy button.
 */
function readValue(entry: unknown): SystemDetailValue | null {
  if (typeof entry !== 'object' || entry === null) return null;
  const label = stringOf(entry, 'label');
  if (label === undefined || label.trim() === '') return null;
  const markdown = stringOf(entry, 'markdown');
  if (markdown !== undefined) return { label, markdown };
  const value = stringOf(entry, 'value');
  if (value === undefined) return null;
  const copy = stringOf(entry, 'copy');
  return copy === undefined ? { label, value } : { label, value, copy };
}

/**
 * Reads one footer button, or null where the reader drops it. A button with no label and
 * a button the panel cannot call are both dropped.
 */
function readAction(entry: unknown): HudAction | null {
  if (typeof entry !== 'object' || entry === null) return null;
  const label = stringOf(entry, 'label');
  if (label === undefined || label.trim() === '') return null;
  const onSelect = fieldOf(entry, 'onSelect');
  if (typeof onSelect !== 'function') return null;
  return { label, onSelect: onSelect as (system: RealSystem) => void };
}

/** Reads a list, drops the entries it cannot read, and keeps at most `cap` of them. */
function readList<Entry>(
  held: unknown,
  cap: number,
  read: (entry: unknown) => Entry | null,
): Entry[] {
  const kept: Entry[] = [];
  if (!Array.isArray(held)) return kept;
  for (const entry of held) {
    if (kept.length >= cap) break;
    const one = read(entry);
    if (one !== null) kept.push(one);
  }
  return kept;
}

/**
 * Reads what the loader returned. Anything the reader cannot read gives `{}`, and one
 * bad entry drops neither the rest of the list nor the description: one bad value is not
 * a reason to show the user nothing.
 */
export function readDetails(value: unknown): SystemDetails {
  if (typeof value !== 'object' || value === null) return {};
  const description = stringOf(value, 'description');
  const values = readList(fieldOf(value, 'values'), MAX_DETAIL_VALUES, readValue);
  const actions = readList(fieldOf(value, 'actions'), MAX_DETAIL_ACTIONS, readAction);
  const read: {
    description?: string;
    values?: readonly SystemDetailValue[];
    actions?: readonly HudAction[];
  } = {};
  if (description !== undefined) read.description = description;
  if (values.length > 0) read.values = values;
  if (actions.length > 0) read.actions = actions;
  return read;
}

/** True where the entry draws as its own section, and false where it joins the grid. */
export function isSection(entry: SystemDetailValue): boolean {
  return entry.markdown !== undefined;
}
