## Context

See proposal.md, Why. The archived change
`openspec/changes/archive/2026-09-08-far-view-colour-and-texture/design.md` records,
under "What the tuning could not reach", the value each scenario reads, the lever that
holds it there and why that lever cannot move. The readings come from one run of the
look suite on the hardware renderer, and the same run passes the baseline scenario, so
the tree that reads them is the tree the baseline pins.

The "Before" column is the reading on the tree before `far-view-colour-and-texture`,
from the archived design's context, with the same measure.

| Scenario                                | Before | Reads | Was  | Becomes    |
| --------------------------------------- | ------ | ----- | ---- | ---------- |
| Patch contrast at 20,000 light years    | 1.27   | 1.25  | 1.6  | 1.2        |
| Bright quartile blue less red at 44,000 | 0.045  | 0.095 | 0.02 | no ceiling |
| Rim puff ratio at 44,000 light years    | 1.45   | 1.76  | 2.5  | 1.6        |

## Goals / Non-Goals

**Goals:**

- Every look scenario passes on the tree the owner accepted, with no look constant
  moved.
- The rim puff floor of 1.6 rejects the tree before `far-view-colour-and-texture`,
  which read 1.45. The floor of 1.2 at 20,000 light years does not: that tree read
  1.27, and the ring guards only against a loss of the contrast the frame has. The
  dropped ceiling at 44,000 rejects nothing.

**Non-Goals:**

- No new measurement and no new scenario.
- No change to the readings' method: the 72 ring points, the 5 x 5 mean and the
  corner subtraction stay.

## Decisions

### What each value rejects, and what it does not

The frame reads 1.25 at 20,000 light years; the floor is 1.2. The 8-bit quantisation
of a 5 x 5 mean at a luminance near 0.4 moves a reading by less than 0.002, and the
dither is stable between frames, so the 0.05 margin holds. The floor of 1.0 would
never fail, and 1.25 would fail on the next constant change. The predecessor added
this ring to raise its contrast toward the reference's 2.15 and did not: the tree
before it read 1.27. So the ring at 1.2 is a floor against a loss of contrast, not a
guard on a gain. The owner may drop the ring instead; the proposal records the
reference value to return to either way.

The rim reads 1.76; the floor is 1.6. The tree before `far-view-colour-and-texture`
read 1.45, so 1.6 still fails on that tree. Nobody measured the accepted tree with the
spread alone removed, so the floor guards the change as a whole, not the spread by
itself.

The bright ceiling at 44,000 is dropped rather than raised. The glow tint at 0.8 lifts
blue less red over the whole ring, both quartiles, and the dark floor at 38,000 reads
0.108 against 0.10, so the tint cannot come down. A ceiling of 0.11 would pass, but
it would state that the bright quartile is blue, which is the opposite of what the
scenario is named for. The scenario keeps its name and its ceiling at 38,000, where
the bright quartile reads 0.00.

Alternatives, and why not:

- **Drop the three scenarios.** The dark floors and the two outer patch rings still
  carry the look this change and its predecessor built, and the rim ratio still guards
  the change as a whole. Dropping them loses that.
- **Keep the thresholds red until a texture lever exists.** Three red tests hide the
  next failure, and the branch cannot merge green.

### The point shader keeps its zone key

The archived design records that `ZONE_SCALE` moved from 4 to 6 in the point shader,
which the approved proposal's non-goals had excluded; the archived proposal and design
were corrected during the apply to admit it, and the cloud shader holds 6 as well. The owner accepted the frame with it, the baseline
pins it, and reverting it would need a new baseline and a new run of every colour
scenario. The roadmap records the ruling in one sentence.

## Risks / Trade-offs

- [A later texture change reads these three as the target] → the proposal's non-goals
  name the values the reference reads as the values to return to when a lever exists:
  2.15 at 20,000 light years, 12.2 for the rim ratio and a bright quartile at 44,000
  of -0.010.
- [The margin at 20,000 is small] → the reading depends on the sprite ceiling, the point
  brightness and the volume's knee and ramp, all look constants the baseline pins; a
  change to any of them regenerates the baseline and rereads this scenario.
