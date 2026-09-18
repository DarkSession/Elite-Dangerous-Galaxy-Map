## Why

The category panel shows two tabs, but one switch stands behind both. The shape set reads
the visibility of a category from the system set: `src/scene-data/shapes.ts:705` calls
`table.isCategoryVisible(name)`, and that table is the system set itself
(`src/app/create-map.ts:768`). A category therefore has **one** flag, and the dot of the
SHAPES tab moves it as the dot of the SYSTEMS tab does.

The UIA set shows what that costs. **17 of its 18 categories hold both kinds**, among them
the four largest:

| Category              | Systems | Shapes |
| --------------------- | ------- | ------ |
| All Hyperdictions     | 874     | 870    |
| Hostile               | 216     | 205    |
| UIA#1 Taranis         | 256     | 321    |
| Permit Locked Centers | 32      | 28     |

So the same names fill both tabs, and a user who switches `All Hyperdictions` off in the
SHAPES tab to clear 870 lines also loses 874 markers. **NONE** in the SHAPES tab leaves 10
of the 1,116 markers on the screen. Those 10 are the `Populated Systems` records, whose
category is the one of the 18 that holds no shape, so the SHAPES tab lists 17 rows and does
not reach it.

The panel already hides a category that holds nothing of the shown tab
(`src/hud/categories.ts:529`), and the scenario "NONE does not move a category the tab
hides" already holds that rule. That rule works only while a category holds one kind. It
does nothing for a category that holds both, which in the UIA set is all of them.

Separately, the UIA `Gamma Velorum` sphere names no category. The converter builds it at
`scripts/build-demo-systems.mjs:665` as `{ key: 'g_soi', color: [0, 0, 153], category:
null }`, because the ED3D source pushes no marker record for that list and so gives it no
category id. A shape that names no category always draws and has no row, so this one sphere
of 54 cannot be switched off and is in no list.

## What Changes

- **A category holds two visibility flags, one for its systems and one for its shapes.**
  The names stay one table, which `map-shapes` already states. Only the flag splits.
- **BREAKING (the handle).** `setCategoryVisible` and `isCategoryVisible` act on the
  **systems** of a category alone. They moved the shapes as well before.
- **The handle gains `setShapeCategoryVisible(name, visible)` and
  `isShapeCategoryVisible(name)`**, which act on the shapes of a category alone. Both
  follow the rules the system pair already follows: an unknown name changes nothing and
  does not throw, and the reader answers `false` for a name the table lacks.
- **`addCategories` does not change.** A host fills one table as it does today.
- **The dot of a row switches the kind of its own tab.** The SYSTEMS dot calls
  `setCategoryVisible` and the SHAPES dot calls `setShapeCategoryVisible`. A row shows the
  state of its own tab's flag, so the same category can read on in one tab and off in the
  other.
- **ALL and NONE act on the kind of the shown tab**, over the rows that tab lists.
- **The shape flags clear with the shapes.** `clearShapes`, `clearSystems` and
  `clearSystemsAndCategories` each turn every shape flag back on,
  as it already clears the shape name filter, so a dataset load opens its set with
  everything on. A flag held over a clear would hide the shapes of a name the next set also
  holds, while the row's dot reads on.
- **A shape's draw rule reads the shape flag.** A shape draws when any category it names
  is on **for shapes**. The colour rule follows the same flag: a shape with no `color`
  takes the colour of the first category it names whose **shape** flag is on.
- **The UIA converter gives the `g_soi` sphere a category.** It adds one category the
  source table does not hold, named **`Gamma Velorum Zone`** in the shell's own colour
  (0, 0, 153), which is the label the source gives that list. The UIA set reads **19**
  categories where it read 18. The sphere keeps its own colour, as every UIA sphere does.
  Its SYSTEMS tab is unchanged, because no record names the new category.
- **The package moves to 0.4.0**, because `setCategoryVisible` changes what it reaches.

**Non-goals.**

- **No `Uncategorised` row.** A shape that names no category still always draws, is in no
  row and is reached by no switch. The demo data stops holding such a shape, but a host
  can still add one, and nothing in the HUD will list it. This is a deliberate limit of
  this change and not an oversight.
- **Two names, not two tables.** A category keeps one name, one colour and one row per
  tab. The two tabs are still two readings of one table.
- **No third switch that moves both.** A host that wants a category gone from the whole
  map calls the two setters. A single call for both would need a reader with no sane
  answer when the two flags disagree.
- **No change to `setShapesVisible`**, the one switch that hides every shape.
- **No change to the sweep budget.** The shape sweep keeps the bounds `map-shapes` states.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `map-shapes`: the requirement "A shape draws when a category it names is on" reads the
  shape flag of a category rather than the one flag, and the requirement "A host adds
  spheres and lines through the handle" stops saying `setCategoryVisible` reaches every
  shape.
- `map-hud`: the requirement "The category browser lists the categories and turns them off"
  gives each tab's dot its own kind, and scopes ALL and NONE to the kind of the shown tab.
  The requirement "A category expands into a list of its systems" says which kind a row
  click turns back on, because a click on a shape row now leaves the systems of that
  category where they are.
- `real-systems`: the requirement "The map is created through a library entry point that
  returns a handle" gains the two new members in its table of the handle, and says which
  kind the two older ones reach. The same table gains `getShapeInfo`, `setShapeNameFilter`
  and `getShapeNameFilter`, which the handle carries and the table lost before this change,
  because the sentence that calls the shape rows "the whole shape surface" is one this
  change rewrites and it cannot be left false. The requirement "A category can be turned off" is already
  written about the markers alone, so it does not change.
- `library-package`: the requirement "The library build emits a package and no page" adds
  the two new handle members and moves the version to 0.4.0.
- `dataset-catalog`: the requirement "The demo site carries six data sets" gives the UIA
  `g_soi` sphere a category, which takes the UIA set from 18 categories to 19.

## Impact

- `src/scene-data/shapes.ts` — the shape set keeps its own visibility map and its own
  version, and stops reading `isCategoryVisible` from the table it is given.
- `src/scene-data/real-systems.ts` — a `categoryTableVersion` that rises only where the
  table itself changes, so a system switch sweeps no shape.
- `src/app/create-map.ts` — two new handle members, and `setCategoryVisible` stops reaching
  the shapes.
- `src/hud/categories.ts` — the dot, the row state and the ALL and NONE buttons read the
  kind of the shown tab.
- `src/index.ts` — the new members reach the library surface.
- `scripts/build-demo-systems.mjs` and `demo-data/uia.json` — the new category and the
  sphere that names it. `ed3dSphereRecords` keeps `g_soi` out of the marker records on a
  field of its own, because the field it reads today is the one the sphere now uses to name
  its category.
- `e2e/frame-budget.spec.ts` — the sweep budget test switches shape categories, which
  `setCategoryVisible` no longer does.
- `e2e/hud.spec.ts` — the test "a shape row turns its category back on" reads the system
  flag after a click that now writes the shape flag.
- `src/scene-data/shapes.test.ts`, `src/render/shape-pass.test.ts`,
  `src/scene-data/real-systems.test.ts` and `e2e/shapes.spec.ts` — each holds a call that
  means the shape flag or the new table version.
- `tests/main-bundle.test.ts` — the version assertion, and `ENTRY_CHUNK_LIMIT`, which is the
  entry chunk bound the build fails on and the place the recorded reading lives.
- `package.json` — version 0.4.0.
- `README.md`, `docs/roadmap.md` and `THIRD_PARTY_NOTICES.md` — each reads "18 categories"
  for the UIA set. `README.md` also states the handle members at `:161`, what hides a shape
  at `:186`, and what ALL and NONE reach at `:336`.
- `src/app/demo-systems.test.ts` (two tests), `tests/fixtures/uia.test.ts`,
  `tests/fixtures/uia-demo-set.json` and `e2e/datasets.spec.ts` — each holds a UIA category
  list, a category count or the reading "53 of the 54 spheres name a category".

**The scale this holds at** does not move. The table holds at most 256 categories. The
shape sweep keeps its stated bounds: under 2 milliseconds for the first switch that
follows the arrival of a set of 1,024 spheres and 4,096 lines each naming 4 categories,
and under 1 millisecond for every switch after it. The split adds one map lookup per
category and not per shape, so the sweep stays a linear pass over the set.
