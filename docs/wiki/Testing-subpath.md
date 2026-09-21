# The testing subpath

`@elite-dangerous-almanac/galaxy-map/testing` is **not the supported surface, and it
carries no compatibility promise.** Its members change with no version step. Build
against the main entry point.

This page is written by hand, and the generator does not read that entry point, so its
three exports appear in none of the reference sections of this wiki.

## Why it exists

The subpath gives a browser test the renderer probe the map writes on `window`. It is an
entry point rather than a module of the demo because the renderer writes the object:
`createRenderContext` records the unmasked renderer string and the error text there. That
write is what makes a fall back to a software renderer fail the browser suite, so the
object stays library-side, on a path a mistake cannot quietly remove.

## What it exports

| Export            | Kind       | What it is                                          |
| ----------------- | ---------- | --------------------------------------------------- |
| `galaxyMapGlobal` | variable   | The name of the probe object on `window`            |
| `GalaxyMapGlobal` | interface  | The shape of that object                            |
| `TestView`        | type alias | The view a browser test reads back from the probe   |

## What to use instead

A host reads the map through the handle [GalaxyMap](GalaxyMap), which the main entry
point exports. Every member the HUD reads is on that handle, so a host can build its own
chrome from the same members.
