## MODIFIED Requirements

### Requirement: The library build emits a package and no page

`pnpm build` SHALL run the TypeScript check and then build the library. It SHALL write to
**`dist/`**. The output SHALL hold an ES module entry point, a type declaration for the
public surface, and the worker and asset chunks the library loads at run time. It SHALL
hold no HTML file, no demo page module and no demo data.

**It SHALL copy no file of `public/`.** Vite copies the public directory into the output by
default, and `public/` holds the demo site's pictures: the two demo thumbnails and
`EDLoader1.svg`, which ED Assets states no licence on. Serving that file on the owner's own
demo site is the owner's decision; putting it inside a package another project installs is a
different act, and the library needs none of the three files. The library configuration
SHALL therefore turn the copy off.

The two builds SHALL write to two directories, because the check job runs them one after
the other and the Pages job uploads one of them. A shared directory would leave the second
build's output where the first one's is looked for.

The entry point SHALL export `createGalaxyMap` and the types the public surface names:
`GalaxyMapOptions`, `GalaxyMap`, `MapView`, `Category`, `RealSystem`, `SystemImage`,
`RegionMode`, `CategoryInput`, `SystemRecordInput`, `HudOptions`, `HudAction`,
`HudHandle`, `AddReport`, `CategoryReport`, `Reject`, `CategoryReject`, and the four
dataset types the catalog names: `DatasetEntry`, `DatasetContent`, `DatasetInfo` and
`DatasetLoadResult`. A host writes the catalog itself, so it needs `DatasetEntry` in a
type position; a list that left the four out would make the `datasets` option unwritable
in typed code. It SHALL NOT
export the `debug` hook type as part of the supported surface.

`package.json` SHALL name the entry point in `exports` and `types`, SHALL name the built
files in `files`, and SHALL stop being `private`.

The library SHALL NOT read `window.location`, which `real-systems` already holds with a
lint rule, and SHALL NOT read an element by id.

The HUD SHALL stay a chunk of its own, loaded on demand, so a host that does not ask for
the HUD downloads none of it.

The library's own entry chunk SHALL stay under **200,000 bytes**. The bound is the guard
`tests/main-bundle.test.ts` already holds, and it is a guard against one fault: a
main-thread import of the region cell lookup adds about 199 KiB and takes the chunk over
370,000 bytes.

The bound was 170,000 while the page build was the only build. That number came from the
page chunk's 152,506 bytes and gave it about 17,000 bytes of room. The library entry chunk
is about 10,000 bytes larger than the page chunk for the same code, because Vite keeps the
line breaks in a library build, and the dataset catalog and the dataset dialog add more. At
169,700 bytes, with the catalog in and the grid still to come, the old bound left 300
bytes, which fails on the next comment and guards nothing. The finished chunk measures
170,932 bytes, which is over the old bound. 200,000 keeps the guard well under the reading a
leaked lookup gives.

With this change in, the entry chunk measures **198,764** bytes, which leaves about 1.2 kB
under the bound. That is little room, and the next change that touches the entry chunk
SHALL read the bound again rather than assume it holds.

**The library build is now measured.** At commit `7cd18d7` the page build's entry chunk
measured 152,506 bytes and its HUD chunk 27,419. The first library build measured 162,593
bytes for the entry chunk and 31,201 for the HUD chunk, before the dataset catalog and the
dataset dialog. With the whole change in, the library build measures **170,932** bytes for
the entry chunk and **47,271** bytes for the HUD chunk. With the cursor marker, the plane
overlay and the exact region lookup in, it measures **198,764** bytes. A reading SHALL come
from a fresh build and not from a `dist/` left in the tree.

The library entry chunk is larger than the page chunk although it holds less code. Vite's
library mode compresses and mangles the output but keeps the line breaks, while the page
build removes them as well. Gzipped, the library entry chunk is 51.1 kB against the page
chunk's 54.8 kB, so the library is the smaller of the two over the wire. The page build's
152,506 bytes is therefore not a bound on the library.

#### Scenario: The library build carries no page and no demo data

- **WHEN** a test runs the library build into a temporary directory and reads every file
  it emitted
- **THEN** no file ends in `.html`, no file holds the text of a demo system name, no file
  holds the demo page's `galaxy-map-ready` event name, and no file of `public/` is there:
  neither `EDLoader1.svg` nor either demo thumbnail

#### Scenario: The built module loads and creates a map

- **WHEN** a test imports the built ES module by its path and reads the exported names
- **THEN** `createGalaxyMap` is a function, and the module imports with no error under
  Node with no DOM

#### Scenario: The declaration names the public surface

- **WHEN** a test compiles a file that imports every type the requirement lists from the
  built declaration and uses each one in a type position
- **THEN** the compile is clean, and a file that imports `GalaxyMapDebug` from it fails to
  compile

#### Scenario: The entry chunk stays under the bound

- **WHEN** a test runs the library build and reads the size of the entry chunk
- **THEN** the size is under 200,000 bytes, and the region cell lookup is in **no entry
  chunk** and in **no chunk the entry chunk imports at load**.

  **How many chunks carry it follows the build, and the scenario SHALL NOT assert a fixed
  count.** `vite.config.lib.ts` marks `@elite-dangerous-almanac/core` and its subpaths
  **external**, so a host holds one copy of the package. `regionNameAtExact` imports the
  lookup by a bare specifier, and in the library build that specifier stays a bare specifier
  in the output: no chunk of `dist/` carries the table except the region worker's, which
  bundles it because the worker build sets `rollupOptions: { external: [] }`.

  A build that **bundles** the package instead carries it in two chunks, the worker's and
  one lazily loaded chunk that `regionNameAtExact` fetches on its first call. Both shapes
  hold the two rules above, which are what the bound is for, and neither is a fault.

  The rule was that the lookup sat in the region worker chunk alone. The handle now answers
  an exact region for one plane point, which the information panel of `map-hud` states, and
  that answer needs the 199 KiB cell table on the main thread. A dynamic import keeps it out
  of the entry chunk, which is what the bound is for: a host that never asks for an exact
  region never fetches it, and the entry chunk is the same size it was.
