import { describe, expect, test, vi } from 'vitest';
import {
  CANCELLED_MESSAGE,
  createDatasetState,
  MAX_DATASETS,
  readDatasets,
} from './datasets';
import type { DatasetContent, DatasetEntry, DatasetView } from './datasets';
import type { BrowseBounds } from '../camera/view';

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

/**
 * A writer that counts its calls, as the map's own writer does the reads. `inside` is
 * what `viewInsideBounds` answers, which is false for every test that reads the old
 * behaviour.
 */
function writer(inside = false): {
  write: (content: DatasetContent) => {
    categories: { added: number; replaced: number; rejected: [] };
    systems: { added: number; replaced: number; rejected: [] };
  };
  setBounds: (bounds: BrowseBounds | null) => void;
  applyView: (view: DatasetView) => void;
  viewInsideBounds: (bounds: BrowseBounds | null) => boolean;
  calls: DatasetContent[];
  /** Every `setBounds` the state machine made, in order. */
  bounds: (BrowseBounds | null)[];
  /** Every `applyView` the state machine made, in order. */
  views: DatasetView[];
  /** Every `viewInsideBounds` the state machine made, in order. */
  asked: (BrowseBounds | null)[];
  /** The name of each `viewInsideBounds` and `setBounds` call, in order. */
  order: string[];
} {
  const calls: DatasetContent[] = [];
  const bounds: (BrowseBounds | null)[] = [];
  const views: DatasetView[] = [];
  const asked: (BrowseBounds | null)[] = [];
  const order: string[] = [];
  return {
    calls,
    bounds,
    views,
    asked,
    order,
    write(content: DatasetContent) {
      calls.push(content);
      return {
        categories: { added: content.categories.length, replaced: 0, rejected: [] },
        systems: { added: content.systems.length, replaced: 0, rejected: [] },
      };
    },
    setBounds(value: BrowseBounds | null) {
      order.push('setBounds');
      bounds.push(value);
    },
    applyView(view: DatasetView) {
      views.push(view);
    },
    viewInsideBounds(value: BrowseBounds | null) {
      order.push('viewInsideBounds');
      asked.push(value);
      return inside;
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

  test('reads the bounds and the view of an entry', () => {
    const report = readDatasets([
      {
        id: 'one',
        label: 'One',
        bounds: { mode: 'auto', marginLy: 500 },
        view: { fit: 'systems', pitch: 60 },
        load: () => EMPTY,
      },
    ]);

    expect(report.entries[0]).toMatchObject({
      bounds: { mode: 'auto', marginLy: 500 },
      view: { fit: 'systems', pitch: 60 },
    });
  });

  test('keeps an entry whose bounds and whose view it cannot read', () => {
    const report = readDatasets([
      { id: 'one', label: 'One', bounds: 'auto', view: 4, load: () => EMPTY },
    ]);

    expect(report.rejected).toEqual([]);
    expect(report.entries).toHaveLength(1);
    expect(report.entries[0]).not.toHaveProperty('bounds');
    expect(report.entries[0]).not.toHaveProperty('view');
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

  test('writes the bounds and the view of the entry that loaded', async () => {
    const work = writer();
    const state = createDatasetState({
      datasets: [
        entry('framed', {
          bounds: { mode: 'auto' },
          view: { fit: 'systems' },
        } as Partial<DatasetEntry>),
        entry('plain'),
      ],
      ...work,
    });
    // The listener reads what the two calls wrote, so the order is a reading and not a
    // claim: both run before the announce.
    const seen: number[] = [];
    state.onDatasetChange(() => seen.push(work.bounds.length));

    await state.loadDataset('framed');

    expect(work.bounds).toEqual([{ mode: 'auto' }]);
    expect(work.views).toEqual([{ fit: 'systems' }]);
    expect(seen).toEqual([1]);

    // An entry that names none restores the map's own option, and leaves the camera.
    await state.loadDataset('plain');

    expect(work.bounds).toEqual([{ mode: 'auto' }, null]);
    expect(work.views).toHaveLength(1);
  });

  test('holds the entry view at start where the options name a start view', async () => {
    const framed = entry('framed', {
      view: { fit: 'systems' },
    } as Partial<DatasetEntry>);
    const held = writer();
    const withLink = createDatasetState({
      datasets: [framed],
      hasStartView: true,
      ...held,
    });

    await withLink.startLoad();

    expect(held.views).toEqual([]);
    // The bounds are not the deep link's, so they are written all the same.
    expect(held.bounds).toEqual([null]);

    // A later load of the same entry takes the view, and so does a start load on a map
    // whose options named no start view.
    await withLink.loadDataset('framed');
    expect(held.views).toEqual([{ fit: 'systems' }]);

    const plain = writer();
    const noLink = createDatasetState({ datasets: [framed], ...plain });
    await noLink.startLoad();
    expect(plain.views).toEqual([{ fit: 'systems' }]);
  });

  test('holds the view where the camera already shows the new set', async () => {
    const work = writer(true);
    const state = createDatasetState({
      datasets: [
        entry('one', {
          bounds: { mode: 'auto' },
          view: { fit: 'systems' },
        } as Partial<DatasetEntry>),
        entry('two', {
          bounds: { mode: 'auto' },
          view: { fit: 'systems' },
        } as Partial<DatasetEntry>),
      ],
      ...work,
    });
    await state.startLoad();
    expect(work.views).toEqual([{ fit: 'systems' }]);

    await state.loadDataset('two');

    // The held view calls `applyView` no times at all. A call with the view the camera
    // already holds would set the map's `jumped` flag and raise its announce.
    expect(work.views).toEqual([{ fit: 'systems' }]);
    // The load still writes the bounds and still reports the entry.
    expect(work.bounds).toEqual([{ mode: 'auto' }, { mode: 'auto' }]);
    expect(state.getLoadedDataset()?.id).toBe('two');
  });

  test('reads the camera before it writes the bounds', async () => {
    // Applying a bound clamps the camera into it, so a reading taken after `setBounds`
    // is true for every restricted bound and the rule would decide nothing.
    const work = writer(true);
    const state = createDatasetState({
      datasets: [
        entry('one', {
          bounds: { mode: 'auto' },
          view: { fit: 'systems' },
        } as Partial<DatasetEntry>),
      ],
      ...work,
    });

    await state.loadDataset('one');

    expect(work.order).toEqual(['viewInsideBounds', 'setBounds']);
    // The reading takes the same bounds the write takes.
    expect(work.asked).toEqual([{ mode: 'auto' }]);
  });

  test('applies the view where the entry names no bounds', async () => {
    const work = writer(true);
    const state = createDatasetState({
      datasets: [entry('one', { view: { fit: 'systems' } } as Partial<DatasetEntry>)],
      ...work,
    });

    await state.loadDataset('one');

    expect(work.views).toEqual([{ fit: 'systems' }]);
    // The space of such an entry is unrestricted, so no reading is taken at all.
    expect(work.asked).toEqual([]);
  });

  test('applies the view where the camera is outside the new bounds', async () => {
    const work = writer(false);
    const state = createDatasetState({
      datasets: [
        entry('one', {
          bounds: { mode: 'auto' },
          view: { fit: 'systems' },
        } as Partial<DatasetEntry>),
      ],
      ...work,
    });

    await state.loadDataset('one');

    expect(work.asked).toEqual([{ mode: 'auto' }]);
    expect(work.views).toEqual([{ fit: 'systems' }]);
  });

  test('applies the view where the entry names a field beside fit', async () => {
    const beside: DatasetView[] = [
      { fit: 'systems', cursor: [1, 2, 3] },
      { fit: 'systems', system: 'Sol' },
      { fit: 'systems', distance: 500 },
      { fit: 'systems', yaw: 45 },
      { fit: 'systems', pitch: 60 },
      { cursor: [1, 2, 3] },
    ];

    for (const view of beside) {
      const work = writer(true);
      const state = createDatasetState({
        datasets: [
          entry('one', { bounds: { mode: 'auto' }, view } as Partial<DatasetEntry>),
        ],
        ...work,
      });

      await state.loadDataset('one');

      expect(work.views, `the view ${JSON.stringify(view)} is held`).toEqual([view]);
      // The field is read before the geometry, so such a load takes no reading.
      expect(work.asked).toEqual([]);
    }
  });

  test('applies the view on the start load', async () => {
    // The camera has no view the user chose yet, so the start load frames its set even
    // where all five conditions would otherwise hold.
    const work = writer(true);
    const state = createDatasetState({
      datasets: [
        entry('one', {
          bounds: { mode: 'auto' },
          view: { fit: 'systems' },
        } as Partial<DatasetEntry>),
      ],
      ...work,
    });

    await state.startLoad();

    expect(work.views).toEqual([{ fit: 'systems' }]);
    expect(work.asked).toEqual([]);
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
