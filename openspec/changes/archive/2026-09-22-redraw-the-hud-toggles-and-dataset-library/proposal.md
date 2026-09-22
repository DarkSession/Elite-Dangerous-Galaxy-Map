## Why

The mockup in `.design/Galaxy Map HUD.dc.html` changed. It now draws a different category
tab pair, a different open/close icon on a category row, a centred dataset field with step
arrows beside it, and a dataset library built from cards rather than a list and a detail
pane. The HUD in the tree still draws the old shapes.

Two of the changes are not look alone. The map options panel today draws a **Shapes**
switch on a map that holds no shape and a **System icons** switch on a map where no record
names an icon. Both are controls that change nothing the user can see. The panel already
drops the **Nebulae** switch for that reason, and the same reading applies to these two.

## What Changes

**The category panel**

- The **SYSTEMS** and **SHAPES** tabs take the joined look the mockup draws: one shared
  border, no gap, larger and heavier text.
- A category row's open/close icon becomes a chevron that turns 180 degrees when the list
  opens, in place of the three-line list icon.

**The map options panel**

- The **Shapes** switch draws only while the map holds at least one sphere or line. The
  panel reads the two counts on its tick, so the switch appears when a host adds the first
  shape and goes when a dataset load clears them.
- The **System icons** switch draws only while at least one record on the map names an
  icon. This needs a new public handle member, because the HUD reads the map through the
  handle alone.
- A dropped switch is hidden and not rebuilt, and the panel hides itself while no switch
  it holds is shown. The panel comes back when one does.

**The top bar**

- The dataset field moves to the centre of the bar. The title and the region name take the
  left, the zoom and the reset button take the right, and the divider beside the field
  goes.
- The field's `▾` text caret becomes an SVG chevron, and a turning spinner takes its place
  while a load runs.
- `HudOptions` takes a new `datasetArrows`, a boolean that is **false**. With it true the
  bar draws a **previous** and a **next** arrow around the field and an `i / n` counter
  after it. Each arrow loads its neighbour in catalog order, and it is disabled at the end
  of the catalog and while a load runs.

**The dataset library dialog**

- The grouped list, the detail pane, the **CANCEL** button and the **LOAD DATASET** button
  go. The dialog becomes a search box, a row of collection chips and a grid of cards.
- A click on a card loads that dataset and closes the dialog. **BREAKING** for a host that
  drove the dialog by the old two-step flow.
- The search box matches an entry's `label` alone. The chips filter by `collection`, one
  chip per collection with its count, and an `ALL` chip.
- Each chip and each card carries a swatch in a colour the HUD works out from the
  collection's name. No catalog field changes.
- The 120-row cap and the `120 OF 130` line go. The catalog reader already caps the
  catalog at 256 entries, so the grid is bounded by construction.
- The card of the loaded entry and the card of a loading entry carry the accent border, and
  a loading card carries the spinner.
- A card's `title` holds the entry's `region`, its `description` and its count, so the
  fields the detail pane showed are still there. The count reads `FETCHED ON LOAD` where the
  entry carries none, as the pane did.
- The dialog stays open while the load runs and closes when it settles, so the spinner sits
  on the card the user clicked.

**The pages**

- The **Thargoid war cycles** page turns `datasetArrows` on. Its catalog is one entry per
  week of the war in cycle order, so the arrows are the control that page wants.
- The **A dataset catalog** wiki example turns it on as well, so the sample page covers the
  flag without moving the main demo page's look baseline. The example needs no spec of its
  own: `sample-pages` already states that a sample is the code the wiki shows, so the wiki
  block is the page's one source.

**Not in this change**

- The **SHAPES** tab of the category panel keeps its disabled state on a map with no shape.
  It is a tab and not a switch, and the panel already falls back to **SYSTEMS**. Confirmed
  with the owner.
- The mockup's `backdrop-filter`, which the HUD drops on purpose. `map-hud` states why.
- The distance column of an expanded category's system rows, which the mockup drops and
  this change keeps.
- The mockup's 750 ms artificial load delay, which stands in for a real fetch.
- The mockup's **LOADING DATASET…** line, which hides the category list while a load runs.
  The field and the card already state the load, and the category panel rebuilds itself
  from the new set anyway.
- The mockup keys its chips and its swatches on the entry's **primary category**. This
  change keys them on the `collection`, because the dialog calls no `load()` and therefore
  knows the categories of the loaded entry alone.
- The mockup lists its collections in catalog order. The chips are sorted by name, because
  a list the user scans reads better sorted and the catalog's own order is what the arrows
  follow.
- The mockup turns the chevron over 150 ms. The HUD turns it over the 140 ms the list itself
  takes, so the icon and the list move together.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `map-hud`: the tab look, the category chevron, the centred top bar, and the map options
  panel, whose requirement is retired and replaced by one that names the switches the map
  can act on.
- `dataset-catalog`: the dialog requirement is retired and replaced by one for the new
  library, and `datasetArrows` is a new requirement of its own.
- `system-icons`: a new handle member that says whether any record on the map names an
  icon.
- `canonn-data-page`: the clause and the scenario that say the dialog groups the list by
  `collection`, which is now the chip row.
- `thargoid-war-cycles-page`: the page turns the step arrows on.

## Impact

- `packages/galaxy-map/src/hud/top-bar.ts`: the three-region bar, the arrows, the counter,
  the SVG caret and the spinner.
- `packages/galaxy-map/src/hud/dataset-dialog.ts`: rewritten around the chips and the card
  grid.
- `packages/galaxy-map/src/hud/options-panel.ts`: the two conditional switches, and a panel
  that hides itself while it shows none.
- `packages/galaxy-map/src/hud/categories.ts`: the chevron icon.
- `packages/galaxy-map/src/hud/styles.ts`: the tab, chevron, top bar, chip, card and
  spinner rules, and one `@keyframes` at-rule.
- `packages/galaxy-map/src/hud/types.ts`: `datasetArrows`.
- `packages/galaxy-map/src/app/create-map.ts`: the new icon member on the handle.
- `e2e/datasets.spec.ts` and `e2e/hud.spec.ts`: the selectors and the flows of the dialog
  and the bar.
- `apps/demo/cycles/main.ts`: `datasetArrows` on for the war cycles page.
- `docs/wiki/Examples/The-HUD.md` and `docs/wiki/Examples/A-dataset-catalog.md`, which is
  also the source of the `a-dataset-catalog` sample page.
- `e2e/cycles-page.spec.ts`, `e2e/canonn-page.spec.ts`, `e2e/system-icons.spec.ts` and
  `e2e/samples.spec.ts`, for the arrows, the chip row and the new handle member.
- `tests/main-bundle.test.ts`: the HUD chunk grows from 62,293 to 71,668 bytes, which
  passes its 70,000 bound, so the bound moves to 80,000. Every byte of the growth is HUD
  code: the card grid, the chip row, the arrows, the counter and the spinner. The guard is
  there to catch the HUD pulling in a data layer, and the smallest of those is the 199 KiB
  region cell table, so the guard still holds at 80,000.
