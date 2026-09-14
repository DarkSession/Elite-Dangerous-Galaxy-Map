## Why

The map draws the host's systems and nothing tells the user what they are. A marker
carries a colour and no name. The record already holds an `id64`, an allegiance, a
government, a primary economy, a security level, a population and a body count, and none
of it reaches the screen. The user cannot pick a marker, cannot find a system by name,
cannot turn a category off, and cannot reach the region mode the library added in phase
3.1 without writing code.

Phase 4 closes that gap. The owner drew the target in
[.design/Galaxy Map HUD.dc.html](../../../.design/Galaxy%20Map%20HUD.dc.html): a top bar,
a category browser on the left, a map options panel under it, and an information panel on
the right that opens when the user picks a system. This change builds that HUD and the
selection behind it.

## What Changes

**The user picks a system.**

- A left press that releases within 4 CSS pixels and 400 ms selects the marker under the
  pointer. A press that moves further still orbits, so the control scheme does not change.
- The pointer over a marker hovers it. The hovered marker carries a ring and a name
  label. The selected marker carries the game's own system marker over it: a four-point
  pin with a diamond cut-out, its tip on the system, in the colour `#00CDF7`.
- The ring, the pin and the name labels draw as elements in the overlay the library
  already owns for the region labels. They are vector shapes and stay crisp at every
  device pixel ratio, and the map needs no new shader for them.
- The pick runs on the CPU over the system set, at most once per frame. The set holds at
  most 10,000 systems, so no GPU identity buffer is needed.
- A selection centres the camera on the system and caps the zoom distance at 500 light
  years: a view further out comes in to 500, and a view already closer keeps the distance
  it has. The yaw and the pitch do not change. This answers the roadmap's open question:
  selection does move the view. The information panel's **centre view** button brings a
  system back after the user has flown away from it, and it keeps the zoom they moved to.

**The library gains an opt-in HUD.**

- A new `src/hud/` module builds the HUD in plain DOM over the canvas. `createGalaxyMap`
  takes a `hud` option. The option is off by default, so a host that wants its own chrome
  gets the map it gets today, and the demo page turns it on.
- The HUD holds the top bar, the category browser with its search box, the map options
  panel, the information panel and the image lightbox.
- The HUD reads and writes the map through the handle alone. It touches no renderer
  internal and no `debug` member.

**The category browser controls what draws.**

- A category row shows its colour, its name and how many systems it holds. The row turns
  the category off, and a marker of a category that is off does not draw and cannot be
  picked. **ALL** and **NONE** turn every category on or off together.
- The search box filters by system name. A marker whose name does not match does not draw
  and cannot be picked.
- A category expands into a list of its systems, in order of name, capped at 200 rows,
  each showing its distance from Sol. A row selects the system.

**The map options panel exposes three settings.**

- The region mode, as three buttons: **NONE**, **SIMPLIFIED**, **ACCURATE**. It drives the
  `setRegionMode` the library already carries.
- **System names**, which labels the markers in view, bounded at 64 labels per frame.
- **Coordinate grid**, which draws a grid on the galactic plane.

**A coordinate grid draws on the galactic plane.**

- A new pass draws a fixed 129 by 129 line set, centred on the cursor, snapped to a
  spacing chosen so the on-screen line spacing stays between 40 and 100 CSS pixels. The
  line count does not follow the data, so the vertex count is the same at every zoom, and
  the pass carries a draw-time budget of 1 ms for the fill, which does change.

**The record carries three more optional fields.**

- `description`, a paragraph the information panel shows.
- `primaryStar`, the class of the primary star, for example `K5 V`.
- `images`, up to 8 entries of a `url` and an optional `caption`. The panel shows them as
  thumbnails and the lightbox opens one. The library never fetches an image itself: the
  browser loads the host's URL with no referrer.
- Each field is optional. The panel hides a section the record does not fill, so a host
  that passes a plain EDSM or Spansh record sees no empty box.

**The HUD works from the keyboard.**

- Every control the user can click is a real button or input, reachable by `Tab` and
  operated by `Enter` or `Space`, with a name a screen reader can read. This answers the
  third of the roadmap's open questions for the phase. The mockup builds each control as a
  plain `div`, which no keyboard reaches.

**The controls stop reading keys aimed at the HUD.**

- `W A S D R F` move the cursor from a `window` listener today. The search box would move
  the camera as the user types. The controls now ignore a key event whose target is an
  input, a text area or an editable element.

## Non-goals

- No body list, no station list, no market data. The panel shows the record and nothing
  the map fetched.
- No route planning and no distance measuring tool between two systems.
- No multi-select and no box select.
- No theme system. The HUD ships one look, which is the mockup's look.
- No change to the invented star field, the point cloud, the volume or the tone map. The
  committed baseline image of the far view must not move.
- No picking of an invented decoration star. Only a real system is selectable.
- No change to the phase 2.1 level-of-detail fade, which is still unproposed.
- The selection does not go in the URL fragment. This answers the second of the roadmap's
  three open questions for the phase: the page owns the URL, and this change does not widen
  the fragment. The view the selection moves to is already in it.

## Capabilities

### New Capabilities

- `system-selection`: the pick sweep, the hover and selection state, the handle members
  that read and write it, the hover ring, the selection pin and the marker name labels.
- `map-hud`: the opt-in DOM HUD. The `hud` option, the panel layout, the category browser,
  the search, the map options, the information panel, the lightbox, the host action slot,
  the keyboard, and the bounds the DOM holds to.
- `coordinate-grid`: the grid on the galactic plane. Its spacing rule, its extent, its
  look, its switch and its cost.

### Modified Capabilities

- `real-systems`: the record carries `description`, `primaryStar` and `images`; a marker
  of a category that is off does not draw; a marker whose name fails the filter does not
  draw; the handle carries the selection, the visibility, the filter and the HUD members;
  `GalaxyMapOptions` carries `hud`.
- `map-navigation`: a left press that does not move selects rather than orbits, and the
  movement keys ignore an event aimed at a form field.
- `galactic-regions`: the handle reports the region name at a plane point, so the top bar
  can name the region under the cursor without reaching into `debug`.

## Impact

**Code.**

- `src/hud/`: new. The HUD module, its styles, its panels and its unit tests.
- `src/app/create-map.ts`: the `hud` option, the selection members, the category
  visibility members, the name filter members, the region name member, and the wiring
  from the pick to the frame loop.
- `src/app/main.ts`: turns the HUD on and passes the demo page's action slot.
- `src/scene-data/real-systems.ts`: three more optional record fields, per-category
  visibility, the name filter and the version each one bumps.
- `src/scene-data/picking.ts`: new. The pick sweep, which projects the set and returns the
  nearest candidate. It imports no renderer, as the lint rule requires.
- `src/scene-data/marker-size.ts`: new. `markerCssSize` and the size constants move here
  from `src/render/system-pass.ts`, because the pick and the overlay marks need them and
  neither may import the renderer. `src/render/system-pass.ts` reads them from here, so one
  rule still sets the marker size, the pick radius, the ring and the label offset.
- `src/render/system-pass.ts` and `src/render/shaders/systems.vert`: a marker that is off
  or filtered out draws nothing.
- `src/app/markers.ts`: new. The overlay elements for the hover ring, the selection pin
  and the marker name labels. It sits beside `src/app/labels.ts`, which already places
  the region labels in the same host.
- `src/app/labels.ts`: the region label fade moves from the host element onto each label.
  The host now holds the pin, the ring and the marker name labels as well, and a fade on
  the host would fade those with the region labels.
- `src/render/grid-pass.ts` and `src/render/shaders/grid.vert/.frag`: new.
- `src/render/renderer.ts`: the two new passes, their switches and their order.
- `src/camera/controls.ts`: the click test and the form-field guard.
- `eslint.config.js`: `src/hud/**` joins the group that must not import `src/render/`, and
  the group for the HUD also holds `src/scene-data/` and `src/camera/`, so the HUD reaches
  the map through the handle alone. A second rule fails a read of `.debug` inside
  `src/hud/`.
- `index.html`: the HUD needs no markup, so the page loses nothing and gains nothing.

**Scale.** The system set is capped at 10,000 and the category table at 256. The pick
sweep is one pass over the set, at most once per frame. The spec measures it two ways: a
reading of the selection work itself, bounded at 2 ms, and the mean interval between
animation frames, bounded at 18 ms, which covers the draw and the paint together. The marker
labels are capped at 64 per frame and the expanded category list at 200 rows, so the DOM
node count does not follow the set size. The grid is a fixed line set. None of the new
work reads the galaxy's 400 billion systems: it reads the host's set alone.

**Dependencies.** Two font packages, `@fontsource/chakra-petch` and
`@fontsource/ibm-plex-mono`, both SIL Open Font License 1.1. The HUD bundles the fonts
rather than fetching them from a font CDN, so the browser tests stay offline and no host
page makes a third-party request. `THIRD_PARTY_NOTICES.md` gains an entry for each. The
7-day release hold applies as it does to every package.

**Data.** `.design/` is committed with this change, so the mockup the HUD is built from
stays with the tree. It holds three things: the mockup markup, an 8.1 MB PNG backdrop, and
`support.js`, 69 KB of generated runtime that the design tool emits to make the mockup
open in a browser. The PNG is a screenshot of this project's own map, not a capture of the
game, so it raises no third-party question; it goes into the history at its full size
because the owner asked for the mockup as it stands. `support.js` carries no licence
header, so `THIRD_PARTY_NOTICES.md` records what it is and where it came from.

**Attribution.** The selection pin is the shape of the system marker the game's own
galaxy map draws. The eight points in the spec are transcribed from
`https://edassets.org/static/img/galaxy-map/Marker-galaxy-map.svg`, an Illustrator export
that ED Assets publishes, which the owner named as the source. The change commits no copy
of that file: `src/app/markers.ts` writes the eight numbers into a path of its own. The
numbers are still the file's geometry, so `THIRD_PARTY_NOTICES.md` gains a line that names
ED Assets as where they were taken from and the shape as Frontier's, under the same
non-commercial media usage notice the almanac data already carries. ED Assets states no
licence on the file itself, so the notice records the source rather than a grant.

**Tests.** Unit tests for the pick sweep, the grid spacing rule, the label bound, the
three new record fields, the filter and the visibility rules. Browser tests for the click
to select, the hover ring, the panel contents, the category toggles, the search, the
region mode buttons, the grid, the keyboard and the frame budget with the HUD on.
