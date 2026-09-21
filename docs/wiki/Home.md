# @elite-dangerous-almanac/galaxy-map

An interactive 3D map of the Elite Dangerous galaxy, drawn in the browser with WebGL2.

The package draws the galaxy from an analytic density model of the game's stellar mass:
the bar, the bulge, the disc, the spiral arms and the dust lanes. Over it, it draws your
own star systems as markers, the codex region boundaries, spheres and lines, an optional
set of nebulae and an optional HUD. You add the data and read what the user picks. The
map owns the canvas, the camera and the frame loop, and it fetches nothing of yours.

## What it needs

- A browser with **WebGL2**, and a GPU the browser can reach. The map refuses to draw on
  a software renderer.
- A `<canvas>` element that you own and size with CSS.
- A bundler that reads the package `exports` map. The build is ES modules alone.

## Where to start

- [Getting started](Getting-started) — the install command and the smallest map that
  draws.
- [The testing subpath](Testing-subpath) — what `./testing` is, and why you do not build
  against it.

## The examples

Each page carries one TypeScript block you can copy, and a link to the page that block
runs on. The demo site publishes one such page for each example, at
`https://elite-dangerous-almanac.github.io/Galaxy-Map/examples/<name>/`.

- [Systems on the map](Systems-on-the-map)
- [A record with details](A-record-with-details)
- [The system icons](The-system-icons)
- [The HUD](The-HUD)
- [The camera](The-camera)
- [Spheres and lines](Spheres-and-lines)
- [A dataset catalog](A-dataset-catalog)
- [The nebulae](The-nebulae)

## The reference

The sidebar holds one block per kind — Interfaces, Type Aliases, Variables and Functions
— and one page for each member the package exports. Open a block and pick a name.

## What this wiki is

**This wiki is built from `main`, and it is a mirror.** A push to `main` generates the
reference pages from the TypeScript source and copies the prose pages from `docs/wiki/`
in the repository, so an edit made here is overwritten by the next push. To change a
page, change the repository.

A reader on a released version reads the types in the copy they installed: the wiki shows
`main`, which can be ahead of
[the released versions on npm](https://www.npmjs.com/package/@elite-dangerous-almanac/galaxy-map).

The repository holds the library, the demo site and the tests:
[Elite-Dangerous-Almanac/Galaxy-Map](https://github.com/Elite-Dangerous-Almanac/Galaxy-Map).
The demo site is
[elite-dangerous-almanac.github.io/Galaxy-Map](https://elite-dangerous-almanac.github.io/Galaxy-Map/).
It holds the demo page, the example pages above,
[the cycles page](https://elite-dangerous-almanac.github.io/Galaxy-Map/cycles/), which
draws every cycle of the Thargoid war, one week at a time, and
[the Canonn page](https://elite-dangerous-almanac.github.io/Galaxy-Map/canonn/), which
draws the maps of the Canonn ED3D map project, one map at a time.
