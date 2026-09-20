// The reader of the `lockedOptions` setting, and the list of switches the panel builds.
// The browser suite reads the switches on the screen.
import { describe, expect, test } from 'vitest';
import type { GalaxyMap } from '../app/create-map';
import { createOptionsPanel, readLockedOptions } from './options-panel';
import type { OptionsPanel } from './options-panel';
import type { HudMapOption } from './types';

describe('readLockedOptions', () => {
  test('keeps the names the panel holds', () => {
    const locked = readLockedOptions(['grid', 'shapes', 'nebulae']);
    expect([...locked].sort()).toEqual(['grid', 'nebulae', 'shapes']);
  });

  test('ignores a name the panel does not hold', () => {
    const locked = readLockedOptions(['datasets', 7, null, 'grid']);
    expect([...locked]).toEqual(['grid']);
  });

  test('ignores a list that is not an array', () => {
    expect(readLockedOptions('grid').size).toBe(0);
    expect(readLockedOptions(undefined).size).toBe(0);
    expect(readLockedOptions({ grid: true }).size).toBe(0);
  });
});

// The panel itself is read over a fake document, because the unit run has no DOM. The
// browser suite reads the real switches; this reads the list the panel builds them from.

/** One element of the fake document. */
interface FakeElement {
  readonly tag: string;
  className: string;
  type?: string;
  textContent: string | null;
  readonly dataset: Record<string, string>;
  readonly children: FakeElement[];
  readonly attributes: Map<string, string>;
  readonly listeners: Map<string, () => void>;
  setAttribute(name: string, value: string): void;
  getAttribute(name: string): string | null;
  addEventListener(name: string, listener: () => void): void;
  appendChild(child: FakeElement): FakeElement;
  append(...nodes: FakeElement[]): void;
}

/** A document that makes fake elements. */
function fakeDocument(): Document {
  const make = (tag: string): FakeElement => {
    const element: FakeElement = {
      tag,
      className: '',
      textContent: null,
      dataset: {},
      children: [],
      attributes: new Map<string, string>(),
      listeners: new Map<string, () => void>(),
      setAttribute(name: string, value: string): void {
        element.attributes.set(name, value);
      },
      getAttribute(name: string): string | null {
        return element.attributes.get(name) ?? null;
      },
      addEventListener(name: string, listener: () => void): void {
        element.listeners.set(name, listener);
      },
      appendChild(child: FakeElement): FakeElement {
        element.children.push(child);
        return child;
      },
      append(...nodes: FakeElement[]): void {
        element.children.push(...nodes);
      },
    };
    return element;
  };
  return { createElement: make } as unknown as Document;
}

/** The state a fake map holds, which the switches read and write. */
interface MapState {
  regions: boolean;
  systemNames: boolean;
  systemIcons: boolean;
  grid: boolean;
  shapes: boolean;
  nebulae: boolean;
  hasNebulae: boolean;
}

/** A map handle that carries the six switches and nothing else. */
function fakeMap(state: MapState): GalaxyMap {
  return {
    areRegionsVisible: () => state.regions,
    setRegionsVisible: (on: boolean) => {
      state.regions = on;
    },
    areSystemNamesVisible: () => state.systemNames,
    setSystemNamesVisible: (on: boolean) => {
      state.systemNames = on;
    },
    areSystemIconsVisible: () => state.systemIcons,
    setSystemIconsVisible: (on: boolean) => {
      state.systemIcons = on;
    },
    isGridVisible: () => state.grid,
    setGridVisible: (on: boolean) => {
      state.grid = on;
    },
    areShapesVisible: () => state.shapes,
    setShapesVisible: (on: boolean) => {
      state.shapes = on;
    },
    hasNebulae: () => state.hasNebulae,
    areNebulaeVisible: () => state.nebulae,
    setNebulaeVisible: (on: boolean) => {
      state.nebulae = on;
    },
  } as unknown as GalaxyMap;
}

/** The state a map with every switch on and no nebula source starts in. */
function startState(): MapState {
  return {
    regions: true,
    systemNames: false,
    systemIcons: true,
    grid: false,
    shapes: true,
    nebulae: true,
    hasNebulae: false,
  };
}

/** The switches of a panel, in the order it shows them. */
function switchesOf(panel: OptionsPanel): FakeElement[] {
  const element = panel.element as unknown as FakeElement;
  return (element.children[1]?.children ?? []) as FakeElement[];
}

/** The names of the switches of a panel, in the order it shows them. */
function namesOf(panel: OptionsPanel): string[] {
  return switchesOf(panel).map((button) => button.dataset['name'] ?? '');
}

describe('the switches the panel builds', () => {
  test('puts the system icons switch between the names and the grid', () => {
    const panel = createOptionsPanel(fakeDocument(), fakeMap(startState()), new Set());

    expect(namesOf(panel as OptionsPanel)).toEqual([
      'galactic-regions',
      'system-names',
      'system-icons',
      'coordinate-grid',
      'shapes',
    ]);
    expect(switchesOf(panel as OptionsPanel)[2]?.children[0]?.textContent).toBe(
      'System icons',
    );
  });

  test('adds the nebulae switch last where the map holds a source', () => {
    const state = startState();
    state.hasNebulae = true;
    const panel = createOptionsPanel(fakeDocument(), fakeMap(state), new Set());

    expect(namesOf(panel as OptionsPanel)).toEqual([
      'galactic-regions',
      'system-names',
      'system-icons',
      'coordinate-grid',
      'shapes',
      'nebulae',
    ]);
  });

  test('opens the system icons switch on the state the map is in', () => {
    const on = createOptionsPanel(fakeDocument(), fakeMap(startState()), new Set());
    const offState = startState();
    offState.systemIcons = false;
    const off = createOptionsPanel(fakeDocument(), fakeMap(offState), new Set());

    expect(switchesOf(on as OptionsPanel)[2]?.getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(switchesOf(off as OptionsPanel)[2]?.getAttribute('aria-pressed')).toBe(
      'false',
    );
  });

  test('turns the icons off and on again through the switch', () => {
    const state = startState();
    const panel = createOptionsPanel(fakeDocument(), fakeMap(state), new Set());
    const button = switchesOf(panel as OptionsPanel)[2];

    button?.listeners.get('click')?.();
    expect(state.systemIcons).toBe(false);
    expect(button?.getAttribute('aria-pressed')).toBe('false');

    button?.listeners.get('click')?.();
    expect(state.systemIcons).toBe(true);
    expect(button?.getAttribute('aria-pressed')).toBe('true');
  });

  test('draws no switch for a locked system icons option', () => {
    const panel = createOptionsPanel(
      fakeDocument(),
      fakeMap(startState()),
      new Set<HudMapOption>(['grid', 'shapes']),
    );

    expect(namesOf(panel as OptionsPanel)).toEqual([
      'galactic-regions',
      'system-names',
      'system-icons',
    ]);
  });

  test('drops the panel where the five names are locked and there is no nebula', () => {
    const locked = new Set<HudMapOption>([
      'regions',
      'systemNames',
      'systemIcons',
      'grid',
      'shapes',
    ]);
    const withSource = startState();
    withSource.hasNebulae = true;

    expect(
      createOptionsPanel(fakeDocument(), fakeMap(startState()), locked),
    ).toBeNull();
    expect(
      namesOf(
        createOptionsPanel(fakeDocument(), fakeMap(withSource), locked) as OptionsPanel,
      ),
    ).toEqual(['nebulae']);
  });
});
