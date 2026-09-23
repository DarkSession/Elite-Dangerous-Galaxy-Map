# Contributing

This repository is a pnpm workspace with two packages. `packages/galaxy-map/` is the
library. `apps/demo/` is the demo site. [AGENTS.md](AGENTS.md) holds the layout, the
import rules and the working agreements.
[docs/galaxy-density-model.md](docs/galaxy-density-model.md) gives the formulas the
galaxy model implements.

## Setup

You need Node 22, pnpm and a GPU the browser can reach. The dev container in
[.devcontainer/](.devcontainer/) supplies all three. Its [README](.devcontainer/README.md)
tells how to make sure that the browser uses the GPU.

```bash
pnpm install
pnpm exec playwright install chromium
```

Use pnpm only. Do not run `npm install` or `yarn`.

## Scripts

| Script                   | What it does                                                              |
| ------------------------ | ------------------------------------------------------------------------- |
| `pnpm dev`               | Starts the Vite dev server on port 5173                                   |
| `pnpm build`             | Checks the types, then builds the library                                 |
| `pnpm build:demo-site`   | Builds the demo site                                                      |
| `pnpm build:demo-data`   | Writes the demo record sets again from their sources                      |
| `pnpm build:cycle-data`  | Writes the cycle sets of the cycles page again from the archive           |
| `pnpm build:canonn-data` | Writes the Canonn sets of the Canonn page again from their sources        |
| `pnpm preview`           | Serves the built demo site on port 4173                                   |
| `pnpm test`              | Runs the Vitest unit tests                                                |
| `pnpm test:package`      | Reads what `npm pack` would ship and fails on a file that does not belong |
| `pnpm test:e2e`          | Builds, serves and runs the Playwright browser tests                      |
| `pnpm docs:wiki`         | Builds the wiki tree into `wiki-build/`                                   |
| `pnpm audit`             | Fails on a known high or critical advisory                                |
| `pnpm lint`              | Runs ESLint                                                               |
| `pnpm format`            | Runs Prettier over the repository                                         |

Start the dev server as `pnpm dev --host 0.0.0.0`, so that the editor's port forwarding
reaches it.

## Before a pull request

**The browser suite is a local gate.** CI runs every other check, but not Playwright. The
suite fails on a software renderer, and a GitHub-hosted runner has no GPU. Run
`pnpm test:e2e` in the dev container before you open a pull request.

## The wiki

The API reference is the repository's wiki. `pnpm docs:wiki` builds it into the ignored
`wiki-build/`, from the TypeScript source and from [docs/wiki/](docs/wiki/). The
`publish-wiki` job of [.github/workflows/ci.yml](.github/workflows/ci.yml) pushes it on a
push to `main`. The next push overwrites an edit made in the wiki interface. Change
`docs/wiki/` instead.
