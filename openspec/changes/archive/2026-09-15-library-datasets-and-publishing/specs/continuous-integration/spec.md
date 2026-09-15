## Purpose

States what the repository's automated pipeline checks on every change, and how the demo
site reaches the project's GitHub Pages address.

## ADDED Requirements

### Requirement: The pipeline checks every push and pull request

The repository SHALL hold a GitHub Actions workflow that runs on every push to `main` and
on every pull request that targets `main`.

The workflow SHALL run on Node 22 and SHALL install with pnpm at the version
`package.json` names in `packageManager`. The install SHALL use the committed
`pnpm-lock.yaml` and SHALL fail rather than update it, so the 7-day release hold in
`pnpm-workspace.yaml` cannot be stepped around by a run that resolves fresh versions.

The check job SHALL run these, in this order, and SHALL fail on the first that fails:

1. `pnpm lint`
2. the TypeScript check
3. `pnpm test`
4. the library build, which writes `dist/`
5. the demo site build, which writes `dist-demo/`

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
- **THEN** the list holds the lint, the type check, the unit tests, the library build and
  the demo site build, in that order, and holds no Playwright command

#### Scenario: Every action is pinned

- **WHEN** a unit test reads every `uses:` line of the workflow
- **THEN** each one names a 40 character commit SHA and carries the version in a comment

#### Scenario: The install is locked

- **WHEN** a unit test reads the install step of the workflow
- **THEN** it installs with a frozen lockfile

#### Scenario: A failing check fails the run

- **WHEN** a pull request holds a lint error
- **THEN** the check job fails at the lint step and the later steps do not run

### Requirement: The demo site publishes to GitHub Pages from main

After the checks pass on a push to `main`, the workflow SHALL publish the demo site build
to the repository's GitHub Pages site. It SHALL publish nothing from a pull request.

The publish SHALL take the output of the demo site build, which is `dist-demo/` and whose
base path is `/Elite-Dangerous-Galaxy-Map/`, and SHALL upload that directory as the Pages
artifact. It SHALL NOT upload `dist/`, which is the library.

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
- **THEN** it uploads `dist-demo/` and holds `pages: write` and `id-token: write` and no
  other write permission

#### Scenario: The published page draws

This scenario is read **after the merge**, because no run of the workflow on `main` can
happen before it. It is the one check of this change that the implementation cannot close
by itself.

- **WHEN** a person opens the published address after a run of the workflow on `main`
- **THEN** the map draws, the HUD shows, and the dataset field reads `Guardian Ruins`
