import { describe, expect, test, vi } from 'vitest';
import {
  CANCELLED_MESSAGE,
  createDatasetState,
  MAX_DATASETS,
  readDatasets,
} from './datasets';
import type { DatasetContent, DatasetEntry } from './datasets';

/** An empty set, which a `load` gives back when the test reads no record. */
const EMPTY: DatasetContent = { categories: [], systems: [] };

/** One well-formed entry. */
function entry(id: string, extra: Partial<DatasetEntry> = {}): DatasetEntry {
  return {
    id,
    label: id.toUpperCase(),
    load: () => EMPTY,
    ...extra,
  } as DatasetEntry;
}

/** A writer that counts its calls, as the map's own writer does the reads. */
function writer(): {
  write: (content: DatasetContent) => {
    categories: { added: number; replaced: number; rejected: [] };
    systems: { added: number; replaced: number; rejected: [] };
  };
  calls: DatasetContent[];
} {
  const calls: DatasetContent[] = [];
  return {
    calls,
    write(content: DatasetContent) {
      calls.push(content);
      return {
        categories: { added: content.categories.length, replaced: 0, rejected: [] },
        systems: { added: content.systems.length, replaced: 0, rejected: [] },
      };
    },
  };
}

describe('the catalog reader', () => {
  test('reads the entries in order and keeps every field', () => {
    const report = readDatasets([
      {
        id: 'one',
        label: 'One',
        collection: 'Canonn',
        region: 'Inner Orion Spur',
        description: 'The first set.',
        systemCount: 212,
        load: () => EMPTY,
      },
      entry('two'),
    ]);

    expect(report.rejected).toEqual([]);
    expect(report.entries.map((held) => held.id)).toEqual(['one', 'two']);
    expect(report.entries[0]).toMatchObject({
      id: 'one',
      label: 'One',
      collection: 'Canonn',
      region: 'Inner Orion Spur',
      description: 'The first set.',
      systemCount: 212,
    });
    expect(report.entries[1]).not.toHaveProperty('collection');
  });

  test('keeps two of five entries and reports the other three', () => {
    const report = readDatasets([
      entry('first'),
      { label: 'No id', load: () => EMPTY },
      { id: 'no-load', label: 'No load' },
      { id: 'first', label: 'The same id', load: () => EMPTY },
      entry('last'),
    ]);

    expect(report.entries.map((held) => held.id)).toEqual(['first', 'last']);
    expect(report.rejected).toEqual([
      { index: 1, reason: 'no-id' },
      { index: 2, reason: 'no-load' },
      { index: 3, reason: 'duplicate-id' },
    ]);
  });

  test('drops an entry with no label', () => {
    const report = readDatasets([{ id: 'one', load: () => EMPTY }]);

    expect(report.entries).toEqual([]);
    expect(report.rejected).toEqual([{ index: 0, reason: 'no-label' }]);
  });

  test('holds 256 entries and drops the rest', () => {
    const many = [];
    for (let index = 0; index < MAX_DATASETS + 3; index += 1) {
      many.push(entry(`set-${index}`));
    }

    const report = readDatasets(many);

    expect(report.entries).toHaveLength(MAX_DATASETS);
    expect(report.rejected).toEqual([
      { index: 256, reason: 'over-capacity' },
      { index: 257, reason: 'over-capacity' },
      { index: 258, reason: 'over-capacity' },
    ]);
  });

  test('gives an empty catalog for no option', () => {
    expect(readDatasets(undefined)).toEqual({ entries: [], rejected: [] });
  });
});

describe('the dataset state', () => {
  test('carries no load function in the reading of the catalog', () => {
    const state = createDatasetState({ datasets: [entry('one')], ...writer() });

    const reading = state.getDatasets();

    expect(reading).toHaveLength(1);
    expect(reading[0]).not.toHaveProperty('load');
    expect(state.getLoadedDataset()).toBeNull();
  });

  test('an unknown id rejects and changes nothing', async () => {
    const work = writer();
    const state = createDatasetState({ datasets: [entry('one')], ...work });

    await expect(state.loadDataset('nothing')).rejects.toThrow('nothing');
    expect(state.getLoadedDataset()).toBeNull();
    expect(work.calls).toEqual([]);
  });

  test('a load writes the set and raises the listeners', async () => {
    const work = writer();
    const state = createDatasetState({
      datasets: [entry('one'), entry('two')],
      ...work,
    });
    const heard: (string | null)[] = [];
    state.onDatasetChange((held) => heard.push(held?.id ?? null));

    await state.loadDataset('two');

    expect(state.getLoadedDataset()?.id).toBe('two');
    expect(work.calls).toHaveLength(1);
    expect(heard).toEqual(['two']);
  });

  test('a failed load leaves the loaded entry as it was', async () => {
    const work = writer();
    const failing = entry('bad', {
      load: () => Promise.reject(new Error('The host load failed.')),
    });
    const state = createDatasetState({ datasets: [entry('one'), failing], ...work });
    await state.loadDataset('one');

    await expect(state.loadDataset('bad')).rejects.toThrow('The host load failed.');

    expect(state.getLoadedDataset()?.id).toBe('one');
    expect(work.calls).toHaveLength(1);
  });

  test('the later load wins and the earlier one rejects as cancelled', async () => {
    const work = writer();
    const slow = entry('slow', {
      load: () =>
        new Promise<DatasetContent>((resolve) => {
          setTimeout(() => resolve(EMPTY), 20);
        }),
    });
    const state = createDatasetState({ datasets: [slow, entry('fast')], ...work });

    const first = state.loadDataset('slow');
    const second = state.loadDataset('fast');

    await expect(second).resolves.toBeDefined();
    await expect(first).rejects.toThrow(CANCELLED_MESSAGE);
    expect(state.getLoadedDataset()?.id).toBe('fast');
    expect(work.calls).toHaveLength(1);
  });

  test('the start load reads the named entry', async () => {
    const state = createDatasetState({
      datasets: [entry('one'), entry('two'), entry('three')],
      dataset: 'three',
      ...writer(),
    });

    await state.startLoad();

    expect(state.getLoadedDataset()?.id).toBe('three');
  });

  test('the start load reads the first entry when the option names none', async () => {
    const state = createDatasetState({
      datasets: [entry('one'), entry('two')],
      dataset: 'nothing',
      ...writer(),
    });

    await state.startLoad();

    expect(state.getLoadedDataset()?.id).toBe('one');
  });

  test('the start load settles after a failed load, and gives null with no catalog', async () => {
    const failing = entry('bad', {
      load: () => Promise.reject(new Error('The host load failed.')),
    });
    const state = createDatasetState({ datasets: [failing], ...writer() });

    await expect(state.startLoad()).resolves.toBeUndefined();
    expect(state.getLoadedDataset()).toBeNull();

    const empty = createDatasetState({ ...writer() });
    expect(empty.startLoad()).toBeNull();
  });

  test('an unsubscribed listener hears nothing more', async () => {
    const state = createDatasetState({
      datasets: [entry('one'), entry('two')],
      ...writer(),
    });
    const listener = vi.fn();
    const stop = state.onDatasetChange(listener);

    await state.loadDataset('one');
    stop();
    await state.loadDataset('two');

    expect(listener).toHaveBeenCalledTimes(1);
  });
});
