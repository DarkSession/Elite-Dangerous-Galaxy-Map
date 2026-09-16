#!/usr/bin/env bash
#
# Runs once, after the container is created.

set -euo pipefail

# Named volumes mount owned by root; the browsers and Claude Code state live under them.
# The volume at .cache/ms-playwright also makes docker create the parent .cache as root. Firefox
# must write .cache/mozilla, and it cannot, so it stops with "Your Firefox profile cannot be
# loaded". Give node the parent as well.
sudo chown node:node /home/node/.cache
sudo chown -R node:node /home/node/.cache/ms-playwright /home/node/.claude

# The NVIDIA container toolkit injects the driver, but not the vendor-neutral dispatch libraries
# the driver plugs into. The base image ships libGL and libGLX and no libEGL, so without this the
# card is passed through and Chrome still reports "GLDisplayEGL::Initialize failed" and falls back
# to SwiftShader on the CPU.
sudo apt-get update
sudo apt-get install -y --no-install-recommends libegl1 libgles2 mesa-utils mesa-utils-extra

# Chrome stable, for the "Vite: Chrome (GPU)" launch config. Playwright's own bundled Chromium is
# installed below and is what the tests use; this one is for interactive debugging, at a stable
# path that launch.json can name without pinning a Playwright build number.
curl -fsSL https://dl.google.com/linux/linux_signing_key.pub \
  | sudo gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg
echo 'deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] https://dl.google.com/linux/chrome/deb/ stable main' \
  | sudo tee /etc/apt/sources.list.d/google-chrome.list >/dev/null
sudo apt-get update
sudo apt-get install -y --no-install-recommends google-chrome-stable
sudo rm -rf /var/lib/apt/lists/*

# System libraries for the bundled browsers, then the browsers themselves into the cache volume.
# Chromium runs the test suite. Firefox has a different text paint path, and the map draws its
# labels with the DOM, so the browser suite measures that cost in both.
sudo npx --yes playwright install-deps chromium firefox
npx --yes playwright install chromium firefox

# OpenSpec CLI: the project's specs and change proposals live in openspec/, and the slash
# commands in .claude/ shell out to this binary. Global rather than a devDependency so it is
# there before the project has a package.json.
npm install -g @fission-ai/openspec@latest

if [ -f package.json ]; then
  pnpm install
fi

node --version
pnpm --version
gh --version | head -1
openspec --version

if command -v nvidia-smi >/dev/null 2>&1; then
  nvidia-smi --query-gpu=name,driver_version --format=csv,noheader
  # nvidia-smi only proves the device node is there. This proves the rest of the chain -- driver
  # libraries plus the libEGL dispatch Chrome actually calls. A "Device platform" section naming
  # the NVIDIA renderer means Chrome will get the card too; if it is missing or says llvmpipe,
  # rendering is on the CPU. Uses the surfaceless device platform, so it needs no X server.
  eglinfo -B 2>/dev/null | grep -iE 'renderer|device platform' || echo 'eglinfo: no EGL device found'
else
  echo 'No NVIDIA GPU in this container: WebGL falls back to SwiftShader (software) and is slow.'
fi

echo
echo 'Run "gh auth login" once to authenticate the GitHub CLI.'
echo 'Container desktop (for headed Chrome): http://localhost:6080  password: vscode'
