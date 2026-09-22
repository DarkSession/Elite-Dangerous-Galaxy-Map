## MODIFIED Requirements

### Requirement: The handle loads one dataset at a time

The handle SHALL carry these members:

| Member                    | What it does                                                    |
| ------------------------- | --------------------------------------------------------------- |
| `getDatasets()`           | The catalog, without the `load` functions                        |
| `getLoadedDataset()`      | The entry now on the map, or null                                |
| `loadDataset(id)`         | Loads one entry and returns a promise of its report              |
| `onDatasetChange(fn)`     | Calls `fn` after the loaded dataset changes, returns unsubscribe |

`loadDataset(id)` SHALL call that entry's `load()`, then
`clearSystemsAndCategories()`, then `addCategories` and `addSystems` with what came back,
in that order, so a failed load leaves the map with the set it already had.

It SHALL then apply the entry's `bounds` and its `view`, in that order, and SHALL do both
**before** it calls the `onDatasetChange` listeners. A listener that adds the shapes of the
entry therefore sees the bounds the entry asked for. It SHALL return a promise of
`{ categories, systems }`, the two reports the reader gives.

`loadDataset` SHALL clear the selection and SHALL clear the name filter, because both name
records of the set being replaced.

**The view moves only where the entry asks.** An entry that names no `view` SHALL leave the
view where it is, which is what every load did before: a host that wants to fly to the new
set does it when the promise settles. An entry that names one SHALL take it in the next
frame, without a flight, as the `startView` option does.

**A deep link wins at start.** On the **start** load an entry's `view` SHALL apply only
where the options name no `startView`. Without this rule a host that opens the map at a
camera the URL named would have that camera overwritten when the start load settled, which
happens after the page has already drawn.

**A camera that already shows the new set SHALL stay where it is.** On a `loadDataset` that
is not the start load, the entry's `view` SHALL NOT apply when **all five** of these hold:

1. the entry names `bounds`;
2. those bounds resolve to a restricted space, and the new set holds a system. An `auto`
   bound over a set with no system resolves to unrestricted, and an empty system box holds
   the corners of the set before it, which condition 5 would then read;
3. the entry's `view` names `fit: 'systems'` and no other field;
4. the camera's `cursor` is inside the resolved bounds and its `distance` is at or under
   the far zoom limit of those bounds;
5. the camera's `distance` is at or above the distance `fit: 'systems'` writes for the new
   set **before the new bounds clamp it**, so the camera already shows at least as much as
   the frame would. A bound narrower than its own set therefore always re-frames, because
   conditions 4 and 5 cannot both hold for it.

**Condition 5 is what makes "inside" mean "can still see it".** An `auto` bound is the system
box grown by its margin, which is 1,000 light years where the host names none, so a camera
can be far inside the bounds and still be zoomed in on a corner of the set. Without this
condition a catalog whose sets grow — the war cycles page is one, where the first week spans
33 light years and the widest spans 381 — would hold the camera at the first week's frame for
every week after it, and the reader would see a fraction of each. With it, a reader who never
touches the camera is re-framed while the set outgrows the view and is then left alone, and a
reader who zoomed out to take in the whole set keeps that view for every later load.

**Conditions 4 and 5 SHALL be read against the camera as it stood before the entry's bounds
moved it.** Applying a `bounds` clamps the live camera into it, so a reading taken after that step
is true for every restricted bound and the condition would decide nothing. The reading
SHALL therefore happen after the records are written, because an `auto` bound resolves
against them, and before the bounds take effect.

A catalog of one region — the war cycles page is one entry per week of the same front —
otherwise re-frames the camera on every step, and the reader loses the angle and the zoom
they set up. The five conditions together keep that from costing a jump the user needs:

- **Condition 1** holds the old behaviour for an entry that names no `bounds`. Its space is
  unrestricted, so the camera is always inside it, and a set in a different part of the
  galaxy would never be framed.
- **Condition 2** holds the old behaviour for an `auto` bound that resolved to
  unrestricted, which is the same case read at the resolved shape rather than the setting.
- **Condition 3** holds the old behaviour for a `view` that names a `cursor`, a `system`, a
  `distance`, a `yaw` or a `pitch`. Those name where to look; `fit: 'systems'` alone only
  frames whatever loaded.
- **Condition 4** is the reading of "inside". A camera zoomed out past the new far limit
  would be pulled in by the clamp whatever this rule did, so it is not inside.
- **Condition 5** is the reading of "can still see it", which the paragraph above states.

Where any of the five fails, the entry's `view` SHALL apply, which is what every load did
before. The rule SHALL NOT read a record of the set: it reads one cursor, one distance and
the bounds the entry is about to set.

**A held view SHALL leave a running camera alone.** Applying a view drops a pending start
view, ends a flight and ends the wheel glide, because it takes the camera. A held view takes
nothing, so a flight the user started SHALL carry on across the load and SHALL land where it
was going. The bounds of the new entry still clamp the camera, as they do on any load.

**A held view SHALL leave a pending start view pending.** A `startView` that names a `system`
the start set does not hold waits for the record. A held load SHALL NOT drop that wait, so
the start view SHALL still centre the camera in the first frame a set holds that record, even
where that set arrived on a load the camera was held through. The host asked for that camera
and the map has not given it yet, so the wait is not a camera the user placed. This is the one
way a held load can still move the camera, and it can happen once.

A call naming an id the catalog does not hold SHALL reject with an error and SHALL change
nothing.

When `load()` throws or its promise rejects, `loadDataset` SHALL reject with that error,
SHALL leave the loaded dataset, the system set, the bounds and the view as they were, and
SHALL NOT stop the frame loop.

When a second `loadDataset` starts while a first is still loading, the second SHALL win:
the first SHALL NOT write the set, the bounds or the view when it settles, and its promise
SHALL reject with a cancelled error. Without this the slower of two clicks decides what the
map shows.

When the options carry `datasets`, the map SHALL load one at start: the entry named by
`dataset`, or the first entry when `dataset` names none or names an id the catalog does
not hold.

`ready` SHALL settle after the first frame **and** after the start load settles, whichever
is later, and SHALL settle whether or not that load succeeded, so a failed dataset still
leaves a drawing map. Without the second half a host that waits for `ready` and then reads
`systemCount` races the load. `library-package` holds that the browser suite clears the set
after `ready`, and about 188 of its tests depend on that clear reaching a set that is
already there.

The set the library loads SHALL hold at most 50,000 systems and 256 categories, which
`real-systems` already bounds. A `load()` that returns more SHALL be rejected by the same
reader with the same `over-capacity` reason.

**What a switch costs.** The library's own part of a switch is the clear, the two reads and
the two settings, which it does on the main thread. With a full set of 50,000 systems and
256 categories that part SHALL take under **40 milliseconds**, which is between two and
three dropped frames. The budget does not move with the bound: the clear and the two reads
walk the set, so five times the records is five times that walk, and 40 ms is what a user
accepts for a switch they asked for. Where the reading fails, the implementation SHALL make
the walk cheaper, or SHALL lower the set bound. The `load()` itself is the host's, and it may take as long as its
network does; the frame loop SHALL keep drawing throughout, because the library waits on
the promise and does not block. The dataset field shows that a load is running, so the user
sees why the map has not changed yet.

#### Scenario: Loading replaces the set

- **WHEN** a browser test builds a map with two entries, waits for `ready`, reads
  `systemCount` and `getLoadedDataset()`, calls `loadDataset` with the second id, awaits it
  and reads both again
- **THEN** the first reading is the first entry's system count and its id, and the second
  reading is the second entry's count and its id

#### Scenario: The start load reads the named entry

- **WHEN** a browser test builds a map with three entries and `dataset` naming the third,
  waits for `ready` and reads `getLoadedDataset()`
- **THEN** the reading is the third entry

#### Scenario: An entry's bounds take effect on its load

- **WHEN** a browser test builds a map with two entries, the first naming
  `bounds: { mode: 'auto' }` and the second naming none, and options naming
  `bounds: { mode: 'unrestricted' }`, waits for `ready`, reads `getBounds()`, loads the
  second and reads it again
- **THEN** the first reading is the `auto` mode and the second is `unrestricted`

#### Scenario: A restricted set holds the camera

- **WHEN** the browser test loads an entry naming `bounds: { mode: 'auto' }` whose systems
  all lie within 200 light years of (0, 0, 0), then calls `setView` with a cursor 30,000
  light years away and a distance of 100,000, draws a frame and reads `getView()`
- **THEN** the cursor lies inside the set's box grown by 1,000 light years on each axis,
  and the distance is at or under the far zoom limit of that box

#### Scenario: `fit` frames the set

- **WHEN** a browser test loads an entry naming `view: { fit: 'systems' }` whose systems
  span a box from (-100, -50, -100) to (100, 50, 100), and reads `getView()`
- **THEN** the cursor is (0, 0, 0) and the distance is twice half the diagonal of that box,
  within the tolerance `map-navigation` states for that value in doubles

#### Scenario: A named field wins over `fit`

- **WHEN** the same test loads an entry naming `view: { fit: 'systems', pitch: 60 }`
- **THEN** the cursor and the distance are the ones `fit` worked out and the pitch is 60

#### Scenario: A deep link beats the entry at start

- **WHEN** a browser test builds a map naming `startView` with a cursor of (500, 0, 500)
  and a first entry naming `view: { fit: 'systems' }`, waits for `ready` and reads
  `getView()`, then calls `loadDataset` with that same entry's id and reads it again
- **THEN** the first reading is the `startView` cursor and the second is the cursor `fit`
  worked out

#### Scenario: An entry with no view leaves the camera

- **WHEN** a browser test reads `getView()`, loads an entry that names no `view`, and reads
  it again
- **THEN** the two readings are the same

#### Scenario: The bounds reach a listener

- **WHEN** a browser test registers an `onDatasetChange` listener that reads `getBounds()`,
  then loads an entry naming `bounds: { mode: 'auto' }`
- **THEN** the listener read the `auto` mode

#### Scenario: The next load replaces a host's own setBounds

- **WHEN** a browser test builds a map whose options name an `unrestricted` bounds, calls
  `setBounds` with a `sphere`, then loads an entry that names no `bounds` and reads
  `getBounds()`
- **THEN** the reading is `unrestricted`, which is the option and not the sphere

#### Scenario: A failed load leaves the map as it was

- **WHEN** a browser test loads the first entry, then calls `loadDataset` for an entry
  whose `load` rejects, catches the rejection, and reads `systemCount`,
  `getLoadedDataset()`, `getBounds()` and the view
- **THEN** the promise rejected, the count, the loaded entry, the bounds and the view are
  the first entry's, and the map draws 10 more frames

#### Scenario: The later load wins

- **WHEN** a browser test calls `loadDataset` for an entry whose `load` settles after 300
  ms and names a `bounds`, then at once calls it for an entry whose `load` settles at once
  and names none, awaits both and reads `getLoadedDataset()`, `systemCount` and
  `getBounds()` after 500 ms
- **THEN** the second promise resolved, the first rejected as cancelled, and every reading
  is the second entry's throughout

#### Scenario: Loading clears the selection and the filter

- **WHEN** a browser test selects a system, sets the name filter to `sol`, loads another
  dataset, and reads `getSelection()` and `getNameFilter()`
- **THEN** both are empty

#### Scenario: A held load lets a pending start view land

- **WHEN** the browser test opens the map with `startView` naming a system the start set does
  not hold, loads a second entry whose bounds hold the camera and whose `view` is
  `fit: 'systems'` alone, and whose set holds that system
- **THEN** the camera centres on that system, because a held load does not drop the wait

#### Scenario: A step inside the bounds holds the camera

- **WHEN** a browser test loads an entry naming `bounds: { mode: 'auto' }` and
  `view: { fit: 'systems' }`, turns the camera and zooms it to a point inside those bounds,
  loads a second entry naming the same `bounds` and `view` whose systems sit inside them,
  and reads the view before and after
- **THEN** the cursor, the distance, the yaw and the pitch are the same in both readings

#### Scenario: A camera outside the new bounds is framed

- **WHEN** a browser test loads a first entry whose `auto` bounds are wide, zooms the camera
  out to a distance above the far zoom limit of a second entry whose systems sit in a much
  smaller box, and loads that second entry
- **THEN** the view moves to the frame of the second entry's systems

#### Scenario: An entry with no bounds still frames its systems

- **WHEN** a browser test loads an entry naming `view: { fit: 'systems' }` and **no**
  `bounds`, with the camera anywhere, and reads the view
- **THEN** the view moves to the frame of that entry's systems

#### Scenario: A camera zoomed in closer than the frame is framed again

- **WHEN** a browser test loads a first entry whose systems sit in a small box, so the frame
  leaves the camera close in, then loads a second entry naming the same `bounds` and
  `view: { fit: 'systems' }` whose systems span a much wider box that holds the first
- **THEN** the view moves to the frame of the second entry's systems, because the camera was
  inside the bounds but nearer than the frame of the new set

#### Scenario: A camera zoomed out past the frame keeps its view

- **WHEN** the same test zooms the camera out to a distance above the frame of the second
  entry but at or under the far zoom limit of its bounds, and loads that second entry
- **THEN** the cursor, the distance, the yaw and the pitch are unchanged

#### Scenario: A named field beats a camera inside the bounds

- **WHEN** a browser test places the camera inside an entry's bounds and loads an entry
  naming those `bounds` and `view: { fit: 'systems', pitch: 60 }`
- **THEN** the view moves to the frame of that entry's systems at a pitch of 60

#### Scenario: The start load frames its systems although the camera is inside its bounds

- **WHEN** a browser test builds a map with no `startView` and a start entry whose `bounds`
  are a sphere wide enough to hold the default camera, at a far zoom limit above the default
  distance, and whose `view` is `{ fit: 'systems' }`, waits for `ready` and reads the view
- **THEN** the view is the frame of the start entry's systems, although all five conditions
  would otherwise hold

#### Scenario: An auto bound over an empty set applies the view

- **WHEN** a browser test starts a flight, then loads an entry naming
  `bounds: { mode: 'auto' }`, `view: { fit: 'systems' }` and no system at all, and reads how
  the flight settled
- **THEN** the flight reads `interrupted`, because the view applied and an applied view ends
  a flight. A `fit` over an empty set moves the camera nowhere, so the flight is the reading
  that tells the two paths apart

#### Scenario: A held view lets a running flight land

- **WHEN** a browser test places the camera inside an entry's bounds, starts a flight, loads
  that entry with `bounds` and a `view` of `{ fit: 'systems' }`, and reads how the flight
  settled
- **THEN** the flight reads as landed, because a held view ends no flight

#### Scenario: A full set switches inside the budget

- **WHEN** a browser test loads a set of 50,000 systems and 256 categories, then calls
  `loadDataset` for a second set of the same size whose `load` returns at once and which
  names a `bounds` and a `view`, and measures the main thread from the call until the
  promise settles
- **THEN** the measurement is under 40 milliseconds and the frame loop drew throughout

#### Scenario: An unknown id changes nothing

- **WHEN** a unit test calls `loadDataset('nothing')` and reads `getLoadedDataset()`
- **THEN** the promise rejected and the reading is unchanged
