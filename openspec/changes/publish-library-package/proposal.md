## Why

The repository builds a library and a demo site from one package. `package.json` names
`elite-dangerous-galaxy-map`, which is not the name the library will be installed under,
carries no licence, no repository, no description and no author, and lists the HUD's
build-time font packages as run-time dependencies. There is no `LICENSE` file, so nothing
states the terms the code goes out under. Nothing packs or publishes.

The boundary between the library and the demo is held by four things that are not the
build: a lint rule for `window.location`, a lint rule for the HUD's imports, a comment in
`src/index.ts`, and a test that reads the built output for demo strings. Each is a real
guard, and each was written because one `src/` tree holds both. A demo module that
imported a library internal, or a library module that imported a demo file, would compile.

The library is to be published as **`@elite-dangerous-almanac/galaxy-map`**. Two things
follow: the package needs the metadata and the terms a published package needs, and the
split needs to be a fact of the layout rather than a set of rules over one tree.

## What Changes

- **The repository becomes a pnpm workspace.** `packages/galaxy-map/` holds the library
  and `apps/demo/` holds the demo site. Each has its own `package.json` and its own Vite
  configuration.
- **The demo depends on the library from within the workspace**, as
  `"@elite-dangerous-almanac/galaxy-map": "workspace:*"`. It never installs the published
  package. The demo's Vite configuration resolves the two entry points to the library's
  **source**, so the dev server has no build step and hot reload still works.
- **The package takes its published identity**: the name
  `@elite-dangerous-almanac/galaxy-map`, a description, an author, the repository, the
  homepage, the issue address, keywords, `publishConfig`, and a `files` list that carries
  the built output, the package's own README and the two notices files.
- **The terms are written down.** `LICENSE.md` at the repository root carries a
  **non-commercial** licence, as the maintainer chose, a `prepack` script copies it into
  the package so the tarball states terms too, and `package.json` names it. `THIRD_PARTY_NOTICES.md` ships
  inside the package, because the data the map carries has terms of its own and some of
  them are non-commercial.
- **The font packages leave `dependencies`.** `@fontsource/chakra-petch` and
  `@fontsource/ibm-plex-mono` are **two** packages, and `src/hud/styles.ts` imports three
  `.woff2` files from them with `?url&no-inline`. The build inlines those files into the
  output as assets, so the two packages are `devDependencies`. A host that installs the
  package installs `gl-matrix` and `@elite-dangerous-almanac/core` and nothing else,
  because those two are the only externals of the library build.
- **A publish workflow.** `.github/workflows/publish-npm.yml` runs on
  `workflow_dispatch` alone, from the default branch alone. It works out the next free
  patch version, checks the registry and the tag, runs the checks, packs, verifies the
  tarball's digest, publishes through **npm Trusted Publishing with OIDC and provenance**,
  then creates the tag and the GitHub release. It is the same shape as the workflow
  `@elite-dangerous-almanac/core` already uses.
- **`@elite-dangerous-almanac/core` leaves the 7-day hold.** `pnpm-workspace.yaml` gains
  a `minimumReleaseAgeExclude` naming it, which the maintainer asked for. The hold is a
  measure against a hijacked **third-party** maintainer account. That package is this
  project's own, released from the same organisation this package publishes to, so the
  week of distance buys nothing and costs a week on every fix. `AGENTS.md` asks for the
  reason to be in the change proposal rather than for the hold to be lowered for
  everything, and this is that reason. The hold stays at 10080 minutes for every other
  package.

- **The publish workflow pins an npm client version**, which is a registry fetch outside
  the 7-day pnpm hold. Trusted Publishing with OIDC needs a client new enough to send the
  token, so the hold cannot apply to it. It is pinned by exact version with the reason in a
  comment, it runs only in CI, and it installs nothing into this repository.
- **A packed-tarball test.** `pnpm test:package` reads what `npm pack` would ship and
  fails on a file that does not belong: no source, no test, no OpenSpec artifact, no demo
  data. It calls `npm pack --dry-run --json`, which is the only machine-readable list of
  what a tarball carries. That does not soften the pnpm rule in `AGENTS.md`: a dry-run
  pack resolves nothing, installs nothing and writes no `package-lock.json`. pnpm stays
  the package manager for every install.
- **The public surface widens by three names, and gains a `./testing` entry point.** The
  demo page reaches five library members the entry point does not carry. `View` becomes
  `MapView`, which is already exported and structurally identical, so it is a signature
  change and not a fourth name. The three new names are `createFragmentWriter`,
  `FragmentWriter` and `FragmentWriterOptions`, which are exported, because the writer is already
  written as a host helper that never touches `window.location`. `galaxyMapGlobal` and its
  two types go behind a third entry point, `./testing`, which the spec states is not the
  supported surface. `src/app/demo-systems.test.ts` moves to `tests/`, so its two
  `scene-data/` reaches need no export at all. The demo then imports the map at **all
  three** entry points, which the demo's alias table and the root `tsconfig.json` `paths`
  both have to carry.
- **The lint rules tighten.** The `window.location` rule loses its one exception, because
  the demo page is no longer a file of the library package. The HUD's import rules keep
  their shape and take the new paths.
- **The two build outputs stop colliding by design.** The library writes
  `packages/galaxy-map/dist/` and the demo writes `apps/demo/dist/`. Neither can land
  where the other is looked for, so the reason `dist-demo/` existed is gone.

### Non-goals

- **No change to what the map draws.** Not one shader, not one constant, not one look
  value. Every browser test must pass unchanged, and the pinned baseline image must not
  move. A restructure that changes a pixel is a restructure with a bug in it.
- **No automatic release.** The workflow runs when a person dispatches it. Nothing
  publishes on a push, on a tag or on a merge.
- **No version policy beyond the next patch of the line.** The workflow reads
  `major.minor` from `package.json` and picks one above the highest patch published on
  that line. It does not fill a hole in the series, because npm refuses a version that was
  published and unpublished, and a lower patch would move the `latest` tag backwards.
  Moving `major.minor` stays a commit a person makes.
- **The browser suite does not move into the publish workflow.** It needs a GPU, and a
  GitHub-hosted runner has none. The maintainer runs `pnpm test:e2e` locally before
  dispatching. The workflow says so in a comment, as the check workflow already does.
- **No second published package.** The nebula art stays inside this package, which
  `make-nebulae-optional` states and accepts.
- **No change to the OpenSpec layout.** `openspec/`, `e2e/`, `tests/`, `scripts/`,
  `docs/`, `.github/` and `.devcontainer/` stay at the repository root. Only the
  application code, the demo page and their assets move.

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `library-package`: the package's published identity, the licence, the packed file list,
  the workspace layout, the two output directories, how the demo consumes the library, the
  table that says how every spec's paths are read after the move, the three names the entry
  point gains, and the `./testing` entry point.
- `continuous-integration`: the check job runs in a workspace and names the new output
  paths; the Pages job uploads the demo app's output; and a new requirement states the
  manual npm publish workflow, including the tarball digest check, the concurrency group
  and the version script the workflow calls.
- `real-systems`: two requirements. The `window.location` lint rule loses its exception,
  because the demo page module leaves the library package. And the scenario "The demo
  site's loader is on its own origin" reads `apps/demo/dist/`, because `dist-demo/` stops
  existing.

## Impact

**Depends on `make-nebulae-optional`.** That change adds the `./nebulae` subpath, and
this one writes the `exports` map that carries it. `add-nebulae` has already landed, as
commit `63184db`, archived as `2026-09-19-add-nebulae`. Taking the remaining three in the
order
`add-nebula-occlusion` → `make-nebulae-optional` → `publish-library-package` means no
file moves twice.

**What moves**

| From                       | To                                       |
| -------------------------- | ---------------------------------------- |
| `src/` less the demo files | `packages/galaxy-map/src/`               |
| `src/app/main.ts`          | `apps/demo/src/main.ts`                  |
| `src/app/multifaction*.ts` | `apps/demo/src/`                         |
| `src/app/demo-systems.test.ts` | `tests/demo-systems.test.ts`         |
| `THIRD_PARTY_NOTICES.md`   | `packages/galaxy-map/THIRD_PARTY_NOTICES.md` |
| `index.html`               | `apps/demo/index.html`                   |
| `demo-data/`               | `apps/demo/demo-data/`                   |
| `public/`                  | `apps/demo/public/`                      |
| `scripts/build-demo-systems.mjs` | `apps/demo/scripts/`               |
| `vite.config.lib.ts`       | `packages/galaxy-map/vite.config.ts`     |
| `vite.config.ts`           | `apps/demo/vite.config.ts`               |
| `tsconfig.build.json`      | `packages/galaxy-map/tsconfig.build.json` |
| `dist/`                    | `packages/galaxy-map/dist/`              |
| `dist-demo/`               | `apps/demo/dist/`                        |

**What changes without moving**: `pnpm-workspace.yaml`, the root `package.json`,
`eslint.config.js`, `vitest.config.ts`, `tsconfig.json`, `playwright.config.ts`,
`.gitignore`, `.prettierignore`, `.github/workflows/ci.yml`, `README.md`, `AGENTS.md`,
and these, which the reviewer of this proposal should not have to find:

- **`e2e/`** holds **22** relative reaches into `../src/`. Every one is repointed. The
  directory stays where it is, and the no-relative-reach rule this change adds is scoped
  to `apps/demo/src/`, so those reaches stay legal.
- **`tests/fixtures/`** is two things, and they break in opposite directions. It holds
  **JSON fixtures** that three library modules read by a relative path —
  `src/galaxy-model/model.test.ts`, `src/galaxy-model/detail.test.ts` and
  `src/scene-data/nebulae.test.ts` — and those three modules move, so each path changes
  depth. It also holds **eight `*.test.ts` files of its own**, which reach the other way:
  19 imports into `src/scene-data/` and `src/galaxy-model/`, and six imports of
  `scripts/build-demo-systems.mjs`, which moves with the demo.
- **`tests/region-views.ts` and `tests/region-views.test.ts`** hold six and seven reaches
  into `../src/`. Neither is caught by a grep of `e2e/`.
- **`tests/naming-tables.test.ts`** runs `pnpm exec vite build` with its working directory
  at the repository root, which after the move holds no Vite configuration and no page.
- **`.prettierignore`** holds eight root-anchored entries that stop matching: the two data
  files pinned by the SHA-256 of their bytes, and the six `demo-data/` files a script
  writes. A `pnpm format` run with those unrepointed fails two hash tests.
- **`tests/workflow.test.ts`** and **`tests/main-bundle.test.ts`** each hold an assertion
  that is false after the move. Design.md says what each becomes.
- **`scripts/build-demo-systems.mjs`** is the demo's, so it moves with the demo, and the
  `build:demo-data` script moves to the demo package and is delegated from the root. It
  also **imports `galaxy-model.json` from library source** by a relative path, and both
  ends of that path move. It is the one file outside `e2e/` and `tests/` that reaches the
  library that way. Six of the fixture tests import this script as a module, so a broken
  static import fails them at import time rather than only breaking the script.

**What is new**: `packages/galaxy-map/package.json`, `packages/galaxy-map/README.md`,
`LICENSE.md` at the root with a copy in the package, `apps/demo/package.json`, `.github/workflows/publish-npm.yml`, and the
packed-tarball test.

**Scale.** The restructure moves about 120 source files and changes no run-time
behaviour. The map still holds up to 10,000 systems against a galaxy of about 400 billion,
and the frame budget and the entry chunk bound are the ones `far-view-rendering` and
`library-package` already state. The published tarball is the library build plus three
text files; its unpacked size is dominated by the nebula art at 2,912,225 bytes. An
earlier draft of this proposal read 811,762 bytes, which `ceb2167` made stale when it
shrank the nebula volume index.

**Setup the maintainer must do, which no task can close.** Three things live outside the
repository:

1. An **npm Trusted Publisher** for `@elite-dangerous-almanac/galaxy-map`, pointing at
   this repository and at `publish-npm.yml`.
2. A **GitHub environment** named `npm`, which the publish job names.
3. The **npm organisation** `@elite-dangerous-almanac` must allow this package.

The workflow fails cleanly without them rather than publishing wrongly. The task list
names them so the first dispatch is not the place they are discovered.

**Risk: the first publish is not reversible.** An npm version cannot be republished, and
unpublishing is limited to 72 hours. The packed-tarball test and the digest check are
what stand between a wrong tarball and a permanent one.

**Paths that other specs name.** Three kinds, handled three ways.

1. `real-systems` names `src/app/main.ts` as the one file that may read
   `window.location`. That file leaves the library package, so the exception disappears
   rather than moves. This change carries the delta that says so.
2. `real-systems` also holds a scenario that names `dist-demo/`, in the requirement "The
   entry point shows a loading image while the map starts". `dist-demo/` stops existing,
   so that scenario takes a real delta in this change rather than a blanket sentence.
3. Every other spec writes a path as `src/...`, `demo-data/`, `public/` or a build
   output. `library-package` states once, as a requirement, how to read all four: a
   `src/...` path names a file of the library package, `demo-data/` and `public/` name
   directories of the demo app, and the two build outputs are
   `packages/galaxy-map/dist/` and `apps/demo/dist/`. One sentence covering four kinds of
   path is what keeps this change from rewriting nine specs that say nothing about the
   layout.
