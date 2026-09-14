## Context

See [proposal.md](proposal.md) for the motivation. What shapes the approach here is the
tree phase 3 and phase 3.1 left behind.

- `createGalaxyMap(canvas, options)` owns the context, the scene data, the view, the
  controls and the frame loop. The demo page owns the URL and the test hooks, and a lint
  rule holds `window.location` out of every other file.
- The system set holds at most 10,000 systems and the category table at most 256. The set
  carries `version` and `categoryVersion`, and the marker pass rebuilds its colour and its
  style buffers exactly when one of them changes.
- The marker pass draws the whole set in one call after the tone map, with a per-marker
  style and draw range in one `vec2` attribute. `rebasePositions` already walks every
  system on the processor each frame to rebase it and to count what the range rule keeps.
- `src/app/labels.ts` places the region labels as elements in a host over the canvas. It
  measures a label once, keeps one element per region, and holds a `boxesOverlap` test.
- `src/camera/controls.ts` puts pointer listeners on the canvas and key listeners on the
  window.

The mockup is [.design/Galaxy Map HUD.dc.html](../../../.design/Galaxy%20Map%20HUD.dc.html).
It is a flat two-dimensional prototype over a still image, so its geometry does not carry
over. Its layout, its wording, its colours and its controls do.

## Goals / Non-Goals

**Goals**

- Put the HUD behind one option, so the library's existing behaviour is untouched when the
  option is off.
- Keep every HUD feature reachable through the public handle, so the HUD is an example of
  a host and not a privileged insider.
- Add no per-frame cost that follows the size of the set beyond the one sweep the marker
  pass already makes.
- Reuse the overlay and the label machinery rather than add a second way to put DOM over
  the canvas.

**Non-Goals**

- No animation of the camera on selection. The view jumps.
- No virtual scrolling. A cap on the row count does the same job with far less code.
- No state in the URL for the selection, the filter or the panel. The page owns the URL and
  this change does not widen the fragment.

## Decisions

### The HUD is a module under `src/hud/`, behind an option

**Chosen.** `src/hud/` builds the HUD from the handle alone. `createGalaxyMap` takes
`hud`, absent by default.

Alternatives. *Always on*, like the region labels: rejected, because a host embedding the
map in its own application would have to hide chrome it never asked for, and the browser
tests would have to work around panels over the canvas. *Demo page only*: rejected by the
owner, because then every host rebuilds the same panels.

The consequence to hold to: ESLint gains a block for `src/hud/**` that restricts imports of
`src/render/`, `src/scene-data/` and `src/camera/`, and a `no-restricted-syntax` rule that
fails a read of a `debug` property there. Restricting the renderer alone would leave the
HUD free to reach the set and the view object directly, which is most of what it wants. If
a HUD feature cannot be built from the handle, the handle is what gets the new member, not
the HUD a private import.

One consequence to build for: the HUD names the record and the category types, and both
live in `src/scene-data/real-systems.ts`, which the rule now forbids. A type-only import
trips `no-restricted-imports` exactly as a value import does, so `src/app/create-map.ts`
re-exports `RealSystem`, `SystemImage` and `Category` as part of its public surface and the
HUD reads them from there. A host writing its own panels needs the same types for the same
reason.

### Picking runs on the processor, once per frame, over the whole set

**Chosen.** One sweep projects every system and keeps the nearest candidate.

The cost is the same shape as `rebasePositions`, which already runs every frame over the
same 10,000 entries. 10,000 projections is roughly 300,000 floating point operations, well
inside a millisecond, so the spec's 1 ms bound is a ceiling and not a target.

Alternatives. *An identity buffer on the card*: rejected. A pick would need
`readPixels`, which stalls the pipeline for a round trip, and the phase 1 work already
found that a read back is what forces the driver to finish. It would also need a second
draw of the whole set. *A spatial index*: rejected as premature. An index over 10,000
points costs more to keep current, as the set changes and the camera moves, than the sweep
costs to run.

The hover reads the last pointer position in the frame loop rather than in the pointer
event. A pointer can report at 120 Hz or higher and coalesce several moves into one frame,
so a sweep per event would do work no frame shows.

### The hover ring, the selection pin and the name labels are DOM, not a pass

**Chosen.** They are elements in the overlay `src/app/labels.ts` already writes into. A new
`src/app/markers.ts` places them.

Alternatives. *A WebGL highlight pass*: rejected. It would need a new program, a new
shader pair and a signed distance field or a generated texture for the pin's shape, to
draw at most 66 sprites. The DOM costs two elements for the ring and the pin, stays a
crisp vector at every device pixel ratio, and needs no shader. *A second canvas*: rejected,
because it adds a compositing layer for the same result.

The pin's shape is eight points, transcribed from the SVG at
`edassets.org/static/img/galaxy-map/Marker-galaxy-map.svg` that the owner named.
`src/app/markers.ts` writes them into a path of its own, so no copy of that file is
committed, but the geometry is still the file's and `THIRD_PARTY_NOTICES.md` records where
it came from. The numbers are in the `system-selection` spec.

The one thing DOM costs is that the elements are positioned from the same frame the canvas
draws, inside the frame loop, so they commit together. The region labels already work this
way and do not lag.

### Category visibility and the name filter ride the existing attribute buffer

**Chosen.** A marker that is off or filtered out gets a draw range of 0 in the
style-and-range attribute the vertex shader already reads. The shader's existing range cut
then removes it, and `rebasePositions` counts it out for free.

Alternatives. *A third attribute*: rejected, because the shader would gain a second
comparison for a result the first one already gives. *A compacted draw list*: rejected,
because it would rewrite the position buffer whenever the user typed a letter.

The visibility and the filter both bump `categoryVersion`, which is the version the marker
pass watches to rebuild that buffer. The filter therefore costs one pass over at most
10,000 names per change, and the HUD calls it at most once per 150 ms while the user types.

The rule reads the **primary** category only. That is the category the marker takes its
colour from, and it is what the row's switch controls, so the count on the row and the
markers that vanish agree. A count that included secondary categories would not match the
switch beside it.

### The selection centres and caps the distance at 500 light years

**Chosen.** The cursor moves to the system on every selection. The distance becomes
`min(distance, 500)`.

The cap and not a set value: a user already at 40 light years has chosen how close to look,
and a selection that pushed them back out to 500 would undo it. A user at 20,000 light
years cannot see the marker they just picked, so the view comes in.

The cursor moves whatever the distance does. A zoom that came in without centring would
point the camera at empty space, because at a far view the cursor can be tens of thousands
of light years from the system.

The jump is not animated. An eased fly-to is a real improvement and a separate piece of
work: it needs a duration, an easing, a rule for what happens when the user grabs the mouse
mid-flight, and a way for the browser tests to wait for it. It is recorded as an open
question rather than folded in here.

### The category list caps rows and orders by name

**Chosen.** Alphabetical by name, the first 200 rows, and the distance from Sol on each.

Alternatives. *Order by range from the camera*: rejected. The list would reorder itself
while the user flies, so a row moves out from under the pointer. *Virtual scrolling*:
rejected as more machinery than the problem needs; the search box is the tool for finding
one system among thousands, and the list is for browsing.

The distance shown is from Sol, because that number never changes and the list therefore
needs no per-frame work. The range from the camera, which does change, is in the
information panel, which rewrites at most 10 times a second.

### The grid is a fixed 129 by 129 line set, rebuilt each frame

**Chosen.** 516 vertices at most, in one call, rebased on the processor in `float64` like
every other pass.

At 516 vertices the rebuild costs less than the bookkeeping needed to avoid it. That keeps
the pass inside the camera-relative rule of `far-view-rendering` with no special case.

The 1-2-5 sequence with a 40 CSS pixel floor puts the drawn spacing in 40 to 100 CSS
pixels, because the sequence never steps by more than 2.5. The sequence runs from 1 light
year, not 10: at the closest zoom a 10 light year spacing would put two lines almost a
thousand pixels apart.

### The frame budget is measured with three instruments, not one

**Chosen.** The selection work reads a `labelSampling`-style statistic of its own; the
page's frame rate reads the interval between animation frames; the grid reads
`measureFrames`.

`frameStats` is the wrong instrument for everything this change adds. It times `render`
alone, which the `real-systems` spec already states, and the new work runs in the frame
loop around that call or in the browser's layout and paint after it. A budget read from
`frameStats` would pass whatever the new work cost, which is worse than no budget at all,
because it reads as a check.

So: the pick, the pin, the ring and the label placement are timed directly, at 2 ms. The
whole frame, draw and paint together, is read from the interval between animation frames,
at 18 ms: a 60 Hz display gives 16.7 ms while the page keeps up and about 33.3 ms when it
misses, so 18 ms separates the two and needs no agreement about what a frame contains. The
grid is a draw pass, so it is measured the way the project measures a pass, with
`measureFrames`, against the same view drawn with the pass off, at the shallow pitch where
its fill is worst.

The HUD itself gets no time bound beyond the frame interval. Its cost is DOM write, layout
and paint, which no timer inside the loop can see. The check with teeth is the one that
counts its DOM writes in a still frame and requires zero.

### The HUD is built from real controls, not divs

**Chosen.** Every control is a `button` or an `input`, with `aria-pressed` where it holds a
state, and the lightbox holds and returns the focus.

The mockup builds each control as a `div` with an `onClick`, which is normal for a visual
prototype and unusable from a keyboard. The roadmap lists keyboard access to selection as
an open question for this phase, so it is answered here rather than deferred. The cost is
resetting the browser's own button styling, which is a few lines in the one style sheet the
HUD already ships.

### Fonts are bundled, not fetched

**Chosen.** `@fontsource/chakra-petch` and `@fontsource/ibm-plex-mono`, both at 5.3.0 when
this was written, both SIL Open Font License 1.1. Vite bundles the woff2 files with the build.

Alternatives. *A Google Fonts link, as the mockup uses*: rejected. A library that reaches a
font CDN makes every host page send a third-party request the host did not choose, and it
would make the browser suite depend on the network. *System fonts alone*: rejected, because
the mockup's look rests on the two faces.

No requirement in the specs depends on the font. The HUD names a fallback stack, so a build
without the packages loses the look and passes every test. The 7-day release hold applies
as it does to every package, and `THIRD_PARTY_NOTICES.md` gains a line for each.

### The HUD styles itself, scoped to one class

**Chosen.** One `<style>` element with the id `gm-hud-styles`, added once per document,
every rule under `.gm-hud`, every element named `gm-hud__<part>`.

Alternatives. *A stylesheet the host imports*: rejected, because a host that forgets it
gets an unstyled pile of divs. *Shadow DOM*: rejected. It would isolate the HUD properly,
but it also hides the elements from the Playwright selectors the browser tests need, and it
makes a host's own styling of the panels impossible.

The class names are part of the contract, which is why the spec states their shape. A
browser test and a host both select on them.

## Risks / Trade-offs

**The pick and the marker draw can disagree.** The sweep decides what is picked and the
vertex shader decides what is drawn, from the same numbers in two places. → Both read the
same range, visibility and filter state, and the spec pins the pick radius to
`markerCssSize`. That function and its constants move from
`src/render/system-pass.ts` to `src/scene-data/marker-size.ts`, because the pick and the
overlay marks both need them and neither may import the renderer; the marker pass then
reads them from there, so one rule still sets the marker size, the pick radius, the ring
and the label offset. A browser test picks at the floor and at the cap of the marker size
to hold the two together.

**Selection changes the view, which the URL records.** Every selection now writes a
fragment. → The fragment writer already throttles to one write per 500 ms and the change
raises the listeners once, so a selection costs one entry, the same as a zoom notch.

**The search filters the map, not only the list.** A user who types and then looks away
from the panel sees a map with most of its markers gone. → The box is in the panel that
holds the results, and clearing it restores everything in one frame. The alternative, a
list that narrows over a map that does not, leaves the user hunting the marker they asked
for among thousands they did not.

**The HUD covers the canvas.** Two panels take about 700 CSS pixels of width, which is a
third of a 1920 pixel frame and most of a small one. → The HUD is off by default, and the
map's controls still reach every pixel no panel covers. A narrow viewport is not in scope
for this change; the panels keep their widths.

**A host's image URL is a third-party request.** The panel loads whatever the record names.
→ The reader rejects any scheme but `http` and `https`, so no `javascript:` or `data:` URL
reaches an element, and the elements carry `referrerpolicy="no-referrer"` and
`loading="lazy"`. The library never fetches an image itself.

**Bundle size.** Two font packages and a new module reach the production bundle. → The HUD
is opt-in, but a bundler cannot drop it on that basis alone, because the option is a
runtime value. The implementation keeps `src/hud/` behind a dynamic import taken when the
option asks for it, so a host that never enables the HUD does not download it, and Vite
emits the module and its fonts as a chunk of their own.

The cost of that choice is timing: `handle.hud` is null until the chunk arrives. The map
starts the import in the same tick it is created and awaits it before `ready` settles, so
every scenario that reads `hud` after `ready` reads the HUD. A host that reads `hud` in the
tick it creates the map reads null, which is the same rule `debug.look` already follows for
the renderer.

**The 129 line grid at a shallow pitch.** At a pitch of 5 degrees the grid's far edge is
near the horizon and its lines crowd into a few pixels, and its near lines cross the whole
frame. → The distance fade takes a line to zero alpha at 64 spacings, so the crowd is faded
out rather than drawn as a bright band, and the grid carries a draw-time budget of 1 ms
measured at that pitch, because the fill and not the vertex count is what can grow.

## Migration Plan

No data migrates and no stored format changes. Every new option and every new record field
is optional, so a host on today's version keeps working with no change:

- `hud` and `grid` absent means the map behaves as it does now.
- A record with no `description`, `primaryStar` or `images` reads as it does now.
- The one behaviour a host sees change without asking is the left click: a press that
  stays within 4 CSS pixels and releases within 400 ms now selects. A host that relied on
  such a press doing nothing gets a selection and a view change. The proposal names it.

Rollback is the change reverted. Nothing outside the tree holds state this change writes.

## Open Questions

- **An eased fly-to on selection.** The jump is what this change ships. Whether the camera
  should travel to the system over a few hundred milliseconds, and what happens when the
  user grabs the mouse during the flight, is a question for a later change. It does not
  move any requirement here: the end state of the view is the same either way.
- **A narrow viewport.** The panels keep fixed widths. Whether they should collapse to
  icons below some width is a look question the mockup does not answer.
- **The size of the committed mockup.** `.design/` goes in as it stands, with an 8.1 MB
  PNG backdrop that is a screenshot of this map. Whether that should be re-encoded smaller
  before it is in the history for good is the owner's call and changes no requirement.
