## Context

See proposal.md — Why.

What the tree holds today, and what shapes the approach:

- **`MAX_SYSTEMS = 10000`** sits at
  [packages/galaxy-map/src/scene-data/real-systems.ts:12](../../../packages/galaxy-map/src/scene-data/real-systems.ts#L12).
  Two files read it. `real-systems.ts` allocates five buffers at it, and
  [system-pass.ts:358-360](../../../packages/galaxy-map/src/render/system-pass.ts#L358-L360)
  allocates three more and sizes three GPU buffers from their byte lengths.
- **The buffers are allocated when the map is built**, before a record arrives. The set
  holds `positions` (`Float64Array`, 3 per system), `categoryIndices` (`Uint16Array`),
  `iconIndices` (`Int32Array`), `iconFlags` and `markerFlags` (`Uint8Array`). The pass
  holds `offsets`, `colors` (`Float32Array`, 3 each) and `styleRanges` (`Float32Array`,
  2 each).
- **`positions`, `categoryIndices`, `markerFlags` and `iconIndices` are public members of
  `RealSystemSet`, and each one is a getter that returns `subarray(0, n)`**
  ([real-systems.ts:899-933](../../../packages/galaxy-map/src/scene-data/real-systems.ts#L899-L933)).
  So the members already report the records the set holds, at any allocation. The
  allocation is visible only through `positions.buffer.byteLength`, which is 240,000 bytes
  on an empty set today. `pickSystem` reads three of the members into local names at the top
  of the call, and the marker pass reads them per frame.
- **`MAX_SYSTEMS` is not exported from the package.** `src/index.ts` exports the types of
  that module and not the number, and the `exports` map points at `dist/`.
- **`pickSystem`** ([scene-data/picking.ts:48](../../../packages/galaxy-map/src/scene-data/picking.ts#L48))
  sweeps the set once. Per system it reads the marker flag, subtracts the camera, takes one
  square root, reads the category row and tests the cursor range. It applies the matrix
  only after all of that, and it builds the matrix once for the call.
- **`real-systems.test.ts` imports `MAX_SYSTEMS`** and builds its over-capacity cases from
  it, so those cases follow the constant with no edit.

Sizes, at the two bounds, for one map:

| Buffer                       | At 10,000 | At 100,000 | At 50,000 |
| ---------------------------- | --------- | ---------- | --------- |
| Set, CPU                     | 320 KB    | 3.2 MB     | 2.6 MB    |
| Marker pass, CPU             | 320 KB    | 3.2 MB     | 1.6 MB    |
| Marker pass, card            | 320 KB    | 3.2 MB     | 1.6 MB    |

The 10,000 and 100,000 columns are the buffers the set held before this change. The set row
at 50,000 carries 1 MB more than five times the 10,000 column, because the remedies of
section 2 added five arrays per record: the draw range, and the category rows of each record
with the start, the count and the run capacity that read them.

**The readings at 10,000, taken on 2026-09-21 on the dev container's RTX 4080.** Each one
comes from a browser test that already exists and already logs its number:

| Reading                        | Test                                                   | At 10,000     | Budget  |
| ------------------------------ | ------------------------------------------------------ | ------------- | ------- |
| `systemAt`, mean call          | `e2e/selection.spec.ts:376`                            | **0.477 ms**  | 1 ms    |
| Selection work per frame       | `e2e/frame-budget.spec.ts:451`                         | 0.438 ms, worst 1.2 ms | 2 ms |
| Flag sweep of `real-systems`   | `e2e/systems.spec.ts:1830`                             | 0.1 to 0.5 ms | 2 ms    |
| Count pass of the category panel | `e2e/count-cost.spec.ts:19`                          | 1 ms          | 2 ms    |
| Star base class change         | `e2e/stars.spec.ts:741`                                | worst 13 ms   | 50 ms   |
| Dataset switch                 | `e2e/datasets.spec.ts:377`                             | 3.6 ms        | 40 ms   |
| Close zoom, every marker capped | recorded in `real-systems`, no test holds it          | 1.617 ms      | 16.7 ms |

To take them again:

```bash
GALAXY_MAP_E2E_BUILT=1 pnpm exec playwright test \
  e2e/selection.spec.ts e2e/frame-budget.spec.ts e2e/datasets.spec.ts \
  e2e/systems.spec.ts e2e/stars.spec.ts e2e/count-cost.spec.ts \
  -g "holds its time bound at a full set|the selection work stays inside its budget|switches inside the 40 ms budget|the sweep holds its budget|a base class change costs one slow frame at most|the count pass holds its budget" \
  --reporter=list
```

**Five of the seven do not survive ten times the set**, and the pick is the tightest: 0.477
ms of a 1 ms budget leaves room for a set of about 21,000 if the whole call followed the set.
It does not: a call also builds the camera and the matrix once, which is fixed cost. So the
number that matters is the slope, not the reading, and task 2.1 is what reads it.

## Goals / Non-Goals

**Goals:**

- One set holds as much of a Canonn map as the readings hold, which is 50,000 records.
- A host pays for the records it holds, not for the bound.
- Every budget that names the bound is read again, and none of them moves.

**Non-Goals:**

- No streaming, no level of detail and no tiling. This change moves one number and the
  allocation behind it.
- No new member, no new option and no change to the shape of a record.
- No change to the 256-category bound or the 256-entry catalog bound.
- No page. `publish-the-canonn-data-page` is the page, and it waits for this change.

## Decisions

### The slope is read before anything is made cheaper

Five passes walk the whole set and fail at ten times it. Each reading is one point, and a
whole call holds a fixed part as well as a part that follows the set:

| Pass                             | Reading at 10,000 | Budget | What it walks                       |
| -------------------------------- | ----------------- | ------ | ----------------------------------- |
| `pickSystem`                     | 0.477 ms          | 1 ms   | Every record, per hover frame        |
| The flag sweep, `refreshFlags`   | 0.1 to 0.5 ms     | 2 ms   | Every record, on a set or filter change |
| The count pass, `hud/categories.ts` | 1 ms           | 2 ms   | Every record, per category it names, on a filter change |
| The star suppression index       | worst frame 13 ms | 50 ms  | Every record, on a set version change |
| The selection work               | 0.438 ms          | 2 ms   | The pick and the label placement, per frame |

**Task 2.1 reads each one at two set sizes and states the fixed part and the slope.** Only
then does the remedy follow. The pick is the one the plan hangs on: if most of its 0.477 ms
is the camera, the matrix and the handle hop, then the inner loop is already cheap and the
remedy is a different one.

**The failing pick scenario is the accept path.** `e2e/selection.spec.ts:376` puts 10,000
systems in one category with the default 120,000 light year draw range, so the gate rejects
nothing and every system is projected. A cheaper reject path — dropping the `set.category()`
call, moving the range square root behind the gate — helps the second scenario, the one this
change adds, and not the reading that fails. The accept-path candidates are the two divides
per system and a clip-space reject before them.

_Alternative rejected for now:_ a spatial index over the set. It is the only thing that makes
the pick sublinear, and it is a structure to build, to keep and to invalidate. It stays
rejected while the slope is unread; where the slope says the inner loop is the cost and the
inner loop cannot be made cheap enough, the honest landing is the 20,000 floor or that index,
and task 2.2 says which.

### 100,000 is a proposal, and the readings decide

The largest measured Canonn map holds 71,142 systems. 100,000 is the next round number
over it, and it is one order of magnitude from the bound today.

**The readings landed the bound at 50,000.** The dataset switch read 46.7 ms against its
40 ms budget at 100,000, and the flag sweep and the count pass both read within a tenth of
a millisecond of their 2 ms budgets there. At 80,000 the switch read 35.3 to 39.1 ms and
the count pass 1.8 ms, which is inside the noise of the instrument.

**60,000 is what says the noise is real.** At 60,000 the switch read 22.6 to 24.3 ms and the
count pass 1.4 to 1.7 ms, and the flag sweep read exactly 2.0 ms on one run of three and
failed. A budget that a pass meets on two runs and misses on the third is not a budget the
pass holds. 80,000 sits closer to its budgets than 60,000 does, so the same instrument would
carry it over. At 50,000 the switch reads 17.5 to 18.5 ms, the flag sweep 0.9 to 1.2 ms over
four runs and the count pass 1.3 ms, and the tightest reading of all eight is the star index
at 33.1 ms of its 50 ms.

**The order of the work is: grow the buffers, make the three passes cheaper, raise the
number, take the readings.** Where a reading fails, the bound drops to the highest round
number that holds every reading, and no budget moves. A budget that moves to keep a number
is a budget that stops being a test.

**The floor is 20,000.** Under that the change buys `publish-the-canonn-data-page` nothing
its split rule does not already give, and the right answer is to abandon the change rather
than land it small.

The frame budget is the one at risk. The reading behind the close cap was 10,000 forced
40 CSS pixel glow markers in a mean of 1.617 ms against 16.7 ms. Ten times the fragments is
about 16 ms of that one scenario, which is the whole budget. That scenario forces every
marker to the cap inside a 10 light year ball, which no data set does, and the requirement
keeps it because it is the worst case. If it is the only reading that fails, the bound
drops; the alternative, a scenario written down to what the data does, would be a budget
that tests the data and not the renderer.

_Alternative rejected:_ 1,000,000. Nothing in the tree asks for it, `positions` alone would
be 24 MB, and the pick sweep and the per-frame rebase are both linear in the set.

### The buffers follow the records, in blocks

Each buffer starts empty and grows when the next record does not fit. Growth allocates a
larger array, copies the old one into it and replaces the member. The block rule is the
implementation's; doubling from a small first block is the ordinary one, and it makes the
copies logarithmic in the record count.

**The growth is why the members have to be read fresh.** A reader that held `positions`
over a growth would read the old array. `pickSystem` takes its local names at the top of
each call, so it is safe as it stands. The marker pass reads the set per frame, and the
delta states that `version` rises on a growth, so a reader that caches by version sees it.

The GPU buffers are sized by `gl.bufferData` at build time from the CPU byte lengths. They
follow the same growth: on a grow the pass calls `bufferData` again with the new length,
which is a reallocation on the card and happens once per growth, not per frame.

_Alternative rejected:_ keep the allocation at the bound and let a host that wants a small
map pass an option. That is a new option, a new thing to get wrong, and a default that is
wrong for every host that draws ten records.

### `MAX_SYSTEMS` becomes a public export

`publish-the-canonn-data-page` reads the bound in a Node build script, to know when a map
splits. The constant is internal today, and a script that copies the number goes stale the
next time the number moves. The number is in the built JS already, so the export adds no
code and adds one name. The edit is one line in `src/index.ts`, one entry in the wiki, which
`tests/wiki-pages.test.ts` reads as the export list, and one delta of `library-package`,
whose requirement writes the export list out by name. It changes no behaviour.

### The specs that state the bound take deltas, the ones that mention it take an edit

A spec that **states** the bound, or a budget read at a full set, takes a delta. A spec that
**mentions** the bound while it reasons about something else takes a direct edit after the
archive, as `2026-09-20-rename-category-scenario-headings` edited a heading. A MODIFIED delta
of each mention would copy a long requirement to change one number.

**14 requirement deltas over 8 spec files**, which the proposal lists one by one:

| Spec               | What it takes                                                  |
| ------------------ | -------------------------------------------------------------- |
| `real-systems`     | A REMOVED plus an ADDED, and two MODIFIED                       |
| `system-selection` | The pick, and the selection budget                              |
| `map-hud`          | The count pass, and the HUD's own frame budget                  |
| `system-icons`     | The icon draw budget, and the icon placement bound              |
| `dataset-catalog`  | One requirement: the set a `load()` may return and the 40 ms switch |
| `map-shapes`       | The shape set frame budget                                      |
| `close-view-stars` | The star suppression index                                      |
| `library-package`  | The export list of the main entry point                         |

The `real-systems` delta is a **REMOVED plus an ADDED** and not a MODIFIED, because the
requirement's name carries the number: "The set holds up to 10,000 systems". A MODIFIED
matches on the name, so the name cannot move inside one. The removal states the migration:
a host that relied on a rejection at 10,001 records now receives those records.

**The `real-systems` MODIFIED block drops two sentences** that describe the change which
moved the close cap from 30 to 40 CSS pixels: that change is archived, "this change" in
them now reads as this one, and the reading they explain is kept in the scenario below them.

**16 more sentences restate the number while they reason about something else**, and the
proposal's table carries the line of each one. Where a requirement states the bound in its
prose and again in a scenario, the two move in one edit: the four of `system-selection` are
one requirement. The icon placement bound went to a delta for the opposite reason, because
its prose and its cap scenarios could not be separated.

**Six places that name 10,000 systems stay**, because the number is the instrument and not
the bound, and the proposal names each one. Task 5.3 reads every other `10,000` in
`openspec/specs/` and states why it stays, including every scenario heading that says "full
set": a heading that says it over a body that builds 10,000 records is the defect that rule
exists to catch.

### The full-set tests build their records

The browser tests that need a full set generate one, as they generate 10,000 today. A
committed 100,000-record fixture would be about 4 MB of JSON in the repository for a set
that a loop writes in a few milliseconds.

## Risks / Trade-offs

- **The close-zoom frame budget may not hold at 100,000** → The bound drops to what holds.
  The measurement runs before the number is written into the constant, so the failure costs
  a reading and not a revert.
- **The pick is linear in the set, and the hover calls it every frame** → The gates in
  front of the projection are what hold it, and the delta now states them. A second
  scenario reads the call with the whole set out of range, which is the shape a large data
  set has at most zooms.
- **Growth replaces four public arrays** → Every reader in the package takes them per call
  or per frame today. The risk is a future reader that caches one. The delta states the
  rule, and `version` rises on a growth so a cache can see it.
- **A host that loads a 100,000-record set pays a long main-thread parse** → That is the
  host's `load()`, which the library does not run and the 40 ms switch budget does not
  cover. `dataset-catalog` already says so.
- **A `bufferData` call with a new length orphans the store on the card** → The colours and
  the style ranges have to be written again after a growth. It is safe here because a growth
  follows an add and an add raises `version`, which already forces the rebuild at
  `system-pass.ts:452-457`. The implementer has to keep that order, not discover it.
- **Four unit cases build `MAX_SYSTEMS` records** (`real-systems.test.ts`, lines 370, 391,
  586 and 931). At 50,000 that is 200,000 objects per run. The cases stay, and task 3.5
  holds the whole file under 10 seconds; a case that passes that builds its records in a
  loop of primitives rather than object literals.
- **Two of those four also hold a millisecond budget**, and both are keyed to the constant:
  50 ms for an add pass and 50 ms for a replace pass at line 586, and a 2 ms median sweep at
  line 931. Ten times the records meets an unchanged bound, so both fail. The second is the
  unit twin of the flag sweep this change reads in the browser, so the remedy of task 2.4
  reaches it. `TIMED_TEST` is `{ retry: 2 }` and weakens no bound. Task 3.2 decides the two
  numbers from the readings of task 2.1, which is the same rule the browser budgets follow:
  the pass gets cheaper or the bound lands lower, and no budget is raised to keep a reading.
  The two unit numbers are the one thing that follows the bound, because each is a per-record
  allowance and not a budget the pass has to meet: 50 ms for 10,000 records is 250 ms for
  `MAX_SYSTEMS` records, and the same code that passed at the old bound passes at the new one.
  The browser budgets, which measure a pass against what a user waits for, do not move.
- **A larger bound invites a host to draw more than the HUD can list** → The HUD's row cap
  is 200 rows over the open lists, which does not move. One category of 100,000 systems
  lists 200 of them and says how many it held, as it does today.

## Migration Plan

1. The buffers grow first, under the bound that stands. The whole suite passes at 10,000
   with the allocation changed, so the growth is proved on its own.
2. The three linear passes get cheaper, still at 10,000, and each one is measured against
   the reading this change recorded. A pass that got slower is caught before the bound moves.
3. The constant rises and becomes a public export. The unit cases follow it.
4. The browser readings are taken at 100,000. The bound drops to what holds, and the number
   in the constant, in the 14 requirement deltas and in the 16 edited sentences is the number the
   readings gave. Under 20,000 the change stops instead.
5. Rollback is a revert of the constant alone. The growth and the cheaper passes are an
   improvement at any bound.
