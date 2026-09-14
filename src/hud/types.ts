// The types the HUD and the library entry point share. The HUD reaches the map through
// the public handle alone, so it names a record by the type the entry point re-exports.
import type { RealSystem } from '../app/create-map';

/** One button the host adds to the information panel footer. */
export interface HudAction {
  /** The text on the button. */
  readonly label: string;
  /** What the host runs on a click. The library ignores what it returns. */
  onSelect(system: RealSystem): void;
}

/** What the host asks the HUD for. Every field is optional. */
export interface HudOptions {
  /** The name in the top bar. The default is `GALACTIC CARTOGRAPHICS`. */
  readonly title?: string;
  /** Where the HUD is built. With none the library builds in the canvas's parent. */
  readonly host?: HTMLElement;
  /** Buttons in the information panel footer. */
  readonly actions?: readonly HudAction[];
}

/** What the HUD builder gives back. The map handle carries it as `hud`. */
export interface HudHandle {
  /** The root element of the HUD. */
  readonly element: HTMLElement;
  /** Rebuilds the panels from the map's current state. */
  refresh(): void;
  /** Removes the HUD element and every listener it added. */
  dispose(): void;
}
