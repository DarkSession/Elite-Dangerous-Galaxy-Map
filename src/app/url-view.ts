// Reads the view from the URL fragment and writes it back.
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

/** Turns a view into a URL fragment, without the leading `#`. */
export function formatViewFragment(view: View): string {
  const cursor = view.cursor.map(format).join(',');
  return `c=${cursor}&d=${format(view.distance)}&p=${format(view.pitch)}&y=${format(view.yaw)}`;
}

/**
 * Reads a view from a URL fragment. Missing or unreadable parts fall back to the
 * default view, and every limit is applied.
 */
export function parseViewFragment(fragment: string): View {
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
  /** Writes the fragment. The default replaces the fragment of the page URL. */
  readonly write?: (fragment: string) => void;
  /** Reads the clock. The default is `Date.now`. */
  readonly now?: () => number;
}

function defaultWrite(fragment: string): void {
  const url = `${window.location.pathname}${window.location.search}#${fragment}`;
  window.history.replaceState(null, '', url);
}

/** Writes the view to the URL fragment at most once every 500 ms. */
export function createFragmentWriter(
  view: View,
  options: FragmentWriterOptions = {},
): FragmentWriter {
  const write = options.write ?? defaultWrite;
  const now = options.now ?? Date.now;
  let lastWrite = Number.NEGATIVE_INFINITY;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const send = (): void => {
    timer = null;
    lastWrite = now();
    write(formatViewFragment(view));
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
