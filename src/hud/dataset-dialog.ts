// The dataset library dialog: the filter, the grouped list of the catalog, the detail
// pane and the two buttons.
//
// The dialog reads the four dataset members of the public handle: `getDatasets`,
// `getLoadedDataset`, `loadDataset` and `onDatasetChange`. It calls no `load()` of its
// own, so opening it, filtering it and clicking an entry fetch nothing.
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

/** The most entry rows the list holds. The dialog says so when it cut the list. */
export const MAX_DATASET_ROWS = 120;

/** The name of the group an entry with no `collection` sits in. */
export const OTHER_GROUP = 'OTHER';

/** What the dialog tells the dataset field. */
export interface DatasetFieldHandle {
  /** Says whether a load is running. */
  setLoading(loading: boolean): void;
  /** Writes the loaded dataset's label into the field. */
  update(): void;
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

/** One group of the list: a collection and the entries under it. */
interface Group {
  readonly name: string;
  readonly entries: DatasetInfo[];
}

/** Builds the dataset dialog. It starts hidden and holds no row. */
export function createDatasetDialog(
  doc: Document,
  map: GalaxyMap,
  field: DatasetFieldHandle | null,
): DatasetDialog {
  const element = make(doc, 'div', 'gm-hud__dialog');
  element.hidden = true;

  const frame = make(doc, 'div', 'gm-hud__dialog-frame');
  frame.setAttribute('role', 'dialog');
  frame.setAttribute('aria-modal', 'true');
  frame.setAttribute('aria-label', 'Dataset library');

  const header = make(doc, 'div', 'gm-hud__dialog-header');
  const title = make(doc, 'h2', 'gm-hud__dialog-title');
  title.textContent = 'DATASET LIBRARY';
  const close = makeButton(doc, 'gm-hud__dialog-close');
  close.textContent = '×';
  close.setAttribute('aria-label', 'Close the dataset library');
  header.append(title, close);

  const body = make(doc, 'div', 'gm-hud__dialog-body');

  const side = make(doc, 'div', 'gm-hud__dialog-side');
  const filterWrap = make(doc, 'div', 'gm-hud__dialog-filter-wrap');
  const filter = make(doc, 'input', 'gm-hud__dialog-filter');
  filter.type = 'text';
  filter.placeholder = 'FILTER BY NAME OR CATEGORY';
  filter.setAttribute('aria-label', 'Filter datasets');
  filterWrap.appendChild(filter);
  const list = make(doc, 'div', 'gm-hud__dataset-list');
  const cut = make(doc, 'div', 'gm-hud__dataset-cut');
  cut.hidden = true;
  side.append(filterWrap, list, cut);

  const detail = make(doc, 'div', 'gm-hud__dialog-detail');
  const detailBody = make(doc, 'div', 'gm-hud__detail-body');
  const detailLabel = make(doc, 'h3', 'gm-hud__detail-label');
  const detailMeta = make(doc, 'div', 'gm-hud__detail-meta');
  const detailText = make(doc, 'p', 'gm-hud__detail-description');
  detailBody.append(detailLabel, detailMeta, detailText);
  const footer = make(doc, 'div', 'gm-hud__dialog-footer');
  const cancel = makeButton(doc, 'gm-hud__dialog-cancel');
  cancel.textContent = 'CANCEL';
  const load = makeButton(doc, 'gm-hud__dialog-load');
  load.textContent = 'LOAD DATASET';
  footer.append(cancel, load);
  detail.append(detailBody, footer);

  body.append(side, detail);
  frame.append(header, body);
  element.appendChild(frame);

  /** The id of the entry the detail pane shows. */
  let focusId: string | null = null;
  /** True while a load this dialog started is running. */
  let loading = false;
  let opener: HTMLElement | null = null;

  /** The names of the categories the map holds, which are the loaded set's own. */
  const loadedCategoryNames = (): string[] => {
    const names: string[] = [];
    const count = map.categoryCount();
    for (let index = 0; index < count; index += 1) {
      const category = map.getCategory(index);
      if (category !== null) names.push(category.name);
    }
    return names;
  };

  /**
   * The text the filter compares one entry against: its label, its collection and, for
   * the entry now on the map, the names of the categories it loaded. An entry the map
   * has not loaded carries no category, because the dialog calls no `load()`.
   */
  const matchText = (entry: DatasetInfo, loadedId: string | null): string => {
    const parts = [entry.label, entry.collection ?? ''];
    if (entry.id === loadedId) parts.push(...loadedCategoryNames());
    return parts.join(' ').toLowerCase();
  };

  /** The entries the filter keeps, in the order of the catalog. */
  const keptEntries = (): DatasetInfo[] => {
    const text = filter.value.trim().toLowerCase();
    const loadedId = map.getLoadedDataset()?.id ?? null;
    const entries = map.getDatasets();
    if (text.length === 0) return entries;
    return entries.filter((entry) => matchText(entry, loadedId).includes(text));
  };

  /** The kept entries in groups, by `collection`, in the order of first appearance. */
  const groupsOf = (entries: readonly DatasetInfo[]): Group[] => {
    const groups: Group[] = [];
    for (const entry of entries) {
      const name = entry.collection ?? OTHER_GROUP;
      let group = groups.find((held) => held.name === name);
      if (group === undefined) {
        group = { name, entries: [] };
        groups.push(group);
      }
      group.entries.push(entry);
    }
    return groups;
  };

  /** The entry the detail pane shows: the one last clicked, or the loaded one. */
  const focusEntry = (): DatasetInfo | null => {
    const entries = map.getDatasets();
    const held = entries.find((entry) => entry.id === focusId);
    if (held !== undefined) return held;
    return map.getLoadedDataset() ?? entries[0] ?? null;
  };

  /** Writes the detail pane and the two buttons from the entry in focus. */
  const renderDetail = (): void => {
    const entry = focusEntry();
    const loadedId = map.getLoadedDataset()?.id ?? null;
    setText(detailLabel, entry?.label ?? '');
    // One line of the three fields, in the order the mockup writes them, and only the
    // fields the entry carries.
    const count = entry?.systemCount;
    const meta = [
      entry?.collection ?? '',
      entry?.region ?? '',
      count === undefined ? '' : `${formatWhole(count)} SYSTEMS`,
    ].filter((part) => part.length > 0);
    setText(detailMeta, meta.join(' · ').toUpperCase());
    setShown(detailMeta, meta.length > 0);
    setText(detailText, entry?.description ?? '');
    setShown(detailText, (entry?.description ?? '').length > 0);

    const isLoaded = entry !== null && entry.id === loadedId;
    setText(load, isLoaded ? 'CURRENTLY LOADED' : 'LOAD DATASET');
    setAttribute(load, 'data-loaded', isLoaded ? 'true' : 'false');
    // The button stays in the tab order and stays clickable, and its handler does
    // nothing: a disabled button takes no focus and reports no state to a reader.
    const idle = entry === null || isLoaded || loading;
    setAttribute(load, 'aria-disabled', idle ? 'true' : 'false');
  };

  /** Builds the rows of the list from the catalog and the filter. */
  const renderList = (): void => {
    const kept = keptEntries();
    const shown = kept.slice(0, MAX_DATASET_ROWS);
    const loadedId = map.getLoadedDataset()?.id ?? null;
    const inFocus = focusEntry()?.id ?? null;
    const children: HTMLElement[] = [];

    for (const group of groupsOf(shown)) {
      const header = make(doc, 'div', 'gm-hud__dataset-group');
      const name = make(doc, 'span', 'gm-hud__dataset-group-name');
      name.textContent = group.name.toUpperCase();
      const count = make(doc, 'span', 'gm-hud__dataset-group-count');
      count.textContent = formatWhole(group.entries.length);
      header.append(name, count);
      children.push(header);

      for (const entry of group.entries) {
        const row = makeButton(doc, 'gm-hud__dataset-row');
        row.dataset['name'] = entry.id;
        row.textContent = entry.label;
        setAttribute(row, 'aria-current', entry.id === loadedId ? 'true' : 'false');
        setAttribute(row, 'aria-pressed', entry.id === inFocus ? 'true' : 'false');
        row.addEventListener('click', () => {
          focusId = entry.id;
          renderList();
          renderDetail();
        });
        children.push(row);
      }
    }

    if (children.length === 0) {
      const empty = make(doc, 'div', 'gm-hud__dataset-empty');
      empty.textContent = 'NO MATCHING DATASETS';
      children.push(empty);
    }

    list.replaceChildren(...children);
    // The line is there only when the cap cut the list, and it names both numbers.
    setText(
      cut,
      `${formatWhole(shown.length)} OF ${formatWhole(kept.length)} DATASETS`,
    );
    setShown(cut, kept.length > shown.length);
  };

  /** Takes the rows off the page, so a closed dialog holds no row. */
  const clearList = (): void => {
    list.replaceChildren();
    setShown(cut, false);
  };

  const closeDialog = (): void => {
    if (element.hidden) return;
    setShown(element, false);
    clearList();
    const from = opener;
    opener = null;
    if (from !== null) {
      from.setAttribute('aria-expanded', 'false');
      focusOn(from);
    }
  };

  cancel.addEventListener('click', closeDialog);
  close.addEventListener('click', closeDialog);
  // A click on the ground outside the frame closes the dialog, as it does the lightbox.
  element.addEventListener('click', (event: MouseEvent) => {
    if (event.target === element) closeDialog();
  });

  filter.addEventListener('input', () => {
    renderList();
  });

  load.addEventListener('click', () => {
    const entry = focusEntry();
    const loadedId = map.getLoadedDataset()?.id ?? null;
    // A second click while a load runs starts no third load, and the button does
    // nothing for the entry that is already on the map.
    if (entry === null || loading || entry.id === loadedId) return;
    loading = true;
    field?.setLoading(true);
    renderDetail();
    closeDialog();
    void map.loadDataset(entry.id).then(
      () => {
        loading = false;
        field?.setLoading(false);
        renderDetail();
      },
      (error: unknown) => {
        loading = false;
        field?.setLoading(false);
        renderDetail();
        console.warn('The dataset did not load.', error);
      },
    );
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
    field?.update();
    if (!element.hidden) {
      renderList();
      renderDetail();
    }
  });

  return {
    element,
    open(from: HTMLElement | null): void {
      opener = from;
      // The field the dialog came from takes the accent border while the dialog is
      // open, as the mockup draws it.
      from?.setAttribute('aria-expanded', 'true');
      focusId = map.getLoadedDataset()?.id ?? null;
      filter.value = '';
      renderList();
      renderDetail();
      setShown(element, true);
      filter.focus();
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
