// The map options panel: the galactic regions switch, the system names switch, the
// system icons switch, the coordinate grid switch, the shapes switch and, where the map
// holds nebulae, the nebulae switch. Each control shows the state the map is in, so a host that changes a
// setting through the handle moves the control with it.
//
// The panel builds its switches from one list. `lockedOptions` filters that list, and a
// locked option draws no switch: the user is never shown a control that does nothing.
// A map with no nebula source drops the nebulae switch by the same reading.
import type { GalaxyMap } from '../app/create-map';
import { make, makeButton, setPressed } from './dom';
import type { HudMapOption } from './types';

/** The names of the switches the panel can hold. */
const OPTION_NAMES: readonly HudMapOption[] = [
  'regions',
  'systemNames',
  'systemIcons',
  'grid',
  'shapes',
  'nebulae',
];

/** The map options panel of the HUD. */
export interface OptionsPanel {
  readonly element: HTMLElement;
  /** Writes the state each control shows, and writes only what changed. */
  update(): void;
}

/** One switch of the panel, before it is built. */
interface Toggle {
  /** The name the host locks it by. */
  readonly name: HudMapOption;
  /** What the element is identified by. */
  readonly key: string;
  /** The text beside the track. */
  readonly label: string;
  /** The state the map is in. */
  read(): boolean;
  /** Moves the map to the other state. */
  flip(): void;
}

/**
 * The names the host locked. A name the panel does not hold is ignored, and a list that
 * is not an array is ignored, because a setting the HUD cannot read takes the default.
 */
export function readLockedOptions(value: unknown): ReadonlySet<HudMapOption> {
  const locked = new Set<HudMapOption>();
  if (!Array.isArray(value)) return locked;
  for (const name of value as readonly unknown[]) {
    const held = OPTION_NAMES.find((one) => one === name);
    if (held !== undefined) locked.add(held);
  }
  return locked;
}

/**
 * The switches the panel can hold, in the order it shows them. The nebulae switch is
 * there only where the map holds a source it can read, which `hasNebulae` answers: a
 * switch that turned on a feature the map cannot draw would be a control that does
 * nothing.
 */
function togglesOf(map: GalaxyMap): Toggle[] {
  const toggles: Toggle[] = [
    {
      name: 'regions',
      key: 'galactic-regions',
      label: 'Galactic regions',
      read: () => map.areRegionsVisible(),
      flip: () => map.setRegionsVisible(!map.areRegionsVisible()),
    },
    {
      name: 'systemNames',
      key: 'system-names',
      label: 'System names',
      read: () => map.areSystemNamesVisible(),
      flip: () => map.setSystemNamesVisible(!map.areSystemNamesVisible()),
    },
    // The switch draws whether or not a record on the map names an icon, because a host
    // can add one at any time.
    {
      name: 'systemIcons',
      key: 'system-icons',
      label: 'System icons',
      read: () => map.areSystemIconsVisible(),
      flip: () => map.setSystemIconsVisible(!map.areSystemIconsVisible()),
    },
    {
      name: 'grid',
      key: 'coordinate-grid',
      label: 'Coordinate grid',
      read: () => map.isGridVisible(),
      flip: () => map.setGridVisible(!map.isGridVisible()),
    },
    // The switch draws whether or not the map holds a shape, because a host can add one
    // at any time.
    {
      name: 'shapes',
      key: 'shapes',
      label: 'Shapes',
      read: () => map.areShapesVisible(),
      flip: () => map.setShapesVisible(!map.areShapesVisible()),
    },
  ];
  if (map.hasNebulae()) {
    toggles.push({
      name: 'nebulae',
      key: 'nebulae',
      label: 'Nebulae',
      read: () => map.areNebulaeVisible(),
      flip: () => map.setNebulaeVisible(!map.areNebulaeVisible()),
    });
  }
  return toggles;
}

/** Builds one switch with its label and its track. */
function makeToggle(doc: Document, key: string, label: string): HTMLButtonElement {
  const button = makeButton(doc, 'gm-hud__toggle');
  button.dataset['name'] = key;
  const text = make(doc, 'span', 'gm-hud__toggle-label');
  text.textContent = label;
  const track = make(doc, 'span', 'gm-hud__track');
  track.appendChild(make(doc, 'span', 'gm-hud__knob'));
  button.append(text, track);
  return button;
}

/**
 * Builds the map options panel, or gives null where every switch the panel would hold is
 * locked. The HUD then builds no panel and the left column holds the category browser
 * alone.
 */
export function createOptionsPanel(
  doc: Document,
  map: GalaxyMap,
  locked: ReadonlySet<HudMapOption>,
): OptionsPanel | null {
  const held = togglesOf(map).filter((toggle) => !locked.has(toggle.name));
  if (held.length === 0) return null;

  const element = make(doc, 'section', 'gm-hud__panel gm-hud__options-panel');

  const header = make(doc, 'div', 'gm-hud__panel-header');
  const title = make(doc, 'h2', 'gm-hud__panel-title');
  title.textContent = 'MAP OPTIONS';
  header.appendChild(title);

  const body = make(doc, 'div', 'gm-hud__panel-body');
  const built = held.map((toggle) => {
    const button = makeToggle(doc, toggle.key, toggle.label);
    button.addEventListener('click', () => {
      toggle.flip();
      update();
    });
    body.appendChild(button);
    return { toggle, button };
  });
  element.append(header, body);

  // The tick reads the same list, so a locked option costs no work per tick.
  function update(): void {
    for (const one of built) setPressed(one.button, one.toggle.read());
  }

  update();
  return { element, update };
}
