// The field placement of the information panel, the reader of the `infoFields` option,
// and the two fields the panel writes again after it builds the grid. The browser suite
// reads the boxes the grid draws.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createInfoPanel, fieldsOf, readInfoFields } from './info-panel';
import type { InfoFieldSwitches } from './info-panel';
import type { SystemDetailValue } from './details';
import type { Lightbox } from './lightbox';
import type { HudInfoFields } from './types';
import type { GalaxyMap, MapView, RealSystem } from '../app/create-map';

/** Every worked-out field on, which is what a host that names none gets. */
const ALL_ON: InfoFieldSwitches = { distanceFromSol: true, range: true, region: true };

/** A record with the fields the test names and nothing else. */
function system(extra: Partial<RealSystem> = {}): RealSystem {
  return {
    name: 'Sol',
    position: [0, 0, 0],
    categories: ['A'],
    ...extra,
  } as RealSystem;
}

/** The label and the width of each field, in order. */
function placement(
  switches: InfoFieldSwitches,
  extra: Partial<RealSystem> = {},
  values: readonly SystemDetailValue[] = [],
): [string, boolean][] {
  return fieldsOf(system(extra), 0, switches, values).map((field) => [
    field.label,
    field.wide === true,
  ]);
}

describe('readInfoFields', () => {
  test('leaves every field on by default', () => {
    expect(readInfoFields(undefined)).toEqual(ALL_ON);
    expect(readInfoFields({})).toEqual(ALL_ON);
  });

  test('takes the default for a value that is not a boolean', () => {
    expect(readInfoFields({ range: 'no' as never })).toEqual(ALL_ON);
  });

  test('turns off the field the host names false', () => {
    expect(readInfoFields({ distanceFromSol: false, region: false })).toEqual({
      distanceFromSol: false,
      range: true,
      region: false,
    });
  });
});

describe('the field placement', () => {
  test('gives the position both columns and the two distances one row', () => {
    expect(placement(ALL_ON)).toEqual([
      ['POSITION', true],
      ['DISTANCE FROM SOL', false],
      ['RANGE', false],
      ['REGION', true],
    ]);
  });

  test('leaves the last of an odd count of later fields alone on its row', () => {
    const odd = placement(ALL_ON, { primaryStar: 'G2 V' });
    expect(odd[odd.length - 1]).toEqual(['PRIMARY STAR', true]);
    const even = placement(ALL_ON, { primaryStar: 'G2 V', allegiance: 'Federation' });
    expect(even.slice(4)).toEqual([
      ['PRIMARY STAR', false],
      ['ALLEGIANCE', false],
    ]);
  });

  test('leaves no empty cell with the distance off', () => {
    expect(placement({ ...ALL_ON, distanceFromSol: false })).toEqual([
      ['POSITION', true],
      ['RANGE', true],
      ['REGION', true],
    ]);
  });

  test('leaves no empty cell with the range off', () => {
    expect(placement({ ...ALL_ON, range: false })).toEqual([
      ['POSITION', true],
      ['DISTANCE FROM SOL', true],
      ['REGION', true],
    ]);
  });

  test('leaves no empty cell with the region off', () => {
    expect(placement({ ...ALL_ON, region: false })).toEqual([
      ['POSITION', true],
      ['DISTANCE FROM SOL', false],
      ['RANGE', false],
    ]);
    expect(placement({ ...ALL_ON, region: false }, { primaryStar: 'G2 V' })).toEqual([
      ['POSITION', true],
      ['DISTANCE FROM SOL', false],
      ['RANGE', false],
      ['PRIMARY STAR', true],
    ]);
  });

  test('holds the position alone with the three fields off', () => {
    const off = { distanceFromSol: false, range: false, region: false };
    expect(placement(off)).toEqual([['POSITION', true]]);
    expect(placement(off, { allegiance: 'Federation', population: 100 })).toEqual([
      ['POSITION', true],
      ['ALLEGIANCE', false],
      ['POPULATION', false],
    ]);
  });

  test('adds the host values after the fields of the record', () => {
    const fields = fieldsOf(system({ primaryStar: 'G2 V' }), 0, ALL_ON, [
      { label: 'FACTION', value: 'Pilots Federation' },
      { label: 'SYSTEM ADDRESS', value: '2871051900826', copy: '2871051900826' },
    ]);
    expect(fields.map((field) => field.label).slice(4)).toEqual([
      'PRIMARY STAR',
      'FACTION',
      'SYSTEM ADDRESS',
    ]);
    // The host's button carries the entry's label as its key, so its tick does not
    // collide with the position button's.
    expect(fields[6]?.copy).toEqual({
      text: '2871051900826',
      name: 'Copy SYSTEM ADDRESS',
      key: 'SYSTEM ADDRESS',
    });
    expect(fields[5]?.copy).toBeUndefined();
  });
});

// The live fields are read over a fake document, because the unit run has no DOM. The
// fake holds what the panel builds and nothing more.

/** One element of the fake document. */
interface FakeElement {
  className: string;
  textContent: string | null;
  hidden: boolean;
  type: string;
  title: string;
  readonly dataset: Record<string, string>;
  readonly children: FakeElement[];
  readonly classList: { add(name: string): void };
  setAttribute(name: string, value: string): void;
  addEventListener(name: string, listener: () => void): void;
  appendChild(child: FakeElement): FakeElement;
  append(...nodes: FakeElement[]): void;
  replaceChildren(...nodes: FakeElement[]): void;
  remove(): void;
}

/** A document that makes fake elements and holds no focus. */
function fakeDocument(): Document {
  const doc = { activeElement: null } as { activeElement: null };
  const make = (): FakeElement => {
    const element: FakeElement = {
      className: '',
      textContent: null,
      hidden: false,
      type: '',
      title: '',
      dataset: {},
      children: [],
      classList: {
        add(name: string): void {
          element.className = `${element.className} ${name}`.trim();
        },
      },
      setAttribute(): void {},
      addEventListener(): void {},
      appendChild(child: FakeElement): FakeElement {
        element.children.push(child);
        return child;
      },
      append(...nodes: FakeElement[]): void {
        element.children.push(...nodes);
      },
      replaceChildren(...nodes: FakeElement[]): void {
        element.children.splice(0, element.children.length, ...nodes);
      },
      remove(): void {},
    };
    Object.defineProperty(element, 'ownerDocument', { value: doc });
    return element;
  };
  return Object.assign(doc, {
    createElement: make,
    createElementNS: make,
  }) as unknown as Document;
}

/** The label and the value text of each field of the panel's grid, in order. */
function gridFields(panel: HTMLElement): [string, string][] {
  const find = (element: FakeElement, name: string): FakeElement | null => {
    if (element.className.split(' ').includes(name)) return element;
    for (const child of element.children) {
      const found = find(child, name);
      if (found !== null) return found;
    }
    return null;
  };
  const grid = find(panel as unknown as FakeElement, 'gm-hud__field-grid');
  return (grid?.children ?? []).map((box) => [
    find(box, 'gm-hud__field-label')?.textContent ?? '',
    find(box, 'gm-hud__field-value')?.textContent ?? '',
  ]);
}

/**
 * Opens the panel on Sol with the one worked-out field on and a loader that gives one
 * host value with the same label. The view and the region name are the test's to move.
 */
function openPanel(
  fields: HudInfoFields,
  hostLabel: string,
  view: MapView,
  region: Promise<string | null>,
): { element: HTMLElement; update(): void } {
  const sol = system();
  const map = {
    getSelection: () => sol,
    getView: () => view,
    regionNameAtExact: () => region,
    categoryCount: () => 0,
  } as unknown as GalaxyMap;
  const panel = createInfoPanel(
    fakeDocument(),
    map,
    {
      infoFields: fields,
      details: () => ({ values: [{ label: hostLabel, value: 'host' }] }),
    },
    {} as Lightbox,
  );
  panel.rebuild();
  return panel;
}

describe('the live fields of the panel', () => {
  // `focusMark` asks whether the active element is an `HTMLElement`, and the unit run
  // has no such class.
  beforeEach(() => {
    vi.stubGlobal('HTMLElement', class {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('a host value labelled RANGE keeps its value', () => {
    const view: MapView = { cursor: [0, 0, 0], distance: 1000, yaw: 0, pitch: 35 };
    const panel = openPanel(
      { distanceFromSol: false, range: true, region: false },
      'RANGE',
      view,
      Promise.resolve(null),
    );
    view.cursor = [100, 0, 0];
    panel.update();
    expect(gridFields(panel.element).slice(1)).toEqual([
      ['RANGE', '100 LY'],
      ['RANGE', 'host'],
    ]);
  });

  test('a host value labelled REGION keeps its value', async () => {
    const view: MapView = { cursor: [0, 0, 0], distance: 1000, yaw: 0, pitch: 35 };
    const region = Promise.resolve('Inner Orion Spur');
    const panel = openPanel(
      { distanceFromSol: false, range: false, region: true },
      'REGION',
      view,
      region,
    );
    await region;
    await Promise.resolve();
    expect(gridFields(panel.element).slice(1)).toEqual([
      ['REGION', 'Inner Orion Spur'],
      ['REGION', 'host'],
    ]);
  });
});
