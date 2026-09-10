## Why

Phase 2 draws the galactic region boundaries as 22,513 separate axis-aligned runs on a
49 light year grid, each one device pixel wide and one flat colour. A boundary therefore
reads as a staircase of small disconnected lines rather than as a line. The labels decide
a region is in view from its axis-aligned bounding box and then hold every candidate
inside the frame with a 48 pixel inset, so a region with nothing on screen can keep a
label at the edge while the region the camera sits in goes unnamed until the zoom is
very close.

## What Changes

- The boundary trace produces **connected polylines** rather than loose segments. The
  boundary of the whole map is 123 chains, each one separating exactly one pair of
  regions, so the "one line between two regions" the map wants is what the trace gives.
- Each chain is **smoothed by averaging along it, reduced, and its corners then rounded**, so a
  boundary reads as a line rather than a staircase and carries no visible corner. No
  vertex of the drawn line turns by more than 20 degrees. The
  drawn line stays within one grid cell, 49.3494 light years, of the traced boundary,
  measured both ways, and turns at most 60 degrees for each 1,000 light years over the
  whole set, and at most 100 for any one chain, against the 1,062.8 of the raw
  staircase. One cell is the resolution of the source raster, so the
  line claims no accuracy the data does not have.
- The lines draw as **screen-space ribbons**: a 2 CSS pixel light core with a 1 pixel
  darker outline on each side. Today a line is one device pixel of one flat colour,
  which is half a CSS pixel on a high-density display.
- The overlay draws through a **coverage buffer**, so a join between two segments is one
  line rather than two overlapping quads blended twice.
- **The lines no longer fade out at close zoom.** They were removed below 3,000 light
  years because the staircase read as steps. A smooth line has no such fault, so the
  boundary now stays to the closest zoom and the user always knows which region they are
  in.
- **The labels follow what is on screen.** A coarse region grid joins the scene data, and
  the label code samples the frame, resolves the region under each sample and counts the
  samples each region holds. A region with too few samples gets no label.
  The region holding the sample nearest the centre of the frame is named first, so the
  region the view is centred on always carries a label; the rest follow by sample count.
  A label's anchor is worked out on the galactic plane and then
  projected, so it slides with the camera rather than stepping with the sample grid. It is
  the mean of its region's sample plane positions, and the sample its own region holds
  that is nearest that mean when the mean falls on another region, which is what a region showing as two separate
  patches needs. The anchor does not snap to the grid of samples, so a label moves with
  the camera rather than holding still and then jumping a whole sample spacing. A region
  that carries a label stays a candidate until its share falls below half the threshold,
  and its count carries a 1.2 bonus in the placement order, so a label does not blink. Bounding boxes, centroid projection and the behind-camera anchor
  rule all go.

Non-goals:

- A change to which regions exist or where their edges are. The geometry is the game's
  and this change only draws it better.
- Hand-authored regions, nebulae and permit locks. They stay out, as in phase 2.
- A change to the far view. The overlay still draws after the tone map, still draws
  nothing at 30,000 light years and above, and the committed baseline image is not
  retaken.
- Region fill or shading. Boundaries and labels only.

## Capabilities

### Modified Capabilities

- `galactic-regions`: the boundary set becomes connected, simplified and rounded chains;
  the lines draw as two-tone ribbons and keep drawing at close zoom; a label's candidacy,
  order and anchor come from the samples of the frame that fall on the region, the anchor
  moves with the camera rather than snapping to the samples, and the region under the
  centre of the frame is always named.
- `far-view-scene-data`: the scene data gains the coarse region grid the labels sample.
- `far-view-rendering`: the look reading of the top of the bulge switches the region
  overlay off with the other passes that are not the volume. The view it uses sits
  inside the fade-in band, and a 4 CSS pixel line crosses the column it reads.

## Impact

- **Sequencing.** This change edits `galactic-regions`, which
  `close-zoom-stars-and-regions` adds. That change is implemented but not archived, so
  this one cannot be archived before it. `openspec validate` reports this as an
  informational note today. Folding the work into that change instead was weighed and
  rejected; `design.md` says why.
- **New code.** The chain trace, the simplification and the rounding in
  `src/scene-data/region-lines.ts`; the coarse region grid beside it; the coverage buffer
  and the two-tone composite in `src/render/region-pass.ts` and its shaders; the screen
  sampling in `src/app/labels.ts`.
- **A look test loses the overlay.** The reading of the top of the bulge in
  `e2e/look.spec.ts` opens a view at 25,000 light years, inside the fade-in band, and
  reads one column of pixels through the plane. The thicker line makes a step of 0.14
  in that column against a limit of 0.05; the half CSS pixel line of phase 2 made one
  of 0.04. The test switches the overlay off with the points, the clouds and the glow.
  The limit does not move.
- **Changed code.** `src/scene-data/types.ts` and `src/scene-data/messages.ts` (the chain
  set and the coarse grid), `src/scene-data/region-lines.worker.ts`,
  `src/render/renderer.ts` (the coverage target), `docs/roadmap.md`.
- **Removed code.** The bounding box candidate test, the centroid anchor and the
  behind-camera negation in `src/app/labels.ts`, with their unit tests.
- **Scale.** The source raster is 2,048 by 2,048 cells of 49.3494 light years, which is
  the same data the map already reads. The trace gives 38,563 unit edges, 82 junction
  nodes and 123 chains. Smoothed by a capped average and then rounded, the set
  holds roughly 69,000 vertices, which is about 810 KiB of vertex data against the 528 KiB
  the loose runs need today. Removing a corner costs points. The label sampling reads about 2,000 screen points per
  frame and carries a budget of 2 milliseconds of the main thread at 1920x1080, because
  it runs in the page update where the frame budget suite cannot see it.
- **Tests.** New unit tests for the chain trace, the departure bound, the coarse grid and
  the screen sampling. New browser tests for the line width, the two-tone edge, the line
  at close zoom, and the two label defects this change fixes. The existing baseline image
  must still pass unchanged.
