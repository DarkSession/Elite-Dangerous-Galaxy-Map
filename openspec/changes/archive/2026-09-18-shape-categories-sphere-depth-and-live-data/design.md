## Context

See proposal.md for the motivation. This section holds only the facts the approach
turns on.

**The overlay draws with no depth buffer.** `renderer.ts` disables `DEPTH_TEST` for
every pass and draws the overlay passes to the default framebuffer after the tone map,
in this order: grid, regions, shapes, markers. The order is the whole of the depth
reading: a pass covers what came before it. A sphere therefore covers a marker that
stands in front of it, which is the fault this change repairs.

**A sphere is an impostor shell.** `spheres.frag` computes the alpha of a
limb-brightened shell, `min(1, opacity / sqrt(1 - (r/R)^2))`, where `r` is the distance
from the centre of the sprite and `R` is the drawn radius `f * radius / range`. At the
default opacity of 0.18 the alpha reaches 1 at `r/R = 0.9838`, so the rim is solid and
the middle is faint. The shell has no thickness in the data: the shader knows the
centre, the radius and the camera range of the centre, and nothing else.

**A marker knows its range.** `system-pass.ts` already computes the camera-space range
of each marker to size the sprite. Nothing writes that range anywhere the later passes
can read.

**The category table is one table.** `addCategories` fills it, `real-systems` states
the rules, and a marker draws when any category it names is on and takes the colour of
the first category it names that is on. The user asked for one shared table, so a shape
joins that table rather than getting a table of its own.

**The HUD panel is a flex column.** `.gm-hud__left` is 316 CSS pixels wide,
`.gm-hud__category-panel` is `flex: 1 1 auto` and `.gm-hud__category-list` scrolls. The
open system list carries `max-height: 210px`, which is the cap the proposal removes.

**The shape set holds no per-shape state beyond the geometry.** `shapes.ts` holds
`MAX_SPHERES = 1024` and `MAX_LINES = 4096` in typed arrays, and bumps a `version`
counter on a change. `shape-pass.ts` rebuilds its instance buffers when `builtVersion`
does not match.

## Goals / Non-Goals

**Goals:**

- One category table drives the markers and the shapes, with one visibility rule.
- A sphere reads what is in front of it with a cost that does not grow with the set.
- The HUD panel shows one list at a time and gives an open list the space it has.
- The demo catalog holds one entry that fetches its records from the network, so the
  host side of `dataset-catalog` is exercised by something.

**Non-Goals:**

- A true depth buffer for the overlay. The overlay draws after the tone map, on the
  default framebuffer, and a depth attachment there is not ours to add.
- Range for the volume, the clouds, the point cloud, the star field or the lines. Only
  the markers write range, so only the markers are read.
- Sphere-sphere order. Two spheres that overlap blend as they blend today.
- A worker for the live fetch. See the decision below.

## Decisions

### 1. A range buffer, not a depth buffer

**Decision.** Add a single-channel float texture the size of the drawing buffer, the
**range buffer**. Clear it to `RANGE_EMPTY`, a range no marker reaches. The build uses
`1e30`, which is inside the range of a 32-bit float and blends with `MIN`. Let the marker
pass write each marker's camera range into it with `blendEquation(MIN)`, so each pixel holds
the range of the nearest marker that covers it. The sphere step samples it at
`gl_FragCoord.xy` and uses it to decide how much of its shell path lies behind that
marker.

**Why.** The overlay has no depth attachment and cannot get one: the default
framebuffer is the drawing buffer the browser gives us, and the tone map already wrote
it. A texture the sphere shader samples is the only channel between the two passes. It
costs one extra draw of the marker geometry and one texture read per sphere pixel, and
neither grows with the number of spheres.

**Format.** `R32F`, `RED`, `FLOAT`, blended with `MIN`. At 1920x1080 the buffer is 8.3 MB.

**Two extensions, not one.** `EXT_color_buffer_float` is already requested at
[renderer.ts:304](src/render/renderer.ts#L304) and lets the context *draw* to a float
target. It does **not** allow *blending* into a 32-bit float one: WebGL2 needs
`EXT_float_blend` for that, and without it the `MIN` blend is refused and the buffer
holds the last marker drawn rather than the nearest. The map therefore asks for both and
the range buffer takes a flag of its own, the AND of the two.

**That flag is not the `float` flag the scene targets read.** Every float target in the
tree today is `RGBA16F` ([buffers.ts:318](src/render/buffers.ts#L318)), which blends with
`EXT_color_buffer_float` alone. Folding `EXT_float_blend` into the existing flag would
drop the scene target, the half target and the glow to `RGBA8` on a context that gives
only the first, which is a loss this change has no reason to cause. The two flags stay
apart: the old one gates the half-float targets as it does today, and the new one gates
the range buffer, the marker range draw and both caps. Nothing already in the tree proves
the 32-bit blend path, so Task 3.1
proves it against the real context and task 6.5 asserts the gate measured that path and
not the fallback.

**Why not `R16F`, which blends with no extra extension.** A half float carries about 3
decimal digits, and the precision is relative, so no scaling or offset recovers it: at a
camera range of 100,000 light years the step is **64 light years**. A sphere only draws
while its drawn radius reaches a few pixels, which at that range means a radius of about
200 light years, so the whole chord is about 400 light years and a 64 light year step is
16 per cent of it. The share would move in visible bands across the sphere. `R32F` with
`EXT_float_blend` costs one more extension check and 4.1 MB, and it reads clean.

**Alternatives considered.**

- *A second colour attachment on the marker pass (MRT).* WebGL2 has one blend equation
  for all attachments, so a colour attachment blending `SRC_ALPHA, ONE_MINUS_SRC_ALPHA`
  and a range attachment blending `MIN` cannot share a draw. A second draw of the same
  geometry to a second target is simpler and costs one draw call.
- *Reading the tone-mapped colour and guessing.* A wash that depends on what the frame
  already drew cannot tell a marker from a bright star.
- *Sorting the shapes and the markers into one pass.* The two use different geometry,
  different shaders and different blends, and a sort per frame over 1,024 spheres plus
  10,000 markers costs more than the buffer.

### 2. The markers draw before the spheres, and the spheres do not erase them

**Decision.** The overlay order becomes grid → regions → **markers** → spheres → lines.
The sphere step reads the range buffer and caps its own alpha over a marker pixel at
**0.5**.

**Why the order moves.** The sphere must be able to draw over a marker that is inside
it or behind it. It can only do that if the markers are already on the frame. The range
buffer then keeps the sphere off the markers that are in front of it.

**Why the 0.5 cap.** The shell alpha reaches 1 at the limb. Without a cap, a sphere
whose limb crosses a marker would paint over it whole, and the user would lose a marker
to a decoration. At 0.5 the marker keeps half its colour in the worst case and is still
clickable, because `systemAt` picks from the scene data and not from the frame.

**Why the lines stay last.** A line carries no range, so the sphere treats it as behind.
If the lines drew before the spheres, a sphere's limb would erase a route that crosses
it. The lines are thin and the loss would be total rather than partial.

**The lines take the same 0.5 cap.** Drawing the markers first means the lines now draw
over them, which they did not before. A 2 CSS pixel line across a marker sprite would
take the marker. The full-screen step that writes the lines over the frame therefore
reads the same range buffer and caps its alpha at 0.5 at a pixel where a marker drew.
That is one texture read in a pass that already runs over the frame, and it keeps one
rule for the whole overlay: a decoration never takes a marker off the screen.

**The reading this gives.** A marker in front of a sphere is untouched. A marker inside
the sphere takes the part of the wash that lies behind it. A marker behind the sphere
takes the whole wash, which is what the frame gives today. That is the "tint and dim by
depth" the user chose.

### 3. The share formula

At a sprite pixel, `r` is the distance from the sphere centre in units of the drawn
radius `R`. The shell path through that pixel runs from `c - d` to `c + d`, where `c` is
the camera range of the sphere centre and

```
d = radius * sqrt(1 - r * r)
```

which is the half-chord of the sphere along the view ray. With `t` the range the range
buffer holds at that pixel,

```
share = clamp((t - (c - d)) / (2 * d), 0, 1)
alpha = sphereAlpha(r, opacity) * share
```

`share` is 0 where the marker is in front of the whole chord, 1 where it is behind it,
and the fraction of the chord behind the marker in between. A pixel with no marker holds
`RANGE_EMPTY` and gets `share = 1`, so the frame outside the markers is unchanged.

**Why a linear share and not an integral of the shell.** The shell alpha is the closed
form of the whole path, not a density we can integrate part of. A linear share of that
alpha is the cheapest reading that is monotone in depth and exact at both ends, which is
what the eye needs to read "this marker is inside the sphere". A physically integrated
shell would need the shader to hold the shell profile, which the impostor does not have.

**Why `radius` and not `R`.** `d` must be in the same units as `t` and `c`, which are
camera ranges in light years. `R` is in pixels.

### 4. The no-float fallback

Where the context cannot blend into a float colour target — that is, where either
`EXT_color_buffer_float` or `EXT_float_blend` is missing, as decision 1 states — the range
buffer is not created, the marker range draw is skipped, the line step caps nothing and the
sphere shader takes `share = 1` through a uniform. The
frame is then the frame the map draws today, and nothing fails. `renderer.ts` already
holds the `float` flag for the same reason elsewhere, so this is one more reader of it.

### 5. One drawn flag per shape, swept on change and not per frame

**Decision.** `shapes.ts` holds a `drawn` flag per sphere and per line, and a
`resolvedColor`. It sweeps them when the shape set changes, when the category table
changes, when a category's visibility changes, or when the shape name filter changes.
`shape-pass.ts` rebuilds its instance buffers on the same `version` bump it already
watches, and skips the shapes whose flag is off.

**Why not per frame.** The full sweep over 1,024 spheres and 4,096 lines with four
categories each is about 20,000 lookups. The browser gate measures 0.4 to 1.1 ms for the
first switch that follows the arrival of the set and 0.0 to 0.2 ms for every switch after
it, so the spec holds the first at 2 ms and the rest at 1 ms. Even the dearest reading is 6 per cent of the frame budget, for
a set that changes when the user clicks. The version counter already exists for exactly
this.

**Why in `shapes.ts` and not in the pass.** `src/render/` must stay replaceable, and the
category table lives on the data side. The pass reads a flag; it does not know what a
category is.

### 6. The HUD row splits into two buttons, and the tabs are two lists over one panel

**Decision.** The category row becomes a flex row of two buttons: a dot button that
carries `aria-pressed` and switches the category, and a rest-of-row button that carries
`aria-expanded` and opens the list. The separate expand button and its chevron move into
the second button.

**Why this is BREAKING.** Every browser test that clicks `.gm-hud__category-row` to
switch a category now opens a list instead. The proposal names the seven places.

**The tabs.** Two buttons in the panel header with `role="tab"`, and one list in the
document at a time. The shape tab is `disabled` while `sphereCount() + lineCount()` is
0. Each tab keeps its own open set and its own filter text, so a switch away and back
returns the panel as the user left it. The filter box writes to `setNameFilter` on the
systems tab and `setShapeNameFilter` on the shapes tab, and a tab change clears the
filter it leaves so a hidden filter cannot hide half the map.

**The height rule.** The height of an open list is

```
height = min(content, share)
share  = max(area - rows, 0.5 * area) / openCount
```

where `area` is the height of the list area and `rows` is the height of the category
rows. `share` is a **cap**, not a floor: a two-row list takes two rows and no more, which
the scenario "A short list takes the height of its rows" asserts, and a long list takes
the space the rows leave or half the panel, whichever is larger.

`min(content, cap)` is a `max-height` and not a flex grow, and `area` and `rows` are
pixel values only the layout knows. The panel therefore **measures**: it writes `share`
into a CSS custom property on the list area, and the rule `max-height: var(--gm-list-cap)`
does the `min` with the content. It writes the property again when it rebuilds, when a
list opens or folds, and from a `ResizeObserver` on the list area. A flex column with
`min-height: 50%` was the first idea and it is wrong: it would stretch the two-row list to
half the panel and fail that scenario.

**The animation.** The list sits in a wrapper that transitions `grid-template-rows` from
`0fr` to `1fr` over 140 ms. The track resolves to the height of the list inside it, and
that list carries the `max-height` above and scrolls, so the animation ends at
`min(content, cap)` in every one of the three cases and needs no pixel value of its own.
Animating `max-height` directly would not do: the transition would run to the cap and
finish early whenever the content is shorter. Under `prefers-reduced-motion: reduce` the
transition duration is 0 and the list appears at once.

**Alternative considered.** *Two panels, one per kind, stacked.* The user asked for one
list at a time, and two panels would halve the height that the height rule is there to
give.

### 7. The live set streams the dump, and inflates it in a worker

**Decision.** `load()` fetches `https://downloads.spansh.co.uk/factions.json.gz` on the
thread that holds the page and moves the body of the answer to a worker. The worker pipes
it through `DecompressionStream('gzip')`, cuts the bytes into lines, reads the faction
name from the head of each line with a cheap regex, parses only the lines that name one
of the two factions, and cancels the stream once both are found.

**Why a stream.** The dump is 16.9 MB compressed and 101 MB of JSON. `JSON.parse` of the
whole array holds the text and the object graph at once, for two factions out of 77,675.
The stream holds one line, and the longest line of the 2026-09-17 dump is 2.33 MB.

**Why line-by-line works.** The dump writes one faction per line, with the brackets on
lines of their own. That is a property of the file and not of JSON, so the reader treats
a line that does not parse as a line it does not want, and a dump that reformats itself
onto one line finds nothing and rejects. The failure is loud and the message says so.

**Why the fetch stays on the page and only the body moves.** Playwright's `page.route`
intercepts requests from the page. A request from a worker is harder to intercept, and
the fixture path is the thing that must be reliable. A `ReadableStream` is transferable,
so the page keeps the request and the worker gets the bytes. Where a browser does not
move a stream, the page reads the dump itself with the same reader; the probe asks for
the move and reads the `DataCloneError` that a browser without it gives.

**Why a worker at all.** Three measurements on the 62 MB fixture, each with a frame chain
counting the gaps:

| What ran on the main thread                | The longest gap |
| ------------------------------------------ | --------------- |
| the body drained, no inflate                | 21 ms           |
| the body drained through `DecompressionStream` | 70 ms       |
| the fetch alone, the rest in a worker      | none            |

Chromium inflates a body the browser already holds in one burst and takes no
back-pressure from the reader, so no reader on that thread can hold the budget. The gzip
step, and not our code, is the cost: a drain that only counts bytes pays it in full.

**Why the reader works on the bytes.** The first reader decoded every chunk and held a
growing string, which it searched again for every chunk. That cost 884 ms of thread time
over the fixture. Reading the line break as a byte, decoding only the head of a line and
decoding the whole of a line only where the name matches costs 13 ms, and it keeps 58
bytes of a line it does not want instead of up to 2.33 MB.

**Why the reader still waits for a task.** The path without a worker needs it: a `read()`
that answers from a queue answers in a microtask, so the loop would run to the end of the
body in one task. The reader counts its own time and waits for the next task after 8 ms
of work. The wait posts on a `MessageChannel` and not on `setTimeout`: a timer a timer
callback starts is nested, and the browser holds a nested timer for 4 ms, which the read
would pay on every turn.

**Why two fixed factions.** The user chose it. A faction picker would need a second UI
and a second read of the dump, and the entry is a demonstration.

### 8. The permit spheres are committed, not fetched

**Decision.** `scripts/build-demo-systems.mjs` reads `MapData-multifaction.js` and
writes the 48 spheres into `demo-data/multifaction-spheres.json`. `load()` imports that
file and fetches only the records.

**Why.** The spheres are a static literal in the source and not a live dump. Parsing an
ED3D JavaScript literal in the browser would put a parser in the entry chunk, which is
bounded at 254,000 bytes, to read a list that never changes. The build script already
holds `parseEd3dData`.

### 9. `dataset-catalog` replaces its five-set requirement rather than modifying it

The requirement's own title says "five", so a MODIFIED block would leave a title that
contradicts its body, and RENAMED is for name changes with no content change. The delta
therefore REMOVES it with a Reason and a Migration and ADDS the six-set requirement
carrying the whole of the old content plus the shape category rules.

### 10. `real-systems` keeps its statement about the unmixed colour

[openspec/specs/real-systems/spec.md](openspec/specs/real-systems/spec.md) says of the
`glow` style that "a category colour reaches the frame unmixed at the centre". That
sentence is about the **marker pass**: the sprite's own colour is the category colour at
every point and the shape comes from the alpha. It stays true after this change, because
the marker pass still writes that colour, and it is still the colour a test reads with the
shapes off or with no sphere over the marker.

A sphere may now put an alpha of up to 0.5 over that centre, so a test that reads a marker
centre **with a sphere over it** reads a mixed colour. The delta says so twice, in "A
sphere washes what lies inside it and behind it" and in the scenario "A marker draws over
a shape", and `map-shapes` is where a reader looks for what a sphere does. A MODIFIED
delta on `real-systems` would have to copy a requirement of about 60 lines to add one
cross-reference, so this change does not open it. If a later change touches that
requirement for its own reasons, the cross-reference goes in then.

## Risks / Trade-offs

- **The range buffer costs 8.3 MB of GPU memory at 1920x1080, and more on a 4K display
  (33 MB).** → It is one channel and it is the only new allocation. Where the float
  extension is missing it is not allocated at all. A device that cannot hold it is a
  device that cannot hold the scene target either.
- **The marker pass draws its geometry twice.** → The second draw writes one float and
  runs no lighting. `paint-cost.spec.ts` measures the overlay cost and holds the budget;
  if the second draw shows there, the two draws can be merged with MRT at the cost of
  splitting the blend, which decision 1 rejected for a reason that a measurement could
  overturn.
- **The system name filter runs the shape sweep, although it reaches no shape.**
  `setNameFilter` in `src/scene-data/real-systems.ts` bumps `categoryVersion`, which is the
  one counter `shapes.ts` watches, so a keystroke in the SYSTEMS search box sweeps all
  5,120 shapes. → The sweep costs 0.0 to 0.2 ms once it is warm and the HUD debounces the
  filter to one call every 150 ms, so it takes 0.13 per cent of that time. A second counter
  that separated the filter from the table would split a signal the marker path already
  reads correctly, for a saving the frame cannot measure. A later change that makes the
  sweep dearer should split the counter first.
- **The 0.5 cap makes a sphere limb over a marker read weaker than the rest of the
  limb.** → That is the trade the user asked for: a marker must stay readable. The cap
  is one constant and a later change can tune it.
- **A future dump could reformat onto fewer lines, and the reader would then find no
  faction and reject.** → The rejection path is specified and tested, the map keeps the
  set it had, and the message names the cause. The live entry is a demonstration and its
  failure does not touch the other five.
- **The dump is a third-party URL with no version pin.** → The counts in the spec are
  dated and the tests read a fixture, so a change in the dump cannot fail the suite. Only
  the live demo changes.
- **The browser fetch needs a CORS header this project does not set.** On 2026-09-18 a
  `curl -sI` of the dump answered `access-control-allow-origin: *`, and the entry works
  because Spansh sets it. → Spansh can drop it at any time, and no test would see the
  change: the suite serves a fixture. The entry then fails at the fetch, the map shows the
  dataset error and keeps the set it had, and the other five entries are untouched.
  `THIRD_PARTY_NOTICES.md` records the observed header and this dependency.
- **Splitting the category row breaks muscle memory and seven test call sites.** → The
  proposal marks it BREAKING, the dot carries `aria-pressed` and the row carries
  `aria-expanded`, so both jobs stay reachable from the keyboard and from a screen
  reader.
- **A cap written from a measurement can go stale.** The panel reads the list area and
  the rows, works out the cap and writes it; a layout change between that write and the
  next one leaves the list at the old cap. → The three triggers cover every way the inputs
  move: a rebuild, an open or a fold, and the `ResizeObserver` on the list area. A browser
  test reads the rendered height at three category counts and holds the rule.
- **The `ResizeObserver` must not write in a still frame.** `map-hud` holds that the HUD
  makes 0 DOM writes in a still frame, and an observer that wrote the cap on every callback
  would break it. → The panel compares the new cap with the one it wrote and writes only on
  a change. The scenario "The HUD adds no work to a still frame" is what holds this, and it
  already runs.

## Migration Plan

There is no data migration and no stored state. The steps are:

1. Land the shape category fields and the sweep. A shape that names no category draws as
   it does today, so every existing host is unchanged at this point.
2. Land the HUD tabs and the row split, with the browser tests moved to the new buttons
   in the same step. The two must land together: the tests read the buttons.
3. Land the range buffer and the order change. The no-float path gives the old frame, so
   this step can be reverted on its own by taking `share = 1` always. The look baseline is
   unchanged: the view it draws holds no shape, so the order change moves no pixel in it.
4. Land the demo converters and the sixth entry.

**Rollback.** Each step is its own commit and reverts on its own. Step 3 is the only one
that changes an existing frame, and it changes it only where a sphere or a line covers a
marker, which no baseline image holds.
