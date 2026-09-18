## Context

See proposal.md for the fault and what it costs the user.

Three facts of the tree shape the design.

1. **The shape set reads the system set.** `createShapeSet` (`src/scene-data/shapes.ts:517`)
   takes a `ShapeCategoryTable` (`:178`), and `src/app/create-map.ts:768` passes the system
   set itself. The sweep at `:705` reads `table.isCategoryVisible(category.name)` for each
   category and writes a `Uint8Array` the two stores read per shape.
2. **One version number carries four things.** `categoryVersion` of the system set rises on
   `addCategories` (`real-systems.ts:590`), on `clearSystemsAndCategories` (`:722`), on
   `setCategoryVisible` (`:769`) and on `setNameFilter` (`:780`). The shape set watches that
   one number, so a system name filter or a system switch sweeps every shape today.
3. **The HUD reaches the map through the handle alone**, which `AGENTS.md` holds with a
   lint rule. `src/hud/categories.ts` therefore cannot read a flag the handle does not
   carry, and the split has to reach the handle before it reaches the panel.

## Goals / Non-Goals

**Goals:**

- One category table, one set of names, one colour for each name, and two flags.
- A switch of one kind costs the other kind no work, not merely no visible change.
- The handle says which kind a call moves, in its name.

**Non-Goals:**

- A second table, a second `addCategories` or a second colour.
- A call that moves both kinds at once. See the decision below.
- A rule for a shape that names no category. It still always draws. The demo data stops
  holding one, and a host's data still may.

## Decisions

### The shape set owns the shape flags

The shape set keeps its own `Map<string, boolean>` and stops reading `isCategoryVisible`
from the table it is given. `ShapeCategoryTable` loses that member and keeps
`categoryCount`, `category(index)` and `categoryIndex(name)`, which are the reads the sweep
needs for the colours and the order.

**The flags clear where the shapes clear.** The shape set already resets its name filter in
`clearShapes`, for the reason its own comment gives: the filter names shapes of the set
being cleared. A visibility flag names a category of the set being cleared and follows the
same rule, and `real-systems` already states it for the system flag. The clear has to sit
**above** the early return at `src/scene-data/shapes.ts:843`, which leaves when the set
holds nothing, or a clear of an empty set would keep the flags. The path that exercises
this is the demo site's own dataset switch: `writeDataset` (`src/app/create-map.ts:1207`)
calls `clearSystemsAndCategories()` and `clearShapes()`, and `loadDataset` reaches it after
`load()` settles.

**The alternative was a second map inside `real-systems`**, beside `categoryVisible`, with
two setters on the system set. That keeps one owner for both flags, but it puts a shape
concern inside the system store, and the shape set would still read the system store for a
flag no marker uses. The import rules of `AGENTS.md` let `shapes.ts` and `real-systems.ts`
see each other, so neither choice breaks a rule; the shape set owning its own flag is the
one that lets the shape set be built with no table at all, which `NO_CATEGORIES` already
allows.

### The table version splits from the visibility version

`real-systems` gains `categoryTableVersion`, which rises only where the table itself
changes: in `addCategories` and in `clearSystemsAndCategories`. `categoryVersion` keeps its
present meaning for the system pass, which is the reader that must see a system switch and
a system name filter.

The shape set then sweeps on `table.categoryTableVersion`, its own shape visibility version
and its own name filter. A system switch touches none of the three, so it sweeps no shape,
which is what the spec now states. Without the split the shape set would re-sweep 1,024
spheres and 4,096 lines on every **NONE** in the SYSTEMS tab, for a result that cannot
differ.

**The alternative was to keep one version** and accept the extra sweep. The sweep is under
1 ms, so this is not a frame fault. It is rejected because the requirement now says the two
kinds are independent, and a sweep the user cannot see is the kind of coupling that grows
back.

### `setCategoryVisible` becomes systems-only, and the package breaks

The pair `setCategoryVisible` / `isCategoryVisible` keeps its name and loses the shapes.
The handle gains `setShapeCategoryVisible` / `isShapeCategoryVisible`.

**The alternative was to keep `setCategoryVisible` meaning "both"** and add two pairs, one
for each kind. That breaks no host. It is rejected because `isCategoryVisible` then has no
answer a caller can use: a category whose markers are on and whose shapes are off is
neither on nor off, and every answer the reader could give is wrong for some caller. A
member whose reader cannot be written is a member that should not exist.

**The break is in what the map draws and not in what compiles.** A host that called
`setCategoryVisible(name, false)` still compiles and still hides the markers; its shapes
stay. That is a minor version under semantic versioning while the package is below 1.0, so
the package moves 0.3.0 to 0.4.0.

### The HUD picks its setter from the shown tab

`src/hud/categories.ts` already knows the tab: `CategoryTab` is `'systems' | 'shapes'`. The
dot handler, the row's off styling and the ALL and NONE loops each take the pair of the
shown tab. The panel already lists only the categories that hold the shown kind, so the
loops do not change which rows they walk, only which setter they call.

A user can now leave a category on in one tab and off in the other. The row shows the flag
of its own tab, so each tab is a true reading of its own kind, and nothing in the panel
shows a state that is half true.

### The `g_soi` sphere gets a category the source does not hold

The converter writes a category named **`Gamma Velorum Zone`** in `000099`, which is the
colour of that list's own material, and gives the one `g_soi` sphere that primary category.

- **The name.** `dataset-catalog` already labels the list "The Gamma Velorum zone". The
  sphere keeps the name `Gamma Velorum`, which is the star at the centre. Two names, two
  things.
- **The colour.** Every other sphere category is a marker category whose colour the source
  table gives. This one has no marker, so the material's colour is the only colour the
  source offers, and it is the colour the user sees on the screen.
- **No record.** The converter adds no marker for `g_soi`, because the source pushes none.
  The category therefore holds one shape and no system, so it has a row in the SHAPES tab
  and none in the SYSTEMS tab. That is the rule the panel already follows, and this is the
  first set that exercises it.
- **Precedent.** The converter already adds eight categories the source table does not
  hold, the `UIA#N` ones that `init()` adds at run time. This is a ninth of the same kind,
  and it goes in after them, so it is the last entry of the table and the last category of
  the set.
- **The key.** `UIA_SPHERE_LISTS` carries a category **id**, which `ed3dSpheres` resolves
  with `table.get(category)?.name`. The source's own ids are numbers written as strings, so
  the key `g_soi` cannot collide with one, and it names the list it belongs to.
- **Two readers, two fields.** `UIA_SPHERE_LISTS` has a second reader,
  `ed3dSphereRecords`, which writes the marker at the centre of each sphere. Its whole skip
  rule is `category === null`, so the one field carries two meanings today: "this sphere
  names no category" and "this list gets no marker". The change needs the first to stop
  being true and the second to stay true, so the list gains a `record` field and
  `ed3dSphereRecords` skips on that. Without the split the converter would push a marker
  for `Gamma Velorum`, the set would read 1,117 systems, and the new category would get a
  row in the SYSTEMS tab, which is the opposite of what this change states.

**The alternative was an `Uncategorised` row** in the panel for every shape that names no
category. It is rejected as a non-goal: it would put a row in the browser that names no
entry of the table, and every count, colour and list rule of `map-hud` is written against a
table entry. The demo fix costs one line of the converter and the panel keeps one rule.

### The library bundle bound is read again

`library-package` holds the entry chunk under 254,000 bytes and the last reading left
1,025 bytes of room. This change adds a `Map`, two handle members and the wiring. That is
small, but 1,025 bytes is smaller than the noise of a dependency bump, so the
implementation builds the library, reads the chunk and writes the reading into the spec
delta before the gate. Where the reading passes the bound, the change raises the bound and
says why, which the requirement already provides for.

## Risks / Trade-offs

- **A host upgrades and loses a switch it relied on.** → The version moves to 0.4.0 and the
  proposal, the spec and the release note all state that `setCategoryVisible` no longer
  reaches a shape. There is no silent path: a host that wants both calls both.
- **The entry chunk passes 254,000 bytes.** → The implementation reads the size before the
  gate. The bound moves with a recorded reading and a reason, which the requirement allows.
- **The committed goldens move.** `tests/fixtures/uia-demo-set.json` is the output the
  converter test compares against, and `demo-data/uia.json` is the set the demo site loads.
  Both are regenerated, and the tasks read the diff of each rather than trusting the
  regeneration. Four more files carry a UIA count or category list and each has a task of
  its own.
- **The UIA fixture counts move.** → `tests/fixtures/uia.test.ts` asserts a category list
  and a count for the fixture. The task that changes the converter updates the fixture
  expectations in the same step, and reads the new count from the run rather than guessing
  it.
- **A user sees a category "on" in one tab and "off" in the other and reads it as a
  fault.** → The row of each tab shows the flag of its own kind, and the two tabs are
  labelled. This is the behaviour the user asked for. No extra state is shown.
- **The sweep budget moves.** → The split adds one map read for each category, not for each
  shape, and removes the sweeps a system switch used to cause. The browser gate reads the
  budget after the change, so a regression shows there.
