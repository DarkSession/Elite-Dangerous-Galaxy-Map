## Context

See [proposal.md](proposal.md) — Why. The requirements are in
[specs/api-wiki/spec.md](specs/api-wiki/spec.md) and
[specs/continuous-integration/spec.md](specs/continuous-integration/spec.md).

Four facts about GitHub wikis shape everything below. Each one was read before this design
was written, and each one is a thing the implementation cannot change.

1. **A wiki is a git repository**, at `<owner>/<repo>.wiki.git`. A push to it changes the
   wiki. The workflow's own `GITHUB_TOKEN` writes it when the job holds
   `contents: write`; no personal access token is needed for a wiki on the same
   repository as the workflow.
2. **A wiki that was never started has no git repository.** The clone fails until a person
   turns the wiki on and saves one page. This repository's wiki is already on and holds a
   `Home` page, so the clone works today; the job still reports the case plainly, because
   a fork will meet it.
3. **Folders in the wiki repository do not appear in a page's URL.** A file at
   `Interfaces/GalaxyMap.md` is served at `/wiki/GalaxyMap`. **Page names are therefore
   global and must be unique**, whatever folder holds the file.
4. **`_Sidebar.md` is resolved per folder, and a folder with none inherits its parent's.**
   This is the only mechanism a wiki gives for a sidebar that differs between pages, and it
   is what makes the open section follow the page.

Sources:
[GitHub wiki sidebars](https://roland.codes/blog/github-wiki-sidebars/),
[GitHub wiki folder structure](https://github.com/practicalseries/GitHub-Wiki-Design-and-Implementation/blob/master/03-0000/03%20A%20Wiki%20folder%20structure.md),
[Controlling permissions for GITHUB_TOKEN](https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/controlling-permissions-for-github_token),
[Organizing information with collapsed sections](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/organizing-information-with-collapsed-sections).

## Goals / Non-Goals

**Goals:**

- One command builds the whole tree, and the workflow runs that command. The pipeline
  holds no generation logic of its own.
- The reference comes from the source, so it cannot drift.
- The sidebar state follows the page with no JavaScript, which a wiki does not run.

**Non-Goals:**

- No wiki theme, no CSS and no custom rendering. A wiki takes markdown and a small set of
  HTML tags, and the design stays inside it.
- No versioned wiki. The wiki shows `main`. A reader who wants the reference for a
  released version reads the types in the published package.
- No rewrite of the two READMEs. They stay the front pages and gain a link to the wiki.
  The samples therefore exist twice, which is a cost this design takes on purpose and
  states under Risks.

## Decisions

### Decision 1: TypeDoc with `typedoc-plugin-markdown` writes the reference

**Why.** It reads the TypeScript source, follows the entry points it is given, and emits
one markdown file per member in exactly the five groups the reader asked for: `classes/`,
`interfaces/`, `type-aliases/`, `variables/` and `functions/`. It resolves the
documentation comments the source already holds.

**Two entry points, not three.** TypeDoc reads `src/index.ts` and `src/nebulae/index.ts`.
It does **not** read `src/testing.ts`: generating from it would put `galaxyMapGlobal`,
`GalaxyMapGlobal` and `TestView` into Variables, Interfaces and Type Aliases, which
`api-wiki` forbids — they are not the supported surface. That subpath gets one hand-written
page instead.

**The renderer probe is tagged, not only left out of the page list.** The proposal's
non-goal says the change does not document `GalaxyMapDebug`, and the spec says it SHALL
NOT appear. Leaving it out of the entry points is not enough: `GalaxyMap.debug` is a
member of a documented interface, so the handle's page carried
`readonly debug: GalaxyMapDebug` with no link, because the type has no page. The member
therefore carries an `@internal` tag in
[packages/galaxy-map/src/app/create-map.ts](../../../packages/galaxy-map/src/app/create-map.ts),
and the configuration sets **`excludeInternal: true`**. This is the one library source
edit of the change.

`stripInternal` is set in **no** tsconfig of the workspace, and none is added: the emitted
declaration keeps `debug`, so the browser suite, which reads the probe in
`e2e/navigation.spec.ts` and `e2e/info-panel.spec.ts`, still compiles. The tag changes
what TypeDoc reads and nothing the build emits. `packages/galaxy-map/src/` holds no other
`@internal` tag, so the option hides this one member.

A test reads the wide sense: the string `GalaxyMapDebug` is in no file of the built tree,
not merely in no page name. The narrow reading passed before the fix while the page still
carried the member.

**Types that are referenced but not exported.** The exported `nebulae` value is typed
`NebulaSource<NebulaSet, NebulaVolumeSet>`, and neither `NebulaSet` nor `NebulaVolumeSet`
is exported from an entry point. TypeDoc reports each as referenced but not documented.
The configuration SHALL turn that validation warning off rather than let it fail the build:
the two names are internal, and the spec asks for a link to a page only where the page
exists. The first `pnpm docs:wiki` run must not be where this is discovered.

**Versions.** `typedoc@0.28.20` names `6.0.x` in its TypeScript peer range and the
workspace runs TypeScript 6.0.3, so the pair is supported. `typedoc-plugin-markdown`
requires `typedoc@0.28.x`. Both are development dependencies of the **workspace root**, not
of the library package, so neither reaches the published tarball —
`tests/packed-tarball.test.ts` stays as it is.

**The 7-day hold applies.** `typedoc-plugin-markdown@4.13.1` was published on 2026-09-18
and is inside the hold, so `pnpm add` resolves `4.13.0` (2026-08-25). That is the rule
working, and the resolved version is not to be forced forward.

**Alternatives.** `api-extractor` emits one large `.api.md` report, which is a review
artifact and not a page tree. A generator of our own over the `.d.ts` output would be a
compiler-API project to maintain for no gain. Hand-written reference pages were rejected
outright: they are what drifts.

### Decision 2: The tree mirrors the wiki's folders, and one script arranges it

`scripts/build-wiki.mjs` runs in three passes and writes `wiki-build/` at the repository
root:

1. **Generate.** Run TypeDoc over the two entry modules into a scratch directory.
2. **Arrange.** Move each group directory to its wiki name, drop an empty one, copy the
   prose pages from `docs/wiki/`, and rewrite every link (below).
3. **Write the sidebars.** One `_Sidebar.md` at the root and one in each section folder.

**The shape TypeDoc writes for two entry points is read before the arrange pass is
written, not assumed.** With more than one entry point TypeDoc builds a project of modules,
and the markdown plugin can nest the output per module — `<module>/interfaces/<name>.md`
rather than `interfaces/<name>.md`. The spec asks for one merged set of sections, so the
arrange pass either reads a flat tree, if a plugin option gives one, or merges the modules
itself. Task 2.3 runs TypeDoc first and records the directory listing it actually wrote;
the arrange pass is written against that listing. A member of one module and a member of
the other land in the same section folder either way, which is what the reader sees.

**The listing TypeDoc 0.28.20 with `typedoc-plugin-markdown` 4.13.0 writes** (task 2.3,
read on 2026-09-21). It nests per module, so the arrange pass merges the two modules
itself:

```
README.md                                 the module index, dropped
index/README.md                           the module index, dropped
index/functions/         5 pages          createFragmentWriter createGalaxyMap
                                          decodeGrid decodeView encodeView
index/interfaces/       38 pages          AddReport ... SystemRecordInput
index/type-aliases/      6 pages          BrowseBounds FlightOutcome HudMapOption
                                          LinePoint ShapeKind SystemIconInput
nebulae/README.md                         the module index, dropped
nebulae/variables/       1 page           nebulae
```

That is 50 files, of which 3 are module indexes and 47 are member pages: the 5 values and
44 types of the main entry point, and the one value of `./nebulae`. There is **no
`classes/` directory**, which is the empty-section case the spec names.

Two facts of the listing the arrange pass rests on:

1. **The group directory is the second path part**, under the module name. The pass walks
   `<module>/<group>/<file>.md`, maps `<group>` to its wiki name, and fails on a group the
   map does not hold.
2. **Every link of a generated page ends in `.md` and carries no anchor.** The forms are
   `Name.md` inside one group, `../<group>/Name.md` across groups of one module, and
   `../../index/interfaces/Name.md` across modules. The rewrite of Decision 3 therefore
   drops the directory and the extension, and leaves a target that does not end in `.md`
   alone.

**Each generated page names the specifier it is imported from.** The spec allows one
merged set of sections because "which module exports it is on the member's own page", and
with `hidePageHeader` and `hideBreadcrumbs` both on, nothing on the page said so. The
arrange pass already reads the module name, so it writes one line under the heading:

```
# Variable: nebulae

Imported from `@elite-dangerous-almanac/galaxy-map/nebulae`.
```

The page header is **not** turned back on to get this. It names a folder tree the wiki
does not have, and the breadcrumbs link to module index pages the build drops. A map from
module name to specifier is two entries, and the pass fails on a module it does not know,
as it fails on a group it does not know.

**`useCodeBlocks` stays off**, which is TypeDoc's default. With it on, a property renders
as a `ts` code block and its type is plain text, so `rejected: CategoryReject[]` links to
nothing. With it off the type is a link, which is what the spec asks of a page that names
another exported member.

```
wiki-build/
  Home.md                     <- docs/wiki/Home.md            (the Overview)
  Getting-started.md          <- docs/wiki/Getting-started.md
  Testing-subpath.md          <- docs/wiki/Testing-subpath.md   (hand-written)
  _Sidebar.md                 every section closed
  Examples/
    _Sidebar.md               Examples open
    <one file per docs/wiki/Examples/*.md>
  Interfaces/
    _Sidebar.md               Interfaces open
    GalaxyMap.md  GalaxyMapOptions.md  ...
  Type-Aliases/  Variables/  Functions/   the same shape
```

`Home.md` is the wiki's landing page and the name is GitHub's, not a choice. The script
writes the whole tree from nothing on each run, so a page that is no longer generated
cannot survive in it.

**Every sidebar holds the same entries**, and one `open` attribute is the whole
difference between them. The root copy, which a reader sees on Home, Getting started and
the testing subpath page, holds every block closed. The entries and their order are fixed:
Overview, Getting started, The testing subpath, then Examples, Classes, Interfaces, Type
Aliases, Variables, Functions — the reader's order, with an empty section dropped. Building
the entry list once and writing it n+1 times is what keeps "every page is in every sidebar"
true by construction rather than by care.

```html
<details open>
  <summary><b>Interfaces</b></summary>

- [GalaxyMap](GalaxyMap)
- [GalaxyMapOptions](GalaxyMapOptions)

</details>
```

The blank line after `<summary>` and before `</details>` is required: without it GitHub
does not render the markdown inside the block.

**Alternative rejected.** One sidebar at the root with a link that opens a section cannot
work: a wiki runs no JavaScript and takes no CSS, and `details` state is per page load.
Per-folder sidebars are the only mechanism, which is why the tree has folders at all.

### Decision 3: Every link between pages is the flat page name

Because folders do not appear in a page URL, the generated links TypeDoc writes —
`../interfaces/GalaxyMap.md` — do not resolve. The arrange pass rewrites every one to the
bare page name: `[GalaxyMap](GalaxyMap)`. Every page of the wiki is served from the same
URL depth, so the same text resolves from any page, and from a sidebar in any folder.

The rewrite is the one transform with a real failure mode — a link that points at nothing
looks the same as one that works until a reader clicks it — so a test walks every link of
the built tree and fails on a target the tree does not hold.

**Page names must be unique across the whole wiki**, and nothing gives that for free. One
module cannot export a name twice, but the two entry modules are separate and each may
export a name the other does, and the merge into one flat section set turns that into two
files of one name. Today it cannot happen — `./nebulae` exports one value — but the build
does not rest on that: **the arrange pass fails on a page name it has already written**,
and names both sources. The prose pages are named to stay clear of the members: `Home`,
`Getting-started`, `Testing-subpath` and the example pages, which carry a name no member
has.

**Alternative rejected.** Absolute paths (`/Elite-Dangerous-Almanac/Galaxy-Map/wiki/...`)
also resolve, but they write the owner and repository name into every page, and a fork's
wiki would link to this repository.

### Decision 4: The publish is a job of `ci.yml`, not a workflow of its own

The wiki has to be published from the same commit the checks passed on, and it must not be
published when they failed. A job with `needs: check` states that; a second workflow on
`workflow_run` restates it badly. The job builds the tree itself, because a job downloads
no directory from another one without an artifact upload, and the build is a minute.

```yaml
publish-wiki:
  needs: check
  if: github.event_name == 'push' && github.ref == 'refs/heads/main'
  permissions:
    contents: write # required to push to the <repo>.wiki.git repository
  concurrency:
    group: github-wiki-publish
    cancel-in-progress: false
```

`contents: write` is on the **job**, not the workflow. The workflow keeps
`permissions: contents: read`, so the check job and the Pages job are unchanged, and the
Pages job's scenario — `pages: write`, `id-token: write` and no other write — still holds.

The job's own steps: clone the wiki with the token in the remote URL, empty the working
tree except `.git`, copy `wiki-build/`, `git add -A`, and **commit only when
`git diff --cached --quiet` reports a change**. The empty-then-copy is what removes a page
that is no longer generated; `git add -A` records the removal.

A clone that fails because the wiki was never started is caught and reported as the
message the spec names, not as a bare git error.

### Decision 5: Determinism is enforced by a test, not assumed

TypeDoc writes no clock into a page, but a version string, an absolute path or a source
link would each make every run a change and fill the wiki history with noise. **The source
link is the one that bites**: TypeDoc writes a "Defined in" link on every member page, and
its `gitRevision` default is the commit the build runs on, so every push to `main` would
rewrite every generated page and the "unchanged tree writes no commit" rule could never
fire. The configuration therefore sets **`disableSources: true`**, and the arrange pass
strips the plugin's page header and breadcrumbs.

A test that builds twice inside one run cannot catch that, because both builds sit on one
commit. The determinism case is still worth having for the rest, and a second case asserts
that no generated page holds a 40-character hexadecimal string, which is what a commit SHA
in a page looks like.

**The unit suite builds the tree twice and no more**: once for the page, sidebar and link
cases to read, and once more to compare against it. The second build is the determinism
check, not a third run.

**The check job of `ci.yml` gains no step.** `pnpm test` is its third command and it builds
the tree, so a doc build that breaks already fails the pull request, two steps before the
library build. A seventh command would run TypeDoc again for an answer the job already
has.

### Decision 6: The prose pages are files, and their code is checked

`docs/wiki/` holds `Home.md`, `Getting-started.md`, `Testing-subpath.md` and
`Examples/*.md`. The examples start from the seven samples `README.md` already holds —
systems on the map, a record with details, the HUD, the camera, spheres and lines, a
dataset catalog and the nebulae — and the system icons sample of the package README, which
makes eight, one page each.

The check on them is cheap and catches the failure that matters most:
`tests/wiki-pages.test.ts` reads every
`import { ... } from '@elite-dangerous-almanac/galaxy-map'` of every example and fails on a
name the entry points do not export. A full type check of every block would need each one
to be a compiled file, which is a build for a problem that a list comparison mostly
catches.

**What the check does not catch** is stated plainly, because the samples now live in two
places — the READMEs and `docs/wiki/Examples/` — and a reader of one will not see a change
made to the other. A renamed option of `GalaxyMapOptions`, a changed argument or a changed
return value passes the import check in both copies. The Risks section names the two ways
out of this, and neither is taken in this change.

## Risks / Trade-offs

- **The samples live in two places.** `README.md`, `packages/galaxy-map/README.md` and
  `docs/wiki/Examples/` all carry them, and the import check of Decision 6 does not see a
  renamed option or a changed signature drift between the copies. → This is accepted for
  this change, because the alternative is to cut the samples out of the two READMEs, and
  what a README shows is the owner's call, not this change's. The two ways out, for a later
  change: make `docs/wiki/Examples/` the one source and leave each README one sample and a
  link, or generate the example pages from the README sections. The wiki link that task 7.2
  adds is what makes the first of those cheap later.
- **The per-folder sidebar was read from a blog post and a wiki, not from GitHub's own
  documentation.** GitHub documents `_Sidebar` but not the per-folder resolution. →
  **Closed by measurement on 2026-09-21** (tasks 1.1 to 1.4). A scratch tree went to the
  live wiki — `Home.md` and a root `_Sidebar.md` with two closed blocks, `A/Page-A.md`
  with `A/_Sidebar.md` that opens block A, and `B/Page-B.md` with `B/_Sidebar.md` that
  opens block B — and the three rendered pages were read back:

  | Page opened | Block A | Block B |
  | ----------- | ------- | ------- |
  | `/wiki/Page-A` | `<details open>` | `<details>` |
  | `/wiki/Page-B` | `<details>` | `<details open>` |
  | `/wiki` (Home) | `<details>` | `<details>` |

  The mechanism holds, so the fallback is not needed. The same push closed Decision 3:
  the page URLs are flat — `A/Page-A.md` is served at `/wiki/Page-A`, with no folder —
  and a link written `[Page-B](Page-B)` resolves from a page in a folder, from the other
  folder and from the root, because GitHub rewrites the relative address per page depth.
  All six targets answered 200. The wiki was then reset to its one `Home` page. The
  sidebar bytes this build writes were checked once more through GitHub's own markdown
  renderer: exactly one `open`, on the section of the folder, and all 61 links render as
  lists.
- **A wiki has to be turned on before it can be cloned.** This one already is, and holds a
  `Home` page. → `README.md` records the prerequisite beside the npm ones, and the job
  fails with a message that names the setting rather than a git error, for a fork that
  meets it.
- **TypeDoc's output shape can change between minor versions**, which would move the group
  directory names the arrange pass expects. → The pass fails on a directory it does not
  know rather than writing a tree with a section missing, and the version is in
  `pnpm-lock.yaml`.
- **Two more development dependencies, and TypeDoc is not small.** They are root
  development dependencies, so they reach no published package, but `pnpm test` now runs
  TypeDoc twice. → The tree is under 100 pages and the run is seconds, and the two builds
  are what the determinism check needs. If the suite slows enough to notice, the wiki cases
  move behind a project of their own before the build is made lazier.
- **The wiki holds `main`, and a reader on the released version may read a member that is
  not in their copy.** → The Overview page says which branch the wiki is built from and
  links to the released versions on npm.

## Migration Plan

There is nothing to migrate: the wiki holds one placeholder page today, and the first run
of the pipeline on `main` overwrites it with the built tree. The order is the merge, then
that run. Rollback is removing the `publish-wiki` job; the wiki then keeps its last state
and nothing else in the pipeline is touched.
