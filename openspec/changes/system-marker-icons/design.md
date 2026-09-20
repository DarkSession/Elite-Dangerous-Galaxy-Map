## Context

See proposal.md — Why. What shapes the approach:

- **The overlay already exists.** `packages/galaxy-map/src/app/markers.ts` places the hover
  ring, the selection pin and the name labels as DOM elements over the canvas. It already
  projects every marker each frame, reads `markerFlags` and the draw range, keeps the
  nearest 64 with `createNearestKeep`, and pools its elements. An icon stack is the same
  job with a different element.
- **The reader already exists.** `packages/galaxy-map/src/scene-data/real-systems.ts` owns
  the record shape, the reject report and `safeImageUrl`. Nothing else reads a raw record.
- **`src/scene-data/` must not import `src/render/`**, and `src/hud/` must reach the map
  through the public handle alone. Both are ESLint rules. Neither is in the way here: the
  icons are DOM, not WebGL, and the HUD calls `setSystemIconsVisible` on the handle.
- **The vectors are in the published almanac package, behind the exports map.**
  `@elite-dangerous-almanac/core` 0.2.15 publishes `galaxy-map/markers`, the catalogue of 16
  symbols and their colours, and `assets/galaxy-map/`, the 16 vectors, 11,909 bytes together.
  Its `files` list names `assets`, so the files are in the tarball. Its `exports` map names
  no `./assets/*` row, so `@elite-dangerous-almanac/core/assets/galaxy-map/titan.svg`
  answers `ERR_PACKAGE_PATH_NOT_EXPORTED` and no build reaches it. The almanac added the row
  and published **0.2.16**, which is the version this change pins.
- **The 7-day hold is not in the way.** `pnpm-workspace.yaml` already names
  `@elite-dangerous-almanac/core` in `minimumReleaseAgeExclude`, because the package is the
  project's own, so 0.2.16 installs on the day it published.

## Goals / Non-Goals

**Goals:**

- One place owns an icon: the reader resolves an entry to `{ url, color }` whatever form it
  came in, so the overlay never asks whether an icon is built-in or the host's.
- The stack costs the frame one more pass over the candidate list the name labels already
  sweep, and no second projection of the set.
- A host that names no icon pays 16 small files in `dist/` and about 1 KB of URL strings.
  It pays no per-frame work either, which takes a fast path, because the icon switch
  defaults on where the name switch defaults off.

**Non-Goals:**

- No texture atlas, no WebGL pass, no picking, no tooltip. The proposal states these.
- No change to how the pin, the ring or the name labels place themselves. The stack moves
  around the pin; the pin does not move.
- No fetch of a host icon by the library. The browser loads it from the element, as it does
  a record image.

## Decisions

### The vectors come from the dependency

`src/scene-data/marker-icons.ts` imports each of the 16 vectors from
`@elite-dangerous-almanac/core/assets/galaxy-map/<symbol>.svg`, and the library build emits
them as files of its own output. The package carries no copy of the artwork.

**Why the version is 0.2.16 and not 0.2.15.** 0.2.15 is the first version to ship
`assets/galaxy-map/`, and its `files` list already names `assets`, so the bytes are in the
tarball. Its `exports` map names no `./assets/*` row. A subpath that `exports` does not name
is not reachable, under Node and under every bundler that reads the field, so 0.2.15 alone
gives the map the colours and not the vectors. 0.2.16 adds one row,
`"./assets/*": "./assets/*"`, and that is the whole of the release. Its tarball was checked:
the row is present and all 16 vectors resolve.

**Why this waited on that release.** The owner chose to correct the packaging rather than
work around it. The almanac is a repository of this project, the release is one row, and
the package is already out of the 7-day hold, so the wait was a release and not a week. What
the wait buys is the deletion of a copied directory, a build glob and a provenance statement
that names a commit. It does not delete the colour check, which is about the dependency's
own two values and not about a copy.

**Alternative rejected: copy the 16 files into `packages/galaxy-map/src/`.** The almanac's
README states that the vectors are static package files rather than subpath exports, and
that an application copies them out of the installed package, so the copy is the route the
dependency documents. It was the plan of this design before 0.2.15, and it still works. It
was rejected because a copy of another project's artwork needs a provenance statement that
names a commit, a test that the copy still matches its source, and an answer for every
reader who asks why the bytes are in two places. One `exports` row deletes all three.

**Alternative rejected: no dependency, parse the colour out of the SVG at build time.** It
drops the version bump but leaves the project as the only holder of the data, and the
almanac is where that data is maintained.

### The URLs come from 16 static imports, and not from `import.meta.glob`

```ts
import bookmark from '@elite-dangerous-almanac/core/assets/galaxy-map/bookmark.svg?url&no-inline';
// ... one line per symbol, 16 lines
```

**Why not a glob**, which is how `src/render/nebula-volumes.ts` reads its art.
`import.meta.glob` takes a relative path, an absolute path or an alias, and not a bare
package specifier, so it cannot reach a file in a dependency. Sixteen lines is the price of
reading the vectors from the package that maintains them.

**The pattern is already in the tree.** `src/hud/styles.ts` imports three `@fontsource`
faces by bare package specifier with `?url&no-inline`, and the build emits them as files.
The vectors are the same import in a different package, so nothing here is new but the
external rule below, which `@fontsource` never needed because it was never external.

`?url&no-inline` because the library build inlines a small asset as a data URI otherwise —
the same reason `src/render/nebula-volumes.ts` gives. Sixteen data URIs in the JavaScript
would be about 15 KB of base64 that every host carries whether or not it names an icon.

**The cost this accepts.** The 16 files are emitted for every host, and the 16 eager imports
put 16 URL strings in the main chunk. That is about 1 KB of strings and 11 KB of files that
an icon-free host never fetches. It is not the nebula case: `src/nebulae/` is a separate
entry point because the art there is 2,912,225 bytes. Eleven kilobytes does not earn a
third entry point, an export map row and a lint rule.

**Alternative rejected: a lazy import.** It would drop the strings from the main chunk but
make resolving an icon asynchronous, which would turn `addSystems` — a synchronous call
that returns a report in the same tick — into something else.

### The external rule narrows to leave `assets/` alone

`packages/galaxy-map/vite.config.ts` holds
`/^(gl-matrix|@elite-dangerous-almanac\/core)(\/.*)?$/`, which matches every subpath of the
core package, including a vector. An external vector would stay a bare specifier in the
emitted JavaScript, and a bare specifier that names an `.svg` file resolves in no browser.
The rule becomes `/^(gl-matrix|@elite-dangerous-almanac\/core)(\/(?!assets\/).*)?$/`.

The four `astro` leaves and `galaxy-map/markers` stay external, so a host that already
installs the package still holds one copy of the JavaScript. The vectors are not
JavaScript, and a host cannot hold one copy of them: they are files the library's own build
emits and references by a URL relative to its own module.

### The catalogue lives in `src/scene-data/`, not `src/app/`

`src/scene-data/marker-icons.ts` exports the symbol table and reads one icon entry.
`real-systems.ts` imports it; `app/markers.ts` imports nothing new, because it reads the
resolved icons off the record.

**Why not `src/app/`.** `src/scene-data/` would then import `src/app/`, which reverses the
direction the layering runs in. A URL string is data, and scene data is where the record
shape lives.

### A resolved icon is `{ url, color }` and is stored on the record

The reader resolves a built-in symbol to the shipped URL and the catalogue colour, and a
host entry to its own `url` and `color`. `RealSystem.icons` holds the resolved list.

`getSystem` answers a copy of a record, and the copy SHALL carry a copy of the icon list,
so a caller that edits what it is given does not reach into the set.

The overlay then needs no catalogue, no branch on the entry form, and no colour lookup per
frame. The cost is 10,000 records × 4 icons = 40,000 object references at the worst case,
each holding a shared URL string — small next to the `description` strings the same records
already hold.

### A bad icon rejects the record; a bad image does not

The reader drops a bad record image quietly, "because an image is decoration". An icon is
decoration too, so this is a deliberate split, made by the project owner: an icon is a small
list a host writes by hand or maps from its own data, where a misspelled symbol is a
mistake to report, not a value to guess at. A dropped icon would leave a system that looks
correct and silently lost a marker.

Two reasons rather than one, because they point at different mistakes:
`unknown-icon` says the symbol is not in the catalogue, and `bad-icon` covers every shape,
URL and colour fault.

### The stack is DOM, pooled, and placed in `app/markers.ts`

One `<img>` per icon and one `<div>` per arrow, held in two pools beside the label pool.
`<img>` and not inline SVG: the built-in vectors carry their own `color` attribute and need
no recolouring, and a host icon is a URL the library will not fetch and parse. One element
kind covers both.

**`station-abandoned` draws a near-black glyph and a near-black arrow.** `#211C21` is the
colour the game uses for an abandoned station, and the almanac's provenance calls it out as
a measurement and not a fault. The map draws it as it is, so a host that wants it to read
over dark space gives its own icon with its own colour. This is stated here so it comes
back as a question and not as a bug report.

**The arrow is a CSS border triangle**, not an SVG: four style writes, no second namespace,
no viewBox. `border-left` and `border-right` of 4 px transparent, `border-top` of 5 px in
the icon's colour, width and height 0. That gives the 8 × 5 triangle the spec states, apex
down.

**The geometry**, all in CSS pixels, with `m = markerCssSize` and `lift = 28` when the
system is selected and 0 otherwise:

| Part                     | Offset above the marker's projected centre |
| ------------------------ | ------------------------------------------ |
| Arrow apex               | `m / 2 + 2 + lift`                          |
| Arrow top, lowest icon's bottom | `m / 2 + 7 + lift`                   |
| Icon `i`'s bottom        | `m / 2 + 7 + lift + i * 30`                 |

`m / 2 + 2` is the pin's own tip offset, which `system-selection` states, so the stack and
the pin start from one rule. `30` is the 28 px icon plus the 2 px gap.

**The icon is 28 px, on a black plate, at whole pixels.** The owner set the size by eye,
after 16 and 20 read too small against the markers. The plate is opaque black: a vector of
the catalogue is a thin light line on nothing, and the galaxy behind a marker is neither
dark nor one colour. The placement rounds to whole CSS pixels, because an icon is a bitmap
the browser makes from a vector and a fractional offset makes it sample the vector at a new
phase in every frame, which shakes the glyph while the camera moves. The pin and the ring
are vectors the browser draws again at each place, so they keep their fractional offsets.

### The stacks live in a layer of their own

A stack takes a stacking level from its depth, so the nearer of two crossing stacks draws
over the further one. The overlay hands an element of its pool to a system by its place in
the frame and not by its depth, so the tree order cannot carry the rule.

Those levels must not reach the page. The overlay host is often one the caller gave — the
demo site gives `#labels` — and the library cannot rely on its style, so a level written on
an icon would compete with the HUD root at 10 and 32 nearby stacks would paint over the
panels. The library therefore holds every stack in a layer of its own with a level of 2.
A level makes the layer a stacking context, so the 32 stack levels stay inside it, and 2
sits over the plane elements at 0 and over the ring, the pin and the name labels at 1, and
under the HUD at 10.

**Why the stack lifts over the pin rather than the pin moving.** The pin's placement is a
requirement with its own scenarios and a screenshot baseline. A selected system is at most
one per map, so the branch costs one comparison per placed stack.

### The candidate sweep comes out of the `namesOn` branch

`app/markers.ts` runs its 10,000-entry projection sweep inside `if (namesOn && count > 0)`.
`systemNames` defaults **off** and `systemIcons` defaults **on**, so an icon stack placed
inside that branch would not draw on a map that never touched the name switch, which is
every browser scenario of this capability. The sweep therefore moves out and runs when
**either** switch is on, and each keeper is offered only where its own switch is on.

**The fast path.** A set that names no icon would otherwise pay that sweep for the first
time, because the icon switch defaults on. `RealSystemSet` therefore carries a count of the
records that hold at least one icon, and the placement is skipped where the count is zero.
That is one counter raised in the reader and one comparison a frame, and it is what keeps
the goal above true: a host that names no icon pays no per-frame work.

### No overlap test between stacks

The name labels drop a label whose box overlaps one already placed. The icons do not.
A name label is text a reader must read end to end; an icon is a 28 px glyph that still
reads under a partial cover, and dropping one of two stacks in a cluster would make icons
blink as the camera moves. The spec states this so a reviewer does not read it as an
oversight.

### The cap is 32 stacks, against the labels' 64

A stack is up to 5 elements where a label is 1, so 32 stacks is up to 160 elements against
the labels' 64. The two together stay in the same order of magnitude as the overlay holds
today. `createNearestKeep(32)` is reused as-is.

### The switch defaults on, unlike the name labels

The name labels default off because a set of 10,000 systems opens on a screen of text. An
icon draws only where a record names one, so a set that names none opens on nothing new, and
a host that went to the trouble of naming icons means them to show. An unreadable
`systemIcons` therefore takes `true`, which is that default, and not `false`.

### The hover ring crosses the lowest icon

The hover ring is `markerCssSize * 3.2` across with a floor of 24, so its radius runs 12 to
25.6 CSS pixels, and marker sizes run 7 to 16. At the 28 px icon the lowest icon spans
`m / 2 + 7` to `m / 2 + 35` above the centre, and the ring reaches into that span at every
size, so the arc crosses the lowest icon. It does not cross the arrow: the arrow is 8 px
wide and spans `m / 2 + 2` to `m / 2 + 7`, and the arc passes that band at 5.8 to 10.7
pixels out at the smallest marker and about 21 at the largest, which is clear of it.

Both are decoration and the ring is a 1 pixel white stroke at half alpha, so this is left as
it is and checked by eye rather than designed around. Moving the stack clear of the ring
would cost another 26 CSS pixels of lift on a hover alone, which would make the stack jump
as the pointer crosses it. It is written down here so it comes back as a look question.

## Risks / Trade-offs

- **The glyph colour and the arrow colour disagree.** → The glyph's colour is baked into the
  vector's root `color` attribute and the arrow's comes from `GALAXY_MAP_MARKERS.color`.
  They are two values in one dependency, and nothing makes the almanac keep them equal, so
  the test of task 1.3 reads each vector out of the installed package and compares the two.
  This is the one check that survives the deletion of the copy, and it survives because it
  never was about the copy.
- **The almanac release does not land, or lands without the `exports` row.** → Retired.
  0.2.16 published on 2026-09-20 with the row, and task **1.0** records the check, which
  resolves a vector out of the published tarball rather than reading the release notes. The
  fallback was the rejected alternative above, the copied directory.
- **The catalogue grows a seventeenth symbol and the 16 imports do not.** → The symbol table
  is built against `GALAXY_MAP_MARKERS`, and the test of task 1.3 fails on a catalogue
  symbol with no import.
- **Every host's `dist/` grows by 16 files.** → About 11 KB, fetched only when an icon
  draws. Stated above rather than hidden; a fourth entry point would cost more than it saves.
- **A host icon's URL 404s and the browser draws a broken image.** → The element carries
  `alt=""`, so the browser draws no broken-image glyph and no alt text. The black plate would
  still leave an opaque square, so the element hides itself on the error and the frame shows
  it again when it writes a new URL. The arrow still draws, because its colour came from the
  record and not from the file.
- **A `data:` or `javascript:` URL from an untrusted dump.** → The same `safeImageUrl` the
  record images use, which the spec names, with the tab and control character handling it
  already holds.
- **Firefox rasterises the overlay on the CPU, and this adds up to 160 elements to it.** →
  `system-icons` carries a second Firefox reading at the view `browser-suite` already
  measures, held to that requirement's 7 ms. The measured table of `browser-suite` is a
  frame with no icon and is deliberately left alone, because changing its setup would
  invalidate the four readings the budget was derived from.
- **The frame budget is already 2 ms and this adds work to it.** → The task list measures it
  at 10,000 systems × 4 icons before the change is presented, and the spec carries that
  scenario. If it does not hold, the cap of 32 is the knob.
- **The version bump renames a region the map draws.** → Codex region 31 reads
  `The Formidine Rift` in 0.2.15 where it read `Formidine Rift` in 0.2.8. The four leaves
  keep their paths and their shapes; this is the one value that moves. The two versions were
  compared leaf by leaf before this was written: `galaxy-grid` and `mass-code` carry the same
  values, `findCodexRegionAt` answers the same region id at every one of 3,721 sampled
  points, and `CODEX_REGIONS` differs in that one name and in nothing else. Nothing in the
  tree asserts the old string and no label width constant is fitted to the longest region
  name, so the label simply reads the new name. The task list runs the full suite after the
  bump.

## Migration Plan

No migration. `icons` is an optional field, the switch defaults on and a record that names
no icon behaves as it does today. The version bump is a lockfile change; a rollback is the
previous `package.json` and `pnpm-lock.yaml`.
