## MODIFIED Requirements

### Requirement: The page holds one entry per cycle of the war

The demo site SHALL publish a page at `<base>cycles/` that gives the map a dataset
catalog. The catalog SHALL hold one entry for each cycle file of the DCoH Overwatch
archive that the build converted to **one record or more**, and SHALL hold them in cycle
order, from the first cycle to the last.

Each entry SHALL carry:

| Field         | What it holds                                                 |
| ------------- | ------------------------------------------------------------- |
| `id`          | `cycle-<number>`, where the number is the cycle's own number  |
| `label`       | The cycle number and the week the cycle starts                |
| `collection`  | The year of that week                                         |
| `description` | What the cycle holds, and the state of the war in that week   |
| `systemCount` | The number of records the committed file holds                |
| `bounds`      | `auto`, because a cycle holds the bubble alone                |
| `view`        | `fit: 'systems'`, which frames a cycle the view does not show |

The categories SHALL be the war states the archive names, which is the table the demo
page's Thargoid war set already uses: Titan, Invasion, Alert, Controlled and Recovery.
The archive names `Recovery` for a system the Thargoids leave, and the count rises at the
end of the war, so a build that drops it writes the last weeks with one record or none.

The page SHALL load one cycle at a time. A switch from one cycle to the next SHALL
replace the records of the first with the records of the second, which is what
`dataset-catalog` states for a load.

The `view` of an entry frames that cycle only where the camera does not already show it.
Every cycle covers the same front, so a reader who is looking at the whole of it keeps their
camera, which the requirement "A step between cycles holds the camera" states.

#### Scenario: The catalog is the manifest, in cycle order

- **WHEN** a unit test reads the page's manifest and the committed data directory
- **THEN** every entry has a file, every file has an entry, the entries are in cycle
  order, each entry's `systemCount` is the number of records its file holds, and the
  entry count is inside the 256 the catalog reads

#### Scenario: The user steps to the next cycle

- **WHEN** the browser suite loads one cycle and then the next
- **THEN** the map holds the records of the second cycle alone

## ADDED Requirements

### Requirement: A step between cycles holds the camera

Every entry of the page names `bounds: { mode: 'auto' }` and `view: { fit: 'systems' }`, and
every cycle of the war covers the same front. A step from one cycle to the next SHALL
therefore leave the camera where the reader put it, whenever the camera already shows that
cycle, which `dataset-catalog` states as the five conditions.

This is what the step arrows are for. A reader compares one week against the next at one
angle and one zoom. A camera that re-framed on every click would make that comparison
impossible, because the two weeks would be drawn from two different points of view.

**A cycle wider than the view SHALL still be framed.** The war grows: the first cycle spans
33 light years and the widest spans 381. A reader who has not touched the camera is therefore
re-framed while the war outgrows their view, and is left alone once it stops growing. A reader
who has zoomed out to take in the whole front keeps that view for every cycle after it. Both
follow from condition 5 of `dataset-catalog`, and neither needs a rule of its own here.

#### Scenario: Stepping to the next cycle holds a view that shows it

- **WHEN** the browser suite opens the cycles page, waits for the first cycle, zooms the
  camera out far enough to take in the whole front and turns it, reads the view, clicks
  **next dataset**, waits for the load, and reads the view again
- **THEN** the cursor, the distance, the yaw and the pitch are the same in both readings,
  and the map holds the records of the second cycle

#### Scenario: A cycle wider than the view is framed again

- **WHEN** the browser suite opens the cycles page, waits for the first cycle, and clicks
  **next dataset** without touching the camera
- **THEN** the view moves to the frame of the second cycle, because the first cycle's frame
  leaves the camera nearer than the second cycle's frame
