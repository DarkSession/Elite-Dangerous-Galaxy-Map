// The dataset library dialog: the search box, the row of collection chips and the grid
// of cards. One click on a card loads that entry.
//
// The dialog reads the four dataset members of the public handle: `getDatasets`,
// `getLoadedDataset`, `loadDataset` and `onDatasetChange`. It calls no `load()` of its
// own, so opening it, searching it and picking a chip fetch nothing.
//
// The load itself belongs to the dataset field, which owns the loading flag and which
// the step arrows call as well. The dialog asks the field to load and draws the spinner
// on the card the user clicked.
import type { DatasetInfo, GalaxyMap } from '../app/create-map';
import {
  focusOn,
  formatWhole,
  make,
  makeButton,
  setAttribute,
  setShown,
  setText,
} from './dom';
import type { DatasetField } from './top-bar';
import { makeSpinner } from './top-bar';

/** The name of the chip an entry with no `collection` sits under. */
export const OTHER_GROUP = 'OTHER';

/**
 * The colours a collection's swatch can take, which are the eight the mockup names for
 * its shapes. Each one was picked by hand to read on the dark ground and beside the
 * accent orange.
 */
export const COLLECTION_COLOURS: readonly string[] = [
  '#8cc8ff',
  '#ffaa5a',
  '#cd8cff',
  '#7dffa0',
  '#ff6e96',
  '#ffd778',
  '#78dcff',
  '#e8e2ee',
];

/**
 * The colour of one collection, worked out from its name alone. The same name gives the
 * same colour in every session and on every host, and the catalog carries no colour
 * field.
 *
 * Two collections can land on one colour. The chip and the card both carry the name, so
 * a collision costs nothing a user reads.
 */
export function collectionColour(name: string): string {
  let hash = 5381;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 33 + name.charCodeAt(index)) >>> 0;
  }
  return COLLECTION_COLOURS[hash % COLLECTION_COLOURS.length] as string;
}

/** The name of the chip one entry sits under. */
function collectionOf(entry: DatasetInfo): string {
  const name = entry.collection ?? '';
  return name.length === 0 ? OTHER_GROUP : name;
}

/**
 * The text of one card's `title`: the fields the detail pane showed, in one line. A
 * field the entry does not carry is left out and leaves no empty separator.
 */
export function cardTitle(entry: DatasetInfo): string {
  const count =
    entry.systemCount === undefined
      ? 'FETCHED ON LOAD'
      : `${formatWhole(entry.systemCount)} SYSTEMS`;
  return [entry.region ?? '', entry.description ?? '', count]
    .filter((part) => part.length > 0)
    .join(' · ');
}

/** One collection of the chip row: its name and how many entries it holds. */
export interface Collection {
  readonly name: string;
  readonly count: number;
}

/**
 * The collections the catalog holds, sorted by name. The chips are a list the user
 * scans, and a sorted list is what a reader scans; the catalog's own order is what the
 * arrows and the card grid follow.
 */
export function collectionsOf(entries: readonly DatasetInfo[]): Collection[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const name = collectionOf(entry);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort((one, other) => one.name.localeCompare(other.name));
}

/**
 * The entries the search text and the picked chip both keep, in the order of the
 * catalog. The text is compared against the `label` alone, without case: the chips are
 * what filters by collection, and a box that also matched one would give two controls
 * one job.
 */
export function keptEntriesOf(
  entries: readonly DatasetInfo[],
  text: string,
  picked: string | null,
): DatasetInfo[] {
  const wanted = text.trim().toLowerCase();
  return entries.filter((entry) => {
    if (wanted.length > 0 && !entry.label.toLowerCase().includes(wanted)) return false;
    return picked === null || collectionOf(entry) === picked;
  });
}

/**
 * The line in the header. It reads the count of the catalog while the search box is
 * empty and no chip narrows the list, and the two counts otherwise.
 */
export function countLine(kept: number, total: number, narrowed: boolean): string {
  if (!narrowed) return `${formatWhole(total)} DATASETS`;
  return `${formatWhole(kept)} OF ${formatWhole(total)}`;
}

/** The dataset dialog of the HUD. */
export interface DatasetDialog {
  readonly element: HTMLElement;
  /** Opens the dialog and remembers what to give the focus back to. */
  open(opener: HTMLElement | null): void;
  /** Closes the dialog and gives the focus back. */
  close(): void;
  /** True while the dialog is open. */
  isOpen(): boolean;
  /** Drops the listener the dialog holds. */
  dispose(): void;
}

/** Builds the dataset dialog. It starts hidden and holds no card. */
export function createDatasetDialog(
  doc: Document,
  map: GalaxyMap,
  field: DatasetField,
): DatasetDialog {
  const element = make(doc, 'div', 'gm-hud__dialog');
  element.hidden = true;

  const frame = make(doc, 'div', 'gm-hud__dialog-frame');
  frame.setAttribute('role', 'dialog');
  frame.setAttribute('aria-modal', 'true');
  frame.setAttribute('aria-label', 'Dataset library');

  const header = make(doc, 'div', 'gm-hud__dialog-header');
  const heading = make(doc, 'div', 'gm-hud__dialog-heading');
  const title = make(doc, 'h2', 'gm-hud__dialog-title');
  title.textContent = 'DATASET LIBRARY';
  const count = make(doc, 'div', 'gm-hud__dialog-count');
  heading.append(title, count);
  const close = makeButton(doc, 'gm-hud__dialog-close');
  close.textContent = '×';
  close.setAttribute('aria-label', 'Close the dataset library');
  header.append(heading, close);

  const tools = make(doc, 'div', 'gm-hud__dialog-tools');
  const search = make(doc, 'input', 'gm-hud__dialog-filter');
  search.type = 'text';
  search.placeholder = 'SEARCH DATASET NAMES';
  search.setAttribute('aria-label', 'Search dataset names');
  const chips = make(doc, 'div', 'gm-hud__collections');
  chips.hidden = true;
  tools.append(search, chips);

  const body = make(doc, 'div', 'gm-hud__dialog-body');
  const grid = make(doc, 'div', 'gm-hud__dataset-grid');
  const empty = make(doc, 'div', 'gm-hud__dataset-empty');
  empty.textContent = 'NO DATASET NAME MATCHES THAT FILTER';
  empty.hidden = true;
  body.append(grid, empty);

  frame.append(header, tools, body);
  element.appendChild(frame);

  /** The collection the user picked, or null while every entry is kept. */
  let picked: string | null = null;
  let opener: HTMLElement | null = null;
  /**
   * How many times the dialog opened. A load that starts from a card keeps the count it
   * saw, and it closes the dialog only while the count is the same. Without it a user
   * who closes the dialog during a load, and opens it again before the load settles,
   * sees the new dialog shut itself when the old load ends.
   */
  let openCount = 0;

  /** The entries the search box and the chip both keep, in the order of the catalog. */
  const keptEntries = (): DatasetInfo[] =>
    keptEntriesOf(map.getDatasets(), search.value, picked);

  /** Builds the chip row. It is there only where the catalog holds two collections. */
  const renderChips = (): void => {
    const held = collectionsOf(map.getDatasets());
    setShown(chips, held.length > 1);
    if (held.length < 2) {
      chips.replaceChildren();
      return;
    }

    const children: HTMLElement[] = [];
    const all = makeButton(doc, 'gm-hud__collection');
    all.dataset['name'] = 'all';
    all.style.setProperty('--gm-collection-colour', '#ff9a3c');
    const allName = make(doc, 'span', 'gm-hud__collection-name');
    allName.textContent = 'ALL';
    const allCount = make(doc, 'span', 'gm-hud__collection-count');
    allCount.textContent = formatWhole(map.getDatasets().length);
    all.append(allName, allCount);
    setAttribute(all, 'aria-pressed', picked === null ? 'true' : 'false');
    all.addEventListener('click', () => {
      picked = null;
      renderChips();
      renderCards();
    });
    children.push(all);

    for (const collection of held) {
      const chip = makeButton(doc, 'gm-hud__collection');
      chip.dataset['name'] = collection.name;
      chip.style.setProperty(
        '--gm-collection-colour',
        collectionColour(collection.name),
      );
      const swatch = make(doc, 'span', 'gm-hud__collection-swatch');
      const name = make(doc, 'span', 'gm-hud__collection-name');
      name.textContent = collection.name.toUpperCase();
      const chipCount = make(doc, 'span', 'gm-hud__collection-count');
      chipCount.textContent = formatWhole(collection.count);
      chip.append(swatch, name, chipCount);
      setAttribute(chip, 'aria-pressed', picked === collection.name ? 'true' : 'false');
      chip.addEventListener('click', () => {
        // A click on the chip that is already picked keeps every entry again.
        picked = picked === collection.name ? null : collection.name;
        renderChips();
        renderCards();
      });
      children.push(chip);
    }
    chips.replaceChildren(...children);
  };

  /** Builds the card grid and the line that says how many entries it shows. */
  function renderCards(): void {
    const entries = map.getDatasets();
    const kept = keptEntries();
    const loadedId = map.getLoadedDataset()?.id ?? null;
    const loadingId = field.loadingId();
    const cards: HTMLElement[] = [];

    for (const entry of kept) {
      const card = makeButton(doc, 'gm-hud__dataset-card');
      card.dataset['name'] = entry.id;
      const collection = collectionOf(entry);
      card.style.setProperty('--gm-card-colour', collectionColour(collection));
      const swatch = make(doc, 'span', 'gm-hud__card-swatch');
      const name = make(doc, 'span', 'gm-hud__card-collection');
      name.textContent = collection.toUpperCase();
      const label = make(doc, 'span', 'gm-hud__card-label');
      label.textContent = entry.label;
      // The card of the loaded entry and the card of a loading entry take the accent
      // border, and a loading card carries the spinner, which sits on the first row
      // beside the collection. The label takes the row below it.
      const isLoading = entry.id === loadingId;
      if (isLoading) card.append(swatch, name, makeSpinner(doc), label);
      else card.append(swatch, name, label);
      setAttribute(card, 'aria-current', entry.id === loadedId ? 'true' : 'false');
      setAttribute(card, 'data-loading', isLoading ? 'true' : 'false');
      card.title = cardTitle(entry);
      card.addEventListener('click', () => {
        pickEntry(entry);
      });
      cards.push(card);
    }

    grid.replaceChildren(...cards);
    setShown(empty, cards.length === 0);
    const narrowed = picked !== null || search.value.trim().length > 0;
    setText(count, countLine(kept.length, entries.length, narrowed));
  }

  /** Takes the cards and the chips off the page, so a closed dialog holds neither. */
  const clearCards = (): void => {
    grid.replaceChildren();
    chips.replaceChildren();
    setShown(empty, false);
  };

  const closeDialog = (): void => {
    if (element.hidden) return;
    setShown(element, false);
    clearCards();
    const from = opener;
    opener = null;
    if (from !== null) {
      from.setAttribute('aria-expanded', 'false');
      focusOn(from);
    }
  };

  /**
   * One click on a card. It loads that entry, draws the spinner on the card and leaves
   * the dialog open, so the user sees which entry is loading. The dialog closes when the
   * load settles, whether it resolved or rejected.
   */
  function pickEntry(entry: DatasetInfo): void {
    // A second click starts no second load while one is running, and it leaves the
    // dialog open so the spinner stays where the user can see it.
    if (field.loadingId() !== null) return;
    const started = field.requestLoad(entry.id);
    // The field starts nothing for the entry the map already holds. The dialog closes
    // and the map stays as it is.
    if (started === null) {
      closeDialog();
      return;
    }
    renderCards();
    // The dialog closes on this load only while it is the same open. A close and a new
    // open in the meantime leave the new dialog where it is.
    const opened = openCount;
    void started.then(() => {
      if (opened === openCount) closeDialog();
    });
  }

  close.addEventListener('click', closeDialog);
  // A click on the ground outside the frame closes the dialog, as it does the lightbox.
  // It closes during a load as well, and the load continues.
  element.addEventListener('click', (event: MouseEvent) => {
    if (event.target === element) closeDialog();
  });

  search.addEventListener('input', () => {
    renderCards();
  });

  /** Every control of the dialog that takes the focus, in the tab order. */
  const controls = (): HTMLElement[] => {
    const found: HTMLElement[] = [];
    for (const node of frame.querySelectorAll('button, input')) {
      if (!(node instanceof HTMLElement)) continue;
      if (node instanceof HTMLButtonElement && node.disabled) continue;
      found.push(node);
    }
    return found;
  };

  // The dialog holds the focus while it is open, so a keyboard user does not tab into
  // the panels behind it.
  element.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key !== 'Tab') return;
    const found = controls();
    if (found.length === 0) return;
    const first = found[0] as HTMLElement;
    const last = found[found.length - 1] as HTMLElement;
    const active = doc.activeElement;
    if (event.shiftKey && (active === first || !frame.contains(active))) {
      event.preventDefault();
      focusOn(last);
      return;
    }
    if (!event.shiftKey && (active === last || !frame.contains(active))) {
      event.preventDefault();
      focusOn(first);
    }
  });

  // The field follows a load a host started as well, so the label never lags the map.
  const stopDatasetListener = map.onDatasetChange(() => {
    field.update();
    if (!element.hidden) {
      renderChips();
      renderCards();
    }
  });

  return {
    element,
    open(from: HTMLElement | null): void {
      openCount += 1;
      opener = from;
      // The field the dialog came from takes the accent border while the dialog is
      // open, as the mockup draws it.
      from?.setAttribute('aria-expanded', 'true');
      // The search text and the picked chip are the dialog's own state, and they start
      // clear on every open.
      search.value = '';
      picked = null;
      renderChips();
      renderCards();
      setShown(element, true);
      search.focus();
    },
    close: closeDialog,
    isOpen(): boolean {
      return !element.hidden;
    },
    dispose(): void {
      stopDatasetListener();
    },
  };
}
