## Context

See proposal.md — Why.

Seven facts of the tree shape this design.

1. `src/` holds both trees. Five files are the demo page: `app/main.ts`,
   `app/multifaction.ts`, `app/multifaction-message.ts`, `app/multifaction.worker.ts`
   and `app/multifaction.test.ts`. A sixth, `app/demo-systems.test.ts`, reads the demo
   data and is a repository test rather than a demo module; see the decision below.
   Everything else under `src/` is library, including `app/datasets.ts`, which
   `create-map.ts` imports.
2. `src/render/global.ts` is the object the page puts on `window.__galaxyMap` for the
   browser tests. It sits in the renderer's directory, and `src/render/context.ts`
   **writes** it: `createRenderContext` records the unmasked renderer string and the
   error there. The demo page reads it. So it is library code that the page reaches, not
   demo code the library reaches.
3. **The demo reaches five library members the public surface does not carry**:
   `View` from `camera/view`, `galaxyMapGlobal` from `render/global`,
   `createFragmentWriter` from `app/url-view` (all three in `src/app/main.ts`), and
   `createSystemSet` and `createShapeSet` from `scene-data/` (in
   `src/app/demo-systems.test.ts`). A move with no other change would break every one.
   The decision below settles each.
4. `vite.config.lib.ts` marks `gl-matrix` and `@elite-dangerous-almanac/core` external
   and turns `publicDir` off. `vite.config.ts` sets the Pages base path and the two
   ports. The two configurations already have no setting in common except
   `assetsInclude`, the ES2022 target and `worker.format: 'es'`.
5. `playwright.config.ts` builds and serves the demo site on 4173 under the Pages base
   path, and `scripts/e2e.mjs` runs the suite in two passes. `e2e/` holds 22 relative
   reaches into `../src/`, which the move must repoint.
6. `tests/main-bundle.test.ts` runs the library build into a temporary directory and
   reads the chunks. `tests/demo-site-build.test.ts` reads the demo build. `tests/`
   belongs to the repository, not to either package. `tests/fixtures/` is two things:
   **eight `*.test.ts` files of its own**, which reach into library source and into the
   demo's build script, and **JSON fixtures** that three library modules read by a
   relative path. The two break in opposite directions.
7. Two assertions in `tests/` break on this change by design:
   `tests/workflow.test.ts` reads `scripts.build` for `vite.config.lib.ts` and
   `scripts['build:demo-site']` as exactly `vite build`, and
   `tests/main-bundle.test.ts` asserts `manifest.files` equals `['dist']` and the
   version is `0.4.0`. Each is a guard that names the old layout.

## Goals / Non-Goals

**Goals:**

- The library/demo boundary becomes a fact of resolution **for the demo's own modules**:
  a file under `apps/demo/src/` that reached a library internal fails to resolve, rather
  than passing the lint. Two named exceptions stay, and are exceptions on purpose:
  `tests/` and `e2e/` belong to the repository and reach package source by relative path,
  which is how they read a build and a chunk today. One more file reaches library source
  by a relative path and is not under either: `scripts/build-demo-systems.mjs` imports
  `galaxy-model.json` so it can place a generated system. It moves with the demo, its
  import is repointed in task 5.1c-i, and it is the reason the rule above is scoped to
  `apps/demo/src/` rather than to the demo app as a whole.
- The package can be published, and the first publish is boring: the tarball's contents
  are checked on every push, long before a version is chosen.
- Nothing the map draws changes. The pinned baseline image is the test of that.

**Non-Goals:**

- Moving `e2e/`, `tests/`, `scripts/`, `openspec/` or `docs/`. They belong to the
  repository. Splitting them per package would gain nothing and would move the browser
  suite away from the thing it tests, which is the demo site. Their **contents** still
  change: `e2e/` holds 22 relative reaches into `../src/`, `tests/fixtures/` is read by
  three library modules, and `scripts/build-demo-systems.mjs` is the demo's, so it moves
  with the demo. Repointing those paths is in scope.
- TypeScript project references. One root `tsconfig.json` still type-checks the whole
  tree in one pass, which is what `pnpm exec tsc --noEmit` does today.
- A changelog or release notes written by hand. The release job generates notes.

## Decisions

### `packages/galaxy-map/` and `apps/demo/`

**Chosen**: two directories, `packages/` for what publishes and `apps/` for what does
not, with `pnpm-workspace.yaml` naming `packages/*` and `apps/*`.

The convention is the one pnpm's own documentation uses, and it reads: anything under
`packages/` is a thing someone installs. With one package of each kind the two globs cost
nothing and the next package lands in the right place without a decision.

*Alternative: `packages/galaxy-map` and `packages/demo`.* Rejected. One glob, but
`packages/demo` reads as something that publishes, and it must not.

*Alternative: leave the demo at the root and make only the library a package.* Rejected.
The root would then hold `index.html`, `public/`, `demo-data/` and a `src/` that is the
demo's, beside `packages/`, and the root `package.json` would be both the workspace root
and the demo. The boundary would be no clearer than it is now.

### The demo resolves the library to its source

`apps/demo/vite.config.ts` carries **three** `resolve.alias` entries, in this order:

```
'@elite-dangerous-almanac/galaxy-map/nebulae'  -> packages/galaxy-map/src/nebulae/index.ts
'@elite-dangerous-almanac/galaxy-map/testing'  -> packages/galaxy-map/src/testing.ts
'@elite-dangerous-almanac/galaxy-map'          -> packages/galaxy-map/src/index.ts
```

The two subpath aliases come **first**, because a string alias matches when the importee
starts with the alias plus `/`. The bare name listed first would swallow both, and
`@elite-dangerous-almanac/galaxy-map/testing` would resolve to
`packages/galaxy-map/src/index.ts/testing`.

The demo uses all three. `src/app/main.ts` imports `galaxyMapGlobal`, which task 1.3 puts
behind `./testing`, and task 4.6 forbids `apps/demo/src/` from reaching the library by a
relative path. `./testing` is also the path the hardware-rendering assertion runs on:
`src/render/context.ts` writes the unmasked renderer string into that object and the
browser suite reads it to fail a software fallback. An alias table that omits it breaks
the assertion this design argues for.

The demo still declares `workspace:*` in its `package.json` and still imports by the
package name, so the dependency is real and the import graph is honest. The alias only
decides which file the name resolves to.

*Alternative: a `development` condition in the package's `exports`.* Vite reads
`development` on the dev server and not in a build, so `pnpm build:demo-site` would need
the library built first. The check job and the browser suite both run that build, so it
would add a build step to both.

*Alternative: let the demo resolve through `exports` to `dist/`.* Rejected: every dev
server start and every browser suite run would need a library build first, and a stale
`dist/` would give a demo that does not match the source in front of the developer.

The cost is that the demo never exercises the `exports` map. The bundle tests
`make-nebulae-optional` adds do exercise it, against the built package. The spec states
that both are needed.

### The five internal reaches, one decision each

The demo cannot keep reaching into the library once the name resolves through a package.
Each reach is settled here rather than left to the implementation.

| Reach | Where | Settled as |
| ----- | ----- | ---------- |
| `View` | `main.ts` | Use `MapView`, which the entry point already exports |
| `createFragmentWriter` | `main.ts` | Export it and its two types from the entry point |
| `galaxyMapGlobal` | `main.ts` | A third entry point, `./testing` |
| `createSystemSet` | `demo-systems.test.ts` | The test moves to `tests/` |
| `createShapeSet` | `demo-systems.test.ts` | The test moves to `tests/` |

**`View` becomes `MapView`.** `src/camera/view.ts` declares `View` and
`src/app/create-map.ts` declares `MapView`, and the two are structurally identical:
`cursor`, `distance`, `yaw` and `pitch`. `MapView` is already exported. The demo page
takes it and nothing else changes, because TypeScript matches them by shape.

**`createFragmentWriter` joins the public surface.** It is already written as a host
helper: it takes a `write` callback so the library never touches `window.location`, and
its own comment says so. `encodeView`, which it calls, is exported already. The entry
point gains `createFragmentWriter` and the types `FragmentWriter` and
`FragmentWriterOptions`, and the writer's `view` parameter takes `MapView`.

*Alternative: move the writer into `apps/demo/src/`.* Rejected. It would take
`FRAGMENT_THROTTLE_MS` and half of `url-view.test.ts` with it, and it would leave the
library exporting `encodeView` with nothing that shows a host what to do with it.

**`galaxyMapGlobal` stays library-side, behind `./testing`.** The object is written by
`src/render/context.ts`, which records the unmasked renderer string and the error text
there. That is the path the project's hardware-rendering rule depends on: a run that
fell back to software must fail the suite, and it fails because the browser test reads
that string. Moving `global.ts` into the demo would mean `context.ts` stops writing it,
or writes it through a callback the demo supplies, and either puts the software-fallback
assertion on a path a mistake can quietly remove.

So the package gains a third entry point, `./testing`, exporting `galaxyMapGlobal`,
`GalaxyMapGlobal` and `TestView`. The spec states plainly that `./testing` is **not** the
supported surface: it is the probe set the browser tests read, it has no compatibility
promise, and a host has no reason to import it. The main entry point does not re-export
it, so nothing in a host's build reaches it by accident.

*Alternative: move `global.ts` to `apps/demo/src/`.* Rejected for the reason above.

*Alternative: leave it a deep import that the demo alias resolves.* Rejected: the demo
resolves to source, so the deep import would work on the dev server and in the demo
build, and fail for anyone who consumed the built package the same way. A boundary that
holds only for the demo is not a boundary.

**`demo-systems.test.ts` moves to `tests/`.** It reads five files of `demo-data/` and
checks that `createSystemSet` and `createShapeSet` accept them. It is a repository test
of the demo's data, not a module of either package, and `tests/` is where such tests
already live and already reach package source by relative path. Nothing about it needs
the public surface widened.

### `dist-demo/` disappears

The demo writes `apps/demo/dist/` and the library writes `packages/galaxy-map/dist/`.
`dist-demo/` existed because two builds in one package shared a root. They no longer do.

`.gitignore` needs no new pattern: its `dist/` entry holds no internal slash, so it
already matches at any depth. The anchored `dist/**` and `dist-demo/**` globs in the
`ignores` list of `eslint.config.js` do need the new paths. `tests/demo-site-build.test.ts`
and the Pages job take the new path. `playwright.config.ts` does not: it holds no `dist`
path and calls the root scripts `pnpm build:demo-site && pnpm preview` by name, and task
2.2 keeps those names.

### One root Vitest run, one root tsconfig, one root ESLint

The three tools stay at the root and take the new paths.

- `vitest.config.ts` includes `packages/*/src/**/*.test.ts`, `apps/*/src/**/*.test.ts`
  and `tests/**/*.test.ts`. One `pnpm test` still runs everything, which is what the CI
  spec names.
- `tsconfig.json` includes `packages/*/src`, `apps/*/src`, `e2e`, `tests` and the config
  files. Its `include` names `*.config.ts` at the root, which stops matching once the two
  Vite configurations move, so their new paths join the list.

  **It also carries `compilerOptions.paths`, mapping all three package specifiers to the
  library's source.** This is the TypeScript half of the alias table above, and it needs
  settling for the same reason. `moduleResolution` is `bundler`, so TypeScript resolves
  `@elite-dangerous-almanac/galaxy-map` through the package's `exports` to
  `dist/types/index.d.ts`, which does not exist on a fresh checkout. The check job's order
  is lint, **type check**, `pnpm test`, **library build** — the type check runs two steps
  before the thing it would need — and `pnpm build` has the same order inside it
  (`tsc --noEmit &&` then the build). `paths` removes the dependency rather than
  reordering the job.

  *Alternative: a `types` condition in `exports` pointing at source, swapped by
  `publishConfig` for the tarball.* Rejected: it makes the published `exports` differ from
  the one the repository tests, which is the thing the packed-tarball check exists to stop. `packages/galaxy-map/tsconfig.build.json` extends it and emits the declarations
  with `rootDir` at that package's `src`.
- `eslint.config.js` keeps its **three** rule-carrying blocks, which hold four restricted
  rules between them, and takes the new globs. The
  `window.location` block loses its `ignores`, because the file it excepted is no longer
  matched by the block's `files` pattern.

*Alternative: a `package.json` and a config per package.* Rejected as churn without gain.
Three tools times two packages is six configuration files to keep in step, for a
repository one person runs `pnpm test` in.

### Root scripts keep their names

`pnpm dev`, `pnpm build`, `pnpm build:demo-site`, `pnpm build:demo-data`, `pnpm preview`,
`pnpm test`, `pnpm test:e2e`, `pnpm lint` and `pnpm format` stay — all nine of them.
`README.md`, `AGENTS.md`, the CI workflow and four specs name these strings, and keeping
them means the restructure does not reach any of those sentences.

**They do not all delegate.** Five run inside a package and delegate with `pnpm --filter`:
`dev`, `build`, `build:demo-site`, `build:demo-data` and `preview`. Four stay at the root
and run there: `test`, `test:e2e`, `lint` and `format`. The reason is that `tests/`, `e2e/`
and `scripts/` belong to no package, so a delegated `pnpm test` would drop every root test
file and a delegated `pnpm lint` would leave `e2e/`, `tests/`, `scripts/` and the root
configuration files unchecked. `pnpm test:e2e` is `node scripts/e2e.mjs` at the root. This
follows from "One root Vitest run, one root tsconfig, one root ESLint" above.

Two are new, and both are **root** scripts that run at the root: `pnpm audit`, which the
publish workflow runs over the workspace, and `pnpm test:package`, which reads the packed
file list. `test:package` has to be a root script because tasks 8.2, 9.5 and 12.1 all call
`pnpm test:package` from the root.

### The packed file list is read with `npm pack --dry-run --json`

`npm pack --dry-run` reports the file list without writing a tarball, so the check runs
on every push at no cost. The test asserts the list holds `README.md`, `LICENSE.md`,
`THIRD_PARTY_NOTICES.md` and `package.json`, and that every other entry is under the
build output.

Reading `files` from `package.json` instead would test the intent and not the result:
`files` interacts with `.npmignore`, with `.gitignore` and with npm's own always-included
and never-included lists, and the result is what ships.

`npm` and not `pnpm pack` here, because `npm pack --dry-run --json` is the form the
reference workflow uses and the form that prints a machine-readable list.

### `THIRD_PARTY_NOTICES.md` splits; it is not copied

The file moves to `packages/galaxy-map/THIRD_PARTY_NOTICES.md` with `git mv`, and the
package's `files` list carries it. The sections that describe what the package does not
ship then move on to a second file, `THIRD_PARTY_NOTICES.md` at the repository root: the
six demo data sets, the committed test extracts, the loading picture and the design
mockup.

**A split is not a copy.** The argument against two files is drift, and drift needs the
same statement in two places. Here each source is in one file alone, so there is one
place to edit when a source changes. The Frontier terms are the one statement in both,
and that is deliberate: the package ships game art and the demo site draws game data, and
a reader of either file must see the non-commercial terms without opening the other.

The split is what the tarball asks for. The package's file ships to every host that
installs the package, and ten of its seventeen sections described files no host receives.
A notices file that names a data set the tarball leaves out tells the reader they hold
something they do not. `tests/third-party-notices.test.ts` reads both files and fails on a
demo data set in the package file.

The root file also fixes a link `README.md` already carries: the README points at
`THIRD_PARTY_NOTICES.md` beside it, which after the move was no file.

### Two existing assertions change, and that is the point

`tests/workflow.test.ts` asserts `scripts.build` contains `vite.config.lib.ts` and that
`scripts['build:demo-site']` is exactly `vite build`. Both are false after the move: the
root scripts delegate with `pnpm --filter`. The test is rewritten to assert that the root
script delegates and that the library package's own `build` names its Vite configuration,
which is the same guard one level down.

`tests/main-bundle.test.ts` asserts `manifest.files` equals `['dist']` and that the
version is `0.4.0`, against the root `package.json`. After the move it reads the library
package's manifest, `files` holds four entries, and the version is `0.6.0`. The packed
tarball test of this change is the stronger guard and replaces the `files` assertion's
intent.

A third assertion is in the same class, and it is the one the section title is most true
of. `tests/workflow.test.ts` asserts the repository holds exactly **one** workflow. This
change adds a second on purpose. The guard is not deleted: it becomes an assertion that the
repository holds exactly `ci.yml` and `publish-npm.yml`, so a third workflow still has to be
argued for, and that the two sort in that order, which the file's read of `names[0]` already
depends on without saying so.

Neither is loosened. Each moves to the file it now describes.

### The licence sits at the repository root, and the package carries a copy

**Chosen**: `LICENSE.md` at the repository root, and the same file name inside
`packages/galaxy-map/`, written by a **`prepack` script** rather than committed twice.

The mechanism is `prepack` and not `pnpm build`. `npm pack --dry-run` runs `prepack`, so
the copy exists whenever the tarball is read, including during `pnpm test:package`. A copy
made by `pnpm build` would not exist during `pnpm test`, which runs before the build, and
the scenario that reads the packed list would fail on a fresh checkout.

The repository holds more than the package — `e2e/`, `tests/`, `scripts/`, the demo app —
and GitHub reads the root to show the terms. A repository with no root licence states no
terms for any of that. npm reads the package directory, and a tarball with no licence
states no terms for what a host installs. Both readers need a file, and they are different
readers.

This is the opposite call from `THIRD_PARTY_NOTICES.md`, and the reason is that the two
files fail differently. The notices are a list that grows as data sources are added, so
two copies of one section drift and the drift is a licence fault. The notices are split
and not copied for that reason. A licence text does not change; a copy of it cannot drift
in any way that matters, and the two readers each genuinely need one. The `prepack` script
copies the root file, so there is still **one source** and no second file to edit.

The copy is not committed, so a test reads it from the `npm pack --dry-run` file list
rather than from the package directory. `pnpm test` runs before the build and before the
pack, so a directory read would fail on a fresh checkout and in the check job.

*Alternative: the root file alone.* Rejected: the tarball would carry no terms, and
`package.json` naming `SEE LICENSE IN LICENSE.md` would point at a file that is not there.

*Alternative: the package file alone.* Rejected: the repository would state no terms, and
GitHub's licence reading is how most people meet them.

### The publish workflow follows the reference, adapted for a workspace

The shape is the one `@elite-dangerous-almanac/core` already uses: dispatch, branch
check, version resolution against the registry, the checks, pack, an artifact, an OIDC
publish job and a release job.

Two adaptations:

- **The install runs at the workspace root**, because one lockfile serves both packages.
  The steps that read or write the package's `package.json`, and `npm pack`, run with
  their working directory at `packages/galaxy-map`.
- **`pnpm run check` becomes the four root scripts**, because this repository has no
  single `check` script. The step list stays in the same order.

The npm client versions the reference pins are its own. This workflow pins its own and
records them in a comment, because Trusted Publishing needs a client that supports it and
a floating client is a supply-chain hole the same size as a floating action tag.

**The version resolution leaves the YAML.** In the reference it is a shell block inside a
step, and a shell block inside YAML is checkable only by reading the string. It becomes
`scripts/next-version.mjs`, which takes the `major.minor` of the package and the list of
published versions and prints one above the highest patch of that line. A unit test then covers what the step
actually decides: no published version, a gap in the patch series, a published version
above the newest local one, and a `major.minor` that has no release yet. The workflow
step calls the script.

This is the difference between a workflow the tests assert the **shape** of — the
trigger, the job graph, the pinned actions, the step order — and one whose **decision**
is also covered. The tarball digest check and the concurrency group stay shape
assertions, and the spec names them as scenarios, because what they guard is that the
lines are present and correct, not that a computation is right.

### The licence

`LICENSE.md` carries non-commercial terms, which the maintainer chose. The implementation
SHALL use a **published** non-commercial licence rather than text written for this
project: a ready-made licence has been read by lawyers, is recognised by tools, and says
what a reader already expects it to say. PolyForm Noncommercial 1.0.0 is the obvious
candidate and carries an SPDX identifier.

**The licence file also says what it does not cover.** A section below the published text
names `THIRD_PARTY_NOTICES.md` and Frontier Developments. The published text is about the
licensor's own software, and the tarball carries other holders' data and art beside it. A
reader who opens `LICENSE.md` alone would otherwise take it for the terms of everything in
the package. The section is informational and adds no condition, so the SPDX identifier
still describes the terms.

`license` in `package.json` takes the SPDX identifier where npm accepts it, and
`SEE LICENSE IN LICENSE.md` otherwise. The task list checks which, rather than assuming.

**The maintainer approves the final text before the first publish.** This is their call,
not the implementation's, and it is the one step of this change that a person signs off.

## Risks / Trade-offs

**A restructure that changes a pixel** → The pinned baseline image and the whole browser
suite must pass unchanged. The task list runs them before and after the move and compares.
No look constant, no shader and no default is touched.

**The first publish cannot be undone** → An npm version is permanent after 72 hours, and
a published version can never be reused. Three checks stand in front of it: the packed
file list on every push, the tarball digest between the pack job and the publish job, and
the version read back out of the packed `package.json`. The dispatch-only trigger means
no accident publishes.

**The three external settings are not in the repository** → The npm Trusted Publisher,
the GitHub environment and the organisation's permission. The workflow fails cleanly
without them, but it fails at the last step, after the checks have run. `README.md`
records them and the task list names them as the maintainer's to do.

**`pnpm --filter` and the demo's name** → The demo package needs a name to filter on.
`@elite-dangerous-almanac/galaxy-map-demo`, private, is the least surprising, and the
filter reads `pnpm --filter ...-demo`. A short name like `demo` would be ambiguous the
moment a second app appears.

**Git history follows the files or does not** → `git mv` keeps the rename detectable; a
delete-and-add does not. The task list uses `git mv` for every move, and one commit for
the moves with no content change in it, so a reviewer can read the move and the edits
apart.

**The lockfile changes shape** → A pnpm workspace lockfile has an `importers` section per
package. The lockfile must be regenerated and committed, and the 7-day hold means the
regeneration must resolve to the versions already pinned. `pnpm install` with no
`--frozen-lockfile` after the restructure, then a check that no dependency version moved,
is the task.

## Migration Plan

The move is one branch, in this order, so each step leaves a tree that builds:

1. `pnpm-workspace.yaml`, the root `package.json` and the two package manifests, with no
   file moved yet.
2. `git mv` the library tree, then the demo tree. One commit, no content change.
3. The configurations: Vite, TypeScript, ESLint, Vitest, Playwright, Prettier,
   `.gitignore`.
4. The tests that read paths, and the CI workflow.
5. The package metadata, the licence, the package README and the packed-tarball test.
6. The publish workflow.

Rollback before the first publish is a branch that is not merged. After the first
publish, the package name is taken and the version is spent; rollback is a new patch,
which is why the checks come first.

## Open Questions

None that change the specs, the approach or the task list. The exact non-commercial
licence text is the maintainer's to approve, and the task list holds that as a step with
a named owner rather than a question.
