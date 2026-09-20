## Why

A host writes a system's categories twice: once as `primaryCategory` and once as
`secondaryCategories`. The two fields hold one list. Every reader in the library joins
them back together before it uses them — the sweep that decides which markers draw, the
category panel's counts, the information panel's chips — and every converter in
`apps/demo/scripts/` splits one list to write them. The split buys nothing and costs a
rule in six places.

Four smaller faults sit beside it:

- A nebula seen through the bulge is dimmed by the volume's own extinction, but the
  default takes that extinction at face value. Against the look the project targets, a
  nebula behind a very bright mass still reads too strongly, and it pays a full fragment
  march to contribute light the frame cannot show.
- A search narrows the lists in the category panel but not the counts beside the rows.
  The row reads `1,116` while its open list holds three names, so the count says the
  opposite of what the user can see.
- The reader rejects every record that names no category. A host with a flat set of
  systems and no grouping to offer must therefore invent a category to get a map.
- The Thargoid War Cycle set covers a few hundred light years of the bubble, and the map
  opens on the whole 120,000 light year galaxy and lets the user fly to the rim. Nothing
  in the catalog can say where a set lives, although the map already holds both parts:
  `bounds: { mode: 'auto' }` and `startView`.
- An icon stack is a DOM element over the canvas, so it covers what the canvas drew at
  those pixels whatever the depth. The icons of a system 4,000 light years away therefore
  block a star sprite 40 light years from the camera, and the frame reads back to front.

**Non-goals.** The category table itself does not change: a category still carries a name,
a colour, a style, a draw range and a description, and `addCategories` is unchanged but
for one new rejection. No migration shim is kept for the old record fields. No new HUD
panel, no per-category search, and no per-dataset look settings. The nebula work changes
two look constants and one shader branch; it adds no pass, no texture and no CPU march.
The icon rule does not read the frame buffer and does not reach the invented decoration
stars. Nothing here changes what the marker pass, the star pass or the volume pass draw.

## What Changes

**One category list.**

- **BREAKING** `SystemRecordInput` takes `categories`, an array of names, and no longer
  takes `primaryCategory` or `secondaryCategories`. `RealSystem` reads back `categories`
  alone.
- **BREAKING** `SphereInput`, `LineInput` and `ShapeInfo` take and read back `categories`
  in the same way.
- Each input type declares `primaryCategory?: never` and `secondaryCategories?: never`, so
  a caller that names either one fails the compile. Without that pair the index signature
  that lets a Spansh record carry its extra fields would take the old names as well, and
  the reader would drop every category of the set with no word to the caller.
- The **first** name of the list is what `primaryCategory` was: it gives the colour, the
  style and the draw range, under the rule "the first category the record names that is
  on" that both markers and shapes already follow.
- The demo converters, the seven committed demo sets, the fixtures and `README.md` move to
  the one field.

**Systems with no category.**

- A record MAY carry no category. `addSystems` accepts it while the category table is
  **empty** and rejects it as `no-category` while the table holds a category, which is
  today's rule for a record that names none.
- `addCategories` rejects a category, with the new reason `set-is-uncategorised`, while
  the set holds a system that names none. A set is therefore categorised or not, and never
  half of each.
- A marker with no category draws in one library default: a stated neutral colour, the
  default style and the default draw range. No switch reaches it and no name filter rule
  changes.
- **The HUD grows a flat list.** A tab of the category panel whose rows would be empty,
  while its own kind holds things, shows one list of those things in place of the rows:
  no dots, no counts, and **ALL** and **NONE** disabled. The search box filters it and a
  click selects, as a row in an open list does. This also reaches the shapes tab, where **every**
  shape names no category. A set that mixes the two, such as the demo's `adamastor`, keeps
  its rows and keeps its uncategorised shapes out of the panel, as it does today.

**The counts read the search.**

- While the filter of the shown tab is empty a row's count reads the total, as it does
  today. While it holds text the row reads `<matches> of <total>`, for example `3 of 128`.
  A row whose things the filter all drop reads `0 of 128` and keeps its row.

**The nebulae dim harder through bright mass.**

- The occlusion constant stops being capped at 1. It SHALL take any finite value from 0
  up, and a value above 1 raises the optical depth over the same segment.
- The **default rises from 1 to 2.0**, so the pass draws twice the optical depth the
  volume carries over the same segment. The figure is fixed here, and the tolerance of the
  browser test that reads a barely-occluded view is computed from it: 4 per cent.
- A record whose transmittance falls under a **cull floor** collapses in the vertex stage
  and marches no fragment. The floor is **0.02** of the mean channel: a nebula that
  contributes under 2 per cent of its own light is a nebula the frame cannot show, so the
  cull removes the fragment cost and not a visible record. Through a bright mass a nebula
  therefore stops drawing at a nearer range than it does today, which is the draw-distance
  part of this change.
- The tolerance of the scenario "A nebula with little in front of it barely changes" moves
  with the default, because the same segment carries a larger optical depth.

**A catalog entry carries its own bounds and view.**

- `DatasetEntry` takes an optional `bounds`, which is the `BrowseBounds` of
  `map-navigation`, and an optional `view`.
- `view` takes the fields of `StartView` and one more, `fit: 'systems'`, which centres the
  camera on the box of the set the load wrote and sets the distance so that box fills the
  frame. A field the entry names beside `fit` wins over what `fit` worked out.
- The map applies both **after** it writes the set and **before** it announces the load, so
  a listener that adds shapes sees the bounds the entry asked for.
- An entry that names no `bounds` restores the map's own `bounds` option, so one restricted
  set in a catalog does not restrict the next.
- On the **start** load an entry's `view` applies only where the options name no
  `startView`, so a deep link wins over the catalog. On every later `loadDataset` the
  entry's `view` applies.
- The demo's `thargoid-war` entry names `bounds: { mode: 'auto' }`, which is the set's own
  box plus the default 1,000 light year margin, and `view: { fit: 'systems' }`. The demo
  page passes its decoded fragment as `startView` where the URL names one, in place of the
  `setView` it makes after the build.

**A nearer marker hides an icon.**

- The keeper of the 64 markers nearest the camera grows to **66** and holds every drawn
  marker, including the hovered one, the selected one and every one drawn while the name
  switch is off. The label pass takes over the two exclusions and stops after **64** labels
  are placed, so the label count does not move.
- Each icon of a stack, and the arrow under it, SHALL hide while the marker of a system
  **nearer to the camera** than the stack's own projects inside that element's screen box.
  The nearer star then shows through the gap the hidden icon leaves, so the frame reads
  front to back.
- The test is per element and not per stack. A stack whose top icon alone is covered keeps
  its other three, which is what an occlusion looks like, and a stack that hid in whole on
  one covered pixel would blink as the camera moves through a cluster.
- The rule reads the systems of the set alone. The invented decoration stars of
  `close-view-stars` are not tested: the map holds no list of them to test against, and
  a real system already suppresses the invented stars near it.

## Capabilities

### New Capabilities

None. Every rule lands in a capability that already exists.

### Modified Capabilities

- `real-systems`: the record carries `categories` and may carry none; the reject reasons
  and the category-switch rule read one list; a category is rejected while the set is
  uncategorised; a marker with no category draws in the library default.
- `map-shapes`: a sphere and a line carry `categories`; `getShapeInfo` reads it back.
- `map-hud`: a row's count reads the filter; a tab with no rows shows a flat list;
  **ALL** and **NONE** are disabled there.
- `dataset-catalog`: an entry carries `bounds` and `view`; the map applies them on a load;
  the demo's Thargoid war entry names both.
- `nebulae`: the occlusion constant is uncapped, its default rises, and a record under the
  cull floor marches no fragment.
- `system-icons`: an icon and its arrow hide behind a nearer system's marker.
- `library-package`: the typed record and shape inputs the package publishes carry
  `categories`.
- `map-navigation`: `bounds` may be written by a dataset load, and `getBounds` reads back
  what took effect.
- `system-selection`: the pick rule reads the whole category list and takes a system that
  names none; the label keeper holds 66 candidates and every drawn marker, and the label
  pass caps the placements at 64.
- `system-icons`: the bound requirement reads the keeper's new size and says the keeper is
  shared.

## Impact

**Library.** `scene-data/real-systems.ts` (the record reader, the sweep, the box),
`scene-data/shapes.ts` (the shape reader and `getShapeInfo`), `scene-data/picking.ts`,
`app/create-map.ts` (the handle types, the dataset load, the bounds and the start view),
`app/datasets.ts` (the entry reader and the state machine), `hud/categories.ts` (the
counts and the flat list), `hud/info-panel.ts` (the chips), `hud/styles.ts`,
`render/nebula-slot.ts` (two constants), `render/renderer.ts` (`nebulaOcclusionOf`), the
nebula vertex shader and `app/markers.ts` (the icon occlusion test).

**Demo.** `apps/demo/scripts/build-demo-systems.mjs` and its `.d.mts`, the seven files of
`apps/demo/demo-data/`, `apps/demo/src/multifaction.ts` and `apps/demo/src/main.ts`.

**The sweep.** The two names are in **60 files** across the tree, and the `never` pair
above turns every TypeScript one of them into a compile error. They divide in five:

| Kind                  | Files | What moves them                                |
| --------------------- | ----- | ------------------------------------------------ |
| JSON data             | 12    | A one-off script                                 |
| Playwright suites     | 18    | By hand                                          |
| Unit tests            | 21    | By hand                                          |
| Library and demo source | 7   | By hand, and they are the change itself          |
| READMEs               | 2     | By hand                                          |

The 12 JSON files hold 5,509 of the mentions: the seven of `apps/demo/demo-data/` (5,370,
of which `uia.json` alone holds 4,139) and the five `tests/fixtures/*-demo-set.json` (139).
`multifaction` has no committed demo set, because it fetches.

The 18 Playwright suites hold 81 mentions: `hud` (26), `systems` (10), `datasets` (8),
`shapes` (7), `frame-budget` (6), `touch` (4), `selection` (4), `system-icons` (3),
`navigation` (3), `stars` (2), and one each in `cursor-marker`, `demo-site`, `fly-to`,
`grid`, `info-panel`, `paint-cost`, `plane-overlay` and `start-view`.
`e2e/nebulae.spec.ts` names neither field and changes for the tolerance alone, and
`e2e/nebulae-firefox.spec.ts` changes not at all but is re-run, because it reads a nebula
the new default dims.

The 21 unit tests are `shapes`, `real-systems`, `create-map`, `record-input`, `picking`,
`markers`, `info-panel`, `renderer`, `shape-pass`, `system-pass`, `star-field` and
`star-suppression` in the package; `apps/demo/src/multifaction.test.ts`; and
`tests/demo-systems.test.ts`, `tests/main-bundle.test.ts` and the six converter tests under
`tests/fixtures/`.

**`pnpm lint` does not find them.** The root `lint` script is `eslint .`, and ESLint reports
no type error. The `never` pair fails under `tsc` alone, which this repository runs as the
first step of `pnpm build`. The work list therefore comes from
`pnpm exec tsc --noEmit -p tsconfig.json`, and it holds the TypeScript files only: the 12
JSON files, the two READMEs and `apps/demo/scripts/build-demo-systems.mjs` are outside the
root `tsconfig.json` and are swept from this list instead.

The pinned baseline image is the far view at 60,000 light years, where the zoom band draws
no nebula, so it does not move.

**Documentation.** `README.md` and `packages/galaxy-map/README.md`, which both show a
record with the old fields.

**Nine requirements that state a rule this change replaces** also carry deltas, because the
prose survives a rename of the fields. Of `real-systems`: "The set holds positions in
float64", "The demo page loads the Guardian Ruins data set", "A marker draws for every
system at every zoom distance" and "A category carries a name, a colour and a description",
which holds the closed list of reject reasons the new one joins. Of `map-hud`: "A category
expands into a list of its systems" and "The information panel shows the selected system".
Of `system-selection`: "The pick finds the nearest marker under a pixel" and "The marker
name labels are bounded". Of `system-icons`: "The icon placement is bounded". Without them
the archived specs would state the old rule beside the new one, and in three places
contradict it outright.

**A published package.** The library publishes as `@elite-dangerous-almanac/galaxy-map`.
The record and the shape inputs are its supported surface, so the merge is a breaking
change. The version rises from **0.6.0 to 0.7.0**: the package is below 1.0, where a minor
rise is what carries a breaking change.

**This change stacks on `system-marker-icons`,** which is complete and not yet archived.
That change already modifies "A record follows the shape of an EDSM or a Spansh dump",
"The reader reports every record it rejects" and the demo catalog requirement. The deltas
here are written against its text, not against the archived spec, and it must be archived
first.

**The scale.** The set holds **10,000** systems and the table **256** categories, which is
what `real-systems` already states. Merging the two fields changes no bound: the sweep that
rebuilds the marker flags still reads each system's categories once and still holds under
**2 milliseconds** for 10,000 systems over 8 categories with 4 names each. The new count
pass runs `entriesOf` once per row, so at that shape it walks **40,000** entries, which is
each system once per category it names. It runs once per change of the filter text, which
the HUD makes at most once per 150 ms, and it holds the same **2 millisecond** bound. The flat list holds
the panel's existing **200** row budget. The nebula cull removes work and adds one compare
per vertex over **358** records, so no frame budget moves. The icon occlusion test runs
over the **32** kept stacks, at most 5 elements each, against the **66** markers nearest
the camera, and it stops at the first marker no nearer than the stack's own system, so it
costs at most 10,560 box tests in the worst frame and is held inside the overlay's
existing **2 millisecond** per-frame budget at a full set at 1920 by 1080.
