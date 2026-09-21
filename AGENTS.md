# AGENTS.md

Instructions for AI coding agents working in this repository.

## What this is

**Elite Dangerous Galaxy Map** — an interactive 3D map of the Elite Dangerous galaxy,
rendered in the browser with WebGL.

Phase 1 is in the tree: the project setup, the galaxy model port, the scene data, the
WebGL2 renderer and the camera. [README.md](README.md) gives the setup, the scripts and
the control scheme.

The repository is a **pnpm workspace** with two packages:

| Package                | What it is                                                      |
| ---------------------- | --------------------------------------------------------------- |
| `packages/galaxy-map/` | The library, published as `@elite-dangerous-almanac/galaxy-map` |
| `apps/demo/`           | The demo site, private, which the Pages job publishes           |

Library code goes in **`packages/galaxy-map/src/`**, in these directories:

| Directory           | What it holds                                    |
| ------------------- | ------------------------------------------------ |
| `src/app/`          | Bootstrap, error messages, the URL fragment      |
| `src/galaxy-model/` | The model port, the parameter file, its types    |
| `src/scene-data/`   | The point cloud, the density volume, the workers |
| `src/render/`       | The WebGL2 context, the passes, the shaders      |
| `src/camera/`       | The view state, the projection, the controls     |
| `src/hud/`          | The opt-in DOM HUD, its panels and its styles    |
| `src/nebulae/`      | The nebula subpath entry, which is one source    |

Demo code goes in `apps/demo/`: `src/` for the page, `demo-data/` for the committed
record sets, `scripts/` for the build that writes them, and `public/` for the loading
picture. Playwright tests go in `e2e/`, with the baseline image beside them. Tests that
read the repository rather than one package go in `tests/`. Every other unit test sits
next to the code it checks, as `*.test.ts`.

**The import rules**: `src/galaxy-model/` and `src/scene-data/` must not import
`src/render/`. `src/hud/` must not import `src/render/`, `src/scene-data/` or
`src/camera/`, and must not read a `debug` property. ESLint `no-restricted-imports` and
`no-restricted-syntax` rules in [eslint.config.js](eslint.config.js) fail the lint on a
breach. The first rule lets a different density source replace the data layers without a
change in the renderer. The second holds the HUD to the public handle of
[packages/galaxy-map/src/app/create-map.ts](packages/galaxy-map/src/app/create-map.ts),
so a host can build its own chrome from the same members the HUD uses.

**The demo imports the map by its package name**, never by a relative path out of
`apps/demo/src/`. A fourth ESLint rule fails the lint on a reach. The dev server
resolves the three specifiers — the package name, `/nebulae` and `/testing` — to the
library's **source** through the alias table of
[apps/demo/vite.config.ts](apps/demo/vite.config.ts), so a change in either package
reloads at once and no build stands between them. `e2e/` and `tests/` reach package
source by relative path on purpose, and that stays legal.

**`src/nebulae/` is the seam, and it may import both layers.** It is the package's second
entry point, and it holds the whole nebula import graph: the record set of
`src/scene-data/`, and the pass, the volume art and the two shaders of `src/render/`.
No other directory may import `src/render/nebula-pass`, `src/render/nebula-volumes` or
`src/scene-data/nebulae` **as a value**, and a third ESLint rule fails the lint on one. A
type import is allowed, because the build erases it. The renderer reaches the nebulae
through `src/render/nebula-slot.ts` alone, which holds types and three look defaults. The
rule is what keeps 2,912,225 bytes of art and the nebula code out of the build of a host
that asks for no nebulae.

## Stack

| Piece              | Choice                                                              |
| ------------------ | ------------------------------------------------------------------- |
| Language           | TypeScript                                                          |
| Package manager    | **pnpm** — not npm, not yarn                                        |
| Build / dev server | Vite — dev on 5173, production preview on 4173                      |
| Rendering          | WebGL, with GLSL in `.glsl` / `.vert` / `.frag` files               |
| Unit tests         | Vitest                                                              |
| Browser tests      | Playwright                                                          |
| Lint / format      | ESLint and Prettier, both run on save                               |
| Runtime            | Node 22, in a dev container with the host NVIDIA GPU passed through |

## pnpm, and the 7-day release hold

**pnpm is the package manager.** Do not run `npm install` or `yarn` — a stray
`package-lock.json` next to `pnpm-lock.yaml` means two sources of truth, and only one
of them gets the protection below. Commit `pnpm-lock.yaml`.

[pnpm-workspace.yaml](pnpm-workspace.yaml) sets `minimumReleaseAge: 10080`, so pnpm
will not install a version published less than **7 days** ago. This is a supply-chain
measure: compromised releases from a hijacked maintainer account are usually caught
and pulled within hours, and a week of distance sits the project safely behind that
window.

What this means in practice:

- `pnpm add x` resolves to the newest version of `x` that is already a week old, which
  is often _not_ the version on the npm page. That is working as intended — do not
  "fix" it by pinning the newest version by hand.
- Versions already in `pnpm-lock.yaml` install normally, however old or new.
- If a fresh release is genuinely needed on day zero (a real security fix), add that
  one package to `minimumReleaseAgeExclude` rather than lowering or removing the hold
  for everything. Say why in the change proposal.

## Spec-driven workflow (OpenSpec)

This project uses [OpenSpec](https://github.com/Fission-AI/OpenSpec). Specs live in
`openspec/specs/`, in-flight change proposals in `openspec/changes/`, and project
context in [openspec/config.yaml](openspec/config.yaml) — read that context before
drafting artifacts.

For any non-trivial change, write the proposal before the code:

```bash
openspec list            # active changes
openspec list --specs    # existing specs
openspec show <item>     # read one
openspec validate        # check artifacts
```

In Claude Code the same flow is `/opsx:propose` → `/opsx:apply` → `/opsx:archive`
(`/opsx:explore`, `/opsx:update` and `/opsx:sync` fill in the rest). The
`/opsx:propose` step is planning only: it writes artifacts and stops, and
implementation waits for a separate request.

The skill and command files under `.claude/` and `.agents/skills/` are generated by
`openspec init` / `openspec update` — edit `openspec/config.yaml` instead of editing
them by hand, or the next update overwrites your changes.

### Two review gates

Nothing reaches a human reviewer un-reviewed. Both gates are mandatory, and both run a
**read-only subagent** that reports but never edits — fixing what it finds is the
implementing agent's job.

| Gate           | When                                                                                                                                | Subagent                                                                                 |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Proposal       | End of `/opsx:propose` (and `/opsx:update`), once proposal, specs, design and tasks all exist — before the plan is shown to a human | [`openspec-proposal-reviewer`](.claude/agents/openspec-proposal-reviewer.md)             |
| Implementation | End of `/opsx:apply`, once the code is written and the tasks are checked off — before the work is shown to a human                  | [`openspec-implementation-reviewer`](.claude/agents/openspec-implementation-reviewer.md) |

Each returns **BLOCK**, **APPROVE WITH NOTES** or **APPROVE**. On BLOCK, fix and re-run
the gate; do not hand a human a blocked change with the objections attached as caveats.
When you do present, state the verdict and the findings — including the ones you decided
against acting on, and why.

Before the implementation gate, run the tests yourself. The gate is not a substitute for
that, and a reviewer sent into a broken tree wastes its run.

If a subagent cannot be launched, say so plainly. Reviewing your own work and calling
that the gate is the one failure mode that makes these worse than useless, because it
launders an unreviewed change into a reviewed one.

The gate instructions live in `openspec/config.yaml` (`rules.tasks` for the proposal
gate, `operations.apply.guidance` for the implementation one), so they are injected into
the generated instructions and survive `openspec update`. A caveat when editing that
file: a list entry containing a colon followed by a space parses as a YAML map rather
than a string, and OpenSpec then drops the whole block without an error. Keep plain
entries colon-free or write them as a `|` block, and check with
`openspec instructions tasks --change <id>` that your text actually comes out.

## Rules that are specific to this project

- **Hardware rendering is a requirement, not a nicety.** The dev container exists to
  put a real GPU behind WebGL. A silent fall back to software rendering (SwiftShader or
  llvmpipe) is a regression, not a slow test run — assert on the renderer by reading
  `WEBGL_debug_renderer_info` in the page and failing the suite if it comes back
  software. See [.devcontainer/README.md](.devcontainer/README.md) for the flags a
  headless Playwright run needs and how to check `chrome://gpu`.
- **Keep data sources separate from rendering.** Star system data (EDSM, Spansh dumps)
  and the drawing layer should each be replaceable without touching the other.
- **State the scale.** The galaxy is ~400 billion systems. Any spec or change that
  touches data loading or drawing should say what scale it has to hold up at, and the
  implementation should be measured against it rather than assumed.
- **Do not commit galaxy data dumps.** They are large and re-downloadable; fetch them
  into an ignored directory.

## Working agreements

- Run the dev server as `pnpm dev --host 0.0.0.0` so VS Code's port forwarding reaches
  it. `apps/demo/vite.config.ts` already sets `server.host: true`. Five root scripts
  delegate with `pnpm --filter` — `dev`, `build`, `build:demo-site`, `build:demo-data`
  and `preview` — and an argument crosses both hops. The other seven run at the root:
  `test`, `test:e2e`, `test:package`, `audit`, `lint`, `format` and `docs:wiki`.
  `tests/` and `e2e/` belong to no package, so a delegated `pnpm test` would drop every
  root test file.
- The two builds write inside their own packages: `pnpm build` writes
  `packages/galaxy-map/dist/` and `pnpm build:demo-site` writes `apps/demo/dist/`.
- The API reference is the repository's GitHub wiki,
  <https://github.com/Elite-Dangerous-Almanac/Galaxy-Map/wiki>. `pnpm docs:wiki` builds
  the whole tree into the ignored `wiki-build/`, from the TypeScript source and from
  `docs/wiki/`, and the `publish-wiki` job of `.github/workflows/ci.yml` pushes it on a
  push to `main`. The wiki is a mirror: change `docs/wiki/`, not the wiki. The wiki
  setting itself lives outside the repository, as the npm publish's settings do, and no
  step of the pipeline can turn it on.
- Commit only when asked. The default branch is `main`.
- Prettier and ESLint own formatting; do not hand-format against them, and leave GLSL
  files alone (format-on-save is off for them by design).

## Language and documentation

Use [ASD-STE-100](https://www.asd-ste100.org/) (Simplified Technical English) everywhere: replies to the person you are working with, code, comments, documentation, commit messages and pull requests.

- One idea per sentence. Keep instructions to 20 words and descriptions to 25. Keep a paragraph to six sentences.
- Active voice, present tense. Name who or what does the thing.
- One word, one meaning. Choose a term and keep it; do not vary it for style.
- Plain, common words. No metaphor, no idiom, no literary phrasing, no marketing adjectives, no emoji, and no jargon the reader did not use first: "add a tooltip to the heat glosses" beats "the glosses find their voice at last". Identifiers, test names and headings follow the same rule.
- Say it once, and say it directly. Drop throat-clearing openers ("it is worth noting that"), self-assessment ("comprehensive", "robust", "seamless") and hedging that carries no information. If deleting a sentence loses nothing, delete it.
- Write a procedure as numbered steps in the order you do them, with the condition before the action: "If the build fails, read the policy output."
