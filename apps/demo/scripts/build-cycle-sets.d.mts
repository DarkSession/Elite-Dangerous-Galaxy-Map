// The types of what the cycle build exports. The script itself is JavaScript, because
// node runs it directly with no build step. `tests/cycle-sets.test.ts` imports the passes,
// so it reads these.
import type {
  CategoryInput,
  SystemRecordInput,
} from '@elite-dangerous-almanac/galaxy-map';

/** One cycle file of the archive, as the build reads its name and its listing entry. */
export interface CycleFile {
  readonly cycle: number;
  readonly week: string;
  readonly name: string;
  readonly url: string;
}

/** One row of the manifest the cycles page reads. */
export interface CycleRow {
  readonly cycle: number;
  readonly week: string;
  readonly label: string;
  readonly group: string;
  readonly description: string;
  readonly count: number;
}

/** One converted cycle, as `convertOverwatch` gives it back. */
export interface CycleSet {
  readonly source: string;
  readonly licence: string;
  readonly categories: readonly CategoryInput[];
  readonly systems: readonly SystemRecordInput[];
}

export declare const ARCHIVE_CONTENTS_URL: string;
export declare const MAX_SYSTEMS: number;
export declare const MAX_DATASETS: number;

export declare function readCycleName(
  name: string,
): { cycle: number; week: string } | null;

export declare function readCycleList(entries: unknown, bound?: number): CycleFile[];

export declare function cycleRow(
  entry: { cycle: number; week: string },
  set: CycleSet,
): CycleRow;

export declare function convertCycle(
  entry: { cycle: number },
  dump: unknown,
  bound?: number,
): CycleSet | null;

export declare function cycleFileName(cycle: number): string;

/** The answer the archive reader takes, which is the part of `Response` it reads. */
export interface ArchiveAnswer {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

export declare function readArchiveList(
  read?: (url: string, init?: unknown) => Promise<ArchiveAnswer>,
): Promise<unknown>;
