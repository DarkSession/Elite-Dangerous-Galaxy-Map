## Why

The library holds at most **10,000 systems** in one set. `real-systems` states the bound,
`packages/galaxy-map/src/scene-data/real-systems.ts` holds it as `MAX_SYSTEMS`, and
`addSystems` rejects every record over it with `over-capacity`.

The number was chosen for the demo data. The largest of the seven committed sets holds
1,116 systems. Nothing in the tree has ever asked for more.

**A real data set now asks for more.** The Canonn ED3D maps, which
`publish-the-canonn-data-page` draws, hold far more than 10,000 systems each:

| Canonn source                              | Systems |
| ------------------------------------------ | ------- |
| `clouds.json`                              | 71,142  |
| `dumpr/Geology/1400102.csv`, one codex file | 30,668  |

Those are the two the project measured. The other 72 Canonn sources are not measured one by
one, and `publish-the-canonn-data-page` says so.

The page cannot show one of those maps as one dataset while the bound stands. It can only
split a map into pieces the user has to switch between, which is a picker of 8 entries for
one subject and a map the user never sees whole.

**The bound is also the wrong shape.** It is a compile-time constant that every buffer is
allocated at. A host that draws ten records pays for 10,000 today, and would pay five times
that after this change, so the change has to make the buffers follow the records.

This change raises the bound and makes the work behind it fit. The readings landed it at
**50,000**. **The readings say that the number is not free.** Seven budgets were read at 10,000 systems on
2026-09-21, on the dev container's card, and five of them do not survive a set ten times
larger:

| Reading                                | At 10,000       | Budget | At 100,000, if the work stays linear |
| -------------------------------------- | --------------- | ------ | ------------------------------------ |
| `systemAt`, mean call                  | **0.477 ms**    | 1 ms   | up to 4.8 ms — fails                 |
| Selection work, mean per frame         | 0.438 ms        | 2 ms   | 4.4 ms — fails                       |
| Flag sweep of `real-systems`           | 0.1 to 0.5 ms   | 2 ms   | up to 5 ms — fails                   |
| Star class change, worst frame         | 13 ms           | 50 ms  | up to 130 ms — fails                 |
| Count pass of the category panel       | 1 ms            | 2 ms   | up to 10 ms — fails                  |
| Dataset switch                         | 3.6 ms          | 40 ms  | 36 ms — holds, with 10 percent over  |
| Close zoom draw, every marker capped   | 1.617 ms        | 16.7 ms| 16.2 ms — holds, barely              |

**The right-hand column is each reading times ten, and no more than that.** A whole call
holds a fixed part as well as a part that follows the set, so the true cost at ten times the
set is at or under the number in that column. The first task of this change reads each
failing budget at two set sizes and states the two parts, because a remedy chosen from one
point is a remedy chosen from a guess.

Even at the optimistic end the pick, the two sweeps and the star index have no room at
100,000 with the work the library does today, and **the highest bound every reading holds is
about 20,000**. The five remedies of section 2 moved that number to 50,000, which is where
the readings landed the bound. So the change is not one constant: it is the constant, the allocation behind
it, and the cost of five linear passes. It adds no feature and no member to the drawing
surface.

## What Changes

### The linear passes get cheaper first

Five passes walk the whole set and fail their budget at ten times it: the pick, the flag
sweep of `real-systems`, the count pass of the category panel, the star suppression index of
`close-view-stars`, and the selection work that holds the pick.

**Each one is read at two set sizes before anything is written.** The reading says how much
of the cost is fixed and how much follows the set, and the remedy follows the reading. For
the pick the candidates are named: the range square root that runs before the gate, the
`set.category()` call per system, and the two divides per system that a clip-space reject
could come before. The scenario that fails puts every system inside its range, so it is the
**accept** path that has to get cheaper, not the reject path.

**The readings decide the bound, and no budget moves.** Where a pass cannot reach its budget
at 100,000, the bound lands at the highest round number every reading holds. The dataset
switch and the two sweeps are the passes that could not, so the bound landed at 50,000.
`publish-the-canonn-data-page` splits a map that passes the bound, so a lower landing costs
that page entries and not records.

### The set bound rises to 50,000 systems

- **`MAX_SYSTEMS` becomes 50,000.** `addSystems` accepts up to that number and rejects
  what is over it, as it does today. No call, option or type changes.
- **The buffers follow the records.** The set and the marker pass allocate to the records
  they hold and grow as records arrive. A map with no record holds no record buffer, where
  today it holds 640 KB of them on the CPU and 320 KB on the card.
- **The number is what the measurements hold.** 100,000 was the proposal. The dataset
  switch read 46.7 ms against its 40 ms budget at that number, and the flag sweep and the
  count pass both came within a tenth of a millisecond of their 2 ms budgets, so the bound
  lowered to the highest round number every reading holds, which is 50,000. No budget was
  raised. **The floor is
  20,000**: under that number this change buys the Canonn page nothing that the split rule
  does not already give, and the change should be abandoned rather than landed small.
- **`MAX_SYSTEMS` becomes a public export.** `publish-the-canonn-data-page` needs the bound
  in a Node build script, and today the constant is internal: `src/index.ts` exports the
  types of that module and not the number. A build that copies the number is a build that
  goes stale the next time the number moves.

### The six budgets are read again at the new size

- **The frame budget** of `real-systems`: eight views under 16.7 ms, and the closest zoom
  with every marker in range. The pass rebases every position each frame, which becomes
  150,000 `float64` subtractions and a 0.6 MB buffer write.
- **The pick** of `system-selection`: `systemAt` under 1 ms. `pickSystem` already rejects a
  system on its marker flag and on the cursor range before it applies the matrix, and it
  builds the matrix once for the call. The delta writes that order into the requirement, so
  a later change cannot move a projection in front of the gate at five times the set.
- **The switch** of `dataset-catalog`: the clear and the two reads under 40 ms with a full
  set. It reads 3.6 ms today, so it lands at 36 ms of its 40 ms if it scales straight, which
  is 10 percent of room and not a safe margin: the switch also allocates the records and
  their names.
- **The count pass** of `map-hud`: 200,000 reads under 2 ms.
- **The flag sweep** of `real-systems`: a walk of the set on a category or filter change,
  under 2 ms.
- **The frame interval** of `map-shapes`, 18 ms at a full set with the shapes on.
- **The star suppression index** of `close-view-stars`: a worst frame under 20 ms, and under
  50 ms across a base class change.
- **The icon pass** of `system-icons`, which holds the draw time of the work the selection
  budget hands it. Its "full set" and the selection spec's "full set" are now one number.

### What the tests check

- **The unit tests** read the new bound, the rejection at it, and that a small set holds a
  small buffer. Four cases of `real-systems.test.ts` build `MAX_SYSTEMS` records, so they
  follow the constant on their own. **Two of them also hold a millisecond budget**, and those
  two were read again at the new bound: `adds 10,000 records and replaces them in under 50 ms
  each` (line 586) and `sweeps 10,000 systems of 4 categories in under 2 ms` (line 931).
  `TIMED_TEST` is `{ retry: 2 }` and weakens no bound. The second is the unit twin of the
  flag sweep this change reads in the browser. Task 3.2 decides both numbers, and no number
  is raised to keep a reading: where a budget cannot hold, the pass gets cheaper or the bound
  lands lower.
- **The browser tests** take the readings. Each performance scenario that names 10,000
  systems in `real-systems`, `system-selection` and `dataset-catalog` now names 50,000.
  They run on the GPU, as the rest of the suite does.
- **A set of 50,000 records is built in the test, not committed.** The tests that need a
  full set generate it, as they generate 10,000 today.

### Scale

- The galaxy holds about 400 billion systems, and one set holds 50,000 of them. This
  change moves the bound five times and does not open the galaxy. A host that
  wants more draws one region at a time, which the dataset catalog already does.
- **A full set costs about 4.2 MB of typed arrays** on the CPU and 1.6 MB on the card:
  1.2 MB of `float64` positions, 1.4 MB of index, flag and category rows in the set, and
  1.6 MB of `float32` in the marker pass. The 1.4 MB is what the remedies of this change
  cost in store: the draw range of each record, and the rows of the categories each record
  names, which the sweep and the pick read in place of a lookup by name. A host pays the
  whole of it only for the records it holds, after the buffers follow the records.
- **A 71,142-system set is 14.84 MB of minified JSON, and 1.74 MB over the wire.** That is
  the page's cost and not the library's. `publish-the-canonn-data-page` measured it and
  states it.

## Capabilities

### Modified Capabilities

- `real-systems`: the bound, the frame budget that is read at it, and the flag sweep that
  rebuilds which markers draw, whose 2 ms budget is stated at a full set. The requirement that
  names the bound carries the number in its name, so the delta removes it and adds the one
  that names 50,000.
- `system-selection`: the pick sweeps over typed arrays and rejects before it projects, and
  the two budgets are read at the new size.
- `dataset-catalog`: the set a `load()` may return, and the 40 ms switch budget, are read at
  the new size.
- `map-hud`: the count pass of the category panel, whose 2 ms budget is derived from the
  bound in so many words. It reads 1 ms at 10,000 today. **The HUD's own 18 ms frame budget**
  is the second requirement, because `map-shapes` and `system-selection` read the same
  interval at the same set and the three have to name one number.
- `library-package`: the export list of the main entry point, which the spec writes out by
  name. `MAX_SYSTEMS` joins it, and it is the one exported value that is not a function: a
  host that builds a set has to split it at the bound, and a host that copies the number
  keeps a second bound that the next change to this one makes wrong.
- `map-shapes`: the 18 ms frame interval at a full set, which names the same view as
  `system-selection` and `map-hud`, and the second marker draw, whose cost follows the set.
- `close-view-stars`: the star suppression index, which is built over the whole set and
  built again on a set change.
- `system-icons`: the icon draw budget, whose "full set" has to mean what the selection
  spec's "full set" means, and **the icon placement bound**, whose prose states the bound
  twice and whose two cap scenarios measure "at a full set". The four move together, or the
  requirement reads 50,000 in its prose and 10,000 in its proof.

**Sixteen more sentences restate the bound while they reason about something else.** They
state no requirement about the bound, so the change edits them directly, the way
`2026-09-20-rename-category-scenario-headings` edited seven headings. The list is the whole
of it: task 5.3 reads every other `10,000` in `openspec/specs/` and states why each one
stays.

| Spec               | Line  | What the sentence reasons about                       |
| ------------------ | ----- | ----------------------------------------------------- |
| `real-systems`     | 125   | The list walk, which walks indices and builds no array |
| `real-systems`     | 641   | The over-capacity scenario, which fills the set        |
| `real-systems`     | 1344  | The cull scenario, which says "with a full set"        |
| `real-systems`     | 1485  | The name pass, one string per system                   |
| `system-selection` | 539   | Why the label switch is off by default                 |
| `system-selection` | 589   | The candidate sweep for a reader that cannot use it    |
| `system-selection` | 595   | The list bound the set already rules out               |
| `system-selection` | 618   | The label cap scenario, which says "at a full set"     |
| `map-hud`          | 587   | The row cap, which one category may fill               |
| `dataset-catalog`  | 432   | The demo set, well under the bound                     |
| `dataset-catalog`  | 451   | The multifaction read, with the HUD on at a full set   |
| `system-details`   | 139   | One parse per selection                                |
| `coordinate-grid`  | 235   | The grid draws the same call either way                |
| `coordinate-grid`  | 910   | The host's data set                                    |
| `plane-overlay`    | 101   | The overlay does not follow the set                    |
| `galactic-regions` | 823   | The same cost for a set of none and a full set         |

The `map-shapes` sentence about the second marker draw sits inside a requirement this change
deltas, so the delta carries it.

**Where a requirement states the bound in its prose and again in a scenario, the two move
together**, by one direct edit. `system-selection` 539, 589, 595 and 618 are one requirement,
"The marker name labels are bounded", and the four are one edit. The same rule sent the icon
placement bound to a delta instead, because its prose and its scenarios could not be told
apart.

**Six measurements stay at 10,000 on purpose**, because the number is the instrument and not
the bound: the camera move of `browser-suite`, which pins a view, a box and 62 labels; the
open-lists node count of `map-hud`, which pins 40 categories and reads a growth; the two
draw-call scenarios of `map-shapes`, which count calls and not records; the flight
scenario of `system-selection`, which reads the 18 ms interval during a flight; and the grid
label scenario of `coordinate-grid` (line 484), which reads the same interval while the grid
is what it measures. In the last two the set is the backdrop and the flight or the grid is the
subject, and a full set under either is the camera move the other budgets already read.

## Impact

| What                                                | Change                                                      |
| --------------------------------------------------- | ----------------------------------------------------------- |
| `packages/galaxy-map/src/scene-data/real-systems.ts` | The constant, and five buffers that now grow                |
| `packages/galaxy-map/src/render/system-pass.ts`      | Three buffers that now grow, and the `bufferData` beside them |
| `packages/galaxy-map/src/scene-data/picking.ts`      | Measured at the new size; the gate order is now stated       |
| `packages/galaxy-map/src/**/*.test.ts`               | The bound cases, and the growth cases                       |
| `e2e/`                                               | The performance specs read at 50,000                        |
| `packages/galaxy-map/src/index.ts`, `library-package` | `MAX_SYSTEMS` becomes a public export, and the spec's export list takes it |
| `packages/galaxy-map/src/hud/`, `scene-data/star-suppression.ts` | The two other linear passes get cheaper          |
| Eight specs                                          | 16 sentences, by direct edit, listed above                   |
| `docs/wiki/`                                        | The export list, which `tests/wiki-pages.test.ts` reads      |
| The published tarball                                | The same members, the same size                             |
| Dependencies                                         | None added                                                  |

**`publish-the-canonn-data-page` waits for this change.** It is the reason the bound moves,
and its first task reads the bound this change lands.
