// The category panel: the two tabs, the search box, one row per category, and the list a
// row expands into.
//
// One table holds the categories of the systems and of the shapes, so the two tabs are
// two readings of one table and not two tables. Each tab holds its own open set, and the
// panel builds the rows of the shown tab alone, so the rows of the other tab are never
// in the document.
import type { GalaxyMap, ShapeKind } from '../app/create-map';
import {
  cssColor,
  focusMark,
  formatWhole,
  make,
  makeButton,
  replaceChildrenKeepingFocus,
  restoreFocus,
  setAttribute,
  setPressed,
  setStyle,
} from './dom';

/** How long the box waits before it gives the text to the filter, in milliseconds. */
export const FILTER_DELAY_MS = 150;

/** How long a list takes to open and to close, in milliseconds. */
export const LIST_MOVE_MS = 140;

/**
 * The most rows the open lists hold together. The open lists share it, so the HUD's node
 * count follows neither the size of the set nor the count of open lists.
 */
export const MAX_SYSTEM_ROWS = 200;

/**
 * The key the panel holds every thing of the shown tab under, for the flat list. A
 * category name is a string of at least one character, so the empty string is a key no
 * category takes, and `setCategoryVisible` of it reaches nothing.
 */
const FLAT_KEY = '';

/** Which kind of thing the panel lists. */
export type CategoryTab = 'systems' | 'shapes';

/** Where a shape row sends the camera. A system row carries none. */
interface Flight {
  readonly centre: readonly [number, number, number];
  readonly reach: number;
}

/** What the panel keeps about one system or one shape, so it reads the map once. */
interface Entry {
  readonly name: string;
  /** Where the thing sits in the flat read order, which the match flags are held by. */
  readonly flat: number;
  readonly identity: string;
  /** The flight of a shape row, and null for a system row. */
  readonly flight: Flight | null;
}

/** One category and the names it holds, as `matchingCategories` reads them. */
export interface CategoryNames {
  readonly name: string;
  /** The names of the systems, or of the shapes, the category holds. */
  readonly names: readonly string[];
}

/**
 * The categories that hold at least one name the filter keeps. A search opens every one
 * of them, so the answer to a search is never inside a folded row.
 *
 * The comparison is the one the map itself makes: the text is not trimmed and the match
 * is not case sensitive. A trim here would open a row whose marker the map does not draw.
 */
export function matchingCategories(
  filter: string,
  groups: readonly CategoryNames[],
): Set<string> {
  const text = filter.toLowerCase();
  const open = new Set<string>();
  for (const group of groups) {
    const holds = group.names.some((name) => name.toLowerCase().includes(text));
    if (holds) open.add(group.name);
  }
  return open;
}

/**
 * The rows one open list shows. `openCount` is the count of open lists and `index` is
 * the place of this list among them, in the panel's own order.
 *
 * The open lists share the budget, at `floor(200 / open)` rows each. Where that share is
 * 0, which a filter that matches in more than 200 categories reaches, the first 200 open
 * lists hold one row each and every open list past the 200th holds none.
 */
export function rowShare(openCount: number, index: number): number {
  if (openCount <= 0) return 0;
  const share = Math.floor(MAX_SYSTEM_ROWS / openCount);
  if (share > 0) return share;
  return index < MAX_SYSTEM_ROWS ? 1 : 0;
}

/**
 * The height cap of one open list, in CSS pixels, and 0 for no cap. `area` is the height
 * of the list area, `rows` is the height of the category rows in it, and `openCount` is
 * the count of open lists.
 *
 * The open lists take the space the rows leave, and half the area where the rows leave
 * less than that. Each open list takes an even share of the result.
 *
 * The share is a cap and not a height. The panel writes it into `--gm-list-cap`, and the
 * rule `max-height: var(--gm-list-cap)` takes the smaller of the cap and the rows the
 * list holds, so a list of two systems stays two rows high. A list that needs less than
 * its share passes no remainder to another list.
 */
export function listCap(area: number, rows: number, openCount: number): number {
  if (openCount <= 0 || area <= 0) return 0;
  return Math.max(area - rows, area * 0.5) / openCount;
}

/**
 * What a shape row reads. A shape that carries a name reads it, and a shape that carries
 * none reads its kind and its place in the set, for example `SPHERE 12` or `LINE 7`.
 */
export function shapeLabel(kind: ShapeKind, index: number, name?: string): string {
  if (name !== undefined && name !== '') return name;
  return `${kind === 'sphere' ? 'SPHERE' : 'LINE'} ${index}`;
}

/** The elements of one category row. */
interface Group {
  readonly name: string;
  /** The row and its list together, which the panel measures to find the row height. */
  readonly element: HTMLElement;
  readonly line: HTMLElement;
  readonly dot: HTMLButtonElement;
  readonly swatch: HTMLElement;
  readonly row: HTMLButtonElement;
  /** The element that reads the total, or `<matches> of <total>` under a filter. */
  readonly count: HTMLElement;
  /** The wrapper that moves from no height to the height of the rows. */
  readonly list: HTMLElement;
  /** The box the rows sit in, which carries the cap and scrolls. */
  readonly rows: HTMLElement;
  readonly color: readonly [number, number, number];
  /** The timer that empties a folded list after it closed. */
  clearTimer: number | null;
}

/** The category panel of the HUD. */
export interface CategoryPanel {
  readonly element: HTMLElement;
  /** Rebuilds every row from the category table and the set of the shown tab. */
  rebuild(): void;
  /** Writes the state each control shows, and writes only what changed. */
  update(): void;
  /** Rebuilds the rows when the table or a set changed since the last call. */
  poll(): void;
  /**
   * How long the last count pass took, in milliseconds. It runs once per change of the
   * filter text and reads each thing once per category it names.
   */
  countPassMs(): number;
  /** Drops the timers and the observer the panel holds. */
  dispose(): void;
}

/**
 * Draws the chevron at the end of a category row. It points down while the list is
 * folded, and the style sheet turns it 180 degrees while the row's `aria-expanded` reads
 * true. It carries `aria-hidden`, because the row already states the same thing.
 */
function makeChevronIcon(doc: Document): SVGSVGElement {
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'square');
  svg.setAttribute('aria-hidden', 'true');
  const line = doc.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  line.setAttribute('points', '4,6 8,10.5 12,6');
  svg.appendChild(line);
  return svg;
}

/** Builds the category panel. */
export function createCategoryPanel(doc: Document, map: GalaxyMap): CategoryPanel {
  const element = make(doc, 'section', 'gm-hud__panel gm-hud__category-panel');

  const header = make(doc, 'div', 'gm-hud__panel-header');
  const tabs = make(doc, 'div', 'gm-hud__tabs');
  tabs.setAttribute('role', 'tablist');
  const systemsTab = makeButton(doc, 'gm-hud__tab');
  systemsTab.textContent = 'SYSTEMS';
  systemsTab.dataset['name'] = 'systems';
  systemsTab.setAttribute('role', 'tab');
  const shapesTab = makeButton(doc, 'gm-hud__tab');
  shapesTab.textContent = 'SHAPES';
  shapesTab.dataset['name'] = 'shapes';
  shapesTab.setAttribute('role', 'tab');
  tabs.append(systemsTab, shapesTab);
  const bulk = make(doc, 'div', 'gm-hud__bulk');
  const allButton = makeButton(doc, 'gm-hud__bulk-button');
  allButton.textContent = 'ALL';
  allButton.dataset['name'] = 'all';
  const noneButton = makeButton(doc, 'gm-hud__bulk-button');
  noneButton.textContent = 'NONE';
  noneButton.dataset['name'] = 'none';
  bulk.append(allButton, noneButton);
  header.append(tabs, bulk);

  const searchWrap = make(doc, 'div', 'gm-hud__search-wrap');
  const search = make(doc, 'input', 'gm-hud__search');
  search.type = 'text';
  searchWrap.appendChild(search);

  const list = make(doc, 'div', 'gm-hud__category-list');
  element.append(header, searchWrap, list);

  const groups: Group[] = [];
  const byCategory = new Map<string, Entry[]>();
  // Where each category's things sit in the flat read order, in the same order as the
  // entries above. The count pass walks this array and reads a match flag by index, so
  // it loads no object and searches no string. That is the pass the set bound is read
  // against.
  const flatByCategory = new Map<string, Int32Array>();
  const flatCountOf = new Map<string, number>();
  // The folded name of every thing of the shown tab, in the flat read order, and one
  // byte per thing that says whether the filter keeps it.
  let allFolds: string[] = [];
  let matchFlags = new Uint8Array(0);
  // The filter text the flags were built for, so a second read of the same text builds
  // them once.
  let matchText: string | null = null;
  // The categories whose lists are open, one set per tab, so a tab the user comes back
  // to reads as they left it. The set is state and not a reading of the filter text: a
  // change of the text writes it, a click on a row writes it, and a rebuild of the panel
  // only reads it. The panel is rebuilt on every camera move, so a set worked out from
  // the text on each rebuild would undo the user's fold on the next frame.
  const openOf: Record<CategoryTab, Set<string>> = {
    systems: new Set<string>(),
    shapes: new Set<string>(),
  };
  // The category the user last opened by hand, per tab. Clearing the box gives the panel
  // back to that one, and to none where the user opened none.
  const handOpenedOf: Record<CategoryTab, string | null> = {
    systems: null,
    shapes: null,
  };
  let tab: CategoryTab = 'systems';
  let dataSignature = '';
  let filterSignature = '';
  let filterTimer: number | null = null;
  // The count of open lists, which the observer needs and does not measure.
  let openCount = 0;
  let lastCap = '';
  // The rows box of the flat list, or null where the tab holds category rows. The flat
  // list is the panel of a tab whose kind holds things and whose categories hold none.
  let flatRows: HTMLElement | null = null;
  // How long the last count pass took, which a browser test reads through the map.
  let countPassMs = 0;

  /** How many shapes the map holds, of both kinds. */
  function shapeCount(): number {
    return map.sphereCount() + map.lineCount();
  }

  /** How many things of the shown tab's own kind the map holds. */
  function thingCount(): number {
    return tab === 'systems' ? map.systemCount() : shapeCount();
  }

  /** The filter text of the shown tab. */
  function filterText(): string {
    return tab === 'systems' ? map.getNameFilter() : map.getShapeNameFilter();
  }

  /** Gives a text to the filter of the shown tab. */
  function writeFilter(text: string): void {
    if (tab === 'systems') map.setNameFilter(text);
    else map.setShapeNameFilter(text);
  }

  /**
   * True when a category is on for the kind of the shown tab. A category holds one
   * visibility flag for its systems and one for its shapes, so each tab reads its own and
   * the same category can read on in one tab and off in the other.
   */
  function categoryOn(name: string): boolean {
    return tab === 'systems'
      ? map.isCategoryVisible(name)
      : map.isShapeCategoryVisible(name);
  }

  /** Turns a category on or off for the kind of the shown tab. */
  function setCategoryOn(name: string, on: boolean): void {
    if (tab === 'systems') map.setCategoryVisible(name, on);
    else map.setShapeCategoryVisible(name, on);
  }

  /**
   * Clears the filter of one tab. The panel clears the filter of the tab it leaves, so
   * no filter is in force on a kind whose box the user cannot see.
   */
  function clearFilter(which: CategoryTab): void {
    if (which === 'systems') {
      if (map.getNameFilter() !== '') map.setNameFilter('');
      return;
    }
    if (map.getShapeNameFilter() !== '') map.setShapeNameFilter('');
  }

  /**
   * Writes the open set from the filter text. A text that is not empty opens every
   * category that holds a match, including one the user turned off, because a click on
   * the dot of one of its rows turns it back on. An empty text gives the panel back to
   * the one category the user last opened by hand.
   */
  function seedOpen(filter: string): void {
    const open = openOf[tab];
    open.clear();
    if (filter === '') {
      const held = handOpenedOf[tab];
      if (held !== null) open.add(held);
      return;
    }
    const held: CategoryNames[] = groups.map((group) => ({
      name: group.name,
      names: (byCategory.get(group.name) ?? []).map((entry) => entry.name),
    }));
    for (const name of matchingCategories(filter, held)) open.add(name);
  }

  /** Gives the box's text to the filter and renders the lists again. */
  const applyFilter = (): void => {
    filterTimer = null;
    writeFilter(search.value);
    seedOpen(filterText());
    renderOpenLists();
  };

  search.addEventListener('input', () => {
    // The box calls the filter at most once every 150 ms while the user types. The timer
    // that is already waiting is the call after the user stops.
    if (filterTimer !== null) return;
    filterTimer = window.setTimeout(applyFilter, FILTER_DELAY_MS);
  });

  /**
   * ALL and NONE act on the rows of the shown tab, which is what the user can see, and on
   * the kind of that tab alone. NONE in the shapes tab therefore leaves every marker on
   * the screen.
   */
  const setEveryCategory = (visible: boolean): void => {
    for (const group of groups) setCategoryOn(group.name, visible);
    update();
  };
  allButton.addEventListener('click', () => setEveryCategory(true));
  noneButton.addEventListener('click', () => setEveryCategory(false));

  /** Shows the other tab. The panel keeps the open set of each one. */
  function showTab(next: CategoryTab): void {
    if (next === tab) return;
    if (filterTimer !== null) {
      clearTimeout(filterTimer);
      filterTimer = null;
    }
    clearFilter(tab);
    tab = next;
    clearFilter(tab);
    search.value = '';
    rebuild();
  }
  systemsTab.addEventListener('click', () => showTab('systems'));
  shapesTab.addEventListener('click', () => showTab('shapes'));

  /** Puts one system or one shape in the list of one category. */
  function addEntry(name: string, entry: Entry): void {
    const held = byCategory.get(name);
    if (held === undefined) byCategory.set(name, [entry]);
    else held.push(entry);
    const used = flatCountOf.get(name) ?? 0;
    let flats = flatByCategory.get(name);
    if (flats === undefined || used === flats.length) {
      const next = new Int32Array(flats === undefined ? 64 : flats.length * 2);
      if (flats !== undefined) next.set(flats);
      flats = next;
      flatByCategory.set(name, next);
    }
    flats[used] = entry.flat;
    flatCountOf.set(name, used + 1);
  }

  /** Reads every system once, so the counts and the lists need no second sweep. */
  function readSystems(): void {
    const count = map.systemCount();
    for (let index = 0; index < count; index += 1) {
      const system = map.getSystem(index);
      if (system === null) continue;
      const fold = system.name.toLowerCase();
      const entry: Entry = {
        name: system.name,
        flat: allFolds.length,
        identity: system.id64 ?? system.name,
        flight: null,
      };
      allFolds.push(fold);
      // The system goes in every category it names. The row's dot brings the system
      // back through any of them, so the row's count and its list say so.
      for (const name of system.categories) addEntry(name, entry);
      addEntry(FLAT_KEY, entry);
    }
  }

  /**
   * Reads the shapes of one kind. `getShapeInfo` copies no line point, so a set of 4,096
   * lines of 65,536 points costs no copy of the geometry.
   */
  function readShapes(kind: ShapeKind, count: number): void {
    for (let index = 0; index < count; index += 1) {
      const info = map.getShapeInfo(kind, index);
      if (info === null) continue;
      const label = shapeLabel(kind, index, info.name);
      const fold = label.toLowerCase();
      const entry: Entry = {
        name: label,
        flat: allFolds.length,
        identity: `${kind} ${index}`,
        flight: { centre: info.centre, reach: info.reach },
      };
      allFolds.push(fold);
      for (const name of info.categories) addEntry(name, entry);
      addEntry(FLAT_KEY, entry);
    }
  }

  /** Reads the things of the shown tab. */
  function readEntries(): void {
    byCategory.clear();
    flatByCategory.clear();
    flatCountOf.clear();
    allFolds = [];
    matchFlags = new Uint8Array(0);
    matchText = null;
    if (tab === 'systems') {
      readSystems();
      return;
    }
    readShapes('sphere', map.sphereCount());
    readShapes('line', map.lineCount());
  }

  /**
   * Writes one byte per thing of the shown tab: 1 while the filter keeps it. The search
   * of a folded name runs once per thing here, and the count pass below then reads a
   * byte per thing per category it names.
   */
  function refreshMatches(text: string): void {
    if (matchText === text) return;
    if (matchFlags.length !== allFolds.length) {
      matchFlags = new Uint8Array(allFolds.length);
    }
    for (let index = 0; index < allFolds.length; index += 1) {
      matchFlags[index] = (allFolds[index] as string).includes(text) ? 1 : 0;
    }
    matchText = text;
  }

  /**
   * How many things of one category the filter keeps. It is the count pass, and it does
   * no sort: the panel reads each thing once per category it names, which is 200,000
   * reads at 50,000 systems over 8 categories with 4 names each. Each read is one byte
   * of the match flags, which `refreshMatches` writes once per filter change.
   */
  function matchCount(name: string): number {
    const held = flatByCategory.get(name);
    const count = flatCountOf.get(name) ?? 0;
    const text = filterText().toLowerCase();
    if (text === '' || held === undefined) return count;
    refreshMatches(text);
    const flags = matchFlags;
    let kept = 0;
    for (let index = 0; index < count; index += 1) {
      kept += flags[held[index] as number] as number;
    }
    return kept;
  }

  /** The things of one category the filter keeps, in order of name. */
  function entriesOf(name: string): Entry[] {
    const held = byCategory.get(name) ?? [];
    // The text is not trimmed, because the map compares the filter text as the host
    // gave it. A trim here would show a row whose marker the map does not draw.
    const text = filterText().toLowerCase();
    if (text !== '') refreshMatches(text);
    const kept =
      text === '' ? held.slice() : held.filter((entry) => matchFlags[entry.flat] === 1);
    kept.sort((left, right) => left.name.localeCompare(right.name));
    return kept;
  }

  /**
   * Writes the height cap of one open list into `--gm-list-cap` on the list area.
   *
   * The cap is `max(area - rows, 0.5 * area) / openCount`, which only the layout knows,
   * so the panel measures. `rows` is the height of one group less the height of its
   * list, added up: that difference is the row alone and it holds while a list moves.
   *
   * The write happens on a change of the value alone. The observer calls this on every
   * resize of the list area, and the HUD makes no DOM write in a still frame.
   */
  function writeCap(): void {
    const area = list.clientHeight;
    let rows = 0;
    for (const group of groups) {
      rows +=
        group.element.getBoundingClientRect().height -
        group.list.getBoundingClientRect().height;
    }
    const cap = listCap(area, rows, openCount);
    // A cap of 0 reads as `none`: the panel is not laid out yet, and a list that is
    // capped at no height would read as a fold the user did not ask for.
    const text = cap <= 0 ? 'none' : `${(Math.round(cap * 10) / 10).toString()}px`;
    if (text === lastCap) return;
    lastCap = text;
    setStyle(list, '--gm-list-cap', text);
  }

  const observer =
    typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => {
          writeCap();
        });
  observer?.observe(list);

  /** Empties a list that closed, and holds the rows while it closes. */
  function clearLater(group: Group): void {
    if (group.rows.childElementCount === 0 || group.clearTimer !== null) return;
    group.clearTimer = window.setTimeout(() => {
      group.clearTimer = null;
      group.rows.replaceChildren();
    }, LIST_MOVE_MS + 20);
  }

  /** Makes one row of an open list. */
  function makeEntryRow(categoryName: string, entry: Entry): HTMLButtonElement {
    const row = makeButton(doc, 'gm-hud__system-row');
    row.dataset['name'] = entry.name;
    row.dataset['identity'] = entry.identity;
    const name = make(doc, 'span', 'gm-hud__system-name');
    name.textContent = entry.name;
    row.append(name);
    row.addEventListener('click', () => {
      // The row turns its category on, because a row of a category the user closed
      // must still reach the thing it names. It turns on the kind of the shown tab
      // alone, so a shape row leaves the systems of that category where they are.
      setCategoryOn(categoryName, true);
      const flight = entry.flight;
      if (flight === null) {
        map.setSelection(entry.identity);
      } else {
        // Half the field of view is 30 degrees, so twice the reach is the distance at
        // which the shape fills the frame. A shape is never selected, so the flight
        // leaves the selection where it is.
        void map.flyTo({ cursor: flight.centre, distance: flight.reach * 2 });
      }
      update();
    });
    return row;
  }

  /**
   * Fills one list with the things of one category the filter keeps, up to a cap, and
   * writes the cut line where the cap dropped some.
   */
  function fillRows(box: HTMLElement, categoryName: string, cap: number): void {
    const entries = entriesOf(categoryName);
    const shown = Math.min(entries.length, cap);
    const children: HTMLElement[] = [];
    for (let index = 0; index < shown; index += 1) {
      children.push(makeEntryRow(categoryName, entries[index] as Entry));
    }
    if (entries.length > shown) {
      const cut = make(doc, 'div', 'gm-hud__system-cut');
      cut.textContent = `${formatWhole(shown)} of ${formatWhole(entries.length)}`;
      children.push(cut);
    }
    replaceChildrenKeepingFocus(box, children);
  }

  /**
   * Writes the count of every row. While the filter of the shown tab is empty a row
   * reads the total. While it holds text it reads `<matches> of <total>`, so the count
   * agrees with the list the row opens into, and a row the filter empties reads
   * `0 of <total>` and keeps its row.
   */
  function writeCounts(): void {
    const startMs = performance.now();
    const filtering = filterText() !== '';
    if (filtering) refreshMatches(filterText().toLowerCase());
    for (const group of groups) {
      const total = (byCategory.get(group.name) ?? []).length;
      const text = filtering
        ? `${formatWhole(matchCount(group.name))} of ${formatWhole(total)}`
        : formatWhole(total);
      if (group.count.textContent !== text) group.count.textContent = text;
    }
    countPassMs = performance.now() - startMs;
  }

  /**
   * Fills the list of every open category and empties every other list.
   *
   * The open lists share the row budget, at `floor(200 / open)` rows each, so the HUD's
   * node count does not follow the count of open lists. Where that share is 0, which a
   * filter matching in more than 200 categories reaches, the first 200 open lists in the
   * panel's own order hold one row each and the rest hold none. A list that holds no row
   * still says how many things it has, so the user narrows the filter to read it.
   */
  function renderOpenLists(): void {
    const open = openOf[tab];
    // The flat list is one always-open list, so it takes the whole share the rule gives
    // one open list.
    openCount =
      flatRows === null
        ? groups.reduce((count, group) => (open.has(group.name) ? count + 1 : count), 0)
        : 1;
    writeCounts();
    if (flatRows !== null) {
      fillRows(flatRows, FLAT_KEY, rowShare(1, 0));
      filterSignature = filterText();
      writeCap();
      update();
      return;
    }
    let openIndex = 0;
    for (const group of groups) {
      const isOpen = open.has(group.name);
      setAttribute(group.row, 'aria-expanded', isOpen ? 'true' : 'false');
      setAttribute(group.list, 'data-open', isOpen ? 'true' : 'false');
      if (!isOpen) {
        // The rows stay while the list closes and go after it, so the close moves over
        // the rows the user saw.
        clearLater(group);
        continue;
      }
      if (group.clearTimer !== null) {
        clearTimeout(group.clearTimer);
        group.clearTimer = null;
      }
      const cap = rowShare(openCount, openIndex);
      openIndex += 1;
      fillRows(group.rows, group.name, cap);
    }
    filterSignature = filterText();
    writeCap();
    update();
  }

  /** Builds one row per category of the shown tab and reads its things again. */
  function rebuild(): void {
    // The panel falls back to the systems tab where the last shape goes, which a dataset
    // switch does, because the shapes tab is disabled with no shape.
    if (tab === 'shapes' && shapeCount() === 0) tab = 'systems';
    // The mark is read before the first replace and restored after the last one. The new
    // groups hold empty lists, so a focused row finds its place only after
    // `renderOpenLists` fills them.
    const mark = focusMark(element);
    for (const group of groups) {
      if (group.clearTimer !== null) clearTimeout(group.clearTimer);
    }
    readEntries();
    groups.length = 0;
    const children: HTMLElement[] = [];
    const count = map.categoryCount();
    for (let index = 0; index < count; index += 1) {
      const category = map.getCategory(index);
      if (category === null) continue;
      const held = byCategory.get(category.name);
      // A category that holds nothing of the shown tab has no row: a row that counts
      // nothing switches nothing the user can see.
      if (held === undefined || held.length === 0) continue;
      const groupElement = make(doc, 'div', 'gm-hud__category-group');
      groupElement.dataset['name'] = category.name;
      const line = make(doc, 'div', 'gm-hud__category-line');

      // The dot switches the category and the rest of the row opens the list. The two
      // jobs took one button and a second small button before, and a user who wanted the
      // list switched the category off instead.
      const dot = makeButton(doc, 'gm-hud__category-dot');
      dot.dataset['name'] = category.name;
      dot.setAttribute('aria-label', category.name);
      const swatch = make(doc, 'span', 'gm-hud__category-swatch');
      swatch.style.border = `1px solid ${cssColor(category.color)}`;
      dot.append(swatch);
      dot.addEventListener('click', () => {
        setCategoryOn(category.name, !categoryOn(category.name));
        update();
      });

      const row = makeButton(doc, 'gm-hud__category-row');
      row.dataset['name'] = category.name;
      if (category.description !== undefined) row.title = category.description;
      const name = make(doc, 'span', 'gm-hud__category-name');
      name.textContent = category.name;
      const countText = make(doc, 'span', 'gm-hud__category-count');
      // The count reads every category a thing names, because the row's dot brings it
      // back through any of them. `writeCounts` rewrites it under a filter.
      countText.textContent = formatWhole(held.length);
      const icon = make(doc, 'span', 'gm-hud__category-chevron');
      icon.setAttribute('aria-hidden', 'true');
      icon.appendChild(makeChevronIcon(doc));
      row.append(name, countText, icon);
      row.addEventListener('click', () => {
        const open = openOf[tab];
        if (open.has(category.name)) {
          open.delete(category.name);
          if (handOpenedOf[tab] === category.name) handOpenedOf[tab] = null;
        } else {
          // At most one category is open while the box is empty. While it holds text
          // the row adds or removes one name, so a list the user folds during a search
          // stays folded until the text changes again.
          if (filterText() === '') open.clear();
          open.add(category.name);
          handOpenedOf[tab] = category.name;
        }
        renderOpenLists();
      });

      line.append(dot, row);
      const listWrap = make(doc, 'div', 'gm-hud__system-list');
      listWrap.dataset['open'] = 'false';
      const rows = make(doc, 'div', 'gm-hud__system-rows');
      listWrap.append(rows);
      groupElement.append(line, listWrap);
      children.push(groupElement);
      groups.push({
        name: category.name,
        element: groupElement,
        line,
        dot,
        swatch,
        row,
        count: countText,
        list: listWrap,
        rows,
        color: category.color,
        clearTimer: null,
      });
    }
    // A tab whose kind holds things and whose categories hold none shows one flat list
    // of those things in place of the rows. It covers both causes at once: no category
    // at all, and categories that hold nothing of this tab's kind.
    flatRows = null;
    if (groups.length === 0 && thingCount() > 0) {
      const flat = make(doc, 'div', 'gm-hud__category-group gm-hud__flat-group');
      flat.dataset['flat'] = 'true';
      const listWrap = make(doc, 'div', 'gm-hud__system-list gm-hud__flat-list');
      listWrap.dataset['open'] = 'true';
      const rows = make(doc, 'div', 'gm-hud__system-rows');
      listWrap.append(rows);
      flat.append(listWrap);
      children.push(flat);
      flatRows = rows;
    }
    replaceChildrenKeepingFocus(list, children);
    dataSignature = signature();
    filterSignature = filterText();
    // The rebuild reads the open set and never writes it. A name of a category that is
    // gone opens no list, because the render reads the groups the panel holds.
    renderOpenLists();
    restoreFocus(element, mark);
  }

  /** What the panel rebuilds on: the table, the system set and the shape set. */
  function signature(): string {
    return `${map.categoryCount()}:${map.systemCount()}:${map.sphereCount()}:${map.lineCount()}`;
  }

  /** Writes the state of every control. Each write happens only on a change. */
  function update(): void {
    const noShape = shapeCount() === 0;
    if (shapesTab.disabled !== noShape) shapesTab.disabled = noShape;
    // No switch reaches a thing that names no category, so the two buttons are disabled
    // over a flat list.
    const noSwitch = flatRows !== null;
    if (allButton.disabled !== noSwitch) allButton.disabled = noSwitch;
    if (noneButton.disabled !== noSwitch) noneButton.disabled = noSwitch;
    setPressed(systemsTab, tab === 'systems');
    setPressed(shapesTab, tab === 'shapes');
    setAttribute(systemsTab, 'aria-selected', tab === 'systems' ? 'true' : 'false');
    setAttribute(shapesTab, 'aria-selected', tab === 'shapes' ? 'true' : 'false');
    const searchLabel = tab === 'systems' ? 'Search systems' : 'Search shapes';
    setAttribute(search, 'placeholder', searchLabel.toUpperCase());
    setAttribute(search, 'aria-label', searchLabel);
    const selection = map.getSelection();
    const selected = selection === null ? null : (selection.id64 ?? selection.name);
    /** Marks the row of the selected system, so the list says which one is current. */
    const markCurrent = (box: HTMLElement): void => {
      for (const row of box.children) {
        if (!(row instanceof HTMLElement)) continue;
        const identity = row.dataset['identity'];
        if (identity === undefined) continue;
        setAttribute(row, 'aria-current', identity === selected ? 'true' : 'false');
      }
    };
    if (flatRows !== null && tab === 'systems') markCurrent(flatRows);
    for (const group of groups) {
      const on = categoryOn(group.name);
      setPressed(group.dot, on);
      // A row of a category that is off shows it: the dot is hollow and the name dims.
      setAttribute(group.line, 'data-on', on ? 'true' : 'false');
      setStyle(group.swatch, 'background', on ? cssColor(group.color) : 'transparent');
      setStyle(
        group.swatch,
        'box-shadow',
        on ? `0 0 10px ${cssColor(group.color)}` : 'none',
      );
      setStyle(group.swatch, 'opacity', on ? '1' : '0.5');
      // A shape is never selected, so the shapes tab marks no row as the current one.
      if (tab !== 'systems') continue;
      markCurrent(group.rows);
    }
  }

  return {
    element,
    rebuild,
    update,
    countPassMs(): number {
      return countPassMs;
    },
    poll(): void {
      const nextData = signature();
      if (nextData !== dataSignature) {
        rebuild();
        return;
      }
      const nextFilter = filterText();
      if (nextFilter !== filterSignature) {
        filterSignature = nextFilter;
        // A host that writes the filter changes the text, so the open set follows it as
        // it follows the search box.
        seedOpen(nextFilter);
        renderOpenLists();
        return;
      }
      update();
    },
    dispose(): void {
      if (filterTimer !== null) {
        clearTimeout(filterTimer);
        filterTimer = null;
      }
      for (const group of groups) {
        if (group.clearTimer !== null) clearTimeout(group.clearTimer);
        group.clearTimer = null;
      }
      observer?.disconnect();
    },
  };
}
