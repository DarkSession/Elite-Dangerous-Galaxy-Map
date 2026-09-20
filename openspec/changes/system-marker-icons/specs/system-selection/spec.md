## MODIFIED Requirements

### Requirement: Selection holds the frame budget

The hover pick, the pin, the ring, the name label placement and the **icon stack
placement** together SHALL add at most **2 ms** to the mean frame with a set of 10,000
systems, the name switch on, the icon switch on, every record carrying 4 icons, and the
pointer over the canvas, at 1920x1080 on the project's test card.

The budget is unchanged at 2 ms. The icon placement runs in the same per-frame sweep the
name labels run in and keeps the 32 stacks nearest the camera by the same rule, so it adds
one bounded pass over the same candidate list rather than a second sweep of its own.
`system-icons` states the bounds it holds to.

The page SHALL expose the mean and the worst time of that work since the last reset, as
`labelSampling` already does for the region label sweep. The work runs in the frame loop
around the draw call, so `frameStats` does not see it: `frameStats` times `render` alone,
which the `real-systems` spec already states. A budget read from `frameStats` would
therefore pass whatever this work cost, and it is not the instrument for it.

The page SHALL also expose the mean and the worst interval between animation frames since
the last reset. That reading covers everything the browser does per frame, the draw, this
work and the paint of the overlay elements together, and it is what shows a dropped frame.
With the set, the switches, the icons and the pointer above, at 1920x1080, the mean
interval SHALL stay at or below **18 ms**. A display at 60 Hz gives 16.7 ms when the page
keeps up and about 33.3 ms when it misses a frame, so 18 ms is the reading that separates
the two.

The draw-time budget of `far-view-rendering` is unchanged and is measured as it always was.
This requirement adds the two readings the new work needs and does not restate that one.

#### Scenario: The selection work fits its own budget

- **WHEN** the browser test adds 10,000 systems in view, turns the name switch on, puts
  the pointer over a marker, draws 120 frames at 1920x1080 and reads the selection work
  statistics
- **THEN** the mean is 2 ms or less

#### Scenario: The page keeps its frame rate with the selection work running

- **WHEN** the browser test repeats the reading above and reads the animation frame
  interval statistics
- **THEN** the mean interval is 18 ms or less

#### Scenario: The label placement holds its bound at a full set

- **WHEN** the browser test adds 10,000 systems inside the frame, turns the name switch on
  and reads the selection work statistics over 120 frames
- **THEN** the mean is 2 ms or less, which a sort of the whole candidate list every frame
  would not hold

#### Scenario: The icon placement holds the budget at a full set

- **WHEN** the browser test adds 10,000 systems inside the frame, each carrying 4 icons,
  turns the name switch and the icon switch on, puts the pointer over a marker and reads
  the selection work statistics and the frame interval statistics over 120 frames
- **THEN** the mean of the work is 2 ms or less and the mean interval is 18 ms or less
