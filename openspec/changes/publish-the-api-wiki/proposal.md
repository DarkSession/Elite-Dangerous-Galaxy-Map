## Why

The package publishes a public surface — five functions and 44 types from the main entry
point, and the `nebulae` variable from `./nebulae` — and the only reference for it is
[packages/galaxy-map/README.md](../../../packages/galaxy-map/README.md), 130 lines that
show five examples and name no type. A host that wants the members of `GalaxyMapOptions`,
the fields of `SystemDetails` or the reasons `addSystems` can reject a record has to read
the source. The repository's GitHub wiki holds one placeholder page, and nothing
writes to it.

The wiki is the right home for the reference: it takes markdown, it needs no build of its
own, and it carries a navigation sidebar. It stays right only if a machine writes it, so
the Pages publish that already runs on every push to `main` writes the wiki in the same
run.

**Non-goals.** This change does not move the README content out of the repository, does
not publish the wiki anywhere but the GitHub wiki of this repository, does not put the
reference on the Pages site, and does not document `GalaxyMapDebug`, which is the
renderer probe set the browser suite reads and is not exported from the entry points.

## What Changes

- **A new `docs/wiki/` directory**, beside the `docs/galaxy-density-model.md` the
  repository already holds, carries the prose pages: `Home.md` (Overview),
  `Getting-started.md`, `Testing-subpath.md` and one file per example under
  `docs/wiki/Examples/`. A person writes them, a reviewer reads them in the pull request,
  and the wiki is a read-only mirror.
- **A new root script, `pnpm docs:wiki`,** builds the whole wiki tree into the
  git-ignored `wiki-build/` at the repository root. It runs TypeDoc with
  `typedoc-plugin-markdown` over **two** entry points — the main one and `./nebulae` —
  then arranges the output into the wiki's directory layout and writes the sidebars. A
  developer runs the same script the workflow runs.
- **The generated reference covers the exported members** of the main entry point and of
  `./nebulae`, merged into one set of sections: Classes, Interfaces, Type Aliases,
  Variables and Functions. A section with no member is left out of the tree and out of
  the sidebar. `./testing` is **not** generated — it gets one hand-written page that
  states it carries no compatibility promise — because its exports are not the supported
  surface and must not appear in the five sections.
- **The sidebar is one `<details>` block per section**, and **the open section follows
  the page**: each section is a directory of the wiki with a `_Sidebar.md` of its own, in
  which that section alone carries `open`. A reader who opens Interfaces and then a page
  under it still sees Interfaces open. The wiki root sidebar carries every section
  closed.
- **`ci.yml` gains one job.** `publish-wiki` runs after `check`, on a push to `main`
  alone, and pushes `wiki-build/` to `Galaxy-Map.wiki.git` with `GITHUB_TOKEN` and
  `contents: write`. It commits nothing when the tree is unchanged. **The check job gains
  no step**: its `pnpm test` already builds the tree, because the new tests read it, so a
  doc build that breaks already fails a pull request at the third command.
- **New unit tests in `tests/`** read the repository and assert the wiki contract: every
  exported member has a page, every prose page is in the sidebar, each section directory
  has a sidebar that opens its own section, the example code blocks name exported members
  alone, and the workflow holds the job with the right permission and order.
- **Two new development dependencies**, `typedoc` and `typedoc-plugin-markdown`, both
  under the 7-day release hold. They are development dependencies of the workspace root
  and go into no published tarball.

## Capabilities

### New Capabilities

- `api-wiki`: what the GitHub wiki holds, how the page tree and the collapsible sidebar
  are built, which exported members must appear, and what a push to `main` publishes.

### Modified Capabilities

- `continuous-integration`: the workflow gains a second publish job, so the requirement
  that states the Pages publish has to say that each publish job holds its own write
  permission and its own concurrency group. The six commands of the check job do not
  change.

## Impact

- **New files**: `docs/wiki/` (the prose pages), `scripts/build-wiki.mjs` and its
  `.d.mts`, `typedoc.json`, `tests/wiki-pages.test.ts`.
- **Changed files**: `.github/workflows/ci.yml`, root `package.json` (the `docs:wiki`
  script and the two dependencies), `.gitignore` (`wiki-build/`), `tests/workflow.test.ts`
  (the new job), `README.md`, `AGENTS.md` and the project context of
  `openspec/config.yaml` (the wiki address, and `docs:wiki` in the list of root scripts,
  which becomes seven — the config block is injected into every later proposal, so a stale
  count there travels), `packages/galaxy-map/README.md` (a link to the wiki).
- **Dependencies**: `typedoc` and `typedoc-plugin-markdown`, development only.
- **Outside the repository, and no step here can create it**: the repository's wiki
  feature must be on and the wiki must hold one page, because a wiki that was never
  started has no git repository to clone. This is **already true** — the wiki is on and
  holds a `Home` page — so the change needs nothing new from a person, but the job still
  reports the case plainly, and `README.md` records it as it records the three npm
  prerequisites.
- **Unchanged**: the library build, the demo site build, the packed tarball, the npm
  publish workflow and the browser suite. The wiki carries no galaxy data and draws
  nothing; it is text, and the job that writes it runs no renderer.
