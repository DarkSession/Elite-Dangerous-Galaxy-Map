// The types the HUD and the library entry point share. The HUD reaches the map through
// the public handle alone, so it names a record by the type the entry point re-exports.
import type { RealSystem } from '../app/create-map';
import type { SystemDetails } from './details';

/** Which worked-out fields the information panel shows. Each one is on by default. */
export interface HudInfoFields {
  /** The distance from Sol. */
  readonly distanceFromSol?: boolean;
  /** The range from the cursor. */
  readonly range?: boolean;
  /**
   * The galactic region. With this off the panel asks for no region, so the map never
   * fetches the region cell table.
   */
  readonly region?: boolean;
}

/** The name of one switch the map options panel can hold. */
export type HudMapOption =
  'regions' | 'systemNames' | 'systemIcons' | 'grid' | 'shapes' | 'nebulae';

/** What the host asks the HUD for. Every field is optional. */
export interface HudOptions {
  /** The name in the top bar. The default is `GALACTIC CARTOGRAPHICS`. */
  readonly title?: string;
  /** Where the HUD is built. With none the library builds in the canvas's parent. */
  readonly host?: HTMLElement;
  /**
   * Loads the description, the extra values and the footer buttons of one system. The
   * panel calls it once for each system it opens on. The library aborts `signal` when the selection changes
   * and on dispose, so a host that fetches can stop the work behind a dropped answer.
   */
  details?(
    system: RealSystem,
    signal: AbortSignal,
  ): SystemDetails | Promise<SystemDetails | null> | null;
  /**
   * Which worked-out fields the information panel shows. The setting covers every
   * system, and a field the host turns off is not built.
   */
  readonly infoFields?: HudInfoFields;
  /**
   * The map options the user may not change. A locked option draws no switch, and the
   * handle's setters still move it. A name the list does not hold is ignored.
   */
  readonly lockedOptions?: readonly HudMapOption[];
  /**
   * Draws a previous button and a next button around the dataset field, and an
   * `i / n` counter after them. Each arrow loads the entry beside the loaded one in
   * catalog order. It is false by default, and a value that is not a boolean reads as
   * false.
   */
  readonly datasetArrows?: boolean;
}

/** What the HUD builder gives back. The map handle carries it as `hud`. */
export interface HudHandle {
  /** The root element of the HUD. */
  readonly element: HTMLElement;
  /** Rebuilds the panels from the map's current state. */
  refresh(): void;
  /**
   * How long the category panel's last count pass took, in milliseconds. The map
   * re-exports it on its `debug` object, so a browser test reads the budget the pass
   * holds without reaching into the HUD.
   */
  categoryCountMs(): number;
  /** Removes the HUD element and every listener it added. */
  dispose(): void;
}
