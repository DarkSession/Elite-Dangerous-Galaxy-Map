# Dev container

Node 22 on Debian bookworm, with the host's NVIDIA GPU passed through so WebGL renders on the
card instead of SwiftShader.

## What is in it

| Piece | Why |
| --- | --- |
| `--gpus all` + `NVIDIA_DRIVER_CAPABILITIES=all` | Device nodes *and* the OpenGL driver libraries. The default `utility,compute` gives you `nvidia-smi` and no rendering. |
| `libegl1`, `libgles2` | The vendor-neutral dispatch libraries the injected driver plugs into. The base image has none. |
| `desktop-lite` feature | An X server on `:1` and noVNC on 6080, so headed Chrome has somewhere to draw. |
| `google-chrome-stable` | Interactive debugging target for the `chrome: open with the GPU flags` task, at a path that does not move between Playwright releases. |
| Playwright + Chromium + Firefox | Browsers cached in a named volume so a rebuild does not re-download them. |
| `gh` | GitHub CLI. Run `gh auth login` once per volume. |
| `--shm-size=1g` | Docker's 64MB default kills Chromium renderers under a real scene. |

## Requirements on the host

An NVIDIA card, its driver, and `nvidia-container-toolkit` installed *and registered with docker*
(`sudo nvidia-ctk runtime configure --runtime=docker && sudo systemctl restart docker`). Without
it docker refuses to start the container at all -- drop the `"--gpus", "all"` entries from
`runArgs` on such a machine and everything except hardware rendering still works.

## Checking the GPU actually reached the browser

`post-create.sh` prints the card and the EGL renderer on first build. From inside the container:

```bash
nvidia-smi                       # device node present
eglinfo -B | grep -i renderer    # driver + EGL dispatch working
```

In the browser, open `chrome://gpu`. "WebGL: Hardware accelerated" and a GL renderer string
naming the card is what you want; "SwiftShader" means it fell back to the CPU.

## Debugging (`.vscode/launch.json`)

No configuration starts a browser. You open the browser, and the debugger attaches to it.

- **Vite: dev server** -- runs `pnpm dev` in a terminal. Breakpoints stop in Vite's Node
  process, not in the page.
- **Vite: production preview** -- builds the demo site, then serves the real bundle on 4173.
- **Chrome: attach to :9222** -- debugs the page. Start Chrome first.
- **Vitest: all tests / current file**, **Playwright: current file (headed)**.

To debug the page:

1. Start **Vite: dev server**.
2. Run the task **chrome: open with the GPU flags** (Run Task in the command palette). It opens
   Chrome on `:1` with the GPU flags and `--remote-debugging-port=9222`. Watch it at
   <http://localhost:6080> (password `vscode`).
3. Start **Chrome: attach to :9222**.

Your own browser on the host works the same way: start it with `--remote-debugging-port=9222`,
forward 5173, then attach. No GPU flags apply -- that Chrome uses the host's driver directly.

`apps/demo/vite.config.ts` sets `server.host: true`, so VS Code's port forwarding sees the
server. The
pages are at <http://localhost:5173/Elite-Dangerous-Galaxy-Map/> and
<http://localhost:4173/Elite-Dangerous-Galaxy-Map/> -- the `base` option puts them under that
path.

## Playwright and the GPU

Headless Chromium disables the GPU by default, so a visual test measuring real rendering needs the
same flags the launch config uses:

```ts
// playwright.config.ts
export default defineConfig({
  projects: [
    {
      name: 'chromium-gpu',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: [
            '--no-sandbox',
            '--use-gl=angle',
            '--use-angle=vulkan',
            '--ignore-gpu-blocklist',
            '--enable-gpu-rasterization',
          ],
        },
      },
    },
  ],
})
```

The ANGLE backend is `vulkan`. Inside this container `gl-egl` reaches only the Mesa software
driver (llvmpipe or SwiftShader), headless and headed alike, and Vulkan reaches the NVIDIA card in
both cases. `playwright.config.ts` and `tasks.json` use the same flags.

Assert on it rather than trusting it -- read `WEBGL_debug_renderer_info` in the page and fail the
suite if it comes back SwiftShader, otherwise a silent fallback turns a GPU regression into a
merely-slow test run.

## Firefox

Firefox draws text shadows on the CPU, and the map draws its labels with the DOM, so a Firefox
run measures a cost the Chromium run does not show. `post-create.sh` installs it.

Firefox needs no GPU flags. Headless Firefox reaches the card on its own, and the flags above are
Chromium-only:

```ts
{ name: 'firefox', use: { ...devices['Desktop Firefox'] } }
```

Firefox hides the real card behind a generic name. It reports `NVIDIA GeForce GTX 980, or
similar` for every NVIDIA card, which is still enough to tell hardware from software -- the
software renderer names itself `llvmpipe`. To read the true string, turn the sanitizer off:

```ts
firefoxUserPrefs: { 'webgl.sanitize-unmasked-renderer': false }
```

Two failures to know, because both look like something else:

- `Your Firefox profile cannot be loaded` in a dialog on the container desktop. Firefox cannot
  write `~/.cache/mozilla`. `post-create.sh` gives node that directory; an older container needs
  `sudo chown node:node /home/node/.cache` once.
- `Sandbox: CanCreateUserNamespace() clone() failure: EPERM` on every start. The container blocks
  unprivileged user namespaces. Firefox prints it and runs. It is not the cause of a failure.
