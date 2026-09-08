# Dev container

Node 22 on Debian bookworm, with the host's NVIDIA GPU passed through so WebGL renders on the
card instead of SwiftShader.

## What is in it

| Piece | Why |
| --- | --- |
| `--gpus all` + `NVIDIA_DRIVER_CAPABILITIES=all` | Device nodes *and* the OpenGL driver libraries. The default `utility,compute` gives you `nvidia-smi` and no rendering. |
| `libegl1`, `libgles2` | The vendor-neutral dispatch libraries the injected driver plugs into. The base image has none. |
| `desktop-lite` feature | An X server on `:1` and noVNC on 6080, so headed Chrome has somewhere to draw. |
| `google-chrome-stable` | Interactive debugging target for `launch.json`, at a path that does not move between Playwright releases. |
| Playwright + Chromium | Browser cached in a named volume so a rebuild does not re-download it. |
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

- **Vite: Chrome (GPU)** -- starts the dev server, opens Chrome on `:1` with the GPU flags.
  Watch it at <http://localhost:6080> (password `vscode`).
- **Vite: Chrome on production preview** -- builds, then serves and debugs the real bundle.
- **Vite: attach to host Chrome (:9222)** -- if you would rather use your own browser. Start it
  with `--remote-debugging-port=9222` and open the forwarded 5173.
- **Vitest: all tests / current file**, **Playwright: current file (headed)**.

The dev-server task passes `--host 0.0.0.0`, so VS Code's port forwarding sees it. If you start
Vite by hand, pass that too or set `server.host: true` in `vite.config.ts`.

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
            '--use-angle=gl-egl',
            '--ignore-gpu-blocklist',
            '--enable-gpu-rasterization',
          ],
        },
      },
    },
  ],
})
```

Assert on it rather than trusting it -- read `WEBGL_debug_renderer_info` in the page and fail the
suite if it comes back SwiftShader, otherwise a silent fallback turns a GPU regression into a
merely-slow test run.
