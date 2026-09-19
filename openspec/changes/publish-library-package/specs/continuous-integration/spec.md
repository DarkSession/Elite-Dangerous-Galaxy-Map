## MODIFIED Requirements

### Requirement: The pipeline checks every push and pull request

The repository SHALL hold a GitHub Actions workflow that runs on every push to `main` and
on every pull request that targets `main`.

The workflow SHALL run on Node 22 and SHALL install with pnpm at the version
`package.json` names in `packageManager`. The install SHALL run **at the workspace root**
and SHALL install every package of the workspace in one pass. It SHALL use the committed
`pnpm-lock.yaml` and SHALL fail rather than update it, so the 7-day release hold in
`pnpm-workspace.yaml` cannot be stepped around by a run that resolves fresh versions.

The check job SHALL run these, in this order, and SHALL fail on the first that fails:

1. `pnpm lint`
2. the TypeScript check
3. `pnpm test`
4. the library build, which writes `packages/galaxy-map/dist/`
5. the demo site build, which writes `apps/demo/dist/`
6. `pnpm test:package`, which reads what `npm pack` would ship and fails on a file that
   does not belong

The packed-tarball check runs on every push, and not in the publish workflow alone,
because a tarball fault found at publish time is found after the version is chosen and the
registry has been asked. `library-package` states what the tarball carries.

The workflow SHALL NOT run the Playwright suite. That suite asserts that WebGL runs on the
hardware card and fails a run that falls back to SwiftShader or llvmpipe, and a
GitHub-hosted runner carries no such card. The workflow file SHALL carry a comment saying
so, and `README.md` SHALL say that the browser suite is a local gate.

**Every action the workflow uses SHALL be pinned to a commit SHA**, with the version in a
comment beside it. The project holds an npm release for 7 days against a hijacked
maintainer account, and a workflow that reads a mutable tag takes whatever that tag points
at on the day it runs. A SHA is the same measure for the same risk.

The workflow SHALL NOT weaken any check to make a run pass. A run on a machine without a
GPU skips the browser suite; it does not run it against a software renderer.

#### Scenario: The workflow runs the five checks

- **WHEN** a unit test reads the workflow file and lists the commands of the check job
- **THEN** the list holds the lint, the type check, the unit tests, the library build, the
  demo site build and the packed-tarball check — **six** commands — in that order, and
  holds no Playwright command.

  The scenario's title says five and the list says six. The title stays because OpenSpec
  matches a scenario by its header text, so changing it drops the scenario rather than
  renaming it, and validation refuses that. The title is a name, not a count; the THEN
  clause is what the test asserts.

#### Scenario: Every action is pinned

- **WHEN** a unit test reads every `uses:` line of the workflow
- **THEN** each one names a 40 character commit SHA and carries the version in a comment

#### Scenario: The install is locked

- **WHEN** a unit test reads the install step of the workflow
- **THEN** it installs with a frozen lockfile, at the workspace root

#### Scenario: A failing check fails the run

- **WHEN** a pull request holds a lint error
- **THEN** the check job fails at the lint step and the later steps do not run

### Requirement: The demo site publishes to GitHub Pages from main

After the checks pass on a push to `main`, the workflow SHALL publish the demo site build
to the repository's GitHub Pages site. It SHALL publish nothing from a pull request.

The publish SHALL take the output of the demo site build, which is **`apps/demo/dist/`**
and whose base path is `/Elite-Dangerous-Galaxy-Map/`, and SHALL upload that directory as
the Pages artifact. It SHALL NOT upload `packages/galaxy-map/dist/`, which is the library.

The workflow SHALL hold the least permissions the publish needs: read on the contents,
write on the pages, and the id token the Pages deployment uses. It SHALL hold one
concurrency group for the publish, so two pushes in a row do not race and the later one
wins.

The published site SHALL serve the map, the HUD, the three demo data sets and the loading
image, all from the Pages host. The one other origin it SHALL reach is the host of the
demo data's own thumbnails, which a user reaches only by opening the information panel on
a record that names one. `THIRD_PARTY_NOTICES.md` records both.

#### Scenario: A pull request publishes nothing

- **WHEN** a unit test reads the publish job's condition
- **THEN** it runs only on a push to `main`, and it needs the check job

#### Scenario: The publish takes the demo site build

- **WHEN** a unit test reads the publish job
- **THEN** it uploads `apps/demo/dist/` and holds `pages: write` and `id-token: write` and
  no other write permission

#### Scenario: The published page draws

This scenario is read **after the merge**, because no run of the workflow on `main` can
happen before it. It is the one check of this change that the implementation cannot close
by itself.

- **WHEN** a person opens the published address after a run of the workflow on `main`
- **THEN** the map draws, the HUD shows, and the dataset field reads `Guardian Ruins`

## ADDED Requirements

### Requirement: A person releases the package to npm by hand

The repository SHALL hold a second workflow, `.github/workflows/publish-npm.yml`, that
publishes `@elite-dangerous-almanac/galaxy-map` to the npm registry.

**It SHALL run on `workflow_dispatch` and on nothing else.** No push, no tag and no merge
SHALL publish. A release is a decision a person makes, and the browser suite — which is
the project's gate on the rendering and which no GitHub runner can run — is run locally
before the dispatch. The workflow file SHALL carry a comment saying so.

**It SHALL run from the default branch alone.** The workflow SHALL read the ref it was
dispatched on, compare it with the repository's default branch, and fail with a message
naming both where they differ.

**It SHALL hold one concurrency group and SHALL NOT cancel a run in progress.** A publish
that is already running must finish; cancelling it can leave the registry and the tag
disagreeing.

**It SHALL work out the version rather than take one.** It SHALL read `major.minor` from
the library package's `package.json`, ask the registry for the versions already published
under that name, and choose the **next unused patch** of that `major.minor`. It SHALL fail
where that version would move the `latest` tag behind a higher published version. A name
the registry does not know SHALL be treated as no published versions, not as an error.

**It SHALL check twice before it publishes.** After choosing the version it SHALL confirm
the registry does not already hold it, and SHALL confirm the git tag `v<version>` does not
already exist.

**It SHALL run the checks, build and pack before it publishes**: the lint, the type check,
the unit tests, the dependency audit, the library build and the packed-tarball check. It
SHALL then run `npm pack`, read the packed `package.json` back out of the tarball and fail
where its version is not the chosen one.

**It SHALL publish through npm Trusted Publishing.** The publish job SHALL take the
tarball the pack job made, SHALL verify its SHA-256 digest against the digest the pack job
reported, and SHALL publish with **OIDC** and `--provenance`, with `--access public` and
the `latest` dist tag. It SHALL hold `id-token: write` and SHALL carry **no npm token**.
It SHALL name a GitHub environment, so the maintainer can require a review before it runs.

**It SHALL create the tag and the release after the publish succeeds**, not before: a tag
that names a version the registry rejected is a tag that has to be removed by hand. The
job SHALL create `v<version>` at the commit the run started from, SHALL fail where a tag
of that name points elsewhere, and SHALL create a GitHub release with generated notes.

**Every action SHALL be pinned to a commit SHA**, with the version in a comment, for the
reason the check workflow states.

**Three things live outside the repository and no workflow step can create them**: the npm
Trusted Publisher for this package pointing at this repository and this workflow file, the
GitHub environment the publish job names, and the package's place in the
`@elite-dangerous-almanac` organisation. `README.md` SHALL record all three, so the first
dispatch is not where they are found missing.

#### Scenario: The workflow runs only when a person asks

- **WHEN** a unit test reads the triggers of `publish-npm.yml`
- **THEN** the only trigger is `workflow_dispatch`, and there is no `push`, no `tag` and
  no `schedule`

#### Scenario: A run from a branch fails

- **WHEN** a unit test reads the branch check of the publish workflow
- **THEN** it compares the dispatched ref with the repository's default branch and exits
  non-zero where they differ

#### Scenario: The publish job carries no token

- **WHEN** a unit test reads the publish job
- **THEN** it holds `id-token: write`, names an environment, passes `--provenance` and
  `--access public`, and no step reads an npm authentication token from the secrets

#### Scenario: The tag follows the publish

- **WHEN** a unit test reads the job graph of the publish workflow
- **THEN** the release job needs the publish job, and the publish job needs the pack job

#### Scenario: The version is chosen, not typed

- **WHEN** a unit test reads the version step
- **THEN** it calls `scripts/next-version.mjs` rather than holding the rule in a shell
  block, and the step's output is the version the later steps read

#### Scenario: The version script picks the next free patch

- **WHEN** a unit test calls `scripts/next-version.mjs` with a `major.minor` and a list of
  published versions, for **five** cases: no published version at all, a gap in the patch
  series, a published patch above every local one of the same `major.minor`, a
  `major.minor` with no release yet, and the **regression case** — a local `major.minor`
  of `0.4` while the registry holds `0.5.3`
- **THEN** it prints the lowest unused patch of that `major.minor` in the first four
  cases, and in the regression case it **fails with a message and prints no version**,
  because publishing `0.4.x` would move the `latest` tag behind `0.5.3`. The two outcomes
  are separate: the script never both prints a version and fails

#### Scenario: The publish job checks the tarball digest

- **WHEN** a unit test reads the publish job's steps
- **THEN** one step computes the SHA-256 digest of the downloaded tarball and compares it
  with the digest the pack job recorded, and it runs **before** the publish step

#### Scenario: The publish workflow holds one concurrency group

- **WHEN** a unit test reads the `concurrency` block of `publish-npm.yml`
- **THEN** it names one group and sets `cancel-in-progress` to false, so a second dispatch
  waits rather than stopping a publish that is part way through

#### Scenario: The checks run before the pack

- **WHEN** a unit test lists the steps of the pack job in order
- **THEN** the lint, the type check, the unit tests, the audit, the library build and the
  packed-tarball check all come before `npm pack`

#### Scenario: Every action of the publish workflow is pinned

- **WHEN** a unit test reads every `uses:` line of `publish-npm.yml`
- **THEN** each one names a 40 character commit SHA and carries the version in a comment
