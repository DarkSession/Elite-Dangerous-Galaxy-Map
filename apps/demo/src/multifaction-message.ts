// The two messages the multifaction worker takes and gives. They sit in a module of
// their own, so the main thread reads the types without importing the worker.
import type { SystemRecordInput } from '@elite-dangerous-almanac/galaxy-map';

/** What the main thread sends: the body of the dump, and the factions to look for. */
export interface MultifactionRequest {
  /** The gzip body of the dump. The main thread moves it and does not read it. */
  readonly body: ReadableStream<Uint8Array>;
  /** The factions the reader wants, in the order the entry names them. */
  readonly wanted: readonly string[];
}

/** What the worker gives back: the records, or the message of the failure. */
export interface MultifactionAnswer {
  /** The records it read, where the read worked. */
  readonly records?: readonly SystemRecordInput[];
  /** Why the read failed, where it failed. */
  readonly error?: string;
}
