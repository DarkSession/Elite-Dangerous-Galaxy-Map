## Context

See proposal.md for the motivation and the measurements behind it. The renderer
after `far-view-look-second-pass` draws the volume at half resolution into one
target, blits it to the scene target, blurs it into a glow at one eighth of the frame
and adds that back, draws the points, and tone-maps. The look constants live in the
shaders and in `src/render/glow-pass.ts`, `src/render/volume-pass.ts` and
`src/render/renderer.ts`; the design of that change lists them.

Facts that shape this pass, measured on the current tree at 1280x720:

- The emission is `pow(density / peak, 0.35)`. The map's density around the ring at
  32,000 light years spans a factor 18 between its 10th and 90th percentiles, and
  the frame spans a factor 1.67 there. The power turns 18 into 2.75, and the glow
  and the tone curve take the rest.
- The glow gives almost all of the light above the disc. At the side view 6,000
  light years above the centre the frame reads 0.506 with the glow and 0.037 without.
- The sky gradient rises by one 8-bit step every one to three rows over about 150
  rows, and nothing dithers it.
- The bulge reads 0.875 from the centre out to 8,000 light years, because the tone
  curve `1 - exp(-L)` saturates there.
- The model's vertical profile is zero beyond 2,867 light years, and at that height
  the bulge still holds 0.6 percent of its mid-plane density, which the power raises
  to 17 percent of the peak emission. With the glow off, the bulge top is a hard
  edge. At 25,000 light years of zoom distance, 4,000 light years of height cover
  102 pixel rows and the largest drop between adjacent rows is 0.287.
- The first glow round samples the half-resolution target at taps 16 pixels apart on
  one row per output row, so it skips most of the source.
- The point cloud's samples are in random order and sit in one buffer with one
  camera-relative offset, so the first N samples are a uniform random subset of the
  cloud and one draw call reaches them.
- The band-pass texture measure of the spec, 5 x 5 mean less 41 x 41 mean over the
  block mean, reads 0.048 to 0.057 in the outer disc with every pass on, and 0.057 to
  0.137 with the volume alone.
- The gap pixel reads 0.350 today against its floor of 0.10.
- Every scenario reads the 8-bit frame, which is the tone-mapped value through the
  display gamma of 1/2.2 and the background blend. The arithmetic below is in that
  display space.
- The camera's pitch is clamped to 5 degrees and above, and the field of view is 60
  degrees, so at 1080 rows the focal length is 935 pixels.
- The page global reads one pixel per call. The new block measures read up to
  160 x 160 pixels per block, which needs a rectangle readback.
- `tsconfig.json` includes `e2e`, so a test that passes a switch the renderer does
  not declare fails the type check. The `clouds` switch lands in the types before
  the tests that use it.

## Goals / Non-Goals

**Goals:**

- The four gaps of the proposal closed, each with a scenario that fails today, and
  the scenarios that hold today kept as guards.
- The same pass structure, with one pass added. The data layers and the scene data
  do not change.
- The frame budget and the scene-data budget unchanged, with the cloud pass measured
  at its worst distance.

**Non-Goals:**

- Procedural noise. The chunk positions are samples of the density.
- A change to the model's vertical profile or its maximum height. The soft top is a
  renderer fade.
- A colour lookup texture. Four ramp stops in the shader are enough.

## Decisions

### Four ramp stops, keyed on the emission

The ramp stays a mix by the compressed value, with one more stop. Starting values:

| Stop  | Colour             | Range of the compressed value |
| ----- | ------------------ | ----------------------------- |
| haze  | (0.40, 0.42, 0.62) | up to 0.03                    |
| arms  | (0.86, 0.66, 0.48) | 0.10 to 0.30                  |
| band  | (1.00, 0.60, 0.42) | 0.50 to 0.60                  |
| core  | (1.00, 0.93, 0.78) | from 0.85                     |

The haze is blue-violet, the arms are tan with green above blue, the band is
orange-red, and the core is cream-yellow with green well above blue. The point ramp
moves the same way: the cool end to (0.72, 0.78, 1.00), the warm end to
(1.00, 0.86, 0.58), and the zone key scaled so the disc at Sol sits past the middle of
the ramp. The point sprites carry a large share of the disc's light, so their colour
sets the arm colour as much as the volume does.

Both fades multiply the compressed value before the tint, as the rim fade does today,
so the top of the bulge and the rim pass through the haze colour as they fade. That
is intended: the reference's bulge and rim both end in the violet haze.

Alternative considered: a one-dimensional colour texture. It moves the look out of the
shader into an asset, and the tuning loop gets slower, for four stops.

### Emission curve with two slopes

The compressed value becomes, with `r = density / peak` and the knee `k`:

```
r >= k:  pow(r, 0.35)
r <  k:  pow(k, 0.35) * pow(r / k, 0.70)
```

The knee starts at the density of the disc at Sol, `k = 4e-3`, where the compressed
value is 0.145. Above the knee nothing changes, so the bulge and the disc keep their
relation. Below it the slope doubles, so a factor 18 in the map becomes a factor 7.5
instead of 2.75. The tint keys and the extinction read the same compressed value, so
the ramp stops below 0.145 shift down with the curve; the table above already places
them.

The gap pixel, at 8 percent of Sol's density, keeps a wide margin: its emission falls
from 0.41 to 0.17 of Sol's, and with the lower exposure and the weaker glow the
estimate is about 0.25 against the floor of 0.10, from 0.350 today.

Alternative considered: one lower power for the whole range. It separates the bulge
from the disc again, which the first change's power of 0.35 was chosen to prevent.

### Tone curve that does not clip

The curve becomes `W * L / (1 + L)` on the luminance, with `W` the white level, in
place of `W * (1 - exp(-L))`. The two curves agree to first order at small `L` and
part above it: at `L = 4` the first gives 0.80 of `W` and the second 0.98. In display
space, with `W = 0.95`, the background 0.038 and the bulge's emission down by a third
at 5,000 light years:

| Centre `L` | Centre reads | 5,000 light years reads | Difference |
| ---------- | ------------ | ----------------------- | ---------- |
| 4.0        | 0.887        | 0.851                   | 0.036      |
| 2.5        | 0.845        | 0.796                   | 0.049      |
| 2.0        | 0.819        | 0.765                   | 0.054      |

The scenario asks for 0.03 between the centre and 5,000 light years and for the
centre between 0.8 and 0.97, so the exposure aims the centre at `L` near 2.5, which
reads 0.845 with 0.049 of fall-off. The 9,000 light year pixel sits far below the
bulge's emission, so its 0.05 step comes for free. The estimate of a third rests on
the bulge's profile with the exponent 1.518 and the radius 4,515 light years, and the
tuning session measures the real value.

The dither adds `(hash(x, y) - hash(x + 1, y + 1)) / 255` after the blend, where
`hash` is an integer hash of the pixel position in 0 to 1, so the sum is triangular
over plus or minus one step and the same at every frame.

### Glow: box downsample, narrower, weaker

The glow first downsamples the half-resolution target to one eighth of the frame with
two linear blits, each of which averages 2 x 2 texels, so the downsample is a 4 x 4 box
and reads every source pixel. The two blur rounds then run on the small target as
before. The sigma starts at 3 percent of the frame height per round, 4.2 percent net,
and the weight at 0.5.

The halo pixel at 49,000 light years is about 20 pixels past the rim at the default
view, and its glow source is the dim rim. The sky pixel at 6,000 light years is about
53 pixels above the disc at the side view, and its source is the bulge, about 13
times brighter. At today's net sigma of 46 pixels the sky's rise is 7.4 times the
halo's; at 30 pixels the geometry alone brings that to about 3.4 times. The sky
ceiling of 0.20 then allows a halo rise of about 0.047, and the spec's halo band of
0.02 to 0.05 sits inside that. If the tuning cannot hold both, the halo's lower bound
gives way before the sky's ceiling, because the sky is the owner's complaint.

Alternative considered: dropping the glow and letting the clouds carry the halo. The
clouds sit inside the rim, so the halo past it would vanish.

### Fade by height

The volume shader multiplies the compressed value by
`1 - smoothstep(1800, 2880, abs(point.y - uCentre.y))`, beside the fade by radius.
The disc holds nothing above 1,800 light years except in the bulge, and the fade
spreads the bulge's top over 1,080 light years, 27 rows at 25,000 light years of
zoom distance, so the drop per row stays under the 0.05 of the scenario. The centre
uniform already exists.

Alternative considered: a soft cut in the model's vertical profile. The model is data
with a fixture, and the reason for the cut is a look choice.

### Cloud pass

A new pass draws the first 10,000 samples of the point cloud as instanced quads: a
second vertex array over the same position and tint buffers with the attribute
divisor set to 1, plus a corner attribute for the four vertices of the quad.
`createPointBuffers` builds that vertex array beside the point one and exposes it on
`PointBuffers`, so it shares the buffers' lifetime: `setPointCloud` rebuilds and
disposes both together, and the cloud pass holds no buffer of its own. Instanced
quads, not point sprites, because a point is discarded whole when its centre leaves
the clip volume, so 128-pixel point sprites would pop at the frame edge as the user
pans, and because implementations cap the point size. The pass draws into the
half-resolution target after the volume, with additive blending.

Each sprite wants a radius of 1,500 light years on the screen, computed from the
camera-relative range as in the point pass, capped at 64 target pixels, which is 128
device pixels. The brightness scales by the square of the wanted over the drawn
radius, so the cap keeps the total light of the sprite. The cap is reached below
22,000 light years of zoom distance. The fragment shader uses the fall-off
`(1 - r^2)^2` and the colour `mix(haze, arms, zone)`, with the same two constants as
the volume ramp; the colour follows the design and the baseline pins it. A brightness
uniform starts at a value that puts about a quarter of the haze light in the clouds
at the default view, and a fade uniform `smoothstep(6000, 12000, distance)` from the
view's zoom distance turns the pass off at close range, so the pass draws nothing at
2,000 light years and is fully on from 12,000.

The sprites are samples of the detailed density, with heights from the vertical
profile, so from above they cluster where the map is dense, and from the side they
stick out of the disc at their own heights. Inside one sprite's footprint the map's
own structure averages out, so what the band-pass measure reads is the random
placement of the sprites, weighted by the density. That is how the game's own map
builds its haze, from placed cloud sprites, and it is what the owner describes as
chunks. The count and the cap are spec-level bounds; the radius, the brightness and
the fade distance are free to tune, with the fade complete by 2,000 light years.

The radius trades the two chunk scenarios against each other. At the default view a
1,500 light year sprite is 31 pixels across and sits inside the 5 to 41 pixel band of
the measure; at the side view's 40,000 light years it is 47 pixels across, at the
edge of the band, so the side-view threshold is the harder one. A smaller radius
helps the side view and costs the view from above; the tuning session picks the
radius on the side view first.

Drawing the sprites into the half-resolution target puts them under the glow and
gives the glow the same source as before.

The renderer gets a `clouds` switch in `PassSwitches`, `setPasses`, `LookSettings`
(the brightness) and the page global. The point-alone smoke test switches the clouds
off with the volume and the glow.

Alternative considered: a 3D noise texture multiplied into the volume. That is
procedural, a non-goal, and it adds texture that the map does not have.

Alternative considered: a second point cloud from the worker. The same samples serve,
and the worker and the scene data stay untouched.

### Rectangle readback for the tests

The renderer gets `readRect(x, y, width, height)`, one `readPixels` call over a
rectangle in CSS pixels, and the page global exposes it beside `readPixel`. The block
measures, the ring reads and the column reads use it, so a 160 x 160 block is one
call instead of 25,600. The stable-dither scenario compares two Playwright
screenshots as buffers, which keeps the readback out of the loop.

### Tuning order

1. The ramp and the point colours, against the colour scenarios.
2. The curve, the knee and the exposure, against the bulge, the gap and the patch
   scenarios.
3. The glow, against the halo and the sky scenarios.
4. The clouds, against the chunk scenarios and the frame budget at 12,000 light years.
5. The baseline.

If a scenario cannot be met without breaking another, the tuning session changes the
threshold in the spec and states why, as the second pass did with the glow sigma.

### Testing

The look test gains the scenarios of the spec. Some fail today and some guard a
property the tree already has; the tasks name which is which. `e2e/helpers.ts` gains
a rectangle reader, a 5 x 5 mean reader, a ring reader, a block band-pass reader and
a column reader, so each scenario is a few lines. The side-view scenarios open the
map with a fragment that starts with `#`, which `openMap` passes through to
`page.goto`. The frame budget test adds the distance of 12,000 light years to its
list, so the cloud pass is measured at its worst.

## Risks / Trade-offs

- [The scenarios conflict, for example the halo floor against the sky ceiling] →
  The tuning order above, and a spec change with a stated reason as the last resort.
- [The cloud sprites cost fill] → The cap of 64 target pixels and the fade below
  12,000 light years bound the fill at 41 million target pixels; the frame budget
  scenario at 12,000 light years measures it.
- [The dither changes the baseline by one step in every pixel] → Playwright's
  comparison has a per-pixel colour threshold of 0.2 by default, well above one step,
  and the dither is the same at every frame.
- [The band-pass measure also reads arm structure at the 41-pixel scale] → The
  threshold of 0.10 is above the 0.048 to 0.057 of today with every pass on, and the
  clouds add texture inside the band. The volume alone reads up to 0.137 already, so
  the measure is reachable without the clouds where the map is patchy; the "Clouds
  carry light" scenario checks the clouds separately.
- [The tone curve change moves every scenario at once] → Step 2 of the tuning order
  reruns the whole look test.
- [Archiving order] → `far-view-look-second-pass` is archived first.

## Open Questions

- The final constants. They tune the look inside the scenarios and do not change the
  specs. The tuning session records the reached values here: the ramp stops and
  colours, the knee and the low slope, the exposure and the white level, the glow
  sigma and weight, the cloud radius, brightness and fade, the point colours.
- Whether the near view of a later phase keeps the clouds at some distance, or
  replaces them with its own haze. The fade uniform makes either possible.
