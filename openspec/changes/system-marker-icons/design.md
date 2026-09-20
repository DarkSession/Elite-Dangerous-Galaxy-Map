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
- **The vectors are not in the published almanac package.** `@elite-dangerous-almanac/core`
  0.2.14 publishes `galaxy-map/markers`, the catalogue of 16 symbols and their colours, and
  its `files` list carries `assets/`. The published tarball holds `assets/ships/` alone;
  `assets/galaxy-map/` is in the almanac repository and not in the package.
- **The 7-day hold is not in the way.** `pnpm-workspace.yaml` already names
  `@elite-dangerous-almanac/core` in `minimumReleaseAgeExclude`, because the package is the
  project's own. 0.2.14 installs today.

## Goals / Non-Goals

**Goals:**

- One place owns an icon: the reader resolves an entry to `{ url, color }` whatever form it
  came in, so the overlay never asks whether an icon is built-in or the host's.
- The stack costs the frame one more pass over the candidate list the name labels already
  sweep, and no second projection of the set.
- A host that names no icon pays 16 small files in `dist/` and about 1 KB of URL strings,
  and nothing else.

**Non-Goals:**

- No texture atlas, no WebGL pass, no picking, no tooltip. The proposal states these.
- No change to how the pin, the ring or the name labels place themselves. The stack moves
  around the pin; the pin does not move.
- No fetch of a host icon by the library. The browser loads it from the element, as it does
  a record image.

## Decisions

### The vectors are copied into the package

`packages/galaxy-map/src/scene-data/marker-icons/<symbol>.svg`, 16 files, about 11 KB,
taken from the almanac repository's `assets/galaxy-map/`.

**Why not read them from `node_modules`.** They are not there. The published package ships
`assets/ships/` alone.

**Why not wait for the almanac to publish them.** The almanac's `files` list already names
`assets/`, and its `markers.d.ts` documents `assets/galaxy-map/<symbol>.svg`, so the
omission reads as a packaging fault rather than a decision. A 0.2.15 that carried the
directory would delete the copied files, the glob and the drift test, and it would install
the same day, because the package is already excluded from the 7-day hold.

The owner chose the copy with that fact stated, and the reason is scope: fixing the
packaging is a release of a different repository, and this change would wait on it. The
copy is the same kind of copy the nebula art already is, and the drift test below is what
keeps it honest. If a later almanac version does ship the directory, this is one directory
and one glob to delete, and the drift test is what flags the day the two disagree.

**The drift test.** A test in `tests/` reads `GALAXY_MAP_MARKERS` from the dependency and
the shipped directory, and fails on a symbol with no file, a file with no symbol, or a root
`color` attribute that is not the catalogue's `color`. That is what makes the dependency
earn its place: without it the colours would be a second hand-kept copy of the same data.

**Alternative rejected: no dependency, parse the colour out of the SVG at build time.** It
drops the version bump but leaves the project as the only holder of the data, and the
almanac is where that data is maintained.

### The URLs come from an eager `import.meta.glob`, as the nebula art's do

```ts
const assetUrls = import.meta.glob<string>('./marker-icons/*.svg', {
  query: '?url&no-inline',
  import: 'default',
  eager: true,
});
```

`?url&no-inline` because the library build inlines a small asset as a data URI otherwise —
the same reason `src/render/nebula-volumes.ts` gives. Sixteen data URIs in the JavaScript
would be about 15 KB of base64 that every host carries whether or not it names an icon.

**The cost this accepts.** The 16 files are emitted for every host, and the eager glob puts
16 URL strings in the main chunk. That is about 1 KB of strings and 11 KB of files that an
icon-free host never fetches. It is not the nebula case: `src/nebulae/` is a separate entry
point because the art there is 2,912,225 bytes. Eleven kilobytes does not earn a third
entry point, an export map row and a lint rule.

**Alternative rejected: a lazy glob.** It would drop the strings from the main chunk but
make resolving an icon asynchronous, which would turn `addSystems` — a synchronous call
that returns a report in the same tick — into something else.

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
| Icon `i`'s bottom        | `m / 2 + 7 + lift + i * 18`                 |

`m / 2 + 2` is the pin's own tip offset, which `system-selection` states, so the stack and
the pin start from one rule. `18` is the 16 px icon plus the 2 px gap.

**Why the stack lifts over the pin rather than the pin moving.** The pin's placement is a
requirement with its own scenarios and a screenshot baseline. A selected system is at most
one per map, so the branch costs one comparison per placed stack.

### No overlap test between stacks

The name labels drop a label whose box overlaps one already placed. The icons do not.
A name label is text a reader must read end to end; an icon is a 16 px glyph that still
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

### The hover ring crosses the arrow and the lowest icon

The hover ring is `markerCssSize * 3.2` across with a floor of 24, so its radius runs 12 to
25.6 CSS pixels. The arrow apex sits `m / 2 + 2` above the centre and the lowest icon spans
`m / 2 + 7` to `m / 2 + 23`, and marker sizes run 7 to 16, so the ring's upper arc passes
through both at every size.

Both are decoration and the ring is a 1 pixel white stroke at half alpha, so this is left as
it is and checked by eye rather than designed around. Moving the stack clear of the ring
would cost another 26 CSS pixels of lift on a hover alone, which would make the stack jump
as the pointer crosses it. It is written down here so it comes back as a look question.

## Risks / Trade-offs

- **The copied vectors drift from the catalogue.** → The `tests/` drift test compares the
  shipped set to `GALAXY_MAP_MARKERS` on symbol and on colour, and fails the suite.
- **The almanac later publishes `assets/galaxy-map/`, and the package ships two copies.** →
  The copy is one directory and one glob. Dropping it later is a small change, and the drift
  test is what would flag the day the two disagree.
- **Every host's `dist/` grows by 16 files.** → About 11 KB, fetched only when an icon
  draws. Stated above rather than hidden; a fourth entry point would cost more than it saves.
- **A host icon's URL 404s and the browser draws a broken image.** → The element carries
  `alt=""`, so a failed load draws nothing rather than a broken-image glyph and alt text. The
  arrow still draws, because its colour came from the record and not from the file.
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
  `The Formidine Rift` in 0.2.14 where it read `Formidine Rift` in 0.2.8. The four leaves
  keep their paths and their shapes; this is the one value that moves. Nothing in the tree
  asserts the old string and no label width constant is fitted to the longest region name,
  so the label simply reads the new name. The task list runs the full suite after the bump,
  which covers the region lookup, the boxel geometry and the mass codes.

## Migration Plan

No migration. `icons` is an optional field, the switch defaults on and a record that names
no icon behaves as it does today. The version bump is a lockfile change; a rollback is the
previous `package.json` and `pnpm-lock.yaml`.
