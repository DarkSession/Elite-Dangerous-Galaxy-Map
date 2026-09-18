## Why

A shape carries its own colour and belongs to no category, so the user cannot switch one
off. The UIA set draws 54 spheres and 983 lines over 1,116 markers, and the only control
over them is the one **Shapes** switch that removes all 1,037 at once.

The category panel shows one list, so there is no place to put a shape category. Its row
mixes two jobs in one button: a click toggles the category, and a second small button
opens the list. Its open list is capped at 210 CSS pixels, so a list of 200 rows scrolls
inside a panel that is 807 pixels tall and leaves most of the panel empty.

A sphere draws over the finished frame with no reading of what is in front of it. A
marker between the camera and the sphere takes the sphere's wash, and a marker inside it
takes none, so the sphere reads as a flat sprite pasted over the picture rather than as
a space that holds systems.

The demo catalog holds five sets, and every one of them is a file the build committed.
Nothing in the catalog shows a host fetching its records when the user asks for them.

## What Changes

**The shapes take categories.**

- A sphere and a line MAY carry `primaryCategory` and `secondaryCategories`, which name
  categories of the table `addCategories` already fills. One table holds the categories
  of the systems and of the shapes.
- A shape draws when any category it names is on, by the rule a marker already follows. A
  shape that names no category always draws, which is the map every host has today.
- `color` stays the shape's own and is what the shape draws in. It becomes optional for a
  shape that names a category: such a shape takes the colour of the first category it
  names that is on, as a marker does.
- `setShapeNameFilter(text)` and `getShapeNameFilter()` hide the shapes whose `name` does
  not hold the text, as `setNameFilter` does for the markers.

**The category panel takes two tabs.**

- The panel header holds a **SYSTEMS** tab and a **SHAPES** tab. One list shows at a
  time. The **SHAPES** tab is disabled while the map holds no shape.
- **BREAKING (the HUD).** The colour dot alone switches a category on and off. A click on
  the rest of the row opens the row's list and folds it again. The separate expand button
  is gone, and the chevron in the row shows the state.
- An open list takes at least **50 per cent** of the height of the panel's list area, and
  takes every pixel the category rows leave when they leave more.
- A list opens and closes over **140 ms**. A reader who asks for reduced motion gets the
  open state at once.
- A shape row shows the shape's name. A click flies the camera to the shape. A shape is
  still never picked and never selected.

**A sphere reads the markers in front of it.**

- **BREAKING (the frame).** The marker pass draws before the sphere step that covers it.
  The markers write their camera range into a range buffer, and the sphere step reads it.
  Only the **body** of a marker writes range, which is the part whose own alpha is 0.5 or
  more, so a sphere still washes the faint halo of a glow sprite.
- The range buffer needs `EXT_float_blend` as well as `EXT_color_buffer_float`. Where
  either is missing, the map draws the frame it draws today and nothing fails.
- A sphere leaves a marker in front of it unchanged, washes a marker inside it by the
  share of the shell path that lies behind the marker, and washes a marker behind it
  whole, which is the reading the frame gives today.
- The lines now draw over the markers as well. The step that writes them reads the range
  buffer and caps its alpha at **0.5** over a marker, so a route cannot take a marker off
  the screen. The spheres take the same cap.
- The shape pass still costs **three** draw calls, whatever the size of the set. The
  marker pass costs **one more**, which writes the range buffer, and it makes that draw
  only while a shape draws. A set of lines and no spheres pays it too, because the line
  step reads the same buffer to find a marker. The buffer takes the size of the drawing
  buffer on that first frame, so a map with no shape holds no 8.3 MB texture.

**The catalog takes a sixth set, which fetches its records live.**

- The dataset dialog shows `FETCHED ON LOAD` in its count line for an entry that carries
  no `systemCount`. `multifaction` is the first such entry.
- `multifaction` fetches `https://downloads.spansh.co.uk/factions.json.gz` when the user
  loads it, keeps the systems of **Canonn** and **Canonn Deep Space Research**, and adds
  the 48 permit spheres of `MapData-multifaction.js` under two shape categories.
- The dump read on 2026-09-17 gives **4,231 systems** in 4 categories, of which 706 name
  more than one. The set is the first of the catalog that exercises both tabs.
- The library still fetches nothing. The fetch is the demo host's, through the `load()`
  the catalog already defines.
- The page keeps the fetch, so a browser test intercepts the request, and moves the body
  of the answer to a worker that inflates it and reads it. Chromium inflates a body the
  browser already holds in one burst, which costs the map about **70 ms** of frames on a
  62 MB dump; the worker costs it no frame.

**Non-goals.**

- The volume, the clouds, the point cloud and the star field carry no range, so a sphere
  treats them as behind it, as it does today.
- A line takes no range reading of its own, so a sphere washes every line whole and the
  lines draw over the spheres, as they do now.
- The live set names two factions, which the code holds. There is no faction picker.
- A shape is still never picked. `systemAt` reads no shape.

## Capabilities

### New Capabilities

None. Every requirement below belongs to a capability the repository already holds.

### Modified Capabilities

- `map-shapes`: a shape carries categories and a name filter; the switch rules and the
  reject reasons follow; a sphere reads a range buffer and washes what lies inside it and
  behind it; the overlay order and the draw call count change.
- `map-hud`: the category panel takes two tabs; the dot switches and the row opens; the
  open list takes at least half the panel; the list animates; a shape row flies the
  camera.
- `library-package`: the entry point exports `ShapeInfo` and `ShapeKind`, and the package
  moves to 0.3.0 because a shape colour becomes optional and a sphere changes what it does
  to a marker.
- `dataset-catalog`: the catalog holds six sets; the sixth fetches the Spansh factions
  dump at run time and reads it as a stream; the demo shapes carry categories; the dataset
  dialog says what it shows for an entry with no count.

## Impact

- **Scene data.** `src/scene-data/shapes.ts` takes the category fields, a drawn flag per
  shape and the name filter. The sweep runs on a change of the set, the table, the
  visibility or the filter, and not per frame. It holds 1,024 spheres and 4,096 lines.
- **Rendering.** `src/render/shape-pass.ts` gains the range buffer and a second sphere
  step; `src/render/system-pass.ts` gains a range draw; `src/render/renderer.ts` moves
  the marker pass ahead of that step. The shaders `spheres.vert`, `spheres.frag` and a
  new `marker-range` pair change with them.
- **The HUD.** `src/hud/categories.ts` and `src/hud/styles.ts` take the tabs, the two row
  buttons, the height cap with its `ResizeObserver`, and the transition.
  `src/hud/categories.ts` also wires the shape lists, which `src/hud/index.ts` builds, and
  `src/hud/dataset-dialog.ts` takes the count line.
- **The handle.** `src/app/create-map.ts` adds `setShapeNameFilter`, `getShapeNameFilter`,
  `getShapeInfo` and the shape category wiring, and `src/index.ts` exports `ShapeInfo` and
  `ShapeKind`. `package.json` moves to 0.3.0.
- **The demo site.** `src/app/main.ts` takes the sixth entry and a new module that
  streams the dump. `scripts/build-demo-systems.mjs` writes the permit sphere file and
  puts categories on the shapes of the UIA and Adamastor sets.
- **The tests.** `e2e/hud.spec.ts` switches a category, so its call sites move to the dot
  button. `e2e/frame-budget.spec.ts` clicks the row, which now opens the list, and
  `e2e/paint-cost.spec.ts` only waits for the row, so both keep their row locator. The
  browser test of the live set serves both URLs from a fixture through `page.route`, so no
  test reaches the network.
- **Attribution.** `THIRD_PARTY_NOTICES.md` names the Spansh dump.
