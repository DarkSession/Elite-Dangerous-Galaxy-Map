// The reader of what a host's `details` loader returns. It is pure, so it is read here
// with no DOM.
import { describe, expect, test } from 'vitest';
import { readDetails } from './details';

/** One well-formed grid entry, numbered so the order is readable. */
function good(order: number): Record<string, unknown> {
  return { label: `LABEL ${order}`, value: `value ${order}` };
}

/** One well-formed footer button, numbered so the order is readable. */
function goodAction(order: number): Record<string, unknown> {
  return { label: `ACTION ${order}`, onSelect: () => undefined };
}

describe('readDetails', () => {
  test('keeps the entries it can read', () => {
    const values: unknown[] = [
      { label: 'FACTION', value: 'Pilots Federation' },
      { label: 'HISTORY', markdown: 'One paragraph.' },
      { label: 'BOTH', value: 'short', markdown: 'long' },
      { label: 7, value: 'a number label' },
      { label: '   ', value: 'an empty label' },
      { label: 'ALONE' },
      'x',
    ];
    for (let order = 0; order < 12; order += 1) values.push(good(order));

    const read = readDetails({ values });
    const kept = read.values ?? [];
    expect(kept).toHaveLength(12);
    expect(kept[0]).toEqual({ label: 'FACTION', value: 'Pilots Federation' });
    expect(kept[1]).toEqual({ label: 'HISTORY', markdown: 'One paragraph.' });
    // An entry that carries both draws as a section, so the reader drops its `value`.
    expect(kept[2]).toEqual({ label: 'BOTH', markdown: 'long' });
    const labels = kept.map((entry) => entry.label);
    expect(labels).not.toContain('ALONE');
    expect(labels).not.toContain('   ');
    // Three good entries and the first nine of the twelve that follow them.
    expect(labels.slice(3)).toEqual([
      'LABEL 0',
      'LABEL 1',
      'LABEL 2',
      'LABEL 3',
      'LABEL 4',
      'LABEL 5',
      'LABEL 6',
      'LABEL 7',
      'LABEL 8',
    ]);
  });

  test('drops a wrongly typed description and keeps the entry', () => {
    const read = readDetails({ description: 7, values: [good(1)] });
    expect(read.description).toBeUndefined();
    expect(read.values).toEqual([good(1)]);
  });

  test('keeps a copy for a value and drops it for a section', () => {
    const read = readDetails({
      values: [
        { label: 'ADDRESS', value: '2871051900826', copy: '2871051900826' },
        { label: 'HISTORY', markdown: 'One paragraph.', copy: 'nothing' },
      ],
    });
    const kept = read.values ?? [];
    expect(kept[0]?.copy).toBe('2871051900826');
    expect(kept[1]?.copy).toBeUndefined();
  });

  test('keeps the actions it can read', () => {
    const log = (): void => undefined;
    const actions: unknown[] = [
      { label: 'LOG', onSelect: log },
      { label: 7, onSelect: log },
      { label: '   ', onSelect: log },
      { label: 'STRING', onSelect: 'x' },
      7,
    ];
    for (let order = 0; order < 6; order += 1) actions.push(goodAction(order));

    const read = readDetails({ actions });
    const kept = read.actions ?? [];
    expect(kept).toHaveLength(6);
    expect(kept[0]?.label).toBe('LOG');
    expect(kept[0]?.onSelect).toBe(log);
    // The one good entry and the first five of the six that follow it.
    expect(kept.map((entry) => entry.label)).toEqual([
      'LOG',
      'ACTION 0',
      'ACTION 1',
      'ACTION 2',
      'ACTION 3',
      'ACTION 4',
    ]);
  });

  test('gives an empty reading for what it cannot read', () => {
    expect(readDetails(null)).toEqual({});
    expect(readDetails('text')).toEqual({});
    expect(readDetails(undefined)).toEqual({});
    expect(readDetails({ values: 'one' })).toEqual({});
    expect(readDetails({ actions: 'one' })).toEqual({});
    expect(readDetails({ description: 'a', values: 'one' })).toEqual({
      description: 'a',
    });
  });
});
