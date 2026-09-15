## Context

See [proposal.md](proposal.md) for the motivation and
[specs/](specs/) for the requirements.

What the tree holds today, and what the design has to work with:

- `renderer.ts` draws the scene into `sceneTarget`, adds the glow into it, then calls
  `composite.tonemap(sceneTarget.texture, look.exposure)` **straight to the default
  framebuffer**. The grid, the region overlay and the markers then blend over that.
- `grid-pass.ts` draws one full-screen triangle. `grid.frag` un-projects each pixel to the
  cursor's plane and works out six decade levels there. Every look constant is exported
  from the module, and `grid-labels.ts` already imports `gridLevelAlpha` and
  `gridVisibility` from it, so one module owning a rule that two consumers read is an
  established pattern here.
- `region-pass.ts` draws in two steps: a ribbon step that writes coverage into an `RG8`
  target with `blendEquation(MAX)`, and a full-screen composite that reads it. The green
  channel carries the near fade this change removes.
- `glow-pass.ts` already holds a halving chain and a separable blur (`blur.frag`) over
  small targets. It is the working example for both new pieces.
- `src/hud/` may not import `src/render/`, `src/scene-data/` or `src/camera/`. `src/app/`
  may import `src/render/`.

## Goals / Non-Goals

**Goals:**

- One rule, one owner. The background weight is a pure function in `grid-pass.ts`; the
  shader reads it through uniforms and `grid-labels.ts` calls it directly. A line and the
  number on it cannot disagree.
- No stall. Reading the background back to the processor must not make the frame wait for
  the card.
- No change to the scene. The background reading is read; nothing writes back into
  `sceneTarget`, so the committed baseline image of the far view cannot move.
- The region blur must round corners without moving the line.

**Non-Goals:**

- Tone-mapping the grid or the markers with the scene. They stay overlays.
- A background reading for the region labels or the marker names.
- Any new option or handle member for the host. Everything here is look, plus three
  `debug` probes: `backgroundReading()` and `backgroundSize()`, which the new
  coordinate-grid requirement asks for, and `regionCoverageSize()`, which the new
  galactic-regions requirement asks for. A probe is not an option: it reports what a pass
  holds and it changes nothing a host draws.

## Decisions

### 1. The background reading is built from `sceneTarget`, not from the finished frame

The grid needs the brightness of the **galaxy** under a pixel. The finished frame also
holds the region lines and the markers, which the grid must not react to.

Building from `sceneTarget` also means the tone map keeps writing straight to the default
framebuffer. The chain is not cheap: four halvings from full resolution read about **1.33
frames** of texels, the first halving alone reading the whole frame. Task 5.1 measures it
against the grid's 1 ms bound and decision 2a names what to do if it does not fit. The alternative was to tone-map into a texture and present it through the grid
pass, which would let the grid read the exact finished pixel. It was rejected: it adds a
full-resolution `RGBA8` target and a present pass to every frame, and it puts a copy in the
path of the committed baseline image, where a single least-significant-bit difference fails
the suite.

**Tone mapping happens once at full resolution, and the averaging follows it.** The scene
target is linear HDR. An earlier draft of this design halved it four times and tone-mapped
the mean, on the reasoning that the mean radiance of a block is the brightness a person
reads there. The implementation measured that and it is wrong for a star field: a sprite's
linear luminance is far above its background, so it dominates the linear mean of its whole
16x16 block, and the block reads 0.56 where the same block of the tone-mapped frame means
0.33. Worse, the mean **steps** when the sprite crosses a texel edge, by up to 0.2417 in one
frame over the disc, which is a step in the merge weight and a grid line that flickers.

Mapping first caps every pixel near 1 before it is averaged, so one pixel leaving a 256
texel block moves the mean by about 0.004. The same reading falls to 0.0232, and the share
of texel steps above 0.02 over the disc from 5.53 to 0.12 per cent. Nothing a person sees
moves: at both views the merge scenarios use, the reading already saturates an end of
`smoothstep(0.08, 0.55, L)`, so the line and label weights are the same under either order,
and tasks 3.5 and 3.7 read the same number. The extra full-resolution pass costs under
0.08 ms, inside the run-to-run noise of the 1 ms grid bound.

The chain runs `tonemap.frag` with `look.exposure` into a full-resolution `RGBA8` target,
then reuses `glow-pass.ts`'s `halve` four times into an `RGBA8` target of
`ceil(width / 16) x ceil(height / 16)`.

### 1a. The fallback, if the chain does not fit the budget

Take the **first** reduction as a sparse bilinear sample at a quarter size, one tap per
output texel rather than a box filter, and halve twice after it. The reads fall to about
`1/4 + 1/16 + 1/64`, near a third of a frame. The cost is more of the point cloud's grain in
the reading, which the scenario "The reading holds still under the grain" then has to hold.

The fallback is **not** the glow pass's quarter target, which an earlier draft named.
`glow-pass.ts` builds that through `halve(source, quarter, DEFAULT_GLOW_CLAMP)`, a clamp at
0.01 of scene luminance, so it is a clamped glow source and every bright background reads
the same value there. That is the one distinction the merge needs. It is also gated on the
`glow` switch, which the grid is not.

### 2. The processor copy is a pixel buffer object with a fence, read one frame late

`gl.readPixels` straight into a `Uint8Array` waits for the card. At 120 by 68 texels the
transfer is nothing, but the wait is a pipeline flush in the middle of the frame.

The pass therefore copies into a `PIXEL_PACK_BUFFER`, places a `fenceSync`, and calls
`getBufferSubData` on the **next** frame, when the fence has passed. `grid-labels.ts`
reads the reading of the frame before. A label's opacity one frame behind the picture is
not visible; a flush is.

Two buffers ping-pong, so the frame that writes one never reads it.

`debug.backgroundReading()` does **not** use this path. It is a test-only probe and it
reads synchronously, like `readPixel` and `readRect` beside it, so a test never has to draw
a second frame to see the first one's reading. It returns the three channels as well as the
luminance, because the labels tint with the colour and a luminance-only probe could not
check that.

### 3. The weight is one exported function with two floors

`grid-pass.ts` gains:

```ts
export const GRID_BG_LOW = 0.08;
export const GRID_BG_HIGH = 0.55;
export const GRID_LINE_MERGE_FLOOR = 0.3;
export const GRID_LABEL_MERGE_FLOOR = 0.45;
export const GRID_LINE_TINT_MAX = 0.6;
export const GRID_LABEL_TINT_MAX = 0.35;

export function gridBackgroundWeight(luminance: number, floor: number): number;
export function gridBackgroundTint(luminance: number, maximum: number): number;
```

`grid.frag` gets `uBackground` (the sampler), `uMergeRange` (the two edges), `uMergeFloor`
and `uTintMax`, and does the same arithmetic. The constants therefore live in one file and
the shader is given them rather than holding copies. A unit test reads the function; a
browser test reads the frame; the two are held together by the uniforms.

Two floors and two tint maxima, rather than one of each, because text needs more contrast
than a line. The requirement states why.

The luminance is the reading's own texel put through `dot(rgb, vec3(0.2126, 0.7152,
0.0722))`. The label module gets the same three channels from the readback array, so it can
tint as well as fade.

### 4. The coverage buffer loses a channel and stays at full resolution

The near fade goes, so the target drops from `RG8` to `R8`. The blur then runs over it.

`REGION_LINE_WIDTH_CSS` goes from **4 to 6**, so `halfWidth` is 3 CSS pixels and the ribbon
quad covers the ramp `max(0, 1 - gap / 3)` exactly. Leaving it at 4 would cut the ramp at
0.333 at the quad edge and draw a 4 pixel band with a hard edge.

**The buffer stays at the full drawing buffer size.** An earlier draft halved it to save
texel reads. That was wrong: the coverage is a point-sampled triangular ridge, not a band
limited field, and at half resolution a texel is 2 CSS pixels, so the floor radius of 1.5
gave a kernel of a quarter of a texel and the sampled peak of a straight run moved from 0.67
to 1.00 with the line's own phase. One `uPeak` cannot normalise a peak that moves by a
third. At full resolution the same spread is 0.83 to 1.00 unblurred and 0.69 to 0.76 at a
radius of 3 CSS pixels, which the requirement's table states and its unit scenario reads
over twelve phases.

The ribbon step therefore keeps the full resolution and the `MAX` equation, and only
`uNearFade` and the second channel go.

### 5. The blur is separable, `accurate` only, and gated on a radius of 3 CSS pixels

Two passes over a ping-pong pair of full-resolution `R8` targets. The kernel is a Gaussian
of standard deviation `radius / 3` CSS pixels sampled one **CSS pixel** apart with a linear
filter on the coverage texture, with `2 * ceil(radius) + 1` taps. The largest radius is 8, so
the count reaches **17** and no cap ever cuts the kernel.

The step is one CSS pixel and not one device pixel so that the tap count does not follow the
display. A device pixel step needs 33 taps at a ratio of 2 and a radius of 8; a cap of 17
would then cut the kernel at 1.9 standard deviations and narrow the band by an amount that
follows the display rather than the zoom. Because the blur runs only at a radius of 3 and
above, the standard deviation is at least 1 CSS pixel and a one CSS pixel step samples it
well. The coverage target therefore takes a **linear** filter, which `R8` is filterable for.

The radius in CSS pixels is `min(cellCss, 8)`, where `cellCss = focalCss * 49.3494 / distance`
and `focalCss = (rows / 2) / tan(30 degrees)`, which is 935.3 at 1,080 rows and 623.5 at 720.
The processor works it out, so the shader takes a number.

**The radius is the whole cell and not a part of it, because of the shorter buffer.** An
earlier draft used 0.7 of the cell. That works at 1,080 rows and fails at 720: the blur would
then stop at a zoom of 7,180 light years, where `regionFade` still holds the line at 0.40 and
under, so a user on a 720 row buffer would never see a rounded corner at an opacity worth
looking at. The whole cell carries the blur to 15,390 light years at 1,080 rows and to 10,260
at 720, and the fade reaches 1.00 at 10,000. The blur therefore covers every zoom the overlay
draws at an opacity a user reads, at both heights. The corner it rounds is one whole cell
tall and one whole cell wide, so the whole cell is also the honest radius.

**The blur runs in `accurate` alone, and only where that radius reaches 3 CSS pixels.**
Below 3 the standard deviation is under one CSS pixel and the kernel blurs by less than the
grid aliases, which is what the half-resolution draft got wrong. A cell under 3 CSS pixels is
also under half the band's own width, so the staircase there is smaller than the softness of
the edge it sits on. `simplified` never
blurs, because the smoothed set has no staircase; the blur exists for the mode the fault was
reported against. At 1,080 CSS rows the blur therefore runs below a zoom of about 15,390
light years, and at 720 rows below about 10,260. The cap of 8 CSS pixels holds the radius at
5,770 light years and below at 1,080 rows, where the fade leaves 0.06 of the opacity and
less; at 720 rows the cap is reached at 3,846, below the band, so it never acts there.

**If the blur misses the 1 ms bound.** The worst case is two full-resolution passes of 17
taps, about 70 million texel reads at 1920x1080, which task 8.5 measures at a zoom of 5,200
light years. Half resolution is not the answer, for the reason decision 4 gives. In order: cut
the cap from 8 CSS pixels to 6, which drops the widest kernel from 17 taps to 13 and costs a
zoom band the fade leaves under 0.07 of the opacity at anyway; then sample the kernel two CSS
pixels apart above a radius of 5, which halves the taps again and which the linear filter on
the coverage already supports; then move the ping-pong pair to half resolution and accept the
phase spread decision 4 measured, which is the last resort because it changes the table.

**The shader is new, not `blur.frag`.** `src/render/shaders/blur.frag` is fixed at nine taps
with `const float SIGMA = 2.0` in texels, applies `uWeight` and the haze tint, and writes
RGB. The region blur needs a variable standard deviation, a variable step, up to 17 taps, one
channel and no
tint. Editing `blur.frag` in place would move the glow, and task 9.3 holds the committed
baseline image byte-identical. `region-blur.frag` is therefore a second shader, and the two
stay independent.

Why the cell and not a constant: the fault the blur fixes is the traced set's own step, and
that step has a fixed size in **light years**. A constant radius would over-blur at a wide
zoom, where the step is already under a pixel, and under-blur at 5,000 light years, where
it is 9 CSS pixels.

**The blurred coverage is normalised by the kernel's response at the ridge.** The coverage
the ribbon writes is a triangular ridge, `max(0, 1 - gap / 3)`, not an unbounded ramp. A
blur lowers its peak: 0.758 at a radius of 3 CSS pixels, 0.613 at 4.62 and 0.411 at the cap
of 8. Left alone, the band would draw at two fifths of its stated opacity at the close end of
the zoom band and at full opacity above 15,390 light years, which is a look that changes with the zoom for no
stated reason.

The pass therefore computes `regionBlurPeak(radiusCss, halfWidthCss)` on the processor, by
summing **the same discrete kernel the shader uses** against the continuous ramp, and passes it as
`uPeak`. The composite divides by it. Computing it from the same taps rather than from a
closed form is what keeps the number and the kernel from drifting apart.

What normalising does not do is hold the width. The band's half-maximum width follows the
radius: 3.0 to 3.5 CSS pixels unblurred, 4.68 to 4.88 at a radius of 4.62, 6.90 to 7.05 at
the cap of 8. Nor does it remove the ripple the point sampling leaves: the alpha moves by up
to 9 per cent along the band's own length at a radius of 3 and 3 per cent at 8, against 17
per cent for the unblurred line the map draws today. The width is kept on purpose. The staircase is worst where the camera is nearest, a wider and softer band there
is the game's own line, and the requirement states the table.

Why a blur and not a supersample: a supersample sharpens an edge and leaves a corner a
corner. The fault is the corner. The third option, rounding the traced polyline in the
worker, was rejected because it builds and uploads a third set and moves the line away from
the data the `accurate` mode exists to show.

### 6. The composite writes one tone

`region-composite.frag` loses `uOutlineColour`, `uCoreLevel` and `uCoreSoft`, and gains
`uPeak`. It reads one channel, divides by `uPeak`, maps the result with
`smoothstep(0.0, 1.0, coverage)` and writes `uTone` at `alpha * uOpacity`. The zoom fade multiplies `uOpacity` on the processor, as it
does today.

### 7. The region labels need one function changed, not a new mechanism

`src/app/labels.ts` already holds `labelFade(distance)`, already gates the sweep on it
(`if (on && grid !== null && labelFade(view.distance) > 0)`) and already writes it to each
element's opacity. The machinery is there.

What has to change is the **near end of `labelFade` alone**. Today it is
`1 - smoothstep(20000, 30000, d)`, which returns 1 at every close zoom. It becomes the same
expression `regionFade` takes, so a name and a boundary cannot disagree:

```ts
smoothStep(REGION_CLOSE_NONE, REGION_CLOSE_FULL, d) * (1 - smoothStep(20000, 30000, d))
```

`src/app/` may import `src/render/`, which `grid-labels.ts` already does, so the constants
come from `region-pass.ts` and no copy is made.

The existing gate then empties the overlay and skips the sweep below 5,000 light years on
its own. **No second gate is added in `create-map.ts`.** The unit test
`expect(labelFade(500)).toBe(1)` in `src/app/labels.test.ts` asserts what the new
requirement forbids and becomes `toBe(0)`.

### 8. The position format is a new helper in `src/hud/dom.ts`

```ts
export function formatCoordinate(value: number, separators: boolean): string;
```

It rounds to 3 decimal places, drops the trailing zeros and the trailing point, and adds a
thousands separator on the whole part when asked. `info-panel.ts` calls it twice per
coordinate, once for the field and once for the copy text, which removes `copyPosition`'s
own `Math.round`.

`toLocaleString('en-US', { maximumFractionDigits: 3 })` does the rounding, the dropping and
the separator in one call, and `{ useGrouping: false }` gives the copy form.

### 9. The width view is searched at a given zoom, with new premises

The width reading needs a chain that crosses a row of pixels within 5 degrees of vertical,
with nothing else of the same set beside it. `findVerticalCrossing` finds one today by
deriving the zoom from the run it found, so the chain leaves the frame at the top and the
bottom. That cannot reach the new band: the longest straight run is 3,800 light years in the
smoothed set and 3,306 in the traced one, a frame at 10,000 light years is 11,547 light years
tall, and the rule therefore ceilings the search at about 2,300.

The zoom becomes a parameter and two premises change. The run must cover the **reading row**
by 100 CSS pixels each way, not the whole frame. The `radius > 16000` premise goes: it was
there so the disc under the line could be brighter than the **dark outline**, and this change
removes the outline. A floor of 5,000 light years from the galactic centre takes its place, to
keep the reading off the bright core, where the one warm tone no longer lightens.

**The clearance stays at 60 CSS pixels.** I measured the search at 20 first, on the belief
that a longer run costs clearance. It does not: a long isolated run clears about half its own
length, so the runs that pass the 100 CSS pixel rule clear far more than 60. Lowering the
premise would buy nothing and would let a neighbouring band reach within 12 CSS pixels of a
reading whose own blur reaches 8.

Measured over the real boundary data at 1920x1080 and 10,000 light years, where one CSS pixel
is 10.69 light years: 282 smoothed runs and 2 traced runs cover the reading row by 100 CSS
pixels each way; of those, 24 smoothed and 2 traced clear 60 CSS pixels. The best smoothed run
is 3,701 light years, which is 346 CSS pixels, and clears 1,861 light years, which is 174.0
CSS pixels; the best traced run is 3,306 light years, which is 309 CSS pixels, and clears
1,653, which is 154.6. Every run that clears 60 sits at least 15,633 light years from the
galactic centre, so the new radius floor costs nothing.

**The other three searches take the same treatment.** They hold their reading windows in
light years, measured at a zoom of 1,600 where one CSS pixel covers 2.57 light years. At the
new zooms one CSS pixel covers 10.7 to 19.3, so the same numbers land inside the window the
reading excludes. The join search's comparison run, 40 to 200 light years from the bend, is
3.1 to 15.6 CSS pixels at the scenario's own 1920x1080 and 12,000 light years, and the reader
skips everything within 12, so only 3.6 CSS pixels of the window are usable. Each search therefore takes its
scenario's zoom and viewport and states its windows in CSS pixels. Measured over the real
data at the new figures: 6,713 bends hold the join premises, 10 nodes hold the traced corner
premises, and 4,613 points hold the both-sets premises.

The traced corner's arms grow from 20 CSS pixels to **48**. The comparison run reaches 40 CSS
pixels from the node, so an arm of 20 would put the far end of the run past the next node and
off the drawn line.

`findVerticalCrossing`, `findPointNearBothSets` and `findTracedCorner` each hold
`radius > 16000`, for the same reason the width search gives: the disc had to out-brighten the
dark outline. All three therefore take the same change, a floor of 5,000 light years from the
galactic centre in place of the ceiling. `findSharpCorner` holds no radius premise and takes
none. The premise decides the counts, not only the look: with the ceiling kept the traced
corner search gives 1 node and the both-sets search gives 474 points, so leaving it unstated
would leave the measurements unreadable. `NEIGHBOUR_ARC_LY` and the fold reach also stop being
module constants, because the join search and the traced corner search read at different zooms
and one light year figure cannot serve both. So does the reading radius: `readJoin` takes it
from the view, because the join reads at 8 CSS pixels and the traced corner at 6.

The search runs once for each set, and the constants file holds one crossing view for each. A
near-vertical straight run of the smoothed set is not a near-vertical straight run of the
traced staircase, so one view cannot serve both modes. The two width scenarios then read one
viewport and one zoom, `simplified` giving the unblurred band and `accurate` the blurred one,
which is also why they no longer need two viewports between them.

## Risks / Trade-offs

- **The background reading costs fill in every frame the grid draws.** → It is built only
  when the grid draws, but the halving chain reads about **1.33 frames** of texels, the
  first halving alone reading the whole frame. The budget scenario measures it against the
  1 ms the grid already holds to, and the grid used 0.012 to 0.042 ms of that before. If it
  does not hold, decision 1a's sparse first reduction takes the reads to about a third of a
  frame.
- **A label's opacity is one frame behind the picture.** → It is an opacity on a number, not
  a position. A frame is 16.7 ms.
- **The merge floor of 0.30 may still read as too strong or too weak over the core.** →
  The floor, the two edges and the tint are exported constants with a unit test on the
  function, so a change is one number. Task 9 samples the drawn frames numerically before
  the gate.
- **The band's alpha ripples along its own length,** because the coverage is a point-sampled
  ridge and `uPeak` is one number. → The ripple is at most 9 per cent at a radius of 3 CSS
  pixels and 3 per cent at 8, against 17 per cent for the line the map draws today. The
  blur makes it smaller at every radius it runs at, and the unit scenario reads twelve phases
  so the bound cannot be met by luck.
- **The band's width changes with the zoom in `accurate`,** from 3.0 to 3.5 CSS pixels where
  the blur does not run to about 7.0 where the cap holds the radius, and about 4.8 at 10,000
  light years, which is the widest a user sees at full opacity. → It is a consequence of tying the radius to the
  cell, and it is wanted: the wider band is where the staircase is worst. The requirement
  states the table, the unit scenario pins all four widths, and the browser width scenario
  reads the pair the two modes give at one zoom.
- **The overlay is gone below 5,000 light years, so a user at a close zoom cannot see a
  boundary at all.** → This is the decision the user asked for. The HUD's top bar still
  names the region under the cursor at every zoom, and `regionNameAt` on the handle answers
  for any plane point, with `regionNameAtScreen` beside it.
- **Two active changes rewrite the same `galactic-regions` requirements.** → This change
  declares the older requirement `REMOVED` and adds a differently named one, and its other
  two blocks are copied from the in-flight change's own text. `library-datasets-and-publishing`
  must archive first; `openspec validate` passes today and a task checks it again before
  the gate.

## Migration Plan

No data migration and no public API change. The order is the only constraint:

1. `library-datasets-and-publishing` archives.
2. This change archives.

A rollback is a revert of the commit. The look constants are all exported, so a partial
rollback of one part of the look is a change of numbers rather than of structure.
