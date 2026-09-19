## Context

See proposal.md for the motivation. Four facts about the renderer shape this design.

The frame already draws the density volume and the cloud sprites into a **half-resolution
target**, blits that into the scene target, adds a blurred copy of it as the glow, then
draws the points and the star field, then tone maps.

The cloud pass is already a sprite pass over instanced quads with a per-sprite radius, a
tint and a shape atlas, so most of the machinery a nebula pass needs is in the tree.

The default view opens at a zoom distance of **60,000 light years**, and the far view has
a pinned baseline image at that distance.

The library's entry chunk has a guard at 254,000 bytes and the last reading is 253,520,
so **480 bytes** of room. Shaders reach that chunk as text, so new passes cost it.

The sprite art is a composite of emission and absorption through a cloud, in linear
radiance, held in this repository as one atlas. It already carries what makes a nebula
bright or dark. A record carries a position, a radius and a tile index; it carries no
colour and no brightness.

## Goals / Non-Goals

**Goals:**

- One pass, one blend state, one draw call.
- The mid-zoom view gains the structure it lacks, including the recognisable outlines of
  the largest nebulae.
- The far view and its pinned baseline image do not change.
- The two data files stay under 2 MiB in total, live in this repository, and stay out of
  the entry chunk. The goal was 110 KB while the atlas held 64 texel tiles; the delivered
  atlas holds 256 texel tiles and 793 KiB, which the change records where it takes that
  decision.

**Non-Goals:**

- A volumetric nebula. This draws a flat sprite. The close band where that shows is out
  of scope, not approximated.
- A generating step in the tree. The records and the atlas are committed project data
  with a fixture, as the galaxy model is.
- Any change to the point pass, the star field or the tone map.

## Decisions

### The pass draws into the half-resolution target, after the clouds

**Alternatives:** draw into the scene target after the star field, which is where correct
occlusion of stars would need it; or give the pass its own target and composite it.

**Chosen:** the half-resolution target, beside the volume and the clouds.

It costs a quarter of the fragments, needs no new target, needs no depth buffer, and the
glow reads the nebulae for free because the glow already reads that target. The glow's
guard in `src/render/renderer.ts` runs the glow only when the volume or the clouds drew,
so the nebula switch joins that guard.

**What it costs:** the point cloud and the star field draw *over* every nebula, so a star
behind a dark nebula still shows. This is wrong and it is accepted. In the band where
nebulae read, the point cloud is a diffuse haze that stands for stars in front of and
behind a cloud alike, so drawing it over is close to the truth and much cheaper than a
depth-sorted alternative.

### Both data files load as fetched assets, and the chunk guard still moves

**Alternatives:** import the records as a JSON module, as `src/galaxy-model/` imports its
parameter file.

**Chosen:** `?url&no-inline` for both files, as `src/galaxy-model/detail.ts` and
`src/hud/styles.ts` already do for the detail image and the fonts.

The parameter file is 12,966 bytes. The record set is 14,626 bytes, and the entry chunk
has 480 bytes of room under its guard. A JSON import would break the bundle test at once,
and raising the guard to carry data the frame does not need at start is the wrong trade.

The cost is that the set is not there in the first frame. The pass draws nothing until the
asset arrives, which is the same behaviour the detail image already has. If the fetch
fails, the loader throws a typed error as `detail.ts` does, `src/app/` reports it, and
every other pass keeps drawing.

This does not save the guard. The entry chunk already holds 26 shader sources as text,
about a quarter of its bytes, and the cloud vertex and fragment pair alone is 9,014. The nebula shaders, the pass, the
set and the wiring come to about 10 KB, which 480 bytes cannot hold. The guard moves to
**270,000**, the next round figure above the new reading of 266,996 bytes. Keeping the
data out of the chunk is still right: it holds the move to one step of about 12 KB rather
than 50.

### The record set is committed whole, not joined to the installed catalogue

**Alternatives:** commit only a radius and a tile index per nebula, and take the name and
the position by a join against the almanac package the repository already installs.

**Chosen:** commit all 358 records whole.

The two sets are not the same set. The package holds 346 real and procedurally generated
nebulae; this set holds 358. A join by name is therefore not total, and the rows that fail
to join are the rows the map would silently not draw. The saving is also small: the
positions and the names are most of 14,626 bytes, which is a fetched asset and not a
bundle cost.

The larger objection is the direction of the dependency. `src/` reads no nebula catalogue
today. A join would make the renderer's data depend on a package leaf whose contents can
change under a version bump, in a way the SHA-256 fixture over a committed file cannot.

### One blend: premultiplied source-over

**Alternatives:** an additive sub-pass for bright nebulae and a multiply sub-pass
(`ZERO`/`SRC_COLOR`) for dark ones, which is what the kind field in the packing input
suggests.

**Chosen:** one `over` for all 358, sorted back to front.

The art holds the emission and absorption together. A dark nebula darkens because its
tile holds low colour and high alpha; `dst = src + dst * (1 - a)` then attenuates without
a second blend state. There is no kind branch and no second draw call.

The art supports this without help. A dark tile reaches a peak alpha of **0.9946**, so it
already attenuates the background to under two percent. No opacity term needs to be added
on top, and none is.

`over` depends on the draw order, which additive did not, so the selected sprites sort by
range before they are written to the instance buffer. A sort of at most 256 items costs
nothing beside the fill.

### The tile lookup negates y, and a faded sprite collapses

The atlas uploads with `UNPACK_FLIP_Y_WEBGL` false, which is what the other textures of
the renderer do, so texture row 0 holds the top row of the file. The quad's top corner is
`aCorner.y = 1`, so a lookup of `aCorner * 0.5 + 0.5` puts the file's first row at the
bottom of the sprite and draws every tile upside down. The lookup negates y instead.

The cloud pass carries the same mapping without a fault, because its shapes are generated
and symmetric about both axes. Nebula art is not, so the fault is visible in principle and
invisible to every block mean the suite reads. One browser test states the orientation, on
a dark record whose tile holds two thirds of its alpha in the top half of the file.

The vertex shader also collapses a quad whose weight is 0. A record at weight 0 is one the
camera sits inside or one the size fade has taken out, and both reach the cap, so without
the collapse the frame lays a capped sprite of blended fragments that change nothing.

### Round sprites: no ellipsoid, no rotation

The packing input carries a second axis and a rotation for each nebula. The committed
record carries neither, and the pass reads neither.

A nebula is modelled as a cube scaled by one scalar, so the drawn shape is round whatever
the second axis holds, and a rotation of a round sprite is not visible. The nebula with
the most extreme axis ratio in the set, 14.3 to 1, is drawn round.

Dropping both removes the largest risk this work carried. It also removes the need for a
per-record orientation in the instance buffer.

### One tile per source, one projection, chosen at pack time

Each art source has three projections and the best-reading one differs. One large nebula
reads as a hook on one axis and as a flat mass on the other two; another reads as a shell
on one axis and as a filament on the other two.

**Alternatives:** hold all three and pick at runtime, which triples the bytes for a choice
that never changes; or use one axis for every source, which loses the outlines that make
the largest nebulae recognisable.

**Chosen:** pick one projection per source once, when the atlas is packed, and bake it. No
runtime cost and no runtime data.

The choice reaches the renderer as the tile index in the record, which the data layer
holds. `src/render/` never reads a projection and never maps a nebula to a tile; it reads
the index the instance buffer carries.

### The atlas is WebP, uploaded as sRGB

34 tiles in a 6 by 6 grid, RGBA, at **256 texels a tile**, which is 1536 by 1536.

The near end of the zoom band is open, so a sprite draws up to three quarters of the
canvas height in radius. That is 1080 CSS pixels across on a 720 pixel canvas, where a 64
texel tile is magnified 17 times and reads as a blur. 256 holds the magnification to 4.2
times, and the file stays one fetch of at most 2 MiB.

The renderer reads the tile side from the file rather than holding it as a constant: the
atlas side over the 6 columns of the grid. A pack at a different tile side is therefore a
drop-in, with no change in the code.

WebP at quality 90 keeps the alpha channel exactly lossless: the alpha round-trips with 0
error and the border ring stays at alpha 0. It costs the colour channels a mean of 1.7
levels in 255 over every pixel that is not fully transparent, with a 99th percentile of 7.
Quality 90 is 793 KiB against 1.65 MiB for WebP lossless. The worst single pixel is in the
one tile whose source carries the 4142 scale, whose core saturates at either quality.

The committed file is 1536 by 1536 and 811,762 bytes, so 793 KiB. All 34 slots carry art,
so all 358 records draw.

**One projection per source.** Each source gives a front-to-back composite along each of
its three axes. The pack takes the axis with the largest covered fraction, and breaks a
tie in the order x, y, z. That rule is fixed, so the pack repeats.

**The stored value goes in as it is.** The sources hold radiance divided by a scale the
source states, which is 1 for 32 of the 34. Two sources carry a larger scale, and one of
those is 4142. Multiplying the scale back would clip that tile to white while every other
tile sits near a seventh of the range, so the pack writes the stored value and those two
tiles read as the brightest of the set.

The texture uploads as `SRGB8_ALPHA8`. The hardware then decodes the colour channels to
linear on sample and leaves the alpha linear, which is exactly the split the data needs:
the colour channels hold radiance and need the curve's precision in the dark, and the
alpha holds opacity and must not be bent.

Each tile is zero at its border and the shader insets its lookup by half a texel, with the
pattern `src/render/shaders/clouds.vert` already uses for the shape atlas. Linear
filtering then cannot reach a neighbour's texels.

### A zoom band, closed at the far end alone

**Alternatives:** rely on the 1.5 CSS pixel size floor at the far end; close the band at
the near end as well, as a first draft did with 3,000 and 6,000 light years.

**Chosen:** a weight on the zoom distance, 1 from the closest zoom up to 12,000 light
years and 0 at and above 20,000. This is the pattern `CLOUD_FADE_FAR` already uses in
`src/render/cloud-pass.ts`, with the near end left open.

**The far end.** The floor alone does not hold. At the default view of 60,000 light years
the half focal length is 623.5 pixels at a 720-pixel canvas, so the floor admits any
radius above 144.3 light years. One record, at 200 light years, passes it and would draw
over the pinned baseline image. With the camera at the default cursor and a pitch of 35
degrees, the count above the floor is 1 at 60,000, 3 at 40,000, 7 at 30,000 and 55 at
12,000. The count is measured from the camera to each record, not from the zoom distance
alone. The band ends at 12,000 to 20,000 because that is where the arms and the bulge
take the frame over and a nebula is a few pixels wide.

**No near end.** A close view is where a record is large enough to read as more than a
dot, so closing the band there took the feature out of the views it is most worth. The
two problems a near end was drafted to solve are held on the record instead, where they
belong:

- The camera **inside** a cloud: `nebulaInsideFade`, full at three record radii and zero
  at one.
- A sprite that **fills the frame**: `nebulaSizeFade`, full at and below a quarter of the
  canvas height of apparent radius and zero at three times that.

The two fades multiply. They read different measures, and neither one covers the other at
every field of view: the inside fade reads the range in record radii, and the size fade
reads what the viewer sees.

Two existing measurements were the reason for the near end, and both still hold:

- `far-view-rendering`'s **Frame budget** measures 2,000 light years. The nebula pass now
  draws there, so the budget covers it: the readings at 12,000, 20,000 and 30,000 light
  years are recorded in the tasks file and every mean stays under 16.7 ms.
- `close-view-stars` reads the **mean luminance of the whole frame** at
  `#c=0,0,0&d=2000&p=35&y=0` with a limit of 0.002. The scenario compares two readings
  that both hold the nebulae, so the same nebula light is in both.

### One brightness constant for every nebula

One constant in the look settings beside the cloud brightness, scaling the colour channels
only and never the alpha. It is one value for every record and every tile: no per-record
or per-tile brightness exists in the data, and none is invented.

Its value is a look choice. It is set by eye, recorded as a named constant, and pinned by
a browser test so a later change cannot move it unnoticed. The starting value was 2, and
the value set by eye is **8**: at 2 a bright nebula reads as almost nothing against the
volume behind it, and at 16 the edge of the sprite quad shows.

### Selection scans all 358 every frame

No spatial index. 358 records is small enough to compute an apparent radius for each,
take those above the floor, keep the largest 256 and sort them, in well under the frame
budget. A quadtree would be more code for a set this size.

A count, rather than a distance threshold, is what bounds the cost: a threshold lets an
unbounded number of nebulae qualify as the camera pulls back through the mid-zoom band.

### The size floor bounds the count, and the budget guards a larger file

The budget started at 32. Over every camera position of the record file, between 143 and
184 records reach the 1.5 pixel floor near the core on a canvas 1,080 CSS pixels tall, so
a budget of 32 dropped four fifths of what the floor let through, and the cut landed
among the records the eye reads. The budget is now 256, above the 184 the floor admits at
1,080 CSS pixels and the 225 it admits at 2,160. A unit test sweeps the file over a camera
at each record, a 1,000 light year grid over the disc and a 100 light year grid over the
core, and holds both figures.

The records this adds are the small ones. Over 400 camera positions through the disc and
one at each record, the worst total sprite area is 0.37 of a 1920 by 1080 screen with a
budget of 32 and the same 0.37 with a budget of 400: the large sprites are already in the
frame and the added ones are a few pixels across. The pass draws at half resolution, so
that worst case lays 0.09 of a screen of fragments.

### Both cuts fade, so nothing pops

The floor and the budget are hard cuts, and a record that crosses one with weight
appears and disappears in one frame.

The budget is the one the viewer saw at 32. Its cut is not a property of one record: the
budget keeps the largest N, so the cut is the size of the record at N + 1, which moves
with everything else the camera holds. A record of a steady apparent size therefore
crosses it as the camera turns. One measured case: at 6,000 light years over the records
near `-4000, 998, 12500`, one record holds 5.35 to 5.52 pixels through a full turn, while
the 33rd place moves between 3.96 and 5.56, so that record flashed on and off five times.

The fade band alone did not settle this. A reader then reported the record near
`-4813, 583, 10617` going out on a turn. At that view the cut of a 32 budget moves between
6.5 and 9.6 pixels, which is wider than the fade band, so a record of 8 pixels still went
from full weight to none. The budget of 256 takes the cut off the screen for this file,
and the fade band stays for a file that reaches it.

The fix is a fade band above each cut. The budget fade is 0 at the size of the largest
record the budget dropped and 1 at 1.25 times that size; the floor fade is 0 at 1.5
pixels and 1 at 3. The cut moves smoothly with the camera, so a record now reaches it at
weight 0. Measured over the same turn, the worst weight at an entry or an exit falls from
1.0 to 0.012, and the worst change across one degree is 0.11.

A fade band costs one more `smoothstep` per record and no extra draw. The alternative,
holding the drawn set steady between frames, needs frame-to-frame state in the selection
and still pops when the camera moves far in one frame.

A drawn sprite is also capped, at three quarters of the canvas height in CSS pixels.
Both the floor and the cap are stated in CSS pixels, so the pass moving to a target of a
different resolution does not change which nebulae draw or how large. Without a cap a
nebula the camera is close to lays fragments over an unbounded area, once for every
record the frame draws.

The cap sits where the size fade has already reached 0, and not at the fade's start. A
cap the viewer can see makes a sprite stop growing while the scene around it keeps
growing, which reads as the nebula shrinking as the camera comes in. The fade takes the
weight and the cap takes only the fill, so the sprite holds the size the perspective
gives it for as long as it can be seen.

## Risks / Trade-offs

**The brightness constant is set by eye** → It is pinned by a browser test, so a later
change that moves the look fails a test rather than passing unnoticed.

**Stars and points draw over nebulae** → Accepted and stated above. If it reads badly in
practice, the pass can move to the scene target later with no change to the data, the
atlas or the spec's observable behaviour except the pass order.

**A flat sprite cannot stand for a cloud the camera is inside** → The pass fades a nebula
out as the camera comes within it, so the failure is an absence rather than a wrong
picture.

**The atlas carries different licence terms from the map's other data** →
`THIRD_PARTY_NOTICES.md` gets a review before a release carries it, and the proposal
records this as an impact.

**The half-resolution target may not be float** on a context without the float blend
extension → `over` blends correctly into an 8-bit target as well; only the dynamic range
narrows, and the nebulae are low-radiance.

**The frame budget with the nebulae on is not yet measured** → `far-view-rendering`'s
frame budget requirement already measures 12,000, 20,000 and 30,000 light years, which is
the band where the nebulae draw in full, and `e2e/frame-budget.spec.ts` already runs in a
pass of its own. The tasks re-run it with the pass on rather than adding a second timing
test, so the claim is checked against the budget the project already states.

## Open Questions

- The exact brightness constant. It is a look value, and it changes no requirement, no
  interface and no task.
- Which projection each of the 34 sources uses. The table is produced when the atlas is
  packed and changes nothing outside that step.
