# Elite Dangerous Galaxy Map

An interactive 3D map of the Elite Dangerous galaxy, drawn in the browser with WebGL2.

Phase 1 draws the far view: the bar, the bulge, the disc, the four spiral arms and the
dust lanes, from a compact analytic model of the game's stellar-mass distribution. It
draws no individual stars. Later phases add decoration stars, real systems and a HUD.

## Requirements

- Node 22.
- pnpm. Do not use npm or yarn.
- A GPU the browser can reach. The map refuses to draw on a software renderer.

The dev container in [.devcontainer/](.devcontainer/) supplies all three. It passes the
host NVIDIA card through to the container and runs an X server on display `:1`.

## Setup

```bash
pnpm install
pnpm exec playwright install chromium
```

The second command fetches the browser build that matches the resolved Playwright
version. [pnpm-workspace.yaml](pnpm-workspace.yaml) holds every package back for
7 days after its release, so the resolved version is often not the newest one.

## Scripts

| Script          | What it does                                         |
| --------------- | ---------------------------------------------------- |
| `pnpm dev`      | Starts the Vite dev server on port 5173              |
| `pnpm build`    | Checks the types, then builds into `dist/`           |
| `pnpm preview`  | Serves `dist/` on port 4173                          |
| `pnpm test`     | Runs the Vitest unit tests                           |
| `pnpm test:e2e` | Builds, serves and runs the Playwright browser tests |
| `pnpm lint`     | Runs ESLint                                          |
| `pnpm format`   | Runs Prettier over the repository                    |

Start the dev server as `pnpm dev --host 0.0.0.0` so the editor's port forwarding
reaches it.

## Controls

| Input           | What it does                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------ |
| Left drag       | Turns the camera around the cursor. 0.3 degrees per pixel. Pitch stops at 5 and 89 degrees.      |
| Right drag      | Moves the cursor in the galactic plane. The point under the pointer stays under it.              |
| Wheel           | Changes the distance by 1.15 per notch, between 2,000 and 120,000 light years.                   |
| `W` `A` `S` `D` | Move the cursor in the plane, relative to the camera, at one quarter of the distance per second. |
| `R` `F`         | Move the cursor up and down at the same speed.                                                   |

The view lives in the URL fragment as `#c=<x>,<y>,<z>&d=<distance>&p=<pitch>&y=<yaw>`,
in light years and degrees. The page writes it back at most once every 500 ms, so a
link carries the view.

## The galaxy model

The map draws from [src/galaxy-model/galaxy-model.json](src/galaxy-model/galaxy-model.json),
a 13 KB parameter file: 29 parameters and a 64x64 correction grid.
[docs/galaxy-density-model.md](docs/galaxy-density-model.md) gives the formulas the
TypeScript port implements, and
[tests/fixtures/galaxy-model.json](tests/fixtures/galaxy-model.json) pins the port to
reference values. Both files are committed data. The fixture carries the SHA-256 of the
parameter file, so a change to one fails the tests until the other matches.

## Hardware rendering

At startup the page reads the unmasked renderer string through
`WEBGL_debug_renderer_info` and puts it on `window.__galaxyMap.renderer`. If the string
names `SwiftShader`, `llvmpipe` or `Software`, the page shows an error and draws
nothing. `e2e/00-renderer.spec.ts` reads the same string and fails the suite when it is
missing, empty or names a software renderer, so a silent fall back to the processor
fails the build instead of only making it slow.

Headless Chromium turns the GPU off by default. `playwright.config.ts` starts it with
the flags the dev container needs, with the ANGLE Vulkan backend, which is the path the
NVIDIA driver answers on inside the container. To see the test fail without the card:

```bash
GALAXY_MAP_EXTRA_CHROMIUM_ARGS=--disable-gpu pnpm test:e2e e2e/00-renderer.spec.ts
```

## Layout

```
src/app/            bootstrap, error messages, URL fragment
src/galaxy-model/   the model port, the parameter file, its types
src/scene-data/     the point cloud, the density volume, the workers
src/render/         the WebGL2 context, the passes, the shaders
src/camera/         the view state, the projection, the controls
e2e/                the Playwright tests and the baseline image
tests/fixtures/     the model fixture
docs/               the model formulas and the roadmap
```

`src/galaxy-model/` and `src/scene-data/` must not import `src/render/`. An ESLint rule
holds that line, so a different density source can replace the data layers without a
change in the renderer.
