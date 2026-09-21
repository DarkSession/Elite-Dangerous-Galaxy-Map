# Elite Dangerous Galaxy Map

An interactive 3D map of the Elite Dangerous galaxy, drawn in the browser with WebGL2.

The map draws the galaxy from an analytic density model of the game's stellar mass: the
bar, the bulge, the disc, the spiral arms and the dust lanes. Over it, it draws your own
star systems as markers, the codex region boundaries, spheres and lines, an optional set
of nebulae and an optional HUD. You add the data and read what the user picks. The map
owns the canvas, the camera and the frame loop, and it fetches nothing of yours.

The demo site is <https://elite-dangerous-almanac.github.io/Galaxy-Map/> and the API
reference is on the wiki: <https://github.com/Elite-Dangerous-Almanac/Galaxy-Map/wiki>.
The site holds three kinds of page: the demo page at the root, the nine sample pages at
`examples/<name>/`, and the cycles page at
[cycles/](https://elite-dangerous-almanac.github.io/Galaxy-Map/cycles/), which holds every
cycle of the Thargoid war as a record set of its own.
This repository holds the library, that site and the tests. The published package carries
its own README: [packages/galaxy-map/README.md](packages/galaxy-map/README.md).

## Screenshots

[![The galaxy from outside](docs/screenshots/screenshot01.webp)](docs/screenshots/screenshot01.webp)

|                                                                                                                          |                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| [![The codex regions over the Inner Orion Spur](docs/screenshots/screenshot02.webp)](docs/screenshots/screenshot02.webp) | [![Thargoid war systems and the information panel](docs/screenshots/screenshot03.webp)](docs/screenshots/screenshot03.webp) |
| [![Spheres, routes and system icons](docs/screenshots/screenshot04.webp)](docs/screenshots/screenshot04.webp)            | [![A nebula and a selected system](docs/screenshots/screenshot05.webp)](docs/screenshots/screenshot05.webp)                 |

## Install

```bash
pnpm add @elite-dangerous-almanac/galaxy-map
```

The map needs a browser with WebGL2 and a GPU the browser can reach. It refuses to draw
on a software renderer. Give it a `<canvas>` you own and size with CSS.

The nebulae are an **opt-in** subpath, because a host pays for the art in its own build.
Asking for them adds 2,912,225 bytes of volume files, transfer tables and the index. A
build that never imports the subpath carries none of it.

## Samples

The examples are nine pages of the demo site. Each one is one source file,
`apps/demo/examples/<name>/main.ts`, and that file is the only copy of the code: the
wiki page carries the same block, which `pnpm docs:wiki` writes from the source. Open a
page to see the block draw, and read the wiki page for what each call does.

- **Systems on the map** — [the page](https://elite-dangerous-almanac.github.io/Galaxy-Map/examples/systems-on-the-map/), [the wiki page](https://github.com/Elite-Dangerous-Almanac/Galaxy-Map/wiki/Systems-on-the-map), `apps/demo/examples/systems-on-the-map/main.ts`
- **A record with details** — [the page](https://elite-dangerous-almanac.github.io/Galaxy-Map/examples/a-record-with-details/), [the wiki page](https://github.com/Elite-Dangerous-Almanac/Galaxy-Map/wiki/A-record-with-details), `apps/demo/examples/a-record-with-details/main.ts`
- **The system icons** — [the page](https://elite-dangerous-almanac.github.io/Galaxy-Map/examples/the-system-icons/), [the wiki page](https://github.com/Elite-Dangerous-Almanac/Galaxy-Map/wiki/The-system-icons), `apps/demo/examples/the-system-icons/main.ts`
- **The HUD** — [the page](https://elite-dangerous-almanac.github.io/Galaxy-Map/examples/the-hud/), [the wiki page](https://github.com/Elite-Dangerous-Almanac/Galaxy-Map/wiki/The-HUD), `apps/demo/examples/the-hud/main.ts`
- **The camera** — [the page](https://elite-dangerous-almanac.github.io/Galaxy-Map/examples/the-camera/), [the wiki page](https://github.com/Elite-Dangerous-Almanac/Galaxy-Map/wiki/The-camera), `apps/demo/examples/the-camera/main.ts`
- **The view in a URL** — [the page](https://elite-dangerous-almanac.github.io/Galaxy-Map/examples/the-view-in-a-url/), [the wiki page](https://github.com/Elite-Dangerous-Almanac/Galaxy-Map/wiki/The-camera), `apps/demo/examples/the-view-in-a-url/main.ts`
- **Spheres and lines** — [the page](https://elite-dangerous-almanac.github.io/Galaxy-Map/examples/spheres-and-lines/), [the wiki page](https://github.com/Elite-Dangerous-Almanac/Galaxy-Map/wiki/Spheres-and-lines), `apps/demo/examples/spheres-and-lines/main.ts`
- **A dataset catalog** — [the page](https://elite-dangerous-almanac.github.io/Galaxy-Map/examples/a-dataset-catalog/), [the wiki page](https://github.com/Elite-Dangerous-Almanac/Galaxy-Map/wiki/A-dataset-catalog), `apps/demo/examples/a-dataset-catalog/main.ts`
- **The nebulae** — [the page](https://elite-dangerous-almanac.github.io/Galaxy-Map/examples/the-nebulae/), [the wiki page](https://github.com/Elite-Dangerous-Almanac/Galaxy-Map/wiki/The-nebulae), `apps/demo/examples/the-nebulae/main.ts`

## Controls

| Input           | What it does                                                                  |
| --------------- | ----------------------------------------------------------------------------- |
| Left click      | Selects the system under the pointer. A click on nothing keeps the selection. |
| Left drag       | Turns the camera around the cursor.                                           |
| Right drag      | Moves the cursor in the galactic plane, under the pointer.                    |
| Wheel           | Zooms, between 10 light years and the far limit of the bound.                 |
| `W` `A` `S` `D` | Move the cursor in the plane, relative to the camera.                         |
| `R` `F`         | Move the cursor up and down.                                                  |
| `Q` `E`         | Turn the camera around the cursor.                                            |
| `Escape`        | Unwinds one step: the dataset dialog, then the lightbox, then the selection.  |

The demo page keeps the view in the URL fragment, as
`#c=<x>,<y>,<z>&d=<distance>&p=<pitch>&y=<yaw>&g=<grid>`, in light years and degrees. The
library reads and writes no URL: the page owns the fragment and calls `setView`.

## Development

You need Node 22, pnpm and a GPU the browser can reach. The dev container in
[.devcontainer/](.devcontainer/) supplies all three, and its
[README](.devcontainer/README.md) says how to check that the card reached the browser.

```bash
pnpm install
pnpm exec playwright install chromium
```

| Script                  | What it does                                                              |
| ----------------------- | ------------------------------------------------------------------------- |
| `pnpm dev`              | Starts the Vite dev server on port 5173                                   |
| `pnpm build`            | Checks the types, then builds the library                                 |
| `pnpm build:demo-site`  | Builds the demo site                                                      |
| `pnpm build:demo-data`  | Writes the demo record sets again from their sources                      |
| `pnpm build:cycle-data` | Writes the cycle sets of the cycles page again from the archive           |
| `pnpm preview`          | Serves the built demo site on port 4173                                   |
| `pnpm test`             | Runs the Vitest unit tests                                                |
| `pnpm test:package`     | Reads what `npm pack` would ship and fails on a file that does not belong |
| `pnpm test:e2e`         | Builds, serves and runs the Playwright browser tests                      |
| `pnpm docs:wiki`        | Builds the wiki tree into `wiki-build/`                                   |
| `pnpm audit`            | Fails on a known high or critical advisory                                |
| `pnpm lint`             | Runs ESLint                                                               |
| `pnpm format`           | Runs Prettier over the repository                                         |

Start the dev server as `pnpm dev --host 0.0.0.0` so the editor's port forwarding reaches
it. An argument crosses both hops of a delegated script.

**The browser suite is a local gate.** The CI workflow runs every other check and not
Playwright, because the suite fails a run that falls back to a software renderer and a
GitHub-hosted runner carries no GPU. Run `pnpm test:e2e` in the dev container before you
open a pull request, and before you dispatch a release.

[AGENTS.md](AGENTS.md) holds the layout, the import rules and the working agreements.
[docs/galaxy-density-model.md](docs/galaxy-density-model.md) gives the formulas the
galaxy model implements.

## The wiki

The API reference is on the repository's wiki:
<https://github.com/Elite-Dangerous-Almanac/Galaxy-Map/wiki>. It holds one page for every
member the package exports, and the prose pages beside it.

**The wiki is a mirror, and a machine writes it.** `pnpm docs:wiki` builds the whole tree
into the ignored `wiki-build/`, from the TypeScript source and from
[docs/wiki/](docs/wiki/). The `publish-wiki` job of
[.github/workflows/ci.yml](.github/workflows/ci.yml) runs the same script on a push to
`main` and pushes the result. An edit made in the wiki interface is overwritten by the
next push, so change `docs/wiki/` instead. A push that changes nothing writes no commit.

**One setting lives outside the repository**, as the npm publish's do. A wiki that was
never started has no git repository to clone, and no step of the pipeline can make one. A
person turns Wikis on in the repository settings, under Features, and saves one page,
once. This repository's wiki is on. The job fails with a message that names the setting
where it is not.

## The release

[.github/workflows/publish-npm.yml](.github/workflows/publish-npm.yml) publishes the
package. A person starts it and nothing else does: the only trigger is
`workflow_dispatch`, on `main`. It reads `major.minor` from
[packages/galaxy-map/package.json](packages/galaxy-map/package.json), takes one above the
highest patch published on that line, and publishes with OIDC and provenance and no
token. To release a new minor or major, change the version in that manifest first.

## Terms

[LICENSE.md](LICENSE.md) is the PolyForm Noncommercial License 1.0.0, which covers this
project's own code. [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) states the terms of
the data and the art the map draws. Read both: several of the sources are noncommercial
as well.
