## Context

See `proposal.md` — Why. The constraints that shape the work:

- The HUD reads the map through the public handle alone. ESLint fails the lint on an
  import of `src/render/`, `src/scene-data/` or `src/camera/` from `src/hud/`, and on a
  read of a `debug` property. A reading the HUD needs must be a member of `GalaxyMap`.
- No HUD element may carry `backdrop-filter`. `map-hud` states the 3.5 ms a frame that
  bought, and says the sheet departs from the mockup on purpose. The mockup's new parts
  carry it again; they lose it again.
- Every style rule sits under `.gm-hud` in one sheet, `packages/galaxy-map/src/hud/styles.ts`.
  The `@font-face` at-rules are the one stated exception.
- The HUD tick runs 10 times a second and calls `optionsPanel.update()` every time.
- `real-systems` keeps `iconSystemCount` high and never low: a record that loses its icons
  keeps its slot in the icon list, because a correction would need a sweep of the set.
- The catalog reader caps the catalog at 256 entries (`MAX_DATASETS`).

## Goals / Non-Goals

**Goals**

- The HUD draws what the mockup now draws, minus the parts the specs already reject.
- A switch and a tab are there only where they move something.
- The dataset dialog is one screen with one click to load.

**Non-Goals**

- No change to `DatasetInfo`, to the catalog reader or to `loadDataset`.
- No change to the renderer, the scene data or the camera.
- No new dependency. The chevrons, the arrows and the spinner are inline SVG and CSS.

## Decisions

### The conditional switches hide, they do not rebuild

`createOptionsPanel` keeps building every switch the host left open, and `update()` sets
`hidden` on the three that follow the map. The panel element itself takes `hidden` while
none of its switches is shown.

The alternative was to rebuild the body whenever the set of shown switches changes. That
costs a DOM write on a tick, loses the focus of a switch the user is tabbed onto, and buys
nothing: a hidden `<button>` takes no focus and lays out nothing.

`createOptionsPanel` still returns `null` when **every** switch is locked, because that
reading cannot change at run time, and `index.ts` then appends no element. The run-time
case is the `hidden` element, so `index.ts` needs no change.

### `hasSystemIcons()` over `iconSystemCount()`

The handle gets a boolean and not a count. The HUD asks one question — "would this switch
move anything?" — and a count invites a caller to read it as the number of systems with
icons, which it is not, because the count only rises. The boolean carries the same
imprecision with none of the invitation.

It reads `set.iconSystemCount > 0` and walks nothing, so the tick cost does not follow the
set.

The rejected alternative was to make the count exact with a sweep on replacement. That is
a per-record cost on a load of 50,000 records, to correct a reading whose only consumer
drops a switch.

### The collection colour is a palette index, not a computed hue

A small string hash of the collection name picks one of **eight** fixed colours — the eight
the mockup names for its shapes. Deterministic, stable across sessions and hosts, legible
on the panel background because each one was picked by hand, and about six lines.

The alternatives:

- **A computed hue** (`hsl(hash % 360, 70%, 68%)`) gives 360 colours and no guarantee that
  any of them reads well beside the accent orange or on the dark ground.
- **A new `color` field on the catalog entry** puts the work on every host and leaves the
  HUD with a fallback to write anyway.

Two collections can collide on one colour. The chip and the card both carry the name, so a
collision costs nothing a user reads.

### The dialog stays open while the load runs

A card click sets a loading id, draws the spinner on that card and leaves the dialog open.
The `then` and the `catch` of `loadDataset` close it.

Today's dialog closes at once and shows the loading state in the top bar alone. The mockup
puts the spinner on the card, which only works while the card is on the screen. The user
sees the answer beside the thing they clicked.

`Escape` and a click outside still close the dialog during a load, and the load continues,
so the dialog never traps the user behind a slow fetch. The field's spinner is what carries
the load after the dialog closes.

### The open dialog must not cost the dataset switch its budget

`dataset-catalog` gives a switch of a full set — 50,000 systems and 256 categories — **40 ms**
of main thread, from the `loadDataset` call until the promise settles. The dialog now stays
open across that whole window with up to 256 cards in the document, where before it closed
first.

The cards are static while the load runs: the dialog writes the spinner on one card and
touches nothing else, so the open grid adds layout and paint, not script. The reading is
what decides it, not the argument, so the change measures the switch **with the dialog
open** and against the same 40 ms. Where it fails, the dialog closes on the click as it does
today and the field's spinner is the only feedback.

### The top bar becomes three flex groups

`gm-hud__top-left` and `gm-hud__top-right` take `flex: 1 1 0` and the new
`gm-hud__top-centre` takes `flex: 0 1 auto`. Two equal side groups put the centre group at
the middle of the bar. The left and right groups keep `min-width: 0` and their text keeps
`text-overflow: ellipsis`, so a long title clips rather than pushes.

The rejected alternative was `position: absolute; left: 50%; transform: translateX(-50%)`
on the centre group. That centres it exactly, and it lets a long title run under it.

### The arrows read the catalog, not the dialog

`prev`/`next` step `getDatasets()` by the place of `getLoadedDataset()`. The dialog's
search text and picked chip are the dialog's own state and are cleared when it opens, so
they cannot bind the arrows.

A load started by an arrow is the same `loadDataset` call the card makes, and both go
through one helper in `top-bar.ts` that owns the loading flag. Today that flag lives in
`dataset-dialog.ts`; it moves to the field, which is the part both callers share and the
part that shows it.

### One `@keyframes` at-rule

The spinner needs `@keyframes gm-hud-spin`. An at-rule takes no selector, so it cannot sit
under `.gm-hud`, which is the same exception `@font-face` already takes. The name is
prefixed, so it cannot collide with a host page's own keyframes. The
`prefers-reduced-motion` block already in the sheet gets a rule that stops the turn.

### The chevron replaces the list icon in place

`makeListIcon` becomes `makeChevronIcon` and keeps its call site. The rotation is a CSS
`transform` on `.gm-hud__category-chevron`, driven by the `aria-expanded` of the row that
is already written, with the 140 ms the list itself uses. No new state.

## Risks / Trade-offs

- **The e2e suite drives the old dialog.** `e2e/datasets.spec.ts` clicks a row and then
  **LOAD DATASET**; both are gone. → Rewrite those flows in the same change, and run the
  suite before the implementation gate. One Playwright run at a time: a second run kills
  the first one's preview server.
- **The screenshot baseline moves.** The top bar, the tabs, the category rows and the
  dialog all change. → Re-take the baseline and compare it against the mockup as the look
  gate asks, rather than accepting whatever the code produced.
- **A switch that appears mid-session moves the switches under it.** The two that can
  appear at run time sit third (**System icons**) and fifth (**Shapes**) in the order, so an
  icon record added mid-session pushes three switches down. → The order is what `map-hud`
  states and this change keeps it. The event that adds them is a dataset load or a host
  call, which the user starts, and not something that happens while they aim at the panel.
- **`hasSystemIcons()` can read true with no icon drawn.** A record replaced by one with no
  icon leaves the switch on the panel. → Stated in the spec, on both sides. The switch still
  works; it moves nothing until the next load, which clears the set.
- **A card grid of 256 entries is 256 buttons.** → The catalog reader already caps at 256,
  the cards carry no image, and the grid is built once per open and cleared on close, as the
  list is today.
- **`datasetArrows` adds a HUD option that the demo does not use.** A flag nothing exercises
  rots. → The war cycles page turns it on, where a catalog of weeks in order is what the
  arrows are for, and the `a-dataset-catalog` wiki example turns it on so the sample page
  covers it. Neither moves the main page's look baseline.

- **Four requirements outside the two that are rewritten state the old behaviour.** The
  `HudOptions` table, the HUD's node bound, two keyboard scenarios that hard-code switch
  counts, and the Canonn page's clause about a grouped list. → Each one carries a delta in
  this change. A later reader who finds one of them stale should read it as a miss, not as a
  second contract.

## Migration Plan

The change is inside one library package and its demo. A host that took the library by its
package name gets the new dialog on upgrade.

**The breaking part** is the two-step load. A host that drove the dialog from its own code
by clicking the row and then **LOAD DATASET** has no such buttons. The handle's
`loadDataset(id)` is unchanged, and that is what such a host should call. The change notes
say so.

No data migration, no storage, no rollback step beyond reverting the commit.
