## Context

See [proposal.md](proposal.md) for the motivation. This document settles the seven technical
decisions the work turns on and the order they land in.

The state the change starts from:

- `packages/galaxy-map/src/scene-data/real-systems.ts` holds `primaryCategory` and
  `secondaryCategories` on `RealSystem`, on `SystemRecordInput` and on the internal
  `MutableSystem`. `firstCategoryOn` reads the primary first, then the secondary list.
- `packages/galaxy-map/src/scene-data/shapes.ts` holds the same pair on five interfaces.
  Its reader `readCategories` (line 575) gives back a `ShapeCategoryFields` (line 480) of
  `{ primaryCategory, secondaryCategories, categories }`, but that third field is a
  **`number[]` of table indices**, the primary first, and not the name list `ShapeInfo`
  reads back. The names are rebuilt by `categoryFields` (line 491) from the two fields this
  change deletes.
- `packages/galaxy-map/src/hud/categories.ts` joins the pair back together in `readSystems`
  and `readShapes`, and `hud/info-panel.ts` joins it in one line.
- `packages/galaxy-map/src/camera/view.ts` holds `BrowseBounds`, `resolveBounds` and
  `farZoomLimit`, and `app/create-map.ts` holds the setting in `boundsSetting`.
- `app/datasets.ts` holds the catalog reader and the load state machine, and its `write`
  callback is the one place a load touches the map.
- `render/nebula-slot.ts` holds `DEFAULT_NEBULA_OCCLUSION = 1` and
  `render/renderer.ts` holds `nebulaOcclusionOf`, which clamps to `[0, 1]`.
- `app/markers.ts` sweeps the whole set once per frame and builds two keepers, the 64
  nearest for the name labels and the 32 nearest for the icon stacks.

**This change stacks on `system-marker-icons`.** That change is complete and merged and is
not archived. It modifies two of the requirements this change modifies and it adds the
`system-icons` capability and the seven-dataset requirement this change edits.
`openspec validate` already reports two INFOs from that, and both have the one cause. The
header "The demo site carries seven data sets" is not in `openspec/specs/dataset-catalog/`
yet, and the whole `system-icons` capability is not in `openspec/specs/` at all, so the
MODIFIED block this change writes for "The icon placement is bounded" has no target. The
first task therefore archives `system-marker-icons`, and both clear.

## Goals / Non-Goals

**Goals:**

- One category list on every input and every reading, with the first entry carrying the
  look, and no compatibility path for the old pair.
- An uncategorised set that is a first-class set: it draws, it picks, it searches and it
  has a usable HUD.
- A nebula that dims through bright mass by a measured amount, and that pays no fragment
  cost where it can no longer be seen.
- A catalog entry that can say where its set lives and where the camera opens.
- An icon that gives way to a nearer marker.

**Non-Goals:**

- No deprecation window and no run-time reader for `primaryCategory`. The two names are
  banned in the **type** instead, as decision 1 states, so a TypeScript caller meets a
  compile error and not a silent loss. A caller that casts from `unknown` gets the
  run-time reading: the reader drops an unknown field, so the record names no category and
  the rejection report says `no-category`. Both routes tell the caller, and neither needs
  a second reader path.
- No CPU march of the density volume. The nebula cull stays on the GPU.
- No depth read-back for the icons, and no test against the invented decoration stars.
- No change to the marker pass, the star pass, the volume pass or the selection rules.

## Decisions

### 1. `categories` is read once and the first entry carries the look

The reader builds one `string[]`, drops a repeat, and keeps the record's own order.
`RealSystem.categories` and `ShapeInfo.categories` are that array.

`firstCategoryOn` loses its special case for the primary category and becomes one loop over
`system.categories`. `categoryIndices[index]` keeps the index of `categories[0]` where every
category is off, which is what it keeps today for the primary, so no reader of that array
meets an index outside the table.

**Alternative rejected: keep `primaryCategory` as a derived reading.** A getter that gave
back `categories[0]` would leave two names for one fact and would keep every test and every
converter on the old shape. The whole point of the merge is that there is one name.

**Why the first entry and not the table order.** It is the rule the tree already follows,
it is host data rather than library state, and the requirement "A category can be turned
off" already states it as "the order the record gave them".

**The old names are banned at the type level, and they have to be.** Both input types
carry `readonly [field: string]: unknown`, which is there so a caller can pass a Spansh or
an EDSM record whole. An index signature turns off TypeScript's excess-property check, so
`{ name, coords, categories: ['A'], primaryCategory: 'A' }` compiles clean and loses `'A'`
at run time with no word. `SystemRecordInput`, `SphereInput` and `LineInput` therefore
declare `primaryCategory?: never` and `secondaryCategories?: never`. `never` is assignable
to `unknown`, so the index signature accepts the declaration; the named field fails the
compile and every unknown field still passes.

That pair is what turns the migration into a build failure the compiler lists. It is also
what makes the sweep of the 60 files that name either field a mechanical one.

**The command that lists them is `tsc`, not `pnpm lint`.** The root script is `eslint .`,
and ESLint reports no type error. Vitest and Playwright transpile without checking types.
`pnpm exec tsc --noEmit -p tsconfig.json` is what fails on the `never` pair, and it is the
first step of the library's own `build`. It reads the root `tsconfig.json`, which includes
`packages/*/src`, `apps/*/src`, `e2e` and `tests`, so its list holds the TypeScript files
alone. The 12 JSON files, the two READMEs and `build-demo-systems.mjs` are swept from a
grep instead.

**`shapes.ts` needs two lists, not one.** `readCategories` keeps returning the index list,
because that is what the sweep and the colour rule read and it is unchanged by the merge.
What `categoryFields` builds from the two deleted fields has to be built from the input's
`categories` instead: one `string[]` of the names the shape gave, in the record's order,
which is what `ShapeInfo.categories` reads back. `ShapeCategoryFields` therefore carries a
name list and an index list, and the two deleted fields go.

Naming them apart matters: the field called `categories` in that file today holds indices,
and the field called `categories` on the public `ShapeInfo` holds names. The implementation
renames the internal one — `categoryIndices` is the name `real-systems` already uses for
the same thing — so one name does not mean two things in one file.

### 2. `no-category` and `set-is-uncategorised` hold the all-or-nothing rule

The set holds one counter, `uncategorisedSystems`, raised by a record that names no
category and reset by `clearSystems` and `clearSystemsAndCategories`. The two readers
consult it and the table size:

| Call            | Condition                        | Result                        |
| --------------- | -------------------------------- | ----------------------------- |
| `addSystems`    | record names none, table empty   | accept                        |
| `addSystems`    | record names none, table not empty | reject `no-category`        |
| `addCategories` | `uncategorisedSystems > 0`       | reject `set-is-uncategorised` |

Two counters would be wrong. A counter that fell on a replacement would need a sweep, so
the counter rises and is reset with the set, by the rule `iconSystemCount` already
follows and states.

**Alternative rejected: one mode flag on the set, set by the first call.** A flag would
have to decide what a map with neither a system nor a category is, and the two counters
above answer that without a state to name: an empty map takes either kind.

**Alternative rejected: accept the mix and let the HUD sort it out.** The user settled
this: the consumer chooses one or the other. A mixed set gives a panel whose rows cover
part of the map and say nothing about the rest.

### 3. The uncategorised look is a constant beside the two that exist

`real-systems.ts` already exports `DEFAULT_MARKER_STYLE` and `DEFAULT_MAX_DRAW_RANGE_LY`,
which are what a category takes when it names neither. The change adds
`DEFAULT_MARKER_COLOR = [150, 170, 200]` beside them.

The marker pass reads a colour per category from the category texture. A system with no
category needs a row to read, so the set **writes one internal row** holding the default
colour, the default style and the default range, and points `categoryIndices` at it. The
row is not in the table: `categoryCount()` reads 0, `getCategory(0)` reads null, and
`setCategoryVisible` reaches nothing. The pass, the pick sweep and the marker overlay
therefore need no branch at all.

**The guard that hides the row belongs to the handle's `getCategory` alone, and nowhere
else.** `set.category(index)` has four callers: `render/system-pass.ts:231` and `:253` for
the colour, the style and the range, `app/markers.ts:503` and `scene-data/picking.ts:88`
for the range, and `app/create-map.ts:2154`, which is the handle's proxy. A guard inside
`set.category` would reach the first three, and `buildMarkerColors` would then take
`FALLBACK_COLOR` at `system-pass.ts:70`, which is `[1, 1, 1]` — **white**. Every
uncategorised marker would draw white and the scenario "The default marker draws and is
picked" would fail on the pixel. `set.category` therefore returns the internal row to every
internal reader, and the handle's `getCategory` is the one place that reads it back as
null.

**`FALLBACK_COLOR` states the same fact as the new constant.** Its comment reads "The
colour a marker draws in when its category index names no category", which is what
`DEFAULT_MARKER_COLOR` now states. After this change the internal row makes the fallback
unreachable for a system of an uncategorised set, so the two must not both stand as the
answer to one question. The implementation removes `FALLBACK_COLOR` or defines it from the
new constant, and the task says so.

**Alternative rejected: no row at all, and the existing null fallback.** `system-pass.ts`
already falls back to `DEFAULT_MARKER_STYLE` and `DEFAULT_MAX_DRAW_RANGE_LY` on a null
category, so decision 3 could be one colour constant added to a path the code already has,
and no internal row. The row is taken over it because the HUD and the host read the look
too: with no row, `getCategory` gives null and every reader outside the pass has to hold
its own copy of the three defaults. The row puts the answer in one place. The cost is the
invisible state the Risks section names.

**Alternative rejected: a branch in the marker shader on an index of -1.** It would put the
default in the shader, where the HUD and the overlay could not read it, and every reader of
`categoryIndices` would need the same branch.

### 4. The HUD's flat list is the existing row list with no group

`hud/categories.ts` builds `byCategory`, a map from a category name to its entries, and
`renderOpenLists` fills one open list per group. The flat list is one group with no name,
no dot and no count, whose list is always open. `entriesOf`, `rowShare`, `listCap`,
`makeEntryRow` and the cut line are reused unchanged.

The trigger is `groups.length === 0 && thingCount > 0` after `rebuild` has read the
entries. That one condition covers both tabs and both causes: no category at all, and
categories that hold nothing of this tab's kind.

**The counts.** `entriesOf(name)` already filters a category's entries. The count pass runs
it for **every** group when the filter text is not empty, and writes
`${formatWhole(matches)} of ${formatWhole(total)}`. It runs in `renderOpenLists`, which
already runs once per change of the filter and once per rebuild, so no new schedule is
needed. The budget is the walk `real-systems` holds at 2 ms. It is not the
same walk: the sweep reads each system once, and the count pass reads each system once per
category it names, so 10,000 systems over 8 categories with 4 names each is **40,000**
entry reads. It is a string compare per read against a filter of a few characters, it runs
at most once per 150 ms, and 2 ms is the bound it is held to.

**Alternative rejected: count the matches in the map rather than the HUD.** The map would
have to hold a per-category match count and keep it with the filter, which is HUD state
living in the data layer, and `src/hud/` may not import `src/scene-data/` in any case.

### 5. The nebula cull is a degenerate vertex, not a CPU test

The transmittance is computed **in the vertex stage** today, one value per record, identical
at all 36 vertices. The CPU does not know it and would need its own march of the density
volume to find it: 358 records times 16 steps per frame, of a rule that lives in GLSL. That
is the wrong place for it.

The cull is therefore two lines in `nebulae.vert`: where `mean(T) < NEBULA_CULL_FLOOR`, the
vertex writes a clip position behind the far plane, the primitive is clipped, and the
fragment march never runs. Every vertex of the record takes the same branch, because every
vertex reaches the same `T`, so the box collapses whole.

**The four selection readings do not move.** `drawnCount`, `drawCalls`, `aboveFloorCount`
and `coveredArea` are readings of the CPU-side selection, which runs before the draw and
knows nothing of `T`. The spec states that, so a test cannot mistake the cull for a change
in the budget.

**Why 0.02.** Below it a record contributes under 2 per cent of its own light and under 2
per cent of its own alpha. Against the bright mass that pushed `T` that low, the tone map
cannot resolve that difference. The floor is a constant in `nebula-slot.ts` beside the
other three, so it needs no import and no uniform plumbing beyond the one it joins.

**The default is 2.0.** `nebulaOcclusionOf` drops its upper bound and keeps
`Number.isFinite` and `>= 0`. `DEFAULT_NEBULA_OCCLUSION` becomes `2`: twice the optical
depth the volume carries over the same segment.

The figure is settled here rather than left to the run. A default the implementation picks
after reading the frame is a default no test can fail, and it would take the tolerance
below with it. 2.0 is the first whole multiple above the cap the change removes, and it is
what every figure in this section is computed from. A later change that wants another look
moves one constant and reworks the two figures that follow it. The debug handle already
writes the constant, so a reader can try another value in the page before anyone proposes
that change.

**The tolerance that follows it.** `e2e/nebulae.spec.ts` asserts that `BRIGHT_VIEW`
changes by under 2 per cent between the occlusion constant 1 and 0. Transmittance at a
constant `k` is `T1^k`, so at the default the worst channel of that view changes by
`1 - 0.989^2`, which is 2.2 per cent. The tolerance becomes **4 per cent**: that estimate
plus the same margin the old figure carried. The test writes both numbers beside the view.

`e2e/nebulae-firefox.spec.ts` reads the same nebula at `CLOSE_VIEW` and asserts the frame
with the pass on differs from the frame with it off by at least 0.001 of mean luminance.
The new default lowers that difference. At `CLOSE_VIEW` the camera is 1,000 light years
out and the segment is short, so the transmittance is near 1 and the reading has room, but
the spec is run and the reading recorded rather than assumed.

The pinned baseline image is the far view at 60,000 light years, where the zoom band draws
no nebula, so it does not move.

### 6. A dataset entry's bounds and view apply in `loadDataset`, before the announce

`DatasetWriter.write` is the one callback a load uses to reach the map. The change gives
it two more, beside `write` and on the same type: `setBounds(bounds | null)` and
`applyView(view)`. They belong to `DatasetWriter` (`app/datasets.ts:164`), which
`DatasetStateOptions` (line 174) extends, and **not** to `DatasetState` (line 182), which is
the handle `createDatasetState` returns. `loadDataset`
calls them between `write` and `announce`, so a listener that adds shapes sees the bounds
the entry asked for.

`null` restores the map's own option. `create-map.ts` therefore keeps the option's value in
a field of its own beside `boundsSetting`, which is one more variable and no new state
machine.

**`fit: 'systems'` reuses `farZoomLimit`.** The set already keeps its box, as
`RealSystemSet.systemBox`, and `farZoomLimit(R)` already gives `2 * R`. `fit` is the box
centre and `farZoomLimit(halfDiagonal)` of that box.

**The two read different radii, and that is the point.** `bounds: { mode: 'auto' }` takes
the box plus the 1,000 light year margin, so the zoom the bound allows is wider than the
frame `fit` opens at. The camera therefore opens on the systems and can pull back to the
margin. The margin is room to fly, not room to look at, so `fit` does not carry it.

**A host's own `setBounds` stands until the next load.** The restore reaches for the map's
`bounds` **option**, which is the value the host passed to `createMap`, and not for
whatever the host wrote with `setBounds` afterwards. Two writers of one setting need one
rule, and the option is the one a host can always name. A host that wants its own bound
back after a load writes it in `onDatasetChange`, which fires after both steps.

**The start load and the deep link.** The demo calls `map.setView(decodeView(hash))` after
the build, which beats the `startView` option on purpose and would beat a dataset view too,
because the start load settles later. Rather than track whether the host has written the
view, the rule is the simpler one: **on the start load an entry's `view` applies only where
the options named no `startView`.** The demo page then passes the decoded fragment as
`startView` when the URL names one, and drops the `setView` that followed the build. One
rule, one demo edit, and no hidden state.

**Alternative rejected: the host applies the bounds in `onDatasetChange`.** It works for
the demo and for no one else: every host would rewrite the same 10 lines, and a host would
have to reset the bounds for every entry that names none, which is the part that is easy to
forget and hard to see.

### 7. The icon occlusion test rides the sweep that already runs

`app/markers.ts` sweeps every system once per frame and offers each to two keepers, the 64
nearest for the name labels and the 32 nearest for the icon stacks.

**The label keeper needs one change, not a third keeper.** It holds the 64 nearest today,
in ascending range, but the sweep offers to it only where
`namesOn && index !== hoverIndex && index !== selectedIndex`. The occlusion test needs
every nearer marker, including the hovered one, the selected one and every one drawn while
the names are off. The offer therefore loses its guard, and the two exclusions move to the
**consumer**: the label pass skips the hovered and the selected index as it walks the
keeper, which is where the rule belongs — the comment in the tree already gives the
reason, that those two place their own label first — and it does no work at all while the
names are off.

**The keeper grows from 64 to 66, and the label pass takes a placement cap.** The keeper
**is** the label cap today: `MAX_NAME_LABELS = 64` sizes it at `markers.ts:19`, `place()`
counts no placements, and the loop walks every kept entry. So each half of the change moves
the count on its own, in opposite directions. With the guard in the consumer, a frame
holding a hover and a selection inside the 64 nearest places 62. With the keeper at 66, a
frame holding neither places 66. `system-selection` states "at most 64 name labels, plus
the hover label and the selection label", and 62 is a visible loss in exactly the frames a
user is working in.

Both need fixing together: the keeper holds **66** and the label pass stops after **64
placements**. A frame with no hover and no selection walks 66 and places 64; a frame with
both walks 66, skips 2 and places 64. The counter counts placements and not walked entries,
because a label dropped on an overlap must not spend one of the 64. The occlusion test then
walks at most 66 candidates, which is the figure the icon requirement states.

One keeper, two readers, and no extra offer in the sweep.

For each of the at most 32 stacks, the test walks that keeper from the nearest, stops at the
first candidate whose range is not below the stack's own, skips the stack's own index, and
tests the candidate's projected centre against each element's box. The worst frame is 32
stacks by 5 elements by 66 candidates, and the loop breaks early on range in almost every
real frame.

**`placeOf` is called again for each candidate**, and it is the only new work. It is a
matrix multiply and two divides, so the worst frame adds at most 2,112 of them. The change
measures the overlay's mean frame time at a full set before and after and holds it inside
the budget the icon stack already states.

**Per element and not per stack.** The requirement "The icon placement is bounded" already
refuses a stack-against-stack overlap test, because a whole stack blinking through a cluster
reads as a fault. Hiding the one element a nearer marker sits behind reads as an occlusion
instead: the marker draws in the gap.

**`visibility: hidden` and not `display: none`.** The element keeps its place in the pool
and its layout, so the next frame that shows it costs one style write. The pool's element
count does not move, which is what the bound requirement counts.

## Risks / Trade-offs

**The merge is a breaking change to a published package.** → The package is at an early
version and the demo is the only host in the tree. The type change is what catches a
caller: a record that names `primaryCategory` no longer compiles, because decision 1 bans
the name with `?: never`, and one that is cast from `unknown` is reported as `no-category`
at run time. Both routes tell the caller. The version rises from 0.6.0 to 0.7.0 to say so.

**The ban is also what makes the sweep large.** 60 files in the tree name one of the two
fields, and every TypeScript one of them fails the build until it moves. Most of the volume
is data: 5,509 of the mentions sit in 12 JSON files that a script rewrites. What is left is
18 Playwright suites, 21 unit tests, 7 source files and 2 READMEs, by hand, and `tsc` lists
all but the READMEs and the one `.mjs`.

**The committed demo sets must be rewritten and the converters cannot be re-run offline.**
→ The converters fetch dumps from the network into an ignored directory. A one-off script
rewrites the seven committed JSON files field for field, and the converters are changed to
write the new shape, so the next online run writes the same file. A unit test reads a
committed fixture through the changed converter, which is what catches a drift between the
two.

**The uncategorised internal category row is invisible state.** → A reader of
`categoryIndices` cannot tell it from a real row. The set exposes `categoryCount()` of 0 and
`getCategory` of null for it, and a unit test asserts both, so the row cannot leak into the
HUD or into a host's reading.

**A higher occlusion default may dim nebulae the project wants bright.** → The value is
pinned at 2.0 here so a test can fail on it. The constant stays a single named value the
debug handle already writes, so a reader can try another value in the page, and a change
of the look is one number plus the two figures computed from it.

**The cull floor may pop a record in or out as the camera moves.** → At `T = 0.02` the
record contributes 2 per cent of its light, which the tone map cannot resolve against the
mass that dimmed it. The browser test that reads a culled record asserts the two blocks are
**identical**, which is the assertion that would fail if the floor were set too high.

**The icon test costs a projection per candidate.** → The loop breaks on range, so a stack
near the camera tests almost nothing. The worst case is a stack behind all 66 nearest
markers, which is a frame where the overlay is already doing its most work, and the change
measures it rather than assuming it.

**An icon that hides may read as a missing icon.** → The scenarios pin the per-element rule,
so at most one element of a stack goes at a time in the common case, and the marker the
stack sits on never hides. A whole stack goes only where a nearer marker sits behind every
element of it, which is a frame in which the stack was covering that marker completely.

## Migration Plan

1. Archive `system-marker-icons`, so its requirements are in `openspec/specs/` and this
   change's deltas apply to them.
2. Land the library reader changes, the HUD changes, the nebula changes and the icon change
   together: the merge touches the type the demo compiles against, so a half-landed merge
   does not build.
3. Rewrite the 12 committed JSON files with the one-off script, in the same commit as the
   converter change, so the tree never holds a converter and a file of different shapes.
4. Sweep the 18 Playwright suites and the 21 unit tests by hand, from the list
   `pnpm exec tsc --noEmit -p tsconfig.json` gives after step 2. They are in the same
   commit: the `never` pair fails the build until the last one moves.
5. Raise the package version. There is no rollback path for a host that has already written
   records to the new shape, and none is needed: the old shape is one release behind.

**Why the six pieces land together.** The request names them together, and three of them
meet in one file: the merge, the flat list and the count all rewrite `hud/categories.ts`,
and the merge rewrites the same 39 test files the other five are verified in. Splitting
them would mean two passes over that sweep. The two pieces that could be lifted out whole
are the nebula work, which touches only `render/`, and the icon occlusion, which touches
only `app/markers.ts`; each is one section of the tasks and one delta file, so a reviewer
who wants a smaller change can take either out without touching the rest.

**The scenario titles keep the old words on purpose.** Seven scenarios inside MODIFIED
requirements still read "primary category" or "secondary category" in their **headings**,
while every body reads `categories`. `openspec validate` refuses a MODIFIED block whose
scenario names do not match the current spec, so renaming them here fails the gate and
would fail the archive. The change `rename-category-scenario-headings` owns them: it
declares `skip_specs`, it renames the seven headings by a direct edit of
`openspec/specs/`, and its first task is to check that this change is archived.

## Open Questions

None. The occlusion default is pinned at 2.0 and the tolerance at 4 per cent, both in
this document and in the `nebulae` delta, so each is a decision a test can fail rather than
a measurement the run settles.
