// The fragment format of a view, and the writer the demo page throttles it with.
//
// `encodeView`, `decodeView` and `decodeGrid` are part of the library's public surface, so
// a host gets a deep link without writing a parser. They are pure functions of their
// arguments: they read no `window.location` and they hold no map. A host that has
// restricted the browsable space passes a decoded view to `setView`, which applies the
// bounds as every other view change does.
import { createDefaultView, normaliseView } from '../camera/view';
import type { View } from '../camera/view';

/** The shortest time between two writes to the fragment, in milliseconds. */
export const FRAGMENT_THROTTLE_MS = 500;

const DECIMALS = 5;

function format(value: number): string {
  return String(Number(value.toFixed(DECIMALS)));
}

function readNumber(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Turns a view into the text of a URL fragment, without the leading `#`. `grid` writes the
 * coordinate grid switch as `&g=1` or `&g=0`. The field is written only when the caller
 * gives a boolean, so a page that does not use the grid writes the four view fields
 * alone and no reader of the old format breaks.
 */
export function encodeView(view: View, grid?: boolean): string {
  const cursor = view.cursor.map(format).join(',');
  const fields = `c=${cursor}&d=${format(view.distance)}&p=${format(view.pitch)}&y=${format(view.yaw)}`;
  if (typeof grid !== 'boolean') return fields;
  return `${fields}&g=${grid ? '1' : '0'}`;
}

/**
 * Reads the coordinate grid switch from a URL fragment: true for `g=1`, false for `g=0`
 * and null for a fragment that names no readable `g`. A null leaves the switch where the
 * page's own default put it.
 */
export function decodeGrid(fragment: string): boolean | null {
  const text = fragment.startsWith('#') ? fragment.slice(1) : fragment;
  if (text.length === 0) return null;
  const value = new URLSearchParams(text).get('g');
  if (value === '1') return true;
  if (value === '0') return false;
  return null;
}

/**
 * Reads a view from a URL fragment, with or without the leading `#`. Missing or unreadable
 * parts fall back to the default view, and the model limits are applied: the model bounds
 * on the cursor, 10 to 120,000 light years on the distance, -89 to 89 degrees on the pitch
 * and a wrap on the yaw.
 *
 * It applies no map's browsable bounds, because it holds no map.
 */
export function decodeView(fragment: string): View {
  const view = createDefaultView();
  const text = fragment.startsWith('#') ? fragment.slice(1) : fragment;
  if (text.length === 0) return view;

  const parameters = new URLSearchParams(text);
  const cursor = parameters.get('c');
  if (cursor !== null) {
    const parts = cursor.split(',');
    if (parts.length === 3) {
      view.cursor = [
        readNumber(parts[0], view.cursor[0]),
        readNumber(parts[1], view.cursor[1]),
        readNumber(parts[2], view.cursor[2]),
      ];
    }
  }
  view.distance = readNumber(parameters.get('d') ?? undefined, view.distance);
  view.pitch = readNumber(parameters.get('p') ?? undefined, view.pitch);
  view.yaw = readNumber(parameters.get('y') ?? undefined, view.yaw);
  return normaliseView(view);
}

/** What `createFragmentWriter` gives back. */
export interface FragmentWriter {
  /** Asks for a write. The writer holds it back to one write per 500 ms. */
  schedule(): void;
  /** Writes at once, if a write is waiting. */
  flush(): void;
  /** Drops a waiting write. */
  dispose(): void;
}

/** Options for `createFragmentWriter`. */
export interface FragmentWriterOptions {
  /**
   * Writes the fragment. The caller gives it, because the page owns the URL and the
   * library must not read or write `window.location`.
   */
  readonly write: (fragment: string) => void;
  /** Reads the clock. The default is `Date.now`. */
  readonly now?: () => number;
  /**
   * Reads the coordinate grid switch at each write. The writer holds no switch of its
   * own, because a write may come 500 ms after the move that asked for it. A writer with
   * no reader writes the four view fields alone.
   */
  readonly grid?: () => boolean;
}

/**
 * Writes the view, and the coordinate grid switch when the options read one, to the URL
 * fragment at most once every 500 ms.
 */
export function createFragmentWriter(
  view: View,
  options: FragmentWriterOptions,
): FragmentWriter {
  const write = options.write;
  const now = options.now ?? Date.now;
  const readGrid = options.grid;
  let lastWrite = Number.NEGATIVE_INFINITY;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const send = (): void => {
    timer = null;
    lastWrite = now();
    write(encodeView(view, readGrid?.()));
  };

  return {
    schedule(): void {
      if (timer !== null) return;
      const wait = FRAGMENT_THROTTLE_MS - (now() - lastWrite);
      if (wait <= 0) {
        send();
      } else {
        timer = setTimeout(send, wait);
      }
    },
    flush(): void {
      if (timer !== null) {
        clearTimeout(timer);
        send();
      }
    },
    dispose(): void {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}
