## Why

A catalog whose entries sit in one part of the galaxy re-frames the camera on every switch.
The Thargoid war cycles page is the clearest case: each entry names
`bounds: { mode: 'auto' }` and `view: { fit: 'systems' }`, so a reader who steps through the
war week by week with the new step arrows watches the camera jump on every click, although
every week is the same region of space. The reader loses the view they set up — the angle,
the zoom, the part of the front they were reading — and has to build it again after each
step.

The entry's `view` is there to open the camera somewhere sensible when the user arrives at a
set they have not seen. It is not there to overrule a camera the user has already placed
inside the space the entry allows.

## What Changes

- A load that is **not** the start load SHALL leave the camera where it is when all of the
  following hold: the entry names `bounds`, those bounds resolve to a restricted space, the
  entry's `view` asks only for `fit: 'systems'`, the camera's cursor and zoom are both already
  inside the resolved bounds, and the camera is at least as far out as the frame would have
  put it.
- That last condition is what makes the rule mean "the camera already shows this set". An
  `auto` bound grows the system box by 1,000 light years, so a camera can be well inside the
  bounds and still zoomed in on a corner. Measured against the committed cycles data, the rule
  without it re-frames **0 times** over the 109 steps of the war and leaves the reader at the
  first week's 52 light year frame while later weeks span up to 381. With it, a reader who
  never touches the camera is re-framed 11 times while the war grows and then left alone, and
  a reader who zoomed out to take in the front keeps that view for every week.
- An entry that names **no** `bounds` keeps today's behaviour. Its space is unrestricted, so
  the camera is always "inside" it, and a blanket rule would stop a jump to a set in a
  different part of the galaxy. The `a-dataset-catalog` sample page is that case.
- An `auto` bound over a set with **no system** resolves to unrestricted, so it also keeps
  today's behaviour.
- An entry whose `view` names a `cursor`, a `system`, a `distance`, a `yaw` or a `pitch`
  keeps today's behaviour, whatever its bounds. Those fields are a deliberate instruction to
  look somewhere; `fit: 'systems'` alone is a convenience that frames whatever loaded.
- The **start load** keeps today's behaviour. The camera has no view the user chose yet.
- `DatasetWriter` gains one member that answers whether the camera is inside the bounds now
  in force. `src/app/datasets.ts` cannot work this out for itself: it holds the host's
  `BrowseBounds`, not the resolved shape, and an `auto` bound resolves against the system box
  of the set that just loaded.

This is not a breaking change to the public handle. `loadDataset` keeps its signature and its
promise, and no option is added or removed.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `dataset-catalog`: the requirement that states when a load applies the entry's view gains
  the rule above, and the writer member it needs.
- `map-navigation`: its requirement "The host limits the browsable space" states that an
  entry naming both `bounds` and `fit: 'systems'` "opens on the systems". That is now true
  only where the five conditions fail, so the requirement is modified to say so.
- `thargoid-war-cycles-page`: the page states that a step between cycles holds the camera,
  which is the behaviour the step arrows exist to give. Its existing requirement "The page
  holds one entry per cycle of the war" says the camera opens on the box of the records it
  loads, so that requirement is modified as well.

## Impact

- `packages/galaxy-map/src/app/datasets.ts`: `runLoad` reads the new member **before** it
  calls `setBounds`, because applying a bound clamps the camera into it. `DatasetWriter`
  declares the member, and the TSDoc on `DatasetView` states the rule.
- `packages/galaxy-map/src/app/create-map.ts`: the member is implemented beside
  `applyDatasetBounds`. It resolves the bounds it is given against `set.systemBox` into a
  local shape, reads the current `view` against it, and writes nothing.
- `packages/galaxy-map/src/app/datasets.test.ts`: the unit tests of the state machine, which
  already drive a fake writer.
- `e2e/datasets.spec.ts` and `e2e/cycles-page.spec.ts`: the browser readings of the camera
  across a switch. The existing test `opens the camera on the box of the cycle it loads` in
  `e2e/cycles-page.spec.ts` steps from cycle 0 to cycle 1 without touching the camera, and
  condition 5 re-frames that step, so it keeps both its assertions and gains a comment that
  names the condition it now reads.
- `e2e/dataset-cost.spec.ts` and `e2e/datasets.spec.ts`: both hold a 40 ms switch
  measurement whose `full-b` entry names `bounds` and a `fit`-only `view`, so both run on the
  new path.
- **The Canonn data page is affected as well.** `apps/demo/canonn/main.ts` gives all 114
  entries `bounds: { mode: 'auto' }` and `view: { fit: 'systems' }`, the same shape as the
  cycles page. Measured against the committed Canonn data: from the opening frame of
  `Guardian Ruins`, at a cursor of (2624, -293, 9743) and a distance of 32,444 light years,
  **5 of the other 113 entries** hold the camera; walking the catalog in order, **31 of 113**
  hold. This is wanted. A hold there means the camera is inside the new entry's bounds and is
  already at or beyond the new entry's frame distance, so the reader sees the new map without
  a jump, and an entry the camera cannot see still frames. The `canonn-data-page` spec states
  nothing about the camera and gains no delta; `dataset-catalog` states the rule for every
  catalog.
- The TSDoc on `DatasetView` and `DatasetEntry.view`, which the generated wiki reference is
  built from, and the prose of `docs/wiki/Examples/A-dataset-catalog.md`.

**Scale.** The check is a fixed amount of arithmetic on one cursor and one distance: at most
a clamp on three axes, or one distance to a centre. It walks no record. It runs once per
load, not once per frame, so it holds at the 50,000-record set bound and at the ~400 billion
systems of the galaxy alike, because it never reads a record at all.
