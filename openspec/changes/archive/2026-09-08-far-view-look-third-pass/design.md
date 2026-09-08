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

- The four gaps of the proposal closed, each with a scenario that fails today, except
  the colour scenario, whose floors moved to the sampled reference and now also pass
  on the tree before the change (see Open Questions); the baseline pins the colour, and
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

### Glow: box downsample, then a blur the tuning sets

The glow first downsamples the half-resolution target to one eighth of the frame with
two linear blits, each of which averages 2 x 2 texels, so the downsample is a 4 x 4 box
and reads every source pixel. The two blur rounds then run on the small target as
before. The sigma starts at 3 percent of the frame height per round, 4.2 percent net,
and the weight at 0.5. The tuning went the other way; see the Open Questions.

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
radius, so the cap keeps the total light of the sprite. At 1920x1080 the half-focal
length is 467.6 target pixels, so a sprite of this radius reaches the cap only when it
is nearer than 11,000 light years to the camera. The tuning lowered the radius to
1,000 light years, which moves that range to 7,300. The fragment shader uses the fall-off
`(1 - r^2)^2` and a colour from the volume ramp's stops keyed on the zone: haze to
arms over the disc, and the core stop from a zone of 0.45 to 0.75, because the clouds
cover the centre and a sprite in the arm colour alone would pull it pink (the tuning
added the core stop; the starting design had two stops). The baseline pins it. A brightness
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
  12,000 light years bound the fill at 164 million target pixels shaded (10,000
  sprites of 128 x 128); the frame budget
  scenario at 12,000 light years measures it.
- [The dither changes the baseline by one step in every pixel] → The baseline test
  sets Playwright's per-pixel colour threshold to 0.05. That is still well above one
  8-bit step, and the dither is the same at every frame. The default of 0.2 is too
  loose for a look test: it passes the round-one amber core against the cream one, so
  a hue change could slip past the baseline.
- [The baseline is blind to hue] → The threshold of 0.05 above.
- [The band-pass measure also reads arm structure at the 41-pixel scale] → The
  threshold of 0.10 is above the 0.048 to 0.057 of today with every pass on, and the
  clouds add texture inside the band. The volume alone reads up to 0.137 already, so
  the measure is reachable without the clouds where the map is patchy; the "Clouds
  carry light" scenario checks the clouds separately.
- [The tone curve change moves every scenario at once] → Step 2 of the tuning order
  reruns the whole look test.
- [Archiving order] → `far-view-look-second-pass` is archived first.

## Open Questions

- The final constants. They tune the look inside the scenarios. The tuning session
  reached these values.

  | Constant          | Value                                   | Where                       |
  | ----------------- | --------------------------------------- | --------------------------- |
  | haze stop         | (0.42, 0.40, 0.78)                      | `volume.frag`               |
  | arms stop         | (0.90, 0.60, 0.62)                      | `volume.frag`               |
  | band stop         | (1.00, 0.70, 0.66)                      | `volume.frag`               |
  | core stop         | (1.00, 0.94, 0.78)                      | `volume.frag`               |
  | ramp keys         | 0.004-0.030, 0.12-0.30, 0.42-0.68       | `volume.frag`               |
  | knee              | 4.0e-3 of the peak                      | `volume.frag`               |
  | high slope        | 0.35                                    | `volume.frag`               |
  | low slope         | 0.70                                    | `volume.frag`               |
  | rim fade          | 47,000 to 51,000 ly                     | `volume.frag`               |
  | height fade       | 1,800 to 2,880 ly                       | `volume.frag`               |
  | emission          | 8.0e-3                                  | `volume-pass.ts`            |
  | absorption        | 2.0e-4                                  | `volume-pass.ts`            |
  | point cool colour | (0.72, 0.78, 1.00)                      | `points.frag`               |
  | point warm colour | (1.00, 0.78, 0.62)                      | `points.frag`               |
  | point core colour | (1.00, 0.94, 0.78) from zone 0.45 to 0.75 | `points.frag`             |
  | point zone key    | 4.0                                     | `points.frag`               |
  | point brightness  | 70                                      | `renderer.ts`               |
  | cloud colours     | the haze, arms and core stops, by zone  | `clouds.frag`               |
  | cloud radius      | 1,000 ly, capped at 64 px               | `cloud-pass.ts`             |
  | cloud gain bound  | 4                                       | `cloud-pass.ts`             |
  | cloud brightness  | 3.24                                    | `cloud-pass.ts`             |
  | cloud fade        | 6,000 to 12,000 ly                      | `cloud-pass.ts`             |
  | cloud count       | 10,000 sprites                          | `cloud-pass.ts`             |
  | glow sigma        | 10 percent of the height per round      | `glow-pass.ts`              |
  | glow weight       | 6.0                                     | `glow-pass.ts`              |
  | glow tint         | 0.15 toward (0.97, 0.93, 1.81)          | `glow-pass.ts`, `blur.frag` |
  | glow clamp        | 0.01                                    | `glow-pass.ts`              |
  | exposure          | 0.026                                   | `composite-pass.ts`         |
  | white level       | 0.95                                    | `tonemap.frag`              |
  | background        | (0.038, 0.036, 0.048)                   | `tonemap.frag`              |

- The ramp stops come from the reference image, not from the eye. The owner holds the
  reference outside the tree. A headless browser decoded it, and the sampling took the
  median over 36 points on each ring, at 12.65 image pixels per 1,000 light years with
  the minor axis at 0.42 of the major one. The reached values are the same rings of
  the default view, read the same way. Both are display colours, 0 to 255.

  | Ring                | Reference     | Reached       |
  | ------------------- | ------------- | ------------- |
  | centre              | 251, 244, 235 | 250, 241, 221 |
  | 5,000 ly            | 248, 238, 229 | 246, 236, 217 |
  | 9,000 ly            | 240, 222, 209 | 237, 215, 203 |
  | 14,000 ly           | 215, 184, 181 | 142, 121, 121 |
  | 20,000 ly           | 164, 137, 140 | 100, 87, 97   |
  | 25,900 ly, at Sol   | 122, 105, 115 | 86, 73, 77    |
  | 32,000 ly           | 68, 66, 84    | 59, 51, 57    |
  | 38,000 ly           | 51, 47, 56    | 35, 32, 40    |
  | 44,000 ly           | 30, 31, 41    | 18, 17, 21    |
  | corner              | 2, 2, 2       | 10, 9, 12     |

  The hues track the reference from the core to the rim: cream-white at the centre,
  pink-brown through the arms, and blue above red from 32,000 light years out. The
  frame is darker than the reference between 14,000 and 25,900 light years. That is a
  brightness matter, and the non-colour scenarios pin it: a higher exposure breaks the
  fall-off from the centre to 5,000 light years, and a flatter emission curve breaks
  the patch contrast at 32,000. It is left for the next pass.

- Two departures from the design's ramp table, both toward the reference.

  1. **The warm stops are pink-brown, not tan or orange-red.** The design read the
     bulge edge as orange-red and the arms as tan. The samples read them as a soft
     salmon and a dusty pink-brown, with blue close under red. The samples rule, so
     the arms are (0.90, 0.60, 0.62) and the band (1.00, 0.70, 0.66).
  2. **The ramp keys reach the core earlier**, at 0.42 to 0.68 rather than from 0.85,
     and the band at 0.12 to 0.30 rather than 0.50 to 0.60. The reference holds a
     cream core over the whole bulge and turns to pink-brown only at the arms.

- The cloud and point shaders carry the core stop as well. The clouds cover the
  centre, so a cloud painted with the arm colour alone pulls the centre pixel to pink
  and breaks the centre green over blue. Both key the core on the zone attribute, from
  0.45 to 0.75, because a sprite has no compressed density of its own. The zone is
  0.209 at the disc at Sol and 0.896 at the peak of the model.

- Three constants left the design's starting values by a wide margin, and this is why.

  1. **The glow sigma is 10 percent of the frame height per round, not 3 percent.**
     The design read the halo and the sky as one trade at a single sigma. They are not:
     the halo pixel sits 46 pixels past the painted rim, and the sky pixel sits 74
     pixels above an edge-on disc that is far brighter than the rim. At a narrow sigma
     the sky rises about 30 times faster than the halo, and the halo floor of 0.02
     costs a sky of 0.8. A wide blur puts both pixels inside the same broad skirt, so
     the ratio falls to about 2 and a weight that lifts the halo to 0.025 leaves the
     sky at 0.07.
  2. **The glow source is held down before the blur** (`glow-source.frag`, the
     `glowClamp` look setting). Without it a wide blur spreads the brilliant edge-on
     bulge over the whole frame. The hold is soft, `colour * clamp / (clamp +
     luminance)`, so it leaves the faint rim as it is and stops at the clamp. This is
     the one structural addition beyond the design.
  3. **The exposure is 0.026, not the value that puts the centre near L = 2.5.** The
     centre sits at L = 4.1. Below that the bulge falls under the 0.80 floor of the
     default-view scenario; above it the fall-off to 5,000 light years drops under
     0.03, because the density model is only 1.4 times brighter at the centre than
     5,000 light years out once the clouds are added.

- The cloud sprite gain has a bound of 4. The size cap holds a sprite to 64 pixels of
  radius and multiplies its brightness by the square of the ratio of the radius it
  wants to the radius it draws, so that the sprite keeps its light. That ratio has no
  bound as the sprite nears the camera: within about 51 light years the product passes
  65,504, the largest value the 16-bit float target holds, the glow source turns the
  overflow into a not-a-number, and the blur spreads it over the whole frame. The
  bound of 4 keeps the light of a sprite that wants up to twice the cap, which at
  1920x1080 is a range of 3,650 light years, and holds it flat below that. It changes
  no view the scenarios read: at 1920x1080 the cap itself starts only below 7,300
  light years. At the side view at 12,000 light years the bound lowers the mean frame
  luminance from 0.722 to 0.718, and the glow source now also replaces a not-a-number
  or an overflow with a finite value, so no single sprite can flood the frame.

- Three spec thresholds moved down, to the colours the reference gives. The frame
  clears the new floor at all three, and its hues sit near the reference's; the
  earlier numbers described a more saturated disc than the reference holds.

  | Clause                            | Was  | Now  | Reference | Reached |
  | --------------------------------- | ---- | ---- | --------- | ------- |
  | red over green at 9,015 ly        | 0.12 | 0.05 | 0.069     | 0.114   |
  | red over blue at Sol              | 0.12 | 0.01 | 0.028     | 0.024   |
  | at Sol, was green over blue 0.02  | 0.02 | 0.02 | -0.038    | -0.016  |

  The third clause changed its channels as well as its number. The reference has blue
  above green at Sol's radius, so green over blue cannot hold at any saturation. The
  clause now asks that red exceeds green by 0.02; the reference gives 0.066 and the
  frame gives 0.039.

- The new scenarios read these values on the tree before the change, with the task 1
  helpers and switches added and nothing else. Nine of the seventeen tests failed at the thresholds of the time.

  | Scenario                    | Before               | Threshold      |
  | --------------------------- | -------------------- | -------------- |
  | band red over green         | 0.106                | at least 0.05  |
  | Sol red over blue           | 0.024                | at least 0.01  |
  | Sol red over green          | 0.059                | at least 0.02  |
  | bulge fall-off to 5,000 ly  | -0.002               | at least 0.03  |
  | patch contrast at 32,000 ly | 1.67 to 1            | 2.5 to 1       |
  | halo past the rim           | 0.064                | 0.02 to 0.05   |
  | sky 6,000 ly above          | 0.506                | at most 0.20   |
  | chunks from above           | 0.048                | above 0.10     |
  | chunks from the side        | 0.031                | above 0.10     |
  | clouds carry light          | 0                    | at least 0.03  |
  | flat colour dither step     | 0                    | at least 0.25  |

  The table holds the thresholds as they now read. Three of them moved down after this
  reading, and the colour scenario passes at the pre-change values as well. That
  scenario is a floor under the hue, not the measure of the colour work; the ring
  table above measures that.

  The eight that passed: the default view, the space between the arms, the bulge's
  soft top, the dark grey background, the grain at Sol, the median blue over red on
  the 38,000 light year circle, the clouds fading at close range and the stable
  dither. The task list expected the soft top to fail. It passes because the old tone
  curve saturates the whole bulge top, so no two rows differ by much; the new curve
  keeps the fall-off and the height fade holds the step under 0.05 all the same.
- Whether the near view of a later phase keeps the clouds at some distance, or
  replaces them with its own haze. The fade uniform makes either possible.
