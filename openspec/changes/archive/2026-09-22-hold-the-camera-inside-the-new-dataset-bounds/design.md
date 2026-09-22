## Context

`runLoad` in `src/app/datasets.ts` writes the set, then the bounds, then the view:

```
const report = options.write(content);
options.setBounds(entry.bounds ?? null);
if (entry.view !== undefined && !(atStart && options.hasStartView === true)) {
  options.applyView(entry.view);
}
```

`applyDatasetBounds` in `create-map.ts` does two things, and the second one is the trap:

```ts
const applyDatasetBounds = (bounds: BrowseBounds | null): void => {
  boundsSetting = bounds ?? optionBounds;
  resolveBoundsNow();
  reclampView();      // normaliseView(view, resolvedBounds), on the live view
  wake();
};
```

`reclampView` writes the live camera into the new bounds. A reading of "is the camera inside
the bounds" taken **after** `setBounds` is therefore true for every restricted bound, and the
condition would decide nothing. The check must run **after `write()`**, because an `auto`
bound resolves against the records that call wrote, and **before `setBounds()`**, because that
call moves the camera.

That is a two-line window in `runLoad`, and the bounds it needs are not the ones in force yet.
So the reading cannot be "am I inside the current bounds"; it has to be "would I be inside
these bounds".

`datasets.ts` cannot make the judgement itself. It holds `entry.bounds`, which is the host's
`BrowseBounds` setting, but the reading needs the **resolved** shape (`ResolvedBounds`), the
system box of the new set, and the current view. The live `view` and the live `set` are locals of
`create-map.ts`, so `datasets.ts` cannot reach them at all.

## Goals / Non-Goals

**Goals**

- A step between two entries of one region holds the camera.
- A step to an entry the camera cannot see still frames that entry.
- No new option, and no change to the `GalaxyMap` handle.

**Non-Goals**

- Flying the camera to the new set. A held camera does not move at all; a framed camera
  jumps, as it does today. `map-navigation` owns flight.
- Reading whether the new set is *visible* from the camera. The rule reads the bounds, not
  the records, so it stays O(1) and it does not depend on the draw.
- Changing what `bounds` or `view` mean. Both keep their current readings.

## Decisions

### The member takes the candidate bounds and applies nothing

`DatasetWriter` gains:

```ts
/**
 * Whether the camera would stand inside `bounds` if they were applied now. `null` reads
 * the bounds the options named, which is what `setBounds(null)` restores.
 *
 * It resolves `bounds` against the system box of the set now on the map and changes
 * nothing: the caller reads it before `setBounds`, because applying a bound clamps the
 * camera into it and every later reading would be true.
 *
 * It is false where the bounds resolve to unrestricted, because every camera is inside an
 * unrestricted space and a reading of true would stop a jump the user needs.
 *
 * `runLoad` never passes `null`: it reads `entry.bounds !== undefined` first. The argument
 * takes `null` so that it mirrors `setBounds(entry.bounds ?? null)` letter for letter, and
 * the two calls cannot drift on to different bounds.
 */
viewInsideBounds(bounds: BrowseBounds | null): boolean;
```

The argument mirrors `setBounds(entry.bounds ?? null)` exactly, so the two calls cannot read
different bounds, and `runLoad` passes the same expression to both.

**Why a writer member rather than a `GalaxyMap` member**: `DatasetWriter` is already the seam
for exactly this — `write`, `setBounds` and `applyView` are all questions `datasets.ts` asks
of the map. A public handle member would be a reading a host could call at any time, which
would then need its own requirement, its own name and its own tests, for one internal
decision. The alternative was rejected on that ground.

**Why the member answers "inside", not "are these bounds restricted"**: two calls would let
`datasets.ts` hold half the rule, and the two halves would then have to agree about an `auto`
bound over an empty set. One call keeps the whole reading in the one place that has all three
inputs.

### The unrestricted case is read at the setting, not the shape

`unrestrictedBounds()` returns a `box` of the model bounds. A resolved shape therefore does
not say whether it came from `unrestricted`, from an `auto` bound over an empty set, or from
a host who wrote a box that happens to match the model. The member reads the **setting** it
was given, before it resolves anything. With `asked = bounds ?? optionBounds`:

- `asked.mode === 'unrestricted'` → false;
- `set.systemBox.empty` → false, whatever the mode. An `auto` bound over an empty set
  resolves to unrestricted, which is the first reason. A `sphere` bound over an
  empty set is restricted, but condition 5 reads the system box, and `clearSystems` in
  `src/scene-data/real-systems.ts` sets `boxEmpty` without resetting the corners. The box
  would then hold the set before this one;
- otherwise resolve `asked` against `set.systemBox` into a local shape, and read the cursor
  and the distance against that.

The resolve is local. The member never writes `boundsSetting` or `resolvedBounds`, so a
reading leaves the map exactly as it found it and `setBounds` does the one real write a moment
later. The member cannot be shortened to "resolve, then test the shape for unrestricted":
`resolveBounds` returns a restricted sphere for a `sphere` bound over an empty set, and the
member must answer false for that one.

### "Inside" is its own predicate, not a round trip through the clamp

The first draft compared the cursor with `clampCursor(cursor, bounds)` and called them equal
if the clamp moved nothing. That is wrong twice over. It is vacuous after `setBounds`, which
the Context section covers. It is also fragile on the sphere branch: `clampCursor` puts an
outside cursor exactly on the surface, and `Math.hypot` of that point can read an ulp above
`radiusLy`, so the equality flips at random for a camera on the edge.

The member uses a direct predicate instead:

- **box**: each axis of the cursor is at or between `min` and `max`;
- **sphere**: `Math.hypot(cursor - centre) <= radiusLy`;
- **both**: `view.distance <= resolvedBounds.maxDistanceLy`, and
  `view.distance >= farZoomLimit(half the diagonal of set.systemBox)`, which is condition 5
  and is the same expression `applyDatasetView` writes for `fit: 'systems'`.

Condition 5 reads the **unclamped** `farZoomLimit(half)`, which is what `applyDatasetView`
computes before `normaliseView` clamps it to the new `maxDistanceLy`. The two differ only
where a bound is narrower than its own set. There conditions 4 and 5 cannot both hold, so
such an entry always re-frames, which is the safe answer.

Three comparisons or one square root, and no dependence on what a clamp would write.

### Condition 5: "inside the bounds" is not "can see it"

An `auto` bound is the system box grown by `marginLy`, which defaults to 1,000 light years.
That is much larger than the box of a set that spans tens of light years, so a camera can sit
deep inside the bounds and still be zoomed in on one corner.

Measured against the committed cycles data, 110 files:

| Reading | Value |
| ------- | ----- |
| Frame after cycle 0 loads | cursor at its centre, distance 52.3 ly |
| Cycle 0 span | 33 ly |
| Widest cycle span | 381 ly |
| Re-frames over the 109 steps with conditions 1 to 4 only | **0** |
| Re-frames with condition 5, from the start frame | **11**, all early, settling at 504 ly |
| Re-frames with condition 5, after the reader zooms out to 3,000 ly | **0** |

Conditions 1 to 4 alone therefore hold the camera at cycle 0's 52 ly frame for all 109 later
weeks, and the reader sees a fraction of each. Condition 5 —
`view.distance >= <the distance fit: 'systems' would write for the new set>` — reads as "the
camera already shows at least as much as the frame would". It follows the set outward while
the war grows, then stops, and it never takes a view from a reader who zoomed out on purpose.

The alternative considered was to shrink the cycles page's `auto` margin so that "inside the
bounds" meant something on that page. That was rejected: the margin sets what the reader may
browse, and narrowing it to fix a camera rule would cost them the space around the front.

### Condition 3 is read at the whole `view`, not at `fit`

The rule applies only to a `view` that is exactly `{ fit: 'systems' }`. `datasets.ts` reads
this, because it holds the entry: every other field of `DatasetView` must be `undefined`.

**Why the whole object and not just "has `fit`"**: `{ fit: 'systems', pitch: 60 }` says
"frame the set, from a higher angle". The pitch is only meaningful against the frame, so
holding the camera and taking the pitch would give a view the host never asked for. An entry
that names any field beside `fit` is taken whole, as it is today.

## Risks / Trade-offs

- **A host that wanted the re-frame loses it.** A catalog of bounded entries in one region
  that relied on every load re-framing now holds the camera. There is no option to turn this
  off, which the proposal states as a deliberate choice. A host that wants the old behaviour
  names a field beside `fit` — `{ fit: 'systems', pitch: <the current pitch> }` — or drops
  `bounds` from the entry. Mitigation: the TSDoc on `DatasetView` and `DatasetEntry.view` in
  `src/app/datasets.ts`, which is what the generated wiki reference is built from, states
  both, and so does the prose of `docs/wiki/Examples/A-dataset-catalog.md`.
- **The reading is a snapshot.** A camera that is inside the bounds at the moment the records
  are written holds; one that the user is dragging at that moment is read wherever it is. The
  reading and the bounds that follow it are two steps of one synchronous block, so nothing
  moves the camera between them.

- **A held view leaves a pending start pending.** `applyDatasetView` calls
  `dropPendingStart`, so today every non-start load kills a `startView` that named a record
  the start set did not hold. A held view calls nothing, so that wait survives and
  `applyPendingStart` can still centre the camera in the first frame a set holds the record,
  inside `PENDING_START_FRAMES`. That is the one way a held load can still move the camera.
  It is the right answer: the wait is the host's own start instruction, not a camera the user
  placed, and the drop today is a side effect of taking the camera rather than a policy. The
  delta states it and a unit test fixes it.
- **A held view leaves a flight running.** Applying a view drops a pending start, ends a
  flight and ends the wheel glide. A held view does none of those, so a flight the user
  started carries on across the load and lands where it was going. The delta states this. The
  new bounds still clamp the camera, so a flight to a point the new entry does not allow is
  pulled up short as it would be on any load. `setBounds` also still ends a wheel glide whose
  target is outside the new far limit, which `reclampView` does and `map-navigation` states —
  a held view does not keep a glide alive through a space that narrowed under it.
- **Two entries with different bounds in one region.** A camera inside the first entry's
  bounds but outside the second's is framed, which is correct but can read as inconsistent to
  a user who moved only a little. The alternative — reading the union — would hold the camera
  outside the space the entry allows, and the clamp would then move it anyway.

## Migration Plan

None. No public member changes signature, no option is added, and no host code has to change.
A host that relied on the re-frame is described under Risks.

## Open Questions

None.
